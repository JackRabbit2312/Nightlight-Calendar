/**
 * Nightlight Dashboard (v1.1.7)
 * Senior Dev Lead: Rick P. | Melbourne
 * Features: Morning Chore Chart, Synchronized Grids, Multi-View, Event Creation
 * Code Length: 500+ Lines Unabridged
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
      _activeView: { type: String },    // calendar, chores, meals, whiteboard
      _calendarMode: { type: String }, // month, week, day, agenda
      _events: { type: Array },
      _loading: { type: Boolean },
      _referenceDate: { type: Object },
      _selectedEvent: { type: Object },
      _activeCalendars: { type: Array },
      _showAddModal: { type: Boolean },
      _selectedCalendarId: { type: String }
    };
  }

  static getConfigElement() { return document.createElement("nightlight-card-editor"); }
  static getStubConfig() { return { title: "Family Hub", theme: "light", entities: [], chore_start: "06:00", chore_end: "09:00" }; }

  constructor() {
    super();
    this._activeView = 'calendar';
    this._calendarMode = 'month';
    this._referenceDate = new Date();
    this._events = [];
    this._activeCalendars = [];
    this._loading = false;
    this._selectedEvent = null;
    this._showAddModal = false;
    this._selectedCalendarId = '';
    this._lastResetDate = localStorage.getItem('nightlight_reset_date');
  }

  setConfig(config) {
    if (!config.entities && !config.chores) throw new Error("Define entities or chores in YAML.");
    this.config = { 
      title: "Family Hub", 
      theme: "light", 
      chore_start: "06:00", 
      chore_end: "09:00",
      ...config 
    };
    if (this._activeCalendars.length === 0 && config.entities) {
      this._activeCalendars = config.entities.map(e => e.entity);
    }
    // Check for Daily Reset
    this._checkDailyReset();
  }

  // --- Data Management & Lifecycle ---

  updated(changedProps) {
    if (changedProps.has('hass') || changedProps.has('_activeView') || changedProps.has('_calendarMode') || changedProps.has('_referenceDate')) {
      this._refreshData();
    }
  }

  async _checkDailyReset() {
    const today = new Date().toDateString();
    if (this._lastResetDate !== today) {
      const allChoreEntities = this.config.chores?.flatMap(kid => kid.items.map(i => i.entity)) || [];
      if (allChoreEntities.length > 0) {
        await this.hass.callService('input_boolean', 'turn_off', { entity_id: allChoreEntities });
        localStorage.setItem('nightlight_reset_date', today);
        this._lastResetDate = today;
      }
    }
  }

  async _refreshData() {
    if (!this.hass || this._loading) return;
    this._loading = true;
    try {
      if (this._activeView === 'calendar') {
        await this._fetchEvents();
      }
      // Note: Chore states are pulled live via this.hass.states in the render method
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
      // Day view or Agenda
      start.setHours(0,0,0,0);
      end.setHours(23,59,59,999);
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

  // --- Interaction & Command Logic ---

  _navigate(dir) {
    const d = new Date(this._referenceDate);
    if (this._calendarMode === 'month') {
      d.setMonth(d.getMonth() + dir);
    } else if (this._calendarMode === 'week') {
      d.setDate(d.getDate() + (dir * 7));
    } else {
      // v1.1.6 Fix: Single day navigation for Daily view
      d.setDate(d.getDate() + dir);
    }
    this._referenceDate = d;
  }

  _togglePersona(id) {
    this._activeCalendars = this._activeCalendars.includes(id) ? this._activeCalendars.filter(i => i !== id) : [...this._activeCalendars, id];
  }

  _toggleChore(entityId, kidIndex) {
    const currentState = this.hass.states[entityId]?.state || 'off';
    const newState = currentState === 'on' ? 'off' : 'on';
    this.hass.callService('input_boolean', newState === 'on' ? 'turn_on' : 'turn_off', { entity_id: entityId });
    
    // Check for "All Done" helper and medal logic
    const kid = this.config.chores[kidIndex];
    if (kid.all_done_helper) {
       setTimeout(() => {
         const allDone = kid.items.every(i => this.hass.states[i.entity]?.state === 'on');
         this.hass.callService('input_boolean', allDone ? 'turn_on' : 'turn_off', { entity_id: kid.all_done_helper });
       }, 500);
    }
  }

  _handleMonthDayClick(dayNum, evsCount) {
    if (!dayNum) return;
    const newDate = new Date(this._referenceDate);
    newDate.setDate(dayNum);
    this._referenceDate = newDate;
    // Auto-switch to day view if density is high
    if (evsCount > 2) this._calendarMode = 'day';
  }

  async _submitEvent() {
    const summary = this.shadowRoot.getElementById('new_summary').value;
    const date = this.shadowRoot.getElementById('new_date').value;
    const startT = this.shadowRoot.getElementById('new_start').value;
    const endT = this.shadowRoot.getElementById('new_end').value;

    if (!summary || !date || !startT || !endT) return alert("Please fill all fields.");

    try {
      await this.hass.callService('calendar', 'create_event', {
        entity_id: this._selectedCalendarId,
        summary: summary,
        start_date_time: `${date}T${startT}:00`,
        end_date_time: `${date}T${endT}:00`,
      });
      this._showAddModal = false;
      this._refreshData();
    } catch (err) { 
      alert("Error saving event to Home Assistant."); 
    }
  }

  // --- Specialized Utility Logic ---

  _isPast(event) {
    const end = new Date(event.end.dateTime || event.end.date);
    return new Date() > end;
  }

  _sanitize(text) {
    const div = document.createElement('div');
    div.textContent = text || 'No details provided.';
    return div.innerHTML;
  }

  _getTimeStyles(e) {
    const s = new Date(e.start.dateTime);
    const end = new Date(e.end.dateTime);
    // 1.666 pixels per minute for a 100px hour box height
    const top = (s.getHours() * 60 + s.getMinutes()) * 1.666;
    const height = Math.max(((end - s) / 60000) * 1.666, 30);
    return `top:${top}px;height:${height}px`;
  }

  _fragmentEvents(events, startRange = null, endRange = null) {
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

  _isToday(n) { 
    const t = new Date(); 
    return n === t.getDate() && 
           this._referenceDate.getMonth() === t.getMonth() && 
           this._referenceDate.getFullYear() === t.getFullYear(); 
  }

  // --- Rendering engines ---

  render() {
    if (!this.hass) return html``;
    
    const headerTitle = (this._activeView === 'calendar')
        ? this._referenceDate.toLocaleString('default', { month: 'long', year: 'numeric' })
        : this.config.title;

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
            <button class="nav-btn ${this._activeView === 'meals' ? 'active' : ''}" @click="${() => this._activeView = 'meals'}">
               <svg viewBox="0 0 24 24"><path fill="currentColor" d="M11,9H9V2H7V9H5V2H3V9C3,11.12 4.66,12.84 6.75,12.97V22H9.25V12.97C11.34,12.84 13,11.12 13,9V2H11V9M16,6V14H18.5V22H21V2H16C16,3.33 16,4.67 16,6Z"/></svg>
               <span>Dinner</span>
            </button>
            <button class="nav-btn ${this._activeView === 'whiteboard' ? 'active' : ''}" @click="${() => this._activeView = 'whiteboard'}">
               <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>
               <span>Notes</span>
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
                  <button class="${this._calendarMode === m ? 'active' : ''}" @click="${() => { this._calendarMode = m; this._activeView = 'calendar'; }}">${m.toUpperCase()}</button>
                `)}
              </div>
              <button class="today-btn" @click="${() => { this._referenceDate = new Date(); this._activeView = 'calendar'; }}">Today</button>
              <div class="persona-filters">
                ${this.config.entities?.filter(e => e.entity.startsWith('calendar')).map(ent => html`
                  <div class="persona ${this._activeCalendars.includes(ent.entity) ? 'active' : 'inactive'}" 
                       style="background: ${ent.color}" @click="${() => this._togglePersona(ent.entity)}">
                    ${ent.picture ? html`<img src="${ent.picture}">` : ent.entity.split('.')[1][0].toUpperCase()}
                  </div>
                `)}
              </div>
            </div>
          </header>

          <section class="content-area">
            ${this._renderActiveModule()}
          </section>
        </main>

        ${this._selectedEvent ? this._renderModal() : ''}
        ${this._showAddModal ? this._renderAddModal() : ''}
        <button class="fab" @click="${() => this._showAddModal = true}">+</button>
      </div>
    `;
  }

  _renderActiveModule() {
    switch(this._activeView) {
      case 'meals': return this._renderMealPlanner();
      case 'whiteboard': return this._renderWhiteboard();
      case 'chores': return this._renderChoreDashboard();
      default: return this._renderCalendarView();
    }
  }
  
  _renderMealPlanner() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return html`
      <div class="meal-grid-view">
        ${days.map(day => html`
          <div class="meal-card-item">
            <div class="meal-day-label">${day}</div>
            <textarea 
              placeholder="What's for dinner?" 
              .value="${this._getData('meal_' + day)}"
              @input="${(e) => this._saveData('meal_' + day, e.target.value)}"></textarea>
          </div>
        `)}
      </div>`;
  }

  _renderWhiteboard() {
    return html`
      <div class="whiteboard-container">
        <div class="whiteboard-header">Family Notes</div>
        <textarea 
          placeholder="Leave a message for the family..."
          .value="${this._getData('family_notes')}"
          @input="${(e) => this._saveData('family_notes', e.target.value)}"></textarea>
      </div>`;
  }

  _saveData(key, value) {
    localStorage.setItem(`nightlight_${key}`, value);
    this.requestUpdate();
  }

  _getData(key) {
    return localStorage.getItem(`nightlight_${key}`) || '';
  }

  _handleMonthDayClick(dayNum, evsCount) {
    if (!dayNum) return;
    const newDate = new Date(this._referenceDate);
    newDate.setDate(dayNum);
    this._referenceDate = newDate;
    if (evsCount > 2) this._calendarMode = 'day';
  }

  _renderCalendarView() {
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
            const evs = this._events.filter(e => d.cur && new Date(e.start.dateTime || e.start.date).getDate() === d.n && this._activeCalendars.includes(e.origin))
              .sort((a, b) => (a.start.dateTime || a.start.date).localeCompare(b.start.dateTime || b.start.date));
            return html`
              <div class="day-cell ${!d.cur ? 'empty' : ''} ${this._isToday(d.n) ? 'today' : ''}" @click="${() => this._handleMonthDayClick(d.n, evs.length)}">
                <span class="day-num">${d.n || ''}</span>
                <div class="ev-stack">
                  ${evs.slice(0, 4).map(e => html`
                    <div class="ev-pill ${this._isPast(e) ? 'is-past' : ''}" style="border-left: 4px solid ${e.color}; background:${e.color}15; color:${e.color}" @click="${(ev) => { ev.stopPropagation(); this._selectedEvent = e; }}">
                      ${e.summary}
                    </div>`)}
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
    const fragmented = this._fragmentEvents(this._events, start);

    return html`
      <div class="time-grid-root">
        <div class="header-row-locked">
            <div class="axis-placeholder"></div>
            <div class="date-grid" style="--cols: ${daysCount}">
               ${Array.from({length: daysCount}).map((_, i) => {
                  const d = new Date(start); d.setDate(start.getDate() + i);
                  return html`<div class="header-cell">${d.toLocaleDateString('default', {weekday: 'short', day: 'numeric'})}</div>`;
               })}
            </div>
        </div>

        <div class="all-day-sync-row">
            <div class="axis-label-blank">All Day</div>
            <div class="ad-grid" style="--cols: ${daysCount}">
                ${Array.from({length: daysCount}).map((_, i) => {
                    const d = new Date(start); d.setDate(start.getDate() + i);
                    const evs = fragmented.filter(e => this._activeCalendars.includes(e.origin) && e.displayDate === d.toDateString() && (e.isAllDay || e.isFragment));
                    return html`<div class="ad-col">${evs.map(e => html`<div class="ad-pill" style="background:${e.color}">${e.summary}</div>`)}</div>`;
                })}
            </div>
        </div>

        <div class="main-scroll-sync">
            <div class="time-axis-fixed">${hours.map(h => html`<div class="time-mark">${h}:00</div>`)}</div>
            <div class="columns-scroll-sync" style="--cols: ${daysCount}">
              ${Array.from({length: daysCount}).map((_, i) => {
                const d = new Date(start); d.setDate(start.getDate() + i);
                const evs = fragmented.filter(e => this._activeCalendars.includes(e.origin) && e.displayDate === d.toDateString() && !e.isAllDay && !e.isFragment);
                return html`
                  <div class="day-col">
                    <div class="hour-container">
                      ${hours.map(() => html`<div class="hour-box"></div>`)}
                      ${evs.map(e => html`<div class="time-ev ${this._isPast(e) ? 'is-past' : ''}" style="${this._getTimeStyles(e)} background:${e.color}" @click="${() => this._selectedEvent = e}">${e.summary}</div>`)}
                    </div>
                  </div>`;
              })}
            </div>
        </div>
      </div>`;
  }

  _renderAgenda() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fragmented = this._fragmentEvents(this._events);
    const interleaved = fragmented
      .filter(e => this._activeCalendars.includes(e.origin))
      .filter(e => new Date(e.displayDate) >= today) // Force Agenda to start TODAY
      .sort((a, b) => new Date(a.displayDate) - new Date(b.displayDate) || 
                      new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));

    return html`
      <div class="agenda-view">
        ${interleaved.map(e => {
          const isPastFragment = new Date(e.displayDate) < today;
          return html`
            <div class="agenda-row ${isPastFragment ? 'is-past' : ''}" @click="${() => this._selectedEvent = e}">
              <div class="agenda-date">
                <span class="day">${new Date(e.displayDate).getDate()}</span>
                <span class="mon">${new Date(e.displayDate).toLocaleString('default', {month:'short'})}</span>
              </div>
              <div class="agenda-card" style="border-left: 6px solid ${e.color}">
                <div class="ag-title">${e.summary}</div>
                <div class="ag-meta">${e.friendly_name} • ${e.isAllDay ? 'All Day' : new Date(e.start.dateTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
              </div>
            </div>`;
        })}
      </div>`;
  }

  _renderChoreDashboard() {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    if (timeStr < this.config.chore_start || timeStr > this.config.chore_end) {
      return html`<div class="chore-lock-msg">Chore tracking is only active between ${this.config.chore_start} and ${this.config.chore_end}.</div>`;
    }
    if (!this.config.chores) return html`<div>No chores configured. Add 'chores' to your YAML.</div>`;

    return html`
      <div class="chore-grid-locked">
        ${this.config.chores.map((kid, kIndex) => {
          const allDone = kid.items.every(i => this.hass.states[i.entity]?.state === 'on');
          return html`
            <div class="kid-chore-card">
               <div class="kid-banner" style="background-image: url('${kid.image}')">
                  <h3>${kid.name}</h3>
                  ${allDone ? html`<ha-icon class="medal" icon="mdi:medal"></ha-icon>` : ''}
               </div>
               <div class="kid-list">
                  ${kid.items.map(item => {
                    const state = this.hass.states[item.entity]?.state || 'off';
                    return html`
                      <div class="kid-item ${state === 'on' ? 'done' : ''}" @click="${() => this._toggleChore(item.entity, kIndex)}">
                         <ha-icon icon="${state === 'on' ? 'mdi:check-circle' : 'mdi:circle-outline'}"></ha-icon>
                         <span>${item.label}</span>
                      </div>`;
                  })}
               </div>
            </div>`;
        })}
      </div>`;
  }

  _renderModal() {
    return html`
      <div class="modal-backdrop" @click="${() => this._selectedEvent = null}">
        <div class="modal-body" @click="${e => e.stopPropagation()}">
          <div class="modal-header" style="background: ${this._selectedEvent.color}"><h2>${this._selectedEvent.summary}</h2></div>
          <div class="modal-content">
            <p><strong>Time:</strong> ${new Date(this._selectedEvent.start.dateTime || this._selectedEvent.start.date).toLocaleString()}</p>
            <p><strong>Calendar:</strong> ${this._selectedEvent.friendly_name}</p>
            <hr><div .innerHTML="${this._sanitize(this._selectedEvent.description)}"></div>
          </div>
          <button class="close-btn" @click="${() => this._selectedEvent = null}">Close</button>
        </div>
      </div>`;
  }

  _renderAddModal() {
    return html`
      <div class="modal-backdrop" @click="${() => this._showAddModal = false}">
        <div class="modal-body creation" @click="${e => e.stopPropagation()}">
          <div class="modal-header" style="background: var(--accent)"><h2>New Family Event</h2></div>
          <div class="modal-content">
            <div class="form-grid">
              <input id="new_summary" type="text" placeholder="Summary" class="full-width">
              <input id="new_date" type="date" value="${new Date().toISOString().split('T')[0]}" class="full-width">
              <div class="input-group"><label>Start</label><input id="new_start" type="time" value="10:00"></div>
              <div class="input-group"><label>End</label><input id="new_end" type="time" value="11:00"></div>
              <div class="input-group full-width">
                <label>Calendar Target</label>
                <select @change="${e => this._selectedCalendarId = e.target.value}">
                  ${this.config.entities.filter(e => e.entity.startsWith('calendar')).map(ent => html`<option value="${ent.entity}">${ent.entity}</option>`)}
                </select>
              </div>
            </div>
          </div>
          <div class="modal-actions">
             <button class="btn-cancel" @click="${() => this._showAddModal = false}">Cancel</button>
             <button class="btn-save" @click="${this._submitEvent}">Create</button>
          </div>
        </div>
      </div>`;
  }

  static get styles() {
    return styles;
  }
}

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
    this.dispatchEvent(new CustomEvent("config-changed", { 
      detail: { config: newConfig }, 
      bubbles: true, 
      composed: true 
    }));
  }

  _entitiesChanged(ev) {
    const newEntityList = ev.detail.value;
    const current = this._config.entities || [];
    
    // Step 8: Allows full Add/Edit/Delete persona management
    const entities = newEntityList.map(entId => {
      const existing = current.find(e => e.entity === entId);
      return existing ? { ...existing } : { entity: entId, color: '#7b61ff', picture: '' };
    });
    
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { ...this._config, entities } }, bubbles: true, composed: true }));
  }

  _entityPropertyChanged(idx, prop, value) {
    const entities = JSON.parse(JSON.stringify(this._config.entities || []));
    if (!entities[idx]) return;
    entities[idx][prop] = value; // Step 5: Handles the color wheel selection
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { ...this._config, entities } }, bubbles: true, composed: true }));
  }

  _moveEntity(idx, direction) {
    const entities = [...(this._config.entities || [])];
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= entities.length) return;
    [entities[idx], entities[newIdx]] = [entities[newIdx], entities[idx]];
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { ...this._config, entities } }, bubbles: true, composed: true }));
  }

  // --- v1.2.8 Advanced Chores Visual Logic ---
  _addKid() {
    const chores = [...(this._config.chores || [])];
    chores.push({ name: "New Child", image: "", all_done_helper: "", items: [] });
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { ...this._config, chores } }, bubbles: true, composed: true }));
  }

  _removeKid(idx) {
    const chores = [...(this._config.chores || [])];
    chores.splice(idx, 1);
    this._updateConfig({ chores });
  }

  _kidPropertyChanged(idx, prop, value) {
    const chores = JSON.parse(JSON.stringify(this._config.chores || []));
    chores[idx][prop] = value;
    this._updateConfig({ chores });
  }

  _addChoreItem(kidIdx) {
    const chores = JSON.parse(JSON.stringify(this._config.chores || []));
    chores[kidIdx].items.push({ 
      entity: "", 
      label: "New Task", 
      time: "07:00" // Default time association (Step 2)
    });
    this._updateConfig({ chores });
  }

  _removeChoreItem(kidIdx, itemIdx) {
    const chores = JSON.parse(JSON.stringify(this._config.chores || []));
    chores[kidIdx].items.splice(itemIdx, 1);
    this._updateConfig({ chores });
  }

  _choreItemChanged(kidIdx, itemIdx, prop, value) {
    const chores = JSON.parse(JSON.stringify(this._config.chores || []));
    chores[kidIdx].items[itemIdx][prop] = value;
    this._updateConfig({ chores });
  }
  
  _updateConfig(changes) {
    this.dispatchEvent(new CustomEvent("config-changed", { 
      detail: { config: { ...this._config, ...changes } }, 
      bubbles: true, 
      composed: true 
    }));
  }

  render() {
    if (!this.hass || !this._config) return html``;
    return html`
      <div class="editor-shell">
        <ha-expansion-panel header="Hub Branding" outlined expanded>
          <ha-textfield label="Hub Title" .value="${this._config.title}" .configValue="${'title'}" @input="${this._valueChanged}"></ha-textfield>
          <ha-select label="Theme" .value="${this._config.theme}" .configValue="${'theme'}" @selected="${this._valueChanged}">
              <mwc-list-item value="light">Skylight Light</mwc-list-item>
              <mwc-list-item value="dark">Nightlight Dark</mwc-list-item>
          </ha-select>
        </ha-expansion-panel>

        <ha-expansion-panel header="Advanced Chore Management" outlined>
          <!-- Step 1: Global Times moved above child profiles -->
          <div class="time-block-config">
            <ha-textfield label="Daily Start (e.g. 06:00)" .value="${this._config.chore_start}" .configValue="${'chore_start'}" @input="${this._valueChanged}"></ha-textfield>
            <ha-textfield label="Daily End (e.g. 09:00)" .value="${this._config.chore_end}" .configValue="${'chore_end'}" @input="${this._valueChanged}"></ha-textfield>
          </div>
          
          <div class="kid-manager">
            ${this._config.chores?.map((kid, kIdx) => html`
              <div class="kid-config-card">
                <div class="kid-header">
                  <ha-textfield label="Child Name" .value="${kid.name}" @input="${(e) => this._kidPropertyChanged(kIdx, 'name', e.target.value)}"></ha-textfield>
                  <ha-icon-button icon="mdi:delete-outline" @click="${() => this._removeKid(kIdx)}"></ha-icon-button>
                </div>
                <!-- Step 3: Image field blank if undefined -->
                <ha-textfield label="Banner Image URL" .value="${kid.image || ''}" @input="${(e) => this._kidPropertyChanged(kIdx, 'image', e.target.value)}"></ha-textfield>
                
                <div class="task-list">
                  <strong>Morning Routine Tasks:</strong>
                  ${kid.items?.map((item, iIdx) => html`
                    <div class="task-entry">
                      <div class="task-main">
                        <ha-textfield label="Label" .value="${item.label}" @input="${(e) => this._choreItemChanged(kIdx, iIdx, 'label', e.target.value)}"></ha-textfield>
                        <!-- Step 2: Time associated with chore -->
                        <ha-textfield label="Time" type="time" .value="${item.time || '07:00'}" @input="${(e) => this._choreItemChanged(kIdx, iIdx, 'time', e.target.value)}"></ha-textfield>
                      </div>
                      <!-- Step 6: Entity Autocomplete Picker -->
                      <ha-entity-picker
                        .hass="${this.hass}"
                        label="Chore Boolean Entity"
                        .value="${item.entity}"
                        .includeDomains="${['input_boolean', 'switch']}"
                        @value-changed="${(e) => this._choreItemChanged(kIdx, iIdx, 'entity', e.detail.value)}">
                      </ha-entity-picker>
                      <!-- Step 7: Bin icon to delete line -->
                      <ha-icon-button class="del-task" icon="mdi:close-circle-outline" @click="${() => this._removeChoreItem(kIdx, iIdx)}"></ha-icon-button>
                    </div>
                  `)}
                  <mwc-button @click="${() => this._addChoreItem(kIdx)}">+ ADD TASK</mwc-button>
                </div>
              </div>`)}
            <!-- Step 4: Real Button for Add Child -->
            <mwc-button raised style="width:100%; margin-top:15px;" @click="${this._addKid}">+ ADD CHILD PROFILE</mwc-button>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel header="Persona & Calendar Styling" outlined>
          <ha-entities-picker .hass="${this.hass}" .includeDomains="${['calendar']}" .value="${this._config.entities?.map(e => e.entity) || []}" @value-changed="${this._entitiesChanged}"></ha-entities-picker>
          <div class="persona-list">
            ${this._config.entities?.map((ent, idx) => html`
              <div class="persona-row">
                <div class="persona-info"><strong>${ent.entity}</strong></div>
                <div class="persona-controls">
                  <!-- Step 5: Color wheel selector -->
                  <input type="color" .value="${ent.color || '#7b61ff'}" @input="${(e) => this._entityPropertyChanged(idx, 'color', e.target.value)}">
                  <ha-textfield label="Avatar URL" .value="${ent.picture || ''}" @input="${(e) => this._entityPropertyChanged(idx, 'picture', e.target.value)}"></ha-textfield>
                </div>
              </div>`)}
          </div>
        </ha-expansion-panel>
      </div>`;
  }

  static get styles() {
    return styles;
  }
}

customElements.define("nightlight-calendar-card", NightlightDashboard);
customElements.define("nightlight-card-editor", NightlightCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "nightlight-calendar-card",
  name: "Nightlight Hub v1.3.1",
  description: "Add-on Architecture Alpha: Multi-file setup with Advanced Chores GUI."

});

