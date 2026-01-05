/**
 * Nightlight Custom Calendar Card
 * Senior Dev Lead: Rick P. | Melbourne Branch
 * Features: Month, Week, Day, Agenda, Multi-Calendar Toggles
 * Target: FHD HP Touch Panel (Kiosk Mode)
 */

import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

class NightlightCalendarCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _activeCalendars: { type: Array },
      _view: { type: String },
      _referenceDate: { type: Object },
      _events: { type: Array },
      _loading: { type: Boolean }
    };
  }

  constructor() {
    super();
    this._activeCalendars = [];
    this._view = 'month';
    this._referenceDate = new Date();
    this._events = [];
    this._loading = false;
  }

  // --- Core Lifecycle ---

  setConfig(config) {
    if (!config.entities) throw new Error("Please define calendar entities.");
    this.config = {
      title: 'Family Schedule',
      first_day: 'monday',
      ...config
    };
    this._activeCalendars = this.config.entities.map(e => e.entity || e);
  }

  updated(changedProps) {
    if (changedProps.has('_referenceDate') || changedProps.has('_view')) {
      this._fetchEvents();
    }
  }

  // --- Data Fetching Engine ---

  async _fetchEvents() {
    if (!this.hass) return;
    this._loading = true;

    // Calculate start/end range based on current view
    let start = new Date(this._referenceDate);
    let end = new Date(this._referenceDate);

    if (this._view === 'month') {
      start = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth(), 1);
      end = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth() + 1, 0, 23, 59, 59);
    } else if (this._view === 'week') {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0,0,0,0);
      end = new Date(start);
      end.setDate(start.getDate() + 7);
    } else {
      start.setHours(0,0,0,0);
      end.setHours(23,59,59,999);
    }

    try {
      const fetchPromises = this.config.entities.map(ent => {
        const id = ent.entity || ent;
        return this.hass.callApi('GET', `calendars/${id}?start=${start.toISOString()}&end=${end.toISOString()}`)
          .then(evs => evs.map(e => ({
            ...e,
            originEntity: id,
            color: ent.color || '#3498db'
          })))
          .catch(() => []);
      });

      const results = await Promise.all(fetchPromises);
      this._events = results.flat();
    } finally {
      this._loading = false;
    }
  }

  // --- Event Handling & Navigation ---

  _navigate(dir) {
    const d = new Date(this._referenceDate);
    if (this._view === 'month') d.setMonth(d.getMonth() + dir);
    else if (this._view === 'week') d.setDate(d.getDate() + (dir * 7));
    else d.setDate(d.getDate() + dir);
    this._referenceDate = d;
  }

  _toggleCalendar(id) {
    if (this._activeCalendars.includes(id)) {
      this._activeCalendars = this._activeCalendars.filter(item => item !== id);
    } else {
      this._activeCalendars = [...this._activeCalendars, id];
    }
  }

  _getTimeStyles(event) {
    if (!event.start.dateTime) return `display:none;`;
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    const top = ((start.getHours() * 60 + start.getMinutes()) / 14.4);
    const height = Math.max(((end - start) / 60000) / 14.4, 2); // Min 2% height
    return `top: ${top}%; height: ${height}%;`;
  }

  // --- Rendering ---

  render() {
    if (!this.hass || !this.config) return html``;

    return html`
      <ha-card>
        <div class="header">
          <div class="nav-group">
            <h1 class="title">${this._referenceDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h1>
            <div class="nav-controls">
              <button class="icon-btn" @click="${() => this._navigate(-1)}">←</button>
              <button class="icon-btn" @click="${() => this._navigate(1)}">→</button>
            </div>
          </div>
          <div class="view-toggles">
            ${['month', 'week', 'day', 'agenda'].map(v => html`
              <button class="${this._view === v ? 'active' : ''}" @click="${() => this._view = v}">${v}</button>
            `)}
          </div>
        </div>

        <div class="content">
          ${this._renderCurrentView()}
        </div>

        <div class="filters">
          ${this.config.entities.map(ent => {
            const id = ent.entity || ent;
            const active = this._activeCalendars.includes(id);
            return html`
              <button class="filter-chip ${active ? 'active' : ''}" 
                      style="--chip-color: ${ent.color}" 
                      @click="${() => this._toggleCalendar(id)}">
                ${this.hass.states[id]?.attributes.friendly_name || id}
              </button>
            `;
          })}
        </div>
      </ha-card>
    `;
  }

  _renderCurrentView() {
    if (this._view === 'month') return this._renderMonth();
    if (this._view === 'agenda') return this._renderAgenda();
    return this._renderTimeGrid(this._view === 'week' ? 7 : 1);
  }

  _renderMonth() {
    const start = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth(), 1);
    const end = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth() + 1, 0);
    const firstDay = (start.getDay() + (this.config.first_day === 'monday' ? 6 : 0)) % 7;
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push({ num: null, current: false });
    for (let i = 1; i <= end.getDate(); i++) days.push({ num: i, current: true });

    return html`
      <div class="month-grid">
        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(l => html`<div class="label">${l}</div>`)}
        ${days.map(d => {
          const evs = this._events.filter(e => {
            const date = new Date(e.start.dateTime || e.start.date);
            return d.current && date.getDate() === d.num && this._activeCalendars.includes(e.originEntity);
          });
          return html`
            <div class="day-cell ${d.current ? '' : 'empty'}">
              <span class="day-num">${d.num}</span>
              <div class="day-events">
                ${evs.slice(0, 3).map(e => html`<div class="ev-pill" style="background:${e.color}">${e.summary}</div>`)}
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  _renderTimeGrid(daysCount) {
    const hours = Array.from({length: 24}, (_, i) => i);
    const start = new Date(this._referenceDate);
    if (daysCount === 7) {
      const day = start.getDay();
      start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
    }

    return html`
      <div class="time-grid" style="--cols: ${daysCount}">
        <div class="time-sidebar">
          ${hours.map(h => html`<div class="time-mark">${h}:00</div>`)}
        </div>
        <div class="grid-body">
          ${Array.from({length: daysCount}).map((_, i) => {
            const dayDate = new Date(start);
            dayDate.setDate(start.getDate() + i);
            const dayEvents = this._events.filter(e => {
              const d = new Date(e.start.dateTime || e.start.date);
              return d.getDate() === dayDate.getDate() && this._activeCalendars.includes(e.originEntity);
            });
            return html`
              <div class="day-col">
                <div class="col-head">${dayDate.toLocaleDateString('default', {weekday: 'short', day: 'numeric'})}</div>
                <div class="hour-container">
                  ${hours.map(() => html`<div class="hour-box"></div>`)}
                  ${dayEvents.map(e => html`
                    <div class="time-ev" style="${this._getTimeStyles(e)} background: ${e.color}">
                      ${e.summary}
                    </div>
                  `)}
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  _renderAgenda() {
    const evs = this._events.filter(e => this._activeCalendars.includes(e.originEntity));
    return html`
      <div class="agenda">
        ${evs.map(e => html`
          <div class="agenda-item" style="border-left: 8px solid ${e.color}">
            <strong>${new Date(e.start.dateTime || e.start.date).toLocaleDateString()}</strong>: ${e.summary}
          </div>
        `)}
      </div>
    `;
  }

  static get styles() {
    return css`
      :host { --accent: #0071e3; --bg: #ffffff; --text: #1d1d1f; }
      ha-card { padding: 30px; border-radius: 24px; color: var(--text); background: var(--bg); font-family: sans-serif; }
      .header { display: flex; justify-content: space-between; margin-bottom: 30px; align-items: flex-end; }
      .title { font-size: 2.5rem; margin: 0; font-weight: 800; letter-spacing: -1px; }
      .icon-btn { border: none; background: #f5f5f7; width: 44px; height: 44px; border-radius: 50%; cursor: pointer; font-size: 1.2rem; }
      .view-toggles { display: flex; background: #f5f5f7; padding: 4px; border-radius: 12px; }
      .view-toggles button { border: none; background: transparent; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; text-transform: capitalize; }
      .view-toggles button.active { background: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
      
      .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
      .label { text-align: center; font-weight: 700; color: #86868b; font-size: 0.8rem; text-transform: uppercase; }
      .day-cell { border: 1px solid #e5e5e7; min-height: 120px; border-radius: 12px; padding: 10px; }
      .day-num { font-weight: 800; font-size: 1.1rem; }
      .ev-pill { font-size: 0.7rem; color: #fff; padding: 2px 6px; border-radius: 4px; margin-top: 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 600; }

      .time-grid { display: flex; height: 600px; overflow-y: auto; border: 1px solid #e5e5e7; border-radius: 16px; }
      .time-sidebar { width: 50px; flex-shrink: 0; padding-top: 40px; border-right: 1px solid #e5e5e7; }
      .time-mark { height: 60px; font-size: 0.7rem; color: #86868b; text-align: center; }
      .grid-body { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; }
      .day-col { border-right: 1px solid #f5f5f7; position: relative; }
      .col-head { height: 40px; line-height: 40px; text-align: center; font-weight: 800; background: #fafafa; font-size: 0.8rem; }
      .hour-container { position: relative; height: 1440px; }
      .hour-box { height: 60px; border-bottom: 1px solid #f5f5f7; }
      .time-ev { position: absolute; left: 2px; right: 2px; border-radius: 4px; color: #fff; font-size: 0.7rem; padding: 4px; font-weight: 700; overflow: hidden; }

      .filters { display: flex; gap: 10px; margin-top: 30px; flex-wrap: wrap; }
      .filter-chip { padding: 8px 16px; border-radius: 20px; border: 2px solid #e5e5e7; background: transparent; cursor: pointer; font-weight: 700; }
      .filter-chip.active { border-color: var(--chip-color); background: #f5f5f7; }
    `;
  }
}
customElements.define("nightlight-calendar-card", NightlightCalendarCard);