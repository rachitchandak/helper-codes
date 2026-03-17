function runMenuBarDetector(overrides = {}) {
  const previous = window.__menuBarDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minItems: 3,
    maxItems: 100,
    minTextLength: 1,
    maxResults: 24,
    minScore: 35,
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

  const viewportSize = () => ({
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  });

  const normalizeText = (el) => String(el.textContent || '').replace(/\s+/g, ' ').trim();

  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };

  const unique = (items) => [...new Set(items)];

  const classTextFor = (el) => `${el.tagName} ${String(el.id || '')} ${String(el.className || '')}`;

  const hasMenuLikeName = (el) => /nav|menu|header|tabs|toolbar|sidebar|drawer|offcanvas/i.test(classTextFor(el));

  const hasOffcanvasName = (el) => /offcanvas|drawer|sidenav|sidebar|mobile-menu|nav-drawer/i.test(classTextFor(el));

  const hasCollapseName = (el) => /collapse|collapsed|is-hidden|hidden|closed|menu-panel/i.test(classTextFor(el));

  const hasPopupLayoutPattern = (el) => {
    const style = window.getComputedStyle(el);
    const hasInteractiveChildren = el.querySelectorAll('a[href], button, summary, [onclick], [tabindex]').length >= 3;
    return (style.position === 'absolute' || style.position === 'fixed') && hasInteractiveChildren;
  };

  const hasCarouselLikeName = (el) => /carousel|slider|swiper|splide|glide|embla|flickity|rail|track|marquee/i.test(classTextFor(el));

  const hasFeedLikeName = (el) => /feed|timeline|stream|posts|articles|stories|updates|results|cards/i.test(classTextFor(el));

  const hasTreeLikeName = (el) => /tree|treeview|tree-view|filetree|directory/i.test(classTextFor(el));

  const getTopLevelNavItems = (container) => {
    const items = [];

    for (const child of [...container.children]) {
      if (config.ignoredTags.has(child.tagName)) continue;

      if (isStructurallyInteractive(child)) {
        items.push(child);
        continue;
      }

      if (child.tagName === 'LI') {
        const trigger = [...child.children].find((node) => isStructurallyInteractive(node));
        if (trigger) {
          items.push(trigger);
          continue;
        }
      }

      const shallowTrigger = [...child.children].find((node) => {
        return isStructurallyInteractive(node) && !node.closest('ul ul, ol ol');
      });
      if (shallowTrigger) {
        items.push(shallowTrigger);
      }
    }

    return unique(items);
  };

  const getDirectBranchContainers = (container) => {
    const branches = [];

    for (const child of [...container.children]) {
      if (config.ignoredTags.has(child.tagName)) continue;

      if (isSubmenuContainer(child)) {
        branches.push(child);
      }

      if (child.tagName === 'LI' || child.getAttribute('role') === 'none') {
        branches.push(...[...child.children].filter((node) => isSubmenuContainer(node)));
      }
    }

    return unique(branches);
  };

  const isSubmenuContainer = (el) => {
    if (!(el instanceof Element)) return false;
    if (config.ignoredTags.has(el.tagName)) return false;
    const interactiveDescendants = el.querySelectorAll('a[href], button, summary, [onclick], [tabindex]').length;
    if (interactiveDescendants < 3) return false;
    const style = window.getComputedStyle(el);
    const popupNamed = /menu|submenu|dropdown|popup|panel|flyout|popover|listbox/i.test(classTextFor(el));
    const popupPositioned = style.position === 'absolute' || style.position === 'fixed';
    const popupHidden = style.display === 'none' || style.visibility === 'hidden';
    return popupNamed || popupPositioned || popupHidden || el.tagName === 'UL' || el.tagName === 'OL';
  };

  const getTreeSignals = (container, items) => {
    const classText = classTextFor(container);
    const treeItems = container.querySelectorAll('[role="treeitem"], [aria-level], [aria-setsize], [aria-posinset]');
    const groups = container.querySelectorAll('[role="group"], [aria-owns]');
    const ownedBranches = items.filter((item) => item.hasAttribute('aria-owns')).length;
    const selectedNodes = container.querySelectorAll('[aria-selected]');
    const nestedInteractiveBranches = [...container.querySelectorAll('li > ul, li > ol, [role="treeitem"] > ul, [role="treeitem"] > ol')].length;
    const labelWrappers = items.filter((item) => item.querySelector('.label, [class*="label"]')).length;
    const verticalStructure = getTopLevelNavItems(container).length <= Math.max(2, Math.floor(items.length * 0.35));

    return {
      explicitTreeRole: container.matches('[role="tree"]') || treeItems.length >= 2,
      treeItemCount: treeItems.length,
      groupCount: groups.length,
      ownedBranches,
      selectedNodeCount: selectedNodes.length,
      nestedInteractiveBranches,
      labelWrapperRatio: labelWrappers / Math.max(1, items.length),
      treeLikeName: hasTreeLikeName(container) || /treeitem|tree-view|tree node/i.test(classText),
      verticalStructure,
      score:
        (container.matches('[role="tree"]') ? 40 : 0) +
        treeItems.length * 8 +
        groups.length * 6 +
        ownedBranches * 8 +
        selectedNodes.length * 3 +
        nestedInteractiveBranches * 4 +
        (labelWrappers / Math.max(1, items.length) >= 0.5 ? 8 : 0) +
        ((hasTreeLikeName(container) || /treeitem|tree-view|tree node/i.test(classText)) ? 12 : 0) +
        (verticalStructure ? 6 : 0),
    };
  };

  const getMenubarPatternSignals = (container, items, orientation) => {
    const topLevelItems = getTopLevelNavItems(container);
    const topLevelParents = topLevelItems.map((item) => item.parentElement).filter(Boolean);
    const listItemParents = topLevelParents.filter((parent) => parent.tagName === 'LI').length;
    const siblingPopupCount = topLevelItems.filter((item) => item.nextElementSibling && isSubmenuContainer(item.nextElementSibling)).length;
    const wrappedPopupCount = topLevelItems.filter((item) => {
      const parent = item.parentElement;
      if (!parent) return false;
      return [...parent.children].some((node) => node !== item && isSubmenuContainer(node));
    }).length;
    const navAncestor = !!container.closest('nav, header') || container.tagName === 'NAV';
    const rootListContainer = container.tagName === 'UL' || container.tagName === 'OL';
    const directTopLevelRatio = topLevelItems.length / Math.max(1, items.length);
    const horizontalTopLevel = orientation === 'horizontal' && topLevelItems.length >= 3;

    return {
      topLevelItems,
      topLevelCount: topLevelItems.length,
      listItemParents,
      siblingPopupCount,
      wrappedPopupCount,
      navAncestor,
      rootListContainer,
      directTopLevelRatio,
      horizontalTopLevel,
      score:
        (navAncestor ? 14 : 0) +
        (rootListContainer ? 8 : 0) +
        (horizontalTopLevel ? 16 : 0) +
        Math.min(18, siblingPopupCount * 8) +
        Math.min(12, wrappedPopupCount * 4) +
        (listItemParents >= Math.max(2, Math.floor(topLevelItems.length * 0.6)) ? 10 : 0) +
        (directTopLevelRatio >= 0.35 ? 8 : 0),
    };
  };

  const getBehaviorSignals = (container, items) => {
    let submenuTriggerCount = 0;
    let hiddenSubmenuCount = 0;
    let disclosureIconCount = 0;
    let inlineBehaviorCount = 0;
    let zeroTabStops = 0;
    let negativeTabStops = 0;

    items.forEach((item) => {
      if (item.querySelector('svg, .caret, .chevron, .arrow, [class*="icon"]')) {
        disclosureIconCount += 1;
      }

      if (
        item.hasAttribute('onmouseenter') ||
        item.hasAttribute('onmouseover') ||
        item.hasAttribute('onfocus') ||
        item.hasAttribute('onkeydown') ||
        item.hasAttribute('onkeyup')
      ) {
        inlineBehaviorCount += 1;
      }

      if (item.tabIndex === 0) zeroTabStops += 1;
      if (item.tabIndex === -1) negativeTabStops += 1;

      const siblingCandidates = [];
      if (item.nextElementSibling) siblingCandidates.push(item.nextElementSibling);
      if (item.parentElement) {
        siblingCandidates.push(...[...item.parentElement.children].filter((node) => node !== item));
      }

      const submenu = siblingCandidates.find((candidate) => isSubmenuContainer(candidate));
      if (submenu) {
        submenuTriggerCount += 1;
        if (!getVisibilityInfo(submenu).visible) {
          hiddenSubmenuCount += 1;
        }
      }
    });

    return {
      submenuTriggerCount,
      hiddenSubmenuCount,
      disclosureIconCount,
      inlineBehaviorCount,
      rovingTabindexPattern: zeroTabStops <= 1 && negativeTabStops >= Math.max(1, items.length - 2),
      totalBehaviorScore:
        submenuTriggerCount * 8 +
        hiddenSubmenuCount * 4 +
        disclosureIconCount * 2 +
        inlineBehaviorCount * 2 +
        (zeroTabStops <= 1 && negativeTabStops >= Math.max(1, items.length - 2) ? 8 : 0),
    };
  };

  const getContentSignals = (items) => {
    const textLengths = [];
    const wordCounts = [];
    const descendantCounts = [];
    const heights = [];
    const tagCounts = new Map();
    let mediaItems = 0;
    let richContentItems = 0;
    let shortLabelItems = 0;
    let longLabelItems = 0;

    items.forEach((item) => {
      const text = normalizeText(item);
      const wordCount = text ? text.split(/\s+/).length : 0;
      const descendantCount = item.querySelectorAll('*').length;
      const height = Math.round(item.getBoundingClientRect().height);

      textLengths.push(text.length);
      wordCounts.push(wordCount);
      descendantCounts.push(descendantCount);
      heights.push(height);
      tagCounts.set(item.tagName, (tagCounts.get(item.tagName) || 0) + 1);

      if (text.length > 0 && text.length <= 24 && wordCount <= 4) shortLabelItems += 1;
      if (text.length >= 36 || wordCount >= 6) longLabelItems += 1;
      if (item.querySelector('img, picture, video, figure')) mediaItems += 1;
      if (item.querySelector('article, p, time, figure, h1, h2, h3, h4, h5, h6')) richContentItems += 1;
    });

    const sortedHeights = [...heights].sort((a, b) => a - b);
    const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)] || 0;
    const dominantTagRatio = Math.max(...[...tagCounts.values(), 0]) / Math.max(1, items.length);
    const uniformHeightRatio = heights.filter((height) => Math.abs(height - medianHeight) <= Math.max(8, medianHeight * 0.35)).length / Math.max(1, items.length);

    return {
      avgTextLength: average(textLengths),
      avgWordCount: average(wordCounts),
      avgDescendantCount: average(descendantCounts),
      mediaRatio: mediaItems / Math.max(1, items.length),
      richContentRatio: richContentItems / Math.max(1, items.length),
      shortLabelRatio: shortLabelItems / Math.max(1, items.length),
      longLabelRatio: longLabelItems / Math.max(1, items.length),
      dominantTagRatio,
      uniformHeightRatio,
    };
  };

  const hasCarouselControls = (container) => {
    return [...container.querySelectorAll('button, [onclick], a[href]')].some((node) => {
      const text = normalizeText(node);
      return /prev|next|previous|forward|back|slide/i.test(`${classTextFor(node)} ${text}`);
    });
  };

  const getVisibilityInfo = (el) => {
    let sawOffcanvasPattern = false;
    let sawCollapsePattern = false;

    for (let current = el; current; current = current.parentElement) {
      const classText = classTextFor(current);
      if (/offcanvas|drawer|sidenav|sidebar|mobile-menu|nav-drawer/i.test(classText)) {
        sawOffcanvasPattern = true;
      }
      if (/collapse|collapsed|is-hidden|hidden|closed|menu-panel/i.test(classText)) {
        sawCollapsePattern = true;
      }

      const style = window.getComputedStyle(current);
      const contentVisibility = style.contentVisibility;

      if (style.display === 'none') {
        return {
          state: sawOffcanvasPattern || sawCollapsePattern || hasPopupLayoutPattern(current) ? 'collapsed' : 'hidden',
          reason: 'display-none-chain',
          visible: false,
        };
      }

      if (style.visibility === 'hidden' || contentVisibility === 'hidden') {
        return {
          state: sawCollapsePattern || hasPopupLayoutPattern(current) ? 'collapsed' : 'hidden',
          reason: 'visibility-hidden-chain',
          visible: false,
        };
      }
    }

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const { width, height, x, y } = rect;
    const viewport = viewportSize();
    const outsideX = x + width < -40 || x > viewport.width + 40;
    const outsideY = y + height < -40 || y > viewport.height + 40;
    const positioned = style.position === 'fixed' || style.position === 'absolute';
    const transformed = style.transform && style.transform !== 'none';

    if ((width === 0 || height === 0) && hasOffcanvasName(el)) {
      return { state: 'collapsed', reason: 'offcanvas-zero-size', visible: false };
    }

    if ((width === 0 || height === 0) && hasCollapseName(el)) {
      return { state: 'collapsed', reason: 'collapsed-zero-size', visible: false };
    }

    if ((width < 4 || height < 4) && transformed && positioned) {
      return { state: 'offscreen', reason: 'positioned-transform-hidden', visible: false };
    }

    if (outsideX || outsideY) {
      return {
        state: hasOffcanvasName(el) || transformed ? 'offscreen' : 'hidden',
        reason: 'outside-viewport',
        visible: false,
      };
    }

    if (Number(style.opacity) === 0 && style.pointerEvents === 'none') {
      return { state: 'hidden', reason: 'fully-transparent', visible: false };
    }

    if (width < 4 || height < 4) {
      return {
        state: hasCollapseName(el) ? 'collapsed' : 'hidden',
        reason: 'tiny-rect',
        visible: false,
      };
    }

    return { state: 'visible', reason: null, visible: true };
  };

  const isStructurallyInteractive = (el) => {
    const tag = el.tagName;
    if (tag === 'A' && el.hasAttribute('href')) return true;
    if (tag === 'BUTTON' || tag === 'SUMMARY') return true;
    if (el.hasAttribute('onclick')) return true;
    if (el.tabIndex >= 0 && !['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(tag)) return true;
    if (/menu-item|menuitem|nav-link|nav-item|tab|toolbar|dropdown|drawer/i.test(classTextFor(el))) return true;
    const style = window.getComputedStyle(el);
    return style.cursor === 'pointer';
  };

  const isLikelyInteractive = (el, includeHidden) => {
    if (!(el instanceof Element)) return false;
    if (config.ignoredTags.has(el.tagName)) return false;
    if (!isStructurallyInteractive(el)) return false;
    if (includeHidden) return true;
    return getVisibilityInfo(el).visible;
  };

  const getInteractiveDescendants = (container, includeHidden) => {
    const selector = [
      'a[href]',
      'button',
      'summary',
      '[onclick]',
      '[tabindex]',
      '[class*="menu"]',
      '[class*="nav"]',
      '[class*="tab"]',
      '[class*="toolbar"]',
      '[class*="dropdown"]',
      '[class*="drawer"]',
      '[class*="offcanvas"]'
    ].join(',');

    return unique(
      [...container.querySelectorAll(selector)]
        .filter((el) => !config.ignoredTags.has(el.tagName))
        .filter((el) => isLikelyInteractive(el, includeHidden))
        .filter((el) => !el.closest('svg'))
    );
  };

  const getDirectInteractiveItems = (container, includeHidden) => {
    const items = [];

    for (const child of [...container.children]) {
      if (config.ignoredTags.has(child.tagName)) continue;
      if (isLikelyInteractive(child, includeHidden)) {
        items.push(child);
        continue;
      }

      const immediateInteractiveChildren = [...child.children].filter((node) => isLikelyInteractive(node, includeHidden));
      if (immediateInteractiveChildren.length === 1) {
        items.push(immediateInteractiveChildren[0]);
        continue;
      }
      if (immediateInteractiveChildren.length > 1 && immediateInteractiveChildren.length <= 12) {
        items.push(...immediateInteractiveChildren);
        continue;
      }

      const shallowDescendants = getInteractiveDescendants(child, includeHidden).filter((node) => {
        const shallowGroup =
          node.closest('li, div, section, article, aside') === child ||
          node.parentElement === child ||
          child.children.length <= 3;
        return shallowGroup;
      });

      if (shallowDescendants.length >= 1 && shallowDescendants.length <= 8) {
        items.push(...shallowDescendants);
      }
    }

    return unique(items).filter((item) => container.contains(item));
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

  const getClickableDensity = (container, items) => {
    const rect = container.getBoundingClientRect();
    const area = Math.max(1, rect.width * rect.height);
    return (items.length / area) * 100000;
  };

  const inferOrientation = (container, items) => {
    const style = window.getComputedStyle(container);

    if (style.display.includes('flex')) {
      return style.flexDirection.startsWith('column') ? 'vertical' : 'horizontal';
    }

    if (style.display.includes('grid')) {
      const columns = style.gridTemplateColumns.split(' ').filter(Boolean).length;
      return columns > 1 ? 'horizontal' : 'vertical';
    }

    if (items.length < 2) {
      if (hasOffcanvasName(container)) return 'vertical';
      return 'unknown';
    }

    const rects = items.map((item) => item.getBoundingClientRect());
    const topDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.top - rects[index].top));
    const leftDeltas = rects.slice(1).map((rect, index) => Math.abs(rect.left - rects[index].left));
    const avgTopDelta = average(topDeltas);
    const avgLeftDelta = average(leftDeltas);

    if (avgTopDelta < 12 && avgLeftDelta > 24) return 'horizontal';
    if (avgLeftDelta < 12 && avgTopDelta > 16) return 'vertical';

    const rowCount = new Set(rects.map((rect) => Math.round(rect.top / 10))).size;
    const colCount = new Set(rects.map((rect) => Math.round(rect.left / 10))).size;
    if (rowCount <= 2 && colCount >= 3) return 'horizontal';
    if (colCount <= 2 && rowCount >= 3) return 'vertical';
    return 'mixed';
  };

  const inferType = (container, items, orientation, visibility) => {
    const rect = container.getBoundingClientRect();
    const style = window.getComputedStyle(container);
    const fixedLike = style.position === 'fixed' || style.position === 'sticky';
    const classText = classTextFor(container);

    if (visibility.state !== 'visible' && hasOffcanvasName(container)) {
      return visibility.state === 'offscreen' ? 'offscreen-drawer-menu' : 'hidden-offcanvas-menu';
    }

    if (visibility.state === 'collapsed' || hasCollapseName(container) || hasPopupLayoutPattern(container)) {
      return 'collapsed-menu';
    }

    if (/breadcrumb/i.test(classText)) return 'breadcrumb';
    if (/tab|tabs|tablist/i.test(classText)) return 'tab-strip';
    if (/toolbar/i.test(classText)) return 'toolbar-menu';
    if (/sidebar|drawer|sidenav|offcanvas/i.test(classText)) return 'sidebar-menu';
    if (orientation === 'vertical' && (rect.height > rect.width || rect.left < viewportSize().width * 0.18)) return 'sidebar-menu';
    if (container.tagName === 'NAV') return 'nav-block';
    if (container.closest('header') || container.tagName === 'HEADER' || rect.top < viewportSize().height * 0.2 || fixedLike) {
      if (orientation === 'horizontal') return 'top-nav';
    }
    if (items.length >= 4 && orientation === 'horizontal') return 'menu-bar';
    return 'menu-cluster';
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
      .__menu-detector-container {
        outline: 3px solid var(--menu-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 8px !important;
      }
      .__menu-detector-item {
        box-shadow: inset 0 0 0 2px var(--menu-detector-color) !important;
        border-radius: 6px !important;
      }
      .__menu-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--menu-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .__menu-detector-flash {
        animation: __menu-detector-flash 1.2s ease-out 1;
      }
      @keyframes __menu-detector-flash {
        0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--menu-detector-color) 90%, white 10%); }
        100% { box-shadow: 0 0 0 18px transparent; }
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
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

    container.classList.add('__menu-detector-flash');
    window.setTimeout(() => {
      container.classList.remove('__menu-detector-flash');
    }, 1400);

    console.group(`Reveal menu ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('result:', result);
    console.log('container:', result.container);
    console.groupEnd();
  };

  const cleanup = () => {
    document.querySelectorAll('.__menu-detector-container').forEach((el) => {
      el.classList.remove('__menu-detector-container');
      el.style.removeProperty('--menu-detector-color');
      delete el.dataset.menuDetectorId;
    });

    document.querySelectorAll('.__menu-detector-item').forEach((el) => {
      el.classList.remove('__menu-detector-item');
      el.style.removeProperty('--menu-detector-color');
      delete el.dataset.menuDetectorGroup;
    });

    state.overlays.forEach((el) => el.remove());
    state.overlays = [];

    if (state.styleEl) {
      state.styleEl.remove();
      state.styleEl = null;
    }
  };

  const paintCandidate = (candidate, index) => {
    if (!candidate.highlightable || !config.highlightVisible) {
      return;
    }

    const color = config.palette[index % config.palette.length];
    const container = candidate.container;
    container.classList.add('__menu-detector-container');
    container.style.setProperty('--menu-detector-color', color);
    container.dataset.menuDetectorId = String(index + 1);

    candidate.visibleItems.forEach((item) => {
      item.classList.add('__menu-detector-item');
      item.style.setProperty('--menu-detector-color', color);
      item.dataset.menuDetectorGroup = String(index + 1);
    });

    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__menu-detector-badge';
    badge.style.setProperty('--menu-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    badge.textContent = `menu ${index + 1} | ${candidate.type} | ${candidate.visibleItems.length}/${candidate.allItems.length} visible | score ${candidate.score}`;
    document.body.appendChild(badge);
    state.overlays.push(badge);
  };

  const scoreContainer = (container) => {
    if (config.ignoredTags.has(container.tagName)) return null;
    if (container === document.body || container === document.documentElement) return null;

    const visibility = getVisibilityInfo(container);
    if (!config.includeHidden && !visibility.visible) return null;

    const directItems = getDirectInteractiveItems(container, config.includeHidden);
    const descendantItems = getInteractiveDescendants(container, config.includeHidden);
    const topLevelItems = getTopLevelNavItems(container);
    const directBranchContainers = getDirectBranchContainers(container);
    const preferTopLevelScope =
      visibility.visible &&
      topLevelItems.length >= config.minItems &&
      directBranchContainers.length > 0;
    const items = preferTopLevelScope
      ? topLevelItems
      : (directItems.length >= config.minItems ? directItems : descendantItems);
    if (items.length < config.minItems || items.length > config.maxItems) return null;

    const filteredItems = items.filter((item) => {
      const text = normalizeText(item);
      return text.length >= config.minTextLength || !!item.querySelector('img, svg');
    });
    if (filteredItems.length < config.minItems) return null;

    const visibleItems = filteredItems.filter((item) => getVisibilityInfo(item).visible);
    const hiddenItems = filteredItems.filter((item) => !getVisibilityInfo(item).visible);
    const itemsForOrientation = visibleItems.length >= 2 ? visibleItems : filteredItems;
    const orientation = inferOrientation(container, itemsForOrientation);
    const rect = container.getBoundingClientRect();
    const style = window.getComputedStyle(container);
    const labels = filteredItems.map(normalizeText).filter(Boolean);
    const uniqueLabels = [...new Set(labels)].slice(0, 20);
    const clickableDensity = getClickableDensity(container, visibleItems.length ? visibleItems : filteredItems);
    const listPattern = !!container.querySelector('ul > li > a, ol > li > a, ul > li > button, ol > li > button');
    const directChildRatio = directItems.length / Math.max(filteredItems.length, 1);
    const behaviorSignals = getBehaviorSignals(container, filteredItems);
    const contentSignals = getContentSignals(filteredItems);
    const menubarSignals = getMenubarPatternSignals(container, filteredItems, orientation);
    const treeSignals = getTreeSignals(container, filteredItems);
    const viewport = viewportSize();
    const headerLike = !!(container.closest('header') || container.tagName === 'HEADER' || rect.top < viewport.height * 0.18);
    const scrollSnapType = style.scrollSnapType || 'none';
    const horizontalScroller = style.overflowX === 'auto' || style.overflowX === 'scroll' || scrollSnapType !== 'none';
    const carouselLike =
      hasCarouselLikeName(container) ||
      (horizontalScroller && contentSignals.mediaRatio >= 0.25) ||
      hasCarouselControls(container) ||
      (orientation === 'horizontal' && contentSignals.richContentRatio >= 0.35 && contentSignals.mediaRatio >= 0.25);
    const feedLike =
      hasFeedLikeName(container) ||
      container.querySelectorAll('article, time').length >= 2 ||
      (contentSignals.richContentRatio >= 0.4 && contentSignals.avgTextLength > 28);
    const breadcrumbLike =
      /breadcrumb/i.test(classTextFor(container)) ||
      (
        listPattern &&
        filteredItems.length <= 6 &&
        behaviorSignals.submenuTriggerCount === 0 &&
        orientation === 'horizontal' &&
        !headerLike &&
        rect.top > viewport.height * 0.14 &&
        rect.width < viewport.width * 0.8
      );

    const treeLike =
      treeSignals.explicitTreeRole ||
      treeSignals.score >= 28 ||
      (orientation === 'vertical' && treeSignals.groupCount >= 2 && treeSignals.ownedBranches >= 1) ||
      (treeSignals.labelWrapperRatio >= 0.5 && treeSignals.nestedInteractiveBranches >= 2);

    if (breadcrumbLike && behaviorSignals.submenuTriggerCount === 0) {
      return null;
    }

    if ((carouselLike || feedLike) && behaviorSignals.totalBehaviorScore < 12) {
      return null;
    }

    if (treeLike) {
      return null;
    }

    let score = 0;
    const reasons = [];

    if (container.tagName === 'NAV') { score += 30; reasons.push('nav-element'); }
    if (hasMenuLikeName(container)) { score += 24; reasons.push('menu-like-class-or-id'); }
    if (listPattern) { score += 16; reasons.push('list-based-navigation'); }
    if (orientation === 'horizontal') { score += 18; reasons.push('horizontal-layout'); }
    if (orientation === 'vertical') { score += 12; reasons.push('vertical-layout'); }
    if (directChildRatio >= 0.6) { score += 12; reasons.push('cohesive-item-group'); }
    if (uniqueLabels.length >= 3) { score += 8; reasons.push('distinct-item-labels'); }
    if (['flex', 'inline-flex', 'grid', 'inline-grid'].includes(style.display)) { score += 10; reasons.push('layout-container'); }
    if (clickableDensity >= 0.8) { score += Math.min(20, Math.round(clickableDensity * 2)); reasons.push('dense-clickable-cluster'); }
    if (rect.width >= viewportSize().width * 0.45 && rect.height <= viewportSize().height * 0.35 && orientation === 'horizontal') {
      score += 16;
      reasons.push('header-sized-cluster');
    }
    if (rect.left < viewportSize().width * 0.18 && rect.height > rect.width && orientation === 'vertical') {
      score += 14;
      reasons.push('sidebar-positioning');
    }
    if (container.closest('header') || filteredItems.some((item) => item.closest('header'))) {
      score += 12;
      reasons.push('inside-header-region');
    }
    if (menubarSignals.navAncestor) {
      score += 14;
      reasons.push('nav-ancestor');
    }
    if (menubarSignals.rootListContainer) {
      score += 8;
      reasons.push('root-list-container');
    }
    if (menubarSignals.horizontalTopLevel) {
      score += 16;
      reasons.push('horizontal-top-level-items');
    }
    if (menubarSignals.listItemParents >= Math.max(2, Math.floor(menubarSignals.topLevelCount * 0.6))) {
      score += 10;
      reasons.push('listitem-trigger-parents');
    }
    if (menubarSignals.siblingPopupCount > 0) {
      score += Math.min(20, menubarSignals.siblingPopupCount * 8);
      reasons.push('sibling-popup-branches');
    }
    if (menubarSignals.wrappedPopupCount > 0) {
      score += Math.min(10, menubarSignals.wrappedPopupCount * 4);
      reasons.push('wrapped-popup-branches');
    }
    if (menubarSignals.directTopLevelRatio >= 0.35) {
      score += 8;
      reasons.push('top-level-trigger-ratio');
    }
    if (behaviorSignals.submenuTriggerCount > 0) {
      score += Math.min(24, behaviorSignals.submenuTriggerCount * 8);
      reasons.push('submenu-structure');
    }
    if (behaviorSignals.hiddenSubmenuCount > 0) {
      score += Math.min(10, behaviorSignals.hiddenSubmenuCount * 4);
      reasons.push('hidden-submenu-state');
    }
    if (behaviorSignals.rovingTabindexPattern) {
      score += 10;
      reasons.push('roving-tabindex-pattern');
    }
    if (behaviorSignals.disclosureIconCount > 0 && behaviorSignals.submenuTriggerCount > 0) {
      score += 6;
      reasons.push('disclosure-icons');
    }
    if (behaviorSignals.inlineBehaviorCount > 0) {
      score += Math.min(6, behaviorSignals.inlineBehaviorCount * 2);
      reasons.push('interactive-event-hooks');
    }
    if (contentSignals.shortLabelRatio >= 0.7) {
      score += 10;
      reasons.push('short-uniform-labels');
    }
    if (contentSignals.dominantTagRatio >= 0.8) {
      score += 6;
      reasons.push('uniform-item-tag');
    }
    if (contentSignals.uniformHeightRatio >= 0.75) {
      score += 6;
      reasons.push('uniform-item-size');
    }

    const dropdownLikeCount = filteredItems.filter((item) => {
      const text = normalizeText(item);
      return /more|menu|products|services|account|profile|settings|categories/i.test(text) || !!item.querySelector('svg, .caret, .chevron, .arrow');
    }).length;
    if (dropdownLikeCount > 0) {
      score += Math.min(12, dropdownLikeCount * 3);
      reasons.push('dropdown-trigger-pattern');
    }

    if (hiddenItems.length >= config.minItems) {
      score += 12;
      reasons.push('hidden-or-collapsed-items');
    }
    if (hiddenItems.length > visibleItems.length) {
      score += 8;
      reasons.push('mostly-hidden-structure');
    }
    if (hasOffcanvasName(container)) {
      score += 20;
      reasons.push('offcanvas-or-drawer-name');
    }
    if (hasCollapseName(container)) {
      score += 14;
      reasons.push('collapse-name');
    }
    if ((style.position === 'fixed' || style.position === 'absolute') && style.transform !== 'none') {
      score += 10;
      reasons.push('positioned-transform-container');
    }
    if (visibility.state === 'collapsed') {
      score += 16;
      reasons.push('collapsed-container-state');
    }
    if (visibility.state === 'offscreen') {
      score += 18;
      reasons.push('offscreen-container-state');
    }
    if (behaviorSignals.totalBehaviorScore === 0 && !headerLike && !hasMenuLikeName(container)) {
      score -= 18;
      reasons.push('weak-behavioral-signals');
    }
    if (contentSignals.longLabelRatio >= 0.35 || contentSignals.avgWordCount > 4.5) {
      score -= 18;
      reasons.push('text-heavy-items');
    }
    if (contentSignals.richContentRatio >= 0.35) {
      score -= 20;
      reasons.push('rich-content-items');
    }
    if (contentSignals.mediaRatio >= 0.35) {
      score -= 16;
      reasons.push('media-heavy-items');
    }
    if (contentSignals.avgDescendantCount > 10) {
      score -= 16;
      reasons.push('deep-item-structure');
    }
    if (carouselLike) {
      score -= 32;
      reasons.push('carousel-like-pattern');
    }
    if (feedLike) {
      score -= 28;
      reasons.push('feed-like-pattern');
    }
    if (orientation === 'vertical' && menubarSignals.topLevelCount <= 2 && !hasOffcanvasName(container)) {
      score -= 20;
      reasons.push('non-menubar-vertical-structure');
    }
    if (treeSignals.groupCount > 0) {
      score -= Math.min(24, treeSignals.groupCount * 6);
      reasons.push('tree-group-structure');
    }
    if (treeSignals.ownedBranches > 0) {
      score -= Math.min(24, treeSignals.ownedBranches * 8);
      reasons.push('aria-owned-tree-branches');
    }
    if (treeSignals.selectedNodeCount > 0) {
      score -= 12;
      reasons.push('tree-selection-pattern');
    }
    if (treeSignals.labelWrapperRatio >= 0.5 && !menubarSignals.horizontalTopLevel) {
      score -= 10;
      reasons.push('tree-label-wrapper-pattern');
    }

    if (filteredItems.length >= 5) score += 8;
    if (filteredItems.length >= 8) score += 6;
    if (uniqueLabels.length <= 1) score -= 30;
    if (container.matches('main, article, section') && filteredItems.length < 5 && !hasMenuLikeName(container)) score -= 20;
    if (container.querySelectorAll('input, textarea, select').length > filteredItems.length) score -= 14;
    if (rect.height > viewportSize().height * 0.75 && rect.width > viewportSize().width * 0.75 && !hasMenuLikeName(container)) score -= 20;

    if (score < config.minScore) return null;

    const type = inferType(container, filteredItems, orientation, visibility);
    const highlightable = visibility.visible && visibleItems.length >= config.minItems;

    return {
      container,
      allItems: filteredItems,
      visibleItems,
      hiddenItems,
      score,
      reasons,
      orientation,
      type,
      rect,
      depth: getDepth(container),
      labels: uniqueLabels,
      visibility,
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

        const candidateIsHiddenSubmenu = candidate.visibility.state !== 'visible' && isSubmenuContainer(candidate.container);
        const existingIsHiddenSubmenu = existing.visibility.state !== 'visible' && isSubmenuContainer(existing.container);

        if (
          (candidateIsHiddenSubmenu && existing.visibility.state === 'visible' && existing.container.contains(candidate.container)) ||
          (existingIsHiddenSubmenu && candidate.visibility.state === 'visible' && candidate.container.contains(existing.container))
        ) {
          return false;
        }

        const overlapCount = candidate.allItems.filter((item) => existing.allItems.includes(item)).length;
        const overlapRatio = overlapCount / Math.max(1, Math.min(candidate.allItems.length, existing.allItems.length));
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
    itemCount: candidate.allItems.length,
    visibleItemCount: candidate.visibleItems.length,
    hiddenItemCount: candidate.hiddenItems.length,
    labels: candidate.labels,
    selectorHint: buildSelectorHint(candidate.container),
    rect: summarizeRect(candidate.rect),
    highlighted: candidate.highlightable && config.highlightVisible,
    container: candidate.container,
    items: candidate.allItems,
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
      return runMenuBarDetector({ ...overrides, ...nextOverrides });
    },
  };

  window.__menuBarDetector = api;
  window.runMenuBarDetector = runMenuBarDetector;

  console.group('Menu bar detector');
  console.table(results.map((result) => ({
    id: result.id,
    type: result.type,
    visibilityState: result.visibilityState,
    score: result.score,
    itemCount: result.itemCount,
    visibleItemCount: result.visibleItemCount,
    hiddenItemCount: result.hiddenItemCount,
    highlighted: result.highlighted,
    selectorHint: result.selectorHint,
    rect: `${result.rect.x},${result.rect.y},${result.rect.width}x${result.rect.height}`,
  })));

  results.forEach((result) => {
    console.group(`menu ${result.id}: ${result.type}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('visibilityState:', result.visibilityState, result.hiddenReason);
    console.log('reasons:', result.reasons);
    console.log('labels:', result.labels);
    console.log('container:', result.container);
    console.log('items:', result.items);
    console.groupEnd();
  });

  console.log('Cleanup with window.__menuBarDetector?.cleanup()');
  console.log('Inspect one result with window.__menuBarDetector?.inspect(1)');
  console.log('Reveal one result with window.__menuBarDetector?.reveal(1)');
  console.log('Rerun without visible overlays with window.__menuBarDetector?.rerun({ highlightVisible: false })');
  console.groupEnd();

  return api;
}

window.runMenuBarDetector = runMenuBarDetector;