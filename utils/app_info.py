"""
Utility module to extract application information from pyproject.toml
This serves as the single source of truth for app name, version, and description
"""
import os
import tomllib
from pathlib import Path
from typing import Optional


def get_app_info() -> tuple[str, str, str]:
    """
    Extract app name, version, and description from pyproject.toml
    
    Returns:
        tuple: (name, version, description)
    """
    # Find pyproject.toml (search upward from current file)
    current_file = Path(__file__)
    project_root = current_file
    
    # Search for pyproject.toml starting from the current file location
    for parent in [current_file] + list(current_file.parents):
        pyproject_path = parent / "pyproject.toml"
        if pyproject_path.exists():
            try:
                with open(pyproject_path, "rb") as f:
                    data = tomllib.load(f)
                
                project = data.get("project", {})
                
                name = project.get("name", "smart-file-finder")
                version = project.get("version", "0.0.1")
                description = project.get("description", "Advanced file search engine powered by AI")
                
                return name, version, description
                
            except Exception as e:
                print(f"Warning: Could not parse pyproject.toml: {e}")
                break
    
    # Fallback values if pyproject.toml not found
    return "smart-file-finder", "0.0.1", "Advanced file search engine powered by AI"


def get_app_name() -> str:
    """Get application name from pyproject.toml"""
    return get_app_info()[0]


def get_app_version() -> str:
    """Get application version from pyproject.toml"""
    return get_app_info()[1]


def get_app_description() -> str:
    """Get application description from pyproject.toml"""
    return get_app_info()[2]