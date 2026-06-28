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
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
};

const iconFor = (c) => CONDITION_ICONS[c] || "mdi:weather-cloudy";

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
const PRECIP_BLUE = "#54b4ff";
const iconColorFor = (c) => CONDITION_COLORS[c] || DEFAULT_ICON;

// Probability of precipitation. Returns null when absent/zero, otherwise the
// "NN%" text plus a `low` flag (< 20%) so unlikely rain can be greyed out
// while meaningful chances stay a bold blue.
const POP_LOW_THRESHOLD = 20;
const popInfo = (f) => {
  const p = f?.precipitation_probability;
  if (p === null || p === undefined || isNaN(p) || p <= 0) return null;
  return { text: `${Math.round(p)}%`, low: p < POP_LOW_THRESHOLD };
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

  _buildSkeleton() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        .card {
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
          background:
            radial-gradient(120% 80% at 80% 0%, rgba(90,140,210,0.18), transparent 60%),
            linear-gradient(160deg, #1d2733 0%, #141a22 100%);
          font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif);
          -webkit-font-smoothing: antialiased;
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
        .hero .hum, .hero .pcp { font-size: 12px; display: flex; align-items: center; gap: 3px; }
        .hero .hum { opacity: 0.85; }
        .hero .hum ha-icon, .hero .pcp ha-icon { --mdc-icon-size: 14px; }
        .hero .pcp { color: ${PRECIP_BLUE}; font-weight: 600; }
        .hero .pcp.low { color: #8a95a3; font-weight: 500; opacity: 0.85; }
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
        .cell .dh { font-size: 9px; color: #7fd0ff; opacity: 0.9; display: flex; align-items: center; gap: 2px; margin-top: 1px; }
        .cell .dh ha-icon { --mdc-icon-size: 10px; color: #7fd0ff; margin: 0; }
        .cell .dh.hidden { display: none; }
        /* Precip chance: bold blue when likely; very grey when < 20%. */
        .cell .pop { font-size: 9px; font-weight: 600; line-height: 1.2; color: ${PRECIP_BLUE}; min-height: 11px; }
        .cell .pop.low { color: #5d6b7a; font-weight: 500; opacity: 0.65; }
        .cell .pop.rain { display: flex; align-items: center; gap: 2px; margin-top: 1px; }
        .cell .pop.rain ha-icon { --mdc-icon-size: 10px; color: inherit; margin: 0; }
        .cell .pop.hidden { display: none; }
        .unit { font-size: 0.55em; opacity: 0.8; vertical-align: top; }
      </style>
      <div class="card">
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
    const heroIcon = root.querySelector(".big-icon");
    heroIcon.setAttribute("icon", iconFor(st.state));
    heroIcon.style.color = iconColorFor(st.state);
    root.querySelector(".temp").innerHTML =
      `${this._round(st.attributes.temperature)}<span class="unit">${unit}</span>`;
    root.querySelector(".cond").textContent = labelFor(st.state);

    let humidity = st.attributes.humidity;
    if (this.config.humidity_entity) {
      const h = this._hass.states[this.config.humidity_entity];
      if (h) humidity = h.state;
    }
    root.querySelector(".humval").textContent =
      humidity === undefined || humidity === null || humidity === "" ? "–" : `${Math.round(humidity)}%`;

    // Current precip chance: prefer the nearest hourly forecast, fall back to today's daily.
    const pcpSource = (this._forecasts.hourly || [])[0] || (this._forecasts.daily || [])[0];
    const pcp = popInfo(pcpSource);
    const pcpEl = root.querySelector(".pcp");
    if (pcp) {
      pcpEl.classList.remove("hidden");
      pcpEl.classList.toggle("low", pcp.low);
      root.querySelector(".pcpval").textContent = pcp.text;
    } else {
      pcpEl.classList.add("hidden");
    }

    // ---- Hourly ----
    const hourly = (this._forecasts.hourly || []).slice(0, this._hourlyCount);
    root.querySelector(".row.hourly").innerHTML = hourly
      .map((f) => {
        const pi = popInfo(f);
        return `
        <div class="cell">
          <span class="t1">${this._fmtHour(f.datetime)}</span>
          <ha-icon icon="${iconFor(f.condition)}" style="color:${iconColorFor(f.condition)}"></ha-icon>
          <span class="t2">${this._round(f.temperature)}°</span>
          <span class="pop${pi && pi.low ? " low" : ""}">${pi ? pi.text : ""}</span>
        </div>`;
      })
      .join("");

    // ---- Daily ----
    const daily = (this._forecasts.daily || []).slice(0, this._dailyCount);
    root.querySelector(".row.daily").innerHTML = daily
      .map(
        (f, i) => {
          const pi = popInfo(f);
          const rh = humText(f);
          return `
        <div class="cell">
          <span class="t1">${this._fmtDay(f.datetime, i)}</span>
          <ha-icon icon="${iconFor(f.condition)}" style="color:${iconColorFor(f.condition)}"></ha-icon>
          <span class="t2">${this._round(f.temperature)}°</span>
          <span class="lo">${this._round(f.templow)}°</span>
          <span class="pop rain${pi ? (pi.low ? " low" : "") : " hidden"}"><ha-icon icon="mdi:weather-pouring"></ha-icon>${pi ? pi.text : ""}</span>
          <span class="dh${rh ? "" : " hidden"}"><ha-icon icon="mdi:water-percent"></ha-icon>${rh}</span>
        </div>`;
        }
      )
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
