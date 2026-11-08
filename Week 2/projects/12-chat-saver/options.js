// --- Standalone Browser Testing & Extension Polyfill Shim ---
(function() {
  if (typeof window.chrome === 'undefined') window.chrome = {};
  if (!chrome.runtime || !chrome.runtime.id) {
    chrome.runtime = {
      id: 'mock-extension-preview',
      getURL: (path) => path,
      sendMessage: (msg, cb) => {
        console.log('[Mock chrome.runtime.sendMessage]', msg);
        if (cb) cb({ status: 'ok', success: true });
        return Promise.resolve({ status: 'ok', success: true });
      },
      onMessage: {
        addListener: () => {},
        removeListener: () => {}
      }
    };
  }
  if (!chrome.storage || !chrome.storage.local) {
    let memoryStore = {};
    try {
      const saved = localStorage.getItem('__mock_ext_store__');
      if (saved) memoryStore = JSON.parse(saved);
    } catch(e) {}

    const makeArea = () => ({
      get: (keys, cb) => {
        let result = {};
        if (typeof keys === 'string') {
          result[keys] = memoryStore[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach(k => result[k] = memoryStore[k]);
        } else if (keys && typeof keys === 'object') {
          for (let k in keys) {
            result[k] = (memoryStore[k] !== undefined) ? memoryStore[k] : keys[k];
          }
        } else {
          result = { ...memoryStore };
        }
        if (cb) cb(result);
        return Promise.resolve(result);
      },
      set: (items, cb) => {
        Object.assign(memoryStore, items);
        try { localStorage.setItem('__mock_ext_store__', JSON.stringify(memoryStore)); } catch(e) {}
        if (cb) cb();
        return Promise.resolve();
      },
      remove: (keys, cb) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach(k => delete memoryStore[k]);
        try { localStorage.setItem('__mock_ext_store__', JSON.stringify(memoryStore)); } catch(e) {}
        if (cb) cb();
        return Promise.resolve();
      },
      clear: (cb) => {
        memoryStore = {};
        try { localStorage.removeItem('__mock_ext_store__'); } catch(e) {}
        if (cb) cb();
        return Promise.resolve();
      }
    });

    chrome.storage = {
      local: makeArea(),
      sync: makeArea(),
      onChanged: { addListener: () => {} }
    };
  }

  if (!chrome.tabs) {
    chrome.tabs = {
      query: (opts, cb) => {
        const sampleTabs = [{
          id: 101,
          url: 'https://www.youtube.com/watch?v=mock_video',
          title: 'Physics Lecture · Carnot Engine & Thermodynamics',
          active: true,
          windowId: 1
        }];
        if (cb) cb(sampleTabs);
        return Promise.resolve(sampleTabs);
      },
      sendMessage: (id, msg, cb) => {
        if (cb) cb({ success: true, timestamp: 760 });
        return Promise.resolve({ success: true, timestamp: 760 });
      },
      create: (opts, cb) => {
        window.open(opts.url, '_blank');
        if (cb) cb({ id: 102, ...opts });
        return Promise.resolve({ id: 102, ...opts });
      },
      discard: (id, cb) => {
        if (cb) cb({ id, discarded: true });
        return Promise.resolve({ id, discarded: true });
      }
    };
  }

  if (!chrome.sidePanel) {
    chrome.sidePanel = {
      open: () => window.open('sidepanel.html', '_blank')
    };
  }
})();
// -----------------------------------------------------------

/**
 * Chat Saver - Options Page Script
 */

// ============ STATE ============
let settings = {};
let allConversations = [];

const DEFAULT_SETTINGS = {
  theme: 'system',
  exportFormat: 'markdown',
  maxConversations: 1000,
  autoSave: false,
  showBadge: true
};

const PLATFORMS = [
  { id: 'chatgpt', name: 'ChatGPT', domain: 'chat.openai.com', icon: '💚', color: '#2563eb' },
  { id: 'claude', name: 'Claude', domain: 'claude.ai', icon: '🍊', color: '#d97706' },
  { id: 'bard', name: 'Bard', domain: 'bard.google.com', icon: '💜', color: '#db2777' },
  { id: 'gemini', name: 'Gemini', domain: 'gemini.google.com', icon: '💠', color: '#9333ea' },
  { id: 'mistral', name: 'Mistral', domain: 'chat.mistral.ai', icon: '💚', color: '#059669' },
  { id: 'pi', name: 'Pi', domain: 'pi.ai', icon: '🧡', color: '#ea580c' },
  { id: 'you', name: 'You.com', domain: 'you.com', icon: '💚', color: '#16a34a' },
  { id: 'perplexity', name: 'Perplexity', domain: 'perplexity.ai', icon: '💜', color: '#7c3aed' }
];

// ============ UTILITIES ============
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return [...document.querySelectorAll(sel)]; }

