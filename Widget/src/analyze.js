import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildReportHtml } from './report-template.js';

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
    timeout: 45000,
    outputDir: '',
  };

  const positionals = [];
  for (const arg of argv) {
    if (arg === '--headful') {
      flags.headless = false;
      continue;
    }
    if (arg.startsWith('--timeout=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        flags.timeout = value;
      }
      continue;
    }
    if (arg.startsWith('--out=')) {
      flags.outputDir = arg.slice('--out='.length);
      continue;
    }
    positionals.push(arg);
  }

  return {
    url: positionals[0] || '',
    ...flags,
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

  const clipText = (value, max = 160) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };

  const normalizeText = (el) => clipText(el?.textContent || '', 240);

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
      rect: summarizeRect(rect),
      visibilityState: getVisibilityInfo(el).state,
      depth: getDepth(el),
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

      const rect = result.rect || (container ? summarizeRect(container.getBoundingClientRect()) : null);
      widgets.push({
        id: `widget-${entry.kind}-${counter}`,
        index: counter,
        kind: entry.kind,
        score: result.score ?? null,
        reasons: Array.isArray(result.reasons) ? result.reasons : [],
        labels: labelsForWidget(entry.kind, result),
        selectorHint: result.selectorHint || buildSelectorHint(container),
        rect,
        visibilityState: result.visibilityState || getVisibilityInfo(container).state,
        hiddenReason: result.hiddenReason || getVisibilityInfo(container).reason,
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
    if (/^H[1-6]$/.test(el.tagName)) return 'heading';
    if (el.matches('p, blockquote')) return 'text-block';
    if (el.matches('img, picture, video, canvas, figure, svg')) return 'media';
    if (el.matches('form')) return 'form';
    if (el.matches('button, [role="button"]')) return 'button';
    if (el.matches('a[href]')) return 'link';
    if (el.matches('input, select, textarea')) return 'input';
    if (el.matches('ul, ol, dl')) return 'list';
    if (el.matches('table')) return 'table';
    if (el.matches('pre, code')) return 'code';
    if (el.matches('section, article, aside, header, footer, main, nav')) return 'section';

    const text = normalizeText(el);
    const childCount = el.children.length;
    if ((text.length >= 40 || childCount >= 2) && el.matches('div')) return 'section';
    return null;
  };

  const componentPriority = {
    section: 1,
    form: 2,
    table: 2,
    list: 2,
    media: 3,
    heading: 4,
    'text-block': 4,
    button: 5,
    link: 5,
    input: 5,
    code: 5,
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
    const coveredBySelected = componentElements.some((entry) => entry.element.contains(candidate.element));
    if (coveredBySelected) continue;
    componentElements.push(candidate);
  }

  const components = componentElements.map((entry, index) => ({
    id: `component-${index + 1}`,
    index: index + 1,
    componentType: entry.componentType,
    text: normalizeText(entry.element),
    selectorHint: buildSelectorHint(entry.element),
    rect: summarizeRect(entry.element.getBoundingClientRect()),
    visibilityState: getVisibilityInfo(entry.element).state,
    reasons: [],
    details: {
      tagName: entry.element.tagName,
      childCount: entry.element.children.length,
      depth: getDepth(entry.element),
    },
  }));

  const uncoveredNodes = uncoveredElements.map((el, index) => ({
    ...makeNodeSummary(el, index + 1),
    id: `node-${index + 1}`,
  }));

  const widgetApisCleanup = widgetApis.map((entry) => entry.api).filter((api) => typeof api?.cleanup === 'function');
  for (const api of widgetApisCleanup) {
    try {
      api.cleanup();
    } catch {
      // ignore cleanup failures in report mode
    }
  }

  return {
    title: document.title,
    widgets,
    components,
    uncoveredNodes,
    runErrors,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    throw new Error('Usage: npm run analyze -- <url> [--headful] [--timeout=45000] [--out=reports/custom-run]');
  }

  const url = ensureUrl(args.url);
  const detectors = await loadDetectors();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = args.outputDir
    ? path.resolve(rootDir, args.outputDir)
    : path.join(rootDir, 'reports', `${slugify(new URL(url).hostname)}-${timestamp}`);

  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: args.headless });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: args.timeout });
    await page.waitForLoadState('networkidle', { timeout: Math.min(args.timeout, 15000) }).catch(() => {});
    await page.waitForTimeout(1500);

    for (const detector of detectors) {
      await page.addScriptTag({ content: detector.source });
    }

    const rawReport = await page.evaluate(analyzeInPage, detectors.map(({ kind, runName }) => ({ kind, runName })));

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
      runErrors: rawReport.runErrors,
      counts: {
        widgets: rawReport.widgets.length,
        components: rawReport.components.length,
        uncoveredNodes: rawReport.uncoveredNodes.length,
      },
      widgetKinds: summarizeCounts(rawReport.widgets),
    };

    await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    await fs.writeFile(path.join(outDir, 'index.html'), buildReportHtml(report), 'utf8');

    console.log(`Report generated:`);
    console.log(`  ${path.join(outDir, 'index.html')}`);
    console.log(`  ${path.join(outDir, 'report.json')}`);
    if (report.runErrors.length) {
      console.log('Detector run warnings:');
      for (const warning of report.runErrors) {
        console.log(`  ${warning.kind}: ${warning.message}`);
      }
    }
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});