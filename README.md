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

## Install

1. Copy `www/glanceweathercard.js` into your Home Assistant `config/www/` folder
   (so it lives at `config/www/glanceweathercard.js`, served as
   `/local/glanceweathercard.js`).

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

Add the card to a dashboard:

```yaml
type: custom:glance-weather-card
entity: weather.home
```

### Options

| Option            | Default        | Description                                          |
| ----------------- | -------------- | ---------------------------------------------------- |
| `entity`          | *(required)*   | A `weather.*` entity (e.g. `weather.home`)           |
| `width`           | *(fluid)*      | Card width in px. Omit to fill the dashboard cell    |
| `height`          | *(fluid)*      | Card height in px. Omit to fill the dashboard cell   |
| `hourly_count`    | `12`           | Number of hourly columns                             |
| `daily_count`     | `7`            | Number of daily columns                              |
| `humidity_entity` | *(unset)*      | Optional separate sensor for current humidity        |

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
