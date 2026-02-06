"""
Extraction specific exceptions.
"""


class ExtractionFallbackNotAllowed(Exception):
    """
    Raised when an extraction strategy determines that it is the authoritative
    handler for a file type, but failed to extract content.
    This signal prevents fallback to subsequent strategies (e.g. basic string extraction).
    """

    pass
