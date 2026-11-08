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
 * Style Spy - Popup Script
 */

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return [...document.querySelectorAll(sel)]; }

function sendMessage(type, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, data }, resolve);
  });
}

function sendToContentScript(type, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { reject(new Error('No tab')); return; }
      chrome.tabs.sendMessage(tabs[0].id, { type, data }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
  });
}

function showToast(message, type = 'success') {
  const existing = $('.ss-toast-popup');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `ss-toast-popup ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Check if content script is loaded
  try {
    const response = await sendToContentScript('PING');
    if (response?.pong) {
      $('#statusText').textContent = 'Inspector ready';
      $('#btnCopyStyles').disabled = false;
    }
  } catch (e) {
    $('#statusText').textContent = 'Refresh page to activate';
  }

  // Load stats
  loadStats();

  // Button events
  $('#btnActivate').addEventListener('click', async () => {
    try {
      await sendToContentScript('ACTIVATE_INSPECTOR');
      $('#statusText').textContent = 'Inspector active - hover elements';
      showToast('Style Inspector activated');
      window.close();
    } catch (e) {
      showToast('Please refresh the page first', 'error');
    }
  });

  $('#btnCopyStyles').addEventListener('click', async () => {
    try {
      await sendToContentScript('COPY_STYLES');
      showToast('Styles copied to clipboard');
    } catch (e) {
      showToast('No element selected', 'error');
    }
  });

  $('#btnOpenPanel').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
    window.close();
  });

  $('#btnSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  $('#btnHelp').addEventListener('click', () => {
    showModal(`
      <div class="modal">
        <div class="modal-header">
          <h3>Keyboard Shortcuts</h3>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body">
          <div class="shortcut-item"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd><span>Toggle Inspector</span></div>
          <div class="shortcut-item"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd><span>Copy Computed Styles</span></div>
          <div class="shortcut-item"><kbd>Esc</kbd><span>Close Inspector</span></div>
        </div>
      </div>
    `);
  });
});

async function loadStats() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) return;

    // Inject script to get stats
    await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        const elements = document.querySelectorAll('*').length;
        const stylesheets = document.styleSheets.length;
        let rules = 0;
        try {
          for (const sheet of document.styleSheets) {
            try { rules += sheet.cssRules?.length || 0; } catch {}
          }
        } catch {}
        return { elements, stylesheets, rules };
      }
    }, (results) => {
      if (results && results[0]?.result) {
        const { elements, stylesheets, rules } = results[0].result;
        $('#statElements').textContent = elements.toLocaleString();
        $('#statStylesheets').textContent = stylesheets;
        $('#statRules').textContent = rules.toLocaleString();
      }
    });
  } catch (e) {}
}

function showModal(html) {
  const existing = $('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function closeModal() {
  $('.modal-overlay')?.remove();
}

// Add toast styles
const style = document.createElement('style');
style.textContent = `
  .ss-toast-popup {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%) translateY(100px);
    background: var(--bg-secondary); color: var(--text); padding: 10px 16px;
    border-radius: var(--radius-sm); box-shadow: var(--shadow); z-index: 10000;
    font-size: 12px; border: 1px solid var(--border); opacity: 0; transition: all 0.3s;
  }
  .ss-toast-popup.show { transform: translateX(-50%) translateY(0); opacity: 1; }
  .ss-toast-popup.success { border-color: var(--primary); }
  .ss-toast-popup.error { border-color: var(--danger); }

  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex;
    align-items: center; justify-content: center; z-index: 10000; padding: 20px;
  }
  .modal { width: 100%; max-width: 320px; background: var(--bg); border-radius: var(--radius);
    box-shadow: 0 24px 64px rgba(0,0,0,0.3); overflow: hidden; }
  .modal-header { display: flex; align-items: center; justify-content: space-between;
    padding: 16px; border-bottom: 1px solid var(--border); }
  .modal-close { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: var(--text-muted); font-size: 20px; cursor: pointer; }
  .modal-body { padding: 16px; }
  .shortcut-item { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
  .shortcut-item kbd {
    display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px;
    padding: 0 8px; font-family: inherit; font-size: 11px; font-weight: 600; color: var(--text);
    background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px;
  }
  .shortcut-item span { color: var(--text-secondary); font-size: 13px; }
`;
document.head.appendChild(style);