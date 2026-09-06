// Generic helpers for talking to Home Assistant from the card, plus the entity-discovery
// logic that maps a Moonraker (moonraker-home-assistant) device to the roles this card needs.
//
// Auto-discovery matches each candidate entity's `entity_id` SUFFIX (the part after the
// device/printer name that moonraker-home-assistant appends, e.g. `..._heater_bed_target`,
// `..._extruder1_target`, `..._pause_print`). It deliberately does NOT rely on the entity
// registry's `unique_id`/`config_entry_id` fields or on `translation_key` (this integration
// doesn't set the latter): the full registry is only reachable via an admin-gated websocket
// call, and a card that stops working for every non-admin dashboard viewer isn't good enough
// to ship. `hass.entities` (device_id, platform) and `hass.states` are available to all users,
// so that's all this card depends on.
//
// Because the printer's own name/area can get folded into the prefix inconsistently (a real
// U1 mixed `sensor.snapmaker_u1_x` and `sensor.printer_room_u1_x` entity_ids for entities on
// the very same device), matching is suffix-based rather than exact. Roles are resolved in a
// fixed, most-specific-first order and each matched entity_id is removed from the pool before
// moving on, so a generic suffix (tool 0's bare `fan_speed`) can't accidentally steal a more
// specific one (`cavity_fan_speed`, `e1_fan_speed`) that also ends in the same words.

export interface RegistryEntity {
  entity_id: string;
  device_id?: string;
  platform?: string;
}

export type RoleMap = { [role: string]: RegistryEntity };

interface RoleSpec {
  role: string;
  suffixes: string[];
  /** Skip a candidate whose local part contains any of these substrings (cross-contamination guard). */
  exclude?: string[];
}

function localPart(entityId: string): string {
  const dot = entityId.indexOf(".");
  return dot === -1 ? entityId : entityId.slice(dot + 1);
}

function matchesSuffix(entityId: string, suffix: string): boolean {
  const local = localPart(entityId);
  return local === suffix || local.endsWith(`_${suffix}`);
}

// moonraker-home-assistant exposes every raw Klipper gcode_macro as its own `button.*_macro_<name>`
// entity, in addition to the integration's own polished buttons/numbers for the same action
// (e.g. both `button..._cancel_print` and `button..._macro_cancel_print`, or a
// `button..._macro_set_fan_speed` that ends in the same words as `number..._fan_speed`). None of
// this card's roles should ever resolve to one of those raw macros, so they're dropped up front.
const MACRO_SEGMENT = /(^|_)macro(_|$)/;

/**
 * Resolves each requested role (in the order given) to an entity belonging to `deviceId`,
 * consuming entity_ids as they're matched so a more generic suffix can't be stolen by an
 * earlier, more specific role. Roles with no match are simply omitted - callers should treat
 * a missing role as "not available on this firmware/integration version" and hide that part
 * of the UI rather than erroring.
 */
export function resolveRoles(
  hass: any,
  deviceId: string | undefined,
  roleOrder: RoleSpec[]
): RoleMap {
  const result: RoleMap = {};
  if (!hass || !deviceId) {
    return result;
  }

  let pool: string[] = [];
  for (const entityId in hass.entities) {
    if (
      hass.entities[entityId]?.device_id === deviceId &&
      !MACRO_SEGMENT.test(localPart(entityId))
    ) {
      pool.push(entityId);
    }
  }

  for (const { role, suffixes, exclude } of roleOrder) {
    const idx = pool.findIndex((id) => {
      if (exclude?.some((x) => localPart(id).includes(x))) {
        return false;
      }
      return suffixes.some((s) => matchesSuffix(id, s));
    });
    if (idx !== -1) {
      result[role] = { entity_id: pool[idx], device_id: deviceId };
      pool.splice(idx, 1);
    }
  }

  return result;
}

