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
  
  }

  // --- Data Management & Lifecycle ---

  updated(changedProps) {
    if (changedProps.has('hass')) {
    this._checkDailyReset(); // Only runs when hass is available
  }
    if (changedProps.has('hass') || changedProps.has('_activeView') || changedProps.has('_calendarMode') || changedProps.has('_referenceDate')) {
      this._refreshData();
    }
  }

  async _checkDailyReset() {
    if (!this.hass || !this.config.chores) return; // Guard added
    const today = new Date().toDateString();
    if (this._lastResetDate !== today) {
      const allChoreEntities = this.config.chores?.flatMap(kid => kid.items.map(i => i.entity)) || [];
      // Only call if there are actually entities to turn off
      const validEntities = allChoreEntities.filter(ent => ent && this.hass.states[ent]);
      if (validEntities.length > 0) {
        await this.hass.callService('input_boolean', 'turn_off', { entity_id: validEntities });
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

    // Replace your startStr/endStr lines with these:
    const startStr = start.toISOString().replace(/\.\d+Z$/, "Z");
    const endStr = end.toISOString().replace(/\.\d+Z$/, "Z");

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
    const root = this.shadowRoot;
    const summary = root.getElementById('new_summary').value;
    const date = root.getElementById('new_date').value;
    const startT = root.getElementById('new_start').value;
    const endT = root.getElementById('new_end').value;
    const calendar = root.getElementById('new_calendar').value;

    if (!summary || !date || !calendar) return;

    try {
      await this.hass.callService('calendar', 'create_event', {
        entity_id: calendar,
        summary: summary,
        start_date_time: `${date}T${startT}:00`,
        end_date_time: `${date}T${endT}:00`,
      });
      this._showAddModal = false;
      this._refreshData();
    } catch (e) { console.error(e); }
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
        <button class="fab" @click="${() => { this._showAddModal = true; this.requestUpdate(); }}">+</button>
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
              <ha-textfield id="new_summary" label="Event Title" class="full-width"></ha-textfield>
              <ha-textfield id="new_date" type="date" label="Date" .value="${new Date().toISOString().split('T')[0]}" class="full-width"></ha-textfield>
              <div class="side-by-side">
                <ha-textfield id="new_start" type="time" label="Start" .value="09:00"></ha-textfield>
                <ha-textfield id="new_end" type="time" label="End" .value="10:00"></ha-textfield>
              </div>
              <ha-select id="new_calendar" label="Target Calendar" class="full-width">
                ${(this.config.entities || []).map(ent => html`<mwc-list-item value="${ent.entity}">${ent.entity}</mwc-list-item>`)}
              </ha-select>
            </div>
          </div>
          <div class="modal-actions">
             <mwc-button @click="${() => { this._showAddModal = false; this.requestUpdate(); }}">Cancel</mwc-button>
             <mwc-button raised @click="${this._submitEvent}">Create Event</mwc-button>
          </div>
        </div>
      </div>`;
  }

  static get styles() {
    return css`
      :host {  --accent: #7b61ff;  --bg: var(--primary-background-color);  --card: var(--card-background-color);  --text: var(--primary-text-color);  --secondary-text: var(--secondary-text-color); --border: var(--divider-color); --gold: #ffd700; }
      .nightlight-hub.dark { --bg: #121212; --card: #1e1e1e; --text: #efefef; --border: #333; }
      .nightlight-hub { display: grid; grid-template-columns: 100px 1fr; height: calc(100vh - 100px); background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow: hidden; border-radius: 20px; margin: 10px; }
      .nightlight-hub.dark .modal-body {background: var(--card);color: var(--text);}
      .nightlight-hub.dark ha-textfield, 
      .nightlight-hub.dark ha-select {--mdc-theme-text-primary-on-background: var(--text);}
    
      .logo-area { color: var(--accent); margin-bottom: 40px; width: 35px; }
      .side-rail { background: var(--card); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 30px 0; z-index: 20; }
      .nav-btn { background: none; border: none; padding: 25px 0; color: #bbb; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; font-weight: bold; width: 100%; }
      .nav-btn.active { color: var(--accent); border-right: 4px solid var(--accent); background: rgba(123, 97, 255, 0.05); }
      .nav-btn svg { width: 26px; }
      
      .main-stage { padding: 30px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; overflow: hidden; }
      .top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; flex-shrink: 0; }
      .top-bar h1 { font-size: 2.4rem; font-weight: 800; margin: 0; letter-spacing: -1.2px; white-space: nowrap; }
      .meta-row { display: flex; align-items: center; gap: 20px; margin-top: 10px; }
      .clock { font-size: 1.2rem; font-weight: 700; color: #888; }
      .nav-arrows button { background: var(--card); border: 1px solid var(--border); border-radius: 50%; width: 36px; height: 36px; cursor: pointer; color: var(--text); }
      
      .right-actions { display: flex; align-items: center; gap: 20px; }
      .view-switcher { background: rgba(0,0,0,0.05); padding: 4px; border-radius: 12px; display: flex; white-space: nowrap; }
      .view-switcher button { border: none; background: transparent; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 800; color: #666; font-size: 0.75rem; }
      .view-switcher button.active { background: var(--card); color: var(--text); box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
      .persona-filters { display: flex; gap: 8px; }
      .persona { width: 40px; height: 40px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; cursor: pointer; overflow: hidden; }
      .persona.inactive { opacity: 0.1; }
      .persona img { width: 100%; height: 100%; object-fit: cover; }
      .today-btn { background: var(--accent); color: #fff; border: none; padding: 10px 20px; border-radius: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }

      .content-area { flex-grow: 1; height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .month-wrapper { height: 100%; display: flex; flex-direction: column; }
      .labels-row { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; color: #bbb; font-weight: 800; font-size: 0.8rem; padding-bottom: 12px; }
      .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(6, 1fr); gap: 10px; flex-grow: 1; height: 0; }
      .day-cell { background: var(--card); border: 2px solid var(--border); border-radius: 16px; padding: 12px; overflow: hidden; cursor: pointer; }
      .day-cell.today { border-color: var(--accent); border-width: 3px; }
      .day-num { font-weight: 900; font-size: 1.2rem; }
      .ev-pill { margin-top: 3px; padding: 5px; border-radius: 4px; color: #fff; font-size: 0.7rem; font-weight: 800; white-space: nowrap; overflow: hidden; }
      .is-past { opacity: 0.3 !important; }

      /* Structural Alignment Build 1.1.7 */
      .time-grid-root { display: flex; flex-direction: column; height: 100%; border: 1px solid var(--border); border-radius: 24px; overflow: hidden; background: var(--card); }
      .header-row-locked { display: flex; border-bottom: 1px solid var(--border); background: var(--bg); flex-shrink: 0; }
      .axis-placeholder { width: 70px; border-right: 1px solid var(--border); }
      .date-grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; height: 50px; }
      .header-cell { display: flex; align-items: center; justify-content: center; font-weight: 900; color: var(--text); border-right: 1px solid var(--border); font-size: 0.85rem; }
      
      .all-day-sync-row { display: flex; border-bottom: 2px solid var(--border); background: var(--bg); flex-shrink: 0; }
      .axis-label-blank { width: 70px; border-right: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 900; color: #bbb; text-transform: uppercase; }
      .ad-grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; padding: 5px; gap: 5px; }
      .ad-col { min-height: 40px; display: flex; flex-direction: column; gap: 2px; }
      .ad-pill { padding: 4px 8px; border-radius: 4px; color: #fff; font-size: 0.7rem; font-weight: 800; white-space: nowrap; overflow: hidden; }
      
      .main-scroll-sync { display: flex; flex-grow: 1; overflow-y: auto; overflow-x: hidden; }
      .time-axis-fixed { width: 70px; border-right: 1px solid var(--border); background: var(--bg); flex-shrink: 0; }
      .time-mark { height: 100px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #888; font-weight: 700; }
      .columns-scroll-sync { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; }
      .day-col { border-right: 1px solid var(--border); position: relative; }
      .hour-container { position: relative; height: 2400px; }
      .hour-box { height: 100px; border-bottom: 1px dotted var(--border); }
      .time-ev { position: absolute; left: 4px; right: 4px; padding: 10px; border-radius: 12px; color: #fff; font-size: 0.9rem; font-weight: 800; cursor: pointer; z-index: 2; }

      /* --- Morning Chores Styles v1.2.1 --- */
      .chore-grid-locked { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 25px; height: 100%; overflow-y: auto; padding-bottom: 20px; }
      .kid-chore-card { background: var(--card); border-radius: 28px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.04); position: relative; }
      .kid-banner { height: 140px; background-size: cover; background-position: center; display: flex; align-items: flex-end; padding: 25px; color: #fff; position: relative; }
      .kid-banner::after { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(transparent, rgba(0,0,0,0.7)); }
      .kid-banner h3 { margin: 0; z-index: 1; font-size: 2rem; font-weight: 900; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
      
      .medal { position: absolute; top: 20px; right: 20px; z-index: 2; --mdc-icon-size: 48px; color: var(--gold); filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.4)); animation: bounce 1s infinite alternate; }
      @keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-5px); } }

      .kid-list { padding: 20px; display: flex; flex-direction: column; gap: 10px; }
      .kid-item { display: flex; align-items: center; gap: 15px; padding: 16px; border-radius: 18px; cursor: pointer; color: #666; font-weight: 800; border: 1px solid transparent; transition: 0.2s; background: rgba(0,0,0,0.02); }
      .kid-item.done { color: var(--accent); background: rgba(123, 97, 255, 0.08); opacity: 0.8; }
      .kid-item ha-icon { --mdc-icon-size: 28px; }
      .chore-lock-msg { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #888; font-size: 1.4rem; font-weight: 700; gap: 20px; }
      .chore-lock-msg::before { content: '🔒'; font-size: 4rem; }
      
      /* Agenda Polishing */
      .agenda-view { height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
      .agenda-row { display: flex; gap: 20px; align-items: center; background: var(--card); padding: 15px; border-radius: 20px; border: 1px solid var(--border); cursor: pointer; transition: transform 0.2s; }
      .agenda-row.is-past { opacity: 0.3; filter: grayscale(1); }
      .agenda-date { display: flex; flex-direction: column; align-items: center; width: 60px; }
      .agenda-date .day { font-size: 2rem; font-weight: 900; line-height: 1; }
      .agenda-date .mon { font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: var(--accent); }
      .agenda-card { flex-grow: 1; padding: 10px 20px; }
      .ag-title { font-size: 1.3rem; font-weight: 800; letter-spacing: -0.5px; }
      .ag-meta { color: #888; font-weight: 600; margin-top: 4px; font-size: 0.9rem; }

      .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(10px); }
      .modal-body { background: var(--card); width: 500px; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
      .modal-header { padding: 30px; color: #fff; text-align: center; }
      .modal-content { padding: 30px; font-size: 1rem; line-height: 1.6; }
      .modal-actions {display: flex;justify-content: flex-end;gap: 15px;padding: 20px 30px;background: var(--card); /* Ensure buttons aren't transparent */border-top: 1px solid var(--border);}
      .close-btn { width: 100%; padding: 20px; border: none; background: var(--accent); color: #fff; font-weight: 900; cursor: pointer; }
      ha-textfield, ha-select {display: block; margin-bottom: 5px;--mdc-theme-primary: var(--accent);}
      
      .fab { position: fixed; bottom: 40px; right: 40px; width: 85px; height: 85px; border-radius: 50%; background: var(--accent); color: #fff; border: none; font-size: 3.5rem; cursor: pointer; box-shadow: 0 10px 25px rgba(123, 97, 255, 0.4); z-index: 100; }
      .form-grid {display: flex;  flex-direction: column;  gap: 15px;  padding-top: 10px;}
      .full-width {  width: 100%;}      
      .side-by-side { display: grid;  grid-template-columns: 1fr 1fr; gap: 10px;}

      /* Modernized Meal Planner */
      .meal-grid-view { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; height: 100%; overflow-y: auto; padding: 10px; }
      .meal-card-item { background: var(--card); border-radius: 24px; border: 1px solid var(--border); padding: 25px; display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0,0,0,0.02); }
      .meal-day-label { font-size: 1.4rem; font-weight: 900; color: var(--accent); margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; }
      .meal-card-item textarea { flex-grow: 1; border: none; resize: none; font-size: 1.2rem; background: transparent; color: var(--text); outline: none; font-weight: 500; line-height: 1.4; }

      /* Stylish Whiteboard */
      .whiteboard-container { height: 100%; display: flex; flex-direction: column; background: #fffcf0; border-radius: 32px; padding: 50px; border: 1px solid #f0e68c; box-shadow: inset 0 0 40px rgba(0,0,0,0.02); }
      .whiteboard-header { font-size: 2.2rem; font-weight: 900; margin-bottom: 30px; color: #444; letter-spacing: -1px; }
      .whiteboard-container textarea { flex-grow: 1; border: none; background: transparent; font-size: 1.8rem; color: #1a1a1b !important; outline: none; font-weight: 500; line-height: 1.5; }
      .nightlight-hub.dark .whiteboard-container { background: #2c2a1e; border-color: #444; }
      .nightlight-hub.dark .whiteboard-header { color: #eee; }
      .nightlight-hub.dark .whiteboard-container textarea { color: #efefef !important; }
    `;
    return styles;
  }
}

class NightlightCardEditor extends LitElement {
  static get properties() { return { hass: {}, _config: {} }; }
  
  setConfig(config) {
    this._config = config;

    // Force Home Assistant to load the internal entity picker component
    const loadHAComponents = async () => {
      if (!customElements.get("ha-entity-picker")) {
        const cardHelpers = await window.loadCardHelpers();
        await cardHelpers.createCardElement({ type: "entities" });
      }
      this.requestUpdate();
    };
    loadHAComponents();
  }

  _updateConfig(changes) {
    this.dispatchEvent(new CustomEvent("config-changed", { 
      detail: { config: { ...this._config, ...changes } }, 
      bubbles: true, 
      composed: true 
    }));
  }

  _valueChanged(ev) {
    if (!this._config || !this.hass) return;
    const target = ev.target;
    const field = target.configValue;
    const value = target.value;
    if (this._config[field] === value) return;
    this._updateConfig({ [field]: value });
  }

  _entitiesChanged(ev) {
    const newEntityList = ev.detail.value;
    const current = this._config.entities || [];
    const entities = newEntityList.map(entId => {
      const existing = current.find(e => e.entity === entId);
      return existing ? { ...existing } : { entity: entId, color: '#7b61ff', picture: '' };
    });
    this._updateConfig({ entities });
  }

  _entityPropertyChanged(idx, prop, value) {
    const entities = JSON.parse(JSON.stringify(this._config.entities || []));
    if (!entities[idx]) return;
    entities[idx][prop] = value;
    this._updateConfig({ entities });
  }

  _moveEntity(idx, direction) {
    const entities = [...(this._config.entities || [])];
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= entities.length) return;
    [entities[idx], entities[newIdx]] = [entities[newIdx], entities[idx]];
    this._updateConfig({ entities });
  }

  _addPeriod() {
    const periods = [...(this._config.periods || [])];
    periods.push({ name: "Morning", start: "06:00", end: "09:00" });
    this._updateConfig({ periods });
  }

  _removePeriod(idx) {
    const periods = [...(this._config.periods || [])];
    periods.splice(idx, 1);
    this._updateConfig({ periods });
  }

  _periodChanged(idx, field, value) {
    const periods = JSON.parse(JSON.stringify(this._config.periods || []));
    periods[idx][field] = value;
    this._updateConfig({ periods });
  }

  _addKid() {
    const chores = [...(this._config.chores || [])];
    chores.push({ name: "New Child", image: "", all_done_helper: "", use_person_image: false, items: [] });
    this._updateConfig({ chores });
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

  _addChoreToPeriod(kIdx, periodName) {
    const chores = JSON.parse(JSON.stringify(this._config.chores || []));
    if (!chores[kIdx].items) chores[kIdx].items = [];
    chores[kIdx].items.push({ label: "New Task", entity: "", period: periodName });
    this._updateConfig({ chores });
  }

  _removeChore(kIdx, iIdx) {
    const chores = JSON.parse(JSON.stringify(this._config.chores || []));
    chores[kIdx].items.splice(iIdx, 1);
    this._updateConfig({ chores });
  }

  _choreItemChanged(kIdx, iIdx, prop, value) {
    const chores = JSON.parse(JSON.stringify(this._config.chores || []));
    chores[kIdx].items[iIdx][prop] = value;
    this._updateConfig({ chores });
  }

  render() {
    if (!this.hass || !this._config) return html``;
    const periods = this._config.periods || [];
    
    return html`
      <div class="editor-shell">
        <ha-expansion-panel header="Hub Branding" outlined expanded>
          <div class="panel-content">
            <ha-textfield label="Title" .value="${this._config.title}" .configValue="${'title'}" @input="${this._valueChanged}"></ha-textfield>
            <ha-select label="Theme" .value="${this._config.theme}" .configValue="${'theme'}" @selected="${this._valueChanged}">
              <mwc-list-item value="light">Skylight Light</mwc-list-item>
              <mwc-list-item value="dark">Nightlight Dark</mwc-list-item>
            </ha-select>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel header="Chore Periods" outlined>
          <div class="panel-content">
            <div class="period-header">
              <div>Start</div><div>End</div><div>Name</div><div></div>
            </div>
            ${periods.map((p, idx) => html`
              <div class="period-row">
                <ha-textfield placeholder="00:00" .value="${p.start}" @input="${e => this._periodChanged(idx, 'start', e.target.value)}"></ha-textfield>
                <ha-textfield placeholder="00:00" .value="${p.end}" @input="${e => this._periodChanged(idx, 'end', e.target.value)}"></ha-textfield>
                <ha-textfield placeholder="Name" .value="${p.name}" @input="${e => this._periodChanged(idx, 'name', e.target.value)}"></ha-textfield>
                <ha-icon-button @click="${() => this._removePeriod(idx)}">
                  <ha-icon icon="mdi:close"></ha-icon>
                </ha-icon-button>
              </div>`)}
            <mwc-button class="mush-btn" @click="${this._addPeriod}">+ ADD TIME PERIOD</mwc-button>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel header="Family Profiles" outlined>
          <div class="panel-content">
            ${(this._config.chores || []).map((kid, kIdx) => html`
              <div class="kid-box">
                <div class="kid-header">
                  <ha-textfield label="Child Name" .value="${kid.name}" @input="${e => this._kidPropertyChanged(kIdx, 'name', e.target.value)}"></ha-textfield>
                  <ha-icon-button @click="${() => this._removeKid(kIdx)}">
                    <ha-icon icon="mdi:account-remove"></ha-icon>
                  </ha-icon-button>
                </div>
                <ha-textfield label="Banner Image URL" .value="${kid.image || ''}" @input="${e => this._kidPropertyChanged(kIdx, 'image', e.target.value)}"></ha-textfield>

                ${periods.map(p => html`
                  <div class="period-group">
                    <div class="period-group-title">
                      <span>${p.name} Tasks</span>
                      <ha-icon-button @click="${() => this._addChoreToPeriod(kIdx, p.name)}">
                        <ha-icon icon="mdi:plus-circle"></ha-icon>
                      </ha-icon-button>
                    </div>
                    ${kid.items?.filter(i => i.period === p.name).map((item, iIdx) => {
                      const originalIdx = kid.items.indexOf(item); // Correct way to find the index
                      return html`
                        <div class="chore-row">
                          <ha-textfield 
                            label="Task Label" 
                            .value="${item.label}" 
                            @input="${e => this._choreItemChanged(kIdx, originalIdx, 'label', e.target.value)}">
                          </ha-textfield>

                          <ha-entity-picker
                            label="Linked Entity"
                            .hass="${this.hass}"
                            .value="${item.entity}"
                            .includeDomains="${['input_boolean', 'switch', 'light']}"
                            @value-changed="${e => this._choreItemChanged(kIdx, originalIdx, 'entity', e.detail.value)}"
                            allow-custom-entity
                          ></ha-entity-picker>

                          <ha-icon-button @click="${() => this._removeChore(kIdx, originalIdx)}">
                            <ha-icon icon="mdi:close"></ha-icon>
                          </ha-icon-button>
                        </div>`;
                    })}
                  </div>`)}
              </div>`)}
            <mwc-button raised class="mush-btn" @click="${this._addKid}">+ ADD CHILD PROFILE</mwc-button>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel header="Persona Styling" outlined>
          <div class="panel-content">
            <ha-entities-picker 
              .hass="${this.hass}" 
              .includeDomains="${['calendar']}" 
              .value="${this._config.entities?.map(e => e.entity) || []}" 
              @value-changed="${this._entitiesChanged}">
            </ha-entities-picker>
            ${(this._config.entities || []).map((ent, idx) => html`
              <div class="persona-row">
                <div class="persona-header">
                  <strong>${ent.entity}</strong>
                  <div>
                    <ha-icon-button @click="${() => this._moveEntity(idx, -1)}" .disabled="${idx === 0}">
                      <ha-icon icon="mdi:arrow-up"></ha-icon>
                    </ha-icon-button>
                    <ha-icon-button @click="${() => this._moveEntity(idx, 1)}" .disabled="${idx === this._config.entities.length - 1}">
                      <ha-icon icon="mdi:arrow-down"></ha-icon>
                    </ha-icon-button>
                  </div>
                </div>
                <div class="controls">
                  <input type="color" .value="${ent.color}" @input="${e => this._entityPropertyChanged(idx, 'color', e.target.value)}">
                  <ha-textfield label="Picture URL" .value="${ent.picture || ''}" @input="${e => this._entityPropertyChanged(idx, 'picture', e.target.value)}"></ha-textfield>
                </div>
              </div>`)}
          </div>
        </ha-expansion-panel>
      </div>`;
  }

  static get styles() {
    return css`
      .editor-shell { display: flex; flex-direction: column; gap: 12px; padding: 10px; color: var(--primary-text-color); }
      ha-expansion-panel { background: var(--secondary-background-color); border-radius: 12px; margin-bottom: 10px; }
      .panel-content { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
      
      ha-textfield, ha-select, ha-entity-picker {
        display: block;
        width: 100%;
        margin-top: 8px;
        /* Use HA theme variables for text colors */
        --mdc-theme-text-primary-on-background: var(--primary-text-color);
        --mdc-theme-text-secondary-on-background: var(--secondary-text-color);
        --mdc-text-field-fill-color: var(--secondary-background-color);
        --mdc-text-field-ink-color: var(--primary-text-color);
      }
      
      ha-icon-button { display: flex; align-items: center;justify-content: center; margin-bottom: 4px;}
      ha-icon { --mdc-icon-size: 20px; }

      .period-header { display: grid; grid-template-columns: 80px 80px 1fr 40px; gap: 8px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase; color: var(--secondary-text-color); padding: 0 8px; }
      .period-row { display: grid; grid-template-columns: 80px 80px 1fr 40px; gap: 8px; align-items: center; background: var(--primary-background-color); padding: 8px; border-radius: 8px; }
      
      .kid-box { padding: 15px; border: 1px solid var(--divider-color); border-radius: 12px; background: var(--card-background-color); display: flex; flex-direction: column; gap: 12px; }
      .kid-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
      .period-group { padding: 10px; background: var(--secondary-background-color); border-radius: 8px; border-left: 3px solid var(--accent-color, #7b61ff); display: flex; flex-direction: column; gap: 8px; }
      .period-group-title { display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 0.85rem; }
      
      .chore-row { display: flex; flex-direction: column;gap: 12px; padding: 12px;background: var(--secondary-background-color); border-radius: 8px;  margin-top: 8px; border: 1px solid var(--divider-color);}
      @media (min-width: 450px) { .chore-row {   display: grid;grid-template-columns: 1fr 1fr 40px;   align-items: center;  }}
      
      ha-entity-picker { display: block; width: 100%;min-height: 50px; --mdc-theme-primary: var(--accent-color, #7b61ff);}

      .persona-row { padding: 12px; border-bottom: 1px solid var(--divider-color); }
      .persona-header { display: flex; justify-content: space-between; align-items: center; }
      .persona-row .controls { display: grid; grid-template-columns: 40px 1fr; gap: 15px; align-items: center; margin-top: 8px; }
      
      input[type="color"] { width: 40px; height: 40px; border: 2px solid var(--divider-color); border-radius: 8px; padding: 0; background: none; cursor: pointer; }
      .mush-btn { width: 100%; margin-top: 10px; }
    `;
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