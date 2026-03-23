# Widget Detector Workbench

This wrapper runs the existing detector scripts against a live URL in Chromium, extracts detected widgets, computes uncovered non-widget nodes and components, and writes a static report UI.

## Setup

```bash
npm install
npx playwright install chromium
```

## Usage

```bash
npm run analyze -- https://example.com
```

Optional flags:

```bash
npm run analyze -- https://example.com --headful
npm run analyze -- https://example.com --timeout=60000
npm run analyze -- https://example.com --out=reports/custom-run
```

## Source-Mapped Usage

This mode combines the Widget detector pass with the built-in source-mapping instrumentation flow. It temporarily injects `data-source-loc` attributes into `.js`, `.jsx`, `.tsx`, and `.html` files, starts your app, runs the widget/component scan, and writes source-aware results into the report.

```bash
npm run analyze:source-map -- --source-dir=../your-app/src --project-dir=../your-app --start-command="npm run dev" --url=http://localhost:3000
```

Useful flags:

```bash
npm run analyze:source-map -- --source-dir=../your-app/src --project-dir=../your-app --start-command="npm run dev" --url=http://localhost:3000 --headful
npm run analyze:source-map -- --source-dir=../your-app/src --project-dir=../your-app --start-command="npm run dev" --url=http://localhost:3000 --timeout=60000
npm run analyze:source-map -- --source-dir=../your-app/src --project-dir=../your-app --start-command="npm run dev" --url=http://localhost:3000 --settle-ms=10000
npm run analyze:source-map -- --source-dir=../your-app/src --url=http://localhost:3000 --skip-server
```

Notes for source mapping:

- `--source-dir` is the directory Widget instruments and later restores.
- `--project-dir` is the directory where `--start-command` runs. Use the app root, not the `src` folder.
- The report adds `sourceMapping` for widgets, components, and uncovered nodes when a `data-source-loc` match is found.
- Coverage is limited to files Widget can instrument today: `.js`, `.jsx`, `.tsx`, and `.html`.

## Output

Each run writes a folder containing:

- `index.html`: interactive visual report
- `report.json`: structured analysis output
- `page.png`: screenshot used by the report UI

Source-mapped runs also include per-item source metadata in `report.json` and the inspector UI.

## Notes

- The original detector scripts are injected unchanged.
- Same-origin iframe support depends on what each detector already implements.
- External sites may render differently if they block automation or require authentication.