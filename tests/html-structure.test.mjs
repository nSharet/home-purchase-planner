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
  'targetMonthlyPayment',
  'copySummaryBtn',
  'resetBtn'
];

test('all detailed source rubrics remain in the page', () => {
  for (const rubric of requiredRubrics) {
    assert.ok(html.includes(rubric), `Missing rubric: ${rubric}`);
  }
});

test('sensitivity output and notifications expose accessible labels', () => {
  assert.match(html, /id="sensitivityTable"[^>]+aria-label=/);
  assert.match(html, /id="toast"[^>]+role="status"[^>]+aria-live="polite"/);
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

test('application initializes synchronously with the requested planning defaults', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

  assert.ok(!app.includes('document.createElement(\'script\')'), 'App must not depend on dynamically injected scripts');
  assert.match(app, /function makeScenario\(name = 'בית 1'\)/);
  assert.match(app, /propertyPrice: 3000000, purchaseType: 'single', appraisalValue: 0/);
  assert.match(app, /maxLtvOverride: 70/);
  assert.match(app, /appraisalCost: 2500, mortgageFees: 3000, registrationCosts: 2500, movingCosts: null/);
  assert.match(app, /liquidEquity: null, otherEquity: null, reserveCash: null/);
  assert.match(app, /existingPropertyValue: null, existingPropertyDebt: null/);
});

test('application includes detailed renovation and mortgage defaults', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const renovationDefaults = [
    'החלפת מטבח',
    'שיפוץ חדרי רחצה',
    'חשמל, לוח ושקעים',
    'ארונות ונגרות מותאמת',
    'תאורה, וילונות ועיצוב',
    'ריהוט ומוצרי חשמל'
  ];

  for (const item of renovationDefaults) assert.ok(app.includes(item), `Missing renovation default: ${item}`);
  for (const loan of [1000000, 1200000, 1400000, 1600000, 1700000, 1800000, 2000000]) {
    assert.ok(app.includes(`loan: ${loan}`), `Missing mortgage default: ${loan}`);
  }
});
