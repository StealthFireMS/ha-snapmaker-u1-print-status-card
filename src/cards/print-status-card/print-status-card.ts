import { customElement, state } from "lit/decorators.js";
import { html, LitElement, nothing } from "lit";
import type { PropertyValues } from "lit";
import styles from "./card.styles";
import { PRINT_STATUS_CARD_EDITOR_NAME, PRINT_STATUS_CARD_NAME } from "./const";
import { TOOL_COUNT } from "../../const";
import { registerCustomCard } from "../../utils/custom-cards";
import * as helpers from "../../utils/helpers";
import type { RegistryEntity, RoleMap } from "../../utils/helpers";

registerCustomCard({
  type: PRINT_STATUS_CARD_NAME,
  name: "Snapmaker U1 Print Status Card",
  description: "Graphical print status & control card for the Snapmaker U1 (Paxx / Moonraker)",
});

type MediaView = "webcam" | "thumbnail";

interface PersistedState {
  manualView: MediaView | null;
  /** The `_isActive()` value the manual override was chosen under - see `_currentMediaView()`. */
  manualActive: boolean | null;
}

function hash32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

@customElement(PRINT_STATUS_CARD_NAME)
export class SnapmakerU1PrintStatusCard extends LitElement {
  static styles = styles;

  // Marked @state so a `hass` update carrying new data for one of *this printer's* entities
  // re-renders the card. Home Assistant hands every card a fresh `hass` object on every state
  // change anywhere in the instance, so `shouldUpdate()` below filters those down to the ones
  // that actually affect what this card draws.
  @state() private _hass: any;
  private _config: any = {};
  private _deviceId: string | undefined;
  private _storageKey = "";
  private _roleCandidates = helpers.buildRoleCandidates(TOOL_COUNT);
  /** Last-seen state objects for the entities this card reads, keyed by entity_id. */
  private _trackedStates: { [entityId: string]: any } = {};

  @state() private _entities: RoleMap = {};
  @state() private _manualView: MediaView | null = null;
  @state() private _manualActive: boolean | null = null;
  /** The media `src` that most recently failed to load, so a broken image falls back to the placeholder. */
  @state() private _mediaErrorSrc: string | null = null;

  public static async getConfigElement() {
    await import("./print-status-card-editor");
    return document.createElement(PRINT_STATUS_CARD_EDITOR_NAME);
  }

  public static getStubConfig() {
    return {
      show_camera: true,
      default_view: "auto",
    };
  }

  // Current API (HA sections/grid view). Locked to exactly 12 columns x 5 rows - a landscape
  // box wide enough for the camera and stat sidebar to sit side by side. min === max on both
  // axes means the dashboard editor's resize handles can't drag it to any other size.
  public getGridOptions() {
    return {
      columns: 12,
      rows: 5,
      min_columns: 12,
      max_columns: 12,
      min_rows: 5,
      max_rows: 5,
    };
  }

  // Older API name, kept for HA cores that predate getGridOptions(). Same values.
  public getLayoutOptions() {
    return {
      grid_columns: 12,
      grid_rows: 5,
      grid_min_columns: 12,
      grid_max_columns: 12,
      grid_min_rows: 5,
      grid_max_rows: 5,
    };
  }

  // The masonry and panel dashboard views ignore getGridOptions()/getLayoutOptions() entirely and
  // ask for getCardSize() instead. A card that doesn't implement it is assumed to be 1 row tall,
  // which throws off masonry's column balancing - this card is the same 5 rows there as anywhere.
  public getCardSize() {
    return 5;
  }

  setConfig(config: any) {
    this._config = { show_camera: true, default_view: "auto", ...config };
    this._deviceId = config.printer;
    // Keyed on the printer alone rather than a hash of the whole config: the persisted bit is
    // "which media pane was I last looking at for this printer", and hashing every option meant
    // toggling an unrelated setting silently threw that away.
    this._storageKey = `${PRINT_STATUS_CARD_NAME}-${hash32(String(this._deviceId ?? ""))}`;
    this._loadPersistedState();

    if (this._hass && this._deviceId) {
      this._resolveEntities();
    }
  }

  set hass(hass: any) {
    const previous = this._hass;
    this._hass = hass;
    if (!hass || !this._deviceId) {
      return;
    }
    // Re-resolve whenever the entity registry itself changes, not just on the first `hass`.
    // HA replaces `hass.entities` wholesale when entities are added, removed or renamed, so this
    // covers the printer's entities arriving after the card (integration still starting up after
    // a restart, printer offline at boot, integration reloaded) - previously those cases left the
    // affected tiles missing until the browser was reloaded.
    if (!previous || hass.entities !== previous.entities) {
      this._resolveEntities();
    }
  }

