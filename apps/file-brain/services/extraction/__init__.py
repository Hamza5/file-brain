"""
Extraction Module

Provides content extraction from various file types using pluggable strategies.
"""

from services.extraction.archive_strategy import ArchiveExtractionStrategy
from services.extraction.basic_strategy import BasicExtractionStrategy
from services.extraction.extractor import ContentExtractor, get_extractor
from services.extraction.protocol import ExtractionStrategy
from services.extraction.tika_strategy import TikaExtractionStrategy

__all__ = [
    "ExtractionStrategy",
    "ArchiveExtractionStrategy",
    "TikaExtractionStrategy",
    "BasicExtractionStrategy",
    "ContentExtractor",
    "get_extractor",
]
