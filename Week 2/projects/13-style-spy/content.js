/**
 * Style Spy - Content Script
 * Inspects and extracts CSS styles from any webpage
 */

(function() {
  'use strict';

  // ============ STATE ============
  let isActive = false;
  let hoveredElement = null;
  let selectedElement = null;
  let highlightOverlay = null;
  let tooltip = null;
  let inspectorPanel = null;
  let styleCache = new Map();

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
    toast.className = `ss-toast ${type}`;
    toast.innerHTML = `${message} <button onclick="this.parentElement.remove()">×</button>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  }

  function removeToast() { $$('.ss-toast').forEach(t => t.remove()); }

  function getUniqueSelector(el) {
    if (el.id) return `#${el.id}`;
    const path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('ss-'));
        if (classes.length) selector += '.' + classes.join('.');
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      path.unshift(selector);
      el = parent;
      if (path.length > 4) break;
    }
    return path.join(' > ');
  }

  function getComputedStyles(el) {
    const computed = window.getComputedStyle(el);
    const styles = {};

    // Key properties to extract
    const properties = [
      // Layout
      'display', 'position', 'top', 'right', 'bottom', 'left',
      'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'gap',
      'grid', 'grid-template-columns', 'grid-template-rows', 'grid-gap',
      'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
      'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'box-sizing', 'overflow', 'overflow-x', 'overflow-y',

      // Visual
      'background', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
      'border', 'border-width', 'border-style', 'border-color', 'border-radius',
      'border-top', 'border-right', 'border-bottom', 'border-left',
      'box-shadow', 'opacity', 'transform', 'transform-origin',

      // Typography
      'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
      'letter-spacing', 'text-align', 'text-decoration', 'text-transform', 'white-space',
      'word-break', 'overflow-wrap',

      // Spacing & Positioning
      'z-index', 'float', 'clear', 'vertical-align',

      // Transitions & Animations
      'transition', 'transition-property', 'transition-duration', 'transition-timing-function',
      'animation', 'animation-name', 'animation-duration', 'animation-timing-function',

      // Other
      'cursor', 'pointer-events', 'user-select', 'visibility'
    ];

    properties.forEach(prop => {
      const value = computed.getPropertyValue(prop);
      if (value && value !== 'initial' && value !== 'normal' && value !== 'none' && value !== '0px' && value !== '0' && value !== 'auto' && value !== 'visible' && value !== 'inline' && value !== 'block') {
        styles[prop] = value;
      }
    });

    return styles;
  }

  function getInlineStyles(el) {
    const styles = {};
    if (el.style && el.style.length) {
      for (let i = 0; i < el.style.length; i++) {
        const prop = el.style[i];
        const value = el.style.getPropertyValue(prop);
        if (value) styles[prop] = value;
      }
    }
    return styles;
  }

  function getAllStyles(el) {
    const computed = getComputedStyles(el);
    const inline = getInlineStyles(el);

    // Merge: inline overrides computed
    return {
      computed,
      inline,
      combined: { ...computed, ...inline }
    };
  }

  function formatCSS(styles, selector) {
    let css = `${selector} {\n`;
    const entries = Object.entries(styles).sort(([a], [b]) => a.localeCompare(b));
    entries.forEach(([prop, value]) => {
      css += `  ${prop}: ${value};\n`;
    });
    css += '}';
    return css;
  }

  function formatSCSS(styles, selector) {
    let scss = `${selector} {\n`;
    const entries = Object.entries(styles).sort(([a], [b]) => a.localeCompare(b));
    entries.forEach(([prop, value]) => {
      scss += `  ${prop}: ${value};\n`;
    });
    scss += '}';
    return scss;
  }

  function formatTailwind(styles) {
    // Basic mapping - would need a full Tailwind config for accuracy
    const mappings = {
      'display': { 'flex': 'flex', 'block': 'block', 'inline': 'inline', 'grid': 'grid', 'none': 'hidden' },
      'flex-direction': { 'row': 'flex-row', 'column': 'flex-col', 'row-reverse': 'flex-row-reverse', 'column-reverse': 'flex-col-reverse' },
      'justify-content': { 'center': 'justify-center', 'flex-start': 'justify-start', 'flex-end': 'justify-end', 'space-between': 'justify-between', 'space-around': 'justify-around' },
      'align-items': { 'center': 'items-center', 'flex-start': 'items-start', 'flex-end': 'items-end', 'stretch': 'items-stretch' },
      'gap': (v) => `gap-${parseInt(v) / 4}`, // Assuming 4px base
      'padding': (v) => `p-${parseInt(v) / 4}`,
      'margin': (v) => `m-${parseInt(v) / 4}`,
      'border-radius': (v) => `rounded-${v.replace('px', '')}`,
      'font-size': (v) => `text-${['xs','sm','base','lg','xl','2xl','3xl','4xl'][Math.min(7, Math.max(0, Math.round(parseInt(v) / 4) - 2))]}`,
      'font-weight': { '400': 'font-normal', '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold' },
      'color': (v) => `text-${v}`,
      'background-color': (v) => `bg-${v}`
    };

    const classes = [];
    Object.entries(styles).forEach(([prop, value]) => {
      if (mappings[prop]) {
        if (typeof mappings[prop] === 'function') {
          const result = mappings[prop](value);
          if (result) classes.push(result);
        } else if (mappings[prop][value]) {
          classes.push(mappings[prop][value]);
        }
      }
    });

    return classes.join(' ');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============ UI COMPONENTS ============
  function createHighlightOverlay() {
    if (highlightOverlay) return highlightOverlay;

    highlightOverlay = document.createElement('div');
    highlightOverlay.className = 'ss-highlight-overlay';
    highlightOverlay.innerHTML = `
      <div class="ss-overlay-border"></div>
      <div class="ss-overlay-margin"></div>
      <div class="ss-overlay-padding"></div>
      <div class="ss-overlay-content"></div>
      <div class="ss-overlay-label"></div>
    `;
    document.body.appendChild(highlightOverlay);
    return highlightOverlay;
  }

  function createTooltip() {
    if (tooltip) return tooltip;

    tooltip = document.createElement('div');
    tooltip.className = 'ss-tooltip';
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function createInspectorPanel() {
    if (inspectorPanel) return inspectorPanel;

    inspectorPanel = document.createElement('div');
    inspectorPanel.className = 'ss-inspector-panel';
    inspectorPanel.innerHTML = `
      <div class="ss-panel-header">
        <div class="ss-panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          Style Spy
        </div>
        <div class="ss-panel-actions">
          <button class="ss-btn-icon" id="ssBtnCopyCSS" title="Copy CSS (Alt+Shift+C)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="ss-btn-icon" id="ssBtnCopySelector" title="Copy Selector">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
          </button>
          <button class="ss-btn-icon" id="ssBtnClose" title="Close Inspector (Esc)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="ss-panel-tabs">
        <button class="ss-tab active" data-tab="computed">Computed</button>
        <button class="ss-tab" data-tab="inline">Inline</button>
        <button class="ss-tab" data-tab="css">CSS Output</button>
        <button class="ss-tab" data-tab="tailwind">Tailwind</button>
      </div>
      <div class="ss-panel-content">
        <div class="ss-tab-panel active" id="ssTabComputed"></div>
        <div class="ss-tab-panel" id="ssTabInline"></div>
        <div class="ss-tab-panel" id="ssTabCSS"></div>
        <div class="ss-tab-panel" id="ssTabTailwind"></div>
      </div>
      <div class="ss-panel-footer">
        <div class="ss-element-info">
          <span class="ss-selector" id="ssSelector"></span>
          <span class="ss-dimensions" id="ssDimensions"></span>
        </div>
        <div class="ss-panel-buttons">
          <button class="ss-btn ss-btn-secondary" id="ssBtnExport">Export All</button>
          <button class="ss-btn ss-btn-primary" id="ssBtnPin">Pin Element</button>
        </div>
      </div>
    `;

    document.body.appendChild(inspectorPanel);
    return inspectorPanel;
  }

  // ============ HIGHLIGHT & TOOLTIP ============
  function updateHighlight(el) {
    const overlay = createHighlightOverlay();
    if (!el) {
      overlay.classList.remove('show');
      return;
    }

    const rect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);

    // Main border
    const border = overlay.querySelector('.ss-overlay-border');
    border.style.cssText = `
      top: ${rect.top + window.scrollY}px;
      left: ${rect.left + window.scrollX}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 2px solid #059669;
      background: rgba(5, 150, 105, 0.1);
    `;

    // Margin
    const margin = overlay.querySelector('.ss-overlay-margin');
    const mTop = parseFloat(computed.marginTop) || 0;
    const mRight = parseFloat(computed.marginRight) || 0;
    const mBottom = parseFloat(computed.marginBottom) || 0;
    const mLeft = parseFloat(computed.marginLeft) || 0;
    if (mTop || mRight || mBottom || mLeft) {
      margin.style.cssText = `
        top: ${rect.top + window.scrollY - mTop}px;
        left: ${rect.left + window.scrollX - mLeft}px;
        width: ${rect.width + mLeft + mRight}px;
        height: ${rect.height + mTop + mBottom}px;
        border: 1px dashed #f59e0b;
        background: rgba(245, 158, 11, 0.05);
      `;
      margin.style.display = 'block';
    } else {
      margin.style.display = 'none';
    }

    // Padding
    const padding = overlay.querySelector('.ss-overlay-padding');
    const pTop = parseFloat(computed.paddingTop) || 0;
    const pRight = parseFloat(computed.paddingRight) || 0;
    const pBottom = parseFloat(computed.paddingBottom) || 0;
    const pLeft = parseFloat(computed.paddingLeft) || 0;
    if (pTop || pRight || pBottom || pLeft) {
      padding.style.cssText = `
        top: ${rect.top + window.scrollY}px;
        left: ${rect.left + window.scrollX}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 1px dotted #2563eb;
        background: rgba(37, 99, 235, 0.05);
      `;
      padding.style.display = 'block';
    } else {
      padding.style.display = 'none';
    }

    // Label
    const label = overlay.querySelector('.ss-overlay-label');
    const selector = getUniqueSelector(el);
    const tagName = el.tagName.toLowerCase();
    const className = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('ss-')).join('.') : '';
    const idName = el.id ? '#' + el.id : '';
    label.textContent = `${tagName}${idName}${className}`.substring(0, 60);
    label.style.cssText = `
      top: ${Math.max(10, rect.top + window.scrollY - 30)}px;
      left: ${rect.left + window.scrollX}px;
    `;

    overlay.classList.add('show');
  }

  function updateTooltip(el) {
    const tip = createTooltip();
    if (!el) {
      tip.classList.remove('show');
      return;
    }

    const rect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);
    const tagName = el.tagName.toLowerCase();
    const className = el.className && typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('ss-')).join(' ') : '';
    const idName = el.id ? '#' + el.id : '';

    tip.innerHTML = `
      <div class="ss-tooltip-tag">${tagName}</div>
      ${idName ? `<div class="ss-tooltip-id">${idName}</div>` : ''}
      ${className ? `<div class="ss-tooltip-class">.${className.replace(/ /g, '.')}</div>` : ''}
      <div class="ss-tooltip-size">${Math.round(rect.width)} × ${Math.round(rect.height)}</div>
      <div class="ss-tooltip-hint">Click to inspect →</div>
    `;

    tip.style.cssText = `
      top: ${rect.bottom + window.scrollY + 8}px;
      left: ${rect.left + window.scrollX}px;
    `;

    tip.classList.add('show');
  }

  function hideHighlightAndTooltip() {
    highlightOverlay?.classList.remove('show');
    tooltip?.classList.remove('show');
  }

  // ============ INSPECTOR PANEL ============
  function updateInspectorPanel(el) {
    const panel = createInspectorPanel();
    if (!el) {
      panel.classList.remove('show');
      return;
    }

    selectedElement = el;
    const styles = getAllStyles(el);
    const selector = getUniqueSelector(el);
    const rect = el.getBoundingClientRect();

    // Update selector
    $('#ssSelector', panel).textContent = selector;
    $('#ssDimensions', panel).textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

    // Computed styles
    const computedPanel = $('#ssTabComputed', panel);
    computedPanel.innerHTML = renderStyleGrid(styles.computed, true);

    // Inline styles
    const inlinePanel = $('#ssTabInline', panel);
    const inlineKeys = Object.keys(styles.inline);
    if (inlineKeys.length === 0) {
      inlinePanel.innerHTML = '<div class="ss-empty">No inline styles</div>';
    } else {
      inlinePanel.innerHTML = renderStyleGrid(styles.inline, false);
    }

    // CSS Output
    const cssPanel = $('#ssTabCSS', panel);
    cssPanel.innerHTML = `
      <div class="ss-code-output">
        <pre><code>${escapeHtml(formatCSS(styles.combined, selector))}</code></pre>
        <button class="ss-copy-btn" data-format="css">Copy CSS</button>
      </div>
    `;

    // Tailwind
    const tailwindPanel = $('#ssTabTailwind', panel);
    const twClasses = formatTailwind(styles.combined);
    tailwindPanel.innerHTML = `
      <div class="ss-code-output">
        <pre><code>${escapeHtml(twClasses || 'No Tailwind mappings available')}</code></pre>
        <button class="ss-copy-btn" data-format="tailwind">Copy Classes</button>
      </div>
    `;

    panel.classList.add('show');
    positionPanel(panel);
  }

  function renderStyleGrid(styles, isComputed) {
    const entries = Object.entries(styles).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return '<div class="ss-empty">No styles</div>';

    // Group by category
    const categories = {
      'Layout': ['display', 'position', 'top', 'right', 'bottom', 'left', 'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'gap', 'grid', 'grid-template-columns', 'grid-template-rows', 'grid-gap', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'box-sizing', 'overflow', 'overflow-x', 'overflow-y'],
      'Visual': ['background', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'border', 'border-width', 'border-style', 'border-color', 'border-radius', 'border-top', 'border-right', 'border-bottom', 'border-left', 'box-shadow', 'opacity', 'transform', 'transform-origin'],
      'Typography': ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform', 'white-space', 'word-break', 'overflow-wrap'],
      'Other': ['z-index', 'float', 'clear', 'vertical-align', 'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'cursor', 'pointer-events', 'user-select', 'visibility']
    };

    let html = '';
    Object.entries(categories).forEach(([cat, props]) => {
      const catStyles = entries.filter(([prop]) => props.includes(prop));
      if (catStyles.length === 0) return;

      html += `<div class="ss-style-category">
        <div class="ss-category-header">${cat}</div>
        <div class="ss-style-grid">`;

      catStyles.forEach(([prop, value]) => {
        const isColor = prop.includes('color') || prop.includes('background') || prop.includes('border') || prop.includes('shadow');
        html += `
          <div class="ss-style-row" data-prop="${prop}">
            <span class="ss-prop-name">${prop}</span>
            <span class="ss-prop-value ${isColor ? 'has-color' : ''}" data-value="${escapeHtml(value)}">
              ${isColor ? `<span class="ss-color-swatch" style="background: ${escapeHtml(value)}"></span>` : ''}
              ${escapeHtml(value)}
            </span>
            <button class="ss-copy-prop" title="Copy property" data-prop="${prop}" data-value="${escapeHtml(value)}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        `;
      });

      html += `</div></div>`;
    });

    return html;
  }

  function positionPanel(panel) {
    if (!hoveredElement) return;
    const rect = hoveredElement.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.right + window.scrollX + 16;
    let top = rect.top + window.scrollY;

    if (left + panelRect.width > viewportWidth + window.scrollX - 16) {
      left = rect.left + window.scrollX - panelRect.width - 16;
    }
    if (top + panelRect.height > viewportHeight + window.scrollY - 16) {
      top = viewportHeight + window.scrollY - panelRect.height - 16;
    }

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  // ============ EVENT HANDLERS ============
  function onMouseOver(e) {
    if (!isActive) return;
    if (e.target.closest('.ss-')) return; // Ignore our own UI

    hoveredElement = e.target;
    updateHighlight(hoveredElement);
    updateTooltip(hoveredElement);
  }

  function onMouseOut(e) {
    if (!isActive) return;
    // Don't hide if moving to tooltip or panel
    if (e.relatedTarget && (e.relatedTarget.closest('.ss-tooltip') || e.relatedTarget.closest('.ss-inspector-panel'))) return;
    hideHighlightAndTooltip();
  }

  function onClick(e) {
    if (!isActive) return;
    if (e.target.closest('.ss-')) return;

    e.preventDefault();
    e.stopPropagation();

    selectedElement = hoveredElement || e.target;
    updateInspectorPanel(selectedElement);
    hideHighlightAndTooltip();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      deactivateInspector();
    }
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      copyComputedStyles();
    }
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      toggleInspector();
    }
  }

  // ============ PANEL INTERACTIONS ============
  function setupPanelEvents() {
    const panel = createInspectorPanel();

    // Tab switching
    $$('.ss-tab', panel).forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.ss-tab', panel).forEach(t => t.classList.remove('active'));
        $$('.ss-tab-panel', panel).forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        $(`#ssTab${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}`, panel).classList.add('active');
      });
    });

    // Copy buttons
    panel.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('.ss-copy-btn');
      if (copyBtn) {
        const format = copyBtn.dataset.format;
        if (format === 'css') {
          await copyToClipboard(formatCSS(getAllStyles(selectedElement).combined, getUniqueSelector(selectedElement)));
          showToast('CSS copied to clipboard');
        } else if (format === 'tailwind') {
          await copyToClipboard(formatTailwind(getAllStyles(selectedElement).combined));
          showToast('Tailwind classes copied');
        }
        return;
      }

      const copyProp = e.target.closest('.ss-copy-prop');
      if (copyProp) {
        const prop = copyProp.dataset.prop;
        const value = copyProp.dataset.value;
        await copyToClipboard(`${prop}: ${value};`);
        showToast(`Copied ${prop}`);
        return;
      }

      const valueEl = e.target.closest('.ss-prop-value');
      if (valueEl && !e.target.closest('.ss-copy-prop')) {
        await copyToClipboard(valueEl.dataset.value);
        showToast('Value copied');
        return;
      }

      // Action buttons
      if (e.target.id === 'ssBtnCopyCSS' || e.target.closest('#ssBtnCopyCSS')) {
        await copyComputedStyles();
      }
      if (e.target.id === 'ssBtnCopySelector' || e.target.closest('#ssBtnCopySelector')) {
        const selector = getUniqueSelector(selectedElement);
        await copyToClipboard(selector);
        showToast('Selector copied');
      }
      if (e.target.id === 'ssBtnClose' || e.target.closest('#ssBtnClose')) {
        deactivateInspector();
      }
      if (e.target.id === 'ssBtnExport' || e.target.closest('#ssBtnExport')) {
        exportElementStyles();
      }
      if (e.target.id === 'ssBtnPin' || e.target.closest('#ssBtnPin')) {
        pinElement();
      }
    });
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  }

  async function copyComputedStyles() {
    if (!selectedElement) return;
    const styles = getAllStyles(selectedElement);
    const selector = getUniqueSelector(selectedElement);
    await copyToClipboard(formatCSS(styles.combined, selector));
    showToast('Computed CSS copied');
  }

  function exportElementStyles() {
    if (!selectedElement) return;
    const styles = getAllStyles(selectedElement);
    const selector = getUniqueSelector(selectedElement);
    const rect = selectedElement.getBoundingClientRect();

    const exportData = {
      selector,
      tagName: selectedElement.tagName.toLowerCase(),
      id: selectedElement.id,
      className: selectedElement.className,
      dimensions: { width: rect.width, height: rect.height },
      styles: styles.combined,
      computed: styles.computed,
      inline: styles.inline,
      timestamp: Date.now(),
      url: window.location.href
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `style-spy-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Styles exported');
  }

  function pinElement() {
    // Keep panel open for this element
    showToast('Element pinned');
  }

  // ============ DESIGN SYSTEM EXTRACTION ============
  function extractDesignSystem() {
    const elements = document.querySelectorAll('*');
    const colors = new Map();
    const typography = new Map();
    const spacing = new Map();
    const shadows = new Map();

    // Helper to normalize color values
    function normalizeColor(color) {
      if (!color || color === 'transparent' || color === 'initial' || color === 'inherit' || color === 'none') return null;

      // Convert rgb/rgba to hex
      const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
        const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
        const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toUpperCase();
      }

      // Already hex
      if (color.startsWith('#')) return color.toUpperCase();

      // Named colors - convert common ones
      const namedColors = {
        'white': '#FFFFFF', 'black': '#000000', 'red': '#FF0000', 'green': '#008000',
        'blue': '#0000FF', 'yellow': '#FFFF00', 'gray': '#808080', 'grey': '#808080',
        'silver': '#C0C0C0', 'maroon': '#800000', 'olive': '#808000', 'purple': '#800080',
        'teal': '#008080', 'navy': '#000080', 'transparent': null
      };
      const lower = color.toLowerCase();
      if (namedColors[lower]) return namedColors[lower];

      return color; // Return as-is if can't normalize
    }

    // Helper to extract numeric value from CSS length
    function extractNumber(value) {
      const match = value.match(/^([\d.]+)(px|rem|em|%)?$/);
      if (match) return parseFloat(match[1]);
      return null;
    }

    elements.forEach(el => {
      const computed = window.getComputedStyle(el);

      // Extract colors
      ['color', 'background-color', 'border-color', 'border-top-color', 'border-right-color',
       'border-bottom-color', 'border-left-color', 'outline-color'].forEach(prop => {
        const value = computed.getPropertyValue(prop);
        const normalized = normalizeColor(value);
        if (normalized && !['#000000', '#FFFFFF'].includes(normalized)) { // Skip pure black/white
          const count = colors.get(normalized) || 0;
          colors.set(normalized, count + 1);
        }
      });

      // Extract typography
      const fontFamily = computed.getPropertyValue('font-family');
      const fontSize = computed.getPropertyValue('font-size');
      const fontWeight = computed.getPropertyValue('font-weight');
      const lineHeight = computed.getPropertyValue('line-height');

      if (fontFamily && fontSize) {
        const key = `${fontFamily}|${fontSize}|${fontWeight}|${lineHeight}`;
        const count = typography.get(key) || 0;
        typography.set(key, count + 1);
      }

      // Extract spacing (margin, padding)
      ['margin-top', 'margin-right', 'margin-bottom', 'margin-left',
       'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
       'gap', 'margin', 'padding'].forEach(prop => {
        const value = computed.getPropertyValue(prop);
        const num = extractNumber(value);
        if (num !== null && num > 0) {
          const key = `${prop}:${Math.round(num)}px`;
          const count = spacing.get(key) || 0;
          spacing.set(key, count + 1);
        }
      });

      // Extract shadows
      const boxShadow = computed.getPropertyValue('box-shadow');
      if (boxShadow && boxShadow !== 'none') {
        const count = shadows.get(boxShadow) || 0;
        shadows.set(boxShadow, count + 1);
      }
    });

    // Sort and limit results
    const colorArray = [...colors.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([value, count]) => ({ value, count }));

    const typographyArray = [...typography.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([key, count]) => {
        const [fontFamily, fontSize, fontWeight, lineHeight] = key.split('|');
        return { fontFamily, fontSize, fontWeight, lineHeight, count };
      });

    const spacingArray = [...spacing.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => {
        const [property, val] = value.split(':');
        return { property, value: val, count };
      });

    const shadowArray = [...shadows.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([value, count]) => ({ value, count }));

    return { colors: colorArray, typography: typographyArray, spacing: spacingArray, shadows: shadowArray };
  }

  // ============ ACTIVATION ============
  function activateInspector() {
    if (isActive) return;
    isActive = true;

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);

    // Add active class to body for cursor
    document.body.classList.add('ss-inspecting');

    createHighlightOverlay();
    createTooltip();
    createInspectorPanel();
    setupPanelEvents();

    showToast('Style Inspector activated. Hover elements to inspect. Click to select. Press Esc to exit.');
  }

  function deactivateInspector() {
    if (!isActive) return;
    isActive = false;

    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);

    document.body.classList.remove('ss-inspecting');
    hideHighlightAndTooltip();

    const panel = createInspectorPanel();
    panel.classList.remove('show');

    selectedElement = null;
    hoveredElement = null;

    showToast('Style Inspector deactivated');
  }

  function toggleInspector() {
    if (isActive) deactivateInspector();
    else activateInspector();
  }

  // ============ MESSAGE HANDLING ============
  onMessage((type, data, sendResponse) => {
    switch (type) {
      case 'TOGGLE_INSPECTOR':
        toggleInspector();
        sendResponse({ success: true, active: isActive });
        break;
      case 'GET_ELEMENT_STYLES':
        if (selectedElement) {
          const styles = getAllStyles(selectedElement);
          const selector = getUniqueSelector(selectedElement);
          sendResponse({ success: true, styles, selector });
        } else {
          sendResponse({ success: false, error: 'No element selected' });
        }
        break;
      case 'ACTIVATE_INSPECTOR':
        activateInspector();
        sendResponse({ success: true });
        break;
      case 'DEACTIVATE_INSPECTOR':
        deactivateInspector();
        sendResponse({ success: true });
        break;
      case 'EXTRACT_DESIGN_SYSTEM':
        sendResponse({ success: true, data: extractDesignSystem() });
        break;
      case 'PING':
        sendResponse({ pong: true });
        break;
    }
  });

  // ============ KEYBOARD SHORTCUT ============
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      toggleInspector();
    }
  });

  // ============ INITIALIZATION ============
  function init() {
    console.log('[Style Spy] Content script loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();