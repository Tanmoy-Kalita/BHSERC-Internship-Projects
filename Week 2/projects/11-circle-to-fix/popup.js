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
 * Circle to Fix - Popup Script
 */

let isActive = false;

document.addEventListener('DOMContentLoaded', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];

  updateUI();
  checkActiveState(currentTab.id);
});

function updateUI() {
  const btnToggle = document.getElementById('btnToggle');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

  if (isActive) {
    btnToggle.textContent = '🛑 Deactivate';
    btnToggle.className = 'btn btn-secondary';
    statusIndicator.style.display = 'flex';
    statusText.textContent = 'Active on this page';
  } else {
    btnToggle.textContent = '🎯 Activate Circle Mode';
    btnToggle.className = 'btn btn-primary';
    statusIndicator.style.display = 'none';
    statusText.textContent = 'Click to activate';
  }
}

async function checkActiveState(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_ANNOTATIONS' });
    if (response?.success) {
      isActive = true;
      updateUI();
    }
  } catch (e) {
    // Not active
  }
}

async function toggleMode() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];

  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'TOGGLE_CIRCLE_MODE' });
    if (response?.success) {
      isActive = response.active;
      updateUI();
      window.close();
    }
  } catch (e) {
    // Try to inject content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: currentTab.id },
        files: ['content.css']
      });
      // Retry
      const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'TOGGLE_CIRCLE_MODE' });
      if (response?.success) {
        isActive = response.active;
        updateUI();
        window.close();
      }
    } catch (err) {
      alert('Could not activate. Try refreshing the page.');
    }
  }
}

function viewAnnotations() {
  const tabs = chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_ANNOTATIONS' });
  window.close();
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}