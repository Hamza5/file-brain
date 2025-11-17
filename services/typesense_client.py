"""
Typesense client for search operations
"""
import hashlib
import asyncio
from typing import Optional, Dict, Any, List
import time

import typesense

from config.typesense_schema import get_collection_schema
from utils.logger import logger
from config.settings import settings


class TypesenseClient:
    """Typesense client wrapper"""
    
    def __init__(self):
        # We intentionally keep initialization cheap and robust:
        # - Short connection timeout so slow/booting Typesense does not block app startup for long.
        # - All heavy / retry logic is handled in initialize_collection().
        self.client = typesense.Client({
            "nodes": [{
                "host": settings.typesense_host,
                "port": settings.typesense_port,
                "protocol": settings.typesense_protocol,
            }],
            "api_key": settings.typesense_api_key,
            "connection_timeout_seconds": 5,
        })
        self.collection_name = settings.typesense_collection_name
        # Flag to indicate whether the collection is confirmed ready.
        self.collection_ready = False

    async def initialize_collection(
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
        attempt = 0
        backoff = initial_backoff_seconds

        while attempt < max_attempts:
            attempt += 1
            try:
                # 1. Fast path: collection exists
                self.client.collections[self.collection_name].retrieve()
                logger.info(
                    f"Collection '{self.collection_name}' already exists (attempt {attempt}/{max_attempts})"
                )
                self.collection_ready = True
                return
            except typesense.exceptions.ObjectNotFound:
                # 2. Not found -> try to create it
                try:
                    schema = get_collection_schema(self.collection_name)
                    self.client.collections.create(schema)
                    logger.info(
                        f"Collection '{self.collection_name}' created successfully "
                        f"(attempt {attempt}/{max_attempts})"
                    )
                    self.collection_ready = True
                    return
                except typesense.exceptions.ObjectAlreadyExists:
                    # Race condition: someone else created it between our 404 and create.
                    logger.info(
                        f"Collection '{self.collection_name}' already exists after race "
                        f"(attempt {attempt}/{max_attempts})"
                    )
                    self.collection_ready = True
                    return
                except Exception as e:
                    # Network/timeout/other error while creating. Retry.
                    logger.warning(
                        f"Attempt {attempt}/{max_attempts} to create Typesense collection "
                        f"'{self.collection_name}' failed: {e}"
                    )
            except Exception as e:
                # 3. Retrieval failed for transient reasons (Typesense starting up, timeouts, etc.)
                logger.warning(
                    f"Attempt {attempt}/{max_attempts} to verify Typesense collection "
                    f"'{self.collection_name}' failed: {e}"
                )

            # Backoff before next attempt
            if attempt < max_attempts:
                await asyncio.sleep(backoff)
                backoff *= 2

        # If we reach here, all attempts failed.
        # Do NOT raise to avoid crashing FastAPI startup.
        logger.error(
            f"Failed to initialize Typesense collection '{self.collection_name}' "
            f"after {max_attempts} attempts. Continuing in degraded mode."
        )
        self.collection_ready = False
    
    @staticmethod
    def generate_doc_id(file_path: str) -> str:
        """Generate document ID from file path"""
        return hashlib.sha1(file_path.encode()).hexdigest()
    
    async def is_file_indexed(self, file_path: str) -> bool:
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
     
    async def get_doc_by_path(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Get an indexed file document by its file_path.

        Returns:
            Document dict if found, otherwise None.
        """
        try:
            doc_id = self.generate_doc_id(file_path)
            return self.client.collections[self.collection_name].documents[doc_id].retrieve()
        except typesense.exceptions.ObjectNotFound:
            return None
        except Exception as e:
            logger.error(f"Error getting indexed file: {e}")
            return None
     
    async def index_file(
        self,
        file_path: str,
        file_name: str,
        file_extension: str,
        file_size: int,
        mime_type: str,
        content: str,
        modified_time: int,
        created_time: int,
        file_hash: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Index (upsert) a file in Typesense.

        Typesense is the single source of truth. This method always upserts the document with the
        provided metadata and file_hash.
        
        Args:
            file_path: Full path to file
            file_name: File name
            file_extension: File extension
            file_size: File size in bytes
            mime_type: MIME type
            content: Extracted content
            modified_time: Modified timestamp (ms)
            created_time: Created timestamp (ms)
            metadata: Additional metadata
        """
        doc_id = self.generate_doc_id(file_path)
        
        document: Dict[str, Any] = {
            "id": doc_id,
            "file_path": file_path,
            "file_name": file_name,
            "file_extension": file_extension,
            "file_size": file_size,
            "mime_type": mime_type,
            "content": content,
            "modified_time": modified_time,
            "created_time": created_time,
            "indexed_at": int(time.time() * 1000),
            "file_hash": file_hash,
        }
        
        # Add enhanced metadata fields from Tika extraction
        if metadata:
            # Standard document metadata
            if title := metadata.get("title"):
                document["title"] = title
            if author := metadata.get("author"):
                document["author"] = author
            if description := metadata.get("description"):
                document["description"] = description
            
            # Additional Tika-extracted metadata
            if subject := metadata.get("subject"):
                document["subject"] = subject
            if language := metadata.get("language"):
                document["language"] = language
            if producer := metadata.get("producer"):
                document["producer"] = producer
            if application := metadata.get("application"):
                document["application"] = application
            if comments := metadata.get("comments"):
                document["comments"] = comments
            if revision := metadata.get("revision"):
                document["revision"] = revision
            
            # Document creation/modification dates
            if doc_created_date := metadata.get("created_date"):
                document["document_created_date"] = doc_created_date
            if doc_modified_date := metadata.get("modified_date"):
                document["document_modified_date"] = doc_modified_date
            
            # Keywords array
            if keywords := metadata.get("keywords"):
                if isinstance(keywords, list):
                    document["keywords"] = keywords
                elif isinstance(keywords, str):
                    # Split comma-separated keywords into array
                    document["keywords"] = [k.strip() for k in keywords.split(",")]
            
            # Content type with priority: Tika's content_type first, then mime_type
            tika_content_type = metadata.get("content_type")
            document["content_type"] = tika_content_type or mime_type
        
        try:
            # Use upsert to handle both create and update
            self.client.collections[self.collection_name].documents.upsert(document)
            logger.info(f"Indexed: {file_name}")
        except Exception as e:
            logger.error(f"Error indexing {file_name}: {e}")
            raise
    
    async def remove_from_index(self, file_path: str) -> None:
        """Remove file from index"""
        doc_id = self.generate_doc_id(file_path)
        
        try:
            self.client.collections[self.collection_name].documents[doc_id].delete()
            logger.info(f"Removed from index: {file_path}")
        except typesense.exceptions.ObjectNotFound:
            logger.warning(f"File not in index: {file_path}")
        except Exception as e:
            logger.error(f"Error removing {file_path}: {e}")
            raise
    
    async def search_files(
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
            
            results = self.client.collections[self.collection_name].documents.search(
                search_parameters
            )
            
            return results
        except Exception as e:
            logger.error(f"Search error: {e}")
            raise
    
    async def get_collection_stats(self) -> Dict[str, Any]:
        """Get collection statistics"""
        try:
            collection = self.client.collections[self.collection_name].retrieve()
            return {
                "num_documents": collection.get("num_documents", 0),
                "schema": collection,
            }
        except Exception as e:
            logger.error(f"Error getting stats: {e}")
            raise
    
    async def get_file_type_distribution(self) -> Dict[str, int]:
        """
        Get distribution of indexed files by file extension via faceting.
        
        Returns:
            Dict mapping file_extension to count, e.g. {".pdf": 42, ".txt": 15}
        """
        try:
            # Search with facet_by to get counts per file_extension
            results = self.client.collections[self.collection_name].documents.search({
                "q": "*",
                "facet_by": "file_extension",
                "per_page": 0,  # We only want facet counts, not documents
            })
            
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
            logger.error(f"Error getting file type distribution: {e}")
            return {}
    
    async def clear_all_documents(self) -> None:
        """Clear all documents from the collection"""
        try:
            # Use filter_by with a condition that's always true to delete all documents
            self.client.collections[self.collection_name].documents.delete(
                dict(filter_by="id:!=null")  # This will match all documents
            )
            logger.info("All documents cleared from Typesense collection")
        except Exception as e:
            logger.error(f"Error clearing documents: {e}")
            raise
    
    async def get_all_indexed_files(self, limit: int = 1000, offset: int = 0) -> List[Dict[str, Any]]:
        """
        Get all indexed files with pagination for verification.
        
        Returns list of documents with file_path, file_hash, and other metadata.
        Used to detect orphaned index entries by comparing with filesystem.
        """
        try:
            results = self.client.collections[self.collection_name].documents.search({
                "q": "*",
                "per_page": limit,
                "page": (offset // limit) + 1,
                "include_fields": "file_path,file_hash,file_name,file_size,modified_time,indexed_at",
                "exclude_fields": "content,embedding"
            })
            
            return results.get("hits", [])
        except Exception as e:
            logger.error(f"Error getting indexed files: {e}")
            return []
    
    async def get_indexed_files_count(self) -> int:
        """Get total count of indexed files for verification progress tracking"""
        try:
            results = self.client.collections[self.collection_name].documents.search({
                "q": "*",
                "per_page": 1
            })
            return results.get("found", 0)
        except Exception as e:
            logger.error(f"Error getting indexed files count: {e}")
            return 0
    
    async def batch_remove_files(self, file_paths: List[str]) -> Dict[str, int]:
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
        return {
            "successful": successful,
            "failed": failed
        }


# Global client instance
_client: Optional[TypesenseClient] = None


def get_typesense_client() -> TypesenseClient:
    """Get or create global Typesense client"""
    global _client
    if _client is None:
        _client = TypesenseClient()
    return _client