/**
 * Nightlight Dashboard (v1.0.5)
 * Senior Dev Lead: Rick P. | Master Component
 * Features: Dark Mode, Month/Week/Day/Agenda Views, Event Details, Persona Filtering
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
      _calendarMode: { type: String }, // 'month', 'week', 'day', 'agenda'
      _activeCalendars: { type: Array },
      _events: { type: Array },
      _loading: { type: Boolean },
      _referenceDate: { type: Object },
      _selectedEvent: { type: Object }
    };
  }

  static getConfigElement() { return document.createElement("nightlight-card-editor"); }
  static getStubConfig() { return { title: "Family Hub", theme: "light", entities: [] }; }

  constructor() {
    super();
    this._calendarMode = 'month';
    this._referenceDate = new Date();
    this._activeCalendars = [];
    this._events = [];
    this._loading = false;
    this._selectedEvent = null;
  }

  setConfig(config) {
    if (!config.entities) throw new Error("Define entities in YAML config.");
    this.config = { title: "Family Hub", theme: "light", ...config };
    if (this._activeCalendars.length === 0) {
      this._activeCalendars = this.config.entities.map(e => e.entity);
    }
  }

  updated(changedProps) {
    if (changedProps.has('hass') || changedProps.has('_calendarMode') || changedProps.has('_referenceDate')) {
      this._refreshData();
    }
  }

  async _refreshData() {
    if (!this.hass || this._loading) return;
    this._loading = true;
    try {
      await this._fetchEvents();
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
    } else if (this._calendarMode === 'week' || this._calendarMode === 'agenda') {
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

    // FIX: ISO String format for HA API (removes milliseconds)
    const startStr = start.toISOString().split('.')[0] + "Z";
    const endStr = end.toISOString().split('.')[0] + "Z";

    const promises = this.config.entities.filter(e => e.entity.startsWith('calendar')).map(ent => {
      return this.hass.callApi('GET', `calendars/${ent.entity}?start=${startStr}&end=${endStr}`)
        .then(evs => evs.map(e => ({ 
          ...e, 
          color: ent.color || '#7b61ff', 
          origin: ent.entity,
          friendly_name: this.hass.states[ent.entity]?.attributes.friendly_name || ent.entity
        })))
        .catch(() => []);
    });
    const results = await Promise.all(promises);
    this._events = results.flat();
  }

  // --- UI Interactions ---

  _navigate(dir) {
    const d = new Date(this._referenceDate);
    if (this._calendarMode === 'month') d.setMonth(d.getMonth() + dir);
    else if (this._calendarMode === 'week' || this._calendarMode === 'agenda') d.setDate(d.getDate() + (dir * 7));
    else d.setDate(d.getDate() + dir);
    this._referenceDate = d;
  }

  _togglePersona(id) {
    this._activeCalendars = this._activeCalendars.includes(id) ? 
      this._activeCalendars.filter(i => i !== id) : [...this._activeCalendars, id];
  }

  // --- Rendering Engines ---

  render() {
    if (!this.hass) return html``;

    return html`
      <div class="nightlight-hub ${this.config.theme}">
        <nav class="side-rail">
          <div class="logo-area"><ha-icon icon="mdi:home-heart"></ha-icon></div>
          <div class="nav-items">
            <button class="nav-btn active"><ha-icon icon="mdi:calendar-month"></ha-icon><span>Calendar</span></button>
            <button class="nav-btn"><ha-icon icon="mdi:checkbox-marked-circle-outline"></ha-icon><span>Chores</span></button>
          </div>
        </nav>

        <main class="main-stage">
          <header class="top-bar">
            <div class="left-info">
              <h1>${this.config.title}</h1>
              <div class="meta-row">
                <span class="clock">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                <div class="meal-tag" @click="${() => { this._calendarMode = 'day'; this._referenceDate = new Date(); }}">
                  <ha-icon icon="mdi:silverware-fork-knife"></ha-icon>
                  <span>Dinner: ${this.hass.states[this.config.meal_entity]?.state || 'Plan a meal'}</span>
                </div>
                <div class="nav-arrows">
                  <button @click="${() => this._navigate(-1)}">❮</button>
                  <button @click="${() => this._navigate(1)}">❯</button>
                </div>
              </div>
            </div>

            <div class="right-actions">
              <div class="view-switcher">
                ${['month', 'week', 'day', 'agenda'].map(m => html`
                  <button class="${this._calendarMode === m ? 'active' : ''}" @click="${() => this._calendarMode = m}">${m.charAt(0).toUpperCase() + m.slice(1)}</button>
                `)}
              </div>
              <button class="today-btn" @click="${() => this._referenceDate = new Date()}">Today</button>
              <div class="persona-filters">
                ${this.config.entities.map(ent => html`
                  <div class="persona ${this._activeCalendars.includes(ent.entity) ? 'active' : 'inactive'}" 
                       style="background: ${ent.color}" 
                       @click="${() => this._togglePersona(ent.entity)}">
                    ${ent.picture ? html`<img src="${ent.picture}">` : ent.entity.split('.')[1][0].toUpperCase()}
                  </div>
                `)}
              </div>
            </div>
          </header>

          <section class="content-area">
            ${this._renderMainStage()}
          </section>
        </main>

        ${this._selectedEvent ? this._renderModal() : ''}
        <button class="fab">+</button>
      </div>
    `;
  }

  _renderMainStage() {
    if (this._calendarMode === 'month') return this._renderMonthGrid();
    if (this._calendarMode === 'agenda') return this._renderAgenda();
    return this._renderTimeGrid(this._calendarMode === 'week' ? 7 : 1);
  }

  _renderMonthGrid() {
    const start = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth(), 1);
    const end = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth() + 1, 0);
    const firstDay = (start.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push({ n: null, cur: false });
    for (let i = 1; i <= end.getDate(); i++) days.push({ n: i, cur: true });

    return html`
      <div class="month-wrapper">
        <div class="labels-row">${['MON','TUE','WED','THU','FRI','SAT','SUN'].map(l => html`<div>${l}</div>`)}</div>
        <div class="month-grid">
          ${days.map(d => {
            const evs = this._events.filter(e => d.cur && new Date(e.start.dateTime || e.start.date).getDate() === d.n && this._activeCalendars.includes(e.origin));
            return html`
              <div class="day-cell ${!d.cur ? 'empty' : ''} ${this._isToday(d.n) ? 'today' : ''}">
                <span class="day-num">${d.n}</span>
                <div class="ev-list">
                  ${evs.slice(0, 4).map(e => html`
                    <div class="ev-pill" style="border-left: 4px solid ${e.color}; background:${e.color}15; color:${e.color}" @click="${() => this._selectedEvent = e}">
                      ${e.summary}
                    </div>
                  `)}
                </div>
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
    const hours = Array.from({length: 24}, (_, i) => i);
    const displayEvents = this._fragmentEvents(this._events);

    return html`
      <div class="time-grid-container">
        <div class="time-sidebar">
          <div class="all-day-label">All Day</div>
          ${hours.map(h => html`<div class="time-mark">${h}:00</div>`)}
        </div>
        <div class="grid-columns" style="--cols: ${daysCount}">
          ${Array.from({length: daysCount}).map((_, i) => {
            const d = new Date(start); d.setDate(start.getDate() + i);
            const evs = displayEvents.filter(e => this._activeCalendars.includes(e.origin) && new Date(e.start.dateTime || e.start.date).toDateString() === d.toDateString());
            return html`
              <div class="day-col">
                <div class="col-head">${d.toLocaleDateString('default', {weekday: 'short', day: 'numeric'})}</div>
                <div class="hour-stack">
                  ${hours.map(() => html`<div class="hour-box"></div>`)}
                  ${evs.map(e => html`<div class="time-pill" style="${this._getTimeStyles(e)} background:${e.color}" @click="${() => this._selectedEvent = e}">${e.summary}</div>`)}
                </div>
              </div>`;
          })}
        </div>
      </div>`;
  }

  _renderAgenda() {
    const activeEvs = this._events
      .filter(e => this._activeCalendars.includes(e.origin))
      .sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));

    return html`
      <div class="agenda-container">
        ${activeEvs.map(e => html`
          <div class="agenda-card" @click="${() => this._selectedEvent = e}">
            <div class="ag-date">
              <span class="d">${new Date(e.start.dateTime || e.start.date).getDate()}</span>
              <span class="m">${new Date(e.start.dateTime || e.start.date).toLocaleString('default', {month:'short'})}</span>
            </div>
            <div class="ag-body" style="border-left: 8px solid ${e.color}">
              <div class="ag-title">${e.summary}</div>
              <div class="ag-meta">${e.friendly_name} • ${e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'All Day'}</div>
            </div>
          </div>
        `)}
      </div>`;
  }

  _renderModal() {
    return html`
      <div class="modal-backdrop" @click="${() => this._selectedEvent = null}">
        <div class="modal-body" @click="${e => e.stopPropagation()}">
          <div class="modal-header" style="background: ${this._selectedEvent.color}">
            <h2>${this._selectedEvent.summary}</h2>
          </div>
          <div class="modal-content">
            <p><strong>Date:</strong> ${new Date(this._selectedEvent.start.dateTime || this._selectedEvent.start.date).toLocaleString()}</p>
            <p><strong>Source:</strong> ${this._selectedEvent.friendly_name}</p>
            <hr>
            <div class="description">${document.createElement('div').tap(d => d.textContent = this._selectedEvent.description || 'No notes.').innerHTML}</div>
          </div>
          <button class="close-btn" @click="${() => this._selectedEvent = null}">Back to Dashboard</button>
        </div>
      </div>`;
  }

  // --- Helpers ---
  _getTimeStyles(e) {
    if (!e.start.dateTime) return `display:none`;
    const s = new Date(e.start.dateTime), end = new Date(e.end.dateTime);
    const top = (s.getHours() * 60 + s.getMinutes()) * 1.666;
    const height = Math.max(((end - s) / 60000) * 1.666, 35);
    return `top:${top}px;height:${height}px`;
  }

  _isToday(n) { const t = new Date(); return n === t.getDate() && this._referenceDate.getMonth() === t.getMonth(); }

  _fragmentEvents(events) {
    const res = [];
    events.forEach(e => {
      const s = new Date(e.start.dateTime || e.start.date), end = new Date(e.end.dateTime || e.end.date);
      if (s.toDateString() === end.toDateString()) res.push(e);
      else {
        let cur = new Date(s);
        while (cur <= end) {
          res.push({ ...e, displayDate: cur.toDateString() });
          cur.setDate(cur.getDate() + 1);
        }
      }
    });
    return res;
  }

  static get styles() {
    return css`
      :host { --accent: #7b61ff; --bg: #fdfdfd; --card: #fff; --text: #1a1a1b; --border: #eee; }
      .nightlight-hub.dark { --bg: #121212; --card: #1e1e1e; --text: #efefef; --border: #333; }
      
      .nightlight-hub { display: grid; grid-template-columns: 120px 1fr; height: 100vh; background: var(--bg); color: var(--text); font-family: sans-serif; overflow: hidden; }
      .side-rail { background: var(--card); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 40px 0; z-index: 20; }
      .logo-area { color: var(--accent); margin-bottom: 50px; --mdc-icon-size: 40px; }
      .nav-btn { background: none; border: none; padding: 25px 0; color: #bbb; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; font-weight: bold; width: 100%; }
      .nav-btn.active { color: var(--accent); background: rgba(123, 97, 255, 0.05); border-right: 4px solid var(--accent); }
      
      .main-stage { padding: 40px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
      .top-bar { flex-shrink: 0; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
      .top-bar h1 { font-size: 2.8rem; font-weight: 800; margin: 0; letter-spacing: -1.5px; }
      .meta-row { display: flex; align-items: center; gap: 20px; margin-top: 10px; }
      .clock { font-size: 1.4rem; font-weight: 700; color: #888; }
      .nav-arrows button { background: var(--card); border: 1px solid var(--border); border-radius: 50%; width: 44px; height: 44px; cursor: pointer; color: var(--text); font-size: 1.2rem; }
      
      .right-actions { display: flex; align-items: center; gap: 20px; }
      .view-switcher { background: rgba(0,0,0,0.05); padding: 5px; border-radius: 15px; display: flex; }
      .view-switcher button { border: none; background: transparent; padding: 10px 18px; border-radius: 12px; cursor: pointer; font-weight: 800; color: #666; }
      .view-switcher button.active { background: var(--card); color: var(--text); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      
      .persona-filters { display: flex; gap: 10px; }
      .persona { width: 45px; height: 45px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; cursor: pointer; overflow: hidden; border: 2px solid transparent; }
      .persona.inactive { opacity: 0.15; transform: scale(0.9); }
      .persona img { width: 100%; height: 100%; object-fit: cover; }
      .today-btn { background: var(--accent); color: #fff; border: none; padding: 12px 24px; border-radius: 14px; font-weight: 800; cursor: pointer; }

      .content-area { flex-grow: 1; height: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      
      .month-wrapper { height: 100%; display: flex; flex-direction: column; }
      .labels-row { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; color: #bbb; font-weight: 800; font-size: 0.9rem; padding-bottom: 15px; }
      .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(6, 1fr); gap: 12px; flex-grow: 1; height: 0; }
      .day-cell { background: var(--card); border: 2px solid var(--border); border-radius: 20px; padding: 15px; overflow: hidden; }
      .day-cell.today { border-color: var(--accent); border-width: 3px; }
      .day-cell.empty { opacity: 0.2; background: rgba(0,0,0,0.02); }
      .day-num { font-weight: 900; font-size: 1.4rem; display: block; margin-bottom: 10px; }
      .ev-pill { margin-top: 4px; padding: 6px 10px; border-radius: 8px; font-size: 0.85rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }

      .time-grid-container { display: flex; height: 100%; border: 1px solid var(--border); border-radius: 30px; overflow: hidden; background: var(--card); }
      .time-sidebar { width: 85px; border-right: 1px solid var(--border); background: var(--bg); flex-shrink: 0; position: sticky; left: 0; z-index: 10; }
      .time-mark { height: 100px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #888; font-weight: 700; }
      .all-day-label { height: 60px; font-weight: 900; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; text-transform: uppercase; color: #bbb; }
      
      .grid-columns { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; overflow-y: auto; scroll-behavior: smooth; }
      .day-col { border-right: 1px solid var(--border); position: relative; }
      .col-head { height: 60px; display: flex; align-items: center; justify-content: center; font-weight: 800; background: var(--card); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 5; }
      .hour-stack { position: relative; height: 2400px; }
      .hour-box { height: 100px; border-bottom: 1px dotted var(--border); }
      .time-pill { position: absolute; left: 6px; right: 6px; padding: 12px; border-radius: 12px; color: #fff; font-size: 0.95rem; font-weight: 800; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 2; }

      .agenda-container { height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
      .agenda-card { display: flex; gap: 20px; align-items: center; background: var(--card); padding: 15px; border-radius: 20px; border: 1px solid var(--border); cursor: pointer; transition: 0.2s; }
      .ag-date { display: flex; flex-direction: column; align-items: center; width: 60px; }
      .ag-date .d { font-size: 2rem; font-weight: 900; }
      .ag-date .m { font-size: 0.85rem; font-weight: 800; text-transform: uppercase; color: var(--accent); }
      .ag-body { flex-grow: 1; padding: 10px 20px; }
      .ag-title { font-size: 1.4rem; font-weight: 800; }
      .ag-meta { color: #888; font-weight: 600; margin-top: 5px; }

      .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(10px); }
      .modal-body { background: var(--card); width: 600px; border-radius: 40px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
      .modal-header { padding: 40px; color: #fff; text-align: center; }
      .modal-content { padding: 40px; font-size: 1.1rem; line-height: 1.6; }
      .close-btn { width: 100%; padding: 25px; border: none; background: var(--accent); color: #fff; font-weight: 900; font-size: 1.2rem; cursor: pointer; }

      .fab { position: fixed; bottom: 40px; right: 40px; width: 85px; height: 85px; border-radius: 50%; background: var(--accent); color: #fff; border: none; font-size: 3.5rem; cursor: pointer; box-shadow: 0 10px 25px rgba(123, 97, 255, 0.4); z-index: 100; }
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
    return html`
      <div class="schema-editor">
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
  description: "Complete family dashboard solution with dark mode and multi-view support."
});