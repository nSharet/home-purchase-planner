import { calculateAcquisitionCosts, getProductRate, optimizeMortgage } from './optimizer.js';

const STORAGE_KEY = 'home-purchase-planner:mortgage-optimizer:v1';
const RATE_URL = './data/rates/current.json';

const DEFAULT_STATE = {
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
  otherCosts: [
    { label: 'מעבר, התאמות וריהוט', amount: 150_000, enabled: true }
  ],
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
  financingFees: 0,
  estimatedEarlyRepaymentFee: 0,
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

const MONEY_IDS = [
  'propertyPrice', 'appraisalValue', 'manualPurchaseTax', 'appraisalCost',
  'mortgageOpeningFee', 'mortgageAdvisorCost', 'existingPropertyValue',
  'existingMortgageBalance', 'existingMortgagePayment', 'existingMortgagePayoffFee',
  'liquidEquity', 'cashReserve', 'monthlyNetIncome', 'otherMonthlyLoans',
  'transitionPaymentCap', 'stablePaymentCap', 'financingFees', 'estimatedEarlyRepaymentFee'
];
const NUMBER_IDS = [
  'brokerPercent', 'lawyerPercent', 'vatRate', 'termYears', 'annualInflation', 'primeScenarioDelta'
];
const CHECKBOX_IDS = ['brokerVat', 'lawyerVat', 'allowIndexed', 'bridgeIndexed'];

let state = loadState();
let rates = null;
let latestResult = null;

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored ? { ...structuredClone(DEFAULT_STATE), ...stored } : structuredClone(DEFAULT_STATE);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function parseMoney(value) {
  const normalized = String(value ?? '').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInputMoney(value) {
  return Math.round(Number(value) || 0).toLocaleString('he-IL');
}

function money(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('he-IL')} ₪`;
}

function percent(value, digits = 1) {
  return `${(Number(value) || 0).toFixed(digits)}%`;
}

function dateHe(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'לא ידוע' : date.toLocaleDateString('he-IL');
}

function hydrateInputs() {
  for (const id of MONEY_IDS) document.getElementById(id).value = formatInputMoney(state[id]);
  for (const id of NUMBER_IDS) document.getElementById(id).value = state[id];
  for (const id of CHECKBOX_IDS) document.getElementById(id).checked = Boolean(state[id]);
  document.getElementById('purchaseTaxMode').value = state.purchaseTaxMode;
  document.getElementById('ratePosition').value = Math.round(state.ratePosition * 100);
  document.getElementById('ratePositionValue').textContent = `${Math.round(state.ratePosition * 100)}%`;
  renderEvents('purchase');
  renderEvents('sale');
  renderOtherCosts();
  renderAcquisitionCosts(calculateAcquisitionCosts(state));
}

function bindInputs() {
  for (const id of MONEY_IDS) {
    const input = document.getElementById(id);
    input.addEventListener('focus', () => { input.value = state[id] || ''; });
    input.addEventListener('blur', () => {
      state[id] = Math.max(0, parseMoney(input.value));
      input.value = formatInputMoney(state[id]);
      changed();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
    });
  }

  for (const id of NUMBER_IDS) {
    document.getElementById(id).addEventListener('change', (event) => {
      state[id] = Number(event.target.value) || 0;
      changed();
    });
  }

  for (const id of CHECKBOX_IDS) {
    document.getElementById(id).addEventListener('change', (event) => {
      state[id] = event.target.checked;
      changed();
    });
  }

  document.getElementById('purchaseTaxMode').addEventListener('change', (event) => {
    state.purchaseTaxMode = event.target.value;
    changed();
  });

  document.getElementById('ratePosition').addEventListener('input', (event) => {
    state.ratePosition = Number(event.target.value) / 100;
    document.getElementById('ratePositionValue').textContent = `${event.target.value}%`;
    changed(false);
  });
  document.getElementById('ratePosition').addEventListener('change', run);

  document.getElementById('addPurchaseEvent').addEventListener('click', () => addEvent('purchase'));
  document.getElementById('addSaleEvent').addEventListener('click', () => addEvent('sale'));
  document.getElementById('addOtherCost').addEventListener('click', addOtherCost);
  document.getElementById('refreshRatesBtn').addEventListener('click', () => loadRates(true));
  document.getElementById('optimizeBtn').addEventListener('click', run);
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!window.confirm('לאפס את כל הנתונים ולחזור לתרחיש הדוגמה?')) return;
    state = structuredClone(DEFAULT_STATE);
    saveState();
    hydrateInputs();
    run();
  });
}

function eventKey(type) {
  return type === 'purchase' ? 'purchaseEvents' : 'saleEvents';
}

function addEvent(type) {
  const key = eventKey(type);
  const last = state[key][state[key].length - 1];
  state[key].push({ month: (last?.month ?? 0) + 1, amount: 0 });
  renderEvents(type);
  changed();
}

function renderEvents(type) {
  const key = eventKey(type);
  const container = document.getElementById(`${type}Events`);
  const template = document.getElementById('eventTemplate');
  container.replaceChildren();

  state[key].forEach((item, index) => {
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('.event-row');
    const monthInput = fragment.querySelector('.event-month');
    const amountInput = fragment.querySelector('.event-amount');
    monthInput.value = item.month;
    amountInput.value = formatInputMoney(item.amount);

    monthInput.addEventListener('change', () => {
      state[key][index].month = Math.max(0, Number(monthInput.value) || 0);
      state[key].sort((a, b) => a.month - b.month);
      renderEvents(type);
      changed();
    });
    amountInput.addEventListener('focus', () => { amountInput.value = state[key][index].amount || ''; });
    amountInput.addEventListener('blur', () => {
      state[key][index].amount = Math.max(0, parseMoney(amountInput.value));
      amountInput.value = formatInputMoney(state[key][index].amount);
      changed();
    });
    fragment.querySelector('.remove-event').addEventListener('click', () => {
      state[key].splice(index, 1);
      renderEvents(type);
      changed();
    });
    row.dataset.index = index;
    container.append(fragment);
  });

  const total = state[key].reduce((sum, event) => sum + Number(event.amount || 0), 0);
  document.getElementById(`${type}Total`).textContent = money(total);
}

function addOtherCost() {
  state.otherCosts.push({ label: '', amount: 0, enabled: true });
  renderOtherCosts();
  changed();
}

function renderOtherCosts() {
  const container = document.getElementById('otherCosts');
  const template = document.getElementById('otherCostTemplate');
  if (!Array.isArray(state.otherCosts)) state.otherCosts = [];
  container.replaceChildren();

  state.otherCosts.forEach((item, index) => {
    const fragment = template.content.cloneNode(true);
    const labelInput = fragment.querySelector('.other-cost-label');
    const amountInput = fragment.querySelector('.other-cost-amount');
    labelInput.value = item.label ?? '';
    amountInput.value = formatInputMoney(item.amount);
    labelInput.addEventListener('change', () => {
      state.otherCosts[index].label = labelInput.value.trim();
      changed();
    });
    amountInput.addEventListener('focus', () => { amountInput.value = state.otherCosts[index].amount || ''; });
    amountInput.addEventListener('blur', () => {
      state.otherCosts[index].amount = Math.max(0, parseMoney(amountInput.value));
      amountInput.value = formatInputMoney(state.otherCosts[index].amount);
      changed();
    });
    amountInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') amountInput.blur();
    });
    fragment.querySelector('.remove-other-cost').addEventListener('click', () => {
      state.otherCosts.splice(index, 1);
      renderOtherCosts();
      changed();
    });
    container.append(fragment);
  });
}

function renderAcquisitionCosts(costs) {
  document.getElementById('acquisitionCostTotal').textContent = money(costs.total);
  document.getElementById('purchaseTaxValue').textContent = money(costs.purchaseTax);
  document.getElementById('brokerageValue').textContent = money(costs.brokerage);
  document.getElementById('lawyerValue').textContent = money(costs.lawyer);
  const manual = state.purchaseTaxMode === 'manual';
  document.getElementById('manualPurchaseTaxField').hidden = !manual;
}

function changed(runImmediately = true) {
  saveState();
  renderAcquisitionCosts(calculateAcquisitionCosts(state));
  if (runImmediately) run();
}

async function loadRates(force = false) {
  const button = document.getElementById('refreshRatesBtn');
  button.disabled = true;
  button.textContent = 'מרענן…';
  try {
    const suffix = force ? `?v=${Date.now()}` : '';
    const response = await fetch(`${RATE_URL}${suffix}`, { cache: force ? 'no-store' : 'default' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rates = await response.json();
    document.getElementById('rateSource').innerHTML =
      `<strong>${rates.meta.sourceName}</strong> · נתוני מקור: ${dateHe(rates.meta.sourceUpdatedAt)} · ` +
      `נטענו: ${dateHe(rates.meta.fetchedAt)} · <a href="${rates.meta.sourceUrl}" target="_blank" rel="noopener">פתיחת המקור</a>`;
    renderRatesPreview();
    run();
  } catch (error) {
    document.getElementById('rateSource').textContent = `לא ניתן לטעון את נתוני הריבית: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = 'רענון ריביות';
  }
}