function sendMessage(type, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, data }, resolve);
  });
}

function showToast(message, type = 'success') {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${message} <button onclick="this.parentElement.remove()">×</button>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}

function showModal(content) {
  const overlay = $('#modalOverlay');
  const modal = $('#modalContent');
  modal.innerHTML = content;
  overlay.style.display = 'flex';
  return new Promise((resolve) => {
    overlay.onclick = (e) => {
      if (e.target === overlay) { closeModal(); resolve(false); }
    };
    window._modalResolve = resolve;
  });
}

function closeModal() {
  $('#modalOverlay').style.display = 'none';
  if (window._modalResolve) { window._modalResolve(false); window._modalResolve = null; }
}

// ============ LOAD SETTINGS ============
async function loadSettings() {
  try {
    const response = await sendMessage('GET_SETTINGS');
    if (response.success) {
      settings = { ...DEFAULT_SETTINGS, ...response.settings };
    } else {
      settings = { ...DEFAULT_SETTINGS };
    }
    applySettingsToUI();
  } catch (e) {
    settings = { ...DEFAULT_SETTINGS };
    applySettingsToUI();
  }
}

function applySettingsToUI() {
  $('#settingTheme').value = settings.theme;
  $('#settingExportFormat').value = settings.exportFormat;
  $('#settingMaxConvs').value = settings.maxConversations;
  $('#settingAutoSave').checked = settings.autoSave;
  $('#settingShowBadge').checked = settings.showBadge;
}

// ============ LOAD STATS ============
async function loadStats() {
  try {
    const response = await sendMessage('GET_CONVERSATIONS');
    if (response.success) {
      allConversations = response.conversations;

      const platforms = new Set(allConversations.map(c => c.platformDomain)).size;
      const bytes = await chrome.storage.local.getBytesInUse();

      $('#statConversations').textContent = allConversations.length;
      $('#statStorage').textContent = `${(bytes / 1024).toFixed(1)} KB`;
      $('#statPlatforms').textContent = platforms;
    }
  } catch (e) {}
}

// ============ RENDER PLATFORMS ============
function renderPlatforms() {
  const grid = $('#platformGrid');
  grid.innerHTML = PLATFORMS.map(p => `
    <div class="platform-card ${p.id}">
      <div class="platform-icon">${p.icon}</div>
      <div class="platform-name">${p.name}</div>
      <div class="platform-status">
        <span>Supported</span>
      </div>
    </div>
  `).join('');
}

// ============ SAVE SETTINGS ============
async function saveSettings() {
  const newSettings = {
    theme: $('#settingTheme').value,
    exportFormat: $('#settingExportFormat').value,
    maxConversations: parseInt($('#settingMaxConvs').value) || 1000,
    autoSave: $('#settingAutoSave').checked,
    showBadge: $('#settingShowBadge').checked
  };

  try {
    await sendMessage('UPDATE_SETTINGS', newSettings);
    settings = newSettings;
    showToast('Settings saved successfully');
  } catch (e) {
    showToast('Failed to save settings', 'error');
  }
}

// ============ RESET SETTINGS ============
async function resetSettings() {
  const confirmed = await showModal(`
    <div class="modal confirm-dialog">
      <div class="modal-body">
        <div class="confirm-icon warning">⚠️</div>
        <h3>Reset Settings</h3>
        <p>This will reset all settings to their default values. Your conversations will not be affected.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmReset()">Reset</button>
      </div>
    </div>
  `);

  window._confirmReset = async () => {
    closeModal();
    settings = { ...DEFAULT_SETTINGS };
    applySettingsToUI();
    await sendMessage('UPDATE_SETTINGS', settings);
    showToast('Settings reset to defaults');
  };
}

// ============ EXPORT ALL ============
async function exportAllData() {
  const modalContent = `
    <div class="modal-header">
      <h3>Export All Data</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Format</label>
        <div class="export-options" id="exportOptions">
          <label class="export-option">
            <input type="radio" name="exportFormat" value="json" checked>
            <div class="export-option-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div class="export-option-info">
              <div class="export-option-title">JSON (Full Backup)</div>
              <div class="export-option-desc">Complete data with all metadata - recommended for backups</div>
            </div>
          </label>
          <label class="export-option">
            <input type="radio" name="exportFormat" value="markdown">
            <div class="export-option-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div class="export-option-info">
              <div class="export-option-title">Markdown</div>
              <div class="export-option-desc">Human-readable format for notes</div>
            </div>
          </label>
          <label class="export-option">
            <input type="radio" name="exportFormat" value="html">
            <div class="export-option-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div class="export-option-info">
              <div class="export-option-title">HTML</div>
              <div class="export-option-desc">Viewable in browser with styling</div>
            </div>
          </label>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="performExport()">Export</button>
    </div>
  `;

  showModal(modalContent);

  $$('.export-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const input = opt.querySelector('input');
      if (input) {
        input.checked = true;
        $$('.export-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      }
    });
  });

  window._performExport = async () => {
    const format = $('input[name="exportFormat"]:checked')?.value || 'json';
    closeModal();

    try {
      const response = await sendMessage('EXPORT_CONVERSATIONS', { format });
      if (response.success) {
        const mimeTypes = { json: 'application/json', markdown: 'text/markdown', html: 'text/html' };
        const extensions = { json: 'json', markdown: 'md', html: 'html' };
        const filename = `chatsaver-backup-${new Date().toISOString().split('T')[0]}.${extensions[format]}`;

        await sendMessage('DOWNLOAD_EXPORT', {
          content: response.data,
          filename,
          mimeType: mimeTypes[format]
        });

        showToast(`Exported ${allConversations.length} conversations as ${format.toUpperCase()}`);
      }
    } catch (e) {
      showToast('Export failed', 'error');
    }
  };
}

