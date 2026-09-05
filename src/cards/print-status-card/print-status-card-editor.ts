import { customElement, state } from "lit/decorators.js";
import { LitElement, html } from "lit";
import { PRINT_STATUS_CARD_EDITOR_NAME } from "./const";
import { INTEGRATION_DOMAIN } from "../../const";

const SCHEMA = [
  {
    name: "printer",
    label: "Snapmaker U1 (Moonraker device)",
    selector: { device: { filter: { integration: INTEGRATION_DOMAIN } } },
  },
  {
    name: "show_camera",
    label: "Show camera / thumbnail panel",
    selector: { boolean: {} },
  },
  {
    name: "default_view",
    label: "Default media view",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { label: "Auto (webcam while printing, thumbnail otherwise)", value: "auto" },
          { label: "Always webcam", value: "webcam" },
          { label: "Always thumbnail", value: "thumbnail" },
        ],
      },
    },
  },
  {
    name: "camera_entity",
    label: "Webcam entity override (optional)",
    selector: { entity: { domain: "camera" } },
  },
  {
    name: "light_entity",
    label: "Cavity light override (optional)",
    selector: { entity: { domain: "light" } },
  },
  {
    name: "power_entity",
    label: "Smart-plug / power switch (optional)",
    selector: { entity: { domain: "switch" } },
  },
  {
    name: "show_advanced_default",
    label: "Expand advanced details by default",
    selector: { boolean: {} },
  },
];

@customElement(PRINT_STATUS_CARD_EDITOR_NAME)
export class SnapmakerU1PrintStatusCardEditor extends LitElement {
  @state() private _config?: any;
  @state() public hass: any;

  public setConfig(config: any): void {
    this._config = config;
  }

  private _handleValueChanged(ev: CustomEvent) {
    const event = new CustomEvent("config-changed", {
      detail: { config: ev.detail.value },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  protected render() {
    if (!this.hass || !this._config) {
      return html``;
    }
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${SCHEMA}
        .computeLabel=${(s: any) => s.label}
        @value-changed=${this._handleValueChanged}
      ></ha-form>
    `;
  }
}
