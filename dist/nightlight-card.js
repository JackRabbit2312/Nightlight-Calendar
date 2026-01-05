/**
 * Nightlight Dashboard (v0.3.3)
 * Author: Rick P. | Melbourne Branch
 * Feature: Advanced Visual Editor & Entity Personas
 */

import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

// --- MAIN DASHBOARD CLASS ---
class NightlightDashboard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _activeView: { type: String },
      _events: { type: Array },
      _chores: { type: Array },
      _loading: { type: Boolean },
      _referenceDate: { type: Object },
      _showAddModal: { type: Boolean }
    };
  }

  static getConfigElement() { return document.createElement("nightlight-card-editor"); }
  static getStubConfig() { return { title: "Nightlight Hub", theme: "light", entities: [] }; }

  constructor() {
    super();
    this._activeView = 'calendar';
    this._referenceDate = new Date();
    this._events = [];
    this._chores = [];
    this._showAddModal = false;
  }

  setConfig(config) {
    this.config = {
      title: "Family Hub",
      theme: "light",
      ...config
    };
  }

  updated(changedProps) {
    if (changedProps.has('hass') || changedProps.has('_activeView')) {
      this._refreshData();
    }
  }

  async _refreshData() {
    if (!this.hass) return;
    this._loading = true;
    try {
      if (this._activeView === 'calendar') await this._fetchEvents();
      if (this._activeView === 'chores') await this._fetchChores();
    } finally {
      this._loading = false;
    }
  }

  async _fetchEvents() {
    const start = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth(), 1).toISOString();
    const end = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth() + 1, 0).toISOString();
    const promises = this.config.entities.filter(e => e.entity.startsWith('calendar')).map(ent => {
      return this.hass.callApi('GET', `calendars/${ent.entity}?start=${start}&end=${end}`)
        .then(evs => evs.map(e => ({ ...e, color: ent.color, origin: ent.entity })));
    });
    const results = await Promise.all(promises);
    this._events = results.flat();
  }

  render() {
    if (!this.hass) return html``;

    return html`
      <div class="nightlight-hub ${this.config.theme || 'light'}">
        <nav class="side-rail">
          <div class="logo">N</div>
          <div class="nav-items">
            <button class="nav-btn ${this._activeView === 'calendar' ? 'active' : ''}" @click="${() => this._activeView = 'calendar'}">
                <ha-icon icon="mdi:calendar-month"></ha-icon>
                <span>Calendar</span>
            </button>
            <button class="nav-btn ${this._activeView === 'chores' ? 'active' : ''}" @click="${() => this._activeView = 'chores'}">
                <ha-icon icon="mdi:checkbox-marked-circle-outline"></ha-icon>
                <span>Chores</span>
            </button>
          </div>
        </nav>

        <main class="main-stage">
          <header class="top-bar">
            <div class="info">
                <h1>${this._activeView === 'calendar' ? this.config.title : 'Chore Tracker'}</h1>
                <div class="sub-header">
                  <span class="clock">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  <div class="meal-plan" @click="${() => this._activeView = 'chores'}">
                    <ha-icon icon="mdi:silverware-fork-knife"></ha-icon>
                    <span>Dinner: ${this.hass.states[this.config.meal_entity]?.state || 'Plan a meal'}</span>
                  </div>
                </div>
            </div>
            
            <div class="nav-actions">
                <button class="today-btn" @click="${() => this._referenceDate = new Date()}">Today</button>
                <div class="profile-strip">
                    ${this.config.entities.slice(0, 5).map(ent => html`
                        <div class="persona-circle" style="background: ${ent.color || '#eee'}">
                            ${ent.picture ? html`<img src="${ent.picture}">` : 
                              (ent.icon ? html`<ha-icon icon="${ent.icon}"></ha-icon>` : ent.entity.split('.')[1][0].toUpperCase())}
                        </div>
                    `)}
                </div>
            </div>
          </header>

          <section class="content">
            ${this._activeView === 'calendar' ? this._renderCalendar() : html`<div>Chores View</div>`}
          </section>
        </main>

        <button class="fab" @click="${() => this._showAddModal = true}">+</button>
      </div>
    `;
  }

