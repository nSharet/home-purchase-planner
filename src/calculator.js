export const taxBrackets = {
  single: [
    { upTo: 1_978_745, rate: 0 },
    { upTo: 2_347_040, rate: 0.035 },
    { upTo: 6_055_070, rate: 0.05 },
    { upTo: 20_183_565, rate: 0.08 },
    { upTo: Infinity, rate: 0.10 }
  ],
  investment: [
    { upTo: 6_055_070, rate: 0.08 },
    { upTo: Infinity, rate: 0.10 }
  ]
};

export function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function calculatePurchaseTax(price, type) {
  const normalizedPrice = Math.max(0, n(price));
  const brackets = type === 'investment' ? taxBrackets.investment : taxBrackets.single;
  let tax = 0;
  let lower = 0;

  for (const bracket of brackets) {
    const taxable = Math.max(0, Math.min(normalizedPrice, bracket.upTo) - lower);
    tax += taxable * bracket.rate;
    if (normalizedPrice <= bracket.upTo) break;
    lower = bracket.upTo;
  }

  return tax;
}

export function getDefaultLtv(type) {
  if (type === 'single') return 75;
  if (type === 'replacement') return 70;
  return 50;
}

export function calculateRepayment(loan, points = [], mode = 'interpolate') {
  const normalizedLoan = Math.max(0, n(loan));
  const rows = points
    .map((point) => ({ loan: n(point.loan), payment: n(point.payment) }))
    .filter((point) => point.loan > 0)
    .sort((a, b) => a.loan - b.loan);

  if (normalizedLoan <= 0 || rows.length === 0) return 0;

  if (mode === 'nextStep') {
    const hit = rows.find((point) => normalizedLoan <= point.loan);
    if (hit) return hit.payment;
    if (rows.length === 1) return rows[0].payment * normalizedLoan / rows[0].loan;

    const a = rows[rows.length - 2];
    const b = rows[rows.length - 1];
    const slope = (b.payment - a.payment) / Math.max(1, b.loan - a.loan);
    return b.payment + (normalizedLoan - b.loan) * slope;
  }

  const extended = [{ loan: 0, payment: 0 }, ...rows];
  for (let index = 1; index < extended.length; index += 1) {
    const a = extended[index - 1];
    const b = extended[index];
    if (normalizedLoan <= b.loan) {
      const ratio = (normalizedLoan - a.loan) / Math.max(1, b.loan - a.loan);
      return a.payment + ratio * (b.payment - a.payment);
    }
  }

  if (extended.length === 2) return rows[0].payment * normalizedLoan / rows[0].loan;
  const a = extended[extended.length - 2];
  const b = extended[extended.length - 1];
  const slope = (b.payment - a.payment) / Math.max(1, b.loan - a.loan);
  return b.payment + (normalizedLoan - b.loan) * slope;
}

export function calculateScenario(scenario, overridePrice = null) {
  const s = scenario ?? {};
  const price = Math.max(0, overridePrice === null ? n(s.propertyPrice) : n(overridePrice));
  const autoTax = calculatePurchaseTax(price, s.purchaseType);
  const tax = s.taxMode === 'manual' ? Math.max(0, n(s.manualTax)) : autoTax;
  const vatMultiplier = 1 + Math.max(0, n(s.vatRate)) / 100;
  const broker = price * Math.max(0, n(s.brokerPct)) / 100 * (s.brokerVat ? vatMultiplier : 1);
  const lawyer = price * Math.max(0, n(s.lawyerPct)) / 100 * (s.lawyerVat ? vatMultiplier : 1);
  const fixedTransaction =
    Math.max(0, n(s.appraisalCost)) +
    Math.max(0, n(s.mortgageFees)) +
    Math.max(0, n(s.registrationCosts)) +
    Math.max(0, n(s.movingCosts)) +
    Math.max(0, n(s.otherTransactionCosts));

  const renovations = Array.isArray(s.renovations) ? s.renovations : [];
  const renovationSubtotal = renovations.reduce(
    (sum, row) => sum + (row.enabled ? Math.max(0, n(row.amount)) : 0),
    0
  );
  const contingency = renovationSubtotal * Math.max(0, n(s.contingencyPct)) / 100;
  const transactionCosts = tax + broker + lawyer + fixedTransaction;
  const extras = transactionCosts + renovationSubtotal + contingency;
  const totalCost = price + extras;

  const existingPropertyValue = Math.max(0, n(s.existingPropertyValue));
  const saleCosts = existingPropertyValue * Math.max(0, n(s.saleCostPct)) / 100;
  const propertyEquityGross = Math.max(
    0,
    existingPropertyValue - Math.max(0, n(s.existingPropertyDebt)) - saleCosts
  );
  const propertyEquity = propertyEquityGross * clamp(n(s.propertyEquityUsePct), 0, 100) / 100;
  const totalEquity = Math.max(
    0,
    Math.max(0, n(s.liquidEquity)) +
      Math.max(0, n(s.otherEquity)) +
      propertyEquity -
      Math.max(0, n(s.reserveCash))
  );

  const mortgageGap = Math.max(0, totalCost - totalEquity + n(s.manualMortgageAdjustment));
  const appraisal = n(s.appraisalValue) > 0 ? n(s.appraisalValue) : price;
  const ltvBase = Math.max(0, Math.min(price, appraisal));
  const ltvLimit = clamp(n(s.maxLtvOverride), 0, 100);
  const maxMortgage = ltvBase * ltvLimit / 100;
  const ltv = ltvBase > 0 ? mortgageGap / ltvBase * 100 : 0;
  const financingShortfall = Math.max(0, mortgageGap - maxMortgage);
  const payment = calculateRepayment(mortgageGap, s.repayments, s.repaymentMode);

  return {
    price,
    autoTax,
    tax,
    broker,
    lawyer,
    fixedTransaction,
    transactionCosts,
    renovationSubtotal,
    contingency,
    extras,
    totalCost,
    saleCosts,
    propertyEquityGross,
    propertyEquity,
    totalEquity,
    mortgageGap,
    ltvBase,
    ltvLimit,
    maxMortgage,
    ltv,
    financingShortfall,
    payment
  };
}

export function findMaxPropertyPriceForPayment(
  scenario,
  targetMonthlyPayment,
  { maxPrice = 100_000_000, iterations = 70 } = {}
) {
  const target = n(targetMonthlyPayment);
  if (target <= 0) return null;

  const atZero = calculateScenario(scenario, 0);
  if (atZero.payment > target) {
    return {
      price: 0,
      mortgage: atZero.mortgageGap,
      payment: atZero.payment,
      totalCost: atZero.totalCost,
      ltv: atZero.ltv
    };
  }

  let low = 0;
  let high = Math.max(1_000_000, n(scenario?.propertyPrice) * 1.5);
  while (high < maxPrice && calculateScenario(scenario, high).payment <= target) {
    high = Math.min(maxPrice, high * 2);
  }

  if (calculateScenario(scenario, high).payment <= target) {
    const result = calculateScenario(scenario, high);
    return {
      price: high,
      mortgage: result.mortgageGap,
      payment: result.payment,
      totalCost: result.totalCost,
      ltv: result.ltv
    };
  }

  for (let index = 0; index < iterations; index += 1) {
    const middle = (low + high) / 2;
    if (calculateScenario(scenario, middle).payment <= target) low = middle;
    else high = middle;
  }

  const result = calculateScenario(scenario, low);
  return {
    price: low,
    mortgage: result.mortgageGap,
    payment: result.payment,
    totalCost: result.totalCost,
    ltv: result.ltv
  };
}
