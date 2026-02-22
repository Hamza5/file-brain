"""
Application factory
"""

from fastapi import FastAPI

from file_brain.core.config import settings
from file_brain.core.exceptions import setup_exception_handlers


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

    # Configure CORS (permissive only for localhost)
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            f"http://localhost:{settings.port}",
            f"http://127.0.0.1:{settings.port}",
            f"http://localhost:{settings.frontend_dev_port}",
            f"http://127.0.0.1:{settings.frontend_dev_port}",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Note: Routers will be registered here or in main.py during migration
    # For now, we return the configured app shell

    return app
