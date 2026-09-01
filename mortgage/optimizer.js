import { calculatePurchaseTax } from '../src/calculator.js';

const PROFILE_DEFINITIONS = {
  balanced: {
    label: 'מאוזנת',
    description: 'עלות נמוכה תוך פיזור בין ודאות, גמישות וסיכון ריבית.',
    mixes: [
      { fixedUnlinked: 0.35, prime: 0.45, variable5Unlinked: 0.20 },
      { fixedUnlinked: 0.45, prime: 0.35, variable5Unlinked: 0.20 },
      { fixedUnlinked: 0.35, fixedLinked: 0.15, prime: 0.35, variable5Unlinked: 0.15 },
      { fixedUnlinked: 0.35, prime: 0.35, variable5Unlinked: 0.15, variable5Linked: 0.15 }
    ]
  },
  stable: {
    label: 'יציבה',
    description: 'יותר ריבית קבועה ולא־צמודה כדי לצמצם תנודתיות עתידית.',
    mixes: [
      { fixedUnlinked: 0.60, prime: 0.20, variable5Unlinked: 0.20 },
      { fixedUnlinked: 0.70, prime: 0.20, variable5Unlinked: 0.10 },
      { fixedUnlinked: 0.55, fixedLinked: 0.10, prime: 0.20, variable5Unlinked: 0.15 }
    ]
  },
  flexible: {
    label: 'גמישה',
    description: 'יותר מסלולים שנוח לפרוע או למחזר לאחר קבלת כספי המכירה.',
    mixes: [
      { fixedUnlinked: 0.35, prime: 0.55, variable5Unlinked: 0.10 },
      { fixedUnlinked: 0.40, prime: 0.50, variable5Unlinked: 0.10 }
    ]
  }
};

const TRACK_META = {
  fixedUnlinked: { label: 'קל״צ', productId: 'fixed-unlinked', indexed: false, variable: false },
  fixedLinked: { label: 'קבועה צמודה', productId: 'fixed-linked', indexed: true, variable: false },
  prime: { label: 'פריים', productId: 'prime', indexed: false, variable: true, primeBased: true },
  variable5Unlinked: { label: 'משתנה 5 לא־צמודה', productId: 'variable-5-unlinked', indexed: false, variable: true },
  variable5Linked: { label: 'משתנה 5 צמודה', productId: 'variable-5-linked', indexed: true, variable: true }
};

export function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, number(value)));
}

export function workingRate(range, position = 0.4) {
  if (!range) return 0;
  const min = number(range.min);
  const max = Math.max(min, number(range.max));
  return min + clamp(position, 0, 1) * (max - min);
}

export function ltvBand(ltvPercent) {
  if (number(ltvPercent) <= 45) return 'upTo45';
  if (number(ltvPercent) <= 60) return 'from45To60';
  return 'from60To75';
}

export function getProductRate(dataset, productId, years, ltvPercent, position = 0.4) {
  const product = dataset?.products?.find((item) => item.id === productId);
  if (!product) throw new Error(`Missing rate product: ${productId}`);

  const term = product.terms?.find(
    (item) => number(years) >= number(item.minYears) && number(years) <= number(item.maxYears)
  ) ?? product.terms?.[product.terms.length - 1];
  if (!term) throw new Error(`Missing term for rate product: ${productId}`);

  const band = ltvBand(ltvPercent);
  const range = term.bands?.[band] ?? term.bands?.all;
  if (!range) throw new Error(`Missing ${band} band for rate product: ${productId}`);

  return {
    min: number(range.min),
    max: number(range.max),
    working: workingRate(range, position)
  };
}

export function annuityPayment(principal, annualRatePercent, months) {
  const amount = Math.max(0, number(principal));
  const count = Math.max(0, Math.round(number(months)));
  if (!amount || !count) return 0;
  const monthlyRate = number(annualRatePercent) / 100 / 12;
  if (!monthlyRate) return amount / count;
  return amount * monthlyRate / (1 - (1 + monthlyRate) ** -count);
}

