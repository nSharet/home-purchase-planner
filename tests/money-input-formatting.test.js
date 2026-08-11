import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('money inputs use thousands-separator formatting helpers', () => {
  assert.match(app, /function parseMoneyInput\(value\)/);
  assert.match(app, /function formatMoneyInput\(value\)/);
  assert.match(app, /'propertyPrice'.*'existingPropertyValue'.*'existingPropertyDebt'/s);
  assert.match(app, /inputmode=\\"numeric\\" dir=\\"ltr\\" data-k=\\"loan\\"/);
  assert.match(app, /inputmode=\\"numeric\\" dir=\\"ltr\\" data-k=\\"payment\\"/);
  assert.match(app, /inputmode=\\"numeric\\" dir=\\"ltr\\" data-k=\\"amount\\"/);
  assert.match(app, /previewInput\.value = formatMoneyInput\(s\.propertyPrice\)/);
});