function renderRatesPreview() {
  if (!rates) return;
  const ltv = latestResult?.envelope?.pricingLtvPercent ?? 70;
  const years = state.termYears;
  const entries = [
    ['fixed-unlinked', 'קל״צ'],
    ['prime', 'פריים'],
    ['variable-5-unlinked', 'משתנה 5'],
    [state.bridgeIndexed ? 'bridge-linked' : 'bridge-unlinked', 'גישור']
  ];
  document.getElementById('ratesPreview').innerHTML = entries.map(([id, label]) => {
    const rate = getProductRate(rates, id, id.startsWith('bridge') ? 2 : years, ltv, state.ratePosition);
    return `<div class="rate-chip"><span>${label} · ${rate.min.toFixed(2)}–${rate.max.toFixed(2)}</span><strong>${rate.working.toFixed(2)}%</strong></div>`;
  }).join('');
}

function renderEnvelope(result) {
  const { envelope } = result;
  renderAcquisitionCosts(envelope.acquisitionCosts);
  document.getElementById('kpiNewCapacity').textContent = money(envelope.newMortgageCapacity);
  document.getElementById('kpiExistingBridge').textContent = money(envelope.existingBridgeCapacity);
  document.getElementById('kpiLongNeed').textContent = money(envelope.longTermNeed);
  document.getElementById('kpiBridgePeak').textContent = money(envelope.fundingPlan.peakBridge);
  document.getElementById('kpiBridgeSplit').textContent =
    `${money(envelope.fundingPlan.peakExistingBridge)} קיים · ${money(envelope.fundingPlan.peakNewBridge)} חדש`;

  document.getElementById('summaryProject').textContent = money(envelope.projectTotal);
  document.getElementById('summaryEquity').textContent = money(envelope.availableEquity);
  document.getElementById('summarySale').textContent = money(envelope.saleNet);
  document.getElementById('summaryLtv').textContent = percent(envelope.pricingLtvPercent);
  document.getElementById('summaryTransition').textContent = `T + ${envelope.fundingPlan.transitionEndMonth} חודשים`;
  document.getElementById('incomeCapNote').textContent =
    `תקרת 50% מההכנסה שהוזנה: ${money(state.monthlyNetIncome * 0.5)}. ` +
    'המנוע משתמש בנמוך מבינה לבין התקרה האישית בכל תקופה.';

  const total = Math.max(1, envelope.longTermNeed + envelope.fundingPlan.peakBridge);
  document.getElementById('longBar').style.width = `${envelope.longTermNeed / total * 100}%`;
  document.getElementById('bridgeBar').style.width = `${envelope.fundingPlan.peakBridge / total * 100}%`;
  renderRatesPreview();
}

