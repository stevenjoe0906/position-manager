(function() {
  if (document.getElementById('alphasize-pure-root')) return;

  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // React-Friendly Input Injection Helper
  function setNativeInputValue(inputElement, value) {
    if (!inputElement) return;

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;

    nativeInputValueSetter.call(inputElement, value);

    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 1. State Configuration
  let state = {
    assetName: 'CONNECTING...',
    accountEquity: 10000, 
    leverage: 3,
    riskPercent: 1,
    entryPrice: 0,          
    stopLossPrice: 0,       
    stopLossPercent: 0,     
    currentPrice: 0,        
    direction: 'LONG',
    useATR: false,
    atrMultiplier: 1,
    atrValue: null,
    atrPending: false,
    ticketDirection: null,
    dailyLossLimitPercent: 3, 
    currentDailyLossUSD: 0,
    dailyProfitUSD: 0,
    lossRecords: [] 
  };

  // 2. Storage Setup
  const dateKey = getTodayString();
  const storedData = localStorage.getItem('alphasize_daily_metrics_v3') || localStorage.getItem('alphasize_daily_metrics_v2');
  
  if (storedData) {
    try {
      const parsed = JSON.parse(storedData);
      if (parsed.date === dateKey) {
        state.lossRecords = normalizeProfitRecords(parsed);
        localStorage.setItem('alphasize_daily_metrics_v3', JSON.stringify({ date: dateKey, schema: 3, records: state.lossRecords }));
      } else {
        localStorage.setItem('alphasize_daily_metrics_v3', JSON.stringify({ date: dateKey, records: [] }));
      }
    } catch (e) {
      console.error("Failed parsing loss records", e);
    }
  } else {
    localStorage.setItem('alphasize_daily_metrics_v3', JSON.stringify({ date: dateKey, records: [] }));
  }

  recalculateTotalLossFromRecords();

  const host = document.createElement('div');
  host.id = 'alphasize-pure-root';
  Object.assign(host.style, {
    position: 'fixed',
    top: '75px',
    right: '25px',
    zIndex: '9999999',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    userSelect: 'none'
  });

  const shadowRoot = host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);

  const extRuntime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;

  // Construct the panel with DOM APIs instead of parsing HTML strings.
  // This also avoids createContextualFragment and innerHTML validator warnings.
  const panelStyle = document.createElement('style');
  panelStyle.textContent = "\n      .panel {\n        width: 340px;\n        background: #1c2030;\n        border: 1px solid #2a2e39;\n        border-radius: 8px;\n        padding: 16px;\n        color: #d1d4dc;\n        box-shadow: 0 10px 25px rgba(0,0,0,0.5);\n        display: block;\n      }\n      .panel.hidden { display: none; }\n\n      .global-header-row {\n        position: relative;\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        width: 100%;\n        margin-bottom: 14px;\n        padding: 4px 0;\n      }\n      .header { \n        font-size: 14px; \n        font-weight: 800; \n        color: #2962ff; \n        letter-spacing: 1.5px; \n        text-transform: uppercase; \n        cursor: move; \n        text-align: center;\n        width: 100%;\n        padding: 0 32px;\n      }\n      \n      .window-icon-btn {\n        position: absolute;\n        right: 0;\n        top: 50%;\n        transform: translateY(-50%);\n        background: transparent;\n        border: none;\n        color: #787b86;\n        cursor: pointer;\n        padding: 6px;\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        transition: color 0.15s, transform 0.15s;\n        border-radius: 4px;\n      }\n      .window-icon-btn:hover { color: #ffffff; background-color: rgba(255, 255, 255, 0.05); }\n      .window-icon-btn svg { width: 16px; height: 16px; fill: currentColor; }\n\n      .idol-quote-section {\n        display: flex;\n        align-items: center;\n        gap: 14px;\n        background: #131722;\n        border: 1px solid #2a2e39;\n        border-radius: 6px;\n        padding: 12px 14px;\n        margin-bottom: 14px;\n      }\n      .idol-avatar-box {\n        width: 48px;\n        height: 48px;\n        border-radius: 50%;\n        border: 2px solid #2a2e39;\n        overflow: hidden;\n        flex-shrink: 0;\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        background: #1c2030;\n      }\n      .idol-avatar-box img {\n        width: 100%;\n        height: 100%;\n        object-fit: cover;\n      }\n      .idol-text-box {\n        flex: 1;\n        display: flex;\n        align-items: center;\n      }\n      .idol-quote-content {\n        font-size: 14px;\n        line-height: 18px;\n        color: #e0e3eb;\n        font-style: italic;\n        font-weight: 600;\n      }\n\n      .expand-trigger-anchor {\n        position: fixed;\n        right: 0;\n        top: 50%;\n        transform: translateY(-50%);\n        width: 24px;\n        height: 60px;\n        background: #1c2030;\n        border: 1px solid #2a2e39;\n        border-right: none;\n        border-radius: 8px 0 0 8px;\n        display: none;\n        align-items: center;\n        justify-content: center;\n        color: #2962ff;\n        cursor: pointer;\n        box-shadow: -4px 0 15px rgba(0,0,0,0.4);\n        z-index: 99999999;\n        transition: color 0.15s, background-color 0.15s;\n      }\n      .expand-trigger-anchor:hover { background: #131722; color: #00e676; }\n      .expand-trigger-anchor.visible { display: flex; }\n      .expand-trigger-anchor svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }\n\n      .price { font-size: 24px; font-weight: bold; color: #ffffff; text-align: center; margin-bottom: 4px; }\n      \n      .direction-badge { \n        display: none; \n        font-size: 14px; \n        font-weight: 800; \n        text-align: center; \n        margin-bottom: 14px; \n        border-bottom: 1px solid #2a2e39; \n        padding-bottom: 10px; \n      }\n      .direction-badge.visible { display: block; }\n      .dir-long { color: #00e676; }\n      .dir-short { color: #ff5252; }\n\n      .grid { display: flex; gap: 12px; margin-bottom: 12px; }\n      .grid > div { flex: 1; }\n      label { display: block; font-size: 14px; color: #787b86; text-transform: uppercase; margin-bottom: 6px; font-weight: bold; }\n      input { width: 100%; padding: 8px 10px; background: #131722; border: 1px solid #2a2e39; border-radius: 4px; color: #ffffff; box-sizing: border-box; font-size: 14px; }\n      input:focus { border-color: #2962ff; outline: none; }\n      .read-only-badge { font-size: 11px; background: #2962ff22; color: #2962ff; padding: 2px 5px; border-radius: 3px; float: right; margin-top: 2px; }\n      \n      .tracker-block { \n        background: #131722; \n        padding: 10px; \n        border-radius: 6px; \n        border: 1px solid #2a2e39; \n        margin-bottom: 12px; \n      }\n      .tracker-flex { \n        display: flex; \n        justify-content: space-between; \n        align-items: center; \n        font-size: 14px; \n      }\n      .loss-input-row { display: flex; gap: 8px; margin-top: 10px; margin-bottom: 10px; }\n      \n      .inline-add-icon-btn { \n        background: transparent; \n        border: 1px solid #2a2e39; \n        color: #787b86; \n        padding: 0 12px; \n        border-radius: 4px; \n        cursor: pointer; \n        transition: color 0.15s, background-color 0.15s, border-color 0.15s; \n        display: flex;\n        align-items: center;\n        justify-content: center;\n      }\n      .inline-add-icon-btn:hover { color: #ffffff; background-color: #2a2e39; border-color: #787b86; }\n      .inline-add-icon-btn svg { width: 14px; height: 14px; fill: currentColor; }\n\n      .action-icon-btn {\n        background: transparent;\n        border: none;\n        color: #787b86;\n        cursor: pointer;\n        padding: 4px;\n        border-radius: 4px;\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        transition: color 0.15s, background-color 0.15s;\n      }\n      .action-icon-btn:hover { color: #ffffff; background-color: #2a2e39; }\n      .action-icon-btn svg { width: 16px; height: 16px; fill: currentColor; }\n\n      .loss-log-list { \n        max-height: 125px; \n        overflow-y: auto; \n        border-top: 1px solid #2a2e39; \n        padding-top: 8px;\n        display: flex;\n        flex-direction: column;\n        gap: 6px;\n      }\n      .loss-log-list::-webkit-scrollbar { width: 4px; }\n      .loss-log-list::-webkit-scrollbar-thumb { background: #2a2e39; border-radius: 2px; }\n      \n      .loss-log-item {\n        display: flex;\n        justify-content: space-between;\n        align-items: center;\n        background: #1c2030;\n        padding: 6px 10px;\n        border-radius: 4px;\n        border: 1px solid #2a2e39;\n      }\n      .log-meta-stack { display: flex; flex-direction: column; gap: 2px; }\n      .log-primary-row { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }\n      .log-ticker-name { color: #b2b5be; }\n      .log-val-amount { color: #ff5252; font-weight: bold; }\n      .log-time-secondary { font-size: 11px; color: #5d606b; font-variant-numeric: tabular-nums; font-weight: normal; }\n      \n      .remove-log-btn {\n        background: transparent;\n        border: none;\n        padding: 4px;\n        cursor: pointer;\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        color: #787b86;\n        border-radius: 3px;\n        transition: color 0.15s, background 0.15s;\n      }\n      .remove-log-btn:hover { color: #ff5252; background: rgba(255, 82, 82, 0.15); }\n      .remove-log-btn svg { width: 12px; height: 12px; fill: currentColor; }\n\n      .output-area { background: #131722; padding: 14px; border-radius: 6px; border: 1px solid #2a2e39; margin-top: 16px; }\n      .output-lbl { font-size: 14px; color: #787b86; text-transform: uppercase; font-weight: bold; }\n      .output-val { font-size: 26px; font-weight: bold; color: #00e676; margin: 6px 0 2px 0; font-variant-numeric: tabular-nums; }\n      \n      .aux-container { font-size: 13px; color: #787b86; margin-bottom: 6px; display: flex; justify-content: space-between; }\n      .aux-val { color: #b2b5be; font-weight: 500; font-variant-numeric: tabular-nums; }\n      .aux-val-danger { color: #ff5252; font-weight: 700; font-variant-numeric: tabular-nums; }\n\n      .apply-btn { width: 100%; border: none; color: #ffffff; background: #2962ff; padding: 10px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold; transition: background 0.15s; margin-top: 8px; }\n      .apply-btn:hover { background: #1e4bd8; }\n      .apply-btn.success { background: #00e676; color: #131722; }\n      .apply-btn:disabled { background: #2a2e39; color: #787b86; cursor: not-allowed; }\n      \n      .warning { display: none; background: rgba(255, 82, 82, 0.15); border: 1px solid #ff5252; color: #ff5252; padding: 8px; border-radius: 4px; font-size: 14px; margin-top: 10px; font-weight: bold; text-align: center; }\n      .warning.active { display: block; }\n    ";
  panelStyle.textContent += `
    .panel { max-height: calc(100vh - 110px); overflow-y: auto; }
    .apply-btn.long { background: #31BD65; }
    .apply-btn.long:hover { background: #279751; }
    .apply-btn.short { background: #F23645; }
    .apply-btn.short:hover { background: #CE2432; }
    .apply-btn:disabled, .apply-btn:disabled:hover { background: #2a2e39; color: #787b86; }
    .atr-toggle { text-transform: none; display: flex; align-items: center; gap: 8px; }
    .atr-toggle input { width: auto; }
    .atr-options { display: flex; gap: 6px; margin: 8px 0; }
    .atr-options button { font-size: 16px; font-weight: 600; flex: 1; padding: 7px; background: #131722; color: #d1d4dc; border: 1px solid #2a2e39; border-radius: 4px; cursor: pointer; }
    .atr-options button[aria-pressed="true"] { border-color: #2962ff; background: #2962ff33; color: #fff; }
    .atr-status { font-size: 12px; color: #b2b5be; line-height: 1.4; }
  `;
  shadowRoot.appendChild(panelStyle);

  const svgNS = 'http://www.w3.org/2000/svg';
  function addPanelElement(parent, tag, attrs = {}, text = null) {
    const element = (tag === 'svg' || tag === 'path' || tag === 'polyline')
      ? document.createElementNS(svgNS, tag)
      : document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      element.setAttribute(name, value);
    }
    if (text !== null) element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  const panelEl1 = addPanelElement(shadowRoot, "div", {"class": "expand-trigger-anchor", "id": "widget-expand-trigger", "title": "Expand AlphaSize Panel"});
  const panelEl2 = addPanelElement(panelEl1, "svg", {"viewBox": "0 0 24 24"});
  const panelEl3 = addPanelElement(panelEl2, "polyline", {"points": "15 18 9 12 15 6"});
  const panelEl4 = addPanelElement(shadowRoot, "div", {"class": "panel", "id": "main-widget-panel"});
  const panelEl5 = addPanelElement(panelEl4, "div", {"class": "global-header-row"});
  const panelEl6 = addPanelElement(panelEl5, "div", {"class": "header", "id": "drag-handle"});
  const panelEl7 = addPanelElement(panelEl5, "button", {"class": "window-icon-btn", "id": "widget-minimize-trigger", "title": "Minimize Window"});
  const panelEl8 = addPanelElement(panelEl7, "svg", {"viewBox": "0 0 24 24"});
  const panelEl9 = addPanelElement(panelEl8, "path", {"d": "M19 13H5v-2h14v2z"});
  const panelEl10 = addPanelElement(panelEl4, "div", {"class": "idol-quote-section"});
  const panelEl11 = addPanelElement(panelEl10, "div", {"class": "idol-avatar-box"});
  const panelEl12 = addPanelElement(panelEl11, "img", {"src": "", "alt": "Avatar"});
  const panelEl13 = addPanelElement(panelEl10, "div", {"class": "idol-text-box"});
  const panelEl14 = addPanelElement(panelEl13, "span", {"class": "idol-quote-content"});
  panelEl14.appendChild(document.createTextNode("\"It never was my thinking that made the big money for me. It always was my sitting.\""));
  const panelEl17 = addPanelElement(panelEl4, "div", {"class": "tracker-block"});
  const panelEl18 = addPanelElement(panelEl17, "div", {"class": "tracker-flex"});
  const panelEl19 = addPanelElement(panelEl18, "div", {});
  const panelEl20 = addPanelElement(panelEl19, "span", {"style": "color:#787b86; font-size: 14px; font-weight: bold; text-transform: uppercase; margin-right: 4px;"});
  panelEl20.appendChild(document.createTextNode("Daily Profit:"));
  const panelEl21 = addPanelElement(panelEl19, "span", {"id": "loss-display", "style": "font-weight: bold; color: #ffffff;"});
  panelEl21.appendChild(document.createTextNode("$0.00"));
  const panelEl22 = addPanelElement(panelEl18, "button", {"class": "action-icon-btn", "id": "clear-all-btn", "title": "Clear All Log Entries"});
  const panelEl23 = addPanelElement(panelEl22, "svg", {"viewBox": "0 0 24 24"});
  const panelEl24 = addPanelElement(panelEl23, "path", {"d": "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"});
  const panelEl25 = addPanelElement(panelEl17, "div", {"class": "loss-input-row"});
  const panelEl26 = addPanelElement(panelEl25, "input", {"type": "number", "id": "loss-adder", "placeholder": "+Profit / -Loss ($)", "step": "any", "aria-label": "Profit or loss in dollars", "style": "font-size: 14px; padding: 6px 8px;"});
  const recordDirection = addPanelElement(panelEl25, 'select', { 'aria-label': 'Trade direction', style: 'background: #131722; color: #fff; border: 1px solid #2a2e39; border-radius: 4px; font-size: 14px;' });
  addPanelElement(recordDirection, 'option', { value: 'LONG' }, 'Long');
  addPanelElement(recordDirection, 'option', { value: 'SHORT' }, 'Short');
  const panelEl27 = addPanelElement(panelEl25, "button", {"class": "inline-add-icon-btn", "id": "add-loss-btn", "title": "Commit Log Entry"});
  const panelEl28 = addPanelElement(panelEl27, "svg", {"viewBox": "0 0 24 24"});
  const panelEl29 = addPanelElement(panelEl28, "path", {"d": "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"});
  const panelEl30 = addPanelElement(panelEl17, "div", {"class": "loss-log-list", "id": "loss-log-list"});
  const panelEl31 = addPanelElement(panelEl4, "div", {"class": "grid"});
  const panelEl32 = addPanelElement(panelEl31, "div", {});
  const panelEl33 = addPanelElement(panelEl32, "label", {});
  panelEl33.appendChild(document.createTextNode("Equity ($)"));
  const panelEl34 = addPanelElement(panelEl32, "input", {"type": "number", "id": "eq", "value": ""});
  const panelEl35 = addPanelElement(panelEl31, "div", {});
  const panelEl36 = addPanelElement(panelEl35, "label", {});
  panelEl36.appendChild(document.createTextNode("Leverage"));
  const panelEl37 = addPanelElement(panelEl35, "input", {"type": "number", "id": "lev", "value": ""});
  const panelEl38 = addPanelElement(panelEl4, "div", {"class": "grid"});
  const panelEl39 = addPanelElement(panelEl38, "div", {});
  const panelEl40 = addPanelElement(panelEl39, "label", {});
  panelEl40.appendChild(document.createTextNode("Risk (%)"));
  const panelEl41 = addPanelElement(panelEl39, "input", {"type": "number", "id": "rsk", "step": "0.1", "value": ""});
  const panelEl42 = addPanelElement(panelEl38, "div", {});
  const panelEl43 = addPanelElement(panelEl42, "label", {});
  panelEl43.appendChild(document.createTextNode("MAX DD (%)"));
  const panelEl44 = addPanelElement(panelEl42, "input", {"type": "number", "id": "loss-cap", "step": "0.5", "value": ""});
  const panelEl45 = addPanelElement(panelEl4, "div", {"class": "grid"});
  const panelEl46 = addPanelElement(panelEl45, "div", {});
  const panelEl47 = addPanelElement(panelEl46, "label", {});
  panelEl47.appendChild(document.createTextNode("Entry Price"));
  const panelEl48 = addPanelElement(panelEl46, "input", {"type": "number", "id": "entry-price", "step": "0.00001", "placeholder": "Type Entry..."});
  const panelEl49 = addPanelElement(panelEl45, "div", {});
  const panelEl50 = addPanelElement(panelEl49, "label", {});
  panelEl50.appendChild(document.createTextNode("Stop Loss Price"));
  const panelEl51 = addPanelElement(panelEl49, "input", {"type": "number", "id": "sl-price", "step": "0.00001", "placeholder": "Type SL..."});
  const atrBlock = addPanelElement(panelEl4, 'div', { class: 'tracker-block' });
  const atrHeader = addPanelElement(atrBlock, 'div', { style: 'display: flex; align-items: center; justify-content: space-between; gap: 8px;' });
  const atrLabel = addPanelElement(atrHeader, 'label', { class: 'atr-toggle', style: 'margin-bottom: 0;' });
  const inputUseATR = addPanelElement(atrLabel, 'input', { type: 'checkbox', id: 'use-atr' });
  addPanelElement(atrLabel, 'span', {}, 'Use ATR for Stop');
  const atrControls = addPanelElement(atrBlock, 'div', { hidden: '' });
  const atrStatus = addPanelElement(atrHeader, 'span', { class: 'atr-status', role: 'status', 'aria-label': 'Current ATR', style: 'font-size: 14px; white-space: nowrap; text-align: right;' }, '—');
  const atrMultipliers = addPanelElement(atrControls, 'div', { class: 'atr-options', role: 'group', 'aria-label': 'ATR multiplier' });
  const atrMultiplierButtons = [1, 2, 3, 4].map(multiplier => {
    const button = addPanelElement(atrMultipliers, 'button', { type: 'button', 'aria-pressed': String(multiplier === 1) }, `${multiplier}x`);
    button.addEventListener('click', () => {
      state.atrMultiplier = multiplier;
      requestATRStop();
    });
    return button;
  });
  const panelEl56 = addPanelElement(panelEl4, "div", {"class": "output-area"});
  const panelEl57 = addPanelElement(panelEl56, "div", {"class": "output-lbl"});
  panelEl57.appendChild(document.createTextNode("Amount (Tokens / Units)"));
  const panelEl58 = addPanelElement(panelEl56, "div", {"class": "output-val", "id": "amount-display"});
  panelEl58.appendChild(document.createTextNode("0.00"));
  const panelEl59 = addPanelElement(panelEl56, "div", {"class": "aux-container", "style": "margin-top: 10px;"});
  const panelEl60 = addPanelElement(panelEl59, "span", {});
  panelEl60.appendChild(document.createTextNode("Position Size (Nominal):"));
  const panelEl61 = addPanelElement(panelEl59, "span", {"class": "aux-val", "id": "nominal-display"});
  panelEl61.appendChild(document.createTextNode("$0.00"));
  const realLeverageRow = addPanelElement(panelEl56, 'div', { class: 'aux-container' });
  addPanelElement(realLeverageRow, 'span', {}, 'Real Leverage:');
  const elRealLeverage = addPanelElement(realLeverageRow, 'span', { class: 'aux-val', id: 'real-leverage-display' }, '0.00x');
  const panelEl62 = addPanelElement(panelEl56, "div", {"class": "aux-container"});
  const panelEl63 = addPanelElement(panelEl62, "span", {});
  panelEl63.appendChild(document.createTextNode("Real Margin Used:"));
  const panelEl64 = addPanelElement(panelEl62, "span", {"class": "aux-val", "id": "margin-display", "style": "font-weight: bold; color: #ffffff;"});
  panelEl64.appendChild(document.createTextNode("$0.00"));
  const panelEl65 = addPanelElement(panelEl56, "div", {"class": "aux-container"});
  const panelEl66 = addPanelElement(panelEl65, "span", {});
  panelEl66.appendChild(document.createTextNode("Max DD Loss Money:"));
  const panelEl67 = addPanelElement(panelEl65, "span", {"class": "aux-val-danger", "id": "max-dd-money-display"});
  panelEl67.appendChild(document.createTextNode("-$0.00"));
  const panelEl68 = addPanelElement(panelEl56, "div", {"class": "aux-container"});
  const panelEl69 = addPanelElement(panelEl68, "span", {});
  panelEl69.appendChild(document.createTextNode("Stop Loss Money:"));
  const panelEl70 = addPanelElement(panelEl68, "span", {"class": "aux-val-danger", "id": "sl-money-display"});
  panelEl70.appendChild(document.createTextNode("-$0.00"));
  const distanceRow = addPanelElement(panelEl56, 'div', { class: 'aux-container' });
  addPanelElement(distanceRow, 'span', {}, 'Stop Loss Distance:');
  addPanelElement(distanceRow, 'span', { class: 'aux-val', id: 'sl-distance' }, '0.00% · 0');
  const panelEl71 = addPanelElement(panelEl56, "button", {"class": "apply-btn", "id": "apply-btn"});
  panelEl71.appendChild(document.createTextNode("Apply Position"));
  const panelEl72 = addPanelElement(panelEl56, "div", {"class": "warning", "id": "warn-banner"});
  panelEl72.appendChild(document.createTextNode("⚠️ EXCEEDS RISK LIMITS!"));

  shadowRoot.getElementById('drag-handle').textContent = state.assetName;
  shadowRoot.querySelector('.idol-avatar-box img').src = extRuntime.getURL('livermore.jpg');
  shadowRoot.getElementById('eq').value = state.accountEquity;
  shadowRoot.getElementById('lev').value = state.leverage;
  shadowRoot.getElementById('rsk').value = state.riskPercent;
  shadowRoot.getElementById('loss-cap').value = state.dailyLossLimitPercent;

  // UI Element Cache
  const panelMain = shadowRoot.getElementById('main-widget-panel');
  const btnMinimize = shadowRoot.getElementById('widget-minimize-trigger');
  const btnExpand = shadowRoot.getElementById('widget-expand-trigger');

  const dragHandle = shadowRoot.getElementById('drag-handle');
  const elAmount = shadowRoot.getElementById('amount-display');
  const elNominal = shadowRoot.getElementById('nominal-display');
  const elMargin = shadowRoot.getElementById('margin-display'); 
  const elMaxDDMoney = shadowRoot.getElementById('max-dd-money-display');
  const elSLMoney = shadowRoot.getElementById('sl-money-display');
  const btnApply = shadowRoot.getElementById('apply-btn');
  const elWarn = shadowRoot.getElementById('warn-banner');
  const inputEquity = shadowRoot.getElementById('eq');
  const inputSLDistance = shadowRoot.getElementById('sl-distance');
  const inputEntryPrice = shadowRoot.getElementById('entry-price');
  const inputSLPrice = shadowRoot.getElementById('sl-price');
  const elLossDisplay = shadowRoot.getElementById('loss-display');
  const inputLossAdder = shadowRoot.getElementById('loss-adder');
  const btnAddLoss = shadowRoot.getElementById('add-loss-btn');
  const btnClearAll = shadowRoot.getElementById('clear-all-btn');
  const containerLogList = shadowRoot.getElementById('loss-log-list');

  renderLossLogsUI();

  btnMinimize.addEventListener('click', (e) => {
    e.stopPropagation();
    panelMain.classList.add('hidden');
    btnExpand.classList.add('visible');
  });

  btnExpand.addEventListener('click', (e) => {
    e.stopPropagation();
    panelMain.classList.remove('hidden');
    btnExpand.classList.remove('visible');
  });

  const isolateKeyboardEvents = (inputElement) => {
    ['keydown', 'keyup', 'keypress', 'paste'].forEach(eventType => {
      inputElement.addEventListener(eventType, (e) => {
        if (e.key === 'Enter' && inputElement.id === 'loss-adder' && eventType === 'keydown') {
          commitClosedLoss();
        }
        e.stopPropagation(); 
      }, { capture: true }); 
    });
  };

  shadowRoot.querySelectorAll('input, select').forEach(input => {
    isolateKeyboardEvents(input);
  });

  [btnAddLoss, btnClearAll, btnMinimize, btnExpand].forEach(btn => {
    btn.addEventListener('click', (e) => e.stopPropagation());
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
  });

  function normalizeProfitRecords(parsed) {
    return (Array.isArray(parsed.records) ? parsed.records : [])
      .filter(record => Number.isFinite(record.val))
      .map(record => ({ ...record, val: parsed.schema === 3 ? record.val : -Math.abs(record.val) }));
  }

  function recalculateTotalLossFromRecords() {
    state.dailyProfitUSD = state.lossRecords.reduce((total, record) => total + record.val, 0);
    state.currentDailyLossUSD = state.lossRecords.reduce((total, record) => total + Math.max(0, -record.val), 0);
  }

  function formatProfit(value) {
    return `${value < 0 ? '-' : value > 0 ? '+' : ''}${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function saveRecordsToLocalStorage() {
    localStorage.setItem('alphasize_daily_metrics_v3', JSON.stringify({
      date: getTodayString(),
      schema: 3,
      records: state.lossRecords
    }));
  }

  function renderLossLogsUI() {
    elLossDisplay.textContent = formatProfit(state.dailyProfitUSD);
    elLossDisplay.style.color = state.dailyProfitUSD < 0 ? '#F23645' : '#31BD65';

    containerLogList.replaceChildren();
    if (state.lossRecords.length === 0) {
      containerLogList.style.display = 'none';
      return;
    }
    containerLogList.style.display = 'flex';

    state.lossRecords.forEach(record => {
      const itemRow = document.createElement('div');
      itemRow.className = 'loss-log-item';
      
      const metaStack = document.createElement('div');
      metaStack.className = 'log-meta-stack';
      const primaryRow = document.createElement('div');
      primaryRow.className = 'log-primary-row';
      const assetName = document.createElement('span');
      assetName.className = 'log-ticker-name';
      assetName.textContent = record.asset || 'UNKNOWN';
      const amount = document.createElement('span');
      amount.className = 'log-val-amount';
      amount.textContent = formatProfit(record.val);
      amount.style.color = record.val < 0 ? '#F23645' : '#31BD65';
      primaryRow.append(assetName);
      if (record.direction === 'LONG' || record.direction === 'SHORT') {
        const direction = document.createElement('span');
        direction.textContent = record.direction === 'LONG' ? 'Long' : 'Short';
        direction.style.color = record.direction === 'LONG' ? '#31BD65' : '#F23645';
        primaryRow.append(direction);
      }
      primaryRow.append(amount);
      const time = document.createElement('span');
      time.className = 'log-time-secondary';
      time.textContent = record.time;
      metaStack.append(primaryRow, time);

      const btnRemove = document.createElement('button');
      btnRemove.className = 'remove-log-btn';
      btnRemove.dataset.id = String(record.id);
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z');
      svg.appendChild(path);
      btnRemove.appendChild(svg);
      itemRow.append(metaStack, btnRemove);

      btnRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        removeSingleLossItem(record.id);
      });
      btnRemove.addEventListener('mousedown', (e) => e.stopPropagation());

      containerLogList.appendChild(itemRow);
    });
  }

  function updateApplyButton() {
    const direction = state.ticketDirection;
    btnApply.classList.toggle('long', direction === 'LONG');
    btnApply.classList.toggle('short', direction === 'SHORT');
    if (!btnApply.classList.contains('success')) {
      btnApply.textContent = direction === 'LONG' ? 'Apply Long Position'
        : direction === 'SHORT' ? 'Apply Short Position' : 'Apply Position';
    }
  }

  function calculateRiskSystem() {
    updateApplyButton();
    if (state.stopLossPrice > 0 && state.entryPrice > 0) {
      if (state.stopLossPrice >= state.entryPrice) {
        state.direction = 'SHORT';
        state.stopLossPercent = ((state.stopLossPrice - state.entryPrice) / state.entryPrice) * 100;
      } else {
        state.direction = 'LONG';
        state.stopLossPercent = ((state.entryPrice - state.stopLossPrice) / state.entryPrice) * 100;
      }
      inputSLDistance.textContent = `${state.stopLossPercent.toFixed(2)}% · ${Number(Math.abs(state.entryPrice - state.stopLossPrice).toPrecision(12))}`;
    } else {
      inputSLDistance.textContent = '0.00% · 0';
      state.stopLossPercent = 0;
    }

    const dollarRisk = state.accountEquity * (state.riskPercent / 100);
    const maxDDRiskUSD = state.accountEquity * (state.dailyLossLimitPercent / 100);
    const slDecimal = state.stopLossPercent / 100;
    
    let nominalSize = slDecimal > 0 ? dollarRisk / slDecimal : 0;
    const requiredMargin = state.leverage > 0 ? (nominalSize / state.leverage) : 0;
    let realTokenAmount = (nominalSize > 0 && state.entryPrice > 0) ? (nominalSize / state.entryPrice) : 0;

    const projectedSLLossUSD = (state.stopLossPrice > 0 && state.entryPrice > 0 && realTokenAmount > 0) 
      ? Math.abs(state.entryPrice - state.stopLossPrice) * realTokenAmount 
      : 0;

    let isBlocked = false;
    let warningMessage = '⚠️ EXCEEDS RISK LIMITS!';

    if (state.currentDailyLossUSD >= maxDDRiskUSD) {
      isBlocked = true;
      nominalSize = 0;
      realTokenAmount = 0;
      warningMessage = '🛑 DAILY LOSS LIMIT HIT! STOP TRADING!';
    } else if (requiredMargin > state.accountEquity && nominalSize > 0) {
      isBlocked = true;
      warningMessage = '⚠️ POSITION EXCEEDS TOTAL EQUITY!';
    }

    if (isBlocked) {
      elWarn.textContent = warningMessage;
      elWarn.classList.add('active');
      elAmount.style.color = '#ff5252';
      btnApply.disabled = true;
    } else {
      elWarn.classList.remove('active');
      elAmount.style.color = '#00e676';
      btnApply.disabled = false;
    }

    elAmount.textContent = realTokenAmount.toLocaleString(undefined, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    
    elNominal.textContent = `$${nominalSize.toLocaleString(undefined, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;

    const realLeverage = state.accountEquity > 0 ? nominalSize / state.accountEquity : 0;
    elRealLeverage.textContent = Number.isFinite(realLeverage) ? `${realLeverage.toFixed(2)}x` : '0.00x';

    elMargin.textContent = `$${requiredMargin.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;

    elMaxDDMoney.textContent = `-$${maxDDRiskUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    elSLMoney.textContent = `-$${projectedSLLossUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (requiredMargin > (state.accountEquity * 0.5) && !isBlocked) {
      elMargin.style.color = '#ff9800'; 
    } else {
      elMargin.style.color = '#ffffff';
    }

    btnApply.setAttribute('data-amount', realTokenAmount.toFixed(2));
  }

  function commitClosedLoss() {
    const lossVal = Number(inputLossAdder.value);
    if (Number.isFinite(lossVal) && lossVal !== 0) {
      const now = new Date();
      const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      
      state.lossRecords.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        time: timeString,
        val: lossVal,
        direction: recordDirection.value,
        asset: state.assetName
      });

      recalculateTotalLossFromRecords();
      saveRecordsToLocalStorage();
      renderLossLogsUI();
      
      inputLossAdder.value = ''; 
      calculateRiskSystem();
      
      setTimeout(() => { containerLogList.scrollTop = containerLogList.scrollHeight; }, 50);
    }
  }

  function removeSingleLossItem(id) {
    state.lossRecords = state.lossRecords.filter(item => item.id !== id);
    recalculateTotalLossFromRecords();
    saveRecordsToLocalStorage();
    renderLossLogsUI();
    calculateRiskSystem();
  }

  function masterClearAllLosses() {
    if (confirm("Are you sure you want to clear all profit and loss records for today?")) {
      state.lossRecords = [];
      recalculateTotalLossFromRecords();
      saveRecordsToLocalStorage();
      renderLossLogsUI();
      calculateRiskSystem();
    }
  }

  btnAddLoss.addEventListener('click', commitClosedLoss);
  btnClearAll.addEventListener('click', masterClearAllLosses);

  // --- Draggable Setup ---
  let isDragging = false;
  let offsetX = 0, offsetY = 0;
  dragHandle.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - host.getBoundingClientRect().left;
    offsetY = e.clientY - host.getBoundingClientRect().top;
    dragHandle.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    host.style.left = `${e.clientX - offsetX}px`;
    host.style.top = `${e.clientY - offsetY}px`;
    host.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      dragHandle.style.cursor = 'move';
    }
  });

  const bindInput = (id, stateKey) => {
    shadowRoot.getElementById(id).addEventListener('input', (e) => {
      state[stateKey] = Number(e.target.value);
      calculateRiskSystem();
    });
  };

  bindInput('eq', 'accountEquity');
  bindInput('lev', 'leverage');
  bindInput('rsk', 'riskPercent');
  bindInput('loss-cap', 'dailyLossLimitPercent');
  
  inputEntryPrice.addEventListener('input', (e) => {
    state.entryPrice = Number(e.target.value);
    if (state.useATR) requestATRStop();
    calculateRiskSystem();
  });

  inputSLPrice.addEventListener('input', (e) => {
    state.stopLossPrice = Number(e.target.value);
    disableATR();
    queueTicketStop(state.stopLossPrice);
    calculateRiskSystem();
  });

  // Explicit Manual Injection Event Listener
  btnApply.addEventListener('click', () => {
    const val = btnApply.getAttribute('data-amount') || '0';
    if (parseFloat(val) <= 0) return;

    const nativeQtyInput = document.getElementById('quantity-field');
    if (nativeQtyInput) {
      setNativeInputValue(nativeQtyInput, val);
      
      btnApply.textContent = 'Position Applied! ✓';
      btnApply.classList.add('success');
      setTimeout(() => {
        btnApply.classList.remove('success');
        updateApplyButton();
      }, 1000);
    } else {
      console.warn("Target #quantity-field element not found on page.");
    }
  });

  function cleanAndParseFloat(text) {
    if (!text) return 0;
    return parseFloat(text.replace(/[^0-9.-]/g, '')) || 0;
  }

  const ticketStopSelector = 'input[data-qa-id~="order-ticket-stop-loss-input"]';
  let writingTicketStop = false;
  let pendingTicketStop = null;
  let lastTicketStopValue;

  function readTicketDirection() {
    const sides = ['buy', 'sell'].filter(side =>
      Array.from(document.querySelectorAll('[data-name="side-control-' + side + '"]')).some(el =>
        el.getClientRects().length && Array.from(el.classList).some(name => name === 'active' || name.startsWith('active-'))
      )
    );
    return sides.length === 1 ? (sides[0] === 'buy' ? 'LONG' : 'SHORT') : null;
  }

  function readTicketLeverage() {
    const buttons = Array.from(document.querySelectorAll('[data-qa-id="leverage-button"]')).filter(el => el.getClientRects().length);
    if (buttons.length !== 1) return null;
    const match = buttons[0].textContent.trim().match(/^(\d+(?:\.\d+)?)\s*[x×]$/i);
    const value = match ? Number(match[1]) : 0;
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function disableATR() {
    state.useATR = false;
    state.atrPending = false;
    inputUseATR.checked = false;
    pendingTicketStop = null;
    updateATRControls();
  }

  function queueTicketStop(value) {
    pendingTicketStop = Number.isFinite(value) && value > 0 ? { value, attempts: 0 } : null;
    flushTicketStop();
  }

  function flushTicketStop() {
    if (!pendingTicketStop) return;
    if (++pendingTicketStop.attempts > 10) {
      pendingTicketStop = null;
      console.warn('Could not fill TradingView stop loss. Check the order ticket.');
      return;
    }
    writingTicketStop = true;
    try {
      const toggle = document.querySelector('input[data-qa-id="order-ticket-stop-loss-checkbox-bracket"]');
      if (toggle && !toggle.checked) toggle.click();
      // Enabling the switch can mount the input on a subsequent render.
      const input = document.querySelector(ticketStopSelector);
      if (!input || input.disabled || (toggle && !toggle.checked)) return;
      setNativeInputValue(input, String(pendingTicketStop.value));
      lastTicketStopValue = input.value;
      pendingTicketStop = null;
    } finally {
      writingTicketStop = false;
    }
  }

  function acceptTicketStop(input) {
    lastTicketStopValue = input.value;
    disableATR();
    state.stopLossPrice = cleanAndParseFloat(input.value);
    inputSLPrice.value = input.value === '' ? '' : state.stopLossPrice;
    calculateRiskSystem();
  }

  // Capture before TradingView can stop propagation; some controls emit change
  // only. Polling also catches drag/stepper updates that emit neither event.
  function onTicketStopEdit(event) {
    if (writingTicketStop || !event.target.matches?.(ticketStopSelector)) return;
    acceptTicketStop(event.target);
  }
  document.addEventListener('input', onTicketStopEdit, true);
  document.addEventListener('change', onTicketStopEdit, true);

  function observeTicketStop() {
    const input = document.querySelector(ticketStopSelector);
    if (!input || writingTicketStop || pendingTicketStop) return;
    if (lastTicketStopValue !== undefined && input.value !== lastTicketStopValue) {
      acceptTicketStop(input);
    } else {
      lastTicketStopValue = input.value;
    }
  }

  // Read only a named ATR study's value, never its length/settings or another indicator.
  // TradingView's legend follows the crosshair, so this is the displayed value.
  function readChartATR() {
    const charts = Array.from(document.querySelectorAll('.chart-container'));
    const active = charts.filter(chart => chart.classList.contains('active'));
    if (charts.length > 1 && active.length !== 1) return null;
    const scope = active[0] || charts[0] || document;
    const rows = scope.querySelectorAll('[data-name="legend-source-item"]');
    const plotsToRead = new Set();
    // Current TradingView markup labels the plot itself, without requiring
    // a legend-source-item/title ancestor. Match the stable attribute, not
    // the generated class suffix (for example valueValue-quatTGAC).
    for (const item of scope.querySelectorAll('[data-test-id-value-title="ATR"]')) {
      if (!item.getClientRects().length) continue;
      const plots = item.querySelectorAll('[class*="valueValue-"]');
      if (plots.length === 1) plotsToRead.add(plots[0]);
    }
    for (const row of rows) {
      if (!row.getClientRects().length) continue;
      const title = row.querySelector('[data-name="legend-source-title"]');
      if (!title || !/^(ATR|Average True Range)(?:$|\s|\()/i.test(title.textContent.trim())) continue;
      const plots = row.querySelectorAll('[data-name="legend-source-value"], [class*="valueValue-"]');
      if (plots.length !== 1) continue;
      plotsToRead.add(plots[0]);
    }
    const values = [];
    for (const plot of plotsToRead) {
      if (!plot.getClientRects().length) continue;
      const text = plot.textContent.trim().replace(/[\u200e\u200f\u2212]/g, c => c === '\u2212' ? '-' : '').replace(/,/g, '');
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) continue;
      const value = Number(text);
      if (Number.isFinite(value) && value > 0) values.push(value);
    }
    return values.length === 1 ? values[0] : null;
  }

  function updateATRControls() {
    atrControls.hidden = !state.useATR;
    atrMultiplierButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(state.atrMultiplier === [1, 2, 3, 4][index])));
    atrStatus.textContent = state.atrValue === null
      ? '—'
      : String(state.atrValue);
  }

  function applyATRStop() {
    if (!state.useATR || !state.atrPending || state.atrValue === null) return;
    if (shadowRoot.activeElement === inputSLPrice || !state.ticketDirection) return;
    state.direction = state.ticketDirection;
    const stop = state.entryPrice + (state.direction === 'SHORT' ? 1 : -1) * state.atrMultiplier * state.atrValue;
    state.stopLossPrice = state.entryPrice > 0 && Number.isFinite(stop) && stop > 0
      ? Number(stop.toPrecision(12)) : 0;
    // Reject a distance lost to floating-point rounding.
    if (state.stopLossPrice === state.entryPrice) state.stopLossPrice = 0;
    inputSLPrice.value = state.stopLossPrice || '';
    state.atrPending = false;
    queueTicketStop(state.stopLossPrice);
  }

  function requestATRStop() {
    pendingTicketStop = null;
    state.ticketDirection = readTicketDirection();
    state.atrValue = readChartATR();
    state.atrPending = true;
    // Do not keep sizing from a previous entry's stop while waiting for ATR.
    state.stopLossPrice = 0;
    inputSLPrice.value = '';
    applyATRStop();
    updateATRControls();
    calculateRiskSystem();
  }

  inputUseATR.addEventListener('change', () => {
    state.useATR = inputUseATR.checked;
    state.atrPending = false;
    pendingTicketStop = null;
    if (state.useATR) requestATRStop();
    updateATRControls();
  });

  let tradeSession = null;
  function syncTradeSession(direction, symbol) {
    if (!direction) {
      tradeSession = null;
      return;
    }
    const key = symbol + ':' + direction;
    if (tradeSession === key) return;
    tradeSession = key;
    recordDirection.value = direction;
    state.useATR = true;
    inputUseATR.checked = true;
    requestATRStop();
  }

  // --- Scraper Interval Engine ---
  setInterval(() => {
    const currentCheckDate = getTodayString();
    
    const storageCheck = JSON.parse(localStorage.getItem('alphasize_daily_metrics_v3') || '{}');
    if (storageCheck.date && storageCheck.date !== currentCheckDate) {
      state.lossRecords = [];
      state.currentDailyLossUSD = 0;
      state.dailyProfitUSD = 0;
      localStorage.setItem('alphasize_daily_metrics_v3', JSON.stringify({ date: currentCheckDate, records: [] }));
      renderLossLogsUI();
    }

    // 1. Cross-Browser Asset Name and Price Scraper
    let parsedTitle = '';
    let extractedPrice = 0;
    
    if (document.title) {
      // Split title by spaces -> ["UNIUSDT.P", "5.355", "▲", "+2.43%", "Double", "MA"]
      const parts = document.title.split(/\s+/);
    
      // 1. Extract Asset Ticker Name
      if (parts.length > 0 && parts[0].length > 1 && parts[0] !== 'TradingView') {
        parsedTitle = parts[0].trim().toUpperCase();
      }
    
      // 2. Extract Price from the Second Segment (parts[1])
      if (parts.length > 1) {
        const rawPriceText = parts[1];
        const parsedVal = cleanAndParseFloat(rawPriceText);
    
        if (parsedVal > 0) {
          extractedPrice = parsedVal;
        }
      }
    }

    // 2. Fallback for Asset Name if title scraping failed
    if (!parsedTitle) {
      const headerElem = document.querySelector('#header-toolbar-symbol-search button, [data-name="legend-source-title"]');
      if (headerElem && headerElem.textContent) {
        parsedTitle = headerElem.textContent.trim().toUpperCase();
      }
    }
    
    // Update State & UI for Asset Name
    if (parsedTitle && state.assetName !== parsedTitle) {
      state.assetName = parsedTitle;
      dragHandle.textContent = parsedTitle;
    }
    
    // Fallback for Price from DOM elements if title price was 0 or missing
    if (!extractedPrice) {
      const priceContainer = document.querySelector('[class*="last-"], [class*="price-"], [data-name="legend-series-item"]');
      if (priceContainer) {
        extractedPrice = cleanAndParseFloat(priceContainer.textContent);
      }
    }
    
    // Update State & UI for Live Price
    if (extractedPrice > 0) {
      state.currentPrice = extractedPrice;
    }

    // 3. Cross-Browser Account Equity Scraper
    let parsedEquity = 0;
    const equityCandidates = document.querySelectorAll(
      '[data-name="account-summary-equity"], ' +
      '[class*="equity-"], ' +
      '[class*="accountSummary-"] span, ' +
      'div[class*="bottom-widgetbar"] [class*="value-"]'
    );

    for (const el of equityCandidates) {
      const val = cleanAndParseFloat(el.textContent);
      if (val > 0) {
        parsedEquity = val;
        break;
      }
    }

    if (!parsedEquity) {
      const elements = Array.from(document.querySelectorAll('span, div'));
      const equityLabel = elements.find(el => el.textContent && el.textContent.trim() === 'Equity');
      if (equityLabel && equityLabel.parentElement) {
        const siblingVal = equityLabel.parentElement.querySelector('[class*="value-"], span:last-child');
        if (siblingVal) {
          parsedEquity = cleanAndParseFloat(siblingVal.textContent);
        }
      }
    }

    if (parsedEquity > 0 && state.accountEquity !== parsedEquity) {
      state.accountEquity = parsedEquity;
      if (shadowRoot.activeElement !== inputEquity) {
        inputEquity.value = Math.round(parsedEquity);
      }
    }

    observeTicketStop();
    const ticketDirection = readTicketDirection();
    state.ticketDirection = ticketDirection;

    const leverage = readTicketLeverage();
    if (leverage !== null) {
      state.leverage = leverage;
      if (shadowRoot.activeElement !== shadowRoot.getElementById('lev')) {
        shadowRoot.getElementById('lev').value = leverage;
      }
    }
    flushTicketStop();

    // 4. Entry / Stop-Loss Price Automation
    // data-qa-id contains space-separated tokens, so use ~= instead of an exact match.
    const entryInputDom = document.querySelector(
      'input[data-qa-id~="order-ticket-absolute-price-input"]'
    );
    let autoEntryPrice = 0;
    if (entryInputDom) {
      autoEntryPrice = cleanAndParseFloat(entryInputDom.value);
    }

    const slInputDom = document.querySelector(ticketStopSelector);
    let autoSLPrice = 0;
    if (slInputDom) {
      autoSLPrice = cleanAndParseFloat(slInputDom.value);
    }

    if (autoEntryPrice > 0 && shadowRoot.activeElement !== inputEntryPrice) {
      const entryChanged = state.entryPrice !== autoEntryPrice;
      state.entryPrice = autoEntryPrice;
      inputEntryPrice.value = autoEntryPrice;
      if (state.useATR && entryChanged) requestATRStop();
    }

    if (!state.useATR && !pendingTicketStop && autoSLPrice > 0 && shadowRoot.activeElement !== inputSLPrice) {
      state.stopLossPrice = autoSLPrice;
      inputSLPrice.value = autoSLPrice;
    }

    syncTradeSession(ticketDirection, state.assetName);
    state.atrValue = readChartATR();
    if (state.useATR) applyATRStop();
    updateATRControls();
    calculateRiskSystem();
  }, 500);

})();

