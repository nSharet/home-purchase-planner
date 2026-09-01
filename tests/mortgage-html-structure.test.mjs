import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../mortgage/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../mortgage/app.js', import.meta.url), 'utf8');

test('mortgage optimizer keeps the core product flow visible', () => {
  for (const required of [
    'Mortgage Optimizer',
    'העסקה והנכס הקיים',
    'הון, הכנסה ומגבלות',
    'ציר תשלומים יחסי',
    'הנחות האופטימיזציה',
    'שלוש חלופות',
    'רענון ריביות',
    'עלויות נלוות לרכישה',
    'מס רכישה משוער',
    'תיווך',
    'עורך דין',
    'פתיחת תיק משכנתה'
  ]) {
    assert.ok(html.includes(required), `missing: ${required}`);
  }
});

test('mortgage optimizer supports automatic and user-defined acquisition costs', () => {
  assert.match(html, /id="purchaseTaxMode"/);
  assert.match(html, /id="otherCosts"/);
  assert.match(html, /id="otherCostTemplate"/);
  assert.ok(html.includes('אינן מגדילות את שווי הנכס או את תקרת המימון של 70%'));
});

test('mortgage optimizer exposes separate purchase and sale event collections', () => {
  assert.match(html, /id="purchaseEvents"/);
  assert.match(html, /id="saleEvents"/);
  assert.match(html, /id="eventTemplate"/);
});

test('editing an event amount refreshes its displayed total on blur and Enter', () => {
  assert.match(app, /amountInput\.addEventListener\('blur',[\s\S]*?renderEventTotal\(type\);[\s\S]*?changed\(\);/);
  assert.match(app, /if \(event\.key === 'Enter'\) amountInput\.blur\(\);/);
  assert.match(app, /document\.getElementById\(`\$\{type\}Total`\)\.textContent = money\(total\);/);
});
