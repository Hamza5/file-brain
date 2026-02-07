from unittest.mock import MagicMock, patch

import pytest
import tika.detector  # noqa: F401
import tika.parser  # noqa: F401

# Ensure tika submodules are loaded so patch can find them
from file_brain.api.models.file_event import DocumentContent
from file_brain.services.extraction.exceptions import ExtractionFallbackNotAllowed
from file_brain.services.extraction.extractor import ContentExtractor
from file_brain.services.extraction.tika_strategy import TikaExtractionStrategy


@pytest.fixture
def tika_strategy():
    return TikaExtractionStrategy()


def test_can_extract(tika_strategy):
    with patch("file_brain.core.config.settings") as mock_settings:
        mock_settings.tika_enabled = True
        assert tika_strategy.can_extract("test.pdf") is True


@patch("tika.parser")
@patch("tika.detector")
def test_extract_success(mock_detector, mock_parser, tika_strategy):
    # Mock successful detection
    mock_detector.from_file.return_value = "application/pdf"

    # Mock successful parsing
    mock_parser.from_file.return_value = {
        "content": "extracted text",
        "metadata": {"Content-Type": "application/pdf"},
        "status": 200,
    }

    content = tika_strategy.extract("test.pdf")

    assert content.content == "extracted text"
    assert content.metadata["mime_type"] == "application/pdf"

    # Verify default timeout was used (first attempt)
    mock_parser.from_file.assert_called()
    args, kwargs = mock_parser.from_file.call_args
    assert kwargs["requestOptions"]["timeout"] == 60


@patch("tika.parser")
@patch("tika.detector")
def test_extract_retry_success(mock_detector, mock_parser, tika_strategy):
    mock_detector.from_file.return_value = "application/pdf"

    # First attempt fails (timeout or empty)
    # Second attempt succeeds
    mock_parser.from_file.side_effect = [
        None,  # First attempt fails
        {  # Second attempt succeeds
            "content": "extracted text",
            "metadata": {},
            "status": 200,
        },
    ]

    content = tika_strategy.extract("test.pdf")

    assert content.content == "extracted text"

    # Verify calls with increasing timeouts
    assert mock_parser.from_file.call_count == 2

    # First call: timeout 60
    args1, kwargs1 = mock_parser.from_file.call_args_list[0]
    assert kwargs1["requestOptions"]["timeout"] == 60

    # Second call: timeout 120
    args2, kwargs2 = mock_parser.from_file.call_args_list[1]
    assert kwargs2["requestOptions"]["timeout"] == 120


@patch("tika.parser")
@patch("tika.detector")
def test_extract_all_retries_fail_supported(mock_detector, mock_parser, tika_strategy):
    # Supported file type
    mock_detector.from_file.return_value = "application/pdf"

    # All attempts fail
    mock_parser.from_file.return_value = None

    with pytest.raises(ExtractionFallbackNotAllowed):
        tika_strategy.extract("test.pdf")

    # Verify all 3 attempts were made
    assert mock_parser.from_file.call_count == 3

    timeouts = [call[1]["requestOptions"]["timeout"] for call in mock_parser.from_file.call_args_list]
    assert timeouts == [60, 120, 240]


@patch("tika.parser")
@patch("tika.detector")
def test_extract_retries_fail_unsupported(mock_detector, mock_parser, tika_strategy):
    # Unsupported/Unknown file type
    mock_detector.from_file.return_value = "application/octet-stream"

    # All attempts fail with generic error
    mock_parser.from_file.side_effect = Exception("Generic error")

    # Should raise the generic exception, NOT ExtractionFallbackNotAllowed
    with pytest.raises(Exception, match="Generic error"):
        tika_strategy.extract("test.pdf")


def test_fallback_prevention():
    # Mock strategy that raises ExtractionFallbackNotAllowed
    strategy1 = MagicMock()
    strategy1.can_extract.return_value = True
    strategy1.extract.side_effect = ExtractionFallbackNotAllowed("No fallback")

    strategy2 = MagicMock()
    strategy2.can_extract.return_value = True

    extractor = ContentExtractor([strategy1, strategy2])

    # mocked os.path.exists
    with patch("os.path.exists", return_value=True):
        with pytest.raises(ExtractionFallbackNotAllowed):
            extractor.extract("test.pdf")

    # Verify strategy2 was NOT called
    strategy2.extract.assert_not_called()


def test_normal_fallback():
    # Mock strategy that raises normal Exception
    strategy1 = MagicMock()
    strategy1.can_extract.return_value = True
    strategy1.extract.side_effect = Exception("Normal failure")

    strategy2 = MagicMock()
    strategy2.can_extract.return_value = True
    # Return a proper DocumentContent object
    expected_content = DocumentContent(content="success", metadata={})
    strategy2.extract.return_value = expected_content

    extractor = ContentExtractor([strategy1, strategy2])

    with patch("os.path.exists", return_value=True):
        result = extractor.extract("test.pdf")

    # Verify strategy2 WAS called
    strategy2.extract.assert_called()
    assert result == expected_content
