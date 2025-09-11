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
                if (deco.dataset.suspended === 'true') {
                    if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม.`;
                    return;
                }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const pricePerSqyd = toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                const sqm = w * h;
                const sqyd = sqm * SQM_TO_SQYD;
                const price = Math.round(sqyd * pricePerSqyd);

                roomSum += price;
                if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(sqm, 2)}</span> ตร.ม.`;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
                if (wallpaper.dataset.suspended === 'true') {
                    if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`;
                    return;
                }
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                const sqm = totalWidth * h;
                const price = Math.round(rollsNeeded * pricePerRoll);

                roomSum += price;
                if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(sqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${fmt(rollsNeeded, 0)}</span> ม้วน`;
            });

            room.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด ${room.querySelectorAll(`${SELECTORS.set}:not([data-suspended='true']), ${SELECTORS.decoItem}:not([data-suspended='true']), ${SELECTORS.wallpaperItem}:not([data-suspended='true'])`).length}</span> • <span class="num">ชุด ${room.querySelectorAll(`${SELECTORS.set}:not([data-suspended='true'])`).length}</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บาท`;
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended='true']), ${SELECTORS.decoItem}:not([data-suspended='true']), ${SELECTORS.wallpaperItem}:not([data-suspended='true'])`).length;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended='true'])`).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended='true']), ${SELECTORS.wallpaperItem}:not([data-suspended='true'])`).length;

        saveData();
    }
    
    function buildPayload() {
        const payload = {
            metadata: { version: APP_VERSION, timestamp: new Date().toISOString() },
            customer: {
                name: document.querySelector('input[name="customer_name"]')?.value || "",
                phone: document.querySelector('input[name="customer_phone"]')?.value || "",
                address: document.querySelector('input[name="customer_address"]')?.value || ""
            },
            summary: {
                grand_total: toNum(document.querySelector(SELECTORS.grandTotal)?.textContent?.replace(/,/g, '')),
                set_count: toNum(document.querySelector(SELECTORS.setCount)?.textContent?.replace(/,/g, '')),
                set_count_sets: toNum(document.querySelector(SELECTORS.setCountSets)?.textContent?.replace(/,/g, '')),
                set_count_deco: toNum(document.querySelector(SELECTORS.setCountDeco)?.textContent?.replace(/,/g, '')),
                grand_fabric_yards: toNum(document.querySelector(SELECTORS.grandFabric)?.textContent?.replace(/,/g, '')),
                grand_sheer_fabric_yards: toNum(document.querySelector(SELECTORS.grandSheerFabric)?.textContent?.replace(/,/g, '')),
                grand_opaque_track: toNum(document.querySelector(SELECTORS.grandOpaqueTrack)?.textContent?.replace(/,/g, '')),
                grand_sheer_track: toNum(document.querySelector(SELECTORS.grandSheerTrack)?.textContent?.replace(/,/g, '')),
            },
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput)?.value || room.querySelector(SELECTORS.roomNameInput)?.placeholder || "",
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM)?.value),
                style: room.querySelector(SELECTORS.roomStyle)?.value || "",
                total_price: toNum(room.querySelector('[data-room-brief] .price')?.textContent?.replace(/,/g, '')),
                is_suspended: room.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: []
            };
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                roomData.sets.push({
                    is_suspended: set.dataset.suspended === 'true',
                    width_m: clamp01(set.querySelector('input[name="width_m"]')?.value),
                    height_m: clamp01(set.querySelector('input[name="height_m"]')?.value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]')?.value || "",
                    open_type: set.querySelector('select[name="open_type"]')?.value || "",
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]')?.value),
                    price: toNum(set.querySelector('[data-set-price-total]')?.textContent?.replace(/,/g, '')),
                    opaque_yards: toNum(set.querySelector('[data-set-yardage-opaque]')?.textContent?.replace(/,/g, '')),
                    sheer_yards: toNum(set.querySelector('[data-set-yardage-sheer]')?.textContent?.replace(/,/g, '')),
                    opaque_track: toNum(set.querySelector('[data-set-opaque-track]')?.textContent?.replace(/,/g, '')),
                    sheer_track: toNum(set.querySelector('[data-set-sheer-track]')?.textContent?.replace(/,/g, '')),
                });
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const sqm = clamp01(deco.querySelector('[name="deco_width_m"]')?.value) * clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const price_sqyd_raw = toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                roomData.decorations.push({
                    is_suspended: deco.dataset.suspended === 'true',
                    type: deco.querySelector('[name="deco_type"]')?.value || "",
                    width_m: clamp01(deco.querySelector('[name="deco_width_m"]')?.value),
                    height_m: clamp01(deco.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: price_sqyd_raw,
                    price: toNum(deco.querySelector('[data-deco-summary] .price')?.textContent?.replace(/,/g, '')),
                    sqm: sqm,
                });
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const totalWidth = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value));
                roomData.wallpapers.push({
                    is_suspended: wallpaper.dataset.suspended === 'true',
                    height_m: clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value),
                    price: toNum(wallpaper.querySelector('[data-wallpaper-summary] .price')?.textContent?.replace(/,/g, '')),
                    widths: Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value)),
                    sqm: totalWidth * clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value),
                    rolls: rollsNeeded,
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function loadPayload(payload) {
        if (!payload || !payload.rooms || !Array.isArray(payload.rooms)) {
            console.error("Invalid payload format.");
            return;
        }

        roomsEl.innerHTML = "";
        roomCount = 0;
        
        const customer = payload.customer || {};
        document.querySelector('input[name="customer_name"]').value = customer.name || "";
        document.querySelector('input[name="customer_phone"]').value = customer.phone || "";
        document.querySelector('input[name="customer_address"]').value = customer.address || "";

        payload.rooms.forEach(r => addRoom(r));
        if (payload.rooms.length === 0) addRoom();

        recalcAll();
        showToast("โหลดข้อมูลสำเร็จ", "success");
    }

    function saveData() {
        if (isLocked) return;
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.error("Failed to save data to storage", e);
        }
    }

    function updateLockState() {
        const allItems = roomsEl.querySelectorAll('input, select, button:not(#lockBtn)');
        isLocked = document.querySelector(SELECTORS.lockBtn).classList.contains('active');
        allItems.forEach(el => {
            el.disabled = isLocked;
            el.classList.toggle('is-locked', isLocked);
        });
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast("คัดลอกข้อมูลแล้ว", "success");
        } catch (err) {
            console.error("Failed to copy text: ", err);
            showToast("ไม่สามารถคัดลอกข้อมูลได้", "error");
        }
    }

    function formatTextForCopy(payload) {
        let text = "";
        
        if (payload.customer && document.querySelector(SELECTORS.copyCustomerInfo)?.checked) {
            text += `ลูกค้า: ${payload.customer.name}\n`;
            text += `เบอร์โทร: ${payload.customer.phone}\n`;
            text += `รายละเอียด: ${payload.customer.address}\n\n`;
        }

        if (payload.rooms && document.querySelector(SELECTORS.copyRoomDetails)?.checked) {
            payload.rooms.forEach((room, rIdx) => {
                if (room.is_suspended) return;
                text += `=== ห้องที่ ${rIdx + 1}: ${room.room_name} ===\n`;
                text += `ราคาผ้า/ม.: ${fmt(room.price_per_m_raw, 0, true)} บ. (${room.style})\n`;

                if (room.sets && room.sets.length > 0) {
                    text += `-- จุดผ้าม่าน --\n`;
                    room.sets.forEach((set, sIdx) => {
                        if (set.is_suspended) return;
                        text += `  จุดที่ ${sIdx + 1}: กว้าง ${fmt(set.width_m, 2)} ม., สูง ${fmt(set.height_m, 2)} ม. (${set.fabric_variant}, ${set.open_type})\n`;
                        text += `  - ราคา: ${fmt(set.price, 0, true)} บ., ผ้าทึบ: ${fmt(set.opaque_yards, 2)} หลา, ผ้าโปร่ง: ${fmt(set.sheer_yards, 2)} หลา\n`;
                    });
                }
                
                if (room.decorations && room.decorations.length > 0) {
                    text += `-- รายการตกแต่ง --\n`;
                    room.decorations.forEach((deco, dIdx) => {
                        if (deco.is_suspended) return;
                        text += `  ${deco.type}: กว้าง ${fmt(deco.width_m, 2)} ม., สูง ${fmt(deco.height_m, 2)} ม.\n`;
                        text += `  - ราคา: ${fmt(deco.price, 0, true)} บ., พื้นที่: ${fmt(deco.sqm, 2)} ตร.ม.\n`;
                    });
                }
                
                if (room.wallpapers && room.wallpapers.length > 0) {
                    text += `-- วอลเปเปอร์ --\n`;
                    room.wallpapers.forEach((wallpaper, wIdx) => {
                        if (wallpaper.is_suspended) return;
                        text += `  รายการที่ ${wIdx + 1}: สูง ${fmt(wallpaper.height_m, 2)} ม.\n`;
                        text += `  - ราคา: ${fmt(wallpaper.price, 0, true)} บ., พื้นที่: ${fmt(wallpaper.sqm, 2)} ตร.ม., ใช้: ${fmt(wallpaper.rolls, 0)} ม้วน\n`;
                    });
                }
                text += "\n";
            });
        }
        
        if (payload.summary && document.querySelector(SELECTORS.copySummary)?.checked) {
            text += "=== สรุปยอดรวม ===\n";
            text += `ราคารวมทั้งหมด: ${fmt(payload.summary.grand_total, 0, true)} บาท\n`;
            text += `จำนวนจุด: ${payload.summary.set_count}\n`;
            text += `รวมผ้าทึบ: ${fmt(payload.summary.grand_fabric_yards, 2)} หลา\n`;
            text += `รวมผ้าโปร่ง: ${fmt(payload.summary.grand_sheer_fabric_yards, 2)} หลา\n`;
            text += `รวมรางทึบ: ${fmt(payload.summary.grand_opaque_track, 2)} ม.\n`;
            text += `รวมรางโปร่ง: ${fmt(payload.summary.grand_sheer_track, 2)} ม.\n`;
        }
        
        return text.trim();
    }

    function exportJson() {
        const payload = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `marnthara_data_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast("Export ข้อมูลแล้ว", "success");
    }

    function importJson() {
        const importModal = document.querySelector(SELECTORS.importModal);
        const importArea = document.querySelector(SELECTORS.importJsonArea);
        if (!importModal || !importArea) return;
        
        importArea.value = '';
        importModal.classList.add('visible');
        
        const importConfirmBtn = document.querySelector(SELECTORS.importConfirm);
        const importCancelBtn = document.querySelector(SELECTORS.importCancel);
        
        const handleImport = () => {
            try {
                const data = JSON.parse(importArea.value);
                loadPayload(data);
                importModal.classList.remove('visible');
            } catch (e) {
                showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
            }
        };
        
        const handleCancel = () => {
            importModal.classList.remove('visible');
        };
        
        importConfirmBtn.addEventListener('click', handleImport, { once: true });
        importCancelBtn.addEventListener('click', handleCancel, { once: true });
        
        importModal.addEventListener('click', (e) => {
            if (e.target === importModal) handleCancel();
        }, { once: true });
    }


    /* --- Event Listeners --- */
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-act]');
        if (!target) return;
        const action = target.dataset.act;
        const roomEl = target.closest(SELECTORS.room);
        switch(action) {
            case 'add-set': addSet(roomEl); break;
            case 'add-deco': addDeco(roomEl); break;
            case 'add-wallpaper': addWallpaper(roomEl); break;
            case 'del-room': delRoom(target); break;
            case 'del-set': delSet(target); break;
            case 'del-deco': delDeco(target); break;
            case 'del-wallpaper': delWallpaper(target); break;
            case 'del-wall': delWall(target); break;
            case 'toggle-suspend': toggleSuspend(target); break;
            case 'clear-set': clearSet(target); break;
            case 'clear-deco': clearDeco(target); break;
            case 'clear-wallpaper': clearWallpaper(target); break;
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', (e) => {
        e.currentTarget.classList.toggle('active');
        const lockTextEl = e.currentTarget.querySelector('.lock-text');
        const lockIconEl = e.currentTarget.querySelector('.lock-icon');
        const isLockedNow = e.currentTarget.classList.contains('active');
        if (lockTextEl) lockTextEl.textContent = isLockedNow ? 'ปลดล็อค' : 'ล็อค';
        if (lockIconEl) lockIconEl.textContent = isLockedNow ? '🔓' : '🔒';
        updateLockState();
        showToast(isLockedNow ? 'หน้าจอถูกล็อคแล้ว' : 'หน้าจอถูกปลดล็อคแล้ว', isLockedNow ? 'error' : 'success');
    });

    orderForm.addEventListener('input', debounce(recalcAll));

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        copyToClipboard(JSON.stringify(payload, null, 2));
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const payload = buildPayload();
            const formattedText = formatTextForCopy(payload);
            copyToClipboard(formattedText);
        }
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
        e.stopPropagation();
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

    document.querySelector(SELECTORS.importBtn).addEventListener('click', importJson);
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', exportJson);

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