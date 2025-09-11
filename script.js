(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const METER_TO_YARD = 0.9144; // Added constant for more accurate conversion
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
            // Updated formula to use the accurate conversion factor of 0.9144 meters per yard
            if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / METER_TO_YARD;
            if (style === "ลอน") return (width * 2.6 + 0.6) / METER_TO_YARD;
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
                // Updated price calculation to use the correct conversion factor
                const opaquePrice = opaquePricePerM * (opaqueYardage * METER_TO_YARD);
                const sheerPrice = sheerPricePerM * (sheerYardage * METER_TO_YARD);
                const totalSetPrice = opaquePrice + sheerPrice;
                roomSum += totalSetPrice;
                grandOpaqueYards += opaqueYardage;
                grandSheerYards += sheerYardage;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
                set.querySelector('[data-set-price-total]').textContent = fmt(totalSetPrice, 0, true);
                set.querySelector('[data-set-price-opaque]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-set-price-sheer]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYardage);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYardage);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack);
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                if (deco.dataset.suspended === 'true') {
                    deco.querySelector('[data-deco-price-total]').textContent = "0";
                    deco.querySelector('[data-deco-area-sqyd]').textContent = "0.00";
                    return;
                }
                const width = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const height = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const pricePerSqYd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                const areaSqM = width * height;
                const areaSqYd = areaSqM * SQM_TO_SQYD;
                const totalPrice = areaSqYd * pricePerSqYd;
                roomSum += totalPrice;
                deco.querySelector('[data-deco-price-total]').textContent = fmt(totalPrice, 0, true);
                deco.querySelector('[data-deco-area-sqyd]').textContent = fmt(areaSqYd);
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper) => {
                if (wallpaper.dataset.suspended === 'true') {
                    wallpaper.querySelector('[data-wallpaper-price-total]').textContent = "0";
                    wallpaper.querySelector('[data-wallpaper-area-sqm]').textContent = "0.00";
                    wallpaper.querySelector('[data-wallpaper-rolls]').textContent = "0";
                    return;
                }
                const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                let totalWidth = 0;
                wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(input => totalWidth += clamp01(input.value));
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, height);
                const totalPrice = rollsNeeded * pricePerRoll;
                roomSum += totalPrice;
                wallpaper.querySelector('[data-wallpaper-price-total]').textContent = fmt(totalPrice, 0, true);
                wallpaper.querySelector('[data-wallpaper-area-sqm]').textContent = fmt(totalWidth * height);
                wallpaper.querySelector('[data-wallpaper-rolls]').textContent = fmt(rollsNeeded, 0);
            });
            grand += roomSum;
            room.querySelector('[data-room-total]').textContent = fmt(roomSum, 0, true);
            const numPoints = room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length;
            const numSets = room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])[data-is-set="true"]`).length;
            const numDeco = room.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length;
            const numWallpaper = room.querySelectorAll(`${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
            const roomBriefText = `${numPoints > 0 ? `จุด ${numPoints}` : ''} ${numSets > 0 ? `• ชุด ${numSets}` : ''} • ราคา ${fmt(roomSum, 0, true)} บาท`;
            room.querySelector('[data-room-brief]').textContent = roomBriefText;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])[data-is-set="true"]`).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack)} ม.`;
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: [],
        };
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                style: room.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: [],
            };
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                const isSuspended = set.dataset.suspended === 'true';
                roomData.sets.push({
                    is_suspended: isSuspended,
                    width_m: isSuspended ? 0 : clamp01(set.querySelector('input[name="width_m"]').value),
                    height_m: isSuspended ? 0 : clamp01(set.querySelector('input[name="height_m"]').value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                    open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: isSuspended ? 0 : toNum(set.querySelector('select[name="sheer_price_per_m"]').value),
                });
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                const isSuspended = deco.dataset.suspended === 'true';
                roomData.decorations.push({
                    is_suspended: isSuspended,
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: isSuspended ? 0 : clamp01(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: isSuspended ? 0 : clamp01(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: isSuspended ? 0 : toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                });
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper) => {
                const isSuspended = wallpaper.dataset.suspended === 'true';
                const heights = isSuspended ? 0 : clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const widths = isSuspended ? [] : Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).map(input => clamp01(input.value));
                roomData.wallpapers.push({
                    is_suspended: isSuspended,
                    height_m: heights,
                    widths: widths,
                    price_per_roll: isSuspended ? 0 : toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value),
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('คัดลอกสำเร็จ', 'success');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            showToast('คัดลอกไม่สำเร็จ', 'error');
        }
    }

    function buildTextSummary(options) {
        const payload = buildPayload();
        let summary = "";
        
        if (options.customer) {
            summary += `ลูกค้า: ${payload.customer_name}\n`;
            summary += `เบอร์โทร: ${payload.customer_phone}\n`;
            summary += `รายละเอียด: ${payload.customer_address}\n\n`;
        }

        if (options.details) {
            let totalSets = 0;
            let totalDeco = 0;
            let totalOpaqueTrack = 0;
            let totalSheerTrack = 0;
            let grandRoomTotal = 0;
            payload.rooms.forEach(room => {
                const roomName = room.room_name || "ห้องไม่ได้ระบุชื่อ";
                summary += `=== ${roomName} ===\n`;
                const roomSets = room.sets.filter(s => !s.is_suspended);
                const roomDeco = room.decorations.filter(d => !d.is_suspended);
                const roomWallpaper = room.wallpapers.filter(w => !w.is_suspended);
                let roomTotal = 0;
                
                roomSets.forEach((set, i) => {
                    totalSets++;
                    const width = set.width_m;
                    const height = set.height_m;
                    const style = room.style;
                    const opaquePricePerM = room.price_per_m_raw + stylePlus(style) + heightPlus(height);
                    const sheerPricePerM = set.sheer_price_per_m + stylePlus(style) + heightPlus(height);
                    const opaqueYardage = (set.fabric_variant === "ทึบ" || set.fabric_variant === "ทึบ&โปร่ง") ? CALC.fabricYardage(style, width) : 0;
                    const sheerYardage = (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") ? CALC.fabricYardage(style, width) : 0;
                    const opaquePrice = opaquePricePerM * (opaqueYardage * METER_TO_YARD);
                    const sheerPrice = sheerPricePerM * (sheerYardage * METER_TO_YARD);
                    const totalSetPrice = opaquePrice + sheerPrice;
                    roomTotal += totalSetPrice;

                    const opaqueTrack = (set.fabric_variant === "ทึบ" || set.fabric_variant === "ทึบ&โปร่ง") ? width + 0.05 : 0;
                    const sheerTrack = (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") ? width + 0.05 : 0;
                    totalOpaqueTrack += opaqueTrack;
                    totalSheerTrack += sheerTrack;

                    summary += `- จุดที่ ${i + 1} (${set.fabric_variant}) ขนาด ${width} x ${height} ม.\n`;
                    summary += `  • สไตล์: ${style}\n`;
                    if (opaqueYardage > 0) summary += `  • ผ้าทึบ: ${fmt(opaqueYardage)} หลา (ราคา ${fmt(opaquePricePerM, 0, true)} บ./ม.)\n`;
                    if (sheerYardage > 0) summary += `  • ผ้าโปร่ง: ${fmt(sheerYardage)} หลา (ราคา ${fmt(sheerPricePerM, 0, true)} บ./ม.)\n`;
                    if (opaqueTrack > 0) summary += `  • รางทึบ: ${fmt(opaqueTrack)} ม.\n`;
                    if (sheerTrack > 0) summary += `  • รางโปร่ง: ${fmt(sheerTrack)} ม.\n`;
                    summary += `  • รวม: ${fmt(totalSetPrice, 0, true)} บ.\n`;
                });
                
                roomDeco.forEach((deco, i) => {
                    totalDeco++;
                    const areaSqM = deco.width_m * deco.height_m;
                    const areaSqYd = areaSqM * SQM_TO_SQYD;
                    const totalPrice = areaSqYd * deco.price_sqyd;
                    roomTotal += totalPrice;
                    summary += `- รายการตกแต่งที่ ${i + 1} (${deco.type}) ขนาด ${deco.width_m} x ${deco.height_m} ม.\n`;
                    summary += `  • พื้นที่: ${fmt(areaSqYd)} ตร.หลา (ราคา ${fmt(deco.price_sqyd, 0, true)} บ./ตร.หลา)\n`;
                    summary += `  • รวม: ${fmt(totalPrice, 0, true)} บ.\n`;
                });
                
                roomWallpaper.forEach((wp, i) => {
                    totalDeco++;
                    const totalWidth = wp.widths.reduce((sum, w) => sum + w, 0);
                    const rollsNeeded = CALC.wallpaperRolls(totalWidth, wp.height_m);
                    const totalPrice = rollsNeeded * wp.price_per_roll;
                    roomTotal += totalPrice;
                    summary += `- รายการวอลเปเปอร์ที่ ${i + 1}\n`;
                    summary += `  • ความสูง: ${wp.height_m} ม.\n`;
                    summary += `  • ความกว้าง: ${wp.widths.join(', ')} ม. (รวม ${fmt(totalWidth, 2)} ม.)\n`;
                    summary += `  • ใช้ ${fmt(rollsNeeded, 0)} ม้วน (ราคา ${fmt(wp.price_per_roll, 0, true)} บ./ม้วน)\n`;
                    summary += `  • รวม: ${fmt(totalPrice, 0, true)} บ.\n`;
                });

                if (roomSets.length > 0 || roomDeco.length > 0 || roomWallpaper.length > 0) {
                    summary += `รวม ${roomName}: ${fmt(roomTotal, 0, true)} บาท\n\n`;
                    grandRoomTotal += roomTotal;
                }
            });
            
            if (options.summary) {
                summary += "--- สรุปยอดรวม ---\n";
                summary += `ราคารวม: ${fmt(grandRoomTotal, 0, true)} บาท\n`;
                summary += `ผ้าม่าน: ${totalSets} ชุด\n`;
                summary += `ตกแต่ง: ${totalDeco} ชุด\n`;
                summary += `ผ้าทึบ: ${fmt(grandOpaqueYards)} หลา\n`;
                summary += `ผ้าโปร่ง: ${fmt(grandSheerYards)} หลา\n`;
                summary += `รางทึบ: ${fmt(totalOpaqueTrack)} ม.\n`;
                summary += `รางโปร่ง: ${fmt(totalSheerTrack)} ม.\n`;
            }
        } else if (options.summary) {
            summary += "--- สรุปยอดรวม ---\n";
            summary += `ราคารวม: ${fmt(document.querySelector(SELECTORS.grandTotal).textContent, 0, true)} บาท\n`;
            summary += `ผ้าม่าน: ${document.querySelector(SELECTORS.setCountSets).textContent} ชุด\n`;
            summary += `ตกแต่ง: ${document.querySelector(SELECTORS.setCountDeco).textContent} ชุด\n`;
            summary += `ผ้าทึบ: ${document.querySelector(SELECTORS.grandFabric).textContent}\n`;
            summary += `ผ้าโปร่ง: ${document.querySelector(SELECTORS.grandSheerFabric).textContent}\n`;
            summary += `รางทึบ: ${document.querySelector(SELECTORS.grandOpaqueTrack).textContent}\n`;
            summary += `รางโปร่ง: ${document.querySelector(SELECTORS.grandSheerTrack).textContent}\n`;
        }
        
        return summary;
    }

    // Attach event listeners and other logic here
    document.addEventListener('click', (e) => {
        const action = e.target.dataset.act;
        switch(action) {
            case 'add-set': addSet(e.target.closest(SELECTORS.room)); break;
            case 'add-deco': addDeco(e.target.closest(SELECTORS.room)); break;
            case 'add-wallpaper': addWallpaper(e.target.closest(SELECTORS.room)); break;
            case 'add-wall': addWall(e.target); break;
            case 'del-room': delRoom(e.target); break;
            case 'del-set': delSet(e.target); break;
            case 'del-deco': delDeco(e.target); break;
            case 'del-wallpaper': delWallpaper(e.target); break;
            case 'del-wall': delWall(e.target); break;
            case 'clear-set': clearSet(e.target); break;
            case 'clear-deco': clearDeco(e.target); break;
            case 'clear-wallpaper': clearWallpaper(e.target); break;
            case 'toggle-suspend': toggleSuspend(e.target); break;
            default: break;
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        document.querySelector(SELECTORS.lockBtn).innerHTML = isLocked ? '<span class="lock-text">ปลดล็อค</span> <span class="lock-icon">🔓</span>' : '<span class="lock-text">ล็อค</span> <span class="lock-icon">🔒</span>';
        updateLockState();
        showToast(isLocked ? 'ล็อคการแก้ไขแล้ว' : 'ปลดล็อคการแก้ไขแล้ว', isLocked ? 'error' : 'success');
    });

    const debouncedRecalc = debounce(recalcAll, 120);
    const debouncedSave = debounce(saveData, 500);

    roomsEl.addEventListener('input', (e) => {
        if (!isLocked) {
            if (e.target.closest(SELECTORS.set) && e.target.name === 'fabric_variant') toggleSetFabricUI(e.target.closest(SELECTORS.set));
            debouncedRecalc();
            debouncedSave();
        }
    });
    
    orderForm.addEventListener('change', (e) => {
        if (!isLocked) {
            if (e.target.closest(SELECTORS.set) && e.target.name === 'fabric_variant') toggleSetFabricUI(e.target.closest(SELECTORS.set));
            debouncedRecalc();
            debouncedSave();
        }
    });
    
    orderForm.addEventListener('input', (e) => {
        if (!isLocked) {
            debouncedRecalc();
            debouncedSave();
        }
    });
    
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        copyToClipboard(JSON.stringify(payload, null, 2));
    });
    
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const textSummary = buildTextSummary(options);
            copyToClipboard(textSummary);
        }
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });

    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
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
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        try {
            const json = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
            document.querySelector('input[name="customer_name"]').value = json.customer_name;
            document.querySelector('input[name="customer_phone"]').value = json.customer_phone;
            document.querySelector('input[name="customer_address"]').value = json.customer_address;
            roomsEl.innerHTML = ""; roomCount = 0;
            if (json.rooms && json.rooms.length > 0) json.rooms.forEach(addRoom);
            else addRoom();
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
        } catch(err) {
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
        }
    });

    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });

    document.querySelector(SELECTORS.summaryBtn).addEventListener('click', () => {
        const summaryPopup = document.querySelector(SELECTORS.summaryPopup);
        summaryPopup.style.display = summaryPopup.style.display === 'block' ? 'none' : 'block';
    });

    function updateLockState() {
        const inputs = document.querySelectorAll('input, select, textarea');
        inputs.forEach(input => input.disabled = isLocked);
        document.querySelectorAll('button[data-act]').forEach(btn => btn.disabled = isLocked);
        document.querySelector(SELECTORS.addRoomHeaderBtn).disabled = isLocked;
        document.querySelector(SELECTORS.clearAllBtn).disabled = isLocked;
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
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