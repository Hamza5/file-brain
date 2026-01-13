"""
Extraction Module

Provides content extraction from various file types using pluggable strategies.
"""

from file_brain.services.extraction.basic_strategy import BasicExtractionStrategy
from file_brain.services.extraction.extractor import ContentExtractor, get_extractor
from file_brain.services.extraction.protocol import ExtractionStrategy
from file_brain.services.extraction.tika_strategy import TikaExtractionStrategy

__all__ = [
    "ExtractionStrategy",
    "TikaExtractionStrategy",
    "BasicExtractionStrategy",
    "ContentExtractor",
    "get_extractor",
]