/** Builds the ordered role -> entity_id-suffix-candidates table, most-specific-first. */
export function buildRoleCandidates(toolCount: number): RoleSpec[] {
  const roles: RoleSpec[] = [
    // Lifetime "totals_*" roles are resolved first: their suffixes are a superset of the
    // per-print roles below (e.g. "totals_filament_used" ends in "_filament_used"), so the
    // more specific one has to claim its entity before the generic role goes looking.
    { role: "total_print_time", suffixes: ["totals_print_time", "total_print_time"] },
    { role: "total_filament_used", suffixes: ["totals_filament_used", "total_filament_used"] },
    { role: "total_jobs", suffixes: ["totals_jobs", "total_jobs"] },
    { role: "longest_print", suffixes: ["longest_print"] },

    { role: "print_state", suffixes: ["current_print_state", "print_state"] },
    { role: "printer_state", suffixes: ["printer_state"] },
    { role: "idle_timeout_state", suffixes: ["idle_timeout_state"] },
    { role: "printer_message", suffixes: ["printer_message"] },
    { role: "current_print_message", suffixes: ["current_print_message"] },
    { role: "progress", suffixes: ["progress"] },
    { role: "filename", suffixes: ["filename"] },
    { role: "current_layer", suffixes: ["current_layer"] },
    { role: "total_layer", suffixes: ["total_layer"] },
    { role: "print_duration", suffixes: ["print_duration"] },
    { role: "print_time_left", suffixes: ["print_time_left"] },
    { role: "print_eta", suffixes: ["print_eta"] },
    { role: "print_speed", suffixes: ["print_speed"] },
    { role: "speed_factor", suffixes: ["speed_factor"] },
    { role: "object_height", suffixes: ["object_height"] },
    { role: "filament_used", suffixes: ["filament_used"] },
    { role: "queue_state", suffixes: ["queue_state"] },
    { role: "jobs_in_queue", suffixes: ["jobs_in_queue"] },

    { role: "toolhead_x", suffixes: ["toolhead_position_x"] },
    { role: "toolhead_y", suffixes: ["toolhead_position_y"] },
    { role: "toolhead_z", suffixes: ["toolhead_position_z"] },

    { role: "bed_target", suffixes: ["bed_target"] },
    { role: "bed_temp", suffixes: ["bed_temperature"] },
    { role: "bed_power", suffixes: ["bed_power"] },

    { role: "cavity_fan_speed", suffixes: ["cavity_fan_speed"] },
    { role: "cavity_fan_rpm", suffixes: ["cavity_fan_rpm"] },
    { role: "cavity_fan", suffixes: ["cavity_fan"] },
    { role: "cavity_temp", suffixes: ["cavity_temp", "cavity_temperature"] },
    { role: "cavity_light", suffixes: ["led_cavity_led", "cavity_led"] },

    { role: "head_hub_switch", suffixes: ["output_pin_head_hub"] },

    { role: "pause_print", suffixes: ["pause_print"] },
    { role: "resume_print", suffixes: ["resume_print"] },
    { role: "cancel_print", suffixes: ["cancel_print"] },
    { role: "emergency_stop", suffixes: ["emergency_stop"] },
    { role: "home_all_axes", suffixes: ["home_all_axes"] },
    { role: "home_x_axis", suffixes: ["home_x_axis"] },
    { role: "home_y_axis", suffixes: ["home_y_axis"] },
    { role: "home_z_axis", suffixes: ["home_z_axis"] },

    { role: "webcam", suffixes: ["webcam"] },
    { role: "thumbnail", suffixes: ["thumbnail"] },

    { role: "mcu_load", suffixes: ["mcu_load"] },
    { role: "system_load", suffixes: ["system_load"] },
    { role: "memory_used", suffixes: ["memory_used"] },
  ];

  // Most specific tool suffixes first (3, 2, 1) so tool 0's bare `extruder_*` / `fan_speed`
  // candidates - which are substrings of the others - are resolved last, against whatever's left.
  for (let n = toolCount - 1; n >= 0; n--) {
    const suffix = n === 0 ? "" : String(n);
    roles.push({ role: `tool${n}_filament`, suffixes: [`e${n}_filament`] });
    roles.push({ role: `tool${n}_heat_switch`, suffixes: [`e${n}_heat_sw`] });
    roles.push({ role: `tool${n}_target`, suffixes: [`extruder${suffix}_target`] });
    roles.push({ role: `tool${n}_power`, suffixes: [`extruder${suffix}_power`] });
    roles.push({ role: `tool${n}_temp`, suffixes: [`extruder${suffix}_temperature`] });
    roles.push({ role: `tool${n}_nozzle_fan`, suffixes: [`e${n}_nozzle_fan`] });
    if (n === 0) {
      // The primary extruder's part-cooling fan is Klipper's built-in [fan], not a fan_generic,
      // so it has no distinguishing prefix of its own - guard against grabbing a leftover
      // nozzle/cavity/other-tool sensor that merely happens to also end in "fan_speed"/"fan_rpm".
      const guard = ["nozzle", "cavity", "e1", "e2", "e3"];
      roles.push({ role: `tool${n}_fan_speed`, suffixes: ["fan_speed"], exclude: guard });
      roles.push({ role: `tool${n}_fan_rpm`, suffixes: ["fan_rpm"], exclude: guard });
    } else {
      roles.push({ role: `tool${n}_fan_speed`, suffixes: [`e${n}_fan_speed`] });
      roles.push({ role: `tool${n}_fan_rpm`, suffixes: [`e${n}_fan_rpm`] });
      roles.push({ role: `tool${n}_fan`, suffixes: [`e${n}_fan`] });
    }
  }

  return roles;
}

