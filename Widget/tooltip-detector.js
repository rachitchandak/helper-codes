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
  const interactiveSelector = 'button, input, select, textarea, summary, a[href], [role="button"], [tabindex]:not([tabindex="-1"])';
  const parseNumber = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };
  const summarizeRect = (rect) => ({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });
  const rectHasArea = (rect) => rect.width >= 2 && rect.height >= 2;
  const centerOfRect = (rect) => ({ x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) });
  const measureRectRelation = (sourceRect, targetRect) => {
    const horizontalGap = Math.max(targetRect.left - sourceRect.right, sourceRect.left - targetRect.right, 0);
    const verticalGap = Math.max(targetRect.top - sourceRect.bottom, sourceRect.top - targetRect.bottom, 0);
    const overlapsHorizontally = sourceRect.left <= targetRect.right && targetRect.left <= sourceRect.right;
    const overlapsVertically = sourceRect.top <= targetRect.bottom && targetRect.top <= sourceRect.bottom;
    const sourceCenter = centerOfRect(sourceRect);
    const targetCenter = centerOfRect(targetRect);
    return {
      horizontalGap,
      verticalGap,
      overlapsHorizontally,
      overlapsVertically,
      centerDistance: Math.hypot(sourceCenter.x - targetCenter.x, sourceCenter.y - targetCenter.y),
    };
  };
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
  const getPseudoStyle = (el, pseudo) => {
    try {
      return window.getComputedStyle(el, pseudo);
    } catch {
      return null;
    }
  };
  const hasPseudoArrow = (el) => ['::before', '::after'].some((pseudo) => {
    const pseudoStyle = getPseudoStyle(el, pseudo);
    if (!pseudoStyle) return false;
    if (pseudoStyle.content === 'none' || pseudoStyle.content === 'normal') return false;
    const borderWidths = [
      parseNumber(pseudoStyle.borderTopWidth),
      parseNumber(pseudoStyle.borderRightWidth),
      parseNumber(pseudoStyle.borderBottomWidth),
      parseNumber(pseudoStyle.borderLeftWidth),
    ];
    return borderWidths.some((width) => width >= 6);
  });
  const hasArrowLikeChild = (el) => [...el.children].some((child) => {
    if (/arrow|caret|triangle|tip/i.test(classTextFor(child))) return true;
    const rect = child.getBoundingClientRect();
    return rect.width >= 4 && rect.height >= 4 && rect.width <= 18 && rect.height <= 18 && Math.abs(rect.width - rect.height) <= 6;
  });
  const hasOverlaySurface = (style) => (
    /absolute|fixed/.test(style.position)
    || parseNumber(style.zIndex) >= 10
    || style.boxShadow !== 'none'
    || style.filter !== 'none'
    || style.backdropFilter !== 'none'
  );
  const countInteractiveParts = (el) => {
    if (!(el instanceof Element)) return 0;
    return (el.matches(interactiveSelector) ? 1 : 0) + el.querySelectorAll(interactiveSelector).length;
  };
  const findAdjacentTriggerFor = (el) => {
    if (!(el instanceof Element)) return null;
    const siblings = [el.previousElementSibling, el.nextElementSibling].filter(Boolean);
    for (const sibling of siblings) {
      if (isPotentialTriggerElement(sibling)) return sibling;
    }
    return null;
  };
  const isPotentialTriggerElement = (el) => (
    el instanceof Element
    && !config.ignoredTags.has(el.tagName)
    && el.matches(`${interactiveSelector}, label, [title], [data-tooltip], [data-tip], [data-tippy-content]`)
  );
  const looksLikeHiddenSiblingTooltip = (container, style, text, interactiveCount, visibility) => {
    if (visibility.visible) return false;
    if (text.length < 2 || text.length > 220) return false;
    if (interactiveCount > 0) return false;
    const siblingTrigger = findAdjacentTriggerFor(container);
    if (!siblingTrigger) return false;
    const surfaceSignals = [
      parseNumber(style.borderRadius) >= 4,
      parseNumber(style.paddingTop) + parseNumber(style.paddingRight) + parseNumber(style.paddingBottom) + parseNumber(style.paddingLeft) >= 8,
      parseNumber(style.borderTopWidth) + parseNumber(style.borderRightWidth) + parseNumber(style.borderBottomWidth) + parseNumber(style.borderLeftWidth) >= 2,
      parseNumber(style.marginTop) >= 4 && parseNumber(style.marginTop) <= 40,
      hasPseudoArrow(container),
      /arrow|bubble|label|callout|tip|hint/i.test(classTextFor(container)),
    ].filter(Boolean).length;
    return surfaceSignals >= 2;
  };
  const looksLikeTooltipBubble = (container, rect, style, text, interactiveCount, lineBreakCount) => {
    if (text.length < 2 || text.length > 220) return false;
    if (rect.width < 12 || rect.height < 12 || rect.width > 420 || rect.height > 260) return false;
    if (interactiveCount > 0 || lineBreakCount > 4) return false;
    if (container.children.length > 8) return false;
    const solidSurface = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
    const bubbleSignals = [
      /absolute|fixed/.test(style.position),
      parseNumber(style.zIndex) >= 10,
      style.boxShadow !== 'none',
      parseNumber(style.borderRadius) >= 4 && solidSurface,
      hasArrowLikeChild(container),
      /open|visible|shown|active|expanded|mounted|instant-open|delayed-open/.test(`${container.getAttribute('data-state') || ''} ${container.getAttribute('data-status') || ''} ${container.getAttribute('data-placement') || ''}`),
    ].filter(Boolean).length;
    return bubbleSignals >= 2;
  };

  const findLinkedTriggerFor = (tooltip) => {
    if (!(tooltip instanceof Element) || !tooltip.id) return null;
    return document.querySelector(`[aria-describedby~="${escapeCss(tooltip.id)}"], [data-tooltip-target="${escapeCss(tooltip.id)}"], [data-describedby="${escapeCss(tooltip.id)}"]`);
  };

  const findSpatialTriggerFor = (tooltip) => {
    if (!(tooltip instanceof Element)) return null;
    const tooltipRect = tooltip.getBoundingClientRect();
    if (!rectHasArea(tooltipRect)) return null;

    const candidates = unique([
      ...document.querySelectorAll(':hover'),
      document.activeElement,
      ...document.querySelectorAll(`${interactiveSelector}, label, [title], [data-tooltip], [data-tip], [data-tippy-content]`),
    ]).filter((candidate) => (
      candidate instanceof Element
      && candidate !== tooltip
      && !tooltip.contains(candidate)
      && !candidate.contains(tooltip)
      && !config.ignoredTags.has(candidate.tagName)
    ));

    let bestMatch = null;

    for (const candidate of candidates) {
      const candidateRect = candidate.getBoundingClientRect();
      if (!rectHasArea(candidateRect)) continue;
      if (candidateRect.width > (window.innerWidth * 0.9) || candidateRect.height > (window.innerHeight * 0.5)) continue;
      const relation = measureRectRelation(tooltipRect, candidateRect);
      const nearTooltip = (
        (relation.overlapsHorizontally && relation.verticalGap <= 140)
        || (relation.overlapsVertically && relation.horizontalGap <= 140)
        || relation.centerDistance <= 180
      );
      if (!nearTooltip) continue;

      let score = 0;
      if (candidate.matches(':hover')) score += 16;
      if (candidate === document.activeElement) score += 10;
      if (isPotentialTriggerElement(candidate)) score += 8;
      if (candidate.matches('[title], [data-tooltip], [data-tip], [data-tippy-content]')) score += 4;
      if (relation.overlapsHorizontally || relation.overlapsVertically) score += 6;
      if (Math.min(relation.horizontalGap, relation.verticalGap) <= 24) score += 4;
      if (relation.centerDistance <= 120) score += 4;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { element: candidate, score };
      }
    }

    return bestMatch && bestMatch.score >= 12 ? bestMatch : null;
  };

  const findTriggerFor = (tooltip) => {
    const linkedTrigger = findLinkedTriggerFor(tooltip);
    if (linkedTrigger) return { element: linkedTrigger, type: 'linked', score: 20 };
    const spatialTrigger = findSpatialTriggerFor(tooltip);
    if (spatialTrigger) return { element: spatialTrigger.element, type: 'spatial', score: spatialTrigger.score };
    return null;
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
    const triggerMatch = findTriggerFor(container);
    const trigger = triggerMatch?.element || null;
    const interactiveCount = countInteractiveParts(container);
    const lineBreakCount = container.querySelectorAll('p, li').length;
    const childCount = container.children.length;
    const positioned = /absolute|fixed/.test(style.position);
    const smallBubble = rect.width <= 360 && rect.height <= 220;
    const compactText = text.length >= 2 && text.length <= 220;
    const explicitSignal = container.matches('[role="tooltip"]') || hasTooltipName(container);
    const arrowLike = hasArrowLikeChild(container);
    const overlaySurface = hasOverlaySurface(style);
    const bubbleLike = looksLikeTooltipBubble(container, rect, style, text, interactiveCount, lineBreakCount);
    const hiddenSiblingTooltip = looksLikeHiddenSiblingTooltip(container, style, text, interactiveCount, visibility);
    const zIndexValue = parseNumber(style.zIndex);

    if (!explicitSignal && !trigger && !bubbleLike && !hiddenSiblingTooltip) return null;
    if (/^H[1-6]$/.test(container.tagName) && !trigger) return null;
    if (!compactText) return null;
    if (!smallBubble && visibility.visible && !bubbleLike) return null;
    if (interactiveCount > 0) return null;
    if (lineBreakCount > 4) return null;
    if (!trigger && !explicitSignal && !positioned && !bubbleLike && !hiddenSiblingTooltip) return null;

    let score = 0;
    const reasons = [];

    if (container.getAttribute('role') === 'tooltip') {
      score += 24;
      reasons.push('tooltip-role');
    }
    if (hasTooltipName(container)) {
      score += 14;
      reasons.push('tooltip-like-name');
    }
    if (trigger) {
      score += triggerMatch.type === 'linked' ? 18 : 22;
      reasons.push(triggerMatch.type === 'linked' ? 'linked-trigger' : 'nearby-trigger');
    }
    if (positioned) {
      score += 8;
      reasons.push('popup-positioning');
    }
    if (bubbleLike) {
      score += 16;
      reasons.push('bubble-pattern');
    }
    if (hiddenSiblingTooltip) {
      score += 18;
      reasons.push('hidden-sibling-pattern');
    }
    if (overlaySurface) {
      score += 8;
      reasons.push('overlay-surface');
    }
    if (smallBubble) {
      score += 8;
      reasons.push('small-popup');
    }
    if (interactiveCount === 0) {
      score += 6;
      reasons.push('non-interactive-text');
    }
    if (arrowLike) {
      score += 6;
      reasons.push('arrow-child');
    }
    if (hasPseudoArrow(container)) {
      score += 6;
      reasons.push('pseudo-arrow');
    }
    if (childCount <= 3) {
      score += 4;
      reasons.push('compact-dom');
    }
    if (zIndexValue >= 10) {
      score += 4;
      reasons.push('elevated-layer');
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
    if (childCount > 6) {
      score -= 8;
      reasons.push('large-dom-wrapper');
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
      triggerType: triggerMatch?.type || null,
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
      ...[...document.querySelectorAll(`${interactiveSelector}, label, [title], [data-tooltip], [data-tip], [data-tippy-content]`)].flatMap((trigger) => [trigger.previousElementSibling, trigger.nextElementSibling]).filter(Boolean),
      ...[...document.body.querySelectorAll('*')].filter((el) => {
        if (!(el instanceof Element)) return false;
        if (config.ignoredTags.has(el.tagName)) return false;
        if (el === document.body || el === document.documentElement) return false;
        if (el.matches('dialog, [role="dialog"], [role="menu"], [role="tablist"], [role="progressbar"]')) return false;
        if (hasExcludedName(el) && !hasTooltipName(el)) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 12 || rect.height < 12 || rect.width > 420 || rect.height > 260) return false;
        const style = window.getComputedStyle(el);
        const text = normalizeText(el);
        const interactiveCount = countInteractiveParts(el);
        const lineBreakCount = el.querySelectorAll('p, li').length;
        const visibility = getVisibilityInfo(el);
        return looksLikeTooltipBubble(el, rect, style, text, interactiveCount, lineBreakCount) || looksLikeHiddenSiblingTooltip(el, style, text, interactiveCount, visibility);
      }),
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
    triggerType: candidate.triggerType,
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