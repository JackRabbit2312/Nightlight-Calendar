import { css } from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

export const styles = css`
	  :host { --accent: #7b61ff; --bg: #fdfdfd; --card: #fff; --text: #1a1a1b; --border: #eee; --gold: #ffd700; }
      .nightlight-hub.dark { --bg: #121212; --card: #1e1e1e; --text: #efefef; --border: #333; }
      .nightlight-hub { display: grid; grid-template-columns: 100px 1fr; height: calc(100vh - 100px); background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow: hidden; border-radius: 20px; margin: 10px; }
      
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
      .close-btn { width: 100%; padding: 20px; border: none; background: var(--accent); color: #fff; font-weight: 900; cursor: pointer; }
      
      .fab { position: fixed; bottom: 40px; right: 40px; width: 85px; height: 85px; border-radius: 50%; background: var(--accent); color: #fff; border: none; font-size: 3.5rem; cursor: pointer; box-shadow: 0 10px 25px rgba(123, 97, 255, 0.4); z-index: 100; }
      
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
	  
	  .editor-shell { display: flex; flex-direction: column; gap: 12px; padding: 10px; }
      ha-expansion-panel { background: var(--secondary-background-color); border-radius: 12px; margin-bottom: 10px; }
      
      /* Chore Builder v1.3.0 */
      .time-block-config { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 15px; background: rgba(0,0,0,0.05); border-radius: 8px; }
      .kid-config-card { padding: 15px; border: 1px solid var(--divider-color); border-radius: 12px; margin-top: 15px; background: var(--card-background-color); }
      .kid-header { display: flex; justify-content: space-between; align-items: center; }
      
      .task-entry { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-bottom: 1px solid var(--divider-color); position: relative; }
      .task-main { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
      .del-task { position: absolute; top: 0; right: 0; color: var(--error-color); }
      
      .add-kid-btn { margin-top: 20px; --mdc-theme-primary: var(--accent-color); }

      /* Persona Management v1.3.0 */
      .persona-row { padding: 12px; border-bottom: 1px solid var(--divider-color); }
      .persona-controls { display: grid; grid-template-columns: 50px 1fr; gap: 15px; align-items: center; margin-top: 10px; }
      input[type="color"] { width: 40px; height: 40px; border-radius: 50%; border: 2px solid var(--divider-color); cursor: pointer; padding: 0; }
`;