"""
Wizard API Endpoints - Handles initialization wizard steps
"""

import time
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from file_brain.core.logging import logger
from file_brain.database.models import db_session
from file_brain.database.repositories.wizard_state_repository import WizardStateRepository
from file_brain.services.docker_manager import get_docker_manager
from file_brain.services.startup_checker import get_startup_checker
from file_brain.services.typesense_client import get_typesense_client

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


class CheckDetailResponse(BaseModel):
    """Response model for individual check detail"""

    passed: bool
    message: str


class StartupCheckResponse(BaseModel):
    """Response model for comprehensive startup checks"""

    all_checks_passed: bool
    needs_wizard: bool
    is_first_run: bool  # True if wizard was never completed
    start_step: Optional[int] = None
    is_upgrade: bool
    checks: dict  # Maps check name to CheckDetailResponse


@router.get("/status", response_model=WizardStatusResponse)
def get_wizard_status():
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


@router.get("/startup-check", response_model=StartupCheckResponse)
def check_startup_requirements():
    """
    Perform comprehensive startup checks to determine if wizard is needed.

    This endpoint validates all system requirements and returns detailed status
    for each check. Unlike the /status endpoint which reads from DB, this performs
    actual validation of external conditions (Docker, images, services, model, collection).

    Returns:
        Detailed status of each check, plus which wizard step to start from if any checks fail
    """
    try:
        from file_brain.core.telemetry import telemetry

        checker = get_startup_checker()
        result = checker.perform_all_checks()

        # Track wizard start if needed
        if result.needs_wizard:
            telemetry.capture_event(
                "wizard_started",
                {
                    "start_step": result.get_first_failed_step(),
                    "is_upgrade": result.is_upgrade,
                    "docker_available": result.docker_available.passed,
                    "docker_images": result.docker_images.passed,
                    "services_healthy": result.services_healthy.passed,
                    "model_downloaded": result.model_downloaded.passed,
                    "collection_ready": result.collection_ready.passed,
                    "schema_current": result.schema_current.passed,
                },
            )

        return StartupCheckResponse(
            all_checks_passed=result.all_checks_passed,
            needs_wizard=result.needs_wizard,
            is_first_run=result.is_first_run,
            start_step=result.get_first_failed_step(),
            is_upgrade=result.is_upgrade,
            checks={
                "docker_available": {
                    "passed": result.docker_available.passed,
                    "message": result.docker_available.message,
                },
                "docker_images": {
                    "passed": result.docker_images.passed,
                    "message": result.docker_images.message,
                },
                "services_healthy": {
                    "passed": result.services_healthy.passed,
                    "message": result.services_healthy.message,
                },
                "model_downloaded": {
                    "passed": result.model_downloaded.passed,
                    "message": result.model_downloaded.message,
                },
                "collection_ready": {
                    "passed": result.collection_ready.passed,
                    "message": result.collection_ready.message,
                },
                "schema_current": {
                    "passed": result.schema_current.passed,
                    "message": result.schema_current.message,
                },
                "wizard_reset": {
                    "passed": result.wizard_reset.passed,
                    "message": result.wizard_reset.message,
                },
            },
        )
    except Exception as e:
        logger.error(f"Error performing startup checks: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/docker-check", response_model=DockerCheckResponse)
def check_docker():
    """Check if Docker/Podman is installed"""
    try:
        from file_brain.core.telemetry import telemetry

        docker_manager = get_docker_manager()
        info = docker_manager.get_docker_info()

        # Update wizard state if docker is available
        if info.get("available"):
            with db_session() as db:
                repo = WizardStateRepository(db)
                repo.update_docker_check(True)

            # Track successful docker check
            telemetry.capture_event(
                "wizard_step_docker_check",
                {
                    "success": True,
                    "docker_command": info.get("command"),
                    "docker_version": info.get("version"),
                },
            )

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
def check_docker_images():
    """Check if required docker images are present locally"""
    try:
        docker_manager = get_docker_manager()
        return docker_manager.check_required_images()
    except Exception as e:
        logger.error(f"Error checking docker images: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/docker-pull")
