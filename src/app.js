import * as calculator from './calculator.js';

const STORAGE_KEY = 'homePurchaseCalculator.v1';
const TAX_YEAR_LABEL = '16.1.2026–15.1.2027';
const defaultRenovations = () => [
  { id: uid(), enabled: true, group: 'תיקון מהותי', name: 'בדיקת והחלפת צנרת', amount: 0 },
  { id: uid(), enabled: true, group: 'תיקון מהותי', name: 'החלפת מטבח', amount: 0 },
  { id: uid(), enabled: true, group: 'חדרי רחצה', name: 'שיפוץ חדרי רחצה', amount: 0 },
  { id: uid(), enabled: true, group: 'חדרי רחצה', name: 'סניטריה ואביזרים: אסלות, מושבים, ברזים', amount: 0 },
  { id: uid(), enabled: true, group: 'תשתיות', name: 'חשמל, לוח ושקעים', amount: 0 },
  { id: uid(), enabled: true, group: 'גמר', name: 'צבע, טיח ותיקוני קירות', amount: 0 },
  { id: uid(), enabled: true, group: 'גמר', name: 'ריצוף וחיפויים', amount: 0 },
  { id: uid(), enabled: true, group: 'מערכות', name: 'מזגנים וחימום', amount: 0 },
  { id: uid(), enabled: true, group: 'נגרות', name: 'ארונות ונגרות מותאמת', amount: 0 },
  { id: uid(), enabled: true, group: 'אבזור', name: 'מתקנים לטלוויזיה ואביזרי התקנה', amount: 0 },
  { id: uid(), enabled: true, group: 'עיצוב', name: 'תאורה, וילונות ועיצוב', amount: 0 },
  { id: uid(), enabled: true, group: 'ריהוט', name: 'ריהוט ומוצרי חשמל', amount: 0 }
];

const defaultRepayments = () => [
  { id: uid(), loan: 1000000, payment: 5000 },
  { id: uid(), loan: 1200000, payment: 6165 },
  { id: uid(), loan: 1350000, payment: 6950 },
  { id: uid(), loan: 1400000, payment: 7000 },
  { id: uid(), loan: 1500000, payment: 7740 },
  { id: uid(), loan: 1600000, payment: 8000 },
  { id: uid(), loan: 1650000, payment: 8500 },
  { id: uid(), loan: 1700000, payment: 8800 },
  { id: uid(), loan: 1750000, payment: 9008 },
  { id: uid(), loan: 1800000, payment: 9500 },
  { id: uid(), loan: 2000000, payment: 10500 }
];

function uid() { return Math.random().toString(36).slice(2, 10); }
const n = calculator.n;
const clamp = calculator.clamp;
function money(value) { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Math.round(n(value))); }
function percent(value, digits = 1) { return `${n(value).toFixed(digits)}%`; }
function isoDateToday() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); }

function makeScenario(name = 'בית 1') {
  return {
    id: uid(), name, propertyPrice: 3000000, purchaseType: 'single', appraisalValue: 0,
    maxLtvOverride: 70, transactionDate: isoDateToday(), taxMode: 'auto', manualTax: 0,
    brokerPct: 2, lawyerPct: 0.5, vatRate: 18, brokerVat: true, lawyerVat: true,
    appraisalCost: 2500, mortgageFees: 3000, registrationCosts: 2500, movingCosts: null, otherTransactionCosts: null,
    renovations: defaultRenovations(), contingencyPct: 10,
    liquidEquity: null, otherEquity: null, reserveCash: null,
    existingPropertyValue: null, existingPropertyDebt: null, saleCostPct: null, propertyEquityUsePct: 100,
    repaymentMode: 'interpolate', manualMortgageAdjustment: 0, repayments: defaultRepayments()
  };
}

