function runSliderDetector(overrides = {}) {
  const previous = window.__sliderDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minScore: 24,
    maxResults: 20,
    overlayZIndex: 2147483646,
    palette: ['#1982c4', '#ff9f1c', '#2a9d8f', '#ef476f', '#3a86ff', '#6a4c93', '#8ac926', '#ff595e'],
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
    if ((rect.width < 4 || rect.height < 4) && (style.overflow === 'hidden' || style.maxHeight === '0px' || style.maxWidth === '0px')) return { state: 'collapsed', reason: 'collapsed-size', visible: false };
    if (outsideViewport) return { state: 'offscreen', reason: 'outside-viewport', visible: false };
    if (Number(style.opacity) === 0 && style.pointerEvents === 'none') return { state: 'hidden', reason: 'fully-transparent', visible: false };
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
  const isFocusable = (el) => el.matches('input, button, select, textarea, [tabindex]:not([tabindex="-1"]), [role="slider"]');
  const hasSliderName = (el) => /slider|range|seek|scrubber|knob|trackbar|thumb|handle/i.test(classTextFor(el));
  const hasProgressName = (el) => /progress|meter|loader|loading/i.test(classTextFor(el));
  const isThumbLike = (el) => /thumb|handle|knob|grab|dot/i.test(classTextFor(el));
  const isTrackLike = (el) => /track|rail|bar|fill|progress|range/i.test(classTextFor(el));
  const hasAriaSliderLabel = (el) => /slider|range|seek|scrubber|knob|thumb/i.test(String(el.getAttribute('aria-label') || ''));

  const findRoot = (el) => {
    if (!(el instanceof Element)) return null;
    if (el.matches('input[type="range"]')) {
      return el.closest('.slider, .range-slider, .MuiSlider-root, .rc-slider, .noUi-target, [data-slider], [data-range], [class*="slider"], [class*="range"]') || el;
    }
    if (el.matches('[role="slider"]')) {
      return el.closest('[role="slider"], .slider, .range-slider, .MuiSlider-root, .rc-slider, .noUi-target, [data-slider], [data-range], [class*="slider"], [class*="range"]') || el;
    }
    return el.closest('[role="slider"], .slider, .range-slider, .MuiSlider-root, .rc-slider, .noUi-target, [data-slider], [data-range], [class*="slider"], [class*="range"]') || el;
  };

  const inferOrientation = (root, rect) => {
    const orientation = root.getAttribute('aria-orientation');
    if (orientation === 'vertical' || orientation === 'horizontal') return orientation;
    if (rect.height > rect.width * 1.3) return 'vertical';
    if (rect.width > rect.height * 1.3) return 'horizontal';
    return 'unknown';
  };

  const scoreRoot = (root) => {
    if (!(root instanceof Element)) return null;
    if (config.ignoredTags.has(root.tagName)) return null;
    if (root === document.body || root === document.documentElement) return null;
    if (root.matches('progress, meter, [role="progressbar"], [role="meter"]')) return null;
    if (hasProgressName(root) && !root.matches('[role="slider"], input[type="range"]')) return null;

    const rect = root.getBoundingClientRect();
    const visibility = getVisibilityInfo(root);
    const style = window.getComputedStyle(root);
    const thumbCandidates = unique([
      ...root.querySelectorAll('[role="slider"], [class*="thumb"], [class*="handle"], [class*="knob"], [class*="grab"]'),
    ]).filter((el) => el !== root && isThumbLike(el));
    const trackCandidates = unique([
      ...root.querySelectorAll('[class*="track"], [class*="rail"], [class*="bar"], [class*="range"], [class*="fill"]'),
    ]).filter((el) => el !== root && isTrackLike(el));
    const nativeRange = root.matches('input[type="range"]');
    const roleSlider = root.matches('[role="slider"]') || root.querySelector('[role="slider"]');
    const focusable = isFocusable(root) || !!root.querySelector('input[type="range"], [role="slider"], [tabindex]:not([tabindex="-1"]), button, [aria-label*="slider" i], [aria-label*="range" i]');
    const readOnly = root.getAttribute('aria-readonly') === 'true';
    const min = nativeRange ? Number(root.min || 0) : getNumericAttr(root, 'aria-valuemin', 'min');
    const max = nativeRange ? Number(root.max || 100) : getNumericAttr(root, 'aria-valuemax', 'max');
    const value = nativeRange ? Number(root.value || 0) : getNumericAttr(root, 'aria-valuenow', 'value', 'data-value');
    const hasValue = value != null && !Number.isNaN(value);
    const interactiveClass = /cursor|grab/.test(style.cursor) || focusable;
    const orientation = inferOrientation(root, rect);

    if (!nativeRange && !roleSlider && !hasSliderName(root) && !hasAriaSliderLabel(root) && thumbCandidates.length === 0) return null;
    if (!nativeRange && !roleSlider && thumbCandidates.length === 0) return null;
    if (!focusable && thumbCandidates.length === 0 && !nativeRange) return null;
    if (rect.width < 18 || rect.height < 18) return null;

    let score = 0;
    const reasons = [];

    if (nativeRange) {
      score += 32;
      reasons.push('native-range-input');
    }
    if (root.matches('[role="slider"]') || root.querySelector('[role="slider"]')) {
      score += 24;
      reasons.push('slider-role');
    }
    if (hasSliderName(root)) {
      score += 14;
      reasons.push('slider-like-name');
    }
    if (hasAriaSliderLabel(root)) {
      score += 10;
      reasons.push('aria-slider-label');
    }
    if (thumbCandidates.length >= 1) {
      score += 14;
      reasons.push('thumb-handle');
    }
    if (trackCandidates.length >= 1 || nativeRange) {
      score += 10;
      reasons.push('track-rail');
    }
    if (interactiveClass) {
      score += 8;
      reasons.push('interactive-control');
    }
    if (hasValue) {
      score += 8;
      reasons.push('range-value');
    }
    if (min != null && max != null) {
      score += 6;
      reasons.push('range-bounds');
    }
    if (orientation !== 'unknown') {
      score += 4;
      reasons.push(`${orientation}-orientation`);
    }
    if (visibility.visible) {
      score += 4;
      reasons.push('visible-slider');
    }

    if (readOnly && !nativeRange) {
      score -= 8;
      reasons.push('readonly-range');
    }
    if (!interactiveClass && !roleSlider && !nativeRange) {
      score -= 10;
      reasons.push('weak-interactive-signals');
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
      orientation,
      handleCount: Math.max(nativeRange ? 1 : 0, thumbCandidates.length || (roleSlider ? 1 : 0)),
      min,
      max,
      value,
      nativeRange,
    };
  };

  const gatherCandidates = () => {
    const raw = unique([
      ...document.querySelectorAll(
        'input[type="range"], [role="slider"], [class*="slider"], [class*="range"], [id*="slider"], [id*="range"], [class*="track"], [id*="track"], [class*="knob"], [class*="thumb"], [class*="handle"], button[aria-label*="slider" i], button[aria-label*="range" i]'
      ),
    ]);
    const inDocumentCandidates = unique(raw.map((el) => findRoot(el)))
      .map((el) => scoreRoot(el))
      .filter(Boolean);

    const iframeCandidates = gatherIframeCandidates();
    return [...inDocumentCandidates, ...iframeCandidates].sort((a, b) => b.score - a.score || a.depth - b.depth);
  };

  const scanFrameSignals = (frameDoc) => {
    const nativeRanges = frameDoc.querySelectorAll('input[type="range"]').length;
    const roleSliders = frameDoc.querySelectorAll('[role="slider"]').length;
    const sliderNamed = frameDoc.querySelectorAll('[class*="slider"], [id*="slider"], [class*="range"], [id*="range"]').length;
    const tracks = frameDoc.querySelectorAll('[class*="track"], [class*="rail"], [class*="bar"], [class*="fill"], [id*="track"]').length;
    const thumbs = frameDoc.querySelectorAll('[class*="thumb"], [class*="handle"], [class*="knob"], [class*="grab"], [id*="thumb"], [id*="knob"]').length;
    const ariaSliderButtons = frameDoc.querySelectorAll('button[aria-label*="slider" i], button[aria-label*="range" i], [aria-label*="slider" i][tabindex]').length;
    return {
      nativeRanges,
      roleSliders,
      sliderNamed,
      tracks,
      thumbs,
      ariaSliderButtons,
    };
  };

  const scoreIframe = (frameEl) => {
    if (!(frameEl instanceof HTMLIFrameElement)) return null;
    let frameDoc;
    let frameWindow;
    try {
      frameDoc = frameEl.contentDocument;
      frameWindow = frameEl.contentWindow;
    } catch {
      return null;
    }
    if (!frameDoc || !frameWindow || !frameDoc.documentElement) return null;

    const signals = scanFrameSignals(frameDoc);
    if (signals.nativeRanges + signals.roleSliders + signals.sliderNamed + signals.thumbs === 0) return null;

    const rect = frameEl.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 24) return null;

    const visibility = getVisibilityInfo(frameEl);
    let score = 0;
    const reasons = [];

    if (signals.nativeRanges > 0) {
      score += 30;
      reasons.push('iframe-native-range');
    }
    if (signals.roleSliders > 0) {
      score += 24;
      reasons.push('iframe-slider-role');
    }
    if (signals.sliderNamed > 0) {
      score += 14;
      reasons.push('iframe-slider-named-elements');
    }
    if (signals.tracks > 0 && signals.thumbs > 0) {
      score += 18;
      reasons.push('iframe-track-thumb-pair');
    }
    if (signals.ariaSliderButtons > 0) {
      score += 10;
      reasons.push('iframe-aria-slider-control');
    }
    if (visibility.visible) {
      score += 4;
      reasons.push('visible-slider');
    }

    if (score < config.minScore) return null;

    return {
      container: frameEl,
      score,
      reasons,
      rect,
      depth: getDepth(frameEl),
      visibility,
      highlightable: visibility.visible,
      orientation: 'unknown',
      handleCount: Math.max(1, signals.nativeRanges + signals.roleSliders + signals.thumbs),
      min: null,
      max: null,
      value: null,
      nativeRange: signals.nativeRanges > 0,
      isIframeCandidate: true,
    };
  };

  const gatherIframeCandidates = () => {
    const iframes = [...document.querySelectorAll('iframe')];
    return iframes.map((frameEl) => scoreIframe(frameEl)).filter(Boolean);
  };

  const dedupeCandidates = (candidates) => {
    const accepted = [];
    for (const candidate of candidates) {
      const duplicate = accepted.some((existing) => {
        const nested = existing.container.contains(candidate.container) || candidate.container.contains(existing.container);
        if (!nested) return false;
        if (candidate.container.contains(existing.container)) return candidate.score <= existing.score + 8;
        return existing.score >= candidate.score;
      });
      if (!duplicate) accepted.push(candidate);
    }
    return accepted;
  };

  const addStyles = () => {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .__slider-detector-container {
        outline: 3px solid var(--slider-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 10px !important;
      }
      .__slider-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--slider-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .__slider-detector-flash {
        animation: __slider-detector-flash 1.2s ease-out 1;
      }
      @keyframes __slider-detector-flash {
        0% { box-shadow: 0 0 0 0 rgba(25, 130, 196, 0.7); }
        100% { box-shadow: 0 0 0 18px transparent; }
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
  };

  const cleanup = () => {
    document.querySelectorAll('.__slider-detector-container').forEach((el) => {
      el.classList.remove('__slider-detector-container');
      el.style.removeProperty('--slider-detector-color');
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
    window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - 120), behavior: 'smooth' });
    result.container.classList.add('__slider-detector-flash');
    window.setTimeout(() => result.container.classList.remove('__slider-detector-flash'), 1400);
  };

  const paintCandidate = (candidate, index) => {
    if (!candidate.highlightable || !config.highlightVisible) return;
    const color = config.palette[index % config.palette.length];
    candidate.container.classList.add('__slider-detector-container');
    candidate.container.style.setProperty('--slider-detector-color', color);
    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__slider-detector-badge';
    badge.style.setProperty('--slider-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    const sourceLabel = candidate.isIframeCandidate ? 'iframe' : candidate.orientation;
    badge.textContent = `slider ${index + 1} | ${sourceLabel} | score ${candidate.score}`;
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
    orientation: candidate.orientation,
    handleCount: candidate.handleCount,
    min: candidate.min,
    max: candidate.max,
    value: candidate.value,
    nativeRange: candidate.nativeRange,
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
    reveal(id) {
      const result = results.find((entry) => entry.id === id);
      revealCandidate(result);
      return result;
    },
    rerun(nextOverrides = {}) { return runSliderDetector({ ...overrides, ...nextOverrides }); },
  };

  window.__sliderDetector = api;
  window.runSliderDetector = runSliderDetector;

  console.group('Slider detector');
  console.table(results.map((result) => ({
    id: result.id,
    score: result.score,
    orientation: result.orientation,
    handles: result.handleCount,
    value: result.value,
    nativeRange: result.nativeRange,
    visibility: result.visibilityState,
    selectorHint: result.selectorHint,
  })));
  console.groupEnd();

  return api;
}

window.runSliderDetector = runSliderDetector;
