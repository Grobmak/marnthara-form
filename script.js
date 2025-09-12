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
        const created = frag.querySelector(SELECTORS.set);
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
        
        setsWrap.appendChild(frag);
        toggleSetFabricUI(created); renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มจุดผ้าม่านแล้ว', 'success');
    }
    
    function addDeco(roomEl, prefill) {
        if (isLocked) return;
        const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
        const created = frag.querySelector(SELECTORS.decoItem);

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
        decoWrap.appendChild(frag);
        renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มรายการตกแต่งแล้ว', 'success');
    }

    function addWallpaper(roomEl, prefill) {
        if (isLocked) return;
        const wallpaperWrap = roomEl.querySelector(SELECTORS.wallpapersContainer);
        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        const created = frag.querySelector(SELECTORS.wallpaperItem);

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
        
        wallpaperWrap.appendChild(frag);
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
        if (!item) return;
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    function toggleRoomSuspend(btn) {
        const room = btn.closest(SELECTORS.room);
        const isSuspended = !(room.dataset.suspended === 'true');
        room.dataset.suspended = isSuspended;
        room.classList.toggle('is-suspended', isSuspended);
        recalcAll(); saveData();
        showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }
    async function clearRoom(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูลห้อง', 'ยืนยันการล้างข้อมูลทั้งหมดในห้องนี้?')) return; const room = btn.closest(SELECTORS.room); room.querySelector(SELECTORS.setsContainer).innerHTML = ""; room.querySelector(SELECTORS.decorationsContainer).innerHTML = ""; room.querySelector(SELECTORS.wallpapersContainer).innerHTML = ""; room.querySelector(SELECTORS.roomNameInput).value = ""; room.querySelector(SELECTORS.roomPricePerM).value = ""; room.querySelector(SELECTORS.roomStyle).value = ""; addSet(room); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลห้องแล้ว', 'success'); }
    async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); }
    async function clearDeco(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; btn.closest(SELECTORS.decoItem).querySelectorAll('input, select').forEach(el => { el.value = ''; }); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลตกแต่งแล้ว', 'success'); }
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); item.querySelectorAll('input').forEach(el => el.value = ''); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); }
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            room.dataset.index = rIdx + 1;
            room.querySelector('.set-title').textContent = `จุดติดตั้ง ${rIdx + 1}`;
            room.querySelector('.deco-num').textContent = rIdx + 1;
            room.querySelector('.wallpaper-num').textContent = rIdx + 1;
        });
        document.querySelectorAll(SELECTORS.set).forEach((set, sIdx) => {
            set.querySelector('.set-num').textContent = sIdx + 1;
        });
    }

    function recalcAll() {
        let grandTotal = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        let setCount = 0;
        let setCountSets = 0;
        let setCountDeco = 0;

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            if (roomEl.dataset.suspended === 'true') {
                roomEl.querySelector('[data-room-total-price]').textContent = "0";
                roomEl.querySelector('[data-room-curtain-price]').textContent = "0";
                roomEl.querySelector('[data-room-deco-price]').textContent = "0";
                roomEl.querySelector('[data-room-wallpaper-price]').textContent = "0";
                roomEl.querySelector('[data-room-opaque-yardage]').textContent = "0";
                roomEl.querySelector('[data-room-sheer-yardage]').textContent = "0";
                roomEl.querySelector('[data-room-opaque-track]').textContent = "0";
                roomEl.querySelector('[data-room-sheer-track]').textContent = "0";
                roomEl.querySelector('[data-room-brief]').textContent = "ระงับการใช้งาน";
                return;
            }
            
            let roomCurtainPrice = 0, roomDecoPrice = 0, roomWallpaperPrice = 0;
            let roomOpaqueYd = 0, roomSheerYd = 0;
            let roomOpaqueTrack = 0, roomSheerTrack = 0;
            let roomSetCount = 0, roomDecoCount = 0;
            
            const roomStyle = roomEl.querySelector(SELECTORS.roomStyle).value;
            const roomPricePerM = toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value);

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                if (setEl.dataset.suspended === 'true') {
                    setEl.querySelector('[data-set-total]').textContent = "0";
                    setEl.querySelector('[data-opaque-yardage]').textContent = "0";
                    setEl.querySelector('[data-sheer-yardage]').textContent = "0";
                    setEl.querySelector('[data-opaque-track]').textContent = "0.00";
                    setEl.querySelector('[data-sheer-track]').textContent = "0.00";
                    return;
                }

                setCount++;
                setCountSets++;
                roomSetCount++;

                const width = clamp01(setEl.querySelector('input[name="width_m"]').value);
                const height = clamp01(setEl.querySelector('input[name="height_m"]').value);
                const variant = setEl.querySelector('select[name="fabric_variant"]').value;
                const sheerPricePerM = toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value);
                const styleSurcharge = stylePlus(roomStyle);
                const heightSurcharge = heightPlus(height);
                
                let setTotal = 0;
                let opaqueYardage = 0;
                let sheerYardage = 0;
                let opaqueTrack = 0;
                let sheerTrack = 0;

                if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                    opaqueYardage = CALC.fabricYardage(roomStyle, width);
                    opaqueTrack = width;
                    setTotal += (roomPricePerM + styleSurcharge + heightSurcharge) * opaqueYardage * 0.9;
                }
                if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                    sheerYardage = CALC.fabricYardage(roomStyle, width);
                    sheerTrack = width;
                    setTotal += (sheerPricePerM + styleSurcharge + heightSurcharge) * sheerYardage * 0.9;
                }
                
                setEl.querySelector('[data-opaque-yardage]').textContent = fmt(opaqueYardage, 2);
                setEl.querySelector('[data-sheer-yardage]').textContent = fmt(sheerYardage, 2);
                setEl.querySelector('[data-opaque-track]').textContent = fmt(opaqueTrack, 2);
                setEl.querySelector('[data-sheer-track]').textContent = fmt(sheerTrack, 2);
                setEl.querySelector('[data-set-total]').textContent = fmt(setTotal, 0, true);

                roomCurtainPrice += setTotal;
                roomOpaqueYd += opaqueYardage;
                roomSheerYd += sheerYardage;
                roomOpaqueTrack += opaqueTrack;
                roomSheerTrack += sheerTrack;
            });
            
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                if (decoEl.dataset.suspended === 'true') {
                    decoEl.querySelector('[data-deco-total]').textContent = "0";
                    decoEl.querySelector('[data-deco-area]').textContent = "0.00";
                    return;
                }

                setCountDeco++;
                roomDecoCount++;
                
                const width = clamp01(decoEl.querySelector('input[name="deco_width_m"]').value);
                const height = clamp01(decoEl.querySelector('input[name="deco_height_m"]').value);
                const priceSqYd = toNum(decoEl.querySelector('input[name="deco_price_sqyd"]').value);
                
                const areaSqm = width * height;
                const areaSqyd = areaSqm * SQM_TO_SQYD;
                const decoTotal = areaSqyd * priceSqYd;
                
                decoEl.querySelector('[data-deco-area]').textContent = fmt(areaSqm, 2);
                decoEl.querySelector('[data-deco-total]').textContent = fmt(decoTotal, 0, true);
                
                roomDecoPrice += decoTotal;
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                if (wallpaperEl.dataset.suspended === 'true') {
                    wallpaperEl.querySelector('[data-wallpaper-summary]').innerHTML = "ระงับการใช้งาน";
                    return;
                }

                setCountDeco++;
                roomDecoCount++;
                
                const height = clamp01(wallpaperEl.querySelector('input[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value);
                
                let totalWidth = 0;
                wallpaperEl.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                    totalWidth += clamp01(input.value);
                });
                
                const rolls = CALC.wallpaperRolls(totalWidth, height);
                const wallpaperTotal = rolls * pricePerRoll;
                const areaSqm = totalWidth * height;

                wallpaperEl.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${fmt(wallpaperTotal, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(areaSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${rolls}</span> ม้วน`;
                roomWallpaperPrice += wallpaperTotal;
            });

            const roomTotalPrice = roomCurtainPrice + roomDecoPrice + roomWallpaperPrice;
            roomEl.querySelector('[data-room-total-price]').textContent = fmt(roomTotalPrice, 0, true);
            roomEl.querySelector('[data-room-curtain-price]').textContent = fmt(roomCurtainPrice, 0, true);
            roomEl.querySelector('[data-room-deco-price]').textContent = fmt(roomDecoPrice, 0, true);
            roomEl.querySelector('[data-room-wallpaper-price]').textContent = fmt(roomWallpaperPrice, 0, true);
            roomEl.querySelector('[data-room-opaque-yardage]').textContent = fmt(roomOpaqueYd, 2);
            roomEl.querySelector('[data-room-sheer-yardage]').textContent = fmt(roomSheerYd, 2);
            roomEl.querySelector('[data-room-opaque-track]').textContent = fmt(roomOpaqueTrack, 2);
            roomEl.querySelector('[data-room-sheer-track]').textContent = fmt(roomSheerTrack, 2);
            roomEl.querySelector('[data-room-brief]').textContent = `จุด ${roomSetCount + roomDecoCount} • ชุด ${roomSetCount} • ราคา ${fmt(roomTotalPrice, 0, true)} บ.`;

            grandTotal += roomTotalPrice;
            grandFabric += roomOpaqueYd;
            grandSheerFabric += roomSheerYd;
            grandOpaqueTrack += roomOpaqueTrack;
            grandSheerTrack += roomSheerTrack;
        });
        
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = setCountSets + setCountDeco;
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandFabric, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerFabric, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            customer_info: {
                name: document.querySelector('input[name="customer_name"]').value,
                phone: document.querySelector('input[name="customer_phone"]').value,
                address: document.querySelector('input[name="customer_address"]').value
            },
            rooms: []
        };
        
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                is_suspended: roomEl.dataset.suspended === 'true',
                price_per_m_raw: roomEl.querySelector(SELECTORS.roomPricePerM).value,
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: []
            };
            
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    is_suspended: setEl.dataset.suspended === 'true',
                    width_m: toNum(setEl.querySelector('input[name="width_m"]').value),
                    height_m: toNum(setEl.querySelector('input[name="height_m"]').value),
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value)
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    is_suspended: decoEl.dataset.suspended === 'true',
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value)
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const widths = [];
                wallpaperEl.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                    widths.push(toNum(input.value));
                });
                roomData.wallpapers.push({
                    is_suspended: wallpaperEl.dataset.suspended === 'true',
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths
                });
            });

            payload.rooms.push(roomData);
        });
        
        return payload;
    }
    
    function copyText(options) {
        const payload = buildPayload();
        let text = "";
        
        if (options.customer) {
            text += "=== ข้อมูลลูกค้า ===\n";
            text += `ชื่อลูกค้า: ${payload.customer_info.name}\n`;
            text += `เบอร์โทร: ${payload.customer_info.phone}\n`;
            text += `รายละเอียด: ${payload.customer_info.address}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach(room => {
                if (room.is_suspended) return;
                text += `=== ห้อง: ${room.room_name} ===\n`;
                text += `สไตล์: ${room.style} (ราคา/ม. ${room.price_per_m_raw} บ.)\n`;
                
                room.sets.forEach((set, sIdx) => {
                    if (set.is_suspended) return;
                    text += `- จุด ${sIdx + 1}: ${set.width_m}ม. x ${set.height_m}ม. (${set.fabric_variant})\n`;
                });

                room.decorations.forEach((deco, dIdx) => {
                    if (deco.is_suspended) return;
                    text += `- ตกแต่ง ${dIdx + 1}: ${deco.type} ${deco.width_m}ม. x ${deco.height_m}ม. (@ ${deco.price_sqyd} บ./ตร.หลา)\n`;
                });

                room.wallpapers.forEach((wallpaper, wIdx) => {
                    if (wallpaper.is_suspended) return;
                    text += `- วอลเปเปอร์ ${wIdx + 1}: สูง ${wallpaper.height_m}ม. กว้าง ${wallpaper.widths.join(', ')}ม. (@ ${wallpaper.price_per_roll} บ./ม้วน)\n`;
                });

                text += "\n";
            });
        }
        
        if (options.summary) {
            text += "=== สรุปยอดรวม ===\n";
            text += `ผ้ารวม: ${document.querySelector(SELECTORS.grandFabric).textContent} (ทึบ) / ${document.querySelector(SELECTORS.grandSheerFabric).textContent} (โปร่ง)\n`;
            text += `รางรวม: ${document.querySelector(SELECTORS.grandOpaqueTrack).textContent} (ทึบ) / ${document.querySelector(SELECTORS.grandSheerTrack).textContent} (โปร่ง)\n`;
            text += `จำนวนจุด: ${document.querySelector(SELECTORS.setCount).textContent} (ผ้าม่าน ${document.querySelector(SELECTORS.setCountSets).textContent} / ตกแต่ง+วอลล์ ${document.querySelector(SELECTORS.setCountDeco).textContent})\n`;
            text += `ราคารวม: ${document.querySelector(SELECTORS.grandTotal).textContent} บ.\n\n`;
        }
        
        navigator.clipboard.writeText(text).then(() => { showToast('คัดลอกข้อความแล้ว', 'success'); }, () => { showToast('คัดลอกข้อความไม่สำเร็จ', 'error'); });
    }
    
    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function loadData() {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return;
        const payload = JSON.parse(data);
        if (payload.version !== APP_VERSION) return;
        
        document.querySelector('input[name="customer_name"]').value = payload.customer_info.name || "";
        document.querySelector('input[name="customer_phone"]').value = payload.customer_info.phone || "";
        document.querySelector('input[name="customer_address"]').value = payload.customer_info.address || "";

        roomsEl.innerHTML = "";
        roomCount = 0;
        
        if (payload.rooms && payload.rooms.length > 0) {
            payload.rooms.forEach(room => addRoom(room));
        } else {
            addRoom();
        }
    }
    
    function updateLockState() {
        isLocked = false;
        document.querySelectorAll(SELECTORS.room).forEach(room => { if (room.dataset.suspended === 'true') isLocked = true; });
        document.querySelectorAll(SELECTORS.set).forEach(set => { if (set.dataset.suspended === 'true') isLocked = true; });
        document.querySelectorAll(SELECTORS.decoItem).forEach(deco => { if (deco.dataset.suspended === 'true') isLocked = true; });
        document.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => { if (wallpaper.dataset.suspended === 'true') isLocked = true; });
        
        document.querySelector(SELECTORS.lockBtn).innerHTML = isLocked ? `<span class="lock-text">ปลดล็อค</span> <span class="lock-icon material-symbols-outlined">lock</span>` : `<span class="lock-text">ล็อค</span> <span class="lock-icon material-symbols-outlined">lock_open</span>`;
        document.body.classList.toggle('is-locked', isLocked);
    }
    
    function exportJson() {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) {
            showToast('ไม่มีข้อมูลที่จะส่งออก', 'warning');
            return;
        }
        
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marnthara-input-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('ส่งออกข้อมูลแล้ว', 'success');
    }

    function importJson() {
        const importModal = document.querySelector(SELECTORS.importModal);
        const importJsonArea = document.querySelector(SELECTORS.importJsonArea);
        const importConfirmBtn = document.querySelector(SELECTORS.importConfirm);
        const importCancelBtn = document.querySelector(SELECTORS.importCancel);
        
        importJsonArea.value = "";
        importModal.classList.add('visible');
        
        const handleConfirm = async () => {
            try {
                const data = JSON.parse(importJsonArea.value);
                if (await showConfirmation('ยืนยันการนำเข้า', 'ข้อมูลปัจจุบันจะถูกเขียนทับ คุณแน่ใจหรือไม่?')) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                    loadData();
                    showToast('นำเข้าข้อมูลสำเร็จ', 'success');
                }
            } catch (e) {
                showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
            }
            importModal.classList.remove('visible');
            importConfirmBtn.removeEventListener('click', handleConfirm);
            importCancelBtn.removeEventListener('click', handleCancel);
        };
        
        const handleCancel = () => {
            importModal.classList.remove('visible');
            importConfirmBtn.removeEventListener('click', handleConfirm);
            importCancelBtn.removeEventListener('click', handleCancel);
        };

        importConfirmBtn.addEventListener('click', handleConfirm);
        importCancelBtn.addEventListener('click', handleCancel);
    }

    /* Event Listeners */
    document.querySelector(SELECTORS.addRoomHeaderBtn).onclick = () => addRoom();
    document.querySelector(SELECTORS.clearAllBtn).onclick = () => clearAllData();
    document.querySelector(SELECTORS.lockBtn).onclick = () => {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ล็อคการแก้ไขแล้ว' : 'ปลดล็อคการแก้ไขแล้ว', isLocked ? 'warning' : 'success');
    };
    document.querySelector(SELECTORS.copyJsonBtn).onclick = () => {
        navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2)).then(() => { showToast('คัดลอก JSON แล้ว', 'success'); }, () => { showToast('คัดลอก JSON ไม่สำเร็จ', 'error'); });
    };
    document.querySelector(SELECTORS.copyTextBtn).onclick = async () => {
        const options = await showCopyOptionsModal();
        if (options) copyText(options);
    };
    document.querySelector(SELECTORS.menuBtn).onclick = () => { document.querySelector(SELECTORS.menuDropdown).classList.toggle('show'); };
    document.querySelector(SELECTORS.importBtn).onclick = () => importJson();
    document.querySelector(SELECTORS.exportBtn).onclick = () => exportJson();

    roomsEl.addEventListener('change', debounce(() => { recalcAll(); saveData(); }));
    roomsEl.addEventListener('input', debounce(() => { recalcAll(); saveData(); }));
    document.querySelector('#customerInfo').addEventListener('input', debounce(saveData));

    roomsEl.addEventListener('click', (e) => {
        const target = e.target;
        const action = target.dataset.act;
        if (!action) return;
        
        const actions = {
            'add-set': () => addSet(target.closest(SELECTORS.room)),
            'add-deco': () => addDeco(target.closest(SELECTORS.room)),
            'add-wallpaper': () => addWallpaper(target.closest(SELECTORS.room)),
            'add-wall': () => addWall(target),
            'del-room': () => delRoom(target),
            'clear-room': () => clearRoom(target),
            'toggle-room-suspend': () => toggleRoomSuspend(target),
            'del-set': () => delSet(target),
            'clear-set': () => clearSet(target),
            'copy-set': () => { addSet(target.closest(SELECTORS.room), buildPayload().rooms.find(r => r.room_name === target.closest(SELECTORS.room).querySelector('input[name="room_name"]').value).sets.find(s => s.width_m === toNum(target.closest(SELECTORS.set).querySelector('input[name="width_m"]').value) && s.height_m === toNum(target.closest(SELECTORS.set).querySelector('input[name="height_m"]').value))); },
            'copy-room': () => { addRoom(buildPayload().rooms.find(r => r.room_name === target.closest(SELECTORS.room).querySelector('input[name="room_name"]').value)); },
            'toggle-set-suspend': () => toggleSuspend(target),
            'del-deco': () => delDeco(target),
            'clear-deco': () => clearDeco(target),
            'copy-deco': () => addDeco(target.closest(SELECTORS.room), buildPayload().rooms.find(r => r.room_name === target.closest(SELECTORS.room).querySelector('input[name="room_name"]').value).decorations.find(d => d.type === target.closest(SELECTORS.decoItem).querySelector('[name="deco_type"]').value)),
            'toggle-deco-suspend': () => toggleSuspend(target),
            'copy-wallpaper': () => addWallpaper(target.closest(SELECTORS.room), buildPayload().rooms.find(r => r.room_name === target.closest(SELECTORS.room).querySelector('input[name="room_name"]').value).wallpapers.find(w => w.height_m === toNum(target.closest(SELECTORS.wallpaperItem).querySelector('[name="wallpaper_height_m"]').value))),
            'toggle-wallpaper-suspend': () => toggleSuspend(target),
            'clear-wallpaper': () => clearWallpaper(target),
            'del-wallpaper': () => delWallpaper(target),
            'del-wall': () => delWall(target),
        };

        if (actions[action]) {
            actions[action]();
        }
    });

    roomsEl.addEventListener('change', (e) => {
        if (e.target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
    });

    document.addEventListener('click', (e) => {
        document.querySelectorAll('.menu-dropdown.show').forEach(dropdown => {
             if (!dropdown.parentElement.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });

        const menuBtn = e.target.closest('.room-menu-btn, .set-menu-btn, .deco-menu-btn, .wallpaper-menu-btn');
        if (menuBtn) {
            e.preventDefault();
            const dropdown = menuBtn.closest('.menu-container').querySelector('.menu-dropdown');
            dropdown.classList.toggle('show');
            return;
        }
    });

    orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
    });

    document.addEventListener('DOMContentLoaded', () => {
        loadData();
        updateLockState();
        recalcAll();
    });
})();