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

    async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); }
    async function clearDeco(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; btn.closest(SELECTORS.decoItem).querySelectorAll('input, select').forEach(el => { el.value = ''; }); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลตกแต่งแล้ว', 'success'); }
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); item.querySelectorAll('input').forEach(el => el.value = ''); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); }
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }
    
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
        let setCount = 0;
        let setCountSets = 0;
        let setCountDeco = 0;

        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            if (room.dataset.suspended === 'true') {
                room.querySelector('[data-room-total]').textContent = "0";
                return;
            }
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
                const w = clamp01(set.querySelector('input[name="width_m"]').value);
                const h = clamp01(set.querySelector('input[name="height_m"]').value);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                const sheerPriceRaw = toNum(set.querySelector('select[name="sheer_price_per_m"]').value);
                
                const basePrice = baseRaw + sPlus + heightPlus(h);
                const opaqueYardage = CALC.fabricYardage(style, w);
                const sheerYardage = (variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง') ? CALC.fabricYardage(style, w) : 0;
                
                const opaquePrice = (variant === 'ทึบ' || variant === 'ทึบ&โปร่ง') ? Math.ceil(opaqueYardage) * basePrice : 0;
                const sheerPrice = (variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง') ? Math.ceil(sheerYardage) * sheerPriceRaw : 0;

                const setTotal = opaquePrice + sheerPrice;
                setCountSets++;
                setCount++;
                roomSum += setTotal;
                grand += setTotal;
                grandOpaqueYards += (variant === 'ทึบ' || variant === 'ทึบ&โปร่ง') ? opaqueYardage : 0;
                grandSheerYards += (variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง') ? sheerYardage : 0;
                grandOpaqueTrack += (variant === 'ทึบ' || variant === 'ทึบ&โปร่ง') ? w : 0;
                grandSheerTrack += (variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง') ? w : 0;

                set.querySelector('[data-set-price-total]').textContent = fmt(setTotal, 0, true);
                set.querySelector('[data-set-price-opaque]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-set-price-sheer]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYardage, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYardage, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(w, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerYardage > 0 ? w : 0, 2);
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                if (deco.dataset.suspended === 'true') {
                    deco.querySelector('[data-deco-price]').textContent = "0";
                    deco.querySelector('[data-deco-sqyd]').textContent = "0.00";
                    return;
                }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const price_sqyd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                const sqyd = (w * h) * SQM_TO_SQYD;
                const total = sqyd * price_sqyd;
                roomSum += total;
                grand += total;
                setCountDeco++;
                deco.querySelector('[data-deco-price]').textContent = fmt(total, 0, true);
                deco.querySelector('[data-deco-sqyd]').textContent = fmt(sqyd, 2);
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper) => {
                if (wallpaper.dataset.suspended === 'true') {
                    wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = "0";
                    wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = "0.00";
                    wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = "0";
                    return;
                }
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const price_roll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const rolls = CALC.wallpaperRolls(totalWidth, h);
                const totalPrice = rolls * price_roll;
                const totalSqM = totalWidth * h;
                
                roomSum += totalPrice;
                grand += totalPrice;
                
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = fmt(totalPrice, 0, true);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(totalSqM, 2);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = fmt(rolls, 0);
            });

            room.querySelector('[data-room-brief] .num:nth-of-type(1)').textContent = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
            room.querySelector('[data-room-brief] .num:nth-of-type(2)').textContent = room.querySelectorAll(SELECTORS.set).length + room.querySelectorAll(SELECTORS.decoItem).length;
            room.querySelector('[data-room-brief] .price').textContent = fmt(roomSum, 0, true);
            room.querySelector('[data-room-total]').textContent = fmt(roomSum, 0, true);
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(SELECTORS.set).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(SELECTORS.decoItem).length;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
        
        saveData();
    }

    function buildPayload() {
        const payload = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                style: room.querySelector(SELECTORS.roomStyle).value,
                is_suspended: room.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: []
            };

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const isSuspended = set.dataset.suspended === 'true';
                if (isSuspended) return;
                roomData.sets.push({
                    width_m: toNum(set.querySelector('input[name="width_m"]').value),
                    height_m: toNum(set.querySelector('input[name="height_m"]').value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                    open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]').value),
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isSuspended = deco.dataset.suspended === 'true';
                if (isSuspended) return;
                roomData.decorations.push({
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const isSuspended = wallpaper.dataset.suspended === 'true';
                if (isSuspended) return;
                roomData.wallpapers.push({
                    height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)).filter(w => w > 0)
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function saveData() {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch(err) {
            console.error("Failed to save data to storage:", err);
            showToast("ไม่สามารถบันทึกข้อมูลอัตโนมัติได้", "error");
        }
    }

    function loadData() {
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
                showToast("ข้อมูลที่บันทึกไว้เสียหาย เริ่มต้นใหม่...", "error");
            }
        } else {
            addRoom();
        }
        updateLockState();
        renumber();
        recalcAll();
    }
    
    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        lockBtn.querySelector('.lock-icon').textContent = isLocked ? 'lock' : 'lock_open';
        lockBtn.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
    }

    // Event Listeners
    roomsEl.addEventListener('input', debounce(recalcAll));

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async () => {
        try {
            const payload = buildPayload();
            await navigator.clipboard.writeText(JSON.stringify(payload));
            showToast("คัดลอก JSON แล้ว", "success");
        } catch (err) {
            showToast("ไม่สามารถคัดลอกได้", "error");
        }
    });
    
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (!options) return;
        const payload = buildPayload();
        let textToCopy = "";

        if (options.customer) {
            textToCopy += `ชื่อลูกค้า: ${payload.customer_name || 'ไม่ได้ระบุ'}\n`;
            textToCopy += `เบอร์โทร: ${payload.customer_phone || 'ไม่ได้ระบุ'}\n`;
            textToCopy += `รายละเอียด: ${payload.customer_address || 'ไม่ได้ระบุ'}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach(room => {
                textToCopy += `--- ห้อง: ${room.room_name || 'ไม่ได้ระบุ'} ---\n`;
                textToCopy += `ราคาผ้า: ${room.price_per_m_raw.toLocaleString('th-TH')} บ./ม. | สไตล์: ${room.style}\n`;
                room.sets.forEach((set, i) => {
                    const variant = set.fabric_variant;
                    const opaquePrice = (variant === 'ทึบ' || variant === 'ทึบ&โปร่ง') ? Math.ceil(CALC.fabricYardage(room.style, set.width_m)) * (room.price_per_m_raw + stylePlus(room.style) + heightPlus(set.height_m)) : 0;
                    const sheerPrice = (variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง') ? Math.ceil(CALC.fabricYardage(room.style, set.width_m)) * set.sheer_price_per_m : 0;
                    textToCopy += `  - จุดที่ ${i + 1}: กว้าง ${fmt(set.width_m, 2)} ม. x สูง ${fmt(set.height_m, 2)} ม. (${set.fabric_variant} - ${set.open_type})\n`;
                    if(opaquePrice > 0) textToCopy += `    ผ้าทึบ: ${fmt(opaquePrice, 0, true)} บ. | ใช้ ${fmt(CALC.fabricYardage(room.style, set.width_m), 2)} หลา\n`;
                    if(sheerPrice > 0) textToCopy += `    ผ้าโปร่ง: ${fmt(sheerPrice, 0, true)} บ. | ใช้ ${fmt(CALC.fabricYardage(room.style, set.width_m), 2)} หลา\n`;
                });
                room.decorations.forEach((deco, i) => {
                    const price = (deco.width_m * deco.height_m * SQM_TO_SQYD) * deco.price_sqyd;
                    textToCopy += `  - ตกแต่งพิเศษ ${i + 1}: ${deco.type} | กว้าง ${fmt(deco.width_m, 2)} ม. x สูง ${fmt(deco.height_m, 2)} ม. | ราคา: ${fmt(price, 0, true)} บ.\n`;
                });
                 room.wallpapers.forEach((wp, i) => {
                    const totalWidth = wp.widths.reduce((sum, w) => sum + w, 0);
                    const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                    const totalPrice = rolls * wp.price_per_roll;
                    textToCopy += `  - วอลเปเปอร์ ${i + 1}: สูง ${fmt(wp.height_m, 2)} ม. | ราคา/ม้วน ${fmt(wp.price_per_roll, 0, true)} บ. | ใช้ ${fmt(rolls, 0)} ม้วน\n`;
                 });
                textToCopy += `\n`;
            });
        }
        
        if (options.summary) {
            textToCopy += `--- สรุปยอดรวม ---\n`;
            textToCopy += `ราคารวม: ${document.querySelector(SELECTORS.grandTotal).textContent} บ.\n`;
            textToCopy += `ผ้าทึบที่ใช้: ${document.querySelector(SELECTORS.grandFabric).textContent}\n`;
            textToCopy += `ผ้าโปร่งที่ใช้: ${document.querySelector(SELECTORS.grandSheerFabric).textContent}\n`;
            textToCopy += `รางทึบที่ใช้: ${document.querySelector(SELECTORS.grandOpaqueTrack).textContent}\n`;
            textToCopy += `รางโปร่งที่ใช้: ${document.querySelector(SELECTORS.grandSheerTrack).textContent}\n`;
        }
        
        try {
            await navigator.clipboard.writeText(textToCopy);
            showToast("คัดลอกข้อความแล้ว", "success");
        } catch (err) {
            showToast("ไม่สามารถคัดลอกได้", "error");
        }
    });

    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        document.body.classList.toggle('is-locked', isLocked);
        updateLockState();
        showToast(isLocked ? 'ล็อคข้อมูลแล้ว' : 'ปลดล็อคข้อมูลแล้ว', 'warning');
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
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
        downloadAnchorNode.setAttribute("download", `marnthara_data_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast("ส่งออกข้อมูล JSON แล้ว", "success");
    });
    
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const payload = JSON.parse(jsonText);
            document.querySelector('input[name="customer_name"]').value = payload.customer_name;
            document.querySelector('input[name="customer_address"]').value = payload.customer_address;
            document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
            roomsEl.innerHTML = ""; roomCount = 0;
            if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
            else addRoom();
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
            showToast("นำเข้าข้อมูลเรียบร้อยแล้ว", "success");
        } catch(err) {
            showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
        }
    });

    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });

    // Delegate events
    roomsEl.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('[data-act="add-set"]')) addSet(target.closest(SELECTORS.room));
        else if (target.closest('[data-act="add-deco"]')) addDeco(target.closest(SELECTORS.room));
        else if (target.closest('[data-act="add-wallpaper"]')) addWallpaper(target.closest(SELECTORS.room));
        else if (target.closest('[data-act="add-wall"]')) addWall(target.closest('[data-act="add-wall"]'));
        else if (target.closest('[data-act="toggle-room-suspend"]')) toggleRoomSuspend(target.closest('[data-act="toggle-room-suspend"]'));
        else if (target.closest('[data-act="clear-room"]')) clearRoom(target.closest('[data-act="clear-room"]'));
        else if (target.closest('[data-act="del-room"]')) delRoom(target.closest('[data-act="del-room"]'));
        else if (target.closest('[data-act="toggle-set-suspend"]')) toggleSuspend(target.closest('[data-act="toggle-set-suspend"]'));
        else if (target.closest('[data-act="clear-set"]')) clearSet(target.closest('[data-act="clear-set"]'));
        else if (target.closest('[data-act="del-set"]')) delSet(target.closest('[data-act="del-set"]'));
        else if (target.closest('[data-act="toggle-deco-suspend"]')) toggleSuspend(target.closest('[data-act="toggle-deco-suspend"]'));
        else if (target.closest('[data-act="clear-deco"]')) clearDeco(target.closest('[data-act="clear-deco"]'));
        else if (target.closest('[data-act="del-deco"]')) delDeco(target.closest('[data-act="del-deco"]'));
        else if (target.closest('[data-act="toggle-wallpaper-suspend"]')) toggleSuspend(target.closest('[data-act="toggle-wallpaper-suspend"]'));
        else if (target.closest('[data-act="clear-wallpaper"]')) clearWallpaper(target.closest('[data-act="clear-wallpaper"]'));
        else if (target.closest('[data-act="del-wallpaper"]')) delWallpaper(target.closest('[data-act="del-wallpaper"]'));
        else if (target.closest('[data-act="del-wall"]')) delWall(target.closest('[data-act="del-wall"]'));
    });

    roomsEl.addEventListener('change', (e) => {
        if (e.target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
        recalcAll();
    });

    document.addEventListener('click', (e) => {
        document.querySelectorAll('.menu-dropdown').forEach(dropdown => {
            if (!dropdown.contains(e.target) && !e.target.closest('.menu-container')) {
                dropdown.classList.remove('show');
            }
        });
        
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
    });

    orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        loadData();
    });
})();