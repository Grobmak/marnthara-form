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
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            let itemCounter = { set: 0, deco: 0, wallpaper: 0 };
            room.querySelectorAll(SELECTORS.set).forEach(item => { itemCounter.set++; item.querySelector("[data-item-title]").textContent = itemCounter.set; });
            room.querySelectorAll(SELECTORS.decoItem).forEach(item => { itemCounter.deco++; item.querySelector("[data-item-title]").textContent = itemCounter.deco; });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => { itemCounter.wallpaper++; item.querySelector("[data-item-title]").textContent = itemCounter.wallpaper; });
        });
    }

    const recalcAll = debounce(() => {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        let totalSets = 0, totalDeco = 0;

        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const isRoomSuspended = room.dataset.suspended === 'true';

            // Calculate sets
            const sets = room.querySelectorAll(SELECTORS.set);
            let roomOpaqueYards = 0, roomSheerYards = 0;
            let roomOpaqueTrack = 0, roomSheerTrack = 0;
            let roomSetCount = 0;
            sets.forEach(set => {
                const isSetSuspended = set.dataset.suspended === 'true';
                const width = clamp01(set.querySelector('input[name="width_m"]').value);
                const height = clamp01(set.querySelector('input[name="height_m"]').value);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                const style = room.querySelector('select[name="room_style"]').value;
                const price = toNum(room.querySelector('select[name="room_price_per_m"]').value);
                const sheerPrice = toNum(set.querySelector('select[name="sheer_price_per_m"]').value);
                const heightAdd = heightPlus(height);
                const styleAdd = stylePlus(style);
                
                let setTotal = 0;
                let opaqueYardage = 0, sheerYardage = 0;
                let opaqueTrack = 0, sheerTrack = 0;

                if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                    opaqueYardage = CALC.fabricYardage(style, width);
                    opaqueTrack = width;
                    const pricePerYard = (price + heightAdd) / 0.9;
                    setTotal += opaqueYardage * pricePerYard + (width * styleAdd);
                }
                if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                    sheerYardage = CALC.fabricYardage(style, width);
                    sheerTrack = width;
                    const sheerPricePerYard = (sheerPrice + heightAdd) / 0.9;
                    setTotal += sheerYardage * sheerPricePerYard + (width * styleAdd);
                }
                
                if (isSetSuspended || isRoomSuspended) setTotal = 0;

                set.querySelector('[data-set-total]').textContent = fmt(setTotal, 0, true);
                set.querySelector('[data-opaque-price]').textContent = fmt(opaqueYardage / 0.9 * (price + heightAdd), 0, true);
                set.querySelector('[data-sheer-price]').textContent = fmt(sheerYardage / 0.9 * (sheerPrice + heightAdd), 0, true);
                set.querySelector('[data-opaque-yardage]').textContent = fmt(opaqueYardage);
                set.querySelector('[data-sheer-yardage]').textContent = fmt(sheerYardage);
                set.querySelector('[data-opaque-track]').textContent = fmt(opaqueTrack);
                set.querySelector('[data-sheer-track]').textContent = fmt(sheerTrack);

                roomSum += setTotal;
                roomOpaqueYards += opaqueYardage;
                roomSheerYards += sheerYardage;
                roomOpaqueTrack += opaqueTrack;
                roomSheerTrack += sheerTrack;
                if (!isSetSuspended) roomSetCount++;
            });

            // Calculate decorations
            const decos = room.querySelectorAll(SELECTORS.decoItem);
            let roomDecoCount = 0;
            decos.forEach(deco => {
                const isDecoSuspended = deco.dataset.suspended === 'true';
                const width = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const height = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const priceSqYd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                const sqm = width * height;
                const total = sqm * SQM_TO_SQYD * priceSqYd;
                
                if (isDecoSuspended || isRoomSuspended) deco.dataset.total = 0;
                else deco.dataset.total = total;

                deco.querySelector('[data-deco-summary] .price:first-of-type').textContent = fmt(total, 0, true);
                deco.querySelector('[data-deco-summary] .price:last-of-type').textContent = fmt(sqm);

                roomSum += Number(deco.dataset.total);
                if (!isDecoSuspended) roomDecoCount++;
            });

            // Calculate wallpapers
            const wallpapers = room.querySelectorAll(SELECTORS.wallpaperItem);
            let roomWallpaperCount = 0;
            wallpapers.forEach(wallpaper => {
                const isWallpaperSuspended = wallpaper.dataset.suspended === 'true';
                const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                const walls = wallpaper.querySelectorAll('input[name="wall_width_m"]');
                const totalWidth = Array.from(walls).reduce((sum, input) => sum + clamp01(input.value), 0);
                const rolls = CALC.wallpaperRolls(totalWidth, height);
                const sqm = totalWidth * height;
                const total = rolls * pricePerRoll;

                if (isWallpaperSuspended || isRoomSuspended) wallpaper.dataset.total = 0;
                else wallpaper.dataset.total = total;

                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = fmt(total, 0, true);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(sqm);
                wallpaper.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = fmt(rolls, 0);

                roomSum += Number(wallpaper.dataset.total);
                if (!isWallpaperSuspended) roomWallpaperCount++;
            });
            
            if (isRoomSuspended) { room.dataset.total = 0; room.classList.add('is-suspended'); }
            else { room.dataset.total = roomSum; room.classList.remove('is-suspended'); }
            
            room.querySelector('[data-room-total]').textContent = fmt(room.dataset.total, 0, true);
            room.querySelector('[data-room-brief]').innerHTML = `จุด ${roomSetCount + roomDecoCount + roomWallpaperCount} • ชุด ${roomSetCount} • ราคา <span class="num price">${fmt(room.dataset.total, 0, true)}</span> บ.`;
            room.querySelector('[data-room-sets]').textContent = `ผ้าม่าน(${roomSetCount}ชุด) `;
            room.querySelector('[data-room-decos]').textContent = `ตกแต่ง(${roomDecoCount}ชุด) `;
            room.querySelector('[data-room-wallpapers]').textContent = `วอลเปเปอร์(${roomWallpaperCount}ชุด) `;

            grand += Number(room.dataset.total);
            grandOpaqueYards += roomOpaqueYards;
            grandSheerYards += roomSheerYards;
            grandOpaqueTrack += roomOpaqueTrack;
            grandSheerTrack += roomSheerTrack;
            totalSets += roomSetCount;
            totalDeco += roomDecoCount;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll('.set, .deco-item, .wallpaper-item').length;
        document.querySelector(SELECTORS.setCountSets).textContent = totalSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = totalDeco;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack)} ม.`;
        
        saveData();
    }, 200);

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function loadData() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const data = JSON.parse(stored);
                document.querySelector('input[name="customer_name"]').value = data.customer_name || "";
                document.querySelector('input[name="customer_phone"]').value = data.customer_phone || "";
                document.querySelector('input[name="customer_address"]').value = data.customer_address || "";
                roomsEl.innerHTML = "";
                if (data.rooms && data.rooms.length > 0) {
                    data.rooms.forEach(r => addRoom(r));
                } else {
                    addRoom();
                }
                recalcAll();
                showToast('กู้คืนข้อมูลล่าสุดแล้ว', 'success');
            } catch (e) {
                console.error("Failed to load data:", e);
                showToast('กู้คืนข้อมูลล้มเหลว', 'error');
                addRoom();
            }
        } else {
            addRoom();
        }
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
            const isSuspended = room.dataset.suspended === 'true';
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                style: room.querySelector(SELECTORS.roomStyle).value,
                is_suspended: isSuspended,
                total_price: Number(room.dataset.total),
                sets: [],
                decorations: [],
                wallpapers: []
            };

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                roomData.sets.push({
                    is_suspended: set.dataset.suspended === 'true',
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                    width_m: clamp01(set.querySelector('input[name="width_m"]').value),
                    height_m: clamp01(set.querySelector('input[name="height_m"]').value),
                    open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]').value),
                });
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                roomData.decorations.push({
                    is_suspended: deco.dataset.suspended === 'true',
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: clamp01(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                });
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                roomData.wallpapers.push({
                    is_suspended: wallpaper.dataset.suspended === 'true',
                    height_m: clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(input => clamp01(input.value)),
                });
            });

            payload.rooms.push(roomData);
        });
        return payload;
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('คัดลอกสำเร็จ', 'success');
        } catch (err) {
            console.error('คัดลอกล้มเหลว: ', err);
            showToast('คัดลอกล้มเหลว', 'error');
        }
    }
    
    function generateTextSummary(payload) {
        const { customer_name, customer_phone, customer_address, rooms } = payload;
        let text = "";
        
        const infoOption = document.querySelector(SELECTORS.copyCustomerInfo).checked;
        const detailsOption = document.querySelector(SELECTORS.copyRoomDetails).checked;
        const summaryOption = document.querySelector(SELECTORS.copySummary).checked;

        if (infoOption) {
            text += `=== ข้อมูลลูกค้า ===\n`;
            text += `ชื่อ: ${customer_name}\n`;
            text += `โทร: ${customer_phone}\n`;
            if (customer_address) text += `รายละเอียด: ${customer_address}\n`;
            text += `\n`;
        }
        
        if (detailsOption) {
            text += `=== รายละเอียดรายการ ===\n`;
            rooms.forEach((room, rIdx) => {
                if (room.is_suspended) return;
                text += `ห้อง ${room.room_name || `0${rIdx+1}`} (${room.style})\n`;
                if (room.sets.length > 0) {
                    room.sets.forEach((set, sIdx) => {
                        if (set.is_suspended) return;
                        text += `  - จุด ${sIdx+1}: ผ้า${set.fabric_variant}, ${set.width_m} x ${set.height_m} ม. (${set.open_type})\n`;
                    });
                }
                if (room.decorations.length > 0) {
                    room.decorations.forEach((deco, dIdx) => {
                        if (deco.is_suspended) return;
                        text += `  - ตกแต่ง ${dIdx+1}: ${deco.type}, ${deco.width_m} x ${deco.height_m} ม.\n`;
                    });
                }
                if (room.wallpapers.length > 0) {
                    room.wallpapers.forEach((wallpaper, wIdx) => {
                        if (wallpaper.is_suspended) return;
                        const totalWidth = wallpaper.widths.reduce((sum, w) => sum + w, 0);
                        text += `  - วอลเปเปอร์ ${wIdx+1}: ${totalWidth} x ${wallpaper.height_m} ม.\n`;
                    });
                }
                text += `  รวม: ${fmt(room.total_price, 0, true)} บ.\n`;
            });
            text += `\n`;
        }

        if (summaryOption) {
            const grandTotal = rooms.reduce((sum, r) => sum + r.total_price, 0);
            const fabricYards = rooms.reduce((sum, r) => sum + r.sets.reduce((setSum, s) => {
                const style = r.style;
                const width = s.width_m;
                if (s.is_suspended || r.is_suspended) return setSum;
                if (s.fabric_variant === "ทึบ" || s.fabric_variant === "ทึบ&โปร่ง") return setSum + CALC.fabricYardage(style, width);
                return setSum;
            }, 0), 0);
            const sheerYards = rooms.reduce((sum, r) => sum + r.sets.reduce((setSum, s) => {
                const style = r.style;
                const width = s.width_m;
                if (s.is_suspended || r.is_suspended) return setSum;
                if (s.fabric_variant === "โปร่ง" || s.fabric_variant === "ทึบ&โปร่ง") return setSum + CALC.fabricYardage(style, width);
                return setSum;
            }, 0), 0);
            const opaqueTrack = rooms.reduce((sum, r) => sum + r.sets.reduce((setSum, s) => {
                if (s.is_suspended || r.is_suspended) return setSum;
                if (s.fabric_variant === "ทึบ" || s.fabric_variant === "ทึบ&โปร่ง") return setSum + s.width_m;
                return setSum;
            }, 0), 0);
            const sheerTrack = rooms.reduce((sum, r) => sum + r.sets.reduce((setSum, s) => {
                if (s.is_suspended || r.is_suspended) return setSum;
                if (s.fabric_variant === "โปร่ง" || s.fabric_variant === "ทึบ&โปร่ง") return setSum + s.width_m;
                return setSum;
            }, 0), 0);
            const totalItems = rooms.reduce((sum, r) => {
                if (r.is_suspended) return sum;
                const sets = r.sets.filter(s => !s.is_suspended).length;
                const decos = r.decorations.filter(d => !d.is_suspended).length;
                const wallpapers = r.wallpapers.filter(w => !w.is_suspended).length;
                return sum + sets + decos + wallpapers;
            }, 0);
            const totalSets = rooms.reduce((sum, r) => {
                if (r.is_suspended) return sum;
                return sum + r.sets.filter(s => !s.is_suspended).length;
            }, 0);
            const totalDeco = rooms.reduce((sum, r) => {
                if (r.is_suspended) return sum;
                const decos = r.decorations.filter(d => !d.is_suspended).length;
                const wallpapers = r.wallpapers.filter(w => !w.is_suspended).length;
                return sum + decos + wallpapers;
            }, 0);
            
            text += `=== สรุปยอดรวม ===\n`;
            text += `ราคารวม: ${fmt(grandTotal, 0, true)} บ.\n`;
            text += `จำนวนจุด: ${totalItems} จุด\n`;
            text += `ผ้าม่าน: ${totalSets} ชุด\n`;
            text += `ตกแต่งเพิ่มเติม: ${totalDeco} ชุด\n`;
            text += `ผ้าทึบที่ใช้: ${fmt(fabricYards)} หลา\n`;
            text += `ผ้าโปร่งที่ใช้: ${fmt(sheerYards)} หลา\n`;
            text += `รางทึบที่ใช้: ${fmt(opaqueTrack)} ม.\n`;
            text += `รางโปร่งที่ใช้: ${fmt(sheerTrack)} ม.\n`;
        }

        return text;
    }
    
    document.addEventListener('DOMContentLoaded', () => {
        loadData();
    });

    document.addEventListener('input', (e) => {
        const input = e.target;
        if (input.matches('input[name="width_m"], input[name="height_m"], select[name="fabric_variant"], select[name="sheer_price_per_m"], select[name="room_price_per_m"], select[name="room_style"]')) {
            recalcAll();
        } else if (input.matches('[name="deco_width_m"], [name="deco_height_m"], [name="deco_price_sqyd"]')) {
            recalcAll();
        } else if (input.matches('[name="wallpaper_height_m"], [name="wallpaper_price_roll"], [name="wall_width_m"]')) {
            recalcAll();
        } else {
            saveData();
        }
    });

    document.addEventListener('click', async (e) => {
        const target = e.target.closest('button, [data-act]');
        if (!target) return;
        
        const action = target.dataset.act;
        const actions = {
            'add-room': () => addRoom(),
            'add-set': () => addSet(target.closest(SELECTORS.room)),
            'add-deco': () => addDeco(target.closest(SELECTORS.room)),
            'add-wallpaper': () => addWallpaper(target.closest(SELECTORS.room)),
            'add-wall': () => addWall(target),
            'del-room': () => delRoom(target),
            'del-set': () => delSet(target),
            'del-deco': () => delDeco(target),
            'del-wallpaper': () => delWallpaper(target),
            'del-wall': () => delWall(target),
            'clear-all': () => clearAllData(),
            'clear-room': () => clearRoom(target),
            'clear-set': () => clearSet(target),
            'clear-deco': () => clearDeco(target),
            'clear-wallpaper': () => clearWallpaper(target),
            'copy-json': () => copyToClipboard(JSON.stringify(buildPayload(), null, 2)),
            'copy-text': async () => {
                const options = await showCopyOptionsModal();
                if (options) {
                    const payload = buildPayload();
                    const text = generateTextSummary(payload);
                    copyToClipboard(text);
                }
            },
            'submit': () => orderForm.submit(),
            'toggle-room-suspend': () => toggleRoomSuspend(target),
            'toggle-set-suspend': () => toggleSuspend(target),
            'toggle-deco-suspend': () => toggleSuspend(target),
            'toggle-wallpaper-suspend': () => toggleSuspend(target),
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

    document.querySelector(SELECTORS.lockBtn).addEventListener('click', (e) => {
        e.preventDefault();
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ล็อคข้อมูลแล้ว' : 'ปลดล็อคแล้ว', 'info');
    });

    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        document.body.classList.toggle('is-locked', isLocked);
        if (isLocked) lockBtn.classList.remove('btn-primary');
        else lockBtn.classList.add('btn-primary');
    }
    
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });

    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        try {
            const data = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
            document.querySelector(SELECTORS.importJsonArea).value = '';
            
            document.querySelector('input[name="customer_name"]').value = data.customer_name || "";
            document.querySelector('input[name="customer_phone"]').value = data.customer_phone || "";
            document.querySelector('input[name="customer_address"]').value = data.customer_address || "";
            roomsEl.innerHTML = "";
            (data.rooms || []).forEach(r => addRoom(r));
            
            recalcAll();
            saveData();
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
        } catch (e) {
            showToast('รูปแบบข้อมูล JSON ไม่ถูกต้อง', 'error');
            console.error(e);
        }
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const json = JSON.stringify(payload, null, 2);
        copyToClipboard(json);
    });

    document.querySelectorAll('.tab-controls .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const room = btn.closest(SELECTORS.room);
            const tabName = btn.dataset.tabName;
            
            room.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            room.querySelectorAll('.tab-content').forEach(c => c.classList.remove('show'));
            room.querySelector(`[data-tab="${tabName}"]`).classList.add('show');
        });
    });
})();