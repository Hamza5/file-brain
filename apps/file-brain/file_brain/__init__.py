"""
File Brain - Advanced file search engine powered by AI
"""

from file_brain.core.app_info import get_app_description, get_app_name, get_app_version

__version__ = get_app_version()
__app_name__ = get_app_name()
__description__ = get_app_description()

__all__ = ["__version__", "__app_name__", "__description__"]
