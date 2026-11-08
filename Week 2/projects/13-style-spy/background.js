/**
 * Style Spy - Background Service Worker
 */

// ============ CONTEXT MENU ============
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'inspect-element',
    title: 'Inspect with Style Spy',
    contexts: ['all'],
    documentUrlPatterns: ['<all_urls>']
  });

  chrome.contextMenus.create({
    id: 'copy-styles',
    title: 'Copy Computed Styles',
    contexts: ['all'],
    documentUrlPatterns: ['<all_urls>']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'inspect-element') {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'ACTIVATE_INSPECTOR' });
    } catch (e) {
      await injectAndActivate(tab.id);
    }
  } else if (info.menuItemId === 'copy-styles') {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'COPY_STYLES' });
    } catch (e) {
      await injectAndActivate(tab.id);
    }
  }
});

async function injectAndActivate(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content.css']
    });
    await chrome.tabs.sendMessage(tabId, { type: 'ACTIVATE_INSPECTOR' });
  } catch (e) {
    console.error('[Style Spy] Failed to inject:', e);
  }
}

// ============ KEYBOARD SHORTCUTS ============
chrome.commands.onCommand.addListener(async (command) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return;

  try {
    if (command === 'activate-inspector') {
      await chrome.tabs.sendMessage(tabs[0].id, { type: 'ACTIVATE_INSPECTOR' });
    } else if (command === 'copy-styles') {
      await chrome.tabs.sendMessage(tabs[0].id, { type: 'COPY_STYLES' });
    }
  } catch (e) {
    await injectAndActivate(tabs[0].id);
  }
});

// ============ MESSAGE HANDLING ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STYLES_FOR_PANEL') {
    // Forward to content script
    chrome.tabs.sendMessage(sender.tab.id, message, sendResponse);
    return true;
  }
});

console.log('[Style Spy] Background service worker started');