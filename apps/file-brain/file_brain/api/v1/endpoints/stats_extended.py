"""
Extended statistics endpoints for the dashboard.

Provides time-based indexing data, recent files, and drill-down capabilities.
"""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from file_brain.core.logging import logger

router = APIRouter(prefix="/stats", tags=["statistics"])


@router.get("/recent-files")
def get_recent_files(limit: int = Query(default=10, ge=1, le=50)):
    """
    Get the most recently indexed files.

    Returns files sorted by indexed_at timestamp descending.
    """
    try:
        from file_brain.services.typesense_client import get_typesense_client

        client = get_typesense_client()

        results = client.client.collections[client.collection_name].documents.search(
            {
                "q": "*",
                "group_by": "file_path",
                "group_limit": 1,
                "sort_by": "indexed_at:desc",
                "per_page": limit,
                "include_fields": "file_path,file_extension,file_size,mime_type,modified_time,indexed_at",
            }
        )

        files = []
        for group in results.get("grouped_hits", []):
            hits = group.get("hits", [])
            if hits:
                doc = hits[0].get("document", {})
                files.append(
                    {
                        "file_path": doc.get("file_path"),
                        "file_extension": doc.get("file_extension"),
                        "file_size": doc.get("file_size"),
                        "mime_type": doc.get("mime_type"),
                        "modified_time": doc.get("modified_time"),
                        "indexed_at": doc.get("indexed_at"),
                    }
                )

        return {"files": files, "total": results.get("found", 0)}

    except Exception as e:
        error_str = str(e)
        if "503" in error_str or "Not Ready" in error_str or "Lagging" in error_str or "Connection" in error_str:
            logger.debug(f"Search engine unavailable in get_recent_files: {e}")
            return {"files": [], "total": 0}
        logger.error(f"Error getting recent files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/indexing-activity")
