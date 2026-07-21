/**
 * glance-weather-card
 * A self-contained, fixed-size, no-interaction Lovelace card.
 * Shows current conditions (hero) + a condensed 12-hour strip + a condensed
 * 7-day strip, all visible at a glance in a fixed pixel box.
 *
 * Forecasts are pulled via the modern weather forecast subscription API
 * (weather/subscribe_forecast), NOT from deprecated entity attributes.
 *
 * Example dashboard config:
 *   type: custom:glance-weather-card
 *   entity: weather.home
 *   width: 325
 *   height: 220
 *   daily_count: 7
 *   hourly_count: 12
 *   # humidity_entity: sensor.outdoor_humidity   # optional override
 */

const CONDITION_ICONS = {
  "clear-night": "mdi:weather-night",
  cloudy: "mdi:weather-cloudy",
  exceptional: "mdi:alert-circle-outline",
  fog: "mdi:weather-fog",
  hail: "mdi:weather-hail",
  lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy",
  "partlycloudy-night": "mdi:weather-night-partly-cloudy",
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
};

const iconFor = (c) => CONDITION_ICONS[c] || "mdi:weather-cloudy";

// At night, integrations often report clear/partly-cloudy as the daytime
// "sunny"/"partlycloudy" tokens. Swap them to their night variants so a clear
// night shows a moon, not a sun.
const nightCondition = (c) => {
  if (c === "sunny") return "clear-night";
  if (c === "partlycloudy") return "partlycloudy-night";
  return c;
};

// Map a condition to its background "mood" class (whitelisted so the value can
// never inject an arbitrary class name).
const BG_CONDITIONS = new Set([
  "sunny", "clear-night", "partlycloudy", "partlycloudy-night", "cloudy", "fog",
  "rainy", "pouring", "lightning", "lightning-rainy", "snowy", "snowy-rainy",
  "hail", "windy", "windy-variant", "exceptional",
]);
const bgClassFor = (c) => (BG_CONDITIONS.has(c) ? `w-${c}` : "");

// HA condition states are single tokens (e.g. "partlycloudy"), so a plain
// prettifier can't split them. Map to readable labels; fall back to a
// generic title-case for anything unknown.
const CONDITION_LABELS = {
  "clear-night": "Clear",
  cloudy: "Cloudy",
  exceptional: "Exceptional",
  fog: "Fog",
  hail: "Hail",
  lightning: "Lightning",
  "lightning-rainy": "Thunderstorms",
  partlycloudy: "Partly Cloudy",
  pouring: "Pouring",
  rainy: "Rainy",
  snowy: "Snowy",
  "snowy-rainy": "Sleet",
  sunny: "Sunny",
  windy: "Windy",
  "windy-variant": "Windy",
};

const labelFor = (c) =>
  CONDITION_LABELS[c] ||
  (c ? c.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "");

// Each condition gets its natural color so the strips read at a glance:
// sunny is warm amber, rain/storms are blue, snow is icy, clouds are grey.
const CONDITION_COLORS = {
  sunny: "#ffd24a",
  "clear-night": "#cdd7ff",
  partlycloudy: "#ffd98a",
  "partlycloudy-night": "#cdd7ff",
  cloudy: "#aab8cc",
  fog: "#aab8cc",
  rainy: "#54b4ff",
  pouring: "#2f9bff",
  lightning: "#ffd24a",
  "lightning-rainy": "#7aa8ff",
  snowy: "#e6f3ff",
  "snowy-rainy": "#a9dcff",
  hail: "#cdeaff",
  windy: "#9fe0c0",
  "windy-variant": "#9fe0c0",
  exceptional: "#ff8a7a",
};
const DEFAULT_ICON = "#cfe0f5";
// Metric colors, used consistently wherever each metric appears on the card.
const RAIN_COLOR = "#54b4ff"; // chance of precipitation (blue)
const HUMIDITY_COLOR = "#34c9c2"; // humidity (teal)
const iconColorFor = (c) => CONDITION_COLORS[c] || DEFAULT_ICON;

// Chance of precipitation. Shown only at/above the threshold; below it (and
// when absent/zero) we hide it entirely so only meaningful rain appears.
const POP_MIN = 20;
const popText = (f) => {
  const p = f?.precipitation_probability;
  if (p === null || p === undefined || isNaN(p) || p < POP_MIN) return "";
  return `${Math.round(p)}%`;
};

// Forecast humidity -> "NN%" string, or "" when the integration doesn't supply it.
const humText = (f) => {
  const h = f?.humidity;
  return h === null || h === undefined || h === "" || isNaN(h) ? "" : `${Math.round(h)}%`;
};

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));

// Moon phase icons (from a Moon integration sensor, e.g. sensor.moon).
const MOON_ICONS = {
  new_moon: "mdi:moon-new",
  waxing_crescent: "mdi:moon-waxing-crescent",
  first_quarter: "mdi:moon-first-quarter",
  waxing_gibbous: "mdi:moon-waxing-gibbous",
  full_moon: "mdi:moon-full",
  waning_gibbous: "mdi:moon-waning-gibbous",
  last_quarter: "mdi:moon-last-quarter",
  waning_crescent: "mdi:moon-waning-crescent",
};

// US-AQI style color bands for an air-quality chip.
const aqiColor = (v) =>
  v <= 50 ? "#5fd38a" : v <= 100 ? "#e6c84a" : v <= 150 ? "#ef9a4a"
  : v <= 200 ? "#ef6a6a" : v <= 300 ? "#b06adf" : "#a05a6a";

// Config keys -> CSS custom properties, so every element's size is adjustable
// from the card editor. Unset keys fall back to the defaults baked into the CSS.
const SIZE_VARS = {
  hero_icon_size: "--gw-hero-icon",
  temp_size: "--gw-temp",
  feels_size: "--gw-feels",
  condition_size: "--gw-cond",
  hero_detail_size: "--gw-hero-detail",
  label_size: "--gw-label",
  strip_icon_size: "--gw-strip-icon",
  time_size: "--gw-time",
  hourly_temp_size: "--gw-htemp",
  day_size: "--gw-day",
  daily_temp_size: "--gw-dtemp",
  daily_low_size: "--gw-dlow",
  metric_size: "--gw-metric",
};

class GlanceWeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._forecasts = { daily: null, hourly: null };
    this._unsubs = [];
    this._subscribed = false;
    this._built = false;
    // Strip scrolling is driven by JS timers (not CSS animation) so it keeps
    // working inside embedded/kiosk webviews that disable CSS animations.
    this._scrollTimers = {};
    this._marqueeSig = {};
  }

  // Visual (GUI) editor shown when adding/editing the card in a dashboard.
  static getConfigElement() {
    return document.createElement("glance-weather-card-editor");
  }

  // Sensible default when the card is first added: pick the first weather entity.
  static getStubConfig(hass) {
    const weather = Object.keys(hass?.states || {}).find((e) => e.startsWith("weather."));
    return { entity: weather || "weather.home" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("glance-weather-card: 'entity' (a weather.* entity) is required");
    }
    if (!config.entity.startsWith("weather.")) {
      throw new Error("glance-weather-card: 'entity' must be a weather.* entity");
    }
    this.config = config;
    this._dailyCount = config.daily_count ?? 7;
    this._hourlyCount = config.hourly_count ?? 12;
    // "visible" = how many columns show at once; when it is smaller than the
    // total count the strip auto-rotates through the rest.
    this._hourlyVisible = clampInt(config.hourly_visible ?? this._hourlyCount, 1, this._hourlyCount);
    this._dailyVisible = clampInt(config.daily_visible ?? this._dailyCount, 1, this._dailyCount);
    // Seconds for one column to slide past (continuous scroll speed).
    this._scrollInterval = Math.max(0.2, Number(config.scroll_interval) || 3);
    // width/height are optional. When omitted the card fills its dashboard
    // cell, so it can be freely resized (e.g. drag-resized in a Sections
    // dashboard). Set explicit px to pin it to a fixed size instead.
    this._width = config.width ?? null;
    this._height = config.height ?? null;
    // entity changed -> need a fresh subscription
    this._unsubscribe();
    this._buildSkeleton();
    this._applySizeVars();
    if (this._hass) {
      this._subscribeForecasts();
      this._update();
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._subscribed) this._subscribeForecasts();
    this._update();
  }

  connectedCallback() {
    if (this._hass && !this._subscribed) this._subscribeForecasts();
    // Re-render on (re)attach so the scroll timer restarts after a move.
    if (this._built && this._hass) this._update();
  }

  disconnectedCallback() {
    this._unsubscribe();
    this._detachReconnect();
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
    this._stopMarquee("hourly");
    this._stopMarquee("daily");
    this._marqueeSig = {};
  }

  // Push per-element size overrides from config onto the host as CSS variables.
  _applySizeVars() {
    for (const [key, cssVar] of Object.entries(SIZE_VARS)) {
      const v = this.config[key];
      if (v === undefined || v === null || v === "" || isNaN(v)) this.style.removeProperty(cssVar);
      else this.style.setProperty(cssVar, `${Number(v)}px`);
    }
  }

  getCardSize() {
    return Math.ceil((this._height ?? 260) / 50);
  }

  // Let Sections (grid) dashboards resize the card freely, with sensible bounds.
  // getGridOptions is the current API; getLayoutOptions is the older fallback
  // so resizing works across HA versions.
  getGridOptions() {
    return { rows: 4, columns: 6, min_rows: 3, max_rows: 10, min_columns: 4, max_columns: 12 };
  }

  getLayoutOptions() {
    return { grid_columns: 6, grid_rows: 4, grid_min_columns: 4, grid_min_rows: 3 };
  }

  async _subscribeForecasts() {
    if (!this._hass || !this.config || this._subscribed) return;
    this._subscribed = true;
    this._attachReconnect();
    this._startHealthTimer();
    for (const type of ["daily", "hourly"]) {
      try {
        const unsub = await this._hass.connection.subscribeMessage(
          (event) => {
            const fc = event && event.forecast;
            // Ignore empty/absent pushes. These happen transiently when the
            // websocket reconnects or the entity is briefly unavailable; taking
            // them would blank the strips until a manual reload. Keeping the
            // last good forecast means the strips never go empty.
            if (Array.isArray(fc) && fc.length) {
              this._forecasts[type] = fc;
              this._update();
            }
          },
          {
            type: "weather/subscribe_forecast",
            forecast_type: type,
            entity_id: this.config.entity,
          }
        );
        this._unsubs.push(unsub);
      } catch (err) {
        // Entity may not support this forecast type; fail soft.
        console.warn(`glance-weather-card: ${type} forecast unavailable for ${this.config.entity}`, err);
      }
    }
  }

  // Safety net: periodically re-subscribe so the forecast can never stay stale
  // or blank for long, even if a reconnect slips past the "ready" event.
  _startHealthTimer() {
    if (this._healthTimer) return;
    this._healthTimer = setInterval(() => {
      if (!this._hass) return;
      this._unsubscribe();
      this._subscribeForecasts();
    }, 20 * 60 * 1000);
  }

  _unsubscribe() {
    this._unsubs.forEach((u) => {
      try {
        if (typeof u === "function") u();
        else if (u && typeof u.then === "function") u.then((f) => f && f());
      } catch (e) {
        /* ignore */
      }
    });
    this._unsubs = [];
    this._subscribed = false;
  }

  // The forecast strips only get data from the weather/subscribe_forecast push.
  // When the websocket reconnects (HA restart, network blip) the old
  // subscription is dead, so re-subscribe on the connection's "ready" event —
  // otherwise the strips silently go blank until the page is reloaded.
  _attachReconnect() {
    const conn = this._hass?.connection;
    if (!conn || typeof conn.addEventListener !== "function" || this._reconnectConn === conn) return;
    this._detachReconnect();
    this._onReady = () => {
      this._unsubscribe();
      this._subscribeForecasts();
    };
    conn.addEventListener("ready", this._onReady);
    this._reconnectConn = conn;
  }

  _detachReconnect() {
    if (this._reconnectConn && this._onReady) {
      try {
        this._reconnectConn.removeEventListener("ready", this._onReady);
      } catch (e) {
        /* ignore */
      }
    }
    this._reconnectConn = null;
    this._onReady = null;
  }

  _lang() {
    return this._hass?.locale?.language || navigator.language || "en";
  }

  _fmtClock(dt) {
    const d = new Date(dt);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "p" : "a";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, "0")}${ampm}`;
  }

  _fmtHour(dt) {
    const d = new Date(dt);
    let h = d.getHours();
    const ampm = h >= 12 ? "p" : "a";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}${ampm}`;
  }

  _fmtDay(dt, index) {
    const d = new Date(dt);
    if (index === 0) return "Today";
    return d.toLocaleDateString(this._lang(), { weekday: "short" });
  }

  _round(v) {
    return v === null || v === undefined || isNaN(v) ? "–" : Math.round(v);
  }

  // Approximate sunrise/sunset hours from the sun.sun entity (falls back to
  // 6:00/20:00), so a given forecast hour can be classified day vs. night.
  _sunHours() {
    const sun = this._hass?.states?.["sun.sun"];
    let rise = 6;
    let set = 20;
    if (sun?.attributes) {
      if (sun.attributes.next_rising) rise = new Date(sun.attributes.next_rising).getHours();
      if (sun.attributes.next_setting) set = new Date(sun.attributes.next_setting).getHours();
    }
    return { rise, set };
  }

  _isNight(dt) {
    const { rise, set } = this._sunHours();
    const h = new Date(dt).getHours();
    return h < rise || h >= set;
  }

  // Current (hero) day/night: trust sun.sun's live state when present.
  _isNightNow() {
    const sun = this._hass?.states?.["sun.sun"];
    if (sun?.state) return sun.state === "below_horizon";
    const h = new Date().getHours();
    const { rise, set } = this._sunHours();
    return h < rise || h >= set;
  }

  _buildSkeleton() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        .card {
          position: relative;
          width: ${this._width ? `${this._width}px` : "100%"};
          height: ${this._height ? `${this._height}px` : "100%"};
          min-height: ${210 + (this.config.hourly_two_rows ? 46 : 0) + (this.config.daily_two_rows ? 46 : 0)}px;
          box-sizing: border-box;
          padding: 8px 9px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          overflow: hidden;
          border-radius: 14px;
          /* Self-contained: the card background is always dark, so text uses a
             fixed light color rather than the theme's --primary-text-color
             (which is dark in light themes and would be unreadable here). */
          color: #eaf1fb;
          /* Default backdrop; a per-condition w-* class swaps this to match the
             current weather (see "weather moods" below). */
          background:
            radial-gradient(120% 80% at 80% 0%, rgba(90,140,210,0.18), transparent 60%),
            linear-gradient(160deg, #1d2733 0%, #141a22 100%);
          font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif);
          font-weight: 500;
          /* Legible from across the room: heavier base weight and a subtle dark
             shadow so light text keeps hard edges over the animated backdrop
             (reads much sharper at a distance than thin, smoothed text). */
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
        }
        /* Tiny version marker pinned to the top-left corner (readable on a
           kiosk with no console). Toggle with show_version. */
        .ver {
          position: absolute; top: 1px; left: 6px; z-index: 3;
          font-size: 8px; font-weight: 500; letter-spacing: 0.2px;
          opacity: 0.4; pointer-events: none; text-shadow: 0 1px 1px rgba(0,0,0,0.6);
        }
        .ver.hidden { display: none; }
        /* Animated effect layer sits behind the content (absolute => excluded
           from the flex flow), content is lifted above it. */
        .fx { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
        .card > .hero, .card > .label, .card > .row { position: relative; z-index: 1; }

        /* ---- Weather moods: backdrop tinted to the current condition ---- */
        .card.w-sunny {
          background:
            radial-gradient(130% 100% at 82% -12%, rgba(255,190,70,0.52), transparent 60%),
            linear-gradient(160deg, #235a7e 0%, #0f2a3c 100%);
        }
        .card.w-clear-night, .card.w-partlycloudy-night {
          background:
            radial-gradient(130% 100% at 80% -6%, rgba(96,120,235,0.40), transparent 64%),
            linear-gradient(170deg, #171d55 0%, #080c22 100%);
        }
        .card.w-partlycloudy {
          background:
            radial-gradient(130% 100% at 82% -8%, rgba(255,200,110,0.36), transparent 60%),
            linear-gradient(160deg, #2c4a63 0%, #16222e 100%);
        }
        .card.w-cloudy, .card.w-windy, .card.w-windy-variant {
          background:
            radial-gradient(130% 100% at 50% -12%, rgba(155,175,200,0.22), transparent 62%),
            linear-gradient(160deg, #38424f 0%, #1a212a 100%);
        }
        .card.w-fog {
          background:
            radial-gradient(130% 100% at 50% 0%, rgba(185,195,210,0.24), transparent 66%),
            linear-gradient(160deg, #3c434c 0%, #262d35 100%);
        }
        .card.w-rainy {
          background:
            radial-gradient(130% 100% at 78% -6%, rgba(70,120,185,0.44), transparent 64%),
            linear-gradient(160deg, #1e374f 0%, #0d1926 100%);
        }
        .card.w-pouring, .card.w-snowy-rainy {
          background:
            radial-gradient(130% 100% at 75% -6%, rgba(60,110,175,0.42), transparent 62%),
            linear-gradient(160deg, #17304a 0%, #0a1420 100%);
        }
        .card.w-lightning, .card.w-lightning-rainy {
          background:
            radial-gradient(130% 100% at 60% -10%, rgba(150,120,225,0.34), transparent 62%),
            linear-gradient(160deg, #211f38 0%, #0b0c16 100%);
        }
        .card.w-snowy, .card.w-hail {
          background:
            radial-gradient(130% 100% at 50% -12%, rgba(195,218,248,0.34), transparent 64%),
            linear-gradient(160deg, #2e3c4c 0%, #141d27 100%);
        }
        .card.w-exceptional {
          background:
            radial-gradient(130% 100% at 50% -10%, rgba(255,90,80,0.36), transparent 62%),
            linear-gradient(160deg, #3a1e22 0%, #160e10 100%);
        }

        /* ---- Animated flourishes ---- */
        /* Sun: pulsing core glow + slowly turning rays. */
        .card.w-sunny .fx {
          background: radial-gradient(72px 72px at 84% -2%, rgba(255,205,110,0.55), transparent);
          animation: gw-sun 5s ease-in-out infinite;
        }
        .card.w-sunny .fx::before {
          content: ""; position: absolute; top: -74px; right: -46px; width: 196px; height: 196px;
          background: repeating-conic-gradient(from 0deg, rgba(255,214,130,0.36) 0deg 4deg, transparent 4deg 30deg);
          -webkit-mask: radial-gradient(circle, transparent 30px, #000 34px, #000 66px, transparent 76px);
                  mask: radial-gradient(circle, transparent 30px, #000 34px, #000 66px, transparent 76px);
          border-radius: 50%;
          animation: gw-spin 34s linear infinite;
        }
        .card.w-clear-night .fx, .card.w-partlycloudy-night .fx {
          background-repeat: no-repeat;
          background-image:
            radial-gradient(1.8px 1.8px at 12% 22%, #fff, transparent),
            radial-gradient(1.6px 1.6px at 28% 64%, #dce8ff, transparent),
            radial-gradient(2px 2px at 41% 16%, #fff, transparent),
            radial-gradient(1.5px 1.5px at 55% 48%, #fff, transparent),
            radial-gradient(1.9px 1.9px at 67% 28%, #eaf1ff, transparent),
            radial-gradient(1.6px 1.6px at 78% 60%, #fff, transparent),
            radial-gradient(2px 2px at 90% 34%, #fff, transparent),
            radial-gradient(1.5px 1.5px at 35% 38%, #dce8ff, transparent),
            radial-gradient(1.7px 1.7px at 84% 14%, #fff, transparent),
            radial-gradient(1.6px 1.6px at 20% 46%, #fff, transparent),
            radial-gradient(1.5px 1.5px at 62% 72%, #dce8ff, transparent);
          animation: gw-twinkle 4s ease-in-out infinite;
        }
        /* Rain: two parallax layers of falling droplets (vertical streaks). */
        .card.w-rainy .fx, .card.w-pouring .fx, .card.w-lightning-rainy .fx, .card.w-snowy-rainy .fx {
          background-repeat: repeat;
          background-size: 58px 80px;
          background-image:
            radial-gradient(1.2px 8px at 10px 8px, rgba(200,222,248,0.55), transparent),
            radial-gradient(1.2px 8px at 38px 30px, rgba(200,222,248,0.5), transparent),
            radial-gradient(1.2px 8px at 24px 56px, rgba(200,222,248,0.5), transparent),
            radial-gradient(1.2px 8px at 50px 70px, rgba(200,222,248,0.45), transparent);
          animation: gw-fall-a 0.6s linear infinite;
        }
        .card.w-rainy .fx::before, .card.w-pouring .fx::before,
        .card.w-lightning-rainy .fx::before, .card.w-snowy-rainy .fx::before {
          content: ""; position: absolute; inset: 0; opacity: 0.7;
          background-repeat: repeat;
          background-size: 78px 104px;
          background-image:
            radial-gradient(1.4px 10px at 20px 14px, rgba(210,228,250,0.5), transparent),
            radial-gradient(1.4px 10px at 60px 46px, rgba(210,228,250,0.45), transparent),
            radial-gradient(1.4px 10px at 40px 84px, rgba(210,228,250,0.45), transparent);
          animation: gw-fall-b 0.9s linear infinite;
        }
        .card.w-pouring .fx {
          background-image:
            radial-gradient(1.3px 8px at 8px 6px, rgba(205,225,250,0.6), transparent),
            radial-gradient(1.3px 8px at 30px 22px, rgba(205,225,250,0.55), transparent),
            radial-gradient(1.3px 8px at 48px 40px, rgba(205,225,250,0.55), transparent),
            radial-gradient(1.3px 8px at 18px 52px, rgba(205,225,250,0.5), transparent),
            radial-gradient(1.3px 8px at 40px 68px, rgba(205,225,250,0.55), transparent),
            radial-gradient(1.3px 8px at 54px 14px, rgba(205,225,250,0.5), transparent);
          animation-duration: 0.42s;
        }
        .card.w-pouring .fx::before { opacity: 0.9; animation-duration: 0.6s; }
        /* Snow: two parallax layers of drifting flakes. */
        .card.w-snowy .fx, .card.w-hail .fx {
          background-repeat: repeat;
          background-size: 100px 100px;
          background-image:
            radial-gradient(2.4px 2.4px at 20px 18px, #fff, transparent),
            radial-gradient(2px 2px at 70px 50px, rgba(255,255,255,0.85), transparent),
            radial-gradient(2.6px 2.6px at 46px 82px, #fff, transparent),
            radial-gradient(1.8px 1.8px at 88px 92px, rgba(255,255,255,0.8), transparent);
          animation: gw-snow-a 6.5s linear infinite;
        }
        .card.w-snowy .fx::before, .card.w-hail .fx::before {
          content: ""; position: absolute; inset: 0; opacity: 0.85;
          background-repeat: repeat;
          background-size: 140px 140px;
          background-image:
            radial-gradient(1.8px 1.8px at 30px 24px, #fff, transparent),
            radial-gradient(2.2px 2.2px at 100px 70px, rgba(255,255,255,0.9), transparent),
            radial-gradient(1.6px 1.6px at 64px 120px, rgba(255,255,255,0.8), transparent);
          animation: gw-snow-b 10s linear infinite;
        }
        /* Clouds (also partly-cloudy day): soft blobs drifting in two layers. */
        .card.w-cloudy .fx, .card.w-partlycloudy .fx {
          background-repeat: repeat-x;
          background-size: 340px 100%;
          background-image:
            radial-gradient(70px 42px at 70px 34px, rgba(214,224,238,0.18), transparent 70%),
            radial-gradient(104px 58px at 168px 26px, rgba(214,224,238,0.22), transparent 72%),
            radial-gradient(64px 40px at 252px 42px, rgba(214,224,238,0.18), transparent 70%);
          animation: gw-cloud-a 26s linear infinite;
        }
        .card.w-cloudy .fx::before, .card.w-partlycloudy .fx::before {
          content: ""; position: absolute; inset: 0; opacity: 0.85;
          background-repeat: repeat-x;
          background-size: 470px 100%;
          background-image:
            radial-gradient(120px 66px at 120px 72px, rgba(200,210,226,0.14), transparent 72%),
            radial-gradient(94px 54px at 330px 88px, rgba(200,210,226,0.16), transparent 72%);
          animation: gw-cloud-b 42s linear infinite;
        }
        /* Fog: thick mist banks rolling slowly in opposite directions. */
        .card.w-fog .fx {
          background-repeat: repeat-x;
          background-size: 360px 100%;
          background-image:
            radial-gradient(200px 70px at 90px 55%, rgba(206,214,226,0.22), transparent 72%),
            radial-gradient(160px 60px at 280px 78%, rgba(206,214,226,0.20), transparent 72%);
          animation: gw-fog-a 30s linear infinite;
        }
        .card.w-fog .fx::before {
          content: ""; position: absolute; inset: 0; opacity: 0.9;
          background-repeat: repeat-x;
          background-size: 300px 100%;
          background-image:
            radial-gradient(180px 64px at 150px 38%, rgba(206,214,226,0.18), transparent 72%);
          animation: gw-fog-b 46s linear infinite;
        }
        /* Wind: fast gust streaks plus slow high clouds. */
        .card.w-windy .fx, .card.w-windy-variant .fx {
          background-repeat: repeat;
          background-size: 230px 74px;
          background-image:
            radial-gradient(46px 1.5px at 34px 16px, rgba(212,224,240,0.4), transparent),
            radial-gradient(66px 1.7px at 150px 42px, rgba(212,224,240,0.34), transparent),
            radial-gradient(36px 1.3px at 96px 60px, rgba(212,224,240,0.3), transparent);
          animation: gw-gust 1.7s linear infinite;
        }
        .card.w-windy .fx::before, .card.w-windy-variant .fx::before {
          content: ""; position: absolute; inset: 0; opacity: 0.7;
          background-repeat: repeat-x;
          background-size: 470px 100%;
          background-image:
            radial-gradient(110px 60px at 110px 40px, rgba(205,214,228,0.12), transparent 72%);
          animation: gw-cloud-b 30s linear infinite;
        }
        .card.w-lightning .fx::after, .card.w-lightning-rainy .fx::after {
          content: ""; position: absolute; inset: 0; opacity: 0;
          background: radial-gradient(140% 90% at 50% -5%, rgba(230,235,255,0.85), transparent 62%);
          animation: gw-flash 6s linear infinite;
        }
        @keyframes gw-sun { 0%,100% { opacity: 0.8; } 50% { opacity: 1; } }
        @keyframes gw-spin { to { transform: rotate(360deg); } }
        @keyframes gw-twinkle { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
        @keyframes gw-fall-a { to { background-position: -10px 80px; } }
        @keyframes gw-fall-b { to { background-position: 8px 104px; } }
        @keyframes gw-snow-a { to { background-position: 14px 100px; } }
        @keyframes gw-snow-b { to { background-position: -20px 140px; } }
        @keyframes gw-cloud-a { to { background-position: 340px 0; } }
        @keyframes gw-cloud-b { to { background-position: 470px 0; } }
        @keyframes gw-fog-a { to { background-position: 360px 0; } }
        @keyframes gw-fog-b { to { background-position: -300px 0; } }
        @keyframes gw-gust { to { background-position: 230px 0; } }
        @keyframes gw-flash {
          0%, 90%, 100% { opacity: 0; }
          91% { opacity: 0.9; } 92% { opacity: 0.15; }
          93% { opacity: 0.75; } 94% { opacity: 0; }
        }
        /* Continuous strip scroll is driven by a JS timer (see _startMarquee)
           so it survives embedded webviews that block CSS animations. Only the
           decorative background/alert effects honor reduced-motion. */
        @media (prefers-reduced-motion: reduce) {
          .fx, .fx::before, .fx::after, .alert { animation: none !important; }
        }
        .hero {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 50px;
          flex: 0 0 auto;
        }
        /* Every size below uses a CSS var (set from the card editor) with a
           sensible default fallback, so each line is independently adjustable. */
        .hero .big-icon { --mdc-icon-size: var(--gw-hero-icon, 42px); color: #cfe0f5; flex: 0 0 auto; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }
        .hero .tempwrap { display: flex; flex-direction: column; justify-content: center; flex: 0 0 auto; }
        .hero .temp { font-size: var(--gw-temp, 38px); font-weight: 600; line-height: 1; }
        .hero .feels { font-size: var(--gw-feels, 11px); font-weight: 500; line-height: 1.1; opacity: 0.9; margin-top: 2px; white-space: nowrap; }
        .hero .feels.hidden { display: none; }
        .hero .meta { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; }
        .hero .cond {
          font-size: var(--gw-cond, 12.5px); font-weight: 500; line-height: 1.2;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .hero .sub { display: flex; align-items: center; gap: 10px; }
        .hero .hum, .hero .pcp { font-size: var(--gw-hero-detail, 12px); font-weight: 500; display: flex; align-items: center; gap: 3px; }
        .hero .hum ha-icon, .hero .pcp ha-icon { --mdc-icon-size: 14px; }
        .hero .hum { color: ${HUMIDITY_COLOR}; }
        .hero .hum ha-icon { color: ${HUMIDITY_COLOR}; }
        .hero .pcp { color: ${RAIN_COLOR}; }
        .hero .pcp.hidden { display: none; }
        /* Optional hero chips: high/low, wind, sun times, air quality. */
        .hero .sub { flex-wrap: wrap; }
        .hero .hl, .hero .wind, .hero .suninfo, .hero .aqi {
          font-size: var(--gw-hero-detail, 12px); font-weight: 500;
          display: flex; align-items: center; gap: 3px; opacity: 0.9;
        }
        .hero .hl .hival { font-weight: 700; }
        .hero .hl .loval { opacity: 0.7; }
        .hero .wind ha-icon, .hero .suninfo ha-icon { --mdc-icon-size: 13px; opacity: 0.85; }
        .hero .wind .windarrow { --mdc-icon-size: 12px; }
        .hero .aqi { font-weight: 600; }
        .hero .hidden { display: none; }
        /* Weather alert banner: a thin pulsing bar above the hero when active. */
        .alert {
          flex: 0 0 auto; display: flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 700; color: #fff;
          background: linear-gradient(90deg, #b3261e, #d0392f);
          border-radius: 7px; padding: 2px 8px; margin-bottom: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          animation: gw-alertpulse 1.8s ease-in-out infinite;
        }
        .alert ha-icon { --mdc-icon-size: 14px; }
        .alert.hidden { display: none; }
        @keyframes gw-alertpulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.25); } }
        /* Highlight the current (first) hour. */
        .cell.now { background: rgba(255,255,255,0.08); border-radius: 8px; }
        .spacer { flex: 1 1 auto; }
        .label {
          font-size: var(--gw-label, 9px); letter-spacing: 0.4px; text-transform: uppercase;
          font-weight: 600; opacity: 0.75; margin: 1px 0 0;
        }
        /* Each strip is a viewport (overflow hidden); the .track inside holds
           the cells and — when there are more than fit — slides continuously
           (marquee). Rows grow to share extra height. */
        .row { flex: 1 1 auto; overflow: hidden; }
        /* A 2-row strip takes double the height and shows everything at once
           (no scroll) — the track becomes a 2-row grid (see _renderStrip). */
        .row.tworow { flex: 2 1 auto; }
        .track { display: flex; width: 100%; height: 100%; align-items: center; will-change: transform; }
        .track > .cell { flex: 1 1 0; min-width: 0; }
        .row.tworow .track > .cell { flex: none; min-width: 0; }
        .cell { display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.15; overflow: hidden; }
        .cell ha-icon { --mdc-icon-size: var(--gw-strip-icon, 18px); color: ${DEFAULT_ICON}; margin: 1px 0; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.5)); }
        .cell .t1 { font-weight: 500; opacity: 0.9; }
        .cell .t2 { font-weight: 600; }
        .row.hourly .cell .t1 { font-size: var(--gw-time, 10px); }
        .row.daily .cell .t1 { font-size: var(--gw-day, 10px); }
        .row.hourly .cell .t2 { font-size: var(--gw-htemp, 11px); }
        .row.daily .cell .t2 { font-size: var(--gw-dtemp, 11px); }
        .cell .lo { font-size: var(--gw-dlow, 10px); font-weight: 400; opacity: 0.82; }
        /* Rain (blue) + humidity (teal) share ONE row to save vertical space;
           when only one is present it centers. */
        /* Rain (blue) + humidity (teal) on one compact row; color tells them
           apart so no per-item icon is needed (keeps it narrow). */
        .cell .metrics { display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 12px; max-width: 100%; white-space: nowrap; }
        .cell .dh, .cell .pop { font-size: var(--gw-metric, 9px); font-weight: 600; line-height: 1.2; }
        .cell .dh { color: ${HUMIDITY_COLOR}; }
        .cell .pop { color: ${RAIN_COLOR}; }
        .cell .dh.hidden, .cell .pop.hidden { display: none; }
        .unit { font-size: 0.55em; opacity: 0.8; vertical-align: top; }
      </style>
      <div class="card">
        <div class="fx"></div>
        <div class="ver${this.config.show_version === false ? " hidden" : ""}">${CARD_VERSION}</div>
        <div class="alert hidden"><ha-icon icon="mdi:alert"></ha-icon><span class="alertval"></span></div>
        <div class="hero">
          <ha-icon class="big-icon"></ha-icon>
          <div class="tempwrap">
            <div class="temp">–</div>
            <div class="feels hidden">Feels <span class="feelsval"></span></div>
          </div>
          <div class="meta">
            <div class="cond"></div>
            <div class="sub">
              <span class="hum"><ha-icon icon="mdi:water-percent"></ha-icon><span class="humval">–</span></span>
              <span class="pcp hidden"><ha-icon icon="mdi:weather-pouring"></ha-icon><span class="pcpval"></span></span>
              <span class="hl hidden"><span class="hival"></span> <span class="loval"></span></span>
              <span class="wind hidden"><ha-icon icon="mdi:weather-windy"></ha-icon><span class="windval"></span><ha-icon class="windarrow" icon="mdi:navigation"></ha-icon></span>
              <span class="suninfo hidden"><ha-icon icon="mdi:weather-sunset-up"></ha-icon><span class="sunrise"></span><ha-icon icon="mdi:weather-sunset-down"></ha-icon><span class="sunset"></span></span>
              <span class="aqi hidden">AQI&nbsp;<span class="aqival"></span></span>
            </div>
          </div>
        </div>
        <div class="label">Next ${this._hourlyCount} hours</div>
        <div class="row hourly${this.config.hourly_two_rows ? " tworow" : ""}"><div class="track"></div></div>
        <div class="label">${this._dailyCount}-day</div>
        <div class="row daily${this.config.daily_two_rows ? " tworow" : ""}"><div class="track"></div></div>
      </div>
    `;
    this._built = true;
  }

  _update() {
    if (!this._built || !this._hass) return;
    const root = this.shadowRoot;
    const st = this._hass.states[this.config.entity];
    if (!st) {
      root.querySelector(".cond").textContent = "Entity unavailable";
      return;
    }
    const unit = st.attributes.temperature_unit || "°";

    // ---- Hero (current) ----
    const heroCond = this._isNightNow() ? nightCondition(st.state) : st.state;
    // Make the whole card's backdrop "feel" like the current weather.
    root.querySelector(".card").className = `card ${bgClassFor(heroCond)}`.trim();
    const heroIcon = root.querySelector(".big-icon");
    heroIcon.setAttribute("icon", iconFor(heroCond));
    heroIcon.style.color = iconColorFor(heroCond);
    // On a clear/partly-clear night, show the actual moon phase if configured.
    if (this.config.moon_entity && (heroCond === "clear-night" || heroCond === "partlycloudy-night")) {
      const m = this._hass.states[this.config.moon_entity];
      const mi = m && MOON_ICONS[m.state];
      if (mi) {
        heroIcon.setAttribute("icon", mi);
        heroIcon.style.color = "#cdd7ff";
      }
    }
    // Build via textContent (not innerHTML) so the unit string, which comes
    // from entity attributes, can never inject markup.
    const tempEl = root.querySelector(".temp");
    tempEl.textContent = `${this._round(st.attributes.temperature)}`;
    const unitSpan = document.createElement("span");
    unitSpan.className = "unit";
    unitSpan.textContent = unit;
    tempEl.appendChild(unitSpan);
    root.querySelector(".cond").textContent = labelFor(heroCond);

    // "Real feel" / apparent temperature: from the weather entity's
    // apparent_temperature attribute, or an optional sensor override.
    let feels = st.attributes.apparent_temperature;
    if (this.config.apparent_temperature_entity) {
      const s = this._hass.states[this.config.apparent_temperature_entity];
      if (s) feels = s.state;
    }
    const feelsEl = root.querySelector(".feels");
    if (feels === undefined || feels === null || feels === "" || isNaN(feels)) {
      feelsEl.classList.add("hidden");
    } else {
      feelsEl.classList.remove("hidden");
      root.querySelector(".feelsval").textContent = `${Math.round(feels)}°`;
    }

    let humidity = st.attributes.humidity;
    if (this.config.humidity_entity) {
      const h = this._hass.states[this.config.humidity_entity];
      if (h) humidity = h.state;
    }
    root.querySelector(".humval").textContent =
      humidity === undefined || humidity === null || humidity === "" ? "–" : `${Math.round(humidity)}%`;

    // Current precip chance: prefer the nearest hourly forecast, fall back to today's daily.
    const pcpSource = (this._forecasts.hourly || [])[0] || (this._forecasts.daily || [])[0];
    const pcp = popText(pcpSource);
    const pcpEl = root.querySelector(".pcp");
    if (pcp) {
      pcpEl.classList.remove("hidden");
      root.querySelector(".pcpval").textContent = pcp;
    } else {
      pcpEl.classList.add("hidden");
    }

    this._updateHeroExtras(st);
    this._renderHourly();
    this._renderDaily();
  }

  // Optional hero chips + alert banner, each shown only when enabled/available.
  _updateHeroExtras(st) {
    const root = this.shadowRoot;
    const cfg = this.config;
    const toggle = (sel, show) => root.querySelector(sel).classList.toggle("hidden", !show);

    // Today's high / low from the daily forecast.
    const today = (this._forecasts.daily || [])[0];
    const hlOk = cfg.show_today_highlow && today &&
      today.temperature != null && !isNaN(today.temperature) &&
      today.templow != null && !isNaN(today.templow);
    if (hlOk) {
      root.querySelector(".hl .hival").textContent = `H${Math.round(today.temperature)}°`;
      root.querySelector(".hl .loval").textContent = `L${Math.round(today.templow)}°`;
    }
    toggle(".hl", hlOk);

    // Wind speed + a direction arrow (bearing is where wind comes FROM, so the
    // arrow — which points down by default — is rotated to show where it goes).
    const ws = st.attributes.wind_speed;
    const windOk = cfg.show_wind && ws != null && ws !== "" && !isNaN(ws);
    if (windOk) {
      const wu = st.attributes.wind_speed_unit || "";
      root.querySelector(".wind .windval").textContent = `${Math.round(ws)}${wu ? " " + wu : ""}`;
      const arrow = root.querySelector(".wind .windarrow");
      const bearing = Number(st.attributes.wind_bearing);
      if (!isNaN(bearing)) {
        arrow.style.transform = `rotate(${(bearing + 180) % 360}deg)`;
        arrow.classList.remove("hidden");
      } else {
        arrow.classList.add("hidden");
      }
    }
    toggle(".wind", windOk);

    // Sunrise / sunset from sun.sun.
    const sun = this._hass.states["sun.sun"];
    const sunOk = cfg.show_sun && sun && sun.attributes &&
      (sun.attributes.next_rising || sun.attributes.next_setting);
    if (sunOk) {
      root.querySelector(".suninfo .sunrise").textContent =
        sun.attributes.next_rising ? this._fmtClock(sun.attributes.next_rising) : "–";
      root.querySelector(".suninfo .sunset").textContent =
        sun.attributes.next_setting ? this._fmtClock(sun.attributes.next_setting) : "–";
    }
    toggle(".suninfo", sunOk);

    // Air-quality chip from a sensor.
    const aqiS = cfg.aqi_entity && this._hass.states[cfg.aqi_entity];
    const aqiOk = aqiS && aqiS.state != null && aqiS.state !== "" && !isNaN(aqiS.state);
    if (aqiOk) {
      const v = Math.round(Number(aqiS.state));
      root.querySelector(".aqival").textContent = v;
      root.querySelector(".aqi").style.color = aqiColor(v);
    }
    toggle(".aqi", aqiOk);

    // Weather-alert banner from an entity (active when it's not an "off" state).
    const alertS = cfg.alert_entity && this._hass.states[cfg.alert_entity];
    const off = ["off", "unknown", "unavailable", "none", "0", "", "no"];
    const active = alertS && !off.includes(String(alertS.state).toLowerCase());
    if (active) {
      root.querySelector(".alertval").textContent =
        alertS.attributes.event || alertS.attributes.friendly_name || alertS.state;
    }
    toggle(".alert", active);
  }

  // Build a strip's track. When there are more items than fit, the cells are
  // duplicated and the track continuously slides (a real marquee, looping
  // seamlessly), showing `visible` columns at a time. The slide is driven by a
  // JS timer (not a CSS animation) so it keeps working in embedded/kiosk
  // webviews that disable CSS animations. Otherwise it's static.
  _renderStrip(key, rowSel, pool, visible, twoRows, cellFn) {
    const track = this.shadowRoot.querySelector(`${rowSel} .track`);
    if (!track) return;
    const n = pool.length;
    const cells = pool.map(cellFn).join("");

    // 2-row mode: show everything in a 2-row grid, no scrolling.
    if (twoRows) {
      this._stopMarquee(key);
      this._marqueeSig[key] = null;
      const cols = Math.max(1, Math.ceil(n / 2));
      track.innerHTML = cells;
      track.style.transform = "";
      track.style.width = "100%";
      track.style.display = "grid";
      track.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      track.style.gridTemplateRows = "repeat(2, 1fr)";
      return;
    }
    // 1-row mode: clear any grid styling from a previous config.
    track.style.display = "";
    track.style.gridTemplateColumns = "";
    track.style.gridTemplateRows = "";

    const scrolling = n > 0 && visible < n;
    if (scrolling) {
      track.innerHTML = cells + cells; // duplicate for a seamless loop
      track.style.width = `${((2 * n) / visible) * 100}%`;
      const durationSec = n * this._scrollInterval;
      const sig = `${n}|${visible}|${durationSec}`;
      if (this._marqueeSig[key] !== sig) {
        this._marqueeSig[key] = sig;
        this._startMarquee(key, track, durationSec);
      }
    } else {
      track.innerHTML = cells;
      track.style.width = n ? `${(n / visible) * 100}%` : "100%";
      track.style.transform = "";
      this._stopMarquee(key);
      this._marqueeSig[key] = null;
    }
  }

  _startMarquee(key, track, durationSec) {
    this._stopMarquee(key);
    const durMs = Math.max(2000, durationSec * 1000);
    const start = performance.now();
    // ~25fps is plenty for a slow ticker and cheap (a composited transform).
    this._scrollTimers[key] = setInterval(() => {
      const p = ((performance.now() - start) % durMs) / durMs; // 0..1
      // Track holds two copies, so -50% == one full set (seamless loop).
      track.style.transform = `translateX(${(-p * 50).toFixed(3)}%)`;
    }, 40);
  }

  _stopMarquee(key) {
    if (this._scrollTimers[key]) {
      clearInterval(this._scrollTimers[key]);
      this._scrollTimers[key] = null;
    }
  }

  _renderHourly() {
    if (!this._built || !this._hass) return;
    const pool = (this._forecasts.hourly || []).slice(0, this._hourlyCount);
    const markNow = this.config.highlight_now !== false;
    this._renderStrip("hourly", ".row.hourly", pool, this._hourlyVisible, !!this.config.hourly_two_rows, (f, i) => {
      const cond = this._isNight(f.datetime) ? nightCondition(f.condition) : f.condition;
      const pop = popText(f);
      const rh = humText(f);
      const now = markNow && i === 0 ? " now" : "";
      return `
        <div class="cell${now}">
          <span class="t1">${this._fmtHour(f.datetime)}</span>
          <ha-icon icon="${iconFor(cond)}" style="color:${iconColorFor(cond)}"></ha-icon>
          <span class="t2">${this._round(f.temperature)}°</span>
          <div class="metrics">
            <span class="pop${pop ? "" : " hidden"}">${pop}</span>
            <span class="dh${rh ? "" : " hidden"}">${rh}</span>
          </div>
        </div>`;
    });
  }

  _renderDaily() {
    if (!this._built || !this._hass) return;
    const pool = (this._forecasts.daily || []).slice(0, this._dailyCount);
    this._renderStrip("daily", ".row.daily", pool, this._dailyVisible, !!this.config.daily_two_rows, (f, i) => {
      const pop = popText(f);
      const rh = humText(f);
      // i is the index within the pool, so only the real first day is "Today".
      return `
        <div class="cell">
          <span class="t1">${this._fmtDay(f.datetime, i)}</span>
          <ha-icon icon="${iconFor(f.condition)}" style="color:${iconColorFor(f.condition)}"></ha-icon>
          <span class="t2">${this._round(f.temperature)}°</span>
          <span class="lo">${this._round(f.templow)}°</span>
          <div class="metrics">
            <span class="pop${pop ? "" : " hidden"}">${pop}</span>
            <span class="dh${rh ? "" : " hidden"}">${rh}</span>
          </div>
        </div>`;
    });
  }
}

customElements.define("glance-weather-card", GlanceWeatherCard);

// ---- Visual config editor (GUI) ----
// Uses HA's built-in <ha-form> with selectors, so the weather entity (and the
// optional sensors/counts/size) are chosen from pickers instead of YAML.
const px = (min, max) => ({ number: { min, max, mode: "box", unit_of_measurement: "px" } });
const sizeField = (name) => ({ name, selector: px(6, 160) });
const EDITOR_SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: "weather" } } },
  {
    name: "", type: "grid",
    schema: [
      { name: "apparent_temperature_entity", selector: { entity: { domain: ["sensor", "number", "input_number"] } } },
      { name: "humidity_entity", selector: { entity: { domain: ["sensor", "number", "input_number"] } } },
    ],
  },
  {
    name: "", type: "grid",
    schema: [
      { name: "hourly_count", selector: { number: { min: 1, max: 48, mode: "box" } } },
      { name: "hourly_visible", selector: { number: { min: 1, max: 48, mode: "box" } } },
      { name: "daily_count", selector: { number: { min: 1, max: 14, mode: "box" } } },
      { name: "daily_visible", selector: { number: { min: 1, max: 14, mode: "box" } } },
      { name: "scroll_interval", selector: { number: { min: 1, max: 60, mode: "box", unit_of_measurement: "s" } } },
    ],
  },
  {
    name: "", type: "grid",
    schema: [
      { name: "hourly_two_rows", selector: { boolean: {} } },
      { name: "daily_two_rows", selector: { boolean: {} } },
    ],
  },
  {
    name: "", type: "grid",
    schema: [
      { name: "width", selector: px(100, 1400) },
      { name: "height", selector: px(100, 1400) },
    ],
  },
  {
    name: "", type: "grid",
    schema: [
      { name: "show_today_highlow", selector: { boolean: {} } },
      { name: "show_wind", selector: { boolean: {} } },
      { name: "show_sun", selector: { boolean: {} } },
      { name: "highlight_now", selector: { boolean: {} } },
      { name: "show_version", selector: { boolean: {} } },
    ],
  },
  {
    name: "", type: "grid",
    schema: [
      { name: "alert_entity", selector: { entity: {} } },
      { name: "aqi_entity", selector: { entity: { domain: ["sensor"] } } },
      { name: "moon_entity", selector: { entity: { domain: ["sensor"] } } },
    ],
  },
  {
    name: "", type: "grid",
    schema: [
      sizeField("hero_icon_size"),
      sizeField("temp_size"),
      sizeField("feels_size"),
      sizeField("condition_size"),
      sizeField("hero_detail_size"),
      sizeField("label_size"),
      sizeField("strip_icon_size"),
      sizeField("time_size"),
      sizeField("hourly_temp_size"),
      sizeField("day_size"),
      sizeField("daily_temp_size"),
      sizeField("daily_low_size"),
      sizeField("metric_size"),
    ],
  },
];
const EDITOR_LABELS = {
  entity: "Weather entity (required)",
  apparent_temperature_entity: "Real-feel entity (optional)",
  humidity_entity: "Humidity entity (optional)",
  hourly_count: "Hourly: total (rotate through)",
  hourly_visible: "Hourly: visible at once",
  daily_count: "Daily: total (rotate through)",
  daily_visible: "Daily: visible at once",
  scroll_interval: "Auto-rotate every",
  hourly_two_rows: "Hourly: 2 rows (shows all, no scroll)",
  daily_two_rows: "Daily: 2 rows (shows all, no scroll)",
  width: "Width (blank = fill cell)",
  height: "Height (blank = fill cell)",
  show_version: "Show version marker (top-left)",
  show_today_highlow: "Show today's high / low",
  show_wind: "Show wind (speed + direction)",
  show_sun: "Show sunrise / sunset",
  highlight_now: "Highlight the current hour",
  alert_entity: "Weather-alert entity (banner when active)",
  aqi_entity: "Air-quality (AQI) sensor",
  moon_entity: "Moon-phase sensor (night icon)",
  hero_icon_size: "Big weather icon",
  temp_size: "Current temperature",
  feels_size: "Real-feel line",
  condition_size: "Condition text",
  hero_detail_size: "Humidity / precip (top)",
  label_size: "Section labels",
  strip_icon_size: "Strip icons",
  time_size: "Hourly time labels",
  hourly_temp_size: "Hourly temperature",
  day_size: "Daily day names",
  daily_temp_size: "Daily high",
  daily_low_size: "Daily low",
  metric_size: "Strip rain / humidity",
};
// Baselines shown under each field so you know what you're adjusting from.
const EDITOR_DEFAULTS = {
  hourly_count: "12", hourly_visible: "= total (all shown)",
  daily_count: "7", daily_visible: "= total (all shown)",
  scroll_interval: "3 s per column",
  hourly_two_rows: "off", daily_two_rows: "off",
  width: "blank = fill cell", height: "blank = fill cell",
  show_version: "on by default",
  highlight_now: "on by default", show_today_highlow: "off",
  show_wind: "needs wind_speed", show_sun: "uses sun.sun",
  alert_entity: "optional", aqi_entity: "optional", moon_entity: "optional",
  hero_icon_size: "42px", temp_size: "38px", feels_size: "11px",
  condition_size: "12.5px", hero_detail_size: "12px", label_size: "9px",
  strip_icon_size: "18px", time_size: "10px", hourly_temp_size: "11px",
  day_size: "10px", daily_temp_size: "11px", daily_low_size: "10px",
  metric_size: "9px",
};
const editorHelper = (s) =>
  EDITOR_DEFAULTS[s.name] ? `Default: ${EDITOR_DEFAULTS[s.name]}` : undefined;

class GlanceWeatherCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    if (this._form) this._form.data = config;
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    if (this._form) return;
    const form = document.createElement("ha-form");
    form.schema = EDITOR_SCHEMA;
    form.computeLabel = (s) => EDITOR_LABELS[s.name] || s.name;
    form.computeHelper = editorHelper;
    if (this._hass) form.hass = this._hass;
    if (this._config) form.data = this._config;
    form.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      // Merge so non-schema keys (e.g. `type`) are preserved.
      const config = { ...this._config, ...ev.detail.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config },
          bubbles: true,
          composed: true,
        })
      );
    });
    this._form = form;
    this.appendChild(form);
  }
}
customElements.define("glance-weather-card-editor", GlanceWeatherCardEditor);

// Stamped with the date-based release version by the release workflow (shows
// "dev" for un-released local builds). Printed to the console so two devices —
// and HACS — can be compared to catch a stale cached copy.
const CARD_VERSION = "dev";

window.customCards = window.customCards || [];
window.customCards.push({
  type: "glance-weather-card",
  name: "Glance Weather Card",
  description: "At-a-glance weather: current + hourly + daily, with animated weather backdrops.",
});

console.info(
  `%c glance-weather-card %c ${CARD_VERSION} `,
  "background:#2d6cdf;color:#fff;border-radius:3px 0 0 3px;padding:2px 4px",
  "background:#1d2733;color:#cfe0f5;border-radius:0 3px 3px 0;padding:2px 4px"
);
