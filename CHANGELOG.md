# Changelog

## 0.1.5

### Fixed

- **Emergency Stop (and Cancel print) couldn't actually be triggered** - the confirmation dialog
  showed its text, but confirming it did nothing. Root cause: the card's own CSS container query
  setup (`container-type` on the card, needed for it to reflow at different sizes) makes the card
  establish a new containing block for `position: fixed` elements, the same way a CSS `transform`
  does. The confirmation dialog was a plain `<ha-dialog>` rendered inside the card's own shadow
  DOM, so it ended up confined to the card's small on-screen box instead of covering the screen,
  leaving its buttons out of reach. Fixed by routing both confirmations through Home Assistant's
  own built-in confirmation dialog (the same one HA's UI uses for things like delete
  confirmations), which renders at the top of the document and isn't affected by the card's own
  containment.
- **The camera's expand button couldn't be clicked** while a print was active - the progress
  overlay drawn on top of the video (filename/progress bar) sat on top of it in paint order, and
  its transparent hit-area silently absorbed the click even though the button was still visible
  underneath. Fixed by making that overlay non-interactive (`pointer-events: none`), so clicks
  always reach the buttons drawn over the video regardless of what else is on top of it visually.
- **The Cavity temperature cell's text was getting clipped** - it was the only sidebar cell
  pairing a longer label ("Cavity") with a second badge (fan speed), and the two together didn't
  fit the sidebar's compact ~76px-wide cells. Removed the fan-speed badge from that cell (it's
  still one tap away via the cell's own more-info, its hover tooltip, and the Cavity fan slider
  further down the card) and added an ellipsis fallback to every stat cell so any future overflow
  truncates gracefully instead of hard-clipping mid-character.

### Changed

- Moved the layer count (`Layer X/Y`) and print percentage off the video overlay and down to the
  status line, next to the plain-text print state - both are always legible there and can no
  longer end up sitting on top of (and blocking clicks on) the camera's own buttons. The time
  remaining moved down alongside them for the same reason.
- Added a hover tooltip to every stat cell (Bed/Cavity/E0-E3) with its full reading, and to the
  small filament-present dot on each tool cell explaining what it means: green = filament loaded,
  red = filament out. Handy since the compact cells only have room for a couple of digits at a
  glance.

## 0.1.4

### Changed

