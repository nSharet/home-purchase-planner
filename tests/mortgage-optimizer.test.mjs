import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  calculateAcquisitionCosts,
  calculateEnvelope,
  calculateNewPropertyFinancing,
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
  purchaseTaxMode: 'auto',
  manualPurchaseTax: 0,
  brokerPercent: 1.5,
  brokerVat: true,
  lawyerPercent: 0.5,
  lawyerVat: true,
  vatRate: 18,
  appraisalCost: 2_000,
  mortgageOpeningFee: 360,
  mortgageAdvisorCost: 11_800,
  otherCosts: [{ label: 'מעבר, התאמות וריהוט', amount: 150_000, enabled: true }],
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
  assert.ok(Math.abs(envelope.longTermNeed - 1_335_218.325) < 0.001);
  assert.equal(envelope.fundingPlan.transitionEndMonth, 18);
  assert.equal(envelope.fundingPlan.peakExistingBridge, 635_000);
  assert.ok(Math.abs(envelope.fundingPlan.peakNewBridge - 675_000) < 0.001);
  assert.ok(envelope.pricingLtvPercent > 60 && envelope.pricingLtvPercent < 70);
  assert.equal(envelope.fundingPlan.uncovered, 0);
  assert.equal(envelope.fundingPlan.remainingBridge, 0);
});

test('itemizes acquisition costs without expanding the regulatory LTV base', () => {
  const costs = calculateAcquisitionCosts(scenario);
  assert.ok(Math.abs(costs.purchaseTax - 55_538.325) < 0.001);
  assert.equal(costs.brokerage, 56_640);
  assert.equal(costs.lawyer, 18_880);
  assert.equal(costs.mortgageOpening, 360);
  assert.ok(Math.abs(costs.total - 295_218.325) < 0.001);

  const baseline = calculateEnvelope(scenario);
  const withMoreCosts = calculateEnvelope({
    ...scenario,
    otherCosts: [{ label: 'תוספת', amount: 250_000, enabled: true }]
  });
  assert.equal(withMoreCosts.newMortgageCapacity, baseline.newMortgageCapacity);
  assert.equal(withMoreCosts.ltvBase, baseline.ltvBase);
  assert.equal(withMoreCosts.projectTotal - baseline.projectTotal, 100_000);
  assert.equal(withMoreCosts.longTermNeed - baseline.longTermNeed, 100_000);
});

test('returns balanced, stable and flexible feasible options', () => {
  const result = optimizeMortgage(scenario, rates);
  assert.deepEqual(result.options.map((option) => option.profileId), ['balanced', 'stable', 'flexible']);
  for (const option of result.options) {
    assert.equal(option.feasible, true);
    assert.ok(option.variableShare <= 2 / 3 + 0.0001);
    assert.equal(
      option.newPropertyFinancing.total,
      result.envelope.longTermNeed + result.envelope.fundingPlan.peakNewBridge
    );
    assert.equal(option.bridgeComponents.existing.amount, result.envelope.fundingPlan.peakExistingBridge);
    assert.equal(option.bridgeComponents.newProperty.amount, result.envelope.fundingPlan.peakNewBridge);
    assert.ok(option.peakTransitionPayment <= scenario.transitionPaymentCap);
    assert.ok(option.stablePayment <= scenario.stablePaymentCap);
    assert.ok(option.totalCost > 0);
  }
  assert.notDeepEqual(
    result.options[0].tracks.map((track) => track.share),
    result.options[2].tracks.map((track) => track.share)
  );
});

test('checks the variable-rate limit across the long mortgage and new-property bridge only', () => {
  const envelope = calculateEnvelope(scenario);
  const allPrime = [{ share: 1, variable: true }];
  const variableBridge = calculateNewPropertyFinancing(allPrime, envelope, { variable: true });
  assert.equal(variableBridge.variableAmount, variableBridge.total);
  assert.equal(variableBridge.compliant, false);

  const fixedBridge = calculateNewPropertyFinancing(
    [{ share: 0.5, variable: true }, { share: 0.5, variable: false }],
    envelope,
    { variable: false }
  );
  assert.equal(fixedBridge.compliant, true);
  assert.equal(fixedBridge.total, envelope.longTermNeed + envelope.fundingPlan.peakNewBridge);
  assert.ok(fixedBridge.total < fixedBridge.total + envelope.fundingPlan.peakExistingBridge);
});

