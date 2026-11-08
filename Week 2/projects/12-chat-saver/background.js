/**
 * Chat Saver - Background Service Worker
 * Handles storage, sync, and cross-platform communication
 */

// Storage keys
const STORAGE_KEYS = {
  CONVERSATIONS: 'conversations',
  SETTINGS: 'settings',
  SYNC_QUEUE: 'syncQueue'
};

// Default settings
const DEFAULT_SETTINGS = {
  autoSave: false,
  syncEnabled: false,
  exportFormat: 'markdown',
  theme: 'system',
  maxConversations: 1000
};

// ============ STORAGE HELPERS ============
async function getStorage(keys) {
  return await chrome.storage.local.get(keys);
}

async function setStorage(data) {
  return await chrome.storage.local.set(data);
}

async function getConversations() {
  const result = await getStorage({ [STORAGE_KEYS.CONVERSATIONS]: [] });
  return result[STORAGE_KEYS.CONVERSATIONS] || [];
}

async function saveConversations(conversations) {
  return await setStorage({ [STORAGE_KEYS.CONVERSATIONS]: conversations });
}

async function getSettings() {
  const result = await getStorage({ [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
}

async function saveSettings(settings) {
  return await setStorage({ [STORAGE_KEYS.SETTINGS]: settings });
}

// ============ CONVERSATION OPERATIONS ============
async function addConversation(conversation) {
  const conversations = await getConversations();
  const settings = await getSettings();

  // Check for duplicates
  const exists = conversations.some(c =>
    c.platformDomain === conversation.platformDomain &&
    c.conversationId === conversation.conversationId &&
    c.messageCount === conversation.messageCount
  );

  if (exists) return { success: false, error: 'Duplicate conversation' };

  const newConv = {
    ...conversation,
    id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    savedAt: Date.now(),
    tags: conversation.tags || [],
    notes: conversation.notes || '',
    favorite: false
  };

  conversations.unshift(newConv);

  // Trim to max
  if (conversations.length > settings.maxConversations) {
    conversations.splice(settings.maxConversations);
  }

  await saveConversations(conversations);

  // Notify side panel if open
  notifySidePanel('CONVERSATION_ADDED', { conversation: newConv });

  return { success: true, conversation: newConv };
}

async function updateConversation(id, updates) {
  const conversations = await getConversations();
  const index = conversations.findIndex(c => c.id === id);

  if (index === -1) return { success: false, error: 'Not found' };

  conversations[index] = { ...conversations[index], ...updates };
  await saveConversations(conversations);

  notifySidePanel('CONVERSATION_UPDATED', { conversation: conversations[index] });

  return { success: true, conversation: conversations[index] };
}

async function deleteConversation(id) {
  const conversations = await getConversations();
  const filtered = conversations.filter(c => c.id !== id);

  if (filtered.length === conversations.length) {
    return { success: false, error: 'Not found' };
  }

  await saveConversations(filtered);
  notifySidePanel('CONVERSATION_DELETED', { id });

  return { success: true };
}

async function searchConversations(query, filters = {}) {
  const conversations = await getConversations();
  const lowerQuery = query.toLowerCase();

  return conversations.filter(c => {
    // Text search
    const matchesQuery = !query ||
      c.title.toLowerCase().includes(lowerQuery) ||
      c.platform.toLowerCase().includes(lowerQuery) ||
      c.messages.some(m => m.content.toLowerCase().includes(lowerQuery)) ||
      c.tags.some(t => t.toLowerCase().includes(lowerQuery));

    // Platform filter
    const matchesPlatform = !filters.platform || c.platformDomain === filters.platform;

    // Favorite filter
    const matchesFavorite = !filters.favoriteOnly || c.favorite;

    // Date range filter
    let matchesDate = true;
    if (filters.dateFrom) matchesDate = matchesDate && c.savedAt >= filters.dateFrom;
    if (filters.dateTo) matchesDate = matchesDate && c.savedAt <= filters.dateTo;

    // Tag filter
    const matchesTag = !filters.tag || c.tags.includes(filters.tag);

    return matchesQuery && matchesPlatform && matchesFavorite && matchesDate && matchesTag;
  });
}

async function getAllTags() {
  const conversations = await getConversations();
  const tags = new Set();
  conversations.forEach(c => c.tags.forEach(t => tags.add(t)));
  return Array.from(tags).sort();
}

// ============ EXPORT OPERATIONS ============
async function exportConversations(conversationIds, format = 'markdown') {
  const conversations = await getConversations();
  const toExport = conversationIds
    ? conversations.filter(c => conversationIds.includes(c.id))
    : conversations;

  switch (format) {
    case 'markdown':
      return exportMarkdown(toExport);
    case 'json':
      return exportJSON(toExport);
    case 'csv':
      return exportCSV(toExport);
    case 'html':
      return exportHTML(toExport);
    default:
      return exportMarkdown(toExport);
  }
}

function exportMarkdown(conversations) {
  let output = '# Chat Saver Export\n\n';
  output += `Exported: ${new Date().toISOString()}\n`;
  output += `Total Conversations: ${conversations.length}\n\n`;
  output += '---\n\n';

  conversations.forEach((conv, idx) => {
    output += `## ${idx + 1}. ${conv.title}\n\n`;
    output += `**Platform:** ${conv.platform}\n`;
    output += `**URL:** ${conv.url}\n`;
    output += `**Saved:** ${new Date(conv.savedAt).toLocaleString()}\n`;
    output += `**Messages:** ${conv.messageCount}\n`;
    if (conv.tags.length) output += `**Tags:** ${conv.tags.join(', ')}\n`;
    if (conv.notes) output += `**Notes:** ${conv.notes}\n`;
    if (conv.favorite) output += `**⭐ Favorite**\n`;
    output += '\n---\n\n';

    conv.messages.forEach(msg => {
      const role = msg.role === 'user' ? 'You' : conv.platform;
      output += `### ${role}\n\n${msg.content}\n\n`;
    });

    output += '---\n\n';
  });

  return output;
}

function exportJSON(conversations) {
  return JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    conversations: conversations
  }, null, 2);
}

function exportCSV(conversations) {
  const rows = [['ID', 'Title', 'Platform', 'URL', 'Saved At', 'Message Count', 'Tags', 'Notes', 'Favorite']];

  conversations.forEach(conv => {
    rows.push([
      conv.id,
      `"${conv.title.replace(/"/g, '""')}"`,
      conv.platform,
      conv.url,
      new Date(conv.savedAt).toISOString(),
      conv.messageCount,
      `"${conv.tags.join('; ')}"`,
      `"${(conv.notes || '').replace(/"/g, '""')}"`,
      conv.favorite ? 'Yes' : 'No'
    ]);
  });

  return rows.map(r => r.join(',')).join('\n');
}

function exportHTML(conversations) {
  let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Chat Saver Export</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
  .conversation { border-bottom: 2px solid #eee; padding: 30px 0; }
  .meta { color: #666; font-size: 14px; margin-bottom: 16px; }
  .meta span { margin-right: 16px; }
  .message { margin: 20px 0; padding: 16px; border-radius: 8px; }
  .message.user { background: #eff6ff; border-left: 4px solid #2563eb; }
  .message.assistant { background: #f3f4f6; border-left: 4px solid #059669; }
  .message-header { display: flex; gap: 12px; margin-bottom: 8px; font-size: 13px; }
  .role { font-weight: 600; text-transform: capitalize; }
  .role.user { color: #2563eb; }
  .role.assistant { color: #059669; }
  .time { color: #999; }
  .tags { margin-top: 12px; }
  .tag { display: inline-block; background: #e5e7eb; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 6px; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
  pre { background: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
</style></head><body>`;

  html += `<h1>Chat Saver Export</h1>
<p>Exported: ${new Date().toLocaleString()}<br>Total Conversations: ${conversations.length}</p>`;

  conversations.forEach((conv, idx) => {
    html += `<div class="conversation">
      <h2>${idx + 1}. ${escapeHtml(conv.title)}</h2>
      <div class="meta">
        <span><strong>Platform:</strong> ${conv.platform}</span>
        <span><strong>Saved:</strong> ${new Date(conv.savedAt).toLocaleString()}</span>
        <span><strong>Messages:</strong> ${conv.messageCount}</span>
        ${conv.tags.length ? `<span><strong>Tags:</strong> ${conv.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')}</span>` : ''}
        ${conv.favorite ? '<span class="tag" style="background:#fef3c7;color:#b45309">⭐ Favorite</span>' : ''}
      </div>`;

    conv.messages.forEach(msg => {
      const roleClass = msg.role === 'user' ? 'user' : 'assistant';
      const roleLabel = msg.role === 'user' ? 'You' : conv.platform;
      let content = escapeHtml(msg.content);
      // Convert code blocks
      content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
      content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
      content = content.replace(/\n/g, '<br>');

      html += `<div class="message ${roleClass}">
        <div class="message-header">
          <span class="role ${roleClass}">${roleLabel}</span>
          <span class="time">${new Date(msg.timestamp).toLocaleString()}</span>
        </div>
        <div class="message-content">${content}</div>
      </div>`;
    });

    html += `</div>`;
  });

  html += `</body></html>`;
  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============ SIDE PANEL COMMUNICATION ============
let sidePanelPort = null;

chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'sidepanel') {
    sidePanelPort = port;
    port.onDisconnect.addListener(() => { sidePanelPort = null; });
  }
});

function notifySidePanel(event, data) {
  if (sidePanelPort) {
    sidePanelPort.postMessage({ type: event, data });
  }
}

// Broadcast to all side panels
async function broadcastToSidePanels(event, data) {
  const views = await chrome.extension.getViews({ type: 'side_panel' });
  views.forEach(view => {
    if (view.chrome && view.chrome.runtime) {
      view.chrome.runtime.sendMessage({ type: event, data });
    }
  });
}

// ============ MESSAGE HANDLING ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_CONVERSATIONS':
          const conversations = await getConversations();
          sendResponse({ success: true, conversations });
          break;

        case 'GET_CONVERSATION':
          const allConvs = await getConversations();
          const conv = allConvs.find(c => c.id === message.data.id);
          sendResponse({ success: !!conv, conversation: conv });
          break;

        case 'SAVE_CONVERSATION':
          const result = await addConversation(message.data);
          sendResponse(result);
          break;

        case 'UPDATE_CONVERSATION':
          const updateResult = await updateConversation(message.data.id, message.data.updates);
          sendResponse(updateResult);
          break;

        case 'DELETE_CONVERSATION':
          const deleteResult = await deleteConversation(message.data.id);
          sendResponse(deleteResult);
          break;

        case 'SEARCH_CONVERSATIONS':
          const searchResults = await searchConversations(message.data.query, message.data.filters);
          sendResponse({ success: true, conversations: searchResults });
          break;

        case 'GET_TAGS':
          const tags = await getAllTags();
          sendResponse({ success: true, tags });
          break;

        case 'EXPORT_CONVERSATIONS':
          const exportData = await exportConversations(message.data.ids, message.data.format);
          sendResponse({ success: true, data: exportData });
          break;

        case 'DOWNLOAD_EXPORT':
          await downloadExport(message.data.content, message.data.filename, message.data.mimeType);
          sendResponse({ success: true });
          break;

        case 'GET_SETTINGS':
          const settings = await getSettings();
          sendResponse({ success: true, settings });
          break;

        case 'UPDATE_SETTINGS':
          await saveSettings(message.data);
          sendResponse({ success: true });
          break;

        case 'OPEN_SIDE_PANEL':
          // Side panel opens automatically when user clicks extension icon
          sendResponse({ success: true });
          break;

        case 'OPEN_EXPORT':
          sendResponse({ success: true });
          break;

        case 'TOGGLE_FAVORITE':
          const toggleResult = await updateConversation(message.data.id, { favorite: message.data.favorite });
          sendResponse(toggleResult);
          break;

        case 'ADD_TAG':
          const conv = (await getConversations()).find(c => c.id === message.data.id);
          if (conv && !conv.tags.includes(message.data.tag)) {
            const tags = [...conv.tags, message.data.tag];
            await updateConversation(message.data.id, { tags });
          }
          sendResponse({ success: true });
          break;

        case 'REMOVE_TAG':
          const conv2 = (await getConversations()).find(c => c.id === message.data.id);
          if (conv2) {
            const tags = conv2.tags.filter(t => t !== message.data.tag);
            await updateConversation(message.data.id, { tags });
          }
          sendResponse({ success: true });
          break;

        case 'CLEAR_ALL_DATA':
          await saveConversations([]);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[Chat Saver] Background error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep channel open for async response
});

// ============ DOWNLOAD HELPER ============
async function downloadExport(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  await chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  });

  // Clean up
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ============ CONTEXT MENU ============
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-conversation',
    title: 'Save Conversation with Chat Saver',
    contexts: ['page'],
    documentUrlPatterns: [
      '*://chat.openai.com/*',
      '*://chatgpt.com/*',
      '*://claude.ai/*',
      '*://bard.google.com/*',
      '*://gemini.google.com/*',
      '*://chat.mistral.ai/*',
      '*://pi.ai/*',
      '*://you.com/*',
      '*://perplexity.ai/*'
    ]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-conversation') {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PREVIEW' });
    } catch (e) {
      // Content script not injected, try to inject
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PREVIEW' });
    }
  }
});

// ============ KEYBOARD SHORTCUT ============
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save-chat') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      try {
        await chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_PREVIEW' });
      } catch (e) {
        // Ignore
      }
    }
  }
});

// ============ PERIODIC CLEANUP ============
setInterval(async () => {
  const conversations = await getConversations();
  const settings = await getSettings();

  if (conversations.length > settings.maxConversations) {
    conversations.splice(settings.maxConversations);
    await saveConversations(conversations);
  }
}, 60 * 60 * 1000); // Every hour

console.log('[Chat Saver] Background service worker started');