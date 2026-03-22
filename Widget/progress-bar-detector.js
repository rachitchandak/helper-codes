function runProgressBarDetector(overrides = {}) {
  const previous = window.__progressBarDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minScore: 24,
    maxResults: 24,
    overlayZIndex: 2147483646,
    palette: ['#2a9d8f', '#ff9f1c', '#1982c4', '#ef476f', '#6a4c93', '#3a86ff', '#ff595e', '#118ab2'],
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

  const getNumericAttr = (el, ...names) => {
    for (const name of names) {
      const raw = el.getAttribute(name);
      if (raw == null || raw === '') continue;
      const value = Number(raw);
      if (!Number.isNaN(value)) return value;
    }
    return null;
  };
  const hasProgressName = (el) => /progress|upload|download|processing|completion|loading-bar/i.test(classTextFor(el));
  const hasExcludedName = (el) => /slider|range|meter|battery|signal|tabs|menu|tooltip|carousel|spinner|skeleton|loader(?!-bar)/i.test(classTextFor(el));
  const isFillLike = (el) => {
    const classText = classTextFor(el);
    return /(fill|value|indicator|track|progress-bar__bar|progress__bar|\bbar\b|\bbar-)/i.test(classText) && !/label|helper|text|title|heading/i.test(classText);
  };
  const isThumbLike = (el) => /thumb|handle|knob/i.test(classTextFor(el));

  const hasVisiblePaint = (el) => {
    if (!(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    const borderWidth = ['Top', 'Right', 'Bottom', 'Left']
      .map((edge) => Number.parseFloat(style[`border${edge}Width`]) || 0)
      .reduce((sum, value) => sum + value, 0);
    return style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none' || borderWidth > 0;
  };

  const hasRoundedCorners = (el) => {
    if (!(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    return ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']
      .some((name) => (Number.parseFloat(style[name]) || 0) >= 2);
  };

  const getInlinePercent = (el) => {
    const styleAttr = String(el?.getAttribute('style') || '');
    const match = styleAttr.match(/(?:width|flex-basis|max-width)\s*:\s*([0-9]+(?:\.[0-9]+)?)%/i);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  };

  const getDirectLabelText = (root) => {
    if (!(root instanceof Element)) return '';
    const directLabel = [...root.children].find((child) => child.tagName === 'LABEL' || /label|title|heading/i.test(classTextFor(child)));
    return normalizeText(directLabel || null);
  };

  const getStructuralFillChildren = (root) => {
    if (!(root instanceof Element)) return [];
    const rootRect = root.getBoundingClientRect();
    if (rootRect.width < 20 || rootRect.height < 4 || rootRect.width <= rootRect.height * 2.4) return [];

    const candidates = unique([
      ...root.children,
      ...[...root.children].flatMap((child) => child.children.length <= 3 ? [...child.children] : []),
    ]);

    return candidates.filter((child) => {
      if (!(child instanceof Element)) return false;
      if (config.ignoredTags.has(child.tagName)) return false;
      if (child.matches('button, input, select, textarea, [role="slider"], input[type="range"]')) return false;

      const childRect = child.getBoundingClientRect();
      if (childRect.width < 2 || childRect.height < 2) return false;

      const widthRatio = childRect.width / Math.max(1, rootRect.width);
      const heightRatio = childRect.height / Math.max(1, rootRect.height);
      const sameLane = Math.abs((childRect.top + childRect.height / 2) - (rootRect.top + rootRect.height / 2)) <= Math.max(8, rootRect.height * 0.75);
      const inlinePercent = getInlinePercent(child);
      const painted = hasVisiblePaint(child);

      return (
        sameLane &&
        painted &&
        widthRatio >= 0.02 &&
        widthRatio <= 1.02 &&
        heightRatio >= 0.45 &&
        heightRatio <= 1.8 &&
        (inlinePercent != null || widthRatio < 0.98 || /hidden|clip/.test(`${window.getComputedStyle(root).overflow} ${window.getComputedStyle(root).overflowX} ${window.getComputedStyle(root).overflowY}`) || hasVisiblePaint(root))
      );
    });
  };

  const isPotentialTrackRoot = (el) => {
    if (!(el instanceof Element)) return false;
    if (config.ignoredTags.has(el.tagName)) return false;
    if (el === document.body || el === document.documentElement) return false;
    if (el.matches('progress, meter, h1, h2, h3, h4, h5, h6, label, button, input, select, textarea, [role="slider"], input[type="range"]')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 4 || rect.width <= rect.height * 2.4) return false;
    if (el.childElementCount === 0 || el.childElementCount > 6) return false;
    return getStructuralFillChildren(el).length > 0;
  };

  const findLikelyTrackRoot = (el) => {
    for (let current = el; current && current !== document.body; current = current.parentElement) {
      if (isPotentialTrackRoot(current)) {
        return current;
      }
      if (current.parentElement && current.parentElement.childElementCount > 6) {
        break;
      }
    }
    return null;
  };

  const findRoot = (el) => el.closest('progress, [role="progressbar"], .progress, .progress-bar, .loading-bar, [data-progress], [class*="progress"], [class*="loading-bar"]') || findLikelyTrackRoot(el) || el;

  const scoreRoot = (root) => {
    if (!(root instanceof Element)) return null;
    if (config.ignoredTags.has(root.tagName)) return null;
    if (root === document.body || root === document.documentElement) return null;
    if (root.matches('h1, h2, h3, h4, h5, h6')) return null;
    if (root.matches('meter, [role="meter"], input[type="range"], [role="slider"]')) return null;
    if (hasExcludedName(root) && !root.matches('progress, [role="progressbar"]')) return null;

    const rect = root.getBoundingClientRect();
    const visibility = getVisibilityInfo(root);
    const nativeProgress = root.tagName === 'PROGRESS';
    const roleProgress = root.getAttribute('role') === 'progressbar';
    const nearbyChildren = unique([
      ...root.children,
      ...[...root.children].flatMap((child) => child.children.length <= 3 ? [...child.children] : []),
    ]);
    const namedFillChildren = nearbyChildren.filter((el) => el !== root && isFillLike(el));
    const structuralFillChildren = getStructuralFillChildren(root);
    const fillChildren = unique([...namedFillChildren, ...structuralFillChildren]);
    const thumbChildren = root.querySelectorAll('[class*="thumb"], [class*="handle"], [role="slider"]').length;
    const interactiveControl = root.matches('button, input, select, textarea, [role="slider"], input[type="range"]') || root.querySelector('button, input, select, textarea, input[type="range"], [role="slider"]');
    const min = nativeProgress ? 0 : getNumericAttr(root, 'aria-valuemin', 'min');
    const max = nativeProgress ? 1 : getNumericAttr(root, 'aria-valuemax', 'max');
    const explicitValue = nativeProgress ? (root.hasAttribute('value') ? Number(root.value) : null) : getNumericAttr(root, 'aria-valuenow', 'value', 'data-value');
    const geometryValue = explicitValue == null && structuralFillChildren.length === 1
      ? Math.round((structuralFillChildren[0].getBoundingClientRect().width / Math.max(1, rect.width)) * 100)
      : null;
    const value = explicitValue ?? geometryValue;
    const style = window.getComputedStyle(root);
    const overflowClips = /hidden|clip/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`);
    const compactBar = rect.height <= 24;
    const structuralFillHasInlineValue = structuralFillChildren.some((child) => getInlinePercent(child) != null);
    const partialFillGeometry = structuralFillChildren.some((child) => {
      const ratio = child.getBoundingClientRect().width / Math.max(1, rect.width);
      return ratio >= 0.02 && ratio <= 0.95;
    });
    const genericStructuralSignal = compactBar && rect.width >= 80 && (structuralFillHasInlineValue || partialFillGeometry) && (overflowClips || hasRoundedCorners(root));
    const indeterminate = explicitValue == null && (nativeProgress || /indeterminate|striped|animated|buffer|query/i.test(classTextFor(root)) || (overflowClips && structuralFillChildren.some((child) => child.getBoundingClientRect().width >= rect.width * 0.95 && window.getComputedStyle(child).transform !== 'none')));
    const labelText = getDirectLabelText(root);
    const longBar = rect.width > rect.height * 2.4;
    const directElementChildren = [...root.children].filter((child) => !config.ignoredTags.has(child.tagName));
    const textOnlyNamedNode = !nativeProgress && !roleProgress && fillChildren.length === 0 && directElementChildren.length === 0 && normalizeText(root).length > 0;
    const structuralTrackFill = structuralFillChildren.length > 0;

    if (textOnlyNamedNode) return null;
    if (!nativeProgress && !roleProgress && !hasProgressName(root) && !genericStructuralSignal && namedFillChildren.length === 0) return null;
    if (thumbChildren > 0 || interactiveControl) return null;
    if (rect.width < 20 || rect.height < 4) return null;
    if (!longBar && !nativeProgress && !roleProgress && !indeterminate) return null;
    if (!nativeProgress && !roleProgress && !genericStructuralSignal && namedFillChildren.length === 0 && normalizeText(root).length > 18) return null;
    if (!nativeProgress && !roleProgress && !hasProgressName(root) && !compactBar) return null;

    let score = 0;
    const reasons = [];

    if (nativeProgress) {
      score += 30;
      reasons.push('native-progress-element');
    }
    if (roleProgress) {
      score += 24;
      reasons.push('progressbar-role');
    }
    if (hasProgressName(root)) {
      score += 16;
      reasons.push('progress-like-name');
    }
    if (fillChildren.length >= 1) {
      score += 10;
      reasons.push('track-and-fill');
    }
    if (genericStructuralSignal) {
      score += 16;
      reasons.push('structural-track-fill-pattern');
    }
    if (value != null) {
      score += 10;
      reasons.push('progress-value');
    }
    if (indeterminate) {
      score += 8;
      reasons.push('indeterminate-progress');
    }
    if (longBar) {
      score += 6;
      reasons.push('bar-shape');
    }
    if (overflowClips) {
      score += 4;
      reasons.push('clipped-track');
    }
    if (hasVisiblePaint(root)) {
      score += 4;
      reasons.push('painted-track');
    }
    if (/load|upload|download|progress|processing/i.test(labelText)) {
      score += 4;
      reasons.push('progress-label');
    }

    if (!roleProgress && !nativeProgress && value == null && !indeterminate && !genericStructuralSignal) {
      score -= 8;
      reasons.push('missing-range-value');
    }

    if (score < config.minScore) return null;

    return {
      container: root,
      score,
      reasons,
      rect,
      depth: getDepth(root),
      visibility,
      highlightable: visibility.visible,
      nativeProgress,
      indeterminate,
      min,
      max,
      value,
      fillCount: fillChildren.length,
    };
  };

  const gatherCandidates = () => {
    const raw = unique([
      ...document.querySelectorAll('progress, [role="progressbar"], [data-progress], [class*="progress"], [id*="progress"], [class*="loading-bar"], [id*="loading-bar"]'),
      ...[...document.querySelectorAll('div, span')].filter((el) => isPotentialTrackRoot(el)),
    ]);
    return unique(raw.map((el) => findRoot(el))).map((el) => scoreRoot(el)).filter(Boolean).sort((a, b) => b.score - a.score || a.depth - b.depth);
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
      .__progress-detector-container {
        outline: 3px solid var(--progress-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 8px !important;
      }
      .__progress-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--progress-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
  };

  const cleanup = () => {
    document.querySelectorAll('.__progress-detector-container').forEach((el) => {
      el.classList.remove('__progress-detector-container');
      el.style.removeProperty('--progress-detector-color');
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
    candidate.container.classList.add('__progress-detector-container');
    candidate.container.style.setProperty('--progress-detector-color', color);
    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__progress-detector-badge';
    badge.style.setProperty('--progress-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    badge.textContent = `progress ${index + 1} | score ${candidate.score}`;
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
    nativeProgress: candidate.nativeProgress,
    indeterminate: candidate.indeterminate,
    min: candidate.min,
    max: candidate.max,
    value: candidate.value,
    fillCount: candidate.fillCount,
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
    rerun(nextOverrides = {}) { return runProgressBarDetector({ ...overrides, ...nextOverrides }); },
  };

  window.__progressBarDetector = api;
  window.runProgressBarDetector = runProgressBarDetector;

  console.group('Progress bar detector');
  console.table(results.map((result) => ({
    id: result.id,
    score: result.score,
    nativeProgress: result.nativeProgress,
    indeterminate: result.indeterminate,
    value: result.value,
    selectorHint: result.selectorHint,
  })));
  console.groupEnd();

  return api;
}

window.runProgressBarDetector = runProgressBarDetector;