export function calculateAcquisitionCosts(input) {
  const propertyPrice = Math.max(0, number(input.propertyPrice));
  const vatMultiplier = 1 + Math.max(0, number(input.vatRate)) / 100;
  const automaticPurchaseTax = calculatePurchaseTax(propertyPrice, 'single');
  const purchaseTax = input.purchaseTaxMode === 'manual'
    ? Math.max(0, number(input.manualPurchaseTax))
    : automaticPurchaseTax;
  const brokerage = propertyPrice * Math.max(0, number(input.brokerPercent)) / 100
    * (input.brokerVat ? vatMultiplier : 1);
  const lawyer = propertyPrice * Math.max(0, number(input.lawyerPercent)) / 100
    * (input.lawyerVat ? vatMultiplier : 1);
  const appraisal = Math.max(0, number(input.appraisalCost));
  const mortgageOpening = Math.max(0, number(input.mortgageOpeningFee));
  const mortgageAdvisor = Math.max(0, number(input.mortgageAdvisorCost));
  const additional = (Array.isArray(input.otherCosts) ? input.otherCosts : [])
    .filter((item) => item.enabled !== false)
    .reduce((sum, item) => sum + Math.max(0, number(item.amount)), 0);
  const structuredTotal = purchaseTax + brokerage + lawyer + appraisal
    + mortgageOpening + mortgageAdvisor + additional;
  const hasStructuredCosts = [
    'purchaseTaxMode', 'brokerPercent', 'lawyerPercent', 'appraisalCost',
    'mortgageOpeningFee', 'mortgageAdvisorCost', 'otherCosts'
  ].some((key) => Object.hasOwn(input, key));
  const total = hasStructuredCosts ? structuredTotal : Math.max(0, number(input.purchaseCosts));

  return {
    automaticPurchaseTax,
    purchaseTax,
    brokerage,
    lawyer,
    appraisal,
    mortgageOpening,
    mortgageAdvisor,
    additional,
    total
  };
}

function normalizeEvents(events) {
  return (Array.isArray(events) ? events : [])
    .map((event) => ({ month: Math.max(0, Math.round(number(event.month))), amount: Math.max(0, number(event.amount)) }))
    .filter((event) => event.amount > 0)
    .sort((a, b) => a.month - b.month);
}

function sumByMonth(events) {
  const result = new Map();
  for (const event of events) result.set(event.month, (result.get(event.month) ?? 0) + event.amount);
  return result;
}

