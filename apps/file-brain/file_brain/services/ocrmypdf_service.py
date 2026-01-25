"""
OCRmyPDF Service for adding text layers to scanned PDFs.

This service provides optional OCR functionality that can be enabled
via settings to add searchable text layers to PDF files after indexing.
"""

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Tuple

from file_brain.core.logging import logger
from file_brain.database.models import db_session
from file_brain.database.repositories import SettingsRepository

# Setting key for OCR enabled toggle
OCRMYPDF_ENABLED_KEY = "ocrmypdf_enabled"


def is_ocrmypdf_available() -> Tuple[bool, str]:
    """
    Check if ocrmypdf CLI is available on the system.

    Returns:
        Tuple of (available: bool, version_or_error: str)
    """
    try:
        result = subprocess.run(
            ["ocrmypdf", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            version = result.stdout.strip().split("\n")[0]
            return True, version
        return False, "ocrmypdf returned error"
    except FileNotFoundError:
        return False, "ocrmypdf not installed"
    except subprocess.TimeoutExpired:
        return False, "ocrmypdf version check timed out"
    except Exception as e:
        return False, str(e)


def is_ocrmypdf_enabled() -> bool:
    """
    Check if OCRmyPDF processing is enabled in settings.

    Returns:
        True if OCR processing is enabled, False otherwise.
    """
    with db_session() as db:
        repo = SettingsRepository(db)
        return repo.get_bool(OCRMYPDF_ENABLED_KEY, default=False)


def process_pdf_with_ocr(pdf_path: str) -> Tuple[bool, Optional[str]]:
    """
    Process a PDF with OCRmyPDF to add a searchable text layer.

    Uses --skip-text to avoid re-processing PDFs that already have text.
    Modifies the PDF in-place on success.

    Args:
        pdf_path: Path to the PDF file to process.

    Returns:
        Tuple of (success: bool, error_message: Optional[str])
    """
    path = Path(pdf_path)

    if not path.exists():
        return False, f"File not found: {pdf_path}"

    if path.suffix.lower() != ".pdf":
        return False, "Not a PDF file"

    # Create temp file for output
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
            tmp_path = tmp_file.name

        # Run ocrmypdf with common optimization flags
        result = subprocess.run(
            [
                "ocrmypdf",
                "--skip-text",  # Skip pages that already have text
                "--rotate-pages",  # Auto-rotate pages based on detected orientation
                "--deskew",  # Straighten pages
                "--clean",  # Clean up images before OCR
                "--quiet",  # Less verbose output
                str(pdf_path),
                tmp_path,
            ],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout per PDF
        )

        if result.returncode == 0:
            # Replace original with OCR'd version
            shutil.move(tmp_path, pdf_path)
            logger.info(f"Successfully OCR'd PDF: {pdf_path}")
            return True, None
        elif result.returncode == 6:
            # Exit code 6 = "Document already has text, skipping"
            logger.debug(f"PDF already has text layer, skipping: {pdf_path}")
            Path(tmp_path).unlink(missing_ok=True)
            return True, None
        else:
            error = result.stderr or f"Exit code: {result.returncode}"
            logger.warning(f"OCRmyPDF failed for {pdf_path}: {error}")
            Path(tmp_path).unlink(missing_ok=True)
            return False, error

    except subprocess.TimeoutExpired:
        logger.error(f"OCRmyPDF timed out for {pdf_path}")
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
        return False, "OCR processing timed out"
    except Exception as e:
        logger.error(f"OCRmyPDF error for {pdf_path}: {e}")
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
        return False, str(e)
