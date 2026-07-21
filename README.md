# Glance Weather Card

A self-contained, **fixed-size, zero-interaction** Lovelace card for Home Assistant.
Everything is visible at a glance — no scrolling, no tapping:

- **Hero**: current temperature + condition + humidity
- **12-hour** condensed hourly strip (icon + temp)
- **7-day** condensed daily strip (icon + high/low)

Defaults to a **325 × 220 px** box (the size you asked for) and reads from a single
`weather.*` entity. Forecasts are pulled via Home Assistant's modern
`weather/subscribe_forecast` websocket API (not deprecated attributes), so it works
on HA 2023.9+.

## Install via HACS (recommended)

This is the easiest way — HACS installs the card and handles future updates for
you (no copying files, no cache-busting).

1. In Home Assistant open **HACS**.
2. Top-right **⋮ → Custom repositories**.
3. Add this repository's URL, choose category **Dashboard**, and click **Add**.
4. Find **Glance Weather Card** in HACS, open it, and click **Download**.
5. Reload your browser. HACS registers the dashboard resource automatically; if
   prompted, add the resource it suggests
   (`/hacsfiles/ha-weather-project-1/glanceweathercard.js`, type **JavaScript
   Module**).

When a new version is released, HACS shows an **Update** button — one click, no
manual steps.

## Manual install (alternative)

1. Copy `glanceweathercard.js` (in the repo root) into your Home Assistant
   `config/www/` folder, so it lives at `config/www/glanceweathercard.js`
   (served as `/local/glanceweathercard.js`).

2. Register it as a dashboard resource. **Settings → Dashboards → ⋮ → Resources →
   Add resource**:
   - URL: `/local/glanceweathercard.js`
   - Type: **JavaScript Module**

   (Or in YAML mode, add under `lovelace:`)
   ```yaml
   lovelace:
     resources:
       - url: /local/glanceweathercard.js
         type: module
   ```

3. Hard-refresh the browser (Ctrl/Cmd-Shift-R) to clear the cached frontend.

## Use

Add it from the dashboard UI (**Add Card → Glance Weather Card**) and **pick your
weather entity from the dropdown** — no YAML needed. The visual editor also lets
you set the real-feel/humidity sensors, column counts, and size.

Or in YAML:

```yaml
type: custom:glance-weather-card
entity: weather.home   # any weather.* entity
```

### Options

| Option                        | Default      | Description                                                    |
| ----------------------------- | ------------ | ------------------------------------------------------------- |
| `entity`                      | *(required)* | A `weather.*` entity (e.g. `weather.home`)                     |
| `width` / `height`            | *(fluid)*    | Card size in px. Omit to fill the dashboard cell              |
| `hourly_count`                | `12`         | Total hourly entries to cycle through                          |
| `hourly_visible`              | *(= count)*  | Hourly columns shown at once; if less than `hourly_count`, the strip auto-rotates |
| `daily_count`                 | `7`          | Total daily entries to cycle through                           |
| `daily_visible`               | *(= count)*  | Daily columns shown at once; if less than `daily_count`, the strip auto-rotates |
| `scroll_interval`             | `4`          | Seconds between auto-rotations                                 |
| `humidity_entity`             | *(unset)*    | Optional separate sensor for current humidity                  |
| `apparent_temperature_entity` | *(unset)*    | Optional sensor for "real feel"; otherwise the weather entity's `apparent_temperature` attribute is used |

**Every text and icon size is adjustable** (all optional, in px, blank = default):
`hero_icon_size`, `temp_size`, `feels_size`, `condition_size`,
`hero_detail_size`, `label_size`, `strip_icon_size`, `time_size`,
`hourly_temp_size`, `day_size`, `daily_temp_size`, `daily_low_size`,
`metric_size`. All of the above are editable from the card's **visual editor**.

**Auto-scroll:** set e.g. `hourly_visible: 6` with `hourly_count: 12` to show 6
hours at a time and rotate through all 12 (hourly and daily are independent).
The scroll is driven by a JS timer, so it also works inside embedded/kiosk
webviews that block CSS animations.

**Two rows:** `hourly_two_rows` / `daily_two_rows` lay a strip out in two rows,
showing everything at once (scrolling turns off automatically) — that strip
takes double the height.

**Declutter:** `strip_metrics` controls what each strip cell shows —
`both` (rain + humidity, default), `rain`, `humidity`, or `none` (just temps).
Handy for the denser two-row layout.

**Optional extras** (all toggles/pickers in the editor):

| Option               | Description                                                         |
| -------------------- | ----------------------------------------------------------------- |
| `show_today_highlow` | Show today's high / low in the hero                                |
| `show_wind`          | Show wind speed + a direction arrow (needs `wind_speed`)           |
| `show_sun`           | Show sunrise / sunset (uses `sun.sun`)                             |
| `highlight_now`      | Highlight the current hour in the hourly strip (default on)        |
| `alert_entity`       | Show a pulsing alert banner while this entity is in an active state |
| `aqi_entity`         | Show a color-coded AQI chip from this sensor                        |
| `moon_entity`        | Use the real moon phase for the icon on clear nights               |
| `show_version`       | Tiny version marker, top-left (default on)                         |

The hero shows a **"Feels" (real-feel) temperature** under the main temperature
when the weather entity provides `apparent_temperature` (or you set
`apparent_temperature_entity`).

By default the card has **no fixed size** — it fills its dashboard cell, so on a
**Sections** dashboard you can drag its resize handles to any size and the rows
spread to fill. Set `width` and/or `height` (px) to pin it to a fixed size
instead (useful on a Masonry dashboard, which can't drag-resize cards).

The 7-day strip shows a humidity row when the weather integration provides
`humidity` in its daily forecast; precipitation chance (`%`) is shown under each
hour. Condition icons are color-coded (amber sun, blue rain/storms, icy snow).

Temperature units follow whatever `weather.home` reports (your HA is set to °F).
Humidity comes from the weather entity's `humidity` attribute unless you set
`humidity_entity`.

## Sizing and placement

- **Sections dashboard** (recommended): drop it in a section and drag the resize
  handles to whatever size you like — the card fills the cell and the rows
  spread to fill the height.
- **Masonry dashboard**: cards can't be drag-resized there, so set `width`
  and/or `height` (px) in the card config to pin the size you want.
- **Panel / kiosk / wall view**: leave the size unset and it fills the slot, or
  set explicit `width`/`height` for an exact pixel box.
