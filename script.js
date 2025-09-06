
/* script.js (backward-compatible patch)
   - Does not require data-* attributes; falls back to class/id selectors.
   - Leaves index.html layout intact.
*/

function qs(sel, ctx=document){ return ctx.querySelector(sel); }
function qsa(sel, ctx=document){ return Array.from((ctx||document).querySelectorAll(sel)); }
function showToast(msg, type='info'){ console.log('TOAST', type, msg); }

const PRICING = window.PRICING || { height: [{ threshold: 3.2, add_per_m: 200 }, { threshold: 2.8, add_per_m: 100 } ] };

function fmtNumberForDisplay(val, digits=0){
    if (val === '' || val === null || isNaN(Number(val))) return '';
    return Number(val).toLocaleString('th-TH', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatNumericInput(e){
    const input = e.target;
    let val = input.value || '';
    val = val.replace(/[^\d.]/g,'');
    const parts = val.split('.');
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    if (!val.startsWith('0.') && val.length > 1 && val[0] === '0') {
        val = val.replace(/^0+/, '') || '0';
    }
    input.dataset.raw = val;
    input.value = val;
}
function formatNumericOnBlur(e){
    const input = e.target;
    const raw = input.dataset.raw || input.value || '';
    if (raw === '') { input.value = ''; return; }
    const num = Number(raw);
    if (isNaN(num)) { input.value = ''; return; }
    const digits = raw.indexOf('.') >= 0 ? 2 : 0;
    input.value = num.toLocaleString('th-TH', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function heightPlus(h){
    const entries = (Array.isArray(PRICING.height) ? PRICING.height.slice() : []).sort((a,b)=>b.threshold - a.threshold);
    for (const e of entries){
        if (h >= Number(e.threshold)) return Number(e.add_per_m) || 0;
    }
    return 0;
}

function toggleSetFabricUI(setEl){
    if (!setEl) return;
    const select = setEl.querySelector('select[name="fabric_variant"]');
    const variant = select ? select.value : '';
    const hasSheer = variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง';
    const hasOpaque = variant === 'ทึบ' || variant === 'ทึบ&โปร่ง';

    const sheerWrap = setEl.querySelector('[data-sheer-wrap], .sheer-wrap');
    const optionsRow = setEl.querySelector('[data-set-options-row], .options-row');
    const sheerPriceLabel = setEl.querySelector('[data-sheer-price-label], #sheer-price');
    const sheerYardLabel = setEl.querySelector('[data-sheer-yardage-label], #sheer-yard');
    const sheerTrackLabel = setEl.querySelector('[data-sheer-track-label], #sheer-track');
    const opaquePriceLabel = setEl.querySelector('[data-opaque-price-label], #opaque-price');
    const opaqueYardLabel = setEl.querySelector('[data-opaque-yardage-label], #opaque-yard');
    const opaqueTrackLabel = setEl.querySelector('[data-opaque-track-label], #opaque-track');

    if (sheerWrap) sheerWrap.classList.toggle('hidden', !hasSheer);
    if (optionsRow) optionsRow.classList.toggle('three-col', hasSheer);
    if (sheerPriceLabel) sheerPriceLabel.classList.toggle('hidden', !hasSheer);
    if (sheerYardLabel) sheerYardLabel.classList.toggle('hidden', !hasSheer);
    if (sheerTrackLabel) sheerTrackLabel.classList.toggle('hidden', !hasSheer);

    if (opaquePriceLabel) opaquePriceLabel.classList.toggle('hidden', !hasOpaque);
    if (opaqueYardLabel) opaqueYardLabel.classList.toggle('hidden', !hasOpaque);
    if (opaqueTrackLabel) opaqueTrackLabel.classList.toggle('hidden', !hasOpaque);
}

function toggleSuspend(btn){
    if (!btn) return;
    const item = btn.closest('.set, .deco-item') || btn.closest('[data-item]');
    if (!item) return;
    const now = item.getAttribute('data-suspended') === 'true';
    const willSuspend = !now;
    if (willSuspend) {
        item.setAttribute('data-suspended', 'true');
    } else {
        item.removeAttribute('data-suspended');
    }
    item.classList.toggle('is-suspended', willSuspend);
    const textEl = btn.querySelector('[data-suspend-text], .suspend-text');
    if (textEl) textEl.textContent = willSuspend ? 'ใช้งาน' : 'ระงับ';
    if (typeof recalcAll === 'function') recalcAll();
    if (typeof saveData === 'function') saveData();
    showToast(`รายการถูก${willSuspend ? 'ระงับ' : 'ใช้งาน'}แล้ว`, willSuspend ? 'warning' : 'success');
}

function safeAddRoomCall(payload){
    if (!payload || !Array.isArray(payload.rooms)) return;
    payload.rooms.forEach(r => {
        if (typeof addRoom === 'function') addRoom(r);
    });
}

function safeSummaryUpdate(summaryEl, data){
    if (!summaryEl) return;
    while (summaryEl.firstChild) summaryEl.removeChild(summaryEl.firstChild);
    const label = document.createTextNode('ราคา: ');
    summaryEl.appendChild(label);
    const priceSpan = document.createElement('span');
    priceSpan.className = 'price';
    priceSpan.textContent = fmtNumberForDisplay(data.price || 0, 0);
    summaryEl.appendChild(priceSpan);
    summaryEl.appendChild(document.createTextNode(' บ. • พื้นที่: '));
    const areaSpan = document.createElement('span');
    areaSpan.className = 'area';
    areaSpan.textContent = fmtNumberForDisplay(data.area || 0, 2);
    summaryEl.appendChild(areaSpan);
    summaryEl.appendChild(document.createTextNode(' ตร.หลา'));
}

function setFormLocked(isLocked){
    const controls = qsa('form input, form select, form textarea, .app-control');
    controls.forEach(el=>{
        if (el.closest('.modal') || el.closest('[role="dialog"]')) return;
        if (isLocked) el.setAttribute('disabled','true'); else el.removeAttribute('disabled');
    });
    document.body.classList.toggle('is-locked', !!isLocked);
}

if (typeof recalcAll !== 'function'){
    window.recalcAll = function(){ console.log('recalcAll() placeholder'); };
}
if (typeof saveData !== 'function'){
    window.saveData = function(){ console.log('saveData() placeholder'); };
}

document.addEventListener('input', function(e){
    if (e.target && e.target.matches('.numeric-input')) formatNumericInput(e);
});
document.addEventListener('blur', function(e){
    if (e.target && e.target.matches('.numeric-input')) formatNumericOnBlur(e);
}, true);

document.addEventListener('change', function(e){
    if (e.target && e.target.matches('select[name="fabric_variant"]')){
        const setEl = e.target.closest('.set');
        toggleSetFabricUI(setEl);
    }
});

window.__patchedHelpers = {
    toggleSetFabricUI,
    toggleSuspend,
    heightPlus,
    formatNumericInput,
    formatNumericOnBlur,
    safeAddRoomCall,
    safeSummaryUpdate,
    setFormLocked
};
