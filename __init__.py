import logging
import os
import ssl
import tempfile
import threading
import time
import urllib.parse
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Callable

from aiohttp import web

import folder_paths
from server import PromptServer

WEB_DIRECTORY = "./web"
HOT_RELOAD_ENV_VAR = "COMFYUI_DTD_HOT_RELOAD"

# No node classes; this extension only exposes backend + frontend utilities.
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
DOWNLOAD_JOBS: dict[str, dict] = {}
DOWNLOAD_JOBS_LOCK = threading.Lock()


def _is_hot_reload_enabled() -> bool:
    value = os.environ.get(HOT_RELOAD_ENV_VAR, "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _compute_web_change_stamp() -> float:
    web_dir = Path(__file__).resolve().parent / "web"
    if not web_dir.is_dir():
        return 0.0

    newest_mtime = 0.0
    for path in web_dir.rglob("*"):
        if not path.is_file():
            continue
        if any(part.startswith(".") for part in path.parts):
            continue
        try:
            newest_mtime = max(newest_mtime, path.stat().st_mtime)
        except OSError:
            # Ignore races while files are being edited.
            continue
    return newest_mtime

def _iter_subdirectories(base_path: str) -> list[str]:
    if not os.path.isdir(base_path):
        return []

    discovered: list[str] = []
    for dirpath, dirnames, _filenames in os.walk(base_path, topdown=True):
        # Skip hidden/cache folders to keep the UI list useful.
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "__pycache__"]
        dirnames.sort(key=str.lower)
        for dirname in dirnames:
            discovered.append(os.path.abspath(os.path.join(dirpath, dirname)))

    discovered.sort(key=str.lower)
    return discovered


def _add_subroots(roots: dict[str, str], key_prefix: str, base_path: str) -> None:
    abs_base = os.path.abspath(base_path)
    roots[key_prefix] = abs_base
    for subdir_path in _iter_subdirectories(abs_base):
        rel = os.path.relpath(subdir_path, abs_base).replace(os.sep, "/")
        roots[f"{key_prefix}/{rel}"] = subdir_path


def _build_root_map() -> dict[str, str]:
    roots: dict[str, str] = {
        "input": os.path.abspath(folder_paths.get_input_directory()),
        "output": os.path.abspath(folder_paths.get_output_directory()),
        "user": os.path.abspath(folder_paths.get_user_directory()),
        "comfy_root": os.path.abspath(folder_paths.base_path),
    }

    _add_subroots(roots, "models", folder_paths.models_dir)

    for index, custom_nodes_dir in enumerate(folder_paths.get_folder_paths("custom_nodes")):
        key_prefix = "custom_nodes" if index == 0 else f"custom_nodes_{index + 1}"
        roots[key_prefix] = os.path.abspath(custom_nodes_dir)

    # Add a dedicated download area under the user directory for a safe default.
    user_downloads = os.path.join(roots["user"], "downloads")
    os.makedirs(user_downloads, exist_ok=True)
    roots["user_downloads"] = os.path.abspath(user_downloads)
    return roots


def _is_within_root(candidate_path: str, root_path: str) -> bool:
    candidate = os.path.abspath(candidate_path)
    root = os.path.abspath(root_path)
    try:
        return os.path.commonpath([candidate, root]) == root
    except ValueError:
        return False


def _safe_path_from_root(root_path: str, relative_path: str) -> str:
    target = os.path.abspath(os.path.join(root_path, relative_path))
    if not _is_within_root(target, root_path):
        raise web.HTTPBadRequest(reason="Requested path escapes the selected root directory")
    return target


def _is_within_any_root(candidate_path: str, allowed_roots: list[str]) -> bool:
    return any(_is_within_root(candidate_path, root) for root in allowed_roots)


def _sanitize_filename(name: str) -> str:
    cleaned = name.replace("\\", "/").split("/")[-1].strip()
    if not cleaned or cleaned in {".", ".."}:
        raise web.HTTPBadRequest(reason="Invalid filename")
    return cleaned


