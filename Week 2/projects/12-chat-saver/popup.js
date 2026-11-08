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
 * Chat Saver - Popup Script
 */

// State
let currentTab = null;
let currentConversation = null;
let isSupportedPage = false;

// ============ UTILITIES ============
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return [...document.querySelectorAll(sel)]; }

function sendMessage(type, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, data }, resolve);
  });
}

function sendToContentScript(type, data = {}) {
  return new Promise((resolve, reject) => {
    if (!currentTab) { reject(new Error('No tab')); return; }
    chrome.tabs.sendMessage(currentTab.id, { type, data }, (response) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(response);
    });
  });
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
}

function getPlatformIcon(platform) {
  const icons = {
    'ChatGPT': '💚',
    'Claude': '🍊',
    'Bard': '💜',
    'Gemini': '💠',
    'Mistral': '💚',
    'Pi': '🧡',
    'You.com': '💚',
    'Perplexity': '💜'
  };
  return icons[platform] || '💬';
}

function getPlatformClass(platform) {
  return platform.toLowerCase().replace('.', '').replace(' ', '');
}

function showToast(message, type = 'success') {
  const existing = $('.cs-toast-popup');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `cs-toast-popup ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============ UI UPDATES ============
async function loadStats() {
  try {
    const response = await sendMessage('GET_CONVERSATIONS');
    if (!response.success) return;

    const conversations = response.conversations;
    const favorites = conversations.filter(c => c.favorite).length;
    const platforms = new Set(conversations.map(c => c.platformDomain)).size;

    $('#statTotal').textContent = conversations.length;
    $('#statFavorites').textContent = favorites;
    $('#statPlatforms').textContent = platforms;
  } catch (e) {}
}

async function loadRecentConversations() {
  try {
    const response = await sendMessage('GET_CONVERSATIONS');
    if (!response.success) return;

    const conversations = response.conversations.slice(0, 10);
    const list = $('#recentList');

    if (conversations.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <p>No conversations saved yet</p>
          <span>Visit an AI chat and click Save</span>
        </div>
      `;
      return;
    }

    list.innerHTML = conversations.map(conv => `
      <div class="conv-item${conv.favorite ? ' favorite' : ''}" data-id="${conv.id}">
        <div class="conv-header">
          <div class="conv-icon ${getPlatformClass(conv.platform)}">${getPlatformIcon(conv.platform)}</div>
          <div class="conv-info">
            <div class="conv-title" title="${escapeHtml(conv.title)}">${escapeHtml(conv.title)}</div>
            <div class="conv-meta">
              <span class="conv-platform">${conv.platform}</span>
              <span>·</span>
              <span class="conv-time">${formatTime(conv.savedAt)}</span>
              <span>·</span>
              <span class="conv-count">${conv.messageCount} msgs</span>
            </div>
            ${conv.favorite ? '<span class="conv-favorite">★</span>' : ''}
          </div>
        </div>
        ${conv.tags.length > 0 ? `
          <div class="conv-tags">
            ${conv.tags.map(tag => `<span class="conv-tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');

    // Add click handlers
    $$('.conv-item').forEach(item => {
      item.addEventListener('click', () => openConversation(item.dataset.id));
    });
  } catch (e) {}
}

async function checkCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  if (!currentTab) return;

  const url = currentTab.url || '';
  const supportedDomains = [
    'chat.openai.com', 'chatgpt.com', 'claude.ai',
    'bard.google.com', 'gemini.google.com',
    'chat.mistral.ai', 'pi.ai', 'you.com', 'perplexity.ai'
  ];

  isSupportedPage = supportedDomains.some(domain => url.includes(domain));

  // Update UI
  updatePageStatus(isSupportedPage);

  if (isSupportedPage) {
    try {
      const response = await sendToContentScript('EXTRACT_CHAT');
      if (response?.success && response.conversation) {
        currentConversation = response.conversation;
        $('#pageTitle').textContent = currentConversation.title || 'Untitled Conversation';
        $('#pagePlatform').textContent = `${currentConversation.platform} · ${currentConversation.messageCount} messages`;
        $('#pageIcon').textContent = getPlatformIcon(currentConversation.platform);
        $('#btnSaveCurrent').disabled = false;
        $('#btnPreviewCurrent').disabled = false;
      } else {
        $('#pageTitle').textContent = 'No conversation detected';
        $('#pagePlatform').textContent = 'Start a chat to save';
        $('#pageIcon').textContent = '💬';
      }
    } catch (e) {
      $('#pageTitle').textContent = 'Refresh page to detect';
      $('#pagePlatform').textContent = 'Content script not loaded';
    }
  }
}

function updatePageStatus(supported) {
  const section = $('#currentPageSection');
  if (supported) {
    section.style.opacity = '1';
    section.style.pointerEvents = 'auto';
  } else {
    section.style.opacity = '0.6';
    section.style.pointerEvents = 'none';
    $('#pageTitle').textContent = 'Unsupported page';
    $('#pagePlatform').textContent = 'Visit an AI chat platform';
    $('#pageIcon').textContent = '🌐';
    $('#btnSaveCurrent').disabled = true;
    $('#btnPreviewCurrent').disabled = true;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============ ACTIONS ============
async function saveCurrentConversation() {
  if (!currentConversation) return;

  $('#btnSaveCurrent').disabled = true;
  $('#btnSaveCurrent').innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"></path>
    </svg>
    Saving...
  `;

  try {
    const response = await sendToContentScript('SAVE_CHAT');
    if (response?.success) {
      showToast('Conversation saved!');
      await loadStats();
      await loadRecentConversations();
    } else {
      showToast('Failed to save', 'error');
    }
  } catch (e) {
    showToast('Error saving conversation', 'error');
  } finally {
    $('#btnSaveCurrent').disabled = false;
    $('#btnSaveCurrent').innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>
      Save Conversation
    `;
  }
}

async function previewCurrentConversation() {
  try {
    await sendToContentScript('SHOW_PREVIEW');
    window.close();
  } catch (e) {
    showToast('Could not open preview', 'error');
  }
}

function openConversation(id) {
  chrome.runtime.sendMessage({ type: 'OPEN_CONVERSATION', data: { id } });
  window.close();
}

function openSidePanel() {
  chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
  window.close();
}

function openExport() {
  chrome.runtime.sendMessage({ type: 'OPEN_EXPORT' });
  window.close();
}

function openSettings() {
  chrome.runtime.openOptionsPage();
  window.close();
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', async () => {
  await checkCurrentTab();
  await loadStats();
  await loadRecentConversations();

  // Button events
  $('#btnSaveCurrent').addEventListener('click', saveCurrentConversation);
  $('#btnPreviewCurrent').addEventListener('click', previewCurrentConversation);
  $('#btnOpenSidePanel').addEventListener('click', openSidePanel);
  $('#btnViewAll').addEventListener('click', openSidePanel);
  $('#btnExport').addEventListener('click', openExport);
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnHelp').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/chatsaver/help' });
    window.close();
  });

  // Keyboard shortcut hint
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveCurrentConversation();
    }
  });
});

// Listen for updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CONVERSATION_ADDED') {
    loadStats();
    loadRecentConversations();
  }
});

// Add spin animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
`;
document.head.appendChild(style);