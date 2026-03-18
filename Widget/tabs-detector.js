function runTabsDetector(overrides = {}) {
  const previous = window.__tabsDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minScore: 28,
    minTabs: 2,
    maxTabs: 12,
    maxResults: 40,
    overlayZIndex: 2147483646,
    palette: ['#6a4c93', '#1982c4', '#ff9f1c', '#2a9d8f', '#ef476f', '#8338ec', '#ff595e', '#3a86ff'],
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
  const previousHeadingText = (el) => {
    const trail = getHeadingTrail(el, 1);
    return trail[0]?.text || '';
  };
  const getHeadingTrail = (el, limit = 64) => {
    const trail = [];
    let current = el || null;
    while (current && trail.length < limit) {
      let sibling = current.previousElementSibling;
      while (sibling && trail.length < limit) {
        if (/^H[1-6]$/.test(sibling.tagName)) {
          trail.push({ tagName: sibling.tagName, text: normalizeText(sibling) });
        } else {
          const nestedHeading = sibling.querySelector?.('h1, h2, h3, h4, h5, h6');
          if (nestedHeading) {
            trail.push({ tagName: nestedHeading.tagName, text: normalizeText(nestedHeading) });
          }
        }
        sibling = sibling.previousElementSibling;
      }
      current = current.parentElement;
    }
    return trail;
  };

  const getDirectElementChildren = (el) => [...el.children].filter((child) => !config.ignoredTags.has(child.tagName));
  const hasActiveState = (el) => /(active|selected|current|is-active|is-selected|open)/i.test(classTextFor(el)) || el.getAttribute('aria-selected') === 'true';
  const hasTabItemName = (el) => {
    if (!(el instanceof Element)) return false;
    const classes = [...el.classList];
    if (classes.some((name) => /(^tab$|^tab-|^tab_|tab-item|tab-link|tab-trigger|tab-button|tab-btn$|^pill$|^pill-|^segment$|^segment-)/i.test(name))) {
      return true;
    }
    const id = String(el.id || '');
    return /(^tab$|^tab-|^tab_|tab-item|tab-link|tab-trigger|tab-button|tab-btn$)/i.test(id);
  };
  const hasPanelName = (el) => el instanceof Element && /panel|pane|tab-content|tab-panel|tabpanel|content-area|content-section/i.test(classTextFor(el));
  const getPanelReference = (value) => {
    const ref = String(value || '').trim().replace(/^#/, '');
    if (!ref) return null;
    return document.getElementById(ref);
  };
  const hasTabName = (el) => /tab|tabs|tablist|tab-panel|tabpanel|tab-content|tab-pane|nav-tabs|pill|pills|nav-pills/i.test(classTextFor(el));
  const hasExcludedName = (el) => /menu|menubar|breadcrumb|carousel|slider|accordion|tooltip|feed|progress|pagination|pager/i.test(classTextFor(el));
  const isTabTrigger = (el) => {
    if (!(el instanceof Element)) return false;
    if (el.matches('[role="tab"]')) return true;
    const text = normalizeText(el);
    if (!text || text.length > 40) return false;
    if (el.matches('button, a, [role="button"]')) {
      return /tab|nav-link|pill/i.test(classTextFor(el)) || !!el.getAttribute('aria-controls') || (el.matches('a[href^="#"]') && text.split(/\s+/).length <= 5);
    }
    if (!el.matches('div, li, label, span')) return false;
    if (el.matches('li')) return false;
    if (hasTabItemName(el)) return true;
    if (el.getAttribute('aria-controls') || el.dataset.tab || el.dataset.panel || el.dataset.target || el.dataset.view || el.dataset.section) return true;
    const parentLooksTabular = hasTabName(el.parentElement) || hasTabItemName(el.parentElement) || el.parentElement?.getAttribute('role') === 'tablist';
    return parentLooksTabular && (hasActiveState(el) || window.getComputedStyle(el).cursor === 'pointer') && text.split(/\s+/).length <= 5;
  };
  const isPanelLike = (el) => el instanceof Element && (el.matches('[role="tabpanel"]') || hasPanelName(el));

  const resolvePanelForTab = (tab) => {
    const controls = tab.getAttribute('aria-controls');
    if (controls) {
      const target = getPanelReference(controls);
      if (target) return target;
    }
    if (tab.matches('a[href^="#"]')) {
      const target = getPanelReference(tab.getAttribute('href'));
      if (target) return target;
    }
    const dataTarget = tab.dataset.panel || tab.dataset.tab || tab.dataset.target || tab.dataset.view || tab.dataset.section;
    if (dataTarget) {
      const target = getPanelReference(dataTarget);
      if (target) return target;
    }
    const onclick = String(tab.getAttribute('onclick') || '');
    const onclickTarget = onclick.match(/['"]([^'"]+)['"]/);
    if (onclickTarget) {
      const target = getPanelReference(onclickTarget[1]);
      if (target) return target;
    }
    return null;
  };

  const extractStructure = (root) => {
    let tablist = root;
    let tabs = root.matches('[role="tablist"]') ? [...root.querySelectorAll(':scope > [role="tab"], :scope > * > [role="tab"]')] : [];
    if (!tabs.length) {
      tabs = getDirectElementChildren(root).filter((child) => isTabTrigger(child));
    }
    if (!tabs.length) {
      const wrappedTabs = getDirectElementChildren(root)
        .map((child) => getDirectElementChildren(child).find((grandChild) => isTabTrigger(grandChild)))
        .filter(Boolean);
      if (wrappedTabs.length >= config.minTabs) {
        tabs = wrappedTabs;
      }
    }
    if (!tabs.length) {
      const listChild = getDirectElementChildren(root).find((child) => getDirectElementChildren(child).filter((grandChild) => isTabTrigger(grandChild)).length >= config.minTabs);
      if (listChild) {
        tablist = listChild;
        tabs = getDirectElementChildren(listChild).filter((child) => isTabTrigger(child));
      }
    }
    if (tabs.length < config.minTabs || tabs.length > config.maxTabs) return null;

    const panels = unique(tabs.map((tab) => resolvePanelForTab(tab)).filter(Boolean));
    if (!panels.length) {
      const nearbyPanels = unique([
        ...root.querySelectorAll('[role="tabpanel"], [class*="tab-panel"], [class*="tab-pane"], [class*="tab-content"], [class*="content-area"], [class*="content-section"], [class~="panel"], [class*=" panel"], [class^="panel"], [class$="panel"]'),
        ...root.parentElement?.querySelectorAll?.('[role="tabpanel"], [class*="tab-panel"], [class*="tab-pane"], [class*="tab-content"], [class*="content-area"], [class*="content-section"], [class~="panel"], [class*=" panel"], [class^="panel"], [class$="panel"]') || [],
      ]).filter((panel) => panel !== tablist && isPanelLike(panel));
      if (nearbyPanels.length) panels.push(...nearbyPanels.slice(0, tabs.length));
    }

    return { tablist, tabs, panels: unique(panels) };
  };

  const inferOrientation = (tabs) => {
    if (tabs.length < 2) return 'unknown';
    const rects = tabs.map((tab) => tab.getBoundingClientRect());
    const topDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.top - rects[index].top));
    const leftDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.left - rects[index].left));
    const avgTopDelta = average(topDeltas);
    const avgLeftDelta = average(leftDeltas);
    if (avgTopDelta < 16 && avgLeftDelta > 20) return 'horizontal';
    if (avgLeftDelta < 16 && avgTopDelta > 20) return 'vertical';
    return 'mixed';
  };

  const scoreRoot = (root) => {
    if (!(root instanceof Element)) return null;
    if (config.ignoredTags.has(root.tagName)) return null;
    if (root === document.body || root === document.documentElement) return null;
    if (root.matches('nav[aria-label*="breadcrumb" i], [role="menu"], [role="menubar"]')) return null;
    if (hasExcludedName(root) && !hasTabName(root) && !root.matches('[role="tablist"]')) return null;

    const structure = extractStructure(root);
    if (!structure) return null;

    const { tablist, tabs, panels } = structure;
    const activeTabs = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true' || /active|selected|current|is-active/i.test(classTextFor(tab)) || hasActiveState(tab.parentElement));
    const visiblePanels = panels.filter((panel) => getVisibilityInfo(panel).visible);
    const hiddenPanels = panels.filter((panel) => !getVisibilityInfo(panel).visible);
    const shortLabels = tabs.filter((tab) => {
      const text = normalizeText(tab);
      return text.length > 0 && text.length <= 24 && text.split(/\s+/).length <= 4;
    }).length;
    const navigationalLinks = tabs.filter((tab) => {
      if (!tab.matches('a[href]')) return false;
      const href = String(tab.getAttribute('href') || '').trim();
      if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return false;
      return true;
    }).length;
    const orientation = inferOrientation(tabs);
    const rect = tablist.getBoundingClientRect();
    const visibility = getVisibilityInfo(tablist);
    const roleTablist = tablist.getAttribute('role') === 'tablist';
    const roleTabs = tabs.filter((tab) => tab.getAttribute('role') === 'tab').length;
    const supportsStandaloneTablist = roleTablist && roleTabs >= Math.max(config.minTabs, tabs.length - 1);
    const toggleIntentTabs = tabs.filter((tab) => /(tab|pill)/i.test(tab.getAttribute('data-toggle') || '')).length;
    const supportsStandaloneNav = !roleTablist && tabs.length >= config.minTabs && (hasTabName(root) || toggleIntentTabs >= Math.max(1, tabs.length - 1)) && (activeTabs.length >= 1 || tabs.some((tab) => hasActiveState(tab.parentElement)));

    if (navigationalLinks >= tabs.length && roleTabs === 0) return null;
    if (!panels.length && !supportsStandaloneTablist && !supportsStandaloneNav) return null;

    let score = 0;
    const reasons = [];

    if (roleTablist) {
      score += 26;
      reasons.push('tablist-role');
    }
    if (roleTabs >= Math.max(1, tabs.length - 1)) {
      score += 18;
      reasons.push('tab-role-children');
    }
    if (hasTabName(root) || hasTabName(tablist)) {
      score += 14;
      reasons.push('tab-like-name');
    }
    if (panels.length >= 1) {
      score += 18;
      reasons.push('associated-panels');
    } else if (supportsStandaloneTablist) {
      score += 12;
      reasons.push('standalone-tablist');
    } else if (supportsStandaloneNav) {
      score += 10;
      reasons.push('standalone-nav-tabs');
    }
    if (activeTabs.length >= 1 || visiblePanels.length === 1) {
      score += 10;
      reasons.push('single-active-state');
    }
    if (hiddenPanels.length >= 1) {
      score += 8;
      reasons.push('hidden-inactive-panels');
    }
    if (shortLabels >= Math.max(2, tabs.length - 1)) {
      score += 6;
      reasons.push('short-tab-labels');
    }
    if (orientation === 'horizontal' || orientation === 'vertical') {
      score += 6;
      reasons.push(`${orientation}-tab-row`);
    }

    if (orientation === 'mixed') {
      score -= 10;
      reasons.push('mixed-trigger-layout');
    }
    if (visiblePanels.length === 0 && activeTabs.length === 0) {
      score -= 10;
      reasons.push('missing-active-panel');
    }

    if (score < config.minScore) return null;

    return {
      container: tablist,
      score,
      reasons,
      rect,
      depth: getDepth(tablist),
      visibility,
      highlightable: visibility.visible,
      orientation,
      tabs,
      panels,
      activeCount: Math.max(activeTabs.length, visiblePanels.length),
    };
  };

  const scanFrameTabSignals = (frameDoc) => ({
    roleTablists: frameDoc.querySelectorAll('[role="tablist"]').length,
    roleTabs: frameDoc.querySelectorAll('[role="tab"]').length,
    tabNamed: frameDoc.querySelectorAll('[class*="tabs" i], [class*="tablist" i], [class*="tab-menu" i], [class*="nav-tabs" i], [class*="tab-group" i], [id*="tabs" i]').length,
    tabPanels: frameDoc.querySelectorAll('[role="tabpanel"], [class*="tab-panel" i], [class*="tab-pane" i], [class*="tab-content" i]').length,
    genericTabRows: frameDoc.querySelectorAll('[class*="tab-bar" i], [class*="tabbar" i], [class*="tabs" i], [class*="segmented" i], [class*="pill" i]').length,
    genericTabs: [...frameDoc.querySelectorAll('[class~="tab" i], [class*="tab-" i], [class^="tab" i], [class$="tab" i]')].filter((el) => !isPanelLike(el) && normalizeText(el).length > 0 && normalizeText(el).length <= 40).length,
    genericPanels: frameDoc.querySelectorAll('[class~="panel" i], [class*=" panel" i], [class^="panel" i], [class$="panel" i], [class*="content-area" i], [class*="content-section" i]').length,
    genericNavRows: [...frameDoc.querySelectorAll('nav, div, ul, ol')].filter((container) => {
      const items = [...container.children].map((child) => {
        if (child.matches?.('a, button')) return child;
        return [...child.children].find((grandChild) => grandChild.matches?.('a, button')) || null;
      }).filter(Boolean);
      if (items.length < config.minTabs || items.length > config.maxTabs) return false;
      const labels = items.map((item) => normalizeText(item));
      if (labels.some((label) => !label || label.length > 32 || label.split(/\s+/).length > 4)) return false;
      const rects = items.map((item) => item.getBoundingClientRect());
      const topValues = rects.map((rect) => rect.top);
      const leftValues = rects.map((rect) => rect.left);
      const horizontal = Math.max(...topValues) - Math.min(...topValues) < 18 && Math.max(...leftValues) - Math.min(...leftValues) > 40;
      if (!horizontal) return false;
      const containerRect = container.getBoundingClientRect();
      if (containerRect.width < 80 || containerRect.height < 20) return false;
      return true;
    }).length,
  });

  const scoreIframe = (frameEl) => {
    if (!(frameEl instanceof HTMLIFrameElement)) return null;

    const rect = frameEl.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return null;

    const visibility = getVisibilityInfo(frameEl);
    const title = String(frameEl.title || '');
    const src = String(frameEl.getAttribute('src') || '');
    const heading = previousHeadingText(frameEl);
    const headingTrail = getHeadingTrail(frameEl, 64);
    const tabSectionHeading = headingTrail.find((entry) => /^H[12]$/.test(entry.tagName) && /\btab(s| bar)?\b/i.test(entry.text))?.text || '';
    const embeddedDemo = /codepen\.io\/.*\/embed\//i.test(src) || /CodePen Embed/i.test(title) || /cp_embed_iframe/i.test(frameEl.className);

    let frameDoc = null;
    try {
      frameDoc = frameEl.contentDocument;
    } catch {
      frameDoc = null;
    }

    let score = 0;
    const reasons = [];
    let tabCount = 0;
    let panelCount = 0;

    if (frameDoc?.documentElement) {
      const signals = scanFrameTabSignals(frameDoc);
      tabCount = Math.max(signals.roleTabs, signals.genericTabs, signals.tabNamed);
      panelCount = Math.max(signals.tabPanels, signals.genericPanels);

      if (signals.roleTablists > 0) {
        score += 26;
        reasons.push('iframe-tablist-role');
      }
      if (signals.roleTabs >= 2) {
        score += 18;
        reasons.push('iframe-tab-role-children');
      }
      if (signals.tabNamed >= 1) {
        score += 14;
        reasons.push('iframe-tab-like-name');
      }
      if (signals.genericTabRows >= 1 && signals.genericTabs >= config.minTabs) {
        score += 18;
        reasons.push('iframe-generic-tab-row');
      }
      if (signals.genericNavRows >= 1) {
        score += 12;
        reasons.push('iframe-generic-nav-row');
      }
      if (signals.tabPanels >= 1) {
        score += 18;
        reasons.push('iframe-associated-panels');
      } else if (signals.genericPanels >= 1 && signals.genericTabs >= config.minTabs) {
        score += 14;
        reasons.push('iframe-generic-panels');
      }
    }

    if (embeddedDemo) {
      score += 8;
      reasons.push('embedded-demo-iframe');
    }
    if (/\btab(s)?\b/i.test(heading)) {
      score += 18;
      reasons.push('nearby-tab-heading');
    }
    if (tabSectionHeading) {
      score += 18;
      reasons.push('tab-section-heading');
    }
    if (visibility.visible) {
      score += 4;
      reasons.push('visible-tabs');
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
      tabs: [],
      panels: [],
      tabCount: Math.max(config.minTabs, tabCount || 2),
      panelCount: Math.max(1, panelCount || 1),
      activeCount: 0,
      isIframeCandidate: true,
    };
  };

  const gatherCandidates = () => {
    const candidates = unique([
      ...document.querySelectorAll('[role="tablist"], ul.tab, ol.tab, [class~="tab"], [class*="tabs"], [class*="tablist"], [class*="tab-menu"], [class*="tab-bar"], [class*="tabbar"], [class*="nav-tabs"], [class*="tab-group"], [class*="segmented"], [class*="pill"], [id*="tabs"]'),
    ]);
    const iframeCandidates = [...document.querySelectorAll('iframe')].map((el) => scoreIframe(el)).filter(Boolean);
    return [...candidates.map((el) => scoreRoot(el)).filter(Boolean), ...iframeCandidates].sort((a, b) => b.score - a.score || a.depth - b.depth);
  };

  const dedupeCandidates = (candidates) => {
    const accepted = [];
    for (const candidate of candidates) {
      const duplicate = accepted.some((existing) => {
        if (candidate.isIframeCandidate || existing.isIframeCandidate) return existing.container === candidate.container;
        const nested = existing.container.contains(candidate.container) || candidate.container.contains(existing.container);
        if (!nested) return false;
        const overlap = candidate.tabs.filter((tab) => existing.tabs.includes(tab)).length;
        if (overlap / Math.max(1, Math.min(candidate.tabs.length, existing.tabs.length)) < 0.7) return false;
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
      .__tabs-detector-container {
        outline: 3px solid var(--tabs-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 10px !important;
      }
      .__tabs-detector-item {
        box-shadow: inset 0 0 0 2px var(--tabs-detector-color) !important;
        border-radius: 8px !important;
      }
      .__tabs-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--tabs-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
  };

  const cleanup = () => {
    document.querySelectorAll('.__tabs-detector-container').forEach((el) => {
      el.classList.remove('__tabs-detector-container');
      el.style.removeProperty('--tabs-detector-color');
    });
    document.querySelectorAll('.__tabs-detector-item').forEach((el) => {
      el.classList.remove('__tabs-detector-item');
      el.style.removeProperty('--tabs-detector-color');
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
    candidate.container.classList.add('__tabs-detector-container');
    candidate.container.style.setProperty('--tabs-detector-color', color);
    if (!candidate.isIframeCandidate) {
      candidate.tabs.forEach((tab) => {
        tab.classList.add('__tabs-detector-item');
        tab.style.setProperty('--tabs-detector-color', color);
      });
    }
    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__tabs-detector-badge';
    badge.style.setProperty('--tabs-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    const tabCount = candidate.isIframeCandidate ? candidate.tabCount : candidate.tabs.length;
    const source = candidate.isIframeCandidate ? 'iframe' : `${tabCount} tabs`;
    badge.textContent = `tabs ${index + 1} | ${source} | score ${candidate.score}`;
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
    tabCount: candidate.isIframeCandidate ? candidate.tabCount : candidate.tabs.length,
    panelCount: candidate.isIframeCandidate ? candidate.panelCount : candidate.panels.length,
    activeCount: candidate.activeCount,
    orientation: candidate.orientation,
    labels: candidate.isIframeCandidate ? [previousHeadingText(candidate.container)].filter(Boolean) : candidate.tabs.map((tab) => normalizeText(tab)),
    visibilityState: candidate.visibility.state,
    hiddenReason: candidate.visibility.reason,
    selectorHint: buildSelectorHint(candidate.container),
    rect: summarizeRect(candidate.rect),
    highlighted: candidate.highlightable && config.highlightVisible,
    container: candidate.container,
    isIframeCandidate: !!candidate.isIframeCandidate,
  }));

  state.results = results;
  const api = {
    results,
    cleanup,
    inspect(id) { return results.find((result) => result.id === id); },
    reveal(id) { return results.find((entry) => entry.id === id); },
    rerun(nextOverrides = {}) { return runTabsDetector({ ...overrides, ...nextOverrides }); },
  };

  window.__tabsDetector = api;
  window.runTabsDetector = runTabsDetector;

  console.group('Tabs detector');
  console.table(results.map((result) => ({
    id: result.id,
    score: result.score,
    tabs: result.tabCount,
    panels: result.panelCount,
    active: result.activeCount,
    orientation: result.orientation,
    selectorHint: result.selectorHint,
  })));
  console.groupEnd();

  return api;
}

window.runTabsDetector = runTabsDetector;
