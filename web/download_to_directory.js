(() => {
  const DIALOG_ID = 'download-to-directory-dialog';
  const BUTTON_ID = 'download-to-directory-button';

  const state = {
    apiPrefix: '/api',
    roots: [],
    toggleEl: null,
    dialogEl: null,
  };

  function ensureStyles() {
    if (document.getElementById('download-to-directory-style')) return;

    const style = document.createElement('style');
    style.id = 'download-to-directory-style';
    style.textContent = `
      #download-to-directory-inline-slot {
        display: inline-flex;
        align-items: center;
      }
      #${BUTTON_ID} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 32px;
        padding: 8px 12px;
        border: none;
        border-radius: 8px;
        background: var(--p-surface-800, #23262f);
        color: var(--p-surface-0, #fff);
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        font-family: inherit;
        white-space: nowrap;
        transition: background 120ms ease;
      }
      #${BUTTON_ID}:hover {
        background: var(--interface-button-hover-surface, #2f3340);
      }
      #${BUTTON_ID} i {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      #${DIALOG_ID} {
        width: min(440px, calc(100vw - 24px));
        border: 1px solid #4c4c4c;
        border-radius: 12px;
        background: #111;
        color: #f4f4f4;
        padding: 12px;
      }
      #${DIALOG_ID}::backdrop {
        background: rgba(0, 0, 0, 0.45);
      }
      #${DIALOG_ID} input,
      #${DIALOG_ID} select,
      #${DIALOG_ID} button {
        width: 100%;
        box-sizing: border-box;
        margin-top: 6px;
        margin-bottom: 8px;
        border-radius: 8px;
        border: 1px solid #4c4c4c;
        background: #191919;
        color: #f4f4f4;
        padding: 8px;
      }
      #${DIALOG_ID} .row {
        display: grid;
        grid-template-columns: 1fr;
        gap: 6px;
      }
      #${DIALOG_ID} .status {
        margin-top: 8px;
        min-height: 18px;
      }
      #${DIALOG_ID} .status.error {
        color: #ff8e8e;
      }
      #${DIALOG_ID} .status.success {
        color: #9df5b3;
      }
      #${DIALOG_ID} .hint {
        opacity: 0.75;
        font-size: 11px;
      }
      #${DIALOG_ID} .inline {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #${DIALOG_ID} .inline input[type="checkbox"] {
        width: auto;
        margin: 0;
      }
      #${DIALOG_ID} .actions {
        display: flex;
        gap: 8px;
      }
      #${DIALOG_ID} .actions button {
        margin-bottom: 0;
      }
    `;

    document.head.appendChild(style);
  }

  async function apiFetch(path, options) {
    const prefixes = [state.apiPrefix, '', '/api'];
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

    throw lastError || new Error('Unable to reach ComfyUI API');
  }

  function setStatus(message, type = '') {
    const status = document.querySelector(`#${DIALOG_ID} .status`);
    if (!status) return;
    status.className = `status ${type}`.trim();
    status.textContent = message;
  }

  function findActionbarMountNode() {
    const content = document.querySelector(
      ".actionbar [data-pc-section='content']",
    );
    if (content) {
      const inlineRow = content.querySelector(
        '.relative.flex.items-center.gap-2.select-none',
      );
      return inlineRow || content;
    }
    return document.querySelector('.actionbar .p-panel-content');
  }

  function ensureButtonMounted() {
    const toggle = state.toggleEl || document.getElementById(BUTTON_ID);
    if (!toggle) return;

    const mountNode = findActionbarMountNode();
    if (!mountNode) return;

    let slot = document.getElementById('download-to-directory-inline-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'download-to-directory-inline-slot';
    }

    if (slot.parentElement !== mountNode) {
      mountNode.appendChild(slot);
    }

    if (toggle.parentElement !== slot) {
      slot.appendChild(toggle);
    }
  }

  async function loadRoots() {
    const select = document.getElementById('dtd-root');
    if (!select) return;

    setStatus('Loading destination roots...');

    const resp = await apiFetch('/download-to-dir/roots', { method: 'GET' });
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(
        data?.error || data?.reason || `Failed to load roots (${resp.status})`,
      );
    }

    state.roots = Array.isArray(data.roots) ? data.roots : [];

    select.innerHTML = '';
    for (const root of state.roots) {
      const opt = document.createElement('option');
      opt.value = root.key;
      opt.textContent = `${root.key} -> ${root.path}`;
      select.appendChild(opt);
    }

    if (select.options.length === 0) {
      setStatus('No writable roots available', 'error');
    } else {
      setStatus('Ready.');
    }
  }

  async function handleDownload() {
    const urlInput = document.getElementById('dtd-url');
    const rootInput = document.getElementById('dtd-root');
    const subdirInput = document.getElementById('dtd-subdir');
    const filenameInput = document.getElementById('dtd-filename');
    const overwriteInput = document.getElementById('dtd-overwrite');

    const url = (urlInput?.value || '').trim();
    const rootKey = (rootInput?.value || '').trim();

    if (!url || !rootKey) {
      setStatus('URL and root are required.', 'error');
      return;
    }

    setStatus('Downloading... This may take a while.');

    const payload = {
      url,
      root_key: rootKey,
      subdirectory: (subdirInput?.value || '').trim(),
      filename: (filenameInput?.value || '').trim(),
      overwrite: Boolean(overwriteInput?.checked),
    };

    const resp = await apiFetch('/download-to-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      setStatus(
        data?.error || data?.reason || `Download failed (${resp.status})`,
        'error',
      );
      return;
    }

    const mb = Number(data.bytes_written || 0) / (1024 * 1024);
    setStatus(
      `Saved to ${data.destination_path} (${mb.toFixed(2)} MB)`,
      'success',
    );
  }

  function renderUi() {
    ensureStyles();

    if (!state.toggleEl) {
      const toggle = document.createElement('button');
      toggle.id = BUTTON_ID;
      toggle.type = 'button';
      toggle.innerHTML =
        '<i class="icon-[lucide--download]"></i><span>Downloader</span>';
      state.toggleEl = toggle;
    }
    const toggle = state.toggleEl;

    if (!state.dialogEl) {
      const dialog = document.createElement('dialog');
      dialog.id = DIALOG_ID;
      dialog.innerHTML = `
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

        <div class="actions">
          <button id="dtd-submit" type="button">Download</button>
          <button id="dtd-close" type="button">Close</button>
        </div>
        <div class="hint">Only HTTP/HTTPS. Private/localhost targets are blocked by default.</div>
        <div class="status"></div>
      </div>
    `;
      document.body.appendChild(dialog);
      state.dialogEl = dialog;
    }
    const dialog = state.dialogEl;

    toggle.addEventListener('click', () => {
      if (!dialog.open) {
        dialog.showModal();
      }
      if (state.roots.length === 0) {
        loadRoots().catch((err) =>
          setStatus(err.message || String(err), 'error'),
        );
      }
    });

    ensureButtonMounted();

    const submit = document.getElementById('dtd-submit');
    if (submit) {
      submit.addEventListener('click', () => {
        handleDownload().catch((err) =>
          setStatus(err.message || String(err), 'error'),
        );
      });
    }

    const close = document.getElementById('dtd-close');
    if (close) {
      close.addEventListener('click', () => dialog.close());
    }

    // Close when clicking the dialog backdrop (outside modal content).
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        dialog.close();
      }
    });

    const observer = new MutationObserver(() => ensureButtonMounted());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (!document.body) {
      setTimeout(init, 150);
      return;
    }

    renderUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
