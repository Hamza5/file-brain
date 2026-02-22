"""
File operations API for cross-platform file opening functionality
"""

import os
import platform
import shutil
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from file_brain.core.logging import logger
from file_brain.services.typesense_client import TypesenseClient

router = APIRouter(prefix="/files", tags=["files"])

# Create a thread pool for file operations to avoid GIL blocking
_file_ops_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="file_ops")


def _run_subprocess(args):
    """Run subprocess in a separate thread to avoid GIL blocking."""
    subprocess.Popen(
        args,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,  # Completely detach from parent session
        close_fds=True,  # Close all file descriptors
    )


def _delete_file(file_path: str):
    """Delete file in a separate thread to avoid GIL blocking."""
    os.remove(file_path)


class FileOperationRequest(BaseModel):
    file_path: str
    operation: str  # "file", "folder", "delete", or "forget"


def is_path_allowed(file_path: str) -> bool:
    """Check if the path belongs to one of the configured watch_paths"""
    from file_brain.core.config import settings

    if not settings.watch_paths:
        return False

    allowed_paths = [os.path.abspath(p.strip()) for p in settings.watch_paths.split(",") if p.strip()]
    abs_file_path = os.path.abspath(file_path)

    for allowed_path in allowed_paths:
        try:
            if os.path.commonpath([abs_file_path, allowed_path]) == allowed_path:
                return True
        except ValueError:
            # Different drives on Windows
            continue

    return False


def open_file_cross_platform(file_path: str) -> tuple[bool, str]:
    """Open a file with its associated application"""
    system = platform.system()

    try:
        # Validate file path exists
        if not os.path.exists(file_path):
            return False, "File not found"

        # Security: prevent directory traversal and absolute paths outside scope
        if ".." in file_path:
            return False, "Invalid file path: directory traversal not allowed"

        # Normalize the path
        file_path = os.path.abspath(file_path)

        # Security: ensure path is within configured watch paths
        if not is_path_allowed(file_path):
            return False, "Security Error: Path is outside configured watch directories"

        # Determine command based on OS
        if system == "Windows":
            args = ["cmd.exe", "/c", "start", "", file_path]
        elif system == "Darwin":  # macOS
            args = ["open", file_path]
        elif system == "Linux":
            args = ["xdg-open", file_path]
        else:
            return False, f"Unsupported operating system: {system}"

        # Run subprocess in executor to avoid GIL blocking
        _file_ops_executor.submit(_run_subprocess, args)

        return True, "File opened successfully"

    except Exception as e:
        return False, f"Error opening file: {str(e)}"


