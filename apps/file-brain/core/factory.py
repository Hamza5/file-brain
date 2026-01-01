"""
Application factory
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import os

from core.config import settings
from core.exceptions import setup_exception_handlers
from core.logging import logger


def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application
    """
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=settings.app_description,
    )
    
    # Setup exception handlers
    setup_exception_handlers(app)
    
    # Configure CORS (if needed, defaulting to permissive for dev)
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Note: Routers will be registered here or in main.py during migration
    # For now, we return the configured app shell
    
    return app