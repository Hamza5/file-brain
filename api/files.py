"""
File operations API for cross-platform file opening functionality
"""
import os
import platform
import subprocess
from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/files", tags=["files"])


class FileOperationRequest(BaseModel):
    file_path: str
    operation: str  # "file" or "folder"


class MultipleFileOperationRequest(BaseModel):
    file_paths: List[str]
    operation: str  # "file" or "folder"


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
        
        if system == "Windows":
            # Use cmd.exe to handle Windows file associations
            # The empty string before the path is required for proper Windows shell handling
            subprocess.Popen(['cmd.exe', '/c', 'start', '', file_path], 
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif system == "Darwin":  # macOS
            subprocess.Popen(['open', file_path], 
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif system == "Linux":
            subprocess.Popen(['xdg-open', file_path], 
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            return False, f"Unsupported operating system: {system}"
        
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
        folder_path = str(Path(file_path).parent)
        
        if system == "Windows":
            # Open folder and select the file
            subprocess.Popen(['explorer.exe', '/select,', file_path], 
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif system == "Darwin":  # macOS
            subprocess.Popen(['open', '-R', file_path], 
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif system == "Linux":
            # Try different approaches for different Linux file managers
            import shutil
            
            # Try to use xdg-open to open the folder
            try:
                subprocess.Popen(['xdg-open', folder_path],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except FileNotFoundError:
                # Fallback: try common file managers
                file_managers = ['nautilus', 'dolphin', 'thunar', 'pcmanfm', 'caja', 'nemo']
                for fm in file_managers:
                    if shutil.which(fm):
                        try:
                            subprocess.Popen([fm, folder_path],
                                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                            break
                        except:
                            continue
                else:
                    return False, "No file manager found to open folder"
        else:
            return False, f"Unsupported operating system: {system}"
        
        return True, "Folder opened successfully"
        
    except Exception as e:
        return False, f"Error opening folder: {str(e)}"


@router.post("/open")
async def open_file_operation(request: FileOperationRequest):
    """Open a single file or containing folder"""
    try:
        if request.operation == "file":
            success, message = open_file_cross_platform(request.file_path)
        elif request.operation == "folder":
            success, message = open_folder_cross_platform(request.file_path)
        else:
            raise HTTPException(status_code=400, detail="Invalid operation. Must be 'file' or 'folder'")
        
        if success:
            return {
                "success": True, 
                "message": message,
                "operation": request.operation,
                "file_path": request.file_path
            }
        else:
            raise HTTPException(status_code=500, detail=message)
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/open-multiple")
async def open_multiple_files_operation(request: MultipleFileOperationRequest):
    """Open multiple files or containing folders"""
    results = []
    errors = []
    
    for file_path in request.file_paths:
        try:
            if not os.path.exists(file_path):
                errors.append(f"File not found: {file_path}")
                continue
            
            # Security: prevent directory traversal and absolute paths outside scope
            if ".." in file_path:
                errors.append(f"Invalid file path: {file_path}")
                continue
            
            if request.operation == "file":
                success, message = open_file_cross_platform(file_path)
            elif request.operation == "folder":
                success, message = open_folder_cross_platform(file_path)
            else:
                errors.append(f"Invalid operation '{request.operation}' for: {file_path}")
                continue
            
            if success:
                results.append(file_path)
            else:
                errors.append(f"{file_path}: {message}")
                
        except Exception as e:
            errors.append(f"Error processing {file_path}: {str(e)}")
    
    return {
        "success": len(errors) == 0,
        "processed": len(results),
        "total_requested": len(request.file_paths),
        "errors": errors,
        "operation": request.operation
    }


@router.get("/info")
async def get_file_operation_info():
    """Get information about supported file operations for this system"""
    system = platform.system()
    
    operations = []
    
    if system == "Windows":
        operations = [
            {
                "operation": "file",
                "description": "Open file with default application",
                "command": "cmd.exe /c start <file_path>"
            },
            {
                "operation": "folder", 
                "description": "Open folder and select file",
                "command": "explorer.exe /select,<file_path>"
            }
        ]
    elif system == "Darwin":
        operations = [
            {
                "operation": "file",
                "description": "Open file with default application",
                "command": "open <file_path>"
            },
            {
                "operation": "folder",
                "description": "Open folder and select file", 
                "command": "open -R <file_path>"
            }
        ]
    elif system == "Linux":
        operations = [
            {
                "operation": "file",
                "description": "Open file with default application",
                "command": "xdg-open <file_path>"
            },
            {
                "operation": "folder",
                "description": "Open folder and select file",
                "command": "xdg-open --select <folder_path>"
            }
        ]
    else:
        operations = [
            {
                "operation": "unsupported",
                "description": f"Operating system '{system}' is not supported",
                "command": None
            }
        ]
    
    return {
        "system": system,
        "supported": system in ["Windows", "Darwin", "Linux"],
        "operations": operations
    }