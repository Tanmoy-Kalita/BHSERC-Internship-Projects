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
 * Chat Saver - Side Panel Script
 * Full conversation management UI
 */

// ============ STATE ============
let allConversations = [];
let filteredConversations = [];
let currentConversation = null;
let currentView = 'list'; // 'list' | 'detail'
let currentFilters = {
  query: '',
  platform: '',
  sort: 'date-desc',
  favoriteOnly: false,
  tag: ''
};
let availableTags = [];
let settings = {};
let theme = 'system';

// ============ UTILITIES ============
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function sendMessage(type, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, data }, resolve);
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

function formatFullTime(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function getPlatformIcon(platform) {
  const icons = {
    'ChatGPT': '💚', 'Claude': '🍊', 'Bard': '💜', 'Gemini': '💠',
    'Mistral': '💚', 'Pi': '🧡', 'You.com': '💚', 'Perplexity': '💜'
  };
  return icons[platform] || '💬';
}

function getPlatformClass(platform) {
  return platform.toLowerCase().replace('.', '').replace(' ', '');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMessageContent(content) {
  let html = escapeHtml(content);
  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

function showToast(message, type = 'success') {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${message} <button onclick="this.parentElement.remove()">×</button>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}

function showModal(content, options = {}) {
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

// ============ THEME ============
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    theme = saved;
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    theme = 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon();
}

function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  // Icons handled by CSS
}

// ============ STORAGE INFO ============
async function updateStorageInfo() {
  try {
    const bytes = await chrome.storage.local.getBytesInUse();
    const kb = (bytes / 1024).toFixed(1);
    $('#storageInfo').textContent = `${kb} KB used`;
  } catch (e) {}
}

// ============ LOAD DATA ============
async function loadAllData() {
  try {
    // Load conversations
    const convResponse = await sendMessage('GET_CONVERSATIONS');
    if (convResponse.success) {
      allConversations = convResponse.conversations;
    }

    // Load tags
    const tagResponse = await sendMessage('GET_TAGS');
    if (tagResponse.success) {
      availableTags = tagResponse.tags;
      renderTagChips();
    }

    // Load settings
    const settingsResponse = await sendMessage('GET_SETTINGS');
    if (settingsResponse.success) {
      settings = settingsResponse.settings;
    }

    applyFilters();
    updateStorageInfo();
  } catch (e) {
    console.error('Failed to load data:', e);
    showToast('Failed to load conversations', 'error');
  }
}

// ============ FILTERS ============
function applyFilters() {
  let result = [...allConversations];

  // Query filter
  if (currentFilters.query) {
    const q = currentFilters.query.toLowerCase();
    result = result.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.platform.toLowerCase().includes(q) ||
      c.messages.some(m => m.content.toLowerCase().includes(q)) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  // Platform filter
  if (currentFilters.platform) {
    result = result.filter(c => c.platformDomain === currentFilters.platform);
  }

  // Favorite filter
  if (currentFilters.favoriteOnly) {
    result = result.filter(c => c.favorite);
  }

  // Tag filter
  if (currentFilters.tag) {
    result = result.filter(c => c.tags.includes(currentFilters.tag));
  }

  // Sort
  switch (currentFilters.sort) {
    case 'date-asc':
      result.sort((a, b) => a.savedAt - b.savedAt);
      break;
    case 'title-asc':
      result.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'messages-desc':
      result.sort((a, b) => b.messageCount - a.messageCount);
      break;
    default: // date-desc
      result.sort((a, b) => b.savedAt - a.savedAt);
  }

  filteredConversations = result;
  renderConversationList();
  updateTagFilterBar();
}

function updateTagFilterBar() {
  const bar = $('#tagFilterBar');
  const chips = $('#tagChips');

  if (currentFilters.tag) {
    bar.style.display = 'flex';
    chips.innerHTML = `
      <span class="tag-chip active" data-tag="${currentFilters.tag}">
        ${escapeHtml(currentFilters.tag)}
        <span class="tag-remove" onclick="clearTagFilter()">×</span>
      </span>
    `;
  } else {
    bar.style.display = 'none';
  }
}

function clearTagFilter() {
  currentFilters.tag = '';
  applyFilters();
}

function renderTagChips() {
  const chips = $('#tagChips');
  if (availableTags.length === 0) {
    chips.innerHTML = '<span class="tag-filter-label" style="color:var(--text-muted);">No tags yet</span>';
    return;
  }
  chips.innerHTML = availableTags.map(tag => `
    <span class="tag-chip${currentFilters.tag === tag ? ' active' : ''}" data-tag="${escapeHtml(tag)}" onclick="filterByTag('${escapeHtml(tag)}')">
      ${escapeHtml(tag)}
      ${currentFilters.tag === tag ? '<span class="tag-remove">×</span>' : ''}
    </span>
  `).join('');
}

function filterByTag(tag) {
  currentFilters.tag = currentFilters.tag === tag ? '' : tag;
  applyFilters();
}

// ============ RENDER CONVERSATION LIST ============
function renderConversationList() {
  const list = $('#conversationList');
  const count = $('#conversationCount');
  const emptyState = $('#emptyState');
  const listSection = $('.conversation-list-section');

  count.textContent = `${filteredConversations.length} conversation${filteredConversations.length !== 1 ? 's' : ''}`;

  if (filteredConversations.length === 0) {
    list.style.display = 'none';
    emptyState.style.display = 'flex';
    listSection.style.flexDirection = 'column';
    return;
  }

  list.style.display = 'block';
  emptyState.style.display = 'none';
  listSection.style.flexDirection = 'column';

  list.innerHTML = filteredConversations.map(conv => `
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
  $$('.conv-item', list).forEach(item => {
    item.addEventListener('click', () => openConversationDetail(item.dataset.id));
  });
}

// ============ CONVERSATION DETAIL ============
async function openConversationDetail(id) {
  const conv = allConversations.find(c => c.id === id);
  if (!conv) return;

  currentConversation = conv;
  currentView = 'detail';

  // Update UI
  $('#detailTitle').textContent = conv.title;
  $('#detailPlatform').textContent = conv.platform;
  $('#detailPlatform').className = `detail-platform ${getPlatformClass(conv.platform)}`;

  // Favorite button
  const favBtn = $('#btnToggleFavorite');
  favBtn.innerHTML = conv.favorite
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
  favBtn.style.color = conv.favorite ? 'var(--warning)' : 'var(--text-secondary)';

  // Meta
  $('#detailMeta').innerHTML = `
    <span><strong>Saved:</strong> ${formatFullTime(conv.savedAt)}</span>
    <span><strong>Messages:</strong> ${conv.messageCount}</span>
    <span><strong>Platform:</strong> ${conv.platform}</span>
    ${conv.tags.length ? `<span><strong>Tags:</strong> ${conv.tags.map(t => `<span class="conv-tag">${escapeHtml(t)}</span>`).join(' ')}</span>` : ''}
    ${conv.notes ? `<span><strong>Notes:</strong> ${escapeHtml(conv.notes)}</span>` : ''}
    ${conv.url ? `<span><strong>URL:</strong> <a href="${escapeHtml(conv.url)}" target="_blank" style="color:var(--primary);font-weight:normal;">Open</a></span>` : ''}
  `;

  // Messages
  const msgList = $('#messageList');
  msgList.innerHTML = conv.messages.map(msg => `
    <div class="message ${msg.role}">
      <div class="message-header">
        <span class="message-role ${msg.role}">${msg.role === 'user' ? 'You' : conv.platform}</span>
        <span class="message-time">${formatFullTime(msg.timestamp)}</span>
      </div>
      <div class="message-content">${renderMessageContent(msg.content)}</div>
    </div>
  `).join('');

  // Show detail view
  $('.conversation-list-section').style.display = 'none';
  $('#detailSection').style.display = 'flex';
  $('#emptyState').style.display = 'none';

  // Scroll to top
  $('#detailContent').scrollTop = 0;
}

function closeConversationDetail() {
  currentView = 'list';
  currentConversation = null;
  $('.conversation-list-section').style.display = 'flex';
  $('#detailSection').style.display = 'none';
}

// ============ ACTIONS ============
async function toggleFavorite() {
  if (!currentConversation) return;
  const newValue = !currentConversation.favorite;
  const result = await sendMessage('TOGGLE_FAVORITE', { id: currentConversation.id, favorite: newValue });
  if (result.success) {
    currentConversation.favorite = newValue;
    // Update UI
    const favBtn = $('#btnToggleFavorite');
    favBtn.innerHTML = newValue
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
    favBtn.style.color = newValue ? 'var(--warning)' : 'var(--text-secondary)';
    // Update list
    loadAllData();
    showToast(newValue ? 'Added to favorites' : 'Removed from favorites');
  }
}

async function editTags() {
  if (!currentConversation) return;

  const modalContent = `
    <div class="modal-header">
      <h3>Edit Tags</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Tags</label>
        <div class="tag-input-container" id="tagInputContainer">
          ${currentConversation.tags.map(tag => `
            <span class="tag-input-tag">
              ${escapeHtml(tag)}
              <button onclick="removeTagFromInput('${escapeHtml(tag)}')">×</button>
            </span>
          `).join('')}
          <input type="text" id="tagInput" placeholder="Add tag..." autocomplete="off">
        </div>
        <small style="color:var(--text-muted);">Press Enter to add, click × to remove</small>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTags()">Save</button>
    </div>
  `;

  showModal(modalContent);

  // Focus input
  setTimeout(() => $('#tagInput')?.focus(), 100);

  // Handle input
  $('#tagInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = e.target.value.trim();
      if (value) {
        addTagToInput(value);
        e.target.value = '';
      }
    }
  });
}

function addTagToInput(tag) {
  const container = $('#tagInputContainer');
  const existing = container.querySelectorAll('.tag-input-tag');
  if ([...existing].some(el => el.textContent.trim() === tag)) return;

  const span = document.createElement('span');
  span.className = 'tag-input-tag';
  span.innerHTML = `${escapeHtml(tag)} <button onclick="removeTagFromInput('${escapeHtml(tag)}')">×</button>`;
  container.insertBefore(span, $('#tagInput'));
}

function removeTagFromInput(tag) {
  $$('.tag-input-tag', $('#tagInputContainer')).forEach(el => {
    if (el.textContent.trim() === tag) el.remove();
  });
}

async function saveTags() {
  const tags = $$('.tag-input-tag', $('#tagInputContainer')).map(el => el.textContent.trim().replace('×', ''));
  const result = await sendMessage('UPDATE_CONVERSATION', { id: currentConversation.id, updates: { tags } });
  if (result.success) {
    currentConversation.tags = tags;
    loadAllData();
    closeModal();
    openConversationDetail(currentConversation.id);
    showToast('Tags updated');
  }
}

async function deleteConversation() {
  if (!currentConversation) return;

  const confirmed = await showModal(`
    <div class="modal confirm-dialog">
      <div class="modal-body">
        <div class="confirm-icon danger">🗑️</div>
        <h3>Delete Conversation</h3>
        <p>Are you sure you want to delete "<strong>${escapeHtml(currentConversation.title)}</strong>"? This cannot be undone.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn" style="background:var(--danger);color:white;" onclick="confirmDelete()">Delete</button>
      </div>
    </div>
  `);

  window._confirmDelete = async () => {
    closeModal();
    const result = await sendMessage('DELETE_CONVERSATION', { id: currentConversation.id });
    if (result.success) {
      showToast('Conversation deleted');
      closeConversationDetail();
      loadAllData();
    } else {
      showToast('Failed to delete', 'error');
    }
  };
}

async function exportConversations() {
  const modalContent = `
    <div class="modal-header">
      <h3>Export Conversations</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Format</label>
        <div class="export-options" id="exportOptions">
          <label class="export-option">
            <input type="radio" name="exportFormat" value="markdown" checked>
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
              <div class="export-option-title">Markdown (.md)</div>
              <div class="export-option-desc">Human-readable, great for notes</div>
            </div>
          </label>
          <label class="export-option">
            <input type="radio" name="exportFormat" value="json">
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
              <div class="export-option-title">JSON (.json)</div>
              <div class="export-option-desc">Full data with all metadata</div>
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
              <div class="export-option-title">HTML (.html)</div>
              <div class="export-option-desc">Viewable in browser, styled</div>
            </div>
          </label>
          <label class="export-option">
            <input type="radio" name="exportFormat" value="csv">
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
              <div class="export-option-title">CSV (.csv)</div>
              <div class="export-option-desc">Spreadsheet compatible</div>
            </div>
          </label>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Scope</label>
        <div class="export-options" id="exportScope">
          <label class="export-option">
            <input type="radio" name="exportScope" value="all" checked>
            <div class="export-option-icon">📦</div>
            <div class="export-option-info">
              <div class="export-option-title">All Conversations</div>
              <div class="export-option-desc">${filteredConversations.length} conversations</div>
            </div>
          </label>
          <label class="export-option">
            <input type="radio" name="exportScope" value="current"${currentView !== 'detail' ? ' style="opacity:0.5;pointer-events:none;"' : ''}>
            <div class="export-option-icon">📄</div>
            <div class="export-option-info">
              <div class="export-option-title">Current Conversation</div>
              <div class="export-option-desc">Only the open conversation</div>
            </div>
          </label>
          <label class="export-option">
            <input type="radio" name="exportScope" value="favorites">
            <div class="export-option-icon">⭐</div>
            <div class="export-option-info">
              <div class="export-option-title">Favorites Only</div>
              <div class="export-option-desc">${allConversations.filter(c => c.favorite).length} conversations</div>
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

  // Handle radio selection
  $$('.export-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const input = opt.querySelector('input');
      if (input && !input.disabled) {
        input.checked = true;
        $$('.export-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      }
    });
  });
}

async function performExport() {
  const format = $('input[name="exportFormat"]:checked')?.value || 'markdown';
  const scope = $('input[name="exportScope"]:checked')?.value || 'all';

  let ids = null;
  if (scope === 'current' && currentConversation) {
    ids = [currentConversation.id];
  } else if (scope === 'favorites') {
    ids = allConversations.filter(c => c.favorite).map(c => c.id);
  }

  closeModal();

  try {
    const response = await sendMessage('EXPORT_CONVERSATIONS', { ids, format });
    if (response.success) {
      const mimeTypes = {
        markdown: 'text/markdown',
        json: 'application/json',
        html: 'text/html',
        csv: 'text/csv'
      };
      const extensions = { markdown: 'md', json: 'json', html: 'html', csv: 'csv' };
      const filename = `chatsaver-export-${new Date().toISOString().split('T')[0]}.${extensions[format]}`;

      await sendMessage('DOWNLOAD_EXPORT', {
        content: response.data,
        filename,
        mimeType: mimeTypes[format]
      });

      showToast(`Exported as ${format.toUpperCase()}`);
    }
  } catch (e) {
    showToast('Export failed', 'error');
  }
}

async function importConversations() {
  const modalContent = `
    <div class="modal-header">
      <h3>Import Conversations</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="dropzone" id="dropzone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <p>Drop JSON or Markdown file here</p>
        <small>or click to select</small>
        <input type="file" id="importFile" accept=".json,.md,.markdown" style="display:none;">
      </div>
      <div id="importPreview" style="display:none; margin-top:16px; padding:12px; background:var(--bg-secondary); border-radius:var(--radius); font-size:12px; color:var(--text-secondary);"></div>
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
        let data;
        if (file.name.endsWith('.json')) {
          data = JSON.parse(e.target.result);
        } else {
          // Simple markdown parsing - just show preview
          data = { conversations: [], raw: e.target.result };
        }
        importData = data;
        preview.style.display = 'block';
        if (data.conversations) {
          preview.innerHTML = `Ready to import <strong>${data.conversations.length}</strong> conversations`;
        } else {
          preview.innerHTML = `Markdown file detected. Import not fully supported for this format.`;
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
      showToast('Only JSON import supported currently', 'error');
      return;
    }

    closeModal();
    let imported = 0;
    for (const conv of importData.conversations) {
      const result = await sendMessage('SAVE_CONVERSATION', conv);
      if (result.success) imported++;
    }
    showToast(`Imported ${imported} conversations`);
    loadAllData();
  };
}

async function openSettings() {
  const settingsResponse = await sendMessage('GET_SETTINGS');
  const s = settingsResponse.settings || DEFAULT_SETTINGS;

  const modalContent = `
    <div class="modal-header">
      <h3>Settings</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Theme</label>
        <select class="form-select" id="settingTheme">
          <option value="system"${s.theme === 'system' ? ' selected' : ''}>System Default</option>
          <option value="light"${s.theme === 'light' ? ' selected' : ''}>Light</option>
          <option value="dark"${s.theme === 'dark' ? ' selected' : ''}>Dark</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Default Export Format</label>
        <select class="form-select" id="settingExportFormat">
          <option value="markdown"${s.exportFormat === 'markdown' ? ' selected' : ''}>Markdown</option>
          <option value="json"${s.exportFormat === 'json' ? ' selected' : ''}>JSON</option>
          <option value="html"${s.exportFormat === 'html' ? ' selected' : ''}>HTML</option>
          <option value="csv"${s.exportFormat === 'csv' ? ' selected' : ''}>CSV</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Max Conversations to Keep</label>
        <input type="number" class="form-input" id="settingMaxConvs" value="${s.maxConversations}" min="100" max="10000" step="100">
      </div>
      <div class="form-group">
        <label class="form-label">
          <input type="checkbox" id="settingAutoSave"${s.autoSave ? ' checked' : ''}>
          Auto-save conversations (experimental)
        </label>
      </div>
      <hr style="margin:16px 0; border-color:var(--border);">
      <div class="form-group">
        <label class="form-label">Storage</label>
        <div style="font-size:12px; color:var(--text-secondary);">
          <div>Conversations: ${allConversations.length}</div>
          <div id="storageSize">Calculating...</div>
        </div>
      </div>
      <div class="form-group">
        <button class="btn btn-secondary" style="width:100%;" onclick="clearAllData()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Clear All Data
        </button>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveSettings()">Save</button>
    </div>
  `;

  showModal(modalContent);

  // Update storage size
  const bytes = await chrome.storage.local.getBytesInUse();
  $('#storageSize').textContent = `Storage: ${(bytes / 1024).toFixed(1)} KB`;

  window._saveSettings = async () => {
    const newSettings = {
      theme: $('#settingTheme').value,
      exportFormat: $('#settingExportFormat').value,
      maxConversations: parseInt($('#settingMaxConvs').value) || 1000,
      autoSave: $('#settingAutoSave').checked
    };
    await sendMessage('UPDATE_SETTINGS', newSettings);
    settings = newSettings;
    if (newSettings.theme !== theme) {
      theme = newSettings.theme;
      localStorage.setItem('theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      updateThemeIcon();
    }
    closeModal();
    showToast('Settings saved');
  };
}

async function clearAllData() {
  const confirmed = await showModal(`
    <div class="modal confirm-dialog">
      <div class="modal-body">
        <div class="confirm-icon danger">⚠️</div>
        <h3>Clear All Data</h3>
        <p>This will permanently delete <strong>all ${allConversations.length} conversations</strong>. This cannot be undone.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn" style="background:var(--danger);color:white;" onclick="confirmClearAll()">Delete Everything</button>
      </div>
    </div>
  `);

  window._confirmClearAll = async () => {
    closeModal();
    await sendMessage('CLEAR_ALL_DATA');
    allConversations = [];
    loadAllData();
    showToast('All data cleared');
  };
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await loadAllData();

  // Header buttons
  $('#btnTheme').addEventListener('click', toggleTheme);
  $('#btnSettings').addEventListener('click', openSettings);

  // Search
  let searchDebounce;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      currentFilters.query = e.target.value;
      $('#btnClearSearch').style.display = e.target.value ? 'flex' : 'none';
      applyFilters();
    }, 200);
  });
  $('#btnClearSearch').addEventListener('click', () => {
    $('#searchInput').value = '';
    currentFilters.query = '';
    $('#btnClearSearch').style.display = 'none';
    applyFilters();
  });

  // Filters
  $('#filterPlatform').addEventListener('change', (e) => {
    currentFilters.platform = e.target.value;
    applyFilters();
  });
  $('#filterSort').addEventListener('change', (e) => {
    currentFilters.sort = e.target.value;
    applyFilters();
  });
  $('#btnFavoritesOnly').addEventListener('click', () => {
    currentFilters.favoriteOnly = !currentFilters.favoriteOnly;
    $('#btnFavoritesOnly').classList.toggle('active', currentFilters.favoriteOnly);
    applyFilters();
  });

  // Detail actions
  $('#btnBack').addEventListener('click', closeConversationDetail);
  $('#btnToggleFavorite').addEventListener('click', toggleFavorite);
  $('#btnEditTags').addEventListener('click', editTags);
  $('#btnDeleteConv').addEventListener('click', deleteConversation);

  // Footer
  $('#btnExport').addEventListener('click', exportConversations);
  $('#btnImport').addEventListener('click', importConversations);
  $('#btnOpenChat').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://chat.openai.com' });
    window.close();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#modalOverlay').style.display === 'flex') {
        closeModal();
      } else if (currentView === 'detail') {
        closeConversationDetail();
      }
    }
    if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      $('#searchInput').focus();
    }
  });

  // Listen for updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CONVERSATION_ADDED' ||
        message.type === 'CONVERSATION_UPDATED' ||
        message.type === 'CONVERSATION_DELETED') {
      loadAllData();
    }
  });
});

// Default settings
const DEFAULT_SETTINGS = {
  theme: 'system',
  exportFormat: 'markdown',
  maxConversations: 1000,
  autoSave: false
};

console.log('[Chat Saver] Side panel loaded');