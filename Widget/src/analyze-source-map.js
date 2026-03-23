import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildReportHtml } from './report-template.js';
import { BackupManager } from './dom-source-map/fs-manager.js';
import { instrumentAllFiles } from './dom-source-map/instrumenter.js';
import { ServerRunner } from './dom-source-map/server-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const detectorRegistry = [
  { kind: 'accordion', file: 'accordion-detector.js', runName: 'runAccordionDetector' },
  { kind: 'breadcrumb', file: 'breadcrumb-detector.js', runName: 'runBreadcrumbDetector' },
  { kind: 'carousel', file: 'carousel-detector.js', runName: 'runCarouselDetector' },
  { kind: 'dialog', file: 'dialog-detector.js', runName: 'runDialogDetector' },
  { kind: 'feed', file: 'feed-detector.js', runName: 'runFeedDetector' },
  { kind: 'grid', file: 'grid-detector.js', runName: 'runGridDetector' },
  { kind: 'menu-bar', file: 'menu-bar-detector.js', runName: 'runMenuBarDetector' },
  { kind: 'progress-bar', file: 'progress-bar-detector.js', runName: 'runProgressBarDetector' },
  { kind: 'slider', file: 'slider-detector.js', runName: 'runSliderDetector' },
  { kind: 'tabs', file: 'tabs-detector.js', runName: 'runTabsDetector' },
  { kind: 'tooltip', file: 'tooltip-detector.js', runName: 'runTooltipDetector' },
  { kind: 'tree-view', file: 'tree-view-detector.js', runName: 'runTreeViewDetector' },
];

function parseArgs(argv) {
  const flags = {
    headless: true,
    timeout: 45_000,
    settleMs: 5_000,
    outputDir: '',
    projectDir: '',
    sourceDir: '',
    startCommand: '',
    url: '',
    skipServer: false,
  };

  const positionals = [];
  for (const arg of argv) {
    if (arg === '--headful') {
      flags.headless = false;
      continue;
    }
    if (arg === '--skip-server') {
      flags.skipServer = true;
      continue;
    }
    if (arg.startsWith('--timeout=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        flags.timeout = value;
      }
      continue;
    }
    if (arg.startsWith('--settle-ms=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value >= 0) {
        flags.settleMs = value;
      }
      continue;
    }
    if (arg.startsWith('--out=')) {
      flags.outputDir = arg.slice('--out='.length);
      continue;
    }
    if (arg.startsWith('--project-dir=')) {
      flags.projectDir = arg.slice('--project-dir='.length);
      continue;
    }
    if (arg.startsWith('--source-dir=')) {
      flags.sourceDir = arg.slice('--source-dir='.length);
      continue;
    }
    if (arg.startsWith('--start-command=')) {
      flags.startCommand = arg.slice('--start-command='.length);
      continue;
    }
    if (arg.startsWith('--url=')) {
      flags.url = arg.slice('--url='.length);
      continue;
    }
    positionals.push(arg);
  }

  return {
    ...flags,
    url: flags.url || positionals[0] || '',
  };
}

function ensureUrl(value) {
  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
}

function slugify(value) {
  return String(value || 'report')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'report';
}

function resolvePath(input, fallback = '') {
  const value = input || fallback;
  return value ? path.resolve(value) : '';
}

function ensureRequiredConfig(args) {
  if (!args.sourceDir) {
    throw new Error('Missing required flag: --source-dir=<path-to-instrumented-source>');
  }
  if (!args.url) {
    throw new Error('Missing required flag: --url=<http://localhost:3000>');
  }
  if (!args.skipServer && !args.startCommand) {
    throw new Error('Missing required flag: --start-command=<command> unless --skip-server is used.');
  }
}

async function loadDetectors() {
  const loaded = [];
  for (const detector of detectorRegistry) {
    const source = await fs.readFile(path.join(rootDir, detector.file), 'utf8');
    loaded.push({ ...detector, source });
  }
  return loaded;
}

