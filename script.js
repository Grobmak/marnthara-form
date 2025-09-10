(function() {
    'use strict';
    const APP_VERSION = "input-ui/m3-1.0.0";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };
    const CALC = {
        fabricYardage: (style, width) => {
            if (width <= 0) return 0;
            if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
            if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
            return 0;
        },
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', copyJsonBtn: '#copyJsonBtn', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomFab: '#addRoomFab', submitBtn: '#submitBtn',
        grandTotal: '#grandTotal', setCount: '#setCount', grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]', roomPricePerM: 'select[name="room_price_per_m"]', roomStyle: 'select[name="room_style"]',
        setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        toastContainer: '#toast-container',
        grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn',
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        summaryBtn: '#summaryBtn', summaryPopup: '#summaryPopup',
    };

    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    orderForm.action = WEBHOOK_URL;
    
    let roomCount = 0;
    let isLocked = false;
    
    const toNum = v => {
        if (typeof v === 'string') v = v.replace(/,/g, '');
        return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0;
    };
    const clamp01 = v => Math.max(0, toNum(v));
    const fmt = (n, fixed = 2, asCurrency = false) => {
        if (!Number.isFinite(n)) return "0";
        const options = asCurrency 
            ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } 
            : { minimumFractionDigits: fixed, maximumFractionDigits: fixed };
        return n.toLocaleString("th-TH", options);
    };
    const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };

    function showToast(message, type = 'default') {
        const container = document.querySelector(SELECTORS.toastContainer);
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;

        if (type === 'success') toast.classList.add('toast-success');
        else if (type === 'warning') toast.classList.add('toast-warning');
        else if (type === 'error') toast.classList.add('toast-error');
        
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }
    
    const showConfirmation = (title, body) => {
        return new Promise((resolve) => {
            const modalEl = document.querySelector(SELECTORS.modal);
            modalEl.querySelector(SELECTORS.modalTitle).textContent = title;
            modalEl.querySelector(SELECTORS.modalBody).textContent = body;
            modalEl.classList.add('visible');
            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                modalEl.querySelector(SELECTORS.modalConfirm).onclick = null;
                modalEl.querySelector(SELECTORS.modalCancel).onclick = null;
                resolve(result);
            };
            modalEl.querySelector(SELECTORS.modalConfirm).onclick = () => cleanup(true);
            modalEl.querySelector(SELECTORS.modalCancel).onclick = () => cleanup(false);
        });
    };

    function showCopyOptionsModal() {
        return new Promise((resolve) => {
            const modal = document.querySelector(SELECTORS.copyOptionsModal);
            modal.classList.add('visible');
            const confirmBtn = document.querySelector(SELECTORS.copyOptionsConfirm);
            const cancelBtn = document.querySelector(SELECTORS.copyOptionsCancel);
            
            const cleanup = (result) => {
                modal.classList.remove('visible');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(result);
            };
            
            confirmBtn.onclick = () => {
                const options = {
                    customer: document.querySelector(SELECTORS.copyCustomerInfo).checked,
                    details: document.querySelector(SELECTORS.copyRoomDetails).checked,
                    summary: document.querySelector(SELECTORS.copySummary).checked,
                };
                cleanup(options);
            };
            
            cancelBtn.onclick = () => cleanup(false);
        });
    }

    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        const room = frag.querySelector(SELECTORS.room);
        room.dataset.index = roomCount;
        populatePriceOptions(room.querySelector(SELECTORS.roomPricePerM), PRICING.fabric);
        
        // Make sure labels on text fields in new rooms are styled correctly
        const roomLabelBg = room.querySelector('.m3-text-field.outlined label');
        if (roomLabelBg) {
           roomLabelBg.style.backgroundColor = 'var(--surface-container)';
        }

        roomsEl.appendChild(frag);
        const created = roomsEl.querySelector(`${SELECTORS.room}:last-of-type`);

        if (prefill) {
            created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
            created.querySelector(SELECTORS.roomPricePerM).value = prefill.price_per_m_raw || "";
            created.querySelector(SELECTORS.roomStyle).value = prefill.style || "";
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }
        
        const hasItems = created.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length > 0;
        if (!hasItems) addSet(created);

        renumber(); recalcAll(); saveData(); updateLockState();
        created.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }

    function populatePriceOptions(selectEl, prices) {
        selectEl.innerHTML = `<option value="" hidden>เลือก</option>`;
        prices.forEach(p => {
            const option = document.createElement('option');
            option.value = p; option.textContent = p.toLocaleString("th-TH");
            selectEl.appendChild(option);
        });
    }

    function addSet(roomEl, prefill) {
        if (isLocked) return;
        const setsWrap = roomEl.querySelector(SELECTORS.setsContainer);
        const frag = document.querySelector(SELECTORS.setTpl).content.cloneNode(true);
        setsWrap.appendChild(frag);
        const created = setsWrap.querySelector(`${SELECTORS.set}:last-of-type`);
        populatePriceOptions(created.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);

        if (prefill) {
            created.querySelector('input[name="width_m"]').value = prefill.width_m ?? "";
            created.querySelector('input[name="height_m"]').value = prefill.height_m ?? "";
            created.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
            created.querySelector('select[name="open_type"]').value = prefill.open_type || "";
            created.querySelector('select[name="sheer_price_per_m"]').value = prefill.sheer_price_per_m || "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
            }
        }
        toggleSetFabricUI(created); renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มจุดผ้าม่านแล้ว', 'success');
    }
    
    function addDeco(roomEl, prefill) {
        if (isLocked) return;
        const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
        decoWrap.appendChild(frag);
        if (prefill) {
            const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);
            created.querySelector('[name="deco_type"]').value = prefill.type || "";
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m ?? "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmt(prefill.price_sqyd, 0, true) ?? "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
            }
        }
        renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มรายการตกแต่งแล้ว', 'success');
    }

    function addWallpaper(roomEl, prefill) {
        if (isLocked) return;
        const wallpaperWrap = roomEl.querySelector(SELECTORS.wallpapersContainer);
        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        wallpaperWrap.appendChild(frag);
        const created = wallpaperWrap.querySelector(`${SELECTORS.wallpaperItem}:last-of-type`);

        if (prefill) {
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="wallpaper_price_roll"]').value = fmt(prefill.price_per_roll, 0, true) ?? "";
            (prefill.widths || []).forEach(w => addWall(created.querySelector('[data-act="add-wall"]'), w));
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
            }
        } else {
            addWall(created.querySelector('[data-act="add-wall"]'));
        }

        renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มรายการวอลเปเปอร์แล้ว', 'success');
    }

    function addWall(btn, prefillWidth) {
        if (isLocked) return;
        const wallsContainer = btn.closest(SELECTORS.wallpaperItem).querySelector(SELECTORS.wallsContainer);
        const frag = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
        if (prefillWidth) {
            frag.querySelector('input[name="wall_width_m"]').value = prefillWidth;
        }
        wallsContainer.appendChild(frag);
    }

    async function clearDeco(btn) { 
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return;
        btn.closest(SELECTORS.decoItem).querySelectorAll('input, select').forEach(el => { el.value = ''; });
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลตกแต่งแล้ว', 'success');
    }

    function toggleSetFabricUI(setEl) {
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        setEl.querySelector(SELECTORS.sheerWrap).classList.toggle("hidden", !hasSheer);
        setEl.querySelector('[data-set-options-row]').classList.toggle("three-col", hasSheer);
        setEl.querySelector("[data-sheer-price-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-yardage-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-track-label]").classList.toggle("hidden", !hasSheer);

        const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
        setEl.querySelector("[data-opaque-price-label]").classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-yardage-label]").classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-track-label]").classList.toggle("hidden", !hasOpaque);
    }
    
    function toggleSuspend(btn) {
        const item = btn.closest('.set, .deco, .wallpaper');
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        btn.querySelector('[data-suspend-text]').textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }
    async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); }
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); item.querySelectorAll('input').forEach(el => el.value = ''); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); }
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }
    function renumber() { document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => { const input = room.querySelector(SELECTORS.roomNameInput); if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`; const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`); items.forEach((item, iIdx) => { const lbl = item.querySelector("[data-item-title]"); if (lbl) lbl.textContent = `${iIdx + 1}`; }); }); }
    function recalcAll() { let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0; let grandOpaqueTrack = 0, grandSheerTrack = 0; document.querySelectorAll(SELECTORS.room).forEach((room) => { let roomSum = 0; const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value); const style = room.querySelector(SELECTORS.roomStyle).value; const sPlus = stylePlus(style); room.querySelectorAll(SELECTORS.set).forEach((set) => { const priceTotalEl = set.querySelector('[data-set-price-total]'); const priceOpaqueEl = set.querySelector('[data-opaque-price]'); const priceSheerEl = set.querySelector('[data-sheer-price]'); const opaqueYardageEl = set.querySelector('[data-opaque-yardage]'); const sheerYardageEl = set.querySelector('[data-sheer-yardage]'); const opaqueTrackEl = set.querySelector('[data-opaque-track-m]'); const sheerTrackEl = set.querySelector('[data-sheer-track-m]'); const width = clamp01(set.querySelector('input[name="width_m"]').value); const height = clamp01(set.querySelector('input[name="height_m"]').value); const fabricVariant = set.querySelector('select[name="fabric_variant"]').value; const sheerPrice = toNum(set.querySelector('select[name="sheer_price_per_m"]').value); const isSuspended = set.dataset.suspended === 'true'; let subtotal = 0, opaquePrice = 0, sheerPriceTotal = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0; if (isSuspended) { priceTotalEl.textContent = 'ระงับ'; priceOpaqueEl.textContent = 'ระงับ'; priceSheerEl.textContent = 'ระงับ'; opaqueYardageEl.textContent = 'ระงับ'; sheerYardageEl.textContent = 'ระงับ'; opaqueTrackEl.textContent = 'ระงับ'; sheerTrackEl.textContent = 'ระงับ'; } else { const heightAdd = heightPlus(height) * height; if (fabricVariant === "ทึบ" || fabricVariant === "ทึบ&โปร่ง") { opaqueYards = CALC.fabricYardage(style, width); opaqueTrack = width; opaquePrice = (baseRaw + sPlus + heightAdd) * opaqueYards; subtotal += opaquePrice; } if (fabricVariant === "โปร่ง" || fabricVariant === "ทึบ&โปร่ง") { sheerYards = CALC.fabricYardage(style, width); sheerTrack = width; sheerPriceTotal = sheerPrice > 0 ? sheerPrice * sheerYards : 0; subtotal += sheerPriceTotal; } if (opaqueYards + sheerYards > 0) { const totalSetPrice = subtotal + ((opaqueTrack > 0 ? opaqueTrack : 0) + (sheerTrack > 0 ? sheerTrack : 0)) * 200; subtotal = totalSetPrice; } priceTotalEl.textContent = fmt(subtotal, 0, true); priceOpaqueEl.textContent = fmt(opaquePrice, 0, true); priceSheerEl.textContent = fmt(sheerPriceTotal, 0, true); opaqueYardageEl.textContent = fmt(opaqueYards, 2) + " หลา"; sheerYardageEl.textContent = fmt(sheerYards, 2) + " หลา"; opaqueTrackEl.textContent = fmt(opaqueTrack, 2) + " ม."; sheerTrackEl.textContent = fmt(sheerTrack, 2) + " ม."; grandOpaqueYards += opaqueYards; grandSheerYards += sheerYards; grandOpaqueTrack += opaqueTrack; grandSheerTrack += sheerTrack; } roomSum += subtotal; }); room.querySelectorAll(SELECTORS.decoItem).forEach(deco => { const decoType = deco.querySelector('[name="deco_type"]').value; const width = clamp01(deco.querySelector('[name="deco_width_m"]').value); const height = clamp01(deco.querySelector('[name="deco_height_m"]').value); const price = toNum(deco.querySelector('[name="deco_price_sqyd"]').value); const isSuspended = deco.dataset.suspended === 'true'; const summaryEl = deco.querySelector('.item-summary'); if (isSuspended) { summaryEl.textContent = 'ระงับ'; } else { const areaSqYd = width * height * SQM_TO_SQYD; const total = areaSqYd * price; roomSum += total; summaryEl.innerHTML = `ราคา: <span class="price">${fmt(total, 0, true)}</span> บ. • ใช้: <span class="price">${fmt(areaSqYd, 2)}</span> หลา`; } }); room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => { const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value); const price = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value); const isSuspended = wallpaper.dataset.suspended === 'true'; const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]'); if (isSuspended) { summaryEl.textContent = 'ระงับ'; } else { let totalWidth = 0; wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(input => totalWidth += clamp01(input.value)); const area = totalWidth * height; const rolls = Math.ceil(area / WALLPAPER_SQM_PER_ROLL); const total = rolls * price; roomSum += total; summaryEl.innerHTML = `ราคา: <span class="price">${fmt(total, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(area, 2)}</span> ตร.ม. • ใช้ <span class="price">${rolls}</span> ม้วน`; } }); room.querySelector('[data-room-total-price]').textContent = fmt(roomSum, 0, true); room.querySelector('[data-room-opaque-yardage]').textContent = fmt(roomOpaqueYards, 2) + " หลา"; room.querySelector('[data-room-sheer-yardage]').textContent = fmt(roomSheerYards, 2) + " หลา"; grand += roomSum; }); document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true); document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2) + " หลา"; document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2) + " หลา"; document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม."; document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม."; const setsCount = document.querySelectorAll(SELECTORS.set).length; const decosCount = document.querySelectorAll(SELECTORS.decoItem).length; const wallpapersCount = document.querySelectorAll(SELECTORS.wallpaperItem).length; document.querySelector(SELECTORS.setCount).textContent = setsCount + decosCount + wallpapersCount; document.querySelector(SELECTORS.setCountSets).textContent = setsCount; document.querySelector(SELECTORS.setCountDeco).textContent = decosCount + wallpapersCount; }
    
    function buildPayload() {
        const customerInfo = {
            customer_name: document.querySelector('#customer_name').value,
            customer_phone: document.querySelector('#customer_phone').value,
            customer_address: document.querySelector('#customer_address').value,
        };
        const rooms = [...document.querySelectorAll(SELECTORS.room)].map(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: roomEl.querySelector(SELECTORS.roomPricePerM).value,
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: [],
            };
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const isSuspended = setEl.dataset.suspended === 'true';
                if (isSuspended) return;
                roomData.sets.push({
                    width_m: clamp01(setEl.querySelector('input[name="width_m"]').value),
                    height_m: clamp01(setEl.querySelector('input[name="height_m"]').value),
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const isSuspended = decoEl.dataset.suspended === 'true';
                if (isSuspended) return;
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: clamp01(decoEl.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(decoEl.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const isSuspended = wallpaperEl.dataset.suspended === 'true';
                if (isSuspended) return;
                roomData.wallpapers.push({
                    height_m: clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: [...wallpaperEl.querySelectorAll('[name="wall_width_m"]')].map(input => clamp01(input.value))
                });
            });
            return roomData;
        });
        return { ...customerInfo, rooms };
    }
    
    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function loadData() {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
                roomsEl.innerHTML = ""; roomCount = 0;
                if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
                else addRoom();
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY); addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
        recalcAll();
    }
    
    function updateLockState() {
        const lockIcon = document.querySelector(SELECTORS.lockBtn).querySelector('.material-symbols-outlined');
        document.querySelectorAll('input, select, textarea, button:not(#lockBtn, #menuBtn, #importBtn, #exportBtn)').forEach(el => {
            if (el.dataset.act) el.disabled = isLocked;
            else el.readOnly = isLocked;
        });
        
        lockIcon.textContent = isLocked ? 'lock' : 'lock_open';
        document.querySelector(SELECTORS.submitBtn).style.display = isLocked ? 'none' : '';
        document.querySelector(SELECTORS.addRoomFab).style.display = isLocked ? 'none' : '';
        document.querySelector(SELECTORS.clearAllBtn).disabled = isLocked;
        document.querySelector(SELECTORS.copyJsonBtn).disabled = !isLocked;
        document.querySelector(SELECTORS.copyTextBtn).disabled = !isLocked;

        if (isLocked) {
            showToast('แบบฟอร์มถูกล็อก', 'warning');
        } else {
            showToast('แบบฟอร์มถูกปลดล็อก', 'success');
        }
    }

    async function toggleLockState() {
        isLocked = !isLocked;
        if (isLocked) {
            saveData();
        }
        updateLockState();
    }

    function clearAllExceptPayloadAndCustomer() {
        roomsEl.innerHTML = "";
        roomCount = 0;
        addRoom();
        recalcAll();
    }
    
    // Event Listeners
    document.addEventListener('click', (e) => {
        if (e.target.dataset.act === 'del-room') delRoom(e.target);
        if (e.target.dataset.act === 'del-set') delSet(e.target);
        if (e.target.dataset.act === 'del-deco') delDeco(e.target);
        if (e.target.dataset.act === 'del-wallpaper') delWallpaper(e.target);
        if (e.target.dataset.act === 'del-wall') delWall(e.target);
        if (e.target.dataset.act === 'clear-set') clearSet(e.target);
        if (e.target.dataset.act === 'clear-deco') clearDeco(e.target);
        if (e.target.dataset.act === 'clear-wallpaper') clearWallpaper(e.target);
        if (e.target.dataset.act === 'toggle-suspend') toggleSuspend(e.target);
        if (e.target.dataset.act === 'add-wall') addWall(e.target);
        
        if (e.target.dataset.act === 'add-room') addRoom();
        if (e.target.dataset.act === 'add-set') addSet(e.target.closest(SELECTORS.room));
        if (e.target.dataset.act === 'add-deco') addDeco(e.target.closest(SELECTORS.room));
        if (e.target.dataset.act === 'add-wallpaper') addWallpaper(e.target.closest(SELECTORS.room));
        if (e.target.dataset.act === 'clear-room') {
            e.target.closest(SELECTORS.room).querySelectorAll('input, select').forEach(el => el.value = el.name === 'fabric_variant' ? 'ทึบ' : '');
            e.target.closest(SELECTORS.room).querySelectorAll('[data-sets], [data-decorations], [data-wallpapers]').forEach(c => c.innerHTML = '');
            addSet(e.target.closest(SELECTORS.room));
            recalcAll(); saveData(); updateLockState();
            showToast('ล้างข้อมูลห้องแล้ว', 'success');
        }
    });

    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', toggleLockState);
    document.querySelector(SELECTORS.addRoomFab).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async () => {
        const payload = buildPayload();
        try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            showToast('คัดลอก JSON แล้ว', 'success');
        } catch (err) {
            console.error('Failed to copy JSON: ', err);
            showToast('ไม่สามารถคัดลอก JSON ได้', 'error');
        }
    });
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (!options) return;
        const payload = buildPayload();
        let text = "";
        if (options.customer) {
            text += `
---
ข้อมูลลูกค้า
ชื่อลูกค้า: ${payload.customer_name || '-'}
เบอร์โทร: ${payload.customer_phone || '-'}
รายละเอียดเพิ่มเติม: ${payload.customer_address || '-'}
`;
        }
        if (options.details && payload.rooms && payload.rooms.length > 0) {
            text += `
---
รายละเอียดงาน
`;
            payload.rooms.forEach((room, roomIndex) => {
                text += `\nห้อง ${roomIndex + 1}: ${room.room_name || '-'}\n`;
                if (room.sets.length > 0) {
                    room.sets.forEach((set, setIndex) => {
                        text += `  จุดที่ ${setIndex + 1}: กว้าง ${set.width_m}ม. x สูง ${set.height_m}ม. (${set.fabric_variant}) - ${set.open_type || '-'}\n`;
                    });
                }
                if (room.decorations.length > 0) {
                    room.decorations.forEach((deco, decoIndex) => {
                        text += `  รายการตกแต่งที่ ${decoIndex + 1}: ${deco.type || '-'} กว้าง ${deco.width_m}ม. x สูง ${deco.height_m}ม.\n`;
                    });
                }
                if (room.wallpapers.length > 0) {
                    room.wallpapers.forEach((wallpaper, wallpaperIndex) => {
                        text += `  วอลเปเปอร์ที่ ${wallpaperIndex + 1}: สูง ${wallpaper.height_m}ม. (ผนัง: ${wallpaper.widths.join(', ')})\n`;
                    });
                }
            });
        }
        if (options.summary) {
            text += `
---
สรุปวัสดุและราคา
`;
            const summary = {
                grandTotal: document.querySelector(SELECTORS.grandTotal).textContent,
                grandFabric: document.querySelector(SELECTORS.grandFabric).textContent,
                grandSheerFabric: document.querySelector(SELECTORS.grandSheerFabric).textContent,
                grandOpaqueTrack: document.querySelector(SELECTORS.grandOpaqueTrack).textContent,
                grandSheerTrack: document.querySelector(SELECTORS.grandSheerTrack).textContent,
                setCount: document.querySelector(SELECTORS.setCount).textContent,
                setCountSets: document.querySelector(SELECTORS.setCountSets).textContent,
                setCountDeco: document.querySelector(SELECTORS.setCountDeco).textContent,
            };
            text += `ราคารวม: ${summary.grandTotal}\n`;
            text += `จำนวนจุด: ${summary.setCount}\n`;
            text += `ผ้าม่าน(ชุด): ${summary.setCountSets}\n`;
            text += `ตกแต่งเพิ่ม(ชุด): ${summary.setCountDeco}\n`;
            text += `ผ้าทึบที่ใช้: ${summary.grandFabric}\n`;
            text += `ผ้าโปร่งที่ใช้: ${summary.grandSheerFabric}\n`;
            text += `รางทึบที่ใช้: ${summary.grandOpaqueTrack}\n`;
            text += `รางโปร่งที่ใช้: ${summary.grandSheerTrack}\n`;
        }
        try {
            await navigator.clipboard.writeText(text);
            showToast('คัดลอกข้อความแล้ว', 'success');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            showToast('ไม่สามารถคัดลอกข้อความได้', 'error');
        }
    });
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });
    document.querySelector(SELECTORS.summaryBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.summaryPopup).classList.toggle('show');
    });
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        try {
            const data = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
            document.querySelector('#customer_name').value = data.customer_name || '';
            document.querySelector('#customer_address').value = data.customer_address || '';
            document.querySelector('#customer_phone').value = data.customer_phone || '';
            roomsEl.innerHTML = ""; roomCount = 0;
            if (data.rooms && data.rooms.length > 0) data.rooms.forEach(addRoom);
            else addRoom();
            saveData();
            recalcAll();
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
        } catch (err) {
            console.error("Import failed:", err);
            showToast('นำเข้าข้อมูลล้มเหลว', 'error');
        }
    });
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "marnthara_data.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast('กำลังดาวน์โหลดข้อมูล...', 'success');
    });

    document.addEventListener('input', debounce(() => {
        saveData();
        recalcAll();
    }));

    // Close menus on outside click
    document.addEventListener('click', (e) => {
        const menuBtn = document.querySelector(SELECTORS.menuBtn);
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const summaryBtn = document.querySelector(SELECTORS.summaryBtn);
        const summaryPopup = document.querySelector(SELECTORS.summaryPopup);

        if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
        if (!summaryBtn.contains(e.target) && !summaryPopup.contains(e.target)) {
            summaryPopup.classList.remove('show');
        }
    });

    orderForm.addEventListener("submit", () => {
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
                roomsEl.innerHTML = ""; roomCount = 0;
                if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
                else addRoom();
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY); addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
        recalcAll(); // Initial calculation on load
    });
})();