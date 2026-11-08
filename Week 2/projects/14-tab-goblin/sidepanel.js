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
 * Tab Goblin - Side Panel Script
 */

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return [...document.querySelectorAll(sel)]; }

function sendMessage(type, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, data }, resolve);
  });
}

function showToast(message, type = 'info') {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function formatUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch { return url; }
}

let selectedTabIds = new Set();
let currentView = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
});

async function initApp() {
  loadTabsView();
  loadQuickStats();
}

function setupEventListeners() {
  // View switcher
  $$('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.view-tab').forEach(t => t.classList.remove('active'));
      $$('.tab-view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      currentView = tab.dataset.view;
      $(`#view${currentView.charAt(0).toUpperCase() + currentView.slice(1)}`).classList.add('active');
      loadCurrentView();
    });
  });

  // Search
  let searchTimeout;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => filterTabs(e.target.value), 150);
  });

  $('#btnRefresh').addEventListener('click', () => {
    loadCurrentView();
    loadQuickStats();
    showToast('Refreshed');
  });

  // Action buttons
  $('#btnGroupSelected').addEventListener('click', groupSelected);
  $('#btnSuspendSelected').addEventListener('click', suspendSelected);
  $('#btnCloseSelected').addEventListener('click', closeSelected);

  $('#btnNewSession').addEventListener('click', async () => {
    const name = prompt('Session Name:', `Session ${new Date().toLocaleString()}`);
    if (name) {
      await sendMessage('SAVE_SESSION', { name });
      showToast('Session Saved');
      loadSessionsView();
    }
  });

  $('#btnRestoreAllSuspended').addEventListener('click', async () => {
    await sendMessage('RESTORE_ALL_SUSPENDED');
    showToast('All Suspended Tabs Restored');
    loadSuspendedView();
  });

  $('#btnClearAllSuspended').addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all suspended tab history?')) {
      await chrome.storage.local.set({ tg_suspended: [] });
      showToast('Cleared Suspended Tabs');
      loadSuspendedView();
    }
  });
}

function loadCurrentView() {
  switch (currentView) {
    case 'all': loadTabsView(); break;
    case 'windows': loadWindowsView(); break;
    case 'groups': loadGroupsView(); break;
    case 'sessions': loadSessionsView(); break;
    case 'suspended': loadSuspendedView(); break;
  }
}

async function loadTabsView() {
  const resp = await sendMessage('GET_TABS');
  if (resp.success) renderAllTabs(resp.data);
}

function renderAllTabs(tabs) {
  const list = $('#allTabsList');
  if (!tabs.length) {
    list.innerHTML = '<div class="empty-state">No tabs found</div>';
    return;
  }

  list.innerHTML = tabs.map(tab => `
    <div class="tab-item ${tab.active ? 'active' : ''} ${selectedTabIds.has(tab.id) ? 'selected' : ''}" data-id="${tab.id}">
      <input type="checkbox" class="tab-checkbox" ${selectedTabIds.has(tab.id) ? 'checked' : ''}>
      ${tab.favIconUrl ? `<img class="tab-favicon" src="${tab.favIconUrl}" alt="">` : `<div class="tab-favicon" style="background:#ccc;border-radius:2px;"></div>`}
      <div class="tab-info">
        <div class="tab-title">${tab.title}</div>
        <div class="tab-url">${formatUrl(tab.url)}</div>
      </div>
      <div class="tab-actions">
        <button class="tab-action-btn btn-close" title="Close">×</button>
      </div>
    </div>
  `).join('');

  // Delegation
  list.onclick = (e) => {
    const item = e.target.closest('.tab-item');
    if (!item) return;
    const tabId = parseInt(item.dataset.id);

    if (e.target.classList.contains('tab-checkbox')) {
      if (e.target.checked) selectedTabIds.add(tabId);
      else selectedTabIds.delete(tabId);
      item.classList.toggle('selected', e.target.checked);
      updateSelectionButtons();
    } else if (e.target.closest('.btn-close')) {
      chrome.tabs.remove(tabId, () => loadTabsView());
    } else {
      chrome.tabs.update(tabId, { active: true });
    }
  };
}

function updateSelectionButtons() {
  const hasSelected = selectedTabIds.size > 0;
  $('#btnGroupSelected').disabled = !hasSelected;
  $('#btnSuspendSelected').disabled = !hasSelected;
  $('#btnCloseSelected').disabled = !hasSelected;
}

async function groupSelected() {
  const ids = Array.from(selectedTabIds);
  await sendMessage('MOVE_TO_GROUP', { tabIds: ids });
  selectedTabIds.clear();
  updateSelectionButtons();
  loadTabsView();
  showToast('Group Created');
}

