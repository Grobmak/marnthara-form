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
    
    function formatPriceInput(event) {
        let input = event.target;
        let value = input.value.replace(/,/g, '');
        if (value === '' || isNaN(value)) {
            input.value = '';
            return;
        }
        let number = parseFloat(value);
        input.value = fmt(number, 0, true);
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
        
        const priceInput = created.querySelector('[name="deco_price_sqyd"]');
        if(priceInput) {
            priceInput.addEventListener('input', formatPriceInput);
        }

        if (prefill) {
            created.querySelector('[name="deco_type"]').value = prefill.type || "";
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m ?? "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmt(prefill.price_sqyd, 0, true);
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
        
        const priceInput = created.querySelector('[name="wallpaper_price_roll"]');
        if(priceInput) {
            priceInput.addEventListener('input', formatPriceInput);
        }

        if (prefill) {
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="wallpaper_price_roll"]').value = fmt(prefill.price_per_roll, 0, true);
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
        if (prefillWidth !== undefined) {
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
    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;

        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const style = room.querySelector(SELECTORS.roomStyle)?.value;
            const sPlus = stylePlus(style);

            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') { /* ... clear UI ... */ return; }
                const w = clamp01(set.querySelector('input[name="width_m"]')?.value), h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]')?.value;

                let opaquePrice = 0, sheerPrice = 0, setTotal = 0;
                let opaqueYards = 0, sheerYards = 0;
                let opaqueTrack = 0, sheerTrack = 0;

                if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                    opaqueYards = CALC.fabricYardage(style, w);
                    const basePrice = (baseRaw + sPlus + hPlus);
                    opaquePrice = opaqueYards * 0.9 * basePrice;
                    opaqueTrack = w;
                }
                if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                    sheerYards = CALC.fabricYardage("ตาไก่", w);
                    const sheerPricePerM = toNum(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                    sheerPrice = sheerYards * 0.9 * sheerPricePerM;
                    sheerTrack = w;
                }
                
                setTotal = opaquePrice + sheerPrice;
                roomSum += setTotal;
                grand += setTotal;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;

                set.querySelector('[data-set-opaque-price]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-set-sheer-price]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-set-total-price]').textContent = fmt(setTotal, 0, true);
                set.querySelector('[data-set-opaque-yardage]').textContent = fmt(opaqueYards);
                set.querySelector('[data-set-sheer-yardage]').textContent = fmt(sheerYards);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack);
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(item => {
                if (item.dataset.suspended === 'true') { /* ... clear UI ... */ return; }
                const w = clamp01(item.querySelector('[name="deco_width_m"]')?.value);
                const h = clamp01(item.querySelector('[name="deco_height_m"]')?.value);
                const priceSqYd = toNum(item.querySelector('[name="deco_price_sqyd"]')?.value);
                
                const sqM = w * h;
                const sqYd = sqM * SQM_TO_SQYD;
                const price = sqYd * priceSqYd;
                roomSum += price;
                grand += price;

                item.querySelector('[data-deco-summary] .price').textContent = fmt(price, 0, true);
                item.querySelector('[data-deco-summary] .price:last-of-type').textContent = fmt(sqYd);
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                if (item.dataset.suspended === 'true') { /* ... clear UI ... */ return; }
                const h = clamp01(item.querySelector('[name="wallpaper_height_m"]')?.value);
                const pricePerRoll = toNum(item.querySelector('[name="wallpaper_price_roll"]')?.value);
                
                let totalWidth = 0;
                item.querySelectorAll('[name="wall_width_m"]').forEach(input => {
                    totalWidth += clamp01(input.value);
                });
                
                const totalRolls = CALC.wallpaperRolls(totalWidth, h);
                const price = totalRolls * pricePerRoll;
                const sqm = totalWidth * h;
                
                roomSum += price;
                grand += price;
                
                item.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = fmt(price, 0, true);
                item.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(sqm);
                item.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = fmt(totalRolls, 0);
            });

            const roomTotalEl = room.querySelector('[data-room-total]');
            if (roomTotalEl) roomTotalEl.textContent = fmt(roomSum, 0, true);
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards) + ' หลา';
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards) + ' หลา';
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack) + ' ม.';
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack) + ' ม.';

        updateSetCounts(); saveData();
    }

    function updateSetCounts() {
        const rooms = document.querySelectorAll(SELECTORS.room);
        let totalSets = 0;
        let totalDeco = 0;

        rooms.forEach(room => {
            totalSets += room.querySelectorAll(SELECTORS.set).length;
            totalDeco += room.querySelectorAll(SELECTORS.decoItem).length;
        });

        document.querySelector(SELECTORS.setCount).textContent = rooms.length > 0 ? document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length : 0;
        document.querySelector(SELECTORS.setCountSets).textContent = totalSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = totalDeco;
    }

    function buildPayload() {
        const customerInfo = {};
        document.querySelectorAll('#customerInfo input').forEach(input => {
            customerInfo[input.name] = input.value;
        });

        const rooms = [];
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {};
            roomData.room_name = roomEl.querySelector(SELECTORS.roomNameInput).value;
            roomData.price_per_m_raw = toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value);
            roomData.style = roomEl.querySelector(SELECTORS.roomStyle).value;

            roomData.sets = [...roomEl.querySelectorAll(SELECTORS.set)].map(setEl => ({
                width_m: toNum(setEl.querySelector('input[name="width_m"]').value),
                height_m: toNum(setEl.querySelector('input[name="height_m"]').value),
                fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                open_type: setEl.querySelector('select[name="open_type"]').value,
                sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                is_suspended: setEl.dataset.suspended === 'true',
            }));

            roomData.decorations = [...roomEl.querySelectorAll(SELECTORS.decoItem)].map(decoEl => ({
                type: decoEl.querySelector('[name="deco_type"]').value,
                width_m: toNum(decoEl.querySelector('[name="deco_width_m"]').value),
                height_m: toNum(decoEl.querySelector('[name="deco_height_m"]').value),
                price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                is_suspended: decoEl.dataset.suspended === 'true',
            }));
            
            roomData.wallpapers = [...roomEl.querySelectorAll(SELECTORS.wallpaperItem)].map(wallpaperEl => ({
                height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                widths: [...wallpaperEl.querySelectorAll('[name="wall_width_m"]')].map(input => toNum(input.value)),
                is_suspended: wallpaperEl.dataset.suspended === 'true',
            }));

            rooms.push(roomData);
        });
        
        const summary = {
            grand_total: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            grand_opaque_yards: toNum(document.querySelector(SELECTORS.grandFabric).textContent),
            grand_sheer_yards: toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent),
            grand_opaque_track: toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent),
            grand_sheer_track: toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent),
            set_count: toNum(document.querySelector(SELECTORS.setCount).textContent),
        };

        return {
            version: APP_VERSION,
            customer_info: customerInfo,
            rooms: rooms,
            summary: summary,
        };
    }

    function loadPayload(payload) {
        if (!payload) return;
        document.querySelectorAll('#customerInfo input').forEach(input => {
            input.value = payload.customer_info?.[input.name] ?? '';
        });
        
        roomsEl.innerHTML = "";
        roomCount = 0;
        (payload.rooms || []).forEach(r => addRoom(r));
        if (payload.rooms.length === 0) addRoom();

        recalcAll();
        showToast('โหลดข้อมูลสำเร็จ', 'success');
    }

    function saveData() {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.error("Failed to save data to localStorage:", e);
        }
    }

    function updateLockState() {
        const items = document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
        isLocked = items.length >= 25;
        document.querySelector(SELECTORS.lockBtn).classList.toggle('is-locked', isLocked);
        document.querySelector(SELECTORS.addRoomHeaderBtn).disabled = isLocked;
        document.querySelector(SELECTORS.lockBtn).querySelector('.lock-text').textContent = isLocked ? 'ล็อค' : 'ปลดล็อค';
    }
    
    function copyTextToClipboard(text) {
        if (!navigator.clipboard) {
            const dummy = document.createElement('textarea');
            document.body.appendChild(dummy);
            dummy.value = text;
            dummy.select();
            document.execCommand('copy');
            document.body.removeChild(dummy);
            showToast('คัดลอกแล้ว (Legacy)', 'success');
            return;
        }
        navigator.clipboard.writeText(text).then(function() {
            showToast('คัดลอกแล้ว', 'success');
        }, function(err) {
            console.error('Async: Could not copy text: ', err);
            showToast('คัดลอกไม่สำเร็จ', 'error');
        });
    }

    function generatePlainText(options) {
        let text = "";
        const payload = buildPayload();

        if (options.customer) {
            text += "--- ข้อมูลลูกค้า ---\n";
            for (const [key, value] of Object.entries(payload.customer_info)) {
                text += `${key.replace('customer_', '')}: ${value}\n`;
            }
            text += "\n";
        }
        
        if (options.details) {
            text += "--- รายละเอียดห้องและจุด ---\n\n";
            payload.rooms.forEach(room => {
                text += `ห้อง: ${room.room_name}\n`;
                text += `  - ราคาผ้า: ${fmt(room.price_per_m_raw, 0, true)} บาท/ม. Style: ${room.style}\n`;
                room.sets.forEach(set => {
                    const status = set.is_suspended ? ' [ระงับ]' : '';
                    text += `  - จุดผ้าม่าน: W${fmt(set.width_m)} x H${fmt(set.height_m)} ม. - ${set.fabric_variant}${status}\n`;
                    if (set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m) {
                        text += `    - ราคาผ้าโปร่ง: ${fmt(set.sheer_price_per_m, 0, true)} บาท/ม.\n`;
                    }
                    if (set.open_type) {
                        text += `    - รูปแบบเปิด: ${set.open_type}\n`;
                    }
                });
                room.decorations.forEach(deco => {
                    const status = deco.is_suspended ? ' [ระงับ]' : '';
                    text += `  - รายการตกแต่ง: ${deco.type} - W${fmt(deco.width_m)} x H${fmt(deco.height_m)} ม. - ราคา ${fmt(deco.price_sqyd, 0, true)} บาท/หลา${status}\n`;
                });
                room.wallpapers.forEach(wallpaper => {
                    const status = wallpaper.is_suspended ? ' [ระงับ]' : '';
                    text += `  - วอลเปเปอร์: H${fmt(wallpaper.height_m)} ม. - ราคา ${fmt(wallpaper.price_per_roll, 0, true)} บาท/ม้วน${status}\n`;
                    text += `    - ความกว้างผนังรวม: ${wallpaper.widths.map(w => fmt(w)).join(', ')}\n`;
                });
                text += `  - ยอดรวมในห้อง: ${fmt(payload.rooms.find(r => r.room_name === room.room_name)?.summary?.room_total ?? 0, 0, true)} บาท\n`;
            });
            text += "\n";
        }

        if (options.summary) {
            text += "--- สรุปยอดรวม ---\n";
            text += `ราคารวม: ${fmt(payload.summary.grand_total, 0, true)} บาท\n`;
            text += `ผ้าทึบที่ใช้: ${fmt(payload.summary.grand_opaque_yards)} หลา\n`;
            text += `ผ้าโปร่งที่ใช้: ${fmt(payload.summary.grand_sheer_yards)} หลา\n`;
            text += `รางทึบที่ใช้: ${fmt(payload.summary.grand_opaque_track)} ม.\n`;
            text += `รางโปร่งที่ใช้: ${fmt(payload.summary.grand_sheer_track)} ม.\n`;
            text += `จำนวนจุด: ${payload.summary.set_count} จุด\n`;
        }
        
        return text;
    }

    // Event Listeners
    roomsEl.addEventListener('input', debounce(e => {
        const target = e.target;
        if (target.matches('input[type="number"], select')) {
            recalcAll();
        }
    }));
    roomsEl.addEventListener('click', async e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.act;
        const roomEl = btn.closest(SELECTORS.room);
        
        if (!roomEl && action !== 'add-room') return;

        switch (action) {
            case 'del-room': await delRoom(btn); break;
            case 'add-set': addSet(roomEl); break;
            case 'del-set': await delSet(btn); break;
            case 'clear-set': await clearSet(btn); break;
            case 'add-deco': addDeco(roomEl); break;
            case 'del-deco': await delDeco(btn); break;
            case 'clear-deco': await clearDeco(btn); break;
            case 'add-wallpaper': addWallpaper(roomEl); break;
            case 'del-wallpaper': await delWallpaper(btn); break;
            case 'clear-wallpaper': await clearWallpaper(btn); break;
            case 'add-wall': addWall(btn); break;
            case 'del-wall': delWall(btn); break;
            case 'toggle-suspend': toggleSuspend(btn); break;
        }
    });

    roomsEl.addEventListener('change', e => {
        const target = e.target;
        if (target.matches('[name="fabric_variant"]')) {
            toggleSetFabricUI(target.closest(SELECTORS.set));
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', () => clearAllData());
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        copyTextToClipboard(JSON.stringify(buildPayload(), null, 2));
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const text = generatePlainText(options);
            copyTextToClipboard(text);
        }
    });
    
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ล็อคหน้าจอแล้ว' : 'ปลดล็อคหน้าจอแล้ว', isLocked ? 'warning' : 'success');
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
        if (area) {
            try {
                const data = JSON.parse(area.value);
                loadPayload(data);
                const modal = document.querySelector(SELECTORS.importModal);
                if (modal) modal.classList.remove('visible');
            } catch (err) {
                showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
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
    });

    // Handle menu dropdown click and close
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