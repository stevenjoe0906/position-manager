// content.js - AlphaSize Floating Panel (Manual Apply to #quantity-field)

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
    dailyLossLimitPercent: 3, 
    currentDailyLossUSD: 0,
    lossRecords: [] 
  };

  // 2. Storage Setup
  const dateKey = getTodayString();
  const storedData = localStorage.getItem('alphasize_daily_metrics_v2');
  
  if (storedData) {
    try {
      const parsed = JSON.parse(storedData);
      if (parsed.date === dateKey) {
        state.lossRecords = parsed.records || [];
      } else {
        localStorage.setItem('alphasize_daily_metrics_v2', JSON.stringify({ date: dateKey, records: [] }));
      }
    } catch (e) {
      console.error("Failed parsing loss records", e);
    }
  } else {
    localStorage.setItem('alphasize_daily_metrics_v2', JSON.stringify({ date: dateKey, records: [] }));
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

  shadowRoot.innerHTML = `
    <style>
      .panel {
        width: 340px;
        background: #1c2030;
        border: 1px solid #2a2e39;
        border-radius: 8px;
        padding: 16px;
        color: #d1d4dc;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        display: block;
      }
      .panel.hidden { display: none; }

      .global-header-row {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        margin-bottom: 14px;
        padding: 4px 0;
      }
      .header { 
        font-size: 14px; 
        font-weight: 800; 
        color: #2962ff; 
        letter-spacing: 1.5px; 
        text-transform: uppercase; 
        cursor: move; 
        text-align: center;
        width: 100%;
        padding: 0 32px;
      }
      
      .window-icon-btn {
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        color: #787b86;
        cursor: pointer;
        padding: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s, transform 0.15s;
        border-radius: 4px;
      }
      .window-icon-btn:hover { color: #ffffff; background-color: rgba(255, 255, 255, 0.05); }
      .window-icon-btn svg { width: 16px; height: 16px; fill: currentColor; }

      .idol-quote-section {
        display: flex;
        align-items: center;
        gap: 14px;
        background: #131722;
        border: 1px solid #2a2e39;
        border-radius: 6px;
        padding: 12px 14px;
        margin-bottom: 14px;
      }
      .idol-avatar-box {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 2px solid #2a2e39;
        overflow: hidden;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1c2030;
      }
      .idol-avatar-box img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .idol-text-box {
        flex: 1;
        display: flex;
        align-items: center;
      }
      .idol-quote-content {
        font-size: 14px;
        line-height: 18px;
        color: #e0e3eb;
        font-style: italic;
        font-weight: 600;
      }

      .expand-trigger-anchor {
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 24px;
        height: 60px;
        background: #1c2030;
        border: 1px solid #2a2e39;
        border-right: none;
        border-radius: 8px 0 0 8px;
        display: none;
        align-items: center;
        justify-content: center;
        color: #2962ff;
        cursor: pointer;
        box-shadow: -4px 0 15px rgba(0,0,0,0.4);
        z-index: 99999999;
        transition: color 0.15s, background-color 0.15s;
      }
      .expand-trigger-anchor:hover { background: #131722; color: #00e676; }
      .expand-trigger-anchor.visible { display: flex; }
      .expand-trigger-anchor svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }

      .price { font-size: 24px; font-weight: bold; color: #ffffff; text-align: center; margin-bottom: 4px; }
      
      .direction-badge { 
        display: none; 
        font-size: 14px; 
        font-weight: 800; 
        text-align: center; 
        margin-bottom: 14px; 
        border-bottom: 1px solid #2a2e39; 
        padding-bottom: 10px; 
      }
      .direction-badge.visible { display: block; }
      .dir-long { color: #00e676; }
      .dir-short { color: #ff5252; }

      .grid { display: flex; gap: 12px; margin-bottom: 12px; }
      .grid > div { flex: 1; }
      label { display: block; font-size: 14px; color: #787b86; text-transform: uppercase; margin-bottom: 6px; font-weight: bold; }
      input { width: 100%; padding: 8px 10px; background: #131722; border: 1px solid #2a2e39; border-radius: 4px; color: #ffffff; box-sizing: border-box; font-size: 14px; }
      input:focus { border-color: #2962ff; outline: none; }
      .read-only-badge { font-size: 11px; background: #2962ff22; color: #2962ff; padding: 2px 5px; border-radius: 3px; float: right; margin-top: 2px; }
      
      .tracker-block { 
        background: #131722; 
        padding: 10px; 
        border-radius: 6px; 
        border: 1px solid #2a2e39; 
        margin-bottom: 12px; 
      }
      .tracker-flex { 
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        font-size: 14px; 
      }
      .loss-input-row { display: flex; gap: 8px; margin-top: 10px; margin-bottom: 10px; }
      
      .inline-add-icon-btn { 
        background: transparent; 
        border: 1px solid #2a2e39; 
        color: #787b86; 
        padding: 0 12px; 
        border-radius: 4px; 
        cursor: pointer; 
        transition: color 0.15s, background-color 0.15s, border-color 0.15s; 
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .inline-add-icon-btn:hover { color: #ffffff; background-color: #2a2e39; border-color: #787b86; }
      .inline-add-icon-btn svg { width: 14px; height: 14px; fill: currentColor; }

      .action-icon-btn {
        background: transparent;
        border: none;
        color: #787b86;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s, background-color 0.15s;
      }
      .action-icon-btn:hover { color: #ffffff; background-color: #2a2e39; }
      .action-icon-btn svg { width: 16px; height: 16px; fill: currentColor; }

      .loss-log-list { 
        max-height: 125px; 
        overflow-y: auto; 
        border-top: 1px solid #2a2e39; 
        padding-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .loss-log-list::-webkit-scrollbar { width: 4px; }
      .loss-log-list::-webkit-scrollbar-thumb { background: #2a2e39; border-radius: 2px; }
      
      .loss-log-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #1c2030;
        padding: 6px 10px;
        border-radius: 4px;
        border: 1px solid #2a2e39;
      }
      .log-meta-stack { display: flex; flex-direction: column; gap: 2px; }
      .log-primary-row { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
      .log-ticker-name { color: #b2b5be; }
      .log-val-amount { color: #ff5252; font-weight: bold; }
      .log-time-secondary { font-size: 11px; color: #5d606b; font-variant-numeric: tabular-nums; font-weight: normal; }
      
      .remove-log-btn {
        background: transparent;
        border: none;
        padding: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #787b86;
        border-radius: 3px;
        transition: color 0.15s, background 0.15s;
      }
      .remove-log-btn:hover { color: #ff5252; background: rgba(255, 82, 82, 0.15); }
      .remove-log-btn svg { width: 12px; height: 12px; fill: currentColor; }

      .output-area { background: #131722; padding: 14px; border-radius: 6px; border: 1px solid #2a2e39; margin-top: 16px; }
      .output-lbl { font-size: 14px; color: #787b86; text-transform: uppercase; font-weight: bold; }
      .output-val { font-size: 26px; font-weight: bold; color: #00e676; margin: 6px 0 2px 0; font-variant-numeric: tabular-nums; }
      
      .aux-container { font-size: 13px; color: #787b86; margin-bottom: 6px; display: flex; justify-content: space-between; }
      .aux-val { color: #b2b5be; font-weight: 500; font-variant-numeric: tabular-nums; }
      .aux-val-danger { color: #ff5252; font-weight: 700; font-variant-numeric: tabular-nums; }

      .apply-btn { width: 100%; border: none; color: #ffffff; background: #2962ff; padding: 10px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold; transition: background 0.15s; margin-top: 8px; }
      .apply-btn:hover { background: #1e4bd8; }
      .apply-btn.success { background: #00e676; color: #131722; }
      .apply-btn:disabled { background: #2a2e39; color: #787b86; cursor: not-allowed; }
      
      .warning { display: none; background: rgba(255, 82, 82, 0.15); border: 1px solid #ff5252; color: #ff5252; padding: 8px; border-radius: 4px; font-size: 14px; margin-top: 10px; font-weight: bold; text-align: center; }
      .warning.active { display: block; }
    </style>

    <div class="expand-trigger-anchor" id="widget-expand-trigger" title="Expand AlphaSize Panel">
      <svg viewBox="0 0 24 24">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </div>

    <div class="panel" id="main-widget-panel">
      <div class="global-header-row">
        <div class="header" id="drag-handle">${state.assetName}</div>
        <button class="window-icon-btn" id="widget-minimize-trigger" title="Minimize Window">
          <svg viewBox="0 0 24 24">
            <path d="M19 13H5v-2h14v2z"/>
          </svg>
        </button>
      </div>

      <div class="idol-quote-section">
        <div class="idol-avatar-box">
          <img src="${extRuntime && extRuntime.getURL ? extRuntime.getURL('livermore.jpg') : 'https://i.imgur.com/vOnX60V.png'}" alt="Avatar">
        </div>
        <div class="idol-text-box">
          <span class="idol-quote-content">"It never was my thinking that made the big money for me. It always was my sitting."</span>
        </div>
      </div>

      <div class="price" id="tv-price">Connecting...</div>
      <div class="direction-badge" id="tv-direction">Opening Long</div>

      <div class="tracker-block">
        <div class="tracker-flex">
          <div>
            <span style="color:#787b86; font-size: 14px; font-weight: bold; text-transform: uppercase; margin-right: 4px;">Daily Loss:</span>
            <span id="loss-display" style="font-weight: bold; color: #ffffff;">$0.00</span>
          </div>
          <button class="action-icon-btn" id="clear-all-btn" title="Clear All Log Entries">
            <svg viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="loss-input-row">
          <input type="number" id="loss-adder" placeholder="Add loss ($)..." style="font-size: 14px; padding: 6px 8px;">
          <button class="inline-add-icon-btn" id="add-loss-btn" title="Commit Log Entry">
            <svg viewBox="0 0 24 24">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>
        
        <div class="loss-log-list" id="loss-log-list"></div>
      </div>

      <div class="grid">
        <div>
          <label>Equity ($)</label>
          <input type="number" id="eq" value="${state.accountEquity}">
        </div>
        <div>
          <label>Leverage</label>
          <input type="number" id="lev" value="${state.leverage}">
        </div>
      </div>
      
      <div class="grid">
        <div>
          <label>Risk (%)</label>
          <input type="number" id="rsk" step="0.1" value="${state.riskPercent}">
        </div>
        <div>
          <label>MAX DD (%)</label>
          <input type="number" id="loss-cap" step="0.5" value="${state.dailyLossLimitPercent}">
        </div>
      </div>

      <div class="grid">
        <div>
          <label>Entry Price</label>
          <input type="number" id="entry-price" step="0.00001" placeholder="Type Entry...">
        </div>
        <div>
          <label>Stop Loss Price</label>
          <input type="number" id="sl-price" step="0.00001" placeholder="Type SL...">
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <label>SL Distance <span class="read-only-badge">AUTO</span></label>
        <input type="text" id="sl-distance" value="0.00%" disabled style="opacity: 0.7; cursor: not-allowed;">
      </div>

      <div class="output-area">
        <div class="output-lbl">Amount (Tokens / Units)</div>
        <div class="output-val" id="amount-display">0.00</div>
        
        <div class="aux-container" style="margin-top: 10px;">
          <span>Position Size (Nominal):</span>
          <span class="aux-val" id="nominal-display">$0.00</span>
        </div>

        <div class="aux-container">
          <span>Real Margin Used:</span>
          <span class="aux-val" id="margin-display" style="font-weight: bold; color: #ffffff;">$0.00</span>
        </div>

        <div class="aux-container">
          <span>Max DD Loss Money:</span>
          <span class="aux-val-danger" id="max-dd-money-display">-$0.00</span>
        </div>

        <div class="aux-container">
          <span>Stop Loss Money:</span>
          <span class="aux-val-danger" id="sl-money-display">-$0.00</span>
        </div>

        <button class="apply-btn" id="apply-btn">Apply Position</button>
        <div class="warning" id="warn-banner">⚠️ EXCEEDS RISK LIMITS!</div>
      </div>
    </div>
  `;

  // UI Element Cache
  const panelMain = shadowRoot.getElementById('main-widget-panel');
  const btnMinimize = shadowRoot.getElementById('widget-minimize-trigger');
  const btnExpand = shadowRoot.getElementById('widget-expand-trigger');

  const dragHandle = shadowRoot.getElementById('drag-handle');
  const elPrice = shadowRoot.getElementById('tv-price');
  const elDirection = shadowRoot.getElementById('tv-direction');
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

  shadowRoot.querySelectorAll('input').forEach(input => {
    isolateKeyboardEvents(input);
  });

  [btnAddLoss, btnClearAll, btnMinimize, btnExpand].forEach(btn => {
    btn.addEventListener('click', (e) => e.stopPropagation());
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
  });

  function recalculateTotalLossFromRecords() {
    state.currentDailyLossUSD = state.lossRecords.reduce((acc, curr) => acc + curr.val, 0);
  }

  function saveRecordsToLocalStorage() {
    localStorage.setItem('alphasize_daily_metrics_v2', JSON.stringify({
      date: getTodayString(),
      records: state.lossRecords
    }));
  }

  function renderLossLogsUI() {
    elLossDisplay.textContent = `$${state.currentDailyLossUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    elLossDisplay.style.color = state.currentDailyLossUSD > 0 ? '#ff5252' : '#ffffff';

    containerLogList.innerHTML = '';
    if (state.lossRecords.length === 0) {
      containerLogList.style.display = 'none';
      return;
    }
    containerLogList.style.display = 'flex';

    state.lossRecords.forEach(record => {
      const itemRow = document.createElement('div');
      itemRow.className = 'loss-log-item';
      
      itemRow.innerHTML = `
        <div class="log-meta-stack">
          <div class="log-primary-row">
            <span class="log-ticker-name">${record.asset || 'UNKNOWN'}</span>
            <span class="log-val-amount">-$${record.val.toFixed(2)}</span>
          </div>
          <span class="log-time-secondary">${record.time}</span>
        </div>
        <button class="remove-log-btn" data-id="${record.id}">
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      `;

      const btnRemove = itemRow.querySelector('.remove-log-btn');
      btnRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        removeSingleLossItem(record.id);
      });
      btnRemove.addEventListener('mousedown', (e) => e.stopPropagation());

      containerLogList.appendChild(itemRow);
    });
  }

  function calculateRiskSystem() {
    if (state.stopLossPrice > 0 && state.entryPrice > 0) {
      elDirection.classList.add('visible');
      if (state.stopLossPrice >= state.entryPrice) {
        state.direction = 'SHORT';
        elDirection.textContent = '⚔️ Opening Short';
        elDirection.className = 'direction-badge visible dir-short';
        state.stopLossPercent = ((state.stopLossPrice - state.entryPrice) / state.entryPrice) * 100;
      } else {
        state.direction = 'LONG';
        elDirection.textContent = '🛡️ Opening Long';
        elDirection.className = 'direction-badge visible dir-long';
        state.stopLossPercent = ((state.entryPrice - state.stopLossPrice) / state.entryPrice) * 100;
      }
      inputSLDistance.value = `${state.stopLossPercent.toFixed(2)}%`;
    } else {
      elDirection.classList.remove('visible'); 
      inputSLDistance.value = '0.00%';
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
    const lossVal = Math.abs(parseFloat(inputLossAdder.value)) || 0;
    if (lossVal > 0) {
      const now = new Date();
      const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      
      state.lossRecords.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        time: timeString,
        val: lossVal,
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
    if (confirm("Are you sure you want to clear all loss records for today?")) {
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
    calculateRiskSystem();
  });

  inputSLPrice.addEventListener('input', (e) => {
    state.stopLossPrice = Number(e.target.value);
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
        btnApply.textContent = 'Apply Position';
        btnApply.classList.remove('success');
      }, 1000);
    } else {
      console.warn("Target #quantity-field element not found on page.");
    }
  });

  function cleanAndParseFloat(text) {
    if (!text) return 0;
    return parseFloat(text.replace(/[^0-9.-]/g, '')) || 0;
  }

  // --- Scraper Interval Engine ---
  setInterval(() => {
    const currentCheckDate = getTodayString();
    
    const storageCheck = JSON.parse(localStorage.getItem('alphasize_daily_metrics_v2') || '{}');
    if (storageCheck.date && storageCheck.date !== currentCheckDate) {
      state.lossRecords = [];
      state.currentDailyLossUSD = 0;
      localStorage.setItem('alphasize_daily_metrics_v2', JSON.stringify({ date: currentCheckDate, records: [] }));
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
      elPrice.textContent = `$${state.currentPrice.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 5
      })}`;
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

    // 4. Entry / Stop-Loss Price Automation
    // data-qa-id contains space-separated tokens, so use ~= instead of an exact match.
    const entryInputDom = document.querySelector(
      'input[data-qa-id~="order-ticket-absolute-price-input"]'
    );
    let autoEntryPrice = 0;
    if (entryInputDom) {
      autoEntryPrice = cleanAndParseFloat(entryInputDom.value);
    }

    const slInputDom = document.querySelector('[data-qa-id*="order-ticket-stop-loss-input"]');
    let autoSLPrice = 0;
    if (slInputDom) {
      autoSLPrice = cleanAndParseFloat(slInputDom.value);
    }

    if (autoEntryPrice > 0 && shadowRoot.activeElement !== inputEntryPrice) {
      state.entryPrice = autoEntryPrice;
      inputEntryPrice.value = autoEntryPrice;
    }

    if (autoSLPrice > 0 && shadowRoot.activeElement !== inputSLPrice) {
      state.stopLossPrice = autoSLPrice;
      inputSLPrice.value = autoSLPrice;
    }

    calculateRiskSystem();
  }, 500);

})();
