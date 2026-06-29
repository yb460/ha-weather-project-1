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

class GlanceWeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._forecasts = { daily: null, hourly: null };
    this._unsubs = [];
    this._subscribed = false;
    this._built = false;
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
    // width/height are optional. When omitted the card fills its dashboard
    // cell, so it can be freely resized (e.g. drag-resized in a Sections
    // dashboard). Set explicit px to pin it to a fixed size instead.
    this._width = config.width ?? null;
    this._height = config.height ?? null;
    // entity changed -> need a fresh subscription
    this._unsubscribe();
    this._buildSkeleton();
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
  }

  disconnectedCallback() {
    this._unsubscribe();
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
    for (const type of ["daily", "hourly"]) {
      try {
        const unsub = await this._hass.connection.subscribeMessage(
          (event) => {
            this._forecasts[type] = event.forecast || [];
            this._update();
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

  _lang() {
    return this._hass?.locale?.language || navigator.language || "en";
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
          min-height: 210px;
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
          -webkit-font-smoothing: antialiased;
        }
        /* Animated effect layer sits behind the content (absolute => excluded
           from the flex flow), content is lifted above it. */
        .fx { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
        .card > .hero, .card > .label, .card > .row { position: relative; z-index: 1; }

        /* ---- Weather moods: backdrop tinted to the current condition ---- */
        .card.w-sunny {
          background:
            radial-gradient(120% 90% at 82% -10%, rgba(255,200,90,0.30), transparent 55%),
            linear-gradient(160deg, #1d3d57 0%, #0f2230 100%);
        }
        .card.w-clear-night, .card.w-partlycloudy-night {
          background:
            radial-gradient(120% 90% at 80% 0%, rgba(90,120,210,0.20), transparent 60%),
            linear-gradient(170deg, #11173a 0%, #090d20 100%);
        }
        .card.w-partlycloudy {
          background:
            radial-gradient(120% 90% at 82% -5%, rgba(255,210,120,0.18), transparent 55%),
            linear-gradient(160deg, #25384c 0%, #141f2a 100%);
        }
        .card.w-cloudy, .card.w-windy, .card.w-windy-variant {
          background: linear-gradient(160deg, #2b333f 0%, #191f27 100%);
        }
        .card.w-fog {
          background: linear-gradient(160deg, #2e343b 0%, #20262d 100%);
        }
        .card.w-rainy {
          background:
            radial-gradient(120% 90% at 80% 0%, rgba(70,110,160,0.18), transparent 60%),
            linear-gradient(160deg, #1c2c3c 0%, #111a24 100%);
        }
        .card.w-pouring, .card.w-snowy-rainy {
          background: linear-gradient(160deg, #172534 0%, #0d141d 100%);
        }
        .card.w-lightning, .card.w-lightning-rainy {
          background: linear-gradient(160deg, #1a1f2b 0%, #0c0f16 100%);
        }
        .card.w-snowy, .card.w-hail {
          background:
            radial-gradient(120% 90% at 50% -10%, rgba(180,210,240,0.16), transparent 60%),
            linear-gradient(160deg, #28323f 0%, #151c24 100%);
        }
        .card.w-exceptional {
          background: linear-gradient(160deg, #2c1a1d 0%, #160f11 100%);
        }

        /* ---- Animated flourishes ---- */
        .card.w-sunny .fx {
          background: radial-gradient(closest-side at 82% 4%, rgba(255,205,110,0.22), transparent 72%);
          animation: gw-sun 6s ease-in-out infinite;
        }
        .card.w-clear-night .fx, .card.w-partlycloudy-night .fx {
          background-repeat: no-repeat;
          background-image:
            radial-gradient(1.4px 1.4px at 12% 22%, #fff, transparent),
            radial-gradient(1.2px 1.2px at 28% 64%, #cfe0ff, transparent),
            radial-gradient(1.4px 1.4px at 41% 16%, #fff, transparent),
            radial-gradient(1px 1px at 55% 48%, #fff, transparent),
            radial-gradient(1.4px 1.4px at 67% 28%, #dce8ff, transparent),
            radial-gradient(1.1px 1.1px at 78% 60%, #fff, transparent),
            radial-gradient(1.3px 1.3px at 90% 34%, #fff, transparent),
            radial-gradient(1px 1px at 35% 38%, #cfe0ff, transparent),
            radial-gradient(1.2px 1.2px at 84% 14%, #fff, transparent);
          animation: gw-twinkle 5s ease-in-out infinite;
        }
        .card.w-rainy .fx, .card.w-pouring .fx, .card.w-lightning-rainy .fx, .card.w-snowy-rainy .fx {
          background-image: repeating-linear-gradient(74deg,
            rgba(170,200,235,0) 0 7px, rgba(170,200,235,0.16) 7px 8px);
          animation: gw-rain 0.55s linear infinite;
        }
        .card.w-pouring .fx {
          background-image: repeating-linear-gradient(74deg,
            rgba(180,205,235,0) 0 5px, rgba(180,205,235,0.22) 5px 6px);
          animation-duration: 0.38s;
        }
        .card.w-snowy .fx, .card.w-hail .fx {
          background-repeat: repeat;
          background-size: 130px 130px;
          background-image:
            radial-gradient(2px 2px at 24px 18px, rgba(255,255,255,0.9), transparent),
            radial-gradient(1.6px 1.6px at 92px 64px, rgba(255,255,255,0.7), transparent),
            radial-gradient(1.8px 1.8px at 56px 104px, rgba(255,255,255,0.8), transparent);
          animation: gw-snow 7s linear infinite;
        }
        .card.w-cloudy .fx, .card.w-fog .fx, .card.w-windy .fx, .card.w-windy-variant .fx {
          background: linear-gradient(100deg, transparent 0%, rgba(200,212,228,0.06) 50%, transparent 100%);
          background-size: 220% 100%;
          animation: gw-drift 13s linear infinite;
        }
        .card.w-fog .fx { background-image: linear-gradient(100deg, transparent 0%, rgba(200,212,228,0.12) 50%, transparent 100%); }
        .card.w-lightning .fx::after, .card.w-lightning-rainy .fx::after {
          content: ""; position: absolute; inset: 0; opacity: 0;
          background: radial-gradient(130% 80% at 50% -5%, rgba(220,230,255,0.55), transparent 60%);
          animation: gw-flash 7s linear infinite;
        }
        @keyframes gw-sun { 0%,100% { opacity: 0.65; } 50% { opacity: 1; } }
        @keyframes gw-twinkle { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
        @keyframes gw-rain { to { background-position: -22px 60px; } }
        @keyframes gw-snow { to { background-position: 14px 130px, -10px 130px, 6px 130px; } }
        @keyframes gw-drift { to { background-position: 220% 0; } }
        @keyframes gw-flash {
          0%, 92%, 100% { opacity: 0; }
          93% { opacity: 0.7; } 94% { opacity: 0.1; }
          95% { opacity: 0.55; } 96% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fx, .fx::after { animation: none !important; }
        }
        .hero {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 50px;
          flex: 0 0 auto;
        }
        .hero .big-icon { --mdc-icon-size: 42px; color: #cfe0f5; flex: 0 0 auto; }
        .hero .temp { font-size: 38px; font-weight: 600; line-height: 1; }
        .hero .meta { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; }
        .hero .cond {
          font-size: 12px; font-weight: 500; line-height: 1.2;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .hero .sub { display: flex; align-items: center; gap: 10px; }
        .hero .hum, .hero .pcp { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 3px; }
        .hero .hum ha-icon, .hero .pcp ha-icon { --mdc-icon-size: 14px; }
        .hero .hum { color: ${HUMIDITY_COLOR}; }
        .hero .hum ha-icon { color: ${HUMIDITY_COLOR}; }
        .hero .pcp { color: ${RAIN_COLOR}; }
        .hero .pcp.hidden { display: none; }
        .spacer { flex: 1 1 auto; }
        .label {
          font-size: 9px; letter-spacing: 0.6px; text-transform: uppercase;
          opacity: 0.6; margin: 1px 0 0;
        }
        /* Strips grow to share any extra height, so stretching the card just
           gives the rows more breathing room instead of leaving dead space. */
        .row { display: grid; gap: 1px; flex: 1 1 auto; align-content: center; }
        .row.hourly { grid-template-columns: repeat(${this._hourlyCount}, 1fr); }
        .row.daily { grid-template-columns: repeat(${this._dailyCount}, 1fr); }
        .cell { display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.15; }
        .cell ha-icon { --mdc-icon-size: 18px; color: ${DEFAULT_ICON}; margin: 1px 0; }
        .cell .t1 { font-size: 10px; opacity: 0.8; }
        .cell .t2 { font-size: 11px; font-weight: 600; }
        .cell .lo { font-size: 10px; opacity: 0.72; }
        /* Humidity: always teal. Rain chance: always blue. Same everywhere. */
        .cell .dh { font-size: 9px; font-weight: 600; line-height: 1.2; color: ${HUMIDITY_COLOR}; display: flex; align-items: center; gap: 2px; min-height: 11px; }
        .cell .dh ha-icon { --mdc-icon-size: 10px; color: ${HUMIDITY_COLOR}; margin: 0; }
        .cell .dh.hidden { visibility: hidden; }
        .cell .pop { font-size: 9px; font-weight: 600; line-height: 1.2; color: ${RAIN_COLOR}; display: flex; align-items: center; gap: 2px; min-height: 11px; }
        .cell .pop ha-icon { --mdc-icon-size: 10px; color: ${RAIN_COLOR}; margin: 0; }
        .cell .pop.hidden { visibility: hidden; }
        .unit { font-size: 0.55em; opacity: 0.8; vertical-align: top; }
      </style>
      <div class="card">
        <div class="fx"></div>
        <div class="hero">
          <ha-icon class="big-icon"></ha-icon>
          <div class="temp">–</div>
          <div class="meta">
            <div class="cond"></div>
            <div class="sub">
              <span class="hum"><ha-icon icon="mdi:water-percent"></ha-icon><span class="humval">–</span></span>
              <span class="pcp hidden"><ha-icon icon="mdi:weather-pouring"></ha-icon><span class="pcpval"></span></span>
            </div>
          </div>
        </div>
        <div class="label">Next ${this._hourlyCount} hours</div>
        <div class="row hourly"></div>
        <div class="label">${this._dailyCount}-day</div>
        <div class="row daily"></div>
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
    // Build via textContent (not innerHTML) so the unit string, which comes
    // from entity attributes, can never inject markup.
    const tempEl = root.querySelector(".temp");
    tempEl.textContent = `${this._round(st.attributes.temperature)}`;
    const unitSpan = document.createElement("span");
    unitSpan.className = "unit";
    unitSpan.textContent = unit;
    tempEl.appendChild(unitSpan);
    root.querySelector(".cond").textContent = labelFor(heroCond);

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

    // ---- Hourly ----
    const hourly = (this._forecasts.hourly || []).slice(0, this._hourlyCount);
    root.querySelector(".row.hourly").innerHTML = hourly
      .map((f) => {
        const cond = this._isNight(f.datetime) ? nightCondition(f.condition) : f.condition;
        const pop = popText(f);
        const rh = humText(f);
        return `
        <div class="cell">
          <span class="t1">${this._fmtHour(f.datetime)}</span>
          <ha-icon icon="${iconFor(cond)}" style="color:${iconColorFor(cond)}"></ha-icon>
          <span class="t2">${this._round(f.temperature)}°</span>
          <span class="pop${pop ? "" : " hidden"}"><ha-icon icon="mdi:weather-pouring"></ha-icon>${pop}</span>
          <span class="dh${rh ? "" : " hidden"}"><ha-icon icon="mdi:water-percent"></ha-icon>${rh}</span>
        </div>`;
      })
      .join("");

    // ---- Daily ----
    const daily = (this._forecasts.daily || []).slice(0, this._dailyCount);
    root.querySelector(".row.daily").innerHTML = daily
      .map((f, i) => {
        const pop = popText(f);
        const rh = humText(f);
        return `
        <div class="cell">
          <span class="t1">${this._fmtDay(f.datetime, i)}</span>
          <ha-icon icon="${iconFor(f.condition)}" style="color:${iconColorFor(f.condition)}"></ha-icon>
          <span class="t2">${this._round(f.temperature)}°</span>
          <span class="lo">${this._round(f.templow)}°</span>
          <span class="pop${pop ? "" : " hidden"}"><ha-icon icon="mdi:weather-pouring"></ha-icon>${pop}</span>
          <span class="dh${rh ? "" : " hidden"}"><ha-icon icon="mdi:water-percent"></ha-icon>${rh}</span>
        </div>`;
      })
      .join("");
  }
}

customElements.define("glance-weather-card", GlanceWeatherCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "glance-weather-card",
  name: "Glance Weather Card",
  description: "Fixed-size at-a-glance weather: current + 12h hourly + 7-day daily.",
});

console.info(
  "%c glance-weather-card %c loaded ",
  "background:#2d6cdf;color:#fff;border-radius:3px 0 0 3px;padding:2px 4px",
  "background:#1d2733;color:#cfe0f5;border-radius:0 3px 3px 0;padding:2px 4px"
);
