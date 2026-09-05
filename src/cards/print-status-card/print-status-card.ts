import { customElement, state } from "lit/decorators.js";
import { html, LitElement, nothing } from "lit";
import styles from "./card.styles";
import { PRINT_STATUS_CARD_EDITOR_NAME, PRINT_STATUS_CARD_NAME } from "./const";
import { INTEGRATION_DOMAIN, TOOL_COUNT } from "../../const";
import { registerCustomCard } from "../../utils/custom-cards";
import * as helpers from "../../utils/helpers";
import type { RegistryEntity, RoleMap } from "../../utils/helpers";

registerCustomCard({
  type: PRINT_STATUS_CARD_NAME,
  name: "Snapmaker U1 Print Status Card",
  description: "Graphical print status & control card for the Snapmaker U1 (Paxx / Moonraker)",
});

type MediaView = "webcam" | "thumbnail";

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

  // Marked @state so every `hass` update (new temperatures, progress, etc.) re-renders the card.
  @state() private _hass: any;
  private _config: any = {};
  private _deviceId: string | undefined;
  private _storageKey = "";
  private _roleCandidates = helpers.buildRoleCandidates(TOOL_COUNT);

  @state() private _entities: RoleMap = {};
  @state() private _manualView: MediaView | null = null;
  @state() private _advancedExpanded = false;

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

  setConfig(config: any) {
    this._config = { show_camera: true, default_view: "auto", ...config };
    this._deviceId = config.printer;
    this._storageKey = `${PRINT_STATUS_CARD_NAME}-${hash32(JSON.stringify(config))}`;
    this._loadPersistedState();

    if (this._hass && this._deviceId) {
      this._resolveEntities();
    }
  }

  set hass(hass: any) {
    const firstTime = hass && !this._hass;
    this._hass = hass;
    if (firstTime && this._deviceId) {
      this._resolveEntities();
    }
  }

  get hass() {
    return this._hass;
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
      const saved = JSON.parse(raw);
      this._manualView = saved.manualView ?? null;
      this._advancedExpanded = !!saved.advancedExpanded;
    } catch {
      // ignore corrupt storage
    }
  }

  private _savePersistedState() {
    try {
      localStorage.setItem(
        this._storageKey,
        JSON.stringify({ manualView: this._manualView, advancedExpanded: this._advancedExpanded })
      );
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
        ${this._renderAdvancedToggle()} ${this._advancedExpanded ? this._renderAdvanced() : nothing}
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
    const progressParts = [
      currentLayer && totalLayer ? `Layer ${currentLayer}/${totalLayer}` : "",
      helpers.formatPercent(progress, true),
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

  private _currentMediaView(): MediaView {
    if (this._config.default_view === "webcam") return "webcam";
    if (this._config.default_view === "thumbnail") return "thumbnail";
    if (this._manualView) return this._manualView;
    return this._isActive() ? "webcam" : "thumbnail";
  }

  private _toggleMediaView() {
    const current = this._currentMediaView();
    this._manualView = current === "webcam" ? "thumbnail" : "webcam";
    this._savePersistedState();
  }

  private _renderMedia() {
    const view = this._currentMediaView();
    const camera = this._cameraEntity();
    const thumbnail = this._e("thumbnail");
    const canToggle =
      this._config.default_view === "auto" &&
      camera &&
      thumbnail &&
      !helpers.isEntityUnavailable(this._hass, camera) &&
      !helpers.isEntityUnavailable(this._hass, thumbnail);

    const entity = view === "webcam" ? camera : thumbnail || camera;
    const unavailable = !entity || helpers.isEntityUnavailable(this._hass, entity);
    const src =
      !unavailable && entity
        ? view === "webcam"
          ? helpers.getCameraStreamUrl(this._hass, entity)
          : helpers.getCameraImageUrl(this._hass, entity)
        : "";

    const progress = helpers.getNumericState(this._hass, this._e("progress"));
    const filename = helpers.getState(this._hass, this._e("filename")).replace(/\.gcode$/i, "");

    return html`
      <div class="media">
        ${
          src
            ? html`<img src=${src} alt="Printer view" />`
            : html`
                <div class="no-media">
                  <ha-icon icon="mdi:printer-3d"></ha-icon>
                  <span>${entity ? "Camera unavailable" : "No camera configured"}</span>
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
                  @click=${() => helpers.showEntityMoreInfo(this, entity)}
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
                        style="width: ${Math.max(0, Math.min(100, progress * 100))}%"
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
    return html`
      <div class="stat-cell" title=${opts.title ?? ""} @click=${opts.onClick}>
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
      </div>
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
              helpers.showConfirmationDialog(this, {
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
              helpers.showConfirmationDialog(this, {
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
      ${speedFactor ? this._renderSlider("mdi:speedometer", "Speed", speedFactor, 25, 200) : nothing}
      ${
        cavityFanSpeed
          ? this._renderSlider("mdi:fan", "Cavity fan", cavityFanSpeed, 0, 100)
          : nothing
      }
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

  private _renderAdvancedToggle() {
    return html`
      <div
        class="advanced-toggle"
        @click=${() => {
          this._advancedExpanded = !this._advancedExpanded;
          this._savePersistedState();
        }}
      >
        <ha-icon icon=${this._advancedExpanded ? "mdi:chevron-up" : "mdi:chevron-down"}></ha-icon>
        ${this._advancedExpanded ? "Hide" : "Show"} advanced details
      </div>
    `;
  }

  private _renderAdvanced() {
    const x = helpers.getNumericState(this._hass, this._e("toolhead_x"));
    const y = helpers.getNumericState(this._hass, this._e("toolhead_y"));
    const z = helpers.getNumericState(this._hass, this._e("toolhead_z"));
    const duration = helpers.formatDuration(this._hass, this._e("print_duration"));
    const eta = helpers.formatEta(this._hass, this._e("print_eta"));
    const totalPrintTime = helpers.getState(this._hass, this._e("total_print_time"));
    const totalFilament = helpers.getState(this._hass, this._e("total_filament_used"));
    const totalJobs = helpers.getState(this._hass, this._e("total_jobs"));
    const mcuLoad = helpers.getNumericState(this._hass, this._e("mcu_load"));
    const systemLoad = helpers.getNumericState(this._hass, this._e("system_load"));
    const objectHeight = helpers.getNumericState(this._hass, this._e("object_height"));
    const filamentUsed = helpers.getNumericState(this._hass, this._e("filament_used"));
    const printSpeed = helpers.getNumericState(this._hass, this._e("print_speed"));
    const queueState = helpers.getState(this._hass, this._e("queue_state"));
    const jobsInQueue = helpers.getNumericState(this._hass, this._e("jobs_in_queue"));
    const longestPrint = helpers.getState(this._hass, this._e("longest_print"));
    const headHub = this._e("head_hub_switch");
    const homeX = this._e("home_x_axis");
    const homeY = this._e("home_y_axis");
    const homeZ = this._e("home_z_axis");

    const rows: any[] = [];
    if (this._isActive()) {
      rows.push(["Elapsed", duration]);
      rows.push(["ETA", eta]);
      if (printSpeed !== undefined) rows.push(["Print speed", `${Math.round(printSpeed)} mm/s`]);
      if (objectHeight) rows.push(["Object height", `${objectHeight.toFixed(1)} mm`]);
      if (filamentUsed) rows.push(["Filament used (this print)", `${Math.round(filamentUsed)} mm`]);
    }
    if (x !== undefined) {
      rows.push([
        "Toolhead position",
        `X ${x.toFixed(1)}  Y ${(y ?? 0).toFixed(1)}  Z ${(z ?? 0).toFixed(1)}`,
      ]);
    }
    if (queueState && jobsInQueue !== undefined && jobsInQueue > 0) {
      rows.push(["Print queue", `${jobsInQueue} queued (${queueState})`]);
    }
    if (totalPrintTime) rows.push(["Lifetime print time", totalPrintTime]);
    if (totalFilament) rows.push(["Lifetime filament used", totalFilament]);
    if (totalJobs) rows.push(["Lifetime jobs", totalJobs]);
    if (longestPrint) rows.push(["Longest print", longestPrint]);
    if (mcuLoad !== undefined) rows.push(["MCU load", helpers.formatPercent(mcuLoad, true)]);
    if (systemLoad !== undefined)
      rows.push(["System load", helpers.formatPercent(systemLoad, true)]);

    return html`
      <div class="advanced">
        ${rows.map(([label, value]) => html`<div class="row"><span>${label}</span><span>${value}</span></div>`)}
        ${
          headHub
            ? html`
                <div class="row">
                  <span>Tool hub power</span>
                  <ha-switch
                    .checked=${helpers.getState(this._hass, headHub) === "on"}
                    @change=${() => helpers.toggleDomain(this._hass, "switch", headHub)}
                  ></ha-switch>
                </div>
              `
            : nothing
        }
        ${
          homeX || homeY || homeZ
            ? html`
                <div class="axis-buttons">
                  ${
                    homeX
                      ? html`<ha-button @click=${() => helpers.pressButton(this._hass, homeX)}
                          >Home X</ha-button
                        >`
                      : nothing
                  }
                  ${
                    homeY
                      ? html`<ha-button @click=${() => helpers.pressButton(this._hass, homeY)}
                          >Home Y</ha-button
                        >`
                      : nothing
                  }
                  ${
                    homeZ
                      ? html`<ha-button @click=${() => helpers.pressButton(this._hass, homeZ)}
                          >Home Z</ha-button
                        >`
                      : nothing
                  }
                </div>
              `
            : nothing
        }
      </div>
    `;
  }
}
