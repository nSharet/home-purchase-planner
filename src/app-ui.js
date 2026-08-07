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