def _filename_from_url(download_url: str) -> str:
    parsed = urllib.parse.urlparse(download_url)
    inferred = Path(parsed.path).name
    if not inferred:
        raise web.HTTPBadRequest(reason="Unable to infer filename from URL; provide filename explicitly")
    return _sanitize_filename(inferred)


def _validate_remote_url(download_url: str) -> urllib.parse.ParseResult:
    parsed = urllib.parse.urlparse(download_url)
    if parsed.scheme not in {"http", "https"}:
        raise web.HTTPBadRequest(reason="Only http/https URLs are supported")
    if not parsed.netloc:
        raise web.HTTPBadRequest(reason="Invalid URL")
    return parsed


def _normalize_download_url(download_url: str) -> str:
    parsed = urllib.parse.urlparse(download_url)
    host = (parsed.hostname or "").lower()

    # Convert GitHub blob links to raw content links.
    # Example:
    # https://github.com/org/repo/blob/main/path/file.yaml
    # -> https://raw.githubusercontent.com/org/repo/main/path/file.yaml
    if host in {"github.com", "www.github.com"}:
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 5 and parts[2] == "blob":
            owner, repo, _, ref, *rest = parts
            raw_path = "/".join([owner, repo, ref, *rest])
            return urllib.parse.urlunparse(
                ("https", "raw.githubusercontent.com", f"/{raw_path}", "", "", "")
            )

    # Convert Hugging Face blob links to direct resolve links.
    # Example:
    # https://huggingface.co/org/repo/blob/main/model.safetensors
    # -> https://huggingface.co/org/repo/resolve/main/model.safetensors?download=true
    if host in {"huggingface.co", "www.huggingface.co"}:
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 5 and parts[2] == "blob":
            owner, repo, _, ref, *rest = parts
            resolve_path = "/".join([owner, repo, "resolve", ref, *rest])
            query = "download=true"
            return urllib.parse.urlunparse(
                ("https", "huggingface.co", f"/{resolve_path}", "", query, "")
            )

    return download_url


def _open_url_with_ssl_fallback(req: urllib.request.Request, timeout: int = 45):
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.URLError as exc:
        if not isinstance(exc.reason, ssl.SSLCertVerificationError):
            raise

        try:
            import certifi  # type: ignore
        except ImportError as import_err:
            raise web.HTTPBadRequest(
                reason=(
                    "TLS certificate verification failed and certifi is not installed. "
                    "Install certifi in this Python environment or run your Python "
                    "certificate setup, then retry."
                )
            ) from import_err

        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        return urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx)


def _download_file(
    download_url: str,
    destination_path: str,
    huggingface_token: str = "",
    progress_callback: Callable[[int, int | None], None] | None = None,
) -> tuple[int, int | None]:
    parsed_url = urllib.parse.urlparse(download_url)
    host = (parsed_url.hostname or "").lower()
    headers = {
        "User-Agent": "ComfyUI-DirectoryDownloader/1.0",
    }
    # Allow authenticated downloads for gated HF models when users provide a token.
    if (
        huggingface_token
        and host in {"huggingface.co", "www.huggingface.co", "hf.co"}
    ):
        headers["Authorization"] = f"Bearer {huggingface_token}"

    req = urllib.request.Request(
        download_url,
        headers=headers,
    )

    bytes_written = 0
    tmp_file_path = ""
    target_dir = os.path.dirname(destination_path)

    try:
        with _open_url_with_ssl_fallback(req, timeout=45) as response:
            if response.status >= 400:
                raise web.HTTPBadRequest(reason=f"Download failed with status {response.status}")
            total_bytes = None
            content_length = response.headers.get("Content-Length")
            if content_length:
                try:
                    parsed_length = int(content_length)
                    if parsed_length >= 0:
                        total_bytes = parsed_length
                except ValueError:
                    total_bytes = None

            if progress_callback is not None:
                progress_callback(0, total_bytes)

            with tempfile.NamedTemporaryFile(
                mode="wb",
                suffix=".part",
                prefix="download_",
                dir=target_dir,
                delete=False,
            ) as tmp:
                tmp_file_path = tmp.name
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    tmp.write(chunk)
                    bytes_written += len(chunk)
                    if progress_callback is not None:
                        progress_callback(bytes_written, total_bytes)

        os.replace(tmp_file_path, destination_path)
        return bytes_written, total_bytes
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            raise web.HTTPBadRequest(
                reason=(
                    f"Download blocked by remote host (HTTP {exc.code}). "
                    "Authentication or access approval may be required."
                )
            ) from exc
        raise web.HTTPBadRequest(
            reason=f"Download failed with HTTP {exc.code} ({exc.reason})"
        ) from exc
    except Exception:
        if tmp_file_path and os.path.exists(tmp_file_path):
            try:
                os.remove(tmp_file_path)
            except OSError:
                logging.warning("Failed to clean temporary download file: %s", tmp_file_path)
        raise


