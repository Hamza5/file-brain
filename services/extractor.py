"""
Document content extraction using Apache Tika with comprehensive format support
"""
import os
import mimetypes
import re
from pathlib import Path
from typing import Dict, Any, Optional

# Import chardet for smart text extraction
import chardet

from api.models.file_event import DocumentContent
from utils.logger import logger

# Import Tika
from tika import parser


class ContentExtractor:
    """Document content extractor using Apache Tika"""
    
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
        
        # Try Tika extraction
        try:
            return self._extract_with_tika(file_path)
        except Exception as e:
            logger.warning(f"Tika extraction failed for {file_path}: {e}")
            logger.info("Falling back to basic extraction")
        
        # Fallback to basic extraction
        return self._extract_basic(file_path)
    
    def _extract_with_tika(self, file_path: str) -> DocumentContent:
        """Extract using Apache Tika"""
        logger.info(f"Extracting with Tika: {file_path}")
        
        try:
            # Parse the file using Tika
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
            
            logger.info(f"Successfully extracted {len(content)} characters from {file_path}")
            
            return DocumentContent(content=content, metadata=metadata)
            
        except Exception as e:
            logger.error(f"Error during Tika extraction of {file_path}: {e}")
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
        """
        logger.info(f"Basic extraction: {file_path}")
        
        try:
            # First try smart text extraction for any file type
            smart_text = self._extract_smart_text(file_path)
            if smart_text:
                file_name = Path(file_path).name
                smart_content = f"# {file_name}\n\n{smart_text}"
                return DocumentContent(
                    content=smart_content,
                    metadata={
                        "extraction_method": "smart_text",
                        "mime_type": mimetypes.guess_type(file_path)[0],
                        "text_length": len(smart_text)
                    }
                )
            
            # Get MIME type
            mime_type, _ = mimetypes.guess_type(file_path)
            
            # Try to read as text
            if mime_type and mime_type.startswith("text"):
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read().strip()
                    if content:
                        return DocumentContent(
                            content=content,
                            metadata={
                                "extraction_method": "basic_text",
                                "mime_type": mime_type
                            }
                        )
                except UnicodeDecodeError:
                    pass  # Fall through to no content case
            
            # Return empty content for all other cases
            file_stats = os.stat(file_path)
            
            return DocumentContent(
                content="",
                metadata={
                    "extraction_method": "no_content",
                    "mime_type": mime_type,
                    "file_size": file_stats.st_size,
                    "reason": "Unsupported file type or empty content"
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