function runGridDetector(overrides = {}) {
  const previous = window.__gridDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minScore: 24,
    minItems: 2,
    maxItems: 48,
    maxResults: 24,
    overlayZIndex: 2147483646,
    palette: ['#0f766e', '#2563eb', '#ea580c', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#9333ea'],
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

  const GRID_NAME_RE = /grid|masonry|tile|cards|gallery|board|layout|dashboard|matrix/i;
  const GRID_CONTEXT_RE = /grid|layout|columns|rows|template|areas|cards|tiles|gallery/i;
  const EXCLUDED_NAME_RE = /table|datagrid|spreadsheet|calendar|menu|menubar|tabs|tablist|carousel|slider|accordion|tooltip|breadcrumb|feed|tree|progress|listbox|list-view|command-bar/i;

  const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  const unique = (items) => [...new Set(items.filter(Boolean))];
  const isElementNode = (value) => !!value && value.nodeType === 1;
  const normalizeText = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  const wordCountOf = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const classTextFor = (el) => (isElementNode(el) ? `${el.tagName} ${String(el.id || '')} ${String(el.className || '')}` : '');
  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };
  const summarizeRect = (rect) => ({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
  const viewportSize = () => ({
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
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
  const getDirectElementChildren = (el) => [...el.children].filter((child) => !config.ignoredTags.has(child.tagName));
  const getHeadingTrail = (el, limit = 48) => {
    const trail = [];
    let current = el || null;
    while (current && trail.length < limit) {
      let sibling = current.previousElementSibling;
      while (sibling && trail.length < limit) {
        if (/^H[1-6]$/.test(sibling.tagName)) {
          trail.push({ tagName: sibling.tagName, text: normalizeText(sibling) });
        } else {
          const nestedHeading = sibling.querySelector?.('h1, h2, h3, h4, h5, h6');
          if (nestedHeading) trail.push({ tagName: nestedHeading.tagName, text: normalizeText(nestedHeading) });
        }
        sibling = sibling.previousElementSibling;
      }
      current = current.parentElement;
    }
    return trail;
  };
  const previousHeadingText = (el) => getHeadingTrail(el, 1)[0]?.text || '';
  const hasGridName = (el) => GRID_NAME_RE.test(classTextFor(el));
  const hasExcludedName = (el) => EXCLUDED_NAME_RE.test(classTextFor(el));
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
    const outsideViewport = rect.bottom < -64 || rect.top > viewport.height + 64 || rect.right < -64 || rect.left > viewport.width + 64;
    if ((rect.width < 6 || rect.height < 6) && (style.overflow === 'hidden' || style.maxHeight === '0px' || style.maxWidth === '0px')) {
      return { state: 'collapsed', reason: 'collapsed-size', visible: false };
    }
    if (outsideViewport) return { state: 'offscreen', reason: 'outside-viewport', visible: false };
    if (Number(style.opacity) === 0 && style.pointerEvents === 'none') return { state: 'hidden', reason: 'fully-transparent', visible: false };
    return { state: 'visible', reason: null, visible: true };
  };

  const tokenizeTrackList = (value) => {
    const text = String(value || '').trim();
    if (!text || text === 'none' || text === 'normal' || text === 'subgrid') return [];
    const tokens = [];
    let current = '';
    let depth = 0;

    for (const char of text) {
      if (char === '(' || char === '[') depth += 1;
      if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
      if (/\s/.test(char) && depth === 0) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }
      current += char;
    }
    if (current) tokens.push(current);

    return tokens.filter((token) => token && !(token.startsWith('[') && token.endsWith(']')));
  };

  const countLanes = (values, tolerance = 18) => {
    const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    let lanes = 1;
    let anchor = sorted[0];
    for (let index = 1; index < sorted.length; index += 1) {
      if (Math.abs(sorted[index] - anchor) > tolerance) {
        lanes += 1;
        anchor = sorted[index];
      }
    }
    return lanes;
  };

  const hasCodeContext = (el) => {
    for (let current = el; current && current !== document.body; current = current.parentElement) {
      if (current.matches?.('pre, code, samp, kbd, .w3-code, .CodeMirror, .codehilite, [class*="code" i]')) return true;
    }
    return false;
  };

  const extractStructure = (root) => {
    if (!isElementNode(root)) return null;

    const style = window.getComputedStyle(root);
    if (!/^(inline-)?grid$/.test(style.display)) return null;

    const directChildren = getDirectElementChildren(root);
    if (directChildren.length < config.minItems || directChildren.length > config.maxItems) return null;

    const childEntries = directChildren.map((child) => {
      const rect = child.getBoundingClientRect();
      const visibility = getVisibilityInfo(child);
      return {
        child,
        rect,
        visibility,
        text: normalizeText(child),
      };
    });

    const visibleChildren = childEntries.filter((entry) => entry.visibility.visible && entry.rect.width >= 4 && entry.rect.height >= 4);
    if (visibleChildren.length < config.minItems) return null;

    const rect = root.getBoundingClientRect();
    const visibility = getVisibilityInfo(root);
    const columnTrackCount = tokenizeTrackList(style.gridTemplateColumns).length;
    const rowTrackCount = tokenizeTrackList(style.gridTemplateRows).length;
    const childCentersX = visibleChildren.map((entry) => entry.rect.left + (entry.rect.width / 2));
    const childCentersY = visibleChildren.map((entry) => entry.rect.top + (entry.rect.height / 2));
    const columnLanes = countLanes(childCentersX, 24);
    const rowLanes = countLanes(childCentersY, 24);
    const textLengths = visibleChildren.map((entry) => entry.text.length);
    const compactItems = visibleChildren.filter((entry) => entry.text.length > 0 && entry.text.length <= 48 && wordCountOf(entry.text) <= 10).length;
    const childWidths = visibleChildren.map((entry) => entry.rect.width).filter((value) => value > 0);
    const childHeights = visibleChildren.map((entry) => entry.rect.height).filter((value) => value > 0);
    const avgWidth = average(childWidths);
    const avgHeight = average(childHeights);
    const widthVariance = childWidths.length >= 2 ? Math.max(...childWidths) / Math.max(1, Math.min(...childWidths)) : 1;
    const heightVariance = childHeights.length >= 2 ? Math.max(...childHeights) / Math.max(1, Math.min(...childHeights)) : 1;
    const areaText = String(style.gridTemplateAreas || '').trim();
    const namedAreas = areaText && areaText !== 'none';
    const gap = Math.max(Number.parseFloat(style.columnGap) || 0, Number.parseFloat(style.rowGap) || 0, Number.parseFloat(style.gap) || 0);
    const heading = previousHeadingText(root);
    const headingTrail = getHeadingTrail(root, 24);
    const nearbyGridHeading = headingTrail.find((entry) => GRID_CONTEXT_RE.test(entry.text))?.text || '';
    const titleSignal = GRID_CONTEXT_RE.test(String(document.title || ''));
    const gridNameSignal = hasGridName(root);
    const inlineStyleSignal = /display\s*:\s*(inline-)?grid/i.test(String(root.getAttribute('style') || ''));
    const twoDimensional = columnLanes >= 2 && rowLanes >= 2;
    const multiTrack = columnTrackCount >= 2 || rowTrackCount >= 2;
    const repeatedShape = widthVariance <= 3.5 && heightVariance <= 3.5;
    const roleGrid = root.getAttribute('role') === 'grid';

    return {
      root,
      rect,
      visibility,
      style,
      directChildren,
      childEntries,
      visibleChildren,
      columnTrackCount,
      rowTrackCount,
      columnLanes,
      rowLanes,
      compactItemRatio: compactItems / Math.max(1, visibleChildren.length),
      avgTextLength: Math.round(average(textLengths)),
      avgWidth: Math.round(avgWidth),
      avgHeight: Math.round(avgHeight),
      gap: Math.round(gap),
      namedAreas,
      heading,
      nearbyGridHeading,
      titleSignal,
      gridNameSignal,
      inlineStyleSignal,
      twoDimensional,
      multiTrack,
      repeatedShape,
      roleGrid,
    };
  };

  const toCandidate = (structure, score, reasons) => ({
    container: structure.root,
    score,
    reasons,
    rect: structure.rect,
    depth: getDepth(structure.root),
    visibility: structure.visibility,
    highlightable: structure.visibility.visible,
    itemCount: structure.directChildren.length,
    visibleItemCount: structure.visibleChildren.length,
    columnTrackCount: structure.columnTrackCount,
    rowTrackCount: structure.rowTrackCount,
    columnLanes: structure.columnLanes,
    rowLanes: structure.rowLanes,
    gap: structure.gap,
    avgItemWidth: structure.avgWidth,
    avgItemHeight: structure.avgHeight,
    selectorHint: buildSelectorHint(structure.root),
    heading: structure.nearbyGridHeading || structure.heading || '',
    labels: structure.visibleChildren.map((entry) => entry.text).filter(Boolean).slice(0, 8),
    display: structure.style.display,
    templateColumns: structure.style.gridTemplateColumns,
    templateRows: structure.style.gridTemplateRows,
    namedAreas: structure.namedAreas,
  });

  const scoreRoot = (root) => {
    if (!isElementNode(root)) return null;
    if (config.ignoredTags.has(root.tagName)) return null;
    if (root === document.body || root === document.documentElement) return null;

    const structure = extractStructure(root);
    if (!structure) return null;
    if (root.matches?.('table, thead, tbody, tr, td, th')) return null;
    if (hasCodeContext(root)) return null;
    if (hasExcludedName(root) && !structure.gridNameSignal && !GRID_CONTEXT_RE.test(structure.heading) && !structure.nearbyGridHeading) return null;
    if (structure.visibleChildren.length > config.maxItems) return null;
    if (structure.rect.width < 32 || structure.rect.height < 24) return null;

    const viewport = viewportSize();
    const oversizedCompositeWrapper = (
      structure.rect.height >= Math.max(1600, viewport.height * 1.75)
      && structure.visibleChildren.length <= 6
      && structure.avgTextLength >= 180
      && structure.compactItemRatio < 0.5
    );
    if (oversizedCompositeWrapper) return null;

    let score = 0;
    const reasons = [];

    score += structure.style.display === 'grid' ? 18 : 16;
    reasons.push(`${structure.style.display}-display`);

    if (structure.roleGrid) {
      score += 8;
      reasons.push('grid-role');
    }
    if (structure.gridNameSignal) {
      score += 14;
      reasons.push('grid-like-name');
    }
    if (structure.inlineStyleSignal) {
      score += 8;
      reasons.push('inline-grid-style');
    }
    if (GRID_CONTEXT_RE.test(structure.heading)) {
      score += 10;
      reasons.push('grid-heading-context');
    }
    if (structure.nearbyGridHeading && structure.nearbyGridHeading !== structure.heading) {
      score += 8;
      reasons.push('nearby-grid-heading');
    }
    if (structure.titleSignal) {
      score += 8;
      reasons.push('grid-document-title');
    }
    if (structure.visibleChildren.length >= config.minItems && structure.visibleChildren.length <= 16) {
      score += 10;
      reasons.push('grid-item-count');
    }
    if (structure.columnTrackCount >= 2) {
      score += 12;
      reasons.push('multiple-columns');
    }
    if (structure.rowTrackCount >= 2) {
      score += 8;
      reasons.push('multiple-rows');
    }
    if (structure.columnLanes >= 2) {
      score += 8;
      reasons.push('visual-columns');
    }
    if (structure.rowLanes >= 2) {
      score += 8;
      reasons.push('visual-rows');
    }
    if (structure.twoDimensional) {
      score += 12;
      reasons.push('two-dimensional-layout');
    }
    if (structure.gap >= 4) {
      score += 4;
      reasons.push('grid-gap');
    }
    if (structure.namedAreas) {
      score += 8;
      reasons.push('named-grid-areas');
    }
    if (structure.compactItemRatio >= 0.5) {
      score += 4;
      reasons.push('compact-grid-items');
    }
    if (structure.repeatedShape) {
      score += 4;
      reasons.push('repeated-item-shape');
    }

    if (score < config.minScore) return null;

    return toCandidate(structure, score, reasons);
  };

  const gatherCandidates = () => unique([...document.querySelectorAll('*')])
    .map((root) => scoreRoot(root))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.depth - b.depth);

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
      .__grid-detector-container {
        outline: 3px solid var(--grid-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 10px !important;
      }
      .__grid-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--grid-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .__grid-detector-flash {
        animation: __grid-detector-flash 1.2s ease-out 1;
      }
      @keyframes __grid-detector-flash {
        0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
        100% { box-shadow: 0 0 0 18px transparent; }
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
  };

  const cleanup = () => {
    document.querySelectorAll('.__grid-detector-container').forEach((el) => {
      el.classList.remove('__grid-detector-container');
      el.style.removeProperty('--grid-detector-color');
    });
    state.overlays.forEach((el) => el.remove());
    state.overlays = [];
    if (state.styleEl) {
      state.styleEl.remove();
      state.styleEl = null;
    }
  };

  const revealCandidate = (result) => {
    if (!result || !isElementNode(result.container)) return;
    const rect = result.container.getBoundingClientRect();
    window.scrollTo({
      top: Math.max(0, window.scrollY + rect.top - Math.max(24, (window.innerHeight - rect.height) / 4)),
      behavior: 'smooth',
    });
    result.container.classList.add('__grid-detector-flash');
    window.setTimeout(() => result.container.classList.remove('__grid-detector-flash'), 1400);
    console.group(`Reveal grid ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('result:', result);
    console.log('container:', result.container);
    console.groupEnd();
  };

  const paintCandidate = (candidate, index) => {
    if (!candidate.highlightable || !config.highlightVisible) return;
    const color = config.palette[index % config.palette.length];
    candidate.container.classList.add('__grid-detector-container');
    candidate.container.style.setProperty('--grid-detector-color', color);
    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__grid-detector-badge';
    badge.style.setProperty('--grid-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    badge.textContent = `grid ${index + 1} | ${candidate.visibleItemCount} items | score ${candidate.score}`;
    document.body.appendChild(badge);
    state.overlays.push(badge);
  };

  addStyles();

  const allCandidates = gatherCandidates();
  const candidates = dedupeCandidates(allCandidates).slice(0, config.maxResults);
  candidates.forEach((candidate, index) => paintCandidate(candidate, index));

  const results = candidates.map((candidate, index) => ({
    id: index + 1,
    score: candidate.score,
    reasons: candidate.reasons,
    itemCount: candidate.itemCount,
    visibleItemCount: candidate.visibleItemCount,
    columnTrackCount: candidate.columnTrackCount,
    rowTrackCount: candidate.rowTrackCount,
    columnLanes: candidate.columnLanes,
    rowLanes: candidate.rowLanes,
    gap: candidate.gap,
    avgItemWidth: candidate.avgItemWidth,
    avgItemHeight: candidate.avgItemHeight,
    display: candidate.display,
    templateColumns: candidate.templateColumns,
    templateRows: candidate.templateRows,
    namedAreas: candidate.namedAreas,
    visibilityState: candidate.visibility.state,
    hiddenReason: candidate.visibility.reason,
    selectorHint: candidate.selectorHint,
    heading: candidate.heading,
    rect: summarizeRect(candidate.rect),
    highlighted: candidate.highlightable && config.highlightVisible,
    labels: candidate.labels,
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
      return runGridDetector({ ...overrides, ...nextOverrides });
    },
  };

  window.__gridDetector = api;
  window.runGridDetector = runGridDetector;

  console.group('Grid detector');
  console.table(results.map((result) => ({
    id: result.id,
    score: result.score,
    items: result.visibleItemCount,
    cols: result.columnTrackCount || result.columnLanes,
    rows: result.rowTrackCount || result.rowLanes,
    heading: result.heading,
    selectorHint: result.selectorHint,
  })));
  results.forEach((result) => {
    console.group(`grid ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('heading:', result.heading);
    console.log('reasons:', result.reasons);
    console.log('display:', result.display);
    console.log('templateColumns:', result.templateColumns);
    console.log('templateRows:', result.templateRows);
    console.log('labels:', result.labels);
    console.log('container:', result.container);
    console.groupEnd();
  });
  console.log('Cleanup with window.__gridDetector?.cleanup()');
  console.log('Inspect one result with window.__gridDetector?.inspect(1)');
  console.log('Reveal one result with window.__gridDetector?.reveal(1)');
  console.log('Rerun without visible overlays with window.__gridDetector?.rerun({ highlightVisible: false })');
  console.groupEnd();

  return api;
}

window.runGridDetector = runGridDetector;