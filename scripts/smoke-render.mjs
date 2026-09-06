// Runtime smoke test for the *built* bundle (dist/snapmaker-u1-print-status-card.js).
//
// npm run build:strict / npm run verify only prove the TypeScript source is correct and that
// the entity-resolution logic works - neither of them actually executes the minified bundle a
// browser receives. A real regression (see CHANGELOG - "ReferenceError: _k is not defined")
// slipped through both of those checks because it was introduced by the Babel/Terser
// minification step itself, not by anything in the source. This script mounts the built card
// in a jsdom document, feeds it a realistic set of entities (via the same fixture the resolver
// regression test uses), and forces every render branch that maps arrays of Lit TemplateResults
// (the 4 tool tiles, plus the advanced-info rows) - which is exactly the code path that threw.
//
//
// IMPORTANT: assert against the rendered DOM (querySelector/textContent), never against
// `shadowRoot.innerHTML` as a string. In jsdom, Lit falls back to injecting a <style> element, so
// the whole stylesheet - comments included - is part of innerHTML. An earlier version of this file
// checked `innerHTML.includes("tool")` to prove the four tool tiles rendered; that only ever
// passed because the CSS contains the words "4 tools" and "icon-button toolbar", so it would have
// stayed green with every tile missing. Real browsers use adoptedStyleSheets and wouldn't have the
// CSS in innerHTML at all, so those assertions were meaningless in both directions.
//
// Run with: node scripts/smoke-render.mjs   (after `npm run build` / `build:strict`)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "..", "dist", "snapmaker-u1-print-status-card.js");
const fixturePath = path.join(__dirname, "fixtures", "u1-entities.txt");

if (!fs.existsSync(distPath)) {
  console.error(`Build output not found at ${distPath}. Run "npm run build" first.`);
  process.exit(1);
}

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

for (const key of [
  "window",
  "document",
  "customElements",
  "HTMLElement",
  "CustomEvent",
  "Event",
  "Node",
  "ShadowRoot",
  "MutationObserver",
  "Document",
  "CSSStyleSheet",
  "DocumentFragment",
  "Text",
  "Comment",
  "Element",
]) {
  global[key] = dom.window[key];
}
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.trustedTypes = undefined;

