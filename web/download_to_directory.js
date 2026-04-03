(() => {
  const DIALOG_ID = 'download-to-directory-dialog';
  const BUTTON_ID = 'download-to-directory-button';
  const RECENT_FOLDERS_KEY = 'download-to-directory-recent-folders-v1';
  const ADVANCED_OPEN_KEY = 'download-to-directory-advanced-open-v1';
  const HISTORY_KEY = 'download-to-directory-history-v1';
  const HF_TOKEN_KEY = 'download-to-directory-hf-token-v1';
  const MAX_RECENT_FOLDERS = 8;
  const MAX_HISTORY_ITEMS = 100;
  const HOT_RELOAD_POLL_MS = 800;

  const state = {
    apiPrefix: '/api',
    roots: [],
    toggleEl: null,
    dialogEl: null,
    statusJobId: '',
    activeDownloadCount: 0,
    activeJobs: {},
    historyEntries: [],
  };

  let hotReloadTimer = null;
  let lastHotReloadStamp = null;

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
        width: min(760px, calc(100vw - 64px));
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
      #${DIALOG_ID} .hint {
        margin: 0;
        color: var(--p-text-muted-color, #a8afbd);
        font-size: 12px;
        line-height: 1.35;
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
      #${DIALOG_ID} .inline {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0;
      }
      #${DIALOG_ID} details.section {
        margin: 0;
        border: 1px solid var(--p-content-border-color, #434958);
        border-radius: 12px;
        background: var(--p-surface-900, #1a1f27);
        overflow: hidden;
      }
      #${DIALOG_ID} details.section > summary {
        cursor: pointer;
        list-style: none;
        padding: 9px 12px;
        font-size: 13px;
        font-weight: 600;
        color: var(--p-text-color, #f5f7fb);
        user-select: none;
      }
      #${DIALOG_ID} details.section > summary::-webkit-details-marker {
        display: none;
      }
      #${DIALOG_ID} .advanced-body {
        padding: 0 12px 10px;
        display: flex;
        flex-direction: column;
        gap: 10px;
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
      #${DIALOG_ID} .history-body {
        padding: 0 12px 10px;
        max-height: min(42vh, 360px);
        overflow: auto;
      }
      #${DIALOG_ID} .active-body {
        padding: 0 12px 10px;
        max-height: min(35vh, 300px);
        overflow: auto;
      }
      #${DIALOG_ID} .active-empty {
        margin: 0;
        color: var(--p-text-muted-color, #a8afbd);
        font-size: 13px;
        padding: 2px 0;
      }
      #${DIALOG_ID} .active-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      #${DIALOG_ID} .active-item {
        border: 1px solid var(--p-content-border-color, #434958);
        border-radius: 10px;
        padding: 10px;
        background: var(--p-surface-800, #232831);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      #${DIALOG_ID} .active-main {
        font-size: 13px;
        line-height: 1.35;
        color: var(--p-text-color, #f5f7fb);
      }
      #${DIALOG_ID} .active-sub {
        font-size: 12px;
        line-height: 1.35;
        color: var(--p-text-muted-color, #a8afbd);
        overflow-wrap: anywhere;
      }
      #${DIALOG_ID} .active-progress {
        font-size: 12px;
        line-height: 1.35;
        color: var(--p-text-color, #f5f7fb);
      }
      #${DIALOG_ID} .history-empty {
        margin: 0;
        color: var(--p-text-muted-color, #a8afbd);
        font-size: 13px;
        padding: 2px 0;
      }
      #${DIALOG_ID} .history-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      #${DIALOG_ID} .history-item {
        border: 1px solid var(--p-content-border-color, #434958);
        border-radius: 10px;
        padding: 10px;
        background: var(--p-surface-800, #232831);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      #${DIALOG_ID} .history-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      #${DIALOG_ID} .history-status {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }
      #${DIALOG_ID} .history-status.success {
        color: #6de4a0;
      }
      #${DIALOG_ID} .history-status.failed {
        color: #ff8f9d;
      }
      #${DIALOG_ID} .history-time {
        font-size: 12px;
        color: var(--p-text-muted-color, #a8afbd);
      }
      #${DIALOG_ID} .history-main {
        font-size: 13px;
        line-height: 1.35;
        color: var(--p-text-color, #f5f7fb);
      }
      #${DIALOG_ID} .history-sub {
        font-size: 12px;
        line-height: 1.35;
        color: var(--p-text-muted-color, #a8afbd);
        overflow-wrap: anywhere;
      }
      #${DIALOG_ID} .history-path-input {
        margin: 0;
        width: 100%;
        height: 34px;
        border-radius: 8px;
        border: 1px solid var(--p-content-border-color, #434958);
        background: var(--p-surface-900, #1a1f27);
        color: var(--p-text-color, #f5f7fb);
        padding: 6px 10px;
        font-size: 12px;
        line-height: 1.3;
      }
      #${DIALOG_ID} .history-actions {
        display: flex;
        gap: 8px;
      }
      #${DIALOG_ID} .history-actions button {
        width: auto;
        min-width: 0;
        padding: 6px 10px;
        height: 32px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      #${DIALOG_ID} .history-actions .danger {
        border-color: color-mix(in srgb, #ff8f9d 50%, var(--p-content-border-color, #434958));
      }
    `;

    document.head.appendChild(style);
  }

  async function fetchWebChangeStamp() {
    const response = await fetch(
      `${state.apiPrefix}/download-to-dir/dev/web-change-stamp`,
      {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      },
    );
    if (!response.ok) {
      throw new Error(`Hot reload probe failed: ${response.status}`);
    }
    return response.json();
  }

  function startHotReloadWatcher() {
    if (hotReloadTimer !== null) return;

    hotReloadTimer = window.setInterval(async () => {
      try {
        const payload = await fetchWebChangeStamp();
        if (!payload?.enabled) return;

        const stamp =
          typeof payload.stamp === 'number'
            ? payload.stamp
            : Number(payload.stamp);
        if (!Number.isFinite(stamp) || stamp <= 0) return;

        if (lastHotReloadStamp === null) {
          lastHotReloadStamp = stamp;
          return;
        }

        if (stamp !== lastHotReloadStamp) {
          lastHotReloadStamp = stamp;
          window.location.reload();
        }
      } catch (_err) {
        // Ignore probe failures; hot-reload is best-effort in dev only.
      }
    }, HOT_RELOAD_POLL_MS);
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

  function readSessionJson(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function writeSessionJson(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore session storage failures.
    }
  }

  function readSessionBoolean(key, fallback = false) {
    const value = readSessionJson(key, fallback);
    return typeof value === 'boolean' ? value : fallback;
  }

  function writeSessionBoolean(key, value) {
    writeSessionJson(key, Boolean(value));
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
    if (status === 400 && msg.includes('only http/https')) {
      return 'Only HTTP/HTTPS links are supported.';
    }
    if (status === 400 && msg.includes('outside allowed comfyui roots')) {
      return 'That file is outside allowed ComfyUI roots and cannot be deleted.';
    }
    if (status === 400 && msg.includes('directory')) {
      return 'Only files can be deleted from history.';
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

  function isHuggingFaceUrl(url) {
    try {
      const parsed = new URL(String(url || '').trim());
      const host = String(parsed.hostname || '').toLowerCase();
      return (
        host === 'huggingface.co' ||
        host === 'www.huggingface.co' ||
        host === 'hf.co'
      );
    } catch {
      return false;
    }
  }

  function formatHuggingFaceAuthMessage(rawMessage) {
    const base =
      String(rawMessage || '').trim() || 'Hugging Face download was blocked.';
    return `${base} Add your Hugging Face token in Advanced > Hugging Face token, then retry. Create/read token at https://huggingface.co/settings/tokens and make sure you accepted access terms on the model page.`;
  }

  function maybeFormatHuggingFaceAuthError(url, message) {
    const raw = String(message || '').trim();
    const normalized = raw.toLowerCase();
    const isAuthError =
      normalized.includes('401') ||
      normalized.includes('403') ||
      normalized.includes('unauthorized') ||
      normalized.includes('forbidden') ||
      normalized.includes('authentication') ||
      normalized.includes('blocked');

    if (!isAuthError || !isHuggingFaceUrl(url)) return raw;
    return formatHuggingFaceAuthMessage(raw);
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

  function readHistoryEntries() {
    const parsed = readSessionJson(HISTORY_KEY, []);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry === 'object')
      .slice(0, MAX_HISTORY_ITEMS);
  }

  function writeHistoryEntries(entries) {
    const sanitized = Array.isArray(entries)
      ? entries.filter((entry) => entry && typeof entry === 'object')
      : [];
    state.historyEntries = sanitized.slice(0, MAX_HISTORY_ITEMS);
    writeSessionJson(HISTORY_KEY, state.historyEntries);
  }

  function addHistoryEntry(entry) {
    const record = {
      id:
        entry?.id && String(entry.id).trim()
          ? String(entry.id).trim()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      created_at: Number(entry?.created_at || Date.now()),
      status:
        String(entry?.status || 'failed').toLowerCase() === 'success'
          ? 'success'
          : 'failed',
      url: String(entry?.url || '').trim(),
      selected_root_value: String(entry?.selected_root_value || '').trim(),
      root_key: String(entry?.root_key || '').trim(),
      folder: String(entry?.folder || '').trim(),
      subdirectory: String(entry?.subdirectory || '').trim(),
      filename: String(entry?.filename || '').trim(),
      overwrite: Boolean(entry?.overwrite),
      destination_path: String(entry?.destination_path || '').trim(),
      path: String(entry?.path || '').trim(),
      bytes_written: Number(entry?.bytes_written || 0),
      error: String(entry?.error || '').trim(),
    };

    writeHistoryEntries([record, ...state.historyEntries]);
    renderHistory();
  }

  function removeHistoryEntry(entryId) {
    const id = String(entryId || '').trim();
    if (!id) return;
    writeHistoryEntries(
      state.historyEntries.filter((entry) => entry.id !== id),
    );
    renderHistory();
  }

  function getHistoryEntry(entryId) {
    const id = String(entryId || '').trim();
    if (!id) return null;
    return state.historyEntries.find((entry) => entry.id === id) || null;
  }

  function formatTimestamp(ms) {
    const value = Number(ms || 0);
    if (!Number.isFinite(value) || value <= 0) return '';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return '';
    }
  }

  function getEntryPath(entry) {
    const explicit = String(entry?.path || '').trim();
    if (explicit) return explicit;

    if (entry?.status === 'success') {
      return String(entry?.destination_path || '').trim();
    }

    return (
      normalizeFolderValue(entry?.folder) ||
      normalizeFolderValue(
        `${entry?.root_key || ''}${entry?.subdirectory ? `/${entry.subdirectory}` : ''}`,
      )
    );
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

  function createHistoryItemElement(entry) {
    const item = document.createElement('div');
    item.className = `history-item ${entry.status}`;

    const top = document.createElement('div');
    top.className = 'history-top';

    const status = document.createElement('span');
    status.className = `history-status ${entry.status}`;
    status.textContent = entry.status === 'success' ? 'Success' : 'Failed';

    const time = document.createElement('span');
    time.className = 'history-time';
    time.textContent = formatTimestamp(entry.created_at);

    top.append(status, time);

    const main = document.createElement('div');
    main.className = 'history-main';
    if (entry.status === 'success') {
      main.textContent = entry.destination_path || 'Downloaded file';
    } else {
      main.textContent = entry.error || 'Download failed';
    }

    const sub = document.createElement('div');
    sub.className = 'history-sub';
    const parts = [];
    if (entry.url) parts.push(entry.url);
    const folderLabel = getEntryPath(entry);
    if (folderLabel) parts.push(`to ${folderLabel}`);
    if (entry.status === 'success' && Number(entry.bytes_written) > 0) {
      parts.push(formatBytes(entry.bytes_written));
    }
    sub.textContent = parts.join(' • ');

    const actions = document.createElement('div');
    actions.className = 'history-actions';

    if (entry.status === 'success') {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'danger';
      deleteBtn.dataset.action = 'delete-file';
      deleteBtn.dataset.id = entry.id;
      deleteBtn.textContent = 'Delete from disk';
      actions.appendChild(deleteBtn);
    } else {
      const pathInput = document.createElement('input');
      pathInput.type = 'text';
      pathInput.className = 'history-path-input';
      pathInput.dataset.action = 'edit-path';
      pathInput.dataset.id = entry.id;
      pathInput.value = getEntryPath(entry);
      item.append(pathInput);

      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.dataset.action = 'retry-entry';
      retryBtn.dataset.id = entry.id;
      retryBtn.textContent = 'Retry';
      actions.appendChild(retryBtn);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.dataset.action = 'remove-entry';
      removeBtn.dataset.id = entry.id;
      removeBtn.textContent = 'Ignore';
      actions.appendChild(removeBtn);
    }

    item.append(top, main, sub, actions);
    return item;
  }

  function renderHistory() {
    const historyList = document.getElementById('dtd-history-list');
    const emptyEl = document.getElementById('dtd-history-empty');
    if (!historyList || !emptyEl) return;

    historyList.innerHTML = '';
    if (state.historyEntries.length === 0) {
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    for (const entry of state.historyEntries) {
      historyList.appendChild(createHistoryItemElement(entry));
    }
  }

  function inferActiveDisplayName(url, destinationPath) {
    const destinationName = String(destinationPath || '').trim().split('/').pop();
    if (destinationName) return destinationName;
    try {
      const parsed = new URL(String(url || '').trim());
      const urlName = String(parsed.pathname || '').split('/').pop();
      return urlName || 'download.bin';
    } catch {
      return 'download.bin';
    }
  }

  function formatActiveProgress(status, bytesWritten, totalBytes, percent) {
    const normalizedStatus = String(status || '').toLowerCase();
    if (normalizedStatus === 'queued') return 'Queued...';
    if (normalizedStatus === 'failed') return 'Failed';
    if (normalizedStatus === 'completed') return 'Completed';

    const current = Number(bytesWritten || 0);
    const total = totalBytes == null ? null : Number(totalBytes);
    const pct = Number(percent);
    if (Number.isFinite(total) && total > 0) {
      const progressPct = Number.isFinite(pct)
        ? pct.toFixed(1)
        : ((current / total) * 100).toFixed(1);
      return `${formatBytes(current)} / ${formatBytes(total)} (${progressPct}%)`;
    }
    return `${formatBytes(current)} downloaded`;
  }

  function updateActiveJob(jobId, patch) {
    const id = String(jobId || '').trim();
    if (!id) return;
    const current = state.activeJobs[id] || { job_id: id };
    state.activeJobs[id] = { ...current, ...patch, job_id: id };
    renderActiveDownloads();
  }

  function removeActiveJob(jobId) {
    const id = String(jobId || '').trim();
    if (!id || !state.activeJobs[id]) return;
    delete state.activeJobs[id];
    renderActiveDownloads();
  }

  function renderActiveDownloads() {
    const activeList = document.getElementById('dtd-active-list');
    const emptyEl = document.getElementById('dtd-active-empty');
    if (!activeList || !emptyEl) return;

    const jobs = Object.values(state.activeJobs || {}).sort(
      (a, b) => Number(b.started_at || 0) - Number(a.started_at || 0),
    );

    activeList.innerHTML = '';
    if (jobs.length === 0) {
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    for (const job of jobs) {
      const item = document.createElement('div');
      item.className = 'active-item';

      const main = document.createElement('div');
      main.className = 'active-main';
      main.textContent = job.file_name || 'download.bin';

      const sub = document.createElement('div');
      sub.className = 'active-sub';
      sub.textContent = job.destination_path || 'Preparing destination...';

      const progress = document.createElement('div');
      progress.className = 'active-progress';
      progress.textContent = formatActiveProgress(
        job.status,
        job.bytes_written,
        job.total_bytes,
        job.progress_percent,
      );

      item.append(main, sub, progress);
      activeList.appendChild(item);
    }
  }

  function readDownloadFormValues() {
    const urlInput = document.getElementById('dtd-url');
    const rootInput = document.getElementById('dtd-root');
    const folderInput = document.getElementById('dtd-folder');
    const subdirInput = document.getElementById('dtd-subdir');
    const filenameInput = document.getElementById('dtd-filename');
    const overwriteInput = document.getElementById('dtd-overwrite');
    const hfTokenInput = document.getElementById('dtd-hf-token');

    const url = (urlInput?.value || '').trim();
    const selectedRootValue = (rootInput?.value || '').trim();
    const folder = (folderInput?.value || '').trim();
    const subdirectory = (subdirInput?.value || '').trim();
    const selectedRecentFolder = selectedRootValue.startsWith('recent:')
      ? selectedRootValue.slice('recent:'.length)
      : '';

    const effectiveFolder = folder || selectedRecentFolder;
    const effectiveRootKey = selectedRootValue.startsWith('recent:')
      ? ''
      : selectedRootValue;

    return {
      url,
      selected_root_value: selectedRootValue,
      root_key: effectiveRootKey,
      folder: effectiveFolder,
      subdirectory,
      filename: (filenameInput?.value || '').trim(),
      overwrite: Boolean(overwriteInput?.checked),
      huggingface_token: (hfTokenInput?.value || '').trim(),
    };
  }

  function prefillFromHistory(entry) {
    if (!entry) return;

    const urlInput = document.getElementById('dtd-url');
    const rootInput = document.getElementById('dtd-root');
    const folderInput = document.getElementById('dtd-folder');
    const subdirInput = document.getElementById('dtd-subdir');
    const filenameInput = document.getElementById('dtd-filename');
    const overwriteInput = document.getElementById('dtd-overwrite');
    const advanced = document.getElementById('dtd-advanced');

    if (urlInput) urlInput.value = entry.url || '';
    if (folderInput)
      folderInput.value = getEntryPath(entry) || entry.folder || '';
    if (subdirInput) subdirInput.value = entry.subdirectory || '';
    if (filenameInput) filenameInput.value = entry.filename || '';
    if (overwriteInput) overwriteInput.checked = Boolean(entry.overwrite);

    if (rootInput) {
      const candidateValues = [
        entry.selected_root_value,
        entry.root_key,
      ].filter((value) => Boolean(value));
      for (const candidate of candidateValues) {
        const hasOption = Array.from(rootInput.options).some(
          (opt) => opt.value === candidate,
        );
        if (hasOption) {
          rootInput.value = candidate;
          break;
        }
      }
    }

    if (advanced && !advanced.open) {
      advanced.open = true;
      writeSessionBoolean(ADVANCED_OPEN_KEY, true);
    }

    setStatus(
      'Prefilled failed download. Update destination if needed, then click Download.',
    );
  }

  async function deleteFileFromHistory(entry) {
    const deletePath = getEntryPath(entry);
    if (!deletePath) {
      setStatus('This history entry does not have a saved file path.', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Delete this file from disk?\n\n${deletePath}`,
    );
    if (!confirmed) return;

    setStatus('Deleting file...');
    const resp = await apiFetch('/download-to-dir/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: deletePath }),
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(
        formatApiError(resp.status, data, `Delete failed (${resp.status})`),
      );
    }

    removeHistoryEntry(entry.id);
    if (Boolean(data.deleted)) {
      setStatus(`Deleted ${deletePath}`, 'success');
    } else {
      setStatus(
        'File was already missing. Removed entry from history.',
        'success',
      );
    }
  }

  function setStatusForJob(jobId, message, type = '') {
    if (state.statusJobId && state.statusJobId !== jobId) return;
    setStatus(message, type);
  }

  async function pollDownloadProgress(jobId) {
    while (true) {
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
      updateActiveJob(jobId, {
        status,
        bytes_written: bytesWritten,
        total_bytes: totalBytes,
        progress_percent: Number.isFinite(percent) ? percent : null,
      });

      if (status === 'queued') {
        setStatusForJob(jobId, 'Queued...');
      } else if (status === 'running') {
        if (Number.isFinite(totalBytes) && totalBytes > 0) {
          const progressPct = Number.isFinite(percent)
            ? percent.toFixed(1)
            : '0.0';
          setStatusForJob(
            jobId,
            `Downloading... ${formatBytes(bytesWritten)} / ${formatBytes(totalBytes)} (${progressPct}%)`,
          );
        } else {
          setStatusForJob(
            jobId,
            `Downloading... ${formatBytes(bytesWritten)} downloaded`,
          );
        }
      } else if (status === 'completed') {
        return data;
      } else if (status === 'failed') {
        throw new Error(String(data.error || 'Download failed.'));
      }

      await sleep(350);
    }
  }

  async function loadRoots() {
    const select = document.getElementById('dtd-root');
    if (!select) return;

    setStatus('Loading destinations...');

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
    const attempt = readDownloadFormValues();
    let trackedJobId = '';

    if (!attempt.url || (!attempt.root_key && !attempt.folder)) {
      setStatus('URL and destination are required.', 'error');
      return;
    }

    setStatus('Starting download...');

    const payload = {
      url: attempt.url,
      root_key: attempt.root_key,
      folder: attempt.folder,
      subdirectory: attempt.subdirectory,
      filename: attempt.filename,
      overwrite: attempt.overwrite,
      huggingface_token: attempt.huggingface_token,
    };

    try {
      const startResp = await apiFetch('/download-to-dir/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const startData = await startResp.json().catch(() => ({}));

      if (!startResp.ok) {
        const message = maybeFormatHuggingFaceAuthError(
          attempt.url,
          formatApiError(
            startResp.status,
            startData,
            `Download failed (${startResp.status})`,
          ),
        );
        setStatus(message, 'error');
        addHistoryEntry({
          ...attempt,
          status: 'failed',
          error: message,
        });
        return;
      }

      const jobId = String(startData.job_id || '').trim();
      if (!jobId) {
        const message = 'Download did not return a tracking job id.';
        setStatus(message, 'error');
        addHistoryEntry({
          ...attempt,
          status: 'failed',
          error: message,
        });
        return;
      }

      trackedJobId = jobId;
      state.statusJobId = jobId;
      state.activeDownloadCount += 1;
      updateActiveJob(jobId, {
        started_at: Date.now(),
        status: 'queued',
        bytes_written: 0,
        total_bytes: null,
        progress_percent: 0,
        destination_path: String(startData.destination_path || ''),
        file_name: inferActiveDisplayName(
          attempt.url,
          String(startData.destination_path || ''),
        ),
      });
      setStatus('Download started. You can queue another file now.');

      const done = await pollDownloadProgress(jobId);
      const mb = Number(done.bytes_written || 0) / (1024 * 1024);
      const recentFolder =
        normalizeFolderValue(attempt.folder) ||
        normalizeFolderValue(
          `${attempt.root_key}${attempt.subdirectory ? `/${attempt.subdirectory}` : ''}`,
        );
      saveRecentFolder(recentFolder);
      renderRootOptions();

      addHistoryEntry({
        ...attempt,
        status: 'success',
        destination_path: String(done.destination_path || ''),
        bytes_written: Number(done.bytes_written || 0),
      });

      const refreshResult = await triggerNodeDefinitionsRefresh();
      const refreshSuffix = refreshResult
        ? ' Node definitions refreshed.'
        : ' Download complete. Press R to refresh node definitions.';
      setStatusForJob(
        jobId,
        `Saved to ${done.destination_path} (${mb.toFixed(2)} MB).${refreshSuffix}`,
        'success',
      );
    } catch (err) {
      const message = maybeFormatHuggingFaceAuthError(
        attempt.url,
        err?.message || String(err),
      );
      if (trackedJobId) {
        setStatusForJob(trackedJobId, message, 'error');
      } else {
        setStatus(message, 'error');
      }
      addHistoryEntry({
        ...attempt,
        status: 'failed',
        error: message,
      });
    } finally {
      if (trackedJobId) {
        state.activeDownloadCount = Math.max(0, state.activeDownloadCount - 1);
        removeActiveJob(trackedJobId);
      }
      if (trackedJobId && state.statusJobId === trackedJobId) {
        state.statusJobId = '';
      }
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
    writeHistoryEntries(readHistoryEntries());

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
            <label>Destination</label>
            <select id="dtd-root"></select>
          </div>

          <div class="field">
            <details id="dtd-advanced" class="section advanced">
              <summary>Advanced</summary>
              <div class="advanced-body">
                <div class="field">
                  <label>Folder (optional, from ComfyUI root)</label>
                  <input id="dtd-folder" type="text" placeholder="models/checkpoints or any/relative/path" />
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
                  <label>Hugging Face token (optional)</label>
                  <input id="dtd-hf-token" type="password" placeholder="hf_... (for gated/private Hugging Face downloads)" autocomplete="off" />
                  <p class="hint">Only needed for gated/private Hugging Face files.</p>
                </div>

                <div class="field">
                  <label class="inline">
                    <input id="dtd-overwrite" type="checkbox" />
                    Overwrite existing file
                  </label>
                </div>
              </div>
            </details>
          </div>

          <div class="field">
            <details class="section history">
              <summary>History (Session)</summary>
              <div class="history-body">
                <p id="dtd-history-empty" class="history-empty">No downloads in this session yet.</p>
                <div id="dtd-history-list" class="history-list"></div>
              </div>
            </details>
          </div>

          <div class="field">
            <details id="dtd-active" class="section active" open>
              <summary>Active Downloads</summary>
              <div class="active-body">
                <p id="dtd-active-empty" class="active-empty">No active downloads.</p>
                <div id="dtd-active-list" class="active-list"></div>
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

    const advanced = document.getElementById('dtd-advanced');
    if (advanced instanceof HTMLDetailsElement) {
      advanced.open = readSessionBoolean(ADVANCED_OPEN_KEY, false);
      advanced.addEventListener('toggle', () => {
        writeSessionBoolean(ADVANCED_OPEN_KEY, advanced.open);
      });
    }

    const hfTokenInput = document.getElementById('dtd-hf-token');
    if (hfTokenInput instanceof HTMLInputElement) {
      const savedToken = String(readSessionJson(HF_TOKEN_KEY, '') || '');
      hfTokenInput.value = savedToken;
      hfTokenInput.addEventListener('input', () => {
        writeSessionJson(HF_TOKEN_KEY, String(hfTokenInput.value || '').trim());
      });
    }

    renderHistory();
    renderActiveDownloads();

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

    const historyList = document.getElementById('dtd-history-list');
    if (historyList) {
      historyList.addEventListener('input', (event) => {
        const input =
          event.target instanceof Element
            ? event.target.closest('input[data-action="edit-path"][data-id]')
            : null;
        if (!(input instanceof HTMLInputElement)) return;
        const entryId = input.dataset.id || '';
        const updatedPath = String(input.value || '').trim();
        writeHistoryEntries(
          state.historyEntries.map((entry) => {
            if (entry.id !== entryId) return entry;
            return { ...entry, path: updatedPath };
          }),
        );
      });

      historyList.addEventListener('click', (event) => {
        const button =
          event.target instanceof Element
            ? event.target.closest('button[data-action][data-id]')
            : null;
        if (!button) return;

        const action = button.getAttribute('data-action') || '';
        const entryId = button.getAttribute('data-id') || '';
        const entry = getHistoryEntry(entryId);
        if (!entry) return;

        if (action === 'remove-entry') {
          removeHistoryEntry(entryId);
          return;
        }

        if (action === 'retry-entry') {
          prefillFromHistory(entry);
          return;
        }

        if (action === 'delete-file') {
          deleteFileFromHistory(entry).catch((err) => {
            setStatus(err.message || String(err), 'error');
          });
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
    startHotReloadWatcher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