Redesigned the card's layout and visual style to match a more compact, dashboard-toolbar look
(based on reference screenshots of a similar card's design):

- Dropped the title header row. The camera and stats now start right at the top of the card.
- The camera and a compact stat sidebar now sit side by side as the card's main content, instead
  of the camera on top with a grid of boxed tiles below. The sidebar shows bed/cavity/tool stats
  as small two-tier cells (a tiny icon+target row over a large current-value number) separated by
  hairline dividers, rather than individually boxed tiles.
- The camera's view-toggle icon moved to the top-left of the image; a new expand icon in the
  bottom-right opens the camera/thumbnail entity's more-info dialog for a bigger view.
- The print state (e.g. "Printing", "Offline") is now a plain text line below the camera/stats
  row instead of a colored pill in the header.
- All actions - cavity light, power plug, pause/resume, cancel, and emergency stop - are now a
  single row of square icon-only buttons (previously light/power were header icons and
  pause/resume/cancel were text-labeled pill buttons). Each button has a tooltip via its title
  attribute for accessibility.

### Fixed

- The icon-button toolbar had a sizing bug where, on the card's wide default size, each button
  would stretch to divide up the full row width and then balloon into a huge square (its
  `aspect-ratio: 1` made height follow that stretched width). Buttons are now a fixed, sane size
  and centered as a compact group.
- On very narrow renders (well below the card's locked size - a safety net for unusual
  embeddings, not the normal case), the stat sidebar could demand more height than the stacked
  layout actually had available and overflow past its own row, even though the card as a whole
  still didn't exceed its box. Fixed by letting the sidebar shrink and scroll internally there,
  same as elsewhere.
- At the card's normal (default) size, the stat sidebar's 2-column grid needed 3 rows to fit
  bed/cavity/4 tools (6 cells), and that 3-row stack could ask for more height than the sidebar
  actually had, silently clipping the bottom row (usually E2/E3) against the sidebar's own
  `overflow: hidden`. Switched to a 3-column grid (2 rows for 6 cells) so it comfortably fits the
  space actually available instead of relying on there being enough room for a 3rd row.

## 0.1.3

### Fixed

- **Card size wasn't actually respected** - the 12x5 default from 0.1.2 was only a starting
  suggestion, and the card's real content could render taller than the box the dashboard gave
  it, spilling visually past its own edges instead of staying inside them. Fixed by locking the
  size outright (`min_columns`/`max_columns` and `min_rows`/`max_rows` all equal `12`/`5` in
  `getGridOptions()`/`getLayoutOptions()`, so the resize handles can't move it), having the card
  actually fill the height that size hands it (`height: 100%` from the host down through
  `ha-card`) instead of sizing itself off its own content, and clipping/scrolling anything that's
  still too tall to fit rather than letting it draw outside the card.
- Reworked the wide (side-by-side) layout so the camera panel's size comes from the _height_ it's
  given rather than a share of the width - sizing it off width is what let a short-but-wide 12x5
  card push the camera taller than the card itself on wide screens.

### Removed

- The single "Home all axes" button in the main controls row. The individual Home X / Home Y /
  Home Z buttons in the Advanced section are unaffected.

## 0.1.2

### Changed

- **Default card size is now 12 columns x 5 rows** in the Home Assistant sections/grid view
  (previously 4 columns x 8 rows) - a shorter, wider footprint in line with other graphical
  print-status cards, added via `getGridOptions()` (the current sizing API) with `getLayoutOptions()`
  kept alongside it for older HA cores. The card stays resizable: it can be dragged down to 6x3
  or up to a full-width 12x10, the 12x5 default is just where it starts.
- **The card now adapts its own layout to whatever size it's actually rendered at**, using CSS
  container queries (`container-type: inline-size` on the card itself, not just a fixed set of
  screen-width breakpoints, so it reacts correctly however it's embedded - sections view,
  masonry view, a narrow sidebar, etc.):
  - At its default width and wider, the camera sits beside the stats/controls instead of on top
    of them, so a short-and-wide card doesn't force the media panel to eat all the vertical
    space.
  - Narrower than ~320px, the tool-tile grid drops to a fixed 2-column layout and button/title
    text sizes tighten up, so nothing gets crushed if the card is dragged smaller.
  - Wider than ~720px, the tile grid and header title get a little more breathing room.

## 0.1.1

### Fixed

- **Card rendered blank in normal dashboard view** (visible only as an empty placeholder while
  editing the dashboard), with the browser console repeatedly logging
  `ReferenceError: _k is not defined` from the built bundle.

  Root cause: the Rollup build ran the bundled output through Babel (`@rollup/plugin-babel`'s
  `getBabelOutputPlugin`) with `@babel/preset-env` and no explicit `targets`. With no targets,
  preset-env fell back to its old default and downleveled native classes (and other modern
  syntax Lit relies on) into ES5 function-based class helpers. Running Terser's minifier over
  that downleveled output then corrupted a self-reference inside one of Lit's internal classes,
  leaving a reference to a minified name (`_k`) that was never declared - so every render threw.

  Fixed by targeting `esmodules: true` in the `@babel/preset-env` config, since Home Assistant's
  frontend only ever runs in evergreen, ES-module-capable browsers - there is nothing that
  actually needs downleveling, so Babel now passes modern syntax through untouched.

- Added `scripts/smoke-render.mjs`, a jsdom-based smoke test that mounts the _built_ bundle and
  forces every render branch (including the array-mapped tool tiles and advanced-info rows,
  which is exactly the code path that broke) to catch this class of bug in CI going forward -
  neither `npm run build:strict` (a TypeScript source check) nor `npm run verify` (an
  entity-resolver logic check) executes the actual minified bundle a browser receives, so this
  regression slipped past both. It now runs via `npm run smoke` in both CI workflows.

## 0.1.0

Initial release.