async function suspendSelected() {
  const ids = Array.from(selectedTabIds);
  // Custom suspend for selected
  for (const id of ids) {
    const tab = await chrome.tabs.get(id);
    if (tab && !tab.active) {
      await sendMessage('SUSPEND_TABS'); // background handles bulk
      break;
    }
  }
  selectedTabIds.clear();
  updateSelectionButtons();
  loadTabsView();
  showToast('Tabs Suspended');
}

async function closeSelected() {
  const ids = Array.from(selectedTabIds);
  await sendMessage('CLOSE_TABS', { tabIds: ids });
  selectedTabIds.clear();
  updateSelectionButtons();
  loadTabsView();
  showToast('Tabs Closed');
}

async function loadWindowsView() {
  const wins = await chrome.windows.getAll({ populate: true });
  const list = $('#windowsList');
  list.innerHTML = wins.map(w => `
    <div class="window-item">
      <div class="window-header">
        <div class="window-title">Window ${w.id} (${w.tabs.length} tabs) ${w.focused ? '(Current)' : ''}</div>
      </div>
      <div class="window-body">
        ${w.tabs.map(t => `<div style="padding:4px 8px;font-size:11px;border-bottom:1px solid var(--border);">${t.title}</div>`).join('')}
      </div>
    </div>
  `).join('');
}

async function loadGroupsView() {
  const groups = await sendMessage('GET_GROUPS');
  const list = $('#groupsList');
  if (!groups.data || !groups.data.length) {
    list.innerHTML = '<div class="empty-state">No native tab groups created</div>';
    return;
  }
  list.innerHTML = groups.data.map(g => `
    <div class="group-item">
      <div class="group-header" style="border-left: 4px solid ${g.color || 'gray'}">
        <div class="group-title">${g.title || 'Group'}</div>
      </div>
    </div>
  `).join('');
}

async function loadSessionsView() {
  const sessions = await sendMessage('GET_SESSIONS');
  const list = $('#sessionsList');
  if (!sessions.data || !sessions.data.length) {
    list.innerHTML = '<div class="empty-state">No saved sessions</div>';
    return;
  }
  list.innerHTML = sessions.data.map(s => `
    <div class="group-item">
      <div class="group-header">
        <div>
          <div class="group-title">${s.name}</div>
          <div style="font-size:10px;color:var(--text-muted);">${new Date(s.timestamp).toLocaleString()} • ${s.tabs.length} tabs</div>
        </div>
        <div>
          <button class="btn btn-sm btn-primary" onclick="restoreSession(${s.timestamp})">Restore</button>
        </div>
      </div>
    </div>
  `).join('');
}

window.restoreSession = async function(timestamp) {
  await sendMessage('RESTORE_SESSION', { sessionId: timestamp });
  showToast('Session Restored');
};

async function loadSuspendedView() {
  const suspended = await sendMessage('GET_SUSPENDED');
  const list = $('#suspendedList');
  if (!suspended.data || !suspended.data.length) {
    list.innerHTML = '<div class="empty-state">No suspended tabs</div>';
    return;
  }
  list.innerHTML = suspended.data.map(t => `
    <div class="tab-item">
      <div class="tab-info">
        <div class="tab-title">${t.title}</div>
        <div class="tab-url">${formatUrl(t.url)}</div>
      </div>
      <button class="btn btn-sm btn-primary" onclick="restoreSingleSuspended(${t.id})">Restore</button>
    </div>
  `).join('');
}

window.restoreSingleSuspended = async function(tabId) {
  const suspended = await sendMessage('GET_SUSPENDED');
  const target = suspended.data.find(t => t.id === tabId);
  if (target) {
    await sendMessage('RESTORE_SUSPENDED', { tabData: target });
    loadSuspendedView();
    showToast('Tab Restored');
  }
};

async function loadQuickStats() {
  const tabs = await sendMessage('GET_TABS');
  const wins = await chrome.windows.getAll();
  const groups = await sendMessage('GET_GROUPS');

  if (tabs.success) $('#statTabs').textContent = `${tabs.data.length} Tabs`;
  $('#statWindows').textContent = `${wins.length} Windows`;
  if (groups.success) $('#statGroups').textContent = `${groups.data.length} Groups`;
}

function filterTabs(query) {
  const q = query.toLowerCase();
  $$('#allTabsList .tab-item').forEach(el => {
    const title = el.querySelector('.tab-title').textContent.toLowerCase();
    const url = el.querySelector('.tab-url').textContent.toLowerCase();
    el.style.display = (title.includes(q) || url.includes(q)) ? 'flex' : 'none';
  });
}