function buildFundingPlan(input, envelope) {
  const purchases = normalizeEvents(input.purchaseEvents);
  if (!purchases.length) purchases.push({ month: 0, amount: envelope.propertyPrice });

  const scheduledPurchaseTotal = purchases.reduce((sum, event) => sum + event.amount, 0);
  const scheduleDifference = envelope.propertyPrice - scheduledPurchaseTotal;
  if (scheduleDifference >= 1) {
    const last = purchases[purchases.length - 1];
    last.amount += scheduleDifference;
  } else if (scheduleDifference <= -1) {
    let excess = -scheduleDifference;
    for (let index = purchases.length - 1; index >= 0 && excess > 0; index -= 1) {
      const reduction = Math.min(excess, purchases[index].amount);
      purchases[index].amount -= reduction;
      excess -= reduction;
    }
  }
  const adjustedPurchases = purchases.filter((event) => event.amount > 0);

  const sales = normalizeEvents(input.saleEvents);
  const transitionEndMonth = sales.length ? sales[sales.length - 1].month : 0;
  const saleByMonth = sumByMonth(sales);
  if (sales.length) {
    const payoff = envelope.existingMortgageBalance + envelope.existingMortgagePayoffFee;
    saleByMonth.set(transitionEndMonth, (saleByMonth.get(transitionEndMonth) ?? 0) - payoff);
  }

  const purchaseByMonth = sumByMonth(adjustedPurchases);
  purchaseByMonth.set(0, (purchaseByMonth.get(0) ?? 0) + envelope.purchaseCosts);
  const maxEventMonth = Math.max(
    transitionEndMonth,
    ...adjustedPurchases.map((event) => event.month),
    0
  );

  let cash = envelope.availableEquity;
  let remainingLong = envelope.longTermNeed;
  let existingBridgeBalance = 0;
  let newBridgeBalance = 0;
  let peakExistingBridge = 0;
  let peakNewBridge = 0;
  const longDraws = [];
  const months = [];

  for (let month = 0; month <= maxEventMonth; month += 1) {
    const inflow = saleByMonth.get(month) ?? 0;
    const outflow = purchaseByMonth.get(month) ?? 0;
    cash += inflow - outflow;
    let longDraw = 0;
    let existingBridgeDraw = 0;
    let newBridgeDraw = 0;
    let bridgeRepayment = 0;

    if (cash < 0 && remainingLong > 0) {
      longDraw = Math.min(-cash, remainingLong);
      cash += longDraw;
      remainingLong -= longDraw;
      longDraws.push({ month, amount: longDraw });
    }

    if (cash < 0) {
      const existingAvailable = Math.max(0, envelope.existingBridgeCapacity - existingBridgeBalance);
      existingBridgeDraw = Math.min(-cash, existingAvailable);
      existingBridgeBalance += existingBridgeDraw;
      cash += existingBridgeDraw;
    }

    if (cash < 0) {
      const newAvailable = Math.max(0, envelope.newBridgeCapacity - newBridgeBalance);
      newBridgeDraw = Math.min(-cash, newAvailable);
      newBridgeBalance += newBridgeDraw;
      cash += newBridgeDraw;
    }

    if (cash > 0 && (existingBridgeBalance > 0 || newBridgeBalance > 0)) {
      const repayNew = Math.min(cash, newBridgeBalance);
      newBridgeBalance -= repayNew;
      cash -= repayNew;
      const repayExisting = Math.min(cash, existingBridgeBalance);
      existingBridgeBalance -= repayExisting;
      cash -= repayExisting;
      bridgeRepayment = repayNew + repayExisting;
    }

    peakExistingBridge = Math.max(peakExistingBridge, existingBridgeBalance);
    peakNewBridge = Math.max(peakNewBridge, newBridgeBalance);
    months.push({
      month,
      inflow,
      outflow,
      longDraw,
      existingBridgeDraw,
      newBridgeDraw,
      bridgeRepayment,
      existingBridgeBalance,
      newBridgeBalance,
      uncovered: Math.max(0, -cash)
    });
  }

  const bridgeStart = months.find((month) => month.existingBridgeDraw > 0 || month.newBridgeDraw > 0);
  return {
    months,
    longDraws,
    transitionEndMonth,
    peakExistingBridge,
    peakNewBridge,
    peakBridge: peakExistingBridge + peakNewBridge,
    remainingBridge: existingBridgeBalance + newBridgeBalance,
    uncovered: months.reduce((max, month) => Math.max(max, month.uncovered), 0),
    scheduledPurchaseTotal,
    adjustedPurchaseTotal: adjustedPurchases.reduce((sum, event) => sum + event.amount, 0),
    bridgeStartMonth: bridgeStart?.month ?? null,
    bridgeDurationYears: bridgeStart
      ? Math.max(0, (transitionEndMonth - bridgeStart.month) / 12)
      : 0,
    scheduleDifference
  };
}

export function calculateEnvelope(input) {
  const propertyPrice = Math.max(0, number(input.propertyPrice));
  const appraisalValue = number(input.appraisalValue) > 0 ? number(input.appraisalValue) : propertyPrice;
  const ltvBase = Math.max(0, Math.min(propertyPrice, appraisalValue));
  const newMortgageCapacity = ltvBase * 0.70;
  const acquisitionCosts = calculateAcquisitionCosts(input);
  const purchaseCosts = acquisitionCosts.total;
  const existingPropertyValue = Math.max(0, number(input.existingPropertyValue));
  const existingMortgageBalance = Math.max(0, number(input.existingMortgageBalance));
  const existingMortgagePayoffFee = Math.max(0, number(input.existingMortgagePayoffFee));
  const existingBridgeCapacity = Math.max(0, existingPropertyValue * 0.50 - existingMortgageBalance);
  const availableEquity = Math.max(0, number(input.liquidEquity) - number(input.cashReserve));
  const saleGross = normalizeEvents(input.saleEvents).reduce((sum, event) => sum + event.amount, 0);
  const saleNet = Math.max(0, saleGross - existingMortgageBalance - existingMortgagePayoffFee);
  const projectTotal = propertyPrice + purchaseCosts;
  const longTermNeed = Math.max(0, projectTotal - availableEquity - saleNet);
  const newBridgeCapacity = Math.max(0, newMortgageCapacity - longTermNeed);
  const ltvPercent = ltvBase > 0 ? (longTermNeed / ltvBase) * 100 : 0;

  const envelope = {
    propertyPrice,
    appraisalValue,
    ltvBase,
    purchaseCosts,
    acquisitionCosts,
    projectTotal,
    newMortgageCapacity,
    existingPropertyValue,
    existingMortgageBalance,
    existingMortgagePayoffFee,
    existingBridgeCapacity,
    availableEquity,
    saleGross,
    saleNet,
    longTermNeed,
    newBridgeCapacity,
    ltvPercent
  };

  const fundingPlan = buildFundingPlan(input, envelope);
  const pricingLtvPercent = ltvBase > 0
    ? (longTermNeed + fundingPlan.peakNewBridge) / ltvBase * 100
    : 0;
  return { ...envelope, pricingLtvPercent, fundingPlan };
}