def _prepare_download_request(body: dict) -> dict:
    download_url = str(body.get("url", "")).strip()
    root_key = str(body.get("root_key", "")).strip()
    folder = str(body.get("folder", "")).strip()
    subdirectory = str(body.get("subdirectory", "")).strip()
    filename = str(body.get("filename", "")).strip()
    overwrite = bool(body.get("overwrite", False))
    huggingface_token = str(
        body.get("huggingface_token", body.get("hf_token", ""))
    ).strip()

    if not download_url:
        raise web.HTTPBadRequest(reason="Missing required field: url")

    roots = _build_root_map()
    if folder:
        root_key = "comfy_root"
        # Treat typed folder as relative to ComfyUI root.
        subdirectory = folder.replace("\\", "/").lstrip("/")

    if root_key not in roots:
        raise web.HTTPBadRequest(reason="Invalid root_key")

    download_url = _normalize_download_url(download_url)
    _validate_remote_url(download_url)

    root_path = roots[root_key]

    if subdirectory:
        target_dir = _safe_path_from_root(root_path, subdirectory)
    else:
        target_dir = root_path

    os.makedirs(target_dir, exist_ok=True)

    if filename:
        safe_filename = _sanitize_filename(filename)
    else:
        safe_filename = _filename_from_url(download_url)

    destination_path = _safe_path_from_root(target_dir, safe_filename)

    if os.path.exists(destination_path) and not overwrite:
        raise web.HTTPConflict(reason="Destination file already exists; set overwrite=true to replace it")

    return {
        "download_url": download_url,
        "root_key": root_key,
        "destination_path": destination_path,
        "huggingface_token": huggingface_token,
    }


def _resolve_deletable_path(path_value: str, roots: dict[str, str]) -> str:
    candidate = str(path_value or "").strip()
    if not candidate:
        raise web.HTTPBadRequest(reason="Missing required field: path")

    delete_path = os.path.abspath(candidate)
    allowed_roots = [path for path in roots.values() if path]
    if not _is_within_any_root(delete_path, allowed_roots):
        raise web.HTTPBadRequest(reason="Requested path is outside allowed ComfyUI roots")
    if os.path.isdir(delete_path):
        raise web.HTTPBadRequest(reason="Path points to a directory; only files can be deleted")
    return delete_path


def _prune_old_jobs() -> None:
    now = time.time()
    with DOWNLOAD_JOBS_LOCK:
        stale_job_ids = [
            job_id
            for job_id, job in DOWNLOAD_JOBS.items()
            if job.get("status") in {"completed", "failed"} and now - float(job.get("updated_at", now)) > 3600
        ]
        for job_id in stale_job_ids:
            DOWNLOAD_JOBS.pop(job_id, None)


