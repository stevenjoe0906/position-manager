const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../content.js'), 'utf8');
function setup() {
  const context = vm.createContext({
    state: { useATR: true, atrPending: true, entryPrice: 1000, direction: 'LONG', atrMultiplier: 1, atrValue: 10 },
    shadowRoot: { activeElement: null }, inputSLPrice: { value: '' },
    document: { querySelectorAll: () => [] }
  });
  vm.runInContext(source.slice(source.indexOf('  function readChartATR()'), source.indexOf('  function updateATRControls()')), context);
  vm.runInContext(source.slice(source.indexOf('  function applyATRStop()'), source.indexOf('  function requestATRStop()')), context);
  return context;
}
test('all multipliers and both directions', () => {
  for (const direction of ['LONG', 'SHORT']) for (const multiplier of [1, 1.5, 2]) {
    const c = setup(); c.state.direction = direction; c.state.atrMultiplier = multiplier;
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
  return { getClientRects: () => visible ? [1] : [], querySelector: () => ({textContent: title}), querySelectorAll: () => [{textContent: value}] };
}
test('reads named ATR plot only, rejects missing/ambiguous/invalid values', () => {
  const c = setup(); let rows = [row('RSI', '50'), row('ATR', '143.2')];
  c.document.querySelectorAll = selector => selector === '.chart-container' ? [] : rows;
  assert.equal(c.readChartATR(), 143.2);
  for (const value of ['—', '0', '-1', 'NaN', '14 RMA', '12K']) { rows = [row('ATR', value)]; assert.equal(c.readChartATR(), null); }
  rows = [row('ATR (14)', '1,234.5')]; assert.equal(c.readChartATR(), 1234.5);
  rows = [row('ATR', '10'), row('ATR', '20')]; assert.equal(c.readChartATR(), null);
  rows = [row('ATR', '10', false)]; assert.equal(c.readChartATR(), null);
});
test('multiple charts require exactly one active chart', () => {
  const c = setup(); let active = false;
  const chart = {classList: { contains: () => active }, querySelectorAll: () => [row('ATR', '12')]};
  const other = {classList: { contains: () => false }};
  c.document.querySelectorAll = () => [chart, other];
  assert.equal(c.readChartATR(), null); active = true; assert.equal(c.readChartATR(), 12);
});
