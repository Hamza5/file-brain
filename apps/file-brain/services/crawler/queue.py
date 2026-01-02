import asyncio
from typing import Dict, Generic, TypeVar

T = TypeVar("T")


class DedupQueue(Generic[T]):
    """
    An asyncio queue that deduplicates items based on a key.
    If an item with the same key is already in the queue,
    the old item is replaced by the new one (LIFO behavior for data, FIFO for processing).
    """

    def __init__(self):
        self._queue = asyncio.Queue()
        self._items: Dict[str, T] = {}
        self._lock = asyncio.Lock()

    async def put(self, key: str, item: T):
        """
        Put an item into the queue.
        If key exists, the item is updated (replaced).
        We still push the key to the queue if it's not already there?
        Actually, we always push the key.
        When consuming, we check if the key in the queue matches the current data.
        Wait, simple logic:
        1. Update data in dict: _items[key] = item
        2. If key not in _items (start), push to queue?
           No, if key IS in items, it means it's pending.
           So:
           async with self._lock:
               is_new = key not in self._items
               self._items[key] = item
               if is_new:
                   await self._queue.put(key)

        This ensures the key is in the queue exactly once for the duration it is pending.
        """
        async with self._lock:
            is_new = key not in self._items
            self._items[key] = item
            if is_new:
                await self._queue.put(key)

    async def get(self) -> T:
        """
        Get the next item.
        """
        key = await self._queue.get()

        async with self._lock:
            # Pop the item.
            # Since we only push to queue if key is NOT in _items,
            # and we pop key from queue, we must pop from _items.
            item = self._items.pop(key)
            return item

    def task_done(self):
        self._queue.task_done()

    def qsize(self):
        return len(self._items)
