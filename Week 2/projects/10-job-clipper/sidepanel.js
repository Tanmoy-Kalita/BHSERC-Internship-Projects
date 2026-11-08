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
 * Job Clipper - Side Panel Script (Kanban Board)
 */

let jobs = [];
let columns = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];
let columnColors = {
  saved: '#2563eb',
  applied: '#059669',
  interviewing: '#ea580c',
  offer: '#7c3aed',
  rejected: '#dc2626'
};
let customColumns = [];
let draggedJobId = null;
let currentModalJob = null;

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderBoard();
  setupEventListeners();
  setupDragAndDrop();
});

async function loadData() {
  const result = await chrome.storage.local.get({
    jobs: [],
    columns: ['saved', 'applied', 'interviewing', 'offer', 'rejected'],
    customColumns: [],
    columnColors: {}
  });

  jobs = result.jobs || [];
  columns = result.columns || columns;
  customColumns = result.customColumns || [];
  columnColors = { ...columnColors, ...result.columnColors };
}

async function saveData() {
  await chrome.storage.local.set({
    jobs,
    columns,
    customColumns,
    columnColors
  });
}

// ============ RENDERING ============
function renderBoard() {
  const board = document.getElementById('board');
  const allColumns = [...columns, ...customColumns.map(c => c.id)];

  board.innerHTML = allColumns.map(colId => {
    const colJobs = jobs.filter(j => j.status === colId);
    const customCol = customColumns.find(c => c.id === colId);
    const title = customCol?.name || formatColumnTitle(colId);
    const color = customCol?.color || columnColors[colId] || '#64748b';

    return `
      <div class="column" data-column="${colId}" style="border-top: 3px solid ${color};">
        <div class="column-header">
          <span class="column-title" style="color: ${color};">${title}</span>
          <span class="column-count" style="background: ${color};">${colJobs.length}</span>
        </div>
        <div class="column-drop-zone" data-column="${colId}" id="drop-${colId}"></div>
      </div>
    `;
  }).join('') + `
    <div class="add-column">
      <button class="add-column-btn" onclick="openAddColumnModal()">
        <span class="add-column-icon">➕</span>
        <span class="add-column-text">Add Column</span>
      </button>
    </div>
  `;

  // Render jobs in each column
  allColumns.forEach(colId => {
    const dropZone = document.getElementById(`drop-${colId}`);
    const colJobs = jobs.filter(j => j.status === colId);

    dropZone.innerHTML = colJobs.map(job => `
      <div class="job-card" draggable="true" data-job-id="${job.id}" ondragstart="dragStart(event)">
        <div class="job-card-title" title="${escapeHtml(job.title)}">${escapeHtml(job.title)}</div>
        <div class="job-card-company">${escapeHtml(job.company)}</div>
        <div class="job-card-meta">
          <span>📍 ${escapeHtml(job.location || 'Unknown')}</span>
          <span>💼 ${job.parsedType?.join(', ') || 'Unknown'}</span>
        </div>
        ${job.parsedSalary && job.parsedSalary.min ? `<div class="job-card-salary">💰 ${formatSalary(job.parsedSalary)}</div>` : ''}
        <div class="job-card-actions">
          <button class="job-card-btn job-card-btn-primary" onclick="event.stopPropagation(); openJobModal('${job.id}')">View</button>
          <button class="job-card-btn job-card-btn-secondary" onclick="event.stopPropagation(); moveJob('${job.id}', 'next')">→</button>
        </div>
      </div>
    `).join('');

    if (colJobs.length === 0) {
      dropZone.innerHTML = '<div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">Drop jobs here</div>';
    }
  });

  // Re-attach drag listeners
  setupDragAndDrop();
}

function formatColumnTitle(id) {
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/([A-Z])/g, ' $1');
}

