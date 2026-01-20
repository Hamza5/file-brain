"""
Typesense client for search operations
"""

import hashlib
import time
from typing import Any, Dict, List, Optional

import typesense

from file_brain.core.config import settings
from file_brain.core.logging import logger
from file_brain.core.typesense_schema import get_collection_schema


class TypesenseClient:
    """Typesense client wrapper"""

    def __init__(self):
        # We intentionally keep initialization cheap and robust:
        # - Short connection timeout so slow/booting Typesense does not block app startup for long.
        # - All heavy / retry logic is handled in initialize_collection().
        self.client = typesense.Client(
            {
                "nodes": [
                    {
                        "host": settings.typesense_host,
                        "port": settings.typesense_port,
                        "protocol": settings.typesense_protocol,
                    }
                ],
                "api_key": settings.typesense_api_key,
                "connection_timeout_seconds": settings.typesense_connection_timeout,
            }
        )
        self.collection_name = settings.typesense_collection_name
        # Flag to indicate whether the collection is confirmed ready.
        self.collection_ready = False

    def check_collection_exists(self) -> bool:
        """
        Check if collection exists in Typesense.

        Returns:
            True if collection exists
            False if collection doesn't exist (404 ObjectNotFound)

        Raises:
            Exception: For transient errors (503, connection errors) that should be retried
        """
        try:
            self.client.collections[self.collection_name].retrieve()
            self.collection_ready = True
            return True
        except typesense.exceptions.ObjectNotFound:
            # Collection truly doesn't exist (404)
            return False
        except typesense.exceptions.ServerError as e:
            # 503 or other server errors - Typesense is initializing
            logger.info(f"Typesense not ready yet: {e}")
            raise  # Let caller handle retry logic
        except Exception as e:
            # Connection errors, timeouts, etc. - transient issues
            logger.info(f"Transient error checking collection: {e}")
            raise  # Let caller handle retry logic

    def initialize_collection(
        self,
        max_attempts: int = 5,
        initial_backoff_seconds: float = 1.0,
    ) -> None:
        """
        Initialize Typesense collection in an idempotent and resilient way.

        Requirements:
        - If the collection already exists -> treat as success.
        - If Typesense is slow / returns timeouts while creating the collection -> retry with backoff.
        - If a concurrent creator wins and we get 409 (already exists) -> treat as success.
        - On persistent failure -> log error and let the API start in degraded mode,
          leaving collection_ready = False so callers can react appropriately.
        """
        from file_brain.services.service_manager import get_service_manager

        service_manager = get_service_manager()
        service_name = "typesense"

        attempt = 0
        backoff = initial_backoff_seconds

        service_manager.append_service_log(service_name, f"Starting initialization (max attempts: {max_attempts})")

        while attempt < max_attempts:
            attempt += 1
            try:
                # 1. Connecting phase
                service_manager.set_service_phase(
                    service_name,
                    "Connecting to Search Engine",
                    20 + (attempt * 5),
                    f"Connecting to {settings.typesense_host}:{settings.typesense_port}",
                )

                # 2. Fast path: checking if collection exists
                service_manager.set_service_phase(
                    service_name,
                    "Verifying Collection",
                    40,
                    "Checking if search collection exists",
                )

                # Direct SDK call (blocking)
                self.client.collections[self.collection_name].retrieve()

                service_manager.append_service_log(service_name, f"Collection '{self.collection_name}' already exists")
                logger.info(f"Collection '{self.collection_name}' already exists (attempt {attempt}/{max_attempts})")
                self.collection_ready = True
                return
            except typesense.exceptions.ObjectNotFound:
                # 3. Not found -> try to create it (Downloading models phase)
                try:
                    service_manager.set_service_phase(
                        service_name,
                        "Downloading Embedding Models",
                        60,
                        "This may take several minutes on first run...",
                    )
                    service_manager.append_service_log(service_name, "Creating collection (may trigger model download)")

                    schema = get_collection_schema(self.collection_name)

                    # Create a separate client with extended timeout ONLY for collection creation
                    # This is a one-time operation that may download embedding models (can take 60-120s)
                    collection_creation_client = typesense.Client(
                        {
                            "nodes": [
                                {
                                    "host": settings.typesense_host,
                                    "port": settings.typesense_port,
                                    "protocol": settings.typesense_protocol,
                                }
                            ],
                            "api_key": settings.typesense_api_key,
                            "connection_timeout_seconds": settings.typesense_model_download_timeout,
                        }
                    )

                    # Direct SDK call (blocking)
                    collection_creation_client.collections.create(schema)

                    # Log success
                    service_manager.append_service_log(
                        service_name,
                        f"Collection '{self.collection_name}' created successfully",
                    )
                    logger.info(
                        f"Collection '{self.collection_name}' created successfully with embedding models "
                        f"(attempt {attempt}/{max_attempts})"
                    )

                    # 4. Finalizing
                    service_manager.set_service_phase(
                        service_name,
                        "Finalizing Schema",
                        90,
                        "Verifying created collection",
                    )
                    self.collection_ready = True
                    return
                except typesense.exceptions.ObjectAlreadyExists:
                    # Race condition: someone else created it between our 404 and create.
                    service_manager.append_service_log(service_name, "Collection created by another process")
                    logger.info(
                        f"Collection '{self.collection_name}' already exists after race "
                        f"(attempt {attempt}/{max_attempts})"
                    )
                    self.collection_ready = True
                    return
                except Exception as e:
                    # Network/timeout/other error while creating. Retry.
                    error_msg = f"Creation failed: {str(e)}"
                    service_manager.append_service_log(service_name, error_msg)
                    logger.warning(
                        f"Attempt {attempt}/{max_attempts} to create Typesense collection "
                        f"'{self.collection_name}' failed: {e}"
                    )
            except Exception as e:
                # 3. Retrieval failed for transient reasons (Typesense starting up, timeouts, etc.)
                error_msg = f"Connection/Verification failed: {str(e)}"
                service_manager.append_service_log(service_name, error_msg)
                logger.warning(
                    f"Attempt {attempt}/{max_attempts} to verify Typesense collection "
                    f"'{self.collection_name}' failed: {e}"
                )

            # Backoff before next attempt
            if attempt < max_attempts:
                wait_msg = f"Retrying in {backoff} seconds..."
                service_manager.append_service_log(service_name, wait_msg)
                service_manager.set_service_phase(service_name, "Retrying Connection", 10, wait_msg)
                time.sleep(backoff)
                backoff *= 2

        # If we reach here, all attempts failed.
        # Do NOT raise to avoid crashing FastAPI startup.
        fail_msg = f"Failed after {max_attempts} attempts. Starting in degraded mode."
        service_manager.append_service_log(service_name, fail_msg)
        logger.error(
            f"Failed to initialize Typesense collection '{self.collection_name}' "
            f"after {max_attempts} attempts. Continuing in degraded mode."
        )
        self.collection_ready = False

    @staticmethod
    def generate_doc_id(file_path: str, chunk_index: int | None = None) -> str:
        """
        Generate document ID from file path and optional chunk index.

        Args:
            file_path: Full path to the file
            chunk_index: Optional chunk index for chunked files

        Returns:
            Document ID (SHA1 hash with optional chunk suffix)
        """
        base_hash = hashlib.sha1(file_path.encode()).hexdigest()
        if chunk_index is not None:
            return f"{base_hash}_chunk_{chunk_index}"
        return base_hash

    def is_file_indexed(self, file_path: str) -> bool:
        """Check if file is already indexed"""
        try:
            doc_id = self.generate_doc_id(file_path)
            self.client.collections[self.collection_name].documents[doc_id].retrieve()
            return True
        except typesense.exceptions.ObjectNotFound:
            return False
        except Exception as e:
            logger.error(f"Error checking if file indexed: {e}")
            return False

    def get_doc_by_path(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Get any chunk of an indexed file by its file_path.

        Since all chunks now contain complete metadata, we can return any chunk.
        We return chunk 0 by convention for consistency.

        Returns:
            Document dict if found, otherwise None.
        """
        try:
            # Get chunk 0 which has all the metadata
            doc_id = self.generate_doc_id(file_path, chunk_index=0)
            return self.client.collections[self.collection_name].documents[doc_id].retrieve()
        except typesense.exceptions.ObjectNotFound:
            return None
        except Exception as e:
            logger.error(f"Error getting indexed file: {e}")
            return None

    def index_file(
        self,
        file_path: str,
        content: str,
        chunk_index: int,
        chunk_total: int,
        chunk_hash: str,
        # Metadata (now required for all chunks)
        file_extension: str,
        file_size: int,
        mime_type: str,
        modified_time: int,
        created_time: int,
        file_hash: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Index (upsert) a file chunk in Typesense.

        All chunks contain complete metadata for simplified querying and filtering.

        Args:
            file_path: Full path to file
            content: Extracted content for this chunk
            chunk_index: Index of this chunk (0-based)
            chunk_total: Total number of chunks for this file
            chunk_hash: Unique hash for this chunk
            file_extension: File extension
            file_size: File size in bytes
            mime_type: MIME type
            modified_time: Modified timestamp in ms
            created_time: Created timestamp in ms
            file_hash: File content hash
            metadata: Additional metadata from extraction (Tika fields)
        """
        doc_id = self.generate_doc_id(file_path, chunk_index)

        # All chunks get complete metadata
        document: Dict[str, Any] = {
            "id": doc_id,
            "file_path": file_path,
            "content": content,
            "chunk_index": chunk_index,
            "chunk_total": chunk_total,
            "chunk_hash": chunk_hash,
            "file_extension": file_extension,
            "file_size": file_size,
            "mime_type": mime_type,
            "modified_time": modified_time,
            "created_time": created_time,
            "indexed_at": int(time.time() * 1000),
            "file_hash": file_hash,
        }

        # Add Tika metadata fields (use empty strings for missing values)
        if metadata:
            document["title"] = metadata.get("title", "")
            document["author"] = metadata.get("author", "")
            document["description"] = metadata.get("description", "")
            document["subject"] = metadata.get("subject", "")
            document["language"] = metadata.get("language", "")
            document["producer"] = metadata.get("producer", "")
            document["application"] = metadata.get("application", "")
            document["comments"] = metadata.get("comments", "")
            document["revision"] = metadata.get("revision", "")
            document["document_created_date"] = metadata.get("document_created_date", "")
            document["document_modified_date"] = metadata.get("document_modified_date", "")
            document["content_type"] = metadata.get("content_type", "")

            # Keywords array
            keywords = metadata.get("keywords", [])
            if isinstance(keywords, list):
                document["keywords"] = keywords
            elif isinstance(keywords, str):
                document["keywords"] = [k.strip() for k in keywords.split(",")] if keywords else []
            else:
                document["keywords"] = []
        else:
            # No metadata provided - use empty defaults
            document["title"] = ""
            document["author"] = ""
            document["description"] = ""
            document["subject"] = ""
            document["language"] = ""
            document["producer"] = ""
            document["application"] = ""
            document["comments"] = ""
            document["revision"] = ""
            document["document_created_date"] = ""
            document["document_modified_date"] = ""
            document["content_type"] = ""
            document["keywords"] = []

        try:
            # Use upsert to handle both create and update
            self.client.collections[self.collection_name].documents.upsert(document)
            logger.debug(f"Indexed chunk {chunk_index}/{chunk_total} of: {file_path}")
        except Exception as e:
            logger.error(f"Error indexing chunk {chunk_index} of {file_path}: {e}")
            raise

    def remove_from_index(self, file_path: str) -> None:
        """
        Remove all chunks of a file from index.

        Uses filter-based deletion to remove all documents with matching file_path.
        """
        try:
            # Delete all chunks for this file path
            self.client.collections[self.collection_name].documents.delete({"filter_by": f"file_path:={file_path}"})
            logger.info(f"Removed all chunks from index: {file_path}")
        except Exception as e:
            logger.error(f"Error removing {file_path}: {e}")
            raise

    def search_files(
        self,
        query: str,
        page: int = 1,
        per_page: int = 9,
        filter_by: Optional[str] = None,
        sort_by: str = "modified_time:desc",
    ) -> Dict[str, Any]:
        """Search indexed files"""
        try:
            search_parameters = {
                "q": query,
                "query_by": "file_path,file_name,content,title,description,subject,author,keywords,comments",
                "page": page,
                "per_page": per_page,
                "sort_by": sort_by,
            }

            if filter_by:
                search_parameters["filter_by"] = filter_by

            results = self.client.collections[self.collection_name].documents.search(search_parameters)

            return results
        except Exception as e:
            logger.error(f"Search error: {e}")
            raise

    def get_collection_stats(self) -> Dict[str, Any]:
        """
        Get collection statistics.

        Returns file count (not chunk count) by grouping by file_path.
        """
        try:
            # Use group_by to count unique files
            results = self.client.collections[self.collection_name].documents.search(
                {
                    "q": "*",
                    "group_by": "file_path",
                    "group_limit": 1,
                    "per_page": 0,  # We only need the count
                }
            )
            file_count = results.get("found", 0)

            collection = self.client.collections[self.collection_name].retrieve()

            # Since we successfully retrieved data, the collection is ready
            self.collection_ready = True

            return {
                "num_documents": file_count,  # File count, not chunk count
                "schema": collection,
            }
        except Exception as e:
            # If we failed to get stats, we can't be sure the collection is ready
            # But we don't necessarily want to set it to False if it was previously True
            # (transient errors shouldn't disable readiness flag generally)

            # Check if this is a Typesense unavailability error (503, connection errors, etc.)
            error_str = str(e)
            if "503" in error_str or "Not Ready" in error_str or "Lagging" in error_str or "Connection" in error_str:
                # Log as debug to avoid flooding logs during startup/shutdown
                logger.debug(f"Search engine unavailable in get_collection_stats: {e}")
            else:
                logger.error(f"Error getting stats: {e}")
            raise

    def get_file_type_distribution(self) -> Dict[str, int]:
        """
        Get distribution of indexed files by file extension via faceting.

        Returns file count (not chunk count) by grouping by file_path.

        Returns:
            Dict mapping file_extension to count, e.g. {".pdf": 42, ".txt": 15}
        """
        try:
            # Use group_by to get unique files, then facet by extension
            results = self.client.collections[self.collection_name].documents.search(
                {
                    "q": "*",
                    "group_by": "file_path",
                    "group_limit": 1,
                    "facet_by": "file_extension",
                    "max_facet_values": 100,
                    "per_page": 0,  # We only want facet counts, not documents
                }
            )

            facets = results.get("facet_counts", [])
            distribution = {}

            for facet in facets:
                if facet.get("field_name") == "file_extension":
                    for count in facet.get("counts", []):
                        ext = count.get("value", "unknown")
                        cnt = count.get("count", 0)
                        distribution[ext] = cnt

            return distribution
        except Exception as e:
            # Check if this is a Typesense unavailability error
            error_str = str(e)
            if "503" in error_str or "Not Ready" in error_str or "Lagging" in error_str or "Connection" in error_str:
                logger.debug(f"Search engine unavailable in get_file_type_distribution: {e}")
            else:
                logger.error(f"Error getting file type distribution: {e}")
            return {}

    def reset_collection(self) -> None:
        """
        Reset the collection by dropping and recreating it.

        This ensures schema changes are applied properly.
        Use this instead of just clearing documents when schema has changed.
        """
        try:
            # Drop the existing collection
            try:
                self.client.collections[self.collection_name].delete()
                logger.info(f"Dropped Typesense collection '{self.collection_name}'")
            except typesense.exceptions.ObjectNotFound:
                logger.info(f"Collection '{self.collection_name}' doesn't exist, nothing to drop")

            # Recreate with latest schema
            schema = get_collection_schema(self.collection_name)

            # Use extended timeout for collection creation (model download)
            collection_creation_client = typesense.Client(
                {
                    "nodes": [
                        {
                            "host": settings.typesense_host,
                            "port": settings.typesense_port,
                            "protocol": settings.typesense_protocol,
                        }
                    ],
                    "api_key": settings.typesense_api_key,
                    "connection_timeout_seconds": 120,
                }
            )

            collection_creation_client.collections.create(schema)
            logger.info(f"Recreated Typesense collection '{self.collection_name}' with latest schema")
            self.collection_ready = True
        except Exception as e:
            logger.error(f"Error resetting collection: {e}")
            raise

    def get_all_indexed_files(self, limit: int = 1000, offset: int = 0) -> List[Dict[str, Any]]:
        """
        Get all indexed files with pagination for verification.

        Returns unique files by grouping by file_path.
        Used to detect orphaned index entries by comparing with filesystem.
        """
        try:
            results = self.client.collections[self.collection_name].documents.search(
                {
                    "q": "*",
                    "group_by": "file_path",
                    "group_limit": 1,
                    "per_page": limit,
                    "page": (offset // limit) + 1,
                    "include_fields": "file_path,file_hash,file_size,modified_time,indexed_at",
                    "exclude_fields": "content,embedding",
                }
            )

            return results.get("hits", [])
        except Exception as e:
            logger.error(f"Error getting indexed files: {e}")
            return []

    def get_indexed_files_count(self) -> int:
        """
        Get total count of indexed files (not chunks) for verification progress tracking.

        Uses group_by to count unique files.
        """
        try:
            results = self.client.collections[self.collection_name].documents.search(
                {
                    "q": "*",
                    "group_by": "file_path",
                    "group_limit": 1,
                    "per_page": 0,
                }
            )
            return results.get("found", 0)
        except Exception as e:
            logger.error(f"Error getting indexed files count: {e}")
            return 0

    def batch_remove_files(self, file_paths: List[str]) -> Dict[str, int]:
        """
        Remove multiple files from index efficiently.

        Returns dict with 'successful' and 'failed' counts.
        """
        successful = 0
        failed = 0

        for file_path in file_paths:
            try:
                doc_id = self.generate_doc_id(file_path)
                self.client.collections[self.collection_name].documents[doc_id].delete()
                successful += 1
                logger.debug(f"Removed orphaned index entry: {file_path}")
            except typesense.exceptions.ObjectNotFound:
                # File already not in index, count as successful
                successful += 1
                logger.debug(f"Orphaned file already removed: {file_path}")
            except Exception as e:
                failed += 1
                logger.error(f"Failed to remove orphaned index entry {file_path}: {e}")

        logger.info(f"Batch cleanup completed: {successful} successful, {failed} failed")
        return {"successful": successful, "failed": failed}


# Global client instance
_client: Optional[TypesenseClient] = None


def get_typesense_client() -> TypesenseClient:
    """Get or create global Typesense client"""
    global _client
    if _client is None:
        _client = TypesenseClient()
    return _client
