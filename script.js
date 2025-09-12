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

    async function clearRoom(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูลห้อง', 'ยืนยันการล้างข้อมูลทั้งหมดในห้องนี้?')) return;
        const room = btn.closest(SELECTORS.room);
        room.querySelector(SELECTORS.setsContainer).innerHTML = "";
        room.querySelector(SELECTORS.decorationsContainer).innerHTML = "";
        room.querySelector(SELECTORS.wallpapersContainer).innerHTML = "";
        room.querySelector(SELECTORS.roomNameInput).value = "";
        room.querySelector(SELECTORS.roomPricePerM).value = "";
        room.querySelector(SELECTORS.roomStyle).value = "";
        addSet(room);
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลห้องแล้ว', 'success');
    }

    async function clearSet(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return;
        const set = btn.closest(SELECTORS.set);
        set.querySelectorAll('input, select').forEach(el => {
            el.value = el.name === 'fabric_variant' ? 'ทึบ' : '';
        });
        toggleSetFabricUI(set);
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success');
    }

    async function clearDeco(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return;
        btn.closest(SELECTORS.decoItem).querySelectorAll('input, select').forEach(el => {
            el.value = '';
        });
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลตกแต่งแล้ว', 'success');
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
        if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return;
        roomsEl.innerHTML = "";
        roomCount = 0;
        document.querySelectorAll('#customerInfo input').forEach(i => i.value = "");
        addRoom();
        saveData(); updateLockState();
        showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
    }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            let itemCounter = { set: 0, deco: 0, wallpaper: 0 };
            room.querySelectorAll(SELECTORS.set).forEach(item => {
                itemCounter.set++;
                item.querySelector("[data-item-title]").textContent = itemCounter.set;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach(item => {
                itemCounter.deco++;
                item.querySelector("[data-item-title]").textContent = itemCounter.deco;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                itemCounter.wallpaper++;
                item.querySelector("[data-item-title]").textContent = itemCounter.wallpaper;
            });
            updateRoomBrief(room);
        });
    }

    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: [],
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const isSuspended = roomEl.dataset.suspended === 'true';
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: roomEl.querySelector(SELECTORS.roomPricePerM).value,
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                is_suspended: isSuspended,
                sets: [],
                decorations: [],
                wallpapers: [],
            };
            if (!isSuspended) {
                roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                    const isSetSuspended = setEl.dataset.suspended === 'true';
                    const setData = {
                        width_m: toNum(setEl.querySelector('input[name="width_m"]').value),
                        height_m: toNum(setEl.querySelector('input[name="height_m"]').value),
                        fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                        open_type: setEl.querySelector('select[name="open_type"]').value,
                        sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                        is_suspended: isSetSuspended,
                    };
                    if (!isSetSuspended) roomData.sets.push(setData);
                });
                roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                    const isDecoSuspended = decoEl.dataset.suspended === 'true';
                    const decoData = {
                        type: decoEl.querySelector('[name="deco_type"]').value,
                        price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                        width_m: toNum(decoEl.querySelector('[name="deco_width_m"]').value),
                        height_m: toNum(decoEl.querySelector('[name="deco_height_m"]').value),
                        is_suspended: isDecoSuspended,
                    };
                    if (!isDecoSuspended) roomData.decorations.push(decoData);
                });
                roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                    const isWallpaperSuspended = wallpaperEl.dataset.suspended === 'true';
                    const wallpaperData = {
                        height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                        price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                        widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)),
                        is_suspended: isWallpaperSuspended,
                    };
                    if (!isWallpaperSuspended) roomData.wallpapers.push(wallpaperData);
                });
            }
            payload.rooms.push(roomData);
        });
        return payload;
    };

    const loadPayload = (payload) => {
        if (!payload || !payload.rooms) return;
        document.querySelectorAll('#customerInfo input').forEach(i => i.value = payload[i.name] || "");
        roomsEl.innerHTML = "";
        roomCount = 0;
        payload.rooms.forEach(room => addRoom(room));
        renumber(); recalcAll();
    };

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const isRoomSuspended = room.dataset.suspended === 'true';
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (isRoomSuspended || set.dataset.suspended === 'true') {
                    set.querySelector('[data-set-price-total]').textContent = "0";
                    return;
                }
                const w = clamp01(set.querySelector('input[name="width_m"]').value);
                const h = clamp01(set.querySelector('input[name="height_m"]').value);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                const sheerPriceRaw = toNum(set.querySelector('select[name="sheer_price_per_m"]').value);
                const hPlus = heightPlus(h);
                let setSum = 0;
                let opaqueYards = 0, sheerYards = 0;
                let opaqueTrack = 0, sheerTrack = 0;

                if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                    opaqueYards = CALC.fabricYardage(style, w);
                    setSum += opaqueYards * 0.9 * (baseRaw + hPlus + sPlus);
                    opaqueTrack = w;
                }
                if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                    sheerYards = CALC.fabricYardage(style, w);
                    setSum += sheerYards * 0.9 * sheerPriceRaw;
                    sheerTrack = w;
                }

                set.querySelector('[data-opaque-price-total]').textContent = fmt(opaqueYards * 0.9 * (baseRaw + hPlus + sPlus), 0, true);
                set.querySelector('[data-opaque-yardage]').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-sheer-price-total]').textContent = fmt(sheerYards * 0.9 * sheerPriceRaw, 0, true);
                set.querySelector('[data-sheer-yardage]').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-sheer-track]').textContent = fmt(sheerTrack, 2);

                set.querySelector('[data-set-price-total]').textContent = fmt(setSum, 0, true);
                
                roomSum += setSum;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                if (isRoomSuspended || deco.dataset.suspended === 'true') {
                    deco.querySelector('[data-deco-price-total]').textContent = "0";
                    return;
                }
                const price = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const sqM = w * h;
                const sqYd = sqM * SQM_TO_SQYD;
                const sum = sqYd * price;
                roomSum += sum;
                deco.querySelector('[data-deco-price-total]').textContent = fmt(sum, 0, true);
                deco.querySelector('[data-deco-sqyd]').textContent = fmt(sqYd, 2);
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper) => {
                if (isRoomSuspended || wallpaper.dataset.suspended === 'true') {
                    wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = 'ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน';
                    return;
                }
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const totalRolls = CALC.wallpaperRolls(totalWidth, h);
                const sum = totalRolls * pricePerRoll;
                const totalSqM = totalWidth * h;
                
                roomSum += sum;
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = 
                    `ราคา: <span class="price">${fmt(sum, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalSqM, 2)}</span> ตร.ม. • ใช้ <span class="price">${fmt(totalRolls, 0, true)}</span> ม้วน`;
            });
            room.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด ${room.querySelectorAll(SELECTORS.set).length}</span> • <span class="num">ชุด ${room.querySelectorAll(SELECTORS.decoItem).length}</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บาท`;
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length + document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length + document.querySelectorAll(`${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length + document.querySelectorAll(`${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
    }

    const saveData = debounce(() => {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    });

    const updateLockState = () => {
        isLocked = document.querySelectorAll('.room').length > 0;
        const lockText = document.querySelector('.lock-text');
        const lockIcon = document.querySelector('.lock-icon');
        lockText.textContent = isLocked ? "ปลดล็อค" : "ล็อค";
        lockIcon.textContent = isLocked ? "lock" : "lock_open";
        document.querySelector(SELECTORS.addRoomHeaderBtn).disabled = isLocked;
        document.querySelector(SELECTORS.clearAllBtn).disabled = isLocked;
    };
    
    function updateRoomBrief(roomEl) {
        const setsCount = roomEl.querySelectorAll(SELECTORS.set).length;
        const decosCount = roomEl.querySelectorAll(SELECTORS.decoItem).length;
        const wallpapersCount = roomEl.querySelectorAll(SELECTORS.wallpaperItem).length;
        const briefEl = roomEl.querySelector('[data-room-brief]');
        
        let briefText = `จุด ${setsCount} `;
        if (decosCount + wallpapersCount > 0) {
            briefText += `• ชุดตกแต่ง ${decosCount + wallpapersCount} `;
        }
        
        briefEl.innerHTML = `<span class="num">${briefText}</span> • ราคา <span class="num price">0</span> บาท`;
    }

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast('คัดลอกข้อมูลแล้ว', 'success');
        } catch (err) {
            showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
            console.error('Failed to copy: ', err);
        }
    };

    const copyJson = () => {
        copyToClipboard(JSON.stringify(buildPayload(), null, 2));
    };

    const copyText = async () => {
        const options = await showCopyOptionsModal();
        if (!options) return;
        
        const payload = buildPayload();
        let output = "";
        
        if (options.customer) {
            output += `=== ข้อมูลลูกค้า ===\n`;
            output += `ชื่อ: ${payload.customer_name}\n`;
            output += `เบอร์โทร: ${payload.customer_phone}\n`;
            output += `รายละเอียดเพิ่มเติม: ${payload.customer_address}\n\n`;
        }
        
        let grandTotal = 0;
        let setCount = 0;
        let grandFabricYards = 0;
        let grandSheerYards = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        
        if (options.details) {
            output += `=== รายละเอียดการคำนวณ ===\n`;
            payload.rooms.forEach(room => {
                output += `[ห้อง: ${room.room_name || 'ไม่ระบุชื่อ'}] ${room.is_suspended ? '(ระงับ)' : ''}\n`;
                if (!room.is_suspended) {
                    let roomTotal = 0;
                    room.sets.forEach((set, i) => {
                        const style = room.style;
                        const basePrice = toNum(room.price_per_m_raw);
                        const sheerPrice = toNum(set.sheer_price_per_m);
                        const hPlus = heightPlus(set.height_m);
                        const sPlus = stylePlus(style);
                        const opaqueYards = (set.fabric_variant.includes("ทึบ")) ? CALC.fabricYardage(style, set.width_m) : 0;
                        const sheerYards = (set.fabric_variant.includes("โปร่ง")) ? CALC.fabricYardage(style, set.width_m) : 0;
                        const opaqueTrack = (set.fabric_variant.includes("ทึบ")) ? set.width_m : 0;
                        const sheerTrack = (set.fabric_variant.includes("โปร่ง")) ? set.width_m : 0;
                        const opaqueCost = opaqueYards * 0.9 * (basePrice + hPlus + sPlus);
                        const sheerCost = sheerYards * 0.9 * sheerPrice;
                        const totalCost = opaqueCost + sheerCost;
                        
                        output += `- จุดติดตั้ง #${i+1}: ${set.width_m}ม. x ${set.height_m}ม. ${set.is_suspended ? '(ระงับ)' : ''}\n`;
                        if (!set.is_suspended) {
                            output += `  ประเภท: ${set.fabric_variant}, สไตล์: ${room.style}\n`;
                            output += `  ราคา: ${fmt(totalCost, 0, true)} บ. (ทึบ: ${fmt(opaqueCost, 0, true)} บ., โปร่ง: ${fmt(sheerCost, 0, true)} บ.)\n`;
                            output += `  ใช้: ${fmt(opaqueYards, 2)} หลา (ทึบ) / ${fmt(sheerYards, 2)} หลา (โปร่ง)\n`;
                            output += `  ราง: ${fmt(opaqueTrack, 2)} ม. (ทึบ) / ${fmt(sheerTrack, 2)} ม. (โปร่ง)\n`;
                            roomTotal += totalCost;
                            setCount++;
                            grandFabricYards += opaqueYards;
                            grandSheerYards += sheerYards;
                            grandOpaqueTrack += opaqueTrack;
                            grandSheerTrack += sheerTrack;
                        }
                    });

                    room.decorations.forEach((deco, i) => {
                        const sqYd = deco.width_m * deco.height_m * SQM_TO_SQYD;
                        const cost = sqYd * deco.price_sqyd;
                        output += `- ตกแต่งเพิ่ม #${i+1}: ${deco.type} ${deco.width_m}ม. x ${deco.height_m}ม. ${deco.is_suspended ? '(ระงับ)' : ''}\n`;
                        if (!deco.is_suspended) {
                            output += `  ราคา: ${fmt(cost, 0, true)} บ. (${fmt(sqYd, 2)} ตร.หลา @ ${fmt(deco.price_sqyd, 0, true)} บ./ตร.หลา)\n`;
                            roomTotal += cost;
                            setCount++;
                        }
                    });
                    
                    room.wallpapers.forEach((wallpaper, i) => {
                        const totalWidth = wallpaper.widths.reduce((sum, w) => sum + w, 0);
                        const totalSqM = totalWidth * wallpaper.height_m;
                        const rollsNeeded = CALC.wallpaperRolls(totalWidth, wallpaper.height_m);
                        const cost = rollsNeeded * wallpaper.price_per_roll;
                        output += `- วอลเปเปอร์ #${i+1}: ${totalWidth}ม. x ${wallpaper.height_m}ม. ${wallpaper.is_suspended ? '(ระงับ)' : ''}\n`;
                        if (!wallpaper.is_suspended) {
                            output += `  ราคา: ${fmt(cost, 0, true)} บ. (${fmt(totalSqM, 2)} ตร.ม. ใช้ ${rollsNeeded} ม้วน)\n`;
                            roomTotal += cost;
                            setCount++;
                        }
                    });
                    
                    output += `  >> ราคารวมห้องนี้: ${fmt(roomTotal, 0, true)} บ.\n`;
                    grandTotal += roomTotal;
                }
            });
            output += `\n`;
        }

        if (options.summary) {
            output += `=== สรุปยอดรวม ===\n`;
            output += `ราคารวมทั้งหมด: ${fmt(grandTotal, 0, true)} บ.\n`;
            output += `จำนวนจุดติดตั้ง: ${setCount} จุด\n`;
            output += `ผ้าทึบที่ใช้: ${fmt(grandFabricYards, 2)} หลา\n`;
            output += `ผ้าโปร่งที่ใช้: ${fmt(grandSheerYards, 2)} หลา\n`;
            output += `รางทึบที่ใช้: ${fmt(grandOpaqueTrack, 2)} ม.\n`;
            output += `รางโปร่งที่ใช้: ${fmt(grandSheerTrack, 2)} ม.\n`;
        }

        copyToClipboard(output);
    };

    // Event Listeners
    document.addEventListener('DOMContentLoaded', () => {
        const payload = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (payload) {
            loadPayload(payload);
        } else {
            addRoom();
        }
        renumber(); recalcAll(); updateLockState();
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ล็อคหน้าจอแล้ว' : 'ปลดล็อคหน้าจอแล้ว', isLocked ? 'success' : 'warning');
    });

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', copyJson);
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', copyText);
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', copyJson);
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const textarea = document.querySelector(SELECTORS.importJsonArea);
        try {
            const payload = JSON.parse(textarea.value);
            loadPayload(payload);
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
        } catch (e) {
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
            console.error(e);
        }
    });
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
        e.preventDefault();
        const dropdown = document.querySelector(SELECTORS.menuDropdown);
        dropdown.classList.toggle('show');
    });
    
    roomsEl.addEventListener('input', debounce(recalcAll));

    roomsEl.addEventListener('click', (e) => {
        const target = e.target;
        const action = target.dataset.act || target.parentElement.dataset.act;

        const actions = {
            'add-set': () => addSet(target.closest(SELECTORS.room)),
            'add-deco': () => addDeco(target.closest(SELECTORS.room)),
            'add-wallpaper': () => addWallpaper(target.closest(SELECTORS.room)),
            'del-room': () => delRoom(target),
            'clear-room': () => clearRoom(target),
            'toggle-room-suspend': () => toggleRoomSuspend(target),
            'del-set': () => delSet(target),
            'clear-set': () => clearSet(target),
            'toggle-set-suspend': () => toggleSuspend(target),
            'del-deco': () => delDeco(target),
            'clear-deco': () => clearDeco(target),
            'toggle-deco-suspend': () => toggleSuspend(target),
            'del-wallpaper': () => delWallpaper(target),
            'clear-wallpaper': () => clearWallpaper(target),
            'toggle-wallpaper-suspend': () => toggleSuspend(target),
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
        setTimeout(() => {
            showToast("ส่งข้อมูลสำเร็จ", "success");
        }, 500);
    });

})();