def open_folder_cross_platform(file_path: str) -> tuple[bool, str]:
    """Open the containing folder and select the file"""
    system = platform.system()

    try:
        # Validate file path exists
        if not os.path.exists(file_path):
            return False, "File not found"

        # Security: prevent directory traversal and absolute paths outside scope
        if ".." in file_path:
            return False, "Invalid file path: directory traversal not allowed"

        # Normalize the path
        file_path = os.path.abspath(file_path)

        # Security: ensure path is within configured watch paths
        if not is_path_allowed(file_path):
            return False, "Security Error: Path is outside configured watch directories"

        folder_path = str(Path(file_path).parent)

        # Determine command based on OS
        if system == "Windows":
            args = ["explorer.exe", "/select,", file_path]
        elif system == "Darwin":  # macOS
            args = ["open", "-R", file_path]
        elif system == "Linux":
            # Try to use DBus to select the file (Standard freedesktop method)
            # This works for Nautilus, Dolphin, Nemo, Thunar, Caja, etc.
            # dbus-send --session --print-reply --dest=org.freedesktop.FileManager1 \
            #   /org/freedesktop/FileManager1 org.freedesktop.FileManager1.ShowItems \
            #   array:string:"file:///path/to/file" string:""
            if shutil.which("dbus-send"):
                try:
                    # Convert path to URI
                    from urllib.parse import quote

                    file_uri = f"file://{quote(file_path)}"

                    # We run this synchronously because it's a quick DBus call and we want to know if it fails
                    # to fallback to other methods.
                    subprocess.run(
                        [
                            "dbus-send",
                            "--session",
                            "--print-reply",
                            "--dest=org.freedesktop.FileManager1",
                            "/org/freedesktop/FileManager1",
                            "org.freedesktop.FileManager1.ShowItems",
                            f"array:string:{file_uri}",
                            "string:",
                        ],
                        check=True,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                    return True, "Folder opened and file selected successfully via DBus"
                except (subprocess.CalledProcessError, Exception):
                    # DBus call failed, fall back to other methods
                    pass

            # Fallback: try common file managers with --select flag
            # Most modern file managers support --select
            file_managers_with_select = [
                ("nautilus", ["--select"]),
                ("dolphin", ["--select"]),
                ("nemo", ["--select"]),
                ("caja", ["--select"]),
                ("konqueror", ["--select"]),
                (
                    "thunar",
                    [],
                ),  # Thunar selects if you pass the file path directly in newer versions, or just opens folder
                ("pcmanfm", ["--show-pref"]),  # pcmanfm usually just opens folder but let's try
            ]

            # Try to detect which file manager is actually the default or running
            # For now, we just iterate and try the first one found
            for fm, flags in file_managers_with_select:
                if shutil.which(fm):
                    if fm == "thunar":
                        args = [fm, file_path]
                    else:
                        args = [fm] + flags + [file_path]
                    break
            else:
                # Last resort: xdg-open the folder
                if shutil.which("xdg-open"):
                    args = ["xdg-open", folder_path]
                else:
                    return False, "No file manager found to open folder"
        else:
            return False, f"Unsupported operating system: {system}"

        # Run subprocess in executor to avoid GIL blocking
        _file_ops_executor.submit(_run_subprocess, args)

        return True, "Folder opened successfully"

    except Exception as e:
        return False, f"Error opening folder: {str(e)}"


def delete_file_cross_platform(file_path: str) -> tuple[bool, str]:
    """Delete a file from the filesystem with security validations"""
    try:
        # Validate file path exists
        if not os.path.exists(file_path):
            return False, "File not found"

        # Security: prevent directory traversal and absolute paths outside scope
        if ".." in file_path:
            return False, "Invalid file path: directory traversal not allowed"

        # Normalize the path
        file_path = os.path.abspath(file_path)

        # Security: ensure path is within configured watch paths
        if not is_path_allowed(file_path):
            return False, "Security Error: Path is outside configured watch directories"

        # Additional security: ensure it's a file, not a directory
        if os.path.isdir(file_path):
            return False, "Cannot delete directories, only files"

        # Check if we have write permission to the parent directory
        parent_dir = os.path.dirname(file_path)
        if not os.access(parent_dir, os.W_OK):
            return False, "Permission denied: cannot write to parent directory"

        # Delete file in executor to avoid GIL blocking
        _file_ops_executor.submit(_delete_file, file_path)

        return True, "File deleted successfully"

    except PermissionError:
        return False, "Permission denied: unable to delete file"
    except FileNotFoundError:
        return False, "File not found"
    except Exception as e:
        return False, f"Error deleting file: {str(e)}"


def forget_file_from_index(file_path: str, typesense_client: TypesenseClient) -> tuple[bool, str]:
    """Remove a file from the search index (but keep it on disk)"""
    try:
        # Validate file path
        if not file_path or not isinstance(file_path, str):
            return False, "Invalid file path"

        # Security: prevent directory traversal
        if ".." in file_path:
            return False, "Invalid file path: directory traversal not allowed"

        # Normalize the path
        file_path = os.path.abspath(file_path)

        # Security: ensure path is within configured watch paths
        if not is_path_allowed(file_path):
            return False, "Security Error: Path is outside configured watch directories"

        # Remove from Typesense index
        typesense_client.remove_from_index(file_path)

        return True, "File removed from search index"

    except Exception as e:
        return False, f"Error removing file from index: {str(e)}"


@router.post("/open")
def open_file_operation(request: FileOperationRequest):
    """Open a single file or containing folder"""
    start_time = time.time()
    try:
        from file_brain.core.telemetry import telemetry

        if request.operation == "file":
            success, message = open_file_cross_platform(request.file_path)
        elif request.operation == "folder":
            success, message = open_folder_cross_platform(request.file_path)
        else:
            raise HTTPException(status_code=400, detail="Invalid operation. Must be 'file' or 'folder'")

        duration_ms = int((time.time() - start_time) * 1000)
        if success:
            # Track file operation success
            telemetry.capture_event(
                "file_operation_success", {"operation": request.operation, "duration_ms": duration_ms}
            )

            return {
                "success": True,
                "message": message,
                "operation": request.operation,
                "file_path": request.file_path,
            }
        else:
            # Track file operation failure
            telemetry.capture_event("file_operation_failure", {"operation": request.operation, "error": message})

            # Return 404 for file not found, 500 for other errors
            if "not found" in message.lower():
                raise HTTPException(status_code=404, detail=message)
            else:
                raise HTTPException(status_code=500, detail=message)

    except HTTPException:
        raise
    except Exception as e:
        # Track unexpected failure
        from file_brain.core.telemetry import telemetry

        telemetry.capture_event("file_operation_failure", {"operation": request.operation, "error": str(e)})
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/info")
def get_file_operation_info():
    """Get information about supported file operations for this system"""
    system = platform.system()

    operations = []

    if system == "Windows":
        operations = [
            {
                "operation": "file",
                "description": "Open file with default application",
                "command": "cmd.exe /c start <file_path>",
            },
            {
                "operation": "folder",
                "description": "Open folder and select file",
                "command": "explorer.exe /select,<file_path>",
            },
        ]
    elif system == "Darwin":
        operations = [
            {
                "operation": "file",
                "description": "Open file with default application",
                "command": "open <file_path>",
            },
            {
                "operation": "folder",
                "description": "Open folder and select file",
                "command": "open -R <file_path>",
            },
        ]
    elif system == "Linux":
        operations = [
            {
                "operation": "file",
                "description": "Open file with default application",
                "command": "xdg-open <file_path>",
            },
            {
                "operation": "folder",
                "description": "Open folder and select file",
                "command": "xdg-open --select <folder_path>",
            },
        ]
    else:
        operations = [
            {
                "operation": "unsupported",
                "description": f"Operating system '{system}' is not supported",
                "command": None,
            }
        ]

    return {
        "system": system,
        "supported": system in ["Windows", "Darwin", "Linux"],
        "operations": operations,
    }


@router.post("/delete")
def delete_file_operation(request: FileOperationRequest):
    """Delete a single file from the filesystem and remove from search index"""
    start_time = time.time()
    try:
        from file_brain.core.telemetry import telemetry

        if request.operation != "delete":
            raise HTTPException(status_code=400, detail="Invalid operation. Must be 'delete'")

        success, message = delete_file_cross_platform(request.file_path)

        duration_ms = int((time.time() - start_time) * 1000)
        if success:
            # Immediately remove from search index to avoid slow watcher processing
            try:
                typesense_client = TypesenseClient()
                typesense_client.remove_from_index(request.file_path)
                logger.info(f"Removed deleted file from search index: {request.file_path}")
            except Exception as e:
                logger.warning(f"Failed to remove deleted file from index {request.file_path}: {e}")

            # Track file deletion success
            telemetry.capture_event("file_operation_success", {"operation": "delete", "duration_ms": duration_ms})

            return {
                "success": True,
                "message": message,
                "operation": request.operation,
                "file_path": request.file_path,
            }
        else:
            # Track file deletion failure
            telemetry.capture_event("file_operation_failure", {"operation": "delete", "error": message})
            raise HTTPException(status_code=500, detail=message)

    except HTTPException:
        raise
    except Exception as e:
        from file_brain.core.telemetry import telemetry

        telemetry.capture_event("file_operation_failure", {"operation": "delete", "error": str(e)})
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/forget")
def forget_file_operation(request: FileOperationRequest):
    """Remove a single file from the search index"""
    start_time = time.time()
    try:
        from file_brain.core.telemetry import telemetry

        if request.operation != "forget":
            raise HTTPException(status_code=400, detail="Invalid operation. Must be 'forget'")

        # Initialize Typesense client
        typesense_client = TypesenseClient()
        success, message = forget_file_from_index(request.file_path, typesense_client)

        duration_ms = int((time.time() - start_time) * 1000)
        if success:
            # Track index removal success
            telemetry.capture_event("file_operation_success", {"operation": "forget", "duration_ms": duration_ms})

            return {
                "success": True,
                "message": message,
                "operation": request.operation,
                "file_path": request.file_path,
            }
        else:
            # Track index removal failure
            telemetry.capture_event("file_operation_failure", {"operation": "forget", "error": message})
            raise HTTPException(status_code=500, detail=message)

    except HTTPException:
        raise
    except Exception as e:
        from file_brain.core.telemetry import telemetry

        telemetry.capture_event("file_operation_failure", {"operation": "forget", "error": str(e)})
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
