# Snapmaker U1 Print Status Card

A graphical print-status + control card for Home Assistant, built for the **Snapmaker U1**
toolchanger running **Paxx Extended Firmware** with LAN mode enabled, exposed to Home Assistant
through the [moonraker-home-assistant](https://github.com/marcolino/moonraker-home-assistant)
integration.

It's a from-scratch card in the same spirit as
[greghesp/ha-bambulab-cards](https://github.com/greghesp/ha-bambulab-cards)' _Print Status Card_
for Bambu Lab printers, rebuilt around what the U1's Moonraker integration actually exposes: a
4-tool toolchanger (E0-E3), a heated cavity, and a live webcam feed from the firmware itself
rather than the cloud.

![hacs](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)
![release](https://img.shields.io/github/v/release/StealthFireMS/ha-snapmaker-u1-print-status-card)
![build](https://github.com/StealthFireMS/ha-snapmaker-u1-print-status-card/actions/workflows/build-check.yml/badge.svg)
![license](https://img.shields.io/github/license/StealthFireMS/ha-snapmaker-u1-print-status-card)

![The card showing an active print: a webcam-style preview on the left with a progress bar and
filename, a 3x2 grid of bed/cavity/tool temperatures with filament-presence dots, a status line
with layer/percent/time-remaining, a row of control buttons, a fixed print-speed dropdown, and a
cavity fan slider.](src/images/card-preview.png)

## What it shows

- Live camera feed **or** the current print's thumbnail on the left, with a view-toggle icon
  (top-left) and an expand-to-more-info icon (bottom-right); the filename and a progress bar
  overlay on top while a print is active.
- A compact stat sidebar next to the camera: bed, cavity, and all four tool (E0-E3) temperatures
  at a glance, each with its target temperature and (for tools) a filament-present indicator
  (green = loaded, red = out) - tap any cell to open its full history, or hover for the full
  reading.
- The current print state (e.g. "Printing", "Offline") as a plain status line below the
  camera/stats row, with the layer count, percent complete, and time remaining alongside it
  while a print is active.
- A row of square icon buttons for Cavity light, Power plug, an optional link to the printer's
  own touchscreen web UI, Pause/Resume, Cancel, and Emergency Stop, with a confirmation dialog
  before anything destructive.
- A fixed-speed dropdown (50/80/100/120/150%) and a cavity fan slider.

## Requirements

- A Snapmaker U1 running **Paxx Extended Firmware** with LAN mode enabled (this is what exposes
  the Moonraker API and the raw webcam stream the card uses - stock firmware won't expose these
  entities).
- The [moonraker-home-assistant](https://github.com/marcolino/moonraker-home-assistant)
  integration configured and pointed at the printer, added as a device in Home Assistant.
- Home Assistant 2024.8 or newer (for the `device` selector used in the card editor).

## Installation

### HACS (recommended)

1. HACS → the "..." menu (top right) → **Custom repositories**.
2. Add this repository's URL with category **Dashboard**.
3. Install **Snapmaker U1 Print Status Card**, then reload your browser.

### Manual

1. Download `snapmaker-u1-print-status-card.js` from the
   [latest release](../../releases/latest) (or run `npm ci && npm run build` yourself - see
   below).
2. Copy it into `<config>/www/snapmaker-u1-print-status-card.js`.
3. In Settings → Dashboards → Resources, add
   `/local/snapmaker-u1-print-status-card.js` as a JavaScript module.

## Adding the card

Edit a dashboard → **Add card** → search for **Snapmaker U1 Print Status Card**, or add it as
YAML:

```yaml
type: custom:snapmaker-u1-print-status-card
printer: <your U1's device_id> # pick it from the card editor's dropdown instead of typing this
show_camera: true
default_view: auto # auto | webcam | thumbnail
```

All other options (camera/light/power overrides) are best set through the visual editor - open
the card's settings and everything is there via dropdowns and entity pickers.

| Option          | Type                              | Default         | Description                                                                                                                                                                                                                     |
| --------------- | --------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `printer`       | device                            | _(required)_    | The Moonraker device for your U1.                                                                                                                                                                                               |
| `show_camera`   | boolean                           | `true`          | Show the camera/thumbnail panel.                                                                                                                                                                                                |
| `default_view`  | `auto` \| `webcam` \| `thumbnail` | `auto`          | `auto` shows the webcam while printing/paused and the thumbnail otherwise, with a manual toggle.                                                                                                                                |
| `camera_entity` | entity (camera)                   | _auto-detected_ | Override the webcam entity.                                                                                                                                                                                                     |
| `light_entity`  | entity (light)                    | _auto-detected_ | Override the cavity light entity.                                                                                                                                                                                               |
| `power_entity`  | entity (switch)                   | _(none)_        | A smart-plug switch to show/toggle as an icon button.                                                                                                                                                                           |
| `screen_url`    | string                            | _(none)_        | Printer's IP or URL for its Paxx touchscreen web UI - adds a button that opens it in a new tab. A bare IP (`192.168.20.163`) becomes `http://192.168.20.163/screen/`; a full URL is used as-is. Leave blank to hide the button. |

### Card size

In the sections/grid dashboard view, the card is locked to **12 columns wide x 5 rows tall** -
a short, wide layout with the camera alongside the stats and controls. It isn't resizable by
dragging (that's intentional, so the card can't end up rendered larger or smaller than its
layout is designed for), but it still adapts internally to whatever pixel size that 12x5 ends up
being on a given screen - the tile grid, camera placement, and text sizing all reflow rather
than just clipping. If the content is ever taller than the available space (e.g. on a very
narrow dashboard), it scrolls within the card rather than spilling outside it.

## How entity auto-discovery works

You only pick the **device** - the card figures out the rest by matching each of the device's
entity IDs against the naming pattern moonraker-home-assistant uses (e.g. anything ending in
`_heater_bed_target`, `_extruder1_target`, `_pause_print`, `_e2_filament`...). This is
deliberately **not** based on the entity registry's internal `unique_id`, because reading that
requires an admin-level API call that would silently break the card for any non-admin household
member viewing the dashboard - matching is done purely against data every user's browser
already has.

A few consequences of that design:

- If you've heavily renamed your entities away from their defaults, auto-discovery for that
  specific sensor may fail - the affected tile/control just won't render (nothing breaks). Use
  the camera/light/power override fields in the editor for the ones that matter most.
- The resolver deliberately ignores the raw `button.*_macro_*` entities that
  moonraker-home-assistant generates for every Klipper gcode macro, since several of them
  coincidentally share a name suffix with the polished buttons this card uses (e.g. both a
  `..._cancel_print` button and a `..._macro_cancel_print` button exist - the card always wants
  the former).
- `scripts/verify-resolver.ts` is a regression test that runs the real resolver against a
  captured, real-world entity dump (`scripts/fixtures/u1-entities.txt`, taken from an actual U1)
  and fails CI if a required role stops resolving or starts pointing at the wrong entity. If you
  submit a PR that changes matching logic, run `npm run verify` first.

## Developing / building from source

```bash
npm ci
npm run build:strict    # -> dist/snapmaker-u1-print-status-card.js (fails on TS errors)
npm run verify          # resolver regression check against real-world fixture data
npm run smoke           # mounts the built bundle in jsdom and exercises it end to end
npm start               # rollup --watch with a local dev server on :4000
```

CI (`.github/workflows/build-check.yml`) runs all three of `build:strict`, `verify`, and `smoke`
on every push and PR; tagged GitHub releases trigger `.github/workflows/release.yml`, which bumps
`package.json` to match the tag, rebuilds, re-runs `smoke`, and attaches the built
`snapmaker-u1-print-status-card.js` to the release (this is the file HACS and the manual
install steps above pull from).

The card is TypeScript + [Lit](https://lit.dev), bundled with Rollup - the same stack as
`ha-bambulab-cards`, trimmed down to one card.

### Extending it

A number of entities are already auto-discovered but not yet surfaced in the UI - per-tool fan
speed/RPM/power (`tool{n}_fan`, `tool{n}_fan_speed`, `tool{n}_fan_rpm`, `tool{n}_nozzle_fan`,
`tool{n}_power`), `bed_power`, `cavity_fan`/`cavity_fan_rpm`, toolhead X/Y/Z position, per-axis
homing, ETA/elapsed time, lifetime print time/filament/jobs, print queue, tool hub power, and
MCU/system load (these last ones used to live in a collapsible "Advanced" section that's since
been removed, but the resolver still finds them - see `buildRoleCandidates()`). See
`src/utils/helpers.ts` for the full role table and `print-status-card.ts` for how resolved roles
turn into UI - PRs that put more of this to use are very welcome.

## Credit

Visual language and card architecture (Lit + Rollup + HACS packaging, entity-role auto-discovery,
confirmation dialogs) closely follows the excellent
[greghesp/ha-bambulab-cards](https://github.com/greghesp/ha-bambulab-cards) project. This is an
independent, from-scratch implementation for a completely different printer and integration -
not a fork, and not affiliated with Bambu Lab, Snapmaker, or the Paxx firmware project.

## License

MIT - see [LICENSE](LICENSE).
