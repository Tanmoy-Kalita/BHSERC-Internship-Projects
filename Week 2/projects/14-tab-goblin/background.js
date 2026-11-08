/**
 * Tab Goblin - Background Service Worker
 */

const STORAGE_KEYS = {
  SESSIONS: 'tg_sessions',
  SETTINGS: 'tg_settings',
  SUSPENDED: 'tg_suspended'
};

// ============ STORAGE HELPERS ============
async function storageGet(key) {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

async function storageSet(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// ============ SESSION MANAGEMENT ============
async function saveSession(name, windowId = null) {
  const tabs = await chrome.tabs.query({ windowId: windowId || (await chrome.windows.getCurrent()).id });
  const session = {
    name,
    tabs: tabs.map(t => ({
      url: t.url,
      title: t.title,
      favIconUrl: t.favIconUrl,
      pinned: t.pinned,
      groupId: t.groupId,
      index: t.index
    })),
    timestamp: Date.now(),
    windowId: windowId || tabs[0]?.windowId
  };

  const sessions = (await storageGet(STORAGE_KEYS.SESSIONS)) || [];
  sessions.unshift(session);
  await storageSet(STORAGE_KEYS.SESSIONS, sessions.slice(0, 50));
  return session;
}

async function getSessions() {
  return (await storageGet(STORAGE_KEYS.SESSIONS)) || [];
}

async function restoreSession(sessionId, newWindow = false) {
  const sessions = await getSessions();
  const session = sessions.find(s => s.timestamp === sessionId);
  if (!session) return { success: false, error: 'Session not found' };

  if (newWindow) {
    const win = await chrome.windows.create({ url: session.tabs.map(t => t.url), focused: true });
    return { success: true, windowId: win.id };
  } else {
    const currentWindow = await chrome.windows.getCurrent();
    for (const tab of session.tabs) {
      await chrome.tabs.create({ windowId: currentWindow.id, url: tab.url, pinned: tab.pinned, active: false });
    }
    return { success: true };
  }
}

async function deleteSession(sessionId) {
  const sessions = (await getSessions()).filter(s => s.timestamp !== sessionId);
  await storageSet(STORAGE_KEYS.SESSIONS, sessions);
  return { success: true };
}

// ============ TAB SUSPENSION ============
async function suspendTabs(windowId = null) {
  const targetWindowId = windowId || (await chrome.windows.getCurrent()).id;
  const tabs = await chrome.tabs.query({ windowId: targetWindowId, active: false, pinned: false });

  const suspended = [];
  for (const tab of tabs) {
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
    suspended.push({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      scrollX: 0,
      scrollY: 0,
      timestamp: Date.now()
    });
    await chrome.tabs.remove(tab.id);
  }

  if (suspended.length) {
    const existing = (await storageGet(STORAGE_KEYS.SUSPENDED)) || [];
    existing.push(...suspended);
    await storageSet(STORAGE_KEYS.SUSPENDED, existing.slice(-200));
  }

  return { success: true, count: suspended.length };
}

async function getSuspendedTabs() {
  return (await storageGet(STORAGE_KEYS.SUSPENDED)) || [];
}

async function restoreSuspendedTab(tabData) {
  const tab = await chrome.tabs.create({ url: tabData.url, active: true });
  const suspended = (await getSuspendedTabs()).filter(t => t.id !== tabData.id);
  await storageSet(STORAGE_KEYS.SUSPENDED, suspended);
  return { success: true, tabId: tab.id };
}

async function restoreAllSuspended() {
  const suspended = await getSuspendedTabs();
  for (const tabData of suspended) {
    await chrome.tabs.create({ url: tabData.url, active: false });
  }
  await storageSet(STORAGE_KEYS.SUSPENDED, []);
  return { success: true, count: suspended.length };
}

async function deleteSuspendedTab(tabId) {
  const suspended = (await getSuspendedTabs()).filter(t => t.id !== tabId);
  await storageSet(STORAGE_KEYS.SUSPENDED, suspended);
  return { success: true };
}

// ============ TAB OPERATIONS ============
async function closeTabs(tabIds) {
  await chrome.tabs.remove(tabIds);
  return { success: true };
}

async function pinTabs(tabIds) {
  for (const id of tabIds) await chrome.tabs.update(id, { pinned: true });
  return { success: true };
}

async function unpinTabs(tabIds) {
  for (const id of tabIds) await chrome.tabs.update(id, { pinned: false });
  return { success: true };
}

async function moveTabsToGroup(tabIds, groupId = null) {
  if (groupId === null) {
    const group = await chrome.tabs.group({ tabIds });
    return { success: true, groupId: group };
  }
  await chrome.tabs.group({ tabIds, groupId });
  return { success: true };
}

async function ungroupTabs(tabIds) {
  await chrome.tabs.ungroup(tabIds);
  return { success: true };
}

async function getTabGroups(windowId = null) {
  const targetWindowId = windowId || (await chrome.windows.getCurrent()).id;
  return await chrome.tabGroups.query({ windowId: targetWindowId });
}

async function updateGroup(groupId, properties) {
  await chrome.tabGroups.update(groupId, properties);
  return { success: true };
}

async function moveTab(tabId, index, windowId = null) {
  await chrome.tabs.move(tabId, { index, windowId: windowId || undefined });
  return { success: true };
}

// ============ SEARCH ============
async function searchTabs(query) {
  const allTabs = await chrome.tabs.query({});
  const lowerQuery = query.toLowerCase();
  return allTabs.filter(t =>
    t.title.toLowerCase().includes(lowerQuery) ||
    t.url.toLowerCase().includes(lowerQuery)
  ).map(t => ({
    id: t.id,
    windowId: t.windowId,
    title: t.title,
    url: t.url,
    favIconUrl: t.favIconUrl,
    pinned: t.pinned,
    active: t.active,
    groupId: t.groupId,
    index: t.index
  }));
}

// ============ MESSAGE HANDLING ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      let result;
      switch (message.type) {
        case 'GET_TABS':
          result = await chrome.tabs.query({ windowId: message.windowId || undefined });
          result = result.map(t => ({
            id: t.id,
            windowId: t.windowId,
            title: t.title,
            url: t.url,
            favIconUrl: t.favIconUrl,
            pinned: t.pinned,
            active: t.active,
            groupId: t.groupId,
            index: t.index,
            audible: t.audible,
            mutedInfo: t.mutedInfo
          }));
          break;
        case 'GET_GROUPS':
          result = await getTabGroups(message.windowId);
          break;
        case 'SEARCH_TABS':
          result = await searchTabs(message.query);
          break;
        case 'CLOSE_TABS':
          result = await closeTabs(message.tabIds);
          break;
        case 'PIN_TABS':
          result = await pinTabs(message.tabIds);
          break;
        case 'UNPIN_TABS':
          result = await unpinTabs(message.tabIds);
          break;
        case 'MOVE_TO_GROUP':
          result = await moveTabsToGroup(message.tabIds, message.groupId);
          break;
        case 'UNGROUP_TABS':
          result = await ungroupTabs(message.tabIds);
          break;
        case 'UPDATE_GROUP':
          result = await updateGroup(message.groupId, message.properties);
          break;
        case 'MOVE_TAB':
          result = await moveTab(message.tabId, message.index, message.windowId);
          break;
        case 'SUSPEND_TABS':
          result = await suspendTabs(message.windowId);
          break;
        case 'GET_SUSPENDED':
          result = await getSuspendedTabs();
          break;
        case 'RESTORE_SUSPENDED':
          result = await restoreSuspendedTab(message.tabData);
          break;
        case 'RESTORE_ALL_SUSPENDED':
          result = await restoreAllSuspended();
          break;
        case 'DELETE_SUSPENDED':
          result = await deleteSuspendedTab(message.tabId);
          break;
        case 'SAVE_SESSION':
          result = await saveSession(message.name, message.windowId);
          break;
        case 'GET_SESSIONS':
          result = await getSessions();
          break;
        case 'RESTORE_SESSION':
          result = await restoreSession(message.sessionId, message.newWindow);
          break;
        case 'DELETE_SESSION':
          result = await deleteSession(message.sessionId);
          break;
        case 'EXPORT_SESSION':
          const sessions = await getSessions();
          const session = sessions.find(s => s.timestamp === message.sessionId);
          result = session ? { success: true, data: session } : { success: false, error: 'Not found' };
          break;
        case 'IMPORT_SESSION':
          result = await saveSession(message.data.name + ' (imported)');
          break;
      }
      sendResponse({ success: true, data: result });
    } catch (e) {
      console.error('[Tab Goblin] Error:', e);
      sendResponse({ success: false, error: e.message });
    }
  })();
  return true;
});

// ============ CONTEXT MENU ============
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'tg-suspend-tab',
    title: 'Suspend Tab',
    contexts: ['tab']
  });
  chrome.contextMenus.create({
    id: 'tg-suspend-others',
    title: 'Suspend Other Tabs',
    contexts: ['tab']
  });
  chrome.contextMenus.create({
    id: 'tg-save-session',
    title: 'Save Window as Session',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'tg-suspend-tab') {
    await suspendTabs(tab.windowId);
  } else if (info.menuItemId === 'tg-suspend-others') {
    await suspendTabs(tab.windowId);
  } else if (info.menuItemId === 'tg-save-session') {
    await saveSession(`Session ${new Date().toLocaleString()}`, tab.windowId);
  }
});

// ============ KEYBOARD SHORTCUTS ============
chrome.commands.onCommand.addListener(async (command) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return;

  try {
    if (command === 'open-panel') {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
    } else if (command === 'suspend-tabs') {
      await suspendTabs(tabs[0].windowId);
    } else if (command === 'search-tabs') {
      chrome.runtime.sendMessage({ type: 'FOCUS_SEARCH' });
    }
  } catch (e) {
    console.error('[Tab Goblin] Shortcut error:', e);
  }
});

console.log('[Tab Goblin] Background service worker started');