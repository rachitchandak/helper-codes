# Widget extraction detectors

This folder contains browser-side DOM heuristics for identifying common widget patterns on a rendered page.
Each script follows the same broad flow:

1. collect candidates with DOM queries and class/id name signals
2. score candidates with widget-specific structural and accessibility heuristics
3. reject weak or conflicting matches with negative reasons
4. dedupe nested matches and optionally highlight the winners in the page

## Detector inventory

| Script | Widget | Min score | Primary candidate signals |
| --- | --- | ---: | --- |
| `accordion-detector.js` | Accordion / disclosure | 28 | buttons, summaries, anchors with `aria-controls` / `aria-expanded`, `details` |
| `breadcrumb-detector.js` | Breadcrumb | 30 | `nav`, breadcrumb-like class names, ordered/unordered trails, current item markers |
| `carousel-detector.js` | Carousel / slider | 38 | carousel library class names, slide groups, track wrappers, nav controls |
| `dialog-detector.js` | Dialog / modal | 28 | `<dialog>`, `role="dialog"`, `role="alertdialog"`, `aria-modal="true"` |
| `feed-detector.js` | Feed / timeline | 26 | `role="feed"`, repeated article-like children, scrollable streams |
| `menu-bar-detector.js` | Menubar / nav menu | 35 | `<nav>`, menu-like names, repeated interactive items, submenu containers |
| `progress-bar-detector.js` | Progress bar / loader | 24 | `<progress>`, `role="progressbar"`, progress-like names, track/fill structure |
| `slider-detector.js` | Range slider | 24 | `input[type="range"]`, `role="slider"`, track/thumb markup |
| `tabs-detector.js` | Tabs | 28 | `role="tablist"`, tab triggers, panel references, active/inactive states |
| `tooltip-detector.js` | Tooltip | 24 | `role="tooltip"`, tooltip-like names, `aria-describedby` trigger linkage |

## Common extraction patterns across the folder

Across the detectors, the scripts repeatedly check for:

- **semantic roles and native elements** such as `<dialog>`, `<progress>`, `role="feed"`, `role="tablist"`, and `role="tooltip"`
- **class/id naming conventions** such as `accordion`, `breadcrumb`, `carousel`, `modal`, `slider`, `tooltip`, and library-specific names like `swiper`, `splide`, `MuiSlider`, and `noUi`
- **structural layout** such as repeated sibling items, wrapper + panel relationships, track + slide groupings, or trigger + popup pairings
- **visibility / state** using `display`, `visibility`, `hidden`, `aria-hidden`, `opacity`, offscreen geometry, and collapsed dimensions
- **positive/negative scoring reasons** so each detector can reward strong matches and suppress common false positives

## Deep dive by widget

### `accordion-detector.js`

**Patterns checked**

- accordion-like naming: `accordion`, `faq`, `collapse`, `collapsible`, `disclosure`, `expand`, `expander`, `toggle`, `drawer-section`
- trigger candidates:
  - `<button>`
  - `<summary>`
  - `<a>` with `aria-controls`, `aria-expanded`, `role="button"`, collapse/toggle data attributes, or fragment links with accordion-like naming
- section structure:
  - repeated header/panel pairs
  - adjacent trigger-to-panel relationships
  - stacked vertical trigger rows
  - heading-wrapped triggers
  - `<details>/<summary>` disclosure structures
- state and content checks:
  - collapsed panels via `display: none`, `visibility: hidden`, `hidden`, closed `<details>`, zero height, or offscreen placement
  - mixed open/closed sections
  - panel content density and full-width section triggers
- negative filters:
  - exclude nav/menu/tab/carousel/slider/tree/breadcrumb naming
  - reduce score for navigation-heavy panels, code-example panels, non-distinct labels, and too-few visible triggers

**Gaps in extraction**

- custom accordions that use non-button trigger markup without ARIA/state attributes can be missed
- keyboard support is not validated beyond limited `onkeydown`-style evidence elsewhere in the folder
- same-origin iframe support exists, but shadow DOM content is not traversed
- CSS-only expand/collapse patterns without visible trigger/panel relationships are weakly represented

### `breadcrumb-detector.js`

**Patterns checked**

- breadcrumb naming: `breadcrumb`, `crumb`, `trail`, `pathway`, `you-are-here`, `location-path`
- semantic/landmark signals:
  - `nav`
  - breadcrumb-style accessible labels
  - ordered or unordered list trails
- trail semantics:
  - 2 to 8 items
  - ancestor links before the current item
  - explicit current item markers such as `current`, `active`, `selected`, `is-current`
  - stepper-style trails
  - separators/dividers/chevrons/arrows
  - short, hierarchical labels
  - near-top-of-page placement
  - root-like first item
- false-positive suppression:
  - exclude pagination, tabs, menus, footers, table-of-contents, quick-links, chips/tags
  - penalize footer placement, generic header link clusters, vertical lists, missing current item, and long labels

**Gaps in extraction**

- JSON-LD / schema.org breadcrumbs are not parsed
- breadcrumbs rendered as plain text without strong link/current-item semantics are less likely to score well
- heavily customized separators or non-hierarchical labels can under-score
- iframe support exists, but shadow DOM and cross-origin frame content are still outside the detector