let state = loadState();
let modalMode = 'export';
let targetPriceCandidate = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeId: null, scenarios: [makeScenario()] };
    const parsed = JSON.parse(raw);
    if (!parsed.scenarios?.length) throw new Error('No scenarios');
    parsed.scenarios.forEach(normalizeScenario);
    if (!parsed.activeId || !parsed.scenarios.some(s => s.id === parsed.activeId)) parsed.activeId = parsed.scenarios[0].id;
    return parsed;
  } catch (e) {
    return { activeId: null, scenarios: [makeScenario()] };
  }
}

function normalizeScenario(s) {
  const d = makeScenario(s.name || 'תרחיש');
  Object.keys(d).forEach(key => { if (s[key] === undefined) s[key] = d[key]; });
  s.renovations = Array.isArray(s.renovations) ? s.renovations : defaultRenovations();
  s.repayments = Array.isArray(s.repayments) ? s.repayments : defaultRepayments();
  if (!s.id) s.id = uid();
  return s;
}

if (!state.activeId) state.activeId = state.scenarios[0].id;
const active = () => state.scenarios.find(s => s.id === state.activeId) || state.scenarios[0];
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

const getDefaultLtv = calculator.getDefaultLtv;
const calculateScenario = calculator.calculateScenario;


const fieldIds = [
  'scenarioName','propertyPrice','purchaseType','appraisalValue','maxLtvOverride','transactionDate','taxMode','manualTax',
  'brokerPct','lawyerPct','vatRate','brokerVat','lawyerVat','appraisalCost','mortgageFees','registrationCosts','movingCosts','otherTransactionCosts',
  'contingencyPct','liquidEquity','otherEquity','reserveCash','existingPropertyValue','existingPropertyDebt','saleCostPct','propertyEquityUsePct',
  'repaymentMode','manualMortgageAdjustment'
];

const keyMap = { scenarioName: 'name' };

function bindFields() {
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    const eventName = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      const s = active();
      const key = keyMap[id] || id;
      s[key] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? (el.value === '' ? null : n(el.value)) : el.value);
      if (id === 'purchaseType') s.maxLtvOverride = getDefaultLtv(s.purchaseType);
      if (id === 'taxMode') document.getElementById('manualTax').disabled = s.taxMode !== 'manual';
      saveState(); render();
    });
  });
}

function populateForm() {
  const s = active();
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    const key = keyMap[id] || id;
    if (el.type === 'checkbox') el.checked = !!s[key];
    else el.value = s[key] ?? '';
  });
  document.getElementById('manualTax').disabled = s.taxMode !== 'manual';
}

function renderScenarioTabs() {
  const box = document.getElementById('scenarioTabs');
  box.innerHTML = '';
  state.scenarios.forEach(s => {
    const b = document.createElement('button');
    b.className = 'scenario-tab' + (s.id === state.activeId ? ' active' : '');
    b.textContent = s.name || 'ללא שם';
    b.addEventListener('click', () => { state.activeId = s.id; saveState(); populateForm(); render(); });
    box.appendChild(b);
  });
  document.getElementById('deleteScenarioBtn').disabled = state.scenarios.length <= 1;
}

