/**
 * Job Clipper - Content Script
 * Extracts job postings from any webpage
 */

(function() {
  'use strict';

  // ============ SELECTORS FOR COMMON JOB SITES ============
  const SITE_SELECTORS = {
    'linkedin.com': {
      title: 'h1.t-24, h1.job-title, .job-details-jobs-unified-top-card__job-title',
      company: '.job-details-jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name',
      location: '.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet',
      description: '.jobs-description__content, .job-details-jobs-unified-top-card__description',
      salary: '.salary, .jobs-salary, [data-test="salary"]',
      type: '.jobs-unified-top-card__job-insight, .job-criteria',
      date: '.jobs-unified-top-card__posted-date, .posted-date'
    },
    'indeed.com': {
      title: 'h1.jobsearch-JobInfoHeader-title, h1[data-testid="jobsearch-JobInfoHeader-title"]',
      company: '[data-testid="inlineHeader-companyName"], .jobsearch-CompanyReview--heading',
      location: '[data-testid="jobsearch-JobInfoHeader-location"], .jobsearch-JobInfoHeader-location',
      description: '#jobDescriptionText, .jobsearch-jobDescriptionText',
      salary: '.jobsearch-JobMetadataHeader-item, .salary-snippet',
      type: '.jobsearch-JobMetadataHeader-item',
      date: '.jobsearch-JobMetadataHeader-item:last-child'
    },
    'glassdoor.com': {
      title: 'h1[data-test="job-title"], .job-title',
      company: '[data-test="employer-name"], .employer-name',
      location: '[data-test="location"], .location',
      description: '[data-test="job-description"], .jobDescriptionContent',
      salary: '[data-test="salary"], .salary-estimate',
      type: '[data-test="job-type"], .job-type',
      date: '[data-test="posted-date"], .posted-date'
    },
    'lever.co': {
      title: 'h1.posting-headline, h2.posting-headline',
      company: '.posting-company, .posting-title-company',
      location: '.posting-categories .location, .sort-by-location',
      description: '.posting-description, .section.description',
      salary: '.posting-salary, .salary',
      type: '.posting-categories .commitment',
      date: '.posting-date, .posting-categories .date'
    },
    'greenhouse.io': {
      title: 'h1.app-title, h1#job-title',
      company: '.company-name, .app-company',
      location: '.location, .app-location',
      description: '#content, .job-description',
      salary: '.salary, .app-salary',
      type: '.app-type, .commitment',
      date: '.date, .app-date'
    },
    'wellfound.com': {
      title: 'h1[data-test="job-title"], .job-title',
      company: '[data-test="company-name"], .company-name',
      location: '[data-test="location"], .location',
      description: '[data-test="job-description"], .job-description',
      salary: '[data-test="salary"], .salary',
      type: '[data-test="job-type"], .job-type',
      date: '[data-test="posted-date"], .posted-date'
    }
  };

  // Generic selectors for unknown sites
  const GENERIC_SELECTORS = {
    title: [
      'h1[class*="job" i], h1[class*="title" i], h1[class*="position" i]',
      'h1[data-testid*="job" i], h1[id*="job" i]',
      '.job-title, .position-title, .role-title',
      '[itemprop="title"], [data-cy*="title"]',
      'h1'
    ],
    company: [
      '[class*="company" i], [class*="employer" i], [class*="organization" i]',
      '[data-testid*="company" i], [itemprop="hiringOrganization"]',
      '.company-name, .employer-name, .organization-name',
      'a[href*="company" i], a[href*="employer" i]'
    ],
    location: [
      '[class*="location" i], [class*="address" i], [class*="city" i]',
      '[data-testid*="location" i], [itemprop="jobLocation"]',
      '.location, .job-location, .work-location',
      '[class*="remote" i]'
    ],
    description: [
      '[class*="description" i], [class*="details" i], [class*="content" i]',
      '[data-testid*="description" i], [itemprop="description"]',
      '.job-description, .description, .job-details',
      '#job-description, #description'
    ],
    salary: [
      '[class*="salary" i], [class*="compensation" i], [class*="pay" i]',
      '[data-testid*="salary" i], [itemprop="baseSalary"]',
      '.salary, .compensation, .pay-range'
    ],
    type: [
      '[class*="type" i], [class*="employment" i], [class*="contract" i]',
      '[class*="full-time" i], [class*="part-time" i], [class*="contract" i]',
      '[class*="remote" i], [class*="hybrid" i], [class*="onsite" i]'
    ],
    date: [
      '[class*="date" i], [class*="posted" i], [class*="published" i]',
      '[data-testid*="date" i], [itemprop="datePosted"]',
      '.date, .posted-date, .published-date'
    ]
  };

  // ============ STATE ============
  let floatingBtn = null;
  let extractPreview = null;
  let lastExtractedJob = null;

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
    toast.className = `jc-toast ${type}`;
    toast.innerHTML = `${message} <button onclick="this.parentElement.remove()">×</button>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4000);
  }

  function removeToast() {
    $$('.jc-toast').forEach(t => t.remove());
  }

  function getDomain() {
    return window.location.hostname.replace('www.', '');
  }

  function getSelectorsForSite() {
    const domain = getDomain();
    for (const [key, selectors] of Object.entries(SITE_SELECTORS)) {
      if (domain.includes(key)) return selectors;
    }
    return null;
  }

  // ============ EXTRACTION LOGIC ============
  function extractJobData() {
    const siteSelectors = getSelectorsForSite();
    const selectors = siteSelectors || GENERIC_SELECTORS;
    const job = { url: window.location.href, source: getDomain(), extractedAt: Date.now() };

    // Extract title
    job.title = extractField(selectors.title, 'title');
    job.titleConfidence = job.title.confidence;
    job.title = job.title.value;

    // Extract company
    job.company = extractField(selectors.company, 'company');
    job.companyConfidence = job.company.confidence;
    job.company = job.company.value;

    // Extract location
    job.location = extractField(selectors.location, 'location');
    job.locationConfidence = job.location.confidence;
    job.location = job.location.value;

    // Extract description
    job.description = extractField(selectors.description, 'description');
    job.descriptionConfidence = job.description.confidence;
    job.description = job.description.value;

    // Extract salary
    job.salary = extractField(selectors.salary, 'salary');
    job.salaryConfidence = job.salary.confidence;
    job.salary = job.salary.value;

    // Extract type
    job.type = extractField(selectors.type, 'type');
    job.typeConfidence = job.type.confidence;
    job.type = job.type.value;

    // Extract date
    job.date = extractField(selectors.date, 'date');
    job.dateConfidence = job.date.confidence;
    job.date = job.date.value;

    // Parse salary
    if (job.salary) job.parsedSalary = parseSalary(job.salary);

    // Parse job type
    if (job.type) job.parsedType = parseJobType(job.type);

    // Calculate overall confidence
    const confidences = [
      job.titleConfidence, job.companyConfidence, job.locationConfidence,
      job.descriptionConfidence, job.salaryConfidence, job.typeConfidence, job.dateConfidence
    ].filter(c => c !== 'none');
    const highCount = confidences.filter(c => c === 'high').length;
    const mediumCount = confidences.filter(c => c === 'medium').length;

    if (highCount >= 4) job.confidence = 'high';
    else if (highCount >= 2 || mediumCount >= 3) job.confidence = 'medium';
    else job.confidence = 'low';

    return job;
  }

  function extractField(selectorList, fieldName) {
    const selectors = Array.isArray(selectorList) ? selectorList : [selectorList];
    let bestMatch = { value: '', confidence: 'none', element: null };

    for (const selector of selectors) {
      try {
        const elements = $$(selector);
        for (const el of elements) {
          const text = getCleanText(el);
          if (!text || text.length < 2) continue;

          let confidence = 'low';
          if (siteSpecificSelector(selector)) confidence = 'high';
          else if (selector.includes('itemprop') || selector.includes('data-testid') || selector.includes('data-cy')) confidence = 'high';
          else if (selector.includes('class*=') || selector.includes('[class')) confidence = 'medium';

          // Prefer shorter, more specific matches for title/company
          if ((fieldName === 'title' || fieldName === 'company') && text.length > 100) continue;

          // For description, prefer longer text
          if (fieldName === 'description' && text.length < 50) continue;

          if (confidence === 'high' || (confidence === 'medium' && bestMatch.confidence !== 'high') ||
              (confidence === 'low' && bestMatch.confidence === 'none')) {
            bestMatch = { value: text, confidence, element: el };
            if (confidence === 'high') break;
          }
        }
        if (bestMatch.confidence === 'high') break;
      } catch (e) {}
    }

    return bestMatch;
  }

  function siteSpecificSelector(selector) {
    const domain = getDomain();
    return Object.keys(SITE_SELECTORS).some(site => domain.includes(site)) &&
           !selector.includes('class*=') && !selector.includes('[class');
  }

  function getCleanText(element) {
    // Clone to avoid modifying original
    const clone = element.cloneNode(true);

    // Remove unwanted elements
    clone.querySelectorAll('script, style, noscript, iframe, svg, .ad, .advertisement, [class*="ad" i]').forEach(el => el.remove());

    let text = clone.textContent || clone.innerText || '';
    text = text.replace(/\s+/g, ' ').trim();

    // Remove common noise
    text = text.replace(/^(apply|save|share|report|flag)[\s:]+/i, '');
    text = text.replace(/\s*(apply|save|share|report|flag)$/i, '');

    return text;
  }

  function parseSalary(text) {
    const result = { raw: text, min: null, max: null, currency: 'USD', period: 'year' };

    // Currency detection
    if (text.includes('₹') || text.includes('INR')) result.currency = 'INR';
    else if (text.includes('€') || text.includes('EUR')) result.currency = 'EUR';
    else if (text.includes('£') || text.includes('GBP')) result.currency = 'GBP';
    else if (text.includes('¥') || text.includes('JPY')) result.currency = 'JPY';
    else if (text.includes('CA$') || text.includes('CAD')) result.currency = 'CAD';
    else if (text.includes('A$') || text.includes('AUD')) result.currency = 'AUD';

    // Period detection
    if (/hour|hr|per hour/i.test(text)) result.period = 'hour';
    else if (/month|mo|per month/i.test(text)) result.period = 'month';
    else if (/week|wk|per week/i.test(text)) result.period = 'week';
    else if (/year|annum|annual|pa/i.test(text)) result.period = 'year';

    // Extract numbers
    const numbers = text.match(/[\d,]+(?:\.\d+)?/g);
    if (numbers) {
      const vals = numbers.map(n => parseFloat(n.replace(/,/g, '')));
      if (vals.length >= 2) { result.min = vals[0]; result.max = vals[1]; }
      else if (vals.length === 1) { result.min = result.max = vals[0]; }
    }

    // Convert to annual if needed
    if (result.period === 'hour' && result.min) { result.min *= 2080; if (result.max) result.max *= 2080; result.period = 'year'; }
    if (result.period === 'month' && result.min) { result.min *= 12; if (result.max) result.max *= 12; result.period = 'year'; }
    if (result.period === 'week' && result.min) { result.min *= 52; if (result.max) result.max *= 52; result.period = 'year'; }

    return result;
  }

  function parseJobType(text) {
    const types = [];
    const lower = text.toLowerCase();

    if (/(full.?time|fulltime|permanent)/i.test(lower)) types.push('Full-time');
    if (/(part.?time|parttime)/i.test(lower)) types.push('Part-time');
    if (/(contract|contractor|freelance|temp)/i.test(lower)) types.push('Contract');
    if (/(intern|internship)/i.test(lower)) types.push('Internship');
    if (/(remote|work from home|wfh|distributed)/i.test(lower)) types.push('Remote');
    if (/(hybrid)/i.test(lower)) types.push('Hybrid');
    if (/(onsite|on.?site|in.?office|office)/i.test(lower)) types.push('On-site');

    return types.length ? types : ['Not specified'];
  }

  // ============ UI COMPONENTS ============
  function createFloatingButton() {
    if (floatingBtn) return floatingBtn;

    floatingBtn = document.createElement('button');
    floatingBtn.className = 'jc-floating-btn';
    floatingBtn.innerHTML = '📋';
    floatingBtn.title = 'Clip this job (Alt+J)';
    floatingBtn.onclick = showExtractPreview;

    // Hide on non-job pages
    const job = extractJobData();
    if (!job.title || job.confidence === 'low') {
      floatingBtn.classList.add('hidden');
    }

    document.body.appendChild(floatingBtn);
    return floatingBtn;
  }

  function createExtractPreview() {
    if (extractPreview) return extractPreview;

    extractPreview = document.createElement('div');
    extractPreview.className = 'jc-extract-preview';
    extractPreview.innerHTML = `
      <div class="jc-preview-header">
        <span class="jc-preview-title">Job Details</span>
        <button class="jc-preview-close" onclick="closeExtractPreview()">×</button>
      </div>
      <div class="jc-preview-body" id="jcPreviewBody"></div>
      <div class="jc-preview-footer">
        <button class="jc-btn jc-btn-secondary" onclick="closeExtractPreview()">Cancel</button>
        <button class="jc-btn jc-btn-primary" onclick="saveJob()">Save Job</button>
      </div>
    `;

    document.body.appendChild(extractPreview);
    return extractPreview;
  }

  function showExtractPreview() {
    const job = extractJobData();
    lastExtractedJob = job;

    const preview = createExtractPreview();
    const body = document.getElementById('jcPreviewBody');

    body.innerHTML = `
      <div class="jc-field-group">
        <div class="jc-field-label">Title <span class="jc-confidence ${job.titleConfidence}">${job.titleConfidence}</span></div>
        <div class="jc-field-value ${job.title ? '' : 'empty'}">${job.title || 'Not detected'}</div>
      </div>
      <div class="jc-field-group">
        <div class="jc-field-label">Company <span class="jc-confidence ${job.companyConfidence}">${job.companyConfidence}</span></div>
        <div class="jc-field-value ${job.company ? '' : 'empty'}">${job.company || 'Not detected'}</div>
      </div>
      <div class="jc-field-group">
        <div class="jc-field-label">Location <span class="jc-confidence ${job.locationConfidence}">${job.locationConfidence}</span></div>
        <div class="jc-field-value ${job.location ? '' : 'empty'}">${job.location || 'Not detected'}</div>
      </div>
      <div class="jc-field-group">
        <div class="jc-field-label">Type <span class="jc-confidence ${job.typeConfidence}">${job.typeConfidence}</span></div>
        <div class="jc-field-value ${job.type ? '' : 'empty'}">${job.parsedType?.join(', ') || job.type || 'Not detected'}</div>
      </div>
      <div class="jc-field-group">
        <div class="jc-field-label">Salary <span class="jc-confidence ${job.salaryConfidence}">${job.salaryConfidence}</span></div>
        <div class="jc-field-value ${job.salary ? '' : 'empty'}">${job.salary || 'Not detected'}</div>
      </div>
      <div class="jc-field-group">
        <div class="jc-field-label">Posted <span class="jc-confidence ${job.dateConfidence}">${job.dateConfidence}</span></div>
        <div class="jc-field-value ${job.date ? '' : 'empty'}">${job.date || 'Not detected'}</div>
      </div>
      <div class="jc-field-group">
        <div class="jc-field-label">Description <span class="jc-confidence ${job.descriptionConfidence}">${job.descriptionConfidence}</span></div>
        <div class="jc-field-value ${job.description ? '' : 'empty'}" style="max-height: 200px; overflow-y: auto;">${job.description ? job.description.substring(0, 500) + (job.description.length > 500 ? '...' : '') : 'Not detected'}</div>
      </div>
      <div class="jc-field-group" style="padding-top: 12px; border-top: 1px solid #e5e7eb;">
        <div class="jc-field-label">Overall Confidence: <span class="jc-confidence ${job.confidence}">${job.confidence.toUpperCase()}</span></div>
        <div class="jc-field-value" style="font-size: 12px; color: #6b7280;">Source: ${job.source}</div>
      </div>
    `;

    preview.classList.add('show');
  }

  function closeExtractPreview() {
    extractPreview?.classList.remove('show');
  }

  async function saveJob() {
    if (!lastExtractedJob) return;

    // Add to storage
    const result = await chrome.storage.local.get({ jobs: [] });
    const jobs = result.jobs;

    // Check for duplicate
    const exists = jobs.some(j => j.url === lastExtractedJob.url);
    if (exists) {
      showToast('Job already saved!', 'error');
      return;
    }

    // Add status and timestamps
    lastExtractedJob.id = 'job_' + Date.now();
    lastExtractedJob.status = 'saved';
    lastExtractedJob.savedAt = Date.now();
    lastExtractedJob.appliedAt = null;
    lastExtractedJob.notes = '';

    jobs.unshift(lastExtractedJob);
    await chrome.storage.local.set({ jobs });

    showToast('Job saved to board! 🎉');
    closeExtractPreview();

    // Notify side panel
    sendMessage('JOB_SAVED', { job: lastExtractedJob });
  }

  // ============ KEYBOARD SHORTCUT ============
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'j' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      showExtractPreview();
    }
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      sendMessage('OPEN_SIDE_PANEL');
    }
  });

  // ============ MESSAGE HANDLING ============
  onMessage((type, data, sendResponse) => {
    switch (type) {
      case 'EXTRACT_JOB':
        const job = extractJobData();
        sendResponse({ success: true, job });
        break;
      case 'SHOW_PREVIEW':
        showExtractPreview();
        sendResponse({ success: true });
        break;
      case 'GET_JOB_DATA':
        sendResponse({ success: true, job: extractJobData() });
        break;
    }
  });

  // ============ INITIALIZATION ============
  function init() {
    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(createFloatingButton, 1000));
    } else {
      setTimeout(createFloatingButton, 1000);
    }

    // Re-check on navigation (SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => {
          floatingBtn?.remove();
          floatingBtn = null;
          createFloatingButton();
        }, 1000);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  init();
})();