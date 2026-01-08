"""
Wizard API Endpoints - Handles initialization wizard steps
"""

import time
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.logging import logger
from database.models import db_session
from database.repositories.wizard_state_repository import WizardStateRepository
from services.docker_manager import get_docker_manager
from services.typesense_client import get_typesense_client

router = APIRouter(prefix="/wizard", tags=["wizard"])


class WizardStatusResponse(BaseModel):
    """Response model for wizard status"""

    wizard_completed: bool
    docker_check_passed: bool
    docker_services_started: bool
    collection_created: bool
    last_step_completed: int
    current_step: int


class DockerCheckResponse(BaseModel):
    """Response model for docker check"""

    available: bool
    command: Optional[str] = None
    version: Optional[str] = None
    error: Optional[str] = None


class DockerStartResponse(BaseModel):
    """Response model for docker start"""

    success: bool
    message: Optional[str] = None
    error: Optional[str] = None


class DockerStatusResponse(BaseModel):
    """Response model for docker status"""

    success: bool
    running: bool
    healthy: bool
    services: list
    error: Optional[str] = None


class CollectionCreateResponse(BaseModel):
    """Response model for collection creation"""

    success: bool
    message: Optional[str] = None
    error: Optional[str] = None


class CollectionStatusResponse(BaseModel):
    """Response model for collection status"""

    exists: bool
    ready: bool
    document_count: Optional[int] = None
    error: Optional[str] = None


@router.get("/status", response_model=WizardStatusResponse)
async def get_wizard_status():
    """Get current wizard completion status"""
    try:
        with db_session() as db:
            repo = WizardStateRepository(db)
            state = repo.get_or_create()

            # Determine current step based on completion
            current_step = 0
            if not state.docker_check_passed:
                current_step = 0
            elif not state.docker_services_started:
                current_step = 1
            elif not state.collection_created:
                current_step = 2
            elif state.wizard_completed:
                current_step = 3
            else:
                current_step = state.last_step_completed

            return WizardStatusResponse(
                wizard_completed=state.wizard_completed,
                docker_check_passed=state.docker_check_passed,
                docker_services_started=state.docker_services_started,
                collection_created=state.collection_created,
                last_step_completed=state.last_step_completed,
                current_step=current_step,
            )
    except Exception as e:
        logger.error(f"Error getting wizard status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/docker-check", response_model=DockerCheckResponse)
async def check_docker():
    """Check if Docker/Podman is installed"""
    try:
        docker_manager = get_docker_manager()
        info = docker_manager.get_docker_info()

        # Update wizard state if docker is available
        if info.get("available"):
            with db_session() as db:
                repo = WizardStateRepository(db)
                repo.update_docker_check(True)

        return DockerCheckResponse(
            available=info.get("available", False),
            command=info.get("command"),
            version=info.get("version"),
            error=info.get("error"),
        )
    except Exception as e:
        logger.error(f"Error checking docker: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/docker-images-check")
async def check_docker_images():
    """Check if required docker images are present locally"""
    try:
        docker_manager = get_docker_manager()
        return await docker_manager.check_required_images()
    except Exception as e:
        logger.error(f"Error checking docker images: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/docker-pull")
