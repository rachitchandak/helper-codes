function runTreeViewDetector(overrides = {}) {
  const previous = window.__treeViewDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minScore: 30,
    minItems: 2,
    maxItems: 160,
    maxResults: 24,
    overlayZIndex: 2147483646,
    palette: ['#0f766e', '#2563eb', '#ea580c', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#9333ea'],
    ignoredTags: new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH']),
    highlightVisible: true,
    scanFrames: true,
  };

  const config = {
    ...BASE_CONFIG,
    maxResults: overrides.maxResults ?? BASE_CONFIG.maxResults,
    highlightVisible: overrides.highlightVisible ?? BASE_CONFIG.highlightVisible,
    scanFrames: overrides.scanFrames ?? BASE_CONFIG.scanFrames,
  };

  const state = {
    overlays: [],
    styleEl: null,
    results: [],
  };

  const TREE_NAME_RE = /tree|treeview|tree-view|file-tree|file explorer|explorer|knowledge|navigator|hierarchy|course-tree|project-tree|directory|taxonomy/i;
  const TREE_CONTEXT_RE = /tree|file explorer|navigator|knowledge|hierarchy|category|learning path|project/i;
  const EXCLUDED_NAME_RE = /menu|menubar|breadcrumb|carousel|slider|tooltip|dialog|modal|feed|progress|tablist|tabs|timeline|toast|snackbar|table|grid|calendar/i;
  const ORG_CHART_RE = /org|organization|organizational|chart|employee-card|employee|reports|legend|zoom-controls/i;
  const ROOT_SELECTOR = [
    '[role="tree"]',
    '[class~="tree-view"]',
    '[class*="tree-view"]',
    '[class~="file-tree"]',
    '[class*="file-tree"]',
    '[class~="course-tree"]',
    '[class*="course-tree"]',
    '[class~="project-tree"]',
    '[class*="project-tree"]',
    '[class~="tree-container"]',
    '[class*="tree-container"]',
    '[class~="categories"]',
    '[class*="categories"]',
    '[id*="tree" i]',
    'ul',
    'ol',
  ].join(', ');
  const HEADER_SELECTOR = [
    '[role="treeitem"]',
    '.tree-content',
    '.tree-toggle',
    '.tree-header',
    '.tree-node-content',
    '.category-header',
    '.course-header',
    '.module-header',
    '.node-content',
    '.device-item',
    '.lesson-item',
    '.subcategory',
    '.tree-label',
    '.node-text',
    '.category-title',
    '.subcategory-title',
    '.course-title',
    '.module-title',
    '.lesson-title',
    '.node-name',
    '.item-name',
  ].join(', ');

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
  const hasTreeName = (el) => TREE_NAME_RE.test(classTextFor(el));
  const hasExcludedName = (el) => EXCLUDED_NAME_RE.test(classTextFor(el));
  const hasOrgChartName = (el) => ORG_CHART_RE.test(classTextFor(el));
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

  const isItemContainer = (el) => {
    if (!isElementNode(el)) return false;
    if (config.ignoredTags.has(el.tagName)) return false;
    if (el.getAttribute('role') === 'treeitem') return true;
    if (el.tagName === 'LI') return true;
    return /tree-item|tree-node|course-item|module-item|lesson-item|category|subcategory|device-item/i.test(classTextFor(el));
  };

  const isHeaderLike = (el) => {
    if (!isElementNode(el)) return false;
    if (config.ignoredTags.has(el.tagName)) return false;
    if (el.matches?.(HEADER_SELECTOR)) return true;
    if (el.getAttribute('role') === 'treeitem') return true;
    if (el.matches?.('button, summary, [role="button"]')) return true;
    return /tree-content|tree-toggle|tree-header|category-header|course-header|module-header|node-content|device-item|lesson-item|toggle|header/i.test(classTextFor(el));
  };

  const hasToggleAffordance = (el) => {
    if (!isElementNode(el)) return false;
    if (el.hasAttribute('aria-expanded')) return true;
    if (el.querySelector?.('.expand-icon, .toggle-icon, .tree-chevron, .category-arrow, .node-toggle, .accordion-icon, [class*="chevron" i], [class*="toggle" i], [class*="expand" i]')) return true;
    return /expand|collapse|toggle|chevron|arrow|open|expanded/i.test(classTextFor(el));
  };

  const isBranchContainer = (el) => {
    if (!isElementNode(el)) return false;
    if (config.ignoredTags.has(el.tagName)) return false;
    if (el.matches?.('[role="group"]')) return true;
    if (el.tagName === 'UL' || el.tagName === 'OL') return true;
    const classText = classTextFor(el);
    if (!/tree-children|nested|subcategories|module-list|lesson-list|tree-node-children|children|tree-content/i.test(classText)) return false;
    const descendantNodes = el.querySelectorAll('li, .tree-node, .tree-item, .course-item, .module-item, .lesson-item, .category, .subcategory, .device-item, [role="treeitem"]').length;
    return descendantNodes >= 1;
  };

  const resolveInnerRoot = (root) => {
    const directChildren = getDirectElementChildren(root);
    const directItems = directChildren.filter((child) => isItemContainer(child));
    if (directItems.length >= config.minItems) return root;

    const structuralChild = directChildren.find((child) => {
      if (!isElementNode(child)) return false;
      if (child.tagName === 'UL' || child.tagName === 'OL') return child.querySelector('ul, ol, .tree-node, .tree-item, .course-item, .category, .device-item');
      return child.matches?.('[role="tree"], [class*="tree-view" i], [class*="file-tree" i], [class*="course-tree" i], [class*="project-tree" i], [class*="tree-container" i], [class*="categories" i]');
    });

    return structuralChild || root;
  };

  const findTopLevelItems = (root) => {
    if (!isElementNode(root)) return [];

    if (root.getAttribute('role') === 'tree') {
      const roleChildren = unique([
        ...root.querySelectorAll(':scope > [role="treeitem"]'),
        ...root.querySelectorAll(':scope > [role="group"] > [role="treeitem"]'),
      ]);
      if (roleChildren.length) return roleChildren;
    }

    if (root.tagName === 'UL' || root.tagName === 'OL') {
      return getDirectElementChildren(root).filter((child) => child.tagName === 'LI');
    }

    const directItems = getDirectElementChildren(root).filter((child) => isItemContainer(child));
    if (directItems.length) return directItems;

    const directList = getDirectElementChildren(root).find((child) => (child.tagName === 'UL' || child.tagName === 'OL') && getDirectElementChildren(child).filter((grandChild) => grandChild.tagName === 'LI').length >= config.minItems);
    if (directList) return getDirectElementChildren(directList).filter((child) => child.tagName === 'LI');

    return [];
  };

  const findPrimaryLabel = (item) => {
    if (!isElementNode(item)) return null;
    const directHeader = getDirectElementChildren(item).find((child) => isHeaderLike(child));
    if (directHeader) return directHeader;
    if (isHeaderLike(item)) return item;
    const descendant = item.querySelector?.(HEADER_SELECTOR);
    if (descendant) return descendant;
    return item;
  };

  const getLabelText = (item) => {
    const labelEl = findPrimaryLabel(item);
    const text = normalizeText(labelEl);
    return { element: labelEl, text };
  };

  const isDecoratedTreeLabel = (item, labelEl) => {
    if (!isElementNode(item) || !isElementNode(labelEl)) return false;
    if (labelEl !== item) return true;
    if (hasToggleAffordance(item) || hasToggleAffordance(labelEl)) return true;
    if (item.querySelector?.('svg, img, [class*="icon" i], [class*="badge" i], .expand-icon, .toggle-icon, .tree-chevron, .category-arrow, .accordion-icon, .node-toggle')) return true;
    return /tree-|category-|course-|module-|lesson-|node-|item-name|treecontent|treeheader/i.test(classTextFor(labelEl).replace(/\s+/g, '').toLowerCase());
  };

  const itemHasBranch = (item) => {
    if (!isElementNode(item)) return false;
    if (item.hasAttribute('aria-expanded')) return true;
    if (getDirectElementChildren(item).some((child) => isBranchContainer(child))) return true;
    if ((item.tagName === 'LI' || isItemContainer(item)) && item.querySelector?.(':scope > ul, :scope > ol, :scope > .tree-children, :scope > .nested, :scope > .subcategories, :scope > .module-list, :scope > .lesson-list, :scope > .tree-node-children, :scope > .children, :scope > .tree-content')) {
      return true;
    }
    const header = findPrimaryLabel(item);
    if (header?.nextElementSibling && isBranchContainer(header.nextElementSibling)) return true;
    return hasToggleAffordance(item) || hasToggleAffordance(header);
  };

  const getItemDepth = (item, root) => {
    let depth = 0;
    for (let current = item.parentElement; current && current !== root; current = current.parentElement) {
      if (isItemContainer(current) || isBranchContainer(current)) depth += 1;
    }
    return depth;
  };

  const inferOrientation = (labelElements) => {
    if (labelElements.length < 2) return 'unknown';
    const rects = labelElements.map((label) => label.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
    if (rects.length < 2) return 'unknown';
    const topDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.top - rects[index].top));
    const leftDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.left - rects[index].left));
    const avgTopDelta = average(topDeltas);
    const avgLeftDelta = average(leftDeltas);
    if (avgLeftDelta < 20 && avgTopDelta > 24) return 'vertical';
    if (avgTopDelta < 20 && avgLeftDelta > 24) return 'horizontal';
    return 'mixed';
  };

  const extractStructure = (root) => {
    const effectiveRoot = resolveInnerRoot(root);
    const topItems = findTopLevelItems(effectiveRoot);
    if (topItems.length < config.minItems) return null;

    let allItems = [];
    if (effectiveRoot.getAttribute('role') === 'tree') {
      allItems = unique([...effectiveRoot.querySelectorAll('[role="treeitem"]')]);
    } else if (effectiveRoot.tagName === 'UL' || effectiveRoot.tagName === 'OL') {
      allItems = unique([...effectiveRoot.querySelectorAll('li')]);
    } else {
      allItems = unique([
        ...effectiveRoot.querySelectorAll('.tree-node, .tree-item, .course-item, .module-item, .lesson-item, .category, .subcategory, .device-item, [role="treeitem"]'),
        ...topItems,
      ]);
    }

    const branchContainers = unique([
      ...effectiveRoot.querySelectorAll('ul, ol, [role="group"], .tree-children, .nested, .subcategories, .module-list, .lesson-list, .tree-node-children, .children, .tree-content'),
    ].filter((el) => isBranchContainer(el)));

    const labelEntries = allItems.map((item) => getLabelText(item)).filter((entry) => entry.text);
    const topLabelEntries = topItems.map((item) => getLabelText(item)).filter((entry) => entry.text);
    const topLabelElements = topLabelEntries.map((entry) => entry.element).filter(Boolean);
    const shortLabels = labelEntries.filter((entry) => entry.text.length > 0 && entry.text.length <= 60 && entry.text.split(/\s+/).length <= 8).length;
    const proseLikeTopLabels = topLabelEntries.filter((entry) => entry.text.length >= 90 || wordCountOf(entry.text) >= 14).length;
    const decoratedTopItems = topItems.filter((item, index) => isDecoratedTreeLabel(item, topLabelEntries[index]?.element || null)).length;
    const branchingItems = allItems.filter((item) => itemHasBranch(item));
    const activeItems = allItems.filter((item) => item.matches?.('.active, .current, .selected, .open, .expanded, [aria-selected="true"], [aria-expanded="true"]'));
    const maxDepth = allItems.length ? Math.max(...allItems.map((item) => getItemDepth(item, effectiveRoot))) : 0;
    const rect = effectiveRoot.getBoundingClientRect();
    const visibility = getVisibilityInfo(effectiveRoot);
    const orientation = inferOrientation(topLabelElements);
    const directChildren = getDirectElementChildren(effectiveRoot);
    const structuralChromeCount = directChildren.filter((child) => child.matches?.('header, footer, main, aside, nav, .header, .footer, .search-container, .search-bar, .toolbar, .content-view, .main-content, .device-details, .detail-panel, .bottom-nav, .summary-panel')).length;

    return {
      root: effectiveRoot,
      topItems,
      allItems,
      branchContainers,
      branchingItems,
      activeItems,
      labelEntries,
      topLabelEntries,
      shortLabelRatio: shortLabels / Math.max(1, labelEntries.length),
      proseTopLabelRatio: proseLikeTopLabels / Math.max(1, topLabelEntries.length),
      decoratedTopItemRatio: decoratedTopItems / Math.max(1, topItems.length),
      avgLabelLength: Math.round(average(labelEntries.map((entry) => entry.text.length))),
      maxDepth,
      rect,
      visibility,
      orientation,
      structuralChromeCount,
      roleTree: effectiveRoot.getAttribute('role') === 'tree',
      roleTreeItems: effectiveRoot.querySelectorAll('[role="treeitem"]').length,
    };
  };

  const scoreRoot = (root, context = {}) => {
    if (!isElementNode(root)) return null;
    if (config.ignoredTags.has(root.tagName)) return null;
    if (root === document.body || root === document.documentElement) return null;
    if (root.matches?.('nav, [role="navigation"], [role="menu"], [role="menubar"], [role="tablist"]') && !hasTreeName(root)) return null;
    if (hasExcludedName(root) && !hasTreeName(root)) return null;
    if (hasOrgChartName(root) && !hasTreeName(root)) return null;

    const structure = extractStructure(root);
    if (!structure) return null;
    if (structure.allItems.length < 4 && !structure.roleTree) return null;
    if (structure.allItems.length > config.maxItems) return null;
    if (structure.branchContainers.length === 0 && structure.maxDepth < 2 && !structure.roleTree) return null;
    if (structure.orientation === 'horizontal' && structure.maxDepth < 2 && !hasTreeName(structure.root)) return null;

    const headingSignal = TREE_CONTEXT_RE.test(String(context.heading || ''));
    const titleSignal = TREE_CONTEXT_RE.test(String(context.title || ''));
    const rootNameSignal = hasTreeName(structure.root);
    const explicitExplorerSignal = /explorer|navigator|knowledge|category|directory/i.test(classTextFor(structure.root));
    const nestedListSignal = structure.branchContainers.filter((container) => container.tagName === 'UL' || container.tagName === 'OL').length;
    const leafHeavy = structure.branchingItems.length <= Math.max(1, Math.floor(structure.allItems.length * 0.15));
    const orgChartContext = ORG_CHART_RE.test(`${String(context.title || '')} ${String(context.heading || '')}`);
    const weakExplicitSignals = !structure.roleTree && !rootNameSignal && !headingSignal && !titleSignal;

    if (weakExplicitSignals && structure.proseTopLabelRatio >= 0.5) return null;
    if (weakExplicitSignals && structure.decoratedTopItemRatio === 0 && structure.topItems.length <= 4 && structure.maxDepth <= 2) return null;

    let score = 0;
    const reasons = [];

    if (structure.roleTree) {
      score += 30;
      reasons.push('tree-role');
    }
    if (structure.roleTreeItems >= Math.max(2, structure.topItems.length - 1)) {
      score += 18;
      reasons.push('treeitem-roles');
    }
    if (rootNameSignal) {
      score += 18;
      reasons.push('tree-like-name');
    }
    if (explicitExplorerSignal) {
      score += 10;
      reasons.push('explorer-or-navigator-name');
    }
    if (headingSignal) {
      score += 14;
      reasons.push('tree-heading-context');
    }
    if (titleSignal) {
      score += 12;
      reasons.push('tree-document-title');
    }
    if (structure.topItems.length >= config.minItems && structure.topItems.length <= 16) {
      score += 10;
      reasons.push('top-level-hierarchy');
    }
    if (structure.allItems.length >= 6) {
      score += 12;
      reasons.push('multiple-tree-items');
    }
    if (nestedListSignal >= 1) {
      score += 12;
      reasons.push('nested-branches');
    }
    if (structure.branchingItems.length >= 1) {
      score += 10;
      reasons.push('expandable-items');
    }
    if (structure.maxDepth >= 2) {
      score += 10;
      reasons.push('multi-level-depth');
    }
    if (structure.shortLabelRatio >= 0.5) {
      score += 6;
      reasons.push('compact-item-labels');
    }
    if (structure.decoratedTopItemRatio >= 0.5) {
      score += 6;
      reasons.push('decorated-tree-items');
    }
    if (structure.orientation === 'vertical') {
      score += 6;
      reasons.push('vertical-listing');
    }
    if (structure.activeItems.length >= 1) {
      score += 4;
      reasons.push('active-or-expanded-state');
    }

    if (structure.structuralChromeCount >= 2 && !rootNameSignal) {
      score -= 10;
      reasons.push('wrapper-with-extra-chrome');
    }
    if (structure.proseTopLabelRatio >= 0.5 && weakExplicitSignals) {
      score -= 18;
      reasons.push('prose-bullet-list-pattern');
    }
    if (structure.decoratedTopItemRatio === 0 && weakExplicitSignals) {
      score -= 12;
      reasons.push('plain-list-items');
    }
    if (leafHeavy && !rootNameSignal && !headingSignal && !titleSignal && structure.maxDepth < 2) {
      score -= 8;
      reasons.push('weak-hierarchy-depth');
    }
    if (structure.orientation === 'horizontal' && structure.maxDepth < 2) {
      score -= 12;
      reasons.push('horizontal-nav-pattern');
    }
    if (orgChartContext && !rootNameSignal) {
      score -= 16;
      reasons.push('org-chart-context');
    }

    if (score < config.minScore) return null;

    return {
      container: structure.root,
      score,
      reasons,
      rect: structure.rect,
      depth: getDepth(structure.root),
      visibility: structure.visibility,
      highlightable: structure.visibility.visible,
      topLevelCount: structure.topItems.length,
      itemCount: structure.allItems.length,
      branchCount: structure.branchContainers.length,
      expandableCount: structure.branchingItems.length,
      maxDepth: structure.maxDepth,
      activeCount: structure.activeItems.length,
      orientation: structure.orientation,
      labels: structure.topLabelEntries.map((entry) => entry.text).filter(Boolean).slice(0, 12),
      selectorHint: buildSelectorHint(structure.root),
      iframeTitle: context.title || '',
      heading: context.heading || '',
    };
  };

  const scanFrameTreeSignals = (frameDoc) => {
    const rootSnapshots = unique([...frameDoc.querySelectorAll(ROOT_SELECTOR)])
      .map((root) => {
        const topLevelCount = findTopLevelItems(root).length;
        const itemCount = root.matches?.('ul, ol')
          ? root.querySelectorAll('li').length
          : root.querySelectorAll('li, .tree-node, .tree-item, .course-item, .module-item, .lesson-item, .category, .subcategory, .device-item, [role="treeitem"]').length;
        const branchCount = root.querySelectorAll('ul, ol, [role="group"], .tree-children, .nested, .subcategories, .module-list, .lesson-list, .tree-node-children, .children, .tree-content').length;
        const nestedItems = root.matches?.('ul, ol')
          ? [...root.querySelectorAll('li')]
          : [...root.querySelectorAll('li, .tree-node, .tree-item, .course-item, .module-item, .lesson-item, .category, .subcategory, .device-item, [role="treeitem"]')];
        return {
          root,
          topLevelCount,
          itemCount,
          branchCount,
          maxDepth: nestedItems.length ? Math.max(...nestedItems.map((item) => getItemDepth(item, root))) : 0,
          rootNameSignal: hasTreeName(root),
          selectorHint: buildSelectorHint(root),
        };
      })
      .filter((snapshot) => snapshot.topLevelCount >= config.minItems || snapshot.rootNameSignal)
      .sort((a, b) => {
        const aWeight = (a.rootNameSignal ? 20 : 0) + a.topLevelCount + Math.min(a.itemCount, 24) + Math.min(a.branchCount, 12);
        const bWeight = (b.rootNameSignal ? 20 : 0) + b.topLevelCount + Math.min(b.itemCount, 24) + Math.min(b.branchCount, 12);
        return bWeight - aWeight;
      });

    const body = frameDoc.body;
    const title = String(frameDoc.title || '');
    const bodyText = normalizeText(body);
    const itemCount = body.querySelectorAll('li, .tree-node, .tree-item, .course-item, .module-item, .lesson-item, .category, .subcategory, .device-item, [role="treeitem"]').length;
    const branchCount = body.querySelectorAll('ul ul, ul ol, ol ul, ol ol, [role="group"], .tree-children, .nested, .subcategories, .module-list, .lesson-list, .tree-node-children, .children, .tree-content').length;
    const treeNameCount = body.querySelectorAll('[class*="tree" i], [id*="tree" i], [class*="explorer" i], [class*="navigator" i], [class*="knowledge" i], [class*="course" i], [class*="category" i], [class*="project" i]').length;
    const expandableCount = body.querySelectorAll('[aria-expanded], .expand-icon, .toggle-icon, .tree-chevron, .category-arrow, .node-toggle, .accordion-icon, [class*="toggle" i], [class*="expand" i], [class*="chevron" i]').length;
    const activeCount = body.querySelectorAll('.active, .current, .selected, .open, .expanded, [aria-selected="true"], [aria-expanded="true"]').length;
    const roleTreeCount = body.querySelectorAll('[role="tree"]').length;
    const roleTreeItemCount = body.querySelectorAll('[role="treeitem"]').length;
    const bestRoot = rootSnapshots[0] || null;
    const topLevelCount = bestRoot?.topLevelCount || 0;
    const maxDepth = Math.max(
      bestRoot?.maxDepth || 0,
      body.querySelectorAll('ul ul ul, ol ol ol, ul ol ul, ol ul ol, .nested .nested, .tree-children .tree-children, .children .children, .tree-content .tree-content, .tree-node-children .tree-node-children').length >= 1 ? 3 : 0,
      body.querySelectorAll('ul ul, ul ol, ol ul, ol ol, .nested, .tree-children, .children, .tree-content, .tree-node-children, .subcategories, .module-list, .lesson-list').length >= 1 ? 2 : 0,
      1
    );
    const labelSamples = bestRoot
      ? findTopLevelItems(bestRoot.root).map((item) => getLabelText(item).text).filter(Boolean).slice(0, 12)
      : [];

    return {
      title,
      bodyText,
      itemCount,
      branchCount,
      treeNameCount,
      expandableCount,
      activeCount,
      roleTreeCount,
      roleTreeItemCount,
      topLevelCount,
      maxDepth,
      bestRoot,
      labelSamples,
    };
  };

  const scoreIframe = (frameEl) => {
    if (!(frameEl instanceof HTMLIFrameElement)) return null;

    const rect = frameEl.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return null;

    const visibility = getVisibilityInfo(frameEl);
    const heading = previousHeadingText(frameEl);
    const headingTrail = getHeadingTrail(frameEl, 32);
    const nearbyTreeHeading = headingTrail.find((entry) => TREE_CONTEXT_RE.test(entry.text))?.text || '';

    let frameDoc = null;
    try {
      frameDoc = frameEl.contentDocument;
    } catch {
      frameDoc = null;
    }
    if (!frameDoc?.documentElement) return null;

    const signals = scanFrameTreeSignals(frameDoc);
    if (signals.itemCount < 4) return null;
    if (signals.branchCount === 0 && signals.maxDepth < 2 && signals.roleTreeCount === 0) return null;

    let score = 0;
    const reasons = [];

    if (signals.roleTreeCount > 0) {
      score += 30;
      reasons.push('iframe-tree-role');
    }
    if (signals.roleTreeItemCount >= 2) {
      score += 18;
      reasons.push('iframe-treeitem-roles');
    }
    if (signals.bestRoot?.rootNameSignal || TREE_CONTEXT_RE.test(signals.title)) {
      score += 18;
      reasons.push('iframe-tree-like-name');
    }
    if (signals.topLevelCount >= config.minItems && signals.topLevelCount <= 16) {
      score += 10;
      reasons.push('iframe-top-level-hierarchy');
    }
    if (signals.itemCount >= 6) {
      score += 12;
      reasons.push('iframe-multiple-items');
    }
    if (signals.branchCount >= 1) {
      score += 12;
      reasons.push('iframe-nested-branches');
    }
    if (signals.expandableCount >= 1) {
      score += 10;
      reasons.push('iframe-expandable-items');
    }
    if (signals.maxDepth >= 2) {
      score += 10;
      reasons.push('iframe-multi-level-depth');
    }
    if (signals.treeNameCount >= 4) {
      score += 10;
      reasons.push('iframe-tree-heavy-classnames');
    }
    if (signals.activeCount >= 1) {
      score += 4;
      reasons.push('iframe-active-state');
    }

    if (visibility.visible) {
      score += 4;
      reasons.push('visible-embedded-demo');
    }
    if (TREE_CONTEXT_RE.test(heading)) {
      score += 12;
      reasons.push('iframe-near-tree-heading');
    }
    if (nearbyTreeHeading && nearbyTreeHeading !== heading) {
      score += 8;
      reasons.push('iframe-tree-section-heading');
    }

    if (ORG_CHART_RE.test(`${signals.title} ${heading} ${nearbyTreeHeading}`) && !(signals.bestRoot?.rootNameSignal)) {
      score -= 18;
      reasons.push('iframe-org-chart-context');
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
      topLevelCount: signals.topLevelCount,
      itemCount: signals.itemCount,
      branchCount: signals.branchCount,
      expandableCount: signals.expandableCount,
      maxDepth: signals.maxDepth,
      activeCount: signals.activeCount,
      orientation: 'vertical',
      labels: signals.labelSamples,
      selectorHint: buildSelectorHint(frameEl),
      iframeTitle: frameDoc.title || '',
      heading: nearbyTreeHeading || heading,
      frameSelectorHint: signals.bestRoot?.selectorHint || '',
      isIframeCandidate: true,
    };
  };

  const gatherDirectCandidates = () => unique([
    ...document.querySelectorAll(ROOT_SELECTOR),
  ]);

  const gatherCandidates = () => {
    const directCandidates = gatherDirectCandidates()
      .map((root) => scoreRoot(root))
      .filter(Boolean);

    const iframeCandidates = config.scanFrames
      ? [...document.querySelectorAll('iframe')].map((frameEl) => scoreIframe(frameEl)).filter(Boolean)
      : [];

    return [...directCandidates, ...iframeCandidates].sort((a, b) => b.score - a.score || a.depth - b.depth);
  };

  const dedupeCandidates = (candidates) => {
    const accepted = [];
    for (const candidate of candidates) {
      const duplicate = accepted.some((existing) => {
        if (candidate.isIframeCandidate || existing.isIframeCandidate) {
          return existing.container === candidate.container;
        }

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
      .__tree-view-detector-container {
        outline: 3px solid var(--tree-view-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 10px !important;
      }
      .__tree-view-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--tree-view-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .__tree-view-detector-flash {
        animation: __tree-view-detector-flash 1.2s ease-out 1;
      }
      @keyframes __tree-view-detector-flash {
        0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
        100% { box-shadow: 0 0 0 18px transparent; }
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
  };

  const cleanup = () => {
    document.querySelectorAll('.__tree-view-detector-container').forEach((el) => {
      el.classList.remove('__tree-view-detector-container');
      el.style.removeProperty('--tree-view-detector-color');
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
    result.container.classList.add('__tree-view-detector-flash');
    window.setTimeout(() => result.container.classList.remove('__tree-view-detector-flash'), 1400);
    console.group(`Reveal tree view ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('result:', result);
    console.log('container:', result.container);
    console.groupEnd();
  };

  const paintCandidate = (candidate, index) => {
    if (!candidate.highlightable || !config.highlightVisible) return;
    const color = config.palette[index % config.palette.length];
    candidate.container.classList.add('__tree-view-detector-container');
    candidate.container.style.setProperty('--tree-view-detector-color', color);
    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__tree-view-detector-badge';
    badge.style.setProperty('--tree-view-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    badge.textContent = `tree ${index + 1} | ${candidate.itemCount} items | score ${candidate.score}`;
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
    topLevelCount: candidate.topLevelCount,
    branchCount: candidate.branchCount,
    expandableCount: candidate.expandableCount,
    maxDepth: candidate.maxDepth,
    activeCount: candidate.activeCount,
    orientation: candidate.orientation,
    visibilityState: candidate.visibility.state,
    hiddenReason: candidate.visibility.reason,
    selectorHint: candidate.selectorHint,
    iframeTitle: candidate.iframeTitle || '',
    heading: candidate.heading || '',
    frameSelectorHint: candidate.frameSelectorHint || '',
    isIframeCandidate: !!candidate.isIframeCandidate,
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
      return runTreeViewDetector({ ...overrides, ...nextOverrides });
    },
  };

  window.__treeViewDetector = api;
  window.runTreeViewDetector = runTreeViewDetector;

  console.group('Tree view detector');
  console.table(results.map((result) => ({
    id: result.id,
    score: result.score,
    itemCount: result.itemCount,
    topLevelCount: result.topLevelCount,
    branchCount: result.branchCount,
    depth: result.maxDepth,
    iframe: result.isIframeCandidate,
    title: result.iframeTitle || result.heading || '',
    selectorHint: result.selectorHint,
  })));
  results.forEach((result) => {
    console.group(`tree ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('heading:', result.heading);
    console.log('iframeTitle:', result.iframeTitle);
    console.log('reasons:', result.reasons);
    console.log('labels:', result.labels);
    console.log('container:', result.container);
    console.groupEnd();
  });
  console.log('Cleanup with window.__treeViewDetector?.cleanup()');
  console.log('Inspect one result with window.__treeViewDetector?.inspect(1)');
  console.log('Reveal one result with window.__treeViewDetector?.reveal(1)');
  console.log('Rerun without visible overlays with window.__treeViewDetector?.rerun({ highlightVisible: false })');
  console.groupEnd();

  return api;
}

window.runTreeViewDetector = runTreeViewDetector;