"""
System initialization stream API
"""

import json
import time

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from file_brain.core.logging import logger
from file_brain.services.service_manager import ServiceState, get_service_manager

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/initialization/stream")
def stream_initialization_status():
    """
    Server-Sent Events stream for real-time initialization progress.

    Emits:
    - Service state changes (not_started -> initializing -> ready/failed)
    - Phase updates with progress percentages
    - Log messages for debugging
    - Overall system initialization progress
    """

    def event_generator():
        previous_state = None

        while True:
            try:
                service_manager = get_service_manager()
                all_services = service_manager.get_all_services_status()

                # Build current state snapshot
                current_state = {
                    "services": {},
                    "overall_progress": 0,
                    "timestamp": int(time.time() * 1000),
                }

                for service_name, status in all_services.items():
                    # Format log entries
                    logs = service_manager.get_service_logs(service_name, limit=5)

                    current_state["services"][service_name] = {
                        "name": service_name,
                        "user_friendly_name": status.user_friendly_name or service_name,
                        "state": status.state.value,
                        "current_phase": {
                            "name": status.current_phase.phase_name,
                            "progress": status.current_phase.progress_percent,
                            "message": status.current_phase.message,
                        }
                        if status.current_phase
                        else None,
                        "error": status.error_message,
                        "logs": logs,
                    }

                # Calculate overall progress
                # We weight services equally for now
                total_progress = 0
                total_services = len(all_services)

                if total_services > 0:
                    for status in all_services.values():
                        if status.state == ServiceState.READY:
                            total_progress += 100
                        elif status.state == ServiceState.INITIALIZING and status.current_phase:
                            # Map service specific phase progress (0-100) to overall contribution
                            total_progress += status.current_phase.progress_percent
                        # Failed or not started count as 0

                    current_state["overall_progress"] = total_progress / total_services

                # Check for changes to emit
                # We do a simple JSON string comparison for change detection
                current_json = json.dumps(current_state, sort_keys=True)

                if previous_state != current_json:
                    yield f"data: {current_json}\n\n"
                    previous_state = current_json

                # Fast polling during initialization, slow down if everything is ready
                if current_state["overall_progress"] >= 100:
                    time.sleep(5.0)  # Slow down when 100% complete
                else:
                    time.sleep(0.5)  # Fast updates during startup

            except Exception as e:
                logger.error(f"Error in initialization stream: {e}")
                # Emit error event
                error_payload = json.dumps({"error": str(e)})
                yield f"event: error\ndata: {error_payload}\n\n"
                time.sleep(2.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
