import ipaddress
import logging
import os
import socket
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from aiohttp import web

import folder_paths
from server import PromptServer

WEB_DIRECTORY = "./web"

# No node classes; this extension only exposes backend + frontend utilities.
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}


def _build_root_map() -> dict[str, str]:
    roots: dict[str, str] = {
        "input": os.path.abspath(folder_paths.get_input_directory()),
        "output": os.path.abspath(folder_paths.get_output_directory()),
        "models": os.path.abspath(folder_paths.models_dir),
        "user": os.path.abspath(folder_paths.get_user_directory()),
    }

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


def _host_is_private(hostname: str) -> bool:
    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return True

    for info in addr_infos:
        ip_str = info[4][0]
        ip = ipaddress.ip_address(ip_str)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return True

    return False


def _download_file(download_url: str, destination_path: str) -> int:
    req = urllib.request.Request(
        download_url,
        headers={
            "User-Agent": "ComfyUI-DirectoryDownloader/1.0",
        },
    )

    bytes_written = 0
    tmp_file_path = ""
    target_dir = os.path.dirname(destination_path)

    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            if response.status >= 400:
                raise web.HTTPBadRequest(reason=f"Download failed with status {response.status}")

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

        os.replace(tmp_file_path, destination_path)
        return bytes_written
    except Exception:
        if tmp_file_path and os.path.exists(tmp_file_path):
            try:
                os.remove(tmp_file_path)
            except OSError:
                logging.warning("Failed to clean temporary download file: %s", tmp_file_path)
        raise


@PromptServer.instance.routes.get("/download-to-dir/roots")
async def list_download_roots(request: web.Request) -> web.Response:
    roots = _build_root_map()
    payload = [{"key": key, "path": path} for key, path in roots.items()]
    return web.json_response({"roots": payload})


@PromptServer.instance.routes.post("/download-to-dir")
async def download_to_directory(request: web.Request) -> web.Response:
    body = await request.json()

    download_url = str(body.get("url", "")).strip()
    root_key = str(body.get("root_key", "")).strip()
    subdirectory = str(body.get("subdirectory", "")).strip()
    filename = str(body.get("filename", "")).strip()
    overwrite = bool(body.get("overwrite", False))
    allow_private_hosts = bool(body.get("allow_private_hosts", False))

    if not download_url:
        raise web.HTTPBadRequest(reason="Missing required field: url")

    roots = _build_root_map()
    if root_key not in roots:
        raise web.HTTPBadRequest(reason="Invalid root_key")

    parsed_url = _validate_remote_url(download_url)

    if not allow_private_hosts and parsed_url.hostname and _host_is_private(parsed_url.hostname):
        raise web.HTTPBadRequest(reason="Downloading from private or localhost addresses is blocked")

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

    try:
        bytes_written = _download_file(download_url, destination_path)
    except web.HTTPException:
        raise
    except Exception as exc:
        logging.exception("download-to-dir failed")
        raise web.HTTPInternalServerError(reason=f"Download failed: {exc}")

    return web.json_response(
        {
            "ok": True,
            "destination_path": destination_path,
            "bytes_written": bytes_written,
            "root_key": root_key,
        }
    )