// --- v0.3.4 CALENDAR ENGINE ---
  _renderCalendar() {
    const start = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth(), 1);
    const end = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth() + 1, 0);
    
    // Calculate leading days for Monday start
    const firstDay = (start.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push({ n: null, current: false });
    for (let i = 1; i <= end.getDate(); i++) days.push({ n: i, current: true });

    return html`
      <div class="calendar-container">
        <div class="week-labels">
          ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => html`<div>${d}</div>`)}
        </div>
        <div class="month-grid">
          ${days.map(d => {
            const dayEvents = this._events.filter(e => {
              const date = new Date(e.start.dateTime || e.start.date);
              return d.current && date.getDate() === d.n;
            }).sort((a, b) => (a.start.dateTime || a.start.date).localeCompare(b.start.dateTime || b.start.date));

            return html`
              <div class="day-cell ${!d.current ? 'empty' : ''} ${this._isToday(d.n) ? 'today' : ''}">
                <div class="cell-header">
                   <span class="day-number">${d.n}</span>
                </div>
                <div class="event-stack">
                  ${dayEvents.slice(0, 4).map(e => this._renderEventPill(e))}
                  ${dayEvents.length > 4 ? html`<div class="more-indicator">+${dayEvents.length - 4} more</div>` : ''}
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }
  
  _renderDayView() {
    const dayDate = new Date(this._referenceDate);
    const dayString = dayDate.toDateString();
    
    // Use the fragmentation engine from v0.3.6
    const displayEvents = this._fragmentEvents(this._events, dayDate, dayDate);
    
    const allDayEvs = displayEvents.filter(e => e.isAllDay && (new Date(e.start.date || e.start.dateTime).toDateString() === dayString || e.displayDate === dayString));
    const timedEvs = displayEvents.filter(e => !e.isAllDay && new Date(e.start.dateTime).toDateString() === dayString);

    const now = new Date();
    const isToday = dayString === now.toDateString();
    const nowPosition = ((now.getHours() * 60 + now.getMinutes()) / 14.4);

    return html`
      <div class="day-view-container">
        <div class="day-all-day-strip">
          ${allDayEvs.map(e => html`
            <div class="all-day-block" style="background: ${e.color}">
              <ha-icon icon="mdi:calendar-check"></ha-icon>
              <span>${e.summary}</span>
            </div>
          `)}
        </div>

        <div class="day-timeline-wrapper">
          <div class="time-axis">
            ${Array.from({length: 24}, (_, i) => html`<div class="hour-mark">${i}:00</div>`)}
          </div>
          <div class="event-stage">
            ${isToday ? html`<div class="now-indicator" style="top: ${nowPosition}%"></div>` : ''}
            ${Array.from({length: 24}).map(() => html`<div class="slot-row"></div>`)}
            
            ${timedEvs.map(e => {
              const ent = this.config.entities.find(ent => ent.entity === e.origin);
              return html`
                <div class="detailed-ev" style="${this._getTimeStyles(e)} border-left: 8px solid ${e.color}; background: ${e.color}15" @click="${() => this._selectedEvent = e}">
                  <div class="ev-header">
                    <span class="ev-time-range">
                       ${new Date(e.start.dateTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - 
                       ${new Date(e.end.dateTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                    </span>
                    ${ent?.picture ? html`<img class="persona-mini" src="${ent.picture}">` : ''}
                  </div>
                  <div class="ev-body">
                    <div class="ev-summary-large">${e.summary}</div>
                    <div class="ev-desc-preview">${this._sanitize(e.description || e.location || '')}</div>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>
      </div>
    `;
  }

  _renderEventPill(e) {
    const isAllDay = !e.start.dateTime;
    const time = isAllDay ? '' : new Date(e.start.dateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Find the entity config to get the icon/picture
    const entConfig = this.config.entities.find(ent => ent.entity === e.origin);

    return html`
      <div class="ev-pill" style="background: ${e.color}15; border-left: 4px solid ${e.color}; color: ${e.color}" @click="${() => this._selectedEvent = e}">
        <div class="ev-content">
          ${entConfig?.picture ? html`<img class="ev-avatar" src="${entConfig.picture}">` : ''}
          <span class="ev-summary">${e.summary}</span>
        </div>
        ${time ? html`<span class="ev-time">${time}</span>` : ''}
      </div>
    `;
  }

  // --- v0.3.4 CHORE ENGINE ---
  _renderChores() {
    const active = this._chores.filter(c => c.status !== 'completed');
    const completed = this._chores.filter(c => c.status === 'completed');

    return html`
      <div class="chores-grid">
        <div class="chore-col">
          <h2 class="col-title">To Do <span class="badge">${active.length}</span></h2>
          <div class="chore-list">
            ${active.map(item => this._renderChoreRow(item))}
          </div>
        </div>
        <div class="chore-col">
          <h2 class="col-title">Completed</h2>
          <div class="chore-list done">
            ${completed.map(item => this._renderChoreRow(item))}
          </div>
        </div>
      </div>
    `;
  }

  _renderChoreRow(item) {
    const isDone = item.status === 'completed';
    return html`
      <div class="chore-row ${isDone ? 'is-done' : ''}" @click="${() => this._toggleChore(item)}">
        <div class="check-btn" style="border-color: ${item.color}; background: ${isDone ? item.color : 'transparent'}">
          ${isDone ? html`✓` : ''}
        </div>
        <div class="chore-text">
          <div class="chore-main">${item.summary}</div>
          <div class="chore-sub">${item.list_id.split('.')[1].replace('_', ' ')}</div>
        </div>
      </div>
    `;
  }

  _isToday(n) {
    const today = new Date();
    return n === today.getDate() && 
           this._referenceDate.getMonth() === today.getMonth() && 
           this._referenceDate.getFullYear() === today.getFullYear();
  }
  
  _fragmentEvents(events, startRange, endRange) {
    const fragmented = [];
    events.forEach(event => {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);

      // Check if event spans more than one day
      if (start.toDateString() === end.toDateString()) {
        fragmented.push(event);
      } else {
        let current = new Date(start);
        while (current <= end && current <= endRange) {
          if (current >= startRange) {
            fragmented.push({
              ...event,
              isFragment: true,
              displayDate: new Date(current).toDateString(),
              // Force all-day behavior for fragments
              isAllDay: true 
            });
          }
          current.setDate(current.getDate() + 1);
        }
      }
    });
    return fragmented;
  }
  
  _renderTimeGrid(daysCount) {
    const start = new Date(this._referenceDate);
    if (daysCount === 7) {
      const day = start.getDay();
      start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
    }
    
    // Get Fragmented Events for the visible week
    const endRange = new Date(start);
    endRange.setDate(start.getDate() + daysCount);
    const displayEvents = this._fragmentEvents(this._events, start, endRange);

    return html`
      <div class="time-grid-wrapper">
        <div class="time-sidebar">
          <div class="all-day-label">All Day</div>
          ${Array.from({length: 24}, (_, i) => html`<div class="time-mark">${i}:00</div>`)}
        </div>
        <div class="grid-scroll-area" style="--cols: ${daysCount}">
          ${Array.from({length: daysCount}).map((_, i) => {
            const dayDate = new Date(start);
            dayDate.setDate(start.getDate() + i);
            const dayString = dayDate.toDateString();
            
            const allDayEvs = displayEvents.filter(e => e.isAllDay && (new Date(e.start.date || e.start.dateTime).toDateString() === dayString || e.displayDate === dayString));
            const timedEvs = displayEvents.filter(e => !e.isAllDay && new Date(e.start.dateTime).toDateString() === dayString);

            return html`
              <div class="day-column">
                <div class="col-head">${dayDate.toLocaleDateString('default', {weekday: 'short', day: 'numeric'})}</div>
                <div class="all-day-slot">
                  ${allDayEvs.map(e => html`
                    <div class="all-day-pill" style="background: ${e.color}">${e.summary}</div>
                  `)}
                </div>
                <div class="hour-container">
                  ${Array.from({length: 24}).map(() => html`<div class="hour-box"></div>`)}
                  ${timedEvs.map(e => html`
                    <div class="time-ev" style="${this._getTimeStyles(e)} background: ${e.color}CC">
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

  static get styles() {
    return css`
      :host { --accent: #7b61ff; }
      .nightlight-hub.light { --bg: #fdfdfd; --card: #fff; --text: #1a1a1b; --border: #eee; }
      .nightlight-hub.dark { --bg: #121212; --card: #1e1e1e; --text: #efefef; --border: #333; }
      
      .nightlight-hub { display: grid; grid-template-columns: 120px 1fr; height: 100vh; background: var(--bg); color: var(--text); font-family: sans-serif; }
      .side-rail { background: var(--card); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 40px 0; }
      
      .nav-btn { background: none; border: none; padding: 20px 0; color: #888; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; font-weight: bold; width: 100%; }
      .nav-btn.active { color: var(--accent); border-right: 4px solid var(--accent); background: rgba(123, 97, 255, 0.05); }

      .main-stage { padding: 40px; }
      .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
      .clock { font-size: 1.2rem; color: #888; }
      
      .profile-strip { display: flex; gap: 10px; }
      .persona-circle { width: 45px; height: 45px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; border: 2px solid var(--card); }
      .persona-circle img { width: 100%; height: 100%; object-fit: cover; }
      
      /* v0.3.4 Calendar Styles */
      .calendar-container { display: flex; flex-direction: column; height: 100%; }
      .week-labels { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-weight: 800; color: #bbb; padding-bottom: 15px; text-transform: uppercase; font-size: 0.8rem; }
      .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; flex-grow: 1; }
      .day-cell { background: var(--card); border: 2px solid var(--border); border-radius: 20px; padding: 12px; min-height: 140px; position: relative; }
      .day-cell.today { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
      .day-cell.empty { opacity: 0.3; border-style: dashed; }
      .day-number { font-weight: 900; font-size: 1.2rem; margin-bottom: 8px; display: block; }
      
      .event-stack { display: flex; flex-direction: column; gap: 6px; }
      .ev-pill { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-radius: 8px; cursor: pointer; transition: 0.2s; }
      .ev-pill:active { transform: scale(0.97); }
      .ev-content { display: flex; align-items: center; gap: 6px; overflow: hidden; }
      .ev-avatar { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; }
      .ev-summary { font-size: 0.8rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ev-time { font-size: 0.65rem; font-weight: 800; opacity: 0.7; }
      .more-indicator { font-size: 0.7rem; font-weight: 800; color: #999; padding-left: 5px; }

      /* v0.3.4 Chore Styles */
      .chores-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
      .col-title { font-size: 1rem; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 25px; display: flex; align-items: center; gap: 10px; }
      .badge { background: #eee; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; color: #666; }
      .chore-row { display: flex; align-items: center; gap: 20px; background: var(--card); padding: 20px; border-radius: 20px; margin-bottom: 12px; border: 2px solid var(--border); cursor: pointer; transition: 0.2s; }
      .check-btn { width: 28px; height: 28px; border: 3px solid #eee; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; }
      .chore-main { font-size: 1.2rem; font-weight: 700; }
      .chore-sub { font-size: 0.75rem; color: #aaa; text-transform: uppercase; font-weight: 800; }
      .chore-row.is-done { opacity: 0.5; }
      .chore-row.is-done .chore-main { text-decoration: line-through; }
      
      .sub-header { display: flex; align-items: center; gap: 30px; margin-top: 5px; }
      .meal-plan { 
        display: flex; align-items: center; gap: 10px; background: #fff2e6; 
        color: #ff9500; padding: 8px 20px; border-radius: 12px; 
        font-weight: 800; font-size: 0.9rem; cursor: pointer; border: 1px solid #ffe0cc;
      }
      .meal-plan ha-icon { --mdc-icon-size: 20px; }
      
      .nav-actions { display: flex; align-items: center; gap: 25px; }
      .today-btn { 
        background: var(--accent); color: #fff; border: none; 
        padding: 10px 20px; border-radius: 12px; font-weight: 800; 
        cursor: pointer; transition: 0.2s; 
      }
      .today-btn:active { transform: scale(0.95); }
      
      .time-grid-wrapper { display: flex; height: 75vh; border-radius: 24px; overflow: hidden; border: 1px solid var(--border); }
      .grid-scroll-area { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; overflow-y: auto; }
      
      .all-day-label { height: 80px; font-size: 0.7rem; font-weight: 800; color: #bbb; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--border); }
      .all-day-slot { min-height: 80px; background: #fcfcfc; border-bottom: 2px solid var(--border); padding: 5px; display: flex; flex-direction: column; gap: 4px; }
      .all-day-pill { padding: 4px 10px; border-radius: 6px; color: #fff; font-size: 0.7rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      
      .hour-container { position: relative; height: 1440px; }
      .day-column { border-right: 1px solid var(--border); }
      
      .day-view-container { display: flex; flex-direction: column; height: 78vh; gap: 10px; }
      .day-all-day-strip { display: flex; flex-wrap: wrap; gap: 10px; padding: 10px 0; border-bottom: 2px solid var(--border); }
      .all-day-block { padding: 12px 20px; border-radius: 14px; color: #fff; font-weight: 800; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
      
      .day-timeline-wrapper { display: flex; flex-grow: 1; overflow-y: auto; background: var(--card); border-radius: 24px; position: relative; }
      .time-axis { width: 80px; padding-top: 40px; border-right: 1px solid var(--border); flex-shrink: 0; }
      .hour-mark { height: 80px; text-align: center; color: #bbb; font-weight: 800; font-size: 0.8rem; }
      
      .event-stage { flex-grow: 1; position: relative; height: 1920px; } /* Scaled for detail */
      .slot-row { height: 80px; border-bottom: 1px solid #f9f9f9; }
      
      .now-indicator { position: absolute; left: 0; right: 0; height: 3px; background: #ff3b30; z-index: 50; }
      .now-indicator::before { content: ''; position: absolute; left: -5px; top: -4px; width: 10px; height: 10px; border-radius: 50%; background: #ff3b30; }

      .detailed-ev { position: absolute; left: 15px; right: 15px; border-radius: 16px; padding: 20px; cursor: pointer; display: flex; flex-direction: column; gap: 10px; transition: 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
      .detailed-ev:active { transform: scale(0.99); }
      
      .ev-header { display: flex; justify-content: space-between; align-items: center; }
      .ev-time-range { font-weight: 800; color: #888; font-size: 0.9rem; }
      .persona-mini { width: 30px; height: 30px; border-radius: 50%; border: 2px solid #fff; }
      
      .ev-summary-large { font-size: 1.6rem; font-weight: 900; color: var(--text); }
      .ev-desc-preview { font-size: 1rem; color: #666; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%; }
      
      .fab { position: fixed; bottom: 30px; right: 30px; width: 70px; height: 70px; border-radius: 50%; background: var(--accent); color: #fff; border: none; font-size: 2.5rem; cursor: pointer; box-shadow: 0 10px 20px rgba(123, 97, 255, 0.3); }
    `;
  }
}

// --- VISUAL EDITOR ENGINE ---
class NightlightCardEditor extends LitElement {
  static get properties() { return { hass: {}, _config: {} }; }

  setConfig(config) { this._config = config; }

  _valueChanged(ev) {
    if (!this._config || !this.hass) return;
    const target = ev.target;
    const value = target.value;
    const field = target.configValue;

    if (this._config[field] === value) return;

    const newConfig = { ...this._config, [field]: value };
    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
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

        <div class="entity-section">
            <h3>Entities & Personas</h3>
            <p>Edit colors, icons, and pictures in YAML for precise mapping. Visual entity picker coming soon.</p>
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      .schema-editor { display: flex; flex-direction: column; gap: 15px; padding: 10px; }
      ha-textfield, ha-select { width: 100%; }
      h3 { margin-bottom: 5px; }
      p { color: #888; font-size: 0.9rem; }
    `;
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