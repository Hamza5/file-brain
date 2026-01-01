"""
Document content extraction using Apache Tika with comprehensive format support
including archive handling
"""
import os
import mimetypes
import re
from typing import Dict, Any, Optional

# Import chardet for smart text extraction
import chardet

from api.models.file_event import DocumentContent
from core.config import settings
from core.logging import logger
from services.archive_extractor import (
    is_likely_archive,
    extract_and_parse_archive
)

# Import Tika
from tika import parser


class ContentExtractor:
    """Document content extractor using Apache Tika"""
    
    def __init__(self):
        """Initialize the content extractor with Tika configuration"""
        # Configure tika-python for client-only mode when Docker Tika is enabled
        if settings.tika_enabled and settings.tika_client_only:
            os.environ['TIKA_CLIENT_ONLY'] = 'True'
            logger.info(f"Configured Tika client-only mode for endpoint: {settings.tika_url}")
    
    def extract(self, file_path: str) -> DocumentContent:
        """
        Extract content from file using Tika
        
        Args:
            file_path: Path to file
            
        Returns:
            DocumentContent with markdown and metadata
            
        Raises:
            FileNotFoundError: If file doesn't exist
            Exception: For extraction errors
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Check if it's likely an archive file
        if is_likely_archive(file_path):
            logger.info(f"Processing as archive: {file_path}")
            return self._extract_archive(file_path)
        
        # Check if Tika is enabled
        if not settings.tika_enabled:
            logger.info("Tika extraction disabled, using basic extraction")
            return self._extract_basic(file_path)
        
        # Try Tika extraction
        try:
            return self._extract_with_tika(file_path)
        except Exception as e:
            logger.warning(f"Tika extraction failed for {file_path}: {e}")
            logger.info("Falling back to basic extraction")
        
        # Fallback to basic extraction
        return self._extract_basic(file_path)
    
    def _extract_archive(self, file_path: str) -> DocumentContent:
        """
        Extract content from archive files using recursive parsing
        """
        logger.info(f"Extracting archive content: {file_path}")
        
        try:
            # Configure Tika endpoint
            tika_endpoint = settings.tika_url if settings.tika_client_only else None
            
            # Extract and parse the archive
            result = extract_and_parse_archive(
                file_path=file_path,
                max_depth=5,
                max_file_size=100 * 1024 * 1024,  # 100 MB
                tika_endpoint=tika_endpoint
            )
            
            if result is None:
                logger.warning(f"Failed to extract archive content: {file_path}")
                return self._extract_basic(file_path)
            
            # Process the archive metadata and update with file info
            metadata = result["metadata"]
            content = result["content"]
            
            # Add file-specific metadata
            file_stats = os.stat(file_path)
            metadata.update({
                "extraction_method": "archive_parsing",
                "file_size": file_stats.st_size,
                "file_mtime": file_stats.st_mtime,
                "is_archive": True,
            })
            
            logger.info(f"Successfully extracted archive: {file_path} ({metadata.get('files_extracted', 0)} files)")
            
            return DocumentContent(content=content, metadata=metadata)
            
        except Exception as e:
            logger.error(f"Error during archive extraction of {file_path}: {e}")
            # Fall back to basic extraction
            return self._extract_basic(file_path)
    
    def _extract_with_tika(self, file_path: str) -> DocumentContent:
        """Extract using Apache Tika"""
        logger.info(f"Extracting with Tika: {file_path}")
        
        try:
            # Configure Tika endpoint
            tika_endpoint = settings.tika_url if settings.tika_client_only else None
            
            # Parse the file using Tika
            if tika_endpoint:
                logger.debug(f"Using Tika endpoint: {tika_endpoint}")
                parsed = parser.from_file(file_path, tika_endpoint)
            else:
                parsed = parser.from_file(file_path)
            
            if not parsed or 'content' not in parsed:
                logger.warning(f"Tika returned empty result for {file_path}")
                return self._extract_basic(file_path)
            
            # Extract content
            content = parsed.get('content', '').strip()
            
            # If content is empty after Tika extraction, fall back to basic extraction
            if not content:
                logger.warning(f"Tika extracted empty content for {file_path}")
                return self._extract_basic(file_path)
            
            # Extract and process metadata
            raw_metadata = parsed.get('metadata', {})
            metadata = self._process_tika_metadata(raw_metadata)
            
            # Add Tika endpoint information to metadata
            if tika_endpoint:
                metadata['tika_endpoint'] = tika_endpoint
            
            logger.info(f"Successfully extracted {len(content)} characters from {file_path}")
            
            return DocumentContent(content=content, metadata=metadata)
            
        except ConnectionError as e:
            logger.error(f"Connection error to Tika server {settings.tika_url}: {e}")
            logger.info("Ensure Tika Docker container is running on the configured port")
            raise
        except Exception as e:
            logger.error(f"Error during Tika extraction of {file_path}: {e}")
            # Enhanced error handling for Docker connectivity
            if "Connection refused" in str(e) or "Failed to connect" in str(e):
                logger.error(f"Cannot connect to Tika server at {settings.tika_url}")
                logger.error("Please ensure the Tika Docker container is running: docker run -p 9998:9998 apache/tika:latest-full")
            raise
    
    def _process_tika_metadata(self, raw_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process Tika metadata to extract useful fields
        
        Args:
            raw_metadata: Raw metadata from Tika
            
        Returns:
            Processed metadata dictionary
        """
        metadata: Dict[str, Any] = {
            "extraction_method": "tika",
        }
        
        # Common metadata fields that Tika can extract
        field_mapping = {
            'title': 'title',
            'Author': 'author',
            'creator': 'author',
            'Creation-Date': 'created_date',
            'CreationDate': 'created_date',
            'last-modified': 'modified_date',
            'lastModified': 'modified_date',
            'Content-Type': 'content_type',
            'application': 'application',
            'producer': 'producer',
            'creator': 'creator',
            'Subject': 'subject',
            'Description': 'description',
            'Comments': 'comments',
            'Revision': 'revision',
            'Keywords': 'keywords',
            'Language': 'language',
        }
        
        # Extract mapped fields
        for tika_key, our_key in field_mapping.items():
            if tika_key in raw_metadata and raw_metadata[tika_key]:
                metadata[our_key] = str(raw_metadata[tika_key])
        
        # Handle special cases for dates
        for date_key in ['Creation-Date', 'CreationDate', 'last-modified', 'lastModified']:
            if date_key in raw_metadata and raw_metadata[date_key]:
                # Tika often returns dates in ISO format or human readable format
                metadata[f"{date_key.replace('-', '_').lower()}"] = str(raw_metadata[date_key])
        
        # Handle metadata as lists (like keywords)
        for key in ['keywords', 'creator', 'author']:
            if key in raw_metadata:
                value = raw_metadata[key]
                if isinstance(value, list):
                    metadata[key] = value
                elif isinstance(value, str):
                    # Try to split if it looks like a list
                    if ',' in value:
                        metadata[key] = [v.strip() for v in value.split(',')]
                    else:
                        metadata[key] = [value]
        
        # Add all raw metadata for advanced use cases
        # (but only include non-empty values to keep it clean)
        clean_raw_metadata = {}
        for k, v in raw_metadata.items():
            if v is not None and str(v).strip():
                clean_raw_metadata[k] = str(v)
        
        metadata["raw_tika_metadata"] = clean_raw_metadata
        
        return metadata
    
    def _extract_smart_text(self, file_path: str, min_word_length: int = 3, min_text_ratio: float = 0.3) -> Optional[str]:
        """
        Smart text extraction from any file using chardet encoding detection
        
        Args:
            file_path: Path to file
            min_word_length: Minimum word length to consider
            min_text_ratio: Minimum ratio of alphanumeric characters to total text
            
        Returns:
            Extracted text or None if extraction fails
        """
        try:
            # Read binary data
            with open(file_path, 'rb') as f:
                raw_data = f.read()
            
            # Detect encoding
            detected = chardet.detect(raw_data)
            encoding = detected.get('encoding', 'utf-8')
            confidence = detected.get('confidence', 0)
            
            if confidence < 0.7:
                logger.debug(f"Low encoding confidence ({confidence}) for {file_path}")
                return None
                
            # Decode text
            text = raw_data.decode(encoding, errors='ignore')
            
            # Filter out control characters but keep whitespace
            text = ''.join(char for char in text if char.isprintable() or char.isspace())
            
            # Check if text seems legitimate (ratio of alphanumeric to total)
            if len(text) > 0:
                alnum_ratio = sum(c.isalnum() or c.isspace() for c in text) / len(text)
                if alnum_ratio < min_text_ratio:
                    logger.debug(f"Low text ratio ({alnum_ratio:.2f}) for {file_path}")
                    return None
            
            # Extract words of reasonable length
            words = re.findall(r'\b\w{' + str(min_word_length) + r',}\b', text)
            
            if len(words) < 3:  # Reduced from 10 to 3 words
                logger.debug(f"Too few words ({len(words)}) extracted from {file_path}")
                return None
                
            extracted_text = ' '.join(words)
            logger.info(f"Smart extraction successful: {len(extracted_text)} characters from {file_path}")
            return extracted_text
            
        except Exception as e:
            logger.debug(f"Smart extraction failed for {file_path}: {e}")
            return None

    def _extract_basic(self, file_path: str) -> DocumentContent:
        """
        Fallback basic extraction for unsupported files
        DISABLED: Returns empty content immediately for performance
        """
        logger.info(f"Basic extraction disabled for: {file_path}")
        
        try:
            # Get MIME type
            mime_type, _ = mimetypes.guess_type(file_path)
            file_stats = os.stat(file_path)
            
            # Return empty content immediately (basic extraction disabled)
            return DocumentContent(
                content="",
                metadata={
                    "extraction_method": "disabled",
                    "mime_type": mime_type,
                    "file_size": file_stats.st_size,
                    "reason": "Basic extraction disabled for performance"
                }
            )
            
        except Exception as e:
            logger.error(f"Error in basic extraction: {e}")
            return DocumentContent(
                content="",
                metadata={
                    "extraction_method": "no_content",
                    "error": str(e)
                }
            )


# Global extractor instance
_extractor: Optional[ContentExtractor] = None


def get_extractor() -> ContentExtractor:
    """Get or create global extractor instance"""
    global _extractor
    if _extractor is None:
        _extractor = ContentExtractor()
    return _extractor