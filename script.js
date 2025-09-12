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
        // สูตรการคำนวณจำนวนม้วนสำหรับวอลเปเปอร์
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
            created.querySelector('[name="wallpaper_type"]').value = prefill.type || "";
            created.querySelector('[name="wallpaper_sqyd_price"]').value = prefill.sqyd_price ?? "";
            created.querySelector('[name="wallpaper_width_m"]').value = prefill.width_m ?? "";
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m ?? "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
            }
        }
        
        renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มรายการวอลเปเปอร์แล้ว', 'success');
    }

    function addWall(btn, prefillWidth) {
        // This function is no longer needed in the new wallpaper logic
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
    async function clearWallpaper(btn) { 
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return;
        const item = btn.closest(SELECTORS.wallpaperItem);
        if (!item) return;
        item.querySelectorAll('input').forEach(el => el.value = '');
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success');
    }
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }
    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            const totalItems = items.length;
            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}/${totalItems}` : `${iIdx + 1}`;
            });
        });
    }
    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const style = room.querySelector(SELECTORS.roomStyle)?.value;
            const sPlus = stylePlus(style);
            
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') {
                    set.querySelector('[data-set-summary] .price:first-of-type')?.textContent = '0';
                    set.querySelector('[data-set-summary] .price:nth-of-type(2)')?.textContent = '0';
                    set.querySelector('[data-set-total]').textContent = '0';
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
                const total = opaquePrice + sheerPrice;
                roomSum += total;
                set.querySelector('[data-opaque-price-label] .price').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-sheer-price-label] .price').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-opaque-yardage-label] .price').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-sheer-yardage-label] .price').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-opaque-track-label] .price').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-sheer-track-label] .price').textContent = fmt(sheerTrack, 2);
                set.querySelector('[data-set-total]').textContent = fmt(total, 0, true);
                set.querySelector('[data-set-track-total]').textContent = fmt(opaqueTrack + sheerTrack, 2);

                grandOpaqueYards += opaqueYards; grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack; grandSheerTrack += sheerTrack;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                if (deco.dataset.suspended === 'true') {
                    deco.querySelector('input[name="deco_price_total"]').value = '0';
                    deco.querySelector('[data-deco-summary] .price:first-of-type').textContent = '0.00';
                    deco.querySelector('[data-deco-summary] .price:nth-of-type(2)').textContent = '0.00';
                    return;
                }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const priceSqYd = toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                const areaSqm = w * h;
                const areaSqYd = areaSqm * SQM_TO_SQYD;
                const price = Math.round(areaSqYd * priceSqYd);
                roomSum += price;
                deco.querySelector('input[name="deco_price_total"]').value = fmt(price, 0, true);
                deco.querySelector('[data-deco-summary] .price:first-of-type').textContent = fmt(areaSqm, 2);
                deco.querySelector('[data-deco-summary] .price:nth-of-type(2)').textContent = fmt(areaSqYd, 2);
            });
            // การคำนวณวอลเปเปอร์ใหม่
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper) => {
                if (wallpaper.dataset.suspended === 'true') {
                    wallpaper.querySelector('[data-wallpaper-summary] .price:first-of-type').textContent = '0';
                    wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = '0.00';
                    wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = '0';
                    return;
                }
                const w = clamp01(wallpaper.querySelector('[name="wallpaper_width_m"]')?.value);
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                const priceSqYd = toNum(wallpaper.querySelector('[name="wallpaper_sqyd_price"]')?.value);

                const areaSqm = w * h;
                const areaSqYd = areaSqm * SQM_TO_SQYD;
                const price = Math.round(areaSqYd * priceSqYd);
                const rollsNeeded = CALC.wallpaperRolls(w, h);

                roomSum += price;
                wallpaper.querySelector('[data-wallpaper-summary] .price:first-of-type').textContent = fmt(price, 0, true);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(areaSqm, 2);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = fmt(rollsNeeded, 0, true);
            });
            room.querySelector('[data-room-total]').textContent = fmt(roomSum, 0, true);
            grand += roomSum;
        });
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(SELECTORS.set).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(`${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2);
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2);
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2);
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2);
    }
    
    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            customer: {
                name: document.querySelector('input[name="customer_name"]')?.value || null,
                phone: document.querySelector('input[name="customer_phone"]')?.value || null,
                address: document.querySelector('input[name="customer_address"]')?.value || null,
            },
            summary: {
                grandTotal: toNum(document.querySelector(SELECTORS.grandTotal)?.textContent)
            },
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput)?.value || null,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM)?.value) || null,
                style: room.querySelector(SELECTORS.roomStyle)?.value || null,
                total: toNum(room.querySelector('[data-room-total]').textContent),
                sets: [],
                decorations: [],
                wallpapers: []
            };
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                roomData.sets.push({
                    width_m: toNum(set.querySelector('input[name="width_m"]').value),
                    height_m: toNum(set.querySelector('input[name="height_m"]').value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                    open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]').value),
                    is_suspended: set.dataset.suspended === 'true',
                });
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                roomData.decorations.push({
                    type: deco.querySelector('input[name="deco_type"]').value,
                    width_m: toNum(deco.querySelector('input[name="deco_width_m"]').value),
                    height_m: toNum(deco.querySelector('input[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('input[name="deco_price_sqyd"]').value),
                    is_suspended: deco.dataset.suspended === 'true',
                });
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                roomData.wallpapers.push({
                    type: wallpaper.querySelector('input[name="wallpaper_type"]').value,
                    sqyd_price: toNum(wallpaper.querySelector('input[name="wallpaper_sqyd_price"]').value),
                    width_m: toNum(wallpaper.querySelector('input[name="wallpaper_width_m"]').value),
                    height_m: toNum(wallpaper.querySelector('input[name="wallpaper_height_m"]').value),
                    is_suspended: wallpaper.dataset.suspended === 'true',
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function loadPayload(payload) {
        if (!payload) return;
        document.querySelectorAll(SELECTORS.room).forEach(r => r.remove());
        if (payload.customer) {
            document.querySelector('input[name="customer_name"]').value = payload.customer.name || "";
            document.querySelector('input[name="customer_phone"]').value = payload.customer.phone || "";
            document.querySelector('input[name="customer_address"]').value = payload.customer.address || "";
        }
        if (payload.rooms && payload.rooms.length > 0) {
            payload.rooms.forEach(r => addRoom(r));
        } else {
            addRoom();
        }
        updateLockState();
        recalcAll();
    }
    
    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('คัดลอกข้อมูลแล้ว', 'success');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToast('คัดลอกข้อมูลไม่สำเร็จ', 'error');
        });
    }

    function generateTextSummary(options) {
        const payload = buildPayload();
        let text = "";
        
        if (options.customer) {
            text += `ข้อมูลลูกค้า:\nชื่อ: ${payload.customer.name}\nโทร: ${payload.customer.phone}\nที่อยู่: ${payload.customer.address}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach(room => {
                if (room.sets.length > 0 || room.decorations.length > 0 || room.wallpapers.length > 0) {
                    text += `ห้อง: ${room.room_name}\n`;
                }
                
                room.sets.forEach((set, i) => {
                    text += `  - จุดผ้าม่าน ${i + 1}: กว้าง ${set.width_m}ม. x สูง ${set.height_m}ม. (${set.fabric_variant} / ${set.open_type})\n`;
                });
                room.decorations.forEach((deco, i) => {
                    text += `  - รายการตกแต่ง ${i + 1}: ${deco.type} กว้าง ${deco.width_m}ม. x สูง ${deco.height_m}ม. (${deco.price_sqyd} บ./ตร.หลา)\n`;
                });
                room.wallpapers.forEach((wallpaper, i) => {
                    text += `  - วอลเปเปอร์ ${i + 1}: ${wallpaper.type} กว้าง ${wallpaper.width_m}ม. x สูง ${wallpaper.height_m}ม. (${wallpaper.sqyd_price} บ./ตร.หลา)\n`;
                });
                
                if (room.sets.length > 0 || room.decorations.length > 0 || room.wallpapers.length > 0) {
                    text += `  รวมราคาในห้อง: ${fmt(room.total, 0, true)} บ.\n\n`;
                }
            });
        }

        if (options.summary) {
            text += `\nสรุปยอดรวม:\n`;
            text += `  ราคารวม: ${fmt(payload.summary.grandTotal, 0, true)} บ.\n`;
            text += `  จำนวนจุด: ${document.querySelector(SELECTORS.setCount).textContent} จุด\n`;
            text += `  ผ้าม่าน (ชุด): ${document.querySelector(SELECTORS.setCountSets).textContent} ชุด\n`;
            text += `  ตกแต่งเพิ่ม (ชุด): ${document.querySelector(SELECTORS.setCountDeco).textContent} ชุด\n`;
        }

        return text;
    }

    function updateLockState() {
        const lockIcon = document.querySelector('.lock-icon');
        const lockText = document.querySelector('.lock-text');
        if (!lockIcon || !lockText) return;
        if (isLocked) {
            lockIcon.textContent = '🔒';
            lockText.textContent = 'ล็อค';
        } else {
            lockIcon.textContent = '🔓';
            lockText.textContent = 'ปลดล็อค';
        }
    }

    // --- Event Listeners ---
    document.addEventListener('input', debounce(e => {
        const target = e.target;
        if (target.matches('input, select')) {
            recalcAll();
            saveData();
            if (target.name === "fabric_variant") {
                toggleSetFabricUI(target.closest(SELECTORS.set));
            }
        }
    }));
    document.addEventListener('click', async e => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const action = btn.dataset.act;
        const item = btn.closest('.room, .set, .deco-item, .wallpaper-item, .wall-input-row');
        const roomEl = btn.closest(SELECTORS.room);
        if (isLocked && !['lock-toggle'].includes(action)) {
            showToast('ถูกล็อคอยู่', 'warning'); return;
        }

        switch(action) {
            case 'add-room': addRoom(); break;
            case 'del-room': delRoom(btn); break;
            case 'add-set': addSet(roomEl); break;
            case 'del-set': delSet(btn); break;
            case 'add-deco': addDeco(roomEl); break;
            case 'del-deco': delDeco(btn); break;
            case 'add-wallpaper': addWallpaper(roomEl); break;
            case 'del-wallpaper': delWallpaper(btn); break;
            case 'add-wall': addWall(btn); break; // No longer needed
            case 'del-wall': delWall(btn); break;
            case 'clear-set': clearSet(btn); break;
            case 'clear-deco': clearDeco(btn); break;
            case 'clear-wallpaper': clearWallpaper(btn); break;
            case 'toggle-suspend': toggleSuspend(btn); break;
            case 'lock-toggle': isLocked = !isLocked; updateLockState(); showToast(isLocked ? 'ล็อคข้อมูลแล้ว' : 'ปลดล็อคข้อมูลแล้ว', 'info'); break;
            case 'clear-all': clearAllData(); break;
            case 'copy-json': copyToClipboard(JSON.stringify(buildPayload(), null, 2)); break;
            case 'copy-text': {
                const options = await showCopyOptionsModal();
                if (options) {
                    const text = generateTextSummary(options);
                    copyToClipboard(text);
                }
                break;
            }
            case 'submit': {
                const payload = buildPayload();
                const payloadInput = document.querySelector(SELECTORS.payloadInput);
                if (payloadInput) payloadInput.value = JSON.stringify(payload);
                break;
            }
            case 'import-data': {
                const modal = document.querySelector(SELECTORS.importModal);
                if (modal) {
                    modal.classList.add('visible');
                    const area = modal.querySelector(SELECTORS.importJsonArea);
                    if (area) area.value = "";
                }
                break;
            }
            case 'export-data': {
                const payload = buildPayload();
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", `marnthara_data_${new Date().toISOString().slice(0, 10)}.json`);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
                showToast('ข้อมูลถูกส่งออกแล้ว', 'success');
                break;
            }
        }
    });

    document.querySelector(SELECTORS.importConfirm)?.addEventListener('click', () => {
        const area = document.querySelector(SELECTORS.importJsonArea);
        if (area?.value) {
            try {
                const payload = JSON.parse(area.value);
                loadPayload(payload);
                showToast('นำเข้าข้อมูลสำเร็จ', 'success');
            } catch (err) {
                showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
                console.error("Import failed:", err);
            } finally {
                document.querySelector(SELECTORS.importModal)?.classList.remove('visible');
            }
        }
    });
    
    document.querySelector(SELECTORS.importCancel)?.addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal)?.classList.remove('visible');
    });

    // Menu dropdown functionality
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