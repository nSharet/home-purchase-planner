import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMotiHtml } from '../scripts/fetch-moti-rates.mjs';

const previous = JSON.parse(
  await readFile(new URL('../mortgage/data/rates/current.json', import.meta.url), 'utf8')
);

const html = `
  <table class="interest"><thead><tr><th>ריביות משכנתא צמודות למדד תאריך עדכון אחרון: 01/09/2026</th></tr></thead><tbody>
    <tr><td>משתנה כל 5 צמודה</td><td>2.8% - 3.1%</td><td>2.9% - 3.2%</td><td>3.0% - 3.3%</td></tr>
    <tr><td>קצ&quot;מ 20 - 30</td><td>2.8% - 3.0%</td><td>2.9% - 3.1%</td><td>3.0% - 3.2%</td></tr>
  </tbody></table>
  <table class="interest"><thead><tr><th>ריביות משכנתא לא צמודות למדד תאריך עדכון אחרון: 01/09/2026</th></tr></thead><tbody>
    <tr><td>פריים</td><td>4.0% - 4.3%</td><td>4.1% - 4.4%</td><td>4.2% - 4.5%</td></tr>
    <tr><td>משתנה כל 5 לא צמודה</td><td>4.1% - 4.4%</td><td>4.2% - 4.5%</td><td>4.3% - 4.6%</td></tr>
    <tr><td>קל&quot;צ 20 - 30</td><td>4.2% - 4.4%</td><td>4.3% - 4.5%</td><td>4.4% - 4.6%</td></tr>
  </tbody></table>
  <table class="interest"><thead><tr><th>ריביות נוספות במסלולים שונים תאריך עדכון אחרון: 01/09/2026</th></tr></thead><tbody>
    <tr><td>הלוואת גישור - דיור</td><td>3.5% - 3.8%</td><td>4.5% - 5.1%</td></tr>
  </tbody></table>`;

test('normalizes the external rate tables into the local data model', () => {
  const parsed = parseMotiHtml(html, previous);
  assert.equal(parsed.meta.sourceUpdatedAt, '2026-09-01T00:00:00+03:00');
  const prime = parsed.products.find((product) => product.id === 'prime');
  assert.deepEqual(prime.terms[0].bands.from60To75, { min: 4.2, max: 4.5 });
  const bridge = parsed.products.find((product) => product.id === 'bridge-unlinked');
  assert.deepEqual(bridge.terms[0].bands.all, { min: 4.5, max: 5.1 });
});

test('preserves the fetched timestamp when normalized rates did not change', () => {
  const first = parseMotiHtml(html, previous);
  first.meta.fetchedAt = '2026-09-01T10:00:00.000Z';
  const second = parseMotiHtml(html, first);
  assert.equal(second.meta.fetchedAt, first.meta.fetchedAt);
});
