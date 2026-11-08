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
 * YouTube Focus Board - Popup Script
 */

let currentTab = null;
let isYouTube = false;
let breakInterval = 25 * 60 * 1000;

document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  isYouTube = currentTab.url?.includes('youtube.com');

  updateUI();
  loadSettings();
  startPeriodicUpdate();
});

function updateUI() {
  const notYouTube = document.getElementById('notYouTube');
  const youtubeContent = document.getElementById('youtubeContent');
  const statusText = document.getElementById('statusText');

  if (isYouTube) {
    notYouTube.style.display = 'none';
    youtubeContent.style.display = 'block';
    statusText.textContent = 'Active on YouTube';
  } else {
    notYouTube.style.display = 'block';
    youtubeContent.style.display = 'none';
    statusText.textContent = 'Open YouTube to activate';
  }
}

async function loadSettings() {
  const result = await chrome.storage.local.get([
    'focusMode', 'theaterMode', 'notesVisible', 'statsVisible',
    'breakInterval', 'totalWatchTime'
  ]);

  document.getElementById('toggleFocus').classList.toggle('active', result.focusMode);
  document.getElementById('toggleTheater').classList.toggle('active', result.theaterMode);
  document.getElementById('toggleNotes').classList.toggle('active', result.notesVisible);
  document.getElementById('toggleStats').classList.toggle('active', result.statsVisible);

  breakInterval = result.breakInterval || 25 * 60 * 1000;
  updateBreakButtons();

  // Request state from content script
  if (isYouTube) {
    requestState();
  }
}

function updateBreakButtons() {
  document.getElementById('break25').classList.toggle('active', breakInterval === 25 * 60 * 1000);
  document.getElementById('break50').classList.toggle('active', breakInterval === 50 * 60 * 1000);
  document.getElementById('breakCustom').classList.toggle('active',
    breakInterval !== 25 * 60 * 1000 && breakInterval !== 50 * 60 * 1000);
}

async function toggle(feature) {
  if (!isYouTube) return;

  const toggleEl = document.getElementById(`toggle${feature.charAt(0).toUpperCase() + feature.slice(1)}`);
  const enabled = !toggleEl.classList.contains('active');

  toggleEl.classList.toggle('active', enabled);

  await chrome.storage.local.set({ [feature + 'Mode' === 'focusMode' ? 'focusMode' : feature + 'Visible']: enabled });

  // Send to content script
  chrome.tabs.sendMessage(currentTab.id, {
    type: feature === 'focus' ? 'TOGGLE_FOCUS' : feature === 'theater' ? 'TOGGLE_THEATER' :
          feature === 'notes' ? 'TOGGLE_NOTES' : 'TOGGLE_STATS',
    data: { enabled, show: enabled }
  });
}

async function setBreak(minutes) {
  breakInterval = minutes * 60 * 1000;
  await chrome.storage.local.set({ breakInterval });
  updateBreakButtons();

  if (isYouTube) {
    chrome.tabs.sendMessage(currentTab.id, {
      type: 'SET_BREAK_INTERVAL',
      data: { minutes }
    });
  }
}

async function setBreakCustom() {
  const minutes = prompt('Enter break interval in minutes:', Math.round(breakInterval / 60000));
  if (minutes && !isNaN(minutes) && minutes > 0) {
    await setBreak(parseInt(minutes));
  }
}

async function requestState() {
  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'GET_STATE' });
    if (response) {
      updateStatsDisplay(response);
    }
  } catch (e) {
    // Content script not ready
  }
}

function updateStatsDisplay(state) {
  document.getElementById('statSession').textContent = state.watchTime || '0m';
  document.getElementById('statTotal').textContent = formatTime(state.totalWatchTime || 0);
  document.getElementById('statNotes').textContent = state.notesCount || 0;
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function exportSession() {
  if (!isYouTube) return;
  chrome.tabs.sendMessage(currentTab.id, { type: 'EXPORT_SESSION' });
}

function openSidePanel() {
  if (!isYouTube) return;
  chrome.sidePanel.open({ tabId: currentTab.id });
}

function startPeriodicUpdate() {
  setInterval(() => {
    if (isYouTube) requestState();
  }, 5000);
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.focusMode) document.getElementById('toggleFocus').classList.toggle('active', changes.focusMode.newValue);
  if (changes.theaterMode) document.getElementById('toggleTheater').classList.toggle('active', changes.theaterMode.newValue);
  if (changes.notesVisible) document.getElementById('toggleNotes').classList.toggle('active', changes.notesVisible.newValue);
  if (changes.statsVisible) document.getElementById('toggleStats').classList.toggle('active', changes.statsVisible.newValue);
  if (changes.breakInterval) {
    breakInterval = changes.breakInterval.newValue;
    updateBreakButtons();
  }
});