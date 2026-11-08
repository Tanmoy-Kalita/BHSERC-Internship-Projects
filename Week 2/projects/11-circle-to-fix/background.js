/**
 * Circle to Fix - Background Service Worker
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ ctfAnnotations: {} });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-circle-mode') {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_CIRCLE_MODE' });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Forward messages to content scripts
  if (sender.tab && msg.type) {
    chrome.tabs.sendMessage(sender.tab.id, msg).catch(() => {});
  }
  return true;
});