import queue
import threading
from typing import Dict, Generic, TypeVar

T = TypeVar("T")


class DedupQueue(Generic[T]):
    """
    A thread-safe queue that deduplicates items based on a key.
    If an item with the same key is already in the queue,
    the old item is replaced by the new one (LIFO behavior for data, FIFO for processing).
    """

    def __init__(self):
        self._queue = queue.Queue()
        self._items: Dict[str, T] = {}
        self._lock = threading.Lock()

    def put(self, key: str, item: T):
        """
        Put an item into the queue.
        If key exists, the item is updated (replaced).
        We still push the key to the queue if it's not already there.
        """
        with self._lock:
            is_new = key not in self._items
            self._items[key] = item
            if is_new:
                self._queue.put(key)

    def get(self) -> T:
        """
        Get the next item (blocking).
        """
        key = self._queue.get()

        with self._lock:
            # Pop the item.
            item = self._items.pop(key)
            return item

    def task_done(self):
        self._queue.task_done()

    def qsize(self):
        return len(self._items)