export function isEntityUnavailable(hass: any, entity?: RegistryEntity): boolean {
  if (!entity?.entity_id) {
    return true;
  }
  const state = hass.states[entity.entity_id];
  return !state || state.state === "unavailable" || state.state === "unknown";
}

export function getState(hass: any, entity?: RegistryEntity): string {
  if (!entity?.entity_id) {
    return "";
  }
  return hass.states[entity.entity_id]?.state ?? "";
}

export function getNumericState(hass: any, entity?: RegistryEntity): number | undefined {
  const raw = getState(hass, entity);
  if (raw === "" || raw === "unknown" || raw === "unavailable") {
    return undefined;
  }
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

export function getAttribute(
  hass: any,
  entity: RegistryEntity | undefined,
  attribute: string
): any {
  if (!entity?.entity_id) {
    return undefined;
  }
  return hass.states[entity.entity_id]?.attributes?.[attribute];
}

/** Renders a raw seconds/minutes/hours/days duration value (using the entity's own unit) as e.g. "1h 42m". */
export function formatDuration(hass: any, entity?: RegistryEntity): string {
  if (!entity?.entity_id) {
    return "--";
  }
  const state = hass.states[entity.entity_id];
  if (!state || state.state === "unknown" || state.state === "unavailable") {
    return "--";
  }
  const unit = state.attributes?.unit_of_measurement;
  let seconds = Number(state.state);
  if (Number.isNaN(seconds)) {
    return String(state.state);
  }
  switch (unit) {
    case "min":
      seconds *= 60;
      break;
    case "h":
      seconds *= 3600;
      break;
    case "d":
      seconds *= 86400;
      break;
    default:
      break; // assume seconds
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatEta(hass: any, entity?: RegistryEntity): string {
  if (!entity?.entity_id) {
    return "--";
  }
  const state = hass.states[entity.entity_id];
  if (!state || state.state === "unknown" || state.state === "unavailable") {
    return "--";
  }
  const date = new Date(state.state);
  if (Number.isNaN(date.getTime())) {
    return String(state.state);
  }
  return date.toLocaleTimeString(hass.locale?.language ?? navigator.language, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTemp(hass: any, entity?: RegistryEntity): string {
  const value = getNumericState(hass, entity);
  if (value === undefined) {
    return "--";
  }
  return `${Math.round(value)}°`;
}

export function formatPercent(value: number | undefined, fromRatio = false): string {
  if (value === undefined) {
    return "--";
  }
  const pct = fromRatio ? value * 100 : value;
  return `${Math.round(pct)}%`;
}

export function fireEvent(
  target: HTMLElement,
  type: string,
  detail: any = {},
  options: { bubbles?: boolean; cancelable?: boolean; composed?: boolean } = {}
): CustomEvent {
  const event = new CustomEvent(type, {
    bubbles: options.bubbles ?? true,
    cancelable: options.cancelable ?? false,
    composed: options.composed ?? true,
    detail,
  });
  target.dispatchEvent(event);
  return event;
}

export function showEntityMoreInfo(target: HTMLElement, entity?: RegistryEntity) {
  if (!entity?.entity_id) {
    return;
  }
  fireEvent(target, "hass-more-info", { entityId: entity.entity_id });
}

export interface ConfirmationDialogParams {
  title?: string;
  text: string;
  confirmText?: string;
  dismissText?: string;
  destructive?: boolean;
  confirm: () => void;
  cancel?: () => void;
}

let _activeConfirmationDialog: HTMLElement | null = null;

/**
 * Opens a confirmation dialog built from `<ha-dialog>`/`<mwc-button>` (the same Material web
 * components Home Assistant's own dialogs are built from - guaranteed to already be registered,
 * since HA's frontend uses them constantly) appended directly to `document.body`, instead of
 * rendered inside this card's own shadow DOM tree.
 *
 * Why not just put `<ha-dialog>` in the card's own `render()` output (which is how this used to
 * work, and how a first attempt at fixing it briefly worked around it)? This card's `:host` sets
 * `container-type` (for its CSS container-query breakpoints), and that - like a CSS `transform`
 * - makes the host establish a new containing block for any `position: fixed` descendant. Any
 * dialog nested inside the card's shadow DOM ends up confined to the card's own small on-screen
 * box instead of covering the viewport, leaving its buttons clipped/unreachable even though the
 * dialog's text is visible. A prior fix routed this through HA's internal "dialog-box" element
 * via a `show-dialog` event instead, which sidesteps the containment problem but depends on that
 * specific internal component name/shape and on it already being loaded - fragile, and in
 * practice the dialog stopped opening at all. Building the dialog ourselves and appending it
 * straight to `document.body` avoids both problems: it's nowhere near this card's containment
 * scope, and it only depends on `<ha-dialog>`/`<mwc-button>` existing, which they always do.
 */
export function showConfirmationDialog(_target: HTMLElement, params: ConfirmationDialogParams) {
  // Only one confirmation at a time - replace anything already open rather than stacking.
  if (_activeConfirmationDialog?.parentNode) {
    _activeConfirmationDialog.parentNode.removeChild(_activeConfirmationDialog);
  }

  const dialog = document.createElement("ha-dialog") as any;
  dialog.heading = params.title ?? "Please confirm";

  const content = document.createElement("div");
  content.style.padding = "8px 4px";
  content.textContent = params.text;
  dialog.appendChild(content);

  const cancelBtn = document.createElement("mwc-button");
  cancelBtn.setAttribute("slot", "secondaryAction");
  cancelBtn.textContent = params.dismissText ?? "Cancel";

  const confirmBtn = document.createElement("mwc-button") as HTMLElement;
  confirmBtn.setAttribute("slot", "primaryAction");
  confirmBtn.textContent = params.confirmText ?? "Confirm";
  if (params.destructive) {
    confirmBtn.style.setProperty("--mdc-theme-primary", "var(--error-color, #db4437)");
  }

  const close = () => {
    dialog.open = false;
  };
  const onClosed = () => {
    dialog.removeEventListener("closed", onClosed);
    dialog.remove();
    if (_activeConfirmationDialog === dialog) {
      _activeConfirmationDialog = null;
    }
  };
  confirmBtn.addEventListener("click", () => {
    params.confirm();
    close();
  });
  cancelBtn.addEventListener("click", () => {
    params.cancel?.();
    close();
  });
  dialog.addEventListener("closed", onClosed);

  dialog.appendChild(cancelBtn);
  dialog.appendChild(confirmBtn);

  document.body.appendChild(dialog);
  _activeConfirmationDialog = dialog;
  dialog.open = true;
}

export function pressButton(hass: any, entity?: RegistryEntity) {
  if (!entity?.entity_id) {
    return;
  }
  hass.callService("button", "press", { entity_id: entity.entity_id });
}

export function toggleDomain(hass: any, domain: "light" | "switch", entity?: RegistryEntity) {
  if (!entity?.entity_id) {
    return;
  }
  const isOn = getState(hass, entity) === "on";
  hass.callService(domain, isOn ? "turn_off" : "turn_on", { entity_id: entity.entity_id });
}

export function setNumberValue(hass: any, entity: RegistryEntity | undefined, value: number) {
  if (!entity?.entity_id) {
    return;
  }
  hass.callService("number", "set_value", { entity_id: entity.entity_id, value });
}

/** Generic HA camera stream URL - works for any camera entity that supports the proxy-stream endpoint. */
export function getCameraStreamUrl(hass: any, entity?: RegistryEntity): string {
  if (!entity?.entity_id || isEntityUnavailable(hass, entity)) {
    return "";
  }
  const token = hass.states[entity.entity_id]?.attributes?.access_token;
  return `/api/camera_proxy_stream/${entity.entity_id}?token=${token}`;
}

export function getCameraImageUrl(hass: any, entity?: RegistryEntity): string {
  if (!entity?.entity_id || isEntityUnavailable(hass, entity)) {
    return "";
  }
  const picture = hass.states[entity.entity_id]?.attributes?.entity_picture;
  return picture ? `${picture}` : "";
}

/**
 * Normalizes a user-typed address for an external link (e.g. the printer's own Paxx touchscreen
 * web UI) into a full URL - accepts a bare IP/hostname ("192.168.20.163"), one with a port
 * and/or path ("192.168.20.163:8080/screen/"), or an already-complete URL
 * ("http://192.168.20.163/screen/"), whichever is quickest to type into the card editor.
 * `defaultPath` is appended only when the input has no real path of its own, so a bare
 * IP/hostname (with or without a trailing slash) gets it, but an address that already specifies
 * a path is left alone.
 */
export function normalizeUrl(raw: string, defaultPath = ""): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    // Already has a scheme (http://, https://, ...) - use as typed.
    return trimmed;
  }
  const slashIndex = trimmed.indexOf("/");
  const hasRealPath = slashIndex !== -1 && slashIndex < trimmed.length - 1;
  const withPath = hasRealPath ? trimmed : `${trimmed.replace(/\/$/, "")}${defaultPath}`;
  return `http://${withPath}`;
}

/** Opens a URL in a new browser tab (e.g. the printer's own touchscreen web UI). */
export function openInNewTab(url: string) {
  if (!url) {
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
