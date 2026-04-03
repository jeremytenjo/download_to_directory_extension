import importlib
import json
from pathlib import Path
import sys
import types
import asyncio

from aiohttp import web
import pytest

# Load the extension with a lightweight fake PromptServer so tests don't depend
# on the full ComfyUI server initialization chain.
fake_server = types.ModuleType("server")
fake_server.PromptServer = types.SimpleNamespace(
    instance=types.SimpleNamespace(routes=web.RouteTableDef())
)
sys.modules["server"] = fake_server

dtd = importlib.import_module("custom_nodes.download_to_directory_extension")


def test_normalize_download_url_github_blob():
    url = "https://github.com/org/repo/blob/main/path/file.yaml"
    normalized = dtd._normalize_download_url(url)
    assert normalized == "https://raw.githubusercontent.com/org/repo/main/path/file.yaml"


def test_safe_path_from_root_blocks_escape(tmp_path: Path):
    with pytest.raises(web.HTTPBadRequest):
        dtd._safe_path_from_root(str(tmp_path), "../outside.txt")


def test_prepare_download_request_allows_comfy_root_subfolders_and_localhost(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    comfy_root = tmp_path
    models_dir = comfy_root / "models"
    custom_nodes_dir = comfy_root / "custom_nodes"
    models_dir.mkdir(parents=True, exist_ok=True)
    custom_nodes_dir.mkdir(parents=True, exist_ok=True)

    roots = {
        "input": str(comfy_root / "input"),
        "output": str(comfy_root / "output"),
        "user": str(comfy_root / "user"),
        "comfy_root": str(comfy_root),
        "models": str(models_dir),
        "custom_nodes": str(custom_nodes_dir),
    }
    for path in roots.values():
        Path(path).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(dtd, "_build_root_map", lambda: roots)

    prepared = dtd._prepare_download_request(
        {
            "url": "http://127.0.0.1:8188/model.safetensors",
            "folder": "app/config",
            "overwrite": True,
        }
    )
    assert prepared["root_key"] == "comfy_root"
    assert prepared["destination_path"].startswith(str(comfy_root / "app" / "config"))


class _FakeRequest:
    def __init__(self, body: dict):
        self._body = body

    async def json(self) -> dict:
        return self._body


def test_delete_downloaded_file_deletes_and_is_idempotent(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    comfy_root = tmp_path / "comfy"
    user_dir = comfy_root / "user"
    user_dir.mkdir(parents=True, exist_ok=True)
    target_file = user_dir / "model.safetensors"
    target_file.write_text("content", encoding="utf-8")

    roots = {
        "input": str(comfy_root / "input"),
        "output": str(comfy_root / "output"),
        "user": str(user_dir),
        "comfy_root": str(comfy_root),
    }
    for path in roots.values():
        Path(path).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(dtd, "_build_root_map", lambda: roots)

    response = asyncio.run(
        dtd.delete_downloaded_file(_FakeRequest({"path": str(target_file)}))
    )
    payload = json.loads(response.text)
    assert payload["ok"] is True
    assert payload["deleted"] is True
    assert target_file.exists() is False

    response_again = asyncio.run(
        dtd.delete_downloaded_file(_FakeRequest({"path": str(target_file)}))
    )
    payload_again = json.loads(response_again.text)
    assert payload_again["ok"] is True
    assert payload_again["deleted"] is False


def test_delete_downloaded_file_rejects_path_outside_roots(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    comfy_root = tmp_path / "comfy"
    user_dir = comfy_root / "user"
    user_dir.mkdir(parents=True, exist_ok=True)

    roots = {
        "input": str(comfy_root / "input"),
        "output": str(comfy_root / "output"),
        "user": str(user_dir),
        "comfy_root": str(comfy_root),
    }
    for path in roots.values():
        Path(path).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(dtd, "_build_root_map", lambda: roots)

    with pytest.raises(web.HTTPBadRequest):
        asyncio.run(
            dtd.delete_downloaded_file(
                _FakeRequest({"path": str(tmp_path / "outside.bin")})
            )
        )
