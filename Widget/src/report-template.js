const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function buildReportHtml(report) {
  const dataJson = JSON.stringify(report).replace(/</g, '\\u003c');
  const title = escapeHtml(report.title || report.url);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} - Widget Detector Report</title>
    <style>
      :root {
        --bg: #f3efe6;
        --bg-strong: #e6dcc7;
        --surface: rgba(255, 252, 245, 0.84);
        --surface-strong: rgba(255, 248, 235, 0.96);
        --text: #1f1a14;
        --muted: #6a5d50;
        --accent: #0f766e;
        --accent-2: #b45309;
        --danger: #b91c1c;
        --border: rgba(48, 35, 20, 0.14);
        --shadow: 0 22px 60px rgba(67, 46, 20, 0.14);
        --radius: 24px;
        --mono: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
        --sans: "Segoe UI Variable", "Aptos", "Trebuchet MS", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: var(--sans);
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.14), transparent 32%),
          radial-gradient(circle at top right, rgba(180, 83, 9, 0.16), transparent 28%),
          linear-gradient(180deg, #f9f4ea 0%, #efe5d2 100%);
      }

      .shell {
        display: grid;
        grid-template-columns: minmax(340px, 380px) minmax(0, 1fr) minmax(340px, 400px);
        gap: 20px;
        padding: 20px;
        align-items: start;
      }

      .panel {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        backdrop-filter: blur(14px);
        overflow: hidden;
        min-width: 0;
      }

      .panel-inner {
        padding: 20px;
      }

      .hero {
        padding: 22px 22px 18px;
        background:
          linear-gradient(135deg, rgba(15, 118, 110, 0.13), transparent 55%),
          linear-gradient(315deg, rgba(180, 83, 9, 0.14), transparent 65%);
        border-bottom: 1px solid var(--border);
        overflow: hidden;
      }

      .eyebrow {
        font: 600 11px/1.3 var(--mono);
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent);
        margin-bottom: 10px;
      }

      h1, h2, h3 {
        margin: 0;
        line-height: 1.05;
      }

      h1 {
        font-size: 31px;
      }

      h2 {
        font-size: 18px;
      }

      .subtle {
        color: var(--muted);
      }

      .url-box {
        margin-top: 12px;
        padding: 12px 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.56);
        border: 1px solid var(--border);
        font: 500 12px/1.5 var(--mono);
        word-break: break-all;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 16px;
      }

      .stat {
        padding: 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.66);
        border: 1px solid var(--border);
        min-width: 0;
      }

      .stat-value {
        font-size: clamp(24px, 2.2vw, 32px);
        font-weight: 700;
        line-height: 1;
        overflow-wrap: anywhere;
      }

      .stat-label {
        color: var(--muted);
        font-size: 12px;
        margin-top: 6px;
      }

      .toolbar {
        display: flex;
        gap: 8px;
        padding: 14px 20px 0;
        flex-wrap: wrap;
      }

      .pill,
      .tab {
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.72);
        color: var(--text);
        border-radius: 999px;
        padding: 8px 12px;
        cursor: pointer;
        font: 600 12px/1 var(--mono);
      }

      .pill.active,
      .tab.active {
        background: var(--text);
        color: #fff9ef;
        border-color: var(--text);
      }

      .list-wrap {
        padding: 14px 20px 20px;
      }

      .list {
        display: grid;
        gap: 10px;
        max-height: calc(100vh - 260px);
        overflow: auto;
        padding-right: 4px;
      }

      .card {
        border: 1px solid var(--border);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.72);
        padding: 14px;
        cursor: pointer;
        transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
      }

      .card:hover {
        transform: translateY(-1px);
        border-color: rgba(15, 118, 110, 0.36);
      }

      .card.active {
        background: rgba(15, 118, 110, 0.12);
        border-color: rgba(15, 118, 110, 0.42);
      }

      .card-title {
        font-size: 15px;
        font-weight: 700;
        margin-bottom: 6px;
      }

      .meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 8px;
      }

      .chip {
        font: 600 11px/1 var(--mono);
        padding: 6px 8px;
        border-radius: 999px;
        background: rgba(31, 26, 20, 0.08);
      }

      .viewer-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        padding: 18px 20px 0;
        gap: 12px;
      }

      .stage {
        padding: 16px 20px 20px;
      }

      .shot-wrap {
        position: relative;
        border-radius: 24px;
        overflow: hidden;
        border: 1px solid var(--border);
        background: #f5ede0;
      }

      .shot-wrap img {
        display: block;
        width: 100%;
        height: auto;
      }

      .overlay-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .box {
        position: absolute;
        border: 2px solid;
        border-radius: 12px;
        background: color-mix(in srgb, currentColor 14%, transparent);
      }

      .box.selected {
        border-width: 3px;
        box-shadow: 0 0 0 2px rgba(255,255,255,0.6) inset;
      }

      .box-label {
        position: absolute;
        top: -24px;
        left: 0;
        white-space: nowrap;
        background: currentColor;
        color: white;
        border-radius: 999px;
        padding: 5px 8px;
        font: 700 11px/1 var(--mono);
      }

      .detail-body {
        padding: 18px 20px 20px;
        max-height: calc(100vh - 80px);
        overflow: auto;
      }

      .detail-grid {
        display: grid;
        gap: 12px;
      }

      .detail-block {
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 14px;
        background: rgba(255,255,255,0.68);
      }

      .detail-block h3 {
        font-size: 12px;
        font-family: var(--mono);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
        margin-bottom: 10px;
      }

      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font: 12px/1.5 var(--mono);
      }

      ul.flat {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 8px;
      }

      .empty {
        padding: 20px;
        color: var(--muted);
        text-align: center;
        border: 1px dashed var(--border);
        border-radius: 18px;
      }

      @media (max-width: 1420px) {
        .shell {
          grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
        }

        .detail-panel {
          grid-column: 1 / -1;
        }
      }

      @media (max-width: 980px) {
        .shell {
          grid-template-columns: 1fr;
          padding: 14px;
        }

        .list {
          max-height: 420px;
        }

        .stats {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="panel">
        <div class="hero">
          <div class="eyebrow">Widget Detector Workbench</div>
          <h1>${title}</h1>
          <div class="url-box">${escapeHtml(report.url)}</div>
          <div class="stats">
            <div class="stat">
              <div class="stat-value">${report.counts.widgets}</div>
              <div class="stat-label">Widgets</div>
            </div>
            <div class="stat">
              <div class="stat-value">${report.counts.components}</div>
              <div class="stat-label">Uncovered Components</div>
            </div>
            <div class="stat">
              <div class="stat-value">${report.counts.uncoveredNodes}</div>
              <div class="stat-label">Uncovered Nodes</div>
            </div>
            <div class="stat">
              <div class="stat-value">${report.counts.rawDomMappings || 0}</div>
              <div class="stat-label">DOM Mappings</div>
            </div>
          </div>
        </div>
        <div class="toolbar" id="tabs"></div>
        <div class="toolbar" id="filters"></div>
        <div class="list-wrap">
          <div class="list" id="results"></div>
        </div>
      </section>

      <section class="panel">
        <div class="viewer-head">
          <div>
            <div class="eyebrow">Visual Overlay</div>
            <h2 id="viewer-title">Page Screenshot</h2>
          </div>
          <div class="subtle" id="viewer-meta"></div>
        </div>
        <div class="stage">
          <div class="shot-wrap" id="shot-wrap">
            <img id="shot" alt="Page screenshot" src="${escapeHtml(report.screenshot.file)}">
            <div class="overlay-layer" id="overlay"></div>
          </div>
        </div>
      </section>

      <aside class="panel detail-panel">
        <div class="hero">
          <div class="eyebrow">Inspector</div>
          <h2 id="detail-title">Nothing selected</h2>
          <div class="subtle" id="detail-subtitle">Choose a widget, component, uncovered node, or DOM mapping.</div>
        </div>
        <div class="detail-body">
          <div class="detail-grid" id="detail"></div>
        </div>
      </aside>
    </div>

    <script>
      const report = ${dataJson};

      const palette = ['#0f766e', '#b45309', '#2563eb', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#be123c', '#7c2d12', '#4338ca'];
      const tabDefs = [
        { key: 'widgets', label: 'Widgets', items: report.widgets },
        { key: 'components', label: 'Components', items: report.components },
        { key: 'nodes', label: 'Nodes', items: report.uncoveredNodes },
        { key: 'mappings', label: 'DOM Mappings', items: report.rawDomMappings || [] }
      ];

      let activeTab = 'widgets';
      let activeFilter = 'all';
      let activeId = null;

      const tabsEl = document.getElementById('tabs');
      const filtersEl = document.getElementById('filters');
      const resultsEl = document.getElementById('results');
      const detailEl = document.getElementById('detail');
      const detailTitleEl = document.getElementById('detail-title');
      const detailSubtitleEl = document.getElementById('detail-subtitle');
      const viewerTitleEl = document.getElementById('viewer-title');
      const viewerMetaEl = document.getElementById('viewer-meta');
      const shotWrapEl = document.getElementById('shot-wrap');
      const overlayEl = document.getElementById('overlay');
      const shotEl = document.getElementById('shot');

      function currentItems() {
        return tabDefs.find((entry) => entry.key === activeTab)?.items || [];
      }

      function currentFilteredItems() {
        const items = currentItems();
        if (activeTab !== 'widgets' || activeFilter === 'all') {
          return items;
        }
        return items.filter((item) => item.kind === activeFilter);
      }

      function getWidgetKinds() {
        return ['all', ...new Set(report.widgets.map((item) => item.kind))];
      }

      function rectMeta(rect) {
        if (!rect) return 'No geometry';
        return [rect.x, rect.y, rect.width + 'x' + rect.height].join(' | ');
      }

      function scoreMeta(item) {
        if (activeTab !== 'widgets') {
          return '';
        }
        return typeof item.score === 'number' ? 'score ' + item.score : 'unscored';
      }

      function titleFor(item) {
        if (activeTab === 'widgets') {
          return item.kind + ' #' + item.index;
        }
        if (activeTab === 'components') {
          return item.componentType + ' #' + item.index;
        }
        if (activeTab === 'mappings') {
          return 'mapping #' + item.index;
        }
        return item.tagName.toLowerCase() + ' #' + item.index;
      }

      function subtitleFor(item) {
        if (activeTab === 'widgets') {
          return item.selectorHint || item.name || '';
        }
        if (activeTab === 'mappings') {
          return item.domSelector || item.selectorHint || item.htmlSnippet || '';
        }
        return item.selectorHint || item.text || '';
      }

      function sourceLabel(item) {
        const location = item.sourceMapping?.sourceLocation || item.sourceLocation;
        if (!location?.filePath) {
          return 'source unmapped';
        }
        const fileName = location.filePath.split(/[\\/]/).pop();
        return fileName + ':' + location.line;
      }

      function renderTabs() {
        tabsEl.innerHTML = '';
        tabDefs.forEach((tab) => {
          const button = document.createElement('button');
          button.className = 'tab' + (tab.key === activeTab ? ' active' : '');
          button.textContent = tab.label + ' (' + tab.items.length + ')';
          button.onclick = () => {
            activeTab = tab.key;
            activeFilter = 'all';
            activeId = null;
            render();
          };
          tabsEl.appendChild(button);
        });
      }

      function renderFilters() {
        filtersEl.innerHTML = '';
        if (activeTab !== 'widgets') {
          return;
        }
        getWidgetKinds().forEach((kind) => {
          const button = document.createElement('button');
          button.className = 'pill' + (kind === activeFilter ? ' active' : '');
          button.textContent = kind;
          button.onclick = () => {
            activeFilter = kind;
            activeId = null;
            renderResults();
            renderOverlay();
            renderDetails();
          };
          filtersEl.appendChild(button);
        });
      }

      function renderResults() {
        const items = currentFilteredItems();
        resultsEl.innerHTML = '';

        if (!items.length) {
          const empty = document.createElement('div');
          empty.className = 'empty';
          empty.textContent = 'No entries match the current view.';
          resultsEl.appendChild(empty);
          return;
        }

        items.forEach((item) => {
          const card = document.createElement('button');
          card.className = 'card' + (item.id === activeId ? ' active' : '');
          card.onclick = () => {
            activeId = item.id;
            renderResults();
            renderOverlay();
            renderDetails();
          };

          const title = document.createElement('div');
          title.className = 'card-title';
          title.textContent = titleFor(item);
          card.appendChild(title);

          const sub = document.createElement('div');
          sub.className = 'subtle';
          sub.textContent = subtitleFor(item);
          card.appendChild(sub);

          const meta = document.createElement('div');
          meta.className = 'meta';

          [scoreMeta(item), rectMeta(item.rect), item.visibilityState || item.componentType || item.tagName, sourceLabel(item)].filter(Boolean).forEach((value) => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.textContent = value;
            meta.appendChild(chip);
          });

          card.appendChild(meta);
          resultsEl.appendChild(card);
        });

        if (!activeId && items.length) {
          activeId = items[0].id;
          renderResults();
        }
      }

      function activeItem() {
        return currentFilteredItems().find((item) => item.id === activeId) || null;
      }

      function relativeRect(rect) {
        const shotWidth = shotEl.clientWidth || 1;
        const scale = shotWidth / Math.max(1, report.screenshot.width);
        return {
          left: rect.x * scale,
          top: rect.y * scale,
          width: rect.width * scale,
          height: rect.height * scale
        };
      }

      function buildBox(item, index, selected) {
        if (!item.rect) return null;
        const rect = relativeRect(item.rect);
        if (rect.width < 2 || rect.height < 2) return null;

        const color = palette[index % palette.length];
        const box = document.createElement('div');
        box.className = 'box' + (selected ? ' selected' : '');
        box.style.color = color;
        box.style.left = rect.left + 'px';
        box.style.top = rect.top + 'px';
        box.style.width = rect.width + 'px';
        box.style.height = rect.height + 'px';

        const label = document.createElement('div');
        label.className = 'box-label';
        label.textContent = titleFor(item);
        box.appendChild(label);
        return box;
      }

      function renderOverlay() {
        overlayEl.innerHTML = '';
        const items = currentFilteredItems().filter((item) => item.rect);
        items.forEach((item, index) => {
          const selected = item.id === activeId;
          if (!selected && activeTab !== 'widgets') {
            return;
          }
          if (!selected && activeTab === 'widgets' && index > 19) {
            return;
          }
          const box = buildBox(item, index, selected);
          if (box) overlayEl.appendChild(box);
        });

        const selected = activeItem();
        viewerTitleEl.textContent = selected ? titleFor(selected) : 'Page Screenshot';
        viewerMetaEl.textContent = selected ? rectMeta(selected.rect) : report.generatedAt;
      }

      function appendDetailBlock(title, value) {
        const block = document.createElement('section');
        block.className = 'detail-block';

        const heading = document.createElement('h3');
        heading.textContent = title;
        block.appendChild(heading);

        if (Array.isArray(value)) {
          const list = document.createElement('ul');
          list.className = 'flat';
          value.forEach((item) => {
            const li = document.createElement('li');
            li.textContent = typeof item === 'string' ? item : JSON.stringify(item, null, 2);
            list.appendChild(li);
          });
          block.appendChild(list);
        } else if (typeof value === 'object' && value !== null) {
          const pre = document.createElement('pre');
          pre.textContent = JSON.stringify(value, null, 2);
          block.appendChild(pre);
        } else {
          const pre = document.createElement('pre');
          pre.textContent = String(value ?? '');
          block.appendChild(pre);
        }

        detailEl.appendChild(block);
      }

      function renderDetails() {
        const item = activeItem();
        detailEl.innerHTML = '';
        if (!item) {
          detailTitleEl.textContent = 'Nothing selected';
          detailSubtitleEl.textContent = 'Choose a widget, component, uncovered node, or DOM mapping.';
          return;
        }

        detailTitleEl.textContent = titleFor(item);
        detailSubtitleEl.textContent = subtitleFor(item);

        appendDetailBlock('Summary', {
          score: item.score,
          visibilityState: item.visibilityState,
          hiddenReason: item.hiddenReason,
          selectorHint: item.selectorHint,
          domSelector: item.domSelector,
          rect: item.rect
        });

        if (item.sourceMapping) {
          appendDetailBlock('Source Mapping', item.sourceMapping);
        }

        if (item.sourceLocation) {
          appendDetailBlock('Source Location', item.sourceLocation);
        }

        if (item.htmlSnippet) {
          appendDetailBlock('HTML Snippet', item.htmlSnippet);
        }

        if (item.metrics && Object.keys(item.metrics).length) {
          appendDetailBlock('Metrics', item.metrics);
        }

        if (item.labels?.length) {
          appendDetailBlock('Labels', item.labels);
        }

        if (item.reasons?.length) {
          appendDetailBlock('Reasons', item.reasons);
        }

        if (item.text) {
          appendDetailBlock('Text', item.text);
        }

        if (item.details && Object.keys(item.details).length) {
          appendDetailBlock('Details', item.details);
        }
      }

      function render() {
        renderTabs();
        renderFilters();
        renderResults();
        renderOverlay();
        renderDetails();
      }

      shotEl.addEventListener('load', renderOverlay);
      window.addEventListener('resize', renderOverlay);
      render();
    </script>
  </body>
</html>`;
}