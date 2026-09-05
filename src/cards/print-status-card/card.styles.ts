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
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    box-sizing: border-box;
    /* Hard stop: whatever doesn't fit in the locked box gets clipped/scrolled (see .info)
       rather than drawn outside the card's own border, however tall the content wants to be. */
    overflow: hidden;
  }

  .header {
    flex: 0 0 auto;
  }

  .body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }

  .info {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    /* If the tiles/controls/advanced content is still taller than the space left after the
       header and media, scroll it internally instead of pushing the card taller than 5 rows. */
    overflow-y: auto;
  }

  /* Wide card (roomy sections-view sizing, e.g. the default 12-column width): put the camera
     alongside the stats/controls instead of stacking everything, so a short-and-wide card
     doesn't force the media to dominate the available height. */
  @container u1-card (min-width: 480px) {
    .body:not(.no-media) {
      flex-direction: row;
      align-items: stretch;
    }
    .body:not(.no-media) .media {
      /* Size the camera panel off the *height* it's actually given (which is already capped
         by the locked card height) rather than off a share of the width - driving it from
         width was what let a wide-but-short 12x5 card push the media panel taller than the
         card itself. */
      flex: 0 0 auto;
      width: auto;
      height: 100%;
      max-width: 40%;
      aspect-ratio: 4 / 3;
    }
    .body:not(.no-media) .info {
      flex: 1 1 auto;
      justify-content: center;
    }
  }

  /* Extra-wide: give the tile grid room to breathe and bump up the title a touch. */
  @container u1-card (min-width: 720px) {
    .tiles {
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    }
    .header .title {
      font-size: 1.35rem;
    }
  }

  /* Narrow card (a small dashboard column, or a phone-width dashboard where even a "full
     width" 12-column card renders narrow): tighten up the tile grid and controls so nothing
     gets too cramped to read or tap. */
  @container u1-card (max-width: 320px) {
    .tiles {
      grid-template-columns: repeat(2, 1fr);
    }
    .controls ha-button {
      min-width: 0;
      font-size: 0.85rem;
    }
    .header .title {
      font-size: 1.05rem;
    }
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header .title {
    font-size: 1.2rem;
    font-weight: 500;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: capitalize;
    color: white;
    background: var(--disabled-text-color);
    white-space: nowrap;
  }
  .status-pill.printing {
    background: var(--info-color, #039be5);
  }
  .status-pill.paused {
    background: var(--warning-color, #ff9800);
  }
  .status-pill.complete {
    background: var(--success-color, #4caf50);
  }
  .status-pill.error,
  .status-pill.cancelled {
    background: var(--error-color, #db4437);
  }
  .status-pill.standby,
  .status-pill.ready {
    background: var(--disabled-text-color, #9e9e9e);
  }

  .header-icons {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .header-icons ha-icon-button {
    --mdc-icon-button-size: 36px;
  }
  .header-icons ha-icon-button.active {
    color: var(--u1-accent);
  }

  .media {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: var(--ha-card-border-radius, 12px);
    overflow: hidden;
    background: var(--secondary-background-color, #eee);
  }
  .media img {
    width: 100%;
    height: 100%;
    object-fit: contain;
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
    --mdc-icon-size: 48px;
  }

  .media-toggle {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.55);
    border-radius: 50%;
    color: white;
    --mdc-icon-button-size: 36px;
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
  .media-overlay .meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    opacity: 0.9;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
    gap: 8px;
  }

  .tile {
    background: var(--secondary-background-color, #f2f2f2);
    border-radius: 10px;
    padding: 8px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    cursor: pointer;
    position: relative;
    min-width: 0;
  }
  .tile:hover {
    filter: brightness(0.97);
  }
  .tile.unavailable {
    opacity: 0.4;
    pointer-events: none;
  }
  .tile.active-tool {
    box-shadow: 0 0 0 2px var(--u1-accent) inset;
  }
  .tile ha-icon {
    --mdc-icon-size: 18px;
    color: var(--secondary-text-color);
  }
  .tile .tile-label {
    font-size: 0.68rem;
    color: var(--secondary-text-color);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .tile .tile-value {
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1.1;
  }
  .tile .tile-sub {
    font-size: 0.68rem;
    color: var(--secondary-text-color);
  }
  .tile.heating .tile-value {
    color: var(--warning-color, #ff9800);
  }
  .tile .filament-dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--disabled-text-color);
  }
  .tile .filament-dot.present {
    background: var(--success-color, #4caf50);
  }
  .tile .filament-dot.out {
    background: var(--error-color, #db4437);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .controls ha-button {
    flex: 1 1 auto;
    min-width: 84px;
  }
  .controls .icon-button {
    --mdc-icon-button-size: 44px;
  }
  .controls .stop-button {
    --mdc-theme-primary: var(--error-color, #db4437);
    color: var(--error-color, #db4437);
  }

  .speed-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.85rem;
    color: var(--secondary-text-color);
  }
  .speed-row ha-icon {
    --mdc-icon-size: 18px;
  }
  .speed-row input[type="range"] {
    flex: 1;
    accent-color: var(--u1-accent);
  }
  .speed-row .speed-value {
    min-width: 42px;
    text-align: right;
    color: var(--primary-text-color);
    font-weight: 600;
  }

  .advanced-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 0.78rem;
    color: var(--secondary-text-color);
    cursor: pointer;
    padding: 2px 0;
  }
  .advanced-toggle ha-icon {
    --mdc-icon-size: 16px;
  }

  .advanced {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid var(--divider-color);
    padding-top: 8px;
  }
  .advanced .row {
    display: flex;
    justify-content: space-between;
    font-size: 0.82rem;
  }
  .advanced .row span:first-child {
    color: var(--secondary-text-color);
  }
  .advanced .axis-buttons {
    display: flex;
    gap: 6px;
    justify-content: center;
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

  ha-dialog .content {
    padding: 8px 4px;
  }
`;
