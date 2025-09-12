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
        materialSummary: '#materialSummary', summaryBtn: '#summaryBtn',
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
    function renumber() { document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => { const input = room.querySelector(SELECTORS.roomNameInput); if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`; let itemCounter = { set: 0, deco: 0, wallpaper: 0 }; room.querySelectorAll(SELECTORS.set).forEach(item => { itemCounter.set++; item.querySelector("[data-item-title]").textContent = itemCounter.set; }); room.querySelectorAll(SELECTORS.decoItem).forEach(item => { itemCounter.deco++; item.querySelector("[data-item-title]").textContent = itemCounter.deco; }); room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => { itemCounter.wallpaper++; item.querySelector("[data-item-title]").textContent = itemCounter.wallpaper; }); }); }
    
    function recalcAll() {
        let grandTotal = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        let setCount = 0;
        let setCountSets = 0;
        let setCountDeco = 0;
    
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const isSuspended = room.dataset.suspended === 'true';
            if (isSuspended) {
                room.dataset.roomTotal = 0;
                room.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด 0</span> • <span class="num">ชุด 0</span> • ราคา <span class="num price">0</span> บ.`;
                return;
            }
            
            let roomTotal = 0;
            let roomSetCount = 0;
            let roomDecoCount = 0;
            let roomOpaqueYd = 0;
            let roomSheerYd = 0;
            let roomOpaqueTrack = 0;
            let roomSheerTrack = 0;
    
            const roomPricePerM = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const roomStyle = room.querySelector(SELECTORS.roomStyle)?.value || "";
    
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const isSuspended = set.dataset.suspended === 'true';
                if (isSuspended) {
                    set.querySelector('[data-set-summary]').innerHTML = `ราคา: <span class="price">0</span> บ.`;
                    return;
                }
    
                const width = clamp01(set.querySelector('input[name="width_m"]').value);
                const height = clamp01(set.querySelector('input[name="height_m"]').value);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                const sheerPrice = toNum(set.querySelector('select[name="sheer_price_per_m"]').value);
    
                const extraHeightCost = height * heightPlus(height);
                const styleSurcharge = stylePlus(roomStyle);
    
                let setPrice = 0;
                let opaqueYd = 0;
                let sheerYd = 0;
                let opaqueTrack = 0;
                let sheerTrack = 0;
    
                if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                    opaqueYd = CALC.fabricYardage(roomStyle, width);
                    opaqueTrack = width;
                    const fabricCost = (opaqueYd * 0.9 / width) * width * roomPricePerM;
                    setPrice += (fabricCost + opaqueTrack * 500) + extraHeightCost + styleSurcharge;
                }
    
                if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                    sheerYd = CALC.fabricYardage(roomStyle, width);
                    sheerTrack = width;
                    const sheerCost = (sheerYd * 0.9 / width) * width * sheerPrice;
                    setPrice += (sheerCost + sheerTrack * 500) + extraHeightCost + styleSurcharge;
                }
    
                roomTotal += setPrice;
                roomOpaqueYd += opaqueYd;
                roomSheerYd += sheerYd;
                roomOpaqueTrack += opaqueTrack;
                roomSheerTrack += sheerTrack;
                roomSetCount++;
                setCountSets++;
    
                set.querySelector('[data-set-summary]').innerHTML = `ราคา: <span class="price">${fmt(setPrice, 0, true)}</span> บ.`;
                set.querySelector('[data-opaque-yardage]').textContent = `${fmt(opaqueYd, 2)} หลา`;
                set.querySelector('[data-sheer-yardage]').textContent = `${fmt(sheerYd, 2)} หลา`;
                set.querySelector('[data-opaque-track]').textContent = `${fmt(opaqueTrack, 2)} ม.`;
                set.querySelector('[data-sheer-track]').textContent = `${fmt(sheerTrack, 2)} ม.`;
            });
    
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isSuspended = deco.dataset.suspended === 'true';
                if (isSuspended) {
                    deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <span class="price">0</span> บ.`;
                    return;
                }
                const width = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const height = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const priceSqYd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                const totalSqYd = (width * height) * SQM_TO_SQYD;
                const decoPrice = totalSqYd * priceSqYd;
                roomTotal += decoPrice;
                roomDecoCount++;
                setCountDeco++;
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <span class="price">${fmt(decoPrice, 0, true)}</span> บ.`;
                deco.querySelector('[data-deco-sqm]').textContent = `${fmt(width * height, 2)} ตร.ม.`;
                deco.querySelector('[data-deco-sqyd]').textContent = `${fmt(totalSqYd, 2)} ตร.หลา`;
            });
    
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const isSuspended = wallpaper.dataset.suspended === 'true';
                if (isSuspended) {
                    wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`;
                    return;
                }
                const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                let totalWidth = 0;
                wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(wallInput => {
                    totalWidth += clamp01(wallInput.value);
                });
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, height);
                const totalAreaSqM = totalWidth * height;
                const wallpaperPrice = rollsNeeded * pricePerRoll;
                roomTotal += wallpaperPrice;
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalAreaSqM, 2)}</span> ตร.ม. • ใช้ <span class="price">${fmt(rollsNeeded, 0)}</span> ม้วน`;
            });
    
            room.dataset.roomTotal = roomTotal;
            grandTotal += roomTotal;
            grandFabric += roomOpaqueYd;
            grandSheerFabric += roomSheerYd;
            grandOpaqueTrack += roomOpaqueTrack;
            grandSheerTrack += roomSheerTrack;
            setCountSets += roomSetCount;
            setCountDeco += roomDecoCount;
            setCount += roomSetCount + roomDecoCount;
    
            room.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด ${roomSetCount + roomDecoCount}</span> • <span class="num">ชุด ${roomSetCount}</span> • ราคา <span class="num price">${fmt(roomTotal, 0, true)}</span> บ.`;
        });
    
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = setCount;
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandFabric, 2);
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerFabric, 2);
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2);
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2);
    
        saveData();
    }
    
    function buildPayload() {
        const payload = { version: APP_VERSION, date: new Date().toISOString(), grand_total: toNum(document.querySelector(SELECTORS.grandTotal).textContent), customer: {}, rooms: [] };
        
        const customerInfo = document.querySelector(SELECTORS.customerInfo);
        customerInfo.querySelectorAll('input').forEach(input => { payload.customer[input.name] = input.value; });
        
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomData = { 
                room_name: room.querySelector(SELECTORS.roomNameInput)?.value, 
                price_per_m: toNum(room.querySelector(SELECTORS.roomPricePerM)?.value),
                price_per_m_raw: room.querySelector(SELECTORS.roomPricePerM)?.value,
                style: room.querySelector(SELECTORS.roomStyle)?.value,
                total: toNum(room.dataset.roomTotal),
                is_suspended: room.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: [],
            };
            
            if (roomData.is_suspended) {
                payload.rooms.push(roomData);
                return;
            }

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                if (set.dataset.suspended === 'true') return;
                roomData.sets.push({
                    width_m: toNum(set.querySelector('input[name="width_m"]').value),
                    height_m: toNum(set.querySelector('input[name="height_m"]').value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                    open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]').value),
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                if (deco.dataset.suspended === 'true') return;
                roomData.decorations.push({
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                if (wallpaper.dataset.suspended === 'true') return;
                const widths = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(w => toNum(w.value));
                roomData.wallpapers.push({
                    height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths,
                });
            });
            
            payload.rooms.push(roomData);
        });
        
        return payload;
    }
    
    function buildMaterialSummary() {
        const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;
        const grandFabric = document.querySelector(SELECTORS.grandFabric).textContent;
        const grandSheerFabric = document.querySelector(SELECTORS.grandSheerFabric).textContent;
        const grandOpaqueTrack = document.querySelector(SELECTORS.grandOpaqueTrack).textContent;
        const grandSheerTrack = document.querySelector(SELECTORS.grandSheerTrack).textContent;
        
        let summaryText = "";
        
        // Grand totals
        summaryText += `**สรุปยอดรวม**\\n`;
        summaryText += `ราคารวม: ${grandTotal} บ. \\n`;
        summaryText += `\\n`;
        
        // Fabric and tracks summary
        summaryText += `**สรุปวัสดุผ้าม่าน**\\n`;
        summaryText += `- ผ้าทึบ: ${grandFabric} หลา\\n`;
        summaryText += `- รางทึบ: ${grandOpaqueTrack} ม.\\n`;
        summaryText += `- ผ้าโปร่ง: ${grandSheerFabric} หลา\\n`;
        summaryText += `- รางโปร่ง: ${grandSheerTrack} ม.\\n`;
        summaryText += `\\n`;

        // Detailed material summary by room (if any)
        const rooms = document.querySelectorAll(SELECTORS.room);
        let hasWallpaper = false;
        let hasDeco = false;
        
        rooms.forEach((room, rIdx) => {
            const isSuspended = room.dataset.suspended === 'true';
            if (isSuspended) return;

            const roomName = room.querySelector(SELECTORS.roomNameInput)?.value || `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const sets = room.querySelectorAll(SELECTORS.set);
            const decos = room.querySelectorAll(SELECTORS.decoItem);
            const wallpapers = room.querySelectorAll(SELECTORS.wallpaperItem);
            
            if (sets.length > 0) {
                sets.forEach((set, sIdx) => {
                    if (set.dataset.suspended === 'true') return;
                    const width = fmt(clamp01(set.querySelector('input[name="width_m"]').value), 2);
                    const height = fmt(clamp01(set.querySelector('input[name="height_m"]').value), 2);
                    const variant = set.querySelector('select[name="fabric_variant"]').value;
                    const sheerPrice = fmt(toNum(set.querySelector('select[name="sheer_price_per_m"]').value), 0, true);
                    const opaqueYd = fmt(CALC.fabricYardage(room.querySelector(SELECTORS.roomStyle).value, toNum(set.querySelector('input[name="width_m"]').value)), 2);
                    const sheerYd = fmt(CALC.fabricYardage(room.querySelector(SELECTORS.roomStyle).value, toNum(set.querySelector('input[name="width_m"]').value)), 2);

                    summaryText += `**${roomName} (จุดที่ ${sIdx + 1})**\\n`;
                    summaryText += `- กว้าง ${width} ม. x สูง ${height} ม.\\n`;
                    summaryText += `- รูปแบบ: ${room.querySelector(SELECTORS.roomStyle).value} (${room.querySelector(SELECTORS.roomPricePerM).value} บ./ม.)\\n`;
                    if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                        summaryText += `- ผ้าทึบ: ใช้ ${opaqueYd} หลา\\n`;
                    }
                    if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                        summaryText += `- ผ้าโปร่ง: ใช้ ${sheerYd} หลา (ราคา ${sheerPrice} บ./ม.)\\n`;
                    }
                    summaryText += `\\n`;
                });
            }

            if (decos.length > 0) hasDeco = true;
            decos.forEach((deco, dIdx) => {
                if (deco.dataset.suspended === 'true') return;
                const width = fmt(clamp01(deco.querySelector('[name="deco_width_m"]').value), 2);
                const height = fmt(clamp01(deco.querySelector('[name="deco_height_m"]').value), 2);
                const price = fmt(toNum(deco.querySelector('[name="deco_price_sqyd"]').value), 0, true);
                const type = deco.querySelector('[name="deco_type"]').value || "ตกแต่ง";

                summaryText += `**${roomName} (ตกแต่งที่ ${dIdx + 1})**\\n`;
                summaryText += `- ประเภท: ${type}\\n`;
                summaryText += `- กว้าง ${width} ม. x สูง ${height} ม.\\n`;
                summaryText += `- ราคา: ${price} บ./ตร.หลา\\n`;
                summaryText += `\\n`;
            });
            
            if (wallpapers.length > 0) hasWallpaper = true;
            wallpapers.forEach((wallpaper, wIdx) => {
                if (wallpaper.dataset.suspended === 'true') return;
                const height = fmt(clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value), 2);
                const price = fmt(toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value), 0, true);
                let totalWidth = 0;
                wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(wallInput => {
                    totalWidth += clamp01(wallInput.value);
                });
                const rollsNeeded = fmt(CALC.wallpaperRolls(totalWidth, height), 0);
                const areaSqM = fmt(totalWidth * height, 2);
                const areaSqYd = fmt((totalWidth * height) * SQM_TO_SQYD, 2);

                summaryText += `**${roomName} (วอลเปเปอร์ที่ ${wIdx + 1})**\\n`;
                summaryText += `- ความสูง: ${height} ม.\\n`;
                summaryText += `- ความกว้างรวม: ${fmt(totalWidth, 2)} ม.\\n`;
                summaryText += `- พื้นที่รวม: ${areaSqM} ตร.ม. (${areaSqYd} ตร.หลา)\\n`;
                summaryText += `- ราคาต่อม้วน: ${price} บ.\\n`;
                summaryText += `- จำนวนที่ใช้: ${rollsNeeded} ม้วน\\n`;
                summaryText += `\\n`;
            });
        });
        
        return summaryText;
    }
    
    function copySummaryText() {
        const textToCopy = buildMaterialSummary().replace(/\\n/g, '\n');
        navigator.clipboard.writeText(textToCopy)
            .then(() => showToast('คัดลอกข้อความสรุปแล้ว', 'success'))
            .catch(err => showToast('ไม่สามารถคัดลอกได้', 'error'));
    }

    function lockUI() {
        isLocked = !isLocked;
        document.querySelectorAll('input, select, .btn:not(#lockBtn, #menuBtn, #clearAllBtn)').forEach(el => {
            el.disabled = isLocked;
            el.classList.toggle('disabled', isLocked);
        });
        document.querySelector(SELECTORS.lockBtn).classList.toggle('btn-primary', !isLocked);
        document.querySelector(SELECTORS.lockBtn).classList.toggle('btn-danger', isLocked);
        document.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        document.querySelector('.lock-icon').textContent = isLocked ? 'lock' : 'lock_open';
        showToast(isLocked ? 'ข้อมูลถูกล็อคแล้ว' : 'ข้อมูลถูกปลดล็อคแล้ว', 'info');
    }

    function saveData() {
        const data = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        updateLockState();
    }
    function loadData() {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                document.querySelector('[name="customer_name"]').value = data.customer.customer_name || '';
                document.querySelector('[name="customer_phone"]').value = data.customer.customer_phone || '';
                document.querySelector('[name="customer_address"]').value = data.customer.customer_address || '';
                roomsEl.innerHTML = "";
                if (data.rooms.length > 0) {
                    data.rooms.forEach(room => addRoom(room));
                } else {
                    addRoom();
                }
                recalcAll();
                showToast('โหลดข้อมูลที่บันทึกไว้แล้ว', 'success');
            } catch (e) {
                console.error("Failed to parse saved data", e);
                showToast('ข้อมูลที่บันทึกไว้เสียหาย', 'error');
                clearAllData();
            }
        } else {
            addRoom();
        }
    }
    
    function updateLockState() {
        document.querySelector(SELECTORS.lockBtn).style.display = document.querySelectorAll(SELECTORS.room).length > 0 ? 'inline-flex' : 'none';
        document.querySelector(SELECTORS.clearAllBtn).style.display = document.querySelectorAll(SELECTORS.room).length > 0 ? 'inline-flex' : 'none';
    }

    function exportJson() {
        const payload = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `marnthara_data_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(dlAnchorElem);
        dlAnchorElem.click();
        dlAnchorElem.remove();
        showToast('ข้อมูลถูกดาวน์โหลดแล้ว', 'success');
    }

    function importJson() {
        const modal = document.querySelector(SELECTORS.importModal);
        modal.classList.add('visible');
        document.querySelector(SELECTORS.importConfirm).onclick = () => {
            try {
                const json = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
                roomsEl.innerHTML = "";
                if (json.rooms.length > 0) {
                    json.rooms.forEach(room => addRoom(room));
                }
                document.querySelector('[name="customer_name"]').value = json.customer.customer_name || '';
                document.querySelector('[name="customer_phone"]').value = json.customer.customer_phone || '';
                document.querySelector('[name="customer_address"]').value = json.customer.customer_address || '';
                recalcAll();
                modal.classList.remove('visible');
                showToast('นำเข้าข้อมูลสำเร็จ', 'success');
            } catch (e) {
                showToast('ข้อมูลไม่ถูกต้อง', 'error');
                console.error(e);
            }
        };
        document.querySelector(SELECTORS.importCancel).onclick = () => modal.classList.remove('visible');
    }

    // Event Listeners
    document.addEventListener('DOMContentLoaded', loadData);
    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', lockUI);
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });
    document.querySelector(SELECTORS.importBtn).addEventListener('click', importJson);
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', exportJson);
    
    // Summary buttons event listeners
    document.querySelector(SELECTORS.summaryBtn).addEventListener('click', () => {
        const summaryText = buildMaterialSummary();
        document.querySelector(SELECTORS.materialSummary).innerHTML = summaryText.replace(/\\n/g, '<br>');
    });
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
            .then(() => showToast('คัดลอก JSON แล้ว', 'success'))
            .catch(err => showToast('ไม่สามารถคัดลอกได้', 'error'));
    });
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', copySummaryText);
    
    roomsEl.addEventListener('input', debounce(recalcAll));
    roomsEl.addEventListener('click', (e) => {
        const target = e.target;
        const action = target.closest('[data-act]')?.dataset.act;
        if (!action) return;

        const actions = {
            'add-set': () => addSet(target.closest(SELECTORS.room)),
            'add-deco': () => addDeco(target.closest(SELECTORS.room)),
            'add-wallpaper': () => addWallpaper(target.closest(SELECTORS.room)),
            'add-wall': () => addWall(target),
            'del-room': () => delRoom(target),
            'del-set': () => delSet(target),
            'del-deco': () => delDeco(target),
            'del-wallpaper': () => delWallpaper(target),
            'del-wall': () => delWall(target),
            'clear-room': () => clearRoom(target),
            'clear-set': () => clearSet(target),
            'clear-deco': () => clearDeco(target),
            'clear-wallpaper': () => clearWallpaper(target),
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

    // Initial check for lock state
    updateLockState();
})();