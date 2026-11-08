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
 * YouTube Focus Board - Side Panel Script
 */

let currentVideoId = null;
let allNotes = {};
let allSessions = [];
let settings = {};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
  await loadAllData();
  setupTabs();
  setupEventListeners();
  renderNotes();
  renderSessions();
  renderStats();
  loadSettingsUI();
});

async function loadAllData() {
  const data = await chrome.storage.local.get(null);
  allNotes = {};
  allSessions = data.sessions || [];

  // Extract notes for each video
  Object.keys(data).forEach(key => {
    if (key.startsWith('notes_')) {
      allNotes[key.replace('notes_', '')] = data[key];
    }
  });

  settings = {
    defaultFocus: data.defaultFocus || 'off',
    defaultTheater: data.defaultTheater || 'off',
    breakInterval: data.breakInterval || 25,
    breakSound: data.breakSound || 'on',
    theme: data.theme || 'system'
  };

  // Get current tab's video ID
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.url?.includes('youtube.com')) {
    currentVideoId = extractVideoId(tabs[0].url);
  }
}

function extractVideoId(url) {
  const params = new URLSearchParams(new URL(url).search);
  if (params.has('v')) return params.get('v');
  const pathParts = new URL(url).pathname.split('/');
  if (pathParts.includes('shorts')) {
    const idx = pathParts.indexOf('shorts');
    return pathParts[idx + 1];
  }
  return null;
}

// ============ TABS ============
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
  // Header buttons
  document.getElementById('btnExport').onclick = exportAllData;
  document.getElementById('btnSettings').onclick = () => switchTab('settings');

  // Notes panel
  document.getElementById('panelNoteInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      savePanelNote();
    }
  });

  // Settings
  document.getElementById('setDefaultFocus').onchange = (e) => saveSetting('defaultFocus', e.target.value);
  document.getElementById('setDefaultTheater').onchange = (e) => saveSetting('defaultTheater', e.target.value);
  document.getElementById('setBreakInterval').onchange = (e) => saveSetting('breakInterval', parseInt(e.target.value));
  document.getElementById('setBreakSound').onchange = (e) => saveSetting('breakSound', e.target.value);
  document.getElementById('setTheme').onchange = (e) => saveSetting('theme', e.target.value);
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`panel-${tabName}`).classList.add('active');
}

// ============ NOTES ============
function getCurrentNotes() {
  return allNotes[currentVideoId] || [];
}

function saveCurrentNotes(notes) {
  allNotes[currentVideoId] = notes;
  chrome.storage.local.set({ [`notes_${currentVideoId}`]: notes });
  renderNotes();
  updateNotesCount();
}

function renderNotes() {
  const list = document.getElementById('notesList');
  const notes = getCurrentNotes();

  if (notes.length === 0) {
    list.innerHTML = '<div class="notes-empty">No notes for this video yet.<br>Start taking timestamped notes! 📝</div>';
    return;
  }

  list.innerHTML = notes.map((note, index) => `
    <div class="note-item" data-index="${index}">
      <div class="note-timestamp" data-time="${note.timestamp}">
        ▶ ${formatTimestamp(note.timestamp)}
      </div>
      <div class="note-text">${escapeHtml(note.text)}</div>
      <div class="note-actions">
        <span class="note-action" data-action="goto">Go to time</span>
        <span class="note-action" data-action="edit">Edit</span>
        <span class="note-action" data-action="delete">Delete</span>
      </div>
    </div>
  `).join('');

  // Event delegation
  list.onclick = (e) => {
    const item = e.target.closest('.note-item');
    if (!item) return;
    const index = parseInt(item.dataset.index);
    const notes = getCurrentNotes();
    const note = notes[index];

    if (e.target.dataset.action === 'goto') gotoTimestamp(note.timestamp);
    else if (e.target.dataset.action === 'edit') editNote(index);
    else if (e.target.dataset.action === 'delete') deleteNote(index);
    else if (e.target.classList.contains('note-timestamp')) gotoTimestamp(note.timestamp);
  };
}

function updateNotesCount() {
  const count = getCurrentNotes().length;
  document.getElementById('notesCount').textContent = count;
}

function addNoteFromPanel() {
  const textarea = document.getElementById('panelNoteInput');
  textarea.focus();
}

function savePanelNote() {
  const textarea = document.getElementById('panelNoteInput');
  const text = textarea.value.trim();
  if (!text) return;

  // Request current timestamp from content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CURRENT_TIME' }, (response) => {
      const timestamp = response?.timestamp || 0;
      const notes = getCurrentNotes();
      notes.unshift({ id: Date.now(), text, timestamp, createdAt: Date.now() });
      saveCurrentNotes(notes);
      textarea.value = '';
    });
  });
}

function editNote(index) {
  const notes = getCurrentNotes();
  const note = notes[index];
  const newText = prompt('Edit note:', note.text);
  if (newText !== null && newText.trim()) {
    notes[index].text = newText.trim();
    saveCurrentNotes(notes);
  }
}

function deleteNote(index) {
  if (confirm('Delete this note?')) {
    const notes = getCurrentNotes();
    notes.splice(index, 1);
    saveCurrentNotes(notes);
  }
}

function gotoTimestamp(sec) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SEEK_TO', data: { timestamp: sec } });
  });
}

