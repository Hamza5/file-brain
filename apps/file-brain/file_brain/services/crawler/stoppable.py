"""
Stoppable component mixin for the crawler subsystem.

Provides a standardized way to handle stop events across
async and sync contexts.
"""

import asyncio
import threading
from typing import Protocol


class Stoppable(Protocol):
    """Protocol for stoppable components."""

    def stop(self) -> None:
        """Signal the component to stop."""
        ...

    def is_stopped(self) -> bool:
        """Check if stop has been signaled."""
        ...


class StoppableMixin:
    """
    Mixin that provides standardized stop event handling.

    Works in both async and sync contexts by using both
    asyncio.Event and threading.Event.
    """

    def __init__(self):
        self._async_stop_event = asyncio.Event()
        self._sync_stop_event = threading.Event()

    def stop(self) -> None:
        """Signal the component to stop."""
        self._async_stop_event.set()
        self._sync_stop_event.set()

    def reset_stop(self) -> None:
        """Reset the stop signal."""
        self._async_stop_event.clear()
        self._sync_stop_event.clear()

    def is_stopped(self) -> bool:
        """Check if stop has been signaled (sync-safe)."""
        return self._sync_stop_event.is_set()

    async def is_stopped_async(self) -> bool:
        """Check if stop has been signaled (async context)."""
        return self._async_stop_event.is_set()

    async def wait_for_stop(self) -> None:
        """Wait until stop is signaled (async)."""
        await self._async_stop_event.wait()

    def wait_for_stop_sync(self, timeout: float = None) -> bool:
        """Wait until stop is signaled (sync), returns True if stopped."""
        return self._sync_stop_event.wait(timeout)
