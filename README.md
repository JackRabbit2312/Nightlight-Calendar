Nightlight Dashboard Card (v1.4.0)

Nightlight Dashboard is a high-performance "Family Hub" card for Home Assistant, inspired by Skylight Calendar hardware. It consolidates calendars, meal planning, chore tracking, and family notes into a single, responsive interface.

Specifically architected for Full HD (1080p) touch panels, it provides a clean, authoritative interface for family scheduling and multi-calendar management without external cloud dependencies.

✨ Key Features

Functional

📅 Unified Calendar: Dynamic switching between Month, Week (Time-Grid), Day (Hourly), and Agenda views. Supports color-coding and on-the-fly "Persona" toggling.

🧹 Smart Chores:

Time-Gated Logic: Chores only appear during specific times (e.g., "Morning" vs "Evening").

User Detection: Filters chores based on the logged-in HA user.

Auto-Reset: Built-in logic automatically resets completed tasks to "needs action" the next day.

🍽️ Meal Planner: A 7-day persistent menu planner stored in Home Assistant input_text helpers.

📝 Digital Whiteboard: A "Post-it" style message board powered by Home Assistant To-Do lists.

Technical

⚡ Zero-Build Architecture: Delivered as a single-file Lit module for maximum portability.

🔒 Secure Data Engine: Utilizes the Home Assistant callApi websocket for authenticated, local-only data retrieval.

👆 Touch-First Design: Optimized hit-targets and momentum scrolling designed for wall-mounted kiosks.

🖱️ Visual Editor: Fully configurable via the Lovelace UI visual editor—no YAML required.

🛠️ Installation

Method 1: HACS (Recommended)

Open HACS in your Home Assistant instance.

Click the three dots in the top right and select Custom repositories.

Paste the URL: https://github.com/JackRabbit2312/Nightlight-Calendar/

Select Lovelace as the category.

Click Install.

Method 2: Manual Installation

Download the nightlight-card.js file.

Upload it to your Home Assistant config/www/ folder (e.g., www/community/nightlight-ha-card/).

Go to Settings > Dashboards > Three dots (top right) > Resources.

Add a new resource:

URL: /local/community/nightlight-ha-card/nightlight-card.js

Type: JavaScript Module

⚙️ Prerequisites (Required Helpers)

To utilize the Hub features (Meals, Chores, Notes), you must create specific Helper entities in Settings > Devices & Services > Helpers.

Feature

Helper Type

Quantity

Naming Example

Meal Planner

Text (input_text)

7 (One per day)

input_text.dinner_monday

Whiteboard

To-Do List (todo)

1

todo.family_notes

Chores

To-Do List (todo)

1 per child

todo.kid_one_chores

Note: You do not need to populate the Chore lists manually; the card manages items based on your config.

📝 Configuration

You can configure the card entirely using the Visual Editor. However, for power users, here is the full YAML schema.

type: custom:nightlight-calendar-card
title: "The Smith Family"
theme: light  # or 'dark'
logo_url: /lovelace/home
notes_entity: todo.family_notes

# 1. Calendars
entities:
  - entity: calendar.family_shared
    color: "#34c759"
    picture: /local/avatars/family.png
  - entity: calendar.rick
    color: "#0071e3"

# 2. Meal Planner (Map days to input_text entities)
meal_entities:
  Monday: input_text.dinner_monday
  Tuesday: input_text.dinner_tuesday
  Wednesday: input_text.dinner_wednesday
  Thursday: input_text.dinner_thursday
  Friday: input_text.dinner_friday
  Saturday: input_text.dinner_saturday
  Sunday: input_text.dinner_sunday

# 3. Chore Time Periods
periods:
  - name: Morning
    start: '06:00'
    end: '09:00'
  - name: Evening
    start: '17:00'
    end: '20:00'

# 4. Chore Profiles
chores:
  - name: Alice
    image: /local/images/alice.jpg
    todo_list: todo.alice_tasks # The backing HA entity
    assigned_user: alice_ha_user # Optional: Only show this profile if this user is logged in
    items:
      - label: Brush Teeth
        period: Morning
      - label: Pack Bag
        period: Morning

# 5. Sidebar Navigation (Custom Links)
navigation:
  - name: Cameras
    icon: mdi:cctv
    path: /dashboard-cameras
🧩 Feature Details

🧹 Chore Logic

The Chore system connects the dashboard configuration to a standard Home Assistant To-Do list.

Sync: When you click a task on the dashboard, it toggles the status in the linked To-Do entity.

Auto-Reset: Every time the dashboard is loaded, it checks if it's a new day. If it is, it runs a script to reset all configured items in the attached To-Do lists back to "Needs Action."

🍽️ Meal Planner Logic

The meal planner is persistent via Home Assistant storage.

It saves your text entry into the mapped input_text entity.

Entries older than 5 days are automatically visually cleared from the board to keep it fresh.

🎨 Styling & Theming

The card uses CSS variables that pull from your Home Assistant theme.

Core Variables: --card-background-color, --primary-text-color, --accent (defaults to #7b61ff).

Modes: Built-in Light and Dark modes are selectable in the editor.

⚠️ Troubleshooting

1. My Chores section says "No active chore period right now."
Check your periods config. The current time must be between the start and end time of a defined period.

2. I can't click the chore checkboxes.
Ensure the todo_list entity defined in the config actually exists in Home Assistant.

3. The Meal Planner isn't saving.
Ensure you have created the input_text helpers and mapped them correctly in the config meal_entities section.

Credits

Senior Dev Lead: Rick P. | Melbourne

Framework: LitElement

Repository: JackRabbit2312/Nightlight-Calendar

