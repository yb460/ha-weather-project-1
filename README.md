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
| `width`           | `325`          | Card width in px                                     |
| `height`          | `220`          | Card height in px                                    |
| `hourly_count`    | `12`           | Number of hourly columns                             |
| `daily_count`     | `7`            | Number of daily columns                              |
| `humidity_entity` | *(unset)*      | Optional separate sensor for humidity                |

Temperature units follow whatever `weather.home` reports (your HA is set to °F).
Humidity comes from the weather entity's `humidity` attribute unless you set
`humidity_entity`.

## Placing it exactly in the red box

The card renders at a fixed pixel size on its own. To pin it to that spot on a
1920×1080 screen, the simplest options are:

- **Sections dashboard**: drop it in a section; it keeps its 325×220 size.
- **Panel / custom positioning**: if you use a layout card or a kiosk/wall view,
  give it the slot and it will fill exactly 325×220.

If 325×220 turns out a hair off, just tweak `width`/`height` in the card config —
no code change needed.
