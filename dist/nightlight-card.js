/**
* Nightlight Dashboard (v1.6.8)
* Features: To-do List Memory, User-Specific Views, Stretched Banners, Refined Announcer
* Fixes: Legacy WebView Compatibility, Hybrid Section Controller, Touch Interaction Fix
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
_selectedCalendarId: { type: String },
_menuOpen: { type: Boolean },
_todoItems: { type: Array }
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
this._menuOpen = false;
}

setConfig(config) {
if (!config.entities && !config.chores) throw new Error("Define entities or chores in YAML.");
this.config = { 
title: "Family Hub", 
theme: "light", 
logo_url: '/',
...config 
};
if (this._activeCalendars.length === 0 && config.entities) {
this._activeCalendars = config.entities.map(e => e.entity);
}
}

// --- Data Management & Lifecycle ---

updated(changedProps) {
// 1. Unified Hybrid Mode Handling
if (changedProps.has('_activeView')) {
const coreIds = ['calendar', 'meals', 'whiteboard', 'chores'];

// Control host sizing via attribute for interaction fix
if (coreIds.includes(this._activeView)) {
this.setAttribute('mode', 'core');
} else {
this.setAttribute('mode', 'section');
}

this.requestUpdate();
if (this._activeView === 'whiteboard') this._fetchNotes(this.config.notes_entity);
if (this._activeView === 'chores') this._fetchChoreData();
}

if (changedProps.has('hass')) {
this._checkDailyReset();

const oldHass = changedProps.get('hass');
if (oldHass) {
if (this._activeView === 'whiteboard' && this.hass.states[this.config.notes_entity] !== oldHass.states[this.config.notes_entity]) {
this._fetchNotes(this.config.notes_entity);
}
if (this._activeView === 'chores') {
this._fetchChoreData();
}
}
}

if (changedProps.has('hass') || changedProps.has('_activeView') || 
changedProps.has('_calendarMode') || changedProps.has('_referenceDate')) {
this._refreshData();
}
}

async _fetchChoreData() {
if (!this.hass || !this.config.chores) return;

const allItems = [];
for (const kid of this.config.chores) {
if (kid.todo_list) {
try {
const result = await this.hass.callWS({
type: "todo/item/list",
entity_id: kid.todo_list,
});
const taggedItems = (result.items || []).map(item => {
const newItem = JSON.parse(JSON.stringify(item));
newItem.list_id = kid.todo_list;
return newItem;
});
allItems.push(...taggedItems);
} catch (e) { console.error("Chore fetch failed", kid.todo_list, e); }
}
}
this._todoItems = allItems;
this.requestUpdate();
}

async _checkDailyReset() {
if (!this.hass || !this.config.chores) return;
const today = new Date().toDateString();

if (this._lastResetDate !== today) {
for (const kid of this.config.chores) {
if (kid.todo_list && this.hass.states[kid.todo_list]) {
const todoState = this.hass.states[kid.todo_list];
// Legacy check for Android WebView
const items = (todoState && todoState.attributes && todoState.attributes.items) 
? todoState.attributes.items 
: [];

for (const item of items) {
if (item.status === 'completed') {
await this.hass.callService('todo', 'update_item', {
entity_id: kid.todo_list,
item: item.summary,
status: 'needs_action'
});
}
}
}
}
localStorage.setItem('nightlight_reset_date', today);
this._lastResetDate = today;
}
}

_getTodoStatus(entityId, taskLabel) {
if (!this._todoItems) return false;

const item = this._todoItems.find(i => 
i.list_id === entityId && 
i.summary.trim().toLowerCase() === taskLabel.trim().toLowerCase()
);

return item ? item.status === 'completed' : false;
}

async _toggleTodo(entityId, taskLabel, isDone) {
if (!entityId) return;

const newStatus = isDone ? 'needs_action' : 'completed';
try {
await this.hass.callService('todo', 'update_item', {
entity_id: entityId,
item: taskLabel,
status: newStatus
});
await this._fetchChoreData();
} catch (e) {
console.error("Todo Toggle Failed:", e);
}
}

_isTodoItemComplete(entityId, label) { return this._getTodoStatus(entityId, label); }
async _handleTodoToggle(entityId, label, isDone) { return this._toggleTodo(entityId, label, isDone); }

async _refreshData() {
if (!this.hass || this._loading) return;
this._loading = true;
try {
if (this._activeView === 'calendar') {
await this._fetchEvents();
}
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

const startStr = start.toISOString().replace(/\.\d+Z$/, "Z");
const endStr = end.toISOString().replace(/\.\d+Z$/, "Z");

const filteredEntities = (this.config.entities || []).filter(e => e.entity.startsWith('calendar'));
const promises = filteredEntities.map(ent => {
return this.hass.callApi('GET', `calendars/${ent.entity}?start=${startStr}&end=${endStr}`)
.then(evs => evs.map(e => {
const stateObj = this.hass.states[ent.entity];
return {
...e,
color: ent.color || '#7b61ff',
origin: ent.entity,
friendly_name: (stateObj && stateObj.attributes) ? stateObj.attributes.friendly_name : ent.entity
};
}))
.catch(() => []);
});
const results = await Promise.all(promises);
this._events = results.flat();
}

// --- Interaction & Command Logic ---

_navigate(dir) {
const d = new Date(this._referenceDate);
if (this._calendarMode === 'month') d.setMonth(d.getMonth() + dir);
else if (this._calendarMode === 'week') d.setDate(d.getDate() + (dir * 7));
else d.setDate(d.getDate() + dir);
this._referenceDate = d;
}

_togglePersona(id) {
this._activeCalendars = this._activeCalendars.includes(id) ? this._activeCalendars.filter(i => i !== id) : [...this._activeCalendars, id];
}

_handleMonthDayClick(dayNum, evsCount) {
if (!dayNum) return;
const newDate = new Date(this._referenceDate);
newDate.setDate(dayNum);
this._referenceDate = newDate;
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
const ev = JSON.parse(JSON.stringify(event));
ev.displayDate = start.toDateString();
fragmented.push(ev);
} else {
let current = new Date(start);
while (current <= end) {
if ((!startRange || current >= startRange) && (!endRange || current <= endRange)) {
const ev = JSON.parse(JSON.stringify(event));
ev.isFragment = true;
ev.displayDate = current.toDateString();
ev.isAllDay = true;
fragmented.push(ev);
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

// --- Rendering Engines ---

render() {
  if (!this.hass) return html``;

  const coreIds = ['calendar', 'meals', 'whiteboard', 'chores'];
  const isCoreMode = coreIds.includes(this._activeView);
  const modeClass = isCoreMode ? 'core-mode' : 'section-mode';

  const headerTitle = (this._activeView === 'calendar')
    ? this._referenceDate.toLocaleString('default', { month: 'long', year: 'numeric' })
    : (this.config.title || "Family Hub");

  const coreNav = [
    { id: 'calendar', name: 'Calendar', icon: 'mdi:calendar-month' },
    { id: 'meals', name: 'Dinner', icon: 'mdi:silverware-fork-knife' },
    { id: 'whiteboard', name: 'Notes', icon: 'mdi:note-edit' },
    { id: 'chores', name: 'Chores', icon: 'mdi:check-all' }
  ];

  const customNav = this.config.navigation || [];
  const notesState = this.hass.states[this.config.notes_entity];
  const hasNewNotes = notesState ? (new Date() - new Date(notesState.last_changed)) < (60 * 60 * 1000) : false;

  return html`
    <div class="nightlight-hub ${this.config.theme} ${modeClass} ${this._activeView}-active ${this._menuOpen ? 'menu-visible' : ''}">
      
      <nav class="side-rail ${this._menuOpen ? 'open' : ''}">
        <button class="menu-close-btn" @click="${() => this._menuOpen = false}">✕</button>
        
        <a href="${this.config.logo_url || '/'}" class="logo-link">
          <div class="logo-area">
             <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,3L2,12H5V20H19V12H22L12,3M12,8.5C13.5,8.5 15,10 15,11.5C15,13.2 12,16 12,16C12,16 9,13.2 9,11.5C9,10 10.5,8.5 12,8.5Z"/></svg>
          </div>
        </a>

        <div class="nav-items">
          ${coreNav.map(nav => html`
            <button class="nav-btn ${this._activeView === nav.id ? 'active' : ''}" 
                    @click="${() => {
                      this._activeView = nav.id;
                      this._menuOpen = false;
                      if (this.config.view_controller) {
                        this.hass.callService('input_select', 'select_option', {
                          entity_id: this.config.view_controller,
                          option: "Nightlight"
                        });
                      }
                    }}">
               <ha-icon icon="${nav.icon}"></ha-icon>
               <span>${nav.name}</span>
               ${nav.id === 'whiteboard' && hasNewNotes ? html`<div class="alert-dot"></div>` : ''}
            </button>
          `)}

          ${customNav.length > 0 ? html`<hr style="width: 50%; opacity: 0.1; margin: 10px 0;">` : ''}

          ${customNav.map(nav => html`
            <button class="nav-btn ${this._activeView === nav.name ? 'active' : ''}" 
                    @click="${() => {
                      this._activeView = nav.name;
                      this._menuOpen = false;
                      if (this.config.view_controller) {
                        this.hass.callService('input_select', 'select_option', {
                          entity_id: this.config.view_controller,
                          option: nav.name
                        });
                      }
                    }}">
               <ha-icon icon="${nav.icon}"></ha-icon>
               <span>${nav.name}</span>
            </button>
          `)}
        </div>
      </nav>

      <ha-icon-button class="hamburger-menu-fixed" @click="${() => this._menuOpen = true}">
        <ha-icon icon="mdi:menu"></ha-icon>
      </ha-icon-button>

      <main class="main-stage">
        <header class="top-bar">
          <div class="left-info">
            <h1 class="title-with-fixed-menu">${headerTitle}</h1>
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
                <button class="${this._calendarMode === m ? 'active' : ''}" 
                        @click="${() => { this._calendarMode = m; this._activeView = 'calendar'; }}">
                  ${m.toUpperCase()}
                </button>
              `)}
            </div>
            
            <button class="today-btn" @click="${() => { this._referenceDate = new Date(); this._activeView = 'calendar'; }}">Today</button>
            
            <div class="persona-filters">
              ${(this.config.entities || []).filter(e => e.entity.startsWith('calendar')).map(ent => html`
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
const coreIds = ['calendar', 'meals', 'whiteboard', 'chores'];

if (coreIds.includes(this._activeView)) {
switch(this._activeView) {
case 'meals': return this._renderMealPlanner();
case 'whiteboard': return this._renderWhiteboard();
case 'chores': return this._renderChoreDashboard();
default: return this._renderCalendarView();
}
}

return null; 
}

_renderMealPlanner() {
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const entities = this.config.meal_entities || {};

return html`
     <div class="meal-grid-view">
       ${days.map(day => {
         const entityId = entities[day];
         const stateObj = this.hass.states[entityId];
         
         let displayValue = "";
         if (stateObj && stateObj.state !== "unknown" && stateObj.state !== "none") {
           const parts = stateObj.state.split(' | ');
           const content = parts[0];
           const timestamp = parts[1];
           
           if (timestamp && (new Date() - new Date(timestamp)) > (5 * 24 * 60 * 60 * 1000)) {
             this._saveMeal(day, ""); 
             displayValue = "";
           } else {
             displayValue = content || "";
           }
         }

         return html`
           <div class="meal-card-item">
             <div class="meal-day-label">${day}</div>
             <textarea 
               placeholder="What's for dinner?" 
               .value="${displayValue}" 
               @change="${(e) => this._saveMeal(day, e.target.value)}">
             </textarea>
           </div>`;
       })}
     </div>`;
}

async _saveMeal(day, value) {
const mealEntities = this.config.meal_entities;
const entityId = mealEntities ? mealEntities[day] : null;
if (!entityId) return;

const timestamp = new Date().toISOString();
const payload = value ? value + " | " + timestamp : "";

await this.hass.callService('input_text', 'set_value', {
entity_id: entityId,
value: payload
});
}

async _fetchNotes(entityId) {
if (!entityId || !this.hass) return;
try {
const result = await this.hass.callWS({
type: "todo/item/list",
entity_id: entityId,
});
this._todoItems = (result.items || []).filter(item => item.status === 'needs_action');
this.requestUpdate();
} catch (e) {
console.error("Failed to fetch notes:", e);
}
}

_renderWhiteboard() {
const entityId = this.config.notes_entity;
if (!this._todoItems && entityId) {
this._fetchNotes(entityId);
}

const items = this._todoItems || [];

return html`
     <div class="whiteboard-grid-container">
       <header class="whiteboard-header">
         Family Notes
         <button class="add-note-inline" @click="${() => this._showAddNotePrompt(entityId)}">
           <ha-icon icon="mdi:plus"></ha-icon> New Note
         </button>
       </header>
       
       <div class="post-it-grid">
         ${items.length === 0 
           ? html`<div class="empty-msg">No active notes.</div>` 
           : items.map(item => {
               const parts = item.summary.split('--');
               const formattedSummary = parts.map((line, index) => {
                 return index === 0 ? line : '\n• ' + line.trim();
               }).join('');

               return html`
                 <div class="post-it">
                   <button class="delete-note" @click="${() => this._deleteNote(entityId, item.uid || item.summary)}">✕</button>
                   <div class="note-content">${formattedSummary}</div>
                 </div>
               `;
             })
         }
       </div>
     </div>`;
}  

async _showAddNotePrompt(entityId) {
const note = prompt("Enter your note:");
if (note) {
await this.hass.callService('todo', 'add_item', {
entity_id: entityId,
item: note
});
await this._fetchNotes(entityId);
}
}

async _deleteNote(entityId, identifier) {
if (!entityId) return;
if (!confirm("Are you sure you want to delete this note?")) return;
try {
await this.hass.callService('todo', 'update_item', {
entity_id: entityId,
item: identifier,
status: 'completed'
});
await this._fetchNotes(entityId);
} catch (e) {
console.error("Nightlight: Delete failed", e);
}
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
.filter(e => new Date(e.displayDate) >= today)
.sort((a, b) => new Date(a.displayDate) - new Date(b.displayDate) || 
new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));

return html`
     <div class="agenda-view">
       ${interleaved.map(e => {
         const isPastFragment = new Date(e.displayDate) < today;
         return html`
           <div class="agenda-row ${isPastFragment ? 'is-past' : ''}" @click="${() => this._selectedEvent = e}">
             <div class="agenda-date"><span class="day">${new Date(e.displayDate).getDate()}</span><span class="mon">${new Date(e.displayDate).toLocaleString('default', {month:'short'})}</span></div>
             <div class="agenda-card" style="border-left: 6px solid ${e.color}">
               <div class="ag-title">${e.summary}</div>
               <div class="ag-meta">${e.friendly_name} • ${e.isAllDay ? 'All Day' : new Date(e.start.dateTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
             </div>
           </div>`;
       })}
     </div>`;
}

_renderChoreDashboard() {
if (!this.config.chores || !this.config.periods) return html`<div>No chores configured.</div>`;

const now = new Date();
const currentTime = now.getHours() * 60 + now.getMinutes();
const currentUser = (this.hass.user) ? this.hass.user.name : null;
const isAdmin = (this.hass.user) ? this.hass.user.is_admin : false;

const activePeriod = this.config.periods.find(p => {
const partsStart = p.start.split(':');
const partsEnd = p.end.split(':');
const startTotal = Number(partsStart[0]) * 60 + Number(partsStart[1]);
const endTotal = Number(partsEnd[0]) * 60 + Number(partsEnd[1]);
return currentTime >= startTotal && currentTime <= endTotal;
});

if (!activePeriod) return html`<div class="chore-lock-msg">No active chore period right now.</div>`;

const visibleKids = this.config.chores.filter(kid => 
isAdmin || !kid.assigned_user || kid.assigned_user === currentUser
);

return html`
     <div class="chore-container">
       <div class="period-announcer">Active: ${activePeriod.name}</div>
       <div class="chore-grid-locked">
         ${visibleKids.map((kid) => {
           const tasks = (kid.items || []).filter(i => i.period === activePeriod.name);
           if (tasks.length === 0) return html``;

           return html`
             <div class="kid-chore-card">
               <div class="kid-banner" style="background-image: url('${kid.image}')">
                 <h3>${kid.name}</h3>
               </div>
               <div class="kid-list">
                 ${tasks.map(item => {
                   const isDone = this._getTodoStatus(kid.todo_list, item.label);
                   
                   return html`
                     <div class="kid-item ${isDone ? 'done' : ''}" 
                          @click="${() => { if (!this._isScrolling) this._toggleTodo(kid.todo_list, item.label, isDone); }}"
                          @touchstart="${() => { this._isScrolling = false; }}"
                          @touchmove="${() => { this._isScrolling = true; }}">
                       
                       <ha-icon 
                         .icon="${isDone ? 'mdi:check-circle' : 'mdi:circle-outline'}"
                         class="chore-icon">
                       </ha-icon>
                       
                       <span>${item.label}</span>
                     </div>`;
                 })}
               </div>
             </div>`;
         })}
       </div>
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
   /* --- Layout & Hybrid Visibility --- */
   :host { display: block; width: 100%; transition: width 0.3s ease; --accent: #7b61ff; --bg: var(--primary-background-color); --card: var(--card-background-color); --text: var(--primary-text-color); --secondary-text: var(--secondary-text-color); --border: var(--divider-color); --gold: #ffd700; --ha-header: 56px; }
   :host([mode="section"]) { width: 80px !important; position: absolute; z-index: 100; pointer-events: none; background: transparent !important; }
   :host([mode="section"]) .side-rail { pointer-events: auto; background: transparent !important; border-right: none !important; box-shadow: none !important;}
   :host([mode="section"]) .main-stage { display: none !important; }
   :host([mode="core"]) { width: 100% !important; position: relative; }
   :host([mode="core"]) .main-stage { display: flex !important; pointer-events: auto; }
   .nightlight-hub.dark { --bg: #121212; --card: #1e1e1e; --text: #efefef; --border: #333; }
   .nightlight-hub { display: grid; grid-template-columns: 80px 1fr; height: calc(100vh - var(--ha-header, 56px)); background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow: hidden; }

   /* --- Sidebar & Navigation --- */
   .logo-link { color: var(--accent); text-decoration: none; cursor: pointer; display: block; }
   .logo-area { color: var(--accent); margin-bottom: 20px; width: 30px; }
   .side-rail { background: var(--card); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 15px 0; z-index: 20; }
   .nav-btn { background: none; border: none; padding: 15px 0; color: #bbb; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; font-weight: bold; width: 100%; position: relative; }
   .nav-btn.active { color: var(--accent); border-right: 3px solid var(--accent); background: rgba(123, 97, 255, 0.05); }
   .nav-btn ha-icon { --mdc-icon-size: 22px; }
   .hamburger-menu { display: none; margin-right: 10px; --mdc-icon-button-size: 40px; }
   .menu-close-btn { display: none; background: none; border: none; color: var(--text); font-size: 1.5rem; position: absolute; top: 15px; right: 15px; z-index: 1001; }
   .hamburger-menu-fixed { display: none; position: absolute; top: 10px; left: 10px; z-index: 150; color: var(--text); --mdc-icon-button-size: 48px; background: rgba(0, 0, 0, 0.3); border-radius: 50%; }
   @media (max-width: 768px) {
       .hamburger-menu-fixed { display: inline-block; }
       .title-with-fixed-menu { margin-left: 45px !important; }
       :host([mode="section"]) .hamburger-menu-fixed { pointer-events: auto !important; }
       .side-rail.open { pointer-events: auto !important; left: 0; }
       .main-stage .hamburger-menu { display: none !important; } /* Hide the original if still present */
   }
   .side-rail.open { background: var(--card) !important; pointer-events: auto !important; left: 0; }

   /* --- Main Header & Stage --- */
   .main-stage { padding: 15px; flex-direction: column; height: 100%; box-sizing: border-box; overflow: hidden; display: flex; }
   .top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; flex-shrink: 0; z-index: 10; }
   .top-bar h1 { font-size: 1.8rem; font-weight: 800; margin: 0; letter-spacing: -1px; white-space: nowrap; }
   .meta-row { display: flex; align-items: center; gap: 10px; margin-top: 5px; }
   .clock { font-size: 1rem; font-weight: 700; color: #888; }
   .nav-arrows button { background: var(--card); border: 1px solid var(--border); border-radius: 50%; width: 32px; height: 32px; cursor: pointer; color: var(--text); }
   .right-actions { display: flex; align-items: center; gap: 15px; }
   .view-switcher { background: rgba(0,0,0,0.05); padding: 3px; border-radius: 10px; display: flex; white-space: nowrap; }
   .view-switcher button { border: none; background: transparent; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-weight: 800; color: #666; font-size: 0.65rem; }
   .view-switcher button.active { background: var(--card); color: var(--text); box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
   .persona-filters { display: flex; gap: 6px; }
   .persona { width: 32px; height: 32px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; cursor: pointer; overflow: hidden; transition: all 0.3s ease; }
   .persona img { width: 100%; height: 100%; object-fit: cover; }
   .persona.inactive { opacity: 0.2 !important; filter: grayscale(1) !important; background: #444 !important; }
   .today-btn { background: var(--accent); color: #fff; border: none; padding: 6px 14px; border-radius: 10px; font-weight: 800; cursor: pointer; white-space: nowrap; font-size: 0.75rem; }

   /* --- Calendar Views (Monthly, Weekly, Agenda) --- */
   .content-area { flex-grow: 1; height: 0; overflow-y: auto; display: flex; flex-direction: column; position: relative; z-index: 1; }
   .month-wrapper { height: 100%; display: flex; flex-direction: column; }
   .labels-row { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; color: #bbb; font-weight: 800; font-size: 0.7rem; padding-bottom: 8px; }
   .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(6, 1fr); gap: 6px; flex-grow: 1; height: 0; }
   .day-cell { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 8px; overflow: hidden; cursor: pointer; }
   .day-cell.today { border-color: var(--accent); border-width: 2px; }
   .day-num { font-weight: 900; font-size: 1rem; }
   .ev-pill { margin-top: 2px; padding: 3px; border-radius: 4px; color: #fff; font-size: 0.6rem; font-weight: 800; white-space: nowrap; overflow: hidden; }
   .is-past { opacity: 0.3 !important; }
   .time-grid-root { display: flex; flex-direction: column; height: 100%; border: 1px solid var(--border); border-radius: 16px; overflow: hidden; background: var(--card); }
   .header-row-locked { display: flex; border-bottom: 1px solid var(--border); background: var(--bg); flex-shrink: 0; }
   .axis-placeholder { width: 50px; border-right: 1px solid var(--border); }
   .date-grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; height: 40px; }
   .header-cell { display: flex; align-items: center; justify-content: center; font-weight: 900; color: var(--text); border-right: 1px solid var(--border); font-size: 0.7rem; }
   .all-day-sync-row { display: flex; border-bottom: 2px solid var(--border); background: var(--bg); flex-shrink: 0; min-height: 20px; }
   .axis-label-blank { width: 50px; border-right: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.5rem; font-weight: 900; color: #bbb; text-transform: uppercase; }
   .ad-grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; padding: 2px; gap: 2px; }
   .ad-col { min-height: 20px; display: flex; flex-direction: column; gap: 2px; }
   .ad-pill { padding: 1px 4px; border-radius: 3px; color: #fff; font-size: 0.5rem; font-weight: 800; white-space: nowrap; overflow: hidden; height: 14px; line-height: 14px; }
   .main-scroll-sync { display: flex; flex-grow: 1; overflow-y: auto; overflow-x: hidden; }
   .time-axis-fixed { width: 50px; border-right: 1px solid var(--border); background: var(--bg); flex-shrink: 0; }
   .time-mark { height: 80px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color: #888; font-weight: 700; }
   .columns-scroll-sync { display: grid; grid-template-columns: repeat(var(--cols), 1fr); flex-grow: 1; }
   .day-col { border-right: 1px solid var(--border); position: relative; }
   .hour-container { position: relative; height: 1920px; }
   .hour-box { height: 80px; border-bottom: 1px dotted var(--border); }
   .time-ev { position: absolute; left: 2px; right: 2px; padding: 6px; border-radius: 8px; color: #fff; font-size: 0.75rem; font-weight: 800; cursor: pointer; z-index: 2; }
   .agenda-view { height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
   .agenda-row { display: flex; gap: 12px; align-items: center; background: var(--card); padding: 10px; border-radius: 12px; border: 1px solid var(--border); cursor: pointer; }
   .agenda-date { display: flex; flex-direction: column; align-items: center; width: 45px; }
   .agenda-date .day { font-size: 1.4rem; font-weight: 900; line-height: 1; }
   .agenda-date .mon { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--accent); }
   .agenda-card { flex-grow: 1; padding: 5px 10px; }
   .ag-title { font-size: 1rem; font-weight: 800; }
   .ag-meta { color: #888; font-weight: 600; font-size: 0.75rem; }

   /* --- Chores Dashboard --- */
   .chore-container { display: flex; flex-direction: column; height: 100%; position: relative; z-index: 5; }
   .chore-grid-locked { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px; overflow-y: auto; padding-bottom: 10px; }
   .kid-chore-card { background: var(--card); border-radius: 20px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.04); position: relative; }
   .kid-banner { height: 100px; background-size: cover; background-position: center; display: flex; align-items: flex-end; padding: 15px; color: #fff; position: relative; }
   .period-announcer { text-align: right; font-weight: 800; text-transform: uppercase; color: var(--accent); padding: 4px 12px; background: rgba(123, 97, 255, 0.08); border-radius: 6px; margin-bottom: 8px; font-size: 0.6rem; align-self: flex-end; }
   .kid-list { padding: 10px; display: flex; flex-direction: column; gap: 6px; }
   .kid-item { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; cursor: pointer; color: var(--text); font-weight: 800; background: rgba(123, 97, 255, 0.03); transition: all 0.2s ease; }
   .kid-item.done { background: rgba(52, 199, 89, 0.1) !important; border: 1px solid rgba(52, 199, 89, 0.3); opacity: 0.8; }
   .kid-item.done span { text-decoration: line-through !important; color: var(--secondary-text); }
   .chore-lock-msg { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--secondary-text); font-size: 1.2rem; font-weight: 700; }
   .warning-banner { background: #ff5252; color: white; padding: 10px; border-radius: 8px; text-align: center; font-weight: 900; margin-bottom: 10px; animation: pulse 2s infinite; }

   /* --- Notes & Post-it Grid --- */
   .whiteboard-grid-container { height: 100%; display: flex; flex-direction: column; padding: 10px; }
   .whiteboard-header { display: flex; justify-content: space-between; align-items: center; font-size: 1.6rem; font-weight: 900; margin-bottom: 15px; color: var(--text); }
   .post-it-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); grid-auto-rows: 200px; gap: 20px; overflow-y: auto; padding: 10px; flex-grow: 1; }
   .post-it { background: #fff9c4; color: #000 !important; padding: 20px; min-height: 150px; border-radius: 2px; box-shadow: 3px 3px 10px rgba(0,0,0,0.1); position: relative; font-family: 'Comic Sans MS', cursive, sans-serif; font-weight: 700; display: flex; align-items: center; justify-content: center; transform: rotate(-1.5deg); }
   .note-content { color: #000 !important; font-size: 1.2rem; line-height: 1.3; white-space: pre-wrap; text-align: left;}
   .post-it:nth-child(even) { transform: rotate(1.2deg); background: #e1f5fe; }
   .delete-note { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.05); border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; color: #888; }
   .add-note-inline { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 12px; font-weight: 800; cursor: pointer; }

   /* --- Meal Planner & Sub-Modules --- */
   .meal-grid-view { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; height: 100%; overflow-y: auto; padding: 5px; }
   .meal-card-item { background: var(--card); border-radius: 16px; border: 1px solid var(--border); padding: 15px; display: flex; flex-direction: column; }
   .meal-day-label { font-size: 1.1rem; font-weight: 900; color: var(--accent); margin-bottom: 8px; }
   .meal-card-item textarea { border: none; resize: none; font-size: 0.9rem; background: transparent; color: var(--text); outline: none; min-height: 100px; }

   /* --- Modal & Editor Styles --- */
   .alert-dot { position: absolute; top: 12px; right: 20px; width: 10px; height: 10px; background: #ff5252; border-radius: 50%; border: 2px solid var(--card); }
   .fab { position: fixed; bottom: 25px; right: 25px; width: 42px; height: 42px; border-radius: 50%; background: var(--accent); color: #fff; border: none; font-size: 1.8rem; z-index: 100; cursor: pointer; }
   .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 3000; backdrop-filter: blur(10px); }
   .modal-body.creation { background: var(--card); width: 90%; max-width: 450px; border-radius: 20px; overflow: hidden; box-shadow: 0 15px 50px rgba(0,0,0,0.3); }
   .modal-body { background: var(--card); width: 90%; max-width: 400px; border-radius: 20px; overflow: hidden; box-shadow: 0 15px 50px rgba(0,0,0,0.3); }
   .modal-header { padding: 20px; color: #fff; text-align: left; font-size: 1.5rem; font-weight: 800; }
   .modal-content { padding: 20px; }
   .form-grid { display: flex; flex-direction: column; gap: 15px; }
   .side-by-side { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
   .full-width { width: 100%; }
   .modal-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 15px 20px; border-top: 1px solid var(--border); background: rgba(0,0,0,0.05); }
   ha-textfield, ha-select { --mdc-shape-small: 8px; }
   .editor-shell { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
   .editor-shell .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
   .editor-shell .kid-box { border: 1px solid var(--border); padding: 10px; border-radius: 8px; margin-bottom: 10px; }
   ha-expansion-panel { background: var(--secondary-background-color); border-radius: 8px; margin-bottom: 10px; }
   ha-textfield, ha-entity-picker { width: 100%; margin-top: 8px; }
   @media (max-width: 768px) { .nightlight-hub { grid-template-columns: 1fr; } .hamburger-menu { display: inline-block; } .side-rail { position: fixed; left: -100px; top: 0; bottom: 0; width: 80px; z-index: 2000; transition: left 0.3s ease; } .side-rail.open { left: 0; } .menu-close-btn { display: block; } }
 `;
}
}
// --- CARD EDITOR CLASS (100% RESTORED) ---

class NightlightCardEditor extends LitElement {
static get properties() { return { hass: {}, _config: {} }; }

setConfig(config) {
this._config = config;
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
this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { ...this._config, ...changes } }, bubbles: true, composed: true }));
}

_valueChanged(ev) {
if (!this._config || !this.hass) return;
const target = ev.target;
const field = target.configValue || 'title';
const value = target.value;
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

_removeEntity(idx) {
const entities = [...(this._config.entities || [])];
entities.splice(idx, 1);
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

_addNavLink() {
const navigation = [...(this._config.navigation || [])];
navigation.push({ name: "New Link", icon: "mdi:link", path: "/dashboard/0" });
this._updateConfig({ navigation });
}

_removeNavLink(idx) {
const navigation = [...(this._config.navigation || [])];
navigation.splice(idx, 1);
this._updateConfig({ navigation });
}

_navPropChanged(idx, prop, value) {
const navigation = JSON.parse(JSON.stringify(this._config.navigation || []));
navigation[idx][prop] = value;
this._updateConfig({ navigation });
}

_addKid() {
const chores = [...(this._config.chores || [])];
chores.push({ name: "New Child", image: "", todo_list: "", assigned_user: "", items: [] });
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
chores[kIdx].items.push({ label: "New Task", period: periodName });
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
           <ha-textfield label="Title" .value="${this._config.title}" @input="${e => this._updateConfig({title: e.target.value})}"></ha-textfield>
           <ha-textfield label="Logo URL Link" .value="${this._config.logo_url}" @input="${e => this._updateConfig({logo_url: e.target.value})}"></ha-textfield>
           <ha-entity-picker label="Controller (input_select)" .hass="${this.hass}" .value="${this._config.view_controller}" .includeDomains="${['input_select']}" @value-changed="${e => this._updateConfig({view_controller: e.detail.value})}"></ha-entity-picker>
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

       <ha-expansion-panel header="Family Profiles" outlined expanded>
         <div class="panel-content">
           ${(this._config.chores || []).map((kid, kIdx) => html`
             <div class="kid-box">
               <div class="kid-header">
                 <ha-textfield label="Child Name" .value="${kid.name}" @input="${e => this._kidPropertyChanged(kIdx, 'name', e.target.value)}"></ha-textfield>
                 <ha-icon-button @click="${() => this._removeKid(kIdx)}">
                   <ha-icon icon="mdi:account-remove"></ha-icon>
                 </ha-icon-button>
               </div>

               <div class="mapping-grid">
                 <ha-entity-picker 
                   label="Linked To-do List"
                   .hass="${this.hass}"
                   .value="${kid.todo_list}"
                   .includeDomains="${['todo']}"
                   @value-changed="${e => this._kidPropertyChanged(kIdx, 'todo_list', e.detail.value)}">
                 </ha-entity-picker>

                 <ha-textfield 
                   label="Assigned HA User" 
                   .value="${kid.assigned_user || ''}"
                   @input="${e => this._kidPropertyChanged(kIdx, 'assigned_user', e.target.value)}">
                 </ha-textfield>
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
                   ${(kid.items || []).filter(i => i.period === p.name).map((item) => {
                     const originalIdx = kid.items.indexOf(item);
                     return html`
                       <div class="chore-row">
                         <ha-textfield label="Task Label" .value="${item.label}" @input="${e => this._choreItemChanged(kIdx, originalIdx, 'label', e.target.value)}"></ha-textfield>
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

       <ha-expansion-panel header="Sidebar Navigation" outlined>
         <div class="panel-content">
           ${(this._config.navigation || []).map((nav, idx) => html`
             <div class="kid-box" style="margin-bottom: 10px;">
               <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                 <ha-textfield label="Button Name" .value="${nav.name}" style="flex-grow: 1;"
                   @input="${e => this._navPropChanged(idx, 'name', e.target.value)}"></ha-textfield>
                 <ha-icon-button @click="${() => this._removeNavLink(idx)}">
                   <ha-icon icon="mdi:delete"></ha-icon>
                 </ha-icon-button>
               </div>
               
               <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                 <ha-textfield label="Icon (mdi:icon)" .value="${nav.icon}" 
                   @input="${e => this._navPropChanged(idx, 'icon', e.target.value)}"></ha-textfield>
                 <ha-textfield label="URL Path" .value="${nav.path}" 
                   @input="${e => this._navPropChanged(idx, 'path', e.target.value)}"></ha-textfield>
               </div>
             </div>
           `)}
           <mwc-button raised class="mush-btn" @click="${this._addNavLink}">+ ADD NAV LINK</mwc-button>
         </div>
       </ha-expansion-panel>

       <ha-expansion-panel header="Persona Styling" outlined>
         <div class="panel-content">
           <ha-entities-picker 
             .hass="${this.hass}" 
             .includeDomains="${['calendar']}" 
             .value="${this._config.entities ? this._config.entities.map(e => e.entity) : []}" 
             @value-changed="${this._entitiesChanged}">
           </ha-entities-picker>

           ${(this._config.entities || []).map((ent, idx) => html`
             <div class="persona-row" style="border: 1px solid var(--divider-color); padding: 10px; margin-top: 10px; border-radius: 8px;">
               <div class="persona-header" style="display: flex; justify-content: space-between; align-items: center;">
                 <strong style="font-size: 0.8rem;">${ent.entity}</strong>
                 <div style="display: flex;">
                   <ha-icon-button @click="${() => this._moveEntity(idx, -1)}" ?disabled="${idx === 0}">
                     <ha-icon icon="mdi:arrow-up"></ha-icon>
                   </ha-icon-button>
                   <ha-icon-button @click="${() => this._moveEntity(idx, 1)}" ?disabled="${idx === (this._config.entities.length - 1)}">
                     <ha-icon icon="mdi:arrow-down"></ha-icon>
                   </ha-icon-button>
                   <ha-icon-button @click="${() => this._removeEntity(idx)}" style="color: #db4437;">
                     <ha-icon icon="mdi:delete"></ha-icon>
                   </ha-icon-button>
                 </div>
               </div>

               <div class="controls" style="display: grid; grid-template-columns: 40px 1fr; gap: 10px; align-items: center; margin-top: 8px;">
                 <input type="color" .value="${ent.color}" 
                   @input="${e => this._entityPropertyChanged(idx, 'color', e.target.value)}"
                   style="width: 100%; height: 35px; cursor: pointer;">
                 <ha-textfield label="Picture URL" .value="${ent.picture || ''}" 
                   @input="${e => this._entityPropertyChanged(idx, 'picture', e.target.value)}"></ha-textfield>
               </div>
             </div>`)}
         </div>
       </ha-expansion-panel>

       <ha-expansion-panel header="Meal Plan Entities" outlined>
         <div class="panel-content">
           ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => html`
             <ha-entity-picker 
               label="${day} Dinner Entity"
               .hass="${this.hass}"
               .value="${(this._config.meal_entities || {})[day]}"
               .includeDomains="${['input_text']}"
               @value-changed="${e => {
                 const meal_entities = { ...(this._config.meal_entities || {}) };
                 meal_entities[day] = e.detail.value;
                 this._updateConfig({ meal_entities });
               }}">
             </ha-entity-picker>
           `)}
         </div>
       </ha-expansion-panel>

       <ha-expansion-panel header="Notes Configuration" outlined>
         <div class="panel-content">
           <ha-entity-picker 
             label="Notes To-do List"
             .hass="${this.hass}"
             .value="${this._config.notes_entity}"
             .includeDomains="${['todo']}"
             @value-changed="${e => this._updateConfig({ notes_entity: e.detail.value })}">
           </ha-entity-picker>
         </div>
       </ha-expansion-panel>
     </div>`;
}

static get styles() {
return css`
     .editor-shell { display: flex; flex-direction: column; gap: 12px; padding: 10px; color: var(--primary-text-color); }
     ha-expansion-panel { background: var(--secondary-background-color); border-radius: 12px; margin-bottom: 10px; }
     .panel-content { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
     ha-textfield, ha-select, ha-entity-picker { display: block; width: 100%; margin-top: 8px; }
     ha-icon-button { display: flex; align-items: center; justify-content: center; }
     .period-header { display: grid; grid-template-columns: 80px 80px 1fr 40px; gap: 8px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase; color: var(--secondary-text-color); padding: 0 8px; }
     .period-row { display: grid; grid-template-columns: 80px 80px 1fr 40px; gap: 8px; align-items: center; background: var(--primary-background-color); padding: 8px; border-radius: 8px; }
     .kid-box { padding: 15px; border: 1px solid var(--divider-color); border-radius: 12px; background: var(--card-background-color); display: flex; flex-direction: column; gap: 12px; }
     .kid-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
     .mapping-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
     .period-group { padding: 10px; background: var(--secondary-background-color); border-radius: 8px; border-left: 3px solid var(--accent-color, #7b61ff); display: flex; flex-direction: column; gap: 8px; }
     .period-group-title { display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 0.85rem; }
     .chore-row { display: grid; grid-template-columns: 1fr 40px; align-items: center; gap: 8px; padding: 8px; background: var(--primary-background-color); border-radius: 8px; border: 1px solid var(--divider-color); }
     .mush-btn { width: 100%; margin-top: 10px; }
   `;
}
}

customElements.define("nightlight-calendar-card", NightlightDashboard);
customElements.define("nightlight-card-editor", NightlightCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
type: "nightlight-calendar-card",
name: "Nightlight Hub v1.6.8",
description: "To-do memory and user detection enabled."
});