function trackRatesForMix(dataset, mix, termYears, ltvPercent, ratePosition, primeScenarioDelta) {
  return Object.entries(mix).map(([trackId, share]) => {
    const meta = TRACK_META[trackId];
    const rate = getProductRate(dataset, meta.productId, termYears, ltvPercent, ratePosition);
    const scenarioRate = Math.max(0, rate.working + (meta.primeBased ? number(primeScenarioDelta) : 0));
    return { trackId, share, ...meta, ...rate, scenarioRate };
  });
}

function graceVariants(tracks, avoidFullGrace = false) {
  const ids = tracks.map((track) => track.trackId);
  const variable = tracks.filter((track) => track.variable).map((track) => track.trackId);
  const variants = [
    { partial: [], full: [] },
    ...ids.map((id) => ({ partial: [id], full: [] })),
    ...ids.map((id) => ({ partial: [], full: [id] }))
  ];
  if (variable.length) {
    variants.push({ partial: variable, full: [] });
    variants.push({ partial: [], full: variable });
  }
  variants.push({ partial: ids, full: [] });
  variants.push({ partial: [], full: ids });
  return variants.filter((variant, index, all) => {
    if (avoidFullGrace && variant.full.length) return false;
    const key = `p:${[...variant.partial].sort().join('|')};f:${[...variant.full].sort().join('|')}`;
    return all.findIndex((candidate) =>
      `p:${[...candidate.partial].sort().join('|')};f:${[...candidate.full].sort().join('|')}` === key
    ) === index;
  });
}

function simulateSubloan({ amount, startMonth, track, termYears, graceUntilMonth, graceMode, annualInflation }) {
  const totalMonths = Math.max(1, Math.round(number(termYears) * 12));
  const rateMonthly = track.scenarioRate / 100 / 12;
  const inflationMonthly = track.indexed ? (1 + number(annualInflation) / 100) ** (1 / 12) - 1 : 0;
  let balance = Math.max(0, number(amount));
  let totalPayments = 0;
  let totalInterest = 0;
  let totalIndexation = 0;
  const payments = new Map();

  for (let offset = 0; offset < totalMonths && balance > 0.01; offset += 1) {
    const month = startMonth + offset;
    if (inflationMonthly) {
      const indexation = balance * inflationMonthly;
      balance += indexation;
      totalIndexation += indexation;
    }

    const interest = balance * rateMonthly;
    const inGrace = month <= graceUntilMonth;
    const remaining = totalMonths - offset;
    let payment;

    if (inGrace && graceMode === 'full') {
      payment = 0;
      balance += interest;
    } else if (inGrace) {
      payment = interest;
    } else {
      payment = Math.min(balance + interest, annuityPayment(balance, track.scenarioRate, remaining));
    }

    const principalPaid = Math.max(0, payment - interest);
    balance = Math.max(0, balance - principalPaid);
    totalPayments += payment;
    totalInterest += interest;
    payments.set(month, payment);
  }

  return { payments, totalPayments, totalInterest, totalIndexation, endingBalance: balance };
}

