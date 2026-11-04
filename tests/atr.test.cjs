const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../content.js'), 'utf8');
function setup() {
  const context = vm.createContext({
    state: { useATR: true, atrPending: true, entryPrice: 1000, direction: 'LONG', ticketDirection: 'LONG', atrMultiplier: 1, atrValue: 10 },
    shadowRoot: { activeElement: null }, inputSLPrice: { value: '' },
    document: { querySelectorAll: () => [] }, queueTicketStop: () => {}
  });
  vm.runInContext(source.slice(source.indexOf('  function readChartATR()'), source.indexOf('  function updateATRControls()')), context);
  vm.runInContext(source.slice(source.indexOf('  function applyATRStop()'), source.indexOf('  function requestATRStop()')), context);
  return context;
}
test('all multipliers and both directions', () => {
  for (const direction of ['LONG', 'SHORT']) for (const multiplier of [1, 1.5, 2]) {
    const c = setup(); c.state.direction = direction; c.state.ticketDirection = direction; c.state.atrMultiplier = multiplier;
    c.applyATRStop();
    assert.equal(c.state.stopLossPrice, 1000 + (direction === 'LONG' ? -1 : 1) * multiplier * 10);
  }
});
test('polling preserves manual stop and consumes pending update only once', () => {
  const c = setup(); c.applyATRStop(); c.state.stopLossPrice = 975; c.state.atrValue = 20;
  c.applyATRStop(); assert.equal(c.state.stopLossPrice, 975);
  c.state.entryPrice = 2000; c.state.atrPending = true; c.applyATRStop(); assert.equal(c.state.stopLossPrice, 1980);
});
test('missing ATR and focused manual input defer pending calculation', () => {
  const c = setup(); c.state.atrValue = null; c.applyATRStop(); assert.equal(c.state.atrPending, true);
  c.state.atrValue = 10; c.shadowRoot.activeElement = c.inputSLPrice; c.applyATRStop(); assert.equal(c.state.atrPending, true);
  c.shadowRoot.activeElement = null; c.applyATRStop(); assert.equal(c.state.stopLossPrice, 990);
});
test('invalid and nonpositive stops clear the output', () => {
  for (const entry of [0, -1, Infinity, 5]) { const c = setup(); c.state.entryPrice = entry; c.applyATRStop(); assert.equal(c.inputSLPrice.value, ''); }
});
function row(title, value, visible = true) {
  return { getClientRects: () => visible ? [1] : [], querySelector: () => ({textContent: title}), querySelectorAll: () => [{textContent: value, getClientRects: () => visible ? [1] : []}] };
}
test('reads named ATR plot only, rejects missing/ambiguous/invalid values', () => {
  const c = setup(); let rows = [row('RSI', '50'), row('ATR', '143.2')];
  c.document.querySelectorAll = selector => selector === '[data-name="legend-source-item"]' ? rows : [];
  assert.equal(c.readChartATR(), 143.2);
  for (const value of ['—', '0', '-1', 'NaN', '14 RMA', '12K']) { rows = [row('ATR', value)]; assert.equal(c.readChartATR(), null); }
  rows = [row('ATR (14)', '1,234.5')]; assert.equal(c.readChartATR(), 1234.5);
  rows = [row('ATR', '10'), row('ATR', '20')]; assert.equal(c.readChartATR(), null);
  rows = [row('ATR', '10', false)]; assert.equal(c.readChartATR(), null);
});
test('multiple charts require exactly one active chart', () => {
  const c = setup(); let active = false;
  const chart = {classList: { contains: () => active }, querySelectorAll: selector => selector === '[data-name="legend-source-item"]' ? [row('ATR', '12')] : []};
  const other = {classList: { contains: () => false }};
  c.document.querySelectorAll = () => [chart, other];
  assert.equal(c.readChartATR(), null); active = true; assert.equal(c.readChartATR(), 12);
});

test('reads screenshot ATR value without a legend-source-item ancestor', () => {
  const c = setup();
  const plot = {textContent: '125.1', getClientRects: () => [1]};
  const item = {getClientRects: () => [1], querySelectorAll: selector => {
    assert.equal(selector, '[class*="valueValue-"]');
    return [plot];
  }};
  let items = [item];
  c.document.querySelectorAll = selector => selector === '[data-test-id-value-title="ATR"]' ? items : [];
  assert.equal(c.readChartATR(), 125.1);
  plot.textContent = '—'; assert.equal(c.readChartATR(), null);
  plot.textContent = '125.1';
  plot.getClientRects = () => []; assert.equal(c.readChartATR(), null);
  plot.getClientRects = () => [1];
  items = [item, {getClientRects: () => [1], querySelectorAll: () => [{textContent: '99', getClientRects: () => [1]}]}];
  assert.equal(c.readChartATR(), null);
});
test('deduplicates the same plot found through both markup paths', () => {
  const c = setup();
  const plot = {textContent: '125.1', getClientRects: () => [1]};
  const item = {getClientRects: () => [1], querySelectorAll: () => [plot], querySelector: () => ({textContent: 'ATR'})};
  c.document.querySelectorAll = selector => selector === '.chart-container' ? [] : [item];
  assert.equal(c.readChartATR(), 125.1);
});

