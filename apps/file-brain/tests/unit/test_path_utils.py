"""
Unit tests for path filtering utilities.
"""

from file_brain.services.crawler.path_utils import PathFilter


def test_is_excluded_exact_match():
    """Exact path match is excluded."""
    filter = PathFilter(
        included_paths=["/home/user/docs"],
        excluded_paths=["/home/user/docs/private"],
    )
    assert filter.is_excluded("/home/user/docs/private") is True


def test_is_excluded_nested_path():
    """Paths nested under excluded are excluded."""
    filter = PathFilter(
        included_paths=["/home/user/docs"],
        excluded_paths=["/home/user/docs/private"],
    )
    assert filter.is_excluded("/home/user/docs/private/secret.txt") is True


def test_is_excluded_unrelated_path():
    """Unrelated paths are not excluded."""
    filter = PathFilter(
        included_paths=["/home/user/docs"],
        excluded_paths=["/home/user/docs/private"],
    )
    assert filter.is_excluded("/home/user/docs/public") is False


def test_is_inside_included_direct():
    """Direct child of included path is valid."""
    filter = PathFilter(
        included_paths=["/home/user/docs"],
        excluded_paths=[],
    )
    assert filter.is_inside_included("/home/user/docs/file.txt") is True


def test_is_inside_included_nested():
    """Deeply nested path is valid."""
    filter = PathFilter(
        included_paths=["/home/user/docs"],
        excluded_paths=[],
    )
    assert filter.is_inside_included("/home/user/docs/sub/deep/file.txt") is True


def test_is_inside_included_outside():
    """Path outside included is invalid."""
    filter = PathFilter(
        included_paths=["/home/user/docs"],
        excluded_paths=[],
    )
    assert filter.is_inside_included("/home/user/downloads/file.txt") is False


def test_is_valid_path_included_not_excluded():
    """Valid: inside included, not excluded."""
    filter = PathFilter(
        included_paths=["/home/user/docs"],
        excluded_paths=["/home/user/docs/private"],
    )
    assert filter.is_valid_path("/home/user/docs/public/file.txt") is True


def test_is_valid_path_excluded_takes_precedence():
    """Excluded wins over included."""
    filter = PathFilter(
        included_paths=["/home/user/docs"],
        excluded_paths=["/home/user/docs/private"],
    )
    assert filter.is_valid_path("/home/user/docs/private/file.txt") is False


def test_should_prune_directory():
    """Directory pruning works correctly."""
    filter = PathFilter(
        included_paths=["/home/user/docs"],
        excluded_paths=["/home/user/docs/private"],
    )
    assert filter.should_prune_directory("/home/user/docs/private") is True
    assert filter.should_prune_directory("/home/user/docs/public") is False
