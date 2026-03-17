function runCarouselDetector(overrides = {}) {
  const previous = window.__carouselDetector;
  if (previous && typeof previous.cleanup === 'function') {
    previous.cleanup();
  }

  const BASE_CONFIG = {
    minSlides: 2,
    maxSlides: 30,
    minScore: 38,
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

  const rootNameTextFor = (el) => {
    if (!(el instanceof Element)) {
      return '';
    }
    return `${String(el.id || '')} ${String(el.className || '')}`;
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

  const hasCarouselName = (el) => /(\bcarousel\b(?!-item|-image|-caption|-control|-tab)|\bcarousel-tablist\b|\bslider\b|\bslideshow\b|\bslide-show\b|\brotator\b|\bswiper\b(?!-slide)|\bsplide\b(?!__slide)|\bglide\b(?!__slide)|\bslick\b(?!-slide)|\bflickity\b(?!-cell)|\bembla\b(?!__slide)|\bkeen-slider\b(?!__slide)|\bowl-carousel\b|\bbxslider\b|\borbit\b)/i.test(rootNameTextFor(el));

  const hasExcludedName = (el) => /accordion|faq|menu|menubar|tree|treeview|toolbar|breadcrumb|tabs(?!.*carousel)|tablist(?!.*carousel)|feed|timeline|stream|results|table|grid|calendar/i.test(classTextFor(el));

  const hasTrackName = (el) => /items|slides|track|viewport|wrapper|inner|list|stage|rail|strip|container|swiper-wrapper|splide__list|glide__slides|embla__container|keen-slider/i.test(classTextFor(el));

  const hasSlideName = (el) => /(carousel-item|swiper-slide|splide__slide|glide__slide|slick-slide|flickity-cell|embla__slide|keen-slider__slide|owl-item|\bslide-item\b|\bslide-panel\b|\bslide-card\b|\bslide\b(?!s))/i.test(classTextFor(el));

  const hasControlName = (el) => /controls|navigation|nav|pager|pagination|dots|indicators|arrows/i.test(classTextFor(el));

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

  const getDepth = (el) => {
    let depth = 0;
    let current = el;
    while (current && current !== document.body) {
      depth += 1;
      current = current.parentElement;
    }
    return depth;
  };

  const getAncestorDistance = (ancestor, descendant) => {
    if (!(ancestor instanceof Element) || !(descendant instanceof Element)) {
      return Infinity;
    }
    let distance = 0;
    let current = descendant;
    while (current && current !== ancestor) {
      distance += 1;
      current = current.parentElement;
    }
    return current === ancestor ? distance : Infinity;
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

  const getRectArea = (rect) => Math.max(1, Math.round(rect.width) * Math.round(rect.height));

  const isControlElement = (el) => {
    if (!(el instanceof Element)) return false;
    if (config.ignoredTags.has(el.tagName)) return false;
    const classText = classTextFor(el);
    const text = normalizeText(el);
    return isStructurallyInteractive(el) && (
      /prev|previous|next|back|forward|pause|play|start|stop|rotate|rotation|autoplay|dot|pager|pagination|indicator|slide\s*\d+/i.test(`${classText} ${text}`) ||
      hasControlName(el) ||
      el.getAttribute('role') === 'tab'
    );
  };

  const getControlSignalText = (el) => {
    if (!(el instanceof Element)) {
      return '';
    }
    return [
      classTextFor(el),
      normalizeText(el),
      el.getAttribute('aria-label') || '',
      el.getAttribute('title') || '',
      el.getAttribute('data-label-active') || '',
      el.getAttribute('data-label-disabled') || '',
    ].join(' ');
  };

  const isCarouselPreviousControl = (el) => {
    if (!(el instanceof Element) || !isStructurallyInteractive(el)) return false;
    const signalText = getControlSignalText(el);
    const buttonLike = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || /control|arrow|prev/i.test(classTextFor(el));
    const direction = /prev|previous|arrow-left|chevron-left/.test(signalText);
    const carouselIntent = /slide|carousel|card|panel|arrow|control/.test(signalText) || /control|arrow/.test(classTextFor(el));
    return buttonLike && direction && carouselIntent;
  };

  const isCarouselNextControl = (el) => {
    if (!(el instanceof Element) || !isStructurallyInteractive(el)) return false;
    const signalText = getControlSignalText(el);
    const buttonLike = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || /control|arrow|next/i.test(classTextFor(el));
    const direction = /next|forward|arrow-right|chevron-right/.test(signalText);
    const carouselIntent = /slide|carousel|card|panel|arrow|control/.test(signalText) || /control|arrow/.test(classTextFor(el));
    return buttonLike && direction && carouselIntent;
  };

  const isCarouselRotationControl = (el) => {
    if (!(el instanceof Element) || !isStructurallyInteractive(el)) return false;
    const signalText = getControlSignalText(el);
    const buttonLike = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || /rotation|pause|play/.test(classTextFor(el));
    return buttonLike && /play|pause|start|stop|rotate|rotation|autoplay/.test(signalText);
  };

  const isExplicitSlideElement = (el) => {
    if (!(el instanceof Element)) return false;
    const role = el.getAttribute('role') || '';
    const roledescription = el.getAttribute('aria-roledescription') || '';
    return role === 'group' || role === 'tabpanel' || /slide/i.test(roledescription) || hasSlideName(el);
  };

  const isLikelySlide = (el) => {
    if (!(el instanceof Element)) return false;
    if (config.ignoredTags.has(el.tagName)) return false;
    if (['BUTTON', 'A', 'NAV', 'HEADER', 'FOOTER', 'UL', 'OL', 'LI'].includes(el.tagName) && !hasSlideName(el)) return false;

    const classText = classTextFor(el);
    const text = normalizeText(el);
    const mediaCount = el.querySelectorAll('img, picture, video, canvas, figure').length;
    const textBlockCount = el.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote').length;
    const linkCount = el.querySelectorAll('a[href]').length;
    const controlCount = el.querySelectorAll('button, [role="button"], [role="tab"], summary').length;
    const role = el.getAttribute('role') || '';
    const roledescription = el.getAttribute('aria-roledescription') || '';

    if (!hasSlideName(el) && el.parentElement && isExplicitSlideElement(el.parentElement)) return false;
    if (/caption|description|meta|content|body|image|media/i.test(classText) && !isExplicitSlideElement(el)) return false;

    if (/slide/i.test(roledescription)) return true;
    if (role === 'group' || role === 'tabpanel') return true;
    if (hasSlideName(el)) return true;
    if (mediaCount > 0 && (textBlockCount > 0 || linkCount > 0)) return true;
    if (mediaCount > 0 && text.length >= 12 && controlCount <= 2) return true;
    if ((hasTrackName(el.parentElement) || hasCarouselName(el.parentElement)) && text.length >= 24 && text.length <= 280 && controlCount <= 2 && !isControlElement(el)) return true;
    return false;
  };

  const getUniformityRatio = (values, tolerance) => {
    if (!values.length) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    return values.filter((value) => Math.abs(value - median) <= Math.max(tolerance, median * 0.25)).length / Math.max(1, values.length);
  };

  const collectSlideGroupCandidates = (container) => {
    const candidates = [container];
    const namedDescendants = [...container.querySelectorAll('*')]
      .filter((el) => !config.ignoredTags.has(el.tagName))
      .filter((el) => hasTrackName(el) || hasCarouselName(el))
      .slice(0, 18);

    namedDescendants.forEach((el) => candidates.push(el));

    const slideNamedParents = unique(
      [...container.querySelectorAll('*')]
        .filter((el) => hasSlideName(el))
        .map((el) => el.parentElement)
        .filter(Boolean)
    ).slice(0, 12);

    slideNamedParents.forEach((el) => candidates.push(el));

    return unique(candidates);
  };

  const scoreSlideGroup = (group, outerContainer) => {
    if (!(group instanceof Element)) return null;
    if (config.ignoredTags.has(group.tagName)) return null;

    const children = [...group.children].filter((child) => !config.ignoredTags.has(child.tagName));
    if (children.length < config.minSlides || children.length > config.maxSlides) {
      return null;
    }

    const slides = children.filter((child) => isLikelySlide(child));
    if (slides.length < config.minSlides || slides.length > config.maxSlides) {
      return null;
    }

    const visibleSlides = slides.filter((slide) => getVisibilityInfo(slide).visible);
    const hiddenSlides = slides.filter((slide) => !getVisibilityInfo(slide).visible);
    const slideRects = slides.map((slide) => slide.getBoundingClientRect());
    const widths = slideRects.map((rect) => Math.round(rect.width));
    const heights = slideRects.map((rect) => Math.round(rect.height));
    const topRows = new Set(slideRects.map((rect) => Math.round(rect.top / 10))).size;
    const mediaRatio = slides.filter((slide) => slide.querySelector('img, picture, video, canvas, figure')).length / Math.max(1, slides.length);
    const articleRatio = slides.filter((slide) => slide.querySelector('article, time, h1, h2, h3, h4, h5, h6, p')).length / Math.max(1, slides.length);
    const controlishRatio = slides.filter((slide) => isControlElement(slide) || hasControlName(slide)).length / Math.max(1, slides.length);
    const activeCount = slides.filter((slide) => /active|current|selected|is-active|is-current/.test(classTextFor(slide)) || slide.getAttribute('aria-hidden') === 'false').length;
    const slideRoleCount = slides.filter((slide) => {
      const role = slide.getAttribute('role') || '';
      const roledescription = slide.getAttribute('aria-roledescription') || '';
      return role === 'group' || role === 'tabpanel' || /slide/i.test(roledescription);
    }).length;
    const groupStyle = window.getComputedStyle(group);
    const hasTransformMotion = groupStyle.transform !== 'none' || slides.some((slide) => window.getComputedStyle(slide).transform !== 'none');
    const overflowStyle = `${groupStyle.overflow} ${groupStyle.overflowX} ${groupStyle.overflowY}`;
    const clipsOverflow = /hidden|clip|scroll|auto/.test(overflowStyle);
    const widthUniformity = getUniformityRatio(widths, 24);
    const heightUniformity = getUniformityRatio(heights, 24);
    const oneVisibleManyHidden = visibleSlides.length <= 2 && hiddenSlides.length >= Math.max(1, slides.length - 1);
    const allVisible = visibleSlides.length === slides.length;

    let score = 0;
    const reasons = [];

    score += Math.min(24, slides.length * 4);
    reasons.push('repeated-slide-containers');

    if (hasCarouselName(outerContainer)) {
      score += 24;
      reasons.push('carousel-like-container-name');
    }
    if (hasCarouselName(group) || hasTrackName(group)) {
      score += 18;
      reasons.push('carousel-track-or-items-wrapper');
    }
    if (slideRoleCount > 0) {
      score += Math.min(18, slideRoleCount * 5);
      reasons.push('slide-role-pattern');
    }
    if (activeCount > 0) {
      score += 10;
      reasons.push('active-slide-state');
    }
    if (oneVisibleManyHidden) {
      score += 18;
      reasons.push('single-visible-slide-pattern');
    }
    if (hiddenSlides.length > 0) {
      score += Math.min(12, hiddenSlides.length * 3);
      reasons.push('hidden-or-offscreen-slides');
    }
    if (clipsOverflow) {
      score += 10;
      reasons.push('overflow-clipped-track');
    }
    if (hasTransformMotion) {
      score += 10;
      reasons.push('transform-driven-track');
    }
    if (widthUniformity >= 0.7) {
      score += 8;
      reasons.push('uniform-slide-widths');
    }
    if (heightUniformity >= 0.7) {
      score += 8;
      reasons.push('uniform-slide-heights');
    }
    if (topRows <= 2) {
      score += 6;
      reasons.push('single-row-slide-strip');
    }
    if (mediaRatio >= 0.35) {
      score += 8;
      reasons.push('media-bearing-slides');
    }

    if (controlishRatio >= 0.35) {
      score -= 26;
      reasons.push('control-like-slide-children');
    }
    if (allVisible && !clipsOverflow && !hasTransformMotion) {
      score -= 18;
      reasons.push('all-slides-visible-grid');
    }
    if (articleRatio >= 0.8 && mediaRatio < 0.25 && !hasCarouselName(outerContainer)) {
      score -= 14;
      reasons.push('article-rail-pattern');
    }
    if (group.matches('ul, ol') && mediaRatio === 0 && activeCount === 0 && hiddenSlides.length === 0) {
      score -= 20;
      reasons.push('plain-list-pattern');
    }

    if (score < config.minScore - 18) {
      return null;
    }

    return {
      group,
      slides,
      visibleSlides,
      hiddenSlides,
      activeCount,
      slideRoleCount,
      mediaRatio,
      allVisible,
      oneVisibleManyHidden,
      hasTransformMotion,
      clipsOverflow,
      score,
      reasons,
    };
  };

  const findBestSlideGroup = (container) => {
    const groups = collectSlideGroupCandidates(container)
      .map((group) => scoreSlideGroup(group, container))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || getDepth(a.group) - getDepth(b.group));

    return groups[0] || null;
  };

  const findControls = (container, slideGroup) => {
    const controlCandidates = unique([
      ...container.querySelectorAll('button, [role="button"], [role="tab"], a[href]'),
    ]).filter((el) => !config.ignoredTags.has(el.tagName));

    const prevButtons = controlCandidates.filter((el) => isCarouselPreviousControl(el));
    const nextButtons = controlCandidates.filter((el) => isCarouselNextControl(el));
    const rotationButtons = controlCandidates.filter((el) => isCarouselRotationControl(el));
    const tablist = container.querySelector('[role="tablist"]');
    const tabButtons = tablist ? [...tablist.querySelectorAll('[role="tab"]')] : [];

    const groupedPickerParents = unique(controlCandidates
      .map((el) => el.parentElement)
      .filter((parent) => parent instanceof Element)
      .filter((parent) => {
        const children = [...parent.children].filter((child) => isStructurallyInteractive(child));
        if (children.length < config.minSlides || children.length > config.maxSlides + 2) return false;
        const labelText = `${classTextFor(parent)} ${normalizeText(parent)} ${parent.getAttribute('aria-label') || ''}`;
        return /pagination|dots|indicators|slides|picker|pager/i.test(labelText) || children.every((child) => /slide\s*\d+|dot|bullet/i.test(`${classTextFor(child)} ${normalizeText(child)} ${child.getAttribute('aria-label') || ''}`) || normalizeText(child).length <= 2);
      }));

    const groupedPicker = groupedPickerParents.find((parent) => {
      const children = [...parent.children].filter((child) => isStructurallyInteractive(child));
      return slideGroup ? Math.abs(children.length - slideGroup.slides.length) <= 1 : children.length >= 2;
    }) || null;

    const liveRegionNode = container.querySelector('[aria-live]');

    return {
      previous: unique(prevButtons),
      next: unique(nextButtons),
      rotation: unique(rotationButtons),
      tablist,
      tabs: unique(tabButtons),
      pickerGroup: groupedPicker,
      pickerButtons: groupedPicker ? [...groupedPicker.children].filter((child) => isStructurallyInteractive(child)) : [],
      liveRegionNode,
    };
  };

  const inferType = (controls, slideGroup, container) => {
    const autoplayNamed = controls.rotation.length > 0 || /playing|autoplay|rotating|pause|play/i.test(classTextFor(container)) || (controls.liveRegionNode && /off/i.test(controls.liveRegionNode.getAttribute('aria-live') || ''));
    if (controls.tablist && controls.tabs.length >= 2) {
      return autoplayNamed ? 'tabbed-auto-carousel' : 'tabbed-carousel';
    }
    if (controls.pickerGroup && controls.pickerButtons.length >= 2) {
      return autoplayNamed ? 'grouped-auto-carousel' : 'grouped-carousel';
    }
    if (controls.previous.length > 0 && controls.next.length > 0) {
      return autoplayNamed ? 'auto-rotating-carousel' : 'basic-carousel';
    }
    if (slideGroup.oneVisibleManyHidden || slideGroup.hasTransformMotion || slideGroup.clipsOverflow) {
      return 'content-carousel';
    }
    return 'carousel-cluster';
  };

  const addStyles = () => {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .__carousel-detector-container {
        outline: 3px solid var(--carousel-detector-color) !important;
        outline-offset: 2px !important;
        border-radius: 8px !important;
      }
      .__carousel-detector-item {
        box-shadow: inset 0 0 0 2px var(--carousel-detector-color) !important;
        border-radius: 6px !important;
      }
      .__carousel-detector-badge {
        position: absolute;
        z-index: ${config.overlayZIndex};
        pointer-events: none;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--carousel-detector-color);
        color: #fff;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .__carousel-detector-flash {
        animation: __carousel-detector-flash 1.2s ease-out 1;
      }
      @keyframes __carousel-detector-flash {
        0% { box-shadow: 0 0 0 0 rgba(17, 138, 178, 0.7); }
        100% { box-shadow: 0 0 0 18px transparent; }
      }
    `;
    document.documentElement.appendChild(styleEl);
    state.styleEl = styleEl;
  };

  const cleanup = () => {
    document.querySelectorAll('.__carousel-detector-container').forEach((el) => {
      el.classList.remove('__carousel-detector-container');
      el.style.removeProperty('--carousel-detector-color');
      delete el.dataset.carouselDetectorId;
    });

    document.querySelectorAll('.__carousel-detector-item').forEach((el) => {
      el.classList.remove('__carousel-detector-item');
      el.style.removeProperty('--carousel-detector-color');
      delete el.dataset.carouselDetectorGroup;
    });

    state.overlays.forEach((el) => el.remove());
    state.overlays = [];

    if (state.styleEl) {
      state.styleEl.remove();
      state.styleEl = null;
    }
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

    container.classList.add('__carousel-detector-flash');
    window.setTimeout(() => {
      container.classList.remove('__carousel-detector-flash');
    }, 1400);

    console.group(`Reveal carousel ${result.id}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('result:', result);
    console.log('container:', result.container);
    console.groupEnd();
  };

  const paintCandidate = (candidate, index) => {
    if (!candidate.highlightable || !config.highlightVisible) {
      return;
    }

    const color = config.palette[index % config.palette.length];
    candidate.container.classList.add('__carousel-detector-container');
    candidate.container.style.setProperty('--carousel-detector-color', color);
    candidate.container.dataset.carouselDetectorId = String(index + 1);

    unique([
      ...candidate.visibleSlides,
      ...candidate.controls.previous,
      ...candidate.controls.next,
      ...candidate.controls.rotation,
      ...(candidate.controls.tablist ? [candidate.controls.tablist] : []),
      ...(candidate.controls.pickerGroup ? [candidate.controls.pickerGroup] : []),
    ]).forEach((el) => {
      el.classList.add('__carousel-detector-item');
      el.style.setProperty('--carousel-detector-color', color);
      el.dataset.carouselDetectorGroup = String(index + 1);
    });

    const rect = candidate.container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = '__carousel-detector-badge';
    badge.style.setProperty('--carousel-detector-color', color);
    badge.style.left = `${Math.max(4, window.scrollX + rect.left)}px`;
    badge.style.top = `${Math.max(4, window.scrollY + rect.top - 24)}px`;
    badge.textContent = `carousel ${index + 1} | ${candidate.type} | ${candidate.slides.length} slides | score ${candidate.score}`;
    document.body.appendChild(badge);
    state.overlays.push(badge);
  };

  const scoreContainer = (container) => {
    if (!(container instanceof Element)) return null;
    if (config.ignoredTags.has(container.tagName)) return null;
    if (container === document.body || container === document.documentElement) return null;
    if (['TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TD', 'TH', 'FIELDSET', 'FORM', 'DL', 'DT', 'DD'].includes(container.tagName) && !hasCarouselName(container)) return null;
    if (/carousel-options|options-panel|settings-panel/i.test(classTextFor(container))) return null;
    if (/footer|link-list|reference|parsys|cookie|consent/i.test(classTextFor(container)) && !hasCarouselName(container)) return null;
    if (hasExcludedName(container) && !hasCarouselName(container)) return null;
    if (container.matches('[role="menu"], [role="tree"], [role="tablist"]') && !hasCarouselName(container)) return null;
    if (isExplicitSlideElement(container) && !hasCarouselName(container) && !hasTrackName(container)) return null;

    const slideGroup = findBestSlideGroup(container);
    if (!slideGroup) {
      return null;
    }

    const controls = findControls(container, slideGroup);
    const rect = container.getBoundingClientRect();
    const containerArea = getRectArea(rect);
    const controlCount = controls.previous.length + controls.next.length + controls.rotation.length + controls.tabs.length + controls.pickerButtons.length;
    const visibleSlides = slideGroup.visibleSlides;
    const hiddenSlides = slideGroup.hiddenSlides;
    const insideNav = !!container.closest('nav, header');
    const insideFooter = !!container.closest('footer');
    const clickableDensity = (controlCount + slideGroup.slides.length) / Math.max(1, containerArea) * 100000;
    const groupDistance = getAncestorDistance(container, slideGroup.group);
    const namedCarouselDescendants = !hasCarouselName(container)
      ? [...container.querySelectorAll('*')]
          .filter((el) => el !== container)
          .filter((el) => hasCarouselName(el))
          .slice(0, 16)
      : [];
    const strongerNamedDescendantRoot = namedCarouselDescendants.some((el) => {
      return el.contains(slideGroup.group) || el.contains(controls.tablist) || controls.previous.some((control) => el.contains(control)) || controls.next.some((control) => el.contains(control));
    });
    const explicitCarouselSignals =
      hasCarouselName(container) ||
      hasCarouselName(slideGroup.group) ||
      slideGroup.slideRoleCount > 0 ||
      controlCount > 0 ||
      slideGroup.hasTransformMotion ||
      slideGroup.clipsOverflow;
    const explicitRootSignal = hasCarouselName(container) || hasTrackName(container) || hasControlName(container);

    if (strongerNamedDescendantRoot && !explicitRootSignal) {
      return null;
    }

    let score = slideGroup.score;
    const reasons = [...slideGroup.reasons];

    if (controls.previous.length > 0 && controls.next.length > 0) {
      score += 22;
      reasons.push('previous-next-controls');
    }
    if (controls.rotation.length > 0) {
      score += 10;
      reasons.push('rotation-control');
    }
    if (controls.tablist && controls.tabs.length >= config.minSlides) {
      score += 16;
      reasons.push('tabbed-slide-picker');
    }
    if (controls.pickerGroup && controls.pickerButtons.length >= config.minSlides) {
      score += 12;
      reasons.push('grouped-slide-picker');
    }
    if (controls.liveRegionNode) {
      score += 6;
      reasons.push('live-region-slides-container');
    }
    if (hasCarouselName(container)) {
      score += 8;
      reasons.push('explicit-carousel-root');
    }
    if (clickableDensity >= 0.25) {
      score += Math.min(10, Math.round(clickableDensity * 10));
      reasons.push('carousel-control-density');
    }
    if (visibleSlides.length >= 1 && hiddenSlides.length >= 1) {
      score += 6;
      reasons.push('visible-hidden-slide-mix');
    }

    if (insideNav && !hasCarouselName(container)) {
      score -= 24;
      reasons.push('inside-navigation-region');
    }
    if (insideFooter && !hasCarouselName(container)) {
      score -= 20;
      reasons.push('inside-footer-region');
    }
    if (strongerNamedDescendantRoot) {
      score -= 48;
      reasons.push('ancestor-of-explicit-carousel-root');
    }
    if (!explicitRootSignal && Number.isFinite(groupDistance) && groupDistance > 3) {
      score -= 26;
      reasons.push('distant-slide-group-wrapper');
    }
    if (!explicitCarouselSignals) {
      score -= 22;
      reasons.push('weak-carousel-root-signals');
    }
    if (!explicitCarouselSignals && slideGroup.mediaRatio < 0.4) {
      score -= 16;
      reasons.push('weak-slide-media-signals');
    }
    if (!explicitCarouselSignals && slideGroup.slides.length < 4) {
      score -= 12;
      reasons.push('short-generic-strip');
    }
    if (slideGroup.mediaRatio < 0.2 && controlCount === 0 && !slideGroup.hasTransformMotion && !slideGroup.clipsOverflow) {
      score -= 18;
      reasons.push('plain-content-strip');
    }
    if (controls.tablist && slideGroup.slideRoleCount === 0 && !hasCarouselName(container)) {
      score -= 18;
      reasons.push('generic-tabs-without-slide-pattern');
    }
    if (slideGroup.allVisible && controlCount === 0 && !hasCarouselName(container)) {
      score -= 24;
      reasons.push('fully-visible-gallery');
    }

    if (score < config.minScore) {
      return null;
    }

    const type = inferType(controls, slideGroup, container);
    const visibility = getVisibilityInfo(container);
    const highlightable = visibility.visible && visibleSlides.length >= 1;

    return {
      container,
      slideGroup: slideGroup.group,
      slides: slideGroup.slides,
      visibleSlides,
      hiddenSlides,
      controls,
      score,
      reasons,
      type,
      rect,
      depth: getDepth(container),
      explicitRootSignal,
      visibility,
      highlightable,
    };
  };

  const gatherCandidates = () => {
    return [...document.querySelectorAll('body *')]
      .filter((el) => !config.ignoredTags.has(el.tagName))
      .map((el) => scoreContainer(el))
      .filter(Boolean)
      .sort((a, b) => Number(b.explicitRootSignal) - Number(a.explicitRootSignal) || b.score - a.score || a.depth - b.depth);
  };

  const dedupeCandidates = (candidates) => {
    const accepted = [];

    for (const candidate of candidates) {
      const duplicate = accepted.some((existing) => {
        const nested = existing.container.contains(candidate.container) || candidate.container.contains(existing.container);
        if (!nested) return false;

        const overlapCount = candidate.slides.filter((slide) => existing.slides.includes(slide)).length;
        const overlapRatio = overlapCount / Math.max(1, Math.min(candidate.slides.length, existing.slides.length));
        if (overlapRatio < 0.8) return false;

        if (!candidate.explicitRootSignal && existing.explicitRootSignal) {
          return true;
        }
        if (candidate.explicitRootSignal && !existing.explicitRootSignal) {
          return false;
        }

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
    visibilityState: candidate.visibility.state,
    hiddenReason: candidate.visibility.reason,
    score: candidate.score,
    reasons: candidate.reasons,
    slideCount: candidate.slides.length,
    visibleSlideCount: candidate.visibleSlides.length,
    hiddenSlideCount: candidate.hiddenSlides.length,
    previousControlCount: candidate.controls.previous.length,
    nextControlCount: candidate.controls.next.length,
    rotationControlCount: candidate.controls.rotation.length,
    pickerType: candidate.controls.tablist ? 'tablist' : (candidate.controls.pickerGroup ? 'grouped-buttons' : 'none'),
    pickerCount: candidate.controls.tabs.length || candidate.controls.pickerButtons.length,
    selectorHint: buildSelectorHint(candidate.container),
    rect: summarizeRect(candidate.rect),
    highlighted: candidate.highlightable && config.highlightVisible,
    container: candidate.container,
    slideGroup: candidate.slideGroup,
    slides: candidate.slides.map((slide, slideIndex) => ({
      index: slideIndex + 1,
      label: normalizeText(slide).slice(0, 120),
      visibilityState: getVisibilityInfo(slide).state,
      active: /active|current|selected|is-active|is-current/.test(classTextFor(slide)) || slide.getAttribute('aria-hidden') === 'false',
      element: slide,
    })),
    controls: {
      previous: candidate.controls.previous,
      next: candidate.controls.next,
      rotation: candidate.controls.rotation,
      tablist: candidate.controls.tablist,
      tabs: candidate.controls.tabs,
      pickerGroup: candidate.controls.pickerGroup,
      pickerButtons: candidate.controls.pickerButtons,
    },
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
      return runCarouselDetector({ ...overrides, ...nextOverrides });
    },
  };

  window.__carouselDetector = api;
  window.runCarouselDetector = runCarouselDetector;

  console.group('Carousel detector');
  console.table(results.map((result) => ({
    id: result.id,
    type: result.type,
    visibilityState: result.visibilityState,
    score: result.score,
    slideCount: result.slideCount,
    visibleSlideCount: result.visibleSlideCount,
    hiddenSlideCount: result.hiddenSlideCount,
    previousControlCount: result.previousControlCount,
    nextControlCount: result.nextControlCount,
    pickerType: result.pickerType,
    pickerCount: result.pickerCount,
    highlighted: result.highlighted,
    selectorHint: result.selectorHint,
    rect: `${result.rect.x},${result.rect.y},${result.rect.width}x${result.rect.height}`,
  })));

  results.forEach((result) => {
    console.group(`carousel ${result.id}: ${result.type}`);
    console.log('selectorHint:', result.selectorHint);
    console.log('visibilityState:', result.visibilityState, result.hiddenReason);
    console.log('reasons:', result.reasons);
    console.log('slides:', result.slides);
    console.log('controls:', result.controls);
    console.log('container:', result.container);
    console.groupEnd();
  });

  console.log('Cleanup with window.__carouselDetector?.cleanup()');
  console.log('Inspect one result with window.__carouselDetector?.inspect(1)');
  console.log('Reveal one result with window.__carouselDetector?.reveal(1)');
  console.log('Rerun without visible overlays with window.__carouselDetector?.rerun({ highlightVisible: false })');
  console.groupEnd();

  return api;
}

window.runCarouselDetector = runCarouselDetector;