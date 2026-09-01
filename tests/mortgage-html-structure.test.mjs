import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../mortgage/index.html', import.meta.url), 'utf8');

test('mortgage optimizer keeps the core product flow visible', () => {
  for (const required of [
    'Mortgage Optimizer',
    'העסקה והנכס הקיים',
    'הון, הכנסה ומגבלות',
    'ציר תשלומים יחסי',
    'הנחות האופטימיזציה',
    'שלוש חלופות',
    'רענון ריביות'
  ]) {
    assert.ok(html.includes(required), `missing: ${required}`);
  }
});

test('mortgage optimizer exposes separate purchase and sale event collections', () => {
  assert.match(html, /id="purchaseEvents"/);
  assert.match(html, /id="saleEvents"/);
  assert.match(html, /id="eventTemplate"/);
});
