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
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel'
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
        if (!container) return; // Add a check to ensure container exists
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
            if (!modalEl) { resolve(true); return; } // Resolve immediately if modal doesn't exist
            modalEl.querySelector(SELECTORS.modalTitle).textContent = title;
            modalEl.querySelector(SELECTORS.modalBody).textContent = body;
            modalEl.classList.add('visible');
            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                const confirmBtn = modalEl.querySelector(SELECTORS.modalConfirm);
                const cancelBtn = modalEl.querySelector(SELECTORS.modalCancel);
                if (confirmBtn) confirmBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
                resolve(result);
            };
            modalEl.querySelector(SELECTORS.modalConfirm).onclick = () => cleanup(true);
            modalEl.querySelector(SELECTORS.modalCancel).onclick = () => cleanup(false);
        });
    };

    function showCopyOptionsModal() {
        return new Promise((resolve) => {
            const modal = document.querySelector(SELECTORS.copyOptionsModal);
            if (!modal) { resolve(false); return; }
            modal.classList.add('visible');
            const confirmBtn = document.querySelector(SELECTORS.copyOptionsConfirm);
            const cancelBtn = document.querySelector(SELECTORS.copyOptionsCancel);
            
            const cleanup = (result) => {
                modal.classList.remove('visible');
                if (confirmBtn) confirmBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
                resolve(result);
            };
            
            confirmBtn.onclick = () => {
                const options = {
                    customer: document.querySelector(SELECTORS.copyCustomerInfo)?.checked ?? false,
                    details: document.querySelector(SELECTORS.copyRoomDetails)?.checked ?? false,
                    summary: document.querySelector(SELECTORS.copySummary)?.checked ?? false,
                };
                cleanup(options);
            };
            
            cancelBtn.onclick = () => cleanup(false);
        });
    }

    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Room template not found."); return; }
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
        if (!selectEl) return;
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
        if (!setsWrap) return;
        const frag = document.querySelector(SELECTORS.setTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Set template not found."); return; }
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
        if (!decoWrap) return;
        const frag = document.querySelector(SELECTORS.decoTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Deco template not found."); return; }
        decoWrap.appendChild(frag);
        const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);
        if (prefill) {
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
        if (!wallpaperWrap) return;
        const frag = document.querySelector(SELECTORS.wallpaperTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Wallpaper template not found."); return; }
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
        const wallsContainer = btn.closest(SELECTORS.wallpaperItem)?.querySelector(SELECTORS.wallsContainer);
        if (!wallsContainer) return;
        const frag = document.querySelector(SELECTORS.wallTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Wall template not found."); return; }
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
        if (!setEl) return;
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        setEl.querySelector(SELECTORS.sheerWrap)?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector('[data-set-options-row]')?.classList.toggle("three-col", hasSheer);
        setEl.querySelector("[data-sheer-price-label]")?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-yardage-label]")?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-track-label]")?.classList.toggle("hidden", !hasSheer);

        const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
        setEl.querySelector("[data-opaque-price-label]")?.classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-yardage-label]")?.classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-track-label]")?.classList.toggle("hidden", !hasOpaque);
    }
    
    function toggleSuspend(btn) {
        const item = btn.closest('.set, .deco-item, .wallpaper-item');
        if (!item) return;
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        const suspendTextEl = btn.querySelector('[data-suspend-text]');
        if (suspendTextEl) suspendTextEl.textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์แล้ว?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }
    async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); if (!set) return; set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); }
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); if (!item) return; item.querySelectorAll('input').forEach(el => el.value = ''); const wallsContainer = item.querySelector(SELECTORS.wallsContainer); if (wallsContainer) wallsContainer.innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); }
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }
    function renumber() { document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => { const input = room.querySelector(SELECTORS.roomNameInput); if (input) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`; const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`); const totalItems = items.length; items.forEach((item, iIdx) => { const lbl = item.querySelector("[data-item-title]"); if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}/${totalItems}` : `${iIdx + 1}`; }); }); }
    
    // Add new functions for room actions
    async function toggleSuspendRoom(btn) {
        const room = btn.closest(SELECTORS.room);
        if (!room) return;
        const isSuspended = !(room.dataset.suspended === 'true');
        room.dataset.suspended = isSuspended;
        room.classList.toggle('is-suspended', isSuspended);
        room.querySelectorAll('input, select, button').forEach(el => el.disabled = isSuspended);
        const suspendTextEl = btn.querySelector('[data-suspend-text]');
        if (suspendTextEl) suspendTextEl.textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function clearRoom(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูลห้อง', 'ยืนยันการล้างข้อมูลในห้องนี้?')) return;
        const room = btn.closest(SELECTORS.room);
        if (!room) return;
        room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).forEach(item => item.remove());
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลห้องแล้ว', 'success');
    }

    function recalcAll() { 
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        document.querySelectorAll(SELECTORS.room).forEach((room) => { 
            let roomSum = 0;
            if (room.dataset.suspended === 'true') {
                const brief = room.querySelector('[data-room-brief]');
                if (brief) brief.textContent = "สถานะ: ระงับ";
                return;
            }
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const style = room.querySelector(SELECTORS.roomStyle)?.value;
            const sPlus = stylePlus(style);
            room.querySelectorAll(SELECTORS.set).forEach((set) => { 
                if (set.dataset.suspended === 'true') {
                    const brief = set.querySelector('.small');
                    if (brief) brief.textContent = "สถานะ: ระงับ";
                    return;
                }
                const w = clamp01(set.querySelector('input[name="width_m"]')?.value), h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]')?.value;
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                
                if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                    opaqueYards = CALC.fabricYardage(style, w);
                    opaqueTrack = w;
                    opaquePrice = (baseRaw + sPlus + hPlus) * w;
                    grandOpaqueYards += opaqueYards;
                    grandOpaqueTrack += opaqueTrack;
                }
                
                if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                    sheerYards = CALC.fabricYardage('ลอน', w);
                    sheerTrack = w;
                    const sheerBaseRaw = toNum(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                    const sheerHPlus = heightPlus(h);
                    sheerPrice = (sheerBaseRaw + sheerHPlus) * w;
                    grandSheerYards += sheerYards;
                    grandSheerTrack += sheerTrack;
                }
                
                set.querySelector('[data-opaque-price]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-opaque-yardage]').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-opaque-track]').textContent = fmt(opaqueTrack, 2);
                
                set.querySelector('[data-sheer-price]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-sheer-yardage]').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-sheer-track]').textContent = fmt(sheerTrack, 2);
                
                roomSum += opaquePrice + sheerPrice;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                if (deco.dataset.suspended === 'true') {
                    const brief = deco.querySelector('.small');
                    if (brief) brief.textContent = "สถานะ: ระงับ";
                    return;
                }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value), h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const price = toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                const sum = w * h * SQM_TO_SQYD * price;
                deco.querySelector('[data-deco-summary] .price:first-of-type').textContent = fmt(sum, 0, true);
                deco.querySelector('[data-deco-summary] .price:last-of-type').textContent = fmt(w * h * SQM_TO_SQYD, 2);
                roomSum += sum;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                if (wallpaper.dataset.suspended === 'true') {
                    const brief = wallpaper.querySelector('.small');
                    if (brief) brief.textContent = "สถานะ: ระงับ";
                    return;
                }
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const totalSqm = totalWidth * h;
                const rolls = CALC.wallpaperRolls(totalWidth, h);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                const sum = rolls * pricePerRoll;
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = fmt(sum, 0, true);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(totalSqm, 2);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = fmt(rolls, 0);
                roomSum += sum;
            });
            
            const totalEl = room.querySelector('[data-room-total]');
            if (totalEl) totalEl.textContent = fmt(roomSum, 0, true);
            grand += roomSum;
        });
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;

        // Update counts
        const setCount = document.querySelector(SELECTORS.setCount);
        const setCountSets = document.querySelector(SELECTORS.setCountSets);
        const setCountDeco = document.querySelector(SELECTORS.setCountDeco);
        if (setCount) setCount.textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length + 
                                            document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length +
                                            document.querySelectorAll(`${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        if (setCountSets) setCountSets.textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length;
        if (setCountDeco) setCountDeco.textContent = document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length + 
                                                document.querySelectorAll(`${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
    }

    function buildPayload() {
        const payload = {
            customer_name: document.querySelector('input[name="customer_name"]')?.value || "",
            customer_phone: document.querySelector('input[name="customer_phone"]')?.value || "",
            customer_address: document.querySelector('input[name="customer_address"]')?.value || "",
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            if (room.dataset.suspended === 'true') return;
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput)?.value || "",
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM)?.value),
                style: room.querySelector(SELECTORS.roomStyle)?.value || "",
                sets: [],
                decorations: [],
                wallpapers: []
            };
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') return;
                roomData.sets.push({
                    width_m: toNum(set.querySelector('input[name="width_m"]')?.value),
                    height_m: toNum(set.querySelector('input[name="height_m"]')?.value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]')?.value || "ทึบ",
                    open_type: set.querySelector('select[name="open_type"]')?.value || "",
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]')?.value),
                });
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                if (deco.dataset.suspended === 'true') return;
                roomData.decorations.push({
                    type: deco.querySelector('[name="deco_type"]')?.value || "",
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value)
                });
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                if (wallpaper.dataset.suspended === 'true') return;
                const widths = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value));
                roomData.wallpapers.push({
                    height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value),
                    widths: widths
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function loadPayload(payload) {
        if (!payload) return;
        document.querySelector('input[name="customer_name"]').value = payload.customer_name || "";
        document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || "";
        document.querySelector('input[name="customer_address"]').value = payload.customer_address || "";
        roomsEl.innerHTML = "";
        roomCount = 0;
        (payload.rooms || []).forEach(roomData => addRoom(roomData));
        if (payload.rooms.length === 0) addRoom();
        recalcAll();
        showToast("นำเข้าข้อมูลเรียบร้อยแล้ว", "success");
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function updateLockState() {
        document.querySelectorAll('input, select, button:not(#lockBtn):not(#menuBtn)').forEach(el => {
            el.disabled = isLocked;
        });
        document.querySelectorAll('.btn-icon, .btn-xs').forEach(el => {
            el.classList.toggle('disabled-cursor', isLocked);
        });
        const lockTextEl = document.querySelector('.lock-text');
        const lockIconEl = document.querySelector('.lock-icon');
        if (lockTextEl) lockTextEl.textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        if (lockIconEl) lockIconEl.textContent = isLocked ? '🔓' : '🔒';
        showToast(isLocked ? 'ล็อคหน้าแล้ว' : 'ปลดล็อคหน้าแล้ว', isLocked ? 'danger' : 'success');
    }
    
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.dataset.act) {
            const action = target.dataset.act;
            const parentRoom = target.closest(SELECTORS.room);
            const parentItem = target.closest('.set, .deco-item, .wallpaper-item');
            if (action === 'add-room' || action === 'add-room-header') addRoom();
            else if (action === 'add-set') addSet(parentRoom);
            else if (action === 'add-deco') addDeco(parentRoom);
            else if (action === 'add-wallpaper') addWallpaper(parentRoom);
            else if (action === 'add-wall') addWall(target);
            else if (action === 'del-room') delRoom(target);
            else if (action === 'del-set') delSet(target);
            else if (action === 'del-deco') delDeco(target);
            else if (action === 'del-wallpaper') delWallpaper(target);
            else if (action === 'del-wall') delWall(target);
            else if (action === 'clear-set') clearSet(target);
            else if (action === 'clear-deco') clearDeco(target);
            else if (action === 'clear-wallpaper') clearWallpaper(target);
            else if (action === 'clear-all') clearAllData();
            else if (action === 'copy-json') copyToClipboard(JSON.stringify(buildPayload(), null, 2));
            else if (action === 'copy-text') handleCopyText();
            else if (action === 'toggle-suspend') toggleSuspend(target);
            else if (action === 'toggle-room-menu') {
                const dropdown = parentRoom.querySelector('.room-menu-dropdown');
                if (dropdown) dropdown.classList.toggle('show');
            }
            else if (action === 'suspend-room') toggleSuspendRoom(target);
            else if (action === 'clear-room') clearRoom(target);
        }
    });

    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => { isLocked = !isLocked; updateLockState(); });
    
    document.addEventListener('input', debounce((e) => {
        const target = e.target;
        if (target.matches('input[name], select[name]')) {
            recalcAll(); saveData();
        }
        if (target.closest(SELECTORS.set) && target.name === 'fabric_variant') {
            toggleSetFabricUI(target.closest(SELECTORS.set));
        }
    }));
    
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('คัดลอกข้อมูลเรียบร้อย', 'success');
        } catch (err) {
            console.error('Failed to copy: ', err);
            showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
        }
    }
    
    async function handleCopyText() {
        const options = await showCopyOptionsModal();
        if (!options) return;

        let output = [];
        const payload = buildPayload();

        if (options.customer) {
            output.push("ข้อมูลลูกค้า");
            output.push(`ชื่อ: ${payload.customer_name || "-"}`);
            output.push(`เบอร์โทร: ${payload.customer_phone || "-"}`);
            output.push(`รายละเอียด: ${payload.customer_address || "-"}`);
            output.push("");
        }
        
        if (options.details) {
            output.push("รายละเอียดรายการ");
            payload.rooms.forEach(room => {
                output.push(`- ห้อง: ${room.room_name || "ไม่มีชื่อ"}`);
                const basePrice = room.price_per_m_raw;
                const style = room.style;
                if (basePrice) output.push(`  ราคาผ้า (ทึบ): ${basePrice} บาท/เมตร`);
                if (style) output.push(`  สไตล์: ${style}`);
                
                room.sets.forEach(set => {
                    const pricePerM = basePrice + stylePlus(style);
                    const hPlus = heightPlus(set.height_m);
                    output.push(`  • จุดผ้าม่าน: ${set.width_m} x ${set.height_m} ม. (${set.fabric_variant})`);
                    output.push(`    ราคา: ${fmt((pricePerM + hPlus) * set.width_m, 0, true)} บาท`);
                    output.push(`    ใช้ผ้าทึบ: ${fmt(CALC.fabricYardage(style, set.width_m), 2)} หลา`);
                    if (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") {
                        const sheerPricePerM = toNum(set.sheer_price_per_m);
                        const sheerHPlus = heightPlus(set.height_m);
                        output.push(`    ใช้ผ้าโปร่ง: ${fmt(CALC.fabricYardage('ลอน', set.width_m), 2)} หลา`);
                        output.push(`    ราคา (โปร่ง): ${fmt((sheerPricePerM + sheerHPlus) * set.width_m, 0, true)} บาท`);
                    }
                });

                room.decorations.forEach(deco => {
                    output.push(`  • รายการตกแต่ง: ${deco.type || "ไม่มีชื่อ"}`);
                    output.push(`    ราคา: ${fmt(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd, 0, true)} บาท`);
                });

                room.wallpapers.forEach(wallpaper => {
                    output.push(`  • วอลเปเปอร์: ความสูง ${wallpaper.height_m} ม.`);
                    output.push(`    ความกว้างรวม: ${fmt(wallpaper.widths.reduce((sum, w) => sum + w, 0), 2)} ม.`);
                    const rolls = CALC.wallpaperRolls(wallpaper.widths.reduce((sum, w) => sum + w, 0), wallpaper.height_m);
                    output.push(`    ใช้ ${fmt(rolls, 0)} ม้วน, ราคา ${fmt(rolls * wallpaper.price_per_roll, 0, true)} บาท`);
                });
            });
            output.push("");
        }
        
        if (options.summary) {
            output.push("สรุปยอดรวม");
            output.push(`ราคารวม: ${document.querySelector(SELECTORS.grandTotal)?.textContent || "0"} บาท`);
            output.push(`ใช้ผ้าทึบ: ${document.querySelector(SELECTORS.grandFabric)?.textContent || "0"} `);
            output.push(`ใช้ผ้าโปร่ง: ${document.querySelector(SELECTORS.grandSheerFabric)?.textContent || "0"}`);
            output.push(`ใช้รางทึบ: ${document.querySelector(SELECTORS.grandOpaqueTrack)?.textContent || "0"}`);
            output.push(`ใช้รางโปร่ง: ${document.querySelector(SELECTORS.grandSheerTrack)?.textContent || "0"}`);
        }
        
        if (output.length > 0) {
            copyToClipboard(output.join('\n'));
        } else {
            showToast("โปรดเลือกข้อมูลที่ต้องการคัดลอก", "warning");
        }
    }
    
    // Toggle main menu dropdown
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        if (menuDropdown) menuDropdown.classList.toggle('show');
    });

    // Close all menus when clicking outside
    window.addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const menuBtn = document.querySelector(SELECTORS.menuBtn);
        if (menuDropdown && menuBtn && !menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
            menuDropdown.classList.remove('show');
        }

        document.querySelectorAll('.room-actions-menu').forEach(menu => {
            const btn = menu.querySelector('[data-act="toggle-room-menu"]');
            const dropdown = menu.querySelector('.room-menu-dropdown');
            if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    });

    orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        const payloadInput = document.querySelector(SELECTORS.payloadInput);
        if (payloadInput) payloadInput.value = JSON.stringify(payload);
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                loadPayload(payload);
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY); 
                addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
    });
})();