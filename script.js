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
        setEl.querySelector('[data-set-options-row]').classList.toggle("three-col", variant === "ทึบ&โปร่ง");
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
        let sets = 0, decos = 0, wallpapers = 0;

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            let roomTotal = 0;
            const pricePerM = toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value);
            const style = roomEl.querySelector(SELECTORS.roomStyle).value;
            
            // Sets
            roomEl.querySelectorAll(SELECTORS.set).forEach(set => {
                const isSuspended = set.dataset.suspended === 'true';
                if (isSuspended) return;

                sets++;
                const width = clamp01(set.querySelector('[name="width_m"]').value);
                const height = clamp01(set.querySelector('[name="height_m"]').value);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                const sheerPricePerM = toNum(set.querySelector('select[name="sheer_price_per_m"]').value);

                let setTotal = 0, opaqueTotal = 0, sheerTotal = 0;
                let opaqueYards = 0, sheerYards = 0;
                let opaqueTrack = 0, sheerTrack = 0;
                
                const styleSurcharge = stylePlus(style);
                const heightSurcharge = heightPlus(height);

                if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                    opaqueYards = CALC.fabricYardage(style, width);
                    opaqueTrack = width;
                    opaqueTotal = (opaqueYards * 0.9 * pricePerM) + (opaqueTrack * heightSurcharge) + styleSurcharge;
                    grandOpaqueYards += opaqueYards;
                    grandOpaqueTrack += opaqueTrack;
                    setTotal += opaqueTotal;
                }
                if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                    sheerYards = CALC.fabricYardage(style, width);
                    sheerTrack = width;
                    sheerTotal = (sheerYards * 0.9 * sheerPricePerM) + (sheerTrack * heightSurcharge) + styleSurcharge;
                    grandSheerYards += sheerYards;
                    grandSheerTrack += sheerTrack;
                    setTotal += sheerTotal;
                }
                
                set.querySelector('[data-set-total]').textContent = fmt(setTotal, 0, true);
                roomTotal += setTotal;
            });

            // Decorations
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isSuspended = deco.dataset.suspended === 'true';
                if (isSuspended) return;

                decos++;
                const width = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const height = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const pricePerSqYd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);

                const areaSqM = width * height;
                const areaSqYd = areaSqM * SQM_TO_SQYD;
                const decoTotal = areaSqYd * pricePerSqYd;
                
                deco.querySelector('[data-deco-area]').textContent = fmt(areaSqYd, 2);
                deco.querySelector('[data-deco-total]').textContent = fmt(decoTotal, 0, true);
                roomTotal += decoTotal;
            });

            // Wallpapers
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const isSuspended = wallpaper.dataset.suspended === 'true';
                if (isSuspended) return;

                wallpapers++;
                const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                
                let totalWidth = 0;
                wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(wallWidthInput => {
                    totalWidth += clamp01(wallWidthInput.value);
                });

                const rollsNeeded = CALC.wallpaperRolls(totalWidth, height);
                const wallpaperTotal = rollsNeeded * pricePerRoll;
                const areaSqM = totalWidth * height;

                wallpaper.querySelector('.price').textContent = fmt(wallpaperTotal, 0, true);
                wallpaper.querySelector('[data-wallpaper-summary]').textContent = 
                    `ราคา: ${fmt(wallpaperTotal, 0, true)} บ. • พื้นที่: ${fmt(areaSqM, 2)} ตร.ม. • ใช้ ${fmt(rollsNeeded, 0)} ม้วน`;
                roomTotal += wallpaperTotal;
            });

            roomEl.querySelector('[data-room-total] .price').textContent = fmt(roomTotal, 0, true);
            roomEl.querySelector('[data-room-brief] .num.price').textContent = fmt(roomTotal, 0, true);
            roomEl.querySelector('[data-room-brief] .num').textContent = sets;
            grand += roomTotal;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = sets + decos + wallpapers;
        document.querySelector(SELECTORS.setCountSets).textContent = sets;
        document.querySelector(SELECTORS.setCountDeco).textContent = decos + wallpapers;

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
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value),
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(set => {
                roomData.sets.push({
                    width_m: toNum(set.querySelector('[name="width_m"]').value),
                    height_m: toNum(set.querySelector('[name="height_m"]').value),
                    open_type: set.querySelector('[name="open_type"]').value,
                    fabric_variant: set.querySelector('[name="fabric_variant"]').value,
                    sheer_price_per_m: toNum(set.querySelector('[name="sheer_price_per_m"]').value),
                    is_suspended: set.dataset.suspended === 'true'
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                roomData.decorations.push({
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: deco.dataset.suspended === 'true'
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const widths = [];
                wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(w => widths.push(toNum(w.value)));
                roomData.wallpapers.push({
                    height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths,
                    is_suspended: wallpaper.dataset.suspended === 'true'
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function buildCopyText(options) {
        let text = "";
        const payload = buildPayload();
        
        if (options.customer) {
            text += `ลูกค้า: ${payload.customer_name}\n`;
            text += `โทร: ${payload.customer_phone}\n`;
            if (payload.customer_address) text += `รายละเอียด: ${payload.customer_address}\n`;
            text += `------------------------\n`;
        }

        if (options.details) {
            payload.rooms.forEach(room => {
                let roomText = `*ห้อง ${room.room_name}* \n`;
                roomText += `สไตล์: ${room.style}\n`;
                
                room.sets.forEach((set, i) => {
                    const suspendedNote = set.is_suspended ? ' (ระงับ)' : '';
                    roomText += `  > จุด ${i + 1} ${suspendedNote}\n`;
                    roomText += `    ขนาด: กว้าง ${set.width_m}ม. x สูง ${set.height_m}ม.\n`;
                    roomText += `    ชนิด: ${set.fabric_variant}\n`;
                });
                room.decorations.forEach((deco, i) => {
                    const suspendedNote = deco.is_suspended ? ' (ระงับ)' : '';
                    roomText += `  > ตกแต่ง ${i + 1} ${suspendedNote}\n`;
                    roomText += `    ประเภท: ${deco.type}\n`;
                    roomText += `    ขนาด: กว้าง ${deco.width_m}ม. x สูง ${deco.height_m}ม.\n`;
                });
                room.wallpapers.forEach((wp, i) => {
                    const suspendedNote = wp.is_suspended ? ' (ระงับ)' : '';
                    roomText += `  > วอลเปเปอร์ ${i + 1} ${suspendedNote}\n`;
                    roomText += `    ความสูง: ${wp.height_m}ม.\n`;
                    roomText += `    ความกว้าง: ${wp.widths.join(', ')}ม.\n`;
                });
                text += roomText;
            });
            text += `\n------------------------\n`;
        }

        if (options.summary) {
            const grandTotal = toNum(document.querySelector(SELECTORS.grandTotal).textContent);
            const grandOpaqueYards = toNum(document.querySelector(SELECTORS.grandFabric).textContent.replace(' หลา', ''));
            const grandSheerYards = toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent.replace(' หลา', ''));
            const grandOpaqueTrack = toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent.replace(' ม.', ''));
            const grandSheerTrack = toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent.replace(' ม.', ''));

            text += `*สรุปวัสดุและค่าใช้จ่าย*\n`;
            text += `ใช้ผ้าทึบ: ${fmt(grandOpaqueYards, 2)} หลา\n`;
            text += `ใช้ผ้าโปร่ง: ${fmt(grandSheerYards, 2)} หลา\n`;
            text += `รางทึบ: ${fmt(grandOpaqueTrack, 2)} ม.\n`;
            text += `รางโปร่ง: ${fmt(grandSheerTrack, 2)} ม.\n`;
            text += `รวมทั้งหมด: ${fmt(grandTotal, 0, true)} บ.\n`;
        }

        return text;
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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
            }
        } else {
            addRoom();
        }
        updateLockState();
    }
    
    function updateLockState() {
        isLocked = document.querySelectorAll(SELECTORS.room).length > 0 &&
                   (document.querySelector(SELECTORS.set) || 
                    document.querySelector(SELECTORS.decoItem) ||
                    document.querySelector(SELECTORS.wallpaperItem)) &&
                   document.querySelector(SELECTORS.lockBtn).dataset.locked === 'true';
    
        const items = document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
        items.forEach(item => {
            const inputs = item.querySelectorAll('input, select');
            if (isLocked) inputs.forEach(input => input.setAttribute('readonly', 'readonly'));
            else inputs.forEach(input => input.removeAttribute('readonly'));
        });
    }

    function init() {
        document.addEventListener('input', debounce(e => {
            const target = e.target;
            const set = target.closest(SELECTORS.set);
            const deco = target.closest(SELECTORS.decoItem);
            const wallpaper = target.closest(SELECTORS.wallpaperItem);

            if (target.name === 'fabric_variant' && set) toggleSetFabricUI(set);
            if (set || deco || wallpaper || target.name.startsWith('customer_')) {
                recalcAll();
                saveData();
            }
        }));

        document.addEventListener('click', async e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const act = btn.dataset.act;

            if (act === 'add-room') addRoom(null);
            else if (act === 'add-set') addSet(btn.closest(SELECTORS.room));
            else if (act === 'add-deco') addDeco(btn.closest(SELECTORS.room));
            else if (act === 'add-wallpaper') addWallpaper(btn.closest(SELECTORS.room));
            else if (act === 'add-wall') addWall(btn);
            else if (act === 'del-room-menu') await delRoom(btn);
            else if (act === 'del-set') await delSet(btn);
            else if (act === 'del-deco') await delDeco(btn);
            else if (act === 'del-wallpaper') await delWallpaper(btn);
            else if (act === 'del-wall') await delWall(btn);
            else if (act === 'clear-room') {
                const room = btn.closest(SELECTORS.room);
                if (!await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในห้องนี้?')) return;
                room.querySelectorAll('.set, .deco-item, .wallpaper-item').forEach(item => item.remove());
                addSet(room);
                renumber(); recalcAll(); saveData();
                showToast('ล้างข้อมูลในห้องแล้ว', 'success');
            }
            else if (act === 'clear-set') await clearSet(btn);
            else if (act === 'clear-deco') await clearDeco(btn);
            else if (act === 'clear-wallpaper') await clearWallpaper(btn);
            else if (act === 'suspend-set') toggleSuspend(btn);
            else if (act === 'suspend-deco') toggleSuspend(btn);
            else if (act === 'suspend-wallpaper') toggleSuspend(btn);
            else if (act === 'del-room') await delRoom(btn);
            else if (act === 'clear-all') await clearAllData();
            else if (act === 'copy-text') {
                const options = await showCopyOptionsModal();
                if (options) {
                    const textToCopy = buildCopyText(options);
                    navigator.clipboard.writeText(textToCopy).then(() => showToast("คัดลอกข้อความแล้ว", "success")).catch(err => console.error("Failed to copy text:", err));
                }
            } else if (act === 'copy-json') {
                const jsonToCopy = JSON.stringify(buildPayload(), null, 2);
                navigator.clipboard.writeText(jsonToCopy).then(() => showToast("คัดลอก JSON แล้ว", "success")).catch(err => console.error("Failed to copy JSON:", err));
            } else if (act === 'room-menu') {
                const dropdown = btn.closest('.menu-dropdown-container').querySelector('.menu-dropdown');
                dropdown.classList.toggle('show');
            } else if (act === 'set-menu') {
                const dropdown = btn.closest('.menu-dropdown-container').querySelector('.menu-dropdown');
                dropdown.classList.toggle('show');
            } else if (act === 'deco-menu') {
                const dropdown = btn.closest('.menu-dropdown-container').querySelector('.menu-dropdown');
                dropdown.classList.toggle('show');
            } else if (act === 'wallpaper-menu') {
                const dropdown = btn.closest('.menu-dropdown-container').querySelector('.menu-dropdown');
                dropdown.classList.toggle('show');
            } else if (btn.id === 'menuBtn') {
                document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
            } else if (btn.id === 'importBtn') {
                document.querySelector(SELECTORS.importModal).classList.add('visible');
            } else if (btn.id === 'importCancel') {
                document.querySelector(SELECTORS.importModal).classList.remove('visible');
            } else if (btn.id === 'importConfirm') {
                try {
                    const data = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
                    document.querySelector('input[name="customer_name"]').value = data.customer_name;
                    document.querySelector('input[name="customer_phone"]').value = data.customer_phone;
                    document.querySelector('input[name="customer_address"]').value = data.customer_address;
                    roomsEl.innerHTML = ""; roomCount = 0;
                    if (data.rooms && data.rooms.length > 0) data.rooms.forEach(addRoom);
                    else addRoom();
                    saveData();
                    updateLockState();
                    document.querySelector(SELECTORS.importModal).classList.remove('visible');
                    showToast('นำเข้าข้อมูลสำเร็จแล้ว', 'success');
                } catch(e) {
                    showToast('รูปแบบข้อมูลไม่ถูกต้อง', 'error');
                }
            } else if (btn.id === 'exportBtn') {
                const payload = buildPayload();
                const jsonStr = JSON.stringify(payload, null, 2);
                const a = document.createElement('a');
                const file = new Blob([jsonStr], {type: 'application/json'});
                a.href = URL.createObjectURL(file);
                a.download = `marnthara_input_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
                showToast('ส่งออกข้อมูลแล้ว', 'success');
            }
        });

        document.querySelector(SELECTORS.lockBtn).addEventListener('click', e => {
            const lockBtn = e.currentTarget;
            const isLockedNow = !(lockBtn.dataset.locked === 'true');
            lockBtn.dataset.locked = isLockedNow;
            lockBtn.querySelector('.lock-text').textContent = isLockedNow ? 'ปลดล็อค' : 'ล็อค';
            lockBtn.querySelector('.lock-icon').textContent = isLockedNow ? '🔓' : '🔒';
            updateLockState();
            showToast(isLockedNow ? 'ล็อคข้อมูลแล้ว' : 'ปลดล็อคข้อมูลแล้ว', 'warning');
        });

        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
            const options = await showCopyOptionsModal();
            if (options) {
                const textToCopy = buildCopyText(options);
                navigator.clipboard.writeText(textToCopy).then(() => showToast("คัดลอกข้อความแล้ว", "success")).catch(err => console.error("Failed to copy text:", err));
            }
        });

        window.addEventListener('load', () => {
            loadData();
            updateLockState();
        });

        document.addEventListener('click', (e) => {
            const menuDropdowns = document.querySelectorAll('.menu-dropdown');
            const menuBtns = document.querySelectorAll('[data-act*="menu"], #menuBtn');
            const isMenuBtn = Array.from(menuBtns).some(btn => btn.contains(e.target));
            const isInsideDropdown = Array.from(menuDropdowns).some(dropdown => dropdown.contains(e.target));
            if (!isMenuBtn && !isInsideDropdown) {
                menuDropdowns.forEach(dropdown => dropdown.classList.remove('show'));
            }
        });

        orderForm.addEventListener("submit", (e) => {
            const payload = buildPayload();
            document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
            showToast("ส่งข้อมูลแล้ว...", "success");
        });
        
    }
    
    init();
})();