function formatSalary(salary) {
  if (!salary.min) return 'Not specified';
  const curr = salary.currency === 'INR' ? '₹' : salary.currency === 'EUR' ? '€' : salary.currency === 'GBP' ? '£' : '$';
  if (salary.min === salary.max) return `${curr}${salary.min.toLocaleString()}/${salary.period}`;
  return `${curr}${salary.min.toLocaleString()} - ${curr}${salary.max.toLocaleString()}/${salary.period}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============ DRAG AND DROP ============
function setupDragAndDrop() {
  document.querySelectorAll('.job-card').forEach(card => {
    card.addEventListener('dragstart', dragStart);
    card.addEventListener('dragend', dragEnd);
  });

  document.querySelectorAll('.column-drop-zone').forEach(zone => {
    zone.addEventListener('dragover', dragOver);
    zone.addEventListener('dragleave', dragLeave);
    zone.addEventListener('drop', drop);
  });
}

function dragStart(e) {
  draggedJobId = e.target.dataset.jobId;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedJobId);
}

function dragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.column-drop-zone').forEach(z => z.classList.remove('drag-over'));
  draggedJobId = null;
}

function dragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const zone = e.target.closest('.column-drop-zone');
  if (zone) zone.classList.add('drag-over');
}

function dragLeave(e) {
  const zone = e.target.closest('.column-drop-zone');
  if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
}

async function drop(e) {
  e.preventDefault();
  const zone = e.target.closest('.column-drop-zone');
  if (!zone || !draggedJobId) return;

  zone.classList.remove('drag-over');
  const newStatus = zone.dataset.column;

  const jobIndex = jobs.findIndex(j => j.id === draggedJobId);
  if (jobIndex !== -1 && jobs[jobIndex].status !== newStatus) {
    jobs[jobIndex].status = newStatus;
    jobs[jobIndex].updatedAt = Date.now();
    if (newStatus === 'applied' && !jobs[jobIndex].appliedAt) jobs[jobIndex].appliedAt = Date.now();
    await saveData();
    renderBoard();
    showToast(`Moved to ${formatColumnTitle(newStatus)}`);
  }
}

// ============ JOB MODAL ============
function openJobModal(jobId) {
  const job = jobs.find(j => j.id === jobId);
  if (!job) return;

  currentModalJob = job;
  const modal = document.getElementById('jobModal');
  const body = document.getElementById('modalBody');

  document.getElementById('modalJobTitle').textContent = job.title;

  body.innerHTML = `
    <div class="modal-field">
      <label class="modal-label">Title</label>
      <input type="text" class="modal-textarea" id="editTitle" value="${escapeHtml(job.title)}" style="min-height: 40px;">
    </div>
    <div class="modal-field">
      <label class="modal-label">Company</label>
      <input type="text" class="modal-textarea" id="editCompany" value="${escapeHtml(job.company)}" style="min-height: 40px;">
    </div>
    <div class="modal-field">
      <label class="modal-label">Location</label>
      <input type="text" class="modal-textarea" id="editLocation" value="${escapeHtml(job.location || '')}" style="min-height: 40px;">
    </div>
    <div class="modal-field">
      <label class="modal-label">Status</label>
      <select class="modal-select" id="editStatus">
        ${[...columns, ...customColumns.map(c => c.id)].map(col => `
          <option value="${col}" ${job.status === col ? 'selected' : ''}>${formatColumnTitle(col)}</option>
        `).join('')}
      </select>
    </div>
    <div class="modal-field">
      <label class="modal-label">Job Type</label>
      <input type="text" class="modal-textarea" id="editType" value="${job.parsedType?.join(', ') || ''}" style="min-height: 40px;">
    </div>
    <div class="modal-field">
      <label class="modal-label">Salary</label>
      <input type="text" class="modal-textarea" id="editSalary" value="${job.salary || ''}" style="min-height: 40px;">
    </div>
    <div class="modal-field">
      <label class="modal-label">Source URL</label>
      <input type="text" class="modal-textarea" id="editUrl" value="${job.url}" style="min-height: 40px;" readonly>
    </div>
    <div class="modal-field">
      <label class="modal-label">Notes</label>
      <textarea class="modal-textarea" id="editNotes">${escapeHtml(job.notes || '')}</textarea>
    </div>
    <div class="modal-field">
      <label class="modal-label">Description</label>
      <textarea class="modal-textarea" id="editDescription" style="min-height: 120px;">${escapeHtml(job.description || '')}</textarea>
    </div>
  `;

  modal.classList.add('show');
}

function closeModal() {
  document.getElementById('jobModal').classList.remove('show');
  currentModalJob = null;
}

async function saveJobChanges() {
  if (!currentModalJob) return;

  const jobIndex = jobs.findIndex(j => j.id === currentModalJob.id);
  if (jobIndex === -1) return;

  jobs[jobIndex].title = document.getElementById('editTitle').value;
  jobs[jobIndex].company = document.getElementById('editCompany').value;
  jobs[jobIndex].location = document.getElementById('editLocation').value;
  jobs[jobIndex].status = document.getElementById('editStatus').value;
  jobs[jobIndex].notes = document.getElementById('editNotes').value;
  jobs[jobIndex].description = document.getElementById('editDescription').value;
  jobs[jobIndex].updatedAt = Date.now();

  await saveData();
  renderBoard();
  closeModal();
  showToast('Job updated');
}

async function deleteJob() {
  if (!currentModalJob) return;
  if (!confirm('Delete this job?')) return;

  jobs = jobs.filter(j => j.id !== currentModalJob.id);
  await saveData();
  renderBoard();
  closeModal();
  showToast('Job deleted');
}

// ============ COLUMN MANAGEMENT ============
function openAddColumnModal() {
  document.getElementById('addColumnModal').classList.add('show');
  document.getElementById('newColumnName').focus();
}

function closeAddColumnModal() {
  document.getElementById('addColumnModal').classList.remove('show');
  document.getElementById('newColumnName').value = '';
}

async function createColumn() {
  const name = document.getElementById('newColumnName').value.trim();
  const color = document.getElementById('newColumnColor').value;

  if (!name) { showToast('Enter a column name', 'error'); return; }

  const id = 'custom_' + name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (columns.includes(id) || customColumns.some(c => c.id === id)) {
    showToast('Column already exists', 'error');
    return;
  }

  customColumns.push({ id, name, color });
  columns.push(id);
  await saveData();
  renderBoard();
  closeAddColumnModal();
  showToast(`Column "${name}" added`);
}

// ============ EXPORT/IMPORT ============
async function exportCSV() {
  if (jobs.length === 0) { showToast('No jobs to export', 'error'); return; }

  const headers = ['Title', 'Company', 'Location', 'Status', 'Type', 'Salary', 'URL', 'Notes', 'Description', 'Date Saved', 'Date Applied'];
  const rows = jobs.map(job => [
    job.title, job.company, job.location || '', job.status,
    job.parsedType?.join('; ') || '', job.salary || '',
    job.url, job.notes || '', (job.description || '').substring(0, 500),
    new Date(job.savedAt).toLocaleString(),
    job.appliedAt ? new Date(job.appliedAt).toLocaleString() : ''
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `job-clipper-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported to CSV');
}

