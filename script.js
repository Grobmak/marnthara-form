(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3; // This constant will no longer be used for calculation

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
        wallpaperRolls: (totalWidth, height) => {
            if (totalWidth <= 0 || height <= 0) return 0;
            const stripsPerRoll = Math.floor(10 / height);
            if (stripsPerRoll === 0) return Infinity; // Prevent division by zero
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        }
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', copyJsonBtn: '#copyJsonBtn', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomHeaderBtn: '#addRoomHeaderBtn', submitBtn: '#submitBtn',
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
        else { toast.style.backgroundColor = 'var(--card-bg)'; toast.style.color = 'var(--fg)'; }

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
        
        const hasItems = created.querySelectorAll(SELECTORS.set, SELECTORS.decoItem, SELECTORS.wallpaperItem).length > 0;
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
        const item = btn.closest('.set, .deco-item, .wallpaper-item');
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
    function renumber() { document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => { const input = room.querySelector(SELECTORS.roomNameInput); if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`; const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`); const totalItems = items.length; items.forEach((item, iIdx) => { const lbl = item.querySelector("[data-item-title]"); if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}/${totalItems}` : `${iIdx + 1}`; }); }); }
    function recalcAll() { 
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0; 
        let grandOpaqueTrack = 0, grandSheerTrack = 0; 
        document.querySelectorAll(SELECTORS.room).forEach((room) => { 
            let roomSum = 0; 
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value); 
            const style = room.querySelector(SELECTORS.roomStyle).value; 
            const sPlus = stylePlus(style); 
            room.querySelectorAll(SELECTORS.set).forEach((set) => { 
                if (set.dataset.suspended === 'true') { 
                    set.querySelector('[data-set-price-total]').textContent = "0"; 
                    set.querySelector('[data-set-price-opaque]').textContent = "0"; 
                    set.querySelector('[data-set-price-sheer]').textContent = "0"; 
                    set.querySelector('[data-set-yardage-opaque]').textContent = "0.00"; 
                    set.querySelector('[data-set-yardage-sheer]').textContent = "0.00"; 
                    set.querySelector('[data-set-opaque-track]').textContent = "0.00"; 
                    set.querySelector('[data-set-sheer-track]').textContent = "0.00"; 
                    return; 
                }
                const width = clamp01(set.querySelector('input[name="width_m"]').value);
                const height = clamp01(set.querySelector('input[name="height_m"]').value);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                const sheerRaw = toNum(set.querySelector('select[name="sheer_price_per_m"]').value);
                const hPlus = heightPlus(height);
                const opaquePricePerM = baseRaw + sPlus + hPlus;
                const sheerPricePerM = sheerRaw + sPlus + hPlus;
                const opaqueYardage = (variant === "ทึบ" || variant === "ทึบ&โปร่ง") ? CALC.fabricYardage(style, width) : 0;
                const sheerYardage = (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") ? CALC.fabricYardage(style, width) : 0;
                const opaqueTrack = (variant === "ทึบ" || variant === "ทึบ&โปร่ง") ? width + 0.05 : 0;
                const sheerTrack = (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") ? width + 0.05 : 0;
                const opaquePrice = opaquePricePerM * (opaqueYardage * 0.9);
                const sheerPrice = sheerPricePerM * (sheerYardage * 0.9);
                const totalSetPrice = opaquePrice + sheerPrice;
                roomSum += totalSetPrice;
                grandOpaqueYards += opaqueYardage;
                grandSheerYards += sheerYardage;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
                set.querySelector('[data-set-price-total]').textContent = fmt(totalSetPrice, 0, true);
                set.querySelector('[data-set-price-opaque]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-set-price-sheer]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYardage, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYardage, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                if (deco.dataset.suspended === 'true') { deco.querySelector('[data-deco-price-total]').textContent = "0"; return; }
                const width = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const height = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const price = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                const totalDecoPrice = (width * height * SQM_TO_SQYD) * price;
                roomSum += totalDecoPrice;
                deco.querySelector('[data-deco-price-total]').textContent = fmt(totalDecoPrice, 0, true);
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                if (wallpaper.dataset.suspended === 'true') { wallpaper.querySelector('[data-wallpaper-summary] .price:first-of-type').textContent = "0"; return; }
                const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const price = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                const widths = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value));
                const totalWidth = widths.reduce((sum, w) => sum + w, 0);
                const sqM = totalWidth * height;
                const rolls = CALC.wallpaperRolls(totalWidth, height);
                const totalPrice = rolls * price;
                roomSum += totalPrice;
                wallpaper.querySelector('[data-wallpaper-summary] .price:first-of-type').textContent = fmt(totalPrice, 0, true);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(sqM, 2);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = fmt(rolls, 0, true);
            });
            room.querySelector('[data-room-brief] .price').textContent = fmt(roomSum, 0, true);
            room.querySelector('[data-room-price]').textContent = `${fmt(roomSum, 0, true)} บ.`;
            grand += roomSum;
        });
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
    }
    const updateLockState = () => {
        const hasData = document.querySelector('input[name="customer_name"]').value || roomsEl.querySelectorAll(SELECTORS.room).length > 1 || roomsEl.querySelector(SELECTORS.room).querySelectorAll('input, select').length > 1;
        document.querySelector(SELECTORS.lockBtn).classList.toggle('hidden', !hasData);
        document.querySelector(SELECTORS.clearAllBtn).classList.toggle('hidden', !hasData);
    };
    function buildPayload() {
        const rooms = [];
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const sets = []; const decorations = []; const wallpapers = [];
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const width = toNum(setEl.querySelector('input[name="width_m"]').value);
                const height = toNum(setEl.querySelector('input[name="height_m"]').value);
                if (width === 0 || height === 0) return;
                const data = {
                    width_m: width,
                    height_m: height,
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('select[name="open_type"]').value,
                    is_suspended: setEl.dataset.suspended === 'true',
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                };
                sets.push(data);
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const type = decoEl.querySelector('[name="deco_type"]').value;
                const price = toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value);
                if (!type || price === 0) return;
                const data = {
                    type: type,
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: price,
                    is_suspended: decoEl.dataset.suspended === 'true',
                };
                decorations.push(data);
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const height = toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value);
                const price = toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value);
                const widths = Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)).filter(w => w > 0);
                if (height === 0 || price === 0 || widths.length === 0) return;
                const data = {
                    height_m: height,
                    price_per_roll: price,
                    widths: widths,
                    is_suspended: wallpaperEl.dataset.suspended === 'true',
                };
                wallpapers.push(data);
            });
            const roomName = roomEl.querySelector(SELECTORS.roomNameInput).value || roomEl.querySelector(SELECTORS.roomNameInput).placeholder;
            const pricePerM = toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value);
            const style = roomEl.querySelector(SELECTORS.roomStyle).value;
            if (sets.length > 0 || decorations.length > 0 || wallpapers.length > 0) {
                rooms.push({
                    room_name: roomName,
                    price_per_m_raw: pricePerM,
                    style: style,
                    sets: sets,
                    decorations: decorations,
                    wallpapers: wallpapers,
                });
            }
        });
        return {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: rooms,
            grand_total: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            grand_fabric: toNum(document.querySelector(SELECTORS.grandFabric).textContent),
            grand_sheer_fabric: toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent),
            grand_opaque_track: toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent),
            grand_sheer_track: toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent),
            version: APP_VERSION,
        };
    }
    const saveData = debounce(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
    });
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            showToast('คัดลอกสำเร็จ!', 'success');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showToast('คัดลอกไม่สำเร็จ', 'error');
        });
    };
    const generateCopyText = (options) => {
        const payload = buildPayload();
        let text = "";
        if (options.customer) {
            text += `ลูกค้า: ${payload.customer_name}\nเบอร์โทร: ${payload.customer_phone}\nรายละเอียด: ${payload.customer_address}\n\n`;
        }
        if (options.details) {
            payload.rooms.forEach(room => {
                text += `=== ${room.room_name} ===\n`;
                text += `ราคาผ้า: ${fmt(room.price_per_m_raw, 0, true)} บ./ม. สไตล์: ${room.style}\n`;
                if (room.sets.length > 0) {
                    text += "--- ผ้าม่าน ---\n";
                    room.sets.forEach((set, i) => {
                        text += `จุดที่ ${i+1}: กว้าง ${fmt(set.width_m, 2)} ม. สูง ${fmt(set.height_m, 2)} ม. ชนิด: ${set.fabric_variant}`;
                        if (set.open_type) text += ` (${set.open_type})`;
                        if (set.sheer_price_per_m > 0) text += ` ราคาโปร่ง: ${fmt(set.sheer_price_per_m, 0, true)} บ.`;
                        if (set.is_suspended) text += ` (ระงับ)`;
                        text += `\n`;
                    });
                }
                if (room.decorations.length > 0) {
                    text += "--- ตกแต่งเพิ่มเติม ---\n";
                    room.decorations.forEach((deco, i) => {
                        text += `รายการที่ ${i+1}: ${deco.type} ${deco.width_m ? `กว้าง ${fmt(deco.width_m, 2)} ม.` : ''} ${deco.height_m ? `สูง ${fmt(deco.height_m, 2)} ม.` : ''} ราคา ${fmt(deco.price_sqyd, 0, true)} บ./หลา`;
                        if (deco.is_suspended) text += ` (ระงับ)`;
                        text += `\n`;
                    });
                }
                if (room.wallpapers.length > 0) {
                    text += "--- วอลเปเปอร์ ---\n";
                    room.wallpapers.forEach((wp, i) => {
                        const totalWidth = wp.widths.reduce((sum, w) => sum + w, 0);
                        const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                        const sqM = totalWidth * wp.height_m;
                        text += `รายการที่ ${i+1}: สูง ${fmt(wp.height_m, 2)} ม. กว้างรวม ${fmt(totalWidth, 2)} ม. ราคาต่อม้วน ${fmt(wp.price_per_roll, 0, true)} บ. ใช้ ${rolls} ม้วน (${fmt(sqM, 2)} ตร.ม.)`;
                        if (wp.is_suspended) text += ` (ระงับ)`;
                        text += `\n`;
                    });
                }
                text += `\n`;
            });
        }
        if (options.summary) {
            text += `\n** สรุปยอดรวม **\n`;
            text += `ราคา: ${fmt(payload.grand_total, 0, true)} บ.\n`;
            text += `จุดติดตั้ง: ${payload.rooms.reduce((a,r) => a + r.sets.length, 0)}\n`;
            text += `ผ้าม่าน (ชุด): ${payload.rooms.reduce((a,r) => a + (r.sets.length > 0 ? 1 : 0), 0)}\n`;
            text += `ตกแต่งเพิ่ม (ชุด): ${payload.rooms.reduce((a,r) => a + (r.decorations.length > 0 ? 1 : 0), 0)}\n`;
            text += `รวมผ้าทึบ: ${fmt(payload.grand_fabric, 2)} หลา\n`;
            text += `รวมผ้าโปร่ง: ${fmt(payload.grand_sheer_fabric, 2)} หลา\n`;
            text += `รวมรางทึบ: ${fmt(payload.grand_opaque_track, 2)} ม.\n`;
            text += `รวมรางโปร่ง: ${fmt(payload.grand_sheer_track, 2)} ม.\n`;
        }
        return text;
    };
    
    // Initial setup
    addRoom();
    recalcAll();
    
    // Event listeners
    document.addEventListener('input', debounce(() => { recalcAll(); saveData(); updateLockState(); }));
    document.addEventListener('click', (e) => {
        if (e.target.dataset.act === 'add-set') addSet(e.target.closest(SELECTORS.room));
        else if (e.target.dataset.act === 'del-room') delRoom(e.target);
        else if (e.target.dataset.act === 'del-set') delSet(e.target);
        else if (e.target.dataset.act === 'add-deco') addDeco(e.target.closest(SELECTORS.room));
        else if (e.target.dataset.act === 'del-deco') delDeco(e.target);
        else if (e.target.dataset.act === 'clear-deco') clearDeco(e.target);
        else if (e.target.dataset.act === 'add-wallpaper') addWallpaper(e.target.closest(SELECTORS.room));
        else if (e.target.dataset.act === 'del-wallpaper') delWallpaper(e.target);
        else if (e.target.dataset.act === 'del-wall') delWall(e.target);
        else if (e.target.dataset.act === 'clear-set') clearSet(e.target);
        else if (e.target.dataset.act === 'clear-wallpaper') clearWallpaper(e.target);
        else if (e.target.dataset.act === 'toggle-suspend') toggleSuspend(e.target);
    });

    // Specific button listeners
    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', () => clearAllData());
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        document.querySelector(SELECTORS.lockBtn).innerHTML = isLocked ? '<span class="lock-text">ปลดล็อค</span> <span class="lock-icon">🔓</span>' : '<span class="lock-text">ล็อค</span> <span class="lock-icon">🔒</span>';
        document.querySelector(SELECTORS.orderForm).querySelectorAll('input, select, button').forEach(el => {
            if (el.id !== 'lockBtn') el.disabled = isLocked;
        });
        showToast(`ข้อมูลถูก${isLocked ? 'ล็อค' : 'ปลดล็อค'}แล้ว`, isLocked ? 'warning' : 'success');
        updateLockState();
    });

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        copyToClipboard(JSON.stringify(payload, null, 2));
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const text = generateCopyText(options);
            copyToClipboard(text);
        }
    });
    
    document.querySelector(SELECTORS.summaryBtn).addEventListener('click', () => {
        const popup = document.querySelector(SELECTORS.summaryPopup);
        popup.style.display = (popup.style.display === 'none') ? 'block' : 'none';
        
        // Hide popup if clicked outside
        const hidePopup = (e) => {
            if (!popup.contains(e.target) && !document.querySelector(SELECTORS.summaryBtn).contains(e.target)) {
                popup.style.display = 'none';
                document.removeEventListener('click', hidePopup);
            }
        };
        if (popup.style.display === 'block') {
            setTimeout(() => document.addEventListener('click', hidePopup), 100);
        }
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        menuDropdown.classList.toggle('show');
    });

    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });

    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });
    
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const data = document.querySelector(SELECTORS.importJsonArea).value;
        if (data) {
            try {
                const payload = JSON.parse(data);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name;
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
                document.querySelector('input[name="customer_address"]').value = payload.customer_address;
                roomsEl.innerHTML = ""; roomCount = 0;
                (payload.rooms || []).forEach(addRoom);
                saveData();
                updateLockState();
                showToast('นำเข้าข้อมูลสำเร็จ', 'success');
                document.querySelector(SELECTORS.importModal).classList.remove('visible');
            } catch (e) {
                showToast('รูปแบบข้อมูลไม่ถูกต้อง', 'error');
                console.error('Failed to parse JSON:', e);
            }
        }
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `marnthara_data_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast('ส่งออกข้อมูลสำเร็จ', 'success');
    });

    document.addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        if (!menuDropdown.contains(e.target) && !document.querySelector(SELECTORS.menuBtn).contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
    });

    orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name;
                document.querySelector('input[name="customer_address"]').value = payload.customer_address;
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
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
    });
})();