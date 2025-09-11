(function() {
    'use strict';
    const APP_VERSION = "input-ui/4.0.0-m3-liquidglass";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";
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
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        roomMenuBtn: '.room-menu-btn', setMenuBtn: '.set-menu-btn', decoMenuBtn: '.deco-menu-btn', wallpaperMenuBtn: '.wallpaper-menu-btn',
        roomMenuDropdown: '.room-menu-dropdown', setMenuDropdown: '.set-menu-dropdown', decoMenuDropdown: '.deco-menu-dropdown', wallpaperMenuDropdown: '.wallpaper-menu-dropdown',
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
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
            }
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
        const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);
        if (prefill) {
            created.querySelector('[name="deco_type"]').value = prefill.type || "";
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m ?? "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmt(prefill.price_sqyd, 0, true) ?? "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
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

    function toggleRoomSuspend(btn) {
        const room = btn.closest(SELECTORS.room);
        const isSuspended = !(room.dataset.suspended === 'true');
        room.dataset.suspended = isSuspended;
        room.classList.toggle('is-suspended', isSuspended);
        room.querySelectorAll('[data-suspend-text]').forEach(el => el.textContent = isSuspended ? 'ใช้งาน' : 'ระงับ');
        recalcAll(); saveData();
        showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }

    async function clearRoom(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูลห้อง', 'ยืนยันการล้างข้อมูลทั้งหมดในห้องนี้?')) return;
        const room = btn.closest(SELECTORS.room);
        room.querySelector(SELECTORS.setsContainer).innerHTML = "";
        room.querySelector(SELECTORS.decorationsContainer).innerHTML = "";
        room.querySelector(SELECTORS.wallpapersContainer).innerHTML = "";
        room.querySelector(SELECTORS.roomNameInput).value = "";
        room.querySelector(SELECTORS.roomPricePerM).value = "";
        room.querySelector(SELECTORS.roomStyle).value = "";
        addSet(room);
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลห้องแล้ว', 'success');
    }
    async function clearSet(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return;
        const set = btn.closest(SELECTORS.set);
        set.querySelectorAll('input, select').forEach(el => {
            el.value = el.name === 'fabric_variant' ? 'ทึบ' : '';
        });
        toggleSetFabricUI(set);
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success');
    }
    async function clearDeco(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return;
        btn.closest(SELECTORS.decoItem).querySelectorAll('input, select').forEach(el => {
            el.value = '';
        });
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลตกแต่งแล้ว', 'success');
    }
    async function clearWallpaper(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return;
        const item = btn.closest(SELECTORS.wallpaperItem);
        item.querySelectorAll('input').forEach(el => el.value = '');
        item.querySelector(SELECTORS.wallsContainer).innerHTML = '';
        addWall(item.querySelector('[data-act="add-wall"]'));
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success');
    }

    async function clearAllData() {
        if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return;
        roomsEl.innerHTML = "";
        roomCount = 0;
        document.querySelectorAll('#customerInfo input').forEach(i => i.value = "");
        addRoom();
        saveData(); updateLockState();
        showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
    }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            const totalSets = room.querySelectorAll(SELECTORS.set).length;
            const totalDecos = room.querySelectorAll(SELECTORS.decoItem).length;
            const totalWallpapers = room.querySelectorAll(SELECTORS.wallpaperItem).length;
            let itemCounter = { set: 0, deco: 0, wallpaper: 0 };
            items.forEach((item) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) {
                    if (item.classList.contains('set')) {
                        itemCounter.set++;
                        lbl.textContent = totalSets > 1 ? `${itemCounter.set}/${totalSets}` : '';
                    } else if (item.classList.contains('deco-item')) {
                        itemCounter.deco++;
                        lbl.textContent = totalDecos > 1 ? `${itemCounter.deco}/${totalDecos}` : '';
                    } else if (item.classList.contains('wallpaper-item')) {
                        itemCounter.wallpaper++;
                        lbl.textContent = totalWallpapers > 1 ? `${itemCounter.wallpaper}/${totalWallpapers}` : '';
                    }
                }
            });
        });
    }

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        let setsCount = 0;
        let decoCount = 0;
        
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            if (roomEl.dataset.suspended === 'true') {
                updateRoomSummary(roomEl, 0); return;
            }
            
            const pricePerM = toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value);
            const style = roomEl.querySelector(SELECTORS.roomStyle).value;
            const style_plus = stylePlus(style);
            
            let roomTotal = 0;
            
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                if (setEl.dataset.suspended === 'true') { updateSetSummary(setEl, 0); return; }
                setsCount++;
                const width = clamp01(setEl.querySelector('input[name="width_m"]').value);
                const height = clamp01(setEl.querySelector('input[name="height_m"]').value);
                const fabricVariant = setEl.querySelector('select[name="fabric_variant"]').value;
                const sheerPricePerM = toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value);
                const height_plus = heightPlus(height);
                
                let setTotal = 0, opaqueTotal = 0, sheerTotal = 0;
                let opaqueYardage = 0, sheerYardage = 0, opaqueTrack = 0, sheerTrack = 0;
                
                if (width > 0 && height > 0) {
                    if (fabricVariant === "ทึบ" || fabricVariant === "ทึบ&โปร่ง") {
                        opaqueYardage = CALC.fabricYardage(style, width);
                        opaqueTrack = width;
                        opaqueTotal = (opaqueYardage * 0.9 * pricePerM) + (opaqueTrack * height_plus) + (width * style_plus);
                    }
                    if (fabricVariant === "โปร่ง" || fabricVariant === "ทึบ&โปร่ง") {
                        sheerYardage = CALC.fabricYardage(style, width);
                        sheerTrack = width;
                        sheerTotal = (sheerYardage * 0.9 * sheerPricePerM) + (sheerTrack * height_plus) + (width * style_plus);
                    }
                }
                
                setTotal = opaqueTotal + sheerTotal;
                roomTotal += setTotal;
                grand += setTotal;
                grandOpaqueYards += opaqueYardage;
                grandSheerYards += sheerYardage;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
                
                setEl.querySelector('[data-opaque-price]').textContent = fmt(opaqueTotal);
                setEl.querySelector('[data-sheer-price]').textContent = fmt(sheerTotal);
                setEl.querySelector('[data-opaque-yardage]').textContent = fmt(opaqueYardage, 2, false);
                setEl.querySelector('[data-sheer-yardage]').textContent = fmt(sheerYardage, 2, false);
                setEl.querySelector('[data-opaque-track]').textContent = fmt(opaqueTrack, 2, false);
                setEl.querySelector('[data-sheer-track]').textContent = fmt(sheerTrack, 2, false);
                setEl.querySelector('[data-set-total]').textContent = fmt(setTotal);
                
            });
            
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                if (decoEl.dataset.suspended === 'true') { updateDecoSummary(decoEl, 0); return; }
                decoCount++;
                const width = clamp01(decoEl.querySelector('[name="deco_width_m"]').value);
                const height = clamp01(decoEl.querySelector('[name="deco_height_m"]').value);
                const priceSqyd = toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value);
                
                const sqM = width * height;
                const sqYd = sqM * SQM_TO_SQYD;
                const total = sqYd * priceSqyd;

                roomTotal += total;
                grand += total;
                
                updateDecoSummary(decoEl, total, sqYd);
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                if (wallpaperEl.dataset.suspended === 'true') { updateWallpaperSummary(wallpaperEl, 0); return; }
                decoCount++;
                const height = clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value);
                const priceRoll = toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value);
                
                const totalWidth = Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]'))
                    .reduce((sum, el) => sum + clamp01(el.value), 0);
                
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, height);
                const total = rollsNeeded * priceRoll;
                const totalArea = totalWidth * height;

                roomTotal += total;
                grand += total;
                
                updateWallpaperSummary(wallpaperEl, total, rollsNeeded, totalArea);
            });
            
            updateRoomSummary(roomEl, roomTotal);
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = setsCount + decoCount;
        document.querySelector(SELECTORS.setCountSets).textContent = setsCount;
        document.querySelector(SELECTORS.setCountDeco).textContent = decoCount;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2);
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2);
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2);
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2);
    }
    
    function updateRoomSummary(roomEl, total) {
        roomEl.querySelector('[data-room-total]').textContent = fmt(total, 0, true);
        roomEl.querySelector('[data-room-total-with-install]').textContent = fmt(total * 1.05, 0, true); // Assuming 5% install fee
        const setNum = roomEl.querySelectorAll(SELECTORS.set).length;
        const decoNum = roomEl.querySelectorAll(SELECTORS.decoItem).length + roomEl.querySelectorAll(SELECTORS.wallpaperItem).length;
        roomEl.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด ${setNum}</span> • <span class="num">ชุด ${decoNum}</span> • ราคา <span class="num price">${fmt(total, 0, true)}</span> บ.`;
    }

    function updateSetSummary(setEl, total) {
        setEl.querySelector('[data-set-total]').textContent = fmt(total);
        setEl.querySelector('[data-opaque-price]').textContent = fmt(0);
        setEl.querySelector('[data-sheer-price]').textContent = fmt(0);
        setEl.querySelector('[data-opaque-yardage]').textContent = fmt(0, 2, false);
        setEl.querySelector('[data-sheer-yardage]').textContent = fmt(0, 2, false);
        setEl.querySelector('[data-opaque-track]').textContent = fmt(0, 2, false);
        setEl.querySelector('[data-sheer-track]').textContent = fmt(0, 2, false);
    }

    function updateDecoSummary(decoEl, total, sqYd) {
        decoEl.querySelector('[data-deco-summary]').innerHTML = `พื้นที่: <span class="price">${fmt(sqYd, 2)}</span> ตร.หลา • ราคา: <span class="price">${fmt(total, 0, true)}</span> บ.`;
    }

    function updateWallpaperSummary(wallpaperEl, total, rolls, totalArea) {
        wallpaperEl.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${fmt(total, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalArea, 2)}</span> ตร.ม. • ใช้ <span class="price">${rolls}</span> ม้วน`;
    }

    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            customer: {
                name: document.querySelector('input[name="customer_name"]').value,
                phone: document.querySelector('input[name="customer_phone"]').value,
                address: document.querySelector('input[name="customer_address"]').value
            },
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const room = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: roomEl.querySelector(SELECTORS.roomPricePerM).value,
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [], decorations: [], wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const set = {
                    width_m: toNum(setEl.querySelector('input[name="width_m"]').value),
                    height_m: toNum(setEl.querySelector('input[name="height_m"]').value),
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                    is_suspended: setEl.dataset.suspended === 'true'
                };
                room.sets.push(set);
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const deco = {
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: decoEl.dataset.suspended === 'true'
                };
                room.decorations.push(deco);
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const wallpaper = {
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)).filter(w => w > 0),
                    is_suspended: wallpaperEl.dataset.suspended === 'true'
                };
                room.wallpapers.push(wallpaper);
            });
            payload.rooms.push(room);
        });
        return payload;
    };

    const saveData = debounce(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
    });
    const loadData = () => {
        try {
            const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!data || !data.rooms || data.rooms.length === 0) return;
            showToast('พบข้อมูลที่บันทึกไว้. กำลังโหลด...', 'info');
            document.querySelector('input[name="customer_name"]').value = data.customer?.name || '';
            document.querySelector('input[name="customer_phone"]').value = data.customer?.phone || '';
            document.querySelector('input[name="customer_address"]').value = data.customer?.address || '';
            roomsEl.innerHTML = "";
            (data.rooms || []).forEach(r => addRoom(r));
        } catch(e) { console.error("Could not load data from storage.", e); }
    };
    
    function copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                showToast("คัดลอกข้อมูลแล้ว", 'success');
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                showToast("คัดลอกไม่สำเร็จ", 'error');
            });
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast("คัดลอกข้อมูลแล้ว (fallback)", 'success');
        }
    }
    
    function buildTextOutput(options) {
        const payload = buildPayload();
        let output = "";
        
        if (options.customer) {
            output += "ข้อมูลลูกค้า\n";
            output += `- ชื่อ: ${payload.customer.name || '-'}\n`;
            output += `- เบอร์โทร: ${payload.customer.phone || '-'}\n`;
            output += `- รายละเอียด: ${payload.customer.address || '-'}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach((room, roomIndex) => {
                if (room.is_suspended) return;
                output += `=== ${room.room_name || `ห้อง ${roomIndex + 1}`} ===\n`;
                const roomPrice = document.querySelector(`[data-room][data-index='${roomIndex + 1}'] [data-room-total]`).textContent;
                output += `ราคาห้องนี้: ${roomPrice} บาท\n`;
                output += `สไตล์ผ้าม่าน: ${room.style || '-'}\n`;
                output += `ราคาผ้า/เมตร: ${room.price_per_m_raw || '-'} บาท\n\n`;
                
                room.sets.forEach((set, setIndex) => {
                    if (set.is_suspended) return;
                    output += `  จุดผ้าม่านที่ ${setIndex + 1}\n`;
                    output += `  - ขนาด: ${set.width_m || '?'}ม. x ${set.height_m || '?'}ม.\n`;
                    output += `  - ชนิดผ้า: ${set.fabric_variant || '-'}\n`;
                    output += `  - การเปิด: ${set.open_type || '-'}\n`;
                    if (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") {
                        output += `  - ราคาผ้าโปร่ง/เมตร: ${set.sheer_price_per_m || '-'} บาท\n`;
                    }
                    output += `  - ราคาจุดนี้: ${document.querySelector(`[data-room][data-index='${roomIndex + 1}'] [data-set][data-index='${setIndex + 1}'] [data-set-total]`).textContent} บาท\n`;
                    output += `  - ใช้ผ้าทึบ: ${document.querySelector(`[data-room][data-index='${roomIndex + 1}'] [data-set][data-index='${setIndex + 1}'] [data-opaque-yardage]`).textContent} หลา\n`;
                    if (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") {
                        output += `  - ใช้ผ้าโปร่ง: ${document.querySelector(`[data-room][data-index='${roomIndex + 1}'] [data-set][data-index='${setIndex + 1}'] [data-sheer-yardage]`).textContent} หลา\n`;
                    }
                    output += `  - ใช้รางทึบ: ${document.querySelector(`[data-room][data-index='${roomIndex + 1}'] [data-set][data-index='${setIndex + 1}'] [data-opaque-track]`).textContent} ม.\n`;
                    if (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") {
                        output += `  - ใช้รางโปร่ง: ${document.querySelector(`[data-room][data-index='${roomIndex + 1}'] [data-set][data-index='${setIndex + 1}'] [data-sheer-track]`).textContent} ม.\n`;
                    }
                    output += '\n';
                });

                room.decorations.forEach((deco, decoIndex) => {
                    if (deco.is_suspended) return;
                    output += `  ของตกแต่งที่ ${decoIndex + 1}\n`;
                    output += `  - ชนิด: ${deco.type || '-'}\n`;
                    output += `  - ขนาด: ${deco.width_m || '?'}ม. x ${deco.height_m || '?'}ม.\n`;
                    output += `  - ราคา/ตร.หลา: ${deco.price_sqyd || '-'} บาท\n`;
                    output += `  - ราคาจุดนี้: ${document.querySelector(`[data-room][data-index='${roomIndex + 1}'] [data-deco-item][data-index='${decoIndex + 1}'] .price:last-child`).textContent} บาท\n`;
                    output += '\n';
                });

                room.wallpapers.forEach((wallpaper, wallpaperIndex) => {
                    if (wallpaper.is_suspended) return;
                    output += `  วอลเปเปอร์ที่ ${wallpaperIndex + 1}\n`;
                    output += `  - ความสูงห้อง: ${wallpaper.height_m || '?'}ม.\n`;
                    output += `  - ราคา/ม้วน: ${wallpaper.price_per_roll || '?'} บาท\n`;
                    output += `  - ความกว้างผนัง: ${wallpaper.widths.join(', ') || '-'}\n`;
                    output += `  - ราคาจุดนี้: ${document.querySelector(`[data-room][data-index='${roomIndex + 1}'] [data-wallpaper-item][data-index='${wallpaperIndex + 1}'] .price:first-of-type`).textContent} บาท\n`;
                    output += '\n';
                });
            });
        }

        if (options.summary) {
            output += "=== สรุปยอดรวม ===\n";
            output += `- ผ้าทึบ: ${document.querySelector(SELECTORS.grandFabric).textContent} หลา\n`;
            output += `- ผ้าโปร่ง: ${document.querySelector(SELECTORS.grandSheerFabric).textContent} หลา\n`;
            output += `- รางทึบ: ${document.querySelector(SELECTORS.grandOpaqueTrack).textContent} ม.\n`;
            output += `- รางโปร่ง: ${document.querySelector(SELECTORS.grandSheerTrack).textContent} ม.\n`;
            output += `- ราคารวม: ${document.querySelector(SELECTORS.grandTotal).textContent} บาท\n`;
        }
        
        return output;
    }

    // Event listeners
    document.addEventListener('input', debounce(e => {
        const input = e.target;
        if (input.closest(SELECTORS.room)) {
            recalcAll();
        }
    }));
    document.addEventListener('change', e => {
        const select = e.target;
        if (select.closest(SELECTORS.set) && select.name === "fabric_variant") {
            toggleSetFabricUI(select.closest(SELECTORS.set));
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        document.body.classList.toggle('is-locked', isLocked);
        document.querySelector(SELECTORS.lockBtn).innerHTML = isLocked
            ? '<span class="lock-text">ปลดล็อค</span> <span class="lock-icon material-symbols-outlined">lock</span>'
            : '<span class="lock-text">ล็อค</span> <span class="lock-icon material-symbols-outlined">lock_open</span>';
        showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', isLocked ? 'error' : 'success');
        updateLockState();
    });

    function updateLockState() {
        const allFields = document.querySelectorAll('#orderForm .field:not([data-always-unlocked])');
        allFields.forEach(field => {
            if (isLocked) {
                field.setAttribute('readonly', 'readonly');
                field.setAttribute('disabled', 'disabled');
            } else {
                field.removeAttribute('readonly');
                field.removeAttribute('disabled');
            }
        });
        document.querySelectorAll('.btn:not(#lockBtn, #menuBtn):not([data-always-unlocked])').forEach(btn => {
            if (isLocked) btn.setAttribute('disabled', 'disabled');
            else btn.removeAttribute('disabled');
        });
    }

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        copyToClipboard(JSON.stringify(buildPayload(), null, 2));
    });
    
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const textOutput = buildTextOutput(options);
            copyToClipboard(textOutput);
        }
    });
    
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });

    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        try {
            const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
            const data = JSON.parse(jsonText);
            roomsEl.innerHTML = "";
            document.querySelectorAll('#customerInfo input').forEach(i => i.value = "");
            document.querySelector('input[name="customer_name"]').value = data.customer?.name || '';
            document.querySelector('input[name="customer_phone"]').value = data.customer?.phone || '';
            document.querySelector('input[name="customer_address"]').value = data.customer?.address || '';
            (data.rooms || []).forEach(r => addRoom(r));
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
        } catch (e) {
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
            console.error(e);
        } finally {
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
        }
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = JSON.stringify(buildPayload(), null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marnthara-input-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('ข้อมูลถูกส่งออกแล้ว', 'success');
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest(SELECTORS.menuContainer) && document.querySelector('.menu-dropdown.show')) {
            document.querySelector('.menu-dropdown.show').classList.remove('show');
        }
        
        const actionBtn = e.target.closest('[data-act]');
        if (actionBtn) {
            const action = actionBtn.dataset.act;
            if (action === 'add-set') addSet(actionBtn.closest(SELECTORS.room));
            else if (action === 'add-deco') addDeco(actionBtn.closest(SELECTORS.room));
            else if (action === 'add-wallpaper') addWallpaper(actionBtn.closest(SELECTORS.room));
            else if (action === 'add-wall') addWall(actionBtn);
            else if (action === 'del-room') delRoom(actionBtn);
            else if (action === 'del-set') delSet(actionBtn);
            else if (action === 'del-deco') delDeco(actionBtn);
            else if (action === 'del-wallpaper') delWallpaper(actionBtn);
            else if (action === 'del-wall') delWall(actionBtn);
            else if (action === 'clear-room') clearRoom(actionBtn);
            else if (action === 'clear-set') clearSet(actionBtn);
            else if (action === 'clear-deco') clearDeco(actionBtn);
            else if (action === 'clear-wallpaper') clearWallpaper(actionBtn);
            else if (action === 'toggle-suspend') toggleSuspend(actionBtn);
            else if (action === 'toggle-room-suspend') toggleRoomSuspend(actionBtn);
            
            // For dropdowns
            const roomMenuBtn = e.target.closest(SELECTORS.roomMenuBtn);
            if (roomMenuBtn) {
                e.preventDefault();
                const dropdown = roomMenuBtn.closest('.menu-container').querySelector(SELECTORS.roomMenuDropdown);
                dropdown.classList.toggle('show');
                return;
            }

            const setMenuBtn = e.target.closest(SELECTORS.setMenuBtn);
            if (setMenuBtn) {
                e.preventDefault();
                const dropdown = setMenuBtn.closest('.menu-container').querySelector(SELECTORS.setMenuDropdown);
                dropdown.classList.toggle('show');
                return;
            }
            
            const decoMenuBtn = e.target.closest(SELECTORS.decoMenuBtn);
            if (decoMenuBtn) {
                e.preventDefault();
                const dropdown = decoMenuBtn.closest('.menu-container').querySelector(SELECTORS.decoMenuDropdown);
                dropdown.classList.toggle('show');
                return;
            }

            const wallpaperMenuBtn = e.target.closest(SELECTORS.wallpaperMenuBtn);
            if (wallpaperMenuBtn) {
                e.preventDefault();
                const dropdown = wallpaperMenuBtn.closest('.menu-container').querySelector(SELECTORS.wallpaperMenuDropdown);
                dropdown.classList.toggle('show');
            }
        }
    });

    orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        loadData();
        renumber();
        recalcAll();
        updateLockState();
        if (roomsEl.children.length === 0) addRoom();
    });
})();