def _run_download_job(
    job_id: str,
    download_url: str,
    destination_path: str,
    root_key: str,
    huggingface_token: str,
) -> None:
    def on_progress(bytes_written: int, total_bytes: int | None) -> None:
        with DOWNLOAD_JOBS_LOCK:
            job = DOWNLOAD_JOBS.get(job_id)
            if not job:
                return
            job["status"] = "running"
            job["bytes_written"] = int(bytes_written)
            job["total_bytes"] = int(total_bytes) if total_bytes is not None else None
            job["updated_at"] = time.time()

    try:
        bytes_written, total_bytes = _download_file(
            download_url,
            destination_path,
            huggingface_token=huggingface_token,
            progress_callback=on_progress,
        )
        with DOWNLOAD_JOBS_LOCK:
            job = DOWNLOAD_JOBS.get(job_id)
            if not job:
                return
            job["status"] = "completed"
            job["bytes_written"] = int(bytes_written)
            job["total_bytes"] = int(total_bytes) if total_bytes is not None else None
            job["destination_path"] = destination_path
            job["root_key"] = root_key
            job["error"] = ""
            job["updated_at"] = time.time()
    except web.HTTPException as exc:
        with DOWNLOAD_JOBS_LOCK:
            job = DOWNLOAD_JOBS.get(job_id)
            if not job:
                return
            job["status"] = "failed"
            job["error"] = str(exc.reason or exc.text or "Download failed")
            job["updated_at"] = time.time()
    except Exception as exc:
        logging.exception("download-to-dir async failed")
        with DOWNLOAD_JOBS_LOCK:
            job = DOWNLOAD_JOBS.get(job_id)
            if not job:
                return
            job["status"] = "failed"
            job["error"] = str(exc)
            job["updated_at"] = time.time()


@PromptServer.instance.routes.get("/download-to-dir/roots")
async def list_download_roots(request: web.Request) -> web.Response:
    roots = _build_root_map()
    # Do not expose Comfy root as a direct selectable root in public UI.
    payload = [{"key": key, "path": path} for key, path in roots.items() if key != "comfy_root"]
    return web.json_response({"roots": payload})


@PromptServer.instance.routes.get("/download-to-dir/dev/web-change-stamp")
async def get_web_change_stamp(_request: web.Request) -> web.Response:
    if not _is_hot_reload_enabled():
        return web.json_response({"enabled": False, "stamp": 0})
    return web.json_response({"enabled": True, "stamp": _compute_web_change_stamp()})


@PromptServer.instance.routes.post("/download-to-dir/start")
async def start_download_to_directory(request: web.Request) -> web.Response:
    body = await request.json()
    prepared = _prepare_download_request(body)

    job_id = uuid.uuid4().hex
    now = time.time()
    with DOWNLOAD_JOBS_LOCK:
        DOWNLOAD_JOBS[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "bytes_written": 0,
            "total_bytes": None,
            "destination_path": prepared["destination_path"],
            "root_key": prepared["root_key"],
            "error": "",
            "updated_at": now,
            "started_at": now,
        }

    threading.Thread(
        target=_run_download_job,
        args=(
            job_id,
            prepared["download_url"],
            prepared["destination_path"],
            prepared["root_key"],
            prepared["huggingface_token"],
        ),
        daemon=True,
    ).start()
    _prune_old_jobs()

    return web.json_response(
        {
            "ok": True,
            "job_id": job_id,
            "destination_path": prepared["destination_path"],
            "root_key": prepared["root_key"],
        }
    )


@PromptServer.instance.routes.get("/download-to-dir/progress/{job_id}")
async def get_download_progress(request: web.Request) -> web.Response:
    job_id = request.match_info.get("job_id", "").strip()
    with DOWNLOAD_JOBS_LOCK:
        job = DOWNLOAD_JOBS.get(job_id)
        if not job:
            raise web.HTTPNotFound(reason="Download job not found")
        payload = dict(job)

    total_bytes = payload.get("total_bytes")
    bytes_written = int(payload.get("bytes_written", 0))
    if isinstance(total_bytes, int) and total_bytes > 0:
        payload["progress_percent"] = min(100.0, max(0.0, (bytes_written / total_bytes) * 100.0))
    else:
        payload["progress_percent"] = None

    return web.json_response(payload)


@PromptServer.instance.routes.post("/download-to-dir/delete")
async def delete_downloaded_file(request: web.Request) -> web.Response:
    body = await request.json()
    roots = _build_root_map()
    delete_path = _resolve_deletable_path(body.get("path", ""), roots)

    deleted = False
    try:
        if os.path.exists(delete_path):
            os.remove(delete_path)
            deleted = True
    except FileNotFoundError:
        deleted = False
    except OSError as exc:
        raise web.HTTPInternalServerError(reason=f"Failed to delete file: {exc}")

    return web.json_response({"ok": True, "deleted": deleted, "path": delete_path})