function summarizeCounts(widgets) {
  return widgets.reduce((acc, widget) => {
    acc[widget.kind] = (acc[widget.kind] || 0) + 1;
    return acc;
  }, {});
}

function analyzeInPage(registry) {
  const ignoredTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'META', 'LINK', 'HEAD']);
  const widgetApis = [];
  const runErrors = [];
  const MAX_SOURCE_CANDIDATES = 8;
  const MAX_HTML_SNIPPET_LENGTH = 300;
  const componentSelectorRules = [
    { selector: 'a[href]', type: 'link' },
    { selector: 'a:not([href])', type: 'anchor' },
    { selector: 'abbr', type: 'abbreviation' },
    { selector: 'address', type: 'address' },
    { selector: 'area[href]', type: 'image-map-area' },
    { selector: 'article', type: 'article' },
    { selector: 'aside', type: 'aside' },
    { selector: 'audio', type: 'audio' },
    { selector: 'b, strong, i, em', type: 'emphasis' },
    { selector: 'blockquote', type: 'blockquote' },
    { selector: 'button', type: 'button' },
    { selector: 'canvas', type: 'canvas' },
    { selector: 'caption', type: 'caption' },
    { selector: 'cite, code, dfn', type: 'inline-text' },
    { selector: 'datalist', type: 'data-list' },
    { selector: 'details', type: 'details' },
    { selector: 'dialog', type: 'dialog' },
    { selector: 'dl', type: 'description-list' },
    { selector: 'dt, dd', type: 'description-item' },
    { selector: 'embed, object', type: 'embedded-content' },
    { selector: 'fieldset', type: 'fieldset' },
    { selector: 'figure', type: 'figure' },
    { selector: 'figcaption', type: 'figcaption' },
    { selector: 'footer, header', type: 'landmark' },
    { selector: 'form', type: 'form' },
    { selector: 'h1, h2, h3, h4, h5, h6', type: 'heading' },
    { selector: 'hr', type: 'separator' },
    { selector: 'iframe', type: 'iframe' },
    { selector: 'img', type: 'image' },
    { selector: 'input[type="button"], input[type="submit"], input[type="reset"]', type: 'button-input' },
    { selector: 'input[type="checkbox"]', type: 'checkbox' },
    { selector: 'input[type="color"]', type: 'color-input' },
    { selector: 'input[type="date"], input[type="datetime-local"], input[type="month"], input[type="week"]', type: 'date-input' },
    { selector: 'input:not([type]), input[type="email"], input[type="tel"], input[type="url"], input[type="text"]', type: 'text-input' },
    { selector: 'input[type="file"]', type: 'file-input' },
    { selector: 'input[type="image"]', type: 'image-input' },
    { selector: 'input[type="number"]', type: 'number-input' },
    { selector: 'input[type="password"]', type: 'password-input' },
    { selector: 'input[type="radio"]', type: 'radio-input' },
    { selector: 'input[type="range"]', type: 'range-input' },
    { selector: 'input[type="search"]', type: 'search-input' },
    { selector: 'label, legend', type: 'label' },
    { selector: 'li', type: 'list-item' },
    { selector: 'main', type: 'main' },
    { selector: 'map', type: 'map' },
    { selector: 'mark', type: 'mark' },
    { selector: 'meter', type: 'meter' },
    { selector: 'nav', type: 'nav' },
    { selector: 'ol, ul', type: 'list' },
    { selector: 'optgroup', type: 'option-group' },
    { selector: 'option', type: 'option' },
    { selector: 'output', type: 'output' },
    { selector: 'p', type: 'paragraph' },
    { selector: 'pre', type: 'preformatted' },
    { selector: 'progress', type: 'progress' },
    { selector: 'q', type: 'quote' },
    { selector: 'section', type: 'section' },
    { selector: 'select', type: 'select' },
    { selector: 'svg', type: 'svg' },
    { selector: 'table, thead, tbody, tfoot', type: 'table' },
    { selector: 'td, th', type: 'table-cell' },
    { selector: 'textarea', type: 'textarea' },
    { selector: 'tr', type: 'table-row' },
    { selector: 'video', type: 'video' },
  ];
  const genericContainerTypes = new Set(['container-group', 'section']);
  const containerSignatureAllowlist = new Set([
    'div, nav, p, section, span',
    'div, nav, section, span',
    'div, section',
    'div, section, span',
    'button, div, section, span',
    'div, section, span, table',
    'div, li, span',
    'div, section, span, ul',
    'button, div, span',
    'div, span',
    'div, p, section, span',
  ]);

  const clipText = (value, max = 160) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };

  const normalizeText = (el) => clipText(el?.textContent || '', 240);

  const buildHtmlSnippet = (el) => {
    if (!(el instanceof Element)) return '';
    const snippet = el.outerHTML || '';
    return snippet.length > MAX_HTML_SNIPPET_LENGTH
      ? `${snippet.slice(0, MAX_HTML_SNIPPET_LENGTH)}…`
      : snippet;
  };

  const getVisibilityInfo = (el) => {
    if (!(el instanceof Element)) {
      return { state: 'unknown', reason: 'not-element', visible: false };
    }

    for (let current = el; current; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none') return { state: 'hidden', reason: 'display-none-chain', visible: false };
      if (style.visibility === 'hidden' || style.contentVisibility === 'hidden') return { state: 'hidden', reason: 'visibility-hidden-chain', visible: false };
      if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return { state: 'collapsed', reason: 'hidden-attribute', visible: false };
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      return { state: 'collapsed', reason: 'collapsed-size', visible: false };
    }
    return { state: 'visible', reason: null, visible: true };
  };

  const summarizeRect = (rect) => ({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });

  const buildSelectorHint = (el) => {
    if (!(el instanceof Element)) return '';
    const parts = [];
    let current = el;
    while (current && current !== document.body && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += `#${current.id}`;
        parts.unshift(part);
        break;
      }
      const classes = [...current.classList].slice(0, 2);
      if (classes.length) {
        part += `.${classes.join('.')}`;
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  };

  const buildDomSelector = (el) => {
    if (!(el instanceof Element)) return '';
    if (el.id) {
      return `#${CSS.escape(el.id)}`;
    }

    const parts = [];
    let current = el;
    while (current && current !== document.documentElement) {
      const tag = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }

      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index += 1;
        }
        sibling = sibling.previousElementSibling;
      }

      let sameTagCount = 0;
      const parent = current.parentElement;
      if (parent) {
        for (let i = 0; i < parent.children.length; i += 1) {
          if (parent.children[i].tagName === current.tagName) {
            sameTagCount += 1;
          }
        }
      }

      parts.unshift(sameTagCount > 1 ? `${tag}:nth-of-type(${index})` : tag);
      current = current.parentElement;
    }

    return parts.join(' > ');
  };

  const parseSourceLoc = (raw) => {
    if (!raw) return null;
    const lastColon = raw.lastIndexOf(':');
    if (lastColon === -1) return null;

    const beforeLast = raw.slice(0, lastColon);
    const column = Number.parseInt(raw.slice(lastColon + 1), 10);

    const secondLastColon = beforeLast.lastIndexOf(':');
    if (secondLastColon === -1) return null;

    const filePath = beforeLast.slice(0, secondLastColon);
    const line = Number.parseInt(beforeLast.slice(secondLastColon + 1), 10);
    if (!filePath || Number.isNaN(line) || Number.isNaN(column)) return null;

    return { filePath, line, column };
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

  const makeNodeSummary = (el, index = 0) => {
    const rect = el instanceof Element ? el.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };
    return {
      id: '',
      index,
      tagName: el?.tagName || 'UNKNOWN',
      text: normalizeText(el),
      selectorHint: buildSelectorHint(el),
      domSelector: buildDomSelector(el),
      rect: summarizeRect(rect),
      visibilityState: getVisibilityInfo(el).state,
      depth: getDepth(el),
    };
  };

  const sourceKey = (candidate) => {
    if (!candidate?.sourceLocation) return '';
    const { filePath, line, column } = candidate.sourceLocation;
    return `${candidate.relation}:${filePath}:${line}:${column}`;
  };

  const collectSourceCandidates = (el) => {
    if (!(el instanceof Element)) return [];

    const seen = new Set();
    const candidates = [];
    const pushCandidate = (node, relation) => {
      if (!(node instanceof Element)) return;
      const sourceLocation = parseSourceLoc(node.getAttribute('data-source-loc'));
      if (!sourceLocation) return;
      const candidate = {
        relation,
        selector: buildDomSelector(node),
        sourceLocation,
      };
      const key = sourceKey(candidate);
      if (!key || seen.has(key)) return;
      seen.add(key);
      candidates.push(candidate);
    };

    pushCandidate(el, 'self');

    const descendants = el.querySelectorAll?.('[data-source-loc]') || [];
    for (const node of descendants) {
      pushCandidate(node, node === el ? 'self' : 'descendant');
      if (candidates.length >= MAX_SOURCE_CANDIDATES) {
        return candidates;
      }
    }

    if (!candidates.length) {
      let ancestor = el.parentElement;
      while (ancestor && candidates.length < MAX_SOURCE_CANDIDATES) {
        pushCandidate(ancestor, 'ancestor');
        ancestor = ancestor.parentElement;
      }
    }

    return candidates;
  };

  const buildSourceMapping = (el) => {
    const candidates = collectSourceCandidates(el);
    const primary = candidates[0] || null;
    const strategy = primary?.relation || 'none';
    const confidence = strategy === 'self'
      ? 'high'
      : strategy === 'descendant'
        ? 'medium'
        : strategy === 'ancestor'
          ? 'low'
          : 'none';

    return {
      strategy,
      confidence,
      sourceLocation: primary?.sourceLocation || null,
      matchedDomSelector: primary?.selector || '',
      candidateCount: candidates.length,
      candidates,
    };
  };

  const instrumentedElements = [...document.querySelectorAll('[data-source-loc]')];

  const createRawDomMapping = (el, index) => {
    const sourceLocation = parseSourceLoc(el.getAttribute('data-source-loc'));
    if (!sourceLocation) return null;

    const visibility = getVisibilityInfo(el);
    const domSelector = buildDomSelector(el);

    return {
      id: `mapping-${index + 1}`,
      index: index + 1,
      domSelector,
      selectorHint: buildSelectorHint(el),
      htmlSnippet: buildHtmlSnippet(el),
      text: normalizeText(el),
      rect: summarizeRect(el.getBoundingClientRect()),
      visibilityState: visibility.state,
      sourceLocation,
      sourceMapping: {
        strategy: 'self',
        confidence: 'high',
        sourceLocation,
        matchedDomSelector: domSelector,
        candidateCount: 1,
        candidates: [{ relation: 'self', selector: domSelector, sourceLocation }],
      },
      details: {
        tagName: el.tagName,
      },
    };
  };

  const ownSubtree = (ownerSet, el) => {
    if (!(el instanceof Element)) return;
    ownerSet.add(el);
    for (const node of el.querySelectorAll('*')) {
      ownerSet.add(node);
    }
  };

  const uniqueElements = (items) => [...new Set(items.filter((item) => item instanceof Element))];

  const panelRefsForTablist = (tablist) => {
    if (!(tablist instanceof Element)) return [];
    const tabs = [...tablist.querySelectorAll('[role="tab"], button, a[href^="#"], [aria-controls]')];
    const panels = [];
    for (const tab of tabs) {
      const controls = tab.getAttribute('aria-controls');
      if (controls) {
        const panel = document.getElementById(controls.replace(/^#/, ''));
        if (panel) panels.push(panel);
      }
      const href = tab.getAttribute('href');
      if (href && href.startsWith('#')) {
        const panel = document.getElementById(href.slice(1));
        if (panel) panels.push(panel);
      }
    }
    const nearbyPanels = uniqueElements([
      ...panels,
      ...tablist.parentElement?.querySelectorAll?.('[role="tabpanel"], [class*="tab-panel"], [class*="tab-pane"], [class*="tab-content"]') || [],
    ]);
    return nearbyPanels;
  };

  const widgetMetrics = (kind, result) => {
    switch (kind) {
      case 'accordion':
        return {
          type: result.type,
          sectionCount: result.sectionCount,
          expandedCount: result.expandedCount,
          collapsedCount: result.collapsedCount,
          orientation: result.orientation,
        };
      case 'breadcrumb':
        return {
          itemCount: result.itemCount,
          linkCount: result.linkCount,
          currentIndex: result.currentIndex,
          trailKind: result.trailKind,
          orientation: result.orientation,
        };
      case 'carousel':
        return {
          type: result.type,
          slideCount: result.slideCount,
          visibleSlideCount: result.visibleSlideCount,
          hiddenSlideCount: result.hiddenSlideCount,
          pickerType: result.pickerType,
          pickerCount: result.pickerCount,
        };
      case 'dialog':
        return {
          roleHint: result.roleHint,
          focusableCount: result.focusableCount,
          buttonCount: result.buttonCount,
          hasCloseAction: result.hasCloseAction,
        };
      case 'feed':
        return {
          itemCount: result.itemCount,
          orientation: result.orientation,
          avgTextLength: result.avgTextLength,
          avgItemHeight: result.avgItemHeight,
          roleFeed: result.roleFeed,
        };
      case 'grid':
        return {
          itemCount: result.itemCount,
          visibleItemCount: result.visibleItemCount,
          columnTrackCount: result.columnTrackCount,
          rowTrackCount: result.rowTrackCount,
          columnLanes: result.columnLanes,
          rowLanes: result.rowLanes,
          gap: result.gap,
        };
      case 'menu-bar':
        return {
          type: result.type,
          itemCount: result.itemCount,
          visibleItemCount: result.visibleItemCount,
          hiddenItemCount: result.hiddenItemCount,
          orientation: result.orientation,
        };
      case 'progress-bar':
        return {
          nativeProgress: result.nativeProgress,
          indeterminate: result.indeterminate,
          min: result.min,
          max: result.max,
          value: result.value,
          fillCount: result.fillCount,
        };
      case 'slider':
        return {
          orientation: result.orientation,
          handleCount: result.handleCount,
          min: result.min,
          max: result.max,
          value: result.value,
          nativeRange: result.nativeRange,
        };
      case 'tabs':
        return {
          tabCount: result.tabCount,
          panelCount: result.panelCount,
          activeCount: result.activeCount,
          orientation: result.orientation,
          isIframeCandidate: result.isIframeCandidate,
        };
      case 'tooltip':
        return {
          hasTrigger: result.hasTrigger,
          triggerType: result.triggerType,
          triggerSelector: result.triggerSelector,
        };
      case 'tree-view':
        return {
          itemCount: result.itemCount,
          topLevelCount: result.topLevelCount,
          branchCount: result.branchCount,
          expandableCount: result.expandableCount,
          maxDepth: result.maxDepth,
          activeCount: result.activeCount,
          isIframeCandidate: result.isIframeCandidate,
        };
      default:
        return {};
    }
  };

  const labelsForWidget = (kind, result) => {
    if (Array.isArray(result.labels) && result.labels.length) return result.labels.filter(Boolean).slice(0, 12);
    if (kind === 'dialog') return [result.title].filter(Boolean);
    if (kind === 'tooltip') return [result.text].filter(Boolean);
    return [];
  };

  const detailPayload = (kind, result) => {
    const details = {};
    if (kind === 'accordion' && Array.isArray(result.sections)) {
      details.sections = result.sections.map((section, index) => ({
        index: index + 1,
        label: clipText(section.label, 90),
        state: section.state,
        pattern: section.pattern,
      }));
    }
    if (kind === 'breadcrumb' && Array.isArray(result.items)) {
      details.items = result.items.map((item) => ({
        index: item.index,
        text: item.text,
        isLink: item.isLink,
        isCurrent: item.isCurrent,
      }));
    }
    if (kind === 'carousel' && Array.isArray(result.slides)) {
      details.slides = result.slides.map((slide) => ({
        index: slide.index,
        label: slide.label,
        active: slide.active,
        visibilityState: slide.visibilityState,
      }));
    }
    if (kind === 'tooltip') {
      details.text = result.text;
    }
    return details;
  };

  for (const detector of registry) {
    try {
      const runner = window[detector.runName];
      if (typeof runner !== 'function') {
        throw new Error(`Missing runner ${detector.runName}`);
      }
      const api = runner({ highlightVisible: false, maxResults: 50, includeFrames: true, scanFrames: true });
      widgetApis.push({ kind: detector.kind, api });
    } catch (error) {
      runErrors.push({ kind: detector.kind, message: error?.message || String(error) });
    }
  }

  const widgetOwnerSet = new Set();
  const widgets = [];
  const typeCounters = new Map();

  for (const entry of widgetApis) {
    const results = Array.isArray(entry.api?.results) ? entry.api.results : [];
    for (const result of results) {
      const counter = (typeCounters.get(entry.kind) || 0) + 1;
      typeCounters.set(entry.kind, counter);

      const container = result.container instanceof Element ? result.container : null;
      if (container) {
        ownSubtree(widgetOwnerSet, container);
      }

      if (entry.kind === 'tabs' && container) {
        for (const panel of panelRefsForTablist(container)) {
          ownSubtree(widgetOwnerSet, panel);
        }
      }

      const visibility = getVisibilityInfo(container);
      const rect = result.rect || (container ? summarizeRect(container.getBoundingClientRect()) : null);
      widgets.push({
        id: `widget-${entry.kind}-${counter}`,
        index: counter,
        kind: entry.kind,
        score: result.score ?? null,
        reasons: Array.isArray(result.reasons) ? result.reasons : [],
        labels: labelsForWidget(entry.kind, result),
        selectorHint: result.selectorHint || buildSelectorHint(container),
        domSelector: buildDomSelector(container),
        rect,
        visibilityState: result.visibilityState || visibility.state,
        hiddenReason: result.hiddenReason || visibility.reason,
        sourceMapping: buildSourceMapping(container),
        metrics: widgetMetrics(entry.kind, result),
        details: detailPayload(entry.kind, result),
      });
    }
  }

  const isMeaningfulUncovered = (el) => {
    if (!(el instanceof Element)) return false;
    if (ignoredTags.has(el.tagName)) return false;
    if (widgetOwnerSet.has(el)) return false;

    const visibility = getVisibilityInfo(el);
    if (!visibility.visible) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;

    if (/^(HTML|BODY)$/.test(el.tagName)) return false;
    return true;
  };

  const classifyComponent = (el) => {
    if (!(el instanceof Element)) return null;
    for (const rule of componentSelectorRules) {
      if (el.matches(rule.selector)) return rule.type;
    }

    const directChildSignature = [...new Set([...el.children].map((child) => child.tagName.toLowerCase()))].sort().join(', ');
    if (el.matches('div, span, section, nav, li, ul, button, table') && containerSignatureAllowlist.has(directChildSignature)) {
      return 'container-group';
    }

    const text = normalizeText(el);
    const childCount = el.children.length;
    if ((text.length >= 40 || childCount >= 2) && el.matches('div, span')) return 'container-group';
    return null;
  };

  const componentPriority = {
    section: 1,
    article: 1,
    nav: 1,
    main: 1,
    form: 2,
    fieldset: 2,
    table: 2,
    list: 2,
    'description-list': 2,
    figure: 3,
    image: 3,
    video: 3,
    canvas: 3,
    svg: 3,
    heading: 4,
    paragraph: 4,
    blockquote: 4,
    quote: 4,
    caption: 4,
    figcaption: 4,
    button: 5,
    'button-input': 5,
    link: 5,
    label: 5,
    'text-input': 5,
    'search-input': 5,
    'password-input': 5,
    'number-input': 5,
    'date-input': 5,
    'file-input': 5,
    'image-input': 5,
    'range-input': 5,
    'radio-input': 5,
    checkbox: 5,
    select: 5,
    textarea: 5,
    'inline-text': 6,
    emphasis: 6,
    'container-group': 7,
  };

  const uncoveredElements = [...document.body.querySelectorAll('*')].filter((el) => isMeaningfulUncovered(el));

  const componentCandidates = uncoveredElements
    .map((el) => ({ element: el, componentType: classifyComponent(el) }))
    .filter((entry) => !!entry.componentType)
    .sort((left, right) => {
      const priorityDelta = (componentPriority[left.componentType] || 99) - (componentPriority[right.componentType] || 99);
      if (priorityDelta !== 0) return priorityDelta;
      return getDepth(left.element) - getDepth(right.element);
    });

  const componentElements = [];
  for (const candidate of componentCandidates) {
    const coveredBySelected = componentElements.some((entry) => {
      if (entry.element === candidate.element) return true;
      if (!entry.element.contains(candidate.element)) return false;
      if (entry.componentType === candidate.componentType) return true;
      if (genericContainerTypes.has(entry.componentType)) return false;
      return false;
    });
    if (coveredBySelected) continue;
    componentElements.push(candidate);
  }

  const components = componentElements.map((entry, index) => {
    const visibility = getVisibilityInfo(entry.element);
    return {
      id: `component-${index + 1}`,
      index: index + 1,
      componentType: entry.componentType,
      text: normalizeText(entry.element),
      selectorHint: buildSelectorHint(entry.element),
      domSelector: buildDomSelector(entry.element),
      rect: summarizeRect(entry.element.getBoundingClientRect()),
      visibilityState: visibility.state,
      sourceMapping: buildSourceMapping(entry.element),
      reasons: [],
      details: {
        tagName: entry.element.tagName,
        childCount: entry.element.children.length,
        depth: getDepth(entry.element),
      },
    };
  });

  const rawDomMappings = instrumentedElements
    .filter((el) => !widgetOwnerSet.has(el))
    .map((el, index) => createRawDomMapping(el, index))
    .filter(Boolean)
    .map((entry, index) => ({
      ...entry,
      id: `mapping-${index + 1}`,
      index: index + 1,
    }));

  const uncoveredNodes = uncoveredElements.map((el, index) => ({
    ...makeNodeSummary(el, index + 1),
    id: `node-${index + 1}`,
    sourceMapping: buildSourceMapping(el),
  }));

  const widgetApisCleanup = widgetApis.map((entry) => entry.api).filter((api) => typeof api?.cleanup === 'function');
  for (const api of widgetApisCleanup) {
    try {
      api.cleanup();
    } catch {
      // Ignore cleanup failures in report mode.
    }
  }

  const countMapped = (items) => items.filter((item) => item.sourceMapping?.sourceLocation).length;

  return {
    title: document.title,
    widgets,
    components,
    uncoveredNodes,
    rawDomMappings,
    runErrors,
    mappingCoverage: {
      instrumentedDomNodes: rawDomMappings.length,
      rawDomMappings: rawDomMappings.length,
      widgetsWithSource: countMapped(widgets),
      componentsWithSource: countMapped(components),
      uncoveredNodesWithSource: countMapped(uncoveredNodes),
    },
  };
}

async function writeReport(page, rawReport, url, outDir) {
  const screenshotPath = path.join(outDir, 'page.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const viewport = page.viewportSize() || { width: 1440, height: 2400 };

  const report = {
    url,
    title: rawReport.title || url,
    generatedAt: new Date().toISOString(),
    screenshot: {
      file: 'page.png',
      width: viewport.width,
      height: await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight)),
    },
    widgets: rawReport.widgets,
    components: rawReport.components,
    uncoveredNodes: rawReport.uncoveredNodes,
    rawDomMappings: rawReport.rawDomMappings,
    runErrors: rawReport.runErrors,
    mappingCoverage: rawReport.mappingCoverage,
    counts: {
      widgets: rawReport.widgets.length,
      components: rawReport.components.length,
      uncoveredNodes: rawReport.uncoveredNodes.length,
      rawDomMappings: rawReport.rawDomMappings.length,
    },
    widgetKinds: summarizeCounts(rawReport.widgets),
  };

  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'index.html'), buildReportHtml(report), 'utf8');

  return report;
}

