"""
Unit tests for SystemThumbnailService.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

from file_brain.services.thumbnail import SystemThumbnailService


def test_get_thumbnail_returns_none_for_nonexistent_file(tmp_path):
    """get_thumbnail returns None when file doesn't exist."""
    nonexistent_file = str(tmp_path / "nonexistent.txt")

    result = SystemThumbnailService.get_thumbnail(nonexistent_file, 300)

    assert result is None


@patch("file_brain.services.thumbnail.platform.system")
def test_get_thumbnail_returns_none_for_unsupported_os(mock_system, tmp_path):
    """get_thumbnail returns None for unsupported operating systems."""
    mock_system.return_value = "FreeBSD"  # Unsupported OS
    test_file = tmp_path / "test.txt"
    test_file.write_text("test content")

    result = SystemThumbnailService.get_thumbnail(str(test_file), 300)

    assert result is None


@patch("file_brain.services.thumbnail.platform.system")
@patch("file_brain.services.thumbnail.SystemThumbnailService._get_linux_thumbnail")
def test_get_thumbnail_calls_linux_method_on_linux(mock_linux_method, mock_system, tmp_path):
    """get_thumbnail calls Linux method when on Linux."""
    mock_system.return_value = "Linux"
    mock_linux_method.return_value = b"fake_thumbnail_data"
    test_file = tmp_path / "test.txt"
    test_file.write_text("test content")

    result = SystemThumbnailService.get_thumbnail(str(test_file), 300)

    mock_linux_method.assert_called_once_with(str(test_file), 300)
    assert result == b"fake_thumbnail_data"


@patch("file_brain.services.thumbnail.platform.system")
@patch("file_brain.services.thumbnail.SystemThumbnailService._get_windows_thumbnail")
def test_get_thumbnail_calls_windows_method_on_windows(mock_windows_method, mock_system, tmp_path):
    """get_thumbnail calls Windows method when on Windows."""
    mock_system.return_value = "Windows"
    mock_windows_method.return_value = b"fake_thumbnail_data"
    test_file = tmp_path / "test.txt"
    test_file.write_text("test content")

    result = SystemThumbnailService.get_thumbnail(str(test_file), 300)

    mock_windows_method.assert_called_once_with(str(test_file), 300)
    assert result == b"fake_thumbnail_data"


@patch("file_brain.services.thumbnail.platform.system")
@patch("file_brain.services.thumbnail.SystemThumbnailService._get_macos_thumbnail")
def test_get_thumbnail_calls_macos_method_on_macos(mock_macos_method, mock_system, tmp_path):
    """get_thumbnail calls macOS method when on macOS."""
    mock_system.return_value = "Darwin"
    mock_macos_method.return_value = b"fake_thumbnail_data"
    test_file = tmp_path / "test.txt"
    test_file.write_text("test content")

    result = SystemThumbnailService.get_thumbnail(str(test_file), 300)

    mock_macos_method.assert_called_once_with(str(test_file), 300)
    assert result == b"fake_thumbnail_data"


@patch("file_brain.services.thumbnail.hashlib.md5")
@patch("file_brain.services.thumbnail.os.path.getmtime")
def test_linux_thumbnail_returns_none_when_thumbnail_not_found(mock_getmtime, mock_md5, tmp_path):
    """Linux thumbnail method returns None when thumbnail doesn't exist."""
    test_file = tmp_path / "test.txt"
    test_file.write_text("test content")

    # Mock MD5 hash
    mock_hash = MagicMock()
    mock_hash.hexdigest.return_value = "nonexistent_hash"
    mock_md5.return_value = mock_hash

    result = SystemThumbnailService._get_linux_thumbnail(str(test_file), 300)

    assert result is None


@patch("file_brain.services.thumbnail.hashlib.md5")
@patch("file_brain.services.thumbnail.os.path.getmtime")
def test_linux_thumbnail_returns_none_when_thumbnail_is_stale(mock_getmtime, mock_md5, tmp_path):
    """Linux thumbnail method returns None when thumbnail is older than file."""
    test_file = tmp_path / "test.txt"
    test_file.write_text("test content")

    # Create a fake thumbnail file
    thumbnail_dir = Path.home() / ".cache" / "thumbnails" / "normal"
    thumbnail_dir.mkdir(parents=True, exist_ok=True)
    thumbnail_file = thumbnail_dir / "test_hash.png"
    thumbnail_file.write_bytes(b"fake_thumbnail")

    # Mock MD5 to return our test hash
    mock_hash = MagicMock()
    mock_hash.hexdigest.return_value = "test_hash"
    mock_md5.return_value = mock_hash

    # Mock file mtime to be newer than thumbnail
    mock_getmtime.side_effect = lambda path: 1000 if str(path) == str(test_file) else 500

    result = SystemThumbnailService._get_linux_thumbnail(str(test_file), 300)

    # Cleanup
    thumbnail_file.unlink()

    assert result is None


@patch("file_brain.services.thumbnail.subprocess.run")
def test_macos_thumbnail_returns_none_when_qlmanage_fails(mock_run, tmp_path):
    """macOS thumbnail method returns None when qlmanage fails."""
    test_file = tmp_path / "test.txt"
    test_file.write_text("test content")

    # Mock qlmanage failure
    mock_run.return_value = MagicMock(returncode=1, stderr=b"Error")

    result = SystemThumbnailService._get_macos_thumbnail(str(test_file), 300)

    assert result is None


@patch("file_brain.services.thumbnail.subprocess.run")
def test_macos_thumbnail_returns_none_when_qlmanage_times_out(mock_run, tmp_path):
    """macOS thumbnail method returns None when qlmanage times out."""
    test_file = tmp_path / "test.txt"
    test_file.write_text("test content")

    # Mock qlmanage timeout
    import subprocess

    mock_run.side_effect = subprocess.TimeoutExpired("qlmanage", 5)

    result = SystemThumbnailService._get_macos_thumbnail(str(test_file), 300)

    assert result is None


def test_windows_thumbnail_handles_import_error_gracefully(tmp_path):
    """Windows thumbnail method returns None when dependencies are unavailable (e.g., on Linux)."""
    test_file = tmp_path / "test.txt"
    test_file.write_text("test content")

    # On Linux, windll won't be available, so this should return None
    result = SystemThumbnailService._get_windows_thumbnail(str(test_file), 300)

    assert result is None