test('respects requests to avoid full grace and full bridge balloon', () => {
  const result = optimizeMortgage({
    ...scenario,
    avoidFullGrace: true,
    avoidFullBalloon: true,
    transitionPaymentCap: 7_000
  }, rates);
  assert.ok(result.options.every((option) => option.graceStrategy.full.length === 0));
  assert.ok(result.options.every((option) => option.bridge.paymentMode === 'partial'));
  assert.ok(result.options.some((option) => !option.feasible && option.transitionOverage > 0));
});

test('never marks a full-balloon option feasible with unpaid accrued interest', () => {
  const result = optimizeMortgage({
    ...scenario,
    avoidFullGrace: true,
    avoidFullBalloon: false,
    transitionPaymentCap: 5_000
  }, rates);
  for (const option of result.options.filter((candidate) => candidate.bridge.paymentMode === 'full')) {
    assert.ok(option.bridge.accruedInterest > 0);
    assert.equal(option.bridge.endingBalance, option.bridge.unpaidBalloonInterest);
    if (option.bridge.unpaidBalloonInterest > 1) {
      assert.equal(option.feasible, false);
      assert.ok(option.violations.some((violation) => violation.includes('ריבית בלון')));
    }
  }
});

test('uses full grace only when it is needed to satisfy the transition cap', () => {
  const constrained = optimizeMortgage({ ...scenario, avoidFullBalloon: true }, rates);
  assert.ok(constrained.options.some((option) => option.graceStrategy.full.length > 0));

  const relaxed = optimizeMortgage({
    ...scenario,
    avoidFullBalloon: true,
    transitionPaymentCap: 25_000
  }, rates);
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

test('measures the stable cap after late scheduled mortgage draws', () => {
  const result = optimizeMortgage({
    ...scenario,
    stablePaymentCap: 1_000,
    purchaseEvents: [
      { month: 0, amount: 100_000 },
      { month: 12, amount: 3_100_000 }
    ],
    saleEvents: [{ month: 1, amount: 2_250_000 }]
  }, rates);
  assert.ok(result.options.every((option) => option.stablePayment > 1_000));
  assert.ok(result.options.every((option) => !option.feasible));
});

test('rejects bridge timelines longer than the available market-rate term', () => {
  const result = optimizeMortgage({
    ...scenario,
    saleEvents: [{ month: 49, amount: 2_250_000 }]
  }, rates);
  assert.ok(result.envelope.fundingPlan.peakBridge > 0);
  assert.ok(result.options.every((option) => !option.bridge.termSupported));
  assert.ok(result.options.every((option) => !option.feasible));
  assert.ok(result.warnings.some((warning) => warning.includes('תקופת הגישור')));
});

test('trims purchase schedule overages across multiple installments', () => {
  const envelope = calculateEnvelope({
    ...scenario,
    propertyPrice: 1_000_000,
    appraisalValue: 1_000_000,
    purchaseTaxMode: 'manual',
    manualPurchaseTax: 0,
    brokerPercent: 0,
    lawyerPercent: 0,
    appraisalCost: 0,
    mortgageOpeningFee: 0,
    mortgageAdvisorCost: 0,
    otherCosts: [],
    purchaseEvents: [
      { month: 0, amount: 1_500_000 },
      { month: 2, amount: 100_000 }
    ]
  });
  assert.equal(envelope.fundingPlan.scheduledPurchaseTotal, 1_600_000);
  assert.equal(envelope.fundingPlan.adjustedPurchaseTotal, 1_000_000);
  assert.equal(
    envelope.fundingPlan.months.reduce((sum, month) => sum + month.outflow, 0),
    1_000_000
  );
});
