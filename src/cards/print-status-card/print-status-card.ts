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

interface ConfirmAction {
  body: string;
  destructive?: boolean;
  run: () => void;
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

  // Marked @state so every `hass` update (new temperatures, progress, etc.) re-renders the card.
  @state() private _hass: any;
  private _config: any = {};
  private _deviceId: string | undefined;
  private _storageKey = "";
  private _roleCandidates = helpers.buildRoleCandidates(TOOL_COUNT);

  @state() private _entities: RoleMap = {};
  @state() private _manualView: MediaView | null = null;
  @state() private _advancedExpanded = false;
  @state() private _confirm: ConfirmAction | null = null;

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

  // Current API (HA sections/grid view). 12 columns x 5 rows is the primary/default size -
  // roughly a landscape card wide enough for the camera and stat tiles to sit side by side.
  // Still resizable by the user within the min/max bounds below.
  // min === max on both axes locks the card at exactly 12x5 - the dashboard editor's resize
  // handles won't be able to drag it to any other size.
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
        ${this._renderHeader()}
        <div class="body ${showMedia ? "" : "no-media"}">
          ${showMedia ? this._renderMedia() : nothing}
          <div class="info">
            ${this._renderMessage()} ${this._renderTiles()} ${this._renderControls()}
            ${this._renderAdvancedToggle()}
            ${this._advancedExpanded ? this._renderAdvanced() : nothing}
          </div>
        </div>
      </ha-card>
      ${this._confirm ? this._renderConfirmDialog() : nothing}
    `;
  }

  private _renderHeader() {
    const title = this._config.title || "Snapmaker U1";
    const state = this._printState();
    const light = this._lightEntity();
    const power = this._powerEntity();

    return html`
      <div class="header">
        <div class="title">${title}</div>
        <div class="status-pill ${state}">${state}</div>
        <div class="header-icons">
          ${
            light
              ? html`
                  <ha-icon-button
                    class="${helpers.getState(this._hass, light) === "on" ? "active" : ""}"
                    @click=${() => helpers.toggleDomain(this._hass, "light", light)}
                  >
                    <ha-icon
                      icon=${
                        helpers.getState(this._hass, light) === "on"
                          ? "mdi:lightbulb-on"
                          : "mdi:lightbulb-outline"
                      }
                    ></ha-icon>
                  </ha-icon-button>
                `
              : nothing
          }
          ${
            power
              ? html`
                  <ha-icon-button
                    class="${helpers.getState(this._hass, power) === "on" ? "active" : ""}"
                    @click=${() => helpers.toggleDomain(this._hass, "switch", power)}
                  >
                    <ha-icon icon="mdi:power-plug"></ha-icon>
                  </ha-icon-button>
                `
              : nothing
          }
        </div>
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
    const currentLayer = helpers.getState(this._hass, this._e("current_layer"));
    const totalLayer = helpers.getState(this._hass, this._e("total_layer"));
    const timeLeft = helpers.formatDuration(this._hass, this._e("print_time_left"));

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
                <ha-icon-button class="media-toggle" @click=${this._toggleMediaView}>
                  <ha-icon icon=${view === "webcam" ? "mdi:image" : "mdi:cctv"}></ha-icon>
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
                    <span>${helpers.formatPercent(progress, true)}</span>
                  </div>
                  <div class="meta-row">
                    <span
                      >${currentLayer && totalLayer ? `Layer ${currentLayer}/${totalLayer}` : ""}</span
                    >
                    <span>${this._isActive() ? `${timeLeft} left` : ""}</span>
                  </div>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  private _renderMessage() {
    const message = helpers.getState(this._hass, this._e("printer_message"));
    if (!message || /printer is ready/i.test(message)) {
      return nothing;
    }
    return html`<div class="message-row">${message}</div>`;
  }

