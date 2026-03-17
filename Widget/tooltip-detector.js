function runTooltipDetector(overrides = {}) {
  const previous = window.__tooltipDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minScore: 24,
    maxResults: 30,
    overlayZIndex: 2147483646,
    palette: ['#ff595e', '#1982c4', '#2a9d8f', '#ff9f1c', '#6a4c93', '#3a86ff', '#ef476f', '#118ab2'],
    ignoredTags: new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'PRE', 'CODE']),
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
  const normalizeText = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  const classTextFor = (el) => (el instanceof Element ? `${el.tagName} ${String(el.id || '')} ${String(el.className || '')}` : '');
  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };
  const summarizeRect = (rect) => ({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });
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
  const getVisibilityInfo = (el) => {
    for (let current = el; current; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none') return { state: 'hidden', reason: 'display-none-chain', visible: false };
      if (style.visibility === 'hidden' || style.contentVisibility === 'hidden') return { state: 'hidden', reason: 'visibility-hidden-chain', visible: false };
      if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return { state: 'collapsed', reason: 'hidden-attribute', visible: false };
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return { state: 'collapsed', reason: 'collapsed-size', visible: false };
    return { state: 'visible', reason: null, visible: true };
  };

  const hasTooltipName = (el) => /tooltip|tippy|hint|infotip|balloon|hovercard/i.test(classTextFor(el));
  const hasExcludedName = (el) => /dialog|modal|menu|popover|dropdown|toast|snackbar|accordion|carousel|tabs/i.test(classTextFor(el));

  const findTriggerFor = (tooltip) => {
    if (!(tooltip instanceof Element) || !tooltip.id) return null;
    return document.querySelector(`[aria-describedby~="${escapeCss(tooltip.id)}"], [data-tooltip-target="${escapeCss(tooltip.id)}"], [data-describedby="${escapeCss(tooltip.id)}"]`);
  };

  const scoreContainer = (container) => {
    if (!(container instanceof Element)) return null;
    if (config.ignoredTags.has(container.tagName)) return null;
    if (container === document.body || container === document.documentElement) return null;
    if (container.matches('dialog, [role="dialog"], [role="menu"], [role="tablist"], [role="progressbar"]')) return null;
    if (hasExcludedName(container) && !container.matches('[role="tooltip"]') && !hasTooltipName(container)) return null;

    const rect = container.getBoundingClientRect();
    const visibility = getVisibilityInfo(container);
    const style = window.getComputedStyle(container);
    const text = normalizeText(container);
    const trigger = findTriggerFor(container);
    const interactiveCount = container.querySelectorAll('button, input, select, textarea, summary, a[href], [tabindex]:not([tabindex="-1"])').length;
    const lineBreakCount = container.querySelectorAll('p, li').length;
    const positioned = /absolute|fixed/.test(style.position);
    const smallBubble = rect.width <= 360 && rect.height <= 220;
    const compactText = text.length >= 2 && text.length <= 220;

    if (!container.matches('[role="tooltip"]') && !hasTooltipName(container) && !trigger) return null;
    if (/^H[1-6]$/.test(container.tagName) && !trigger) return null;
    if (!compactText) return null;
    if (!smallBubble && visibility.visible) return null;
    if (interactiveCount > 0) return null;
    if (lineBreakCount > 4) return null;
    if (!trigger && container.getAttribute('role') !== 'tooltip' && !positioned) return null;

    let score = 0;
    const reasons = [];

    if (container.getAttribute('role') === 'tooltip') {
      score += 30;
      reasons.push('tooltip-role');
    }
    if (hasTooltipName(container)) {
      score += 18;
      reasons.push('tooltip-like-name');
    }
    if (trigger) {
      score += 20;
      reasons.push('describedby-trigger');
    }
    if (positioned) {
      score += 8;
      reasons.push('popup-positioning');
    }
    if (smallBubble) {
      score += 8;
      reasons.push('small-popup');
    }
    if (interactiveCount === 0) {
      score += 6;
      reasons.push('non-interactive-text');
    }
    if (!visibility.visible) {
      score += 4;
      reasons.push('hidden-tooltip-candidate');
    }

    if (interactiveCount === 1 && !trigger) {
      score -= 8;
      reasons.push('interactive-popup');
    }
    if (!positioned && !trigger && container.getAttribute('role') !== 'tooltip') {
      score -= 10;
      reasons.push('weak-popup-signals');
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
      trigger,
      text,
    };
  };

  const gatherCandidates = () => {
    const describedByTargets = unique([
      ...document.querySelectorAll('[aria-describedby]'),
    ]).flatMap((trigger) => String(trigger.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean));

    const candidates = unique([
      ...document.querySelectorAll('[role="tooltip"], [class*="tooltip"], [class*="tippy"], [class*="hint"], [id*="tooltip"], [id*="hint"], [data-tooltip]'),
      ...describedByTargets,
    ]);
    return candidates.map((el) => scoreContainer(el)).filter(Boolean).sort((a, b) => b.score - a.score || a.depth - b.depth);
  };

  const dedupeCandidates = (candidates) => {
    const accepted = [];
    for (const candidate of candidates) {
      const duplicate = accepted.some((existing) => {
        const nested = existing.container.contains(candidate.container) || candidate.container.contains(existing.container);
        if (!nested) return false;
        if (candidate.container.contains(existing.container)) return candidate.score <= existing.score + 6;
        return existing.score >= candidate.score;
      });
      if (!duplicate) accepted.push(candidate);
    }
    return accepted;
  };

  const addStyles = () => {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .__tooltip-detector-container {
        outline: 3px solid var(--tooltip-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 8px !important;
      }
      .__tooltip-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--tooltip-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
  };

  const cleanup = () => {
    document.querySelectorAll('.__tooltip-detector-container').forEach((el) => {
      el.classList.remove('__tooltip-detector-container');
      el.style.removeProperty('--tooltip-detector-color');
    });
    state.overlays.forEach((el) => el.remove());
    state.overlays = [];
    if (state.styleEl) {
      state.styleEl.remove();
      state.styleEl = null;
    }
  };

  const paintCandidate = (candidate, index) => {
    if (!candidate.highlightable || !config.highlightVisible) return;
    const color = config.palette[index % config.palette.length];
    candidate.container.classList.add('__tooltip-detector-container');
    candidate.container.style.setProperty('--tooltip-detector-color', color);
    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__tooltip-detector-badge';
    badge.style.setProperty('--tooltip-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    badge.textContent = `tooltip ${index + 1} | score ${candidate.score}`;
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
    text: candidate.text,
    hasTrigger: !!candidate.trigger,
    triggerSelector: candidate.trigger ? buildSelectorHint(candidate.trigger) : '',
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
    inspect(id) { return results.find((result) => result.id === id); },
    reveal(id) { return results.find((entry) => entry.id === id); },
    rerun(nextOverrides = {}) { return runTooltipDetector({ ...overrides, ...nextOverrides }); },
  };

  window.__tooltipDetector = api;
  window.runTooltipDetector = runTooltipDetector;

  console.group('Tooltip detector');
  console.table(results.map((result) => ({
    id: result.id,
    score: result.score,
    hasTrigger: result.hasTrigger,
    visibility: result.visibilityState,
    selectorHint: result.selectorHint,
  })));
  console.groupEnd();

  return api;
}

window.runTooltipDetector = runTooltipDetector;