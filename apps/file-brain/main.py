"""
File Brain - Advanced file search engine powered by AI

Main application entry point. Initialization logic extracted to core/initialization.py
and frontend routing to core/frontend.py.
"""

import asyncio
import os
import socket
import subprocess
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.v1.router import api_router
from core.config import settings
from core.factory import create_app
from core.frontend import setup_frontend_routes
from core.initialization import (
    background_init,
    critical_init,
    health_monitoring_loop,
)
from core.logging import logger
from services.crawler.manager import get_crawl_job_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("=" * 50)
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info("=" * 50)

    vite_process = None

    try:
        await critical_init()
        logger.info("🚀 Critical services ready - API starting immediately!")

        # Start Vite Dev Server in Debug Mode
        if settings.debug:
            logger.info("🚧 Debug mode enabled: Starting Vite dev server...")
            frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
            vite_process = subprocess.Popen(
                ["npm", "run", "dev", "--", "--port", "5173", "--strictPort"],
                cwd=frontend_dir,
                stdout=sys.stdout,
                stderr=sys.stderr,
            )
            logger.info(f"✅ Vite dev server started (PID: {vite_process.pid})")

        asyncio.create_task(background_init())
        asyncio.create_task(health_monitoring_loop())
    except Exception as e:
        logger.error(f"❌ Critical initialization failed: {e}")
        raise

    yield

    # Shutdown
    try:
        if vite_process:
            logger.info("🛑 Stopping Vite dev server...")
            vite_process.terminate()
            try:
                vite_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                vite_process.kill()
            logger.info("✅ Vite dev server stopped")

        crawl_manager = get_crawl_job_manager()
        if crawl_manager.is_running():
            await crawl_manager.stop_crawl()
            logger.info("✅ Crawl manager stopped")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
    logger.info("👋 Application shutdown complete")


# Create FastAPI application
app = create_app()
app.router.lifespan_context = lifespan

# Include API v1 router
app.include_router(api_router)

# Setup frontend routes
frontend_dist_path = os.path.join(os.path.dirname(__file__), "frontend", "dist")
setup_frontend_routes(app, frontend_dist_path)


@app.get("/health")
async def health_check():
    """Combined health and info endpoint."""
    from services.service_manager import get_service_manager

    service_manager = get_service_manager()
    health_status = await service_manager.check_all_services_health()

    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "api_version": "v1",
        "services": health_status,
    }


def get_available_port(start_port: int, max_attempts: int = 100) -> int:
    """Finds an available port starting from start_port."""
    port = start_port
    while port < start_port + max_attempts:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                port += 1
    return start_port


if __name__ == "__main__":
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(description="Run File Brain application")
    parser.add_argument(
        "--mode",
        choices=["dev", "prod"],
        default=None,
        help="Force run mode (dev/prod). If not set, uses DEBUG env var.",
    )
    args = parser.parse_args()

    # Mode override from CLI
    if args.mode == "dev":
        settings.debug = True
        os.environ["DEBUG"] = "true"
        logger.info("🔧 Mode forced to DEVELOPMENT via CLI")
    elif args.mode == "prod":
        settings.debug = False
        os.environ["DEBUG"] = "false"
        logger.info("🏭 Mode forced to PRODUCTION via CLI")
    else:
        mode_str = "DEVELOPMENT" if settings.debug else "PRODUCTION"
        logger.info(f"ℹ️  Running in {mode_str} mode (from environment)")

    port = get_available_port(settings.app_port)
    logger.info(f"Starting {settings.app_name} on http://localhost:{port}")

    if settings.debug:
        uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True, log_level="info")
    else:
        from flaskwebgui import FlaskUI

        FlaskUI(
            app=app,
            server="fastapi",
            port=port,
            width=1200,
            height=800,
        ).run()
