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
 * Tab Goblin - Popup Script
 */

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return [...document.querySelectorAll(sel)]; }

function sendMessage(type, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, data }, resolve);
  });
}

function showToast(message, type = 'success') {
  const existing = $('.tg-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `tg-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2500);
}

function formatUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '') + u.pathname;
  } catch { return url; }
}

function getFaviconInitial(url) {
  try {
    const u = new URL(url);
    return u.hostname.charAt(0).toUpperCase();
  } catch { return '?'; }
}

document.addEventListener('DOMContentLoaded', async () => {
  loadTabs();
  loadStats();
  loadSuspendedCount();

  // Search
  let searchDebounce;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => filterTabs(e.target.value), 150);
  });

  $('#btnClearSearch').addEventListener('click', () => {
    $('#searchInput').value = '';
    filterTabs('');
  });

  // Toolbar
  $('#btnOpenPanel').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
    window.close();
  });

  $('#btnSuspend').addEventListener('click', async () => {
    const resp = await sendMessage('SUSPEND_TABS');
    if (resp.success) {
      showToast(`Suspended ${resp.data.count} tabs`);
      loadTabs();
      loadStats();
      loadSuspendedCount();
    }
  });

  // Quick actions
  $('#btnSaveSession').addEventListener('click', async () => {
    const name = prompt('Session name:', `Session ${new Date().toLocaleString()}`);
    if (name) {
      const resp = await sendMessage('SAVE_SESSION', { name });
      if (resp.success) showToast('Session saved');
    }
  });

  $('#btnRestoreAll').addEventListener('click', async () => {
    const resp = await sendMessage('RESTORE_ALL_SUSPENDED');
    if (resp.success) {
      showToast(`Restored ${resp.data.count} tabs`);
      loadTabs();
      loadStats();
      loadSuspendedCount();
    }
  });

  $('#btnSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.close();
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      $('#searchInput').focus();
    }
  });

  // Add toast styles
  const style = document.createElement('style');
  style.textContent = `
    .tg-toast {
      position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%) translateY(100px);
      background: var(--bg-secondary); color: var(--text); padding: 10px 16px;
      border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); z-index: 10000;
      font-size: 12px; border: 1px solid var(--border); opacity: 0; transition: all 0.3s;
    }
    .tg-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
    .tg-toast.success { border-color: var(--secondary); }
    .tg-toast.error { border-color: var(--danger); }
  `;
  document.head.appendChild(style);
});

async function loadTabs() {
  try {
    const resp = await sendMessage('GET_TABS');
    if (resp.success) {
      renderTabs(resp.data);
    }
  } catch (e) {
    console.error('[Tab Goblin] Failed to load tabs:', e);
  }
}

async function loadStats() {
  try {
    const [tabsResp, groupsResp] = await Promise.all([
      sendMessage('GET_TABS'),
      sendMessage('GET_GROUPS')
    ]);
    if (tabsResp.success) {
      const tabs = tabsResp.data;
      $('#statTotal').textContent = tabs.length;
      $('#statPinned').textContent = tabs.filter(t => t.pinned).length;
    }
    if (groupsResp.success) {
      $('#statGroups').textContent = groupsResp.data.length;
    }
  } catch (e) {}
}

async function loadSuspendedCount() {
  try {
    const resp = await sendMessage('GET_SUSPENDED');
    if (resp.success) {
      $('#statSuspended').textContent = resp.data.length;
    }
  } catch (e) {}
}

let allTabs = [];

function renderTabs(tabs) {
  allTabs = tabs;
  filterTabs($('#searchInput').value || '');
}

function filterTabs(query) {
  const lowerQuery = query.toLowerCase();
  const filtered = allTabs.filter(t =>
    !query || t.title.toLowerCase().includes(lowerQuery) || t.url.toLowerCase().includes(lowerQuery)
  );

  const container = $('#tabList');
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">${query ? 'No matching tabs' : 'No tabs in this window'}</div>`;
    return;
  }

  container.innerHTML = filtered.map(tab => `
    <div class="tab-item ${tab.active ? 'active' : ''} ${tab.pinned ? 'pinned' : ''}" data-tab-id="${tab.id}" data-window-id="${tab.windowId}">
      ${tab.favIconUrl ?
        `<img class="tab-favicon" src="${tab.favIconUrl}" alt="">` :
        `<div class="tab-favicon-placeholder">${getFaviconInitial(tab.url)}</div>`
      }
      <div class="tab-info">
        <div class="tab-title" title="${tab.title}">${tab.title || 'Untitled'}</div>
        <div class="tab-url" title="${tab.url}">${formatUrl(tab.url)}</div>
      </div>
      <div class="tab-badges">
        ${tab.pinned ? '<span class="badge badge-pinned">Pinned</span>' : ''}
        ${tab.groupId !== -1 ? `<span class="badge badge-group">Group</span>` : ''}
        ${tab.audible ? '<span class="badge badge-audio">Audio</span>' : ''}
      </div>
      <div class="tab-actions">
        <button class="tab-action-btn" data-action="activate" title="Activate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </button>
        <button class="tab-action-btn ${tab.pinned ? '' : ''}" data-action="${tab.pinned ? 'unpin' : 'pin'}" title="${tab.pinned ? 'Unpin' : 'Pin'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5"></path><path d="M9 10h6a5 5 0 0 1 0 10H9z"></path></svg>
        </button>
        <button class="tab-action-btn danger" data-action="close" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </div>
  `).join('');

  // Event delegation
  container.onclick = async (e) => {
    const item = e.target.closest('.tab-item');
    if (!item) return;

    const tabId = parseInt(item.dataset.tabId);
    const windowId = parseInt(item.dataset.windowId);
    const action = e.target.closest('.tab-action-btn')?.dataset.action;

    if (action) {
      e.stopPropagation();
      if (action === 'activate') {
        await chrome.tabs.update(tabId, { active: true });
        await chrome.windows.update(windowId, { focused: true });
        window.close();
      } else if (action === 'pin') {
        await sendMessage('PIN_TABS', { tabIds: [tabId] });
        showToast('Tab pinned');
        loadTabs();
        loadStats();
      } else if (action === 'unpin') {
        await sendMessage('UNPIN_TABS', { tabIds: [tabId] });
        showToast('Tab unpinned');
        loadTabs();
        loadStats();
      } else if (action === 'close') {
        await sendMessage('CLOSE_TABS', { tabIds: [tabId] });
        showToast('Tab closed');
        loadTabs();
        loadStats();
      }
    } else {
      // Click on tab item - activate
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(windowId, { focused: true });
      window.close();
    }
  };
}