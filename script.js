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
            if (prefill.is_suspended) created.dataset.suspended = 'true';
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }
        
        const hasItems = created.querySelectorAll(SELECTORS.set, SELECTORS.decoItem, SELECTORS.wallpaperItem).length > 0;
        if (!hasItems) addSet(created);

        renumber(); recalcAll(); saveData(); updateLockState();
        created.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
        updateRoomUI(created);
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

    async function toggleSuspendRoom(btn) {
        const room = btn.closest(SELECTORS.room);
        if (!room) return;
        if (isLocked) return;
        const isSuspended = !(room.dataset.suspended === 'true');
        const confirmationText = isSuspended ? 'ยืนยันการระงับห้องนี้และรายการทั้งหมดในห้อง?' : 'ยืนยันการเปิดใช้งานห้องนี้และรายการทั้งหมดในห้อง?';
        if (!await showConfirmation('ระงับ/ใช้งานห้อง', confirmationText)) return;

        room.dataset.suspended = isSuspended;
        room.classList.toggle('is-suspended', isSuspended);
        recalcAll(); saveData(); updateLockState();
        showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
        updateRoomUI(room);
    }

    async function clearRoom(btn) {
        const room = btn.closest(SELECTORS.room);
        if (!room) return;
        if (isLocked || !await showConfirmation('ล้างข้อมูลห้อง', 'ยืนยันการล้างข้อมูลทั้งหมดในห้องนี้?')) return;
        room.querySelectorAll('input, select').forEach(el => el.value = el.name === 'fabric_variant' ? 'ทึบ' : '');
        room.querySelectorAll(SELECTORS.setsContainer).forEach(c => c.innerHTML = '');
        room.querySelectorAll(SELECTORS.decorationsContainer).forEach(c => c.innerHTML = '');
        room.querySelectorAll(SELECTORS.wallpapersContainer).forEach(c => c.innerHTML = '');
        addSet(room); // Add a default set back
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลห้องแล้ว', 'success');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์แล้ว?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }

    async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); if (!set) return; set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); }
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); if (!item) return; item.querySelectorAll('input').forEach(el => el.value = ''); const wallsContainer = item.querySelector(SELECTORS.wallsContainer); if (wallsContainer) wallsContainer.innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); }
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }

    function renumber() { 
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => { 
            const input = room.querySelector(SELECTORS.roomNameInput); 
            if (input) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`; 
            
            // Only renumber items in non-suspended rooms
            if (room.dataset.suspended === 'true') {
                const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
                items.forEach(item => {
                     const lbl = item.querySelector("[data-item-title]");
                     if (lbl) lbl.textContent = `ระงับ`;
                });
            } else {
                const items = room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`);
                const totalItems = items.length;
                items.forEach((item, iIdx) => { 
                    const lbl = item.querySelector("[data-item-title]");
                    if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}/${totalItems}` : `${iIdx + 1}`;
                });
            }
        }); 
    }

    function recalcAll() { 
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0; 
        let grandOpaqueTrack = 0, grandSheerTrack = 0; 
        document.querySelectorAll(SELECTORS.room).forEach((room) => { 
            // If the whole room is suspended, skip calculations
            if (room.dataset.suspended === 'true') {
                updateRoomSummary(room, 0, 0, 0);
                return;
            }

            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const style = room.querySelector(SELECTORS.roomStyle)?.value;
            const sPlus = stylePlus(style);
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') {
                    clearSetUI(set);
                    return;
                }
                const w = clamp01(set.querySelector('input[name="width_m"]')?.value), h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]')?.value;
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                if (w > 0 && h > 0) {
                    if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                        opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                        opaqueYards = CALC.fabricYardage(style, w);
                        opaqueTrack = w;
                    }
                    if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                        const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                        sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                        sheerYards = CALC.fabricYardage(style, w);
                        sheerTrack = w;
                    }
                }
                set.querySelector('[data-set-price-total]').textContent = fmt(opaquePrice + sheerPrice, 0, true);
                set.querySelector('[data-set-price-opaque]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-set-price-sheer]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);
                roomSum += opaquePrice + sheerPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                if (deco.dataset.suspended === 'true') {
                    clearDecoUI(deco);
                    return;
                }
                const w = clamp01(deco.querySelector('input[name="deco_width_m"]')?.value);
                const h = clamp01(deco.querySelector('input[name="deco_height_m"]')?.value);
                const pricePerSqyd = clamp01(deco.querySelector('input[name="deco_price_sqyd"]')?.value);
                const sqyd = (w * h * SQM_TO_SQYD);
                const price = Math.round(sqyd * pricePerSqyd);
                deco.querySelector('[data-deco-sqyd]').textContent = fmt(sqyd, 2);
                deco.querySelector('[data-deco-price]').textContent = fmt(price, 0, true);
                roomSum += price;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper) => {
                if (wallpaper.dataset.suspended === 'true') {
                    clearWallpaperUI(wallpaper);
                    return;
                }
                const h = clamp01(wallpaper.querySelector('input[name="wallpaper_height_m"]')?.value);
                const pricePerRoll = clamp01(wallpaper.querySelector('input[name="wallpaper_price_roll"]')?.value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const totalSqm = totalWidth * h;
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                const price = rollsNeeded * pricePerRoll;

                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = fmt(price, 0, true);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(totalSqm, 2);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = fmt(rollsNeeded, 0, true);

                roomSum += price;
            });
            updateRoomSummary(room, room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length, room.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length, roomSum);
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
    }

    function updateRoomSummary(roomEl, set_count, deco_count, price) {
        const briefEl = roomEl.querySelector('[data-room-brief]');
        if (!briefEl) return;
        briefEl.querySelector('.num:nth-of-type(1)').textContent = set_count + deco_count;
        briefEl.querySelector('.num:nth-of-type(2)').textContent = set_count;
        briefEl.querySelector('.num:nth-of-type(3)').textContent = fmt(price, 0, true);
    }
    
    function updateRoomUI(roomEl) {
        const isSuspended = roomEl.dataset.suspended === 'true';
        roomEl.classList.toggle('is-suspended-room', isSuspended);
        const menuDropdown = roomEl.querySelector('.room-menu-dropdown');
        if (menuDropdown) menuDropdown.classList.add('hidden'); // Close menu after action
    }

    function clearSetUI(setEl) {
        setEl.querySelector('[data-set-price-total]').textContent = '0';
        setEl.querySelector('[data-set-price-opaque]').textContent = '0';
        setEl.querySelector('[data-set-price-sheer]').textContent = '0';
        setEl.querySelector('[data-set-yardage-opaque]').textContent = '0.00';
        setEl.querySelector('[data-set-yardage-sheer]').textContent = '0.00';
        setEl.querySelector('[data-set-opaque-track]').textContent = '0.00';
        setEl.querySelector('[data-set-sheer-track]').textContent = '0.00';
    }

    function clearDecoUI(decoEl) {
        decoEl.querySelector('[data-deco-price]').textContent = '0';
        decoEl.querySelector('[data-deco-sqyd]').textContent = '0.00';
    }

    function clearWallpaperUI(wallpaperEl) {
        wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = '0';
        wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = '0.00';
        wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = '0';
    }

    function buildPayload() {
        const payload = { version: APP_VERSION, rooms: [] };
        const customerInfo = document.querySelector('#customerInfo');
        if (customerInfo) {
            payload.customer_name = customerInfo.querySelector('input[name="customer_name"]')?.value;
            payload.customer_phone = customerInfo.querySelector('input[name="customer_phone"]')?.value;
            payload.customer_address = customerInfo.querySelector('input[name="customer_address"]')?.value;
        }

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value,
                price_per_m_raw: toNum(roomEl.querySelector(SELECTORS.roomPricePerM)?.value),
                style: roomEl.querySelector(SELECTORS.roomStyle)?.value,
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const is_suspended = setEl.dataset.suspended === 'true';
                if (!is_suspended) {
                    const setData = {
                        width_m: clamp01(setEl.querySelector('input[name="width_m"]')?.value),
                        height_m: clamp01(setEl.querySelector('input[name="height_m"]')?.value),
                        fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value,
                        open_type: setEl.querySelector('select[name="open_type"]')?.value,
                        sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value),
                        is_suspended: is_suspended
                    };
                    roomData.sets.push(setData);
                }
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const is_suspended = decoEl.dataset.suspended === 'true';
                if (!is_suspended) {
                    const decoData = {
                        type: decoEl.querySelector('[name="deco_type"]')?.value,
                        width_m: clamp01(decoEl.querySelector('[name="deco_width_m"]')?.value),
                        height_m: clamp01(decoEl.querySelector('[name="deco_height_m"]')?.value),
                        price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                        remark: decoEl.querySelector('[name="deco_remark"]')?.value,
                        is_suspended: is_suspended
                    };
                    roomData.decorations.push(decoData);
                }
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const is_suspended = wallpaperEl.dataset.suspended === 'true';
                if (!is_suspended) {
                    const wallpaperData = {
                        height_m: clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value),
                        price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                        widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value)),
                        is_suspended: is_suspended
                    };
                    roomData.wallpapers.push(wallpaperData);
                }
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function loadPayload(payload) {
        roomsEl.innerHTML = "";
        roomCount = 0;
        if (!payload || !payload.rooms) return;

        document.querySelector('input[name="customer_name"]').value = payload.customer_name || "";
        document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || "";
        document.querySelector('input[name="customer_address"]').value = payload.customer_address || "";

        payload.rooms.forEach(roomData => addRoom(roomData));
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function updateLockState() {
        if (isLocked) {
            document.body.classList.add('is-locked');
            showToast('แบบฟอร์มถูกล็อคแล้ว', 'error');
        } else {
            document.body.classList.remove('is-locked');
            showToast('แบบฟอร์มถูกปลดล็อคแล้ว', 'success');
        }
    }

    function buildTextSummary(options) {
        let text = "";
        const payload = buildPayload();
        const customer = payload.customer_name;
        const phone = payload.customer_phone;
        const address = payload.customer_address;

        if (options.customer && (customer || phone || address)) {
            text += "=== ข้อมูลลูกค้า ===\n";
            if (customer) text += `ชื่อ: ${customer}\n`;
            if (phone) text += `โทร: ${phone}\n`;
            if (address) text += `รายละเอียด: ${address}\n`;
            text += "\n";
        }

        if (options.details && payload.rooms && payload.rooms.length > 0) {
            text += "=== รายละเอียดห้อง ===\n";
            payload.rooms.forEach((room, roomIndex) => {
                text += `\n** ห้องที่ ${roomIndex + 1}: ${room.room_name || `ห้อง ${String(roomIndex + 1).padStart(2, "0")}`}${room.is_suspended ? ' (ระงับ)' : ''} **\n`;
                let roomPrice = 0;

                room.sets.forEach((set, setIndex) => {
                    const pricePerM = room.price_per_m_raw;
                    const style = room.style;
                    const surcharge = stylePlus(style);
                    const heightSurcharge = heightPlus(set.height_m);

                    const opaquePrice = (set.fabric_variant === "ทึบ" || set.fabric_variant === "ทึบ&โปร่ง") ? Math.round((pricePerM + surcharge + heightSurcharge) * set.width_m) : 0;
                    const sheerPrice = (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") ? Math.round((set.sheer_price_per_m + surcharge + heightSurcharge) * set.width_m) : 0;
                    const totalPrice = opaquePrice + sheerPrice;
                    roomPrice += totalPrice;

                    text += ` - จุดที่ ${setIndex + 1}: ${set.width_m}ม. x ${set.height_m}ม. (${set.fabric_variant}${set.open_type ? `, ${set.open_type}` : ''}) ราคา ${fmt(totalPrice, 0, true)} บ.\n`;
                });

                room.decorations.forEach((deco, decoIndex) => {
                    const sqyd = deco.width_m * deco.height_m * SQM_TO_SQYD;
                    const price = Math.round(sqyd * deco.price_sqyd);
                    roomPrice += price;
                    text += ` - รายการตกแต่งที่ ${decoIndex + 1}: ${deco.type || 'ไม่มีชื่อ'} ราคา ${fmt(price, 0, true)} บ.\n`;
                });
                
                room.wallpapers.forEach((wallpaper, wpIndex) => {
                    const totalWidth = wallpaper.widths.reduce((sum, w) => sum + w, 0);
                    const rollsNeeded = CALC.wallpaperRolls(totalWidth, wallpaper.height_m);
                    const price = rollsNeeded * wallpaper.price_per_roll;
                    roomPrice += price;
                    text += ` - วอลเปเปอร์ที่ ${wpIndex + 1}: กว้าง ${fmt(totalWidth, 2)}ม. x สูง ${fmt(wallpaper.height_m, 2)}ม. ราคา ${fmt(price, 0, true)} บ. (${fmt(rollsNeeded, 0, true)} ม้วน)\n`;
                });
                text += `** ราคารวมห้องนี้: ${fmt(roomPrice, 0, true)} บ. **\n`;
            });
        }

        if (options.summary) {
            const grandTotal = Array.from(document.querySelectorAll(`${SELECTORS.room}:not([data-suspended="true"])`)).reduce((sum, roomEl) => sum + toNum(roomEl.querySelector('[data-room-brief] .price')?.textContent), 0);
            const grandFabric = toNum(document.querySelector(SELECTORS.grandFabric)?.textContent.replace(' หลา', ''));
            const grandSheerFabric = toNum(document.querySelector(SELECTORS.grandSheerFabric)?.textContent.replace(' หลา', ''));
            const grandOpaqueTrack = toNum(document.querySelector(SELECTORS.grandOpaqueTrack)?.textContent.replace(' ม.', ''));
            const grandSheerTrack = toNum(document.querySelector(SELECTORS.grandSheerTrack)?.textContent.replace(' ม.', ''));
            
            text += "\n=== สรุปยอดรวม ===\n";
            text += `ราคารวม: ${fmt(grandTotal, 0, true)} บาท\n`;
            text += `ผ้าทึบที่ใช้: ${fmt(grandFabric, 2)} หลา\n`;
            text += `ผ้าโปร่งที่ใช้: ${fmt(grandSheerFabric, 2)} หลา\n`;
            text += `รางทึบที่ใช้: ${fmt(grandOpaqueTrack, 2)} ม.\n`;
            text += `รางโปร่งที่ใช้: ${fmt(grandSheerTrack, 2)} ม.\n`;
        }

        return text;
    }

    // Event Delegation
    roomsEl.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const action = target.dataset.act;
        const room = target.closest(SELECTORS.room);
        
        switch(action) {
            case 'add-set': addSet(room); break;
            case 'add-deco': addDeco(room); break;
            case 'add-wallpaper': addWallpaper(room); break;
            case 'del-room': delRoom(target); break;
            case 'del-set': delSet(target); break;
            case 'del-deco': delDeco(target); break;
            case 'del-wallpaper': delWallpaper(target); break;
            case 'del-wall': delWall(target); break;
            case 'clear-set': clearSet(target); break;
            case 'clear-deco': clearDeco(target); break;
            case 'clear-wallpaper': clearWallpaper(target); break;
            case 'toggle-suspend': toggleSuspend(target); break;
            case 'toggle-suspend-room': toggleSuspendRoom(target); break;
            case 'clear-room': clearRoom(target); break;
            case 'toggle-menu':
                const menuDropdown = room.querySelector('.room-menu-dropdown');
                if (menuDropdown) menuDropdown.classList.toggle('hidden');
                break;
            default: return;
        }
    });

    roomsEl.addEventListener('change', debounce((e) => {
        const target = e.target;
        if (target.matches('input') || target.matches('select')) {
            const room = target.closest(SELECTORS.room);
            if (room && room.dataset.suspended === 'true') {
                 // Do not recalculate for changes in a suspended room
                 // and revert the change if possible (e.g., if it's a checkbox, uncheck it)
                 if (target.type === 'checkbox') target.checked = !target.checked;
                 else target.value = target.dataset.originalValue ?? '';
                 return;
            }
            recalcAll();
            saveData();
        }
    }));

    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => { isLocked = !isLocked; updateLockState(); });

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        showToast('คัดลอก JSON แล้ว', 'success');
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const summaryText = buildTextSummary(options);
            navigator.clipboard.writeText(summaryText);
            showToast('คัดลอกข้อความแล้ว', 'success');
        }
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        if (menuDropdown) menuDropdown.classList.toggle('show');
    });

    // Close menu when clicking outside
    window.addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const menuBtn = document.querySelector(SELECTORS.menuBtn);
        if (menuDropdown && menuBtn && !menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
        document.querySelectorAll('.room-menu-dropdown').forEach(d => {
            if (!e.target.closest('.room-menu-container') && !d.classList.contains('hidden')) {
                d.classList.add('hidden');
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
        recalcAll();
    });
})();