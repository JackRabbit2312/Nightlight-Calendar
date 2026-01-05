/**
 * Nightlight Dashboard (v1.0.9)
 * Senior Dev Lead: Rick P. | Melbourne
 * Features: Past-Event Dulling, Multi-Day Bar Rendering, Split Agenda Fragments
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
      _events: { type: Array },
      _chores: { type: Array },
      _loading: { type: Boolean },
      _referenceDate: { type: Object },
      _selectedEvent: { type: Object },
      _activeCalendars: { type: Array }
    };
  }

  static getConfigElement() { return document.createElement("nightlight-card-editor"); }
  static getStubConfig() { return { title: "Family Hub", theme: "light", entities: [] }; }

  constructor() {
    super();
    this._activeView = 'calendar';
    this._calendarMode = 'month';
    this._referenceDate = new Date();
    this._events = [];
    this._chores = [];
    this._activeCalendars = [];
    this._loading = false;
    this._selectedEvent = null;
  }

  setConfig(config) {
    if (!config.entities) throw new Error("Please define entities in YAML.");
    this.config = { title: "Family Hub", theme: "light", ...config };
    if (this._activeCalendars.length === 0 && config.entities) {
      this._activeCalendars = config.entities.map(e => e.entity);
    }
  }

  updated(changedProps) {
    if (changedProps.has('hass') || changedProps.has('_activeView') || changedProps.has('_calendarMode') || changedProps.has('_referenceDate')) {
      this._refreshData();
    }
  }

  async _refreshData() {
    if (!this.hass || this._loading) return;
    this._loading = true;
    try {
      await this._fetchEvents();
      if (this._activeView === 'chores') await this._fetchChores();
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
    } else {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0,0,0,0);
      end = new Date(start);
      end.setDate(start.getDate() + 7);
    }

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

  async _fetchChores() {
    const todoEntities = this.config.entities.filter(e => e.entity.startsWith('todo'));
    const chores = [];
    for (const ent of todoEntities) {
      try {
        const items = await this.hass.callService('todo', 'get_items', { entity_id: ent.entity }, null, true);
        const listItems = items[ent.entity]?.items || [];
        chores.push(...listItems.map(item => ({ ...item, list_id: ent.entity, color: ent.color })));
      } catch (e) { console.error("Chore fetch failed", e); }
    }
    this._chores = chores;
  }

  _navigate(dir) {
    const d = new Date(this._referenceDate);
    if (this._calendarMode === 'month') d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + (dir * 7));
    this._referenceDate = d;
  }

  _togglePersona(id) {
    this._activeCalendars = this._activeCalendars.includes(id) ? 
      this._activeCalendars.filter(i => i !== id) : [...this._activeCalendars, id];
  }

  _isPast(event) {
    const end = new Date(event.end.dateTime || event.end.date);
    return new Date() > end;
  }

  _sanitize(text) {
    const div = document.createElement('div');
    div.textContent = text || 'No details provided.';
    return div.innerHTML;
  }

  render() {
    if (!this.hass) return html``;
    const headerTitle = this._referenceDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    return html`
      <div class="nightlight-hub ${this.config.theme}">
        <nav class="side-rail">
          <div class="logo-area">
             <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,3L2,12H5V20H19V12H22L12,3M12,8.5C13.5,8.5 15,10 15,11.5C15,13.2 12,16 12,16C12,16 9,13.2 9,11.5C9,10 10.5,8.5 12,8.5Z"/></svg>
          </div>
          <div class="nav-items">
            <button class="nav-btn ${this._activeView === 'calendar' ? 'active' : ''}" @click="${() => this._activeView = 'calendar'}">
               <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z"/></svg>
               <span>Calendar</span>
            </button>
            <button class="nav-btn ${this._activeView === 'chores' ? 'active' : ''}" @click="${() => this._activeView = 'chores'}">
               <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/></svg>
               <span>Chores</span>
            </button>
          </div>
        </nav>

        <main class="main-stage">
          <header class="top-bar">
            <div class="left-info">
              <h1>${headerTitle}</h1>
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
                ${['month', 'week', 'day', 'agenda'].map(m => html`
                  <button class="${this._calendarMode === m ? 'active' : ''}" @click="${() => this._calendarMode = m}">${m.toUpperCase()}</button>
                `)}
              </div>
              <button class="today-btn" @click="${() => this._referenceDate = new Date()}">Today</button>
              <div class="persona-filters">
                ${this.config.entities.map(ent => html`
                  <div class="persona ${this._activeCalendars.includes(ent.entity) ? 'active' : 'inactive'}" 
                       style="background: ${ent.color}" @click="${() => this._togglePersona(ent.entity)}">
                    ${ent.picture ? html`<img src="${ent.picture}">` : ent.entity.split('.')[1][0].toUpperCase()}
                  </div>
                `)}
              </div>
            </div>
          </header>

          <section class="content-area">
            ${this._activeView === 'calendar' ? this._renderCalendarView() : this._renderChores()}
          </section>
        </main>
        ${this._selectedEvent ? this._renderModal() : ''}
      </div>
    `;
  }

  _renderCalendarView() {
    if (this._calendarMode === 'month') return this._renderCalendar();
    if (this._calendarMode === 'agenda') return this._renderAgenda();
    if (this._calendarMode === 'day') return this._renderDayView();
    return this._renderTimeGrid(7);
  }

  _renderCalendar() {
    const start = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth(), 1);
    const end = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth() + 1, 0);
    const firstDay = (start.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push({ n: null, cur: false });
    for (let i = 1; i <= end.getDate(); i++) days.push({ n: i, cur: true });

    return html`
      <div class="calendar-container">
        <div class="week-labels">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => html`<div>${d}</div>`)}</div>
        <div class="month-grid">
          ${days.map(d => {
            const dayEvents = this._events.filter(e => d.cur && new Date(e.start.dateTime || e.start.date).getDate() === d.n && this._activeCalendars.includes(e.origin))
              .sort((a, b) => (a.start.dateTime || a.start.date).localeCompare(b.start.dateTime || b.start.date));
            return html`
              <div class="day-cell ${!d.cur ? 'empty' : ''} ${this._isToday(d.n) ? 'today' : ''}" @click="${() => { if(d.n) {this._referenceDate.setDate(d.n); this._calendarMode = 'day';}}}">
                <span class="day-number">${d.n || ''}</span>
                <div class="event-stack">
                  ${dayEvents.map(e => this._renderEventPill(e))}
                </div>
              </div>`;
          })}
        </div>
      </div>`;
  }

  _renderDayView() {
    const d = new Date(this._referenceDate);
    const fragmented = this._fragmentEvents(this._events, d, d);
    const evs = fragmented.filter(e => this._activeCalendars.includes(e.origin));
    const nowPos = ((new Date().getHours() * 60 + new Date().getMinutes()) / 14.4);

    return html`
      <div class="day-view-container">
        <div class="all-day-floating-bar">
          ${evs.filter(e => e.isAllDay || e.isFragment).map(e => html`
            <div class="all-day-pill-floating" style="background: ${e.color}">${e.summary}</div>
          `)}
        </div>
        <div class="day-timeline-wrapper">
          <div class="time-axis">${Array.from({length: 24}, (_, i) => html`<div class="hour-mark">${i}:00</div>`)}</div>
          <div class="event-stage">
            ${d.toDateString() === new Date().toDateString() ? html`<div class="now-indicator" style="top: ${nowPos}%"></div>` : ''}
            ${Array.from({length: 24}).map(() => html`<div class="slot-row"></div>`)}
            ${evs.filter(e => e.start.dateTime && !e.isFragment).map(e => html`
                <div class="detailed-ev ${this._isPast(e) ? 'is-past' : ''}" style="${this._getTimeStyles(e)} border-left: 8px solid ${e.color}; background: ${e.color}15" @click="${() => this._selectedEvent = e}">
                  <div class="ev-summary-large">${e.summary}</div>
                </div>`)}
          </div>
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
    const fragmented = this._fragmentEvents(this._events, start, endRange);

    return html`
      <div class="time-grid-wrapper">
        <div class="time-sidebar"><div class="all-day-label">All Day</div>${Array.from({length: 24}, (_, i) => html`<div class="time-mark">${i}:00</div>`)}</div>
        <div class="grid-scroll-area" style="--cols: ${daysCount}">
          ${Array.from({length: daysCount}).map((_, i) => {
            const d = new Date(start); d.setDate(start.getDate() + i);
            const evs = fragmented.filter(e => this._activeCalendars.includes(e.origin) && e.displayDate === d.toDateString());
            return html`
              <div class="day-column">
                <div class="col-head">${d.toLocaleDateString('default', {weekday: 'short', day: 'numeric'})}</div>
                <div class="all-day-header-slot">
                   ${evs.filter(e => e.isAllDay || e.isFragment).map(e => html`<div class="all-day-pill-small" style="background: ${e.color}">${e.summary}</div>`)}
                </div>
                <div class="hour-container">
                  ${Array.from({length: 24}).map(() => html`<div class="hour-box"></div>`)}
                  ${evs.filter(e => !e.isAllDay && !e.isFragment).map(e => html`<div class="time-ev ${this._isPast(e) ? 'is-past' : ''}" style="${this._getTimeStyles(e)} background: ${e.color}CC" @click="${() => this._selectedEvent = e}">${e.summary}</div>`)}
                </div>
              </div>`;
          })}
        </div>
      </div>`;
  }

  _renderAgenda() {
    // Fragment all events so multi-day items appear on each day they span
    const fragmented = this._fragmentEvents(this._events);
    const activeEvs = fragmented
      .filter(e => this._activeCalendars.includes(e.origin))
      .sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));

    return html`
      <div class="agenda-view">
        ${activeEvs.map(e => html`
          <div class="agenda-row ${this._isPast(e) ? 'is-past' : ''}" @click="${() => this._selectedEvent = e}">
            <div class="agenda-date">
              <span class="day">${new Date(e.displayDate || e.start.dateTime || e.start.date).getDate()}</span>
              <span class="mon">${new Date(e.displayDate || e.start.dateTime || e.start.date).toLocaleString('default', {month:'short'})}</span>
            </div>
            <div class="agenda-card" style="border-left: 6px solid ${e.color}">
              <div class="ag-title">${e.summary}</div>
              <div class="ag-sub">${e.friendly_name} • ${e.isAllDay ? 'All Day' : new Date(e.start.dateTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
            </div>
          </div>
        `)}
      </div>`;
  }

  _renderEventPill(e) {
    const isMultiDay = new Date(e.start.date || e.start.dateTime).toDateString() !== new Date(e.end.date || e.end.dateTime).toDateString();
    return html`
      <div class="ev-pill ${this._isPast(e) ? 'is-past' : ''} ${isMultiDay ? 'multi-day-bar' : ''}" 
           style="border-left: 4px solid ${e.color}; background:${e.color}15; color:${e.color}" 
           @click="${(ev) => { ev.stopPropagation(); this._selectedEvent = e; }}">
          <span class="ev-summary">${e.summary}</span>
      </div>`;
  }

  _renderChores() {
    const active = this._chores.filter(c => c.status !== 'completed');
    return html`<div class="chores-grid"><div class="chore-col"><h2>To Do</h2>${active.map(c => html`<div class="chore-row" style="border-left: 4px solid ${c.color}">${c.summary}</div>`)}</div></div>`;
  }

  _renderModal() {
    return html`
      <div class="modal-backdrop" @click="${() => this._selectedEvent = null}">
        <div class="modal-body" @click="${e => e.stopPropagation()}">
          <div class="modal-header" style="background: ${this._selectedEvent.color}">
            <h2>${this._selectedEvent.summary}</h2>
          </div>
          <div class="modal-content">
            <p><strong>Time:</strong> ${new Date(this._selectedEvent.start.dateTime || this._selectedEvent.start.date).toLocaleString()}</p>
            <hr>
            <div class="description" .innerHTML="${this._sanitize(this._selectedEvent.description)}"></div>
          </div>
          <button class="close-btn" @click="${() => this._selectedEvent = null}">Close</button>
        </div>
      </div>`;
  }

  _getTimeStyles(e) {
    if (!e.start.dateTime) return `display:none`;
    const s = new Date(e.start.dateTime), end = new Date(e.end.dateTime);
    const top = (s.getHours() * 60 + s.getMinutes()) * 1.666;
    const height = Math.max(((end - s) / 60000) * 1.666, 35);
    return `top:${top}px;height:${height}px`;
  }

  _fragmentEvents(events, startRange, endRange) {
    const fragmented = [];
    events.forEach(event => {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);
      if (start.toDateString() === end.toDateString()) {
        fragmented.push({...event, displayDate: start.toDateString()});
      } else {
        let current = new Date(start);
        while (current <= end) {
          if ((!startRange || current >= startRange) && (!endRange || current <= endRange)) {
            fragmented.push({ ...event, isFragment: true, displayDate: current.toDateString(), isAllDay: true });
          }
          current.setDate(current.getDate() + 1);
        }
      }
    });
    return fragmented;
  }

  _isToday(n) { const t = new Date(); return n === t.getDate() && this._referenceDate.getMonth() === t.getMonth() && this._referenceDate.getFullYear() === t.getFullYear(); }

  static get styles() {
    return css`
      :host { --accent: #7b61ff; --bg: #fdfdfd; --card: #fff; --text: #1a1a1b; --border: #eee; }
      .nightlight-hub.dark { --bg: #121212; --card: #1e1e1e; --text: #efefef; --border: #333; }
      .nightlight-hub { display: grid; grid-template-columns: 100px 1fr; height: calc(100vh - 64px); background: var(--bg); color: var(--text); font-family: sans-serif; overflow: hidden; }
      
      .side-rail { background: var(--card); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 30px 0; z-index: 20; }
      .logo-area { color: var(--accent); margin-bottom: 40px; width: 40px; }
      .nav-btn { background: none; border: none; padding: 20px 0; color: #bbb; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; font-weight: bold; width: 100%; }
      .nav-btn svg { width: 28px; }
      .nav-btn.active { color: var(--accent); background: rgba(123, 97, 255, 0.05); border-right: 4px solid var(--accent); }
      
      .main-stage { padding: 30px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; overflow: hidden; }
      .top-bar { flex-shrink: 0; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; }
      .top-bar h1 { font-size: 2.4rem; font-weight: 800; margin: 0; letter-spacing: -1.2px; }
      .clock { font-size: 1.2rem; font-weight: 700; color: #888; }
      .nav-arrows button { background: var(--card); border: 1px solid var(--border); border-radius: 50%; width: 36px; height: 36px; cursor: pointer; color: var(--text); }
      
      .right-actions { display: flex; align-items: center; gap: 20px; }
      .view-switcher { background: rgba(0,0,0,0.05); padding: 4px; border-radius: 12px; display: flex; }
      .view-switcher button { border: none; background: transparent; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 800; color: #666; font-size: 0.75rem; }
      .view-switcher button.active { background: var(--card); color: var(--text); box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
      
      .persona-filters { display: flex; gap: 8px; }
      .persona { width: 40px; height: 40px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; cursor: pointer; overflow: hidden; }
      .persona.inactive { opacity: 0.1; }
      .persona img { width: 100%; height: 100%; object-fit: cover; }
      .today-btn { background: var(--accent); color: #fff; border: none; padding: 10px 20px; border-radius: 12px; font-weight: 800; cursor: pointer; }

      .content-area { flex-grow: 1; height: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .calendar-container { display: flex; flex-direction: column; height: 100%; }
      .week-labels { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; color: #bbb; font-weight: 800; font-size: 0.8rem; padding-bottom: 12px; }
      .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(6, 1fr); gap: 10px; flex-grow: 1; height: 0; }
      .day-cell { background: var(--card); border: 2px solid var(--border); border-radius: 16px; padding: 12px; overflow: hidden; cursor: pointer; }
      .day-cell.today { border-color: var(--accent); border-width: 3px; }
      .day-cell.empty { opacity: 0.1; }
      .day-number { font-weight: 900; font-size: 1.2rem; margin-bottom: 8px; display: block; }
      .ev-pill { margin-top: 3px; padding: 5px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      
      /* v1.0.9: Past Event Dulling */
      .is-past { opacity: 0.35 !important; filter: grayscale(40%); }
      .multi-day-bar { border-left: none !important; border-top: 4px solid currentColor; border-radius: 0; }

      .time-grid-wrapper { display: flex; height: 100%; border: 1px solid var(--border); border-radius: 24px; overflow: hidden; background: var(--card); }
      .time-sidebar { width: 70px; border-right: 1px solid var(--border); background: var(--bg); position: sticky; left: 0; z-index: 10; }
      .time-mark { height: 100px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #888; }
      .all-day-label { height: 60px; font-weight: 900; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; text-transform: uppercase; color: #bbb; }
      
      .grid-scroll-area { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth; }
      .day-column { border-right: 1px solid var(--border); position: relative; display: flex; flex-direction: column; }
      .col-head { height: 60px; display: flex; align-items: center; justify-content: center; font-weight: 800; background: var(--card); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 5; }
      .all-day-header-slot { min-height: 40px; background: rgba(0,0,0,0.02); border-bottom: 1px solid var(--border); padding: 4px; display: flex; flex-direction: column; gap: 2px; }
      .all-day-pill-small { padding: 2px 6px; border-radius: 4px; color: #fff; font-size: 0.65rem; font-weight: 800; white-space: nowrap; overflow: hidden; }
      .hour-container { position: relative; height: 2400px; flex-grow: 1; }
      .hour-box { height: 100px; border-bottom: 1px dotted var(--border); }
      .time-ev { position: absolute; left: 4px; right: 4px; padding: 10px; border-radius: 10px; color: #fff; font-size: 0.9rem; font-weight: 800; cursor: pointer; z-index: 2; }

      /* Day View Floating Bar */
      .day-view-container { height: 100%; display: flex; flex-direction: column; }
      .all-day-floating-bar { display: flex; flex-wrap: wrap; gap: 5px; padding: 10px; background: rgba(0,0,0,0.03); border-bottom: 1px solid var(--border); }
      .all-day-pill-floating { padding: 6px 12px; border-radius: 20px; color: #fff; font-size: 0.8rem; font-weight: 800; }
      .day-timeline-wrapper { flex-grow: 1; overflow-y: auto; display: flex; position: relative; }
      .time-axis { width: 80px; border-right: 1px solid var(--border); }
      .hour-mark { height: 100px; text-align: center; color: #bbb; font-weight: 800; line-height: 100px; }
      .event-stage { flex-grow: 1; position: relative; height: 2400px; }
      .slot-row { height: 100px; border-bottom: 1px solid #f9f9f9; }
      .now-indicator { position: absolute; left: 0; right: 0; height: 3px; background: #ff3b30; z-index: 10; }
      .detailed-ev { position: absolute; left: 10px; right: 10px; padding: 15px; border-radius: 12px; font-weight: 800; cursor: pointer; }

      /* Agenda Enhancements */
      .agenda-view { height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
      .agenda-row { display: flex; gap: 15px; align-items: center; background: var(--card); padding: 12px; border-radius: 16px; border: 1px solid var(--border); cursor: pointer; transition: 0.2s; }
      .agenda-date { display: flex; flex-direction: column; align-items: center; width: 50px; }
      .agenda-date .day { font-size: 1.8rem; font-weight: 900; }
      .agenda-date .mon { font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--accent); }
      .agenda-card { flex-grow: 1; padding-left: 15px; }
      .ag-title { font-size: 1.2rem; font-weight: 800; }
      .ag-sub { color: #888; font-weight: 600; font-size: 0.85rem; }

      .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(10px); }
      .modal-body { background: var(--card); width: 500px; border-radius: 32px; overflow: hidden; }
      .modal-header { padding: 30px; color: #fff; }
      .modal-content { padding: 30px; font-size: 1rem; line-height: 1.6; }
      .close-btn { width: 100%; padding: 20px; border: none; background: var(--accent); color: #fff; font-weight: 900; cursor: pointer; }
    `;
  }
}

class NightlightCardEditor extends LitElement {
  static get properties() { return { hass: {}, _config: {} }; }
  setConfig(config) { this._config = config; }
  _valueChanged(ev) {
    const target = ev.target;
    const newConfig = { ...this._config, [target.configValue]: target.value };
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: newConfig }, bubbles: true, composed: true }));
  }
  render() {
    if (!this.hass || !this._config) return html``;
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
  name: "Nightlight Hub v1.0.9",
  description: "Refined multi-day logic + Past event dulling."
});