def pull_docker_images():
    """Pull docker images with real progress updates via SSE"""
    import json
    import queue
    import threading

    docker_manager = get_docker_manager()

    def event_generator():
        """Generate SSE events from docker pull progress"""

        # Check if docker is available
        if not docker_manager.is_docker_available():
            yield "data: " + json.dumps({"error": "Docker/Podman not found"}) + "\n\n"
            return

        # Use a queue to collect progress events
        progress_queue = queue.Queue()
        pull_complete = threading.Event()
        pull_error = [None]  # Use list to allow modification in nested function

        def progress_callback(data: dict):
            """Callback for each progress event"""
            progress_queue.put(data)

        # Start pull in background thread
        def do_pull():
            try:
                from file_brain.core.telemetry import telemetry

                logger.info("Starting docker pull...")
                start_time = time.time()
                result = docker_manager.pull_images_with_progress(progress_callback)
                duration = time.time() - start_time
                logger.info(f"Docker pull completed: {result}")

                if not result.get("success"):
                    pull_error[0] = result.get("error")
                else:
                    # Track successful docker pull
                    telemetry.capture_event(
                        "wizard_step_docker_pull_completed",
                        {
                            "success": True,
                            "duration_seconds": round(duration, 2),
                        },
                    )

                pull_complete.set()
                progress_queue.put(None)  # Signal completion
            except Exception as e:
                logger.error(f"Docker pull error: {e}", exc_info=True)
                pull_error[0] = str(e)
                pull_complete.set()
                progress_queue.put(None)

        thread = threading.Thread(target=do_pull, daemon=True)
        thread.start()

        # Stream progress events
        logger.info("Starting SSE stream...")
        while True:
            try:
                data = progress_queue.get(timeout=60.0)
                if data is None:  # Completion signal
                    if pull_error[0]:
                        yield "data: " + json.dumps({"error": pull_error[0]}) + "\n\n"
                    break
                yield "data: " + json.dumps({**data, "timestamp": time.time()}) + "\n\n"
            except queue.Empty:
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
def start_docker_services():
    """Start docker-compose services"""
    try:
        from file_brain.core.telemetry import telemetry

        docker_manager = get_docker_manager()

        # Check if docker is available
        if not docker_manager.is_docker_available():
            raise HTTPException(
                status_code=400,
                detail="Docker/Podman not found. Please install Docker or Podman first.",
            )

        # Start services
        result = docker_manager.start_services()

        # Update wizard state if successful
        if result.get("success"):
            with db_session() as db:
                repo = WizardStateRepository(db)
                repo.update_docker_services(True)
                repo.update_last_step(1)

            # Track successful docker start
            telemetry.capture_event(
                "wizard_step_docker_started",
                {"success": True},
            )

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
def get_docker_status():
    """Get status of docker-compose services"""
    try:
        docker_manager = get_docker_manager()
        result = docker_manager.get_services_status()

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
def stream_docker_logs():
    """Stream docker-compose logs via Server-Sent Events"""

    def event_generator():
        """Generate SSE events from docker logs"""

        import json
        import queue
        import threading
        import time

        docker_manager = get_docker_manager()

        try:
            # Check if docker is available
            if not docker_manager.is_docker_available():
                yield "data: {'error': 'Docker/Podman not found'}\n\n"
                return

            # Use a queue to communicate between threads
            log_queue = queue.Queue()
            stream_complete = threading.Event()

            def log_callback(log_line: str):
                """Callback for each log line - runs in thread"""
                log_queue.put(log_line)

            def stream_thread():
                """Thread to run synchronous stream_all_logs"""
                try:
                    docker_manager.stream_all_logs(log_callback)
                except Exception as e:
                    logger.error(f"Error in stream thread: {e}")
                    log_queue.put(None)  # Signal error/completion
                finally:
                    stream_complete.set()

            # Start streaming in background thread
            thread = threading.Thread(target=stream_thread, daemon=True)
            thread.start()

            # Stream logs from queue
            while not stream_complete.is_set() or not log_queue.empty():
                try:
                    log_line = log_queue.get(timeout=0.1)
                    if log_line is None:
                        break
                    yield f"data: {json.dumps({'log': log_line, 'timestamp': time.time()})}\n\n"
                except queue.Empty:
                    time.sleep(0.05)
                    continue

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
def get_model_status():
    """Check if embedding model is already downloaded"""
    try:
        from file_brain.services.model_downloader import get_model_downloader

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
def download_model():
    """Download embedding model with progress updates via SSE"""
    import json

    from file_brain.services.model_downloader import get_model_downloader

    downloader = get_model_downloader()

    def event_generator():
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
        import queue
        import threading

        progress_queue = queue.Queue()
        download_complete = threading.Event()
        download_error = [None]  # Use list to allow modification in nested function

        def progress_callback(data: dict):
            """Callback for each progress event"""
            progress_queue.put(data)

        # Start download in background thread
        def do_download():
            try:
                from file_brain.core.telemetry import telemetry

                logger.info("Starting model download...")
                start_time = time.time()
                result = downloader.download_model_with_progress(progress_callback)
                duration = time.time() - start_time
                logger.info(f"Model download completed: {result}")

                if not result.get("success"):
                    download_error[0] = result.get("error")
                else:
                    # Track successful model download
                    telemetry.capture_event(
                        "wizard_step_model_download_completed",
                        {
                            "success": True,
                            "duration_seconds": round(duration, 2),
                        },
                    )

                download_complete.set()
                progress_queue.put(None)  # Signal completion
            except Exception as e:
                logger.error(f"Model download error: {e}", exc_info=True)
                download_error[0] = str(e)
                download_complete.set()
                progress_queue.put(None)

        thread = threading.Thread(target=do_download, daemon=True)
        thread.start()

        # Stream progress events
        logger.info("Starting model download SSE stream...")
        while True:
            try:
                data = progress_queue.get(timeout=120.0)
                if data is None:  # Completion signal
                    if download_error[0]:
                        yield "data: " + json.dumps({"error": download_error[0]}) + "\n\n"
                    break
                yield "data: " + json.dumps({**data, "timestamp": time.time()}) + "\n\n"
            except queue.Empty:
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
def create_collection():
    """Create Typesense collection (non-blocking - runs in background)"""
    import threading

    def _create_collection_task():
        """Background task to create collection"""
        from file_brain.core.telemetry import telemetry
        from file_brain.services.service_manager import get_service_manager

        # Reset service state and clear logs for fresh start
        service_manager = get_service_manager()
        service_manager.reset_service_for_retry("typesense")

        try:
            typesense = get_typesense_client()

            # Initialize collection
            typesense.initialize_collection()

            # Check if collection is ready
            if typesense.collection_ready:
                # Update wizard state
                with db_session() as db:
                    repo = WizardStateRepository(db)
                    repo.update_collection_created(True)
                    repo.update_last_step(2)
                logger.info("Collection creation completed successfully")

                # Track successful collection creation
                telemetry.capture_event(
                    "wizard_step_collection_created",
                    {"success": True},
                )
            else:
                logger.error("Collection creation failed")

        except Exception as e:
            logger.error(f"Error creating collection: {e}", exc_info=True)
            telemetry.capture_exception(e)

    # Start the background thread
    thread = threading.Thread(target=_create_collection_task, daemon=True)
    thread.start()

    # Return immediately
    return CollectionCreateResponse(
        success=True,
        message="Collection creation started in background",
    )


