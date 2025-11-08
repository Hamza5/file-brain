"""
Document content extraction using Docling with OCR support
"""
import os
import mimetypes
from pathlib import Path
from typing import Dict, Any, Optional

from api.models.file_event import DocumentContent
from utils.logger import logger

# Try to import Docling
try:
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, EasyOcrOptions, TableStructureOptions
    DOCLING_AVAILABLE = True
except ImportError:
    logger.warning("Docling not installed. Install with: pip install docling")
    DOCLING_AVAILABLE = False


class ContentExtractor:
    """Document content extractor using Docling"""
    
    def __init__(self):
        self.converter: Optional[Any] = None
        
        if DOCLING_AVAILABLE:
            self._initialize_converter()
        else:
            logger.warning("Docling unavailable, using fallback extraction")
    
    def _initialize_converter(self) -> None:
        """Initialize Docling document converter with OCR options"""
        try:
            # Configure PDF pipeline options
            pipeline_options = PdfPipelineOptions(
                do_ocr=True, do_table_structure=True, table_structure_options=TableStructureOptions(do_cell_matching=True),
                ocr_options=EasyOcrOptions(force_full_page_ocr=False)
            )

            # Create converter with options
            self.converter = DocumentConverter(
                format_options={
                    InputFormat.PDF: PdfFormatOption(
                        pipeline_options=pipeline_options
                    )
                }
            )
            
            logger.info(
                f"Docling converter initialized with OCR support: {self.converter}"
            )
            
        except Exception as e:
            logger.error(f"Error initializing Docling converter: {e}")
            self.converter = None
    
    def extract(self, file_path: str) -> DocumentContent:
        """
        Extract content from file
        
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
        
        # Get MIME type
        mime_type, _ = mimetypes.guess_type(file_path)
        
        # Try Docling extraction
        if DOCLING_AVAILABLE and self.converter:
            try:
                return self._extract_with_docling(file_path)
            except Exception as e:
                logger.warning(f"Docling extraction failed for {file_path}: {e}")
                logger.info("Falling back to basic extraction")
        
        # Fallback to basic extraction
        return self._extract_basic(file_path, mime_type)
    
    def _extract_with_docling(self, file_path: str) -> DocumentContent:
        """Extract using Docling"""
        logger.info(f"Extracting with Docling: {file_path}")
        
        # Convert document
        result = self.converter.convert(file_path)
        document = result.document
        
        # Export to markdown
        markdown_content = document.export_to_markdown()
        
        # Extract metadata
        metadata: Dict[str, Any] = {
            "extraction_method": "docling",
        }
        
        # Add document-level metadata if available
        if hasattr(document, "metadata"):
            doc_meta = document.metadata
            if hasattr(doc_meta, "title") and doc_meta.title:
                metadata["title"] = doc_meta.title
            if hasattr(doc_meta, "authors") and doc_meta.authors:
                metadata["authors"] = doc_meta.authors
            if hasattr(doc_meta, "description") and doc_meta.description:
                metadata["description"] = doc_meta.description

        return DocumentContent(content=markdown_content, metadata=metadata)
    
    def _extract_basic(
        self,
        file_path: str,
        mime_type: Optional[str]
    ) -> DocumentContent:
        """
        Fallback basic extraction for text files
        """
        logger.info(f"Basic extraction: {file_path}")
        
        # Try to read as text
        if mime_type and mime_type.startswith("text"):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                return DocumentContent(
                    content=content,
                    metadata={"extraction_method": "basic_text"}
                )
            except Exception as e:
                logger.warning(f"Could not read as text: {e}")
        
        # Return placeholder for binary files
        file_name = Path(file_path).name
        return DocumentContent(
            content=f"# {file_name}\n\n*Binary file - content extraction not available*",
            metadata={
                "extraction_method": "placeholder",
                "reason": "Binary file or unsupported format"
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