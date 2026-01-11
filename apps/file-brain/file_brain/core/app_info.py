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
        # Construct the absolute path to pyproject.toml
        # From file_brain/core/app_info.py, go up two levels to reach pyproject.toml
        current_dir = os.path.dirname(os.path.abspath(__file__))
        pyproject_path = os.path.join(current_dir, "..", "..", "pyproject.toml")

        with open(pyproject_path, "r") as f:
            pyproject_data = toml.load(f)

        project_data = pyproject_data.get("project", {})

        return {
            "name": project_data.get("name", "file-brain"),
            "version": project_data.get("version", "0.1.0"),
            "description": project_data.get("description", "File Brain"),
        }
    except Exception:
        # Fallback in case of any error
        return {"name": "file-brain", "version": "0.1.0", "description": "File Brain"}


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
