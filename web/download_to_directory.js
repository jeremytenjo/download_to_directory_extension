(() => {
  const PANEL_ID = "download-to-directory-panel";
  const BUTTON_ID = "download-to-directory-button";

  const state = {
    apiPrefix: "/api",
    roots: [],
  };

  function ensureStyles() {
    if (document.getElementById("download-to-directory-style")) return;
    const style = document.createElement("style");
    style.id = "download-to-directory-style";
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        right: 16px;
        top: 16px;
        z-index: 9999;
        padding: 8px 12px;
        border: 1px solid #4c4c4c;
        border-radius: 10px;
        background: #1a1a1a;
        color: #f4f4f4;
        font-size: 12px;
        cursor: pointer;
      }
      #${PANEL_ID} {
        position: fixed;
        right: 16px;
        top: 56px;
        z-index: 9999;
        width: 380px;
        max-width: calc(100vw - 32px);
        padding: 12px;
        border: 1px solid #4c4c4c;
        border-radius: 10px;
        background: #111;
        color: #f4f4f4;
        font-size: 12px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
      }
      #${PANEL_ID}[hidden] {
        display: none;
      }
      #${PANEL_ID} input,
      #${PANEL_ID} select,
      #${PANEL_ID} button {
        width: 100%;
        box-sizing: border-box;
        margin-top: 6px;
        margin-bottom: 8px;
        border-radius: 8px;
        border: 1px solid #4c4c4c;
        background: #191919;
        color: #f4f4f4;
        padding: 7px;
      }
      #${PANEL_ID} .row {
        display: grid;
        grid-template-columns: 1fr;
        gap: 6px;
      }
      #${PANEL_ID} .status {
        margin-top: 8px;
        min-height: 18px;
      }
      #${PANEL_ID} .status.error {
        color: #ff8e8e;
      }
      #${PANEL_ID} .status.success {
        color: #9df5b3;
      }
      #${PANEL_ID} .hint {
        opacity: 0.75;
        font-size: 11px;
      }
      #${PANEL_ID} .inline {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #${PANEL_ID} .inline input[type="checkbox"] {
        width: auto;
        margin: 0;
      }
    `;
    document.head.appendChild(style);
  }

  async function apiFetch(path, options) {
    const prefixes = [state.apiPrefix, "", "/api"];
    let lastError = null;

    for (const prefix of prefixes) {
      const url = `${prefix}${path}`;
      try {
        const resp = await fetch(url, options);
        if (resp.status === 404) continue;
        state.apiPrefix = prefix;
        return resp;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("Unable to reach ComfyUI API");
  }

  function setStatus(message, type = "") {
    const status = document.querySelector(`#${PANEL_ID} .status`);
    if (!status) return;
    status.className = `status ${type}`.trim();
    status.textContent = message;
  }

  async function loadRoots() {
    const select = document.getElementById("dtd-root");
    if (!select) return;

    setStatus("Loading destination roots...");

    const resp = await apiFetch("/download-to-dir/roots", { method: "GET" });
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data?.error || data?.reason || `Failed to load roots (${resp.status})`);
    }

    state.roots = Array.isArray(data.roots) ? data.roots : [];

    select.innerHTML = "";
    for (const root of state.roots) {
      const opt = document.createElement("option");
      opt.value = root.key;
      opt.textContent = `${root.key} -> ${root.path}`;
      select.appendChild(opt);
    }

    if (select.options.length === 0) {
      setStatus("No writable roots available", "error");
    } else {
      setStatus("Ready.");
    }
  }

  async function handleDownload() {
    const urlInput = document.getElementById("dtd-url");
    const rootInput = document.getElementById("dtd-root");
    const subdirInput = document.getElementById("dtd-subdir");
    const filenameInput = document.getElementById("dtd-filename");
    const overwriteInput = document.getElementById("dtd-overwrite");

    const url = (urlInput?.value || "").trim();
    const rootKey = (rootInput?.value || "").trim();

    if (!url || !rootKey) {
      setStatus("URL and root are required.", "error");
      return;
    }

    setStatus("Downloading... This may take a while.");

    const payload = {
      url,
      root_key: rootKey,
      subdirectory: (subdirInput?.value || "").trim(),
      filename: (filenameInput?.value || "").trim(),
      overwrite: Boolean(overwriteInput?.checked),
    };

    const resp = await apiFetch("/download-to-dir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      setStatus(data?.error || data?.reason || `Download failed (${resp.status})`, "error");
      return;
    }

    const mb = Number(data.bytes_written || 0) / (1024 * 1024);
    setStatus(`Saved to ${data.destination_path} (${mb.toFixed(2)} MB)`, "success");
  }

  function renderUi() {
    if (document.getElementById(BUTTON_ID) || document.getElementById(PANEL_ID)) return;

    ensureStyles();

    const toggle = document.createElement("button");
    toggle.id = BUTTON_ID;
    toggle.type = "button";
    toggle.textContent = "Downloader";

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.innerHTML = `
      <div class="row">
        <label>File URL</label>
        <input id="dtd-url" type="text" placeholder="https://example.com/file.bin" />

        <label>Destination root</label>
        <select id="dtd-root"></select>

        <label>Subdirectory (optional)</label>
        <input id="dtd-subdir" type="text" placeholder="my/models" />

        <label>Filename (optional)</label>
        <input id="dtd-filename" type="text" placeholder="auto from URL if empty" />

        <label class="inline">
          <input id="dtd-overwrite" type="checkbox" />
          Overwrite existing file
        </label>

        <button id="dtd-submit" type="button">Download</button>
        <div class="hint">Only HTTP/HTTPS. Private/localhost targets are blocked by default.</div>
        <div class="status"></div>
      </div>
    `;

    toggle.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden && state.roots.length === 0) {
        loadRoots().catch((err) => setStatus(err.message || String(err), "error"));
      }
    });

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    const submit = document.getElementById("dtd-submit");
    if (submit) {
      submit.addEventListener("click", () => {
        handleDownload().catch((err) => setStatus(err.message || String(err), "error"));
      });
    }
  }

  function init() {
    if (!document.body) {
      setTimeout(init, 150);
      return;
    }
    renderUi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