function renderRenovations() {
  const tbody = document.getElementById('renovationRows');
  tbody.innerHTML = '';
  active().renovations.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" data-k="enabled" ${row.enabled ? 'checked' : ''} aria-label="כלול" /></td>
      <td><select data-k="group">
        ${['תיקון מהותי','תשתיות','חדרי רחצה','מטבח','גמר','מערכות','נגרות','אבזור','עיצוב','ריהוט','אחר'].map(x => `<option ${x===row.group?'selected':''}>${x}</option>`).join('')}
      </select></td>
      <td><input type="text" data-k="name" value="${escapeHtml(row.name)}" /></td>
      <td><input type="number" min="0" step="500" data-k="amount" value="${n(row.amount)}" /></td>
      <td class="no-print"><button class="icon-btn" data-action="delete">מחיקה</button></td>`;
    tr.querySelectorAll('[data-k]').forEach(el => {
      const eventName = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(eventName, () => {
        const key = el.dataset.k;
        row[key] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? (el.value === '' ? null : n(el.value)) : el.value);
        saveState(); renderComputedOnly();
      });
    });
    tr.querySelector('[data-action="delete"]').addEventListener('click', () => {
      active().renovations = active().renovations.filter(r => r.id !== row.id);
      saveState(); render();
    });
    tbody.appendChild(tr);
  });
}

function renderRepayments() {
  const tbody = document.getElementById('repaymentRows');
  tbody.innerHTML = '';
  active().repayments.sort((a,b)=>n(a.loan)-n(b.loan)).forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" min="0" step="10000" data-k="loan" value="${n(row.loan)}" /></td>
      <td><input type="number" min="0" step="100" data-k="payment" value="${n(row.payment)}" /></td>
      <td class="no-print"><button class="icon-btn" data-action="delete">מחיקה</button></td>`;
    tr.querySelectorAll('[data-k]').forEach(el => el.addEventListener('input', () => {
      row[el.dataset.k] = n(el.value); saveState(); renderComputedOnly();
    }));
    tr.querySelector('[data-action="delete"]').addEventListener('click', () => {
      active().repayments = active().repayments.filter(r => r.id !== row.id);
      saveState(); render();
    });
    tbody.appendChild(tr);
  });
}

function renderComputedOnly() {
  const s = active(), c = calculateScenario(s);
  document.getElementById('kpiPrice').textContent = money(c.price);
  document.getElementById('kpiExtras').textContent = money(c.extras);
  document.getElementById('kpiTotal').textContent = money(c.totalCost);
  document.getElementById('kpiMortgage').textContent = money(c.mortgageGap);
  document.getElementById('kpiPayment').textContent = money(c.payment);
  document.getElementById('kpiMortgageSub').textContent = c.financingShortfall > 0 ? `חריגה משוערת של ${money(c.financingShortfall)} ממגבלת המימון` : 'לאחר קיזוז ההון הזמין';
  const mortgageKpi = document.getElementById('mortgageKpi');
  mortgageKpi.className = 'kpi ' + (c.financingShortfall > 0 ? 'bad' : c.ltv > c.ltvLimit * .9 ? 'warn' : 'good');

  document.getElementById('taxResult').textContent = money(c.tax);
  document.getElementById('taxBasis').textContent = s.taxMode === 'manual' ? 'סכום ידני' : `מדרגות ${TAX_YEAR_LABEL}`;
  document.getElementById('renovationSubtotal').textContent = money(c.renovationSubtotal);
  document.getElementById('contingencyAmount').textContent = money(c.contingency);
  document.getElementById('propertyEquityResult').textContent = money(c.propertyEquity);
  document.getElementById('totalEquityResult').textContent = money(c.totalEquity);

  renderCostBreakdown(c);
  renderFinancing(c);
  renderComparison();
  renderSensitivity();
  renderScenarioTabs();
  renderDecisionLab();
}

function renderCostBreakdown(c) {
  const rows = [
    ['מחיר הבית', c.price], ['מס רכישה', c.tax], ['תיווך כולל מע״מ', c.broker], ['עורך דין כולל מע״מ', c.lawyer],
    ['עלויות עסקה קבועות', c.fixedTransaction], ['תיקונים ושיפוץ', c.renovationSubtotal], ['רזרבה לשיפוץ', c.contingency]
  ];
  const box = document.getElementById('costBreakdown');
  box.innerHTML = rows.map(([label,value]) => `<div class="summary-row"><span>${label}</span><strong>${money(value)}</strong></div>`).join('') +
    `<div class="summary-row total"><span>סה״כ</span><strong>${money(c.totalCost)}</strong></div>`;
  const bars = document.getElementById('costBars');
  const extras = rows.slice(1).filter(x => x[1] > 0).sort((a,b)=>b[1]-a[1]);
  const max = extras[0]?.[1] || 1;
  bars.innerHTML = extras.map(([label,value]) => `<div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3,value/max*100)}%"></div></div><strong>${money(value)}</strong></div>`).join('');
}

