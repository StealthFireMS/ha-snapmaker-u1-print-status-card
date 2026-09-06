import { css } from "lit";

export default css`
  :host {
    --u1-accent: var(--primary-color);
    --u1-tile-bg: var(--ha-card-background, var(--card-background-color, #fff));
    /* Lets the card react to its own rendered width (see @container rules below). The card's
       size itself is locked to 12x5 via getGridOptions()/getLayoutOptions() - this is purely
       about the internal layout adapting to whatever pixel size that 12x5 actually renders at
       (a phone vs. a wide desktop dashboard aren't the same number of pixels). */
    container-type: inline-size;
    container-name: u1-card;
    display: block;
    /* Fill exactly the height the dashboard grid gives a 12x5 card. Without this the card
       falls back to its content's natural height, which is taller than a locked 5-row box and
       visually spills out past it instead of staying inside the size the user set. Percentage
       heights are a no-op (resolve to auto) anywhere that doesn't hand down an explicit height,
       so this is a no-op outside the sections/grid view. */
    height: 100%;
  }

  ha-card {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    box-sizing: border-box;
    /* Hard stop: whatever doesn't fit in the locked box gets clipped/scrolled (see .stats-sidebar)
       rather than drawn outside the card's own border, however tall the content wants to be. */
    overflow: hidden;
  }

  /* ---- top row: camera + compact stat sidebar side by side ------------------------------- */

  .top-row {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    gap: 8px;
  }
  .top-row.no-media {
    flex: 0 0 auto;
  }

  /* Very narrow rendering (a small dashboard column, or a phone-width dashboard): stack
     instead of side-by-side so nothing gets squeezed unreadably thin. The card is locked to
     12x5, so this is a safety net for unusual embeddings rather than the everyday case. */
  @container u1-card (max-width: 360px) {
    .top-row:not(.no-media) {
      flex-direction: column;
    }
    /* Both panes share the stacked column's height proportionally and are allowed to shrink
       (min-height: 0) rather than the sidebar forcing its full content height regardless of
       how much room is actually available - that mismatch was overflowing .top-row's own box
       even though nothing overflowed the card overall. The sidebar scrolls internally as a
       last resort if it still doesn't fit once fully shrunk. */
    .top-row:not(.no-media) .media {
      flex: 1 1 40%;
      min-height: 0;
    }
    .top-row:not(.no-media) .stats-sidebar {
      flex: 1 1 60%;
      max-width: none;
      min-height: 0;
      overflow-y: auto;
    }
  }

  .media {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    border-radius: var(--ha-card-border-radius, 12px);
    overflow: hidden;
    background: var(--secondary-background-color, #eee);
  }
  .media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: black;
  }
  .media .no-media {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--secondary-text-color);
    flex-direction: column;
    gap: 8px;
  }
  .media .no-media ha-icon {
    --mdc-icon-size: 40px;
  }

  .media-view-toggle {
    position: absolute;
    top: 4px;
    left: 4px;
    color: white;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
    --mdc-icon-button-size: 32px;
  }

  .media-expand {
    position: absolute;
    bottom: 4px;
    right: 4px;
    color: white;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
    --mdc-icon-button-size: 32px;
  }

  .media-overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 8px 10px 6px 10px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0));
    color: white;
    display: flex;
    flex-direction: column;
    gap: 4px;
    /* Purely informational (filename + a progress bar, no controls of its own) - without this,
       its transparent hit-box sat on top of the expand button in the bottom-right corner and
       silently ate its clicks even though the button was still visible underneath. */
    pointer-events: none;
  }
  .media-overlay .filename {
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .media-overlay .progress-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
  }
  .media-overlay .progress-track {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.3);
    overflow: hidden;
  }
  .media-overlay .progress-fill {
    height: 100%;
    background: var(--u1-accent);
    border-radius: 3px;
    transition: width 0.4s ease;
  }

  /* ---- compact stat sidebar --------------------------------------------------------------- */

  .stats-sidebar {
    flex: 0 0 38%;
    /* At the old 230px cap, a 3-column cell's usable width (after its own padding) came out to
       ~66px - just barely too narrow for "Bed" + "→ 60°" together at the default font size, so
       the Bed cell was truncating to "B..." / "→ ..." on every dashboard wide enough to hit this
       cap (i.e. most of them), not just unusually narrow ones. 256px gives each cell a few more
       pixels, which is enough for the common two-digit-temperature case while staying well
       inside "compact sidebar" territory; the per-cell ellipsis handling above still catches
       anything longer (a 3-digit target, a heavily customized label, etc).  */
    max-width: 256px;
    min-width: 130px;
    display: grid;
    /* 3 columns (2 rows for up to 6 cells - bed, cavity, 4 tools) rather than 2 columns (3 rows):
       the sidebar's height is whatever's left over after the camera/status/controls/sliders, and
       a 3-row stack of cells could ask for more height than that leftover space actually has,
       clipping the bottom row against stats-sidebar's own overflow:hidden. Fewer rows keeps each
       cell's fixed content height comfortably inside the space that's actually available. */
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    /* The grid's own background shows through the 1px gaps as hairline dividers between cells -
       simpler and more robust than adding individual borders to a dynamic set of cells. */
    background: var(--divider-color);
    border-radius: 10px;
    overflow: hidden;
    /* Default (stretch) content alignment: the rows share the sidebar's full height evenly
       rather than clumping at the top and leaving dead space below on a tall media panel. */
    align-content: stretch;
  }
  .stats-sidebar.full {
    flex: 1 1 auto;
    max-width: none;
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  }

  /* A real <button> (so each cell is focusable and activatable from the keyboard - they open the
     entity's more-info dialog), stripped back to look exactly like the plain cell it replaced. */
  .stat-cell {
    background: var(--u1-tile-bg);
    padding: 4px 5px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    cursor: pointer;
    position: relative;
    min-width: 0;
    border: none;
    margin: 0;
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    color: inherit;
    text-align: left;
    -webkit-appearance: none;
    appearance: none;
  }
  .stat-cell:hover {
    filter: brightness(0.97);
  }
  .stat-cell:focus-visible {
    outline: 2px solid var(--u1-accent);
    outline-offset: -2px;
  }
  .stat-top {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.62rem;
    color: var(--secondary-text-color);
    text-transform: uppercase;
    letter-spacing: 0.02em;
    min-width: 0;
  }
  .stat-top ha-icon {
    --mdc-icon-size: 13px;
    flex: 0 0 auto;
  }
  /* Both the label ("Cavity") and the target/sub value share one tight row in a 3-column grid
     cell - either can end up too wide to fit (e.g. "Cavity" is longer than "Bed"/"E0"). Each
     gets its own min-width:0 + ellipsis so it shrinks and truncates gracefully instead of the
     row hard-clipping mid-character against the cell's outer overflow:hidden. The cell's own
     title attribute (see print-status-card.ts) always has the untruncated text on hover. */
  .stat-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stat-target {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 55%;
    margin-left: auto;
    text-transform: none;
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stat-value {
    font-size: 1.15rem;
    font-weight: 600;
    line-height: 1.15;
  }
  .stat-value.heating {
    color: var(--warning-color, #ff9800);
  }
  .stat-cell .filament-dot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--disabled-text-color);
  }
  .stat-cell .filament-dot.present {
    background: var(--success-color, #4caf50);
  }
  .stat-cell .filament-dot.out {
    background: var(--error-color, #db4437);
  }

  /* ---- status line, below the top row ------------------------------------------------------ */

  .status-line {
    flex: 0 0 auto;
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 0.8rem;
    min-width: 0;
    flex-wrap: wrap;
  }
  .status-text {
    flex: 0 0 auto;
    color: var(--secondary-text-color);
    text-transform: capitalize;
  }
  .status-message {
    flex: 1 1 auto;
    color: var(--secondary-text-color);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  /* Layer count / percent / time-left, moved here from an overlay on top of the video so
     they're always legible and never sit on top of (and block clicks on) the camera's own
     buttons. Pushed to the far right of the row via margin-left:auto. */
  .status-progress {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--secondary-text-color);
    white-space: nowrap;
  }

  /* ---- icon-button toolbar ------------------------------------------------------------------ */

  .controls {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }
  .icon-btn {
    /* A fixed, tasteful button size rather than stretching to divide up the full row width -
       on a locked-wide 12-column card that stretch made each button balloon to well over
       100px square. Centered as a compact group instead of spread edge to edge. */
    width: 48px;
    height: 48px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--secondary-background-color, #333);
    color: var(--primary-text-color);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    padding: 0;
    font: inherit;
  }
  .icon-btn ha-icon {
    --mdc-icon-size: 20px;
    pointer-events: none;
  }
  .icon-btn:hover:not(:disabled) {
    filter: brightness(1.15);
  }
  .icon-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .icon-btn.active {
    background: var(--u1-accent);
    color: white;
  }
  .icon-btn.danger {
    color: var(--error-color, #db4437);
  }

  /* ---- sliders -------------------------------------------------------------------------- */

  .speed-row {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.8rem;
    color: var(--secondary-text-color);
  }
  .speed-row ha-icon {
    --mdc-icon-size: 16px;
  }
  .speed-row input[type="range"] {
    flex: 1;
    accent-color: var(--u1-accent);
  }
  .speed-row .speed-value {
    min-width: 38px;
    text-align: right;
    color: var(--primary-text-color);
    font-weight: 600;
  }
  .speed-select {
    margin-left: auto;
    background: var(--secondary-background-color, #333);
    color: var(--primary-text-color);
    border: none;
    border-radius: 8px;
    padding: 4px 10px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .message-row {
    font-size: 0.78rem;
    color: var(--secondary-text-color);
    text-align: center;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
