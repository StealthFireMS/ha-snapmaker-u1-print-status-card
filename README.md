# Snapmaker U1 Print Status Card

A graphical print-status + control card for Home Assistant, built for the **Snapmaker U1**
toolchanger running **Paxx Extended Firmware** with LAN mode enabled, exposed to Home Assistant
through the [moonraker-home-assistant](https://github.com/marcolino/moonraker-home-assistant)
integration.

It's a from-scratch card in the same spirit as
[greghesp/ha-bambulab-cards](https://github.com/greghesp/ha-bambulab-cards)' *Print Status Card*
for Bambu Lab printers, rebuilt around what the U1's Moonraker integration actually exposes: a
4-tool toolchanger (E0-E3), a heated cavity, and a live webcam feed from the firmware itself
rather than the cloud.

![status](https://img.shields.io/badge/status-community%20project-blue)
![HA](https://img.shields.io/badge/home%20assistant-custom%20card-41BDF5)

## What it shows

- Live camera feed **or** the current print's thumbnail, with a one-tap toggle between the two,
  a progress bar, filename, layer count and time remaining overlaid on top.
- Bed, cavity, and all four tool (E0-E3) temperatures at a glance, each with its target
  temperature and a filament-present indicator, tap any tile to open its full history.
- Pause / Resume / Cancel / Emergency Stop, with a confirmation dialog before anything
  destructive.
- Speed override and cavity fan sliders.
- Cavity light and (optionally) a smart-plug power switch in the header.
- A collapsible **Advanced** section: toolhead position, per-axis homing (X/Y/Z), ETA/elapsed,
  ~~lifetime~~ total print time/filament/jobs, ~~queue~~ print queue, and system load - all
  folded away until you want them.

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
printer: <your U1's device_id>   # pick it from the card editor's dropdown instead of typing this
show_camera: true
default_view: auto               # auto | webcam | thumbnail
```

All other options (camera/light/power overrides, advanced section default, title) are best set
through the visual editor - open the card's settings and everything is there via dropdowns and
entity pickers.

| Option | Type | Default | Description |
|---|---|---|---|
| `printer` | device | *(required)* | The Moonraker device for your U1. |
| `title` | string | `Snapmaker U1` | Header title. |
| `show_camera` | boolean | `true` | Show the camera/thumbnail panel. |
| `default_view` | `auto` \| `webcam` \| `thumbnail` | `auto` | `auto` shows the webcam while printing/paused and the thumbnail otherwise, with a manual toggle. |
| `camera_entity` | entity (camera) | *auto-detected* | Override the webcam entity. |
| `light_entity` | entity (light) | *auto-detected* | Override the cavity light entity. |
| `power_entity` | entity (switch) | *(none)* | A smart-plug switch to show/toggle in the header. |
| `show_advanced_default` | boolean | `false` | Expand the Advanced section by default. |

### Card size

In the sections/grid dashboard view, the card is locked to **12 columns wide x 5 rows tall** -
a short, wide layout with the camera alongside the stats and controls. It isn't resizable by
dragging (that's intentional, so the card can't end up rendered larger or smaller than its
layout is designed for), but it still adapts internally to whatever pixel size that 12x5 ends up
being on a given screen - the tile grid, camera placement, and text sizing all reflow rather
than just clipping. If the content is ever taller than the available space (e.g. the Advanced
section expanded on a very narrow dashboard), it scrolls within the card rather than spilling
outside it.

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
npm run build          # -> dist/snapmaker-u1-print-status-card.js
npm run verify          # resolver regression check against real-world fixture data
npm start               # rollup --watch with a local dev server on :4000
```

The card is TypeScript + [Lit](https://lit.dev), bundled with Rollup - the same stack as
`ha-bambulab-cards`, trimmed down to one card.

### Extending it

A number of entities are already auto-discovered but not yet surfaced in the UI - per-tool fan
speed/RPM/power (`tool{n}_fan`, `tool{n}_fan_speed`, `tool{n}_fan_rpm`, `tool{n}_nozzle_fan`,
`tool{n}_power`), `bed_power`, `cavity_fan`/`cavity_fan_rpm`. See `buildRoleCandidates()` in
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