function optionHtml(option) {
  const status = option.feasible ? 'עומדת באילוצים' : 'דורשת התאמה';
  const tracks = option.tracks.map((track) => `
    <div class="mix-row">
      <div>${track.label} <small>· ${track.scenarioRate.toFixed(2)}%</small><div class="mix-bar"><i style="width:${track.share * 100}%"></i></div></div>
      <strong>${Math.round(track.share * 100)}%</strong>
    </div>`).join('');
  const partialGrace = option.tracks
    .filter((track) => option.graceStrategy.partial.includes(track.trackId))
    .map((track) => track.label);
  const fullGrace = option.tracks
    .filter((track) => option.graceStrategy.full.includes(track.trackId))
    .map((track) => track.label);
  const graceParts = [];
  if (partialGrace.length) graceParts.push(`חלקי: ${partialGrace.join(', ')}`);
  if (fullGrace.length) graceParts.push(`מלא: ${fullGrace.join(', ')}`);
  const grace = graceParts.join(' · ') || 'ללא גרייס במשכנתה הארוכה';
  const violations = option.violations.length
    ? `<ul class="violations">${option.violations.map((item) => `<li>${item}</li>`).join('')}</ul>`
    : '';

  return `
    <article class="option-card ${option.feasible ? '' : 'not-feasible'}" data-profile="${option.profileId}">
      <div class="option-head"><h3>${option.profile}</h3><span>${status}</span></div>
      <p>${option.description}</p>
      <div class="option-cost"><span>עלות מימון חזויה לכל החיים</span><strong>${money(option.totalCost)}</strong></div>
      <div class="option-metrics">
        <div class="metric"><span>שיא בתקופת המעבר</span><strong>${money(option.peakTransitionPayment)}</strong></div>
        <div class="metric"><span>החזר לאחר התייצבות</span><strong>${money(option.stablePayment)}</strong></div>
        <div class="metric"><span>ריבית + גישור</span><strong>${money(option.totalInterest)}</strong></div>
        <div class="metric"><span>הצמדה חזויה</span><strong>${money(option.totalIndexation)}</strong></div>
      </div>
      <div class="mix-list">${tracks}</div>
      <div class="grace-note"><strong>גרייס:</strong> ${grace}</div>
      ${violations}
    </article>`;
}

function renderResults(result) {
  document.getElementById('warnings').innerHTML = result.warnings
    .map((warning) => `<div class="warning">${warning}</div>`).join('');
  document.getElementById('optionsGrid').innerHTML = result.options.map(optionHtml).join('');
}

function run() {
  if (!rates) return;
  latestResult = optimizeMortgage(state, rates);
  renderEnvelope(latestResult);
  renderResults(latestResult);
}

hydrateInputs();
bindInputs();
loadRates();
