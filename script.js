(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;

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
            if (stripsPerRoll === 0) return Infinity;
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
        if (!container) return;
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
            if (!modalEl) { resolve(true); return; }
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
            if (prefill.is_suspended) {
                toggleSuspendRoom(created, true);
            }
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
    
    function toggleSuspendRoom(roomEl, forceState = null) {
        const isSuspended = forceState !== null ? forceState : !(roomEl.dataset.suspended === 'true');
        roomEl.dataset.suspended = isSuspended;
        roomEl.classList.toggle('is-suspended', isSuspended);
        const suspendTextEl = roomEl.querySelector('[data-suspend-text]');
        if (suspendTextEl) suspendTextEl.textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }
    
    async function clearRoom(roomEl) {
        if (isLocked || !await showConfirmation('ล้างข้อมูลห้อง', 'ยืนยันการล้างข้อมูลทั้งหมดในห้องนี้?')) return;
        roomEl.querySelectorAll('input, select').forEach(el => {
            if (el.name === 'room_name') el.value = '';
            else if (el.name === 'room_style') el.value = '';
            else if (el.name === 'room_price_per_m') el.value = '';
            else el.value = '';
        });
        const setsContainer = roomEl.querySelector(SELECTORS.setsContainer);
        if (setsContainer) setsContainer.innerHTML = '';
        const decoContainer = roomEl.querySelector(SELECTORS.decorationsContainer);
        if (decoContainer) decoContainer.innerHTML = '';
        const wallpaperContainer = roomEl.querySelector(SELECTORS.wallpapersContainer);
        if (wallpaperContainer) wallpaperContainer.innerHTML = '';
        
        addSet(roomEl);

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
            const roomEl = room;
            const roomData = buildRoomPayload(roomEl);
            roomEl.dataset.isSuspended = roomData.is_suspended;
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            const totalItems = items.length;
            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}/${totalItems}` : `${iIdx + 1}`;
            });
            const suspendTextEl = roomEl.querySelector('[data-suspend-text]');
            if (suspendTextEl) suspendTextEl.textContent = roomData.is_suspended ? 'ใช้งาน' : 'ระงับ';
        });
    }

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const isRoomSuspended = room.dataset.suspended === 'true';
            
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const style = room.querySelector(SELECTORS.roomStyle)?.value;
            const sPlus = stylePlus(style);
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (isRoomSuspended || set.dataset.suspended === 'true') {
                    set.querySelector('[data-set-price-total]').textContent = fmt(0, 0, true);
                    set.querySelector('[data-set-price-opaque]').textContent = fmt(0, 0, true);
                    set.querySelector('[data-set-price-sheer]').textContent = fmt(0, 0, true);
                    set.querySelector('[data-set-yardage-opaque]').textContent = fmt(0, 2);
                    set.querySelector('[data-set-yardage-sheer]').textContent = fmt(0, 2);
                    set.querySelector('[data-set-opaque-track]').textContent = fmt(0, 2);
                    set.querySelector('[data-set-sheer-track]').textContent = fmt(0, 2);
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
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const summaryEl = deco.querySelector('[data-deco-summary]');
                if (isRoomSuspended || deco.dataset.suspended === 'true') {
                    if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.หลา`;
                    return;
                }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value), h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const p = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                let price = Math.round(w * h * p * SQM_TO_SQYD);
                let sqyd = w * h * SQM_TO_SQYD;
                if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(sqyd, 2)}</span> ตร.หลา`;
                roomSum += price;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
                if (isRoomSuspended || wallpaper.dataset.suspended === 'true') {
                    if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`;
                    return;
                }
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                const p = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const rolls = CALC.wallpaperRolls(totalWidth, h);
                let price = Math.round(rolls * p);
                let sqm = totalWidth * h;
                if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(sqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${rolls}</span> ม้วน`;
                roomSum += price;
            });
            room.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด ${room.querySelectorAll(SELECTORS.set).length}</span> • <span class="num">ชุด ${room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}`).length}</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บาท`;
            grand += roomSum;
        });
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(SELECTORS.set).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(`${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
    }

    function buildRoomPayload(roomEl) {
        const roomName = roomEl.querySelector(SELECTORS.roomNameInput)?.value || `ห้อง ${roomEl.dataset.index}`;
        const pricePerM = clamp01(roomEl.querySelector(SELECTORS.roomPricePerM)?.value);
        const style = roomEl.querySelector(SELECTORS.roomStyle)?.value || "";
        const isSuspended = roomEl.dataset.suspended === 'true';
        
        let sets = [], decorations = [], wallpapers = [];
        roomEl.querySelectorAll(SELECTORS.set).forEach(set => {
            const isSuspended = set.dataset.suspended === 'true';
            sets.push({
                is_suspended: isSuspended,
                width_m: clamp01(set.querySelector('input[name="width_m"]')?.value),
                height_m: clamp01(set.querySelector('input[name="height_m"]')?.value),
                fabric_variant: set.querySelector('select[name="fabric_variant"]')?.value || 'ทึบ',
                open_type: set.querySelector('select[name="open_type"]')?.value || '',
                sheer_price_per_m: clamp01(set.querySelector('select[name="sheer_price_per_m"]')?.value)
            });
        });
        roomEl.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
            const isSuspended = deco.dataset.suspended === 'true';
            decorations.push({
                is_suspended: isSuspended,
                type: deco.querySelector('[name="deco_type"]')?.value || "",
                width_m: clamp01(deco.querySelector('[name="deco_width_m"]')?.value),
                height_m: clamp01(deco.querySelector('[name="deco_height_m"]')?.value),
                price_sqyd: clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value)
            });
        });
        roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
            const isSuspended = wallpaper.dataset.suspended === 'true';
            const widths = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value));
            wallpapers.push({
                is_suspended: isSuspended,
                height_m: clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value),
                price_per_roll: clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value),
                widths: widths
            });
        });

        return {
            room_name: roomName,
            price_per_m_raw: pricePerM,
            style: style,
            is_suspended: isSuspended,
            sets: sets,
            decorations: decorations,
            wallpapers: wallpapers
        };
    }

    const buildPayload = () => {
        const customerInfo = {
            customer_name: document.querySelector('input[name="customer_name"]')?.value || '',
            customer_phone: document.querySelector('input[name="customer_phone"]')?.value || '',
            customer_address: document.querySelector('input[name="customer_address"]')?.value || ''
        };
        const rooms = Array.from(document.querySelectorAll(SELECTORS.room)).map(buildRoomPayload);
        const grandTotal = toNum(document.querySelector(SELECTORS.grandTotal)?.textContent);
        const grandFabric = toNum(document.querySelector(SELECTORS.grandFabric)?.textContent);
        const grandSheerFabric = toNum(document.querySelector(SELECTORS.grandSheerFabric)?.textContent);
        const grandOpaqueTrack = toNum(document.querySelector(SELECTORS.grandOpaqueTrack)?.textContent);
        const grandSheerTrack = toNum(document.querySelector(SELECTORS.grandSheerTrack)?.textContent);

        return {
            version: APP_VERSION,
            date: new Date().toISOString(),
            customer_info: customerInfo,
            rooms: rooms,
            grand_total_price: grandTotal,
            grand_total_fabric_opaque_yard: grandFabric,
            grand_total_fabric_sheer_yard: grandSheerFabric,
            grand_total_track_opaque_m: grandOpaqueTrack,
            grand_total_track_sheer_m: grandSheerTrack
        };
    };

    const copyText = (options) => {
        const payload = buildPayload();
        let textOutput = '';
        if (options.customer) {
            textOutput += `ลูกค้า: ${payload.customer_info.customer_name}\n`;
            textOutput += `โทร: ${payload.customer_info.customer_phone}\n`;
            textOutput += `ที่อยู่: ${payload.customer_info.customer_address}\n\n`;
        }
        if (options.details) {
            payload.rooms.forEach((room, roomIndex) => {
                textOutput += `--- ห้อง ${room.room_name} ---\n`;
                textOutput += `• ราคาผ้าต่อเมตร: ${fmt(room.price_per_m_raw, 0, true)} บ. / สไตล์: ${room.style}\n`;
                room.sets.forEach((set, setIndex) => {
                    const status = set.is_suspended ? ' (ระงับ)' : '';
                    textOutput += `  - จุดที่ ${setIndex + 1}: กว้าง ${fmt(set.width_m)} ม. x สูง ${fmt(set.height_m)} ม. (${set.fabric_variant})${status}\n`;
                });
                room.decorations.forEach((deco, decoIndex) => {
                    const status = deco.is_suspended ? ' (ระงับ)' : '';
                    textOutput += `  - ตกแต่ง ${deco.type || (decoIndex + 1)}: กว้าง ${fmt(deco.width_m)} ม. x สูง ${fmt(deco.height_m)} ม.${status}\n`;
                });
                room.wallpapers.forEach((wallpaper, wallpaperIndex) => {
                    const status = wallpaper.is_suspended ? ' (ระงับ)' : '';
                    const widths = wallpaper.widths.map(w => `${fmt(w)} ม.`).join(', ');
                    textOutput += `  - วอลเปเปอร์ ${wallpaperIndex + 1}: สูง ${fmt(wallpaper.height_m)} ม. x กว้าง [${widths}]${status}\n`;
                });
                textOutput += `  ราคาห้องนี้: ${fmt(room.room_total_price, 0, true)} บาท\n`;
            });
            textOutput += `\n`;
        }
        if (options.summary) {
            textOutput += `--- สรุปยอดรวม ---\n`;
            textOutput += `ราคารวม: ${fmt(payload.grand_total_price, 0, true)} บาท\n`;
            textOutput += `ผ้าทึบที่ใช้: ${fmt(payload.grand_total_fabric_opaque_yard, 2)} หลา\n`;
            textOutput += `ผ้าโปร่งที่ใช้: ${fmt(payload.grand_total_fabric_sheer_yard, 2)} หลา\n`;
            textOutput += `รางทึบที่ใช้: ${fmt(payload.grand_total_track_opaque_m, 2)} ม.\n`;
            textOutput += `รางโปร่งที่ใช้: ${fmt(payload.grand_total_track_sheer_m, 2)} ม.\n`;
        }
        if (navigator.clipboard) {
            navigator.clipboard.writeText(textOutput)
                .then(() => showToast('คัดลอกข้อความแล้ว', 'success'))
                .catch(err => { console.error('Failed to copy text: ', err); showToast('คัดลอกข้อความไม่สำเร็จ', 'error'); });
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = textOutput;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('คัดลอกข้อความแล้ว (วิธี Fallback)', 'success');
        }
    };

    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        if (lockBtn) {
            const lockText = lockBtn.querySelector('.lock-text');
            const lockIcon = lockBtn.querySelector('.lock-icon');
            if (isLocked) {
                lockText.textContent = "ปลดล็อค";
                lockIcon.textContent = "🔓";
                lockBtn.classList.add('outline');
            } else {
                lockText.textContent = "ล็อค";
                lockIcon.textContent = "🔒";
                lockBtn.classList.remove('outline');
            }
        }
        document.querySelectorAll('input, select, button').forEach(el => {
            if (el.id !== 'lockBtn' && el.id !== 'addRoomHeaderBtn' && el.id !== 'clearAllBtn' && el.id !== 'menuBtn' && el.closest('.modal-overlay') === null) {
                el.disabled = isLocked;
            }
        });
    }

    function loadPayload(payload) {
        document.querySelector('input[name="customer_name"]').value = payload.customer_info.customer_name || '';
        document.querySelector('input[name="customer_phone"]').value = payload.customer_info.customer_phone || '';
        document.querySelector('input[name="customer_address"]').value = payload.customer_info.customer_address || '';
        roomsEl.innerHTML = '';
        roomCount = 0;
        (payload.rooms || []).forEach(addRoom);
        recalcAll();
        updateLockState();
    }
    
    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    document.addEventListener('click', (e) => {
        const target = e.target;
        const roomMenuBtn = target.closest('.room-menu-btn');
        if (roomMenuBtn) {
            const dropdown = roomMenuBtn.nextElementSibling;
            document.querySelectorAll('.room-menu-dropdown.show').forEach(d => {
                if (d !== dropdown) d.classList.remove('show');
            });
            if (dropdown) dropdown.classList.toggle('show');
        } else {
            document.querySelectorAll('.room-menu-dropdown.show').forEach(d => d.classList.remove('show'));
        }

        const roomEl = target.closest(SELECTORS.room);
        if (target.dataset.act === 'del-room' && roomEl) delRoom(target);
        else if (target.dataset.act === 'clear-room' && roomEl) clearRoom(roomEl);
        else if (target.dataset.act === 'suspend-room' && roomEl) toggleSuspendRoom(roomEl);
        else if (target.dataset.act === 'add-set' && roomEl) addSet(roomEl);
        else if (target.dataset.act === 'del-set') delSet(target);
        else if (target.dataset.act === 'clear-set') clearSet(target);
        else if (target.dataset.act === 'toggle-suspend') toggleSuspend(target);
        else if (target.dataset.act === 'add-deco' && roomEl) addDeco(roomEl);
        else if (target.dataset.act === 'del-deco') delDeco(target);
        else if (target.dataset.act === 'clear-deco') clearDeco(target);
        else if (target.dataset.act === 'add-wallpaper' && roomEl) addWallpaper(roomEl);
        else if (target.dataset.act === 'del-wallpaper') delWallpaper(target);
        else if (target.dataset.act === 'clear-wallpaper') clearWallpaper(target);
        else if (target.dataset.act === 'add-wall') addWall(target);
        else if (target.dataset.act === 'del-wall') delWall(target);
    });

    document.addEventListener('input', debounce(recalcAll));
    document.addEventListener('input', debounce(saveData));
    
    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        updateLockState();
        showToast(`หน้าจอถูก${isLocked ? 'ล็อค' : 'ปลดล็อค'}แล้ว`, 'info');
    });
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        if (navigator.clipboard) {
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                .then(() => showToast('คัดลอก JSON แล้ว', 'success'))
                .catch(err => { console.error('Failed to copy JSON: ', err); showToast('คัดลอก JSON ไม่สำเร็จ', 'error'); });
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = JSON.stringify(payload, null, 2);
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('คัดลอก JSON แล้ว (วิธี Fallback)', 'success');
        }
    });
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) copyText(options);
    });
    
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        const modal = document.querySelector(SELECTORS.importModal);
        if (modal) modal.classList.add('visible');
    });
    
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        const modal = document.querySelector(SELECTORS.importModal);
        if (modal) modal.classList.remove('visible');
    });
    
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const area = document.querySelector(SELECTORS.importJsonArea);
        if (!area) return;
        try {
            const payload = JSON.parse(area.value);
            loadPayload(payload);
            saveData();
            showToast('นำเข้าข้อมูลสำเร็จแล้ว', 'success');
            const modal = document.querySelector(SELECTORS.importModal);
            if (modal) modal.classList.remove('visible');
            area.value = '';
        } catch(err) {
            console.error("Import failed:", err);
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
        }
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        if (menuDropdown) menuDropdown.classList.toggle('show');
    });

    window.addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const menuBtn = document.querySelector(SELECTORS.menuBtn);
        if (menuDropdown && menuBtn && !menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
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