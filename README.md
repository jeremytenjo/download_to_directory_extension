# Download To Directory (ComfyUI extension)

Download files from HTTP/HTTPS URLs directly into selected ComfyUI folders, with progress tracking and safer path handling.

## Features
- Toolbar button + modal downloader UI.
- Async downloads with live progress.
- Human-friendly error messages.
- GitHub `blob` URL normalization to raw content URLs.
- Recent folders history (`optgroup` in destination selector).
- Optional typed folder input relative to ComfyUI root.

## Safety defaults
- Only `http` / `https` URLs are allowed.
- Private / localhost targets are blocked by default.
- Path traversal is blocked (`..` and escaping root).
- Typed ComfyUI-root folder writes are restricted to:
  - `models/...`
  - `custom_nodes/...`

To allow broader writes under ComfyUI root, set:

```bash
export DOWNLOAD_TO_DIR_ALLOW_COMFY_ROOT_WRITE=1
```

## Install
Clone into `ComfyUI/custom_nodes/`:

```bash
cd ComfyUI/custom_nodes
git clone <your-repo-url> download_to_directory_extension
```

Install optional dependency:

```bash
pip install -r custom_nodes/download_to_directory_extension/requirements.txt
```

Restart ComfyUI.

## Notes
- TLS certificate failures use a `certifi` fallback when available.
- On successful download, the extension attempts to refresh node definitions using the same command path as pressing `R`.