async function restoreSourceWithRetries(backupManager, options) {
  const { sourceDir, skipServer } = options;
  let lastError = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await backupManager.restore();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  console.error('[source-map] Failed to restore instrumented source files after multiple attempts.', lastError);
  if (skipServer) {
    console.error(`[source-map] If you used --skip-server, make sure no external process is still using ${sourceDir} as its working directory before restoring.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureRequiredConfig(args);

  const url = ensureUrl(args.url);
  const sourceDir = resolvePath(args.sourceDir);
  const projectDir = resolvePath(args.projectDir, path.dirname(sourceDir));
  const instrumentationDir = projectDir;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = args.outputDir
    ? path.resolve(rootDir, args.outputDir)
    : path.join(rootDir, 'reports', `${slugify(new URL(url).hostname)}-source-map-${timestamp}`);

  await fs.mkdir(outDir, { recursive: true });

  const detectors = await loadDetectors();
  const backupManager = new BackupManager(instrumentationDir);
  const serverRunner = args.skipServer
    ? null
    : new ServerRunner(args.startCommand, projectDir, url, args.timeout);

  let browser = null;
  let page = null;

  try {
    console.log('[source-map] Backing up source files...');
    await backupManager.backup();

    console.log('[source-map] Instrumenting JSX/TSX/HTML with data-source-loc...');
    const instrumentedCount = await instrumentAllFiles(instrumentationDir);
    if (instrumentedCount === 0) {
      console.warn('[source-map] Warning: no instrumentable files were found. Source mapping coverage will be empty.');
    }

    if (serverRunner) {
      console.log('[source-map] Starting application server...');
      await serverRunner.start();
    } else {
      console.log('[source-map] Reusing an already-running application server.');
    }

    browser = await chromium.launch({ headless: args.headless });
    page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: args.timeout });
    await page.waitForLoadState('networkidle', { timeout: Math.min(args.timeout, 15_000) }).catch(() => {});
    await page.waitForTimeout(args.settleMs);

    for (const detector of detectors) {
      await page.addScriptTag({ content: detector.source });
    }

    const rawReport = await page.evaluate(analyzeInPage, detectors.map(({ kind, runName }) => ({ kind, runName })));
    const report = await writeReport(page, rawReport, url, outDir);

    console.log('Source-mapped report generated:');
    console.log(`  ${path.join(outDir, 'index.html')}`);
    console.log(`  ${path.join(outDir, 'report.json')}`);
    console.log(`  widgets with source: ${report.mappingCoverage.widgetsWithSource}/${report.counts.widgets}`);
    console.log(`  components with source: ${report.mappingCoverage.componentsWithSource}/${report.counts.components}`);
    console.log(`  uncovered nodes with source: ${report.mappingCoverage.uncoveredNodesWithSource}/${report.counts.uncoveredNodes}`);
    console.log(`  raw DOM mappings: ${report.counts.rawDomMappings}`);

    if (report.runErrors.length) {
      console.log('Detector run warnings:');
      for (const warning of report.runErrors) {
        console.log(`  ${warning.kind}: ${warning.message}`);
      }
    }
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (serverRunner) {
      await serverRunner.stop().catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await restoreSourceWithRetries(backupManager, { sourceDir: instrumentationDir, skipServer: args.skipServer });
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});