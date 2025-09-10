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
                    set.querySelectorAll('.price').forEach(el => el.textContent = '0');
                    return;
                }
                const w = clamp01(set.querySelector('input[name="width_m"]').value), h = clamp01(set.querySelector('input[name="height_m"]').value);
                const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]').value;
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                if (w > 0 && h > 0) {
                    if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                        opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                        opaqueYards = CALC.fabricYardage(style, w);
                        opaqueTrack = w;
                    }
                    if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                        const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]').value);
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
                set.querySelector('[data-set-track-opaque]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-track-sheer]').textContent = fmt(sheerTrack, 2);
                set.querySelector('[data-set-price-surcharge]').textContent = fmt(sPlus + hPlus, 0, true);
                roomSum += opaquePrice + sheerPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                if (deco.dataset.suspended === 'true') {
                    deco.querySelector('.price').textContent = '0';
                    deco.querySelector('.price').nextElementSibling.textContent = '0.00';
                    return;
                }
                const w = clamp01(deco.querySelector('input[name="deco_width_m"]').value);
                const h = clamp01(deco.querySelector('input[name="deco_height_m"]').value);
                const priceSqyd = clamp01(deco.querySelector('input[name="deco_price_sqyd"]').value);
                const totalSqyd = (w * h * SQM_TO_SQYD);
                const price = totalSqyd * priceSqyd;
                deco.querySelector('.price').textContent = fmt(price, 0, true);
                deco.querySelector('.price').nextElementSibling.textContent = fmt(totalSqyd, 2);
                roomSum += price;
            });
            
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                if (item.dataset.suspended === 'true') {
                    item.querySelector('.price').textContent = '0';
                    item.querySelector('.price').nextElementSibling.textContent = '0.00';
                    item.querySelector('.price').nextElementSibling.nextElementSibling.textContent = '0';
                    return;
                }
                const height = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = clamp01(item.querySelector('[name="wallpaper_price_roll"]').value);
                const totalWidth = Array.from(item.querySelectorAll('[name="wall_width_m"]'))
                    .reduce((sum, el) => sum + clamp01(el.value), 0);
                const rolls = CALC.wallpaperRolls(totalWidth, height);
                const price = rolls * pricePerRoll;
                const totalSqm = totalWidth * height;

                item.querySelector('.price').textContent = fmt(price, 0, true);
                item.querySelector('.price').nextElementSibling.textContent = fmt(totalSqm, 2);
                item.querySelector('.price').nextElementSibling.nextElementSibling.textContent = fmt(rolls, 0);
                roomSum += price;
            });

            room.querySelector('[data-room-total]').textContent = fmt(roomSum, 0, true);
            grand += roomSum;
        });

        const numSets = document.querySelectorAll(SELECTORS.set).length;
        const numDecorations = document.querySelectorAll(SELECTORS.decoItem).length;
        const numWalls = document.querySelectorAll(SELECTORS.wallpaperItem).length;

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCountSets).textContent = fmt(numSets, 0, true);
        document.querySelector(SELECTORS.setCountDeco).textContent = fmt(numDecorations + numWalls, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = fmt(numSets + numDecorations + numWalls, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";

        saveData();
    }
    
    function buildPayload() {
        const payload = {};
        const customerInfo = document.querySelector('#customerInfo');
        payload.customer_name = customerInfo.querySelector('input[name="customer_name"]').value;
        payload.customer_phone = customerInfo.querySelector('input[name="customer_phone"]').value;
        payload.customer_address = customerInfo.querySelector('input[name="customer_address"]').value;
        payload.version = APP_VERSION;
        payload.timestamp = new Date().toISOString();

        payload.rooms = [];
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            const roomData = {};
            roomData.room_name = room.querySelector(SELECTORS.roomNameInput).value;
            roomData.price_per_m_raw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            roomData.style = room.querySelector(SELECTORS.roomStyle).value;
            roomData.sets = [];
            roomData.decorations = [];
            roomData.wallpapers = [];

            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                const isSuspended = set.dataset.suspended === 'true';
                if(isSuspended) return;
                const setData = {
                    width_m: clamp01(set.querySelector('input[name="width_m"]').value),
                    height_m: clamp01(set.querySelector('input[name="height_m"]').value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                    open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]').value),
                };
                roomData.sets.push(setData);
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                const isSuspended = deco.dataset.suspended === 'true';
                if(isSuspended) return;
                const decoData = {
                    type: deco.querySelector('input[name="deco_type"]').value,
                    width_m: clamp01(deco.querySelector('input[name="deco_width_m"]').value),
                    height_m: clamp01(deco.querySelector('input[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('input[name="deco_price_sqyd"]').value),
                };
                roomData.decorations.push(decoData);
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((item) => {
                const isSuspended = item.dataset.suspended === 'true';
                if(isSuspended) return;
                const wallpaperData = {
                    height_m: clamp01(item.querySelector('input[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(item.querySelector('input[name="wallpaper_price_roll"]').value),
                    widths: Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value)),
                };
                roomData.wallpapers.push(wallpaperData);
            });

            payload.rooms.push(roomData);
        });

        return payload;
    }
    
    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function updateLockState() {
        isLocked = document.querySelectorAll(SELECTORS.room).length > 0;
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        if (isLocked) {
            lockBtn.classList.add('btn-primary');
            lockBtn.classList.remove('btn-outline-primary');
            lockBtn.querySelector('.lock-text').textContent = "แก้ไข";
            lockBtn.querySelector('.lock-icon').textContent = "✏️";
        } else {
            lockBtn.classList.remove('btn-primary');
            lockBtn.classList.add('btn-outline-primary');
            lockBtn.querySelector('.lock-text').textContent = "ล็อค";
            lockBtn.querySelector('.lock-icon').textContent = "🔒";
        }
    }

    document.addEventListener("click", async (e) => {
        const target = e.target;
        if (target.dataset.act === "del-room") delRoom(target);
        else if (target.dataset.act === "del-set") delSet(target);
        else if (target.dataset.act === "del-deco") delDeco(target);
        else if (target.dataset.act === "del-wallpaper") delWallpaper(target);
        else if (target.dataset.act === "del-wall") delWall(target);
        else if (target.dataset.act === "clear-set") clearSet(target);
        else if (target.dataset.act === "clear-deco") clearDeco(target);
        else if (target.dataset.act === "clear-wallpaper") clearWallpaper(target);
        else if (target.dataset.act === "add-set") addSet(target.closest(SELECTORS.room));
        else if (target.dataset.act === "add-deco") addDeco(target.closest(SELECTORS.room));
        else if (target.dataset.act === "add-wallpaper") addWallpaper(target.closest(SELECTORS.room));
        else if (target.dataset.act === "add-wall") addWall(target);
        else if (target.dataset.act === "suspend") toggleSuspend(target);
        else if (target.id === "addRoomHeaderBtn") addRoom();
        else if (target.id === "clearAllBtn") clearAllData();
        else if (target.id === "lockBtn") isLocked = !isLocked; updateLockState(); showToast(`สถานะ: ${isLocked ? 'ล็อค' : 'แก้ไข'}`);
        else if (target.id === "copyJsonBtn") {
            const data = buildPayload();
            navigator.clipboard.writeText(JSON.stringify(data, null, 2))
                .then(() => showToast("คัดลอก JSON แล้ว", "success"))
                .catch(err => showToast("ไม่สามารถคัดลอกได้: " + err.message, "error"));
        } else if (target.id === "copyTextBtn") {
            const options = await showCopyOptionsModal();
            if (options) {
                const text = getSummaryText(options);
                navigator.clipboard.writeText(text)
                    .then(() => showToast("คัดลอกข้อความแล้ว", "success"))
                    .catch(err => showToast("ไม่สามารถคัดลอกได้: " + err.message, "error"));
            }
        }
        else if (target.id === "importBtn") document.querySelector(SELECTORS.importModal).classList.add('visible');
        else if (target.id === "importCancel") document.querySelector(SELECTORS.importModal).classList.remove('visible');
        else if (target.id === "importConfirm") {
            const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
            try {
                const payload = JSON.parse(jsonText);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
                roomsEl.innerHTML = ""; roomCount = 0;
                (payload.rooms || []).forEach(addRoom);
                recalcAll();
                document.querySelector(SELECTORS.importModal).classList.remove('visible');
                showToast("นำเข้าข้อมูลสำเร็จ", "success");
            } catch (err) {
                showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
            }
        }
        else if (target.id === "exportBtn") {
            const data = buildPayload();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `marnthara-input-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast("ส่งออกข้อมูลเป็น JSON แล้ว", "success");
        }
        else if (target.id === "menuBtn") {
            const dropdown = document.querySelector(SELECTORS.menuDropdown);
            dropdown.classList.toggle('show');
        }
    });

    function getSummaryText(options) {
        let text = "สรุปรายการผ้าม่านและตกแต่ง\n\n";

        if (options.customer) {
            const name = document.querySelector('input[name="customer_name"]').value;
            const phone = document.querySelector('input[name="customer_phone"]').value;
            const address = document.querySelector('input[name="customer_address"]').value;
            text += `ลูกค้า: ${name}\nเบอร์โทร: ${phone}\nรายละเอียด: ${address}\n\n`;
        }

        if (options.details) {
            document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
                if (rIdx > 0) text += "-----------------------\n";
                const roomName = room.querySelector('input[name="room_name"]').value;
                const roomPricePerM = toNum(room.querySelector('select[name="room_price_per_m"]').value);
                const roomStyle = room.querySelector('select[name="room_style"]').value;
                text += `ห้องที่ ${rIdx + 1}: ${roomName}\n`;
                text += `  ราคาผ้าทึบ: ${fmt(roomPricePerM, 0, true)} บ./ม. | สไตล์: ${roomStyle}\n\n`;

                room.querySelectorAll(SELECTORS.set).forEach((set, sIdx) => {
                    if (set.dataset.suspended === 'true') return;
                    const w = clamp01(set.querySelector('input[name="width_m"]').value);
                    const h = clamp01(set.querySelector('input[name="height_m"]').value);
                    const variant = set.querySelector('select[name="fabric_variant"]').value;
                    const openType = set.querySelector('select[name="open_type"]').value;
                    text += `  > จุดผ้าม่าน ${sIdx + 1}: ${variant} | กว้าง ${fmt(w, 2)} ม. สูง ${fmt(h, 2)} ม. (${openType})\n`;
                });

                room.querySelectorAll(SELECTORS.decoItem).forEach((deco, dIdx) => {
                    if (deco.dataset.suspended === 'true') return;
                    const type = deco.querySelector('input[name="deco_type"]').value;
                    const w = clamp01(deco.querySelector('input[name="deco_width_m"]').value);
                    const h = clamp01(deco.querySelector('input[name="deco_height_m"]').value);
                    text += `  > รายการตกแต่ง ${dIdx + 1}: ${type} | กว้าง ${fmt(w, 2)} ม. สูง ${fmt(h, 2)} ม.\n`;
                });

                room.querySelectorAll(SELECTORS.wallpaperItem).forEach((item, wIdx) => {
                    if (item.dataset.suspended === 'true') return;
                    const h = clamp01(item.querySelector('input[name="wallpaper_height_m"]').value);
                    const widths = Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(el => fmt(clamp01(el.value), 2));
                    text += `  > วอลเปเปอร์ ${wIdx + 1}: สูง ${fmt(h, 2)} ม. | ผนังกว้าง ${widths.join(', ')} ม.\n`;
                });
                text += "\n";
            });
        }

        if (options.summary) {
            text += "-----------------------\n";
            text += `**สรุปยอดรวม**\n`;
            text += `ราคารวม: ${document.querySelector(SELECTORS.grandTotal).textContent} บ.\n`;
            text += `จำนวนจุดติดตั้ง: ${document.querySelector(SELECTORS.setCount).textContent} จุด\n`;
            text += `- ผ้าม่าน: ${document.querySelector(SELECTORS.setCountSets).textContent} จุด\n`;
            text += `- ตกแต่ง/วอลเปเปอร์: ${document.querySelector(SELECTORS.setCountDeco).textContent} จุด\n`;
            text += `ใช้ผ้าทึบ: ${document.querySelector(SELECTORS.grandFabric).textContent}\n`;
            text += `ใช้ผ้าโปร่ง: ${document.querySelector(SELECTORS.grandSheerFabric).textContent}\n`;
            text += `รางทึบ: ${document.querySelector(SELECTORS.grandOpaqueTrack).textContent}\n`;
            text += `รางโปร่ง: ${document.querySelector(SELECTORS.grandSheerTrack).textContent}\n`;
        }

        return text;
    }

    document.addEventListener('input', debounce((e) => {
        const target = e.target;
        if (target.matches('.field')) {
            recalcAll();
        } else if (target.matches('input[name="room_name"]')) {
            saveData();
        }
        if (target.matches('select[name="fabric_variant"]')) {
            toggleSetFabricUI(target.closest(SELECTORS.set));
        }
    }));

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