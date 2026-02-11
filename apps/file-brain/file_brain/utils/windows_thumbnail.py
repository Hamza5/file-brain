import logging
import platform
import ctypes
import io
from ctypes import POINTER, byref, c_int, c_uint, c_void_p, c_ushort, windll
from ctypes.wintypes import DWORD, HBITMAP
from typing import Optional

from PIL import Image

logger = logging.getLogger(__name__)

# Define Windows structures and constants
class BITMAP(ctypes.Structure):
    _fields_ = [
        ("bmType", c_int),
        ("bmWidth", c_int),
        ("bmHeight", c_int),
        ("bmWidthBytes", c_int),
        ("bmPlanes", c_ushort),
        ("bmBitsPixel", c_ushort),
        ("bmBits", c_void_p),
    ]

class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", DWORD),
        ("biWidth", c_int),
        ("biHeight", c_int),
        ("biPlanes", c_ushort),
        ("biBitCount", c_ushort),
        ("biCompression", DWORD),
        ("biSizeImage", DWORD),
        ("biXPelsPerMeter", c_int),
        ("biYPelsPerMeter", c_int),
        ("biClrUsed", DWORD),
        ("biClrImportant", DWORD),
    ]

class SIZE(ctypes.Structure):
    _fields_ = [("cx", c_int), ("cy", c_int)]

