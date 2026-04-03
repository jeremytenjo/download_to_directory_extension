import importlib
from pathlib import Path
import sys
import types

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


def test_prepare_download_request_folder_restricted_to_models_and_custom_nodes(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
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
    monkeypatch.setattr(dtd, "_host_is_private", lambda _hostname: False)

    with pytest.raises(web.HTTPBadRequest):
        dtd._prepare_download_request(
            {
                "url": "https://example.com/file.safetensors",
                "folder": "app/config",
                "overwrite": True,
            }
        )

    prepared = dtd._prepare_download_request(
        {
            "url": "https://example.com/model.safetensors",
            "folder": "models/checkpoints",
            "overwrite": True,
        }
    )
    assert prepared["root_key"] == "comfy_root"
    assert prepared["destination_path"].startswith(str(models_dir))