function importCSV() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) { showToast('Invalid CSV', 'error'); return; }

    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
    const titleIdx = headers.indexOf('title');
    const companyIdx = headers.indexOf('company');
    const locationIdx = headers.indexOf('location');
    const statusIdx = headers.indexOf('status');
    const urlIdx = headers.indexOf('url');

    if (titleIdx === -1 || companyIdx === -1) { showToast('CSV must have title and company columns', 'error'); return; }

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length <= Math.max(titleIdx, companyIdx, locationIdx, statusIdx, urlIdx)) continue;

      const job = {
        id: 'job_' + Date.now() + '_' + i,
        title: values[titleIdx] || 'Unknown',
        company: values[companyIdx] || 'Unknown',
        location: values[locationIdx] || '',
        status: values[statusIdx] || 'saved',
        url: values[urlIdx] || '',
        notes: '',
        description: '',
        savedAt: Date.now(),
        appliedAt: null,
        source: 'import',
        confidence: 'manual'
      };

      // Check duplicate
      if (!jobs.some(j => j.url === job.url && job.url)) {
        jobs.unshift(job);
        imported++;
      }
    }

    await saveData();
    renderBoard();
    showToast(`Imported ${imported} jobs`);
  };
  input.click();
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
  document.getElementById('btnAddColumn').onclick = openAddColumnModal;
  document.getElementById('btnExport').onclick = exportCSV;
  document.getElementById('btnImport').onclick = importCSV;

  // Close modals on outside click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
        if (modal.id === 'jobModal') currentModalJob = null;
      }
    });
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.jobs) {
      jobs = changes.jobs.newValue || [];
      renderBoard();
    }
  });
}

// ============ UTILITIES ============
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function moveJob(jobId, direction) {
  const job = jobs.find(j => j.id === jobId);
  if (!job) return;

  const allColumns = [...columns, ...customColumns.map(c => c.id)];
  const currentIndex = allColumns.indexOf(job.status);

  if (direction === 'next' && currentIndex < allColumns.length - 1) {
    job.status = allColumns[currentIndex + 1];
    job.updatedAt = Date.now();
    if (job.status === 'applied' && !job.appliedAt) job.appliedAt = Date.now();
    saveData();
    renderBoard();
  }
}