// ============ IMPORT DATA ============
async function importData() {
  const modalContent = `
    <div class="modal-header">
      <h3>Import Data</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="dropzone" id="dropzone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <p>Drop JSON backup file here</p>
        <small>or click to select .json file</small>
        <input type="file" id="importFile" accept=".json" style="display:none;">
      </div>
      <div id="importPreview" style="display:none; margin-top:16px; padding:12px; background:var(--bg); border-radius:var(--radius); font-size:12px; color:var(--text-secondary);"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btnImportConfirm" onclick="performImport()" disabled>Import</button>
    </div>
  `;

  showModal(modalContent);

  const dropzone = $('#dropzone');
  const fileInput = $('#importFile');
  const preview = $('#importPreview');
  const btnConfirm = $('#btnImportConfirm');
  let importData = null;

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        importData = data;
        preview.style.display = 'block';
        if (data.conversations) {
          preview.innerHTML = `Ready to import <strong>${data.conversations.length}</strong> conversations from backup`;
        } else if (data.version && data.conversations) {
          preview.innerHTML = `Valid Chat Saver backup (v${data.version}) with <strong>${data.conversations.length}</strong> conversations`;
        } else {
          preview.innerHTML = `JSON file loaded. Structure may not be compatible.`;
        }
        btnConfirm.disabled = false;
      } catch (err) {
        preview.style.display = 'block';
        preview.innerHTML = `Error reading file: ${err.message}`;
        btnConfirm.disabled = true;
      }
    };
    reader.readAsText(file);
  }

  window._performImport = async () => {
    if (!importData?.conversations) {
      showToast('Invalid backup file format', 'error');
      return;
    }

    closeModal();
    let imported = 0;
    let skipped = 0;

    for (const conv of importData.conversations) {
      const result = await sendMessage('SAVE_CONVERSATION', conv);
      if (result.success) imported++;
      else skipped++;
    }

    showToast(`Imported ${imported} conversations${skipped ? ` (${skipped} skipped)` : ''}`);
    loadStats();
  };
}

// ============ CLEAR ALL DATA ============
async function clearAllData() {
  const confirmed = await showModal(`
    <div class="modal confirm-dialog">
      <div class="modal-body">
        <div class="confirm-icon danger">🗑️</div>
        <h3>Clear All Data</h3>
        <p>This will permanently delete <strong>all ${allConversations.length} conversations</strong> and reset settings. This cannot be undone.</p>
        <p style="margin-top: 12px; font-size: 12px; color: var(--text-muted);">Type "DELETE" to confirm:</p>
        <input type="text" id="confirmInput" class="form-input" placeholder="Type DELETE to confirm" style="margin-top: 8px; text-align: center; font-weight: 600;">
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn" style="background:var(--danger);color:white;" id="btnConfirmDelete" onclick="confirmClearAll()" disabled>Delete Everything</button>
      </div>
    </div>
  `);

  const input = $('#confirmInput');
  const btn = $('#btnConfirmDelete');

  input.addEventListener('input', () => {
    btn.disabled = input.value !== 'DELETE';
  });

  input.focus();

  window._confirmClearAll = async () => {
    closeModal();
    await sendMessage('CLEAR_ALL_DATA');
    allConversations = [];
    loadStats();
    showToast('All data cleared');
  };
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadStats();
  renderPlatforms();

  // Save button
  $('#btnSave').addEventListener('click', saveSettings);

  // Reset button
  $('#btnReset').addEventListener('click', resetSettings);

  // Export button
  $('#btnExportAll').addEventListener('click', exportAllData);

  // Import button
  $('#btnImportData').addEventListener('click', importData);

  // Clear all button
  $('#btnClearAll').addEventListener('click', clearAllData);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modalOverlay').style.display === 'flex') {
      closeModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveSettings();
    }
  });
});

console.log('[Chat Saver] Options page loaded');