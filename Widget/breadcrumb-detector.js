function runBreadcrumbDetector(overrides = {}) {
  const previous = window.__breadcrumbDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minItems: 2,
    maxItems: 8,
    minScore: 30,
    maxResults: 24,
    includeFrames: true,
    overlayZIndex: 2147483646,
    palette: ['#ff5d5d', '#2ec4b6', '#ff9f1c', '#6c63ff', '#06d6a0', '#ef476f', '#118ab2', '#ffd166', '#8338ec', '#3a86ff'],
    ignoredTags: new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH']),
    highlightVisible: true,
  };

  const config = {
    ...BASE_CONFIG,
    maxResults: overrides.maxResults ?? BASE_CONFIG.maxResults,
    includeFrames: overrides.includeFrames ?? BASE_CONFIG.includeFrames,
    highlightVisible: overrides.highlightVisible ?? BASE_CONFIG.highlightVisible,
  };

  const state = {
    childApis: [],
    overlays: [],
    resultHandles: new Map(),
    styleEl: null,
    results: [],
  };

  const average = (values) => {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const unique = (items) => [...new Set(items.filter(Boolean))];

  const normalizeText = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim();

  const classTextFor = (el) => {
    if (!(el instanceof Element)) return '';
    return `${el.tagName} ${String(el.id || '')} ${String(el.className || '')}`;
  };

  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };

  const viewportSize = () => ({
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  });

  const hasBreadcrumbName = (el) => /breadcrumb|crumbs?|trail|pathway|you-are-here|location-path/i.test(classTextFor(el));

  const hasExcludedName = (el) => /pagination|pager|page-nav|tab|tablist|toolbar|menu|menubar|carousel|accordion|tree|social|share|footer|chip|tag|toc|table-of-contents|reference-toc|secondary-nav|quick-links|progressive-nav|nav3-column|link-list|list-style-tick/i.test(classTextFor(el));

  const hasHelperName = (el) => /tooltip|popover|ellipsis|collapsed|indicator|badge|helper|hint|description|caption|sr-only|visually-hidden|screen-reader|assistive/i.test(classTextFor(el));

  const hasDecorativeName = (el) => /icon|glyph|emoji|dot|circle|node|bullet|avatar|progress|meter|track|line/i.test(classTextFor(el));

  const hasBreadcrumbItemName = (el) => /breadcrumb-item|breadcrumb-step|breadcrumbs?-item|crumb-item|step-(complete|active|current)|step\b/i.test(classTextFor(el));

  const hasSeparatorName = (el) => /separator|divider|slash|chevron|arrow|crumb-divider/i.test(classTextFor(el));

  const isHiddenForExtraction = (el) => {
    if (!(el instanceof Element)) return true;

    for (let current = el; current; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none') return true;
      if (style.visibility === 'hidden' || style.contentVisibility === 'hidden') return true;
      if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return true;
    }

    const style = window.getComputedStyle(el);
    return (style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden') && (style.height === '0px' || style.maxHeight === '0px');
  };

  const getVisibilityInfo = (el) => {
    for (let current = el; current; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none') {
        return { state: 'hidden', reason: 'display-none-chain', visible: false };
      }
      if (style.visibility === 'hidden' || style.contentVisibility === 'hidden') {
        return { state: 'hidden', reason: 'visibility-hidden-chain', visible: false };
      }
      if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') {
        return { state: 'collapsed', reason: 'hidden-attribute', visible: false };
      }
    }

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const viewport = viewportSize();
    const outsideViewport = rect.bottom < -40 || rect.top > viewport.height + 40 || rect.right < -40 || rect.left > viewport.width + 40;

    if ((rect.width < 4 || rect.height < 4) && (style.overflow === 'hidden' || style.height === '0px' || style.maxHeight === '0px')) {
      return { state: 'collapsed', reason: 'collapsed-size', visible: false };
    }

    if (outsideViewport) {
      return { state: 'offscreen', reason: 'outside-viewport', visible: false };
    }

    if (Number(style.opacity) === 0 && style.pointerEvents === 'none') {
      return { state: 'hidden', reason: 'fully-transparent', visible: false };
    }

    return { state: 'visible', reason: null, visible: true };
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

  const summarizeRect = (rect) => ({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });

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

  const getFrameSelectorHint = (frameEl, index) => {
    const selectorHint = buildSelectorHint(frameEl);
    return selectorHint || `${frameEl.tagName.toLowerCase()}[data-breadcrumb-frame-index="${index + 1}"]`;
  };

  const getAccessibleLabel = (el) => {
    if (!(el instanceof Element)) return '';
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labels = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((node) => normalizeText(node))
        .filter(Boolean);
      return labels.join(' ').trim();
    }
    return '';
  };

  const getDirectElementChildren = (el) => {
    if (!(el instanceof Element)) return [];
    return [...el.children].filter((child) => !config.ignoredTags.has(child.tagName) && !isHiddenForExtraction(child) && !hasHelperName(child));
  };

  const unwrapSingleChildContainer = (el) => {
    if (!(el instanceof Element)) return el;

    let current = el;
    while (current instanceof Element) {
      const children = getDirectElementChildren(current);
      if (children.length !== 1) break;

      const [onlyChild] = children;
      if (!(onlyChild instanceof Element)) break;
      if (normalizeText(current) !== normalizeText(onlyChild)) break;

      current = onlyChild;
    }

    return current;
  };

  const extractItemText = (el) => {
    if (!(el instanceof Element)) return '';

    if (el.tagName === 'A') {
      return normalizeText(el);
    }

    const directChildren = getDirectElementChildren(el);
    const labelledChild = directChildren.find((child) => {
      if (isSeparatorElement(child) || hasDecorativeName(child)) return false;
      return /label|title|text|name|value/i.test(classTextFor(child)) && !!normalizeText(child);
    });

    if (labelledChild) {
      return normalizeText(labelledChild);
    }

    const ownText = [...el.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => String(node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    if (ownText) {
      return ownText;
    }

    const textChildren = directChildren
      .filter((child) => !isSeparatorElement(child) && !hasDecorativeName(child))
      .map((child) => normalizeText(child))
      .filter(Boolean);

    if (textChildren.length > 0) {
      return unique(textChildren).join(' ').trim();
    }

    return normalizeText(el);
  };

  const isCurrentItem = (item, index, items) => {
    const hasLinkedAncestors = items.slice(0, -1).some((entry) => entry.isLink);
    const signalText = `${classTextFor(item.wrapper)} ${classTextFor(item.element)}`;
    return (
      item.element.getAttribute('aria-current') === 'page' ||
      item.wrapper.getAttribute('aria-current') === 'page' ||
      /current|active|selected|here|is-current|is-active/i.test(signalText) ||
      (!item.isLink && index === items.length - 1 && hasLinkedAncestors)
    );
  };

  const isSeparatorElement = (el) => {
    if (!(el instanceof Element)) return false;
    if (hasSeparatorName(el)) return true;
    if (el.tagName === 'SVG') return true;
    const text = normalizeText(el);
    return !!text && /^[/|>»›:\-]+$/.test(text);
  };

  const extractItemFromWrapper = (wrapper) => {
    if (!(wrapper instanceof Element)) return null;
    if (config.ignoredTags.has(wrapper.tagName)) return null;

    const directChildren = getDirectElementChildren(wrapper);
    const directLinks = directChildren.filter((child) => child.tagName === 'A' && child.hasAttribute('href'));
    const directInteractive = directChildren.filter((child) => ['BUTTON', 'SUMMARY', 'INPUT', 'SELECT'].includes(child.tagName));
    if (directInteractive.length > 0) return null;

    const totalLinks = wrapper.querySelectorAll('a[href]').length;
    if (directLinks.length > 1 || totalLinks > 1) return null;
    if (wrapper.querySelector('picture, video, figure, table, form, input, textarea, select')) return null;

    if (directLinks.length === 1) {
      const link = directLinks[0];
      const text = extractItemText(link) || extractItemText(wrapper);
      if (!text) return null;
      return {
        wrapper,
        element: link,
        link,
        isLink: true,
        text,
      };
    }

    const candidateChild = directChildren.find((child) => {
      if (isSeparatorElement(child)) return false;
      if (child.querySelector('a[href], button, input, textarea, select')) return false;
      const text = extractItemText(child);
      return !!text && text.length <= 120;
    });

    if (candidateChild) {
      const text = extractItemText(candidateChild);
      return {
        wrapper,
        element: candidateChild,
        link: null,
        isLink: false,
        text,
      };
    }

    const wrapperText = extractItemText(wrapper);
    if (wrapperText && wrapperText.length <= 120 && directChildren.every((child) => !isSeparatorElement(child))) {
      return {
        wrapper,
        element: wrapper,
        link: null,
        isLink: false,
        text: wrapperText,
      };
    }

    return null;
  };

  const extractListTrail = (container) => {
    if (!(container instanceof Element)) return null;

    const listRoot =
      (container.tagName === 'OL' || container.tagName === 'UL')
        ? container
        : getDirectElementChildren(container).find((child) => child.tagName === 'OL' || child.tagName === 'UL');

    if (!listRoot) return null;

    const wrappers = getDirectElementChildren(listRoot).filter((child) => child.tagName === 'LI');
    if (wrappers.length < config.minItems || wrappers.length > config.maxItems) return null;

    const items = wrappers.map((wrapper) => extractItemFromWrapper(wrapper));
    if (items.some((item) => !item)) return null;

    return {
      kind: 'list',
      root: listRoot,
      wrappers,
      items,
    };
  };

  const isInlineItemElement = (el) => {
    if (!(el instanceof Element)) return false;
    if (config.ignoredTags.has(el.tagName)) return false;
    if (isSeparatorElement(el)) return false;
    if (['A', 'SPAN', 'STRONG', 'EM', 'B'].includes(el.tagName)) return true;
    if (['DIV', 'P'].includes(el.tagName)) {
      const text = extractItemText(el);
      return !!text && text.length <= 80 && !el.querySelector('picture, video, table, form, input, textarea, select');
    }
    return false;
  };

  const extractInlineTrail = (container) => {
    if (!(container instanceof Element)) return null;
    const directChildren = getDirectElementChildren(container).map((child) => unwrapSingleChildContainer(child));
    if (directChildren.length < config.minItems) return null;

    const wrappers = [];

    directChildren.forEach((child) => {
      const nestedChildren = getDirectElementChildren(child).map((nestedChild) => unwrapSingleChildContainer(nestedChild));
      const nestedWrappers = nestedChildren.filter((nestedChild) => isInlineItemElement(nestedChild));

      if (nestedWrappers.length >= config.minItems && nestedWrappers.length <= config.maxItems) {
        wrappers.push(...nestedWrappers);
        return;
      }

      if (isInlineItemElement(child)) {
        wrappers.push(child);
      }
    });

    if (wrappers.length < config.minItems || wrappers.length > config.maxItems) return null;

    const items = wrappers.map((wrapper) => {
      if (wrapper.tagName === 'A' && wrapper.hasAttribute('href')) {
        const text = extractItemText(wrapper);
        if (!text) return null;
        return { wrapper, element: wrapper, link: wrapper, isLink: true, text };
      }
      const directLinks = wrapper.querySelectorAll(':scope > a[href]');
      if (directLinks.length === 1) {
        const link = directLinks[0];
        const text = extractItemText(link) || extractItemText(wrapper);
        if (!text) return null;
        return { wrapper, element: link, link, isLink: true, text };
      }
      const text = extractItemText(wrapper);
      if (!text) return null;
      return { wrapper, element: wrapper, link: null, isLink: false, text };
    });

    if (items.some((item) => !item)) return null;

    return {
      kind: 'inline',
      root: container,
      wrappers,
      items,
    };
  };

  const inferOrientation = (items) => {
    if (items.length < 2) return 'unknown';
    const rects = items.map((item) => item.element.getBoundingClientRect());
    const topDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.top - rects[index].top));
    const leftDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.left - rects[index].left));
    const avgTopDelta = average(topDeltas);
    const avgLeftDelta = average(leftDeltas);

    if (avgTopDelta < 14 && avgLeftDelta > 12) return 'horizontal';
    if (avgLeftDelta < 10 && avgTopDelta > 12) return 'vertical';
    return 'mixed';
  };

  const getSeparatorSignalCount = (container, trail) => {
    const separatorChildren = getDirectElementChildren(container).filter((child) => isSeparatorElement(child)).length;
    const textContent = normalizeText(container);
    const literalSeparators = (textContent.match(/[>»›/]/g) || []).length;
    const wrapperSeparators = trail.wrappers.filter((wrapper) => getDirectElementChildren(wrapper).some((child) => isSeparatorElement(child))).length;
    return separatorChildren + wrapperSeparators + Math.min(literalSeparators, trail.items.length);
  };

  const scoreContainer = (container) => {
    if (!(container instanceof Element)) return null;
    if (config.ignoredTags.has(container.tagName)) return null;
    if (container === document.body || container === document.documentElement) return null;
    if (hasBreadcrumbItemName(container) && container.parentElement && hasBreadcrumbName(container.parentElement)) return null;
    const navLabel = getAccessibleLabel(container);
    if (hasExcludedName(container) && !hasBreadcrumbName(container) && !/breadcrumb/i.test(navLabel)) return null;
    if (container.matches('[role="menu"], [role="tablist"], [role="tree"], footer, aside')) return null;
    if (container.closest('details, aside') && !hasBreadcrumbName(container) && !/breadcrumb/i.test(navLabel)) return null;

    const trail = extractListTrail(container) || extractInlineTrail(container);
    if (!trail) return null;

    const itemCount = trail.items.length;
    if (itemCount < config.minItems || itemCount > config.maxItems) return null;

    const labels = trail.items.map((item) => item.text).filter(Boolean);
    if (labels.length !== itemCount) return null;

    const labelLengths = labels.map((label) => label.length);
    const shortLabelRatio = labels.filter((label) => label.length <= 36 && label.split(/\s+/).length <= 6).length / Math.max(1, itemCount);
    const numericRatio = labels.filter((label) => /^\d+$|^page\s+\d+$/i.test(label)).length / Math.max(1, itemCount);
    const prevNextCount = labels.filter((label) => /prev|previous|next|back|forward/i.test(label)).length;
    const skipLikeCount = trail.items.filter((item) => {
      const signalText = `${item.text} ${item.element.getAttribute('aria-label') || ''}`;
      return /skip to|go to|accessibility statement|site navigation|main content/i.test(signalText) || item.element.hasAttribute('accesskey');
    }).length;
    const currentIndexes = trail.items.map((item, index, items) => isCurrentItem(item, index, items) ? index : -1).filter((index) => index >= 0);
    const currentIndex = currentIndexes.length === 1 ? currentIndexes[0] : -1;
    const linkCount = trail.items.filter((item) => item.isLink).length;
    const nonLastLinks = trail.items.slice(0, -1).filter((item) => item.isLink).length;
    const namedItemCount = trail.wrappers.filter((wrapper) => hasBreadcrumbItemName(wrapper)).length;
    const explicitStepperSignal = namedItemCount >= Math.max(2, itemCount - 1);
    const mediaCount = trail.items.filter((item) => item.wrapper.querySelector('picture, video')).length;
    const inputCount = container.querySelectorAll('button, input, textarea, select').length;
    const nestedListCount = trail.wrappers.filter((wrapper) => wrapper.querySelector('ul, ol')).length;
    const orientation = inferOrientation(trail.items);
    const separatorSignals = getSeparatorSignalCount(container, trail);
    const rect = container.getBoundingClientRect();
    const viewport = viewportSize();
    const nearTop = rect.top < viewport.height * 0.35;
    const insideHeader = !!container.closest('header');
    const insideFooter = !!container.closest('footer');
    const rootLikeFirstItem = /^home$/i.test(labels[0]) || /^(web|javascript|reference|patterns|learn|docs?|documentation|azure)$/i.test(labels[0]);
    const breadcrumbNameSignal = hasBreadcrumbName(container);
    const breadcrumbLabelSignal = /breadcrumb/i.test(navLabel);
    const explicitBreadcrumbSignal = breadcrumbLabelSignal || (breadcrumbNameSignal && (currentIndex === itemCount - 1 || rootLikeFirstItem || explicitStepperSignal));
    const hasStrongAncestorLinkPattern = nonLastLinks >= Math.max(1, itemCount - 2);

    if (numericRatio >= 0.5 || (prevNextCount >= 2 && itemCount >= 3)) {
      return null;
    }
    if (currentIndex >= 0 && currentIndex !== itemCount - 1 && !(explicitStepperSignal && explicitBreadcrumbSignal && linkCount === 0)) {
      return null;
    }
    if (linkCount === 0 && !(explicitBreadcrumbSignal && explicitStepperSignal)) {
      return null;
    }
    if (/quick-links|progressive-nav|nav-hack/i.test(classTextFor(container)) && !breadcrumbLabelSignal) {
      return null;
    }
    if (skipLikeCount > 0 && !hasBreadcrumbName(container) && !/breadcrumb/i.test(navLabel)) {
      return null;
    }
    if (mediaCount > 0 || inputCount > 0 || nestedListCount > 0) {
      return null;
    }
    if (!explicitBreadcrumbSignal && currentIndex !== itemCount - 1) {
      return null;
    }
    if (!explicitBreadcrumbSignal && !hasStrongAncestorLinkPattern) {
      return null;
    }

    let score = 0;
    const reasons = [];

    if (breadcrumbNameSignal) {
      score += 28;
      reasons.push('breadcrumb-like-name');
    }
    if (breadcrumbLabelSignal) {
      score += 28;
      reasons.push('breadcrumb-label');
    }
    if (container.tagName === 'NAV') {
      score += 16;
      reasons.push('nav-landmark');
    }
    if (trail.kind === 'list') {
      score += 14;
      reasons.push('list-trail-structure');
      if (trail.root.tagName === 'OL') {
        score += 8;
        reasons.push('ordered-list-trail');
      }
    }
    if (itemCount >= 2 && itemCount <= 6) {
      score += 10;
      reasons.push('breadcrumb-item-count');
    }
    if (linkCount >= itemCount - 1) {
      score += 12;
      reasons.push('ancestor-links');
    }
    if (linkCount === 0 && explicitStepperSignal) {
      score += 12;
      reasons.push('explicit-stepper-trail');
    }
    if (hasStrongAncestorLinkPattern) {
      score += 10;
      reasons.push('strong-ancestor-link-pattern');
    }
    if (nonLastLinks === Math.max(0, itemCount - 1)) {
      score += 8;
      reasons.push('linked-ancestors-before-current');
    }
    if (currentIndex === itemCount - 1) {
      score += 18;
      reasons.push('last-current-item');
    }
    if (currentIndex >= 0 && currentIndex !== itemCount - 1 && explicitStepperSignal) {
      score += 6;
      reasons.push('stepper-current-item');
    }
    if (orientation === 'horizontal') {
      score += 12;
      reasons.push('horizontal-trail');
    }
    if (separatorSignals > 0) {
      score += 6;
      reasons.push('separator-signals');
    }
    if (shortLabelRatio >= 0.7) {
      score += 8;
      reasons.push('short-hierarchical-labels');
    }
    if (nearTop) {
      score += 8;
      reasons.push('near-top-of-page');
    }
    if (/^home$/i.test(labels[0]) || /home|docs|documentation|learn|web|patterns/i.test(labels[0])) {
      score += 4;
      reasons.push('root-like-first-item');
    }

    if (insideFooter && !hasBreadcrumbName(container)) {
      score -= 24;
      reasons.push('inside-footer');
    }
    if (insideHeader && !hasBreadcrumbName(container) && currentIndex < 0) {
      score -= 18;
      reasons.push('header-link-cluster');
    }
    if (currentIndex < 0 && !explicitBreadcrumbSignal) {
      score -= 18;
      reasons.push('missing-current-item');
    }
    if (currentIndex < 0 && explicitStepperSignal && linkCount === 0) {
      score -= 4;
      reasons.push('stepper-missing-current-item');
    }
    if (linkCount === itemCount && !explicitBreadcrumbSignal) {
      score -= 10;
      reasons.push('all-links-no-explicit-current');
    }
    if (average(labelLengths) > 28) {
      score -= 10;
      reasons.push('long-item-labels');
    }
    if (orientation === 'vertical') {
      score -= 24;
      reasons.push('vertical-link-list');
    }

    if (score < config.minScore) return null;

    const visibility = getVisibilityInfo(container);
    const highlightable = visibility.visible;

    return {
      container,
      trailRoot: trail.root,
      items: trail.items,
      itemCount,
      linkCount,
      currentIndex,
      score,
      reasons,
      orientation,
      rect,
      depth: getDepth(container),
      labels,
      visibility,
      highlightable,
      trailKind: trail.kind,
    };
  };

  const gatherCandidates = () => {
    const structuralCandidates = [...document.querySelectorAll('div, p')].filter((el) => {
      const directChildren = getDirectElementChildren(el).map((child) => unwrapSingleChildContainer(child));
      if (directChildren.length < config.minItems || directChildren.length > config.maxItems) return false;

      const directLinkishCount = directChildren.filter((child) => {
        if (!(child instanceof Element)) return false;
        if (child.matches('a[href]')) return true;
        if (child.querySelector(':scope > a[href]')) return true;

        const nestedChildren = getDirectElementChildren(child).map((nestedChild) => unwrapSingleChildContainer(nestedChild));
        return nestedChildren.some((nestedChild) => nestedChild.matches('a[href]') || !!nestedChild.querySelector(':scope > a[href]'));
      }).length;

      return directLinkishCount >= Math.max(1, directChildren.length - 1);
    });

    const candidates = unique([
      ...document.querySelectorAll('nav, ol, ul, [class*="crumb"], [class*="breadcrumb"], [id*="crumb"], [id*="breadcrumb"], [aria-label], [aria-labelledby]'),
      ...structuralCandidates,
    ]);

    return candidates
      .filter((el) => !config.ignoredTags.has(el.tagName))
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

        const overlapCount = candidate.items.filter((item) => existing.items.some((other) => other.element === item.element || other.wrapper === item.wrapper)).length;
        const overlapRatio = overlapCount / Math.max(1, Math.min(candidate.items.length, existing.items.length));
        if (overlapRatio < 0.8) return false;

        if (candidate.container.contains(existing.container)) {
          return candidate.score <= existing.score + 8;
        }
        return existing.score >= candidate.score;
      });

      if (!duplicate) {
        accepted.push(candidate);
      }
    }

    return accepted;
  };

  const addStyles = () => {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .__breadcrumb-detector-container {
        outline: 3px solid var(--breadcrumb-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 8px !important;
      }
      .__breadcrumb-detector-item {
        box-shadow: inset 0 0 0 2px var(--breadcrumb-detector-color) !important;
        border-radius: 6px !important;
      }
      .__breadcrumb-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--breadcrumb-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .__breadcrumb-detector-flash {
        animation: __breadcrumb-detector-flash 1.2s ease-out 1;
      }
      @keyframes __breadcrumb-detector-flash {
        0% { box-shadow: 0 0 0 0 rgba(255, 157, 28, 0.7); }
        100% { box-shadow: 0 0 0 18px transparent; }
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
  };

  const cleanup = () => {
    state.childApis.forEach((api) => {
      if (api && typeof api.cleanup === 'function') {
        api.cleanup();
      }
    });
    state.childApis = [];

    document.querySelectorAll('.__breadcrumb-detector-container').forEach((el) => {
      el.classList.remove('__breadcrumb-detector-container');
      el.style.removeProperty('--breadcrumb-detector-color');
      delete el.dataset.breadcrumbDetectorId;
    });

    document.querySelectorAll('.__breadcrumb-detector-item').forEach((el) => {
      el.classList.remove('__breadcrumb-detector-item');
      el.style.removeProperty('--breadcrumb-detector-color');
      delete el.dataset.breadcrumbDetectorGroup;
    });

    state.overlays.forEach((el) => el.remove());
    state.overlays = [];
    state.resultHandles.clear();

    if (state.styleEl) {
      state.styleEl.remove();
      state.styleEl = null;
    }
  };

  const revealCandidate = (result) => {
    if (!result) return;

    const handle = state.resultHandles.get(result.id);
    if (handle && handle.type === 'frame') {
      return handle.reveal();
    }

    const container = result.container;
    if (!(container instanceof Element)) return;

    const rect = container.getBoundingClientRect();
    const top = window.scrollY + rect.top - Math.max(24, (window.innerHeight - rect.height) / 3);
    window.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth',
    });

    container.classList.add('__breadcrumb-detector-flash');
    window.setTimeout(() => {
      container.classList.remove('__breadcrumb-detector-flash');
    }, 1400);

    console.group(`Reveal breadcrumb ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('result:', result);
    console.log('container:', result.container);
    console.groupEnd();
  };

  const paintCandidate = (candidate, index) => {
    if (!candidate.highlightable || !config.highlightVisible) return;

    const color = config.palette[index % config.palette.length];
    candidate.container.classList.add('__breadcrumb-detector-container');
    candidate.container.style.setProperty('--breadcrumb-detector-color', color);
    candidate.container.dataset.breadcrumbDetectorId = String(index + 1);

    candidate.items.forEach((item) => {
      item.wrapper.classList.add('__breadcrumb-detector-item');
      item.wrapper.style.setProperty('--breadcrumb-detector-color', color);
      item.wrapper.dataset.breadcrumbDetectorGroup = String(index + 1);
    });

    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__breadcrumb-detector-badge';
    badge.style.setProperty('--breadcrumb-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    badge.textContent = `breadcrumb ${index + 1} | ${candidate.itemCount} items | score ${candidate.score}`;
    document.body.appendChild(badge);
    state.overlays.push(badge);
  };

  const collectFrameResults = (startingId) => {
    if (!config.includeFrames) return [];

    const frameResults = [];
    const frameElements = [...document.querySelectorAll('iframe, frame')];
    let nextId = startingId;

    frameElements.forEach((frameEl, frameIndex) => {
      try {
        const frameWindow = frameEl.contentWindow;
        const frameDocument = frameEl.contentDocument;

        if (!frameWindow || !frameDocument || !frameDocument.documentElement) {
          return;
        }

        frameEl.dataset.breadcrumbFrameIndex = String(frameIndex + 1);
        frameWindow.eval(`window.runBreadcrumbDetector = ${runBreadcrumbDetector.toString()};`);

        const childApi = frameWindow.runBreadcrumbDetector({
          ...overrides,
          includeFrames: false,
          highlightVisible: config.highlightVisible,
          maxResults: config.maxResults,
        });

        if (!childApi || !Array.isArray(childApi.results)) {
          return;
        }

        state.childApis.push(childApi);

        childApi.results.forEach((result) => {
          const mergedResult = {
            ...result,
            id: nextId,
            frameIndex: frameIndex + 1,
            frameSelectorHint: getFrameSelectorHint(frameEl, frameIndex),
            frameTitle: frameDocument.title,
            frameUrl: frameWindow.location.href,
          };

          state.resultHandles.set(nextId, {
            type: 'frame',
            reveal: () => childApi.reveal(result.id),
          });

          frameResults.push(mergedResult);
          nextId += 1;
        });
      } catch (error) {
        console.warn('Breadcrumb detector could not access frame', frameEl, error);
      }
    });

    return frameResults;
  };

  addStyles();

  const candidates = dedupeCandidates(gatherCandidates()).slice(0, config.maxResults);
  candidates.forEach((candidate, index) => paintCandidate(candidate, index));

  const topLevelResults = candidates.map((candidate, index) => ({
    id: index + 1,
    itemCount: candidate.itemCount,
    linkCount: candidate.linkCount,
    currentIndex: candidate.currentIndex,
    score: candidate.score,
    reasons: candidate.reasons,
    orientation: candidate.orientation,
    trailKind: candidate.trailKind,
    visibilityState: candidate.visibility.state,
    hiddenReason: candidate.visibility.reason,
    labels: candidate.labels,
    selectorHint: buildSelectorHint(candidate.container),
    rect: summarizeRect(candidate.rect),
    highlighted: candidate.highlightable && config.highlightVisible,
    container: candidate.container,
    items: candidate.items.map((item, itemIndex) => ({
      index: itemIndex + 1,
      text: item.text,
      isLink: item.isLink,
      isCurrent: isCurrentItem(item, itemIndex, candidate.items),
      element: item.element,
    })),
  }));

  topLevelResults.forEach((result) => {
    state.resultHandles.set(result.id, {
      type: 'document',
      reveal: () => revealCandidate(result),
    });
  });

  const results = [...topLevelResults, ...collectFrameResults(topLevelResults.length + 1)].slice(0, config.maxResults);

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
      return runBreadcrumbDetector({ ...overrides, ...nextOverrides });
    },
  };

  window.__breadcrumbDetector = api;
  window.runBreadcrumbDetector = runBreadcrumbDetector;

  console.group('Breadcrumb detector');
  console.table(results.map((result) => ({
    id: result.id,
    score: result.score,
    itemCount: result.itemCount,
    linkCount: result.linkCount,
    currentIndex: result.currentIndex >= 0 ? result.currentIndex + 1 : 'none',
    trailKind: result.trailKind,
    orientation: result.orientation,
    highlighted: result.highlighted,
    selectorHint: result.selectorHint,
    rect: `${result.rect.x},${result.rect.y},${result.rect.width}x${result.rect.height}`,
  })));

  results.forEach((result) => {
    console.group(`breadcrumb ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('reasons:', result.reasons);
    console.log('labels:', result.labels);
    console.log('items:', result.items);
    console.log('container:', result.container);
    console.groupEnd();
  });

  console.log('Cleanup with window.__breadcrumbDetector?.cleanup()');
  console.log('Inspect one result with window.__breadcrumbDetector?.inspect(1)');
  console.log('Reveal one result with window.__breadcrumbDetector?.reveal(1)');
  console.log('Rerun without visible overlays with window.__breadcrumbDetector?.rerun({ highlightVisible: false })');
  console.groupEnd();

  return api;
}

window.runBreadcrumbDetector = runBreadcrumbDetector;