const deviceId = "u1-device";
const entityIds = fs
  .readFileSync(fixturePath, "utf-8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

const entities = {};
const states = {};
for (const id of entityIds) {
  entities[id] = { device_id: deviceId, platform: "moonraker" };
  states[id] = { entity_id: id, state: "0", attributes: {} };
}

// A realistic mid-print snapshot, using the same units moonraker-home-assistant reports:
// Progress is a PERCENTAGE (0-100, NOT a 0-1 ratio) and Print Time Left is in hours.
const setState = (id, state, attributes = {}) => {
  states[id] = { entity_id: id, state: String(state), attributes };
};
setState("sensor.snapmaker_u1_current_print_state", "printing");
setState("sensor.snapmaker_u1_progress", 42, { unit_of_measurement: "%" });
setState("sensor.snapmaker_u1_current_layer", 84);
setState("sensor.snapmaker_u1_total_layer", 200);
setState("sensor.snapmaker_u1_print_time_left", 1.5, { unit_of_measurement: "h" });
setState("sensor.snapmaker_u1_filename", "benchy.gcode");
setState("number.snapmaker_u1_speed_factor", 100, { unit_of_measurement: "%" });
setState("sensor.snapmaker_u1_bed_temperature", 60, { unit_of_measurement: "°C" });
setState("number.snapmaker_u1_bed_target", 60, { unit_of_measurement: "°C" });
setState("sensor.snapmaker_u1_cavity_temp", 38, { unit_of_measurement: "°C" });

const hass = {
  entities,
  states,
  localize: (k) => k,
  language: "en",
  callWS: async () => ({}),
  callService: async () => ({}),
};

/** Replaces `hass` with a fresh object (as HA does on every state change) and lets Lit settle. */
async function pushState(el, mutate) {
  mutate();
  el.hass = { ...hass, states: { ...states } };
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function main() {
  await import(distPath.startsWith("/") ? `file://${distPath}` : distPath);

  const el = document.createElement("snapmaker-u1-print-status-card");
  document.body.appendChild(el);
  el.setConfig({
    type: "custom:snapmaker-u1-print-status-card",
    printer: deviceId,
    show_camera: true,
    screen_url: "192.168.20.163",
  });
  el.hass = hass;

  // Let Lit's async render cycle flush.
  if (el.updateComplete) await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 200));

  const shadow = el.shadowRoot;
  if (!shadow || !shadow.querySelector("ha-card")) {
    throw new Error("Card didn't render an <ha-card> at all - it likely failed silently.");
  }
  if (!shadow.querySelector(".top-row") || !shadow.querySelector(".stats-sidebar")) {
    throw new Error("Expected .top-row/.stats-sidebar layout elements are missing.");
  }

  // Six stat cells: bed, cavity, and one per tool (E0-E3), each labelled in the DOM.
  const statLabels = Array.from(shadow.querySelectorAll(".stat-cell .stat-label")).map((n) =>
    n.textContent.trim()
  );
  for (const expected of ["Bed", "Cavity", "E0", "E1", "E2", "E3"]) {
    if (!statLabels.includes(expected)) {
      throw new Error(
        `Stat sidebar is missing the "${expected}" cell - found [${statLabels.join(", ")}].`
      );
    }
  }
  // Each cell must be a real focusable control, not a clickable <div>.
  for (const cell of shadow.querySelectorAll(".stat-cell")) {
    if (cell.tagName !== "BUTTON") {
      throw new Error(
        `Stat cells must be <button> so they're keyboard-reachable, found <${cell.tagName.toLowerCase()}>.`
      );
    }
  }

  const iconButtons = shadow.querySelectorAll(".controls .icon-btn");
  if (iconButtons.length < 3) {
    throw new Error(
      `Expected several .icon-btn controls in the toolbar, found ${iconButtons.length}.`
    );
  }

  // Progress is already a percentage - regression guard against multiplying it by 100 again,
  // which rendered "4200%" in the status line and pinned the progress bar at 100%.
  const statusText = shadow.querySelector(".status-line").textContent.replace(/\s+/g, " ").trim();
  if (!statusText.includes("42%")) {
    throw new Error(
      `Status line should report a 42% progress sensor as "42%", got: ${JSON.stringify(statusText)}.`
    );
  }
  if (!statusText.includes("Layer 84/200") || !statusText.includes("1h 30m left")) {
    throw new Error(
      `Status line is missing the expected layer/time-left detail, got: ${JSON.stringify(statusText)}.`
    );
  }
  const fillWidth = shadow.querySelector(".progress-fill")?.getAttribute("style");
  if (!/width:\s*42%/.test(fillWidth ?? "")) {
    throw new Error(`Progress bar should be 42% wide, got: ${JSON.stringify(fillWidth)}.`);
  }

  // Locked to exactly 12x5 - min must equal max on both axes or the dashboard editor's resize
  // handles can drag it to some other size.
  const expectedGridOptions = {
    columns: 12,
    rows: 5,
    min_columns: 12,
    max_columns: 12,
    min_rows: 5,
    max_rows: 5,
  };
  if (typeof el.getGridOptions !== "function") {
    throw new Error(
      "getGridOptions() is missing - the card won't get its locked 12x5 size in the sections view."
    );
  }
  const gridOptions = el.getGridOptions();
  for (const [key, value] of Object.entries(expectedGridOptions)) {
    if (gridOptions[key] !== value) {
      throw new Error(
        `getGridOptions().${key} was ${JSON.stringify(gridOptions[key])}, expected ${JSON.stringify(value)}.`
      );
    }
  }

  // Checked against the buttons' own titles, not the innerHTML string - the stylesheet jsdom
  // injects would otherwise be part of what's being searched.
  const controlTitles = Array.from(iconButtons).map((btn) =>
    (btn.getAttribute("title") || "").toLowerCase()
  );
  if (controlTitles.some((t) => t.includes("home all axes"))) {
    throw new Error("The removed 'Home all axes' control is still being rendered.");
  }
  if (shadow.querySelector(".advanced-toggle") || shadow.querySelector(".advanced")) {
    throw new Error("The removed 'Show advanced details' section is still being rendered.");
  }

  // Emergency stop/cancel build their own <ha-dialog> confirmation and append it straight to
  // document.body, deliberately OUTSIDE the card's own shadow DOM - a dialog left inside the
  // card can get confined to the card's own small on-screen box by the same CSS container-query
  // containment that gives the card its responsive layout (see CHANGELOG). Confirm: (1) clicking
  // Emergency Stop appends a dialog to document.body and NOT inside the card's shadow root, and
  // (2) clicking that dialog's Confirm button actually calls the emergency-stop service, not
  // just that some dialog appeared.
  const estopButton = Array.from(shadow.querySelectorAll(".controls .icon-btn")).find((btn) =>
    (btn.getAttribute("title") || "").toLowerCase().includes("emergency stop")
  );
  if (!estopButton) {
    throw new Error("Emergency stop button not found in the toolbar.");
  }
  let calledService = null;
  hass.callService = async (domain, service, data) => {
    calledService = { domain, service, data };
  };
  estopButton.click();

  const dialog = document.body.querySelector("ha-dialog");
  if (!dialog) {
    throw new Error(
      "Clicking Emergency stop didn't append a confirmation <ha-dialog> to document.body."
    );
  }
  if (shadow.querySelector("ha-dialog")) {
    throw new Error(
      "The confirmation dialog was appended inside the card's own shadow DOM instead of " +
        "document.body - the card's own CSS containment can confine it there and make its " +
        "buttons unreachable (see CHANGELOG)."
    );
  }
  const confirmBtn = dialog.querySelector('mwc-button[slot="primaryAction"]');
  if (!confirmBtn) {
    throw new Error("Confirmation dialog has no primary (Confirm) action button.");
  }
  confirmBtn.click();
  if (!calledService || calledService.domain !== "button" || calledService.service !== "press") {
    throw new Error(
      "Clicking the confirmation dialog's Confirm button didn't call the emergency-stop service."
    );
  }
  dialog.remove();

  // Print speed is now a fixed dropdown (50/80/100/120/150%), not a free slider.
  const speedSelect = shadow.querySelector(".speed-select");
  if (!speedSelect) {
    throw new Error("Print speed dropdown (.speed-select) not found.");
  }
  const speedOptions = Array.from(speedSelect.querySelectorAll("option")).map((o) => o.value);
  for (const preset of ["50", "80", "100", "120", "150"]) {
    if (!speedOptions.includes(preset)) {
      throw new Error(`Print speed dropdown is missing the ${preset}% preset.`);
    }
  }

  // The printer-touchscreen button: configured with a bare IP ("192.168.20.163"), it should
  // open "http://192.168.20.163/screen/" (the "/screen/" suffix appended automatically) in a
  // new tab when clicked.
  const screenButton = Array.from(shadow.querySelectorAll(".controls .icon-btn")).find((btn) =>
    (btn.getAttribute("title") || "").toLowerCase().includes("touchscreen")
  );
  if (!screenButton) {
    throw new Error("Printer touchscreen button not found in the toolbar.");
  }
  let openedUrl = null;
  const originalOpen = window.open;
  window.open = (url) => {
    openedUrl = url;
    return null;
  };
  screenButton.click();
  window.open = originalOpen;
  if (openedUrl !== "http://192.168.20.163/screen/") {
    throw new Error(
      `Clicking the touchscreen button opened ${JSON.stringify(openedUrl)}, expected "http://192.168.20.163/screen/".`
    );
  }

  // The dropdown must keep showing the printer's actual speed even after the user has picked a
  // different option. In a browser that pick sets the select's dirty-value flag, after which
  // re-rendering the options' `selected` attribute no longer moves the control - only assigning
  // `.value` does. jsdom doesn't implement that flag, so this exercises the same code path a
  // different way: simulate the user picking 50%, then trigger a re-render in which the *speed*
  // hasn't changed. Lit dirty-checks each binding, so `?selected` writes nothing to the DOM on
  // that render, and the only thing that can put the dropdown back on the printer's real speed is
  // the explicit `.value` assignment in the card's updated() hook.
  speedSelect.value = "50";
  await pushState(el, () => setState("sensor.snapmaker_u1_bed_temperature", 61));
  if (speedSelect.value !== "100") {
    throw new Error(
      `Speed dropdown drifted to ${JSON.stringify(speedSelect.value)} after the user picked an ` +
        `option - it should be re-synced to the printer's actual 100%. Re-rendering ` +
        `<option selected> alone can't do this once the select has a dirty value.`
    );
  }
  // ...and it follows the printer's speed when that genuinely changes.
  await pushState(el, () => setState("number.snapmaker_u1_speed_factor", 120));
  if (speedSelect.value !== "120") {
    throw new Error(
      `Speed dropdown should show 120 after the printer's speed changed, shows ${speedSelect.value}.`
    );
  }

  // Masonry/panel views ignore getGridOptions() and ask for getCardSize().
  if (typeof el.getCardSize !== "function" || el.getCardSize() !== 5) {
    throw new Error(
      "getCardSize() must report 5 - without it masonry/panel views assume the card is 1 row tall."
    );
  }

  // An unavailable thumbnail while idle must fall back to the working webcam. Previously this
  // showed "Camera unavailable" *and* hid the view toggle (which needs both sources available),
  // leaving a dead panel with no way to reach a camera that was fine.
  await pushState(el, () => {
    setState("sensor.snapmaker_u1_current_print_state", "standby");
    setState("camera.snapmaker_u1_thumbnail", "unavailable");
  });
  if (!shadow.querySelector(".media img")) {
    throw new Error(
      "With the thumbnail unavailable while idle, the card should fall back to the webcam; " +
        "it rendered the placeholder instead."
    );
  }
  // With neither source usable it should say so rather than render a broken image.
  await pushState(el, () => setState("camera.snapmaker_u1_webcam", "unavailable"));
  if (shadow.querySelector(".media img") || !shadow.querySelector(".media .no-media")) {
    throw new Error("With both camera sources unavailable the card should show the placeholder.");
  }
  await pushState(el, () => {
    setState("sensor.snapmaker_u1_current_print_state", "printing");
    setState("camera.snapmaker_u1_thumbnail", "idle");
    setState("camera.snapmaker_u1_webcam", "streaming");
  });

  // Entities arriving after the card (integration still starting, printer offline at boot) must be
  // picked up - the card used to resolve roles once and never look again.
  el.hass = { ...hass, entities: {}, states: { ...states } };
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (shadow.querySelectorAll(".stat-cell").length !== 0) {
    throw new Error("Stat cells should disappear when the device has no entities in the registry.");
  }
  // Restore the original `entities` identity, so later pushes don't look like registry changes.
  el.hass = { ...hass, entities, states: { ...states } };
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (shadow.querySelectorAll(".stat-cell").length !== 6) {
    throw new Error(
      "The card didn't re-resolve its entities after the registry changed - roles that were " +
        "missing at first render would stay missing until a browser reload."
    );
  }

  // A hass update that touches nothing this card draws must not re-render it. HA hands every card
  // a new hass object on every state change anywhere in the instance.
  let renders = 0;
  const originalRender = Object.getPrototypeOf(el).render;
  Object.getPrototypeOf(el).render = function (...args) {
    renders++;
    return originalRender.apply(this, args);
  };
  await pushState(el, () => setState("sensor.some_unrelated_thermostat", 21));
  if (renders !== 0) {
    throw new Error(
      `Card re-rendered ${renders} time(s) for an unrelated entity's state change - shouldUpdate() isn't filtering.`
    );
  }
  await pushState(el, () => setState("sensor.snapmaker_u1_progress", 43));
  if (renders !== 1) {
    throw new Error(
      `Card should re-render exactly once when its own progress sensor changes, rendered ${renders} time(s).`
    );
  }
  Object.getPrototypeOf(el).render = originalRender;

  // Only http(s) addresses become a touchscreen link; anything else hides the button rather than
  // being handed to window.open.
  el.setConfig({
    type: "custom:snapmaker-u1-print-status-card",
    printer: deviceId,
    show_camera: true,
    screen_url: "javascript://%0aalert(1)",
  });
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const unsafeButton = Array.from(shadow.querySelectorAll(".controls .icon-btn")).find((btn) =>
    (btn.getAttribute("title") || "").toLowerCase().includes("touchscreen")
  );
  if (unsafeButton) {
    throw new Error("A non-http(s) screen_url still produced a touchscreen button.");
  }
  // ...while a host:port address still works and keeps its own port.
  el.setConfig({
    type: "custom:snapmaker-u1-print-status-card",
    printer: deviceId,
    show_camera: true,
    screen_url: "printer.local:8080",
  });
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const portButton = Array.from(shadow.querySelectorAll(".controls .icon-btn")).find((btn) =>
    (btn.getAttribute("title") || "").toLowerCase().includes("touchscreen")
  );
  if (!portButton) {
    throw new Error("A host:port screen_url should still produce a touchscreen button.");
  }
  openedUrl = null;
  window.open = (url) => {
    openedUrl = url;
    return null;
  };
  portButton.click();
  window.open = originalOpen;
  if (openedUrl !== "http://printer.local:8080/screen/") {
    throw new Error(
      `Clicking the touchscreen button opened ${JSON.stringify(openedUrl)}, expected "http://printer.local:8080/screen/".`
    );
  }

  console.log(
    `Smoke test passed: ${statLabels.length} stat cells, ${iconButtons.length} controls, no errors.`
  );
}

main().catch((err) => {
  console.error("\nSmoke test FAILED - the built bundle threw or rendered incorrectly:\n");
  console.error(err);
  process.exit(1);
});