  get hass() {
    return this._hass;
  }

  /**
   * Home Assistant sets `hass` on every card for every state change anywhere in the instance -
   * on a busy install that's many updates a second, none of which need be about this printer.
   * Re-render only when something this card actually draws has changed.
   */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!this.hasUpdated) {
      this._syncTrackedStates();
      return true;
    }
    // Any reactive property other than `_hass` changing is a deliberate local change (resolved
    // entities, the media toggle, an image that failed to load) and always warrants a render.
    let onlyHass = true;
    changed.forEach((_value, key) => {
      if (key !== "_hass") {
        onlyHass = false;
      }
    });
    if (!onlyHass) {
      this._syncTrackedStates();
      return true;
    }
    return this._syncTrackedStates();
  }

  /** Entity ids whose state this card reads - resolved roles plus any editor overrides. */
  private _trackedEntityIds(): string[] {
    const ids: string[] = [];
    for (const role in this._entities) {
      ids.push(this._entities[role].entity_id);
    }
    for (const key of ["camera_entity", "light_entity", "power_entity"]) {
      const id = this._config?.[key];
      if (id) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Compares the tracked entities' state objects against the last render's and records the new
   * ones. HA replaces an entity's state object on every change and leaves it untouched otherwise,
   * so identity comparison is both exact and cheap. Returns true when anything moved.
   */
  private _syncTrackedStates(): boolean {
    if (!this._hass) {
      return false;
    }
    let changed = false;
    const seen: { [entityId: string]: true } = {};
    for (const id of this._trackedEntityIds()) {
      seen[id] = true;
      const state = this._hass.states?.[id];
      if (this._trackedStates[id] !== state) {
        this._trackedStates[id] = state;
        changed = true;
      }
    }
    for (const id in this._trackedStates) {
      if (!seen[id]) {
        delete this._trackedStates[id];
        changed = true;
      }
    }
    return changed;
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    // The confirmation dialog deliberately lives on document.body (see helpers.ts), so nothing
    // else would clean it up if the card goes away while it's open.
    helpers.closeConfirmationDialog();
  }

  /**
   * Keeps the speed <select> showing the printer's actual speed.
   *
   * The template marks the right <option selected>, but that only drives the control until the
   * user first interacts with it: picking an option sets the select's "dirty value" flag, after
   * which the browser ignores changes to the options' `selected` *attribute*. So a speed changed
   * elsewhere (the printer's own touchscreen, an automation) would leave the dropdown displaying
   * whatever the user last picked. Assigning `.value` after each render is what actually moves it.
   */
  protected updated(changed: PropertyValues) {
    super.updated(changed);
    const select = this.renderRoot?.querySelector(".speed-select") as HTMLSelectElement | null;
    if (!select) {
      return;
    }
    const value = String(
      Math.round(helpers.getNumericState(this._hass, this._e("speed_factor")) ?? 100)
    );
    if (select.value !== value) {
      select.value = value;
    }
  }

  private _resolveEntities() {
    if (!this._hass || !this._deviceId) {
      return;
    }
    this._entities = helpers.resolveRoles(this._hass, this._deviceId, this._roleCandidates);
  }

  private _loadPersistedState() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<PersistedState>;
      this._manualView = saved.manualView ?? null;
      this._manualActive = saved.manualActive ?? null;
    } catch {
      // ignore corrupt storage
    }
  }

  private _savePersistedState() {
    try {
      const payload: PersistedState = {
        manualView: this._manualView,
        manualActive: this._manualActive,
      };
      localStorage.setItem(this._storageKey, JSON.stringify(payload));
    } catch {
      // storage may be unavailable (private browsing etc) - non-fatal
    }
  }

  // ---- entity access helpers -------------------------------------------------

  private _e(role: string): RegistryEntity | undefined {
    return this._entities[role];
  }

  private _cameraEntity(): RegistryEntity | undefined {
    if (this._config.camera_entity) {
      return { entity_id: this._config.camera_entity } as RegistryEntity;
    }
    return this._e("webcam");
  }

  private _lightEntity(): RegistryEntity | undefined {
    if (this._config.light_entity) {
      return { entity_id: this._config.light_entity } as RegistryEntity;
    }
    return this._e("cavity_light");
  }

  private _powerEntity(): RegistryEntity | undefined {
    if (this._config.power_entity) {
      return { entity_id: this._config.power_entity } as RegistryEntity;
    }
    return undefined;
  }

  // The printer's own Paxx touchscreen UI, reachable at http://<printer IP>/screen/. There's no
  // entity/attribute that reliably exposes the printer's LAN IP to every dashboard viewer (see
  // the module-level note in helpers.ts on why auto-discovery here sticks to entity data only),
  // so this is a manual field in the card editor rather than something auto-detected.
  private _screenUrl(): string {
    return helpers.normalizeUrl(this._config.screen_url ?? "", "/screen/");
  }

  private _printState(): string {
    const raw = helpers.getState(this._hass, this._e("print_state")).toLowerCase();
    if (raw) {
      return raw;
    }
    const idle = helpers.getState(this._hass, this._e("idle_timeout_state")).toLowerCase();
    return idle === "printing" ? "printing" : "standby";
  }

  private _isActive(): boolean {
    const state = this._printState();
    return state === "printing" || state === "paused";
  }

  // ---- render ------------------------------------------------------------------

  protected render() {
    if (!this._deviceId) {
      return html`
        <ha-card>
          <div class="message-row" style="padding: 24px 0;">
            Open this card's settings and choose your Snapmaker U1 (Moonraker) device.
          </div>
        </ha-card>
      `;
    }

    const showMedia = this._config.show_camera !== false;

    return html`
      <ha-card>
        <div class="top-row ${showMedia ? "" : "no-media"}">
          ${showMedia ? this._renderMedia() : nothing} ${this._renderStatsSidebar()}
        </div>
        ${this._renderStatusLine()} ${this._renderControls()} ${this._renderSliders()}
      </ha-card>
    `;
  }

  private _renderStatusLine() {
    const state = this._printState();
    const message = helpers.getState(this._hass, this._e("printer_message"));
    const showMessage = !!message && !/printer is ready/i.test(message);

    const progress = helpers.getNumericState(this._hass, this._e("progress"));
    const showProgress = progress !== undefined;
    const currentLayer = helpers.getState(this._hass, this._e("current_layer"));
    const totalLayer = helpers.getState(this._hass, this._e("total_layer"));
    const timeLeft = helpers.formatDuration(this._hass, this._e("print_time_left"));

    // Layer count, print percentage, and time remaining all live here alongside the plain
    // status text rather than as an overlay on top of the video, so they're always readable
    // and never sit on top of (and block clicks on) the camera's own icon buttons.
    // `progress` is already a percentage (moonraker-home-assistant's Progress sensor reports 0-100
    // with a PERCENTAGE unit) - it is NOT a 0-1 ratio, and multiplying it by 100 here is what used
    // to render "4200%" mid-print.
    const progressParts = [
      currentLayer && totalLayer ? `Layer ${currentLayer}/${totalLayer}` : "",
      helpers.formatPercent(progress),
      this._isActive() ? `${timeLeft} left` : "",
    ].filter(Boolean);

    return html`
      <div class="status-line">
        <span class="status-text">${state}</span>
        ${showMessage ? html`<span class="status-message">${message}</span>` : nothing}
        ${
          showProgress && progressParts.length
            ? html`<span class="status-progress">${progressParts.join(" · ")}</span>`
            : nothing
        }
      </div>
    `;
  }

  // In "auto" mode the manual toggle is an override for the *current* situation, not forever: it
  // lapses as soon as the printer starts or stops printing, at which point auto behaviour (webcam
  // while active, thumbnail otherwise) resumes. Previously the override was permanent and
  // persisted, so one tap disabled "auto" for that printer for good with no way to restore it.
  private _currentMediaView(): MediaView {
    if (this._config.default_view === "webcam") return "webcam";
    if (this._config.default_view === "thumbnail") return "thumbnail";
    const active = this._isActive();
    if (this._manualView && this._manualActive === active) {
      return this._manualView;
    }
    return active ? "webcam" : "thumbnail";
  }

  private _toggleMediaView() {
    const current = this._currentMediaView();
    this._manualView = current === "webcam" ? "thumbnail" : "webcam";
    this._manualActive = this._isActive();
    this._savePersistedState();
  }

  private _renderMedia() {
    const camera = this._cameraEntity();
    const thumbnail = this._e("thumbnail");
    const cameraOk = !!camera && !helpers.isEntityUnavailable(this._hass, camera);
    const thumbnailOk = !!thumbnail && !helpers.isEntityUnavailable(this._hass, thumbnail);
    const canToggle = this._config.default_view === "auto" && cameraOk && thumbnailOk;

    // Fall back to whichever source is actually usable. Without this, an unavailable thumbnail
    // while idle showed "Camera unavailable" *and* hid the toggle (which requires both sources),
    // leaving a dead panel with no way to reach a webcam that was working fine.
    let view = this._currentMediaView();
    if (view === "webcam" && !cameraOk && thumbnailOk) {
      view = "thumbnail";
    } else if (view === "thumbnail" && !thumbnailOk && cameraOk) {
      view = "webcam";
    }

    const entity = view === "webcam" ? camera : thumbnail;
    const unavailable = view === "webcam" ? !cameraOk : !thumbnailOk;
    const src =
      !unavailable && entity
        ? view === "webcam"
          ? helpers.getCameraStreamUrl(this._hass, entity)
          : helpers.getCameraImageUrl(this._hass, entity)
        : "";
    // A camera can be "available" but still serve a stale/404 entity_picture (a thumbnail from a
    // finished print, a rotated access token). Without an error handler that rendered as the
    // browser's broken-image glyph; now it falls back to the same placeholder as no camera at all.
    const broken = !!src && this._mediaErrorSrc === src;

    const progress = helpers.getNumericState(this._hass, this._e("progress"));
    const filename = helpers.getState(this._hass, this._e("filename")).replace(/\.gcode$/i, "");

    return html`
      <div class="media">
        ${
          src && !broken
            ? html`<img
                src=${src}
                alt="Printer view"
                @error=${() => {
                  this._mediaErrorSrc = src;
                }}
              />`
            : html`
                <div class="no-media">
                  <ha-icon icon="mdi:printer-3d"></ha-icon>
                  <span
                    >${camera || thumbnail ? "Camera unavailable" : "No camera configured"}</span
                  >
                </div>
              `
        }
        ${
          canToggle
            ? html`
                <ha-icon-button
                  class="media-view-toggle"
                  title=${view === "webcam" ? "Switch to thumbnail" : "Switch to live camera"}
                  @click=${this._toggleMediaView}
                >
                  <ha-icon icon="mdi:camera-outline"></ha-icon>
                </ha-icon-button>
              `
            : nothing
        }
        ${
          entity && !unavailable
            ? html`
                <ha-icon-button
                  class="media-expand"
                  title="Expand"
                  @click=${() => helpers.showEntityMoreInfo(this, entity!)}
                >
                  <ha-icon icon="mdi:arrow-expand"></ha-icon>
                </ha-icon-button>
              `
            : nothing
        }
        ${
          progress !== undefined
            ? html`
                <div class="media-overlay">
                  ${filename ? html`<div class="filename">${filename}</div>` : nothing}
                  <div class="progress-row">
                    <div class="progress-track">
                      <div
                        class="progress-fill"
                        style="width: ${Math.max(0, Math.min(100, progress))}%"
                      ></div>
                    </div>
                  </div>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  // A compact two-tier stat cell: a small icon+label(/target) row on top, a large primary
  // value below it. Used for bed/cavity/each tool so the sidebar can show several of these in
  // the space a single old-style boxed tile used to take.
  private _statCell(opts: {
    icon: string;
    label: string;
    value: string;
    sub?: string;
    heating?: boolean;
    onClick?: () => void;
    dot?: "present" | "out" | null;
    title?: string;
  }) {
    // A real <button> rather than a clickable <div>: these open the entity's more-info dialog, so
    // they need to be reachable and activatable from the keyboard and announced as controls.
    return html`
      <button class="stat-cell" title=${opts.title ?? ""} @click=${opts.onClick}>
        ${
          opts.dot
            ? html`<span
                class="filament-dot ${opts.dot}"
                title=${opts.dot === "present" ? "Filament loaded" : "Filament out"}
              ></span>`
            : nothing
        }
        <div class="stat-top">
          <ha-icon icon=${opts.icon}></ha-icon>
          <span class="stat-label">${opts.label}</span>
          ${opts.sub ? html`<span class="stat-target">${opts.sub}</span>` : nothing}
        </div>
        <div class="stat-value ${opts.heating ? "heating" : ""}">${opts.value}</div>
      </button>
    `;
  }

  private _renderStatsSidebar() {
    const bedTemp = this._e("bed_temp");
    const bedTarget = helpers.getNumericState(this._hass, this._e("bed_target"));
    const cavityTemp = this._e("cavity_temp");
    const cavityFanSpeed = this._e("cavity_fan_speed");

    const cavityFanPct = cavityFanSpeed
      ? helpers.getNumericState(this._hass, cavityFanSpeed)
      : undefined;

    const cells = [
      bedTemp
        ? this._statCell({
            icon: "mdi:widgets-outline",
            label: "Bed",
            sub: bedTarget ? `→ ${Math.round(bedTarget)}°` : undefined,
            value: helpers.formatTemp(this._hass, bedTemp),
            heating: !!bedTarget && bedTarget > 0,
            onClick: () => helpers.showEntityMoreInfo(this, bedTemp),
            title: bedTarget
              ? `Bed: ${helpers.formatTemp(this._hass, bedTemp)} (target ${Math.round(bedTarget)}°)`
              : `Bed: ${helpers.formatTemp(this._hass, bedTemp)}`,
          })
        : nothing,
      cavityTemp
        ? this._statCell({
            icon: "mdi:home-thermometer-outline",
            label: "Cavity",
            // No "sub" badge here (unlike Bed/E0-E3, which pair their label with a short
            // "→ target°"): "Cavity" is the longest label in the sidebar, and a 3-column cell
            // is only ~76px wide, so pairing it with a fan-speed badge too was overflowing and
            // getting clipped. The fan speed is still one tap away (this cell's own more-info,
            // its hover tooltip below, and the Cavity fan slider further down the card).
            value: helpers.formatTemp(this._hass, cavityTemp),
            onClick: () => helpers.showEntityMoreInfo(this, cavityTemp),
            title:
              cavityFanPct !== undefined
                ? `Cavity: ${helpers.formatTemp(this._hass, cavityTemp)} · Fan ${helpers.formatPercent(cavityFanPct)}`
                : `Cavity: ${helpers.formatTemp(this._hass, cavityTemp)}`,
          })
        : nothing,
    ];

    for (let n = 0; n < TOOL_COUNT; n++) {
      cells.push(this._renderToolStat(n));
    }

    const showMedia = this._config.show_camera !== false;
    return html`<div class="stats-sidebar ${showMedia ? "" : "full"}">${cells}</div>`;
  }

  private _renderToolStat(n: number) {
    const temp = this._e(`tool${n}_temp`);
    if (!temp) {
      return nothing;
    }
    const target = helpers.getNumericState(this._hass, this._e(`tool${n}_target`));
    const filament = this._e(`tool${n}_filament`);
    const filamentState = helpers.getState(this._hass, filament);
    const filamentClass =
      filamentState === "on" ? "present" : filamentState === "off" ? "out" : null;
    const filamentNote =
      filamentClass === "present"
        ? " · Filament loaded"
        : filamentClass === "out"
          ? " · Filament out"
          : "";

    return this._statCell({
      icon: "mdi:printer-3d-nozzle",
      label: `E${n}`,
      sub: target ? `→ ${Math.round(target)}°` : undefined,
      value: helpers.formatTemp(this._hass, temp),
      heating: !!target && target > 0,
      dot: filament ? filamentClass : null,
      onClick: () => helpers.showEntityMoreInfo(this, temp),
      title: `E${n}: ${helpers.formatTemp(this._hass, temp)}${target ? ` (target ${Math.round(target)}°)` : ""}${filamentNote}`,
    });
  }

  // One square icon button for the toolbar row. `active`/`danger` just add a color class;
  // the actual click handling and confirmation prompts are the caller's job.
  private _iconButton(opts: {
    icon: string;
    title: string;
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }) {
    return html`
      <button
        class="icon-btn ${opts.active ? "active" : ""} ${opts.danger ? "danger" : ""}"
        title=${opts.title}
        ?disabled=${opts.disabled}
        @click=${opts.onClick}
      >
        <ha-icon icon=${opts.icon}></ha-icon>
      </button>
    `;
  }

  private _renderControls() {
    const state = this._printState();
    const light = this._lightEntity();
    const power = this._powerEntity();
    const screenUrl = this._screenUrl();
    const pause = this._e("pause_print");
    const resume = this._e("resume_print");
    const cancel = this._e("cancel_print");
    const estop = this._e("emergency_stop");

    const buttons = [
      light
        ? this._iconButton({
            icon:
              helpers.getState(this._hass, light) === "on"
                ? "mdi:lightbulb-on"
                : "mdi:lightbulb-outline",
            title: "Cavity light",
            active: helpers.getState(this._hass, light) === "on",
            onClick: () => helpers.toggleDomain(this._hass, "light", light),
          })
        : nothing,
      power
        ? this._iconButton({
            icon: "mdi:power-plug",
            title: "Power plug",
            active: helpers.getState(this._hass, power) === "on",
            onClick: () => helpers.toggleDomain(this._hass, "switch", power),
          })
        : nothing,
      screenUrl
        ? this._iconButton({
            icon: "mdi:open-in-new",
            title: "Open printer touchscreen",
            onClick: () => helpers.openInNewTab(screenUrl),
          })
        : nothing,
      state === "paused" && resume
        ? this._iconButton({
            icon: "mdi:play",
            title: "Resume",
            onClick: () => helpers.pressButton(this._hass, resume),
          })
        : pause
          ? this._iconButton({
              icon: "mdi:pause",
              title: "Pause",
              disabled: state !== "printing",
              onClick: () => helpers.pressButton(this._hass, pause),
            })
          : nothing,
      cancel
        ? this._iconButton({
            icon: "mdi:stop",
            title: "Cancel print",
            danger: true,
            disabled: !this._isActive(),
            onClick: () =>
              helpers.showConfirmationDialog({
                title: "Cancel print?",
                text: "Cancel the current print? This can't be undone.",
                confirmText: "Cancel print",
                dismissText: "Keep printing",
                destructive: true,
                confirm: () => helpers.pressButton(this._hass, cancel),
              }),
          })
        : nothing,
      estop
        ? this._iconButton({
            icon: "mdi:alert-octagon",
            title: "Emergency stop",
            danger: true,
            onClick: () =>
              helpers.showConfirmationDialog({
                title: "Emergency stop?",
                text: "Trigger an EMERGENCY STOP? The printer will halt immediately and require a restart.",
                confirmText: "Emergency stop",
                dismissText: "Cancel",
                destructive: true,
                confirm: () => helpers.pressButton(this._hass, estop),
              }),
          })
        : nothing,
    ];

    return html`<div class="controls">${buttons}</div>`;
  }

  private _renderSliders() {
    const speedFactor = this._e("speed_factor");
    const cavityFanSpeed = this._e("cavity_fan_speed");
    return html`
      ${speedFactor ? this._renderSpeedPreset(speedFactor) : nothing}
      ${
        cavityFanSpeed
          ? this._renderSlider("mdi:fan", "Cavity fan", cavityFanSpeed, 0, 100)
          : nothing
      }
    `;
  }

  // Fixed speed presets rather than a free slider - a dropdown of the speeds that actually
  // matter (50/80/100/120/150%) is quicker to hit precisely than dragging a slider to a round
  // number. If the printer is currently at some other value (set from elsewhere, e.g. its own
  // touchscreen), that value is added to the list too so the dropdown always reflects reality
  // instead of silently showing the nearest preset.
  private static readonly SPEED_PRESETS = [50, 80, 100, 120, 150];

  private _renderSpeedPreset(entity: RegistryEntity) {
    const value = Math.round(helpers.getNumericState(this._hass, entity) ?? 100);
    const options = SnapmakerU1PrintStatusCard.SPEED_PRESETS.includes(value)
      ? SnapmakerU1PrintStatusCard.SPEED_PRESETS
      : [...SnapmakerU1PrintStatusCard.SPEED_PRESETS, value].sort((a, b) => a - b);

    return html`
      <div class="speed-row">
        <ha-icon icon="mdi:speedometer"></ha-icon>
        <span>Speed</span>
        <select
          class="speed-select"
          title="Print speed"
          @change=${(ev: Event) =>
            helpers.setNumberValue(
              this._hass,
              entity,
              Number((ev.target as HTMLSelectElement).value)
            )}
        >
          ${options.map(
            (opt) => html`<option value=${opt} ?selected=${opt === value}>${opt}%</option>`
          )}
        </select>
      </div>
    `;
  }

  private _renderSlider(
    icon: string,
    label: string,
    entity: RegistryEntity,
    min: number,
    max: number
  ) {
    const value = helpers.getNumericState(this._hass, entity) ?? min;
    return html`
      <div class="speed-row">
        <ha-icon icon=${icon}></ha-icon>
        <span>${label}</span>
        <input
          type="range"
          min=${min}
          max=${max}
          step="5"
          .value=${String(value)}
          @change=${(ev: Event) =>
            helpers.setNumberValue(
              this._hass,
              entity,
              Number((ev.target as HTMLInputElement).value)
            )}
        />
        <span class="speed-value">${Math.round(value)}%</span>
      </div>
    `;
  }
}
