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
        const optionsRow = setEl.querySelector('[data-set-options-row]');
        
        setEl.querySelector(SELECTORS.sheerWrap).classList.toggle("hidden", !hasSheer);
        
        if (variant === "ทึบ&โปร่ง") {
            optionsRow.classList.add("three-col");
        } else {
            optionsRow.classList.remove("three-col");
        }

        setEl.querySelector("[data-opaque-price-label]").classList.toggle("hidden", variant === "โปร่ง");
        setEl.querySelector("[data-sheer-price-label]").classList.toggle("hidden", variant === "ทึบ");
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

    async function delWall(btn) {
        if(isLocked) return;
        btn.closest('.wall-input-row').remove();
        recalcAll(); saveData();
    }

    async function clearSet(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return;
        const set = btn.closest(SELECTORS.set);
        set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; });
        toggleSetFabricUI(set);
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success');
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
        if (!await showConfirmation('ล้างข้อมูลทั้งหมด', 'คุณแน่ใจหรือไม่ที่จะล้างข้อมูลทั้งหมด?')) return;
        localStorage.removeItem(STORAGE_KEY);
        roomsEl.innerHTML = "";
        roomCount = 0;
        addRoom();
        document.querySelectorAll('#customerInfo input').forEach(el => el.value = '');
        showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
    }

    const calcSet = (setEl, roomStyle, roomPricePerM) => {
        const width = clamp01(setEl.querySelector('input[name="width_m"]').value);
        const height = clamp01(setEl.querySelector('input[name="height_m"]').value);
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const sheerPricePerM = toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value);

        if (width === 0 || height === 0) {
            setEl.querySelector('[data-opaque-price]').textContent = fmt(0, 0, true);
            setEl.querySelector('[data-sheer-price]').textContent = fmt(0, 0, true);
            setEl.querySelector('[data-set-total]').textContent = fmt(0, 0, true);
            return {
                opaqueYards: 0, sheerYards: 0, opaqueTrack: 0, sheerTrack: 0,
                opaquePrice: 0, sheerPrice: 0, totalPrice: 0,
                isSet: false
            };
        }
        
        const style = roomStyle || "ลอน";
        const pricePerM = toNum(roomPricePerM) || 0;
        const plusHeightPrice = heightPlus(height);
        const plusStylePrice = stylePlus(style);
        const trackLength = width * 2.0;

        let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0;
        let opaqueTrack = 0, sheerTrack = 0;

        if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
            opaqueYards = CALC.fabricYardage(style, width);
            opaquePrice = Math.ceil(width * (pricePerM + plusHeightPrice) + plusStylePrice);
            opaqueTrack = trackLength;
        }

        if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
            sheerYards = CALC.fabricYardage(style, width);
            sheerPrice = Math.ceil(width * (sheerPricePerM + plusHeightPrice) + plusStylePrice);
            sheerTrack = trackLength;
        }

        setEl.querySelector('[data-opaque-price]').textContent = fmt(opaquePrice, 0, true);
        setEl.querySelector('[data-sheer-price]').textContent = fmt(sheerPrice, 0, true);
        setEl.querySelector('[data-set-total]').textContent = fmt(opaquePrice + sheerPrice, 0, true);

        return {
            opaqueYards,
            sheerYards,
            opaqueTrack,
            sheerTrack,
            opaquePrice,
            sheerPrice,
            totalPrice: opaquePrice + sheerPrice,
            isSet: true
        };
    };
    
    const calcDeco = (decoEl) => {
        const width = clamp01(decoEl.querySelector('[name="deco_width_m"]').value);
        const height = clamp01(decoEl.querySelector('[name="deco_height_m"]').value);
        const pricePerSqyd = toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value);
        if (width === 0 || pricePerSqyd === 0) {
            decoEl.querySelector('[data-deco-total]').textContent = fmt(0, 0, true);
            return { totalPrice: 0, isDeco: false };
        }
        const areaSqyd = (width * (height > 0 ? height : 3)) * SQM_TO_SQYD;
        const total = Math.ceil(areaSqyd * pricePerSqyd);
        decoEl.querySelector('[data-deco-total]').textContent = fmt(total, 0, true);
        return { totalPrice: total, isDeco: true };
    };

    const calcWallpaper = (wallpaperEl) => {
        const height = clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value);
        const pricePerRoll = toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value);
        const wallInputs = wallpaperEl.querySelectorAll('[name="wall_width_m"]');
        const totalWidth = Array.from(wallInputs).reduce((sum, el) => sum + clamp01(el.value), 0);
        
        const rolls = CALC.wallpaperRolls(totalWidth, height);
        const totalPrice = rolls * pricePerRoll;
        const totalAreaSqM = totalWidth * height;

        wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = fmt(totalPrice, 0, true);
        wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(totalAreaSqM, 2);
        wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = fmt(rolls, 0);

        return { totalPrice, isWallpaper: true };
    };

    const recalcAll = debounce(() => {
        let grandTotal = 0;
        let grandOpaqueYards = 0;
        let grandSheerYards = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        let setCount = 0;
        let setCountSets = 0;
        let setCountDeco = 0;

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            if (roomEl.dataset.suspended === 'true') {
                roomEl.querySelector('[data-room-total]').textContent = fmt(0, 0, true);
                return;
            }
            const roomPricePerM = roomEl.querySelector(SELECTORS.roomPricePerM).value;
            const roomStyle = roomEl.querySelector(SELECTORS.roomStyle).value;
            let roomTotal = 0;

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                if (setEl.dataset.suspended === 'true') {
                    setEl.querySelector('[data-opaque-price]').textContent = fmt(0, 0, true);
                    setEl.querySelector('[data-sheer-price]').textContent = fmt(0, 0, true);
                    setEl.querySelector('[data-set-total]').textContent = fmt(0, 0, true);
                    return;
                }
                const setCalc = calcSet(setEl, roomStyle, roomPricePerM);
                roomTotal += setCalc.totalPrice;
                if (setCalc.isSet) {
                    grandOpaqueYards += setCalc.opaqueYards;
                    grandSheerYards += setCalc.sheerYards;
                    grandOpaqueTrack += setCalc.opaqueTrack;
                    grandSheerTrack += setCalc.sheerTrack;
                    setCountSets++;
                    setCount++;
                }
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                if (decoEl.dataset.suspended === 'true') {
                    decoEl.querySelector('[data-deco-total]').textContent = fmt(0, 0, true);
                    return;
                }
                const decoCalc = calcDeco(decoEl);
                roomTotal += decoCalc.totalPrice;
                if (decoCalc.isDeco) setCountDeco++;
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                if (wallpaperEl.dataset.suspended === 'true') {
                    wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = fmt(0, 0, true);
                    wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(0, 2);
                    wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = fmt(0, 0);
                    return;
                }
                const wallpaperCalc = calcWallpaper(wallpaperEl);
                roomTotal += wallpaperCalc.totalPrice;
            });
            
            roomEl.querySelector('[data-room-total]').textContent = fmt(roomTotal, 0, true);
            grandTotal += roomTotal;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = setCount + setCountDeco;
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
        
        saveData();
    });

    const buildPayload = () => {
        const payload = {
            app_version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: roomEl.querySelector(SELECTORS.roomPricePerM).value,
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const width = toNum(setEl.querySelector('input[name="width_m"]').value);
                if (width > 0) {
                    roomData.sets.push({
                        width_m: width,
                        height_m: toNum(setEl.querySelector('input[name="height_m"]').value),
                        fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                        open_type: setEl.querySelector('select[name="open_type"]').value,
                        sheer_price_per_m: setEl.querySelector('select[name="sheer_price_per_m"]').value,
                        is_suspended: setEl.dataset.suspended === 'true',
                    });
                }
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const width = toNum(decoEl.querySelector('[name="deco_width_m"]').value);
                const price = toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value);
                if (width > 0 && price > 0) {
                    roomData.decorations.push({
                        type: decoEl.querySelector('[name="deco_type"]').value,
                        width_m: width,
                        height_m: toNum(decoEl.querySelector('[name="deco_height_m"]').value),
                        price_sqyd: price,
                        is_suspended: decoEl.dataset.suspended === 'true',
                    });
                }
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const height = toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value);
                const price = toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value);
                const wallWidths = Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value));
                if (height > 0 && price > 0 && wallWidths.some(w => w > 0)) {
                    roomData.wallpapers.push({
                        height_m: height,
                        price_per_roll: price,
                        widths: wallWidths,
                        is_suspended: wallpaperEl.dataset.suspended === 'true',
                    });
                }
            });

            if (roomData.room_name || roomData.sets.length > 0 || roomData.decorations.length > 0 || roomData.wallpapers.length > 0) {
                payload.rooms.push(roomData);
            }
        });
        return payload;
    };
    
    function saveData() {
        try {
            const data = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) { console.error("Could not save data to local storage", e); }
    }

    function updateLockState() {
        const anyRoomSuspended = document.querySelectorAll(SELECTORS.room).length > 0 && document.querySelectorAll(`${SELECTORS.room}[data-suspended="true"]`).length > 0;
        const anySetSuspended = document.querySelectorAll(SELECTORS.set).length > 0 && document.querySelectorAll(`${SELECTORS.set}[data-suspended="true"]`).length > 0;
        const anyDecoSuspended = document.querySelectorAll(SELECTORS.decoItem).length > 0 && document.querySelectorAll(`${SELECTORS.decoItem}[data-suspended="true"]`).length > 0;
        const anyWallpaperSuspended = document.querySelectorAll(SELECTORS.wallpaperItem).length > 0 && document.querySelectorAll(`${SELECTORS.wallpaperItem}[data-suspended="true"]`).length > 0;
        isLocked = anyRoomSuspended || anySetSuspended || anyDecoSuspended || anyWallpaperSuspended;
        document.querySelector(SELECTORS.lockBtn).classList.toggle('locked', isLocked);
        document.querySelector('.lock-icon').textContent = isLocked ? '🔒' : '🔓';
    }

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast('คัดลอกข้อมูลแล้ว', 'success');
        } catch (err) {
            showToast('ไม่สามารถคัดลอกได้', 'error');
            console.error('Failed to copy: ', err);
        }
    };

    const generateTextSummary = (options) => {
        let summaryText = "";
        
        if (options.customer) {
            const customerName = document.querySelector('input[name="customer_name"]').value;
            const customerPhone = document.querySelector('input[name="customer_phone"]').value;
            summaryText += `ลูกค้า: ${customerName}\nเบอร์โทร: ${customerPhone}\n\n`;
        }

        if (options.details) {
            document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
                const roomName = roomEl.querySelector(SELECTORS.roomNameInput).value;
                const roomTotal = roomEl.querySelector('[data-room-total]').textContent;
                const roomStyle = roomEl.querySelector(SELECTORS.roomStyle).value;
                const pricePerM = roomEl.querySelector(SELECTORS.roomPricePerM).value;
                const isSuspended = roomEl.dataset.suspended === 'true';

                if (isSuspended) {
                    summaryText += `(ระงับ) ${roomName} - รวม: 0 บ.\n`;
                    return;
                }

                summaryText += `**${roomName}** (สไตล์: ${roomStyle} ราคา: ${pricePerM} บ./ม.)\n`;
                
                roomEl.querySelectorAll(SELECTORS.set).forEach((setEl, i) => {
                    const width = toNum(setEl.querySelector('[name="width_m"]').value);
                    const height = toNum(setEl.querySelector('[name="height_m"]').value);
                    const variant = setEl.querySelector('select[name="fabric_variant"]').value;
                    const openType = setEl.querySelector('select[name="open_type"]').value;
                    const sheerPrice = toNum(setEl.querySelector('[name="sheer_price_per_m"]').value);
                    const isSuspended = setEl.dataset.suspended === 'true';

                    if (width === 0 || isSuspended) return;

                    const price = setEl.querySelector('[data-set-total]').textContent;
                    const sheerText = (variant === "ทึบ&โปร่ง" || variant === "โปร่ง") ? ` (ผ้าโปร่ง: ${sheerPrice}บ./ม.)` : "";

                    summaryText += `  จุดที่ ${i + 1}: ${width}x${height}ม. - ${variant}${sheerText} - ${openType} - รวม: ${price} บ.\n`;
                });

                roomEl.querySelectorAll(SELECTORS.decoItem).forEach((decoEl, i) => {
                    const decoType = decoEl.querySelector('[name="deco_type"]').value;
                    const decoTotal = decoEl.querySelector('[data-deco-total]').textContent;
                    const width = toNum(decoEl.querySelector('[name="deco_width_m"]').value);
                    const height = toNum(decoEl.querySelector('[name="deco_height_m"]').value);
                    const isSuspended = decoEl.dataset.suspended === 'true';
                    
                    if (width === 0 || isSuspended) return;
                    
                    summaryText += `  จุดตกแต่งที่ ${i + 1}: ${decoType} ${width}x${height}ม. - รวม: ${decoTotal} บ.\n`;
                });

                roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaperEl, i) => {
                    const totalWidth = Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + toNum(el.value), 0);
                    const height = toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value);
                    const rolls = wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent;
                    const price = wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent;
                    const isSuspended = wallpaperEl.dataset.suspended === 'true';

                    if (height === 0 || totalWidth === 0 || isSuspended) return;
                    
                    summaryText += `  วอลเปเปอร์ที่ ${i+1}: ${totalWidth}x${height}ม. - ใช้ ${rolls} ม้วน - รวม: ${price} บ.\n`;
                });
                
                summaryText += `  ราคารวมห้อง: ${roomTotal} บ.\n\n`;
            });
        }
        
        if (options.summary) {
            const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;
            const setCount = document.querySelector(SELECTORS.setCount).textContent;
            const grandFabric = document.querySelector(SELECTORS.grandFabric).textContent;
            const grandSheerFabric = document.querySelector(SELECTORS.grandSheerFabric).textContent;
            const grandOpaqueTrack = document.querySelector(SELECTORS.grandOpaqueTrack).textContent;
            const grandSheerTrack = document.querySelector(SELECTORS.grandSheerTrack).textContent;

            summaryText += `---
สรุปวัสดุ:
- ใช้ผ้าทึบ: ${grandFabric}
- ใช้ผ้าโปร่ง: ${grandSheerFabric}
- รางทึบ: ${grandOpaqueTrack}
- รางโปร่ง: ${grandSheerTrack}
---
รวมทั้งหมด ${setCount} จุด - ${grandTotal} บ.
`;
        }

        return summaryText;
    };

    function renumber() {
        document.querySelectorAll(SELECTORS.set).forEach((setEl, i) => {
            setEl.querySelector('.set-count').textContent = `จุดที่ ${i + 1}`;
        });
        document.querySelectorAll(SELECTORS.decoItem).forEach((decoEl, i) => {
            decoEl.querySelector('.deco-count').textContent = `รายการที่ ${i + 1}`;
        });
        document.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaperEl, i) => {
            wallpaperEl.querySelector('.wallpaper-count').textContent = `รายการที่ ${i + 1}`;
        });
    }

    document.addEventListener('input', (e) => {
        const input = e.target;
        if (input.matches('input, select')) {
            const setEl = input.closest(SELECTORS.set);
            if (setEl) {
                if (input.name === "fabric_variant") toggleSetFabricUI(setEl);
                if (input.name === "sheer_price_per_m") {
                     const variant = setEl.querySelector('select[name="fabric_variant"]').value;
                     if (variant === "ทึบ") { input.value = ''; }
                }
            }
            recalcAll();
        }
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        const roomEl = btn.closest(SELECTORS.room);
        const setEl = btn.closest(SELECTORS.set);
        const decoEl = btn.closest(SELECTORS.decoItem);
        const wallpaperEl = btn.closest(SELECTORS.wallpaperItem);

        switch (act) {
            case 'add-room': addRoom(); break;
            case 'add-set': addSet(roomEl); break;
            case 'add-deco': addDeco(roomEl); break;
            case 'add-wallpaper': addWallpaper(roomEl); break;
            case 'add-wall': addWall(btn); break;
            case 'del-room': delRoom(btn); break;
            case 'del-set': delSet(btn); break;
            case 'del-deco': delDeco(btn); break;
            case 'del-wallpaper': delWallpaper(btn); break;
            case 'del-wall': delWall(btn); break;
            case 'clear-set': clearSet(btn); break;
            case 'clear-deco': clearDeco(btn); break;
            case 'clear-wallpaper': clearWallpaper(btn); break;
            case 'clear-room': clearRoom(btn); break;
            case 'clear-all': clearAllData(); break;
            case 'toggle-suspend-room': toggleSuspend(roomEl.querySelector('[data-act="toggle-suspend-room"]')); break;
            case 'toggle-suspend-set': toggleSuspend(btn); break;
            case 'toggle-suspend-deco': toggleSuspend(btn); break;
            case 'toggle-suspend-wallpaper': toggleSuspend(btn); break;
            case 'lock-all':
                isLocked = !isLocked;
                document.querySelector(SELECTORS.lockBtn).classList.toggle('locked', isLocked);
                document.querySelector('.lock-icon').textContent = isLocked ? '🔒' : '🔓';
                showToast(`สถานะ: ${isLocked ? 'ล็อค' : 'ปลดล็อค'}`, isLocked ? 'warning' : 'success');
                break;
        }
    });

    document.querySelector('#copyJsonBtn').addEventListener('click', () => {
        const payload = buildPayload();
        copyToClipboard(JSON.stringify(payload, null, 2));
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const summaryText = generateTextSummary(options);
            copyToClipboard(summaryText);
        }
    });

    document.querySelector('#clearAllBtn').addEventListener('click', clearAllData);
    document.querySelector('#addRoomHeaderBtn').addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        document.querySelector(SELECTORS.lockBtn).classList.toggle('locked', isLocked);
        document.querySelector('.lock-icon').textContent = isLocked ? '🔒' : '🔓';
        showToast(`สถานะ: ${isLocked ? 'ล็อค' : 'ปลดล็อค'}`, isLocked ? 'warning' : 'success');
    });

    // Menu and Import/Export
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
        e.stopPropagation();
    });
    
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const payload = JSON.parse(jsonText);
            localStorage.setItem(STORAGE_KEY, jsonText);
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
            location.reload();
        } catch (e) {
            alert('ข้อมูล JSON ไม่ถูกต้อง');
            console.error(e);
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
        a.download = `Marnthara-data-${(new Date()).toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('ข้อมูลถูกบันทึกเป็นไฟล์แล้ว', 'success');
    });

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