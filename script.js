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
                if (set.dataset.suspended === 'true') { /* ... clear UI ... */ return; }
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
                        sheerPrice = Math.round((sheerBase + hPlus) * w);
                        sheerYards = CALC.fabricYardage(style, w);
                        sheerTrack = w;
                    }
                }
                const total = opaquePrice + sheerPrice;
                roomSum += total; grand += total;
                grandOpaqueYards += opaqueYards; grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack; grandSheerTrack += sheerTrack;
                set.querySelector(".price").textContent = fmt(total, 0, true);
                set.querySelector("[data-opaque-price-label] .price").textContent = fmt(opaquePrice, 0, true);
                set.querySelector("[data-sheer-price-label] .price").textContent = fmt(sheerPrice, 0, true);
                set.querySelector("[data-opaque-yardage-label] .price").textContent = fmt(opaqueYards, 2);
                set.querySelector("[data-sheer-yardage-label] .price").textContent = fmt(sheerYards, 2);
                set.querySelector("[data-opaque-track-label] .price").textContent = fmt(opaqueTrack, 2);
                set.querySelector("[data-sheer-track-label] .price").textContent = fmt(sheerTrack, 2);
                set.querySelector("[data-set-brief]").textContent = `w ${fmt(w, 2)} ม. • h ${fmt(h, 2)} ม.`;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                if (deco.dataset.suspended === 'true') { /* ... clear UI ... */ return; }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value), h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const price_sqyd = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                let totalPrice = 0;
                const areaSqm = w * h;
                const areaSqyd = areaSqm * SQM_TO_SQYD;
                totalPrice = areaSqyd * price_sqyd;
                roomSum += totalPrice; grand += totalPrice;
                deco.querySelector(".price").textContent = fmt(totalPrice, 0, true);
                deco.querySelector("[data-deco-brief]").textContent = `w ${fmt(w, 2)} ม. • h ${fmt(h, 2)} ม.`;
                deco.querySelector(".small .price:nth-of-type(2)").textContent = fmt(areaSqm, 2);
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((item) => {
                if (item.dataset.suspended === 'true') { /* ... clear UI ... */ return; }
                const h = clamp01(item.querySelector('[name="wallpaper_height_m"]')?.value);
                const pricePerRoll = clamp01(item.querySelector('[name="wallpaper_price_roll"]')?.value);
                let totalWidth = 0;
                item.querySelectorAll('[name="wall_width_m"]').forEach(wInput => {
                    totalWidth += clamp01(wInput.value);
                });
                const totalSqm = totalWidth * h;
                const totalRolls = CALC.wallpaperRolls(totalWidth, h);
                const totalPrice = totalRolls * pricePerRoll;
                roomSum += totalPrice; grand += totalPrice;
                const summary = item.querySelector("[data-wallpaper-summary]");
                if(summary) {
                    summary.querySelector(".price:nth-of-type(1)").textContent = fmt(totalPrice, 0, true);
                    summary.querySelector(".price:nth-of-type(2)").textContent = fmt(totalSqm, 2);
                    summary.querySelector(".price:nth-of-type(3)").textContent = fmt(totalRolls, 0, true);
                }
                const brief = item.querySelector("[data-wallpaper-brief]");
                if (brief) brief.textContent = `พื้นที่ ${fmt(totalSqm, 2)} ตร.ม.`;
            });

            room.querySelector('[data-room-total]').textContent = fmt(roomSum, 0, true);
            const roomBrief = room.querySelector("[data-room-brief]");
            const roomSetCount = room.querySelectorAll(SELECTORS.set).length;
            const roomDecoCount = room.querySelectorAll(SELECTORS.decoItem).length;
            const roomSetCountSets = room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length;
            const roomDecoCountDeco = room.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length;
            const roomWallpaperCount = room.querySelectorAll(`${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
            if (roomBrief) {
                const totalActiveItems = roomSetCountSets + roomDecoCountDeco + roomWallpaperCount;
                roomBrief.innerHTML = `จุด <span class="num">${roomSetCount}</span> • ชุด <span class="num">${roomSetCountSets + roomDecoCountDeco}</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บ.`;
            }
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length + document.querySelectorAll(`${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer_name: document.querySelector('input[name="customer_name"]')?.value || "",
            customer_phone: document.querySelector('input[name="customer_phone"]')?.value || "",
            customer_address: document.querySelector('input[name="customer_address"]')?.value || "",
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || roomEl.querySelector(SELECTORS.roomNameInput)?.placeholder || "",
                price_per_m_raw: toNum(roomEl.querySelector(SELECTORS.roomPricePerM)?.value),
                style: roomEl.querySelector(SELECTORS.roomStyle)?.value || "",
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const isSuspended = setEl.dataset.suspended === 'true';
                roomData.sets.push({
                    width_m: clamp01(setEl.querySelector('input[name="width_m"]')?.value),
                    height_m: clamp01(setEl.querySelector('input[name="height_m"]')?.value),
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value || "",
                    open_type: setEl.querySelector('select[name="open_type"]')?.value || "",
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value),
                    is_suspended: isSuspended
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const isSuspended = decoEl.dataset.suspended === 'true';
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value || "",
                    width_m: clamp01(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: clamp01(decoEl.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                    is_suspended: isSuspended
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const isSuspended = wallpaperEl.dataset.suspended === 'true';
                const widths = [];
                wallpaperEl.querySelectorAll('[name="wall_width_m"]').forEach(wInput => {
                    widths.push(clamp01(wInput.value));
                });

                roomData.wallpapers.push({
                    height_m: clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    widths: widths,
                    is_suspended: isSuspended
                });
            });

            payload.rooms.push(roomData);
        });
        return payload;
    }

    function loadPayload(payload) {
        if (!payload || !payload.rooms) { showToast('ไม่พบข้อมูลที่ถูกต้อง', 'error'); return; }
        document.querySelector('input[name="customer_name"]').value = payload.customer_name || "";
        document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || "";
        document.querySelector('input[name="customer_address"]').value = payload.customer_address || "";
        roomsEl.innerHTML = "";
        roomCount = 0;
        (payload.rooms || []).forEach(r => addRoom(r));
        if (payload.is_locked) {
            document.querySelector(SELECTORS.lockBtn).click();
        }
    }

    function saveData() {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            console.log("Data saved successfully.");
        } catch(err) {
            console.error("Failed to save data to storage:", err);
            showToast('บันทึกข้อมูลไม่สำเร็จ', 'error');
        }
    }

    function updateLockState() {
        isLocked = document.querySelector(SELECTORS.lockBtn)?.dataset.locked === 'true';
        const formElements = document.querySelectorAll(SELECTORS.orderForm + ' input, ' + SELECTORS.orderForm + ' select, ' + SELECTORS.orderForm + ' button:not(' + SELECTORS.lockBtn + '):not(' + SELECTORS.addRoomHeaderBtn + '):not(' + SELECTORS.clearAllBtn + '):not(' + SELECTORS.copyTextBtn + '):not(' + SELECTORS.copyJsonBtn + '):not(' + SELECTORS.submitBtn + ')');
        formElements.forEach(el => {
            el.disabled = isLocked;
        });
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        if (lockBtn) {
            lockBtn.dataset.locked = isLocked;
            const lockText = lockBtn.querySelector('.lock-text');
            if(lockText) lockText.textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        }
    }
    
    function copyText(options) {
        if (!options) return;
        let text = '';
        if (options.customer) {
            text += `ลูกค้า: ${document.querySelector('input[name="customer_name"]')?.value || '-'}\n`;
            text += `เบอร์โทร: ${document.querySelector('input[name="customer_phone"]')?.value || '-'}\n`;
            text += `รายละเอียด: ${document.querySelector('input[name="customer_address"]')?.value || '-'}\n\n`;
        }
        if (options.details) {
            document.querySelectorAll(SELECTORS.room).forEach((roomEl, rIdx) => {
                const roomName = roomEl.querySelector(SELECTORS.roomNameInput)?.value || roomEl.querySelector(SELECTORS.roomNameInput)?.placeholder;
                text += `ห้องที่ ${rIdx + 1}: ${roomName}\n`;
                const roomPrice = roomEl.querySelector(SELECTORS.roomPricePerM)?.value;
                const roomStyle = roomEl.querySelector(SELECTORS.roomStyle)?.value;
                if (roomPrice && roomStyle) text += `ราคาผ้า: ${roomPrice} บ. (${roomStyle})\n`;
                
                roomEl.querySelectorAll(SELECTORS.set).forEach((setEl, sIdx) => {
                    const isSuspended = setEl.dataset.suspended === 'true';
                    const w = clamp01(setEl.querySelector('input[name="width_m"]')?.value);
                    const h = clamp01(setEl.querySelector('input[name="height_m"]')?.value);
                    const variant = setEl.querySelector('select[name="fabric_variant"]')?.value;
                    text += `  - จุดที่ ${sIdx + 1}: W ${fmt(w, 2)} ม. x H ${fmt(h, 2)} ม. (${variant})`;
                    if (isSuspended) text += ' (ระงับ)';
                    text += '\n';
                });

                roomEl.querySelectorAll(SELECTORS.decoItem).forEach((decoEl, dIdx) => {
                    const isSuspended = decoEl.dataset.suspended === 'true';
                    const w = clamp01(decoEl.querySelector('input[name="deco_width_m"]')?.value);
                    const h = clamp01(decoEl.querySelector('input[name="deco_height_m"]')?.value);
                    const type = decoEl.querySelector('input[name="deco_type"]')?.value;
                    text += `  - ตกแต่ง ${dIdx + 1}: ${type} W ${fmt(w, 2)} ม. x H ${fmt(h, 2)} ม.`;
                    if (isSuspended) text += ' (ระงับ)';
                    text += '\n';
                });

                roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaperEl, wIdx) => {
                    const isSuspended = wallpaperEl.dataset.suspended === 'true';
                    const h = clamp01(wallpaperEl.querySelector('input[name="wallpaper_height_m"]')?.value);
                    let totalWidth = 0;
                    wallpaperEl.querySelectorAll('input[name="wall_width_m"]').forEach(wInput => {
                        totalWidth += clamp01(wInput.value);
                    });
                    text += `  - วอลเปเปอร์ ${wIdx + 1}: W ${fmt(totalWidth, 2)} ม. x H ${fmt(h, 2)} ม.`;
                    if (isSuspended) text += ' (ระงับ)';
                    text += '\n';
                });

                text += `  ราคารวมห้อง: ${roomEl.querySelector('[data-room-total]')?.textContent || '0'} บ.\n\n`;
            });
        }
        if (options.summary) {
            text += `--- สรุปยอดรวม ---\n`;
            text += `ราคารวม: ${document.querySelector('#grandTotal')?.textContent || '0'} บ.\n`;
            text += `จำนวนจุด: ${document.querySelector('#setCount')?.textContent || '0'} จุด\n`;
            text += `ผ้าม่าน(ชุด): ${document.querySelector('#setCountSets')?.textContent || '0'} ชุด\n`;
            text += `ตกแต่งเพิ่ม(ชุด): ${document.querySelector('#setCountDeco')?.textContent || '0'} ชุด\n`;
            text += `--- สรุปวัสดุ ---\n`;
            text += `ผ้าทึบที่ใช้: ${document.querySelector('#grandFabric')?.textContent || '0'} หลา\n`;
            text += `ผ้าโปร่งที่ใช้: ${document.querySelector('#grandSheerFabric')?.textContent || '0'} หลา\n`;
            text += `รางทึบที่ใช้: ${document.querySelector('#grandOpaqueTrack')?.textContent || '0'} ม.\n`;
            text += `รางโปร่งที่ใช้: ${document.querySelector('#grandSheerTrack')?.textContent || '0'} ม.\n`;
        }

        navigator.clipboard.writeText(text.trim()).then(() => {
            showToast('คัดลอกข้อมูลแล้ว', 'success');
        }).catch(err => {
            console.error("Failed to copy text:", err);
            showToast('คัดลอกไม่สำเร็จ', 'error');
        });
    }

    // --- Event Listeners ---
    document.addEventListener('input', debounce((e) => {
        const target = e.target;
        if (target.closest(SELECTORS.room) || target.closest('#customerInfo') || target.closest(SELECTORS.set) || target.closest(SELECTORS.decoItem) || target.closest(SELECTORS.wallpaperItem)) {
            if (target.matches('select[name="fabric_variant"]')) {
                toggleSetFabricUI(target.closest(SELECTORS.set));
            }
            recalcAll();
            saveData();
        }
    }));

    document.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-act]');
        if (!target || isLocked && !target.dataset.ignoreLock) return;

        const action = target.dataset.act;
        const item = target.closest(SELECTORS.room) || target.closest(SELECTORS.set) || target.closest(SELECTORS.decoItem) || target.closest(SELECTORS.wallpaperItem);

        switch(action) {
            case 'add-room': addRoom(); break;
            case 'add-set': addSet(item); break;
            case 'add-deco': addDeco(item); break;
            case 'add-wallpaper': addWallpaper(item); break;
            case 'add-wall': addWall(target); break;
            case 'del-room': await delRoom(target); break;
            case 'del-set': await delSet(target); break;
            case 'del-deco': await delDeco(target); break;
            case 'del-wallpaper': await delWallpaper(target); break;
            case 'del-wall': await delWall(target); break;
            case 'clear-set': await clearSet(target); break;
            case 'clear-deco': await clearDeco(target); break;
            case 'clear-wallpaper': await clearWallpaper(target); break;
            case 'toggle-suspend': toggleSuspend(target); break;
            default: break;
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => {
        addRoom();
    });

    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async () => {
        await clearAllData();
    });

    document.querySelector(SELECTORS.lockBtn).addEventListener('click', async () => {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        if (lockBtn.dataset.locked !== 'true') {
            const confirmed = await showConfirmation('ล็อคฟอร์ม', 'ยืนยันการล็อคฟอร์ม? จะไม่สามารถแก้ไขข้อมูลได้');
            if (confirmed) {
                lockBtn.dataset.locked = 'true';
                showToast('ฟอร์มถูกล็อคแล้ว', 'warning');
            }
        } else {
            lockBtn.dataset.locked = 'false';
            showToast('ฟอร์มถูกปลดล็อคแล้ว', 'success');
        }
        updateLockState();
    });

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
            showToast('คัดลอก JSON แล้ว', 'success');
        }).catch(err => {
            console.error("Failed to copy JSON:", err);
            showToast('คัดลอกไม่สำเร็จ', 'error');
        });
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) copyText(options);
    });
    
    document.querySelector(SELECTORS.copyOptionsConfirm).addEventListener('click', async () => {
        const modal = document.querySelector(SELECTORS.copyOptionsModal);
        const options = {
            customer: document.querySelector(SELECTORS.copyCustomerInfo)?.checked,
            details: document.querySelector(SELECTORS.copyRoomDetails)?.checked,
            summary: document.querySelector(SELECTORS.copySummary)?.checked,
        };
        copyText(options);
        modal.classList.remove('visible');
    });

    document.querySelector(SELECTORS.copyOptionsCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.copyOptionsModal).classList.remove('visible');
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

    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        try {
            const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
            const payload = JSON.parse(jsonText);
            loadPayload(payload);
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
            saveData();
            showToast('นำเข้าข้อมูลสำเร็จแล้ว', 'success');
        } catch(err) {
            console.error("Import failed:", err);
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
        }
    });

    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const jsonText = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Marnthara_Order_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('ส่งออกข้อมูลสำเร็จ', 'success');
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