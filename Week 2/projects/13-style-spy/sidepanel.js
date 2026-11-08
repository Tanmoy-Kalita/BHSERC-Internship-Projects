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
 * Style Spy - Side Panel Script
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
  const container = $('#toastContainer') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.style.cssText = `
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    z-index: 10000; display: flex; flex-direction: column; gap: 8px; pointer-events: none;
  `;
  document.body.appendChild(container);
  return container;
}

document.addEventListener('DOMContentLoaded', async () => {
  $('#btnActivate').addEventListener('click', async () => {
    try {
      await sendToContentScript('ACTIVATE_INSPECTOR');
      showToast('Inspector activated');
      window.close();
    } catch (e) {
      showToast('Please refresh the page first', 'error');
    }
  });

  $('#btnExtractAll').addEventListener('click', async () => {
    try {
      const response = await sendToContentScript('EXTRACT_DESIGN_SYSTEM');
      if (response?.success) {
        renderDesignSystem(response.data);
        showToast('Design system extracted');
      }
    } catch (e) {
      showToast('Please activate inspector first', 'error');
    }
  });

  $('#btnExportDesign').addEventListener('click', async () => {
    try {
      const response = await sendToContentScript('EXTRACT_DESIGN_SYSTEM');
      if (response?.success) {
        exportDesignSystem(response.data);
        showToast('Design system exported');
      }
    } catch (e) {
      showToast('No design system to export', 'error');
    }
  });

  $('#btnClose').addEventListener('click', () => window.close());
});

function renderDesignSystem(data) {
  // Colors
  const colorGrid = $('#colorGrid');
  if (data.colors?.length) {
    colorGrid.innerHTML = data.colors.map(c => `
      <div class="color-item">
        <div class="color-swatch" style="background: ${c.value}"></div>
        <div class="color-info">
          <span class="color-hex">${c.value}</span>
          <span class="color-usage">${c.count} uses</span>
        </div>
      </div>
    `).join('');
  }

  // Typography
  const typoList = $('#typographyList');
  if (data.typography?.length) {
    typoList.innerHTML = data.typography.map(t => `
      <div class="typography-item">
        <div class="typography-font" style="font-family: '${t.fontFamily}'; font-size: ${t.fontSize}; font-weight: ${t.fontWeight};">
          ${t.fontFamily}
        </div>
        <div class="typography-meta">
          <span>${t.fontSize}</span>
          <span>${t.fontWeight}</span>
          <span>${t.lineHeight}</span>
          <span>${t.count} uses</span>
        </div>
      </div>
    `).join('');
  }

  // Spacing
  const spacingList = $('#spacingList');
  if (data.spacing?.length) {
    spacingList.innerHTML = data.spacing.map(s => `
      <div class="spacing-item">
        <div class="spacing-value">${s.value}</div>
        <div class="spacing-label">${s.property} · ${s.count} uses</div>
      </div>
    `).join('');
  }

  // Shadows
  const shadowList = $('#shadowList');
  if (data.shadows?.length) {
    shadowList.innerHTML = data.shadows.map(s => `
      <div class="shadow-item">
        <div class="shadow-preview" style="box-shadow: ${s.value}"></div>
        <div class="shadow-code">${s.value}</div>
      </div>
    `).join('');
  }
}

function exportDesignSystem(data) {
  const exportData = {
    ...data,
    url: window.location.href,
    timestamp: Date.now()
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `style-spy-design-system-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

console.log('[Style Spy] Side panel loaded');