function renderFinancing(c) {
  document.getElementById('sideTotalCost').textContent = money(c.totalCost);
  document.getElementById('sideEquity').textContent = money(c.totalEquity);
  document.getElementById('sideMortgage').textContent = money(c.mortgageGap);
  document.getElementById('sidePayment').textContent = money(c.payment);
  document.getElementById('sideLtv').textContent = percent(c.ltv);
  document.getElementById('sideMaxMortgage').textContent = money(c.maxMortgage);
  const progressPct = c.ltvLimit > 0 ? clamp(c.ltv / c.ltvLimit * 100, 0, 125) : 0;
  const progress = document.getElementById('ltvProgress');
  progress.style.width = `${Math.min(progressPct,100)}%`;
  progress.className = c.financingShortfall > 0 ? 'bad' : progressPct > 90 ? 'warn' : 'good';
  const status = document.getElementById('ltvStatus');
  if (c.financingShortfall > 0) {
    status.className = 'status-box bad';
    status.innerHTML = `<strong>נדרש להשלים עוד ${money(c.financingShortfall)}</strong><br><span>המשכנתא המחושבת גבוהה ממגבלת ${percent(c.ltvLimit,0)} לפי בסיס שווי של ${money(c.ltvBase)}.</span>`;
  } else {
    status.className = progressPct > 90 ? 'status-box warn' : 'status-box good';
    status.innerHTML = `<strong>בתוך מגבלת המימון שהוגדרה</strong><br><span>מרווח משוער: ${money(c.financingMargin)}.</span>`;
  }
}

function renderComparison() {
  const table = document.getElementById('comparisonTable');
  table.innerHTML = `<thead><tr><th>תרחיש</th><th>מחיר בית</th><th>עלויות נוספות</th><th>עלות כוללת</th><th>הון זמין</th><th>משכנתא</th><th>החזר חודשי</th><th>LTV</th><th>סטטוס</th></tr></thead><tbody>${state.scenarios.map(s => {
    const c = calculateScenario(s);
    return `<tr><td><strong>${escapeHtml(s.name)}</strong></td><td>${money(c.price)}</td><td>${money(c.extras)}</td><td>${money(c.totalCost)}</td><td>${money(c.totalEquity)}</td><td>${money(c.mortgageGap)}</td><td>${money(c.payment)}</td><td>${percent(c.ltv)}</td><td>${c.financingShortfall>0?`חסר ${money(c.financingShortfall)}`:'בתוך המגבלה'}</td></tr>`;
  }).join('')}</tbody>`;
}

