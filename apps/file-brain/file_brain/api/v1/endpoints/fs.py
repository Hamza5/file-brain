from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from file_brain.core.paths import app_paths

router = APIRouter(prefix="/fs", tags=["filesystem"])


class FsRoot(BaseModel):
    name: str
    path: str
    type: str = "directory"
    isDefault: bool = False
    icon: str | None = None


class FsEntry(BaseModel):
    name: str
    path: str
    type: str = "directory"
    has_children: bool


def _is_windows() -> bool:
    return os.name == "nt" or sys.platform.startswith("win")


def _get_home_dir() -> Path | None:
    try:
        home = Path.home()
    except Exception:
        return None
    if home.exists() and home.is_dir():
        return home
    return None


def _list_windows_drives() -> List[Path]:
    drives: List[Path] = []
    # Simple, robust drive detection: check A:..Z:
    for letter in map(chr, range(ord("A"), ord("Z") + 1)):
        root = Path(f"{letter}:/")
        if root.exists():
            drives.append(root)
    return drives


@router.get("/roots", response_model=list[FsRoot])
def get_roots() -> list[FsRoot]:
    """
    Return filesystem roots for folder selection.

    Rules:
    - Always include user home directory if resolvable, mark as isDefault=true.
    - On Windows, include all detected drives (C:\\, D:\\, ...).
    - On POSIX, include "/" as an additional root.
    """
    roots: list[FsRoot] = []

    home = _get_home_dir()
    if home is not None:
        roots.append(
            FsRoot(
                name="Home",
                path=str(home),
                isDefault=True,
                icon="fa-home",
            )
        )

    # Add user media directories with icons
    media_dirs = [
        ("Documents", app_paths.user_documents_dir, "fa-file-lines"),
        ("Downloads", app_paths.user_downloads_dir, "fa-download"),
        ("Music", app_paths.user_music_dir, "fa-music"),
        ("Pictures", app_paths.user_pictures_dir, "fa-image"),
        ("Videos", app_paths.user_videos_dir, "fa-film"),
    ]

    for name, path_obj, icon in media_dirs:
        try:
            if path_obj.exists():
                path_str = str(path_obj)
                # Avoid duplicates
                if not any(r.path == path_str for r in roots):
                    roots.append(
                        FsRoot(
                            name=name,
                            path=path_str,
                            icon=icon,
                        )
                    )
        except Exception:
            # Platformdirs might return non-existent paths on some systems or error out
            continue

    if _is_windows():
        drives = _list_windows_drives()
        for drive in drives:
            path_str = str(drive)
            # Avoid duplicating Home if it already points to one of these paths
            if not any(r.path == path_str for r in roots):
                roots.append(
                    FsRoot(
                        name=path_str,
                        path=path_str,
                        icon="fa-hdd",
                    )
                )
    else:
        # POSIX: add '/' as generic root if not already home
        root_path = Path("/")
        if not any(r.path == str(root_path) for r in roots):
            roots.append(
                FsRoot(
                    name="/",
                    path=str(root_path),
                    icon="fa-hdd",
                )
            )

    # Fallback: if for some reason nothing detected, use '/'
    if not roots:
        roots.append(
            FsRoot(
                name="/",
                path="/",
                isDefault=True,
                icon="fa-hdd",
            )
        )

    return roots


def _dir_has_children(path: Path) -> bool:
    try:
        with os.scandir(path) as it:
            for _ in it:
                # We only care that something exists (file or dir). Presence is enough.
                return True
    except (PermissionError, FileNotFoundError, NotADirectoryError):
        return False
    return False


@router.get("/list", response_model=list[FsEntry])
def list_directory(
    path: str = Query(..., description="Absolute directory path to list"),
) -> list[FsEntry]:
    """
    List directories under the given path.

    - Directories only (files are never returned).
    - Each entry includes has_children (best-effort).
    """
    # Normalize and validate
    try:
        p = Path(path).expanduser()
        # For safety, resolve where possible but tolerate nonexistent segments
        # when they are user typos (we then error below).
        p = p.resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not p.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if not p.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    entries: list[FsEntry] = []
    try:
        with os.scandir(p) as it:
            for entry in it:
                try:
                    # Only expose directories; hide files completely
                    if entry.is_dir(follow_symlinks=False):
                        child_path = Path(entry.path)
                        has_children = _dir_has_children(child_path)
                        entries.append(
                            FsEntry(
                                name=entry.name,
                                path=str(child_path),
                                has_children=has_children,
                            )
                        )
                except (PermissionError, FileNotFoundError, NotADirectoryError):
                    # Skip entries we cannot stat or that disappeared
                    continue
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Path not found")

    # Sort directories alphabetically for a stable UI
    entries.sort(key=lambda e: e.name.lower())

    return entries
