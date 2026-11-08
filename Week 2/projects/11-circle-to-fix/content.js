/**
 * Circle to Fix - Content Script
 * Annotation tools + AI-powered code fixes for web elements
 */

(function() {
  'use strict';

  // ============ STATE ============
  let isActive = false;
  let currentMode = 'select'; // select, circle, rect, arrow, text
  let currentColor = '#2563eb';
  let annotations = [];
  let selectedElement = null;
  let fixPanelOpen = false;
  let dragData = null;

  // Canvas for drawing
  let canvas = null;
  let ctx = null;
  let overlay = null;
  let toolbar = null;
  let elementInfo = null;
  let fixPanel = null;

  // Colors
  const COLORS = ['#2563eb', '#dc2626', '#059669', '#ea580c', '#7c3aed', '#0891b2', '#f39c12', '#ec4899'];

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
    toast.className = `ctf-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  }

  function removeToast() { $$('.ctf-toast').forEach(t => t.remove()); }

  function getUniqueSelector(element) {
    if (element.id) return `#${element.id}`;
    const path = [];
    let current = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.className) {
        const classes = current.className.split(' ').filter(c => c && !c.startsWith('ctf-'));
        if (classes.length) selector += '.' + classes.join('.');
      }
      const siblings = [...current.parentElement?.children || []].filter(el => el.tagName === current.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  function getElementInfo(element) {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: [...element.classList].filter(c => !c.startsWith('ctf-')),
      selector: getUniqueSelector(element),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      styles: {
        display: styles.display,
        position: styles.position,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        fontSize: styles.fontSize,
        fontFamily: styles.fontFamily,
        margin: styles.margin,
        padding: styles.padding,
        border: styles.border,
        zIndex: styles.zIndex
      },
      html: element.outerHTML.substring(0, 2000),
      xpath: getXPath(element)
    };
  }

  function getXPath(element) {
    if (element.id) return `//*[@id="${element.id}"]`;
    if (element === document.body) return '/html/body';

    const siblings = [...element.parentNode.children].filter(el => el.tagName === element.tagName);
    if (siblings.length === 1) {
      return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase();
    }
    const index = siblings.indexOf(element) + 1;
    return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + `[${index}]`;
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!')).catch(() => showToast('Failed to copy', 'error'));
  }

  // ============ CANVAS & OVERLAY ============
  function createOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'ctf-overlay';
    overlay.innerHTML = '<canvas class="ctf-canvas"></canvas>';
    document.body.appendChild(overlay);

    canvas = overlay.querySelector('canvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();

    window.addEventListener('resize', resizeCanvas);

    // Mouse events for drawing
    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    overlay.addEventListener('click', onClick);

    return overlay;
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(devicePixelRatio, devicePixelRatio);
    redrawAnnotations();
  }

  function createToolbar() {
    if (toolbar) return toolbar;

    toolbar = document.createElement('div');
    toolbar.className = 'ctf-toolbar';
    toolbar.innerHTML = `
      <button class="ctf-tool-btn" data-mode="select" title="Select Element (V)">👆</button>
      <button class="ctf-tool-btn" data-mode="circle" title="Circle (C)">⭕</button>
      <button class="ctf-tool-btn" data-mode="rect" title="Rectangle (R)">⬜</button>
      <button class="ctf-tool-btn" data-mode="arrow" title="Arrow (A)">➡️</button>
      <button class="ctf-tool-btn" data-mode="text" title="Text (T)">📝</button>
      <div class="ctf-tool-divider"></div>
      <button class="ctf-tool-btn" data-action="analyze" title="Analyze Selected (Enter)">🔍</button>
      <button class="ctf-tool-btn" data-action="clear" title="Clear All (Delete)">🗑️</button>
      <div class="ctf-tool-divider"></div>
      <div class="ctf-color-picker">
        ${COLORS.map(c => `<button class="ctf-color-btn" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
      </div>
      <button class="ctf-tool-btn" data-action="close" title="Close (Esc)">✕</button>
    `;

    document.body.appendChild(toolbar);

    // Tool selection
    toolbar.querySelectorAll('[data-mode]').forEach(btn => {
      btn.onclick = () => setMode(btn.dataset.mode);
    });

    // Color selection
    toolbar.querySelectorAll('[data-color]').forEach(btn => {
      btn.onclick = () => setColor(btn.dataset.color);
    });

    // Actions
    toolbar.querySelector('[data-action="analyze"]').onclick = analyzeSelected;
    toolbar.querySelector('[data-action="clear"]').onclick = clearAnnotations;
    toolbar.querySelector('[data-action="close"]').onclick = deactivate;

    return toolbar;
  }

  function createElementInfo() {
    if (elementInfo) return elementInfo;

    elementInfo = document.createElement('div');
    elementInfo.className = 'ctf-element-info';
    document.body.appendChild(elementInfo);
    return elementInfo;
  }

  function createFixPanel() {
    if (fixPanel) return fixPanel;

    fixPanel = document.createElement('div');
    fixPanel.className = 'ctf-fix-panel';
    fixPanel.innerHTML = `
      <div class="ctf-fix-header">
        <span class="ctf-fix-title">🔍 AI Fix Suggestions</span>
        <button class="ctf-fix-close" onclick="closeFixPanel()">×</button>
      </div>
      <div class="ctf-fix-tabs">
        <button class="ctf-fix-tab active" data-tab="suggestions">Suggestions</button>
        <button class="ctf-fix-tab" data-tab="code">Code</button>
        <button class="ctf-fix-tab" data-tab="accessibility">A11y</button>
      </div>
      <div class="ctf-fix-content" id="ctfFixContent">
        <div class="ctf-loading"><div class="ctf-spinner"></div>Analyzing element...</div>
      </div>
    `;

    document.body.appendChild(fixPanel);

    // Tab switching
    fixPanel.querySelectorAll('.ctf-fix-tab').forEach(tab => {
      tab.onclick = () => switchFixTab(tab.dataset.tab);
    });

    return fixPanel;
  }

  function switchFixTab(tabName) {
    fixPanel.querySelectorAll('.ctf-fix-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    renderFixContent(tabName);
  }

  // ============ MODE & COLOR ============
  function setMode(mode) {
    currentMode = mode;
    toolbar.querySelectorAll('[data-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));

    // Update cursor
    document.body.className = document.body.className.replace(/ctf-mode-\w+/g, '');
    if (mode !== 'select') document.body.classList.add(`ctf-mode-${mode}`);

    // Show/hide element info
    if (mode === 'select') {
      showElementInfo();
    } else {
      elementInfo?.classList.remove('show');
    }
  }

  function setColor(color) {
    currentColor = color;
    toolbar.querySelectorAll('[data-color]').forEach(btn => btn.classList.toggle('active', btn.dataset.color === color));
  }

  // ============ DRAWING ============
  function onMouseDown(e) {
    if (currentMode === 'select') return;

    dragData = {
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      mode: currentMode
    };

    if (currentMode === 'text') {
      createTextAnnotation(e.clientX, e.clientY);
      dragData = null;
    }
  }

  function onMouseMove(e) {
    if (!dragData) return;

    dragData.currentX = e.clientX;
    dragData.currentY = e.clientY;
    redrawAnnotations();
  }

  function onMouseUp(e) {
    if (!dragData) return;

    const { startX, startY, currentX, currentY, mode } = dragData;
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    if (width > 5 || height > 5) {
      const annotation = {
        id: 'ann_' + Date.now(),
        type: mode,
        x: Math.min(startX, currentX),
        y: Math.min(startY, currentY),
        width: width,
        height: height,
        color: currentColor,
        timestamp: Date.now()
      };

      if (mode === 'arrow') {
        annotation.startX = startX;
        annotation.startY = startY;
        annotation.endX = currentX;
        annotation.endY = currentY;
      }

      annotations.push(annotation);
      saveAnnotations();
    }

    dragData = null;
    redrawAnnotations();
  }

  function onClick(e) {
    if (currentMode !== 'select') return;

    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (element && element !== overlay && element !== canvas && !element.closest('.ctf-toolbar, .ctf-fix-panel, .ctf-element-info, .ctf-toast')) {
      selectElement(element);
    }
  }

  function createTextAnnotation(x, y) {
    const text = prompt('Enter annotation text:');
    if (!text) return;

    const annotation = {
      id: 'ann_' + Date.now(),
      type: 'text',
      x: x,
      y: y,
      text: text,
      color: currentColor,
      timestamp: Date.now()
    };

    annotations.push(annotation);
    saveAnnotations();
    redrawAnnotations();
  }

  function redrawAnnotations() {
    ctx.clearRect(0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);

    // Draw saved annotations
    annotations.forEach(ann => drawAnnotation(ann));

    // Draw current drag
    if (dragData) {
      drawDragPreview(dragData);
    }
  }

  function drawAnnotation(ann) {
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = 3;
    ctx.fillStyle = ann.color;
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';

    switch (ann.type) {
      case 'circle':
        ctx.beginPath();
        ctx.ellipse(ann.x + ann.width / 2, ann.y + ann.height / 2, ann.width / 2, ann.height / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'rect':
        ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
        break;
      case 'arrow':
        drawArrow(ann.startX, ann.startY, ann.endX, ann.endY);
        break;
      case 'text':
        ctx.fillText(ann.text, ann.x, ann.y);
        break;
    }
  }

  function drawDragPreview(data) {
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);

    switch (data.mode) {
      case 'circle':
        ctx.beginPath();
        ctx.ellipse(data.startX + (data.currentX - data.startX) / 2, data.startY + (data.currentY - data.startY) / 2,
          Math.abs(data.currentX - data.startX) / 2, Math.abs(data.currentY - data.startY) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'rect':
        ctx.strokeRect(Math.min(data.startX, data.currentX), Math.min(data.startY, data.currentY),
          Math.abs(data.currentX - data.startX), Math.abs(data.currentY - data.startY));
        break;
      case 'arrow':
        drawArrow(data.startX, data.startY, data.currentX, data.currentY);
        break;
    }

    ctx.setLineDash([]);
  }

  function drawArrow(fromX, fromY, toX, toY) {
    const headLen = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  // ============ ELEMENT SELECTION ============
  function selectElement(element) {
    // Remove previous highlight
    $$('.ctf-highlight').forEach(h => h.remove());

    if (element === selectedElement) {
      selectedElement = null;
      elementInfo?.classList.remove('show');
      return;
    }

    selectedElement = element;

    // Create highlight
    const highlight = document.createElement('div');
    highlight.className = 'ctf-highlight';
    const rect = element.getBoundingClientRect();
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
    document.body.appendChild(highlight);

    // Show element info
    showElementInfo(element);
  }

  function showElementInfo(element = null) {
    const el = element || selectedElement;
    if (!el) {
      elementInfo?.classList.remove('show');
      return;
    }

    const info = getElementInfo(el);
    elementInfo = createElementInfo();

    elementInfo.innerHTML = `
      <code>${info.tag}</code>
      ${info.id ? ` <code>#${info.id}</code>` : ''}
      ${info.classes.length ? info.classes.map(c => `<code>.${c}</code>`).join(' ') : ''}
      <br><small>${info.selector}</small>
    `;

    elementInfo.style.left = '50%';
    elementInfo.style.bottom = '24px';
    elementInfo.classList.add('show');

    // Auto-hide after 5 seconds
    setTimeout(() => elementInfo?.classList.remove('show'), 5000);
  }

  // ============ AI ANALYSIS ============
  async function analyzeSelected() {
    if (!selectedElement) {
      showToast('Select an element first', 'error');
      return;
    }

    openFixPanel();
    await generateFixSuggestions(selectedElement);
  }

  function openFixPanel() {
    fixPanel = createFixPanel();
    fixPanel.classList.add('show');
    fixPanelOpen = true;
  }

  function closeFixPanel() {
    fixPanel?.classList.remove('show');
    fixPanelOpen = false;
  }

  async function generateFixSuggestions(element) {
    const info = getElementInfo(element);
    const content = document.getElementById('ctfFixContent');

    // Simulate AI analysis with rule-based suggestions
    const suggestions = analyzeElement(info);

    renderSuggestions(suggestions);
    renderCodeSuggestions(info, suggestions);
    renderAccessibilitySuggestions(info, suggestions);
  }

  function analyzeElement(info) {
    const suggestions = [];
    const { tag, styles, classes, html } = info;

    // Accessibility checks
    if (tag === 'img' && !html.includes('alt=')) {
      suggestions.push({ type: 'accessibility', title: 'Missing alt attribute', desc: 'Add alt text for screen readers', code: '<img src="..." alt="Description of image">' });
    }

    if (tag === 'button' && !html.includes('aria-label') && !html.includes('aria-labelledby') && !element.textContent?.trim()) {
      suggestions.push({ type: 'accessibility', title: 'Button lacks accessible name', desc: 'Add aria-label or text content', code: '<button aria-label="Action description">...</button>' });
    }

    if (tag === 'input' && !html.includes('id=') && !document.querySelector(`label[for="${info.id}"]`)) {
      suggestions.push({ type: 'accessibility', title: 'Input missing label', desc: 'Associate with label using for/id', code: '<label for="input-id">Label</label><input id="input-id" />' });
    }

    // Color contrast
    if (styles.color && styles.backgroundColor) {
      const contrast = getContrastRatio(styles.color, styles.backgroundColor);
      if (contrast < 4.5) {
        suggestions.push({ type: 'accessibility', title: 'Low color contrast', desc: `Contrast ratio: ${contrast.toFixed(1)}:1 (needs 4.5:1)`, code: '/* Increase contrast: darker text or lighter background */' });
      }
    }

    // Performance
    if (styles.position === 'fixed' || styles.position === 'absolute') {
      if (parseInt(styles.zIndex) > 1000) {
        suggestions.push({ type: 'performance', title: 'High z-index', desc: 'May cause stacking context issues', code: '/* Consider lower z-index or restructuring layers */' });
      }
    }

    // Layout issues
    if (styles.display === 'inline' && (styles.width !== 'auto' || styles.height !== 'auto')) {
      suggestions.push({ type: 'bug', title: 'Inline element with dimensions', desc: 'Inline elements ignore width/height', code: 'display: inline-block; /* or block */' });
    }

    if (styles.overflow === 'visible' && (styles.width !== 'auto' || styles.height !== 'auto')) {
      const el = selectedElement;
      if (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) {
        suggestions.push({ type: 'bug', title: 'Content overflow', desc: 'Element content exceeds dimensions', code: 'overflow: auto; /* or hidden */' });
      }
    }

    // Best practices
    if (tag === 'div' && classes.some(c => c.includes('btn') || c.includes('button'))) {
      suggestions.push({ type: 'improvement', title: 'Div used as button', desc: 'Use semantic <button> for accessibility', code: '<button class="...">Click me</button>' });
    }

    if (html.includes('onclick') && tag !== 'button' && tag !== 'a') {
      suggestions.push({ type: 'improvement', title: 'Click handler on non-interactive element', desc: 'Add role="button" and keyboard support', code: '<div role="button" tabindex="0" onkeydown="handleKey">...</div>' });
    }

    // CSS improvements
    if (styles.margin && styles.margin !== '0px') {
      const margins = styles.margin.split(' ').map(v => parseFloat(v));
      if (margins.some(m => m < 0)) {
        suggestions.push({ type: 'improvement', title: 'Negative margins detected', desc: 'May cause layout issues', code: '/* Consider flex/grid layout instead */' });
      }
    }

    return suggestions;
  }

  function getContrastRatio(fg, bg) {
    // Simplified contrast calculation
    const getLuminance = (color) => {
      const rgb = parseColor(color);
      if (!rgb) return 0.5;
      const [r, g, b] = rgb.map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const parseColor = (color) => {
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
    };

    const l1 = getLuminance(fg);
    const l2 = getLuminance(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function renderFixContent(tab) {
    switch (tab) {
      case 'suggestions': renderSuggestions(analyzeElement(getElementInfo(selectedElement))); break;
      case 'code': renderCodeSuggestions(getElementInfo(selectedElement), analyzeElement(getElementInfo(selectedElement))); break;
      case 'accessibility': renderAccessibilitySuggestions(getElementInfo(selectedElement), analyzeElement(getElementInfo(selectedElement))); break;
    }
  }

  function renderSuggestions(suggestions) {
    const content = document.getElementById('ctfFixContent');

    if (suggestions.length === 0) {
      content.innerHTML = '<div class="ctf-empty"><div class="ctf-empty-icon">✨</div>No issues found! Element looks good.</div>';
      return;
    }

    content.innerHTML = suggestions.map(s => `
      <div class="ctf-suggestion">
        <div class="ctf-suggestion-title">
          ${getTypeIcon(s.type)} ${s.title}
          <span class="ctf-suggestion-type ctf-type-${s.type}">${s.type}</span>
        </div>
        <div class="ctf-suggestion-desc">${s.desc}</div>
        <div class="ctf-code-block" onclick="copyToClipboard(this.textContent)">${escapeHtml(s.code)}</div>
      </div>
    `).join('');
  }

  function renderCodeSuggestions(info, suggestions) {
    // Will be called when tab switches
  }

  function renderAccessibilitySuggestions(info, suggestions) {
    // Will be called when tab switches
  }

  function getTypeIcon(type) {
    const icons = { bug: '🐛', improvement: '💡', accessibility: '♿', performance: '⚡' };
    return icons[type] || '📝';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============ ANNOTATION STORAGE ============
  function saveAnnotations() {
    const url = window.location.href;
    const data = { [url]: annotations };
    chrome.storage.local.set({ ctfAnnotations: data });
  }

  async function loadAnnotations() {
    const result = await chrome.storage.local.get('ctfAnnotations');
    const url = window.location.href;
    if (result.ctfAnnotations?.[url]) {
      annotations = result.ctfAnnotations[url];
      redrawAnnotations();
    }
  }

  function clearAnnotations() {
    annotations = [];
    saveAnnotations();
    redrawAnnotations();
    showToast('Annotations cleared');
  }

  // ============ ACTIVATION ============
  function activate() {
    if (isActive) return;
    isActive = true;

    createOverlay();
    createToolbar();
    createElementInfo();
    loadAnnotations();

    overlay.classList.add('active');
    toolbar.classList.add('show');

    // Show initial mode
    setMode('select');

    showToast('Circle to Fix activated (Esc to exit)');
  }

  function deactivate() {
    if (!isActive) return;
    isActive = false;

    overlay?.classList.remove('active');
    toolbar?.classList.remove('show');
    closeFixPanel();
    elementInfo?.classList.remove('show');
    $$('.ctf-highlight').forEach(h => h.remove());

    selectedElement = null;
    showToast('Circle to Fix deactivated');
  }

  function toggle() {
    if (isActive) deactivate();
    else activate();
  }

  // ============ KEYBOARD SHORTCUTS ============
  document.addEventListener('keydown', (e) => {
    if (!isActive) return;

    if (e.key === 'Escape') { deactivate(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { clearAnnotations(); return; }
    if (e.key === 'Enter') { analyzeSelected(); return; }

    // Mode shortcuts
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'v': setMode('select'); break;
        case 'c': setMode('circle'); break;
        case 'r': setMode('rect'); break;
        case 'a': setMode('arrow'); break;
        case 't': setMode('text'); break;
      }
    }
  });

  // ============ MESSAGE HANDLING ============
  onMessage((type, data, sendResponse) => {
    switch (type) {
      case 'TOGGLE_CIRCLE_MODE':
        toggle();
        sendResponse({ success: true, active: isActive });
        break;
      case 'GET_ANNOTATIONS':
        sendResponse({ success: true, annotations });
        break;
    }
  });

  // Expose functions globally for inline handlers
  window.copyToClipboard = copyToClipboard;
  window.closeFixPanel = closeFixPanel;

  // ============ INIT ============
  // Check for activation via keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      toggle();
    }
  });

  console.log('[Circle to Fix] Ready (Alt+Shift+C to toggle)');
})();