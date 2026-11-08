/**
 * Tab Goblin - Content Script (minimal - for context menu integration)
 */

(function() {
  'use strict';

  console.log('[Tab Goblin] Content script loaded');

  // Listen for messages from popup/sidepanel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SCROLL_POSITION') {
      sendResponse({ x: window.scrollX, y: window.scrollY });
    } else if (message.type === 'SET_SCROLL_POSITION') {
      window.scrollTo(message.x, message.y);
      sendResponse({ success: true });
    }
    return true;
  });
})();