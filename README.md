<<<<<<< HEAD
# Nightlight Custom Calendar
**A High-Performance, Touch-Optimized Calendar Card for Home Assistant.**

Nightlight is a custom HACS-compatible dashboard card inspired by the Skylight Calendar hardware. It is specifically architected for Full HD (1080p) touch panels, providing a clean, authoritative interface for family scheduling and multi-calendar management.

## Key Features
* **Four-Way Navigation:** Dynamic switching between Month, Week (Time-Grid), Day (Hourly), and Agenda views.
* **Interactive Filtering:** On-card "Pill" toggles to show/hide specific calendar entities on the fly.
* **Touch-First Design:** Optimized hit-targets and momentum scrolling designed for HP Touch Panel PCs in kiosk mode.
* **Secure Data Engine:** Utilizes the Home Assistant `callApi` websocket for authenticated, local-only data retrieval (No external cloud dependencies).
* **Zero-Build Architecture:** Delivered as a single-file Lit module for maximum portability and simple USB-based deployment.

---

## Installation

### Method 1: HACS (Recommended)
1. Open **HACS** in your Home Assistant instance.
2. Click the three dots in the top right and select **Custom repositories**.
3. Paste the URL of your GitHub repository.
4. Select **Lovelace** as the category.
5. Click **Install**.

### Method 2: Manual Portability Mode
1. Download the `nightlight-card.js` file.
2. Copy it to your Home Assistant configuration directory under `www/community/nightlight-ha-card/`.
3. Add the resource reference in **Settings > Dashboards > Resources**:
   - **URL:** `/local/community/nightlight-ha-card/nightlight-card.js`
   - **Type:** `JavaScript Module`

---

## Configuration

The card is configured via standard YAML. Each entity can be assigned a custom color to match family member profiles.

```yaml
type: custom:nightlight-calendar-card
title: "Family Schedule"
first_day: "monday"
entities:
  - entity: calendar.rick
    color: "#0071e3"
  - entity: calendar.sammy
    color: "#ff3b30"
  - entity: calendar.family_shared
    color: "#34c759"
=======
# Nightlight-Calendar
>>>>>>> fcd7ee5fe56726ee44cf54cd6ce309a2f7ecf6ca