  private _renderTiles() {
    const bedTemp = this._e("bed_temp");
    const bedTarget = helpers.getNumericState(this._hass, this._e("bed_target"));
    const cavityTemp = this._e("cavity_temp");

    const tiles = [
      bedTemp
        ? html`
            <div
              class="tile ${bedTarget && bedTarget > 0 ? "heating" : ""}"
              @click=${() => helpers.showEntityMoreInfo(this, bedTemp)}
            >
              <ha-icon icon="mdi:widgets-outline"></ha-icon>
              <span class="tile-label">Bed</span>
              <span class="tile-value">${helpers.formatTemp(this._hass, bedTemp)}</span>
              ${bedTarget ? html`<span class="tile-sub">→ ${Math.round(bedTarget)}°</span>` : nothing}
            </div>
          `
        : nothing,
      cavityTemp
        ? html`
            <div class="tile" @click=${() => helpers.showEntityMoreInfo(this, cavityTemp)}>
              <ha-icon icon="mdi:home-thermometer-outline"></ha-icon>
              <span class="tile-label">Cavity</span>
              <span class="tile-value">${helpers.formatTemp(this._hass, cavityTemp)}</span>
              ${
                this._e("cavity_fan_speed")
                  ? html`<span class="tile-sub"
                      >${helpers.formatPercent(
                        helpers.getNumericState(this._hass, this._e("cavity_fan_speed"))
                      )}
                      fan</span
                    >`
                  : nothing
              }
            </div>
          `
        : nothing,
    ];

    for (let n = 0; n < TOOL_COUNT; n++) {
      tiles.push(this._renderToolTile(n));
    }

    return html`<div class="tiles">${tiles}</div>`;
  }

  private _renderToolTile(n: number) {
    const temp = this._e(`tool${n}_temp`);
    if (!temp) {
      return nothing;
    }
    const target = helpers.getNumericState(this._hass, this._e(`tool${n}_target`));
    const filament = this._e(`tool${n}_filament`);
    const filamentState = helpers.getState(this._hass, filament);
    const filamentClass = filamentState === "on" ? "present" : filamentState === "off" ? "out" : "";

    return html`
      <div
        class="tile ${target && target > 0 ? "heating" : ""}"
        @click=${() => helpers.showEntityMoreInfo(this, temp)}
      >
        ${filament ? html`<span class="filament-dot ${filamentClass}"></span>` : nothing}
        <ha-icon icon="mdi:printer-3d-nozzle"></ha-icon>
        <span class="tile-label">E${n}</span>
        <span class="tile-value">${helpers.formatTemp(this._hass, temp)}</span>
        ${target ? html`<span class="tile-sub">→ ${Math.round(target)}°</span>` : nothing}
      </div>
    `;
  }

  private _renderControls() {
    const state = this._printState();
    const pause = this._e("pause_print");
    const resume = this._e("resume_print");
    const cancel = this._e("cancel_print");
    const estop = this._e("emergency_stop");
    const speedFactor = this._e("speed_factor");
    const cavityFanSpeed = this._e("cavity_fan_speed");

    const primaryButtons = html`
      <div class="controls">
        ${
          state === "paused" && resume
            ? html`
                <ha-button @click=${() => helpers.pressButton(this._hass, resume)}>
                  <ha-icon slot="icon" icon="mdi:play"></ha-icon>
                  Resume
                </ha-button>
              `
            : pause
              ? html`
                  <ha-button
                    ?disabled=${state !== "printing"}
                    @click=${() => helpers.pressButton(this._hass, pause)}
                  >
                    <ha-icon slot="icon" icon="mdi:pause"></ha-icon>
                    Pause
                  </ha-button>
                `
              : nothing
        }
        ${
          cancel
            ? html`
                <ha-button
                  ?disabled=${!this._isActive()}
                  @click=${() =>
                    this._requestConfirm(
                      "Cancel the current print? This can't be undone.",
                      () => helpers.pressButton(this._hass, cancel),
                      true
                    )}
                >
                  <ha-icon slot="icon" icon="mdi:stop"></ha-icon>
                  Cancel
                </ha-button>
              `
            : nothing
        }
        ${
          estop
            ? html`
                <ha-icon-button
                  class="icon-button stop-button"
                  title="Emergency stop"
                  @click=${() =>
                    this._requestConfirm(
                      "Trigger an EMERGENCY STOP? The printer will halt immediately and require a restart.",
                      () => helpers.pressButton(this._hass, estop),
                      true
                    )}
                >
                  <ha-icon icon="mdi:alert-octagon"></ha-icon>
                </ha-icon-button>
              `
            : nothing
        }
      </div>
    `;

    return html`
      ${primaryButtons}
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

  private _requestConfirm(body: string, run: () => void, destructive = false) {
    this._confirm = { body, run, destructive };
  }

  private _renderConfirmDialog() {
    const confirm = this._confirm!;
    const close = () => (this._confirm = null);
    const run = () => {
      confirm.run();
      this._confirm = null;
    };
    return html`
      <ha-dialog open heading="Please confirm" @closed=${close}>
        <div class="content">${confirm.body}</div>
        <mwc-button slot="secondaryAction" @click=${close}>Cancel</mwc-button>
        <mwc-button slot="primaryAction" @click=${run}>Confirm</mwc-button>
      </ha-dialog>
    `;
  }
}
