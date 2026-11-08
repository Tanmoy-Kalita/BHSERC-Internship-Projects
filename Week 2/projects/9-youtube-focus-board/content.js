/**
 * YouTube Focus Board - Content Script
 * Runs on YouTube pages to provide focus mode, notes, stats, and break reminders
 */

(function() {
  'use strict';

  // ============ STATE ============
  let focusMode = false;
  let theaterMode = false;
  let notes = [];
  let notesVisible = false;
  let statsVisible = false;
  let watchStartTime = Date.now();
  let totalWatchTime = 0;
  let videoId = null;
  let breakReminderInterval = null;
  let lastBreakTime = Date.now();
  let breakInterval = 25 * 60 * 1000; // 25 minutes default
  let currentVideoDuration = 0;
  let isShorts = false;

  // ============ UTILITIES ============
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function sendMessage(type, data = {}) {
    return chrome.runtime.sendMessage({ type, data });
  }

  function onMessage(callback) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type) callback(msg.type, msg.data, sendResponse);
      return true;
    });
  }

  function saveToStorage(key, value) {
    const obj = {}; obj[key] = value;
    chrome.storage.local.set(obj);
  }

  function getFromStorage(key, defaultValue) {
    return new Promise(resolve => {
      chrome.storage.local.get(key, result => resolve(result[key] ?? defaultValue));
    });
  }

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  }

  function getCurrentTimestamp() {
    const video = $('video');
    return video ? video.currentTime : 0;
  }

  function formatTimestamp(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ============ FOCUS MODE ============
  function toggleFocusMode(enabled) {
    focusMode = enabled;
    document.documentElement.classList.toggle('yfb-focus-mode', enabled);
    document.documentElement.classList.toggle('yfb-theater', enabled && theaterMode);
    saveToStorage('focusMode', enabled);
    updateNotesPanel();
    updateStatsOverlay();
  }

  function toggleTheaterMode(enabled) {
    theaterMode = enabled;
    document.documentElement.classList.toggle('yfb-theater', focusMode && enabled);
    saveToStorage('theaterMode', enabled);
  }

  // ============ NOTES ============
  let notesPanel = null;

  function createNotesPanel() {
    if (notesPanel) return notesPanel;

    notesPanel = document.createElement('div');
    notesPanel.className = 'yfb-notes-panel';
    notesPanel.innerHTML = `
      <div class="yfb-notes-header">
        <span class="yfb-notes-title">📝 Study Notes</span>
        <button class="yfb-notes-close" title="Close">×</button>
      </div>
      <div class="yfb-notes-toolbar">
        <button class="yfb-btn yfb-btn-primary" data-action="addNote">➕ Add Note</button>
        <button class="yfb-btn yfb-btn-secondary" data-action="export">📤 Export</button>
        <button class="yfb-btn yfb-btn-secondary" data-action="clear">🗑️ Clear</button>
      </div>
      <div class="yfb-notes-list"></div>
      <div class="yfb-note-input-area">
        <textarea class="yfb-note-input" placeholder="Type your note... (Enter to save, Shift+Enter for new line)"></textarea>
        <button class="yfb-btn yfb-btn-primary" data-action="saveNote">Save</button>
      </div>
    `;

    // Event listeners
    notesPanel.querySelector('.yfb-notes-close').onclick = () => toggleNotesPanel(false);
    notesPanel.querySelector('[data-action="addNote"]').onclick = () => focusNoteInput();
    notesPanel.querySelector('[data-action="export"]').onclick = exportNotes;
    notesPanel.querySelector('[data-action="clear"]').onclick = clearNotes;
    notesPanel.querySelector('[data-action="saveNote"]').onclick = saveNoteFromInput;

    const textarea = notesPanel.querySelector('.yfb-note-input');
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveNoteFromInput();
      }
    });

    document.body.appendChild(notesPanel);
    return notesPanel;
  }

  function toggleNotesPanel(show) {
    if (show === undefined) show = !notesVisible;
    notesVisible = show;

    if (show) {
      createNotesPanel();
      renderNotes();
      notesPanel.style.display = 'flex';
      setTimeout(() => notesPanel.querySelector('.yfb-note-input').focus(), 100);
    } else {
      notesPanel?.style.display = 'none';
    }
    saveToStorage('notesVisible', show);
  }

  function updateNotesPanel() {
    if (notesPanel) {
      notesPanel.style.display = focusMode && notesVisible ? 'flex' : 'none';
    }
  }

  function renderNotes() {
    const list = notesPanel?.querySelector('.yfb-notes-list');
    if (!list) return;

    if (notes.length === 0) {
      list.innerHTML = '<div class="yfb-notes-empty">No notes yet. Start learning! 🎓</div>';
      return;
    }

    list.innerHTML = notes.map((note, index) => `
      <div class="yfb-note-item" data-index="${index}">
        <div class="yfb-note-timestamp" data-time="${note.timestamp}">
          ▶ ${formatTimestamp(note.timestamp)}
        </div>
        <div class="yfb-note-text">${escapeHtml(note.text)}</div>
        <div class="yfb-note-actions">
          <span class="yfb-note-action" data-action="goto">Go to time</span>
          <span class="yfb-note-action" data-action="edit">Edit</span>
          <span class="yfb-note-action" data-action="delete">Delete</span>
        </div>
      </div>
    `).join('');

    // Event delegation
    list.onclick = (e) => {
      const item = e.target.closest('.yfb-note-item');
      if (!item) return;
      const index = parseInt(item.dataset.index);

      if (e.target.dataset.action === 'goto') seekToTimestamp(notes[index].timestamp);
      else if (e.target.dataset.action === 'edit') editNote(index);
      else if (e.target.dataset.action === 'delete') deleteNote(index);
      else if (e.target.classList.contains('yfb-note-timestamp')) seekToTimestamp(notes[index].timestamp);
    };
  }

  function addNote(text, timestamp = null) {
    if (!text.trim()) return;
    const ts = timestamp ?? getCurrentTimestamp();
    notes.unshift({ id: Date.now(), text: text.trim(), timestamp: ts, videoId, createdAt: Date.now() });
    saveNotes();
    renderNotes();
  }

  function saveNoteFromInput() {
    const textarea = notesPanel?.querySelector('.yfb-note-input');
    if (textarea) {
      addNote(textarea.value);
      textarea.value = '';
      textarea.focus();
    }
  }

  function editNote(index) {
    const note = notes[index];
    const newText = prompt('Edit note:', note.text);
    if (newText !== null && newText.trim()) {
      notes[index].text = newText.trim();
      saveNotes();
      renderNotes();
    }
  }

  function deleteNote(index) {
    if (confirm('Delete this note?')) {
      notes.splice(index, 1);
      saveNotes();
      renderNotes();
    }
  }

  function saveNotes() {
    saveToStorage(`notes_${videoId}`, notes);
  }

  async function loadNotes() {
    notes = await getFromStorage(`notes_${videoId}`, []);
  }

  function exportNotes() {
    if (notes.length === 0) { alert('No notes to export'); return; }

    const videoTitle = $('h1.ytd-video-primary-info-renderer')?.textContent?.trim() || 'YouTube Video';
    const url = window.location.href;

    let content = `# ${videoTitle}\n`;
    content += `URL: ${url}\n`;
    content += `Date: ${new Date().toLocaleString()}\n`;
    content += `Total watch time: ${formatTime(totalWatchTime)}\n\n`;

    notes.forEach(note => {
      content += `## [${formatTimestamp(note.timestamp)}] ${note.text}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url_ = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url_;
    a.download = `yfb-notes-${videoId}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url_);
  }

  function clearNotes() {
    if (confirm('Clear all notes for this video?')) {
      notes = [];
      saveNotes();
      renderNotes();
    }
  }

  function focusNoteInput() {
    createNotesPanel();
    toggleNotesPanel(true);
  }

  function seekToTimestamp(sec) {
    const video = $('video');
    if (video) video.currentTime = sec;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============ STATS OVERLAY ============
  let statsOverlay = null;

  function createStatsOverlay() {
    if (statsOverlay) return statsOverlay;

    statsOverlay = document.createElement('div');
    statsOverlay.className = 'yfb-stats-overlay';
    statsOverlay.innerHTML = `
      <div class="yfb-stat-row">
        <div class="yfb-stat-item">📺 <span class="yfb-stat-value" id="yfb-stat-session">0m</span></div>
        <div class="yfb-stat-item">📚 <span class="yfb-stat-value" id="yfb-stat-total">0m</span></div>
        <div class="yfb-stat-item">📝 <span class="yfb-stat-value" id="yfb-stat-notes">0</span></div>
      </div>
    `;
    document.body.appendChild(statsOverlay);
    return statsOverlay;
  }

  function updateStatsOverlay() {
    if (!statsVisible) { statsOverlay?.remove(); statsOverlay = null; return; }
    createStatsOverlay();

    document.getElementById('yfb-stat-session').textContent = formatTime(Date.now() - watchStartTime);
    document.getElementById('yfb-stat-total').textContent = formatTime(totalWatchTime);
    document.getElementById('yfb-stat-notes').textContent = notes.length;
  }

  function toggleStats(show) {
    if (show === undefined) show = !statsVisible;
    statsVisible = show;
    saveToStorage('statsVisible', show);
    updateStatsOverlay();
  }

  // ============ BREAK REMINDERS ============
  let breakReminder = null;

  function createBreakReminder() {
    if (breakReminder) return breakReminder;

    breakReminder = document.createElement('div');
    breakReminder.className = 'yfb-break-reminder';
    breakReminder.innerHTML = `
      <div class="yfb-break-icon">☕</div>
      <h3 class="yfb-break-title">Time for a break!</h3>
      <p class="yfb-break-message">You've been watching for 25 minutes. Stretch, hydrate, and rest your eyes.</p>
      <div class="yfb-break-buttons">
        <button class="yfb-btn yfb-btn-primary" data-action="dismiss">Got it!</button>
        <button class="yfb-btn yfb-btn-secondary" data-action="snooze">Snooze 5 min</button>
      </div>
    `;

    breakReminder.querySelector('[data-action="dismiss"]').onclick = dismissBreak;
    breakReminder.querySelector('[data-action="snooze"]').onclick = snoozeBreak;

    document.body.appendChild(breakReminder);
    return breakReminder;
  }

  function showBreakReminder() {
    createBreakReminder();
    breakReminder.style.display = 'block';
    lastBreakTime = Date.now();
    playNotificationSound();
  }

  function dismissBreak() {
    breakReminder.style.display = 'none';
    lastBreakTime = Date.now();
  }

  function snoozeBreak() {
    breakReminder.style.display = 'none';
    lastBreakTime = Date.now() - (breakInterval - 5 * 60 * 1000);
  }

  function checkBreakReminder() {
    if (!focusMode) return;
    const timeSinceBreak = Date.now() - lastBreakTime;
    if (timeSinceBreak >= breakInterval) {
      showBreakReminder();
    }
  }

  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 800;
      gain.gain.value = 0.1;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }

  // ============ VIDEO DETECTION ============
  function detectVideo() {
    const newVideoId = extractVideoId();
    const newIsShorts = window.location.pathname.includes('/shorts/');

    if (newVideoId !== videoId || newIsShorts !== isShorts) {
      videoId = newVideoId;
      isShorts = newIsShorts;
      watchStartTime = Date.now();
      loadNotes();
      renderNotes();
      updateStatsOverlay();

      // Notify background
      sendMessage('VIDEO_CHANGED', { videoId, isShorts });
    }

    // Update duration
    const video = $('video');
    if (video && video.duration) currentVideoDuration = video.duration;
  }

  function extractVideoId() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('v')) return params.get('v');

    const pathParts = window.location.pathname.split('/');
    if (pathParts.includes('shorts')) {
      const idx = pathParts.indexOf('shorts');
      return pathParts[idx + 1];
    }
    if (pathParts.includes('watch')) return null;
    if (pathParts.includes('embed')) return pathParts[pathParts.indexOf('embed') + 1];
    return null;
  }

  // ============ OBSERVERS ============
  function setupObservers() {
    // Detect navigation (SPA)
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(detectVideo, 500);
      }
      detectVideo();
    });
    observer.observe(document, { subtree: true, childList: true });

    // Video events
    document.addEventListener('play', () => {
      watchStartTime = Date.now();
    }, true);

    document.addEventListener('pause', () => {
      totalWatchTime += Date.now() - watchStartTime;
      watchStartTime = Date.now();
      updateStatsOverlay();
    }, true);

    document.addEventListener('ended', () => {
      totalWatchTime += Date.now() - watchStartTime;
      updateStatsOverlay();
    }, true);
  }

  // ============ MESSAGE HANDLING ============
  onMessage(async (type, data, sendResponse) => {
    switch (type) {
      case 'TOGGLE_FOCUS':
        toggleFocusMode(data.enabled);
        sendResponse({ success: true });
        break;
      case 'TOGGLE_THEATER':
        toggleTheaterMode(data.enabled);
        sendResponse({ success: true });
        break;
      case 'TOGGLE_NOTES':
        toggleNotesPanel(data.show);
        sendResponse({ success: true });
        break;
      case 'TOGGLE_STATS':
        toggleStats(data.show);
        sendResponse({ success: true });
        break;
      case 'SET_BREAK_INTERVAL':
        breakInterval = data.minutes * 60 * 1000;
        saveToStorage('breakInterval', breakInterval);
        sendResponse({ success: true });
        break;
      case 'GET_STATE':
        sendResponse({
          focusMode, theaterMode, notesVisible, statsVisible,
          videoId, isShorts, notesCount: notes.length,
          watchTime: formatTime(totalWatchTime + (Date.now() - watchStartTime))
        });
        break;
      case 'EXPORT_SESSION':
        exportSession();
        sendResponse({ success: true });
        break;
    }
  });

  function exportSession() {
    const videoTitle = $('h1.ytd-video-primary-info-renderer')?.textContent?.trim() || 'YouTube Video';
    const session = {
      videoId, videoTitle, url: window.location.href,
      date: new Date().toISOString(),
      watchTime: totalWatchTime + (Date.now() - watchStartTime),
      notes, isShorts
    };

    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yfb-session-${videoId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============ INITIALIZATION ============
  async function init() {
    // Load settings
    focusMode = await getFromStorage('focusMode', false);
    theaterMode = await getFromStorage('theaterMode', false);
    notesVisible = await getFromStorage('notesVisible', false);
    statsVisible = await getFromStorage('statsVisible', false);
    breakInterval = await getFromStorage('breakInterval', 25 * 60 * 1000);
    totalWatchTime = await getFromStorage('totalWatchTime', 0);

    // Apply focus mode
    document.documentElement.classList.toggle('yfb-focus-mode', focusMode);
    document.documentElement.classList.toggle('yfb-theater', focusMode && theaterMode);

    // Wait for video
    await new Promise(r => {
      const check = () => {
        if ($('video') || document.readyState === 'complete') r();
        else setTimeout(check, 100);
      };
      check();
    });

    detectVideo();
    setupObservers();
    loadNotes();

    // Periodic updates
    setInterval(() => {
      updateStatsOverlay();
      checkBreakReminder();
      detectVideo();
    }, 5000);

    // Save watch time periodically
    setInterval(() => {
      if (document.visibilityState === 'visible' && !$('video')?.paused) {
        totalWatchTime += Date.now() - watchStartTime;
        watchStartTime = Date.now();
        saveToStorage('totalWatchTime', totalWatchTime);
      }
    }, 30000);

    // Save on unload
    window.addEventListener('beforeunload', () => {
      if (!$('video')?.paused) {
        totalWatchTime += Date.now() - watchStartTime;
        saveToStorage('totalWatchTime', totalWatchTime);
      }
    });

    console.log('[YouTube Focus Board] Initialized');
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();