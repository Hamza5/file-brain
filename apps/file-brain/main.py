"""
File Brain - Advanced file search engine powered by AI
"""

import asyncio
import os
import socket
import subprocess
import sys
from contextlib import asynccontextmanager

import aiohttp
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from api.v1.router import api_router
from core.config import settings
from core.factory import create_app
from core.logging import logger
from database.models import SessionLocal, init_db, init_default_data
from database.repositories import CrawlerStateRepository, WatchPathRepository
from services.crawler.manager import get_crawl_job_manager
from services.typesense_client import get_typesense_client


async def critical_init():
    """
    Critical initialization that MUST complete before FastAPI startup
    """
    from services.service_manager import get_service_manager

    service_manager = get_service_manager()

    try:
        logger.info("Initializing database...")
        init_db()
        db = SessionLocal()
        init_default_data(db)
        db.close()

        async def database_health_check():
            try:
                from sqlalchemy import text

                test_db = SessionLocal()
                test_db.execute(text("SELECT 1"))
                test_db.close()
                return {"healthy": True, "type": "sqlite"}
            except Exception as e:
                return {"healthy": False, "error": str(e)}

        service_manager.register_health_checker("database", database_health_check)
        service_manager.set_ready("database", details={"type": "sqlite", "tables": "created"})
        logger.info("✅ Database initialized")
    except Exception as e:
        service_manager.set_failed("database", f"Database initialization failed: {e}")
        raise

    return {
        "database": "ready",
        "message": "Critical services initialized, background services starting...",
    }


async def background_init():
    """
    Background initialization that does NOT block FastAPI startup
    """
    from services.service_manager import get_service_manager

    service_manager = get_service_manager()

    # Typesense initialization
    try:
        logger.info("Starting Typesense initialization in background...")
        typesense = get_typesense_client()

        async def typesense_health_check():
            try:
                await typesense.get_collection_stats()
                return {"healthy": True, "collection": typesense.collection_name}
            except Exception as e:
                return {"healthy": False, "error": str(e)}

        service_manager.register_health_checker("typesense", typesense_health_check)

        async def init_typesense():
            try:
                await typesense.initialize_collection()
                if typesense.collection_ready:
                    service_manager.set_ready(
                        "typesense",
                        details={
                            "collection": typesense.collection_name,
                            "host": settings.typesense_host,
                        },
                    )
                    logger.info("✅ Typesense initialized in background")
                else:
                    service_manager.set_failed("typesense", "Collection initialization failed")
            except Exception as e:
                service_manager.set_failed("typesense", f"Typesense initialization error: {e}")

        service_manager.start_background_initialization("typesense", init_typesense, dependencies=["database"])

    except Exception as e:
        service_manager.set_failed("typesense", f"Typesense setup error: {e}")

    # Tika initialization
    if settings.tika_enabled:
        try:
            logger.info("Starting Tika initialization in background...")

            async def tika_health_check():
                try:
                    import aiohttp

                    async with aiohttp.ClientSession() as session:
                        async with session.get(
                            f"{settings.tika_url}/version",
                            timeout=aiohttp.ClientTimeout(total=5),
                        ) as response:
                            if response.status == 200:
                                return {
                                    "healthy": True,
                                    "endpoint": settings.tika_url,
                                    "client_only": settings.tika_client_only,
                                }
                            else:
                                return {
                                    "healthy": False,
                                    "error": f"Tika server returned status {response.status}",
                                }
                except Exception as e:
                    return {"healthy": False, "error": str(e)}

            service_manager.register_health_checker("tika", tika_health_check)

            async def init_tika():
                service_manager.set_ready(
                    "tika",
                    details={
                        "endpoint": settings.tika_url,
                        "client_only": settings.tika_client_only,
                        "enabled": settings.tika_enabled,
                    },
                )
                logger.info("✅ Tika initialized in background")

            service_manager.start_background_initialization("tika", init_tika, dependencies=["database"])

        except Exception as e:
            service_manager.set_failed("tika", f"Tika setup error: {e}")
    else:
        service_manager.set_disabled("tika", "Tika extraction disabled in settings")

    # Crawl Manager initialization
    try:
        logger.info("Starting crawl manager initialization in background...")

        async def init_crawl_manager():
            try:
                db = SessionLocal()
                watch_path_repo = WatchPathRepository(db)
                crawler_state_repo = CrawlerStateRepository(db)
                watch_paths = watch_path_repo.get_enabled()
                previous_state = crawler_state_repo.get_state()

                crawl_manager = get_crawl_job_manager(watch_paths=watch_paths)

                async def crawl_manager_health_check():
                    return {"healthy": True, "running": crawl_manager.is_running()}

                service_manager.register_health_checker("crawl_manager", crawl_manager_health_check)

                service_manager.set_ready(
                    "crawl_manager",
                    details={
                        "watch_paths_count": len(watch_paths) if watch_paths else 0,
                        "previous_state": {
                            "crawl_job_running": previous_state.crawl_job_running,
                            "crawl_job_type": previous_state.crawl_job_type,
                        },
                    },
                )

                logger.info("✅ Crawl manager initialized in background")
                if watch_paths:
                    await auto_resume_logic(watch_paths, previous_state)

                db.close()

            except Exception as e:
                service_manager.set_failed("crawl_manager", f"Crawl manager initialization error: {e}")

        service_manager.start_background_initialization("crawl_manager", init_crawl_manager, dependencies=["database"])

    except Exception as e:
        service_manager.set_failed("crawl_manager", f"Crawl manager setup error: {e}")