@router.get("/collection-status", response_model=CollectionStatusResponse)
def get_collection_status():
    """Get status of Typesense collection"""
    try:
        typesense = get_typesense_client()

        # Check if collection exists
        # We explicitly check against Typesense instead of relying on the local flag
        ready = typesense.check_collection_exists()

        # Get document count if available
        doc_count = None
        if ready:
            try:
                result = typesense.get_stats()
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
def restart_typesense():
    """Restart Typesense container with fresh volume to recover from errors"""
    import shutil
    import subprocess

    from file_brain.core.paths import app_paths

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
        subprocess.run(stop_cmd, capture_output=True, check=False)

        # Remove container
        logger.info("Removing Typesense container...")
        subprocess.run(rm_cmd, capture_output=True, check=False)

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
        result = subprocess.run(start_cmd, capture_output=True, text=True)

        if result.returncode != 0:
            error_msg = result.stderr.strip()
            logger.error(f"Failed to restart Typesense: {error_msg}")
            return {"success": False, "error": error_msg}

        logger.info("Typesense restarted successfully with cleared data")
        return {"success": True, "message": "Typesense restarted with cleared data"}

    except Exception as e:
        logger.error(f"Error restarting Typesense: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/collection-logs")
def stream_collection_logs():
    """Stream Typesense Docker container logs via SSE"""

    import json

    def event_generator():
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
            import subprocess

            proc = subprocess.Popen(logs_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)

            # Stream output line by line
            for line in proc.stdout:
                log_line = line.strip()
                if log_line:
                    yield f"data: {json.dumps({'log': log_line, 'timestamp': time.time()})}\n\n"

        except Exception as e:
            logger.error(f"Error streaming collection logs: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            if "proc" in locals():
                proc.terminate()

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
def complete_wizard():
    """Mark wizard as complete"""
    try:
        from file_brain.core.telemetry import telemetry

        with db_session() as db:
            repo = WizardStateRepository(db)
            state = repo.get_or_create()
            repo.mark_completed()

            # Track wizard completion
            telemetry.capture_event(
                "wizard_completed",
                {
                    "total_steps": state.last_step_completed + 1,
                    "docker_check_passed": state.docker_check_passed,
                    "docker_services_started": state.docker_services_started,
                    "collection_created": state.collection_created,
                },
            )

            # Set user properties for segmentation
            from datetime import datetime

            from file_brain.core.config import settings

            telemetry.set_user_properties(
                {
                    "first_install_version": settings.app_version,
                    "wizard_completed_at": datetime.utcnow().isoformat(),
                }
            )

        return {
            "success": True,
            "message": "Wizard completed successfully",
            "timestamp": int(time.time() * 1000),
        }
    except Exception as e:
        logger.error(f"Error completing wizard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset")
def reset_wizard():
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


# ============================================================================
# App Container Startup Endpoints (Post-Wizard)
# ============================================================================


@router.post("/app-containers-start")
def start_app_containers():
    """
    Start Docker containers for the main app (after wizard is completed).
    This is called when the app loads to start containers in the background.
    Returns immediately while containers start in background thread.
    """
    import threading

    def _start_containers_task():
        """Background task to start containers"""
        try:
            docker_manager = get_docker_manager()

            if not docker_manager.is_docker_available():
                logger.error("Docker/Podman not available for app container startup")
                return

            logger.info("Starting app containers in background...")
            result = docker_manager.start_services()

            if result.get("success"):
                logger.info("✅ App containers started successfully")
            else:
                logger.error(f"❌ Failed to start app containers: {result.get('error')}")

        except Exception as e:
            logger.error(f"Error in app container startup task: {e}", exc_info=True)

    # Start the background thread
    thread = threading.Thread(target=_start_containers_task, daemon=True)
    thread.start()

    # Return immediately
    return {
        "success": True,
        "message": "Container startup initiated in background",
        "timestamp": int(time.time() * 1000),
    }


@router.get("/app-containers-status")
def stream_app_containers_status():
    """
    Stream container startup status via SSE.
    Provides real-time updates on container health until all are ready.
    """

    import json

    def event_generator():
        """Generate SSE events for container status"""
        docker_manager = get_docker_manager()

        try:
            # Check if docker is available
            if not docker_manager.is_docker_available():
                yield f"data: {json.dumps({'error': 'Docker/Podman not found'})}\n\n"
                return

            # Poll container status indefinitely with exponential backoff
            # The wizard cannot proceed until containers are healthy, so we retry forever
            check_count = 0
            base_delay = 2.0  # Start with 2 seconds
            max_delay = 30.0  # Cap at 30 seconds between checks

            # Give containers a moment to initialize before first check
            # Docker compose up returns before containers are fully ready
            logger.info("Waiting 3 seconds for containers to initialize...")
            time.sleep(3)

            while True:  # Infinite retry loop
                try:
                    status_result = docker_manager.get_services_status()

                    # Send status update
                    status_data = {
                        "success": status_result.get("success", False),
                        "running": status_result.get("running", False),
                        "healthy": status_result.get("healthy", False),
                        "services": status_result.get("services", []),
                        "timestamp": time.time(),
                        "check_count": check_count,
                    }
                    yield f"data: {json.dumps(status_data)}\n\n"

                    # If all healthy, we're done
                    if status_result.get("healthy"):
                        logger.info("All containers healthy - stopping status stream")
                        break

                    # Calculate exponential backoff delay
                    # Delay increases: 2s, 4s, 8s, 16s, 30s (capped)
                    delay = min(base_delay * (2 ** min(check_count // 3, 4)), max_delay)

                    # Log retry attempts periodically
                    if check_count % 10 == 0:
                        logger.info(
                            f"Containers not healthy yet (attempt {check_count + 1}), retrying in {delay:.1f}s..."
                        )

                    # Wait before next check with exponential backoff
                    time.sleep(delay)
                    check_count += 1

                except Exception as e:
                    logger.error(f"Error checking container status: {e}")
                    # Don't break on errors, just log and retry after a delay
                    yield f"data: {json.dumps({'error': str(e), 'retrying': True})}\n\n"
                    time.sleep(5)  # Wait 5 seconds before retrying after error

            # No timeout - loop continues until containers are healthy or stream is closed

        except Exception as e:
            logger.error(f"Error in container status stream: {e}")
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
