"""
Frontend Routing Module

Handles SPA routing, Vite dev server proxy, and static file serving.
Extracted from main.py to improve maintainability.
"""

import os
from typing import TYPE_CHECKING

import httpx
from fastapi import Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from file_brain.core.config import settings
from file_brain.core.logging import logger

if TYPE_CHECKING:
    from fastapi import FastAPI


def setup_frontend_routes(app: "FastAPI", frontend_dist_path: str):
    """
    Set up all frontend routes for the application.

    Args:
        app: FastAPI application instance
        frontend_dist_path: Path to the frontend dist directory
    """
    frontend_assets_path = os.path.join(frontend_dist_path, "assets")
    frontend_themes_path = os.path.join(frontend_dist_path, "themes")

    # Mount static assets if available
    if os.path.exists(frontend_assets_path):
        app.mount("/assets", StaticFiles(directory=frontend_assets_path), name="frontend_assets")

    # Mount themes directory for PrimeReact themes
    if os.path.exists(frontend_themes_path):
        app.mount("/themes", StaticFiles(directory=frontend_themes_path), name="frontend_themes")

    if not os.path.exists(frontend_dist_path):
        return

    @app.get("/icon.svg")
    def serve_icon():
        """Serve the application icon."""
        icon_path = os.path.join(frontend_dist_path, "icon.svg")
        if os.path.exists(icon_path):
            return FileResponse(icon_path)
        return JSONResponse(status_code=404, content={"error": "Icon not found"})

    @app.get("/")
    def serve_frontend(request: Request):
        """Serve the frontend index page."""
        if settings.debug:
            return proxy_to_vite(request, "")

        index_path = os.path.join(frontend_dist_path, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {
            "name": settings.app_name,
            "version": settings.app_version,
            "status": "running",
        }

    @app.get("/{full_path:path}")
    def serve_spa(request: Request, full_path: str):
        """
        Serve the single-page application.
        Handles all routes except for the API.
        """
        # Let the API router handle its own paths
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"error": "API route not found"})

        # Proxy to Vite Dev Server if in debug mode
        if settings.debug:
            return proxy_to_vite(request, full_path)

        index_path = os.path.join(frontend_dist_path, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)

        # Fallback for when the frontend is not built
        return JSONResponse(
            status_code=404,
            content={
                "error": "Frontend not built. Run `npm run build` in the frontend directory.",
                "path": full_path,
            },
        )


def proxy_to_vite(request: Request, full_path: str):
    """
    Proxy requests to the Vite development server.

    Args:
        request: FastAPI request object
        full_path: Path to proxy

    Returns:
        Response from Vite server or error response
    """
    target_url = f"{settings.frontend_dev_url}/{full_path}"
    if not full_path or full_path == "index.html":
        target_url = settings.frontend_dev_url

    try:
        params = dict(request.query_params)
        with httpx.Client() as client:
            resp = client.get(target_url, params=params)
            from fastapi import Response

            return Response(
                content=resp.content, status_code=resp.status_code, media_type=resp.headers.get("content-type")
            )
    except Exception as e:
        logger.error(f"Vite proxy error for {full_path}: {e}")
        return JSONResponse(status_code=502, content={"error": "Vite dev server not accessible"})
