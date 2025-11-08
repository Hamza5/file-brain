"""
Typesense client for search operations
"""
import hashlib
from typing import Optional, Dict, Any

import typesense

from config.typesense_schema import get_collection_schema
from utils.logger import logger
from config.settings import settings


class TypesenseClient:
    """Typesense client wrapper"""
    
    def __init__(self):
        self.client = typesense.Client({
            "nodes": [{
                "host": settings.typesense_host,
                "port": settings.typesense_port,
                "protocol": settings.typesense_protocol,
            }],
            "api_key": settings.typesense_api_key,
            "connection_timeout_seconds": 10,
        })
        self.collection_name = settings.typesense_collection_name

    async def initialize_collection(self) -> None:
        """Initialize Typesense collection if it doesn't exist"""
        try:
            # Try to retrieve the collection
            self.client.collections[self.collection_name].retrieve()
            logger.info(f"Collection '{self.collection_name}' already exists")
        except typesense.exceptions.ObjectNotFound:
            # Collection doesn't exist, create it
            schema = get_collection_schema(self.collection_name)
            self.client.collections.create(schema)
            logger.info(f"Collection '{self.collection_name}' created successfully")
        except Exception as e:
            logger.error(f"Error initializing collection: {e}")
            raise
    
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
        
        # Add optional metadata fields
        if metadata:
            title = metadata.get("title")
            author = metadata.get("author")
            description = metadata.get("description")
            if title:
                document["title"] = title
            if author:
                document["author"] = author
            if description:
                document["description"] = description
        
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
        per_page: int = 10,
        filter_by: Optional[str] = None,
        sort_by: str = "modified_time:desc",
    ) -> Dict[str, Any]:
        """Search indexed files"""
        try:
            search_parameters = {
                "q": query,
                "query_by": "file_path,content",
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
    
    async def clear_all_documents(self) -> None:
        """Clear all documents from the collection"""
        try:
            # Use filter_by with a condition that's always true to delete all documents
            self.client.collections[self.collection_name].documents.delete(
                filter_by="id:!=null"  # This will match all documents
            )
            logger.info("All documents cleared from Typesense collection")
        except Exception as e:
            logger.error(f"Error clearing documents: {e}")
            raise


# Import time for timestamps
import time


# Global client instance
_client: Optional[TypesenseClient] = None


def get_typesense_client() -> TypesenseClient:
    """Get or create global Typesense client"""
    global _client
    if _client is None:
        _client = TypesenseClient()
    return _client