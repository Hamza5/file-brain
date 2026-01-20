"""
Utility to read app info from pyproject.toml
"""

import os
import tomllib as toml  # For Python 3.11 and above


def get_app_info():
    """
    Reads pyproject.toml and returns a dictionary with app info.
    """
    try:
        # 1. Try to read pyproject.toml directly (Dev mode - Source of Truth)
        # Construct the absolute path to pyproject.toml
        # From file_brain/core/app_info.py, go up two levels to reach pyproject.toml
        current_dir = os.path.dirname(os.path.abspath(__file__))
        pyproject_path = os.path.join(current_dir, "..", "..", "pyproject.toml")

        if os.path.exists(pyproject_path):
            with open(pyproject_path, "rb") as f:
                pyproject_data = toml.load(f)

            project_data = pyproject_data.get("project", {})
            return {
                "name": project_data.get("name", "file-brain"),
                "version": project_data.get("version", "0.0.0"),
                "description": project_data.get("description", "File Brain"),
            }

        # 2. Fallback to installed package metadata (works for pip install and packaged apps)
        from importlib.metadata import PackageNotFoundError, version

        try:
            pkg_version = version("file-brain")
            return {
                "name": "file-brain",
                "version": pkg_version,
                "description": "File Brain",
            }
        except PackageNotFoundError:
            pass  # Fallback to pyproject.toml
        except Exception:
            pass

        return {"name": "file-brain", "version": "0.0.0-error", "description": "File Brain"}
    except Exception as e:
        # Log error but don't crash, return a clear error indicator instead of silent default
        print(f"Error reading app info: {e}")  # Use print as logger might not be ready
        return {"name": "file-brain", "version": "0.0.0-error", "description": "File Brain"}


_app_info = get_app_info()


def get_app_name() -> str:
    """Get app name"""
    return _app_info["name"]


def get_app_version() -> str:
    """Get app version"""
    return _app_info["version"]


def get_app_description() -> str:
    """Get app description"""
    return _app_info["description"]
