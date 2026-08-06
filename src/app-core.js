'use strict';

    const calculator = window.calculator;

    const STORAGE_KEY = 'homePurchaseCalculator.v1';
    const TAX_YEAR_LABEL = '16.1.2026–15.1.2027';
    const taxBrackets = {
      single: [
        { upTo: 1978745, rate: 0 },
        { upTo: 2347040, rate: 0.035 },
        { upTo: 6055070, rate: 0.05 },
        { upTo: 20183565, rate: 0.08 },
        { upTo: Infinity, rate: 0.10 }
      ],
      investment: [
        { upTo: 6055070, rate: 0.08 },
        { upTo: Infinity, rate: 0.10 }
      ]
    };

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
      { id: uid(), loan: 1200000, payment: 6000 },
      { id: uid(), loan: 1400000, payment: 7000 },
      { id: uid(), loan: 1600000, payment: 8000 },
      { id: uid(), loan: 1700000, payment: 8800 },
      { id: uid(), loan: 1800000, payment: 9500 },
      { id: uid(), loan: 2000000, payment: 10500 }
    ];

    function uid() { return Math.random().toString(36).slice(2, 10); }
    const n = calculator.n;
    const clamp = calculator.clamp;
    function money(value) { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Math.round(n(value))); }
    function percent(value, digits = 1) { return `${n(value).toFixed(digits)}%`; }
    function isoDateToday() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); }

    function makeScenario(name = 'תרחיש בסיס') {
      return {
        id: uid(), name, propertyPrice: 3500000, purchaseType: 'replacement', appraisalValue: 0,
        maxLtvOverride: 70, transactionDate: isoDateToday(), taxMode: 'auto', manualTax: 0,
        brokerPct: 2, lawyerPct: 0.5, vatRate: 18, brokerVat: true, lawyerVat: true,
        appraisalCost: 2500, mortgageFees: 3000, registrationCosts: 2500, movingCosts: 5000, otherTransactionCosts: 0,
        renovations: defaultRenovations(), contingencyPct: 10,
        liquidEquity: 500000, otherEquity: 0, reserveCash: 100000,
        existingPropertyValue: 2500000, existingPropertyDebt: 800000, saleCostPct: 2, propertyEquityUsePct: 100,
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

    const calculatePurchaseTax = calculator.calculatePurchaseTax;
    const getDefaultLtv = calculator.getDefaultLtv;
    const calculateScenario = calculator.calculateScenario;
    const calculateRepayment = calculator.calculateRepayment;


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
          s[key] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? n(el.value) : el.value);
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
            row[key] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? n(el.value) : el.value);
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
