import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const requiredRubrics = [
  '1. הנכס והעסקה',
  '2. מס רכישה ועלויות עסקה',
  '3. תיקונים, שיפוץ ועיצוב',
  '4. הון עצמי ונכסים זמינים',
  '5. טבלת משכנתא והחזר חודשי',
  'השוואת תרחישים',
  'פירוט עלות העסקה',
  'פער מימון ובדיקת LTV',
  'רגישות למחיר הבית',
  'ניהול נתונים',
  'מעבדת החלטה: מחיר ↔ משכנתא ↔ החזר'
];

const requiredControls = [
  'scenarioTabs',
  'addScenarioBtn',
  'duplicateScenarioBtn',
  'deleteScenarioBtn',
  'renovationRows',
  'repaymentRows',
  'comparisonTable',
  'sensitivityTable',
  'exportBtn',
  'importBtn',
  'csvBtn',
  'downloadJsonBtn',
  'previewPropertyPrice',
  'targetMonthlyPayment'
];

test('all detailed source rubrics remain in the page', () => {
  for (const rubric of requiredRubrics) {
    assert.ok(html.includes(rubric), `Missing rubric: ${rubric}`);
  }
});

test('all scenario, editing and export controls remain available', () => {
  for (const id of requiredControls) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Missing control: ${id}`);
  }
});

test('page remains Hebrew RTL and loads the shared calculation engine', async () => {
  assert.match(html, /<html[^>]+lang="he"[^>]+dir="rtl"/);
  assert.ok(html.includes('src/app.js'));
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("import * as calculator from './calculator.js'"));
});
