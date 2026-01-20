"""
File Brain - Advanced file search engine powered by AI

Main application entry point. Initialization logic extracted to core/initialization.py
and frontend routing to core/frontend.py.
"""

import os
import socket
import subprocess
import sys
import threading

from file_brain.api.v1.router import api_router
from file_brain.core.config import settings
from file_brain.core.factory import create_app
from file_brain.core.frontend import setup_frontend_routes
from file_brain.core.initialization import (
    critical_init,
    health_monitoring_loop,
)
from file_brain.core.logging import logger
from file_brain.core.telemetry import telemetry
from file_brain.services.crawler.manager import get_crawl_job_manager

# Global variable to track Vite process
_vite_process = None


def startup_handler():
    """Application startup handler."""
    global _vite_process

    logger.info("=" * 50)
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info("=" * 50)

    # Capture startup event
    telemetry.capture_event("application_start")

    try:
        critical_init()
        logger.info("🚀 Database ready - API starting immediately!")

        # Start Vite Dev Server in Debug Mode
        if settings.debug:
            logger.info("🚧 Debug mode enabled: Starting Vite dev server...")
            # frontend is at apps/file-brain/frontend, main.py is at apps/file-brain/file_brain/main.py
            frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
            _vite_process = subprocess.Popen(
                ["npm", "run", "dev", "--", "--port", str(settings.frontend_dev_port), "--strictPort"],
                cwd=frontend_dir,
                stdout=sys.stdout,
                stderr=sys.stderr,
            )
            logger.info(f"✅ Vite dev server started (PID: {_vite_process.pid})")

        # Start health monitoring loop in background thread
        monitor_thread = threading.Thread(target=health_monitoring_loop, daemon=True, name="health_monitor")
        monitor_thread.start()
        logger.info("ℹ️  Complete the initialization wizard to set up remaining services")
    except Exception as e:
        logger.error(f"❌ Critical initialization failed: {e}")
        telemetry.capture_exception(e)
        raise


def shutdown_handler():
    """Application shutdown handler."""
    global _vite_process
    perform_shutdown(_vite_process)


def perform_shutdown(vite_process=None):
    """Perform application shutdown tasks."""
    try:
        # Trigger Typesense snapshot before shutdown
        try:
            from file_brain.services.typesense_client import get_typesense_client

            logger.info("📸 Creating Typesense snapshot before shutdown...")
            typesense = get_typesense_client()
            if typesense.collection_ready:
                # Trigger snapshot via API (uses Typesense default behavior)
                typesense.client.operations.perform("snapshot", {})
                logger.info("✅ Snapshot created successfully")
            else:
                logger.debug("ℹ️  Skipping snapshot: Collection not ready (first run or not completed)")
        except Exception as e:
            logger.warning(f"⚠️ Failed to create snapshot on shutdown: {e}")
            telemetry.capture_exception(e)

        # Stop docker containers if configured
        from file_brain.services.docker_manager import get_docker_manager

        docker_manager = get_docker_manager()
        if docker_manager.is_docker_available():
            logger.info("🛑 Stopping docker containers...")
            result = docker_manager.stop_services()
            if result.get("success"):
                logger.info("✅ Docker containers stopped")
            else:
                logger.warning(f"⚠️ Failed to stop docker containers: {result.get('error')}")

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
            crawl_manager.stop_crawl()
            logger.info("✅ Crawl manager stopped")

        # Shutdown telemetry (flushes batched events and captures shutdown event)
        logger.debug("📊 Shutting down telemetry...")
        telemetry.shutdown()
        logger.debug("✅ Telemetry shutdown complete")

    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
        telemetry.capture_exception(e)
    logger.info("👋 Application shutdown complete")


def on_startup_sync():
    """Sync wrapper for FlaskWebGUI's on_startup callback."""
    startup_handler()


def on_shutdown_sync():
    """Sync wrapper for FlaskWebGUI's on_shutdown callback."""
    logger.info("🛑 Browser closed, initiating shutdown...")
    perform_shutdown()


# Create FastAPI application
app = create_app()

# Register startup and shutdown event handlers
app.add_event_handler("startup", startup_handler)
app.add_event_handler("shutdown", shutdown_handler)

# Include API v1 router
app.include_router(api_router)

# Setup frontend routes
# Determine frontend dist path
source_frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
frontend_dist_path = None

# 1. Try source (dev mode)
if os.path.exists(source_frontend_path):
    frontend_dist_path = source_frontend_path
    logger.debug(f"Using frontend from source: {frontend_dist_path}")

# 2. Try installed package (production mode)
if not frontend_dist_path:
    try:
        from importlib.resources import files

        # Check resources in the 'file_brain.frontend' subpackage
        frontend_pkg_path = files("file_brain.frontend") / "dist"
        if frontend_pkg_path.is_dir():
            frontend_dist_path = str(frontend_pkg_path)
            logger.debug(f"Using frontend from installed package: {frontend_dist_path}")
    except Exception as e:
        logger.debug(f"Could not locate frontend via importlib.resources: {e}")

# 3. Fallback
if not frontend_dist_path:
    logger.warning("Frontend dist directory not found in source or package")
    frontend_dist_path = source_frontend_path

setup_frontend_routes(app, frontend_dist_path)


@app.get("/health")
def health_check():
    """Combined health and info endpoint."""
    from file_brain.services.service_manager import get_service_manager

    service_manager = get_service_manager()
    health_status = service_manager.check_all_services_health()

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
                s.bind((settings.host, port))
                return port
            except OSError:
                port += 1
    return start_port


def cli_main():
    """Entry point for packaged distribution (production mode only)."""
    # Set DEBUG=false to ensure FlaskWebGUI suppresses third-party debug logs
    # This must be set BEFORE importing FlaskWebGUI
    os.environ["DEBUG"] = "false"

    from file_brain.lib.flaskwebgui import FlaskUI

    port = get_available_port(settings.port)
    logger.info(f"Starting {settings.app_name} on http://localhost:{port}")
    logger.info("🏭 Running in PRODUCTION mode")

    FlaskUI(
        app=app,
        server="fastapi",
        port=port,
        width=1200,
        height=800,
        on_startup=on_startup_sync,
        on_shutdown=on_shutdown_sync,
    ).run()


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

    port = get_available_port(settings.port)
    logger.info(f"Starting {settings.app_name} on http://localhost:{port}")

    if settings.debug:
        uvicorn.run("file_brain.main:app", host=settings.host, port=port, reload=True, log_level="info")
    else:
        from file_brain.lib.flaskwebgui import FlaskUI

        FlaskUI(
            app=app,
            server="fastapi",
            port=port,
            width=1200,
            height=800,
            on_startup=on_startup_sync,
            on_shutdown=on_shutdown_sync,
        ).run()
