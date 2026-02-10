"""
System thumbnail service for retrieving OS-native file thumbnails.

This service reads thumbnails from OS-specific caches rather than generating them:
- Linux: Freedesktop XDG thumbnail cache (~/.cache/thumbnails/)
- Windows: IShellItemImageFactory COM interface
- macOS: Quick Look (qlmanage command-line tool)
"""

import hashlib
import logging
import os
import platform
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class SystemThumbnailService:
    """Service for retrieving OS-native thumbnails."""

    @staticmethod
    def get_thumbnail(file_path: str, max_size: int = 300) -> Optional[bytes]:
        """
        Retrieve a thumbnail from the OS cache.

        Args:
            file_path: Absolute path to the file
            max_size: Maximum dimension in pixels (default 300, max 800)

        Returns:
            PNG bytes if thumbnail found, None otherwise
        """
        if not os.path.exists(file_path):
            logger.debug(f"File not found: {file_path}")
            return None

        if not os.path.isfile(file_path):
            logger.debug(f"Not a file: {file_path}")
            return None

        # Clamp max_size
        max_size = min(max(max_size, 64), 800)

        system = platform.system()
        if system == "Linux":
            return SystemThumbnailService._get_linux_thumbnail(file_path, max_size)
        elif system == "Windows":
            return SystemThumbnailService._get_windows_thumbnail(file_path, max_size)
        elif system == "Darwin":
            return SystemThumbnailService._get_macos_thumbnail(file_path, max_size)
        else:
            logger.warning(f"Unsupported platform: {system}")
            return None

    @staticmethod
    def _get_linux_thumbnail(file_path: str, max_size: int) -> Optional[bytes]:
        """
        Retrieve thumbnail from Freedesktop XDG cache.

        Spec: https://specifications.freedesktop.org/thumbnail-spec/thumbnail-spec-latest.html
        """
        try:
            # Determine cache directory
            xdg_cache_home = os.environ.get("XDG_CACHE_HOME")
            if xdg_cache_home:
                cache_dir = Path(xdg_cache_home) / "thumbnails"
            else:
                cache_dir = Path.home() / ".cache" / "thumbnails"

            # Determine size subdirectories to check (with fallback to smaller sizes)
            # Freedesktop spec: normal=128, large=256, x-large=512, xx-large=1024
            if max_size <= 128:
                size_dirs = ["normal"]
            elif max_size <= 256:
                size_dirs = ["large", "normal"]
            elif max_size <= 512:
                size_dirs = ["x-large", "large", "normal"]
            else:
                size_dirs = ["xx-large", "x-large", "large", "normal"]

            # Compute MD5 of file URI once
            file_uri = Path(file_path).resolve().as_uri()
            uri_hash = hashlib.md5(file_uri.encode()).hexdigest()

            # Try each size directory in order (largest to smallest)
            for size_dir in size_dirs:
                thumbnail_dir = cache_dir / size_dir
                if not thumbnail_dir.exists():
                    continue

                thumbnail_path = thumbnail_dir / f"{uri_hash}.png"
                if not thumbnail_path.exists():
                    continue

                # Validate modification time
                # The thumbnail PNG should have Thumb::MTime metadata matching the file
                # For simplicity, we'll just check if the file hasn't been modified after thumbnail
                file_mtime = int(os.path.getmtime(file_path))
                thumb_mtime = int(os.path.getmtime(thumbnail_path))

                # If file is newer than thumbnail, it's stale - try next size
                if file_mtime > thumb_mtime:
                    logger.debug(f"Stale thumbnail in {size_dir} for {file_path}")
                    continue

                # Found valid thumbnail
                with open(thumbnail_path, "rb") as f:
                    return f.read()

            # No valid thumbnail found in any size
            logger.debug(f"No valid thumbnail found for {file_path}")
            return None

        except Exception as e:
            logger.debug(f"Error retrieving Linux thumbnail: {e}")
            return None

    @staticmethod
    def _get_windows_thumbnail(file_path: str, max_size: int) -> Optional[bytes]:
        """
        Retrieve thumbnail using Windows IShellItemImageFactory COM interface.
        """
        try:
            import ctypes
            import io
            from ctypes import POINTER, byref, c_int, c_uint, c_void_p, windll
            from ctypes.wintypes import DWORD, HBITMAP

            from PIL import Image

            # Define Windows structures and constants
            class BITMAP(ctypes.Structure):
                _fields_ = [
                    ("bmType", c_int),
                    ("bmWidth", c_int),
                    ("bmHeight", c_int),
                    ("bmWidthBytes", c_int),
                    ("bmPlanes", c_uint),
                    ("bmBitsPixel", c_uint),
                    ("bmBits", c_void_p),
                ]

            class BITMAPINFOHEADER(ctypes.Structure):
                _fields_ = [
                    ("biSize", DWORD),
                    ("biWidth", c_int),
                    ("biHeight", c_int),
                    ("biPlanes", c_uint),
                    ("biBitCount", c_uint),
                    ("biCompression", DWORD),
                    ("biSizeImage", DWORD),
                    ("biXPelsPerMeter", c_int),
                    ("biYPelsPerMeter", c_int),
                    ("biClrUsed", DWORD),
                    ("biClrImportant", DWORD),
                ]

            # Windows API functions
            gdi32 = windll.gdi32
            shell32 = windll.shell32
            ole32 = windll.ole32

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

                # Define SIZE structure
                class SIZE(ctypes.Structure):
                    _fields_ = [("cx", c_int), ("cy", c_int)]

                # Get vtable pointer
                vtable = ctypes.cast(ctypes.cast(shell_item, POINTER(c_void_p)).contents, POINTER(c_void_p))

                # GetImage is the 4th method (index 3)
                get_image_ptr = ctypes.cast(vtable[3], c_void_p).value

                # Define GetImage function signature
                # HRESULT GetImage(SIZE size, SIIGBF flags, HBITMAP *phbm)
                GetImage = ctypes.CFUNCTYPE(DWORD, c_void_p, SIZE, DWORD, POINTER(HBITMAP))(get_image_ptr)

                size = SIZE(max_size, max_size)
                hbitmap = HBITMAP()
                hr = GetImage(shell_item, size, 0, byref(hbitmap))

                if hr != 0:
                    logger.debug(f"Failed to get thumbnail: {hr:#x}")
                    return None

                # Convert HBITMAP to PNG bytes
                try:
                    # Get bitmap info
                    bm = BITMAP()
                    gdi32.GetObjectW(hbitmap, ctypes.sizeof(BITMAP), byref(bm))

                    width = bm.bmWidth
                    height = bm.bmHeight

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

                    if result == 0:
                        logger.debug("Failed to get bitmap bits")
                        return None

                    # Convert to PIL Image (BGRA -> RGBA)
                    img = Image.frombytes("RGBA", (width, height), buffer.raw, "raw", "BGRA")

                    # Convert to PNG bytes
                    png_buffer = io.BytesIO()
                    img.save(png_buffer, format="PNG")
                    png_bytes = png_buffer.getvalue()

                    # Cleanup
                    gdi32.SelectObject(mem_dc, old_bitmap)
                    gdi32.DeleteDC(mem_dc)
                    windll.user32.ReleaseDC(None, hdc)
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

    @staticmethod
    def _get_macos_thumbnail(file_path: str, max_size: int) -> Optional[bytes]:
        """
        Retrieve thumbnail using macOS Quick Look (qlmanage).
        """
        try:
            # Create temporary directory for output
            with tempfile.TemporaryDirectory() as tmpdir:
                # Run qlmanage to generate thumbnail
                result = subprocess.run(
                    ["qlmanage", "-t", "-s", str(max_size), "-o", tmpdir, file_path],
                    capture_output=True,
                    timeout=5,
                )

                if result.returncode != 0:
                    logger.debug(f"qlmanage failed: {result.stderr.decode()}")
                    return None

                # qlmanage creates a file named <original>.png
                file_name = Path(file_path).name
                thumbnail_path = Path(tmpdir) / f"{file_name}.png"

                if not thumbnail_path.exists():
                    logger.debug(f"qlmanage did not create thumbnail: {thumbnail_path}")
                    return None

                # Read and return thumbnail
                with open(thumbnail_path, "rb") as f:
                    return f.read()

        except FileNotFoundError:
            logger.debug("qlmanage command not found")
            return None
        except subprocess.TimeoutExpired:
            logger.debug("qlmanage timed out")
            return None
        except Exception as e:
            logger.debug(f"Error retrieving macOS thumbnail: {e}")
            return None
