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
 * Job Clipper - Popup Script
 */

let currentTab = null;

document.addEventListener('DOMContentLoaded', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  updateUI();
  loadStats();
  startPeriodicUpdate();
});

function updateUI() {
  const isJobSite = currentTab.url?.includes('linkedin.com') ||
                    currentTab.url?.includes('indeed.com') ||
                    currentTab.url?.includes('glassdoor.com') ||
                    currentTab.url?.includes('lever.co') ||
                    currentTab.url?.includes('greenhouse.io') ||
                    currentTab.url?.includes('wellfound.com');

  const statusText = document.getElementById('statusText');
  const btnClip = document.getElementById('btnClip');
  const jobPreview = document.getElementById('jobPreview');

  if (isJobSite) {
    statusText.textContent = 'Job site detected';
    btnClip.disabled = false;
    btnClip.textContent = '📋 Clip This Job';
  } else {
    statusText.textContent = 'Navigate to a job posting';
    btnClip.disabled = true;
    btnClip.textContent = '📋 Clip This Job (Alt+J)';
  }

  // Get current job preview from content script
  if (isJobSite) {
    requestJobPreview();
  } else {
    jobPreview.style.display = 'none';
  }
}

async function requestJobPreview() {
  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'GET_JOB_DATA' });
    if (response?.success && response.job) {
      showJobPreview(response.job);
    }
  } catch (e) {
    // Content script not ready
  }
}

function showJobPreview(job) {
  const preview = document.getElementById('jobPreview');
  const title = document.getElementById('previewTitle');
  const meta = document.getElementById('previewMeta');
  const confidence = document.getElementById('previewConfidence');

  title.textContent = job.title || 'Unknown Title';
  meta.innerHTML = `
    <span>🏢 ${job.company || 'Unknown Company'}</span>
    <span>📍 ${job.location || 'Unknown Location'}</span>
    <span>💼 ${job.parsedType?.join(', ') || 'Unknown Type'}</span>
  `;
  confidence.textContent = `Confidence: ${job.confidence?.toUpperCase() || 'LOW'}`;
  confidence.className = `confidence-badge confidence-${job.confidence || 'low'}`;

  preview.style.display = 'block';
}

async function clipJob() {
  if (!currentTab) return;

  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'SHOW_PREVIEW' });
    if (response?.success) {
      // The preview will show on the page
      window.close();
    }
  } catch (e) {
    alert('Could not clip job. Make sure you\'re on a job posting page.');
  }
}

function openBoard() {
  if (currentTab) {
    chrome.sidePanel.open({ tabId: currentTab.id });
    window.close();
  }
}

async function loadStats() {
  const result = await chrome.storage.local.get({ jobs: [] });
  const jobs = result.jobs;

  document.getElementById('statSaved').textContent = jobs.filter(j => j.status === 'saved').length;
  document.getElementById('statApplied').textContent = jobs.filter(j => j.status === 'applied').length;
  document.getElementById('statInterview').textContent = jobs.filter(j => j.status === 'interviewing').length;
  document.getElementById('statOffer').textContent = jobs.filter(j => j.status === 'offer').length;
}

function exportCSV() {
  if (currentTab) {
    chrome.tabs.sendMessage(currentTab.id, { type: 'EXPORT_CSV' });
    window.close();
  }
}

function importCSV() {
  if (currentTab) {
    chrome.tabs.sendMessage(currentTab.id, { type: 'IMPORT_CSV' });
    window.close();
  }
}

function openShortcuts() {
  chrome.runtime.openOptionsPage();
}

function startPeriodicUpdate() {
  setInterval(() => {
    if (currentTab?.url?.includes('linkedin.com') ||
        currentTab?.url?.includes('indeed.com') ||
        currentTab?.url?.includes('glassdoor.com')) {
      requestJobPreview();
      loadStats();
    }
  }, 5000);
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.jobs) loadStats();
});