function ticketSetup() {
  const nodes = {};
  const c = vm.createContext({
    state: {useATR: true, atrPending: true}, inputUseATR: {checked: true},
    inputSLPrice: {value: ''}, updateATRControls() {}, calculateRiskSystem() {},
    cleanAndParseFloat: value => Number(value) || 0,
    console, nodes, listeners: {},
    document: {
      querySelector: selector => nodes[selector] || null,
      querySelectorAll: selector => nodes[selector] || [],
      addEventListener: (type, callback, capture) => { c.listeners[type] = {callback, capture}; c.onInput = callback; }
    },
    setNativeInputValue: (input, value) => { input.value = value; c.onInput({target: input}); }
  });
  vm.runInContext(source.slice(source.indexOf('  const ticketStopSelector ='), source.indexOf('  // Read only a named ATR')), c);
  return c;
}
test('direction uses active Buy/Sell classes and rejects missing/ambiguous side', () => {
  const c = ticketSetup();
  const buy = {getClientRects: () => [1], classList: ['buy-kndSwmgU', 'active-kndSwmgU']};
  const sell = {getClientRects: () => [1], classList: ['sell-kndSwmgU']};
  c.nodes['[data-name="side-control-buy"]'] = [buy];
  c.nodes['[data-name="side-control-sell"]'] = [sell];
  assert.equal(c.readTicketDirection(), 'LONG');
  buy.classList = ['buy-kndSwmgU']; sell.classList.push('active-kndSwmgU');
  assert.equal(c.readTicketDirection(), 'SHORT');
  buy.classList.push('active-other'); assert.equal(c.readTicketDirection(), null);
});
test('leverage reads the supplied button markup', () => {
  const c = ticketSetup();
  const button = {getClientRects: () => [1], textContent: '10x'};
  c.nodes['[data-qa-id="leverage-button"]'] = [button];
  assert.equal(c.readTicketLeverage(), 10);
  button.textContent = '2.5×'; assert.equal(c.readTicketLeverage(), 2.5);
  button.textContent = 'Leverage'; assert.equal(c.readTicketLeverage(), null);
});
test('enables stop switch and writes price without disabling ATR', () => {
  const c = ticketSetup(); let clicks = 0;
  const toggle = {checked: false, click() { this.checked = true; clicks++; }};
  const input = {value: '', matches: () => true};
  c.nodes['input[data-qa-id="order-ticket-stop-loss-checkbox-bracket"]'] = toggle;
  c.nodes['input[data-qa-id~="order-ticket-stop-loss-input"]'] = input;
  c.queueTicketStop(990); assert.equal(input.value, '990'); assert.equal(clicks, 1);
  assert.equal(c.state.useATR, true);
  c.queueTicketStop(980); assert.equal(input.value, '980'); assert.equal(clicks, 1);
});
test('delayed input mount is retried and manual page edit cancels pending write', () => {
  const c = ticketSetup();
  c.queueTicketStop(990);
  const input = {value: '', matches: () => true};
  c.nodes['input[data-qa-id~="order-ticket-stop-loss-input"]'] = input;
  c.flushTicketStop(); assert.equal(input.value, '990');
  delete c.nodes['input[data-qa-id~="order-ticket-stop-loss-input"]'];
  c.queueTicketStop(980);
  input.value = '975'; c.onInput({target: input});
  assert.equal(c.state.useATR, false); assert.equal(c.inputUseATR.checked, false);
  assert.equal(c.inputSLPrice.value, 975);
  c.nodes['input[data-qa-id~="order-ticket-stop-loss-input"]'] = input;
  c.flushTicketStop(); assert.equal(input.value, '975');
});
test('unknown ticket direction never calculates an ATR stop', () => {
  const c = setup(); c.state.ticketDirection = null;
  c.applyATRStop(); assert.equal(c.inputSLPrice.value, '');
});