function renderSensitivity() {
  const rows = calculator.calculatePriceSensitivity(active()).map(c => {
    return `<tr><td>${c.delta>0?'+':''}${c.delta}%</td><td>${money(c.price)}</td><td>${money(c.mortgageGap)}</td><td>${money(c.payment)}</td></tr>`;
  }).join('');
  document.getElementById('sensitivityTable').innerHTML = `<thead><tr><th>שינוי</th><th>מחיר</th><th>משכנתא</th><th>החזר</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderDecisionLab() {
  const s = active();
  const previewInput = document.getElementById('previewPropertyPrice');
  if (previewInput.dataset.scenarioId !== s.id) {
    previewInput.value = n(s.propertyPrice);
    previewInput.dataset.scenarioId = s.id;
  }
  const previewPrice = n(previewInput.value);
  const preview = calculateScenario(s, previewPrice);
  document.getElementById('previewTotalCost').textContent = money(preview.totalCost);
  document.getElementById('previewMortgage').textContent = money(preview.mortgageGap);
  document.getElementById('previewPayment').textContent = money(preview.payment);
  document.getElementById('previewLtv').textContent = percent(preview.ltv);

  const target = n(document.getElementById('targetMonthlyPayment').value);
  const result = calculator.findMaxPropertyPriceForPayment(s, target);
  const box = document.getElementById('targetPriceResult');
  const apply = document.getElementById('applyTargetPriceBtn');
  if (target <= 0 || !result) {
    targetPriceCandidate = null;
    apply.disabled = true;
    box.textContent = 'הזינו החזר יעד כדי לקבל אומדן למחיר הבית המרבי.';
  } else {
    targetPriceCandidate = result.price;
    apply.disabled = false;
    box.innerHTML = `<span>מחיר בית מרבי משוער</span><strong>${money(result.price)}</strong><span>משכנתא ${money(result.mortgage)} · החזר ${money(result.payment)} · עלות כוללת ${money(result.totalCost)}</span>`;
  }
}

function render() {
  populateForm();
  renderRenovations();
  renderRepayments();
  renderComputedOnly();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function toast(message) {
  const t = document.getElementById('toast'); t.textContent = message; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(()=>t.classList.remove('show'), 2200);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Copy command failed');
}

function summaryText(s = active()) {
  const c = calculateScenario(s);
  return [
    `סיכום תרחיש: ${s.name}`,
    `מחיר הבית: ${money(c.price)}`,
    `מס רכישה: ${money(c.tax)}`,
    `תיווך: ${money(c.broker)}`,
    `עורך דין: ${money(c.lawyer)}`,
    `שיפוץ ורזרבה: ${money(c.renovationSubtotal + c.contingency)}`,
    `עלות כוללת: ${money(c.totalCost)}`,
    `הון זמין: ${money(c.totalEquity)}`,
    `משכנתא נדרשת: ${money(c.mortgageGap)}`,
    `החזר חודשי משוער: ${money(c.payment)}`,
    `שיעור מימון: ${percent(c.ltv)} מתוך מגבלה של ${percent(c.ltvLimit,0)}`,
    c.financingShortfall > 0 ? `פער מול מגבלת מימון: ${money(c.financingShortfall)}` : 'התרחיש בתוך מגבלת המימון שהוגדרה.'
  ].join('\n');
}

function openModal(mode) {
  modalMode = mode;
  const textarea = document.getElementById('dataTextarea');
  document.getElementById('modalTitle').textContent = mode === 'export' ? 'ייצוא נתונים' : 'ייבוא נתונים';
  textarea.value = mode === 'export' ? JSON.stringify(state, null, 2) : '';
  textarea.readOnly = mode === 'export';
  document.getElementById('modalApplyBtn').classList.toggle('hidden', mode === 'export');
  document.getElementById('downloadJsonBtn').classList.toggle('hidden', mode !== 'export');
  document.getElementById('modalBackdrop').classList.remove('hidden');
  textarea.focus();
}

function closeModal() { document.getElementById('modalBackdrop').classList.add('hidden'); }

function csvEscape(value) { const s = String(value ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

bindFields();

document.getElementById('previewPropertyPrice').addEventListener('input', renderDecisionLab);
document.getElementById('targetMonthlyPayment').addEventListener('input', renderDecisionLab);
document.getElementById('applyPreviewPriceBtn').addEventListener('click', () => {
  active().propertyPrice = n(document.getElementById('previewPropertyPrice').value);
  saveState(); render(); toast('מחיר הבית הוחל על התרחיש');
});
document.getElementById('applyTargetPriceBtn').addEventListener('click', () => {
  if (targetPriceCandidate === null) return;
  active().propertyPrice = Math.round(targetPriceCandidate / 10000) * 10000;
  saveState(); render(); toast('מחיר הבית המרבי הוחל על התרחיש');
});

document.getElementById('addScenarioBtn').addEventListener('click', () => {
  const s = makeScenario(`תרחיש ${state.scenarios.length + 1}`); state.scenarios.push(s); state.activeId = s.id; saveState(); render();
});
document.getElementById('duplicateScenarioBtn').addEventListener('click', () => {
  const copy = JSON.parse(JSON.stringify(active())); copy.id = uid(); copy.name = `${copy.name} – עותק`;
  copy.renovations.forEach(r=>r.id=uid()); copy.repayments.forEach(r=>r.id=uid());
  state.scenarios.push(copy); state.activeId = copy.id; saveState(); render();
});
document.getElementById('deleteScenarioBtn').addEventListener('click', () => {
  if (state.scenarios.length <= 1) return;
  const idx = state.scenarios.findIndex(s=>s.id===state.activeId);
  state.scenarios.splice(idx,1); state.activeId = state.scenarios[Math.max(0,idx-1)].id; saveState(); render();
});
document.getElementById('addRenovationBtn').addEventListener('click', () => {
  active().renovations.push({ id: uid(), enabled: true, group: 'אחר', name: 'סעיף חדש', amount: 0 }); saveState(); render();
});
document.getElementById('addRepaymentBtn').addEventListener('click', () => {
  const rows = active().repayments; const last = rows.slice().sort((a,b)=>n(a.loan)-n(b.loan)).pop();
  rows.push({ id: uid(), loan: (last?.loan || 0) + 100000, payment: (last?.payment || 0) + 500 }); saveState(); render();
});
document.getElementById('printBtn').addEventListener('click', () => window.print());
document.getElementById('exportBtn').addEventListener('click', () => openModal('export'));
document.getElementById('importBtn').addEventListener('click', () => openModal('import'));
document.getElementById('closeModalBtn').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
document.getElementById('modalCopyBtn').addEventListener('click', async () => {
  await copyText(document.getElementById('dataTextarea').value); toast('הנתונים הועתקו');
});
document.getElementById('downloadJsonBtn').addEventListener('click', () => {
  downloadFile('תרחישי-רכישת-בית.json', JSON.stringify(state, null, 2), 'application/json;charset=utf-8');
  toast('קובץ JSON הורד');
});
document.getElementById('modalApplyBtn').addEventListener('click', () => {
  try {
    const parsed = JSON.parse(document.getElementById('dataTextarea').value);
    if (!parsed.scenarios?.length) throw new Error('מבנה לא תקין');
    parsed.scenarios.forEach(normalizeScenario); state = parsed;
    if (!state.activeId || !state.scenarios.some(s=>s.id===state.activeId)) state.activeId = state.scenarios[0].id;
    saveState(); closeModal(); render(); toast('הנתונים יובאו בהצלחה');
  } catch (e) { alert('לא ניתן לייבא את הנתונים. ודאו שזהו קובץ JSON תקין של המחשבון.'); }
});
document.getElementById('copySummaryBtn').addEventListener('click', async () => { await copyText(summaryText()); toast('הסיכום הועתק'); });
document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('לאפס את כל התרחישים והנתונים?')) return;
  state = { activeId: null, scenarios: [makeScenario()] }; state.activeId = state.scenarios[0].id; saveState(); render();
});
document.getElementById('csvBtn').addEventListener('click', () => {
  const headers = ['תרחיש','מחיר בית','מס רכישה','תיווך','עורך דין','שיפוץ ורזרבה','עלויות נוספות','עלות כוללת','הון זמין','משכנתא נדרשת','החזר חודשי','LTV','פער ממגבלת מימון'];
  const rows = state.scenarios.map(s => { const c = calculateScenario(s); return [s.name,c.price,c.tax,c.broker,c.lawyer,c.renovationSubtotal+c.contingency,c.extras,c.totalCost,c.totalEquity,c.mortgageGap,c.payment,c.ltv,c.financingShortfall]; });
  const csv = '\uFEFF' + [headers,...rows].map(r=>r.map(csvEscape).join(',')).join('\n');
  downloadFile('השוואת-תרחישי-רכישת-בית.csv', csv, 'text/csv;charset=utf-8');
});

render();
