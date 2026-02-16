"""
Server-Sent Events (SSE) response helper.

Provides a standardized StreamingResponse configuration for SSE endpoints.
"""

from fastapi.responses import StreamingResponse


def sse_response(generator):
    """
    Create a StreamingResponse configured for Server-Sent Events.

    Args:
        generator: An async or sync generator that yields SSE-formatted data

    Returns:
        StreamingResponse with proper SSE headers
    """
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
