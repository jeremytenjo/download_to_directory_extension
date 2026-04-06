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


def test_normalize_download_url_huggingface_blob():
    url = "https://huggingface.co/org/repo/blob/main/path/model.safetensors"
    normalized = dtd._normalize_download_url(url)
    assert (
        normalized
        == "https://huggingface.co/org/repo/resolve/main/path/model.safetensors?download=true"
    )


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
            "huggingface_token": "hf_test_token",
        }
    )
    assert prepared["root_key"] == "comfy_root"
    assert prepared["destination_path"].startswith(str(comfy_root / "app" / "config"))
    assert prepared["huggingface_token"] == "hf_test_token"
    assert prepared["mode"] == "download"


def test_prepare_download_request_uses_git_clone_for_custom_nodes_git_urls(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    comfy_root = tmp_path / "comfy"
    custom_nodes_dir = comfy_root / "custom_nodes"
    custom_nodes_dir.mkdir(parents=True, exist_ok=True)

    roots = {
        "input": str(comfy_root / "input"),
        "output": str(comfy_root / "output"),
        "user": str(comfy_root / "user"),
        "comfy_root": str(comfy_root),
        "custom_nodes": str(custom_nodes_dir),
    }
    for path in roots.values():
        Path(path).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(dtd, "_build_root_map", lambda: roots)
    monkeypatch.setattr(
        dtd.folder_paths,
        "get_folder_paths",
        lambda key: [str(custom_nodes_dir)] if key == "custom_nodes" else [],
    )

    prepared = dtd._prepare_download_request(
        {
            "url": "https://github.com/org/example-node.git",
            "root_key": "custom_nodes",
            "overwrite": False,
        }
    )
    assert prepared["mode"] == "git_clone"
    assert prepared["destination_path"] == str(custom_nodes_dir / "example-node")


def test_prepare_download_request_git_url_non_custom_nodes_stays_download(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    comfy_root = tmp_path / "comfy"
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
    monkeypatch.setattr(
        dtd.folder_paths,
        "get_folder_paths",
        lambda key: [str(custom_nodes_dir)] if key == "custom_nodes" else [],
    )

    prepared = dtd._prepare_download_request(
        {
            "url": "https://github.com/org/example-node.git",
            "root_key": "models",
            "overwrite": True,
        }
    )
    assert prepared["mode"] == "download"
    assert prepared["destination_path"].endswith("example-node.git")


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


def test_prepare_upload_request_uses_uploaded_filename(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    comfy_root = tmp_path / "comfy"
    models_dir = comfy_root / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    roots = {
        "input": str(comfy_root / "input"),
        "output": str(comfy_root / "output"),
        "user": str(comfy_root / "user"),
        "comfy_root": str(comfy_root),
        "models": str(models_dir),
    }
    for path in roots.values():
        Path(path).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(dtd, "_build_root_map", lambda: roots)

    prepared = dtd._prepare_upload_request(
        {
            "root_key": "models",
            "subdirectory": "loras",
            "overwrite": "false",
        },
        uploaded_filename="my-model.safetensors",
    )
    assert prepared["root_key"] == "models"
    assert prepared["destination_path"].endswith(
        str(Path("models") / "loras" / "my-model.safetensors")
    )


def test_prepare_upload_request_blocks_overwrite_by_default(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    comfy_root = tmp_path / "comfy"
    models_dir = comfy_root / "models"
    target_dir = models_dir / "loras"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = target_dir / "my-model.safetensors"
    target_file.write_text("existing", encoding="utf-8")

    roots = {
        "input": str(comfy_root / "input"),
        "output": str(comfy_root / "output"),
        "user": str(comfy_root / "user"),
        "comfy_root": str(comfy_root),
        "models": str(models_dir),
    }
    for path in roots.values():
        Path(path).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(dtd, "_build_root_map", lambda: roots)

    with pytest.raises(web.HTTPConflict):
        dtd._prepare_upload_request(
            {
                "root_key": "models",
                "subdirectory": "loras",
            },
            uploaded_filename="my-model.safetensors",
        )


def test_install_clone_requirements_if_present_skips_when_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls = []

    def _fake_run(*_args, **_kwargs):
        calls.append(1)
        return types.SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(dtd.os.path, "isfile", lambda _path: False)
    monkeypatch.setattr(dtd.subprocess, "run", _fake_run)

    dtd._install_clone_requirements_if_present(str(tmp_path))
    assert calls == []


def test_install_clone_requirements_if_present_runs_pip(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    captured = {}

    def _fake_run(cmd, **_kwargs):
        captured["cmd"] = cmd
        return types.SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(dtd.os.path, "isfile", lambda _path: True)
    monkeypatch.setattr(dtd.subprocess, "run", _fake_run)

    dtd._install_clone_requirements_if_present(str(tmp_path))
    assert captured["cmd"][0] == dtd.sys.executable
    assert captured["cmd"][1:4] == ["-m", "pip", "install"]
    assert captured["cmd"][4] == "-r"


def test_install_clone_requirements_if_present_raises_on_pip_failure(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def _fake_run(*_args, **_kwargs):
        return types.SimpleNamespace(
            returncode=1,
            stdout="",
            stderr="no matching distribution found",
        )

    monkeypatch.setattr(dtd.os.path, "isfile", lambda _path: True)
    monkeypatch.setattr(dtd.subprocess, "run", _fake_run)

    with pytest.raises(web.HTTPBadRequest):
        dtd._install_clone_requirements_if_present(str(tmp_path))


def test_install_clone_requirements_if_present_retries_with_python3_when_pip_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls = []

    def _fake_run(cmd, **_kwargs):
        calls.append(cmd[0])
        if cmd[0] == dtd.sys.executable:
            return types.SimpleNamespace(
                returncode=1,
                stdout="",
                stderr="No module named pip",
            )
        return types.SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(dtd.os.path, "isfile", lambda _path: True)
    monkeypatch.setattr(dtd.subprocess, "run", _fake_run)

    dtd._install_clone_requirements_if_present(str(tmp_path))
    assert calls == [dtd.sys.executable, "python3"]


def test_build_restart_command_module_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        dtd.sys,
        "argv",
        ["/tmp/ComfyUI/__main__.py", "--listen", "0.0.0.0"],
    )
    monkeypatch.setattr(dtd.sys, "executable", "/usr/bin/python3")

    cmd = dtd._build_restart_command()
    assert cmd == ["/usr/bin/python3", "-m", "ComfyUI", "--listen", "0.0.0.0"]


def test_build_restart_command_script_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        dtd.sys,
        "argv",
        ["main.py", "--port", "8188", "--windows-standalone-build"],
    )
    monkeypatch.setattr(dtd.sys, "executable", "/usr/bin/python3")

    cmd = dtd._build_restart_command()
    assert cmd == ["/usr/bin/python3", "main.py", "--port", "8188"]