### `carousel-detector.js`

**Patterns checked**

- carousel/library naming:
  - `carousel`, `slider`, `slideshow`, `rotator`
  - framework names such as `swiper`, `splide`, `glide`, `slick`, `flickity`, `embla`, `keen-slider`, `owl-carousel`
- slide system structure:
  - repeated slide containers
  - track / wrapper / viewport / strip elements
  - slide-like item names
  - single-row slide strips
  - uniform slide widths/heights
  - overflow-clipped or transform-driven tracks
  - hidden/offscreen slide mix
  - `aria-roledescription="slide"`-style role patterns
- controls:
  - previous/next controls
  - rotation/play/pause controls
  - tabbed or grouped slide pickers
  - live-region slide containers
- negative filters:
  - suppress accordion/menu/tab/feed/grid/table/calendar patterns
  - penalize fully visible galleries, plain lists, generic tab rows, weak media signals, footer/navigation containment, and distant generic wrappers

**Gaps in extraction**

- static card rails and horizontally scrolling lists can still look carousel-like
- autoplay behavior is inferred only from control signals, not runtime behavior
- non-English class naming or highly bespoke naming can be missed
- no shadow DOM traversal; iframe support is not as explicit as in accordion/breadcrumb/slider/tabs

### `dialog-detector.js`

**Patterns checked**

- native and ARIA semantics:
  - `<dialog>`
  - `role="dialog"`
  - `role="alertdialog"`
  - `aria-modal="true"`
- dialog naming: `dialog`, `modal`, `lightbox`, `popup`, `sheet`, `drawer`, `overlay`, `offcanvas`, `popover`
- visual/behavioral heuristics:
  - fixed/absolute/sticky overlay positioning
  - viewport-centered windows
  - backdrop / scrim / overlay ancestors
  - title/heading presence
  - focusable content and action buttons
  - close/cancel/dismiss/ok controls
  - embedded form content
  - hidden-dialog candidates and visible dialogs
- false-positive suppression:
  - reject menus, tooltips, tablists, progress bars, site chrome, tiny containers, and link-heavy non-dialog clusters

**Gaps in extraction**

- focus trapping and modal behavior are not validated
- large in-page panels/drawers without strong modal semantics can be borderline
- non-semantic overlays implemented through portals or shadow DOM can be missed
- no iframe/shadow DOM deep scan comparable to some other detectors

### `feed-detector.js`

**Patterns checked**

- feed naming: `feed`, `timeline`, `stream`, `activity`, `updates`, `posts`, `stories`, `news`, `results-list`
- semantics:
  - `role="feed"`
  - feed-like accessible labels
- repeated item structure:
  - 3 to 40 repeated article-like children
  - article names such as `article`, `story`, `post`, `entry`, `card`, `result`
  - headings inside items
  - substantive text length
  - media in items
  - interactive links/buttons inside items
  - repeated item heights/shapes
  - vertical flow instead of horizontal flow
  - scrollable streams and `aria-busy`
- false-positive suppression:
  - reject nav/aside/footer/menu/tab/tree/grid containers
  - reject horizontal layouts and link-cluster-heavy lists
  - apply a negative reason when feed behavior signals are missing

**Gaps in extraction**

- virtualized/infinite feeds are judged only from the DOM currently present
- lazy loading and live updates are inferred only indirectly
- highly irregular card lists may be missed
- no explicit iframe or shadow DOM coverage

### `menu-bar-detector.js`

**Patterns checked**

- menu naming: `nav`, `menu`, `header`, `tabs`, `toolbar`, `sidebar`, `drawer`, `offcanvas`
- base structure:
  - `<nav>`
  - repeated top-level interactive items
  - list-based navigation
  - horizontal or vertical layouts
  - dense clickable clusters
  - uniform labels, tags, and item sizes
  - header-sized and sidebar-positioned clusters
  - nav ancestors and header-region placement
- submenu and behavior hints:
  - popup/submenu containers
  - sibling or wrapped popup branches
  - top-level trigger ratios
  - hidden submenu state
  - roving tabindex pattern
  - disclosure icons
  - inline event hooks including `onclick`, `onmouseenter`, `onmouseleave`, `onkeydown`, `onkeyup`
  - collapse/offcanvas/transform-driven hidden containers
- false-positive suppression:
  - subtract score for weak behavioral signals, text-heavy or rich-content items, carousel-like/feed-like patterns, and tree-like structures

**Gaps in extraction**

- it can still blur generic navigation, toolbars, drawers, and true WAI-ARIA menubars into one bucket
- runtime keyboard interaction is not verified, only hinted at through inline attributes and structure
- shadow DOM and cross-document menu systems are not deeply analyzed
- mega menus with mixed marketing content may be penalized as rich-content clusters

### `progress-bar-detector.js`

**Patterns checked**

- native/ARIA semantics:
  - `<progress>`
  - `role="progressbar"`
