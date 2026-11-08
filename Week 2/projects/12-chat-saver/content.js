/**
 * Chat Saver - Content Script
 * Extracts conversations from AI chat platforms
 */

(function() {
  'use strict';

  // ============ PLATFORM SELECTORS ============
  const PLATFORMS = {
    'chat.openai.com': {
      name: 'ChatGPT',
      messages: '[data-testid="conversation-turn-"] .group, .conversation-turn, [data-message-author-role]',
      role: (el) => el.dataset.messageAuthorRole || (el.closest('[data-message-author-role]')?.dataset.messageAuthorRole),
      content: (el) => {
        const markdownEl = el.querySelector('.markdown, .prose, [data-testid="message-content"]');
        if (markdownEl) return markdownEl.innerHTML || el.innerHTML;

        // Try to extract text with formatting preservation
        const text = el.innerText || el.textContent || '';
        // Basic HTML structure preservation
        const parts = text.split(/\n\s*\n/);
        if (parts.length > 3) {
          // Likely has paragraphs - wrap in div blocks
          return parts.map(p => `<div>${p.replace(/\n/g, '<br>')}</div>`).join('\n\n');
        }
        return text;
      },
      timestamp: (el) => el.querySelector('time')?.dateTime || null,
      conversationId: () => window.location.pathname.split('/').pop(),
      title: () => document.title.replace(' - ChatGPT', '')
    },
    'chatgpt.com': {
      name: 'ChatGPT',
      messages: '[data-testid="conversation-turn-"] .group, .conversation-turn, [data-message-author-role]',
      role: (el) => el.dataset.messageAuthorRole,
      content: (el) => el.querySelector('.markdown, .prose, [data-testid="message-content"]')?.innerHTML || el.innerHTML,
      timestamp: (el) => el.querySelector('time')?.dateTime || null,
      conversationId: () => window.location.pathname.split('/').pop(),
      title: () => document.title.replace(' - ChatGPT', '')
    },
    'claude.ai': {
      name: 'Claude',
      messages: '[data-test-render-count], .font-claude-message, [data-message-id]',
      role: (el) => el.dataset.sender || (el.closest('[data-sender]')?.dataset.sender) || (el.classList.contains('user') ? 'user' : 'assistant'),
      content: (el) => el.querySelector('.prose, .markdown, [data-test-message-content]')?.innerHTML || el.innerHTML,
      timestamp: (el) => el.querySelector('time')?.dateTime || null,
      conversationId: () => window.location.pathname.split('/').pop(),
      title: () => document.title.replace(' - Claude', '')
    },
    'bard.google.com': {
      name: 'Bard',
      messages: '.conversation-container .message, [data-message-id]',
      role: (el) => el.dataset.author || (el.classList.contains('user-message') ? 'user' : 'model'),
      content: (el) => el.querySelector('.message-content, .markdown')?.innerHTML || el.innerHTML,
      timestamp: (el) => el.querySelector('time')?.dateTime || null,
      conversationId: () => new URLSearchParams(window.location.search).get('conversation') || 'default',
      title: () => document.title.replace(' - Bard', '')
    },
    'gemini.google.com': {
      name: 'Gemini',
      messages: '.conversation-container .message, [data-message-id], .model-response, .user-query',
      role: (el) => el.classList.contains('user-query') ? 'user' : 'model',
      content: (el) => el.querySelector('.markdown, .response-content')?.innerHTML || el.innerHTML,
      timestamp: (el) => el.querySelector('time')?.dateTime || null,
      conversationId: () => window.location.pathname.split('/').pop(),
      title: () => document.title.replace(' - Gemini', '')
    },
    'chat.mistral.ai': {
      name: 'Mistral',
      messages: '[data-testid="message"], .message-item',
      role: (el) => el.dataset.role || (el.closest('[data-role]')?.dataset.role),
      content: (el) => el.querySelector('.markdown, .message-content')?.innerHTML || el.innerHTML,
      timestamp: (el) => el.querySelector('time')?.dateTime || null,
      conversationId: () => window.location.pathname.split('/').pop(),
      title: () => document.title
    },
    'pi.ai': {
      name: 'Pi',
      messages: '[data-testid="message"], .message-bubble',
      role: (el) => el.dataset.sender || (el.classList.contains('user') ? 'user' : 'assistant'),
      content: (el) => el.querySelector('.message-text, .markdown')?.innerHTML || el.innerHTML,
      timestamp: (el) => el.querySelector('time')?.dateTime || null,
      conversationId: () => 'default',
      title: () => document.title
    },
    'you.com': {
      name: 'You.com',
      messages: '.chat-message, [data-message-id]',
      role: (el) => el.dataset.role || (el.classList.contains('user') ? 'user' : 'assistant'),
      content: (el) => el.querySelector('.message-content, .markdown')?.innerHTML || el.innerHTML,
      timestamp: (el) => el.querySelector('time')?.dateTime || null,
      conversationId: () => window.location.pathname.split('/').pop(),
      title: () => document.title
    },
    'perplexity.ai': {
      name: 'Perplexity',
      messages: '.thread-message, [data-testid="message"]',
      role: (el) => el.dataset.role || (el.classList.contains('user') ? 'user' : 'assistant'),
      content: (el) => el.querySelector('.markdown, .prose')?.innerHTML || el.innerHTML,
      timestamp: (el) => el.querySelector('time')?.dateTime || null,
      conversationId: () => window.location.pathname.split('/').pop(),
      title: () => document.title.replace(' - Perplexity', '')
    }
  };

  // ============ STATE ============
  let saveBtn = null;
  let extractPreview = null;
  let currentPlatform = null;
  let lastExtractedChat = null;

  // ============ UTILITIES ============
  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

  function sendMessage(type, data = {}) {
    return chrome.runtime.sendMessage({ type, data });
  }

  function onMessage(callback) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type) callback(msg.type, msg.data, sendResponse);
      return true;
    });
  }

  function showToast(message, type = 'success') {
    removeToast();
    const toast = document.createElement('div');
    toast.className = `cs-toast ${type}`;
    toast.innerHTML = `${message} <button onclick="this.parentElement.remove()">×</button>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4000);
  }

  function removeToast() { $$('.cs-toast').forEach(t => t.remove()); }

  function getPlatform() {
    const hostname = window.location.hostname;
    for (const [domain, config] of Object.entries(PLATFORMS)) {
      if (hostname.includes(domain)) return { domain, ...config };
    }
    return null;
  }

  function htmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    // Convert code blocks
    div.querySelectorAll('pre code').forEach(block => {
      block.textContent = '\n```\n' + block.textContent + '\n```\n';
    });
    div.querySelectorAll('code').forEach(code => {
      if (!code.parentElement.tagName === 'PRE') code.textContent = '`' + code.textContent + '`';
    });
    return div.textContent || div.innerText || '';
  }

  function extractConversation() {
    if (!currentPlatform) return null;

    const platform = currentPlatform;
    const messageElements = $$(platform.messages);

    if (messageElements.length === 0) return null;

    const messages = [];
    messageElements.forEach((el, index) => {
      try {
        const role = platform.role(el) || (index % 2 === 0 ? 'user' : 'assistant');
        const content = platform.content(el);
        const timestamp = platform.timestamp(el);

        if (content && content.trim().length > 0) {
          // Preserve tables - extract HTML tables and mark them
          let processedContent = content;
          const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
          const tables = [];
          let match;
          while ((match = tableRegex.exec(content)) !== null) {
            tables.push(match[0]);
            processedContent = processedContent.replace(match[0], `[TABLE_${tables.length - 1}]`);
          }

          // Preserve code blocks
          const codeRegex = /```(\w+)?[\s\S]{3,}[^`]+```/g;
          const codes = [];
          let codeMatch;
          while ((codeMatch = codeRegex.exec(processedContent)) !== null) {
            codes.push(codeMatch[0]);
            processedContent = processedContent.replace(codeMatch[0], `[CODE_${codes.length - 1}]`);
          }

          // Preserve lists
          const listRegex = /(-|\*|\d+\.)\s(.+)/gm;
          const listMatches = processedContent.match(listRegex) || [];

          messages.push({
            role: role,
            content: htmlToText(processedContent),
            html: processedContent,
            tables: tables,
            codes: codes,
            listItems: listMatches.length,
            timestamp: timestamp || new Date(Date.now() - (messageElements.length - index) * 1000).toISOString(),
            index: index
          });
        }
      } catch (e) {}
    });

    if (messages.length === 0) return null;

    return {
      platform: platform.name,
      platformDomain: platform.domain,
      title: platform.title() || 'Untitled Conversation',
      conversationId: platform.conversationId(),
      url: window.location.href,
      messages: messages,
      messageCount: messages.length,
      extractedAt: Date.now(),
      savedAt: null
    };
  }

  // ============ UI COMPONENTS ============
  function createSaveButton() {
    if (saveBtn) return saveBtn;

    saveBtn = document.createElement('button');
    saveBtn.className = 'cs-save-btn';
    saveBtn.innerHTML = '💾';
    saveBtn.title = 'Save Conversation (Alt+Shift+S)';
    saveBtn.onclick = showExtractPreview;
    document.body.appendChild(saveBtn);
    return saveBtn;
  }

  function showSaveButton() {
    const btn = createSaveButton();
    // Check if we have messages
    const conv = extractConversation();
    if (conv && conv.messages.length > 0) {
      btn.classList.add('show');
    } else {
      btn.classList.remove('show');
    }
  }

  function createExtractPreview() {
    if (extractPreview) return extractPreview;

    extractPreview = document.createElement('div');
    extractPreview.className = 'cs-extract-preview';
    extractPreview.innerHTML = `
      <div class="cs-preview-header">
        <span class="cs-preview-title">
          💬 Conversation Preview
          <span class="cs-preview-platform" id="csPreviewPlatform"></span>
        </span>
        <button class="cs-preview-close" onclick="closeExtractPreview()">×</button>
      </div>
      <div class="cs-preview-body" id="csPreviewBody"></div>
      <div class="cs-preview-footer">
        <button class="cs-btn cs-btn-secondary" onclick="closeExtractPreview()">Cancel</button>
        <button class="cs-btn cs-btn-primary" onclick="saveConversation()">Save Conversation</button>
      </div>
    `;

    document.body.appendChild(extractPreview);
    return extractPreview;
  }

  function showExtractPreview() {
    const conv = extractConversation();
    if (!conv) {
      showToast('No conversation found on this page', 'error');
      return;
    }

    lastExtractedChat = conv;
    const preview = createExtractPreview();
    const body = document.getElementById('csPreviewBody');
    const platformEl = document.getElementById('csPreviewPlatform');

    platformEl.textContent = conv.platform;

    body.innerHTML = `
      <div class="cs-conversation-meta">
        <span class="cs-meta-item">📝 ${conv.title}</span>
        <span class="cs-meta-item">💬 ${conv.messageCount} messages</span>
        <span class="cs-meta-item">🌐 ${conv.platform}</span>
      </div>
      <div class="cs-message-list" id="csMessageList">
        ${conv.messages.map(msg => `
          <div class="cs-message ${msg.role}">
            <div class="cs-message-header">
              <span class="cs-message-role ${msg.role}">${msg.role === 'user' ? 'You' : conv.platform}</span>
              <span class="cs-message-time">${new Date(msg.timestamp).toLocaleString()}</span>
            </div>
            <div class="cs-message-content">${escapeHtml(msg.content.substring(0, 500))}${msg.content.length > 500 ? '...' : ''}</div>
          </div>
        `).join('')}
      </div>
    `;

    preview.classList.add('show');
  }

  function closeExtractPreview() {
    extractPreview?.classList.remove('show');
  }

  async function saveConversation() {
    if (!lastExtractedChat) return;

    const saveBtn = document.querySelector('.cs-save-btn');
    saveBtn?.classList.add('saving');
    saveBtn.innerHTML = '⏳';

    try {
      const result = await chrome.storage.local.get({ conversations: [] });
      const conversations = result.conversations;

      // Check for duplicate
      const exists = conversations.some(c =>
        c.platformDomain === lastExtractedChat.platformDomain &&
        c.conversationId === lastExtractedChat.conversationId &&
        c.messageCount === lastExtractedChat.messageCount
      );

      if (exists) {
        showToast('Conversation already saved!', 'error');
        saveBtn?.classList.remove('saving');
        saveBtn.innerHTML = '💾';
        return;
      }

      const savedConv = {
        ...lastExtractedChat,
        id: 'chat_' + Date.now(),
        savedAt: Date.now(),
        tags: [],
        notes: ''
      };

      conversations.unshift(savedConv);
      await chrome.storage.local.set({ conversations });

      showToast(`Saved: ${savedConv.title.substring(0, 40)}...`);
      closeExtractPreview();

      // Notify side panel
      sendMessage('CHAT_SAVED', { conversation: savedConv });

    } catch (e) {
      showToast('Failed to save conversation', 'error');
    } finally {
      saveBtn?.classList.remove('saving');
      saveBtn.innerHTML = '💾';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Convert HTML to clean text while preserving structure
  function htmlToText(html) {
    if (!html) return '';

    let text = html;

    // Convert tables to markdown
    text = text.replace(/<table[^>]*>/gi, '|');
    text = text.replace(/<\/tr>/gi, '|\n');
    text = text.replace(/<\/td>/gi, '| ');
    text = text.replace(/<\/th>/gi, '| ');
    text = text.replace(/<tr>/gi, '');
    text = text.replace(/<td[^>]*>/gi, '');
    text = text.replace(/<th[^>]*>/gi, '| ');

    // Convert code blocks
    text = text.replace(/```(\w+)?[\s\S]{3,}[^`]+```/g, '');

    // Convert inline code
    text = text.replace(/`([^`]+)`/g, '`$1`');

    // Convert blockquotes
    text = text.replace(/<blockquote[^>]*>/gi, '> ');
    text = text.replace(/<\/blockquote>/gi, '');

    // Convert list items
    text = text.replace(/<li[^>]*>/gi, '- ');
    text = text.replace(/<\/li>/gi, '\n');

    // Convert headings
    text = text.replace(/<h1[^>]*>/gi, '# ');
    text = text.replace(/<\/h1>/gi, '');
    text = text.replace(/<h2[^>]*>/gi, '## ');
    text = text.replace(/<\/h2>/gi, '');
    text = text.replace(/<h3[^>]*>/gi, '### ');
    text = text.replace(/<\/h3>/gi, '');

    // Convert paragraphs and breaks
    text = text.replace(/<p[^>]*>/gi, '');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<br\s*[\/]?>/gi, '\n');

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/gi, '');

    // Clean up whitespace
    text = text.replace(/\n\s*\n/g, '\n\n');
    text = text.replace(/^\n+/m, '');
    text = text.replace(/\n+/g, '\n');

    return text.trim();
  }

  // ============ MESSAGE HANDLING ============
  onMessage((type, data, sendResponse) => {
    switch (type) {
      case 'EXTRACT_CHAT':
        const conv = extractConversation();
        sendResponse({ success: !!conv, conversation: conv });
        break;
      case 'SHOW_PREVIEW':
        showExtractPreview();
        sendResponse({ success: true });
        break;
      case 'SAVE_CHAT':
        saveConversation();
        sendResponse({ success: true });
        break;
    }
  });

  // ============ KEYBOARD SHORTCUT ============
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      showExtractPreview();
    }
  });

  // ============ OBSERVERS ============
  function setupObservers() {
    // Watch for new messages
    const observer = new MutationObserver(() => {
      showSaveButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // SPA navigation
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => {
          currentPlatform = getPlatform();
          showSaveButton();
        }, 1000);
      }
    }, 1000);
  }

  // ============ INITIALIZATION ============
  function init() {
    currentPlatform = getPlatform();
    if (!currentPlatform) return;

    createSaveButton();
    showSaveButton();
    setupObservers();

    // Periodic check
    setInterval(showSaveButton, 3000);

    console.log(`[Chat Saver] Ready for ${currentPlatform.name}`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();