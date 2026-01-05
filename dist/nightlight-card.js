/**
 * Nightlight Dashboard (v1.0.3)
 * Master Release Candidate - Rick P. Edition
 * Features: Dark Theme, Multi-View, Persona Filters, Event Modal
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
      _showAddModal: { type: Boolean },
      _selectedEvent: { type: Object }
    };
  }

  static getConfigElement() { return document.createElement("nightlight-card-editor"); }
  static getStubConfig() { return { title: "Nightlight Hub", theme: "light", entities: [] }; }

  constructor() {
    super();
    this._calendarMode = 'month';
    this._activeCalendars = [];
    this._referenceDate = new Date();
    this._events = [];
    this._loading = false;
    this._showAddModal = false;
    this._selectedEvent = null;
  }

  setConfig(config) {
    if (!config.entities) throw new Error("Please define entities in config.");
    this.config = { title: "Family Hub", theme: "light", ...config };
    if (this._activeCalendars.length === 0) {
      this._activeCalendars = this.config.entities.map(e => e.entity || e);
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

    const promises = this.config.entities.filter(e => e.entity.startsWith('calendar')).map(ent => {
      return this.hass.callApi('GET', `calendars/${ent.entity}?start=${start.toISOString()}&end=${end.toISOString()}`)
        .then(evs => evs.map(e => ({ 
          ...e, 
          color: ent.color || '#7b61ff', 
          origin: ent.entity,
          friendly_name: this.hass.states[ent.entity]?.attributes.friendly_name || ent.entity
        })));
    });
    const results = await Promise.all(promises);
    this._events = results.flat();
  }

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

  _sanitize(text) {
    const temp = document.createElement('div');
    temp.textContent = text;
    return temp.innerHTML;
  }

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
                <div class="nav-arrows">
                  <button @click="${() => this._navigate(-1)}">❮</button>
                  <button @click="${() => this._navigate(1)}">❯</button>
                </div>
              </div>
            </div>

            <div class="right-actions">
              <div class="view-switcher">
                <button class="${this._calendarMode === 'month' ? 'active' : ''}" @click="${() => this._calendarMode = 'month'}">Month</button>
                <button class="${this._calendarMode === 'week' ? 'active' : ''}" @click="${() => this._calendarMode = 'week'}">Week</button>
                <button class="${this._calendarMode === 'day' ? 'active' : ''}" @click="${() => this._calendarMode = 'day'}">Day</button>
                <button class="${this._calendarMode === 'agenda' ? 'active' : ''}" @click="${() => this._calendarMode = 'agenda'}">Agenda</button>
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
            ${this._renderCalendarView()}
          </section>
        </main>

        ${this._selectedEvent ? this._renderEventModal() : ''}
        
        <button class="fab" @click="${() => this._showAddModal = true}">+</button>
      </div>
    `;
  }

  _renderCalendarView() {
    if (this._calendarMode === 'month') return this._renderMonthGrid();
    if (this._calendarMode === 'agenda') return this._renderAgendaView();
    if (this._calendarMode === 'day') return this._renderTimeGrid(1);
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
      <div class="month-container">
        <div class="week-labels">${['MON','TUE','WED','THU','FRI','SAT','SUN'].map(l => html`<div>${l}</div>`)}</div>
        <div class="month-grid">
          ${days.map(d => {
            const evs = this._events.filter(e => d.cur && new Date(e.start.dateTime || e.start.date).getDate() === d.n && this._activeCalendars.includes(e.origin));
            return html`
              <div class="day-cell ${!d.cur ? 'empty' : ''} ${this._isToday(d.n) ? 'today' : ''}">
                <span class="day-number">${d.n}</span>
                <div class="event-stack">
                  ${evs.slice(0, 4).map(e => html`
                    <div class="pill" style="border-left: 4px solid ${e.color}; background: ${e.color}15; color: ${e.color}" @click="${() => this._selectedEvent = e}">
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
    const hours = Array.from({length: 24}, (_, i) => i);
    const start = new Date(this._referenceDate);
    if (daysCount === 7) {
      const day = start.getDay();
      start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
    }

    return html`
      <div class="time-grid-root">
        <div class="sticky-time-sidebar">
          <div class="all-day-header">All Day</div>
          ${hours.map(h => html`<div class="time-mark">${h}:00</div>`)}
        </div>
        <div class="grid-body" style="--cols: ${daysCount}">
          ${Array.from({length: daysCount}).map((_, i) => {
            const d = new Date(start); d.setDate(start.getDate() + i);
            const evs = this._events.filter(e => this._activeCalendars.includes(e.origin) && new Date(e.start.dateTime || e.start.date).toDateString() === d.toDateString());
            return html`
              <div class="day-column">
                <div class="col-head">${d.toLocaleDateString('default', {weekday: 'short', day: 'numeric'})}</div>
                <div class="hour-container">
                  ${hours.map(() => html`<div class="hour-box"></div>`)}
                  ${evs.map(e => html`
                    <div class="time-ev" style="${this._getTimeStyles(e)} background: ${e.color}" @click="${() => this._selectedEvent = e}">
                      ${e.summary}
                    </div>`)}
                </div>
              </div>`;
          })}
        </div>
      </div>`;
  }

  _renderAgendaView() {
    const activeEvents = this._events
      .filter(e => this._activeCalendars.includes(e.origin))
      .sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));

    return html`
      <div class="agenda-view">
        ${activeEvents.map(e => html`
          <div class="agenda-row" @click="${() => this._selectedEvent = e}">
            <div class="agenda-date">
              <span class="day">${new Date(e.start.dateTime || e.start.date).getDate()}</span>
              <span class="mon">${new Date(e.start.dateTime || e.start.date).toLocaleString('default', {month:'short'})}</span>
            </div>
            <div class="agenda-card" style="border-left: 6px solid ${e.color}">
              <div class="ag-title">${e.summary}</div>
              <div class="ag-sub">${e.friendly_name} • ${e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'All Day'}</div>
            </div>
          </div>
        `)}
      </div>`;
  }

  _renderEventModal() {
    return html`
      <div class="modal-overlay" @click="${() => this._selectedEvent = null}">
        <div class="modal-card" @click="${e => e.stopPropagation()}">
          <div class="modal-header" style="background: ${this._selectedEvent.color}">
            <h2>${this._selectedEvent.summary}</h2>
          </div>
          <div class="modal-body">
            <p><strong>Time:</strong> ${new Date(this._selectedEvent.start.dateTime || this._selectedEvent.start.date).toLocaleString()}</p>
            <p><strong>Calendar:</strong> ${this._selectedEvent.friendly_name}</p>
            <hr>
            <div class="description">${this._sanitize(this._selectedEvent.description || 'No description provided.')}</div>
          </div>
          <button class="close-btn" @click="${() => this._selectedEvent = null}">Close</button>
        </div>
      </div>`;
  }

  _getTimeStyles(e) {
    if (!e.start.dateTime) return `display:none`;
    const s = new Date(e.start.dateTime), end = new Date(e.end.dateTime);
    const top = (s.getHours() * 60 + s.getMinutes()) * 1.666;
    const height = Math.max(((end - s) / 60000) * 1.666, 30);
    return `top:${top}px;height:${height}px`;
  }

  _isToday(n) { const t = new Date(); return n === t.getDate() && this._referenceDate.getMonth() === t.getMonth(); }

  static get styles() {
    return css`
      :host { --accent: #7b61ff; --bg: #fdfdfd; --card: #fff; --text: #1a1a1b; --border: #eee; }
      .nightlight-hub.dark { --bg: #121212; --card: #1e1e1e; --text: #efefef; --border: #333; }
      
      .nightlight-hub { display: grid; grid-template-columns: 120px 1fr; height: 100vh; background: var(--bg); color: var(--text); font-family: sans-serif; overflow: hidden; }
      .side-rail { background: var(--card); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 40px 0; }
      .nav-btn { background: none; border: none; padding: 20px 0; color: #bbb; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; font-weight: bold; width: 100%; }
      .nav-btn.active { color: var(--accent); background: rgba(123, 97, 255, 0.05); border-right: 4px solid var(--accent); }
      
      .main-stage { padding: 40px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
      .top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
      .top-bar h1 { font-size: 2.8rem; font-weight: 800; margin: 0; }
      .meta-row { display: flex; align-items: center; gap: 20px; margin-top: 8px; }
      .clock { font-size: 1.5rem; color: #888; font-weight: 700; }
      .nav-arrows button { background: var(--card); border: 1px solid var(--border); border-radius: 50%; width: 40px; height: 40px; cursor: pointer; color: var(--text); }
      
      .right-actions { display: flex; align-items: center; gap: 20px; }
      .view-switcher { background: #f0f2f5; padding: 4px; border-radius: 12px; display: flex; }
      .view-switcher button { border: none; background: transparent; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 700; color: #666; }
      .view-switcher button.active { background: var(--card); color: var(--text); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      .persona-filters { display: flex; gap: 8px; }
      .persona { width: 45px; height: 45px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; cursor: pointer; overflow: hidden; }
      .persona.inactive { opacity: 0.2; }
      .persona img { width: 100%; height: 100%; object-fit: cover; }
      .today-btn { background: var(--accent); color: #fff; border: none; padding: 10px 20px; border-radius: 12px; font-weight: 800; cursor: pointer; }

      .content-area { flex-grow: 1; overflow: hidden; position: relative; }
      .month-container { height: 100%; display: flex; flex-direction: column; }
      .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(6, 1fr); gap: 12px; flex-grow: 1; }
      .day-cell { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 15px; }
      .day-cell.today { border-color: var(--accent); border-width: 2px; }
      .day-cell.empty { background: rgba(0,0,0,0.02); }
      .day-number { font-weight: 900; font-size: 1.2rem; margin-bottom: 5px; display: block; }
      .pill { margin-bottom: 4px; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }

      .time-grid-root { display: flex; height: 100%; border: 1px solid var(--border); border-radius: 24px; overflow: hidden; }
      .sticky-time-sidebar { width: 80px; flex-shrink: 0; border-right: 1px solid var(--border); background: var(--bg); position: sticky; left: 0; z-index: 5; }
      .time-mark { height: 100px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #888; }
      .all-day-header { height: 60px; border-bottom: 1px solid var(--border); font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; }
      .grid-body { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; overflow-y: auto; }
      .day-column { border-right: 1px solid var(--border); position: relative; }
      .col-head { height: 60px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-weight: 800; background: var(--card); position: sticky; top: 0; z-index: 4; }
      .hour-container { position: relative; height: 2400px; }
      .hour-box { height: 100px; border-bottom: 1px dotted var(--border); }
      .time-ev { position: absolute; left: 4px; right: 4px; padding: 8px; border-radius: 10px; color: #fff; font-size: 0.85rem; font-weight: 800; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }

      .agenda-view { height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
      .agenda-row { display: flex; gap: 20px; align-items: center; cursor: pointer; }
      .agenda-date { display: flex; flex-direction: column; align-items: center; width: 60px; }
      .agenda-date .day { font-size: 1.8rem; font-weight: 900; }
      .agenda-date .mon { font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: var(--accent); }
      .agenda-card { flex-grow: 1; background: var(--card); padding: 20px; border-radius: 16px; border: 1px solid var(--border); }
      .ag-title { font-size: 1.2rem; font-weight: 800; }
      .ag-sub { font-size: 0.9rem; color: #888; margin-top: 5px; font-weight: 600; }

      .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(5px); }
      .modal-card { background: var(--card); width: 500px; border-radius: 32px; overflow: hidden; animation: slideIn 0.3s ease; }
      @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .modal-header { padding: 30px; color: #fff; }
      .modal-body { padding: 30px; line-height: 1.6; }
      .close-btn { width: 100%; padding: 20px; border: none; background: var(--accent); color: #fff; font-weight: 800; font-size: 1.1rem; cursor: pointer; }
      
      .fab { position: fixed; bottom: 40px; right: 40px; width: 80px; height: 80px; border-radius: 50%; background: var(--accent); color: #fff; border: none; font-size: 3rem; cursor: pointer; box-shadow: 0 10px 20px rgba(123, 97, 255, 0.4); z-index: 10; }
    `;
  }
}

customElements.define("nightlight-calendar-card", NightlightDashboard);