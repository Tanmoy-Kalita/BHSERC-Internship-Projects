/**
 * Job Clipper - Background Service Worker
 */

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_SIDE_PANEL' && sender.tab) {
    chrome.sidePanel.open({ tabId: sender.tab.id });
    sendResponse({ success: true });
  }
  if (msg.type === 'JOB_SAVED') {
    // Could notify other contexts
    sendResponse({ success: true });
  }
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      jobs: [],
      columns: ['saved', 'applied', 'interviewing', 'offer', 'rejected']
    });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'clip-job') {
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PREVIEW' });
  } else if (command === 'open-board') {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});