function formatTimestamp(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function exportAllNotes() {
  let content = '# YouTube Focus Board - All Notes\n\n';
  let hasNotes = false;

  Object.entries(allNotes).forEach(([videoId, notes]) => {
    if (notes.length === 0) return;
    hasNotes = true;
    content += `## Video: ${videoId}\n\n`;
    notes.forEach(note => {
      content += `- [${formatTimestamp(note.timestamp)}] ${note.text}\n`;
    });
    content += '\n';
  });

  if (!hasNotes) {
    alert('No notes to export');
    return;
  }

  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yfb-all-notes-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearAllNotes() {
  if (confirm('Clear notes for this video?')) {
    saveCurrentNotes([]);
  }
}

// ============ SESSIONS ============
function renderSessions() {
  const list = document.getElementById('sessionsList');

  if (allSessions.length === 0) {
    list.innerHTML = '<div class="sessions-empty">No saved sessions yet.<br>Export a session from the popup to save it here.</div>';
    return;
  }

  list.innerHTML = allSessions.map((session, index) => `
    <div class="session-card">
      <div class="session-header">
        <span class="session-title">${escapeHtml(session.videoTitle || 'Unknown Video')}</span>
        <span class="session-date">${new Date(session.date).toLocaleDateString()}</span>
      </div>
      <div class="session-meta">
        <span>📺 ${formatTime(session.watchTime)}</span>
        <span>📝 ${session.notes?.length || 0} notes</span>
        <span>${session.isShorts ? '📱 Shorts' : '🎬 Video'}</span>
      </div>
      <div class="session-actions">
        <button class="session-btn session-btn-primary" onclick="loadSession(${index})">Load Notes</button>
        <button class="session-btn session-btn-secondary" onclick="exportSessionFile(${index})">📥 Download</button>
        <button class="session-btn session-btn-danger" onclick="deleteSession(${index})">Delete</button>
      </div>
    </div>
  `).join('');
}

function loadSession(index) {
  const session = allSessions[index];
  if (!session || !session.videoId) return;

  currentVideoId = session.videoId;
  allNotes[currentVideoId] = session.notes || [];
  chrome.storage.local.set({ [`notes_${currentVideoId}`]: session.notes || [] });
  renderNotes();
  updateNotesCount();
  switchTab('notes');
  showToast(`Loaded ${session.notes?.length || 0} notes from session`);
}

function exportSessionFile(index) {
  const session = allSessions[index];
  if (!session) return;

  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yfb-session-${session.videoId}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function deleteSession(index) {
  if (confirm('Delete this session?')) {
    allSessions.splice(index, 1);
    chrome.storage.local.set({ sessions: allSessions });
    renderSessions();
  }
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ============ STATS ============
function renderStats() {
  // Calculate totals
  let totalTime = 0;
  let totalNotes = 0;
  let videoCount = new Set();
  let dailyTime = {};

  allSessions.forEach(session => {
    totalTime += session.watchTime || 0;
    totalNotes += session.notes?.length || 0;
    if (session.videoId) videoCount.add(session.videoId);

    const date = new Date(session.date).toLocaleDateString('en-US', { weekday: 'short' });
    dailyTime[date] = (dailyTime[date] || 0) + (session.watchTime || 0);
  });

  document.getElementById('statTotalTime').textContent = formatTimeLong(totalTime);
  document.getElementById('statTotalNotes').textContent = totalNotes;
  document.getElementById('statVideosWatched').textContent = videoCount.size;

  // Streak calculation
  const streak = calculateStreak(dailyTime);
  document.getElementById('statStreak').textContent = streak;

  // Weekly bars
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxTime = Math.max(...Object.values(dailyTime), 1);

  days.forEach((day, i) => {
    const bar = document.querySelector(`.day-bar[data-day="${day}"]`);
    const time = dailyTime[day] || 0;
    const height = Math.max(20, (time / maxTime) * 90);
    bar.style.height = `${height}px`;
    bar.style.background = time > 0 ? '#065fd4' : '#e8eaed';
    bar.title = `${day}: ${formatTime(time)}`;
  });
}

function formatTimeLong(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function calculateStreak(dailyTime) {
  const today = new Date();
  let streak = 0;

  for (let i = 0; i < 365; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' });

    if (dailyTime[dayStr] > 5 * 60 * 1000) { // More than 5 minutes
      streak++;
    } else if (i > 0) { // Allow today to be 0
      break;
    }
  }
  return streak;
}

// ============ SETTINGS ============
function loadSettingsUI() {
  document.getElementById('setDefaultFocus').value = settings.defaultFocus;
  document.getElementById('setDefaultTheater').value = settings.defaultTheater;
  document.getElementById('setBreakInterval').value = settings.breakInterval;
  document.getElementById('setBreakSound').value = settings.breakSound;
  document.getElementById('setTheme').value = settings.theme;
}

async function saveSetting(key, value) {
  settings[key] = value;
  await chrome.storage.local.set({ [key]: value });
  showToast(`Saved: ${key}`);
}

// ============ DATA MANAGEMENT ============
function exportAllData() {
  const data = {
    notes: allNotes,
    sessions: allSessions,
    settings,
    exportDate: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yfb-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('All data exported!');
}

function clearAllData() {
  if (confirm('⚠️ This will delete ALL notes, sessions, and settings. Are you sure?')) {
    if (confirm('This cannot be undone. Really delete everything?')) {
      chrome.storage.local.clear();
      allNotes = {};
      allSessions = [];
      settings = {};
      renderNotes();
      renderSessions();
      renderStats();
      updateNotesCount();
      showToast('All data cleared');
    }
  }
}

// ============ UTILITIES ============
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #333; color: white; padding: 12px 20px; border-radius: 8px;
    z-index: 10000; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    animation: slideUp 0.3s;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideUp 0.3s reverse';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// Listen for storage changes from other contexts
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.sessions) { allSessions = changes.sessions.newValue || []; renderSessions(); }
    Object.keys(changes).forEach(key => {
      if (key.startsWith('notes_') && key === `notes_${currentVideoId}`) {
        allNotes[currentVideoId] = changes[key].newValue || [];
        renderNotes();
        updateNotesCount();
      }
    });
  }
});