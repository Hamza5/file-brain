"""
Global exception handlers and custom exceptions
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

from file_brain.core.logging import logger


class AppError(Exception):
    """Base class for application exceptions"""

    def __init__(self, message: str, status_code: int = 500, details: dict = None):
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class ServiceUnavailableError(AppError):
    """Raised when a required service is not available"""

    def __init__(self, service_name: str, reason: str = None):
        message = f"Service '{service_name}' is unavailable"
        if reason:
            message += f": {reason}"
        super().__init__(message, status_code=503)


class NotFoundError(AppError):
    """Raised when a resource is not found"""

    def __init__(self, resource_name: str, resource_id: str):
        super().__init__(f"{resource_name} '{resource_id}' not found", status_code=404)


def setup_exception_handlers(app: FastAPI):
    """Register global exception handlers"""

    @app.exception_handler(AppError)
    def app_error_handler(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.message, "details": exc.details},
        )

    @app.exception_handler(Exception)
    def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "Internal server error", "message": str(exc)},
        )