function simulateBridge(dataset, input, envelope, ratePosition, paymentMode = 'partial') {
  const productId = input.bridgeIndexed ? 'bridge-linked' : 'bridge-unlinked';
  const product = dataset?.products?.find((item) => item.id === productId);
  const requestedYears = envelope.fundingPlan.bridgeDurationYears;
  const termSupported = envelope.fundingPlan.peakBridge <= 0 || Boolean(product?.terms?.some(
    (term) => requestedYears >= number(term.minYears) && requestedYears <= number(term.maxYears)
  ));
  const fallbackYears = product?.terms?.[product.terms.length - 1]?.maxYears ?? requestedYears;
  const rate = getProductRate(
    dataset,
    productId,
    termSupported ? requestedYears : fallbackYears,
    envelope.pricingLtvPercent,
    ratePosition
  );
  const rateMonthly = rate.working / 100 / 12;
  const inflationMonthly = input.bridgeIndexed
    ? (1 + number(input.annualInflation) / 100) ** (1 / 12) - 1
    : 0;
  let existingBalance = 0;
  let newBalance = 0;
  let totalInterest = 0;
  let totalIndexation = 0;
  let accruedInterest = 0;
  const payments = new Map();

  for (const month of envelope.fundingPlan.months) {
    existingBalance += month.existingBridgeDraw;
    newBalance += month.newBridgeDraw;
    const repayment = month.bridgeRepayment;
    const repayNew = Math.min(repayment, newBalance);
    newBalance -= repayNew;
    existingBalance = Math.max(0, existingBalance - Math.max(0, repayment - repayNew));

    if (inflationMonthly) {
      const indexation = (existingBalance + newBalance) * inflationMonthly;
      const total = existingBalance + newBalance;
      if (total > 0) {
        existingBalance += indexation * existingBalance / total;
        newBalance += indexation * newBalance / total;
      }
      totalIndexation += indexation;
    }

    const interest = (existingBalance + newBalance + accruedInterest) * rateMonthly;
    totalInterest += interest;
    if (paymentMode === 'full') {
      accruedInterest += interest;
      payments.set(month.month, 0);
    } else {
      payments.set(month.month, interest);
    }
  }

  return {
    productId,
    label: product?.label ?? (input.bridgeIndexed ? 'גישור צמוד' : 'גישור לא־צמוד'),
    indexed: Boolean(product?.indexed),
    variable: Boolean(product?.variable),
    paymentMode,
    rate,
    requestedYears,
    termSupported,
    payments,
    totalInterest,
    totalIndexation,
    totalCost: totalInterest + totalIndexation,
    endingBalance: existingBalance + newBalance
  };
}

export function calculateNewPropertyFinancing(tracks, envelope, bridge) {
  const longTermAmount = Math.max(0, number(envelope.longTermNeed));
  const newBridgeAmount = Math.max(0, number(envelope.fundingPlan?.peakNewBridge));
  const variableLongTermAmount = (Array.isArray(tracks) ? tracks : [])
    .filter((track) => track.variable)
    .reduce((sum, track) => sum + longTermAmount * Math.max(0, number(track.share)), 0);
  const variableBridgeAmount = bridge?.variable ? newBridgeAmount : 0;
  const total = longTermAmount + newBridgeAmount;
  const variableAmount = variableLongTermAmount + variableBridgeAmount;
  const fixedAmount = Math.max(0, total - variableAmount);
  const variableShare = total > 0 ? variableAmount / total : 0;

  return {
    total,
    longTermAmount,
    newBridgeAmount,
    fixedAmount,
    variableAmount,
    fixedShare: total > 0 ? fixedAmount / total : 0,
    variableShare,
    compliant: variableShare <= 2 / 3 + 0.0001
  };
}

