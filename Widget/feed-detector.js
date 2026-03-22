function runFeedDetector(overrides = {}) {
  const previous = window.__feedDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minScore: 26,
    minItems: 3,
    maxItems: 40,
    maxResults: 16,
    overlayZIndex: 2147483646,
    palette: ['#006d77', '#ef476f', '#118ab2', '#ff9f1c', '#06d6a0', '#8338ec', '#3a86ff', '#ff595e'],
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

  const FEED_NAME_RE = /feed|timeline|stream|activity|updates|posts|stories|news|results-list/i;
  const FEED_LABEL_RE = /feed|timeline|stream|activity|updates|posts|stories|news/i;
  const EXCLUDED_NAME_RE = /menu|menubar|tablist|tabs|carousel|slider|accordion|breadcrumb|tooltip|progress|gallery|grid|table|footer|sidebar|toc|masthead|navigation|nav(-|_)?/i;

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
  const hasFeedName = (el) => FEED_NAME_RE.test(classTextFor(el));
  const hasFeedLabel = (value) => FEED_LABEL_RE.test(String(value || ''));
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
    if ((rect.width < 6 || rect.height < 6) && (style.overflow === 'hidden' || style.maxHeight === '0px')) return { state: 'collapsed', reason: 'collapsed-size', visible: false };
    if (outsideViewport) return { state: 'offscreen', reason: 'outside-viewport', visible: false };
    if (Number(style.opacity) === 0 && style.pointerEvents === 'none') return { state: 'hidden', reason: 'fully-transparent', visible: false };
    return { state: 'visible', reason: null, visible: true };
  };
  const hasExcludedContext = (el) => {
    for (let current = el; current && current !== document.body; current = current.parentElement) {
      if (current.matches('nav, header, [role="navigation"], [role="menu"], [role="menubar"], [role="tablist"]')) return true;
      if (hasExcludedName(current) && !hasFeedName(current) && !current.matches('[role="feed"]')) return true;
      if (current.getAttribute('role') === 'application' && /menu|nav/i.test(classTextFor(current))) return true;
    }
    return false;
  };
  const getDirectElementChildren = (el) => [...el.children].filter((child) => !config.ignoredTags.has(child.tagName));
  const hasArticleName = (el) => /article|story|post|update|item|entry|card|result|commentary/i.test(classTextFor(el));

  const isArticleLike = (el) => {
    if (!(el instanceof Element)) return false;
    if (el.matches('article, [role="article"]')) return true;
    if (hasArticleName(el)) return true;
    const heading = el.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
    const paragraphs = el.querySelectorAll('p').length;
    const media = el.querySelectorAll('img, picture, video, figure').length;
    const text = normalizeText(el);
    return !!heading && text.length >= 60 && (paragraphs >= 1 || media >= 1);
  };

  const extractItems = (container) => {
    const directChildren = getDirectElementChildren(container);
    let items = directChildren.filter((child) => isArticleLike(child));
    let itemRoot = container;

    if (items.length < config.minItems) {
      const listChild = directChildren.find((child) => child.tagName === 'UL' || child.tagName === 'OL' || /list|items|feed|timeline|stream/i.test(classTextFor(child)));
      if (listChild) {
        const listItems = getDirectElementChildren(listChild)
          .filter((child) => child.tagName === 'LI' || isArticleLike(child))
          .map((child) => (child.tagName === 'LI' && getDirectElementChildren(child).length === 1 ? getDirectElementChildren(child)[0] : child))
          .filter((child) => isArticleLike(child));
        if (listItems.length >= config.minItems) {
          items = listItems;
          itemRoot = listChild;
        }
      }
    }

    if (items.length < config.minItems || items.length > config.maxItems) return null;
    return { itemRoot, items };
  };

  const inferOrientation = (items) => {
    if (items.length < 2) return 'unknown';
    const rects = items.map((item) => item.getBoundingClientRect());
    const topDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.top - rects[index].top));
    const leftDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.left - rects[index].left));
    const avgTopDelta = average(topDeltas);
    const avgLeftDelta = average(leftDeltas);
    if (avgLeftDelta < 18 && avgTopDelta > 36) return 'vertical';
    if (avgTopDelta < 18 && avgLeftDelta > 36) return 'horizontal';
    return 'mixed';
  };

  const scoreContainer = (container) => {
    if (!(container instanceof Element)) return null;
    if (config.ignoredTags.has(container.tagName)) return null;
    if (container === document.body || container === document.documentElement) return null;
    if (container.matches('nav, aside, footer, [role="navigation"], [role="tablist"], [role="menu"], [role="tree"], [role="grid"]')) return null;
    if (hasExcludedName(container) && !hasFeedName(container) && !container.matches('[role="feed"]')) return null;
    if (hasExcludedContext(container) && !hasFeedName(container) && !container.matches('[role="feed"]')) return null;

    const extracted = extractItems(container);
    if (!extracted) return null;

    const { itemRoot, items } = extracted;
    const rect = container.getBoundingClientRect();
    const visibility = getVisibilityInfo(container);
    const style = window.getComputedStyle(container);
    const headings = items.filter((item) => item.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]')).length;
    const articles = items.filter((item) => item.matches('article, [role="article"]')).length;
    const textLengths = items.map((item) => normalizeText(item).length);
    const avgTextLength = average(textLengths);
    const mediaCount = items.filter((item) => item.querySelector('img, picture, video, figure')).length;
    const focusableArticles = items.filter((item) => item.matches('[tabindex], [role="article"]') || item.querySelector('a[href], button')).length;
    const linkClusters = items.filter((item) => {
      const links = item.querySelectorAll('a[href]').length;
      return links >= 4 && normalizeText(item).length < 120;
    }).length;
    const orientation = inferOrientation(items);
    const nameSignal = hasFeedName(container);
    const label = getAccessibleLabel(container);
    const labelSignal = hasFeedLabel(label);
    const scrollable = /(auto|scroll)/.test(style.overflowY) || container.scrollHeight > container.clientHeight + 80;
    const busySignal = container.getAttribute('aria-busy') === 'true';
    const roleFeed = container.getAttribute('role') === 'feed';
    const itemRectHeights = items.map((item) => item.getBoundingClientRect().height).filter((value) => value > 0);
    const avgHeight = average(itemRectHeights);
    const repeatedShape = itemRectHeights.length >= 3 && Math.max(...itemRectHeights) / Math.max(1, Math.min(...itemRectHeights)) < 3.5;
    const itemHeadingCounts = items.map((item) => item.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]').length);
    const avgHeadingCount = average(itemHeadingCounts);
    const itemNestedSections = items.map((item) => item.querySelectorAll('section, article, [role="region"]').length);
    const avgNestedSectionCount = average(itemNestedSections);
    const directChildren = getDirectElementChildren(container);
    const hasDirectStructuralChrome = directChildren.some((child) => child.matches('header, nav, [role="navigation"], [role="menu"], [role="menubar"], [role="tablist"]'));
    const oversizedCompositeItems = avgHeight >= Math.max(900, Math.round(viewportSize().height * 0.7)) || avgTextLength >= 420;
    const sectionLikeItems = avgHeadingCount > 2.5 || avgNestedSectionCount > 1.5;
    const weakFeedSignals = !roleFeed && !nameSignal && !labelSignal && !scrollable && !busySignal;

    if (orientation === 'horizontal') return null;
    if (avgTextLength < 40 && articles < 2) return null;
    if (linkClusters >= Math.ceil(items.length * 0.6)) return null;
    if (hasDirectStructuralChrome && weakFeedSignals) return null;
    if (weakFeedSignals && articles < 2 && oversizedCompositeItems && sectionLikeItems) return null;

    let score = 0;
    const reasons = [];

    if (roleFeed) {
      score += 30;
      reasons.push('feed-role');
    }
    if (nameSignal) {
      score += 18;
      reasons.push('feed-like-name');
    }
    if (labelSignal) {
      score += 12;
      reasons.push('feed-label');
    }
    if (articles >= Math.max(2, items.length - 1)) {
      score += 18;
      reasons.push('article-children');
    }
    if (headings >= Math.max(2, Math.floor(items.length * 0.6))) {
      score += 10;
      reasons.push('headlined-items');
    }
    if (avgTextLength >= 80) {
      score += 10;
      reasons.push('substantive-item-content');
    }
    if (mediaCount >= 1) {
      score += 6;
      reasons.push('media-in-items');
    }
    if (focusableArticles >= Math.max(1, Math.floor(items.length / 3))) {
      score += 6;
      reasons.push('interactive-article-items');
    }
    if (scrollable) {
      score += 8;
      reasons.push('scrollable-stream');
    }
    if (busySignal) {
      score += 4;
      reasons.push('busy-feed-updates');
    }
    if (orientation === 'vertical') {
      score += 10;
      reasons.push('vertical-flow');
    }
    if (repeatedShape && avgHeight >= 80) {
      score += 6;
      reasons.push('repeated-article-shape');
    }

    if (container.closest('aside, footer')) {
      score -= 16;
      reasons.push('secondary-region');
    }
    if (items.length > 18 && avgTextLength < 70 && !roleFeed) {
      score -= 8;
      reasons.push('generic-long-list');
    }
    if (!scrollable && !roleFeed && !nameSignal) {
      score -= 8;
      reasons.push('missing-feed-behavior-signals');
    }
    if (oversizedCompositeItems && sectionLikeItems && weakFeedSignals) {
      score -= 18;
      reasons.push('section-wrapper-pattern');
    }

    if (score < config.minScore) return null;

    return {
      container,
      itemRoot,
      items,
      score,
      reasons,
      rect,
      depth: getDepth(container),
      visibility,
      highlightable: visibility.visible,
      orientation,
      itemCount: items.length,
      avgTextLength: Math.round(avgTextLength),
      avgItemHeight: Math.round(avgHeight),
      roleFeed,
    };
  };

  const gatherCandidates = () => {
    const candidates = unique([
      ...document.querySelectorAll('main, section, div, [role="feed"], [class*="feed"], [class*="timeline"], [class*="stream"], [class*="activity"], [class*="updates"], [class*="posts"], [class*="stories"]'),
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
        const overlap = candidate.items.filter((item) => existing.items.includes(item)).length;
        if (overlap / Math.max(1, Math.min(candidate.items.length, existing.items.length)) < 0.7) return false;
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
      .__feed-detector-container {
        outline: 3px solid var(--feed-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 10px !important;
      }
      .__feed-detector-item {
        box-shadow: inset 0 0 0 2px var(--feed-detector-color) !important;
        border-radius: 8px !important;
      }
      .__feed-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--feed-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .__feed-detector-flash {
        animation: __feed-detector-flash 1.2s ease-out 1;
      }
      @keyframes __feed-detector-flash {
        0% { box-shadow: 0 0 0 0 rgba(17, 138, 178, 0.7); }
        100% { box-shadow: 0 0 0 18px transparent; }
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
  };

  const cleanup = () => {
    document.querySelectorAll('.__feed-detector-container').forEach((el) => {
      el.classList.remove('__feed-detector-container');
      el.style.removeProperty('--feed-detector-color');
    });
    document.querySelectorAll('.__feed-detector-item').forEach((el) => {
      el.classList.remove('__feed-detector-item');
      el.style.removeProperty('--feed-detector-color');
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
      top: Math.max(0, window.scrollY + rect.top - Math.max(24, (window.innerHeight - rect.height) / 4)),
      behavior: 'smooth',
    });
    result.container.classList.add('__feed-detector-flash');
    window.setTimeout(() => result.container.classList.remove('__feed-detector-flash'), 1400);
    console.group(`Reveal feed ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('result:', result);
    console.log('container:', result.container);
    console.groupEnd();
  };

  const paintCandidate = (candidate, index) => {
    if (!candidate.highlightable || !config.highlightVisible) return;
    const color = config.palette[index % config.palette.length];
    candidate.container.classList.add('__feed-detector-container');
    candidate.container.style.setProperty('--feed-detector-color', color);
    candidate.items.forEach((item) => {
      item.classList.add('__feed-detector-item');
      item.style.setProperty('--feed-detector-color', color);
    });
    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__feed-detector-badge';
    badge.style.setProperty('--feed-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    badge.textContent = `feed ${index + 1} | ${candidate.itemCount} items | score ${candidate.score}`;
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
    itemCount: candidate.itemCount,
    orientation: candidate.orientation,
    avgTextLength: candidate.avgTextLength,
    avgItemHeight: candidate.avgItemHeight,
    roleFeed: candidate.roleFeed,
    visibilityState: candidate.visibility.state,
    hiddenReason: candidate.visibility.reason,
    selectorHint: buildSelectorHint(candidate.container),
    rect: summarizeRect(candidate.rect),
    highlighted: candidate.highlightable && config.highlightVisible,
    labels: candidate.items.map((item) => normalizeText(item.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]')) || normalizeText(item).slice(0, 80)),
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
      return runFeedDetector({ ...overrides, ...nextOverrides });
    },
  };

  window.__feedDetector = api;
  window.runFeedDetector = runFeedDetector;

  console.group('Feed detector');
  console.table(results.map((result) => ({
    id: result.id,
    score: result.score,
    itemCount: result.itemCount,
    orientation: result.orientation,
    avgTextLength: result.avgTextLength,
    visibility: result.visibilityState,
    highlighted: result.highlighted,
    selectorHint: result.selectorHint,
    rect: `${result.rect.x},${result.rect.y},${result.rect.width}x${result.rect.height}`,
  })));
  results.forEach((result) => {
    console.group(`feed ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('reasons:', result.reasons);
    console.log('labels:', result.labels);
    console.log('container:', result.container);
    console.groupEnd();
  });
  console.log('Cleanup with window.__feedDetector?.cleanup()');
  console.log('Inspect one result with window.__feedDetector?.inspect(1)');
  console.log('Reveal one result with window.__feedDetector?.reveal(1)');
  console.log('Rerun without visible overlays with window.__feedDetector?.rerun({ highlightVisible: false })');
  console.groupEnd();

  return api;
}

window.runFeedDetector = runFeedDetector;