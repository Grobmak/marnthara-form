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
        const item = btn.closest('.set, .deco-item, .wallpaper-item, .room');
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        btn.querySelector('[data-suspend-text]').textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }
    
    async function clearRoom(btn) {
        if (isLocked || !await showConfirmation('ล้างห้อง', 'ยืนยันการล้างข้อมูลทั้งหมดในห้องนี้?')) return;
        const room = btn.closest(SELECTORS.room);
        room.querySelector(SELECTORS.roomNameInput).value = '';
        room.querySelector(SELECTORS.roomPricePerM).value = '';
        room.querySelector(SELECTORS.roomStyle).value = '';
        room.querySelector(SELECTORS.setsContainer).innerHTML = '';
        room.querySelector(SELECTORS.decorationsContainer).innerHTML = '';
        room.querySelector(SELECTORS.wallpapersContainer).innerHTML = '';
        addSet(room); // Add a default set back
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลห้องแล้ว', 'success');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); } async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); } async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); item.querySelectorAll('input').forEach(el => el.value = ''); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); } async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); } function renumber() { document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => { const input = room.querySelector(SELECTORS.roomNameInput); if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`; const sets = Array.from(room.querySelectorAll(SELECTORS.set)); const decoItems = Array.from(room.querySelectorAll(SELECTORS.decoItem)); const wallpaperItems = Array.from(room.querySelectorAll(SELECTORS.wallpaperItem)); const allItems = [...sets, ...decoItems, ...wallpaperItems]; const activeSets = sets.filter(s => s.dataset.suspended !== 'true'); const activeDeco = decoItems.filter(d => d.dataset.suspended !== 'true'); const activeWallpaper = wallpaperItems.filter(w => w.dataset.suspended !== 'true'); room.querySelector('[data-room-brief] .num:nth-child(1)').textContent = activeSets.length + activeDeco.length + activeWallpaper.length; room.querySelector('[data-room-brief] .num:nth-child(2)').textContent = activeSets.length; }); document.querySelectorAll(SELECTORS.set).forEach((set, sIdx) => { const lbl = set.querySelector("[data-item-title]"); if (lbl) lbl.textContent = `${sIdx + 1}`; }); document.querySelectorAll(SELECTORS.decoItem).forEach((deco, dIdx) => { const lbl = deco.querySelector("[data-item-title]"); if (lbl) lbl.textContent = `${dIdx + 1}`; }); document.querySelectorAll(SELECTORS.wallpaperItem).forEach((item, wIdx) => { const lbl = item.querySelector("[data-item-title]"); if (lbl) lbl.textContent = `${wIdx + 1}`; }); } function recalcAll() { let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0; let grandOpaqueTrack = 0, grandSheerTrack = 0; let totalSets = 0, totalDeco = 0; document.querySelectorAll(SELECTORS.room).forEach((room) => { let roomSum = 0; const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value); const basePrice = toNum(baseRaw); const style = room.querySelector(SELECTORS.roomStyle)?.value || ""; const styleSurcharge = stylePlus(style); const sets = room.querySelectorAll(SELECTORS.set); const decorations = room.querySelectorAll(SELECTORS.decoItem); const wallpapers = room.querySelectorAll(SELECTORS.wallpaperItem); sets.forEach(set => { if (set.dataset.suspended === 'true') return; totalSets++; const width = clamp01(set.querySelector('[name="width_m"]').value); const height = clamp01(set.querySelector('[name="height_m"]').value); const variant = set.querySelector('[name="fabric_variant"]').value; const sheerPriceRaw = toNum(set.querySelector('[name="sheer_price_per_m"]').value); const sheerPrice = toNum(sheerPriceRaw); const heightSurcharge = heightPlus(height) * width; const opaqueYardage = CALC.fabricYardage(style, width); const opaquePrice = opaqueYardage * basePrice + width * heightSurcharge + styleSurcharge * width; const sheerYardage = CALC.fabricYardage(style, width); const sheerPriceTotal = sheerYardage * sheerPrice + width * heightSurcharge + styleSurcharge * width; const opaqueTrack = width; const sheerTrack = width; if (variant === "ทึบ") { roomSum += opaquePrice; grandOpaqueYards += opaqueYardage; grandOpaqueTrack += opaqueTrack; } else if (variant === "โปร่ง") { roomSum += sheerPriceTotal; grandSheerYards += sheerYardage; grandSheerTrack += sheerTrack; } else if (variant === "ทึบ&โปร่ง") { roomSum += opaquePrice + sheerPriceTotal; grandOpaqueYards += opaqueYardage; grandSheerYards += sheerYardage; grandOpaqueTrack += opaqueTrack; grandSheerTrack += sheerTrack; } set.querySelector('[data-opaque-price-label]').textContent = `ราคา: ${fmt(opaquePrice, 0, true)} บ.`; set.querySelector('[data-sheer-price-label]').textContent = `ราคา: ${fmt(sheerPriceTotal, 0, true)} บ.`; set.querySelector('[data-opaque-yardage-label]').textContent = `ผ้า: ${fmt(opaqueYardage, 2)} หลา`; set.querySelector('[data-sheer-yardage-label]').textContent = `ผ้าโปร่ง: ${fmt(sheerYardage, 2)} หลา`; set.querySelector('[data-opaque-track-label]').textContent = `ราง: ${fmt(opaqueTrack, 2)} ม.`; set.querySelector('[data-sheer-track-label]').textContent = `รางโปร่ง: ${fmt(sheerTrack, 2)} ม.`; }); decorations.forEach(deco => { if (deco.dataset.suspended === 'true') return; totalDeco++; const width = clamp01(deco.querySelector('[name="deco_width_m"]').value); const height = clamp01(deco.querySelector('[name="deco_height_m"]').value); const priceSqYd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value); const areaSqM = width * height; const areaSqYd = areaSqM * SQM_TO_SQYD; const price = areaSqYd * priceSqYd; roomSum += price; deco.querySelector(".price").textContent = fmt(price, 0, true); }); wallpapers.forEach(wallpaper => { if (wallpaper.dataset.suspended === 'true') return; const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value); const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value); const walls = wallpaper.querySelectorAll('[name="wall_width_m"]'); const totalWidth = Array.from(walls).reduce((sum, el) => sum + clamp01(el.value), 0); const areaSqM = totalWidth * height; const rollsNeeded = CALC.wallpaperRolls(totalWidth, height); const price = rollsNeeded * pricePerRoll; roomSum += price; wallpaper.querySelector('[data-wallpaper-summary] .price:nth-child(1)').textContent = fmt(price, 0, true); wallpaper.querySelector('[data-wallpaper-summary] .price:nth-child(2)').textContent = fmt(areaSqM, 2); wallpaper.querySelector('[data-wallpaper-summary] .price:nth-child(3)').textContent = fmt(rollsNeeded, 0); }); grand += roomSum; room.querySelector('[data-room-total] .price').textContent = fmt(roomSum, 0, true); room.querySelector('[data-room-brief] .num:nth-child(3)').textContent = fmt(roomSum, 0, true); }); document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true); document.querySelector(SELECTORS.setCount).textContent = totalSets + totalDeco; document.querySelector(SELECTORS.setCountSets).textContent = totalSets; document.querySelector(SELECTORS.setCountDeco).textContent = totalDeco; document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`; document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`; document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`; document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`; } function buildPayload() { const payload = {}; const customer = document.getElementById('customerInfo'); payload.customer_name = customer.querySelector('[name="customer_name"]').value; payload.customer_phone = customer.querySelector('[name="customer_phone"]').value; payload.customer_address = customer.querySelector('[name="customer_address"]').value; payload.rooms = Array.from(document.querySelectorAll(SELECTORS.room)).map(room => { const roomData = { room_name: room.querySelector('[name="room_name"]').value, price_per_m_raw: room.querySelector('[name="room_price_per_m"]').value, style: room.querySelector('[name="room_style"]').value, is_suspended: room.dataset.suspended === 'true' }; const sets = Array.from(room.querySelectorAll(SELECTORS.set)).map(set => ({ width_m: set.querySelector('[name="width_m"]').value, height_m: set.querySelector('[name="height_m"]').value, fabric_variant: set.querySelector('[name="fabric_variant"]').value, open_type: set.querySelector('[name="open_type"]').value, sheer_price_per_m: set.querySelector('[name="sheer_price_per_m"]').value, is_suspended: set.dataset.suspended === 'true' })); const decorations = Array.from(room.querySelectorAll(SELECTORS.decoItem)).map(deco => ({ type: deco.querySelector('[name="deco_type"]').value, width_m: deco.querySelector('[name="deco_width_m"]').value, height_m: deco.querySelector('[name="deco_height_m"]').value, price_sqyd: deco.querySelector('[name="deco_price_sqyd"]').value, is_suspended: deco.dataset.suspended === 'true' })); const wallpapers = Array.from(room.querySelectorAll(SELECTORS.wallpaperItem)).map(wallpaper => ({ height_m: wallpaper.querySelector('[name="wallpaper_height_m"]').value, price_per_roll: wallpaper.querySelector('[name="wallpaper_price_roll"]').value, is_suspended: wallpaper.dataset.suspended === 'true', widths: Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => el.value) })); roomData.sets = sets; roomData.decorations = decorations; roomData.wallpapers = wallpapers; return roomData; }); return payload; } function saveData() { const payload = buildPayload(); localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } function updateLockState() { isLocked = document.querySelectorAll(SELECTORS.room).length === 0; document.querySelector(SELECTORS.clearAllBtn).disabled = isLocked; document.querySelector(SELECTORS.lockBtn).disabled = isLocked; document.querySelector(SELECTORS.submitBtn).disabled = isLocked; } // Event Listeners document.addEventListener('click', e => { const act = e.target.closest('[data-act]')?.dataset.act; switch (act) { case 'add-set': addSet(e.target.closest(SELECTORS.room)); break; case 'add-deco': addDeco(e.target.closest(SELECTORS.room)); break; case 'add-wallpaper': addWallpaper(e.target.closest(SELECTORS.room)); break; case 'add-room': addRoom(); break; case 'add-wall': addWall(e.target); break; case 'del-room': delRoom(e.target); break; case 'del-set': delSet(e.target); break; case 'del-deco': delDeco(e.target); break; case 'del-wallpaper': delWallpaper(e.target); break; case 'del-wall': delWall(e.target); break; case 'clear-set': clearSet(e.target); break; case 'clear-deco': clearDeco(e.target); break; case 'clear-wallpaper': clearWallpaper(e.target); break; case 'clear-room': clearRoom(e.target); break; case 'suspend-room': toggleSuspend(e.target); break; case 'suspend-set': toggleSuspend(e.target); break; case 'suspend-deco': toggleSuspend(e.target); break; case 'suspend-wallpaper': toggleSuspend(e.target); break; default: break; } }); orderForm.addEventListener('input', debounce(() => { recalcAll(); saveData(); })); orderForm.addEventListener('change', debounce(() => { recalcAll(); saveData(); })); document.getElementById('clearAllBtn').addEventListener('click', clearAllData); document.getElementById('lockBtn').addEventListener('click', (e) => { const lockBtn = e.currentTarget; isLocked = !isLocked; document.querySelectorAll('input, select, button').forEach(el => { if (el !== lockBtn && el !== document.getElementById('addRoomHeaderBtn')) el.disabled = isLocked; }); lockBtn.innerHTML = isLocked ? '<span class="lock-text">ปลดล็อค</span> <span class="lock-icon">🔓</span>' : '<span class="lock-text">ล็อค</span> <span class="lock-icon">🔒</span>'; if (isLocked) showToast('ล็อกข้อมูลแล้ว', 'warning'); else showToast('ปลดล็อกข้อมูลแล้ว', 'success'); }); document.getElementById('addRoomHeaderBtn').addEventListener('click', () => addRoom()); document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => { const payload = buildPayload(); navigator.clipboard.writeText(JSON.stringify(payload, null, 2)) .then(() => showToast('คัดลอก JSON แล้ว', 'success')) .catch(err => console.error('Failed to copy JSON:', err)); }); document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => { const options = await showCopyOptionsModal(); if (!options) return; const payload = buildPayload(); let text = ""; if (options.customer) { text += `ลูกค้า: ${payload.customer_name}\n`; text += `เบอร์โทร: ${payload.customer_phone}\n`; text += `ที่อยู่/รายละเอียด: ${payload.customer_address}\n\n`; } const activeRooms = payload.rooms.filter(room => room.is_suspended !== true); if (options.details && activeRooms.length > 0) { activeRooms.forEach(room => { text += `--- ${room.room_name || "ห้อง"} ---\n`; if (room.sets && room.sets.length > 0) { const activeSets = room.sets.filter(s => s.is_suspended !== true); text += `ผ้าม่าน (${activeSets.length} จุด)\n`; activeSets.forEach((set, sIdx) => { const width = toNum(set.width_m); const height = toNum(set.height_m); const variant = set.fabric_variant; const style = room.style; const basePrice = toNum(room.price_per_m_raw); const sheerPrice = toNum(set.sheer_price_per_m); const opaqueYardage = CALC.fabricYardage(style, width); const sheerYardage = CALC.fabricYardage(style, width); const styleSurcharge = stylePlus(style) * width; const heightSurcharge = heightPlus(height) * width; text += `- จุดที่ ${sIdx + 1} กว้าง ${width}ม. สูง ${height}ม. (${variant})\n`; if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") { text += `  > ผ้าทึบ: ${fmt(opaqueYardage, 2)} หลา ราคา: ${fmt(opaqueYardage * basePrice + heightSurcharge + styleSurcharge, 0, true)} บ.\n`; text += `  > ราง: ${fmt(width, 2)} ม.\n`; } if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") { text += `  > ผ้าโปร่ง: ${fmt(sheerYardage, 2)} หลา ราคา: ${fmt(sheerYardage * sheerPrice + heightSurcharge + styleSurcharge, 0, true)} บ.\n`; text += `  > รางโปร่ง: ${fmt(width, 2)} ม.\n`; } }); } if (room.decorations && room.decorations.length > 0) { const activeDeco = room.decorations.filter(d => d.is_suspended !== true); if (activeDeco.length > 0) text += `ตกแต่ง (${activeDeco.length} รายการ)\n`; activeDeco.forEach(deco => { const width = toNum(deco.width_m); const height = toNum(deco.height_m); const priceSqYd = toNum(deco.price_sqyd); const price = (width * height * SQM_TO_SQYD) * priceSqYd; text += `- ${deco.type} กว้าง ${width}ม. สูง ${height}ม. ราคา: ${fmt(price, 0, true)} บ.\n`; }); } if (room.wallpapers && room.wallpapers.length > 0) { const activeWallpaper = room.wallpapers.filter(w => w.is_suspended !== true); if (activeWallpaper.length > 0) text += `วอลเปเปอร์ (${activeWallpaper.length} รายการ)\n`; activeWallpaper.forEach(wallpaper => { const height = toNum(wallpaper.height_m); const price = toNum(wallpaper.price_per_roll); const widths = wallpaper.widths.map(toNum).filter(n => n > 0); const totalWidth = widths.reduce((sum, w) => sum + w, 0); const rolls = CALC.wallpaperRolls(totalWidth, height); text += `- สูง ${height}ม. กว้างรวม ${totalWidth}ม. ใช้ ${rolls} ม้วน ราคา: ${fmt(rolls * price, 0, true)} บ.\n`; }); } text += "\n"; }); } if (options.summary) { const grandTotal = toNum(document.querySelector(SELECTORS.grandTotal).textContent); const setCount = toNum(document.querySelector(SELECTORS.setCount).textContent); const grandOpaqueYards = toNum(document.querySelector(SELECTORS.grandFabric).textContent.replace(' หลา', '')); const grandSheerYards = toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent.replace(' หลา', '')); const grandOpaqueTrack = toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent.replace(' ม.', '')); const grandSheerTrack = toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent.replace(' ม.', '')); text += `--- สรุปยอดรวม ---\n`; text += `ราคารวม: ${fmt(grandTotal, 0, true)} บ.\n`; text += `จำนวนจุด: ${setCount} จุด\n`; text += `ผ้าทึบที่ใช้: ${fmt(grandOpaqueYards, 2)} หลา\n`; text += `ผ้าโปร่งที่ใช้: ${fmt(grandSheerYards, 2)} หลา\n`; text += `รางทึบที่ใช้: ${fmt(grandOpaqueTrack, 2)} ม.\n`; text += `รางโปร่งที่ใช้: ${fmt(grandSheerTrack, 2)} ม.\n`; } navigator.clipboard.writeText(text).then(() => showToast('คัดลอกข้อความแล้ว', 'success')).catch(err => console.error('Failed to copy text:', err)); }); document.getElementById('menuBtn').addEventListener('click', e => { e.stopPropagation(); document.getElementById('menuDropdown').classList.toggle('show'); }); document.addEventListener('click', e => { const menuDropdown = document.querySelector(SELECTORS.menuDropdown); if (!menuDropdown.contains(e.target) && !document.querySelector(SELECTORS.menuBtn).contains(e.target)) { menuDropdown.classList.remove('show'); } }); document.addEventListener('click', e => { const btn = e.target.closest('[data-act="room-menu-btn"]'); if (btn) { e.stopPropagation(); const dropdown = btn.nextElementSibling; document.querySelectorAll('.room-menu-dropdown.show').forEach(d => { if (d !== dropdown) d.classList.remove('show'); }); dropdown.classList.toggle('show'); } else if (!e.target.closest('.menu-room')) { document.querySelectorAll('.room-menu-dropdown.show').forEach(d => d.classList.remove('show')); } }); orderForm.addEventListener("submit", (e) => { const payload = buildPayload(); document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload); showToast("ส่งข้อมูลแล้ว...", "success"); }); window.addEventListener('load', () => { const storedData = localStorage.getItem(STORAGE_KEY); if (storedData) { try { const payload = JSON.parse(storedData); document.querySelector('input[name="customer_name"]').value = payload.customer_name; document.querySelector('input[name="customer_address"]').value = payload.customer_address; document.querySelector('input[name="customer_phone"]').value = payload.customer_phone; roomsEl.innerHTML = ""; roomCount = 0; if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom); else addRoom(); } catch(err) { console.error("Failed to load data from storage:", err); localStorage.removeItem(STORAGE_KEY); addRoom(); } } else { addRoom(); } updateLockState(); }); })();