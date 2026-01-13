# Nightlight Hub (v1.6.8) 🏠

A high-performance, tablet-optimized family dashboard for **Home Assistant**. Designed in Melbourne for busy households, this dashboard focuses on local control, empathy-driven UI, and persistent memory.

---

## ✨ Key Features

### 📅 Advanced Family Calendar
* **Four Display Modes**: Month, Week, Day, and Agenda views.
* **Persona Filters**: Toggle individual family members' calendars with a single tap.
* **Custom Persona Icons**: Supports profile pictures or initials with dynamic coloring.

### 📝 Post-it Whiteboard (2026 Edition)
* **WebSocket Retrieval**: Uses high-speed WebSocket calls to fetch notes directly from your To-do list.
* **Post-it Grid**: Every entry in your `todo.family_notes` becomes a separate, organic-styled card.
* **Delete & Archive**: Clicking delete marks the item as "completed" in Home Assistant, archiving it for history while clearing your board.
* **Sidebar Alerts**: A red notification dot appears on the Sidebar when new notes are added.

### 🍴 Persistent Dinner Planner
* **Multi-Entity Storage**: Saves each day to a unique `input_text` entity to bypass the 255-character limit.
* **5-Day Auto-Clear**: Automatically wipes meal plans that are more than 5 days old based on hidden timestamps.
* **Cross-Device Sync**: Updates instantly on all tablets and mobile devices in the home.

### 🧹 Chore Dashboard
* **Time-Locked Periods**: Display specific tasks only during relevant times (e.g., "Morning Routine" or "After School").
* **Daily Auto-Reset**: Automatically unchecks all chores at a specified time every morning (e.g., 6:00 AM).
* **User-Specific Views**: Show only the tasks assigned to the currently logged-in HA user.

---

## 🚀 Installation

### 1. Requirements
* **Home Assistant** (Latest stable version).
* **Local To-do Integration**: For the Whiteboard feature.
* **Input Text Helpers**: Seven entities (e.g., `input_text.dinner_plan_monday`) for the Meal Planner.

### 2. Manual Installation
1.  Download `nightlight-card.js`.
2.  Upload it to your `/config/www/` directory.
3.  Add the resource to your Dashboards:
    ```yaml
    url: /local/nightlight-card.js
    type: module
    ```

---

### 🏁 Getting Started Checklist

Before installing the dashboard, ensure you have configured these items in Home Assistant:

- [ ] **Create 7 Dinner Helpers**: Go to **Settings > Devices & Services > Helpers** and create 7 `input_text` entities named `dinner_plan_monday` through `dinner_plan_sunday`.
- [ ] **Setup Local To-do List**: Add the **Local To-do** integration and create a list named `family_notes`.
- [ ] **Add a Placeholder Note**: Add at least one item to your new To-do list (e.g., "Welcome home!") so the dashboard has an initial item to display.
- [ ] **Organize Calendars**: Ensure the calendars you want to display are enabled and have distinct names in your YAML.
- [ ] **Map Chores**: If using the Chore Dashboard, verify each child's `todo_list` entity ID is correctly formatted (e.g., `todo.joel_chores`).

---

## 🛠 Configuration

### Example YAML Setup
```yaml
type: custom:nightlight-calendar-card
title: "Family Hub"
theme: "dark" # or "light"
notes_entity: todo.family_notes
meal_entities:
  Monday: input_text.dinner_plan_monday
  Tuesday: input_text.dinner_plan_tuesday
  Wednesday: input_text.dinner_plan_wednesday
  Thursday: input_text.dinner_plan_thursday
  Friday: input_text.dinner_plan_friday
  Saturday: input_text.dinner_plan_saturday
  Sunday: input_text.dinner_plan_sunday
entities:
  - entity: calendar.family
    color: "#7b61ff"
    picture: "/local/family_photo.jpg"
navigation:
  - name: "Security"
    icon: "mdi:shield-home"
    path: "/dashboard-security/0"
chores:
  - name: "Joel"
    todo_list: todo.joel_chores
    image: "/local/joel_avatar.png"
    items:
      - label: "Pack Bag"
        period: "Morning"

### ⚙️ Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `title` | string | `"Family Hub"` | The main header title for your dashboard. |
| `theme` | string | `"light"` | Supports `"light"` (Skylight) or `"dark"` (Nightlight). |
| `notes_entity` | string | **Mandatory** | The `todo.` entity used for the Whiteboard. |
| `meal_entities` | object | **Mandatory** | Mapping of 7 `input_text` entities for dinner. |
| `chores` | array | `[]` | List of child profiles and their associated tasks. |
| `navigation` | array | `[]` | Custom sidebar links (supports kiosk-mode iframes). |

---

### 💡 Technical Implementation Notes

#### WebSocket Notes Retrieval
The Whiteboard uses the `todo/item/list` WebSocket call. This is required because Home Assistant does not expose the full item list in the standard state machine attributes for many To-do integrations.

#### Daily Chore Reset
The card stores a `nightlight_reset_date` in the browser's `localStorage`. When the dashboard is first opened on any day that doesn't match that date, it iterates through all configured `todo_list` entities and resets completed items to `needs_action`.
