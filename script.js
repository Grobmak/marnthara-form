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
            if (stripsPerRoll === 0) return Infinity; // Prevent division from zero
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
        if (prefillWidth) { frag.querySelector('input[name="wall_width_m"]').value = prefillWidth; }
        wallsContainer.appendChild(frag);
    }
    
    async function clearDeco(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return;
        btn.closest(SELECTORS.decoItem).querySelectorAll('input, select').forEach(el => { el.value = ''; });
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลตกแต่งแล้ว', 'success');
    }

    async function clearRoom(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในห้องนี้?')) return;
        const roomEl = btn.closest(SELECTORS.room);
        roomEl.querySelectorAll('input, select').forEach(el => {
            el.value = '';
        });
        // Remove all sets, decos, and wallpapers except one default set
        roomEl.querySelectorAll(SELECTORS.set).forEach((el, i) => { if (i > 0) el.remove(); });
        roomEl.querySelectorAll(SELECTORS.decoItem).forEach(el => el.remove());
        roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(el => el.remove());

        // Re-add a default set if there's none
        if (roomEl.querySelectorAll(SELECTORS.set).length === 0) {
             addSet(roomEl);
        }

        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลในห้องแล้ว', 'success');
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
        recalcAll(); saveData(); showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    function toggleRoomMenu(btn) {
        const dropdownMenu = btn.closest('.room-actions-dropdown').querySelector('.room-actions-dropdown-menu');
        if (dropdownMenu) {
            dropdownMenu.classList.toggle('show');
        }
    }

    async function delRoom(btn) {
        if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return;
        btn.closest(SELECTORS.room).remove();
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ลบห้องแล้ว', 'success');
    }

    async function delSet(btn) {
        if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return;
        btn.closest(SELECTORS.set).remove();
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ลบจุดผ้าม่านแล้ว', 'success');
    }

    async function delDeco(btn) {
        if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return;
        btn.closest(SELECTORS.decoItem).remove();
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ลบรายการตกแต่งแล้ว', 'success');
    }

    async function delWallpaper(btn) {
        if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return;
        btn.closest(SELECTORS.wallpaperItem).remove();
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ลบรายการวอลเปเปอร์แล้ว', 'success');
    }

    function renumber() {
        const rooms = document.querySelectorAll(SELECTORS.room);
        rooms.forEach((room, i) => {
            room.dataset.index = i + 1;
            const roomNameInput = room.querySelector(SELECTORS.roomNameInput);
            if (!roomNameInput.value) {
                roomNameInput.placeholder = `เช่น ห้องที่ ${i + 1}`;
            }
            room.querySelectorAll(SELECTORS.set).forEach((set, j) => set.dataset.index = `${i + 1}.${j + 1}`);
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco, j) => deco.dataset.index = `${i + 1}.D${j + 1}`);
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper, j) => wallpaper.dataset.index = `${i + 1}.W${j + 1}`);
        });
    }

    function calcTotalPrice(el) {
        const room = el.closest(SELECTORS.room);
        if (!room) return;
        const roomPricePerM = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
        const roomStyle = room.querySelector(SELECTORS.roomStyle)?.value;
        const totalRoomWidth = Array.from(room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`))
            .reduce((sum, set) => sum + clamp01(set.querySelector('[name="width_m"]')?.value), 0);
        
        let totalFabricYardage = 0;
        let totalSheerFabricYardage = 0;
        let totalOpaqueTrack = 0;
        let totalSheerTrack = 0;
        let setPrices = 0;
        let setCount = 0;
        let setCountSets = 0;
        let setCountDeco = 0;

        const sets = room.querySelectorAll(SELECTORS.set);
        sets.forEach(set => {
            if (set.dataset.suspended === 'true') return;
            const width = clamp01(set.querySelector('[name="width_m"]')?.value);
            const height = clamp01(set.querySelector('[name="height_m"]')?.value);
            const fabricVariant = set.querySelector('[name="fabric_variant"]')?.value;
            const openType = set.querySelector('[name="open_type"]')?.value;
            const sheerPricePerM = toNum(set.querySelector('[name="sheer_price_per_m"]')?.value);
            const price = toNum(set.querySelector('[name="set_price"]')?.value);
            
            let setTotalPrice = 0;
            let opaqueYardage = 0;
            let sheerYardage = 0;
            let opaqueTrack = 0;
            let sheerTrack = 0;
            let hasOpaque = false;
            let hasSheer = false;

            if (fabricVariant === "ทึบ" || fabricVariant === "ทึบ&โปร่ง") {
                hasOpaque = true;
                opaqueYardage = CALC.fabricYardage(roomStyle, width);
                opaqueTrack = width + (openType === 'เปิดกลาง' ? 0.05 : 0.05);
                setTotalPrice += (opaqueYardage * roomPricePerM) + (opaqueTrack * heightPlus(height)) + stylePlus(roomStyle);
            }
            if (fabricVariant === "โปร่ง" || fabricVariant === "ทึบ&โปร่ง") {
                hasSheer = true;
                sheerYardage = CALC.fabricYardage("ลอน", width);
                sheerTrack = width + (openType === 'เปิดกลาง' ? 0.05 : 0.05);
                setTotalPrice += (sheerYardage * sheerPricePerM) + (sheerTrack * heightPlus(height)) + stylePlus("ลอน");
            }
            
            if (hasOpaque || hasSheer) {
                setCount++;
                setCountSets++;
            }
            
            setPrices += (price > 0) ? price : setTotalPrice;
            totalFabricYardage += opaqueYardage;
            totalSheerFabricYardage += sheerYardage;
            totalOpaqueTrack += opaqueTrack;
            totalSheerTrack += sheerTrack;

            set.querySelector('[data-total-set-price]').textContent = fmt(setTotalPrice, 0, true);
            set.querySelector('[data-opaque-yardage-label]').textContent = fmt(opaqueYardage, 2);
            set.querySelector('[data-sheer-yardage-label]').textContent = fmt(sheerYardage, 2);
            set.querySelector('[data-opaque-track-label]').textContent = `(ราง: ${fmt(opaqueTrack, 2)} ม.)`;
            set.querySelector('[data-sheer-track-label]').textContent = `(ราง: ${fmt(sheerTrack, 2)} ม.)`;
        });
        
        let totalDecoPrice = 0;
        const decoItems = room.querySelectorAll(SELECTORS.decoItem);
        decoItems.forEach(deco => {
            if (deco.dataset.suspended === 'true') return;
            const width = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
            const height = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
            const pricePerSqYd = toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value);
            const totalSqYd = (width * height) * SQM_TO_SQYD;
            const totalPrice = totalSqYd * pricePerSqYd;
            deco.querySelector('[data-total-price]').textContent = fmt(totalPrice, 0, true);
            deco.querySelector('[data-total-sqyd]').textContent = fmt(totalSqYd, 2);
            totalDecoPrice += totalPrice;
            setCount++;
            setCountDeco++;
        });

        let totalWallpaperPrice = 0;
        const wallpaperItems = room.querySelectorAll(SELECTORS.wallpaperItem);
        wallpaperItems.forEach(wallpaper => {
            if (wallpaper.dataset.suspended === 'true') return;
            const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
            const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
            const totalWidth = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
            const rollsNeeded = CALC.wallpaperRolls(totalWidth, height);
            const totalPrice = rollsNeeded * pricePerRoll;
            wallpaper.querySelector('[data-wallpaper-summary] .price:first-of-type').textContent = fmt(totalPrice, 0, true);
            wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(totalWidth * height, 2);
            wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = rollsNeeded;
            totalWallpaperPrice += totalPrice;
            setCount++;
        });

        const totalRoomPrice = setPrices + totalDecoPrice + totalWallpaperPrice;

        room.querySelector('[data-total-price]').textContent = fmt(totalRoomPrice, 0, true);
        room.querySelector('[data-set-count]').textContent = setCount;
        room.querySelector('[data-fabric-yardage]').textContent = fmt(totalFabricYardage + totalSheerFabricYardage, 2);
        room.querySelector('[data-total-track]').textContent = fmt(totalOpaqueTrack + totalSheerTrack, 2);
    }
    
    function recalcAll() {
        const rooms = document.querySelectorAll(SELECTORS.room);
        let grandTotal = 0;
        let grandSetCount = 0;
        let grandFabricYardage = 0;
        let grandSheerFabricYardage = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        let grandSetCountSets = 0;
        let grandSetCountDeco = 0;
        rooms.forEach(room => {
            calcTotalPrice(room);
            grandTotal += toNum(room.querySelector('[data-total-price]').textContent);
            grandSetCount += toNum(room.querySelector('[data-set-count]').textContent);
            grandFabricYardage += toNum(room.querySelector('[data-fabric-yardage]').textContent);
            grandOpaqueTrack += toNum(room.querySelector('[data-total-track]').textContent);
            grandSetCountSets += room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length;
            grandSetCountDeco += room.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = grandSetCount;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandFabricYardage, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerFabricYardage, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
        document.querySelector(SELECTORS.setCountSets).textContent = grandSetCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = grandSetCountDeco;
    }

    function saveData() {
        if (isLocked) return;
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function buildPayload() {
        const customerInfo = {};
        document.querySelectorAll('#customerInfo input').forEach(input => {
            customerInfo[input.name] = input.value;
        });
        
        const rooms = Array.from(document.querySelectorAll(SELECTORS.room)).map(room => {
            const roomData = {};
            roomData.room_name = room.querySelector(SELECTORS.roomNameInput).value;
            roomData.price_per_m_raw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            roomData.style = room.querySelector(SELECTORS.roomStyle)?.value;
            roomData.sets = Array.from(room.querySelectorAll(SELECTORS.set)).map(set => ({
                width_m: toNum(set.querySelector('[name="width_m"]')?.value),
                height_m: toNum(set.querySelector('[name="height_m"]')?.value),
                fabric_variant: set.querySelector('[name="fabric_variant"]')?.value,
                open_type: set.querySelector('[name="open_type"]')?.value,
                sheer_price_per_m: toNum(set.querySelector('[name="sheer_price_per_m"]')?.value),
                is_suspended: set.dataset.suspended === 'true'
            }));
            roomData.decorations = Array.from(room.querySelectorAll(SELECTORS.decoItem)).map(deco => ({
                type: deco.querySelector('[name="deco_type"]')?.value,
                width_m: toNum(deco.querySelector('[name="deco_width_m"]')?.value),
                height_m: toNum(deco.querySelector('[name="deco_height_m"]')?.value),
                price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value),
                is_suspended: deco.dataset.suspended === 'true'
            }));
            roomData.wallpapers = Array.from(room.querySelectorAll(SELECTORS.wallpaperItem)).map(wallpaper => ({
                name: wallpaper.querySelector('[name="wallpaper_name"]')?.value,
                brand: wallpaper.querySelector('[name="wallpaper_brand"]')?.value,
                code: wallpaper.querySelector('[name="wallpaper_code"]')?.value,
                type: wallpaper.querySelector('[name="wallpaper_type"]')?.value,
                height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value),
                price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value),
                widths: Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)),
                is_suspended: wallpaper.dataset.suspended === 'true'
            }));
            return roomData;
        });

        const appVersion = APP_VERSION;
        return { customerInfo, rooms, appVersion };
    }

    function loadPayload(payload) {
        if (!payload) return;
        document.querySelector('input[name="customer_name"]').value = payload.customerInfo?.customer_name || '';
        document.querySelector('input[name="customer_phone"]').value = payload.customerInfo?.customer_phone || '';
        document.querySelector('input[name="customer_address"]').value = payload.customerInfo?.customer_address || '';
        
        roomsEl.innerHTML = ''; // Clear existing rooms
        (payload.rooms || []).forEach(r => addRoom(r));
        if (payload.rooms.length === 0) addRoom();

        recalcAll();
        updateLockState();
    }

    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        if (lockBtn) {
            lockBtn.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
            lockBtn.querySelector('.lock-icon').textContent = isLocked ? '🔓' : '🔒';
        }
        document.body.classList.toggle('is-locked', isLocked);
        document.querySelectorAll('input, select, button:not(#lockBtn, #menuBtn, #importBtn, #exportBtn, .btn-primary, .btn-danger)').forEach(el => {
            el.disabled = isLocked;
        });
    }

    // Event Listeners
    orderForm.addEventListener('input', debounce(recalcAll));
    document.addEventListener('change', debounce(saveData));
    document.addEventListener('click', e => {
        if (e.target.dataset.act === 'add-room') addRoom();
        if (e.target.dataset.act === 'add-set') addSet(e.target.closest(SELECTORS.room));
        if (e.target.dataset.act === 'add-deco') addDeco(e.target.closest(SELECTORS.room));
        if (e.target.dataset.act === 'add-wallpaper') addWallpaper(e.target.closest(SELECTORS.room));
        if (e.target.dataset.act === 'add-wall') addWall(e.target);
        if (e.target.dataset.act === 'del-room') delRoom(e.target);
        if (e.target.dataset.act === 'del-set') delSet(e.target);
        if (e.target.dataset.act === 'del-deco') delDeco(e.target);
        if (e.target.dataset.act === 'del-wallpaper') delWallpaper(e.target);
        if (e.target.dataset.act === 'clear-room') clearRoom(e.target);
        if (e.target.dataset.act === 'clear-deco') clearDeco(e.target);
        if (e.target.dataset.act === 'toggle-suspend') toggleSuspend(e.target);
        if (e.target.dataset.act === 'toggle-accordion') e.target.closest('.accordion-item').querySelector('.accordion-content').classList.toggle('hidden');
        if (e.target.dataset.act === 'toggle-room-menu') toggleRoomMenu(e.target);
        if (e.target.matches('select[name="fabric_variant"]')) toggleSetFabricUI(e.target.closest(SELECTORS.set));
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn)?.addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn)?.addEventListener('click', async () => {
        if (!isLocked && await showConfirmation('ล้างทั้งหมด', 'คุณแน่ใจหรือไม่ที่จะลบข้อมูลทั้งหมด?')) {
            localStorage.removeItem(STORAGE_KEY);
            roomsEl.innerHTML = '';
            addRoom();
            showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
        }
    });

    document.querySelector(SELECTORS.lockBtn)?.addEventListener('click', async () => {
        if (!isLocked) {
            const confirm = await showConfirmation('ล็อคข้อมูล', 'คุณแน่ใจหรือไม่ที่จะล็อคการแก้ไข?');
            if (confirm) {
                isLocked = true;
                showToast('ล็อคข้อมูลแล้ว', 'success');
            }
        } else {
            const confirm = await showConfirmation('ปลดล็อคข้อมูล', 'คุณแน่ใจหรือไม่ที่จะปลดล็อค?');
            if (confirm) {
                isLocked = false;
                showToast('ปลดล็อคข้อมูลแล้ว', 'success');
            }
        }
        updateLockState();
    });

    document.querySelector(SELECTORS.copyJsonBtn)?.addEventListener('click', async () => {
        try {
            const payload = buildPayload();
            const jsonStr = JSON.stringify(payload, null, 2);
            await navigator.clipboard.writeText(jsonStr);
            showToast('คัดลอก JSON แล้ว', 'success');
        } catch (err) {
            console.error('Failed to copy JSON: ', err);
            showToast('คัดลอก JSON ไม่สำเร็จ', 'error');
        }
    });

    document.querySelector(SELECTORS.copyTextBtn)?.addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const payload = buildPayload();
            let text = "";
            if (options.customer) {
                text += `ลูกค้า: ${payload.customerInfo?.customer_name || 'ไม่ระบุ'}\n`;
                text += `เบอร์: ${payload.customerInfo?.customer_phone || 'ไม่ระบุ'}\n`;
                text += `ที่อยู่: ${payload.customerInfo?.customer_address || 'ไม่ระบุ'}\n\n`;
            }
            if (options.details) {
                payload.rooms.forEach((room, i) => {
                    text += `**ห้องที่ ${i+1}: ${room.room_name || 'ไม่ระบุ'}**\n`;
                    text += `  ราคาต่อเมตร: ${room.price_per_m_raw}\n`;
                    text += `  รูปแบบ: ${room.style}\n`;
                    room.sets.forEach((set, j) => {
                        text += `    จุดที่ ${j+1}: ${set.width_m}x${set.height_m} ม. (${set.fabric_variant})\n`;
                    });
                    text += "\n";
                });
            }
            if (options.summary) {
                const total = document.querySelector(SELECTORS.grandTotal)?.textContent;
                const grandFabric = document.querySelector(SELECTORS.grandFabric)?.textContent;
                const grandSheerFabric = document.querySelector(SELECTORS.grandSheerFabric)?.textContent;
                const grandOpaqueTrack = document.querySelector(SELECTORS.grandOpaqueTrack)?.textContent;
                const grandSheerTrack = document.querySelector(SELECTORS.grandSheerTrack)?.textContent;
                const setCountSets = document.querySelector(SELECTORS.setCountSets)?.textContent;
                const setCountDeco = document.querySelector(SELECTORS.setCountDeco)?.textContent;

                text += `--- สรุปยอดรวม ---\n`;
                text += `ราคา: ${total} บ.\n`;
                text += `ผ้าม่าน(ชุด): ${setCountSets}\n`;
                text += `ตกแต่งเพิ่ม(ชุด): ${setCountDeco}\n`;
                text += `ผ้าทึบที่ใช้: ${grandFabric}\n`;
                text += `ผ้าโปร่งที่ใช้: ${grandSheerFabric}\n`;
                text += `รางทึบที่ใช้: ${grandOpaqueTrack}\n`;
                text += `รางโปร่งที่ใช้: ${grandSheerTrack}\n`;
            }
            try {
                await navigator.clipboard.writeText(text.trim());
                showToast('คัดลอกข้อความแล้ว', 'success');
            } catch(err) {
                console.error('Failed to copy text: ', err);
                showToast('คัดลอกข้อความไม่สำเร็จ', 'error');
            }
        }
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        if (menuDropdown) menuDropdown.classList.toggle('show');
    });

    // Close menu when clicking outside
    window.addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const menuBtn = document.querySelector(SELECTORS.menuBtn);
        const roomActionsDropdown = document.querySelector('.room-actions-dropdown-menu');
        const roomActionsToggle = document.querySelector('.room-actions-dropdown .dropdown-toggle');
        
        if (menuDropdown && menuBtn && !menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
        if (roomActionsDropdown && roomActionsToggle && !roomActionsDropdown.contains(e.target) && !roomActionsToggle.contains(e.target)) {
            roomActionsDropdown.classList.remove('show');
        }
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
    });

    // Import/Export
    document.querySelector(SELECTORS.importBtn)?.addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal)?.classList.add('visible');
    });
    document.querySelector(SELECTORS.importCancel)?.addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal)?.classList.remove('visible');
    });
    document.querySelector(SELECTORS.importConfirm)?.addEventListener('click', () => {
        const importJsonArea = document.querySelector(SELECTORS.importJsonArea);
        try {
            const payload = JSON.parse(importJsonArea.value);
            loadPayload(payload);
            document.querySelector(SELECTORS.importModal)?.classList.remove('visible');
            showToast("นำเข้าข้อมูลสำเร็จ", "success");
        } catch (err) {
            showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
            console.error(err);
        }
    });
    document.querySelector(SELECTORS.exportBtn)?.addEventListener('click', () => {
        const payload = buildPayload();
        const jsonStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'marnthara-data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("ส่งออกข้อมูลสำเร็จ", "success");
    });

    // Copy room
    document.addEventListener('click', async e => {
        if (e.target.dataset.act === 'copy-room') {
            const roomEl = e.target.closest(SELECTORS.room);
            const confirmation = await showConfirmation('คัดลอกห้อง', 'คุณแน่ใจหรือไม่ที่จะคัดลอกข้อมูลของห้องนี้?');
            if (confirmation) {
                const roomData = buildRoomPayload(roomEl);
                addRoom(roomData);
                showToast('คัดลอกห้องแล้ว', 'success');
            }
        }
    });
    
    function buildRoomPayload(roomEl) {
        const roomData = {};
        roomData.room_name = roomEl.querySelector(SELECTORS.roomNameInput)?.value || "";
        roomData.price_per_m_raw = toNum(roomEl.querySelector(SELECTORS.roomPricePerM)?.value);
        roomData.style = roomEl.querySelector(SELECTORS.roomStyle)?.value;
        roomData.sets = Array.from(roomEl.querySelectorAll(SELECTORS.set)).map(set => ({
            width_m: toNum(set.querySelector('[name="width_m"]')?.value),
            height_m: toNum(set.querySelector('[name="height_m"]')?.value),
            fabric_variant: set.querySelector('[name="fabric_variant"]')?.value,
            open_type: set.querySelector('[name="open_type"]')?.value,
            sheer_price_per_m: toNum(set.querySelector('[name="sheer_price_per_m"]')?.value),
            is_suspended: set.dataset.suspended === 'true'
        }));
        roomData.decorations = Array.from(roomEl.querySelectorAll(SELECTORS.decoItem)).map(deco => ({
            type: deco.querySelector('[name="deco_type"]')?.value,
            width_m: toNum(deco.querySelector('[name="deco_width_m"]')?.value),
            height_m: toNum(deco.querySelector('[name="deco_height_m"]')?.value),
            price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value),
            is_suspended: deco.dataset.suspended === 'true'
        }));
        roomData.wallpapers = Array.from(roomEl.querySelectorAll(SELECTORS.wallpaperItem)).map(wallpaper => ({
            name: wallpaper.querySelector('[name="wallpaper_name"]')?.value,
            brand: wallpaper.querySelector('[name="wallpaper_brand"]')?.value,
            code: wallpaper.querySelector('[name="wallpaper_code"]')?.value,
            type: wallpaper.querySelector('[name="wallpaper_type"]')?.value,
            height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value),
            price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value),
            widths: Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)),
            is_suspended: wallpaper.dataset.suspended === 'true'
        }));
        return roomData;
    }
})();