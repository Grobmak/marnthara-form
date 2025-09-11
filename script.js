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
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended-room');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
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
    
    async function toggleSuspendRoom(btn) {
        if (isLocked) return;
        const room = btn.closest(SELECTORS.room);
        const isSuspended = !(room.dataset.suspended === 'true');
        room.dataset.suspended = isSuspended;
        room.classList.toggle('is-suspended-room', isSuspended);
        btn.querySelector('[data-suspend-text]').textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function clearRoom(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูลห้อง', 'ยืนยันการล้างข้อมูลทั้งหมดในห้องนี้?')) return;
        const room = btn.closest(SELECTORS.room);
        room.querySelectorAll('input, select').forEach(el => { el.value = ''; });
        const setsWrap = room.querySelector(SELECTORS.setsContainer);
        setsWrap.innerHTML = '';
        const decoWrap = room.querySelector(SELECTORS.decorationsContainer);
        decoWrap.innerHTML = '';
        const wallpaperWrap = room.querySelector(SELECTORS.wallpapersContainer);
        wallpaperWrap.innerHTML = '';
        addSet(room); // Add a default empty set back
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลห้องแล้ว', 'success');
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
        let setCountSets = 0, setCountDeco = 0;

        document.querySelectorAll(SELECTORS.room).forEach((room) => { 
            let roomSum = 0;
            // Skip calculation for suspended rooms
            if (room.dataset.suspended === 'true') {
                const brief = room.querySelector('[data-room-brief]');
                if (brief) brief.innerHTML = `<span class="small-danger">ห้องถูกระงับ</span>`;
                return;
            }

            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);
            
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') {
                    set.querySelector('.row.five-col').classList.add('suspended');
                    set.querySelector('.small:last-of-type').innerHTML = `<span class="small-danger">รายการถูกระงับ</span>`;
                    return;
                }
                setCountSets++;
                set.querySelector('.row.five-col').classList.remove('suspended');

                const w = clamp01(set.querySelector('input[name="width_m"]').value), 
                    h = clamp01(set.querySelector('input[name="height_m"]').value);
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
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);
                roomSum += opaquePrice + sheerPrice; 
                grandOpaqueYards += opaqueYards; 
                grandSheerYards += sheerYards; 
                grandOpaqueTrack += opaqueTrack; 
                grandSheerTrack += sheerTrack;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                if (deco.dataset.suspended === 'true') {
                    deco.classList.add('is-suspended');
                    deco.querySelector('.small:last-of-type').innerHTML = `<span class="small-danger">รายการถูกระงับ</span>`;
                    return;
                }
                deco.classList.remove('is-suspended');
                setCountDeco++;
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const p = clamp01(deco.querySelector('[name="deco_price_sqyd"]').value);
                const sqm = w * h;
                const sqyd = sqm * SQM_TO_SQYD;
                const price = sqyd * p;
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> บ. • <span class="small">ใช้: <span class="price">${fmt(sqyd, 2)}</span> ตร.หลา</span>`;
                roomSum += price;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                if (item.dataset.suspended === 'true') {
                    item.classList.add('is-suspended');
                    item.querySelector('.small:last-of-type').innerHTML = `<span class="small-danger">รายการถูกระงับ</span>`;
                    return;
                }
                item.classList.remove('is-suspended');
                const h = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                const p = clamp01(item.querySelector('[name="wallpaper_price_roll"]').value);
                const totalWidth = Array.from(item.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const rolls = CALC.wallpaperRolls(totalWidth, h);
                const sqm = totalWidth * h;
                const price = rolls * p;
                item.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(sqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${fmt(rolls, 0)}</span> ม้วน`;
                roomSum += price;
            });
            room.querySelector('[data-room-total-price]').textContent = fmt(roomSum, 0, true);
            const brief = room.querySelector('[data-room-brief]');
            const setCountItems = room.querySelectorAll(`${SELECTORS.set}`).length;
            const decoCountItems = room.querySelectorAll(`${SELECTORS.decoItem}`).length;
            const wallpaperCountItems = room.querySelectorAll(`${SELECTORS.wallpaperItem}`).length;
            if (brief) brief.innerHTML = `<span class="num">จุด ${setCountItems}</span> • <span class="num">ชุด ${decoCountItems}</span> • <span class="num">วอล ${wallpaperCountItems}</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บาท`;
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}`).length;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
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
                roomData.sets.push({
                    width_m: toNum(set.querySelector('[name="width_m"]').value),
                    height_m: toNum(set.querySelector('[name="height_m"]').value),
                    fabric_variant: set.querySelector('[name="fabric_variant"]').value,
                    open_type: set.querySelector('[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('[name="sheer_price_per_m"]').value),
                    is_suspended: set.dataset.suspended === 'true',
                });
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                roomData.decorations.push({
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: deco.dataset.suspended === 'true',
                });
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                const widths = Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value));
                roomData.wallpapers.push({
                    height_m: toNum(item.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(item.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths,
                    is_suspended: item.dataset.suspended === 'true',
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
    }
    
    function updateLockState() {
        isLocked = document.querySelector('#lockBtn.active') !== null;
        document.querySelectorAll('input, select, .btn:not(#lockBtn):not(#menuBtn):not(#exportBtn)').forEach(el => el.disabled = isLocked);
        document.querySelectorAll('[data-act="del-room"]').forEach(btn => btn.disabled = isLocked);
    }
    
    document.addEventListener("click", e => {
        const target = e.target.closest('[data-act]');
        if (!target) {
            document.querySelectorAll('.dropdown-container .dropdown-menu').forEach(el => el.classList.remove('show'));
            return;
        }

        const action = target.dataset.act;
        switch (action) {
            case 'add-room':
            case 'add-room-header':
                addRoom(); break;
            case 'add-set': addSet(target.closest(SELECTORS.room)); break;
            case 'add-deco': addDeco(target.closest(SELECTORS.room)); break;
            case 'add-wallpaper': addWallpaper(target.closest(SELECTORS.room)); break;
            case 'add-wall': addWall(target); break;
            
            case 'del-room': delRoom(target); break;
            case 'del-set': delSet(target); break;
            case 'del-deco': delDeco(target); break;
            case 'del-wallpaper': delWallpaper(target); break;
            case 'del-wall': delWall(target); break;

            case 'clear-room': clearRoom(target); break;
            case 'clear-set': clearSet(target); break;
            case 'clear-deco': clearDeco(target); break;
            case 'clear-wallpaper': clearWallpaper(target); break;
            case 'clear-all': clearAllData(); break;
            
            case 'suspend-room': toggleSuspendRoom(target); break;
            case 'suspend-set': toggleSuspend(target); break;
            case 'suspend-deco': toggleSuspend(target); break;
            case 'suspend-wallpaper': toggleSuspend(target); break;

            case 'room-menu-btn':
            case 'set-menu-btn':
            case 'deco-menu-btn':
            case 'wallpaper-menu-btn':
                document.querySelectorAll('.dropdown-container .dropdown-menu').forEach(el => {
                    if (el !== target.nextElementSibling) el.classList.remove('show');
                });
                target.nextElementSibling.classList.toggle('show');
                break;
        }
    });

    document.addEventListener("change", debounce(e => {
        const target = e.target.closest('[name]');
        if (target) {
            if (target.name === 'fabric_variant') {
                toggleSetFabricUI(target.closest(SELECTORS.set));
            }
            recalcAll();
            saveData();
        }
    }));
    
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', e => { e.currentTarget.classList.toggle('active'); updateLockState(); showToast(isLocked ? 'ข้อมูลถูกล็อคแล้ว' : 'ปลดล็อคข้อมูลแล้ว', 'info'); });
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async () => {
        try {
            const payload = buildPayload();
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            showToast('คัดลอก JSON แล้ว', 'success');
        } catch (err) {
            showToast('คัดลอก JSON ไม่สำเร็จ', 'error');
            console.error('Failed to copy JSON: ', err);
        }
    });
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (!options) return;
        const customerInfo = options.customer ? `ลูกค้า: ${document.querySelector('input[name="customer_name"]').value}\nโทร: ${document.querySelector('input[name="customer_phone"]').value}\nที่อยู่: ${document.querySelector('input[name="customer_address"]').value}\n\n` : '';
        const roomDetails = options.details ? Array.from(document.querySelectorAll(SELECTORS.room))
            .filter(r => r.dataset.suspended !== 'true')
            .map(room => {
                let roomText = `=== ${room.querySelector(SELECTORS.roomNameInput).value || 'ไม่ระบุชื่อห้อง'} ===\n`;
                const sets = Array.from(room.querySelectorAll(SELECTORS.set)).filter(s => s.dataset.suspended !== 'true');
                const decos = Array.from(room.querySelectorAll(SELECTORS.decoItem)).filter(d => d.dataset.suspended !== 'true');
                const wallpapers = Array.from(room.querySelectorAll(SELECTORS.wallpaperItem)).filter(w => w.dataset.suspended !== 'true');
                if (sets.length > 0) {
                    roomText += `--- จุดผ้าม่าน ---\n`;
                    sets.forEach(set => {
                        const w = toNum(set.querySelector('input[name="width_m"]').value);
                        const h = toNum(set.querySelector('input[name="height_m"]').value);
                        const variant = set.querySelector('select[name="fabric_variant"]').value;
                        const open = set.querySelector('select[name="open_type"]').value;
                        roomText += `> ${variant} กว้าง ${w}ม. x สูง ${h}ม.${open ? ` (${open})` : ''}\n`;
                    });
                }
                if (decos.length > 0) {
                    roomText += `\n--- งานตกแต่ง ---\n`;
                    decos.forEach(deco => {
                        const type = deco.querySelector('[name="deco_type"]').value;
                        const w = toNum(deco.querySelector('[name="deco_width_m"]').value);
                        const h = toNum(deco.querySelector('[name="deco_height_m"]').value);
                        roomText += `> ${type} ${w > 0 ? `กว้าง ${w}ม.` : ''}${h > 0 ? ` สูง ${h}ม.` : ''}\n`;
                    });
                }
                if (wallpapers.length > 0) {
                    roomText += `\n--- วอลเปเปอร์ ---\n`;
                    wallpapers.forEach(wall => {
                        const h = toNum(wall.querySelector('[name="wallpaper_height_m"]').value);
                        const widths = Array.from(wall.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value));
                        roomText += `> สูง ${h}ม. x กว้าง ${widths.join('ม. + ')}ม.\n`;
                    });
                }
                const roomTotal = toNum(room.querySelector('[data-room-total-price]').textContent.replace(/,/g, ''));
                roomText += `\nยอดรวมห้องนี้: ${fmt(roomTotal, 0, true)} บ.\n\n`;
                return roomText;
            }).join('') : '';
        const summaryText = options.summary ? `\n\n=== สรุปยอดรวม ===\n` +
            `ราคา: ${document.querySelector('#grandTotal').textContent} บ.\n` +
            `ผ้าทึบ: ${document.querySelector('#grandFabric').textContent}\n` +
            `ผ้าโปร่ง: ${document.querySelector('#grandSheerFabric').textContent}\n` +
            `รางทึบ: ${document.querySelector('#grandOpaqueTrack').textContent}\n` +
            `รางโปร่ง: ${document.querySelector('#grandSheerTrack').textContent}\n` : '';
        const finalText = `${customerInfo}${roomDetails}${summaryText}`.trim();
        try {
            await navigator.clipboard.writeText(finalText);
            showToast('คัดลอกข้อความแล้ว', 'success');
        } catch (err) {
            showToast('คัดลอกข้อความไม่สำเร็จ', 'error');
            console.error('Failed to copy text: ', err);
        }
    });
    
    document.querySelector('#menuBtn').addEventListener('click', e => { e.preventDefault(); document.querySelector(SELECTORS.menuDropdown).classList.toggle('show'); });
    document.addEventListener('click', e => {
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