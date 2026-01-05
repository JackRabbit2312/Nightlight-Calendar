/**
 * Nightlight Dashboard (v1.0.1)
 * Senior Dev Lead: Rick P. | Master Build
 * Fixed: Naming collisions, duplicate logic, and split-read errors.
 */

import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

class NightlightDashboard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _activeView: { type: String },
      _calendarMode: { type: String },
      _activeCalendars: { type: Array },
      _events: { type: Array },
      _chores: { type: Array },
      _loading: { type: Boolean },
      _referenceDate: { type: Object },
      _showAddModal: { type: Boolean },
      _selectedEvent: { type: Object }
    };
  }

  static getConfigElement() { return document.createElement("nightlight-card-editor"); }
  static getStubConfig() { return { title: "Nightlight Hub", theme: "light", entities: [] }; }

  constructor() {
    super();
    this._activeView = 'calendar';
    this._calendarMode = 'month';
    this._activeCalendars = [];
    this._referenceDate = new Date();
    this._events = [];
    this._chores = [];
    this._loading = false;
    this._showAddModal = false;
  }

  setConfig(config) {
    if (!config.entities) throw new Error("Define entities in config.");
    this.config = { title: "Family Hub", theme: "light", ...config };
    if (this._activeCalendars.length === 0) {
      this._activeCalendars = config.entities.map(e => e.entity || e);
    }
  }

  // --- Core Lifecycle ---
  updated(changedProps) {
    if (changedProps.has('hass') || changedProps.has('_activeView') || changedProps.has('_calendarMode') || changedProps.has('_referenceDate')) {
      this._refreshData();
    }
  }

  async _refreshData() {
    if (!this.hass || this._loading) return;
    this._loading = true;
    try {
      if (this._activeView === 'calendar') await this._fetchEvents();
      else if (this._activeView === 'chores') await this._fetchChores();
    } finally {
      this._loading = false;
    }
  }

  async _fetchEvents() {
    let start = new Date(this._referenceDate);
    let end = new Date(this._referenceDate);

    if (this._calendarMode === 'month') {
      start = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth(), 1);
      end = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth() + 1, 0, 23, 59, 59);
    } else if (this._calendarMode === 'week') {
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

    const promises = this.config.entities.filter(e => e.entity.startsWith('calendar')).map(ent => {
      return this.hass.callApi('GET', `calendars/${ent.entity}?start=${start.toISOString()}&end=${end.toISOString()}`)
        .then(evs => evs.map(e => ({ ...e, color: ent.color, origin: ent.entity })));
    });
    const results = await Promise.all(promises);
    this._events = results.flat();
  }

  async _fetchChores() {
    const todoEntities = this.config.entities.filter(e => e.entity.startsWith('todo'));
    const chores = [];
    for (const ent of todoEntities) {
      try {
        const state = this.hass.states[ent.entity];
        if (state) {
          const items = await this.hass.callService('todo', 'get_items', { entity_id: ent.entity }, null, true);
          const listItems = items[ent.entity]?.items || [];
          chores.push(...listItems.map(item => ({ ...item, list_id: ent.entity, color: ent.color })));
        }
      } catch (e) { console.error("Chore fetch failed", e); }
    }
    this._chores = chores;
  }

  // --- Rendering Engines ---
  render() {
    if (!this.hass || !this.config) return html``;

    return html`
      <div class="nightlight-hub">
        <nav class="side-rail">
          <div class="logo-area"><ha-icon icon="mdi:home-heart"></ha-icon></div>
          <div class="nav-items">
            <button class="nav-btn ${this._activeView === 'calendar' ? 'active' : ''}" @click="${() => this._activeView = 'calendar'}">
              <ha-icon icon="mdi:calendar-month"></ha-icon><span>Calendar</span>
            </button>
            <button class="nav-btn ${this._activeView === 'chores' ? 'active' : ''}" @click="${() => this._activeView = 'chores'}">
              <ha-icon icon="mdi:checkbox-marked-circle-outline"></ha-icon><span>Chores</span>
            </button>
          </div>
        </nav>

        <main class="main-stage">
          <header class="top-bar">
            <div class="left-info">
              <h1>${this._activeView === 'calendar' ? this.config.title : 'Chore Tracker'}</h1>
              <div class="meta-row">
                <span class="clock">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                <div class="meal-tag" @click="${() => { this._activeView = 'calendar'; this._calendarMode = 'day'; this._referenceDate = new Date(); }}">
                  <ha-icon icon="mdi:silverware-fork-knife"></ha-icon>
                  <span>Dinner: ${this.hass.states[this.config.meal_entity]?.state || 'Plan a meal'}</span>
                </div>
              </div>
            </div>

            <div class="right-actions">
              <div class="view-switcher">
                <button class="${this._calendarMode === 'month' ? 'active' : ''}" @click="${() => this._calendarMode = 'month'}">Month</button>
                <button class="${this._calendarMode === 'week' ? 'active' : ''}" @click="${() => this._calendarMode = 'week'}">Week</button>
                <button class="${this._calendarMode === 'day' ? 'active' : ''}" @click="${() => this._calendarMode = 'day'}">Day</button>
              </div>
              <button class="today-btn" @click="${() => this._referenceDate = new Date()}">Today</button>
              <div class="persona-filters">
                ${this.config.entities.map(ent => html`
                    <div class="persona ${this._activeCalendars.includes(ent.entity) ? 'active' : 'inactive'}" 
                         style="background: ${ent.color}" 
                         @click="${() => this._togglePersona(ent.entity)}">
                      ${ent.picture ? html`<img src="${ent.picture}">` : (ent.entity.includes('.') ? ent.entity.split('.')[1][0].toUpperCase() : '👤')}
                    </div>
                `)}
              </div>
            </div>
          </header>

          <section class="content-area">
            ${this._activeView === 'calendar' ? this._renderCalendarView() : this._renderChores()}
          </section>
        </main>
        <button class="fab" @click="${() => this._showAddModal = true}">+</button>
      </div>
    `;
  }

  _renderCalendarView() {
    if (this._calendarMode === 'month') return this._renderMonthGrid();
    if (this._calendarMode === 'day') return this._renderDayView();
    return this._renderTimeGrid(7);
  }

  _renderMonthGrid() {
    const start = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth(), 1);
    const end = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth() + 1, 0);
    const firstDay = (start.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push({ n: null, cur: false });
    for (let i = 1; i <= end.getDate(); i++) days.push({ n: i, cur: true });

    return html`
      <div class="calendar-container">
        <div class="week-labels">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(l => html`<div>${l}</div>`)}</div>
        <div class="month-grid">
          ${days.map(d => {
            const evs = this._events.filter(e => d.cur && new Date(e.start.dateTime || e.start.date).getDate() === d.n && this._activeCalendars.includes(e.origin));
            return html`
              <div class="day-cell ${!d.cur ? 'empty' : ''} ${this._isToday(d.n) ? 'today' : ''}">
                <span class="day-number">${d.n}</span>
                <div class="event-stack">${evs.slice(0, 4).map(e => html`<div class="ev-pill" style="background:${e.color}22; border-left: 4px solid ${e.color}; color:${e.color}">${e.summary}</div>`)}</div>
              </div>`;
          })}
        </div>
      </div>`;
  }

  _renderTimeGrid(daysCount) {
    const start = new Date(this._referenceDate);
    if (daysCount === 7) {
      const day = start.getDay();
      start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
    }
    const endRange = new Date(start);
    endRange.setDate(start.getDate() + daysCount);
    const displayEvents = this._fragmentEvents(this._events, start, endRange);

    return html`
      <div class="time-grid-wrapper">
        <div class="time-sidebar"><div class="all-day-label">All Day</div>${Array.from({length: 24}, (_, i) => html`<div class="time-mark">${i}:00</div>`)}</div>
        <div class="grid-scroll-area" style="--cols: ${daysCount}">
          ${Array.from({length: daysCount}).map((_, i) => {
            const d = new Date(start); d.setDate(start.getDate() + i);
            const evs = displayEvents.filter(e => this._activeCalendars.includes(e.origin) && new Date(e.start.dateTime || e.start.date).toDateString() === d.toDateString());
            return html`
              <div class="day-column">
                <div class="col-head">${d.toLocaleDateString('default', {weekday: 'short', day: 'numeric'})}</div>
                <div class="hour-container">
                  ${Array.from({length: 24}).map(() => html`<div class="hour-box"></div>`)}
                  ${evs.map(e => html`<div class="time-ev" style="${this._getTimeStyles(e)} background:${e.color}">${e.summary}</div>`)}
                </div>
              </div>`;
          })}
        </div>
      </div>`;
  }

  _renderDayView() {
    const d = new Date(this._referenceDate);
    const evs = this._fragmentEvents(this._events, d, d).filter(e => this._activeCalendars.includes(e.origin));
    return html`
      <div class="day-view-container">
        <div class="day-timeline-wrapper">
          <div class="time-axis">${Array.from({length: 24}, (_, i) => html`<div class="hour-mark">${i}:00</div>`)}</div>
          <div class="event-stage">
            ${Array.from({length: 24}).map(() => html`<div class="slot-row"></div>`)}
            ${evs.map(e => html`<div class="detailed-ev" style="${this._getTimeStyles(e)} border-left:8px solid ${e.color}; background:${e.color}15"><div class="ev-summary-large">${e.summary}</div></div>`)}
          </div>
        </div>
      </div>`;
  }

  _renderChores() {
    const active = this._chores.filter(c => c.status !== 'completed');
    return html`<div class="chores-grid"><div class="chore-col"><h2>To Do</h2>${active.map(c => html`<div class="chore-row" style="border-left:4px solid ${c.color}">${c.summary}</div>`)}</div></div>`;
  }

  // --- Utility Helpers ---
  _togglePersona(id) {
    this._activeCalendars = this._activeCalendars.includes(id) ? this._activeCalendars.filter(i => i !== id) : [...this._activeCalendars, id];
  }
  _isToday(n) { const today = new Date(); return n === today.getDate() && this._referenceDate.getMonth() === today.getMonth(); }
  _getTimeStyles(e) {
    if (!e.start.dateTime) return `display:none`;
    const s = new Date(e.start.dateTime), end = new Date(e.end.dateTime);
    const top = (s.getHours() * 60 + s.getMinutes()) / 14.4, height = Math.max(((end - s) / 60000) / 14.4, 2);
    return `top:${top}%;height:${height}%`;
  }
  _sanitize(t) { const div = document.createElement('div'); div.textContent = t; return div.innerHTML; }
  _fragmentEvents(evs, sR, eR) {
    const res = [];
    evs.forEach(e => {
      const s = new Date(e.start.dateTime || e.start.date), end = new Date(e.end.dateTime || e.end.date);
      if (s.toDateString() === end.toDateString()) res.push(e);
      else {
        let cur = new Date(s);
        while (cur <= end && cur <= eR) {
          if (cur >= sR) res.push({ ...e, isFragment: true, displayDate: cur.toDateString(), isAllDay: true });
          cur.setDate(cur.getDate() + 1);
        }
      }
    });
    return res;
  }

  static get styles() {
    return css`
      :host { --accent: #7b61ff; --bg: #fdfdfd; --card: #fff; --text: #1a1a1b; --border: #eee; }
      .nightlight-hub { display: grid; grid-template-columns: 120px 1fr; height: 100vh; background: var(--bg); font-family: sans-serif; overflow: hidden; }
      .side-rail { background: var(--card); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 40px 0; }
      .logo-area { color: var(--accent); margin-bottom: 50px; --mdc-icon-size: 40px; }
      .nav-btn { background: none; border: none; padding: 20px 0; color: #bbb; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; font-weight: bold; width: 100%; }
      .nav-btn.active { color: var(--accent); background: rgba(123, 97, 255, 0.05); border-right: 4px solid var(--accent); }
      .main-stage { padding: 40px; overflow-y: auto; }
      .top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
      .top-bar h1 { font-size: 2.8rem; font-weight: 800; margin: 0; }
      .meta-row { display: flex; align-items: center; gap: 20px; margin-top: 8px; }
      .clock { color: #888; font-weight: 700; font-size: 1.2rem; }
      .meal-tag { background: #fff2e6; color: #ff9500; padding: 6px 16px; border-radius: 10px; font-weight: 800; display: flex; align-items: center; gap: 8px; cursor: pointer; }
      .right-actions { display: flex; align-items: center; gap: 20px; }
      .view-switcher { background: #f0f2f5; padding: 4px; border-radius: 12px; display: flex; }
      .view-switcher button { border: none; background: transparent; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 700; color: #666; }
      .view-switcher button.active { background: #fff; color: var(--text); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      .persona-filters { display: flex; gap: 8px; }
      .persona { width: 40px; height: 40px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; cursor: pointer; overflow: hidden; }
      .persona.inactive { opacity: 0.3; }
      .persona img { width: 100%; height: 100%; object-fit: cover; }
      .today-btn { background: var(--accent); color: #fff; border: none; padding: 10px 20px; border-radius: 12px; font-weight: 800; cursor: pointer; }
      .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; }
      .week-labels { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; color: #bbb; font-weight: 800; font-size: 0.8rem; padding-bottom: 15px; }
      .day-cell { background: var(--card); border: 2px solid var(--border); border-radius: 20px; min-height: 150px; padding: 15px; }
      .day-cell.today { border-color: var(--accent); }
      .day-cell.empty { opacity: 0.3; border-style: dashed; }
      .day-number { font-weight: 900; font-size: 1.2rem; }
      .ev-pill { margin-top: 6px; padding: 6px 10px; border-radius: 8px; font-size: 0.8rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .time-grid-wrapper { display: flex; height: 75vh; border: 1px solid var(--border); border-radius: 24px; overflow: hidden; }
      .time-sidebar { width: 60px; border-right: 1px solid var(--border); padding-top: 40px; }
      .time-mark { height: 60px; text-align: center; color: #bbb; font-size: 0.7rem; }
      .grid-scroll-area { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; overflow-y: auto; }
      .day-column { border-right: 1px solid var(--border); position: relative; }
      .col-head { height: 40px; line-height: 40px; text-align: center; font-weight: 800; background: #fcfcfc; border-bottom: 1px solid var(--border); }
      .hour-container { position: relative; height: 1440px; }
      .hour-box { height: 60px; border-bottom: 1px solid #f9f9f9; }
      .time-ev { position: absolute; left: 2px; right: 2px; padding: 4px; border-radius: 4px; color: #fff; font-size: 0.7rem; font-weight: 700; overflow: hidden; }
      .day-view-container { height: 75vh; display: flex; flex-direction: column; }
      .day-timeline-wrapper { flex-grow: 1; overflow-y: auto; display: flex; position: relative; }
      .time-axis { width: 80px; border-right: 1px solid var(--border); padding-top: 40px; }
      .hour-mark { height: 80px; text-align: center; color: #bbb; font-weight: 800; }
      .event-stage { flex-grow: 1; position: relative; height: 1920px; }
      .slot-row { height: 80px; border-bottom: 1px solid #f9f9f9; }
      .now-indicator { position: absolute; left: 0; right: 0; height: 3px; background: #ff3b30; z-index: 10; }
      .detailed-ev { position: absolute; left: 10px; right: 10px; padding: 15px; border-radius: 12px; font-weight: 800; }
      .fab { position: fixed; bottom: 40px; right: 40px; width: 70px; height: 70px; border-radius: 50%; background: var(--accent); color: #fff; border: none; font-size: 2.5rem; cursor: pointer; box-shadow: 0 10px 20px rgba(123, 97, 255, 0.3); }
    `;
  }
}

// --- VISUAL EDITOR ENGINE ---
class NightlightCardEditor extends LitElement {
  static get properties() { return { hass: {}, _config: {} }; }
  setConfig(config) { this._config = config; }
  _valueChanged(ev) {
    const target = ev.target;
    const newConfig = { ...this._config, [target.configValue]: target.value };
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: newConfig }, bubbles: true, composed: true }));
  }
  render() {
    return html`<div class="schema-editor">
      <ha-textfield label="Dashboard Title" .value="${this._config.title}" .configValue="${'title'}" @input="${this._valueChanged}"></ha-textfield>
      <ha-select label="Theme" .value="${this._config.theme}" .configValue="${'theme'}" @selected="${this._valueChanged}">
          <mwc-list-item value="light">Skylight Light</mwc-list-item>
          <mwc-list-item value="dark">Nightlight Dark</mwc-list-item>
      </ha-select>
    </div>`;
  }
}

customElements.define("nightlight-calendar-card", NightlightDashboard);
customElements.define("nightlight-card-editor", NightlightCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "nightlight-calendar-card",
  name: "Nightlight Ultimate Hub",
  description: "Advanced family dashboard with personas and multi-view support."
});