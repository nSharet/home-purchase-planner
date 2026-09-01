import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  calculateEnvelope,
  getProductRate,
  optimizeMortgage,
  workingRate
} from '../mortgage/optimizer.js';

const rates = JSON.parse(
  await readFile(new URL('../mortgage/data/rates/current.json', import.meta.url), 'utf8')
);

const scenario = {
  propertyPrice: 3_200_000,
  appraisalValue: 3_200_000,
  purchaseCosts: 292_858,
  existingPropertyValue: 2_250_000,
  existingMortgageBalance: 490_000,
  existingMortgagePayment: 4_700,
  existingMortgagePayoffFee: 0,
  liquidEquity: 400_000,
  cashReserve: 0,
  monthlyNetIncome: 30_000,
  otherMonthlyLoans: 0,
  transitionPaymentCap: 12_000,
  stablePaymentCap: 7_500,
  termYears: 30,
  annualInflation: 2.6,
  primeScenarioDelta: 0,
  ratePosition: 0.4,
  allowIndexed: false,
  bridgeIndexed: false,
  purchaseEvents: [
    { month: 0, amount: 320_000 },
    { month: 2, amount: 480_000 },
    { month: 6, amount: 800_000 },
    { month: 9, amount: 800_000 },
    { month: 12, amount: 800_000 }
  ],
  saleEvents: [
    { month: 12, amount: 450_000 },
    { month: 18, amount: 1_800_000 }
  ]
};

test('uses the configured lower-middle point inside a rate range', () => {
  assert.equal(workingRate({ min: 4.5, max: 5.1 }, 0.4), 4.74);
  const fixed = getProductRate(rates, 'fixed-unlinked', 30, 70, 0.4);
  assert.deepEqual(fixed, { min: 4.3, max: 4.6, working: 4.42 });
});

test('calculates the replacement-buyer financing envelope', () => {
  const envelope = calculateEnvelope(scenario);
  assert.equal(envelope.newMortgageCapacity, 2_240_000);
  assert.equal(envelope.existingBridgeCapacity, 635_000);
  assert.equal(envelope.saleNet, 1_760_000);
  assert.equal(envelope.longTermNeed, 1_332_858);
  assert.equal(envelope.fundingPlan.transitionEndMonth, 18);
  assert.equal(envelope.fundingPlan.peakExistingBridge, 635_000);
  assert.equal(envelope.fundingPlan.peakNewBridge, 675_000);
  assert.ok(envelope.pricingLtvPercent > 60 && envelope.pricingLtvPercent < 70);
  assert.equal(envelope.fundingPlan.uncovered, 0);
  assert.equal(envelope.fundingPlan.remainingBridge, 0);
});

test('returns balanced, stable and flexible feasible options', () => {
  const result = optimizeMortgage(scenario, rates);
  assert.deepEqual(result.options.map((option) => option.profileId), ['balanced', 'stable', 'flexible']);
  for (const option of result.options) {
    assert.equal(option.feasible, true);
    assert.ok(option.variableShare <= 2 / 3 + 0.0001);
    assert.ok(option.peakTransitionPayment <= scenario.transitionPaymentCap);
    assert.ok(option.stablePayment <= scenario.stablePaymentCap);
    assert.ok(option.totalCost > 0);
  }
  assert.notDeepEqual(
    result.options[0].tracks.map((track) => track.share),
    result.options[2].tracks.map((track) => track.share)
  );
});

test('uses full grace only when it is needed to satisfy the transition cap', () => {
  const constrained = optimizeMortgage(scenario, rates);
  assert.ok(constrained.options.some((option) => option.graceStrategy.full.length > 0));

  const relaxed = optimizeMortgage({ ...scenario, transitionPaymentCap: 25_000 }, rates);
  assert.ok(relaxed.options.every((option) => option.graceStrategy.full.length === 0));
});

test('reports a permanent funding problem when the long-term need exceeds 70 percent', () => {
  const result = optimizeMortgage({
    ...scenario,
    liquidEquity: 0,
    saleEvents: [{ month: 18, amount: 500_000 }]
  }, rates);
  assert.ok(result.envelope.longTermNeed > result.envelope.newMortgageCapacity);
  assert.ok(result.warnings.some((warning) => warning.includes('70%')));
  assert.ok(result.options.every((option) => !option.feasible));
});