function simulateCandidate({ input, envelope, dataset, profileId, mix, graceStrategy, bridgeMode }) {
  const termYears = clamp(input.termYears || 30, 4, 30);
  const ratePosition = clamp(input.ratePosition ?? 0.4, 0, 1);
  const tracks = trackRatesForMix(
    dataset,
    mix,
    termYears,
    envelope.pricingLtvPercent,
    ratePosition,
    input.primeScenarioDelta
  );
  const paymentByMonth = new Map();
  let totalPayments = 0;
  let totalInterest = 0;
  let totalIndexation = 0;

  for (const draw of envelope.fundingPlan.longDraws) {
    for (const track of tracks) {
      const graceMode = graceStrategy.full.includes(track.trackId)
        ? 'full'
        : graceStrategy.partial.includes(track.trackId) ? 'partial' : 'none';
      const subloan = simulateSubloan({
        amount: draw.amount * track.share,
        startMonth: draw.month,
        track,
        termYears,
        graceUntilMonth: graceMode !== 'none'
          ? envelope.fundingPlan.transitionEndMonth
          : draw.month - 1,
        graceMode,
        annualInflation: input.annualInflation
      });
      totalPayments += subloan.totalPayments;
      totalInterest += subloan.totalInterest;
      totalIndexation += subloan.totalIndexation;
      for (const [month, payment] of subloan.payments) {
        paymentByMonth.set(month, (paymentByMonth.get(month) ?? 0) + payment);
      }
    }
  }

  const bridge = simulateBridge(dataset, input, envelope, ratePosition, bridgeMode);
  const transitionEnd = envelope.fundingPlan.transitionEndMonth;
  const existingPayment = Math.max(0, number(input.existingMortgagePayment));
  const otherMonthlyLoans = Math.max(0, number(input.otherMonthlyLoans));
  let peakTransitionPayment = 0;

  for (let month = 0; month <= transitionEnd; month += 1) {
    const current =
      (paymentByMonth.get(month) ?? 0) +
      (bridge.payments.get(month) ?? 0) +
      otherMonthlyLoans +
      existingPayment;
    peakTransitionPayment = Math.max(peakTransitionPayment, current);
  }

  const finalPaymentMonth = Math.max(transitionEnd + 1, ...paymentByMonth.keys());
  let stablePayment = otherMonthlyLoans;
  for (let month = transitionEnd + 1; month <= finalPaymentMonth; month += 1) {
    stablePayment = Math.max(stablePayment, (paymentByMonth.get(month) ?? 0) + otherMonthlyLoans);
  }
  const incomeCap = Math.max(0, number(input.monthlyNetIncome) * 0.50);
  const requestedTransitionCap = number(input.transitionPaymentCap) || Infinity;
  const requestedStableCap = number(input.stablePaymentCap) || Infinity;
  const effectiveTransitionCap = incomeCap > 0 ? Math.min(requestedTransitionCap, incomeCap) : requestedTransitionCap;
  const effectiveStableCap = incomeCap > 0 ? Math.min(requestedStableCap, incomeCap) : requestedStableCap;
  const financingFees = Math.max(0, number(input.financingFees));
  const estimatedEarlyRepaymentFee = Math.max(0, number(input.estimatedEarlyRepaymentFee));
  const totalCost = totalInterest + totalIndexation + bridge.totalCost + financingFees + estimatedEarlyRepaymentFee;

  const newPropertyFinancing = calculateNewPropertyFinancing(tracks, envelope, bridge);
  const regulatoryVariableShare = newPropertyFinancing.variableShare;
  const indexedShare = tracks
    .filter((track) => track.indexed)
    .reduce((sum, track) => sum + track.share, 0);

  const violations = [];
  if (!newPropertyFinancing.compliant) {
    violations.push('הריבית המשתנה בכלל המימון על הבית החדש גבוהה משני שלישים');
  }
  if (envelope.longTermNeed > envelope.newMortgageCapacity + 1) violations.push('המשכנתה הארוכה חורגת מתקרת 70%');
  if (envelope.fundingPlan.uncovered > 1) violations.push('קיים פער מימון שאינו מכוסה');
  if (envelope.fundingPlan.remainingBridge > 1) violations.push('הגישור אינו נסגר לאחר תקבולי המכירה');
  if (bridge.endingBalance > 1) violations.push('הצמדה הותירה יתרת גישור לאחר המכירה');
  if (!bridge.termSupported) violations.push('תקופת הגישור ארוכה מטווח הריבית הזמין');
  if (peakTransitionPayment > effectiveTransitionCap + 1) violations.push('החזר המעבר חורג מהתקרה');
  if (stablePayment > effectiveStableCap + 1) violations.push('ההחזר הקבוע חורג מהתקרה');

  const transitionOverage = Math.max(0, peakTransitionPayment - effectiveTransitionCap);
  const stableOverage = Math.max(0, stablePayment - effectiveStableCap);

  return {
    profileId,
    profile: PROFILE_DEFINITIONS[profileId].label,
    description: PROFILE_DEFINITIONS[profileId].description,
    tracks,
    graceStrategy,
    bridge,
    bridgeComponents: {
      existing: {
        amount: envelope.fundingPlan.peakExistingBridge,
        label: bridge.label,
        rate: bridge.rate.working,
        paymentMode: bridge.paymentMode,
        indexed: bridge.indexed,
        variable: bridge.variable
      },
      newProperty: {
        amount: envelope.fundingPlan.peakNewBridge,
        label: bridge.label,
        rate: bridge.rate.working,
        paymentMode: bridge.paymentMode,
        indexed: bridge.indexed,
        variable: bridge.variable
      }
    },
    newPropertyFinancing,
    totalCost,
    totalInterest: totalInterest + bridge.totalInterest,
    totalIndexation: totalIndexation + bridge.totalIndexation,
    peakTransitionPayment,
    stablePayment,
    effectiveTransitionCap,
    effectiveStableCap,
    transitionOverage,
    stableOverage,
    variableShare: regulatoryVariableShare,
    indexedShare,
    feasible: violations.length === 0,
    violations
  };
}

