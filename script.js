(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.4.0-hotfix";
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
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;

        if (type === 'success') toast.classList.add('toast-success');
        else if (type === 'warning') toast.classList.add('toast-warning');
        else if (type === 'error') toast.classList.add('toast-error');

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
            created.querySelector(SELECTORS.roomPricePerM).value = prefill.price_per_m || "";
            created.querySelector(SELECTORS.roomStyle).value = prefill.style || "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended-room');
            }
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }
        
        const hasItems = created.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length > 0;
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
        if (prefill) {
            const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);
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
        
        const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
        setEl.querySelector("[data-opaque-yardage-label]").parentElement.classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-track-label]").parentElement.classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-sheer-yardage-label]").parentElement.classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-track-label]").parentElement.classList.toggle("hidden", !hasSheer);
    }
    
    function toggleSuspend(btn) {
        const item = btn.closest('.item-card');
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }
    
    function toggleSuspendRoom(btn) {
        const room = btn.closest(SELECTORS.room);
        const isSuspended = !(room.dataset.suspended === 'true');
        room.dataset.suspended = isSuspended;
        room.classList.toggle('is-suspended-room', isSuspended);
        recalcAll(); saveData();
        showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้ทั้งหมด? การกระทำนี้ไม่สามารถกู้คืนได้')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }

    async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); }
    async function clearDeco(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; btn.closest(SELECTORS.decoItem).querySelectorAll('input, select').forEach(el => { el.value = ''; }); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลตกแต่งแล้ว', 'success'); }
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); item.querySelectorAll('input').forEach(el => el.value = ''); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); }
    async function clearRoom(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูลในห้อง', 'ยืนยันการล้างข้อมูลทุกรายการในห้องนี้? (ข้อมูลชื่อห้อง, ราคา, และสไตล์จะยังคงอยู่)')) return;
        const room = btn.closest(SELECTORS.room);
        room.querySelector(SELECTORS.setsContainer).innerHTML = '';
        room.querySelector(SELECTORS.decorationsContainer).innerHTML = '';
        room.querySelector(SELECTORS.wallpapersContainer).innerHTML = '';
        addSet(room); // Add one empty set back
        renumber(); recalcAll(); saveData();
        showToast('ล้างข้อมูลในห้องแล้ว', 'success');
    }
    
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = `${iIdx + 1}`;
            });
        });
    }

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        let activeSetCount = 0, activeDecoCount = 0, activeWallpaperCount = 0;

        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            if (room.dataset.suspended === 'true') {
                room.querySelector('[data-room-total]').textContent = "0";
                return; // Skip calculation for suspended room
            }

            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);

            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') {
                    set.querySelector('[data-set-price-total]').textContent = "0";
                    set.querySelector('[data-set-yardage-opaque]').textContent = "0.00";
                    set.querySelector('[data-set-yardage-sheer]').textContent = "0.00";
                    set.querySelector('[data-set-opaque-track]').textContent = "0.00";
                    set.querySelector('[data-set-sheer-track]').textContent = "0.00";
                    return;
                }
                activeSetCount++;
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
                    deco.querySelector('[data-deco-sqyd]').textContent = "0.00";
                    deco.querySelector('[data-deco-price]').textContent = "0";
                    return;
                }
                activeDecoCount++;
                const w = clamp01(deco.querySelector('input[name="deco_width_m"]').value), h = clamp01(deco.querySelector('input[name="deco_height_m"]').value), price = clamp01(deco.querySelector('input[name="deco_price_sqyd"]').value);
                const sqyd = w * h * SQM_TO_SQYD;
                const total = Math.round(sqyd * price);
                deco.querySelector('[data-deco-sqyd]').textContent = fmt(sqyd, 2);
                deco.querySelector('[data-deco-price]').textContent = fmt(total, 0, true);
                roomSum += total;
            });
            
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                if (item.dataset.suspended === 'true') {
                    item.querySelector('[data-wallpaper-summary] .price:first-of-type').textContent = "0";
                    item.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = "0.00";
                    item.querySelector('[data-wallpaper-summary] .price:last-of-type').textContent = "0";
                    return;
                }
                activeWallpaperCount++;
                const h = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                const price = clamp01(item.querySelector('[name="wallpaper_price_roll"]').value);
                const totalWidth = Array.from(item.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const totalSqm = totalWidth * h;
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                const total = rollsNeeded * price;

                item.querySelector('[data-wallpaper-summary] .price:first-of-type').textContent = fmt(total, 0, true);
                item.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(totalSqm, 2);
                item.querySelector('[data-wallpaper-summary] .price:last-of-type').textContent = fmt(rollsNeeded, 0);
                roomSum += total;
            });

            room.querySelector('[data-room-total]').textContent = fmt(roomSum, 0, true);
            grand += roomSum;
        });

        const totalDecoItems = activeDecoCount + activeWallpaperCount;
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = activeSetCount + totalDecoItems;
        document.querySelector(SELECTORS.setCountSets).textContent = activeSetCount;
        document.querySelector(SELECTORS.setCountDeco).textContent = totalDecoItems;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2);
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2);
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2);
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2);
    }
    
    function buildPayload() {
        const payload = {};
        const customerInfo = document.querySelector("#customerInfo");
        payload.customer_name = customerInfo.querySelector('input[name="customer_name"]').value;
        payload.customer_phone = customerInfo.querySelector('input[name="customer_phone"]').value;
        payload.customer_address = customerInfo.querySelector('input[name="customer_address"]').value;
        payload.timestamp = new Date().toISOString();
        payload.version = APP_VERSION;
        
        payload.rooms = Array.from(document.querySelectorAll(SELECTORS.room)).map((room, rIdx) => {
            const roomData = {};
            const roomNameEl = room.querySelector(SELECTORS.roomNameInput);
            roomData.room_name = roomNameEl.value || roomNameEl.placeholder;
            roomData.price_per_m = room.querySelector(SELECTORS.roomPricePerM).value;
            roomData.style = room.querySelector(SELECTORS.roomStyle).value;
            roomData.is_suspended = room.dataset.suspended === 'true';

            roomData.sets = Array.from(room.querySelectorAll(SELECTORS.set)).map((set, sIdx) => ({
                "id": `set_${rIdx+1}_${sIdx+1}`,
                "width_m": clamp01(set.querySelector('input[name="width_m"]').value),
                "height_m": clamp01(set.querySelector('input[name="height_m"]').value),
                "is_suspended": set.dataset.suspended === 'true',
                "open_type": set.querySelector('select[name="open_type"]').value,
                "fabric_variant": set.querySelector('select[name="fabric_variant"]').value,
                "sheer_price_per_m": set.querySelector('select[name="sheer_price_per_m"]').value
            }));
            roomData.decorations = Array.from(room.querySelectorAll(SELECTORS.decoItem)).map((deco, dIdx) => ({
                "id": `deco_${rIdx+1}_${dIdx+1}`,
                "type": deco.querySelector('[name="deco_type"]').value,
                "width_m": deco.querySelector('[name="deco_width_m"]').value,
                "height_m": deco.querySelector('[name="deco_height_m"]').value,
                "price_sqyd": deco.querySelector('[name="deco_price_sqyd"]').value,
                "is_suspended": deco.dataset.suspended === 'true'
            }));
            roomData.wallpapers = Array.from(room.querySelectorAll(SELECTORS.wallpaperItem)).map((item, wIdx) => ({
                "id": `wallpaper_${rIdx+1}_${wIdx+1}`,
                "height_m": item.querySelector('[name="wallpaper_height_m"]').value,
                "price_per_roll": item.querySelector('[name="wallpaper_price_roll"]').value,
                "widths": Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value)),
                "is_suspended": item.dataset.suspended === 'true'
            }));
            return roomData;
        });
        return payload;
    }

    function generateCopyText(options) {
        const payload = buildPayload();
        let text = "";

        if (options.customer) {
            text += `--- ข้อมูลลูกค้า ---\nลูกค้า: ${payload.customer_name || "-"}\nเบอร์โทร: ${payload.customer_phone || "-"}\nรายละเอียด: ${payload.customer_address || "-"}\n`;
        }
        
        if (options.details) {
            payload.rooms.forEach(room => {
                if (room.is_suspended) return;
                text += `\n=== ห้อง: ${room.room_name} ===\n`;
                const roomPriceText = room.price_per_m ? `ราคาผ้า(ทึบ) ${fmt(toNum(room.price_per_m), 0, true)} บ./ม. | ` : "";
                const roomStyleText = room.style ? `สไตล์ ${room.style}` : "";
                text += `(${roomPriceText}${roomStyleText})\n`;

                room.sets.forEach((set, sIdx) => {
                    if (set.is_suspended) return;
                    text += `\nจุดผ้าม่านที่ ${sIdx+1}:\n - กว้าง ${fmt(set.width_m, 2)} ม.\n - สูง ${fmt(set.height_m, 2)} ม.\n - ประเภทผ้า: ${set.fabric_variant}\n - ลักษณะเปิด: ${set.open_type || "-"}\n`;
                });
                room.decorations.forEach((deco, dIdx) => {
                    if (deco.is_suspended) return;
                    text += `\nรายการตกแต่งที่ ${dIdx+1}:\n - ประเภท: ${deco.type}\n - ราคา: ${fmt(toNum(deco.price_sqyd), 0, true)} บ./หลา\n - ขนาด: กว้าง ${deco.width_m || 0} ม. x ยาว ${deco.height_m || 0} ม.\n`;
                });
                room.wallpapers.forEach((item, wIdx) => {
                    if (item.is_suspended) return;
                    const totalWidth = item.widths.reduce((sum, w) => sum + w, 0);
                    text += `\nรายการวอลเปเปอร์ที่ ${wIdx+1}:\n - ราคา: ${fmt(toNum(item.price_per_roll), 0, true)} บ./ม้วน\n - ความสูง: ${item.height_m} ม.\n - ความกว้างผนังรวม: ${fmt(totalWidth, 2)} ม.\n`;
                });
            });
        }
        
        if (options.summary) {
            const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;
            text += `\n--- สรุปยอดรวม ---\nราคารวม: ${grandTotal} บ.\nจำนวนจุดรวม: ${document.querySelector(SELECTORS.setCount).textContent}\nผ้าม่าน (ชุด): ${document.querySelector(SELECTORS.setCountSets).textContent}\nตกแต่งเพิ่ม (ชุด): ${document.querySelector(SELECTORS.setCountDeco).textContent}\n`;
        }
        return text.trim();
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const lockText = lockBtn.querySelector('.lock-text');
        const lockIcon = lockBtn.querySelector('.lock-icon');
        
        isLocked = lockBtn.dataset.locked === 'true';
        const allControls = document.querySelectorAll('input, select, textarea, button');
        
        allControls.forEach(el => {
            // Unlock all buttons first, then disable based on lock state
            el.disabled = false;
            if (isLocked) {
                // In locked state, only lockBtn and menuBtn should be enabled
                if (el.id !== 'lockBtn' && el.id !== 'menuBtn') {
                    el.disabled = true;
                }
            }
        });

        if (isLocked) {
            lockText.textContent = 'ปลดล็อค';
            lockIcon.textContent = 'lock';
        } else {
            lockText.textContent = 'ล็อค';
            lockIcon.textContent = 'lock_open';
        }
    }


    // --- Event Listeners ---
    document.addEventListener('input', debounce(e => {
        recalcAll();
        saveData();
        if (e.target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
    }));

    document.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-act]');
        if (!target) {
            // If the click is outside any menu, close them
            const openMenus = document.querySelectorAll('.menu-dropdown.show, .room-menu-dropdown.show');
            if (openMenus.length > 0 && !e.target.closest('.menu-container, .room-menu-container')) {
                openMenus.forEach(menu => menu.classList.remove('show'));
            }
            return;
        }
        
        const action = target.dataset.act;

        switch (action) {
            case 'add-set': addSet(target.closest(SELECTORS.room)); break;
            case 'add-deco': addDeco(target.closest(SELECTORS.room)); break;
            case 'add-wallpaper': addWallpaper(target.closest(SELECTORS.room)); break;
            case 'add-wall': addWall(target); break;
            case 'del-room': await delRoom(target); break;
            case 'del-set': await delSet(target); break;
            case 'del-deco': await delDeco(target); break;
            case 'del-wallpaper': await delWallpaper(target); break;
            case 'del-wall': await delWall(target); break;
            case 'clear-set': await clearSet(target); break;
            case 'clear-deco': await clearDeco(target); break;
            case 'clear-wallpaper': await clearWallpaper(target); break;
            case 'clear-room': await clearRoom(target); break;
            case 'suspend-item': toggleSuspend(target); break;
            case 'suspend-room': toggleSuspendRoom(target); break;
            case 'toggle-room-menu':
                e.stopPropagation();
                target.closest('.room-menu-container').querySelector('.room-menu-dropdown').classList.toggle('show');
                return; // Prevent immediate closing
            default: break;
        }

        // Close all menus after an action is performed
        document.querySelectorAll('.room-menu-dropdown.show, .menu-dropdown.show').forEach(menu => menu.classList.remove('show'));
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        const btn = document.querySelector(SELECTORS.lockBtn);
        btn.dataset.locked = btn.dataset.locked === 'true' ? 'false' : 'true';
        updateLockState();
    });

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2))
            .then(() => showToast("คัดลอก JSON แล้ว", 'success'))
            .catch(() => showToast("ไม่สามารถคัดลอก JSON ได้", 'error'));
    });
    
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (!options) return;
        navigator.clipboard.writeText(generateCopyText(options))
            .then(() => showToast("คัดลอกข้อความแล้ว", 'success'))
            .catch(() => showToast("ไม่สามารถคัดลอกข้อความได้", 'error'));
    });
    
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => document.querySelector(SELECTORS.importModal).classList.add('visible'));
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => document.querySelector(SELECTORS.importModal).classList.remove('visible'));
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const payload = JSON.parse(jsonText);
            document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
            document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
            document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
            roomsEl.innerHTML = ""; roomCount = 0;
            if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
            else addRoom();
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
        } catch (err) {
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
        }
    });
    
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(buildPayload(), null, 2));
        a.download = "marnthara_data.json";
        a.click();
        a.remove();
        showToast("ส่งออกข้อมูลเป็นไฟล์ JSON แล้ว", 'success');
    });
    
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });

    orderForm.addEventListener("submit", (e) => {
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
                roomsEl.innerHTML = ""; roomCount = 0;
                if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
                else addRoom();
            } catch(err) {
                localStorage.removeItem(STORAGE_KEY); addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
    });
})();