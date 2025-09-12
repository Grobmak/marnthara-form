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
        materialSummaryBtn: '#materialSummaryBtn', materialSummaryModal: '#materialSummaryModal', materialSummaryBody: '#materialSummaryBody', materialSummaryClose: '#materialSummaryClose',
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

    function showMaterialSummaryPopup() {
        const modal = document.querySelector(SELECTORS.materialSummaryModal);
        const body = document.querySelector(SELECTORS.materialSummaryBody);
        const closeBtn = document.querySelector(SELECTORS.materialSummaryClose);
        
        const grandFabric = document.querySelector(SELECTORS.grandFabric).textContent;
        const grandSheerFabric = document.querySelector(SELECTORS.grandSheerFabric).textContent;
        const grandOpaqueTrack = document.querySelector(SELECTORS.grandOpaqueTrack).textContent;
        const grandSheerTrack = document.querySelector(SELECTORS.grandSheerTrack).textContent;
        const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;

        const summaryText = 
`--- สรุปวัสดุ ---
ผ้าทึบที่ใช้: ${grandFabric}
ผ้าโปร่งที่ใช้: ${grandSheerFabric}
รางทึบที่ใช้: ${grandOpaqueTrack}
รางโปร่งที่ใช้: ${grandSheerTrack}
ราคารวมทั้งหมด: ${grandTotal} บาท`;

        body.textContent = summaryText;
        modal.classList.add('visible');

        closeBtn.onclick = () => {
            modal.classList.remove('visible');
            closeBtn.onclick = null;
        };
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
                const basePrice = baseRaw + sPlus + heightPlus(h);
                const opaqueYardage = CALC.fabricYardage(style, w);
                const sheerYardage = (variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง') ? CALC.fabricYardage(style, w) : 0;
                const opaquePrice = (variant === 'ทึบ' || variant === 'ทึบ&โปร่ง') ? opaqueYardage * basePrice : 0;
                const sheerPrice = (variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง') ? sheerYardage * sheerPriceRaw : 0;
                const totalPrice = opaquePrice + sheerPrice;
                const track = w * 1.5;

                set.querySelector('[data-set-price-total]').textContent = fmt(totalPrice, 0, true);
                set.querySelector('[data-set-total]').textContent = fmt(totalPrice, 0, true);
                set.querySelector('[data-opaque-price]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-sheer-price]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-opaque-yardage]').textContent = fmt(opaqueYardage, 2) + " หลา";
                set.querySelector('[data-sheer-yardage]').textContent = fmt(sheerYardage, 2) + " หลา";
                set.querySelector('[data-opaque-track]').textContent = fmt(track, 2) + " ม.";
                set.querySelector('[data-sheer-track]').textContent = fmt(sheerTrack, 2) + " ม.";
                
                roomSum += totalPrice;
                grandOpaqueYards += opaqueYardage;
                grandSheerYards += sheerYardage;
                grandOpaqueTrack += (variant === 'ทึบ' || variant === 'ทึบ&โปร่ง') ? track : 0;
                grandSheerTrack += (variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง') ? track : 0;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach((item) => {
                if (isRoomSuspended || item.dataset.suspended === 'true') {
                    item.querySelector('[data-deco-price-total]').textContent = "0";
                    return;
                }
                const w = clamp01(item.querySelector('[name="deco_width_m"]').value);
                const h = clamp01(item.querySelector('[name="deco_height_m"]').value);
                const p = toNum(item.querySelector('[name="deco_price_sqyd"]').value);
                const price = (w * h * SQM_TO_SQYD) * p;

                item.querySelector('[data-deco-price-total]').textContent = fmt(price, 0, true);
                item.querySelector('[data-deco-total]').textContent = fmt(price, 0, true);
                roomSum += price;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((item) => {
                if (isRoomSuspended || item.dataset.suspended === 'true') {
                    item.querySelector('[data-wallpaper-price-total]').textContent = "0";
                    return;
                }
                const h = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                const p = toNum(item.querySelector('[name="wallpaper_price_roll"]').value);
                const totalWidth = Array.from(item.querySelectorAll('[name="wall_width_m"]')).reduce((acc, el) => acc + clamp01(el.value), 0);
                const totalSqm = totalWidth * h;
                const totalRolls = CALC.wallpaperRolls(totalWidth, h);
                const price = totalRolls * p;

                item.querySelector('[data-wallpaper-price-total]').textContent = fmt(price, 0, true);
                item.querySelector('[data-wallpaper-total]').textContent = fmt(price, 0, true);
                item.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${fmt(totalRolls, 0, true)}</span> ม้วน`;
                roomSum += price;
            });
            
            room.querySelector('[data-room-total]').textContent = fmt(roomSum, 0, true);
            room.querySelector('[data-room-brief]').innerHTML = `
                <span class="num">จุด ${room.querySelectorAll(SELECTORS.set).length}</span> • 
                <span class="num">ชุด ${room.querySelectorAll(SELECTORS.set).length}</span> • 
                ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บาท
            `;
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
        
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(SELECTORS.set).length + document.querySelectorAll(SELECTORS.decoItem).length + document.querySelectorAll(SELECTORS.wallpaperItem).length;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(SELECTORS.set).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(SELECTORS.decoItem).length;

        saveData();
    }
    
    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function loadData() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const payload = JSON.parse(saved);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || "";
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || "";
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || "";
                roomsEl.innerHTML = "";
                roomCount = 0;
                (payload.rooms || []).forEach(r => addRoom(r));
                renumber();
                recalcAll();
                showToast("โหลดข้อมูลเรียบร้อยแล้ว", 'success');
            } catch (e) {
                console.error("Failed to load data from local storage", e);
                showToast("พบข้อผิดพลาดในการโหลดข้อมูล", 'error');
                clearAllData();
            }
        }
    }

    function buildPayload() {
        const customerInfo = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value
        };

        const rooms = Array.from(document.querySelectorAll(SELECTORS.room))
            .filter(r => r.dataset.suspended !== 'true')
            .map(room => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                style: room.querySelector(SELECTORS.roomStyle).value,
                sets: Array.from(room.querySelectorAll(SELECTORS.set))
                    .filter(s => s.dataset.suspended !== 'true')
                    .map(set => ({
                        width_m: clamp01(set.querySelector('[name="width_m"]').value),
                        height_m: clamp01(set.querySelector('[name="height_m"]').value),
                        fabric_variant: set.querySelector('[name="fabric_variant"]').value,
                        open_type: set.querySelector('[name="open_type"]').value,
                        sheer_price_per_m: toNum(set.querySelector('[name="sheer_price_per_m"]').value),
                    })),
                decorations: Array.from(room.querySelectorAll(SELECTORS.decoItem))
                    .filter(d => d.dataset.suspended !== 'true')
                    .map(deco => ({
                        type: deco.querySelector('[name="deco_type"]').value,
                        width_m: clamp01(deco.querySelector('[name="deco_width_m"]').value),
                        height_m: clamp01(deco.querySelector('[name="deco_height_m"]').value),
                        price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                    })),
                wallpapers: Array.from(room.querySelectorAll(SELECTORS.wallpaperItem))
                    .filter(w => w.dataset.suspended !== 'true')
                    .map(wallpaper => ({
                        height_m: clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value),
                        price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value),
                        widths: Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value)),
                    })),
            };
            return roomData;
        });

        const totalSummary = {
            grand_total: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            grand_fabric: toNum(document.querySelector(SELECTORS.grandFabric).textContent),
            grand_sheer_fabric: toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent),
            grand_opaque_track: toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent),
            grand_sheer_track: toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent),
        };
        
        return {
            ...customerInfo,
            rooms: rooms,
            total_summary: totalSummary,
            app_version: APP_VERSION
        };
    }

    function buildCopyText() {
        const payload = buildPayload();
        let text = "";
        
        if (payload.customer_name || payload.customer_phone || payload.customer_address) {
            text += `ลูกค้า: ${payload.customer_name || "-"}\n`;
            text += `เบอร์โทร: ${payload.customer_phone || "-"}\n`;
            text += `รายละเอียด: ${payload.customer_address || "-"}\n`;
            text += "\n";
        }
        
        payload.rooms.forEach(room => {
            text += `--- ห้อง: ${room.room_name || "ไม่มีชื่อ"} ---\n`;
            text += `ราคาผ้า: ${fmt(room.price_per_m_raw, 0, true)} บ. / ม. | สไตล์: ${room.style}\n\n`;
            
            room.sets.forEach((set, sIdx) => {
                const total = fmt(toNum(document.querySelector(`[data-room][data-index='${room.index}'] [data-set]:nth-of-type(${sIdx + 1}) [data-set-total]`).textContent), 0, true);
                const width = fmt(set.width_m, 2);
                const height = fmt(set.height_m, 2);
                const opaqueYd = fmt(CALC.fabricYardage(set.style, set.width_m), 2);
                const sheerYd = fmt(set.sheer_price_per_m > 0 ? CALC.fabricYardage(set.style, set.width_m) : 0, 2);
                
                text += `  - จุดติดตั้งที่ ${sIdx + 1} (${set.fabric_variant} / เปิด${set.open_type})\n`;
                text += `    ขนาด: ${width} ม. x ${height} ม.\n`;
                text += `    ใช้ผ้าทึบ: ${opaqueYd} หลา | ใช้ผ้าโปร่ง: ${sheerYd} หลา\n`;
                text += `    ราคารวม: ${total} บ.\n\n`;
            });
            
            room.decorations.forEach((deco, dIdx) => {
                const total = fmt(toNum(document.querySelector(`[data-room][data-index='${room.index}'] [data-deco-item]:nth-of-type(${dIdx + 1}) [data-deco-total]`).textContent), 0, true);
                const w = fmt(deco.width_m, 2);
                const h = fmt(deco.height_m, 2);
                text += `  - รายการตกแต่งที่ ${dIdx + 1}: ${deco.type}\n`;
                text += `    ขนาด: ${w} ม. x ${h} ม.\n`;
                text += `    ราคารวม: ${total} บ.\n\n`;
            });

            room.wallpapers.forEach((wallpaper, wIdx) => {
                const total = fmt(toNum(document.querySelector(`[data-room][data-index='${room.index}'] [data-wallpaper-item]:nth-of-type(${wIdx + 1}) [data-wallpaper-price-total]`).textContent), 0, true);
                const h = fmt(wallpaper.height_m, 2);
                const rolls = fmt(CALC.wallpaperRolls(wallpaper.widths.reduce((acc, w) => acc + w, 0), wallpaper.height_m), 0, true);
                
                text += `  - วอลเปเปอร์ที่ ${wIdx + 1}\n`;
                text += `    ความสูงห้อง: ${h} ม.\n`;
                text += `    ความกว้างผนัง: ${wallpaper.widths.map(w => `${fmt(w, 2)} ม.`).join(', ')}\n`;
                text += `    จำนวนม้วน: ${rolls} ม้วน\n`;
                text += `    ราคารวม: ${total} บ.\n\n`;
            });
        });
        
        text += `--- สรุปยอดรวม ---\n`;
        text += `ราคารวมทั้งหมด: ${fmt(payload.total_summary.grand_total, 0, true)} บ.\n`;
        text += `ผ้าทึบที่ใช้: ${fmt(payload.total_summary.grand_fabric, 2)} หลา\n`;
        text += `ผ้าโปร่งที่ใช้: ${fmt(payload.total_summary.grand_sheer_fabric, 2)} หลา\n`;
        text += `รางทึบที่ใช้: ${fmt(payload.total_summary.grand_opaque_track, 2)} ม.\n`;
        text += `รางโปร่งที่ใช้: ${fmt(payload.total_summary.grand_sheer_track, 2)} ม.\n`;
        
        return text;
    }

    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const lockIcon = lockBtn.querySelector('.lock-icon');
        const lockText = lockBtn.querySelector('.lock-text');
        
        isLocked = orderForm.classList.contains('locked');
        lockBtn.classList.toggle('btn-danger', isLocked);
        lockBtn.classList.toggle('btn-primary', !isLocked);
        lockIcon.textContent = isLocked ? 'lock' : 'lock_open';
        lockText.textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        orderForm.querySelectorAll('.actions .btn, .room-menu-btn, .set-menu-btn, .deco-menu-btn, .wallpaper-menu-btn, input, select')
            .forEach(el => {
                if (el.id === 'lockBtn' || el.id === 'submitBtn') return;
                el.disabled = isLocked;
            });
    }

    function toggleLock() {
        orderForm.classList.toggle('locked');
        updateLockState();
        showToast(`หน้าเว็บถูก${isLocked ? 'ล็อค' : 'ปลดล็อค'}แล้ว`, 'warning');
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadData();
        
        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
            const options = await showCopyOptionsModal();
            if (options) {
                const payload = buildPayload();
                let text = "";
                
                if (options.customer && (payload.customer_name || payload.customer_phone || payload.customer_address)) {
                    text += `ลูกค้า: ${payload.customer_name || "-"}\n`;
                    text += `เบอร์โทร: ${payload.customer_phone || "-"}\n`;
                    text += `รายละเอียด: ${payload.customer_address || "-"}\n`;
                    text += "\n";
                }
                
                if (options.details) {
                    payload.rooms.forEach(room => {
                        const roomEl = document.querySelector(`[data-room][data-index='${room.room_index}']`);
                        text += `--- ห้อง: ${room.room_name || "ไม่มีชื่อ"} ---\n`;
                        text += `ราคาผ้า: ${fmt(room.price_per_m_raw, 0, true)} บ. / ม. | สไตล์: ${room.style}\n\n`;
                        
                        room.sets.forEach((set, sIdx) => {
                            const setEl = roomEl.querySelector(`[data-set]:nth-of-type(${sIdx + 1})`);
                            const total = fmt(toNum(setEl.querySelector('[data-set-total]').textContent), 0, true);
                            const width = fmt(set.width_m, 2);
                            const height = fmt(set.height_m, 2);
                            const opaqueYd = fmt(toNum(setEl.querySelector('[data-opaque-yardage]').textContent), 2);
                            const sheerYd = fmt(toNum(setEl.querySelector('[data-sheer-yardage]').textContent), 2);
                            
                            text += `  - จุดติดตั้งที่ ${sIdx + 1} (${set.fabric_variant} / เปิด${set.open_type})\n`;
                            text += `    ขนาด: ${width} ม. x ${height} ม.\n`;
                            text += `    ใช้ผ้าทึบ: ${opaqueYd} หลา | ใช้ผ้าโปร่ง: ${sheerYd} หลา\n`;
                            text += `    ราคารวม: ${total} บ.\n\n`;
                        });
                        
                        room.decorations.forEach((deco, dIdx) => {
                            const decoEl = roomEl.querySelector(`[data-deco-item]:nth-of-type(${dIdx + 1})`);
                            const total = fmt(toNum(decoEl.querySelector('[data-deco-total]').textContent), 0, true);
                            const w = fmt(deco.width_m, 2);
                            const h = fmt(deco.height_m, 2);
                            text += `  - รายการตกแต่งที่ ${dIdx + 1}: ${deco.type}\n`;
                            text += `    ขนาด: ${w} ม. x ${h} ม.\n`;
                            text += `    ราคารวม: ${total} บ.\n\n`;
                        });
        
                        room.wallpapers.forEach((wallpaper, wIdx) => {
                            const wallpaperEl = roomEl.querySelector(`[data-wallpaper-item]:nth-of-type(${wIdx + 1})`);
                            const total = fmt(toNum(wallpaperEl.querySelector('[data-wallpaper-price-total]').textContent), 0, true);
                            const h = fmt(wallpaper.height_m, 2);
                            const rolls = fmt(toNum(wallpaperEl.querySelector('[data-wallpaper-summary]').textContent.split('•')[2].split(' ')[1]), 0, true);
                            
                            text += `  - วอลเปเปอร์ที่ ${wIdx + 1}\n`;
                            text += `    ความสูงห้อง: ${h} ม.\n`;
                            text += `    ความกว้างผนัง: ${wallpaper.widths.map(w => `${fmt(w, 2)} ม.`).join(', ')}\n`;
                            text += `    จำนวนม้วน: ${rolls} ม้วน\n`;
                            text += `    ราคารวม: ${total} บ.\n\n`;
                        });
                    });
                }
                
                if (options.summary) {
                    text += `--- สรุปยอดรวม ---\n`;
                    text += `ราคารวมทั้งหมด: ${fmt(payload.total_summary.grand_total, 0, true)} บ.\n`;
                    text += `ผ้าทึบที่ใช้: ${fmt(payload.total_summary.grand_fabric, 2)} หลา\n`;
                    text += `ผ้าโปร่งที่ใช้: ${fmt(payload.total_summary.grand_sheer_fabric, 2)} หลา\n`;
                    text += `รางทึบที่ใช้: ${fmt(payload.total_summary.grand_opaque_track, 2)} ม.\n`;
                    text += `รางโปร่งที่ใช้: ${fmt(payload.total_summary.grand_sheer_track, 2)} ม.\n`;
                }
        
                try {
                    await navigator.clipboard.writeText(text);
                    showToast('คัดลอกข้อความแล้ว', 'success');
                } catch (err) {
                    showToast('ไม่สามารถคัดลอกได้', 'error');
                }
            }
        });

        document.querySelector(SELECTORS.materialSummaryBtn).addEventListener('click', showMaterialSummaryPopup);

        document.querySelector(SELECTORS.lockBtn).addEventListener('click', toggleLock);
        document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
            const payload = buildPayload();
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                .then(() => showToast('คัดลอก JSON แล้ว', 'success'))
                .catch(() => showToast('ไม่สามารถคัดลอก JSON ได้', 'error'));
        });
        document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
            const modal = document.querySelector(SELECTORS.importModal);
            modal.classList.add('visible');
        });
        document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
        });
        document.querySelector(SELECTORS.importConfirm).addEventListener('click', async () => {
            try {
                const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
                const payload = JSON.parse(jsonText);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || "";
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || "";
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || "";
                roomsEl.innerHTML = "";
                roomCount = 0;
                (payload.rooms || []).forEach(r => addRoom(r));
                renumber();
                recalcAll();
                saveData();
                showToast("นำเข้าข้อมูลเรียบร้อยแล้ว", 'success');
                document.querySelector(SELECTORS.importModal).classList.remove('visible');
            } catch (e) {
                console.error("Failed to import data", e);
                showToast("ข้อมูล JSON ไม่ถูกต้อง", 'error');
            }
        });
        document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
            const payload = buildPayload();
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `marnthara_data_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('ส่งออกไฟล์เรียบร้อยแล้ว', 'success');
        });

        roomsEl.addEventListener('input', debounce(recalcAll));

        roomsEl.addEventListener('click', (e) => {
            const target = e.target;
            const action = target.dataset.act;
            const actions = {
                'add-set': () => addSet(target.closest(SELECTORS.room)),
                'add-deco': () => addDeco(target.closest(SELECTORS.room)),
                'add-wallpaper': () => addWallpaper(target.closest(SELECTORS.room)),
                'toggle-set-suspend': () => toggleSuspend(target),
                'clear-set': () => clearSet(target),
                'del-set': () => delSet(target),
                'toggle-deco-suspend': () => toggleSuspend(target),
                'clear-deco': () => clearDeco(target),
                'del-deco': () => delDeco(target),
                'toggle-wallpaper-suspend': () => toggleSuspend(target),
                'clear-wallpaper': () => clearWallpaper(target),
                'del-wallpaper': () => delWallpaper(target),
                'del-wall': () => delWall(target),
                'toggle-room-suspend': () => toggleRoomSuspend(target),
                'clear-room': () => clearRoom(target),
                'del-room': () => delRoom(target),
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

        recalcAll();
        updateLockState();
    });
})();