import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePurchaseTax,
  calculatePriceSensitivity,
  calculateRepayment,
  calculateScenario,
  findMaxPropertyPriceForPayment,
  getDefaultLtv
} from '../src/calculator.js';

const baseScenario = () => ({
  propertyPrice: 3_500_000,
  purchaseType: 'replacement',
  appraisalValue: 0,
  maxLtvOverride: 70,
  taxMode: 'auto',
  manualTax: 0,
  brokerPct: 2,
  lawyerPct: 0.5,
  vatRate: 18,
  brokerVat: true,
  lawyerVat: true,
  appraisalCost: 2_500,
  mortgageFees: 3_000,
  registrationCosts: 2_500,
  movingCosts: 5_000,
  otherTransactionCosts: 0,
  renovations: [
    { enabled: true, amount: 100_000 },
    { enabled: false, amount: 900_000 }
  ],
  contingencyPct: 10,
  liquidEquity: 500_000,
  otherEquity: 0,
  reserveCash: 100_000,
  existingPropertyValue: 2_500_000,
  existingPropertyDebt: 800_000,
  saleCostPct: 2,
  propertyEquityUsePct: 100,
  repaymentMode: 'interpolate',
  manualMortgageAdjustment: 0,
  repayments: [
    { loan: 1_000_000, payment: 5_000 },
    { loan: 1_600_000, payment: 8_000 },
    { loan: 1_700_000, payment: 8_800 },
    { loan: 2_000_000, payment: 10_500 }
  ]
});

test('single-home tax is zero below the exemption threshold', () => {
  assert.equal(calculatePurchaseTax(1_900_000, 'single'), 0);
});

test('single-home tax applies progressively above the exemption threshold', () => {
  const tax = calculatePurchaseTax(2_100_000, 'single');
  assert.ok(tax > 4_000 && tax < 5_000);
});

test('investment-home tax uses the 8% first bracket', () => {
  assert.equal(calculatePurchaseTax(1_000_000, 'investment'), 80_000);
});

test('default LTV follows purchase type', () => {
  assert.equal(getDefaultLtv('single'), 75);
  assert.equal(getDefaultLtv('replacement'), 70);
  assert.equal(getDefaultLtv('investment'), 50);
});

test('repayment interpolation preserves defined points', () => {
  const points = [{ loan: 1_600_000, payment: 8_000 }, { loan: 1_700_000, payment: 8_800 }];
  assert.equal(calculateRepayment(1_650_000, points, 'interpolate'), 8_400);
});

test('next-step repayment rounds conservatively upward', () => {
  const points = [{ loan: 1_600_000, payment: 8_000 }, { loan: 1_700_000, payment: 8_800 }];
  assert.equal(calculateRepayment(1_650_000, points, 'nextStep'), 8_800);
});

test('scenario calculation includes transaction, renovation, equity and LTV components', () => {
  const result = calculateScenario(baseScenario());
  assert.ok(result.tax > 0);
  assert.ok(result.broker > 80_000);
  assert.equal(result.renovationSubtotal, 100_000);
  assert.equal(result.contingency, 10_000);
  assert.equal(result.propertyEquityGross, 1_650_000);
  assert.equal(result.totalEquity, 2_050_000);
  assert.ok(result.totalCost > result.price);
  assert.ok(result.mortgageGap > 0);
  assert.ok(result.payment > 0);
  assert.equal(result.financingMargin, result.maxMortgage - result.mortgageGap);
});

test('price sensitivity includes all required deltas and preserves the source scenario', () => {
  const scenario = baseScenario();
  const original = structuredClone(scenario);
  const results = calculatePriceSensitivity(scenario);

  assert.deepEqual(results.map(({ delta }) => delta), [-10, -5, 0, 5, 10]);
  assert.equal(results[0].price, 3_150_000);
  assert.equal(results[2].price, scenario.propertyPrice);
  assert.equal(results[4].price, 3_850_000);
  assert.deepEqual(scenario, original);
});

test('manual purchase tax overrides automatic tax', () => {
  const scenario = baseScenario();
  scenario.taxMode = 'manual';
  scenario.manualTax = 123_456;
  assert.equal(calculateScenario(scenario).tax, 123_456);
});

test('disabled renovation rows are excluded', () => {
  const result = calculateScenario(baseScenario());
  assert.equal(result.renovationSubtotal, 100_000);
});

test('price override changes price-dependent costs but preserves fixed assumptions', () => {
  const scenario = baseScenario();
  const original = calculateScenario(scenario);
  const lower = calculateScenario(scenario, 3_000_000);
  assert.equal(lower.price, 3_000_000);
  assert.ok(lower.totalCost < original.totalCost);
  assert.equal(lower.renovationSubtotal, original.renovationSubtotal);
  assert.equal(lower.totalEquity, original.totalEquity);
});

test('maximum-price solver returns a price whose payment is near the target', () => {
  const scenario = baseScenario();
  const result = findMaxPropertyPriceForPayment(scenario, 8_000);
  assert.ok(result);
  assert.ok(result.price > 0);
  assert.ok(result.payment <= 8_000.01);
  const slightlyHigher = calculateScenario(scenario, result.price + 10_000);
  assert.ok(slightlyHigher.payment >= result.payment);
});
