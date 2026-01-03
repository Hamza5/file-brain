"""
Document content model for extraction results
"""

from typing import Any, Dict

from pydantic import BaseModel, Field


class DocumentContent(BaseModel):
    """Extracted document content"""

    content: str = Field(description="Document content")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Document metadata")