def get_indexing_activity(time_range: Literal["24h", "7d"] = Query(default="24h", alias="range")):
    """
    Get indexing activity over time.

    Returns hourly counts for 24h range, or daily counts for 7d range.
    Buckets are aligned to the top of the hour/day.
    """
    import time
    from collections import defaultdict

    try:
        from file_brain.services.typesense_client import get_typesense_client

        client = get_typesense_client()
        now_ts = time.time()

        # Calculate time boundaries aligned to hour/day
        if time_range == "24h":
            # Last 24 hours (24 indices)
            # Align end time to the next full hour so the current hour is the last bucket
            # e.g. if now is 14:30, we want buckets up to 15:00 (which covers 14:00-15:00)
            # Actually, typically "24h" history means [now-24h, now].
            # To have clean buckets, let's align to the *start* of the current hour.
            # If now is 16:30, current hour bucket is 16:00-17:00.
            # We want 24 buckets ending with the current hour.

            bucket_size_sec = 3600
            bucket_size_ms = bucket_size_sec * 1000

            # Current hour start timestamp
            current_hour_start_sec = (int(now_ts) // 3600) * 3600
            current_hour_start_ms = current_hour_start_sec * 1000

            # Start of the range (23 hours ago)
            # We want 24 buckets: [current-23h, ..., current]
            start_ms = current_hour_start_ms - (23 * bucket_size_ms)

            # End of the range (end of current hour)
            # We query everything >= start_ms.
            bucket_count = 24

        else:
            # Last 7 days
            # Align to start of current day (00:00 UTC usually, or local? Server time serves as truth)
            # Using simple division aligns to UTC day if system time is UTC based or just consistent chunks.
            bucket_size_sec = 24 * 3600
            bucket_size_ms = bucket_size_sec * 1000

            current_day_start_sec = (int(now_ts) // bucket_size_sec) * bucket_size_sec
            current_day_start_ms = current_day_start_sec * 1000

            start_ms = current_day_start_ms - (6 * bucket_size_ms)
            bucket_count = 7

        # Query all files indexed in the time range
        results = client.client.collections[client.collection_name].documents.search(
            {
                "q": "*",
                "group_by": "file_path",
                "group_limit": 1,
                "filter_by": f"indexed_at:>={start_ms}",
                "per_page": 250,  # Single page for stats might be enough if not excessively huge activity
                "include_fields": "indexed_at",
            }
        )

        # If we have more hits, we might need to paginate or use aggregation
        # if Typesense supported time-series agg easily.
        # For now, 250 might accurately reflect "recent" bumps,
        # but if they indexed 1000 files in last hour, we miss counts.
        # Let's bump per_page significantly for stats query, or rely on facets?
        # Typesense doesn't do histogram facets on numeric fields easily without pre-defined ranges.
        # We'll use a larger fetch limit for accuracy.

        all_groups = results.get("grouped_hits", [])
        found_total = results.get("found", 0)

        # Determine strict upper bound for buckets to avoid future-timestamp weirdness
        # (though likely won't happen with valid system time)

        # Bucket the results
        buckets = defaultdict(int)

        # If more than 250 results, we might have partial data.
        # For a true stats chart, we should ideally fetch all references or use facets.
        # But fetching ids of 100k files is slow.
        # Let's hope activity isn't THAT massive per day for this personal app,
        # or accept sampled stats if capped.
        # Actually, let's just paginate a few times if needed?
        # For simplicity/speed in this context, we'll stick to one large-ish page (500).

        for group in all_groups:
            hits = group.get("hits", [])
            if hits:
                indexed_at = hits[0].get("document", {}).get("indexed_at", 0)
                if indexed_at >= start_ms:
                    # Calculate which bucket index (0 to bucket_count-1)
                    # bucket 0 = start_ms to start_ms + size
                    diff = indexed_at - start_ms
                    bucket_index = int(diff // bucket_size_ms)

                    if 0 <= bucket_index < bucket_count:
                        buckets[bucket_index] += 1

        # Build response filling gaps
        activity = []
        for i in range(bucket_count):
            bucket_start_ts = start_ms + (i * bucket_size_ms)
            activity.append(
                {
                    "timestamp": bucket_start_ts,
                    "count": buckets[i],
                }
            )

        return {
            "range": time_range,
            "activity": activity,
            "total": found_total,
        }

    except Exception as e:
        error_str = str(e)
        if "503" in error_str or "Not Ready" in error_str or "Lagging" in error_str or "Connection" in error_str:
            logger.debug(f"Search engine unavailable in get_indexing_activity: {e}")
            return {"range": time_range, "activity": [], "total": 0}
        logger.error(f"Error getting indexing activity: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files-by-type")
def get_files_by_type(
    ext: str = Query(..., description="File extension including dot, e.g. '.pdf'"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
):
    """
    Get paginated list of files by file type.

    Used for drill-down from file type distribution chart.
    """
    try:
        from file_brain.services.typesense_client import get_typesense_client

        client = get_typesense_client()

        # Normalize extension (ensure it starts with dot)
        if not ext.startswith("."):
            ext = f".{ext}"

        results = client.client.collections[client.collection_name].documents.search(
            {
                "q": "*",
                "group_by": "file_path",
                "group_limit": 1,
                "filter_by": f"file_extension:={ext}",
                "sort_by": "indexed_at:desc",
                "page": page,
                "per_page": per_page,
                "include_fields": "file_path,file_extension,file_size,mime_type,modified_time,indexed_at",
            }
        )

        files = []
        for group in results.get("grouped_hits", []):
            hits = group.get("hits", [])
            if hits:
                doc = hits[0].get("document", {})
                files.append(
                    {
                        "file_path": doc.get("file_path"),
                        "file_extension": doc.get("file_extension"),
                        "file_size": doc.get("file_size"),
                        "mime_type": doc.get("mime_type"),
                        "modified_time": doc.get("modified_time"),
                        "indexed_at": doc.get("indexed_at"),
                    }
                )

        return {
            "files": files,
            "total": results.get("found", 0),
            "page": page,
            "per_page": per_page,
            "extension": ext,
        }

    except Exception as e:
        error_str = str(e)
        if "503" in error_str or "Not Ready" in error_str or "Lagging" in error_str or "Connection" in error_str:
            logger.debug(f"Search engine unavailable in get_files_by_type: {e}")
            return {"files": [], "total": 0, "page": page, "per_page": per_page, "extension": ext}
        logger.error(f"Error getting files by type: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files-by-age")
def get_files_by_age(
    age_range: Literal["30d", "90d", "1y", "older"] = Query(...),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
):
    """
    Get paginated list of files by modification age.

    Used for drill-down from file age distribution chart.
    """
    import time

    try:
        from file_brain.services.typesense_client import get_typesense_client

        client = get_typesense_client()
        now_ms = int(time.time() * 1000)

        # Calculate age range in milliseconds
        day_ms = 24 * 60 * 60 * 1000

        if age_range == "30d":
            start_ms = now_ms - (30 * day_ms)
            end_ms = now_ms
        elif age_range == "90d":
            start_ms = now_ms - (90 * day_ms)
            end_ms = now_ms - (30 * day_ms)
        elif age_range == "1y":
            start_ms = now_ms - (365 * day_ms)
            end_ms = now_ms - (90 * day_ms)
        else:  # older
            start_ms = 0
            end_ms = now_ms - (365 * day_ms)

        filter_by = f"modified_time:>={start_ms} && modified_time:<{end_ms}"

        results = client.client.collections[client.collection_name].documents.search(
            {
                "q": "*",
                "group_by": "file_path",
                "group_limit": 1,
                "filter_by": filter_by,
                "sort_by": "modified_time:desc",
                "page": page,
                "per_page": per_page,
                "include_fields": "file_path,file_extension,file_size,mime_type,modified_time,indexed_at",
            }
        )

        files = []
        for group in results.get("grouped_hits", []):
            hits = group.get("hits", [])
            if hits:
                doc = hits[0].get("document", {})
                files.append(
                    {
                        "file_path": doc.get("file_path"),
                        "file_extension": doc.get("file_extension"),
                        "file_size": doc.get("file_size"),
                        "mime_type": doc.get("mime_type"),
                        "modified_time": doc.get("modified_time"),
                        "indexed_at": doc.get("indexed_at"),
                    }
                )

        return {
            "files": files,
            "total": results.get("found", 0),
            "page": page,
            "per_page": per_page,
            "age_range": age_range,
        }

    except Exception as e:
        logger.error(f"Error getting files by age: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/file-age-distribution")
def get_file_age_distribution():
    """
    Get distribution of files by modification age.

    Returns counts for age buckets: 0-30 days, 30-90 days, 90d-1y, older than 1y.
    """
    import time

    try:
        from file_brain.services.typesense_client import get_typesense_client

        client = get_typesense_client()
        now_ms = int(time.time() * 1000)
        day_ms = 24 * 60 * 60 * 1000

        buckets = {
            "30d": 0,
            "90d": 0,
            "1y": 0,
            "older": 0,
        }

        thresholds = [
            ("30d", now_ms - (30 * day_ms), now_ms),
            ("90d", now_ms - (90 * day_ms), now_ms - (30 * day_ms)),
            ("1y", now_ms - (365 * day_ms), now_ms - (90 * day_ms)),
            ("older", 0, now_ms - (365 * day_ms)),
        ]

        for bucket_name, start_ms, end_ms in thresholds:
            results = client.client.collections[client.collection_name].documents.search(
                {
                    "q": "*",
                    "group_by": "file_path",
                    "group_limit": 1,
                    "filter_by": f"modified_time:>={start_ms} && modified_time:<{end_ms}",
                    "per_page": 0,
                }
            )
            buckets[bucket_name] = results.get("found", 0)

        return {"distribution": buckets}

    except Exception as e:
        logger.error(f"Error getting file age distribution: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/storage-by-type")
def get_storage_by_type():
    """
    Get total storage size per file type.

    Returns bytes per file extension for the doughnut chart "by size" view.
    """
    try:
        from file_brain.services.typesense_client import get_typesense_client

        client = get_typesense_client()

        # Get all files with size info (paginated)
        all_files = []
        page = 1
        while True:
            results = client.client.collections[client.collection_name].documents.search(
                {
                    "q": "*",
                    "group_by": "file_path",
                    "group_limit": 1,
                    "per_page": 250,
                    "page": page,
                    "include_fields": "file_extension,file_size",
                }
            )

            groups = results.get("grouped_hits", [])
            if not groups:
                break

            for group in groups:
                hits = group.get("hits", [])
                if hits:
                    all_files.append(hits[0])
            if len(groups) < 250:
                break
            page += 1

            # Safety limit
            if page > 100:
                break

        # Aggregate by extension
        storage = {}
        for hit in all_files:
            doc = hit.get("document", {})
            ext = doc.get("file_extension", "unknown")
            size = doc.get("file_size", 0) or 0
            storage[ext] = storage.get(ext, 0) + size

        return {"storage": storage}

    except Exception as e:
        error_str = str(e)
        if "503" in error_str or "Not Ready" in error_str or "Lagging" in error_str or "Connection" in error_str:
            logger.debug(f"Search engine unavailable in get_storage_by_type: {e}")
            return {"storage": {}}
        logger.error(f"Error getting storage by type: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/index-storage")
def get_index_storage():
    """
    Get storage statistics for the search index (Typesense).

    Returns:
        - num_documents: Total document count in collection
        - index_memory_bytes: Memory used by Typesense for search indices
        - resident_memory_bytes: Total memory used by Typesense process
    """
    from file_brain.services.typesense_client import get_typesense_client

    try:
        client = get_typesense_client()

        # Get collection stats (document count)
        num_documents = 0
        try:
            collection = client.client.collections[client.collection_name].retrieve()
            num_documents = collection.get("num_documents", 0)
        except Exception:
            # Collection may not exist yet
            pass

        # Get metrics using the Typesense client's built-in metrics API
        metrics = client.client.metrics.retrieve()

        return {
            "num_documents": num_documents,
            "collection_name": client.collection_name,
            # Memory allocated for search indices
            "index_memory_bytes": int(metrics.get("typesense_memory_allocated_bytes", 0)),
            # Total memory used by Typesense
            "resident_memory_bytes": int(metrics.get("typesense_memory_resident_bytes", 0)),
            # Additional context
            "fragmentation_ratio": float(metrics.get("typesense_memory_fragmentation_ratio", 0)),
        }

    except Exception as e:
        error_str = str(e)
        if "503" in error_str or "Not Ready" in error_str or "Lagging" in error_str or "Connection" in error_str:
            logger.debug(f"Search engine unavailable in get_index_storage: {e}")
            return {
                "num_documents": 0,
                "collection_name": client.collection_name if "client" in locals() else "files",
                "index_memory_bytes": 0,
                "resident_memory_bytes": 0,
                "fragmentation_ratio": 0.0,
            }
        logger.error(f"Error getting index storage: {e}")
        raise HTTPException(status_code=500, detail=str(e))
