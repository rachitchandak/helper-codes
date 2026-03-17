function runDialogDetector(overrides = {}) {
  const previous = window.__dialogDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minScore: 28,
    maxResults: 20,
    overlayZIndex: 2147483646,
    palette: ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#457b9d', '#ff7b00', '#6a4c93', '#1982c4'],
    ignoredTags: new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH']),
    highlightVisible: true,
  };

  const config = {
    ...BASE_CONFIG,
    maxResults: overrides.maxResults ?? BASE_CONFIG.maxResults,
    highlightVisible: overrides.highlightVisible ?? BASE_CONFIG.highlightVisible,
  };

  const state = {
    overlays: [],
    styleEl: null,
    results: [],
  };

  const unique = (items) => [...new Set(items.filter(Boolean))];
  const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  const normalizeText = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  const classTextFor = (el) => (el instanceof Element ? `${el.tagName} ${String(el.id || '')} ${String(el.className || '')}` : '');
  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };
  const viewportSize = () => ({
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  });
  const summarizeRect = (rect) => ({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
  const getDepth = (el) => {
    let depth = 0;
    let current = el;
    while (current && current !== document.body) {
      depth += 1;
      current = current.parentElement;
    }
    return depth;
  };
  const buildSelectorHint = (el) => {
    const parts = [];
    let current = el;
    while (current && current !== document.body && parts.length < 4) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += `#${escapeCss(current.id)}`;
        parts.unshift(part);
        break;
      }
      const classes = [...current.classList].slice(0, 2).map((name) => `.${escapeCss(name)}`).join('');
      if (classes) part += classes;
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  };
  const getAccessibleLabel = (el) => {
    if (!(el instanceof Element)) return '';
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (!labelledBy) return '';
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((node) => normalizeText(node))
      .filter(Boolean)
      .join(' ')
      .trim();
  };
  const getVisibilityInfo = (el) => {
    for (let current = el; current; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none') return { state: 'hidden', reason: 'display-none-chain', visible: false };
      if (style.visibility === 'hidden' || style.contentVisibility === 'hidden') return { state: 'hidden', reason: 'visibility-hidden-chain', visible: false };
      if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return { state: 'collapsed', reason: 'hidden-attribute', visible: false };
    }

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const viewport = viewportSize();
    const outsideViewport = rect.bottom < -48 || rect.top > viewport.height + 48 || rect.right < -48 || rect.left > viewport.width + 48;

    if ((rect.width < 6 || rect.height < 6) && (style.overflow === 'hidden' || style.maxHeight === '0px' || style.maxWidth === '0px')) {
      return { state: 'collapsed', reason: 'collapsed-size', visible: false };
    }
    if (outsideViewport) return { state: 'offscreen', reason: 'outside-viewport', visible: false };
    if (Number(style.opacity) === 0 && style.pointerEvents === 'none') return { state: 'hidden', reason: 'fully-transparent', visible: false };
    return { state: 'visible', reason: null, visible: true };
  };

  const hasDialogName = (el) => /dialog|modal|lightbox|popup|sheet|drawer|overlay|offcanvas|popover/i.test(classTextFor(el));
  const hasExcludedName = (el) => /tooltip|toast|snackbar|menu|menubar|tablist|accordion|carousel|breadcrumb|feed|table-of-contents|toc/i.test(classTextFor(el));
  const isFocusable = (el) => el.matches('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])');
  const getFocusableElements = (container) => [...container.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')];

  const scoreContainer = (container) => {
    if (!(container instanceof Element)) return null;
    if (config.ignoredTags.has(container.tagName)) return null;
    if (container === document.body || container === document.documentElement) return null;
    if (container.matches('nav, menu, [role="menu"], [role="tablist"], [role="tooltip"], [role="progressbar"]')) return null;
    if (hasExcludedName(container) && !hasDialogName(container) && !container.matches('dialog, [role="dialog"], [role="alertdialog"]')) return null;

    const rect = container.getBoundingClientRect();
    const visibility = getVisibilityInfo(container);
    const style = window.getComputedStyle(container);
    const viewport = viewportSize();
    const focusables = getFocusableElements(container);
    const buttons = focusables.filter((el) => el.matches('button, [type="button"], [type="submit"], [role="button"]'));
    const links = container.querySelectorAll('a[href]').length;
    const heading = container.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"], header');
    const titleText = normalizeText(heading) || getAccessibleLabel(container);
    const textLength = normalizeText(container).length;
    const roleValue = container.getAttribute('role') || '';
    const fixedLike = /fixed|absolute|sticky/.test(style.position);
    const centered = Math.abs(rect.left + rect.width / 2 - viewport.width / 2) < viewport.width * 0.28;
    const backdropSignal = /backdrop|scrim|overlay|mask/i.test(classTextFor(container.parentElement)) || !!container.closest('[class*="backdrop"], [class*="overlay"], [class*="scrim"]');
    const closeSignal = buttons.some((button) => /close|cancel|dismiss|done|ok|continue|save/i.test(`${normalizeText(button)} ${button.getAttribute('aria-label') || ''}`));
    const tiny = rect.width > 0 && rect.width < 120 && rect.height < 60;
    const massive = rect.width > viewport.width * 0.98 && rect.height > viewport.height * 0.98;
    const hasForm = !!container.querySelector('form, input, select, textarea');
    const insideNav = !!container.closest('nav, header, footer');
    const modalSemantic = container.matches('dialog, [role="dialog"], [role="alertdialog"]') || container.getAttribute('aria-modal') === 'true';
    const hiddenSemantic = container.matches('[aria-hidden="true"], [hidden]') || /hidden|closed|collapsed/.test(classTextFor(container));

    if (tiny) return null;
    if (!modalSemantic && !hasDialogName(container) && textLength < 40 && focusables.length < 2) return null;
    if (links > 18 && buttons.length === 0 && !hasForm) return null;
    if (container.querySelector('[role="menu"], [role="tooltip"], [role="tablist"]')) return null;

    let score = 0;
    const reasons = [];

    if (container.tagName === 'DIALOG') {
      score += 34;
      reasons.push('native-dialog');
    }
    if (roleValue === 'dialog' || roleValue === 'alertdialog') {
      score += 30;
      reasons.push('dialog-role');
    }
    if (container.getAttribute('aria-modal') === 'true') {
      score += 18;
      reasons.push('aria-modal');
    }
    if (hasDialogName(container)) {
      score += 20;
      reasons.push('dialog-like-name');
    }
    if (fixedLike) {
      score += 10;
      reasons.push('overlay-positioning');
    }
    if (centered && rect.width > 160 && rect.height > 80) {
      score += 10;
      reasons.push('centered-window');
    }
    if (backdropSignal) {
      score += 8;
      reasons.push('backdrop-signal');
    }
    if (titleText) {
      score += 8;
      reasons.push('dialog-title');
    }
    if (focusables.length >= 1) {
      score += 8;
      reasons.push('focusable-content');
    }
    if (closeSignal) {
      score += 8;
      reasons.push('close-action');
    }
    if (buttons.length >= 1) {
      score += 6;
      reasons.push('action-buttons');
    }
    if (hasForm) {
      score += 6;
      reasons.push('form-content');
    }
    if (!visibility.visible && (modalSemantic || hasDialogName(container) || hiddenSemantic)) {
      score += 6;
      reasons.push('hidden-dialog-candidate');
    }
    if (visibility.visible) {
      score += 4;
      reasons.push('visible-dialog');
    }
    if (massive && modalSemantic) {
      score += 2;
      reasons.push('fullscreen-dialog');
    }

    if (insideNav && !modalSemantic) {
      score -= 20;
      reasons.push('inside-site-chrome');
    }
    if (!fixedLike && !modalSemantic && !hasDialogName(container)) {
      score -= 12;
      reasons.push('missing-overlay-signals');
    }
    if (focusables.length === 0 && textLength < 70) {
      score -= 12;
      reasons.push('too-little-content');
    }
    if (links > 8 && buttons.length === 0 && !modalSemantic) {
      score -= 10;
      reasons.push('link-cluster');
    }

    if (score < config.minScore) return null;

    return {
      container,
      score,
      reasons,
      rect,
      depth: getDepth(container),
      visibility,
      highlightable: visibility.visible,
      titleText,
      roleValue: roleValue || container.tagName.toLowerCase(),
      focusableCount: focusables.length,
      buttonCount: buttons.length,
      closeSignal,
    };
  };

  const gatherCandidates = () => {
    const candidates = unique([
      ...document.querySelectorAll('dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], [class*="dialog"], [class*="modal"], [class*="lightbox"], [class*="drawer"], [class*="offcanvas"], [id*="dialog"], [id*="modal"]'),
    ]);

    return candidates
      .map((el) => scoreContainer(el))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.depth - b.depth);
  };

  const dedupeCandidates = (candidates) => {
    const accepted = [];
    for (const candidate of candidates) {
      const duplicate = accepted.some((existing) => {
        const nested = existing.container.contains(candidate.container) || candidate.container.contains(existing.container);
        if (!nested) return false;
        if (candidate.container.contains(existing.container)) {
          return candidate.score <= existing.score + 6;
        }
        return existing.score >= candidate.score;
      });
      if (!duplicate) accepted.push(candidate);
    }
    return accepted;
  };

  const addStyles = () => {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .__dialog-detector-container {
        outline: 3px solid var(--dialog-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 10px !important;
      }
      .__dialog-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--dialog-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .__dialog-detector-flash {
        animation: __dialog-detector-flash 1.2s ease-out 1;
      }
      @keyframes __dialog-detector-flash {
        0% { box-shadow: 0 0 0 0 rgba(244, 162, 97, 0.7); }
        100% { box-shadow: 0 0 0 18px transparent; }
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
  };

  const cleanup = () => {
    document.querySelectorAll('.__dialog-detector-container').forEach((el) => {
      el.classList.remove('__dialog-detector-container');
      el.style.removeProperty('--dialog-detector-color');
    });
    state.overlays.forEach((el) => el.remove());
    state.overlays = [];
    if (state.styleEl) {
      state.styleEl.remove();
      state.styleEl = null;
    }
  };

  const revealCandidate = (result) => {
    if (!result || !(result.container instanceof Element)) return;
    const rect = result.container.getBoundingClientRect();
    window.scrollTo({
      top: Math.max(0, window.scrollY + rect.top - Math.max(24, (window.innerHeight - rect.height) / 3)),
      behavior: 'smooth',
    });
    result.container.classList.add('__dialog-detector-flash');
    window.setTimeout(() => result.container.classList.remove('__dialog-detector-flash'), 1400);
    console.group(`Reveal dialog ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('result:', result);
    console.log('container:', result.container);
    console.groupEnd();
  };

  const paintCandidate = (candidate, index) => {
    if (!candidate.highlightable || !config.highlightVisible) return;
    const color = config.palette[index % config.palette.length];
    candidate.container.classList.add('__dialog-detector-container');
    candidate.container.style.setProperty('--dialog-detector-color', color);

    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__dialog-detector-badge';
    badge.style.setProperty('--dialog-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    badge.textContent = `dialog ${index + 1} | ${candidate.roleValue} | score ${candidate.score}`;
    document.body.appendChild(badge);
    state.overlays.push(badge);
  };

  addStyles();

  const candidates = dedupeCandidates(gatherCandidates()).slice(0, config.maxResults);
  candidates.forEach((candidate, index) => paintCandidate(candidate, index));

  const results = candidates.map((candidate, index) => ({
    id: index + 1,
    score: candidate.score,
    reasons: candidate.reasons,
    roleHint: candidate.roleValue,
    title: candidate.titleText,
    focusableCount: candidate.focusableCount,
    buttonCount: candidate.buttonCount,
    hasCloseAction: candidate.closeSignal,
    visibilityState: candidate.visibility.state,
    hiddenReason: candidate.visibility.reason,
    selectorHint: buildSelectorHint(candidate.container),
    rect: summarizeRect(candidate.rect),
    highlighted: candidate.highlightable && config.highlightVisible,
    container: candidate.container,
  }));

  state.results = results;

  const api = {
    results,
    cleanup,
    inspect(id) {
      return results.find((result) => result.id === id);
    },
    reveal(id) {
      const result = results.find((entry) => entry.id === id);
      revealCandidate(result);
      return result;
    },
    rerun(nextOverrides = {}) {
      return runDialogDetector({ ...overrides, ...nextOverrides });
    },
  };

  window.__dialogDetector = api;
  window.runDialogDetector = runDialogDetector;

  console.group('Dialog detector');
  console.table(results.map((result) => ({
    id: result.id,
    score: result.score,
    roleHint: result.roleHint,
    focusables: result.focusableCount,
    buttons: result.buttonCount,
    visibility: result.visibilityState,
    highlighted: result.highlighted,
    selectorHint: result.selectorHint,
    rect: `${result.rect.x},${result.rect.y},${result.rect.width}x${result.rect.height}`,
  })));
  results.forEach((result) => {
    console.group(`dialog ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('reasons:', result.reasons);
    console.log('title:', result.title);
    console.log('container:', result.container);
    console.groupEnd();
  });
  console.log('Cleanup with window.__dialogDetector?.cleanup()');
  console.log('Inspect one result with window.__dialogDetector?.inspect(1)');
  console.log('Reveal one result with window.__dialogDetector?.reveal(1)');
  console.log('Rerun without visible overlays with window.__dialogDetector?.rerun({ highlightVisible: false })');
  console.groupEnd();

  return api;
}

window.runDialogDetector = runDialogDetector;