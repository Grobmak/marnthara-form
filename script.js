(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
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
        summaryDetails: '#summaryDetails'
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
        recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลตกแต่งแล้ว', 'success'); 
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
        recalcAll(); saveData(); showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function delRoom(btn) {
        if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return;
        btn.closest(SELECTORS.room).remove();
        renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success');
    }
    
    async function delSet(btn) {
        if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return;
        btn.closest(SELECTORS.set).remove();
        renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success');
    }

    async function delDeco(btn) {
        if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return;
        btn.closest(SELECTORS.decoItem).remove();
        renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success');
    }
    
    async function delWallpaper(btn) {
        if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return;
        btn.closest(SELECTORS.wallpaperItem).remove();
        renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success');
    }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, i) => {
            room.querySelector('.room-title').textContent = `ห้องที่ ${i + 1}`;
            room.dataset.index = i + 1;
            room.querySelectorAll(SELECTORS.set).forEach((set, j) => {
                set.querySelector('.set-title').textContent = `จุดที่ ${j + 1}`;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco, j) => {
                deco.querySelector('.deco-title').textContent = `รายการที่ ${j + 1}`;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper, j) => {
                wallpaper.querySelector('.wallpaper-title').textContent = `รายการวอลเปเปอร์ที่ ${j + 1}`;
            });
        });
    }

    const recalcAll = debounce(() => {
        let grandTotal = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        let setCount = 0;
        let setCountSets = 0;
        let setCountDeco = 0;
        let payload = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            if (room.dataset.suspended === 'true') return;
            const roomName = room.querySelector(SELECTORS.roomNameInput).value;
            const pricePerM = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const roomStyle = room.querySelector(SELECTORS.roomStyle).value;
            let roomTotal = 0;
            let roomFabric = 0;
            let roomSheerFabric = 0;
            let roomOpaqueTrack = 0;
            let roomSheerTrack = 0;
            let roomPayload = {
                room_name: roomName,
                price_per_m_raw: pricePerM,
                style: roomStyle,
                sets: [],
                decorations: [],
                wallpapers: []
            };

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                if (set.dataset.suspended === 'true') return;
                const width = clamp01(set.querySelector('input[name="width_m"]').value);
                const height = clamp01(set.querySelector('input[name="height_m"]').value);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                const openType = set.querySelector('select[name="open_type"]').value;
                const sheerPricePerM = toNum(set.querySelector('select[name="sheer_price_per_m"]').value);

                setCount++;
                setCountSets++;

                const trackLength = width;
                const pricePlus = heightPlus(height);
                const stylePlusPrice = stylePlus(roomStyle);

                let setTotal = 0;
                let setOpaqueFabric = 0;
                let setSheerFabric = 0;
                let setOpaqueTrack = 0;
                let setSheerTrack = 0;

                if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                    setOpaqueFabric = CALC.fabricYardage(roomStyle, width);
                    setTotal += setOpaqueFabric * 0.9 * (pricePerM + pricePlus) + (trackLength * stylePlusPrice);
                    setOpaqueTrack = trackLength;
                }
                if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                    setSheerFabric = CALC.fabricYardage("ลอน", width);
                    setTotal += setSheerFabric * 0.9 * (sheerPricePerM + pricePlus);
                    setSheerTrack = trackLength;
                }
                
                roomTotal += setTotal;
                roomFabric += setOpaqueFabric;
                roomSheerFabric += setSheerFabric;
                roomOpaqueTrack += setOpaqueTrack;
                roomSheerTrack += setSheerTrack;

                set.querySelector('[data-total]').textContent = fmt(setTotal, 0, true);
                set.querySelector('[data-opaque-price]').textContent = fmt(setOpaqueFabric * 0.9 * (pricePerM + pricePlus) + (trackLength * stylePlusPrice), 0, true);
                set.querySelector('[data-sheer-price]').textContent = fmt(setSheerFabric * 0.9 * (sheerPricePerM + pricePlus), 0, true);
                set.querySelector('[data-opaque-yardage]').textContent = `${fmt(setOpaqueFabric, 2)} หลา`;
                set.querySelector('[data-sheer-yardage]').textContent = `${fmt(setSheerFabric, 2)} หลา`;
                set.querySelector('[data-opaque-track]').textContent = `${fmt(setOpaqueTrack, 2)} ม.`;
                set.querySelector('[data-sheer-track]').textContent = `${fmt(setSheerTrack, 2)} ม.`;
                set.querySelector('[data-width-m]').textContent = `${fmt(width, 2)}`;
                set.querySelector('[data-height-m]').textContent = `${fmt(height, 2)}`;
                set.querySelector('[data-set-summary-text]').textContent = `กว้าง ${fmt(width, 2)} x สูง ${fmt(height, 2)} ม.`;

                roomPayload.sets.push({
                    width_m: width,
                    height_m: height,
                    fabric_variant: variant,
                    open_type: openType,
                    sheer_price_per_m: sheerPricePerM,
                    is_suspended: set.dataset.suspended === 'true',
                    total: setTotal,
                    opaque_fabric_yardage: setOpaqueFabric,
                    sheer_fabric_yardage: setSheerFabric,
                    opaque_track: setOpaqueTrack,
                    sheer_track: setSheerTrack
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                if (deco.dataset.suspended === 'true') return;
                const decoWidth = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const decoHeight = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const decoPrice = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                const sqm = decoWidth * decoHeight;
                const sqyd = sqm * SQM_TO_SQYD;
                const decoTotal = sqyd * decoPrice;
                setCount++;
                setCountDeco++;
                roomTotal += decoTotal;

                deco.querySelector('[data-deco-total]').textContent = fmt(decoTotal, 0, true);
                deco.querySelector('[data-deco-area-sqm]').textContent = fmt(sqm, 2);
                deco.querySelector('[data-deco-area-sqyd]').textContent = fmt(sqyd, 2);

                roomPayload.decorations.push({
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: decoWidth,
                    height_m: decoHeight,
                    price_sqyd: decoPrice,
                    is_suspended: deco.dataset.suspended === 'true',
                    total: decoTotal,
                    area_sqm: sqm,
                    area_sqyd: sqyd
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                if (wallpaper.dataset.suspended === 'true') return;
                const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                let totalWidth = 0;
                let wallWidths = [];
                wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(wallInput => {
                    const width = clamp01(wallInput.value);
                    totalWidth += width;
                    wallWidths.push(width);
                });

                const rolls = CALC.wallpaperRolls(totalWidth, height);
                const wallpaperTotal = rolls * pricePerRoll;
                const sqm = totalWidth * height;

                setCount++;
                setCountDeco++;
                roomTotal += wallpaperTotal;

                wallpaper.querySelector('[data-wallpaper-total]').textContent = fmt(wallpaperTotal, 0, true);
                wallpaper.querySelector('[data-wallpaper-area-sqm]').textContent = fmt(sqm, 2);
                wallpaper.querySelector('[data-wallpaper-rolls]').textContent = fmt(rolls, 0, true);
                
                roomPayload.wallpapers.push({
                    height_m: height,
                    price_per_roll: pricePerRoll,
                    is_suspended: wallpaper.dataset.suspended === 'true',
                    total: wallpaperTotal,
                    area_sqm: sqm,
                    rolls: rolls,
                    widths: wallWidths
                });
            });

            room.querySelector('[data-room-total]').textContent = fmt(roomTotal, 0, true);
            room.querySelector('[data-room-fabric-yardage]').textContent = `${fmt(roomFabric, 2)} หลา`;
            room.querySelector('[data-room-sheer-fabric-yardage]').textContent = `${fmt(roomSheerFabric, 2)} หลา`;
            room.querySelector('[data-room-opaque-track]').textContent = `${fmt(roomOpaqueTrack, 2)} ม.`;
            room.querySelector('[data-room-sheer-track]').textContent = `${fmt(roomSheerTrack, 2)} ม.`;

            grandTotal += roomTotal;
            grandFabric += roomFabric;
            grandSheerFabric += roomSheerFabric;
            grandOpaqueTrack += roomOpaqueTrack;
            grandSheerTrack += roomSheerTrack;
            payload.rooms.push(roomPayload);
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = setCount;
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandFabric, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerFabric, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;

        saveData(payload);
    });

    const saveData = debounce((payload) => {
        try {
            if (!payload) payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (err) {
            console.error("Failed to save data to storage:", err);
            showToast("ไม่สามารถบันทึกข้อมูลได้", "error");
        }
    });

    const buildPayload = () => {
        let payload = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomName = room.querySelector(SELECTORS.roomNameInput).value;
            const pricePerM = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const roomStyle = room.querySelector(SELECTORS.roomStyle).value;
            let roomPayload = {
                room_name: roomName,
                price_per_m_raw: pricePerM,
                style: roomStyle,
                is_suspended: room.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: []
            };

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const width = toNum(set.querySelector('input[name="width_m"]').value);
                const height = toNum(set.querySelector('input[name="height_m"]').value);
                roomPayload.sets.push({
                    width_m: width,
                    height_m: height,
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                    open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]').value),
                    is_suspended: set.dataset.suspended === 'true'
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                roomPayload.decorations.push({
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: deco.dataset.suspended === 'true'
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let wallWidths = [];
                wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(wallInput => {
                    wallWidths.push(toNum(wallInput.value));
                });
                roomPayload.wallpapers.push({
                    height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value),
                    is_suspended: wallpaper.dataset.suspended === 'true',
                    widths: wallWidths
                });
            });

            payload.rooms.push(roomPayload);
        });
        return payload;
    };

    function updateLockState() {
        const anyActiveItem = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length > 0;
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        if (isLocked) {
            document.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
            document.querySelectorAll('[data-act]').forEach(el => el.disabled = true);
            lockBtn.querySelector('.lock-text').textContent = "ปลดล็อค";
            lockBtn.querySelector('.lock-icon').textContent = "🔓";
        } else {
            document.querySelectorAll('input, select, textarea').forEach(el => el.disabled = false);
            document.querySelectorAll('[data-act]').forEach(el => el.disabled = false);
            lockBtn.querySelector('.lock-text').textContent = "ล็อค";
            lockBtn.querySelector('.lock-icon').textContent = "🔒";
            document.querySelectorAll(`${SELECTORS.submitBtn}, ${SELECTORS.copyJsonBtn}, ${SELECTORS.copyTextBtn}`).forEach(el => el.disabled = !anyActiveItem);
        }
        lockBtn.disabled = !anyActiveItem;
    }

    document.addEventListener('input', debounce(e => {
        if (e.target.closest(SELECTORS.room)) recalcAll();
    }));

    document.addEventListener('change', debounce(e => {
        if (e.target.closest(SELECTORS.room)) {
            const set = e.target.closest(SELECTORS.set);
            if (set && e.target.name === 'fabric_variant') toggleSetFabricUI(set);
            recalcAll();
        }
    }));
    
    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;

        if (act === 'add-room') addRoom();
        else if (act === 'del-room') delRoom(btn);
        else if (act === 'add-set') addSet(btn.closest(SELECTORS.room));
        else if (act === 'del-set') delSet(btn);
        else if (act === 'add-deco') addDeco(btn.closest(SELECTORS.room));
        else if (act === 'del-deco') delDeco(btn);
        else if (act === 'clear-deco') clearDeco(btn);
        else if (act === 'add-wallpaper') addWallpaper(btn.closest(SELECTORS.room));
        else if (act === 'del-wallpaper') delWallpaper(btn);
        else if (act === 'add-wall') addWall(btn);
        else if (act === 'del-wall') btn.closest('.wall-input-row').remove();
        else if (act === 'suspend') toggleSuspend(btn);
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => { isLocked = !isLocked; updateLockState(); showToast(`สถานะ: ${isLocked ? 'ล็อค' : 'ปลดล็อค'}`, 'warning'); });
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async () => {
        if (await showConfirmation('ล้างทั้งหมด', 'ยืนยันการล้างข้อมูลทั้งหมด?')) {
            roomsEl.innerHTML = '';
            addRoom();
            localStorage.removeItem(STORAGE_KEY);
            showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
        }
    });

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
            .then(() => showToast('คัดลอก JSON แล้ว', 'success'))
            .catch(err => {
                console.error("Failed to copy JSON:", err);
                showToast('คัดลอก JSON ไม่สำเร็จ', 'error');
            });
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (!options) return;
        const text = buildTextReport(options);
        navigator.clipboard.writeText(text)
            .then(() => showToast('คัดลอกข้อความแล้ว', 'success'))
            .catch(err => {
                console.error("Failed to copy text:", err);
                showToast('คัดลอกข้อความไม่สำเร็จ', 'error');
            });
    });

    function buildTextReport(options) {
        const payload = buildPayload();
        const customer = payload.customer_name;
        const phone = payload.customer_phone;
        const address = payload.customer_address;
        const rooms = payload.rooms;
        let report = '';

        if (options.customer) {
            report += `ลูกค้า: ${customer || '-'}\n`;
            report += `เบอร์โทร: ${phone || '-'}\n`;
            report += `รายละเอียด: ${address || '-'}\n\n`;
        }

        if (options.details) {
            rooms.forEach((room, i) => {
                if (room.is_suspended) return;
                report += `[ห้องที่ ${i + 1}: ${room.room_name || 'ไม่ระบุชื่อ'}]`;
                if (room.style) report += ` (${room.style})`;
                if (room.price_per_m_raw) report += ` ราคาผ้าม่าน ${room.price_per_m_raw} บ.`;
                report += `\n`;

                room.sets.forEach((set, j) => {
                    if (set.is_suspended) return;
                    report += `- จุดที่ ${j + 1}: ผ้าม่าน ${set.width_m} x ${set.height_m} ม. (${set.fabric_variant})\n`;
                });
                room.decorations.forEach((deco, j) => {
                    if (deco.is_suspended) return;
                    report += `- รายการตกแต่งที่ ${j + 1}: ${deco.type || '-'} ${deco.width_m} x ${deco.height_m} ม.\n`;
                });
                room.wallpapers.forEach((wallpaper, j) => {
                    if (wallpaper.is_suspended) return;
                    report += `- วอลเปเปอร์ที่ ${j + 1}: สูง ${wallpaper.height_m} ม. x กว้าง ${wallpaper.widths.join(', ')} ม.\n`;
                });
                report += '\n';
            });
        }
        
        if (options.summary) {
            recalcAll();
            report += '--- สรุปยอดรวม ---\n';
            report += `ราคารวม: ${document.querySelector(SELECTORS.grandTotal).textContent} บ.\n`;
            report += `จำนวนจุดติดตั้ง: ${document.querySelector(SELECTORS.setCountSets).textContent} จุด (ผ้าม่าน)\n`;
            report += `จำนวนจุดติดตั้ง: ${document.querySelector(SELECTORS.setCountDeco).textContent} จุด (อื่นๆ)\n`;
            report += `ผ้าทึบที่ใช้: ${document.querySelector(SELECTORS.grandFabric).textContent}\n`;
            report += `ผ้าโปร่งที่ใช้: ${document.querySelector(SELECTORS.grandSheerFabric).textContent}\n`;
            report += `รางทึบที่ใช้: ${document.querySelector(SELECTORS.grandOpaqueTrack).textContent}\n`;
            report += `รางโปร่งที่ใช้: ${document.querySelector(SELECTORS.grandSheerTrack).textContent}\n`;
        }

        return report.trim();
    }

    const summaryDetails = document.querySelector(SELECTORS.summaryDetails);
    if (summaryDetails) {
        summaryDetails.addEventListener('toggle', () => {
            if (summaryDetails.open) {
                recalcAll();
            }
        });
    }

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });

    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const payload = JSON.parse(jsonText);
            roomsEl.innerHTML = "";
            roomCount = 0;
            if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
            else addRoom();
            document.querySelector('input[name="customer_name"]').value = payload.customer_name || "";
            document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || "";
            document.querySelector('input[name="customer_address"]').value = payload.customer_address || "";
            recalcAll();
            showToast("นำเข้าข้อมูลสำเร็จ", "success");
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
        } catch (err) {
            console.error("Import failed:", err);
            showToast("นำเข้าข้อมูลไม่สำเร็จ: JSON ไม่ถูกต้อง", "error");
        }
    });

    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });
    
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `marnthara-input-${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast('ดาวน์โหลด JSON แล้ว', 'success');
    });

    window.addEventListener('click', e => {
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