test('ticket listeners capture both input and change before page handlers', () => {
  const c = ticketSetup();
  assert.equal(c.listeners.input.capture, true);
  assert.equal(c.listeners.change.capture, true);
  const input = {value: '950', matches: () => true};
  c.listeners.change.callback({target: input});
  assert.equal(c.inputSLPrice.value, 950);
  assert.equal(c.inputUseATR.checked, false);
});
test('silent page stop changes and clearing stop disable ATR via polling', () => {
  const c = ticketSetup();
  const input = {value: '990', matches: () => true};
  c.nodes['input[data-qa-id~="order-ticket-stop-loss-input"]'] = input;
  c.observeTicketStop(); assert.equal(c.state.useATR, true);
  input.value = '960'; c.observeTicketStop();
  assert.equal(c.state.useATR, false); assert.equal(c.inputSLPrice.value, 960);
  input.value = ''; c.observeTicketStop(); assert.equal(c.inputSLPrice.value, '');
});
test('polling ignores extension writes and detects edits after input remount', () => {
  const c = ticketSetup();
  const input = {value: '900', matches: () => true};
  c.nodes['input[data-qa-id~="order-ticket-stop-loss-input"]'] = input;
  c.observeTicketStop(); c.queueTicketStop(990); c.observeTicketStop();
  assert.equal(c.state.useATR, true);
  c.nodes['input[data-qa-id~="order-ticket-stop-loss-input"]'] = {value: '970'};
  c.observeTicketStop(); assert.equal(c.state.useATR, false); assert.equal(c.inputSLPrice.value, 970);
});
test('Apply button follows ticket direction and restores direction label after success', () => {
  const classes = new Set();
  const c = vm.createContext({state: {ticketDirection: 'LONG'}, btnApply: {
    textContent: '', classList: {toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name), contains: name => classes.has(name)}
  }});
  vm.runInContext(source.slice(source.indexOf('  function updateApplyButton()'), source.indexOf('  function calculateRiskSystem()')), c);
  c.updateApplyButton(); assert.equal(c.btnApply.textContent, 'Apply Long Position'); assert.ok(classes.has('long'));
  c.state.ticketDirection = 'SHORT'; c.updateApplyButton();
  assert.equal(c.btnApply.textContent, 'Apply Short Position'); assert.ok(classes.has('short')); assert.ok(!classes.has('long'));
  classes.add('success'); c.btnApply.textContent = 'Position Applied! ✓'; c.updateApplyButton();
  assert.equal(c.btnApply.textContent, 'Position Applied! ✓');
  classes.delete('success'); c.updateApplyButton(); assert.equal(c.btnApply.textContent, 'Apply Short Position');
});

test('legacy losses migrate once; signed records and metadata survive reload', () => {
  const c = vm.createContext({state: {}});
  vm.runInContext(source.slice(source.indexOf('  function normalizeProfitRecords('), source.indexOf('  function saveRecordsToLocalStorage()')), c);
  const migrated = c.normalizeProfitRecords({records: [{id: 'old', val: 50, asset: 'BTC'}]});
  assert.equal(migrated[0].val, -50);
  const signed = c.normalizeProfitRecords({schema: 3, records: [...migrated, {val: 100, direction: 'SHORT'}]});
  assert.equal(signed[0].val, -50); assert.equal(signed[1].val, 100); assert.equal(signed[1].direction, 'SHORT');
  c.state.lossRecords = signed; c.recalculateTotalLossFromRecords();
  assert.equal(c.state.dailyProfitUSD, 50); assert.equal(c.state.currentDailyLossUSD, 50);
  c.state.lossRecords = [{val: -80}, {val: 30}]; c.recalculateTotalLossFromRecords();
  assert.equal(c.state.dailyProfitUSD, -50); assert.equal(c.state.currentDailyLossUSD, 80);
  c.state.lossRecords = []; c.recalculateTotalLossFromRecords(); assert.equal(c.state.dailyProfitUSD, 0);
});
test('new ticket sessions enable ATR without undoing manual override in same setup', () => {
  let requests = 0;
  const c = vm.createContext({state: {useATR: false}, inputUseATR: {checked: false}, recordDirection: {}, requestATRStop: () => requests++});
  vm.runInContext(source.slice(source.indexOf('  let tradeSession ='), source.indexOf('  // --- Scraper Interval Engine ---')), c);
  c.syncTradeSession('LONG', 'BTC'); assert.equal(c.state.useATR, true); assert.equal(requests, 1);
  c.state.useATR = false; c.inputUseATR.checked = false;
  c.syncTradeSession('LONG', 'BTC'); assert.equal(c.state.useATR, false); assert.equal(requests, 1);
  c.syncTradeSession(null, 'BTC'); c.syncTradeSession('LONG', 'BTC'); assert.equal(requests, 2);
  c.syncTradeSession('SHORT', 'BTC'); assert.equal(requests, 3); assert.equal(c.recordDirection.value, 'SHORT');
  c.syncTradeSession('SHORT', 'ETH'); assert.equal(requests, 4);
});