- progress naming: `progress`, `loader`, `loading`, `upload`, `download`, `processing`, `completion`
- structure and value:
  - track/fill descendants named `fill`, `bar`, `value`, `indicator`
  - `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `value`, `data-value`
  - indeterminate states from missing value plus `indeterminate`, `loading`, `striped`, `animated`
  - long horizontal bar shape
  - nearby label text mentioning load/upload/download/progress
- false-positive suppression:
  - reject `meter`, slider/range inputs, focusable controls, thumb/handle patterns, and tiny rectangles
  - apply a negative reason when custom bars are missing range/value signals

**Gaps in extraction**

- step indicators and multi-stage progress trackers are outside the detector’s model
- circular progress indicators are only weakly represented because the scoring expects bar-like geometry
- decorative loading skeletons without progress semantics or fill structure can be missed
- no runtime animation analysis

### `slider-detector.js`

**Patterns checked**

- native/ARIA semantics:
  - `input[type="range"]`
  - `role="slider"`
- slider naming:
  - `slider`, `range`, `seek`, `scrubber`, `knob`, `trackbar`, `thumb`, `handle`
  - framework hooks including `MuiSlider`, `rc-slider`, and `noUi`
- structure and state:
  - thumb/handle/knob descendants
  - track/rail/bar/fill descendants
  - focusability / interactive control signals
  - current value, min/max bounds
  - horizontal/vertical orientation
  - readonly range signals
- false-positive suppression:
  - reject progress/meter widgets
  - penalize weak interactivity
- extra coverage:
  - dedicated iframe candidate scoring for same-page embedded demos/widgets

**Gaps in extraction**

- dual-thumb range sliders are not modeled distinctly from single-thumb sliders
- custom gesture-only sliders without focusable or semantic affordances may be missed
- scrollbars can still resemble custom sliders when naming is weak
- no shadow DOM traversal

### `tabs-detector.js`

**Patterns checked**

- native/ARIA semantics:
  - `role="tablist"`
  - child `role="tab"`
  - related `role="tabpanel"`
- tab naming:
  - `tab`, `tabs`, `tablist`, `tab-panel`, `tabpanel`, `tab-content`, `tab-pane`, `nav-tabs`, `pill`, `pills`
- trigger/panel linkage:
  - `aria-controls`
  - fragment links
  - dataset references such as `data-tab`, `data-panel`, `data-target`, `data-view`, `data-section`
  - inline `onclick` target extraction
  - nearby panel fallback lookup
- tablist heuristics:
  - 2 to 12 tabs
  - short tab labels
  - single active state
  - hidden inactive panels
  - horizontal/vertical row inference
  - nearby headings that look tab-related
- extra coverage:
  - iframe scoring for embedded demos and iframe-contained tab patterns
- false-positive suppression:
  - reject breadcrumbs, menus, carousels, sliders, accordions, pagination patterns
  - negative reason when active panels are missing

**Gaps in extraction**

- segmented controls and pill button groups can still resemble tabs
- keyboard behavior is not validated at runtime
- tabs with remote-rendered or detached panels can under-score if linkage is weak
- no shadow DOM traversal

### `tooltip-detector.js`

**Patterns checked**

- tooltip semantics:
  - `role="tooltip"`
  - trigger linkage through `aria-describedby`, `data-tooltip-target`, or `data-describedby`
- tooltip naming:
  - `tooltip`, `tippy`, `hint`, `infotip`, `balloon`, `hovercard`
- popup heuristics:
  - compact text length
  - small bubble dimensions
  - absolute/fixed positioning
  - hidden-by-default candidates
  - non-interactive content only
- false-positive suppression:
  - reject dialogs, menus, tablists, progress bars, interactive popups, and long/multi-line popovers

**Gaps in extraction**

- interactive hover cards and popovers are intentionally filtered out, even when teams informally call them tooltips
- tooltips rendered through portals or shadow DOM can be missed
- runtime trigger timing and hover/focus behavior are not validated
- large rich-content help bubbles will under-score by design

## Cross-cutting gaps in the current extraction approach

These gaps show up across multiple detectors:

- **DOM-only heuristics:** detectors score rendered markup and attributes, but do not confirm runtime behavior beyond limited inline event-hook signals
- **shadow DOM blind spot:** the scripts query the regular DOM and do not traverse shadow roots
- **partial iframe handling:** iframe-aware logic exists only in some detectors, so cross-document coverage is uneven
- **naming dependence:** custom widgets with weak semantics and non-standard class/id naming are harder to identify
- **state inference over interaction testing:** open/closed, active/inactive, or visible/hidden states are inferred from DOM/CSS, not by exercising the widget
- **false-positive tradeoffs:** several detectors intentionally keep high thresholds or penalties, which reduces noise but can miss unusual implementations

## Practical follow-up opportunities

If extraction accuracy needs to improve, the biggest opportunities are:

1. add shared shadow DOM traversal utilities
2. standardize same-origin iframe scanning across all detectors
3. introduce optional runtime interaction probes for widgets with trigger/state transitions
4. expand non-English and framework-specific naming patterns
5. separate closely related widget families more explicitly, especially tabs vs segmented controls, tooltip vs popover, and menubar vs generic nav