def get_windows_thumbnail(file_path: str, max_size: int) -> Optional[bytes]:
    """
    Retrieve thumbnail using Windows IShellItemImageFactory COM interface.
    """
    try:
        # Windows API functions
        # Check if we are on Windows to avoid import errors on other platforms if this file is imported
        if platform.system() != "Windows":
            return None

        # These imports are Windows-only typically, but ctypes.windll is available in standard library on Windows
        try:
             gdi32 = windll.gdi32
             shell32 = windll.shell32
             ole32 = windll.ole32
        except AttributeError:
             # Not on Windows or wine
             return None

        # Initialize COM
        ole32.CoInitialize(None)

        try:
            # Create IShellItem from file path
            from comtypes import GUID

            IID_IShellItemImageFactory = GUID("{bcc18b79-ba16-442f-80c4-8a59c30c463b}")

            shell_item = c_void_p()
            hr = shell32.SHCreateItemFromParsingName(
                file_path, None, byref(IID_IShellItemImageFactory), byref(shell_item)
            )

            if hr != 0:
                logger.debug(f"Failed to create IShellItem: {hr:#x}")
                return None

            # Get thumbnail using IShellItemImageFactory::GetImage
            # We need to call the GetImage method directly via vtable
            # IShellItemImageFactory vtable: QueryInterface, AddRef, Release, GetImage
            # GetImage is at offset 3 (0-indexed)

            # Get vtable pointer
            vtable = ctypes.cast(ctypes.cast(shell_item, POINTER(c_void_p)).contents, POINTER(c_void_p))

            # GetImage is the 4th method (index 3)
            get_image_ptr = ctypes.cast(vtable[3], c_void_p).value

            # Define GetImage function signature
            # HRESULT GetImage(SIZE size, SIIGBF flags, HBITMAP *phbm)
            GetImage = ctypes.CFUNCTYPE(DWORD, c_void_p, SIZE, DWORD, POINTER(HBITMAP))(get_image_ptr)

            size_struct = SIZE(max_size, max_size)
            hbitmap = HBITMAP()
            hr = GetImage(shell_item, size_struct, 0, byref(hbitmap))

            if hr != 0:
                logger.debug(f"Failed to get thumbnail: {hr:#x}")
                return None

            # Define DIBSECTION structure
            class DIBSECTION(ctypes.Structure):
                _fields_ = [
                    ("dsBm", BITMAP),
                    ("dsBmih", BITMAPINFOHEADER),
                    ("dsBitfields", DWORD * 3),
                    ("dshSection", c_void_p),
                    ("dsOffset", DWORD),
                ]

            # Convert HBITMAP to PNG bytes
            try:
                # Get bitmap info (try DIBSECTION first for orientation info)
                dib = DIBSECTION()
                res = gdi32.GetObjectW(hbitmap, ctypes.sizeof(DIBSECTION), byref(dib))
                
                is_bottom_up = False
                width = 0
                height = 0
                
                if res == ctypes.sizeof(DIBSECTION):
                    # It's a DIBSECTION, we can check orientation
                    width = dib.dsBm.bmWidth
                    height = dib.dsBm.bmHeight
                    
                    # dbBmih.biHeight > 0 means bottom-up (standard GDI), < 0 means top-down
                    if dib.dsBmih.biHeight > 0:
                        is_bottom_up = True
                    
                    bm_bits = dib.dsBm.bmBits
                elif res == ctypes.sizeof(BITMAP):
                    # It's just a BITMAP (failed to get DIBSECTION), use BITMAP struct
                    # Assume top-down or handle as is
                    bm = BITMAP()
                    gdi32.GetObjectW(hbitmap, ctypes.sizeof(BITMAP), byref(bm))
                    width = bm.bmWidth
                    height = bm.bmHeight
                    bm_bits = bm.bmBits
                else:
                    return None
                    
                # Check if we have direct bit access (DIB section)
                if bm_bits:
                    # DIB Section - we can read directly from memory
                    # For 32-bit bitmaps, size is width * height * 4
                    buffer_size = width * height * 4
                    buffer = ctypes.create_string_buffer(buffer_size)
                    ctypes.memmove(buffer, bm_bits, buffer_size)
                else:
                    # DDB - we need to use GetDIBits
                    
                    # Create device contexts
                    hdc = windll.user32.GetDC(None)
                    mem_dc = gdi32.CreateCompatibleDC(hdc)

                    # Select bitmap into DC
                    old_bitmap = gdi32.SelectObject(mem_dc, hbitmap)

                    # Prepare BITMAPINFOHEADER
                    bi = BITMAPINFOHEADER()
                    bi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
                    bi.biWidth = width
                    bi.biHeight = -height  # Negative for top-down bitmap
                    bi.biPlanes = 1
                    bi.biBitCount = 32
                    bi.biCompression = 0  # BI_RGB
                    bi.biSizeImage = 0

                    # Calculate buffer size
                    buffer_size = width * height * 4

                    # Create buffer for bitmap bits
                    buffer = ctypes.create_string_buffer(buffer_size)

                    # Get bitmap bits
                    result = gdi32.GetDIBits(
                        mem_dc,
                        hbitmap,
                        0,
                        height,
                        buffer,
                        byref(bi),
                        0,  # DIB_RGB_COLORS
                    )

                    # Cleanup
                    gdi32.SelectObject(mem_dc, old_bitmap)
                    gdi32.DeleteDC(mem_dc)
                    windll.user32.ReleaseDC(None, hdc)

                    if result == 0:
                        logger.debug("Failed to get bitmap bits")
                        return None

                # Convert to PIL Image (BGRA -> RGBA)
                img = Image.frombytes("RGBA", (width, height), buffer.raw, "raw", "BGRA")
                
                # Check for transparency to distinguish between:
                # 1. Icons (GDI, Bottom-Up, usually have transparency) -> Need Flip
                # 2. Thumbnails (Top-Down data despite flags, usually opaque) -> No Flip
                # This is a heuristic: if the image is fully opaque, we assume it's a thumbnail (Top-Down data).
                # If it has transparency, we assume it's an icon (Bottom-Up data).
                
                has_transparency = False
                try:
                    extrema = img.getextrema()
                    if extrema and len(extrema) > 3:
                        alpha_min = extrema[3][0]
                        if alpha_min < 255:
                            has_transparency = True
                except Exception:
                    # Fallback to older assumption if check fails
                    pass

                # Flip if bottom-up AND has transparency
                if is_bottom_up and has_transparency:
                   logger.debug("Flipping Bottom-Up image with transparency (Icon)")
                   img = img.transpose(Image.FLIP_TOP_BOTTOM)
                elif is_bottom_up:
                   logger.debug("Skipping flip for Bottom-Up image (Opaque/Thumbnail)")

                # Convert to PNG bytes
                png_buffer = io.BytesIO()
                img.save(png_buffer, format="PNG")
                png_bytes = png_buffer.getvalue()

                # Cleanup bitmap
                gdi32.DeleteObject(hbitmap)

                return png_bytes

            except Exception as e:
                logger.debug(f"Error converting HBITMAP to PNG: {e}")
                # Cleanup on error
                if hbitmap:
                    gdi32.DeleteObject(hbitmap)
                return None

        finally:
            # Uninitialize COM
            ole32.CoUninitialize()

    except ImportError as e:
        logger.debug(f"Missing dependency for Windows thumbnails: {e}")
        return None
    except Exception as e:
        logger.debug(f"Error retrieving Windows thumbnail: {e}")
        return None
