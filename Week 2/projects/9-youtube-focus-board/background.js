/**
 * YouTube Focus Board - Background Service Worker
 */

// Side panel handling
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url?.includes('youtube.com')) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Message routing
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Forward messages to content script
  if (sender.tab && msg.type) {
    chrome.tabs.sendMessage(sender.tab.id, msg).catch(() => {});
  }
  return true;
});

// Install/Update handling
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      focusMode: false,
      theaterMode: false,
      notesVisible: true,
      statsVisible: true,
      breakInterval: 25 * 60 * 1000,
      totalWatchTime: 0
    });
  }
});

// Tab update - inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('youtube.com')) {
    // Content script auto-injects via manifest
  }
});