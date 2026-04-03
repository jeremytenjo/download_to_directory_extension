(() => {
  const DIALOG_ID = 'download-to-directory-dialog';
  const BUTTON_ID = 'download-to-directory-button';
  const RECENT_FOLDERS_KEY = 'download-to-directory-recent-folders-v1';
  const MAX_RECENT_FOLDERS = 8;

  const state = {
    apiPrefix: '/api',
    roots: [],
    toggleEl: null,
    dialogEl: null,
    activeProgressToken: 0,
  };

  function ensureStyles() {
    if (document.getElementById('download-to-directory-style')) return;

    const style = document.createElement('style');
    style.id = 'download-to-directory-style';
    style.textContent = `
      #download-to-directory-inline-slot {
        display: flex;
        align-items: center;
        pointer-events: auto;
        height: 48px;
        flex-shrink: 0;
        padding: 0 8px;
        border: 1px solid var(--interface-stroke, var(--p-content-border-color, #434958));
        border-radius: 12px;
        background: var(--comfy-menu-bg, var(--p-content-background, #16191f));
        box-shadow: var(--shadow-interface, 0 8px 24px rgba(0, 0, 0, 0.22));
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
        background: var(--secondary-background, var(--p-surface-800, #23262f));
        color: var(--secondary-foreground, var(--p-surface-0, #fff));
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        font-family: inherit;
        white-space: nowrap;
        transition: background 120ms ease;
      }
      #${BUTTON_ID}:hover {
        background: var(--secondary-background-hover, var(--interface-button-hover-surface, #2f3340));
      }
      #${BUTTON_ID} i {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      #${DIALOG_ID} {
        width: min(720px, calc(100vw - 64px));
        max-height: min(88vh, 900px);
        overflow: hidden;
        border: 1px solid var(--p-content-border-color, #343943);
        border-radius: 20px;
        background: var(--p-content-background, #16191f);
        color: var(--p-text-color, #f5f7fb);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
        padding: 0;
        transform-origin: 50% 50%;
        opacity: 0;
        transform: translateY(8px) scale(0.96);
      }
      #${DIALOG_ID}::backdrop {
        background: rgba(8, 10, 14, 0.64);
        opacity: 0;
      }
      #${DIALOG_ID}[open] {
        animation: dtd-dialog-in 180ms cubic-bezier(0.2, 0.8, 0.25, 1) forwards;
      }
      #${DIALOG_ID}[open]::backdrop {
        animation: dtd-backdrop-in 180ms ease forwards;
      }
      #${DIALOG_ID}.dtd-closing {
        animation: dtd-dialog-out 150ms cubic-bezier(0.4, 0, 1, 1) forwards;
      }
      #${DIALOG_ID}.dtd-closing::backdrop {
        animation: dtd-backdrop-out 150ms ease forwards;
      }
      @keyframes dtd-dialog-in {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes dtd-dialog-out {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(8px) scale(0.96);
        }
      }
      @keyframes dtd-backdrop-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes dtd-backdrop-out {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
      #${DIALOG_ID} .body {
        --dtd-body-pad-x: 18px;
        --dtd-band-bg: var(--p-surface-900, #141922);
        padding: 16px var(--dtd-body-pad-x) 14px;
        max-height: min(88vh, 900px);
        overflow: auto;
      }
      #${DIALOG_ID} .row {
        --dtd-stack-gap: 12px;
        display: flex;
        flex-direction: column;
        gap: var(--dtd-stack-gap);
      }
      #${DIALOG_ID} .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      #${DIALOG_ID} .form-section {
        display: flex;
        flex-direction: column;
        gap: var(--dtd-stack-gap);
        padding: 10px 0;
      }
      #${DIALOG_ID} .bleed {
        box-sizing: border-box;
        margin-left: calc(-1 * var(--dtd-body-pad-x));
        margin-right: calc(-1 * var(--dtd-body-pad-x));
        width: calc(100% + (var(--dtd-body-pad-x) * 2));
      }
      #${DIALOG_ID} .title-band,
      #${DIALOG_ID} .cta-band {
        background: var(--dtd-band-bg);
        padding: 10px var(--dtd-body-pad-x);
      }
      #${DIALOG_ID} .title-band {
        padding-top: 8px;
        padding-bottom: 8px;
      }
      #${DIALOG_ID} .divider {
        height: 1px;
        background: var(--p-content-border-color, #434958);
      }
      #${DIALOG_ID} input,
      #${DIALOG_ID} select,
      #${DIALOG_ID} button {
        width: 100%;
        box-sizing: border-box;
        margin: 0;
        border-radius: 11px;
        border: 1px solid var(--p-content-border-color, #434958);
        background: var(--p-surface-800, #232831);
        color: var(--p-text-color, #f5f7fb);
        padding: 9px 12px;
        font-size: 14px;
        line-height: 1.4;
      }
      #${DIALOG_ID} input::placeholder {
        color: var(--p-text-muted-color, #9aa2b3);
      }
      #${DIALOG_ID} input:focus,
      #${DIALOG_ID} select:focus {
        outline: none;
        border-color: var(--p-primary-color, #4399ff);
        box-shadow: 0 0 0 1px var(--p-primary-color, #4399ff);
      }
      #${DIALOG_ID} label {
        display: block;
        margin-bottom: 2px;
        color: var(--p-text-color, #f5f7fb);
        font-size: 14px;
        font-weight: 600;
      }
      #${DIALOG_ID} .status {
        margin: 0;
        min-height: 22px;
        font-size: 14px;
      }
      #${DIALOG_ID} .status.error {
        color: #ff8f9d;
      }
      #${DIALOG_ID} .status.success {
        color: #6de4a0;
      }
      #${DIALOG_ID} .hint {
        color: var(--p-text-muted-color, #a8afbd);
        font-size: 13px;
        margin: 0;
        line-height: 1.35;
      }
      #${DIALOG_ID} .inline {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0;
      }
      #${DIALOG_ID} details.advanced {
        margin: 0;
        border: 1px solid var(--p-content-border-color, #434958);
        border-radius: 12px;
        background: var(--p-surface-900, #1a1f27);
        overflow: hidden;
      }
      #${DIALOG_ID} details.advanced > summary {
        cursor: pointer;
        list-style: none;
        padding: 9px 12px;
        font-size: 13px;
        font-weight: 600;
        color: var(--p-text-color, #f5f7fb);
        user-select: none;
      }
      #${DIALOG_ID} details.advanced > summary::-webkit-details-marker {
        display: none;
      }
      #${DIALOG_ID} .advanced-body {
        padding: 0 12px 10px;
      }
      #${DIALOG_ID} .advanced-note {
        margin-top: -2px;
        margin-bottom: 8px;
        color: var(--p-text-muted-color, #a8afbd);
        font-size: 12px;
        line-height: 1.3;
      }
      #${DIALOG_ID} .inline input[type="checkbox"] {
        margin: 0;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        border: 1px solid var(--p-content-border-color, #505768);
        background: var(--p-surface-900, #1a1f27);
        accent-color: var(--p-primary-color, #2f8dff);
        box-shadow: none;
      }
      #${DIALOG_ID} .actions {
        display: flex;
        gap: 10px;
        margin: 0;
      }
      #${DIALOG_ID} .actions button {
        margin-bottom: 0;
        height: 42px;
        font-weight: 600;
        cursor: pointer;
        transition: filter 120ms ease, border-color 120ms ease, background 120ms ease;
      }
      #${DIALOG_ID} #dtd-submit {
        background: var(--p-primary-color, #2587f9);
        border-color: color-mix(in srgb, var(--p-primary-color, #2587f9) 68%, #ffffff 32%);
        color: #ffffff;
      }
      #${DIALOG_ID} #dtd-submit:hover {
        filter: brightness(1.08);
      }
      #${DIALOG_ID} #dtd-close {
        background: var(--p-surface-800, #232831);
        border-color: var(--p-content-border-color, #434958);
        color: var(--p-text-color, #f5f7fb);
      }
      #${DIALOG_ID} #dtd-close:hover {
        background: var(--p-surface-700, #2c323d);
      }
      #${DIALOG_ID} .title {
        margin: 0;
        font-size: 24px;
        line-height: 1.1;
        font-weight: 650;
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
    const normalized = String(message || '')
      .trim()
      .replace(/\.$/, '')
      .toLowerCase();
    const hideStatus = normalized === 'ready';
    status.hidden = hideStatus;
    status.className = `status ${type}`.trim();
    status.textContent = hideStatus ? '' : message;
  }

  function findActionbarMountNode() {
    const actionbarContainer = document.querySelector('.actionbar-container');
    if (actionbarContainer?.parentElement) {
      return {
        parent: actionbarContainer.parentElement,
        before: actionbarContainer,
      };
    }

    const content = document.querySelector(
      ".actionbar [data-pc-section='content']",
    );
    if (content) {
      const inlineRow = content.querySelector(
        '.relative.flex.items-center.gap-2.select-none',
      );
      return {
        parent: inlineRow || content,
        before: null,
      };
    }

    const fallback = document.querySelector('.actionbar .p-panel-content');
    if (fallback) {
      return {
        parent: fallback,
        before: null,
      };
    }

    return null;
  }

  function ensureButtonMounted() {
    const toggle = state.toggleEl || document.getElementById(BUTTON_ID);
    if (!toggle) return;

    const mountTarget = findActionbarMountNode();
    if (!mountTarget?.parent) return;

    let slot = document.getElementById('download-to-directory-inline-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'download-to-directory-inline-slot';
    }

    if (slot.parentElement !== mountTarget.parent) {
      mountTarget.parent.insertBefore(slot, mountTarget.before);
    } else if (
      mountTarget.before &&
      slot.nextElementSibling !== mountTarget.before
    ) {
      mountTarget.parent.insertBefore(slot, mountTarget.before);
    }

    if (toggle.parentElement !== slot) {
      slot.appendChild(toggle);
    }
  }

  function formatApiError(status, data, fallbackMessage) {
    const raw = String(data?.reason || data?.error || '').trim();
    const msg = raw.toLowerCase();

    if (status === 409) {
      return 'A file with that name already exists. Enable "Overwrite existing file" or choose a different filename/subdirectory.';
    }
    if (status === 400 && msg.includes('private or localhost')) {
      return 'This URL points to a private/local address, which is blocked for safety.';
    }
    if (
      status === 400 &&
      msg.includes('folder must be inside models/ or custom_nodes/')
    ) {
      return 'Folder must be inside models/ or custom_nodes/ (relative to ComfyUI root).';
    }
    if (status === 400 && msg.includes('only http/https')) {
      return 'Only HTTP/HTTPS links are supported.';
    }
    if (msg.includes('certificate verify failed')) {
      return 'Secure connection failed while validating the site certificate. Install/update certificates in your Python environment and try again.';
    }
    if (msg.includes('timed out')) {
      return 'The download timed out. Please retry or try a different source.';
    }
    if (status === 404) {
      return 'The file could not be found at that URL (404).';
    }
    if (status >= 500) {
      return 'Server error while downloading. Check ComfyUI logs for details and try again.';
    }

    return raw || fallbackMessage || `Request failed (${status})`;
  }

  function normalizeFolderValue(value) {
    return String(value || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/{2,}/g, '/');
  }

  function readRecentFolders() {
    try {
      const raw = localStorage.getItem(RECENT_FOLDERS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((entry) => normalizeFolderValue(entry))
        .filter((entry) => entry.length > 0)
        .slice(0, MAX_RECENT_FOLDERS);
    } catch {
      return [];
    }
  }

  function writeRecentFolders(folders) {
    try {
      localStorage.setItem(
        RECENT_FOLDERS_KEY,
        JSON.stringify(folders.slice(0, MAX_RECENT_FOLDERS)),
      );
    } catch {
      // Ignore storage failures; this is best-effort UX state.
    }
  }

  function saveRecentFolder(folder) {
    const normalized = normalizeFolderValue(folder);
    if (!normalized) return;
    const deduped = [
      normalized,
      ...readRecentFolders().filter((f) => f !== normalized),
    ];
    writeRecentFolders(deduped);
  }

  function renderRootOptions() {
    const select = document.getElementById('dtd-root');
    if (!select) return;

    const recentFolders = readRecentFolders();
    const previousValue = select.value;
    select.innerHTML = '';

    if (recentFolders.length > 0) {
      const recentGroup = document.createElement('optgroup');
      recentGroup.label = 'Recent folders';
      for (const folder of recentFolders) {
        const opt = document.createElement('option');
        opt.value = `recent:${folder}`;
        opt.textContent = folder;
        opt.title = `ComfyUI root/${folder}`;
        recentGroup.appendChild(opt);
      }
      select.appendChild(recentGroup);

      const allGroup = document.createElement('optgroup');
      allGroup.label = 'All folders';
      for (const root of state.roots) {
        const opt = document.createElement('option');
        opt.value = root.key;
        opt.textContent = root.key;
        opt.title = root.path;
        allGroup.appendChild(opt);
      }
      select.appendChild(allGroup);
    } else {
      for (const root of state.roots) {
        const opt = document.createElement('option');
        opt.value = root.key;
        opt.textContent = root.key;
        opt.title = root.path;
        select.appendChild(opt);
      }
    }

    if (previousValue) {
      const hasPrevious = Array.from(select.options).some(
        (opt) => opt.value === previousValue,
      );
      if (hasPrevious) select.value = previousValue;
    }
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exp = Math.min(
      Math.floor(Math.log(value) / Math.log(1024)),
      units.length - 1,
    );
    const size = value / 1024 ** exp;
    return `${size.toFixed(exp >= 2 ? 2 : 1)} ${units[exp]}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function pollDownloadProgress(jobId, token) {
    while (token === state.activeProgressToken) {
      const resp = await apiFetch(`/download-to-dir/progress/${jobId}`, {
        method: 'GET',
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(
          formatApiError(
            resp.status,
            data,
            `Could not read download progress (${resp.status})`,
          ),
        );
      }

      const status = String(data.status || '').toLowerCase();
      const bytesWritten = Number(data.bytes_written || 0);
      const totalBytes =
        data.total_bytes == null ? null : Number(data.total_bytes);
      const percent = Number(data.progress_percent);

      if (status === 'queued') {
        setStatus('Queued...');
      } else if (status === 'running') {
        if (Number.isFinite(totalBytes) && totalBytes > 0) {
          const progressPct = Number.isFinite(percent)
            ? percent.toFixed(1)
            : '0.0';
          setStatus(
            `Downloading... ${formatBytes(bytesWritten)} / ${formatBytes(totalBytes)} (${progressPct}%)`,
          );
        } else {
          setStatus(`Downloading... ${formatBytes(bytesWritten)} downloaded`);
        }
      } else if (status === 'completed') {
        return data;
      } else if (status === 'failed') {
        throw new Error(String(data.error || 'Download failed.'));
      }

      await sleep(350);
    }

    throw new Error('Download tracking was replaced by a new request.');
  }

  async function loadRoots() {
    const select = document.getElementById('dtd-root');
    if (!select) return;

    setStatus('Loading destination roots...');

    const resp = await apiFetch('/download-to-dir/roots', { method: 'GET' });
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(
        formatApiError(
          resp.status,
          data,
          `Could not load destination folders (${resp.status})`,
        ),
      );
    }

    state.roots = Array.isArray(data.roots) ? data.roots : [];
    renderRootOptions();

    if (select.options.length === 0) {
      setStatus('No writable roots available', 'error');
    } else {
      setStatus('Ready.');
    }
  }

  async function handleDownload() {
    const urlInput = document.getElementById('dtd-url');
    const rootInput = document.getElementById('dtd-root');
    const folderInput = document.getElementById('dtd-folder');
    const subdirInput = document.getElementById('dtd-subdir');
    const filenameInput = document.getElementById('dtd-filename');
    const overwriteInput = document.getElementById('dtd-overwrite');
    const allowAnyFolderInput = document.getElementById('dtd-allow-any-folder');

    const url = (urlInput?.value || '').trim();
    const rootKey = (rootInput?.value || '').trim();
    const folder = (folderInput?.value || '').trim();
    const subdirectory = (subdirInput?.value || '').trim();
    const submitButton = document.getElementById('dtd-submit');
    const selectedRecentFolder = rootKey.startsWith('recent:')
      ? rootKey.slice('recent:'.length)
      : '';
    const effectiveFolder = folder || selectedRecentFolder;
    const effectiveRootKey = rootKey.startsWith('recent:') ? '' : rootKey;

    if (!url || (!effectiveRootKey && !effectiveFolder)) {
      setStatus('URL and destination are required.', 'error');
      return;
    }

    if (submitButton) submitButton.disabled = true;
    state.activeProgressToken += 1;
    const progressToken = state.activeProgressToken;
    setStatus('Starting download...');

    const payload = {
      url,
      root_key: effectiveRootKey,
      folder: effectiveFolder,
      subdirectory,
      filename: (filenameInput?.value || '').trim(),
      overwrite: Boolean(overwriteInput?.checked),
      allow_comfy_root_write: Boolean(allowAnyFolderInput?.checked),
    };

    try {
      const startResp = await apiFetch('/download-to-dir/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const startData = await startResp.json().catch(() => ({}));

      if (!startResp.ok) {
        setStatus(
          formatApiError(
            startResp.status,
            startData,
            `Download failed (${startResp.status})`,
          ),
          'error',
        );
        return;
      }

      const jobId = String(startData.job_id || '').trim();
      if (!jobId) {
        setStatus('Download did not return a tracking job id.', 'error');
        return;
      }

      const done = await pollDownloadProgress(jobId, progressToken);
      const mb = Number(done.bytes_written || 0) / (1024 * 1024);
      const recentFolder =
        normalizeFolderValue(effectiveFolder) ||
        normalizeFolderValue(
          `${effectiveRootKey}${subdirectory ? `/${subdirectory}` : ''}`,
        );
      saveRecentFolder(recentFolder);
      renderRootOptions();
      const refreshResult = await triggerNodeDefinitionsRefresh();
      const refreshSuffix = refreshResult
        ? ' Node definitions refreshed.'
        : ' Download complete. Press R to refresh node definitions.';
      setStatus(
        `Saved to ${done.destination_path} (${mb.toFixed(2)} MB).${refreshSuffix}`,
        'success',
      );
    } catch (err) {
      setStatus(err.message || String(err), 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function triggerNodeDefinitionsRefresh() {
    const commandId = 'Comfy.RefreshNodeDefinitions';
    const appObj = window.app;
    const attempts = [
      () => appObj?.extensionManager?.command?.execute?.(commandId),
      () => appObj?.extensionManager?.commands?.execute?.(commandId),
      () => appObj?.commands?.execute?.(commandId),
      () => appObj?.refreshComboInNodes?.(),
    ];

    for (const run of attempts) {
      try {
        const result = run();
        if (result && typeof result.then === 'function') {
          await result;
        }
        if (result !== undefined || run === attempts[attempts.length - 1]) {
          return true;
        }
      } catch {
        // Try the next known refresh path.
      }
    }

    try {
      const event = new KeyboardEvent('keydown', {
        key: 'r',
        code: 'KeyR',
        bubbles: true,
        cancelable: true,
      });
      const accepted =
        document.dispatchEvent(event) || window.dispatchEvent(event);
      return Boolean(accepted);
    } catch {
      return false;
    }
  }

  function closeDialogAnimated(dialog) {
    if (!dialog?.open || dialog.classList.contains('dtd-closing')) return;

    dialog.classList.add('dtd-closing');
    const onAnimEnd = (event) => {
      if (event.target !== dialog || event.animationName !== 'dtd-dialog-out') {
        return;
      }
      dialog.removeEventListener('animationend', onAnimEnd);
      dialog.classList.remove('dtd-closing');
      dialog.close();
    };
    dialog.addEventListener('animationend', onAnimEnd);
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
      <div class="body row">
        <div class="title-band bleed">
          <h2 class="title">Downloader</h2>
        </div>
        <div class="divider bleed"></div>
        <div class="form-section">
          <div class="field">
            <label>File URL</label>
            <input id="dtd-url" type="text" placeholder="https://example.com/file.bin" />
          </div>

          <div class="field">
            <label>Destination root</label>
            <select id="dtd-root"></select>
          </div>

          <div class="field">
            <label>Folder (optional, from ComfyUI root)</label>
            <input id="dtd-folder" type="text" placeholder="models/checkpoints or custom_nodes/my_extension" />
          </div>

          <div class="field">
            <label>Subdirectory (optional)</label>
            <input id="dtd-subdir" type="text" placeholder="my/models" />
          </div>

          <div class="field">
            <label>Filename (optional)</label>
            <input id="dtd-filename" type="text" placeholder="auto from URL if empty" />
          </div>

          <div class="field">
            <label class="inline">
              <input id="dtd-overwrite" type="checkbox" />
              Overwrite existing file
            </label>
          </div>

          <div class="field">
            <details class="advanced">
              <summary>Advanced</summary>
              <div class="advanced-body">
                <div class="advanced-note">Allow writing to any folder under ComfyUI root (not only models/ and custom_nodes/).</div>
                <label class="inline">
                  <input id="dtd-allow-any-folder" type="checkbox" />
                  Allow any ComfyUI-root folder
                </label>
              </div>
            </details>
          </div>
        </div>

        <div class="divider bleed"></div>
        <div class="cta-band bleed">
          <div class="actions">
            <button id="dtd-submit" type="button">Download</button>
            <button id="dtd-close" type="button">Close</button>
          </div>
        </div>
        <div class="field">
          <div class="status"></div>
        </div>
      </div>
    `;
      document.body.appendChild(dialog);
      state.dialogEl = dialog;
    }
    const dialog = state.dialogEl;

    toggle.addEventListener('click', () => {
      if (!dialog.open) {
        dialog.classList.remove('dtd-closing');
        dialog.showModal();
      }
      if (state.roots.length === 0) {
        loadRoots().catch((err) =>
          setStatus(err.message || String(err), 'error'),
        );
      }
    });

    ensureButtonMounted();

    const rootSelect = document.getElementById('dtd-root');
    const folderInput = document.getElementById('dtd-folder');
    if (rootSelect && folderInput) {
      rootSelect.addEventListener('change', () => {
        const selected = rootSelect.value || '';
        if (selected.startsWith('recent:')) {
          folderInput.value = selected.slice('recent:'.length);
        }
      });
    }

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
      close.addEventListener('click', () => closeDialogAnimated(dialog));
    }

    // Close when clicking the dialog backdrop (outside modal content).
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        closeDialogAnimated(dialog);
      }
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDialogAnimated(dialog);
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