function optimizeProfile(input, envelope, dataset, profileId) {
  const definition = PROFILE_DEFINITIONS[profileId];
  const allowIndexed = input.allowIndexed !== false;
  const candidates = [];

  for (const mix of definition.mixes) {
    if (!allowIndexed && Object.keys(mix).some((id) => TRACK_META[id].indexed)) continue;
    const tracks = trackRatesForMix(
      dataset,
      mix,
      clamp(input.termYears || 30, 4, 30),
      envelope.pricingLtvPercent,
      clamp(input.ratePosition ?? 0.4, 0, 1),
      input.primeScenarioDelta
    );
    const bridgeModes = input.avoidFullBalloon === true ? ['partial'] : ['partial', 'full'];
    for (const graceStrategy of graceVariants(tracks, input.avoidFullGrace === true)) {
      for (const bridgeMode of bridgeModes) {
        candidates.push(simulateCandidate({
          input, envelope, dataset, profileId, mix, graceStrategy, bridgeMode
        }));
      }
    }
  }

  const feasible = candidates.filter((candidate) => candidate.feasible).sort((a, b) => a.totalCost - b.totalCost);
  if (feasible.length) return feasible[0];
  return candidates.sort((a, b) =>
    a.violations.length - b.violations.length ||
    (a.transitionOverage + a.stableOverage) - (b.transitionOverage + b.stableOverage) ||
    a.totalCost - b.totalCost
  )[0] ?? null;
}

export function optimizeMortgage(input, dataset) {
  const envelope = calculateEnvelope(input);
  const options = ['balanced', 'stable', 'flexible']
    .map((profileId) => optimizeProfile(input, envelope, dataset, profileId))
    .filter(Boolean);
  const warnings = [];

  if (envelope.fundingPlan.scheduleDifference !== 0) {
    warnings.push('לוח תשלומי הרכישה אינו שווה למחיר הבית; הוא הותאם אוטומטית למחיר לצורך החישוב.');
  }
  if (envelope.longTermNeed > envelope.newMortgageCapacity) {
    warnings.push('הצורך הקבוע לאחר המכירה גבוה מתקרת 70% המימון על הבית החדש.');
  }
  if (envelope.fundingPlan.uncovered > 0) {
    warnings.push('קיים פער מימון מעבר לקיבולת המשכנתה והגישור.');
  }
  if (options.some((option) => !option.bridge.termSupported)) {
    warnings.push('תקופת הגישור חורגת מטווח התקופה הזמין במקור הריביות; החלופות מסומנות כלא ישימות.');
  }
  if (dataset?.meta?.sourceUpdatedAt) {
    const ageDays = (Date.now() - new Date(dataset.meta.sourceUpdatedAt).getTime()) / 86_400_000;
    if (Number.isFinite(ageDays) && ageDays > 35) warnings.push('נתוני הריבית ישנים מ־35 יום; מומלץ לרענן אותם.');
  }

  return { envelope, options, warnings };
}

export { PROFILE_DEFINITIONS, TRACK_META };
