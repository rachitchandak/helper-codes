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

  const extractPrimaryTrigger = (node) => {
    if (!(node instanceof Element)) return null;
    if (config.ignoredTags.has(node.tagName)) return null;

    if (node.tagName === 'DETAILS') {
      return [...node.children].find((child) => child.tagName === 'SUMMARY') || null;
    }

    if (node.tagName === 'BUTTON' || node.tagName === 'SUMMARY') {
      return node;
    }

    if (isHeading(node)) {
      const directInteractive = getDirectInteractiveChildren(node);
      if (directInteractive.length === 1) {
        return directInteractive[0];
      }
    }

    const directInteractive = getDirectInteractiveChildren(node);
    if (directInteractive.length === 1) {
      return directInteractive[0];
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

    if (ownerNode.nextElementSibling && isValidPanelCandidate(ownerNode.nextElementSibling, trigger)) {
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
    return getVisibilityInfo(section.panel).visible ? 'expanded' : 'collapsed';
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
    candidate.container.classList.add('__accordion-detector-container');
    candidate.container.style.setProperty('--accordion-detector-color', color);
    candidate.container.dataset.accordionDetectorId = String(index + 1);

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

    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__accordion-detector-badge';
    badge.style.setProperty('--accordion-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    badge.textContent = `accordion ${index + 1} | ${candidate.type} | ${candidate.sectionCount} sections | ${candidate.expandedCount} open | score ${candidate.score}`;
    document.body.appendChild(badge);
    state.overlays.push(badge);
  };

  const revealCandidate = (result) => {
    if (!result) return;

    const container = result.container;
    if (!(container instanceof Element)) return;

    const rect = container.getBoundingClientRect();
    const top = window.scrollY + rect.top - Math.max(24, (window.innerHeight - rect.height) / 3);
    window.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth',
    });

    container.classList.add('__accordion-detector-flash');
    window.setTimeout(() => {
      container.classList.remove('__accordion-detector-flash');
    }, 1400);

    console.group(`Reveal accordion ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('result:', result);
    console.log('container:', result.container);
    console.groupEnd();
  };

  const scoreContainer = (container) => {
    if (!(container instanceof Element)) return null;
    if (config.ignoredTags.has(container.tagName)) return null;
    if (container === document.body || container === document.documentElement) return null;
    if (hasExcludedName(container) && !hasAccordionName(container)) return null;
    if (container.matches('[role="tablist"], [role="menu"], [role="tree"], nav')) return null;

    const sequenceSections = buildSequenceSections(container);
    const wrappedSections = buildWrappedSections(container);
    const sections = dedupeSections(sequenceSections.length >= wrappedSections.length ? sequenceSections : wrappedSections);
    if (sections.length < config.minSections || sections.length > config.maxSections) {
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
    const headingWrappedCount = sections.filter((section) => isHeading(section.trigger.parentElement || section.wrapper) || isHeading(section.wrapper)).length;
    const nextSiblingPairCount = sections.filter((section) => section.wrapper.nextElementSibling === section.panel || section.trigger.parentElement?.nextElementSibling === section.panel).length;
    const ariaPairCount = sections.filter((section) => section.trigger.hasAttribute('aria-controls') || section.panel.getAttribute('aria-labelledby')).length;
    const detailsCount = sections.filter((section) => section.pattern === 'details').length;
    const reusedTriggerRowPanels = sections.filter((section) => sections.some((other) => other !== section && (other.wrapper === section.panel || other.trigger === section.panel))).length;
    const panelContentCount = panels.filter((panel) => {
      return panel.querySelector(panelContentSelector) || normalizeText(panel).length >= 24;
    }).length;
    const navHeavyPanels = panels.filter((panel) => {
      const links = panel.querySelectorAll('a[href]').length;
      const formFields = panel.querySelectorAll('input, textarea, select').length;
      const textLength = normalizeText(panel).length;
      return links >= 3 && formFields === 0 && textLength < 140;
    }).length;
    const expandedCount = sections.filter((section) => getSectionState(section) === 'expanded').length;
    const collapsedCount = sections.length - expandedCount;
    const rect = container.getBoundingClientRect();
    const viewport = viewportSize();
    const triggerWidths = triggers.map((trigger) => trigger.getBoundingClientRect().width);
    const avgTriggerWidth = average(triggerWidths);
    const headingWrappedRatio = headingWrappedCount / Math.max(1, sections.length);
    const panelContentRatio = panelContentCount / Math.max(1, sections.length);
    const navHeavyRatio = navHeavyPanels / Math.max(1, sections.length);
    const rootClassText = classTextFor(container);
    const insideNav = !!container.closest('nav, header');

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
    if (avgTriggerWidth >= rect.width * 0.65) {
      score += 6;
      reasons.push('full-width-section-triggers');
    }
    if (rect.width <= viewport.width * 0.95 && rect.height <= viewport.height * 1.4) {
      score += 4;
      reasons.push('bounded-section-group');
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
    };
  };

  const gatherCandidates = () => {
    return [...document.querySelectorAll('body *')]
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

  const results = candidates.map((candidate, index) => ({
    id: index + 1,
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
    selectorHint: buildSelectorHint(candidate.container),
    rect: summarizeRect(candidate.rect),
    highlighted: candidate.highlightable && config.highlightVisible,
    container: candidate.container,
    sections: candidate.sections.map((section) => ({
      trigger: section.trigger,
      panel: section.panel,
      label: normalizeText(section.trigger),
      state: getSectionState(section),
      pattern: section.pattern,
    })),
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