async def auto_resume_logic(watch_paths, previous_state):
    """
    Background auto-resume logic
    """
    try:
        await asyncio.sleep(2)
        if watch_paths and previous_state.crawl_job_running:
            logger.info("🔄 Detected previous in-progress crawl job; auto-resuming...")
            crawl_manager = get_crawl_job_manager(watch_paths=watch_paths)
            success = await crawl_manager.start_crawl()
            if success:
                logger.info("✅ Auto-resumed crawl based on previous state.")
            else:
                logger.warning("⚠️ Failed to auto-resume crawl from previous state.")
    except Exception as e:
        logger.error(f"Auto-resume logic failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager
    """
    logger.info("=" * 50)
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info("=" * 50)

    try:
        await critical_init()
        logger.info("🚀 Critical services ready - API starting immediately!")

        # Start Vite Dev Server in Debug Mode
        if settings.debug:
            logger.info("🚧 Debug mode enabled: Starting Vite dev server...")
            frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
            # npm run dev -- --port 5173 --strictPort
            # We use shell=False and pass list for security and reliability
            vite_process = subprocess.Popen(
                ["npm", "run", "dev", "--", "--port", "5173", "--strictPort"],
                cwd=frontend_dir,
                # Let's inherit stdout/stderr for dev visibility.
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

    try:
        if settings.debug:
            logger.info("🛑 Stopping Vite dev server...")
            # We can't easily access the process object here if it's local to lifespan
            # But the lifespan generator keeps the scope alive.
            # We'll use a variable defined in the outer scope of the try block if Python supported it clearly,
            # but simpler: we can just terminate it if we have the reference.
            # Python's asynccontextmanager keeps locals.
            if "vite_process" in locals() and vite_process:
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


async def health_monitoring_loop():
    """
    Background health monitoring
    """
    from services.service_manager import get_service_manager

    service_manager = get_service_manager()
    while True:
        try:
            await service_manager.check_all_services_health()
            await asyncio.sleep(30)
        except Exception as e:
            logger.error(f"Health monitoring loop error: {e}")
            await asyncio.sleep(60)


app = create_app()
app.router.lifespan_context = lifespan

# Include API v1 router
app.include_router(api_router)

# Static files and SPA routing
frontend_dist_path = os.path.join(os.path.dirname(__file__), "frontend", "dist")
frontend_assets_path = os.path.join(frontend_dist_path, "assets")

if os.path.exists(frontend_assets_path):
    app.mount("/assets", StaticFiles(directory=frontend_assets_path), name="frontend_assets")

if os.path.exists(frontend_dist_path):

    @app.get("/icon.svg")
    async def serve_icon():
        icon_path = os.path.join(frontend_dist_path, "icon.svg")
        if os.path.exists(icon_path):
            return FileResponse(icon_path)
        return JSONResponse(status_code=404, content={"error": "Icon not found"})

    @app.get("/")
    async def serve_frontend(request: Request):
        if settings.debug:
            return await proxy_to_vite(request, "")

        index_path = os.path.join(frontend_dist_path, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {
            "name": settings.app_name,
            "version": settings.app_version,
            "status": "running",
        }

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """
        Serve the single-page application.
        Handles all routes except for the API.
        """
        # Let the API router handle its own paths
        if full_path.startswith("api/"):
            # This will be handled by FastAPI's routing; if no route matches,
            # it will correctly return a 404. We don't need to manually handle it.
            # We can add a catch-all at the end of the router if we want a custom message.
            pass

        # Proxy to Vite Dev Server if in debug mode
        if settings.debug:
            return await proxy_to_vite(request, full_path)

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

    async def proxy_to_vite(request: Request, full_path: str):
        target_url = f"{settings.frontend_dev_url}/{full_path}"
        if not full_path or full_path == "index.html":
            target_url = settings.frontend_dev_url

        async with aiohttp.ClientSession() as session:
            try:
                # Forward query params
                params = dict(request.query_params)
                async with session.get(target_url, params=params) as resp:
                    content = await resp.read()
                    # Forward content type
                    from fastapi import Response

                    return Response(content=content, status_code=resp.status, media_type=resp.content_type)
            except Exception as e:
                logger.error(f"Vite proxy error for {full_path}: {e}")
                return JSONResponse(status_code=502, content={"error": "Vite dev server not accessible"})


def get_available_port(start_port: int, max_attempts: int = 100) -> int:
    """
    Finds an available port starting from start_port.
    """
    port = start_port
    while port < start_port + max_attempts:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                port += 1
    return start_port


@app.get("/health")
async def health_check():
    """
    Combined health and info endpoint.
    """
    from services.service_manager import get_service_manager

    service_manager = get_service_manager()
    health_status = await service_manager.check_all_services_health()

    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "api_version": "v1",
        "services": health_status,
    }


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

    # Only override settings if CLI argument is provided
    if args.mode == "dev":
        settings.debug = True
        os.environ["DEBUG"] = "true"
        logger.info("🔧 Mode forced to DEVELOPMENT via CLI")
    elif args.mode == "prod":
        settings.debug = False
        os.environ["DEBUG"] = "false"
        logger.info("🏭 Mode forced to PRODUCTION via CLI")
    else:
        # Fallback to existing settings (from env vars or .env)
        mode_str = "DEVELOPMENT" if settings.debug else "PRODUCTION"
        logger.info(f"ℹ️  Running in {mode_str} mode (from environment)")

    port = get_available_port(settings.app_port)
    logger.info(f"Starting {settings.app_name} on http://localhost:{port}")

    if settings.debug:
        uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True, log_level="info")
    else:
        from flaskwebgui import FlaskUI

        # In production, we run the app in a standalone window
        FlaskUI(
            app=app,
            server="fastapi",
            port=port,
            width=1200,
            height=800,
        ).run()
