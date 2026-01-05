/**
 * Nightlight Dashboard (v1.0.4)
 * Senior Dev Lead: Rick P. | Kiosk Gold Build
 * Fixes: API 400 Errors, Flex-Collapse, Double Scroll, FAB Modal Logic
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
      _loading: { type: Boolean },
      _referenceDate: { type: Object },
      _showAddModal: { type: Boolean },
      _selectedEvent: { type: Object }
    };
  }

  constructor() {
    super();
    this._activeView = 'calendar';
    this._calendarMode = 'month';
    this._referenceDate = new Date();
    this._activeCalendars = [];
    this._events = [];
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
    // FIX: Tighten date range to prevent API 400 Bad Request
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

    // Secure API Request with local-formatted ISO strings
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

  _navigate(dir) {
    const d = new Date(this._referenceDate);
    if (this._calendarMode === 'month') d.setMonth(d.getMonth() + dir);
    else if (this._calendarMode === 'week') d.setDate(d.getDate() + (dir * 7));
    else d.setDate(d.getDate() + dir);
    this._referenceDate = d;
  }

  _togglePersona(id) {
    this._activeCalendars = this._activeCalendars.includes(id) ? 
      this._activeCalendars.filter(i => i !== id) : [...this._activeCalendars, id];
  }

  _getTimeStyles(e) {
    if (!e.start.dateTime) return `display:none`;
    const s = new Date(e.start.dateTime), end = new Date(e.end.dateTime);
    const top = (s.getHours() * 60 + s.getMinutes()) * 1.666; 
    const height = Math.max(((end - s) / 60000) * 1.666, 30);
    return `top:${top}px;height:${height}px`;
  }

  render() {
    if (!this.hass) return html``;

    return html`
      <div class="nightlight-hub ${this.config.theme}">
        <nav class="side-rail">
          <div class="logo-area"><ha-icon icon="mdi:home-heart"></ha-icon></div>
          <div class="nav-items">
            <button class="nav-btn active"><ha-icon icon="mdi:calendar-month"></ha-icon><span>Calendar</span></button>
            <button class="nav-btn" @click="${() => alert('Chores Engine v1.1 planned')}"><ha-icon icon="mdi:checkbox-marked-circle-outline"></ha-icon><span>Chores</span></button>
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
            ${this._renderCalendarView()}
          </section>
        </main>

        ${this._selectedEvent ? this._renderEventModal() : ''}
        <button class="fab" @click="${() => alert('Event Creation API v1.1')}">+</button>
      </div>
    `;
  }

  _renderCalendarView() {
    if (this._calendarMode === 'month') return this._renderMonthGrid();
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
      <div class="month-container">
        <div class="week-labels-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(l => html`<div>${l}</div>`)}</div>
        <div class="month-grid-locked">
          ${days.map(d => {
            const evs = this._events.filter(e => d.cur && new Date(e.start.dateTime || e.start.date).getDate() === d.n && this._activeCalendars.includes(e.origin));
            return html`
              <div class="day-cell ${!d.cur ? 'empty' : ''} ${this._isToday(d.n) ? 'today' : ''}">
                <span class="day-number">${d.n || ''}</span>
                <div class="ev-stack-locked">
                   ${evs.slice(0, 4).map(e => html`<div class="pill" @click="${() => this._selectedEvent = e}" style="border-left:4px solid ${e.color}; background:${e.color}15; color:${e.color}">${e.summary}</div>`)}
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
      <div class="time-grid-wrapper">
        <div class="sticky-time-sidebar">
          <div class="all-day-label">All Day</div>
          ${hours.map(h => html`<div class="time-mark">${h}:00</div>`)}
        </div>
        <div class="grid-body-scroll" style="--cols: ${daysCount}">
          ${Array.from({length: daysCount}).map((_, i) => {
            const d = new Date(start); d.setDate(start.getDate() + i);
            const evs = this._events.filter(e => this._activeCalendars.includes(e.origin) && new Date(e.start.dateTime || e.start.date).toDateString() === d.toDateString());
            return html`
              <div class="day-column">
                <div class="col-head-sticky">${d.toLocaleDateString('default', {weekday: 'short', day: 'numeric'})}</div>
                <div class="hour-container-locked">
                  ${hours.map(() => html`<div class="hour-box"></div>`)}
                  ${evs.map(e => html`<div class="time-ev" @click="${() => this._selectedEvent = e}" style="${this._getTimeStyles(e)} background:${e.color}">${e.summary}</div>`)}
                </div>
              </div>`;
          })}
        </div>
      </div>`;
  }

  _renderEventModal() {
    return html`
      <div class="modal-overlay" @click="${() => this._selectedEvent = null}">
        <div class="modal-card" @click="${e => e.stopPropagation()}">
          <div class="modal-header" style="background: ${this._selectedEvent.color}"><h2>${this._selectedEvent.summary}</h2></div>
          <div class="modal-body">
            <p><strong>Time:</strong> ${new Date(this._selectedEvent.start.dateTime || this._selectedEvent.start.date).toLocaleString()}</p>
            <hr>
            <div>${this._selectedEvent.description || 'No notes.'}</div>
          </div>
          <button class="close-btn" @click="${() => this._selectedEvent = null}">Close</button>
        </div>
      </div>`;
  }

  _isToday(n) { const t = new Date(); return n === t.getDate() && this._referenceDate.getMonth() === t.getMonth(); }

  static get styles() {
    return css`
      :host { --accent: #7b61ff; --bg: #fdfdfd; --card: #fff; --text: #1a1a1b; --border: #eee; }
      .nightlight-hub.dark { --bg: #121212; --card: #1e1e1e; --text: #efefef; --border: #333; }
      
      .nightlight-hub { display: grid; grid-template-columns: 120px 1fr; height: 100vh; background: var(--bg); color: var(--text); font-family: sans-serif; overflow: hidden; box-sizing: border-box; }
      .side-rail { background: var(--card); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 40px 0; }
      .logo-area { color: var(--accent); margin-bottom: 50px; --mdc-icon-size: 40px; }
      .nav-btn { background: none; border: none; padding: 20px 0; color: #bbb; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; font-weight: bold; width: 100%; }
      .nav-btn.active { color: var(--accent); background: rgba(123, 97, 255, 0.05); border-right: 4px solid var(--accent); }
      
      .main-stage { padding: 40px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; overflow: hidden; }
      .top-bar { flex-shrink: 0; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
      .top-bar h1 { font-size: 2.8rem; font-weight: 800; margin: 0; }
      .clock { color: #888; font-weight: 700; font-size: 1.2rem; margin-right: 20px; }
      .nav-arrows button { background: var(--card); border: 1px solid var(--border); border-radius: 50%; width: 44px; height: 44px; cursor: pointer; color: var(--text); font-size: 1.2rem; }
      
      .content-area { flex-grow: 1; height: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
      
      .month-container { display: flex; flex-direction: column; height: 100%; }
      .week-labels-grid { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; color: #bbb; font-weight: 800; font-size: 0.9rem; padding-bottom: 15px; }
      .month-grid-locked { display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(6, 1fr); gap: 12px; flex-grow: 1; height: 0; }
      .day-cell { background: var(--card); border: 2px solid var(--border); border-radius: 20px; padding: 15px; overflow: hidden; display: flex; flex-direction: column; }
      .day-cell.today { border-color: var(--accent); }
      .day-cell.empty { opacity: 0.2; }
      .day-number { font-weight: 900; font-size: 1.4rem; }
      .pill { margin-top: 4px; padding: 6px 10px; border-radius: 8px; font-size: 0.85rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }

      .time-grid-wrapper { display: flex; flex-grow: 1; height: 0; border: 1px solid var(--border); border-radius: 24px; overflow: hidden; background: var(--card); }
      .sticky-time-sidebar { width: 80px; flex-shrink: 0; border-right: 1px solid var(--border); background: var(--bg); }
      .time-mark { height: 100px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #888; border-bottom: 1px solid var(--border); }
      .all-day-label { height: 60px; font-weight: 800; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; }
      
      .grid-body-scroll { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; overflow-y: auto; overflow-x: hidden; }
      .day-column { border-right: 1px solid var(--border); position: relative; display: flex; flex-direction: column; }
      .col-head-sticky { height: 60px; display: flex; align-items: center; justify-content: center; font-weight: 800; background: var(--card); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 5; }
      .hour-container-locked { position: relative; height: 2400px; flex-grow: 1; }
      .hour-box { height: 100px; border-bottom: 1px solid rgba(0,0,0,0.03); }
      .time-ev { position: absolute; left: 6px; right: 6px; padding: 10px; border-radius: 12px; color: #fff; font-size: 0.95rem; font-weight: 800; cursor: pointer; z-index: 2; }

      .persona-filters { display: flex; gap: 8px; }
      .persona { width: 45px; height: 45px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; cursor: pointer; overflow: hidden; }
      .persona.inactive { opacity: 0.2; }
      .persona img { width: 100%; height: 100%; object-fit: cover; }
      .today-btn { background: var(--accent); color: #fff; border: none; padding: 12px 20px; border-radius: 14px; font-weight: 800; cursor: pointer; }
      
      .view-switcher { background: rgba(0,0,0,0.05); padding: 5px; border-radius: 15px; display: flex; }
      .view-switcher button { border: none; background: transparent; padding: 10px 18px; border-radius: 10px; cursor: pointer; font-weight: 800; color: #666; }
      .view-switcher button.active { background: var(--card); color: var(--text); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      
      .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(8px); }
      .modal-card { background: var(--card); width: 500px; border-radius: 35px; overflow: hidden; }
      .modal-header { padding: 30px; color: #fff; }
      .modal-body { padding: 30px; }
      .close-btn { width: 100%; padding: 25px; border: none; background: var(--accent); color: #fff; font-weight: 800; cursor: pointer; }

      .fab { position: fixed; bottom: 40px; right: 40px; width: 85px; height: 85px; border-radius: 50%; background: var(--accent); color: #fff; border: none; font-size: 3.5rem; cursor: pointer; box-shadow: 0 10px 25px rgba(123, 97, 255, 0.4); z-index: 100; }
    `;
  }
}

customElements.define("nightlight-calendar-card", NightlightDashboard);