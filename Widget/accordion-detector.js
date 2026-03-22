function runAccordionDetector(overrides = {}) {
  const previous = window.__accordionDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minSections: 2,
    maxSections: 16,
    minScore: 28,
    maxResults: 24,
    overlayZIndex: 2147483646,
    palette: ['#ff5d5d', '#2ec4b6', '#ff9f1c', '#6c63ff', '#06d6a0', '#ef476f', '#118ab2', '#ffd166', '#8338ec', '#3a86ff'],
    ignoredTags: new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH']),
    highlightVisible: true,
    includeHidden: true,
  };

  const config = {
    ...BASE_CONFIG,
    maxResults: overrides.maxResults ?? BASE_CONFIG.maxResults,
    includeHidden: overrides.includeHidden ?? BASE_CONFIG.includeHidden,
    highlightVisible: overrides.highlightVisible ?? BASE_CONFIG.highlightVisible,
    scanFrames: overrides.scanFrames ?? true,
  };

  const state = {
    overlays: [],
    styleEl: null,
    results: [],
  };

  const average = (values) => {
    if (!values.length) {
      return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const unique = (items) => [...new Set(items.filter(Boolean))];

  const normalizeText = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim();

  const classTextFor = (el) => {
    if (!(el instanceof Element)) {
      return '';
    }
    return `${el.tagName} ${String(el.id || '')} ${String(el.className || '')}`;
  };

  const viewportSize = () => ({
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  });

  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };

  const hasAccordionName = (el) => /accordion|faq|collapse|collapsible|disclosure|expand|expander|toggle|drawer-section/i.test(classTextFor(el));

  const hasExcludedName = (el) => /nav|menu|menubar|tree|treeview|tab|tablist|carousel|slider|swiper|splide|glide|toolbar|breadcrumb/i.test(classTextFor(el));

  const hasDropdownLikeName = (el) => /dropdown|menu|menubar|navbar|navigation|nav|tooltip|popover|listbox|select/i.test(classTextFor(el));

  const isAccordionTriggerCandidate = (el) => {
    if (!(el instanceof Element)) return false;
    if (el.tagName === 'BUTTON' || el.tagName === 'SUMMARY') return true;
    if (el.tagName !== 'A') return false;

    const role = el.getAttribute('role');
    const href = el.getAttribute('href') || '';
    const controls = el.getAttribute('aria-controls');
    const expanded = el.getAttribute('aria-expanded');
    const dataToggle = `${el.getAttribute('data-bs-toggle') || ''} ${el.getAttribute('data-toggle') || ''}`;
    const classText = classTextFor(el);
    const ownerText = classTextFor(el.parentElement || el);

    return !!(
      controls ||
      expanded === 'true' ||
      expanded === 'false' ||
      role === 'button' ||
      /collapse|accordion|dropdown|toggle|disclosure/.test(dataToggle) ||
      ((href.startsWith('#') || href === '') && /accordion|collapse|collapsible|disclosure|toggle|drawer-section/i.test(`${classText} ${ownerText}`))
    );
  };

  const isHeading = (el) => (el instanceof Element) && (/^(H1|H2|H3|H4|H5|H6)$/.test(el.tagName) || el.getAttribute('role') === 'heading');

  const panelContentSelector = 'p, ul, ol, dl, form, fieldset, table, blockquote, article, section, div, img, figure, input, textarea, select';

  const getVisibilityInfo = (el) => {
    for (let current = el; current; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none') {
        return { state: 'hidden', reason: 'display-none-chain', visible: false };
      }
      if (style.visibility === 'hidden' || style.contentVisibility === 'hidden') {
        return { state: 'hidden', reason: 'visibility-hidden-chain', visible: false };
      }
      if (current.hasAttribute('hidden')) {
        return { state: 'collapsed', reason: 'hidden-attribute', visible: false };
      }
      if (current.tagName === 'DETAILS' && !current.hasAttribute('open') && current !== el) {
        return { state: 'collapsed', reason: 'closed-details', visible: false };
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
      return { state: 'hidden', reason: 'outside-viewport', visible: false };
    }

    if (Number(style.opacity) === 0 && style.pointerEvents === 'none') {
      return { state: 'hidden', reason: 'fully-transparent', visible: false };
    }

    return { state: 'visible', reason: null, visible: true };
  };

  const isStructurallyInteractive = (el) => {
    if (!(el instanceof Element)) return false;
    if (config.ignoredTags.has(el.tagName)) return false;
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'SUMMARY') return true;
    if (tag === 'A' && el.hasAttribute('href')) return true;
    if (el.hasAttribute('onclick')) return true;
    if (el.tabIndex >= 0 && !['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(tag)) return true;
    const style = window.getComputedStyle(el);
    return style.cursor === 'pointer';
  };

  const getDirectInteractiveChildren = (el) => {
    if (!(el instanceof Element)) {
      return [];
    }
    return [...el.children].filter((child) => isStructurallyInteractive(child));
  };

  const getPanelContentCount = (el) => {
    if (!(el instanceof Element)) {
      return 0;
    }
    return el.querySelectorAll(panelContentSelector).length;
  };

  const isLikelySectionTriggerWrapper = (el) => {
    if (!(el instanceof Element)) return false;
    if (el.tagName === 'DETAILS') return true;

    const directInteractive = getDirectInteractiveChildren(el);
    if (isHeading(el)) {
      return directInteractive.length === 1;
    }

    if (['LI', 'DT'].includes(el.tagName)) {
      return directInteractive.length === 1 && getPanelContentCount(el) === 0;
    }

    if (directInteractive.length !== 1) {
      return false;
    }

    const interactiveDescendantCount = el.querySelectorAll('a[href], button, summary, [onclick], [tabindex]').length;
    const text = normalizeText(el);
    return getPanelContentCount(el) === 0 && interactiveDescendantCount <= 2 && text.length > 0 && text.length <= 80;
  };

  const isPassiveAccordionHeader = (node) => {
    if (!(node instanceof Element)) return false;
    if (config.ignoredTags.has(node.tagName)) return false;

    const next = node.nextElementSibling;
    const parent = node.parentElement;
    if (!(next instanceof Element) || !(parent instanceof Element)) {
      return false;
    }

    if (hasDropdownLikeName(node) || hasDropdownLikeName(parent) || hasDropdownLikeName(next)) {
      return false;
    }

    const text = normalizeText(node);
    if (!text || text.length > 140) {
      return false;
    }

    const interactiveDescendantCount = node.querySelectorAll('a[href], button, summary, input, select, textarea').length;
    if (interactiveDescendantCount > 1) {
      return false;
    }

    const meaningfulChildCount = [...parent.children].filter((child) => !config.ignoredTags.has(child.tagName)).length;
    const classBundle = `${classTextFor(node)} ${classTextFor(parent)} ${classTextFor(next)}`;
    const headerNamed = /question|header|title|summary|trigger|toggle|label|heading/i.test(classBundle);
    const panelNamed = /answer|content|body|panel|details|section|region|description/i.test(classBundle);
    const accordionNamed = /accordion|faq|collapsible|collapse|disclosure|item/i.test(classBundle);
    const nextText = normalizeText(next);
    const nextLooksLikePanel = panelNamed || next.children.length >= 2 || nextText.length >= 24 || !!next.querySelector(panelContentSelector);

    return nextLooksLikePanel && meaningfulChildCount >= 2 && meaningfulChildCount <= 6 && (headerNamed || (accordionNamed && panelNamed));
  };

  const extractPrimaryTrigger = (node) => {
    if (!(node instanceof Element)) return null;
    if (config.ignoredTags.has(node.tagName)) return null;

    if (node.tagName === 'DETAILS') {
      return [...node.children].find((child) => child.tagName === 'SUMMARY') || null;
    }

    if (node.tagName === 'BUTTON' || node.tagName === 'SUMMARY') {
      return node;
    }

    if (node.tagName === 'A') {
      return isAccordionTriggerCandidate(node) ? node : null;
    }

    if (isHeading(node)) {
      const directInteractive = getDirectInteractiveChildren(node);
      if (directInteractive.length === 1 && isAccordionTriggerCandidate(directInteractive[0])) {
        return directInteractive[0];
      }
    }

    const directInteractive = getDirectInteractiveChildren(node);
    if (directInteractive.length === 1 && isAccordionTriggerCandidate(directInteractive[0])) {
      return directInteractive[0];
    }

    if (isPassiveAccordionHeader(node)) {
      return node;
    }

    if (hasAccordionName(node)) {
      const nestedButton = node.querySelector('button, summary');
      if (nestedButton) {
        return nestedButton;
      }
    }

    return null;
  };

  const isLikelyPanel = (el, trigger) => {
    if (!(el instanceof Element)) return false;
    if (config.ignoredTags.has(el.tagName)) return false;
    if (el === trigger) return false;
    if (isHeading(el)) return false;
    if (['LI', 'DT', 'A', 'BUTTON', 'SUMMARY', 'NAV', 'HEADER', 'FOOTER'].includes(el.tagName)) return false;
    if (isStructurallyInteractive(el)) return false;
    if (isLikelySectionTriggerWrapper(el)) return false;

    const classText = classTextFor(el);
    const style = window.getComputedStyle(el);
    const text = normalizeText(el);
    const childCount = el.children.length;
    const contentCount = getPanelContentCount(el);
    const linkCount = el.querySelectorAll('a[href]').length;
    const interactiveDescendantCount = el.querySelectorAll('a[href], button, summary, [onclick], [tabindex]').length;
    const hasPanelName = /accordion|panel|content|body|details|region|answer|collapse|drawer|section/i.test(classText);
    const hidden = el.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden';

    if (hasPanelName) return true;
    if (hidden) return true;
    if (contentCount >= 1) return true;
    if (text.length >= 24) return true;
    if (childCount >= 2 && !isStructurallyInteractive(el)) return true;
    if (linkCount >= 3 && interactiveDescendantCount > linkCount && /faq|accordion|answer|details/i.test(classTextFor(trigger.parentElement || trigger))) return true;

    return false;
  };

  const isValidPanelCandidate = (el, trigger) => isLikelyPanel(el, trigger) && !isLikelySectionTriggerWrapper(el);

  const getDetailsPanel = (detailsEl) => {
    if (!(detailsEl instanceof Element) || detailsEl.tagName !== 'DETAILS') return null;
    const panelChildren = [...detailsEl.children].filter((child) => child.tagName !== 'SUMMARY');
    if (panelChildren.length === 1) {
      return panelChildren[0];
    }
    return detailsEl;
  };

  const findPanelForTrigger = (trigger, ownerNode, container) => {
    const controlsId = trigger.getAttribute('aria-controls');
    if (controlsId) {
      const controlled = document.getElementById(controlsId);
      if (controlled instanceof Element) {
        return controlled;
      }
    }

    if (trigger.tagName === 'SUMMARY' && trigger.parentElement?.tagName === 'DETAILS') {
      return getDetailsPanel(trigger.parentElement);
    }

    if (isHeading(ownerNode) && ownerNode.nextElementSibling && isValidPanelCandidate(ownerNode.nextElementSibling, trigger)) {
      return ownerNode.nextElementSibling;
    }

    const siblings = [...ownerNode.children];
    const triggerIndex = siblings.indexOf(trigger);
    if (triggerIndex >= 0) {
      for (let index = triggerIndex + 1; index < siblings.length; index += 1) {
        if (isValidPanelCandidate(siblings[index], trigger)) {
          return siblings[index];
        }
      }
    }

    if (ownerNode.nextElementSibling && isValidPanelCandidate(ownerNode.nextElementSibling, trigger)) {
      return ownerNode.nextElementSibling;
    }

    if (ownerNode.parentElement && ownerNode.parentElement !== container) {
      const ownerSiblings = [...ownerNode.parentElement.children];
      const ownerIndex = ownerSiblings.indexOf(ownerNode);
      if (ownerIndex >= 0) {
        for (let index = ownerIndex + 1; index < ownerSiblings.length; index += 1) {
          if (isValidPanelCandidate(ownerSiblings[index], trigger)) {
            return ownerSiblings[index];
          }
        }
      }
    }

    return null;
  };

  const buildSequenceSections = (container) => {
    const children = [...container.children].filter((child) => !config.ignoredTags.has(child.tagName));
    const sections = [];

    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const trigger = extractPrimaryTrigger(child);
      if (!trigger) {
        continue;
      }

      const panel = findPanelForTrigger(trigger, child, container) || (children[index + 1] && isValidPanelCandidate(children[index + 1], trigger) ? children[index + 1] : null);
      if (!panel) {
        continue;
      }

      sections.push({
        wrapper: child,
        trigger,
        panel,
        pattern: child.tagName === 'DETAILS' ? 'details' : 'sequence',
      });
    }

    return sections;
  };

  const buildWrappedSections = (container) => {
    const sections = [];

    [...container.children].forEach((child) => {
      if (config.ignoredTags.has(child.tagName)) return;

      if (child.tagName === 'DETAILS') {
        const trigger = extractPrimaryTrigger(child);
        const panel = getDetailsPanel(child);
        if (trigger && panel) {
          sections.push({ wrapper: child, trigger, panel, pattern: 'details' });
        }
        return;
      }

      const directChildren = [...child.children].filter((node) => !config.ignoredTags.has(node.tagName));
      for (const directChild of directChildren) {
        const trigger = extractPrimaryTrigger(directChild);
        if (!trigger) continue;
        const panel = findPanelForTrigger(trigger, directChild, child);
        if (!panel) continue;
        sections.push({ wrapper: child, trigger, panel, pattern: 'wrapped' });
        break;
      }
    });

    return sections;
  };

  const dedupeSections = (sections) => {
    const seen = new Set();
    const uniqueSections = [];

    sections.forEach((section) => {
      const key = `${section.trigger.tagName}:${section.trigger.id || normalizeText(section.trigger)}:${section.panel.id || normalizeText(section.panel).slice(0, 48)}`;
      if (seen.has(key)) return;
      seen.add(key);
      uniqueSections.push(section);
    });

    return uniqueSections;
  };

  const splitContiguousSectionRuns = (container, sections) => {
    if (!(container instanceof Element) || sections.length <= 1) {
      return [sections];
    }

    const childIndexes = new Map([...container.children].map((child, index) => [child, index]));
    const getSectionBoundaryIndexes = (section) => {
      const wrapperIndex = childIndexes.get(section.wrapper);

      if (typeof wrapperIndex !== 'number') {
        return { startIndex: null, endIndex: null };
      }

      if (section.wrapper === section.panel || section.wrapper.contains(section.panel)) {
        return { startIndex: wrapperIndex, endIndex: wrapperIndex };
      }

      const panelIndex = childIndexes.get(section.panel);
      if (typeof panelIndex !== 'number') {
        return { startIndex: wrapperIndex, endIndex: wrapperIndex };
      }

      return {
        startIndex: Math.min(wrapperIndex, panelIndex),
        endIndex: Math.max(wrapperIndex, panelIndex),
      };
    };

    const runs = [];
    let currentRun = [];
    let previousEndIndex = -1;

    sections.forEach((section) => {
      const { startIndex, endIndex } = getSectionBoundaryIndexes(section);

      if (typeof startIndex !== 'number' || typeof endIndex !== 'number') {
        if (currentRun.length) {
          runs.push(currentRun);
          currentRun = [];
        }
        runs.push([section]);
        previousEndIndex = -1;
        return;
      }

      if (!currentRun.length || startIndex <= previousEndIndex + 1) {
        currentRun.push(section);
      } else {
        runs.push(currentRun);
        currentRun = [section];
      }

      previousEndIndex = endIndex;
    });

    if (currentRun.length) {
      runs.push(currentRun);
    }

    return runs;
  };

  const isDirectSiblingSectionPair = (section) => {
    if (!section?.wrapper || !section?.panel) {
      return false;
    }

    if (section.wrapper.nextElementSibling === section.panel) {
      return true;
    }

    const triggerParent = section.trigger?.parentElement;
    return !!(triggerParent && triggerParent.nextElementSibling === section.panel);
  };

  const isStrongSingleSectionPattern = (container, section) => {
    if (!(container instanceof Element) || !section) {
      return false;
    }

    const trigger = section.trigger;
    const panel = section.panel;
    if (!(trigger instanceof Element) || !(panel instanceof Element)) {
      return false;
    }

    if (!isDirectSiblingSectionPair(section)) {
      return false;
    }

    const pairClassText = `${classTextFor(container)} ${classTextFor(section.wrapper)} ${classTextFor(trigger)} ${classTextFor(panel)}`;
    if (/dropdown|menu|menubar|navbar|tooltip|popover|listbox|select|combobox/i.test(pairClassText)) {
      return false;
    }

    if (!['BUTTON', 'SUMMARY', 'A'].includes(trigger.tagName)) {
      return false;
    }

    const panelVisibility = getVisibilityInfo(panel);
    const panelText = normalizeText(panel);
    const panelContentCount = getPanelContentCount(panel);
    const triggerStyle = window.getComputedStyle(trigger);
    const parent = section.wrapper.parentElement;
    const localChildCount = parent instanceof Element
      ? [...parent.children].filter((child) => !config.ignoredTags.has(child.tagName)).length
      : 0;
    const contentLike = panelContentCount > 0 || panelText.length >= 12 || !!panel.querySelector('a[href], ul, ol, dl, p, img, figure, article, section, div');
    const hiddenLike = !panelVisibility.visible || panel.hasAttribute('hidden') || /\bhide\b|\bshow\b|collapse|collapsible|content|panel|drawer|details|answer|animate/i.test(pairClassText);
    const blockLikeTrigger = triggerStyle.display.includes('block') || /\bblock\b|\bleft-align\b|\bbutton\b|\bbtn\b|\bpadding-\d+\b/i.test(classTextFor(trigger));
    const isolatedPair = localChildCount > 0 && localChildCount <= 4;
    const anchorDisclosure = trigger.tagName === 'A' && /button|btn|toggle|accordion|collapse/i.test(pairClassText);

    if (hasDropdownLikeName(panel) || hasDropdownLikeName(trigger) || hasDropdownLikeName(section.wrapper)) {
      return false;
    }

    return contentLike && hiddenLike && (blockLikeTrigger || anchorDisclosure) && (isolatedPair || hasAccordionName(container) || hasAccordionName(trigger) || hasAccordionName(panel) || trigger.tagName !== 'A');
  };

  const scoreSectionRun = (run) => {
    if (!run.length) {
      return -Infinity;
    }

    const hiddenPanels = run.filter((section) => !getVisibilityInfo(section.panel).visible).length;
    const descriptiveLabels = run.filter((section) => /[A-Za-z]/.test(normalizeText(section.trigger))).length;
    const numericLabels = run.filter((section) => /^\d+%?$/.test(normalizeText(section.trigger))).length;
    const contentPanels = run.filter((section) => {
      const text = normalizeText(section.panel);
      return text.length >= 20 || section.panel.querySelector(panelContentSelector);
    }).length;
    const nestedTriggerPanels = run.filter((section) => {
      return run.some((other) => other !== section && section.panel.contains(other.trigger));
    }).length;

    return (
      run.length * 10 +
      hiddenPanels * 6 +
      descriptiveLabels * 4 +
      contentPanels * 3 -
      numericLabels * 8 -
      nestedTriggerPanels * 12
    );
  };

  const chooseBestSectionRun = (container, sections) => {
    const runs = splitContiguousSectionRuns(container, sections)
      .filter((run) => run.length >= config.minSections)
      .sort((left, right) => scoreSectionRun(right) - scoreSectionRun(left) || right.length - left.length);

    if (!runs.length) {
      return sections;
    }

    return runs[0];
  };

  const getCandidateRuns = (container, sections) => {
    if (!sections.length) {
      return [];
    }

    const splitRuns = splitContiguousSectionRuns(container, sections);
    const multiRuns = splitRuns.filter((run) => run.length >= config.minSections && run.length <= config.maxSections);
    const singleRuns = splitRuns.filter((run) => run.length === 1 && isStrongSingleSectionPattern(container, run[0]));

    const runs = (multiRuns.length
      ? [...multiRuns, ...singleRuns]
      : [
          ...(sections.length >= config.minSections && sections.length <= config.maxSections ? [chooseBestSectionRun(container, sections)] : []),
          ...singleRuns,
        ])
      .sort((left, right) => scoreSectionRun(right) - scoreSectionRun(left) || right.length - left.length);

    if (runs.length) {
      return runs;
    }

    if (sections.length >= config.minSections && sections.length <= config.maxSections) {
      return [chooseBestSectionRun(container, sections)];
    }

    return [];
  };

  const normalizeClassSignature = (el) => {
    if (!(el instanceof Element)) {
      return '';
    }

    const ignoredTokens = new Set(['active', 'collapsed', 'collapse', 'show', 'open', 'closed', 'hidden']);
    const tokens = [...el.classList]
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => !ignoredTokens.has(token.toLowerCase()))
      .sort();

    return `${el.tagName}:${tokens.join('.')}`;
  };

  const dominantRatio = (items) => {
    if (!items.length) {
      return 0;
    }

    const counts = new Map();
    items.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
    const maxCount = Math.max(...counts.values(), 0);
    return maxCount / items.length;
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

  const inferOrientation = (triggers) => {
    if (triggers.length < 2) return 'unknown';
    const rects = triggers.map((trigger) => trigger.getBoundingClientRect());
    const topDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.top - rects[index].top));
    const leftDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.left - rects[index].left));
    const avgTopDelta = average(topDeltas);
    const avgLeftDelta = average(leftDeltas);

    if (avgLeftDelta < 24 && avgTopDelta > 18) return 'vertical';
    if (avgTopDelta < 12 && avgLeftDelta > 24) return 'horizontal';
    return 'mixed';
  };

  const summarizeRect = (rect) => ({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });

  const mergeRects = (rects) => {
    const validRects = rects.filter((rect) => rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 1 && rect.height > 1);
    if (!validRects.length) {
      return null;
    }

    const left = Math.min(...validRects.map((rect) => rect.left));
    const top = Math.min(...validRects.map((rect) => rect.top));
    const right = Math.max(...validRects.map((rect) => rect.right));
    const bottom = Math.max(...validRects.map((rect) => rect.bottom));

    return {
      x: left,
      y: top,
      left,
      top,
      right,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  };

  const getDirectChildWithin = (ancestor, node) => {
    if (!(ancestor instanceof Element) || !(node instanceof Element) || !ancestor.contains(node)) {
      return null;
    }

    let current = node;
    while (current && current.parentElement && current.parentElement !== ancestor) {
      current = current.parentElement;
    }

    return current?.parentElement === ancestor ? current : null;
  };

  const getRunHighlightGeometry = (container, sections) => {
    const childIndexes = new Map([...container.children].map((child, index) => [child, index]));
    const touchedChildren = unique(sections.flatMap((section) => {
      return [section.wrapper, section.panel]
        .map((node) => getDirectChildWithin(container, node))
        .filter((node) => node instanceof Element && !config.ignoredTags.has(node.tagName));
    }))
      .sort((left, right) => (childIndexes.get(left) || 0) - (childIndexes.get(right) || 0));

    const rectSources = touchedChildren.length ? touchedChildren : [container];
    const highlightRect = mergeRects(rectSources.map((node) => node.getBoundingClientRect())) || container.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const totalChildCount = [...container.children].filter((child) => !config.ignoredTags.has(child.tagName)).length;
    const touchedRatio = touchedChildren.length / Math.max(1, totalChildCount);
    const containerArea = Math.max(1, containerRect.width * containerRect.height);
    const highlightArea = Math.max(1, highlightRect.width * highlightRect.height);
    const areaRatio = highlightArea / containerArea;
    const useContainer = hasAccordionName(container) || touchedRatio >= 0.7 || areaRatio >= 0.72 || totalChildCount <= Math.max(4, touchedChildren.length + 1);

    return {
      highlightElement: useContainer ? container : null,
      highlightRect: useContainer ? containerRect : highlightRect,
      highlightMode: useContainer ? 'container' : 'range',
    };
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

  const addStyles = () => {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .__accordion-detector-container {
        outline: 3px solid var(--accordion-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 8px !important;
      }
      .__accordion-detector-item {
        box-shadow: inset 0 0 0 2px var(--accordion-detector-color) !important;
        border-radius: 6px !important;
      }
      .__accordion-detector-outline {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        border: 3px solid var(--accordion-detector-color);
        border-radius: 8px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
      }
      .__accordion-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--accordion-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .__accordion-detector-flash {
        animation: __accordion-detector-flash 1.2s ease-out 1;
      }
      @keyframes __accordion-detector-flash {
        0% { box-shadow: 0 0 0 0 rgba(255, 159, 28, 0.7); }
        100% { box-shadow: 0 0 0 18px transparent; }
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
  };

  const createOverlayBox = (rect, color, className) => {
    const overlay = document.createElement('div');
    overlay.className = className;
    overlay.style.setProperty('--accordion-detector-color', color);
    overlay.style.left = `${window.scrollX + rect.left}px`;
    overlay.style.top = `${window.scrollY + rect.top}px`;
    overlay.style.width = `${Math.max(0, rect.width)}px`;
    overlay.style.height = `${Math.max(0, rect.height)}px`;
    document.body.appendChild(overlay);
    state.overlays.push(overlay);
    return overlay;
  };

  const translateFrameRect = (frameEl, innerRect) => {
    const frameRect = frameEl.getBoundingClientRect();
    const left = frameRect.left + (innerRect?.x ?? innerRect?.left ?? 0);
    const top = frameRect.top + (innerRect?.y ?? innerRect?.top ?? 0);
    const width = innerRect?.width ?? Math.max(0, (innerRect?.right ?? left) - (innerRect?.left ?? left));
    const height = innerRect?.height ?? Math.max(0, (innerRect?.bottom ?? top) - (innerRect?.top ?? top));

    return {
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    };
  };

  const rectArea = (rect) => Math.max(0, (rect?.width || 0) * (rect?.height || 0));

  const rectContains = (outerRect, innerRect) => {
    if (!outerRect || !innerRect) {
      return false;
    }

    return outerRect.left <= innerRect.left && outerRect.top <= innerRect.top && outerRect.right >= innerRect.right && outerRect.bottom >= innerRect.bottom;
  };

  const rectOverlapRatio = (leftRect, rightRect) => {
    if (!leftRect || !rightRect) {
      return 0;
    }

    const overlapLeft = Math.max(leftRect.left, rightRect.left);
    const overlapTop = Math.max(leftRect.top, rightRect.top);
    const overlapRight = Math.min(leftRect.right, rightRect.right);
    const overlapBottom = Math.min(leftRect.bottom, rightRect.bottom);
    const overlapWidth = Math.max(0, overlapRight - overlapLeft);
    const overlapHeight = Math.max(0, overlapBottom - overlapTop);
    const overlapArea = overlapWidth * overlapHeight;
    const minArea = Math.max(1, Math.min(rectArea(leftRect), rectArea(rightRect)));

    return overlapArea / minArea;
  };

  const dedupeFrameResults = (results) => {
    const accepted = [];

    const sorted = [...results].sort((left, right) => right.score - left.score || rectArea(left.highlightRect) - rectArea(right.highlightRect));
    for (const result of sorted) {
      const duplicate = accepted.some((existing) => {
        if (existing.__frameElement !== result.__frameElement) {
          return false;
        }

        const nested = rectContains(existing.highlightRect, result.highlightRect) || rectContains(result.highlightRect, existing.highlightRect);
        if (!nested) {
          return false;
        }

        if (rectOverlapRatio(existing.highlightRect, result.highlightRect) < 0.75) {
          return false;
        }

        return existing.score >= result.score - 8;
      });

      if (!duplicate) {
        accepted.push(result);
      }
    }

    return accepted;
  };

  const buildFrameSelectorHint = (frameEl, innerSelectorHint) => {
    const frameHint = buildSelectorHint(frameEl);
    return innerSelectorHint ? `${frameHint} :: ${innerSelectorHint}` : frameHint;
  };

  const collectFrameResults = (limit) => {
    if (!config.scanFrames || limit <= 0) {
      return [];
    }

    const frameResults = [];
    const detectorSource = `window.runAccordionDetector = ${runAccordionDetector.toString()};`;

    for (const frameEl of document.querySelectorAll('iframe')) {
      if (frameResults.length >= limit) {
        break;
      }

      try {
        const frameWindow = frameEl.contentWindow;
        const frameDocument = frameEl.contentDocument;
        if (!frameWindow || !frameDocument?.documentElement) {
          continue;
        }

        if (frameWindow.location?.href === window.location.href) {
          continue;
        }

        if (typeof frameWindow.runAccordionDetector !== 'function') {
          frameWindow.eval(detectorSource);
        }

        const frameApi = frameWindow.runAccordionDetector({
          maxResults: limit - frameResults.length,
          includeHidden: config.includeHidden,
          highlightVisible: false,
          scanFrames: false,
        });

        for (const result of frameApi.results) {
          if (frameResults.length >= limit) {
            break;
          }

          const translatedRect = translateFrameRect(frameEl, result.rect);
          if (translatedRect.width < 8 || translatedRect.height < 8) {
            continue;
          }

          frameResults.push({
            type: result.type,
            orientation: result.orientation,
            visibilityState: result.visibilityState,
            hiddenReason: result.hiddenReason,
            score: result.score,
            reasons: [...result.reasons, 'same-origin-iframe-example'],
            sectionCount: result.sectionCount,
            expandedCount: result.expandedCount,
            collapsedCount: result.collapsedCount,
            labels: result.labels,
            selectorHint: buildFrameSelectorHint(frameEl, result.selectorHint),
            rect: summarizeRect(translatedRect),
            highlightRect: translatedRect,
            highlighted: config.highlightVisible,
            container: frameEl,
            targetElement: null,
            sections: result.sections,
            __frameElement: frameEl,
          });
        }
      } catch {
        continue;
      }
    }

    return dedupeFrameResults(frameResults).slice(0, limit);
  };

  const paintFrameResult = (result, index) => {
    if (!config.highlightVisible) {
      return;
    }

    const color = config.palette[index % config.palette.length];
    createOverlayBox(result.highlightRect || result.rect, color, '__accordion-detector-outline');

    const badge = document.createElement('div');
    badge.className = '__accordion-detector-badge';
    badge.style.setProperty('--accordion-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + (result.highlightRect?.left ?? result.rect.x))}px`;
    badge.style.top = `${Math.max(4, window.scrollY + (result.highlightRect?.top ?? result.rect.y) - 24)}px`;
    badge.textContent = `accordion ${index + 1} | ${result.type} | ${result.sectionCount} sections | ${result.expandedCount} open | score ${result.score}`;
    document.body.appendChild(badge);
    state.overlays.push(badge);
  };

  const cleanup = () => {
    document.querySelectorAll('.__accordion-detector-container').forEach((el) => {
      el.classList.remove('__accordion-detector-container');
      el.style.removeProperty('--accordion-detector-color');
      delete el.dataset.accordionDetectorId;
    });

    document.querySelectorAll('.__accordion-detector-item').forEach((el) => {
      el.classList.remove('__accordion-detector-item');
      el.style.removeProperty('--accordion-detector-color');
      delete el.dataset.accordionDetectorGroup;
    });

    state.overlays.forEach((el) => el.remove());
    state.overlays = [];

    if (state.styleEl) {
      state.styleEl.remove();
      state.styleEl = null;
    }
  };

  const getSectionState = (section) => {
    if (section.trigger.getAttribute('aria-expanded') === 'false') {
      return 'collapsed';
    }
    if (section.trigger.getAttribute('aria-expanded') === 'true') {
      return 'expanded';
    }
    if (section.trigger.tagName === 'SUMMARY' && section.trigger.parentElement?.tagName === 'DETAILS') {
      return section.trigger.parentElement.hasAttribute('open') ? 'expanded' : 'collapsed';
    }
    const visibility = getVisibilityInfo(section.panel);
    if (visibility.visible || visibility.reason === 'outside-viewport') {
      return 'expanded';
    }
    return 'collapsed';
  };

  const inferType = (container, sections, hiddenPanelCount, detailsCount) => {
    if (detailsCount === sections.length) {
      return 'details-accordion';
    }
    if (/faq|question|answer/i.test(classTextFor(container))) {
      return 'faq-accordion';
    }
    if (hiddenPanelCount === sections.length) {
      return 'collapsed-accordion';
    }
    return 'accordion';
  };

  const paintCandidate = (candidate, index) => {
    if (!candidate.highlightable || !config.highlightVisible) {
      return;
    }

    const color = config.palette[index % config.palette.length];
    if (candidate.highlightElement instanceof Element) {
      candidate.highlightElement.classList.add('__accordion-detector-container');
      candidate.highlightElement.style.setProperty('--accordion-detector-color', color);
      candidate.highlightElement.dataset.accordionDetectorId = String(index + 1);
    } else {
      createOverlayBox(candidate.rect, color, '__accordion-detector-outline');
    }

    candidate.visibleTriggers.forEach((trigger) => {
      trigger.classList.add('__accordion-detector-item');
      trigger.style.setProperty('--accordion-detector-color', color);
      trigger.dataset.accordionDetectorGroup = String(index + 1);
    });

    candidate.visiblePanels.forEach((panel) => {
      panel.classList.add('__accordion-detector-item');
      panel.style.setProperty('--accordion-detector-color', color);
      panel.dataset.accordionDetectorGroup = String(index + 1);
    });

    const badge = document.createElement('div');
    badge.className = '__accordion-detector-badge';
    badge.style.setProperty('--accordion-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + candidate.rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + candidate.rect.top - 24)}px`;
    badge.textContent = `accordion ${index + 1} | ${candidate.type} | ${candidate.sectionCount} sections | ${candidate.expandedCount} open | score ${candidate.score}`;
    document.body.appendChild(badge);
    state.overlays.push(badge);
  };

  const revealCandidate = (result) => {
    if (!result) return;

    const rect = result.highlightRect || result.targetElement?.getBoundingClientRect() || result.container?.getBoundingClientRect();
    if (!rect) return;

    const top = window.scrollY + rect.top - Math.max(24, (window.innerHeight - rect.height) / 3);
    window.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth',
    });

    if (result.targetElement instanceof Element) {
      result.targetElement.classList.add('__accordion-detector-flash');
      window.setTimeout(() => {
        result.targetElement.classList.remove('__accordion-detector-flash');
      }, 1400);
    }

    console.group(`Reveal accordion ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('result:', result);
    console.log('container:', result.container);
    console.groupEnd();
  };

  const scoreSectionCandidate = (container, sections, runCount) => {
    if (!(container instanceof Element)) return null;
    if (config.ignoredTags.has(container.tagName)) return null;
    if (container === document.body || container === document.documentElement) return null;
    if (hasExcludedName(container) && !hasAccordionName(container)) return null;
    if (container.matches('[role="tablist"], [role="menu"], [role="tree"], nav')) return null;

    const singleSectionPattern = sections.length === 1 && isStrongSingleSectionPattern(container, sections[0]);
    if ((sections.length < config.minSections && !singleSectionPattern) || sections.length > config.maxSections) {
      return null;
    }

    const triggers = sections.map((section) => section.trigger);
    const panels = sections.map((section) => section.panel);
    const visibleTriggers = triggers.filter((trigger) => getVisibilityInfo(trigger).visible);
    const visiblePanels = panels.filter((panel) => getVisibilityInfo(panel).visible);
    const hiddenPanels = panels.filter((panel) => !getVisibilityInfo(panel).visible);
    const orientation = inferOrientation(visibleTriggers.length >= 2 ? visibleTriggers : triggers);
    if (orientation === 'horizontal') {
      return null;
    }

    const triggerLabels = triggers.map(normalizeText).filter(Boolean);
    const uniqueLabels = unique(triggerLabels).slice(0, 20);
    const uniqueLabelRatio = uniqueLabels.length / Math.max(1, sections.length);
    const headingWrappedCount = sections.filter((section) => isHeading(section.trigger.parentElement || section.wrapper) || isHeading(section.wrapper)).length;
    const nextSiblingPairCount = sections.filter((section) => section.wrapper.nextElementSibling === section.panel || section.trigger.parentElement?.nextElementSibling === section.panel).length;
    const ariaPairCount = sections.filter((section) => section.trigger.hasAttribute('aria-controls') || section.panel.getAttribute('aria-labelledby')).length;
    const detailsCount = sections.filter((section) => section.pattern === 'details').length;
    const explicitTriggerCount = sections.filter((section) => {
      const trigger = section.trigger;
      return trigger.tagName === 'BUTTON'
        || trigger.tagName === 'SUMMARY'
        || trigger.hasAttribute('aria-expanded')
        || trigger.hasAttribute('aria-controls')
        || isStructurallyInteractive(trigger);
    }).length;
    const reusedTriggerRowPanels = sections.filter((section) => sections.some((other) => other !== section && (other.wrapper === section.panel || other.trigger === section.panel))).length;
    const panelContentCount = panels.filter((panel) => {
      return panel.querySelector(panelContentSelector) || normalizeText(panel).length >= 24;
    }).length;
    const codeLikePanels = panels.filter((panel) => {
      const classText = classTextFor(panel);
      const text = normalizeText(panel);
      return (
        panel.matches('pre, code') ||
        panel.querySelector('pre, code') ||
        /example|highlight|code|snippet|tryit/i.test(classText) ||
        /^example\b|^try it yourself\b/i.test(text)
      );
    }).length;
    const navHeavyPanels = panels.filter((panel) => {
      const links = panel.querySelectorAll('a[href]').length;
      const formFields = panel.querySelectorAll('input, textarea, select').length;
      const textLength = normalizeText(panel).length;
      return links >= 3 && formFields === 0 && textLength < 140;
    }).length;
    const expandedCount = sections.filter((section) => getSectionState(section) === 'expanded').length;
    const collapsedCount = sections.length - expandedCount;
    const highlightGeometry = getRunHighlightGeometry(container, sections);
    const rect = highlightGeometry.highlightRect;
    const containerRect = container.getBoundingClientRect();
    const viewport = viewportSize();
    const triggerWidths = triggers.map((trigger) => trigger.getBoundingClientRect().width);
    const avgTriggerWidth = average(triggerWidths);
    const headingWrappedRatio = headingWrappedCount / Math.max(1, sections.length);
    const panelContentRatio = panelContentCount / Math.max(1, sections.length);
    const codeLikePanelRatio = codeLikePanels / Math.max(1, sections.length);
    const navHeavyRatio = navHeavyPanels / Math.max(1, sections.length);
    const triggerSignatureRatio = dominantRatio(triggers.map((trigger) => normalizeClassSignature(trigger)));
    const panelSignatureRatio = dominantRatio(panels.map((panel) => normalizeClassSignature(panel)));
    const rootClassText = classTextFor(container);
    const insideNav = !!container.closest('nav, header');

    if (singleSectionPattern && insideNav && !hasAccordionName(container)) {
      return null;
    }

    if (insideNav && navHeavyRatio >= 0.4 && !hasAccordionName(container)) {
      return null;
    }

    if (uniqueLabelRatio < 0.6 && !hasAccordionName(container) && detailsCount === 0) {
      return null;
    }

    if (
      sections.length >= 4 &&
      triggerSignatureRatio < 0.5 &&
      panelSignatureRatio < 0.5 &&
      !hasAccordionName(container) &&
      detailsCount === 0
    ) {
      return null;
    }

    if (codeLikePanelRatio >= 0.3 && !hasAccordionName(container) && detailsCount === 0) {
      return null;
    }

    if (explicitTriggerCount === 0 && ariaPairCount === 0 && detailsCount === 0 && !hasAccordionName(container)) {
      return null;
    }

    let score = 0;
    const reasons = [];

    score += Math.min(24, sections.length * 6);
    reasons.push('repeated-header-panel-pairs');

    if (hasAccordionName(container)) {
      score += 18;
      reasons.push('accordion-like-class-or-id');
    }
    if (orientation === 'vertical' || orientation === 'mixed') {
      score += 14;
      reasons.push('stacked-vertical-triggers');
    }
    if (headingWrappedRatio >= 0.5) {
      score += 12;
      reasons.push('heading-wrapped-triggers');
    }
    if (nextSiblingPairCount >= Math.max(1, Math.floor(sections.length * 0.5))) {
      score += 10;
      reasons.push('adjacent-header-panel-pairs');
    }
    if (ariaPairCount > 0) {
      score += Math.min(10, ariaPairCount * 3);
      reasons.push('header-panel-relationship-signals');
    }
    if (detailsCount > 0) {
      score += Math.min(12, detailsCount * 4);
      reasons.push('details-summary-pattern');
    }
    if (collapsedCount > 0) {
      score += 12;
      reasons.push('collapsed-panels');
    }
    if (expandedCount > 0 && collapsedCount > 0) {
      score += 8;
      reasons.push('mixed-open-and-closed-sections');
    }
    if (panelContentRatio >= 0.7) {
      score += 12;
      reasons.push('content-bearing-panels');
    }
    if (avgTriggerWidth >= containerRect.width * 0.65) {
      score += 6;
      reasons.push('full-width-section-triggers');
    }
    if (containerRect.width <= viewport.width * 0.95 && containerRect.height <= viewport.height * 1.4) {
      score += 4;
      reasons.push('bounded-section-group');
    }
    if (singleSectionPattern) {
      score += 20;
      reasons.push('single-direct-toggle-pair');
    }
    if (runCount > 1) {
      score += 6;
      reasons.push('multiple-local-section-runs');
    }

    if (reusedTriggerRowPanels > 0) {
      score -= Math.min(40, reusedTriggerRowPanels * 20);
      reasons.push('panels-overlap-trigger-rows');
    }
    if (insideNav) {
      score -= 18;
      reasons.push('inside-navigation-region');
    }
    if (/menu|menubar|tree|tablist|tab-panel|carousel|slider/.test(rootClassText.toLowerCase())) {
      score -= 24;
      reasons.push('excluded-widget-name');
    }
    if (navHeavyRatio >= 0.5) {
      score -= 20;
      reasons.push('navigation-heavy-panels');
    }
    if (triggerSignatureRatio >= 0.7) {
      score += 8;
      reasons.push('uniform-trigger-signature');
    }
    if (panelSignatureRatio >= 0.7) {
      score += 6;
      reasons.push('uniform-panel-signature');
    }
    if (codeLikePanelRatio >= 0.25) {
      score -= 18;
      reasons.push('code-example-panels');
    }
    if (uniqueLabels.length <= 1) {
      score -= 20;
      reasons.push('non-distinct-section-labels');
    }
    if (visibleTriggers.length < config.minSections && !config.includeHidden) {
      score -= 12;
      reasons.push('insufficient-visible-triggers');
    }
    if (triggerLabels.some((label) => label.split(/\s+/).length > 10)) {
      score -= 10;
      reasons.push('text-heavy-triggers');
    }

    if (score < config.minScore) {
      return null;
    }

    const type = inferType(container, sections, hiddenPanels.length, detailsCount);
    const containerVisibility = getVisibilityInfo(container);
    const highlightable = containerVisibility.visible && visibleTriggers.length >= config.minSections;

    return {
      container,
      sections,
      visibleTriggers,
      visiblePanels,
      hiddenPanels,
      sectionCount: sections.length,
      expandedCount,
      collapsedCount,
      score,
      reasons,
      orientation,
      type,
      rect,
      depth: getDepth(container),
      labels: uniqueLabels,
      visibility: containerVisibility,
      highlightable,
      highlightElement: highlightGeometry.highlightElement,
      highlightMode: highlightGeometry.highlightMode,
    };
  };

  const scoreContainer = (container) => {
    if (!(container instanceof Element)) return [];

    const sequenceSections = buildSequenceSections(container);
    const wrappedSections = buildWrappedSections(container);
    const candidateSections = dedupeSections(sequenceSections.length >= wrappedSections.length ? sequenceSections : wrappedSections);
    const runs = getCandidateRuns(container, candidateSections);

    return runs
      .map((sections) => scoreSectionCandidate(container, sections, runs.length))
      .filter(Boolean);
  };

  const gatherCandidates = () => {
    return [...document.querySelectorAll('body *')]
      .filter((el) => !config.ignoredTags.has(el.tagName))
      .flatMap((el) => scoreContainer(el))
      .sort((a, b) => b.score - a.score || a.depth - b.depth);
  };

  const dedupeCandidates = (candidates) => {
    const accepted = [];

    for (const candidate of candidates) {
      const duplicate = accepted.some((existing) => {
        const nested = existing.container.contains(candidate.container) || candidate.container.contains(existing.container);
        if (!nested) return false;

        const overlapCount = candidate.sections.filter((section) => {
          return existing.sections.some((other) => other.trigger === section.trigger || other.panel === section.panel);
        }).length;
        const overlapRatio = overlapCount / Math.max(1, Math.min(candidate.sections.length, existing.sections.length));
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

  addStyles();

  const candidates = dedupeCandidates(gatherCandidates()).slice(0, config.maxResults);
  candidates.forEach((candidate, index) => paintCandidate(candidate, index));

  const topResults = candidates.map((candidate) => ({
    type: candidate.type,
    orientation: candidate.orientation,
    visibilityState: candidate.visibility.state,
    hiddenReason: candidate.visibility.reason,
    score: candidate.score,
    reasons: candidate.reasons,
    sectionCount: candidate.sectionCount,
    expandedCount: candidate.expandedCount,
    collapsedCount: candidate.collapsedCount,
    labels: candidate.labels,
    selectorHint: buildSelectorHint(candidate.highlightElement || candidate.container),
    rect: summarizeRect(candidate.rect),
    highlighted: candidate.highlightable && config.highlightVisible,
    container: candidate.container,
    targetElement: candidate.highlightElement || null,
    highlightRect: candidate.rect,
    sections: candidate.sections.map((section) => ({
      trigger: section.trigger,
      panel: section.panel,
      label: normalizeText(section.trigger),
      state: getSectionState(section),
      pattern: section.pattern,
    })),
  }));

  const frameResults = collectFrameResults(Math.max(0, config.maxResults - topResults.length));
  frameResults.forEach((result, index) => paintFrameResult(result, topResults.length + index));

  const results = [...topResults, ...frameResults]
    .slice(0, config.maxResults)
    .map((result, index) => ({
      ...result,
      id: index + 1,
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
      return runAccordionDetector({ ...overrides, ...nextOverrides });
    },
  };

  window.__accordionDetector = api;
  window.runAccordionDetector = runAccordionDetector;

  console.group('Accordion detector');
  console.table(results.map((result) => ({
    id: result.id,
    type: result.type,
    visibilityState: result.visibilityState,
    score: result.score,
    sectionCount: result.sectionCount,
    expandedCount: result.expandedCount,
    collapsedCount: result.collapsedCount,
    highlighted: result.highlighted,
    selectorHint: result.selectorHint,
    rect: `${result.rect.x},${result.rect.y},${result.rect.width}x${result.rect.height}`,
  })));

  results.forEach((result) => {
    console.group(`accordion ${result.id}: ${result.type}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('visibilityState:', result.visibilityState, result.hiddenReason);
    console.log('reasons:', result.reasons);
    console.log('labels:', result.labels);
    console.log('container:', result.container);
    console.log('sections:', result.sections);
    console.groupEnd();
  });

  console.log('Cleanup with window.__accordionDetector?.cleanup()');
  console.log('Inspect one result with window.__accordionDetector?.inspect(1)');
  console.log('Reveal one result with window.__accordionDetector?.reveal(1)');
  console.log('Rerun without visible overlays with window.__accordionDetector?.rerun({ highlightVisible: false })');
  console.groupEnd();

  return api;
}

window.runAccordionDetector = runAccordionDetector;