async def pull_docker_images():
    """Pull docker images with real progress updates via SSE"""
    import json
    from asyncio import Queue

    docker_manager = get_docker_manager()

    async def event_generator():
        """Generate SSE events from docker pull progress"""

        # Check if docker is available
        if not docker_manager.is_docker_available():
            yield "data: " + json.dumps({"error": "Docker/Podman not found"}) + "\n\n"
            return

        # Use a queue to collect progress events
        progress_queue: Queue = Queue()
        pull_complete = False
        pull_error = None

        async def progress_callback(data: dict):
            """Callback for each progress event"""
            await progress_queue.put(data)

        # Start pull in background task
        import asyncio

        async def do_pull():
            nonlocal pull_complete, pull_error
            try:
                logger.info("Starting docker pull...")
                result = await docker_manager.pull_images_with_progress(progress_callback)
                logger.info(f"Docker pull completed: {result}")
                if not result.get("success"):
                    pull_error = result.get("error")
                pull_complete = True
                await progress_queue.put(None)  # Signal completion
            except Exception as e:
                logger.error(f"Docker pull error: {e}", exc_info=True)
                pull_error = str(e)
                pull_complete = True
                await progress_queue.put(None)

        asyncio.create_task(do_pull())

        # Stream progress events
        logger.info("Starting SSE stream...")
        while True:
            try:
                data = await asyncio.wait_for(progress_queue.get(), timeout=60.0)
                if data is None:  # Completion signal
                    if pull_error:
                        yield "data: " + json.dumps({"error": pull_error}) + "\n\n"
                    break
                yield "data: " + json.dumps({**data, "timestamp": time.time()}) + "\n\n"
            except asyncio.TimeoutError:
                yield "data: " + json.dumps({"heartbeat": True}) + "\n\n"
            except Exception as e:
                logger.error(f"Error streaming docker pull: {e}")
                yield "data: " + json.dumps({"error": str(e)}) + "\n\n"
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/docker-start", response_model=DockerStartResponse)
async def start_docker_services():
    """Start docker-compose services"""
    try:
        docker_manager = get_docker_manager()

        # Check if docker is available
        if not docker_manager.is_docker_available():
            raise HTTPException(
                status_code=400,
                detail="Docker/Podman not found. Please install Docker or Podman first.",
            )

        # Start services
        result = await docker_manager.start_services()

        # Update wizard state if successful
        if result.get("success"):
            with db_session() as db:
                repo = WizardStateRepository(db)
                repo.update_docker_services(True)
                repo.update_last_step(1)

        return DockerStartResponse(
            success=result.get("success", False),
            message=result.get("message"),
            error=result.get("error"),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting docker services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/docker-status", response_model=DockerStatusResponse)
async def get_docker_status():
    """Get status of docker-compose services"""
    try:
        docker_manager = get_docker_manager()
        result = await docker_manager.get_services_status()

        # Update wizard state if services are running
        if result.get("running"):
            with db_session() as db:
                repo = WizardStateRepository(db)
                repo.update_docker_services(True)

        return DockerStatusResponse(
            success=result.get("success", False),
            running=result.get("running", False),
            healthy=result.get("healthy", False),
            services=result.get("services", []),
            error=result.get("error"),
        )
    except Exception as e:
        logger.error(f"Error getting docker status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/docker-logs")
async def stream_docker_logs():
    """Stream docker-compose logs via Server-Sent Events"""

    async def event_generator():
        """Generate SSE events from docker logs"""
        docker_manager = get_docker_manager()

        try:
            # Check if docker is available
            if not docker_manager.is_docker_available():
                yield "data: {'error': 'Docker/Podman not found'}\n\n"
                return

            async def log_callback(log_line: str):
                """Callback for each log line"""
                # Send as SSE event
                import json

                yield f"data: {json.dumps({'log': log_line, 'timestamp': time.time()})}\n\n"

            # Stream logs
            await docker_manager.stream_all_logs(log_callback)

        except Exception as e:
            logger.error(f"Error streaming docker logs: {e}")
            import json

            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


class ModelStatusResponse(BaseModel):
    """Response model for model status"""

    exists: bool
    path: str
    files: list
    missing_files: list


@router.get("/model-status", response_model=ModelStatusResponse)
async def get_model_status():
    """Check if embedding model is already downloaded"""
    try:
        from services.model_downloader import get_model_downloader

        downloader = get_model_downloader()
        status = downloader.check_model_exists()

        return ModelStatusResponse(
            exists=status["exists"],
            path=status["path"],
            files=status["files"],
            missing_files=status["missing_files"],
        )
    except Exception as e:
        logger.error(f"Error checking model status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/model-download")
async def download_model():
    """Download embedding model with progress updates via SSE"""
    import json
    from asyncio import Queue

    from services.model_downloader import get_model_downloader

    downloader = get_model_downloader()

    async def event_generator():
        """Generate SSE events from model download progress"""

        # First check if model already exists
        status = downloader.check_model_exists()
        if status["exists"]:
            yield (
                "data: "
                + json.dumps(
                    {
                        "status": "complete",
                        "message": "Model already downloaded",
                        "complete": True,
                        "progress_percent": 100,
                    }
                )
                + "\n\n"
            )
            return

        # Use a queue to collect progress events
        progress_queue: Queue = Queue()
        download_complete = False
        download_error = None

        async def progress_callback(data: dict):
            """Callback for each progress event"""
            await progress_queue.put(data)

        # Start download in background task
        import asyncio

        async def do_download():
            nonlocal download_complete, download_error
            try:
                logger.info("Starting model download...")
                result = await downloader.download_model_with_progress(progress_callback)
                logger.info(f"Model download completed: {result}")
                if not result.get("success"):
                    download_error = result.get("error")
                download_complete = True
                await progress_queue.put(None)  # Signal completion
            except Exception as e:
                logger.error(f"Model download error: {e}", exc_info=True)
                download_error = str(e)
                download_complete = True
                await progress_queue.put(None)

        asyncio.create_task(do_download())

        # Stream progress events
        logger.info("Starting model download SSE stream...")
        while True:
            try:
                data = await asyncio.wait_for(progress_queue.get(), timeout=120.0)
                if data is None:  # Completion signal
                    if download_error:
                        yield "data: " + json.dumps({"error": download_error}) + "\n\n"
                    break
                yield "data: " + json.dumps({**data, "timestamp": time.time()}) + "\n\n"
            except asyncio.TimeoutError:
                yield "data: " + json.dumps({"heartbeat": True}) + "\n\n"
            except Exception as e:
                logger.error(f"Error streaming model download: {e}")
                yield "data: " + json.dumps({"error": str(e)}) + "\n\n"
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/collection-create", response_model=CollectionCreateResponse)
async def create_collection():
    """Create Typesense collection (non-blocking - runs in background)"""
    import asyncio

    async def _create_collection_task():
        """Background task to create collection"""
        from services.service_manager import get_service_manager

        # Reset service state and clear logs for fresh start
        service_manager = get_service_manager()
        service_manager.reset_service_for_retry("typesense")

        try:
            typesense = get_typesense_client()

            # Initialize collection
            await typesense.initialize_collection()

            # Check if collection is ready
            if typesense.collection_ready:
                # Update wizard state
                with db_session() as db:
                    repo = WizardStateRepository(db)
                    repo.update_collection_created(True)
                    repo.update_last_step(2)
                logger.info("Collection creation completed successfully")
            else:
                logger.error("Collection creation failed")

        except Exception as e:
            logger.error(f"Error creating collection: {e}", exc_info=True)

    # Start the background task
    asyncio.create_task(_create_collection_task())

    # Return immediately
    return CollectionCreateResponse(
        success=True,
        message="Collection creation started in background",
    )


@router.get("/collection-status", response_model=CollectionStatusResponse)
async def get_collection_status():
    """Get status of Typesense collection"""
    try:
        typesense = get_typesense_client()

        # Check if collection exists
        # We explicitly check against Typesense instead of relying on the local flag
        ready = await typesense.check_collection_exists()

        # Get document count if available
        doc_count = None
        if ready:
            try:
                result = await typesense.get_stats()
                doc_count = result.get("totals", {}).get("indexed", 0)
            except Exception:
                pass

        return CollectionStatusResponse(
            exists=ready,
            ready=ready,
            document_count=doc_count,
        )
    except Exception as e:
        logger.error(f"Error getting collection status: {e}")
        return CollectionStatusResponse(
            exists=False,
            ready=False,
            error=str(e),
        )


@router.post("/restart-typesense")
async def restart_typesense():
    """Restart Typesense container with fresh volume to recover from errors"""
    import asyncio
    import shutil

    from core.paths import app_paths

    try:
        docker_manager = get_docker_manager()

        # Check if docker is available
        if not docker_manager.is_docker_available():
            raise HTTPException(
                status_code=400,
                detail="Docker/Podman not found",
            )

        # Build commands
        stop_cmd = [docker_manager.docker_cmd, "compose", "-f", str(docker_manager.compose_file), "stop", "typesense"]
        rm_cmd = [
            docker_manager.docker_cmd,
            "compose",
            "-f",
            str(docker_manager.compose_file),
            "rm",
            "-f",
            "-v",
            "typesense",
        ]
        start_cmd = [
            docker_manager.docker_cmd,
            "compose",
            "-f",
            str(docker_manager.compose_file),
            "up",
            "-d",
            "typesense",
        ]

        # Stop container first
        logger.info("Stopping Typesense...")
        proc = await asyncio.create_subprocess_exec(
            *stop_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()

        # Remove container
        logger.info("Removing Typesense container...")
        proc = await asyncio.create_subprocess_exec(
            *rm_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()

        # Clear the bind-mounted data directory (except models)
        # Since we now use a bind mount, we need to clear the host directory
        typesense_data_dir = app_paths.typesense_data_dir
        models_dir = app_paths.models_dir

        logger.info(f"Clearing Typesense data directory: {typesense_data_dir}")

        # Remove all contents except the models directory
        if typesense_data_dir.exists():
            for item in typesense_data_dir.iterdir():
                if item != models_dir:
                    try:
                        if item.is_dir():
                            shutil.rmtree(item)
                        else:
                            item.unlink()
                        logger.info(f"Removed: {item}")
                    except Exception as e:
                        logger.warning(f"Failed to remove {item}: {e}")

        logger.info("Starting fresh Typesense...")
        proc = await asyncio.create_subprocess_exec(
            *start_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            error_msg = stderr.decode().strip()
            logger.error(f"Failed to restart Typesense: {error_msg}")
            return {"success": False, "error": error_msg}

        logger.info("Typesense restarted successfully with cleared data")
        return {"success": True, "message": "Typesense restarted with cleared data"}

    except Exception as e:
        logger.error(f"Error restarting Typesense: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/collection-logs")
async def stream_collection_logs():
    """Stream Typesense Docker container logs via SSE"""
    import asyncio
    import json

    async def event_generator():
        """Generate SSE events from Typesense container logs"""
        docker_manager = get_docker_manager()

        try:
            # Check if docker is available
            if not docker_manager.is_docker_available():
                yield f"data: {json.dumps({'error': 'Docker/Podman not found'})}\n\n"
                return

            # Build logs command for typesense service
            logs_cmd = [
                docker_manager.docker_cmd,
                "compose",
                "-f",
                str(docker_manager.compose_file),
                "logs",
                "-f",
                "--tail=50",
                "typesense",
            ]

            # Start streaming logs
            proc = await asyncio.create_subprocess_exec(
                *logs_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
            )

            # Stream output line by line
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break

                log_line = line.decode().strip()
                if log_line:
                    yield f"data: {json.dumps({'log': log_line, 'timestamp': time.time()})}\n\n"

        except asyncio.CancelledError:
            logger.info("Collection logs stream cancelled")
            if proc:
                proc.terminate()
                await proc.wait()
            raise
        except Exception as e:
            logger.error(f"Error streaming collection logs: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/complete")
async def complete_wizard():
    """Mark wizard as complete"""
    try:
        with db_session() as db:
            repo = WizardStateRepository(db)
            repo.mark_completed()

        return {
            "success": True,
            "message": "Wizard completed successfully",
            "timestamp": int(time.time() * 1000),
        }
    except Exception as e:
        logger.error(f"Error completing wizard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset")
async def reset_wizard():
    """Reset wizard state (for testing/debugging)"""
    try:
        with db_session() as db:
            repo = WizardStateRepository(db)
            repo.reset()

        return {
            "success": True,
            "message": "Wizard state reset successfully",
            "timestamp": int(time.time() * 1000),
        }
    except Exception as e:
        logger.error(f"Error resetting wizard: {e}")
        raise HTTPException(status_code=500, detail=str(e))
