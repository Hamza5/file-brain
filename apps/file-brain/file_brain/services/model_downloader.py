"""
Model Downloader Service - Downloads embedding models from HuggingFace for Typesense
"""

import shutil
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from file_brain.core.logging import logger

# Model configuration
HUGGINGFACE_REPO_ID = "typesense/models-moved"
MODEL_NAME = "paraphrase-multilingual-mpnet-base-v2"
TYPESENSE_MODEL_NAME = f"ts_{MODEL_NAME}"  # Typesense expects ts_ prefix

# Expected model files with sizes in bytes (for accurate progress)
MODEL_FILES = ["config.json", "model.onnx", "sentencepiece.bpe.model"]
MODEL_FILE_SIZES = {
    "config.json": 183,
    "model.onnx": 1_194_672_249,  # ~1.11 GB
    "sentencepiece.bpe.model": 5_313_626,  # ~5.07 MB
}
TOTAL_MODEL_SIZE = sum(MODEL_FILE_SIZES.values())


class ModelDownloader:
    """Service to download embedding models from HuggingFace"""

    def __init__(self, models_dir: Optional[Path] = None):
        """
        Initialize the model downloader.

        Args:
            models_dir: Path to the models directory. Defaults to ./typesense-data/models
        """
        if models_dir:
            self.models_dir = Path(models_dir)
        else:
            # Default to platform-specific app data directory
            from file_brain.core.paths import app_paths

            self.models_dir = app_paths.models_dir

    def get_model_path(self) -> Path:
        """Get the full path to the model directory"""
        return self.models_dir / TYPESENSE_MODEL_NAME

    def check_model_exists(self) -> Dict[str, Any]:
        """
        Check if the embedding model already exists.

        Returns:
            Dictionary with:
                - exists: bool - whether model is complete
                - path: str - path to model directory
                - files: list - list of found files
                - missing_files: list - list of missing files
        """
        model_path = self.get_model_path()

        if not model_path.exists():
            return {
                "exists": False,
                "path": str(model_path),
                "files": [],
                "missing_files": MODEL_FILES,
            }

        found_files = []
        missing_files = []

        for file_name in MODEL_FILES:
            file_path = model_path / file_name
            if file_path.exists():
                found_files.append(file_name)
            else:
                missing_files.append(file_name)

        return {
            "exists": len(missing_files) == 0,
            "path": str(model_path),
            "files": found_files,
            "missing_files": missing_files,
        }

    def download_model_with_progress(
        self,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> Dict[str, Any]:
        """
        Download the embedding model with detailed byte-level progress updates.

        Uses tqdm monkey-patching to capture download progress from huggingface_hub.

        Args:
            progress_callback: Callback function for progress updates.

        Returns:
            Dictionary with success status and details
        """
        import queue
        import threading
        import time

        from tqdm.auto import tqdm

        try:
            from huggingface_hub import hf_hub_download

            # Ensure models directory exists
            self.models_dir.mkdir(parents=True, exist_ok=True)
            model_path = self.get_model_path()
            model_path.mkdir(parents=True, exist_ok=True)

            # Thread-safe queue for progress updates
            progress_queue: queue.Queue = queue.Queue()
            download_complete = threading.Event()
            download_error: list = []

            # Track overall progress
            completed_files: list = []
            current_file = {"name": "", "size": 0}
            last_update_time = {"value": 0.0}

            # Save original tqdm.update method
            original_update = tqdm.update

            def patched_update(self, n=1):
                """Patched tqdm.update that sends progress to our queue"""
                result = original_update(self, n)

                # Only send updates if we have valid data and throttle to 0.5s
                now = time.time()
                if (
                    self.n is not None
                    and self.total is not None
                    and self.total > 0
                    and (now - last_update_time["value"] >= 0.5 or self.n >= self.total)
                ):
                    last_update_time["value"] = now

                    # Calculate completed bytes from previous files
                    completed_bytes = sum(MODEL_FILE_SIZES.get(f, 0) for f in completed_files)

                    # Add current file progress
                    total_downloaded = completed_bytes + self.n
                    overall_percent = min(99, int((total_downloaded / TOTAL_MODEL_SIZE) * 100))
                    file_percent = min(100, int((self.n / self.total) * 100))

                    progress_queue.put(
                        {
                            "status": "downloading",
                            "file": current_file["name"],
                            "file_percent": file_percent,
                            "file_downloaded": self.n,
                            "file_total": self.total,
                            "progress_percent": overall_percent,
                            "total_downloaded": total_downloaded,
                            "total_size": TOTAL_MODEL_SIZE,
                            "message": f"Downloading {current_file['name']}...",
                        }
                    )

                return result

            # Apply monkey patch
            tqdm.update = patched_update

            def download_thread():
                """Thread to perform downloads"""
                nonlocal download_error
                try:
                    for file_name in MODEL_FILES:
                        current_file["name"] = file_name
                        current_file["size"] = MODEL_FILE_SIZES.get(file_name, 0)

                        # Send starting message
                        progress_queue.put(
                            {
                                "status": "downloading",
                                "file": file_name,
                                "file_percent": 0,
                                "message": f"Starting download of {file_name}...",
                            }
                        )

                        file_path_in_repo = f"{MODEL_NAME}/{file_name}"

                        hf_hub_download(
                            repo_id=HUGGINGFACE_REPO_ID,
                            filename=file_path_in_repo,
                            local_dir=self.models_dir,
                            local_dir_use_symlinks=False,
                        )

                        # Mark file as completed
                        completed_files.append(file_name)

                        # Copy file to ts_ prefixed directory
                        source = self.models_dir / MODEL_NAME / file_name
                        target = model_path / file_name
                        if source.exists() and source != target:
                            shutil.copy2(source, target)

                        logger.info(f"Downloaded {file_name}")

                    # Cleanup temp folder
                    original_folder = self.models_dir / MODEL_NAME
                    if original_folder.exists() and original_folder != model_path:
                        shutil.rmtree(original_folder)

                    # Signal completion
                    progress_queue.put(
                        {
                            "status": "complete",
                            "message": "Model download complete!",
                            "progress_percent": 100,
                            "complete": True,
                        }
                    )

                except Exception as e:
                    download_error.append(str(e))
                    progress_queue.put({"status": "error", "error": str(e)})
                finally:
                    download_complete.set()
                    # Restore original tqdm.update
                    tqdm.update = original_update

            # Start download in background thread
            thread = threading.Thread(target=download_thread, daemon=True)
            thread.start()

            if progress_callback:
                progress_callback(
                    {
                        "status": "starting",
                        "message": f"Downloading {len(MODEL_FILES)} files ({TOTAL_MODEL_SIZE / (1024**3):.2f} GB)...",
                        "progress_percent": 0,
                        "total_size": TOTAL_MODEL_SIZE,
                    }
                )

            # Process progress updates from queue
            while not download_complete.is_set() or not progress_queue.empty():
                try:
                    # Non-blocking get with short timeout
                    data = progress_queue.get(timeout=0.1)
                    if progress_callback:
                        progress_callback(data)
                    if data.get("complete") or data.get("error"):
                        break
                except queue.Empty:
                    # Small delay to avoid busy-waiting
                    time.sleep(0.05)
                    continue

            # Wait for thread to finish
            thread.join(timeout=5.0)

            # Restore tqdm in case of any issues
            tqdm.update = original_update

            if download_error:
                return {"success": False, "error": download_error[0]}

            # Verify
            status = self.check_model_exists()
            if status["exists"]:
                return {
                    "success": True,
                    "message": f"Model downloaded successfully to {model_path}",
                    "path": str(model_path),
                }
            else:
                return {
                    "success": False,
                    "error": f"Download incomplete. Missing files: {status['missing_files']}",
                    "path": str(model_path),
                }

        except ImportError as e:
            error_msg = f"huggingface_hub not installed: {e}"
            logger.error(error_msg)
            if progress_callback:
                progress_callback({"status": "error", "error": error_msg})
            return {"success": False, "error": error_msg}

        except Exception as e:
            error_msg = f"Failed to download model: {e}"
            logger.error(error_msg, exc_info=True)
            if progress_callback:
                progress_callback({"status": "error", "error": error_msg})
            return {"success": False, "error": error_msg}


# Global instance
_downloader: Optional[ModelDownloader] = None


def get_model_downloader() -> ModelDownloader:
    """Get or create global ModelDownloader instance"""
    global _downloader
    if _downloader is None:
        _downloader = ModelDownloader()
    return _downloader
