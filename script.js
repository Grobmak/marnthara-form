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
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
            }
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

    function toggleRoomSuspend(btn) {
        const room = btn.closest(SELECTORS.room);
        const isSuspended = !(room.dataset.suspended === 'true');
        room.dataset.suspended = isSuspended;
        room.classList.toggle('is-suspended', isSuspended);
        room.querySelector('[data-suspend-text]').textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function clearRoom(btn) {
        if (isLocked || !await showConfirmation('ล้างห้อง', 'ยืนยันการล้างข้อมูลในห้องนี้ทั้งหมด?')) return;
        const room = btn.closest(SELECTORS.room);
        room.querySelectorAll('input, select').forEach(el => {
            if (el.name === 'room_style' || el.name === 'fabric_variant' || el.name === 'open_type') {
                el.value = el.options[0].value;
            } else {
                el.value = '';
            }
        });
        room.querySelectorAll(SELECTORS.wallsContainer).forEach(el => el.innerHTML = '');
        room.querySelectorAll(SELECTORS.set).forEach(el => el.remove());
        room.querySelectorAll(SELECTORS.decoItem).forEach(el => el.remove());
        room.querySelectorAll(SELECTORS.wallpaperItem).forEach(el => el.remove());
        addSet(room);
        recalcAll();
        saveData();
        showToast('ล้างข้อมูลห้องแล้ว', 'success');
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
        toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState();
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
        if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return;
        roomsEl.innerHTML = "";
        roomCount = 0;
        document.querySelectorAll('#customerInfo input').forEach(i => i.value = "");
        addRoom();
        saveData();
        updateLockState();
        showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
    }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;

            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            const totalItems = items.length;
            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) {
                    const type = item.classList.contains('set') ? 'จุด' : item.classList.contains('deco-item') ? 'ตกแต่งเพิ่ม' : 'วอลเปเปอร์';
                    lbl.textContent = `${type} ${iIdx + 1}`;
                }
            });
        });
    }

    function recalcAll() {
        let grandTotal = 0, setCount = 0, grandFabric = 0, grandSheerFabric = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        let setCountSets = 0, setCountDeco = 0;

        document.querySelectorAll(SELECTORS.room).forEach(room => {
            if (room.dataset.suspended === 'true') {
                const brief = room.querySelector('[data-room-brief]');
                brief.innerHTML = `<span class="num">0</span> จุด • <span class="num">0</span> ชุด • ราคา <span class="num price">0</span> บ. (ถูกระงับ)`;
                return;
            }

            let roomTotal = 0;
            let roomOpaqueYardage = 0, roomSheerYardage = 0, roomOpaqueTrack = 0, roomSheerTrack = 0;
            let roomDecoTotal = 0, roomWallpaperTotal = 0;
            let roomSetCount = 0, roomDecoCount = 0;

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const width = clamp01(set.querySelector('[name="width_m"]').value);
                const height = clamp01(set.querySelector('[name="height_m"]').value);
                const fabricPrice = toNum(set.querySelector('[name="room_price_per_m"]').value);
                const sheerPrice = toNum(set.querySelector('[name="sheer_price_per_m"]').value);
                const style = set.querySelector('[name="room_style"]').value;
                const variant = set.querySelector('[name="fabric_variant"]').value;
                const installPrice = toNum(set.querySelector('[name="install_price"]').value);
                const otherPrice = toNum(set.querySelector('[name="other_price"]').value);

                if (set.dataset.suspended === 'true' || width === 0 || height === 0) {
                    set.querySelector('[data-opaque-price]').textContent = fmt(0, 0, true);
                    set.querySelector('[data-sheer-price]').textContent = fmt(0, 0, true);
                    set.querySelector('[data-total-price]').textContent = fmt(0, 0, true);
                    set.querySelector('[data-opaque-yardage]').textContent = '0.00 หลา';
                    set.querySelector('[data-sheer-yardage]').textContent = '0.00 หลา';
                    set.querySelector('[data-opaque-track]').textContent = '0.00 ม.';
                    set.querySelector('[data-sheer-track]').textContent = '0.00 ม.';
                    return;
                }

                const priceAdj = (height * heightPlus(height)) + stylePlus(style);
                const opaquePrice = (width * fabricPrice) + priceAdj;
                const sheerPriceCalc = (width * sheerPrice) + priceAdj;
                const setPrice = (opaquePrice) + (sheerPriceCalc) + installPrice + otherPrice;
                
                const opaqueYardage = CALC.fabricYardage(style, width);
                const sheerYardage = CALC.fabricYardage(style, width);
                const opaqueTrack = width;
                const sheerTrack = width;
                
                if (variant.includes('ทึบ')) {
                    roomTotal += opaquePrice + installPrice + otherPrice;
                    roomOpaqueYardage += opaqueYardage;
                    roomOpaqueTrack += opaqueTrack;
                }
                if (variant.includes('โปร่ง')) {
                    roomTotal += sheerPriceCalc;
                    roomSheerYardage += sheerYardage;
                    roomSheerTrack += sheerTrack;
                }
                
                set.querySelector('[data-opaque-price]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-sheer-price]').textContent = fmt(sheerPriceCalc, 0, true);
                set.querySelector('[data-total-price]').textContent = fmt(setPrice, 0, true);
                set.querySelector('[data-opaque-yardage]').textContent = fmt(opaqueYardage) + ' หลา';
                set.querySelector('[data-sheer-yardage]').textContent = fmt(sheerYardage) + ' หลา';
                set.querySelector('[data-opaque-track]').textContent = fmt(opaqueTrack) + ' ม.';
                set.querySelector('[data-sheer-track]').textContent = fmt(sheerTrack) + ' ม.';
                roomSetCount++;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const width = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const height = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const priceSqYd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);

                if (deco.dataset.suspended === 'true' || width === 0 || height === 0) {
                    deco.querySelector('[data-deco-price-total]').textContent = fmt(0, 0, true);
                    return;
                }

                const price = (width * height * SQM_TO_SQYD) * priceSqYd;
                deco.querySelector('[data-deco-price-total]').textContent = fmt(price, 0, true);
                roomTotal += price;
                roomDecoTotal += price;
                roomDecoCount++;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                let totalWidth = 0;
                let wallCount = 0;

                wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(wallWidth => {
                    totalWidth += clamp01(wallWidth.value);
                    wallCount++;
                });

                if (wallpaper.dataset.suspended === 'true' || totalWidth === 0 || height === 0 || pricePerRoll === 0) {
                    wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`;
                    return;
                }

                const rolls = CALC.wallpaperRolls(totalWidth, height);
                const price = rolls * pricePerRoll;

                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalWidth * height)}</span> ตร.ม. • ใช้ <span class="price">${fmt(rolls, 0, true)}</span> ม้วน`;
                roomTotal += price;
                roomWallpaperTotal += price;
            });

            room.querySelector('[data-opaque-yardage]').textContent = fmt(roomOpaqueYardage) + " หลา";
            room.querySelector('[data-sheer-yardage]').textContent = fmt(roomSheerYardage) + " หลา";
            room.querySelector('[data-opaque-track]').textContent = fmt(roomOpaqueTrack) + " ม.";
            room.querySelector('[data-sheer-track]').textContent = fmt(roomSheerTrack) + " ม.";
            room.querySelector('[data-deco-total-price]').textContent = fmt(roomDecoTotal, 0, true);
            room.querySelector('[data-wallpaper-total-price]').textContent = fmt(roomWallpaperTotal, 0, true);
            room.querySelector('[data-room-total-price]').textContent = fmt(roomTotal, 0, true);
            room.querySelector('[data-room-brief]').innerHTML = `<span class="num">${roomSetCount}</span> จุด • <span class="num">${roomDecoCount}</span> ชุด • ราคา <span class="num price">${fmt(roomTotal, 0, true)}</span> บ.`;
            
            grandTotal += roomTotal;
            setCount += roomSetCount;
            grandFabric += roomOpaqueYardage;
            grandSheerFabric += roomSheerYardage;
            grandOpaqueTrack += roomOpaqueTrack;
            grandSheerTrack += roomSheerTrack;
            setCountSets += roomSetCount;
            setCountDeco += roomDecoCount;
        });
        
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = setCount;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandFabric) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerFabric) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack) + " ม.";
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
    }

    const buildPayload = () => {
        const payload = {
            app_version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            grand_total: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            grand_opaque_yardage: toNum(document.querySelector(SELECTORS.grandFabric).textContent),
            grand_sheer_yardage: toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent),
            grand_opaque_track: toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent),
            grand_sheer_track: toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent),
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const roomData = {
                room_index: rIdx + 1,
                is_suspended: room.dataset.suspended === 'true',
                room_name: room.querySelector('[name="room_name"]').value || room.querySelector('[name="room_name"]').placeholder,
                room_total_price: toNum(room.querySelector('[data-room-total-price]').textContent),
                sets: [],
                decorations: [],
                wallpapers: []
            };

            room.querySelectorAll(SELECTORS.set).forEach((set, sIdx) => {
                const setVariant = set.querySelector('[name="fabric_variant"]').value;
                const isOpaque = setVariant.includes('ทึบ');
                const isSheer = setVariant.includes('โปร่ง');

                roomData.sets.push({
                    set_index: sIdx + 1,
                    is_suspended: set.dataset.suspended === 'true',
                    width_m: toNum(set.querySelector('[name="width_m"]').value),
                    height_m: toNum(set.querySelector('[name="height_m"]').value),
                    fabric_variant: setVariant,
                    open_type: set.querySelector('[name="open_type"]').value,
                    style: set.querySelector('[name="room_style"]').value,
                    price_per_m_raw: isOpaque ? toNum(set.querySelector('[name="room_price_per_m"]').value) : 0,
                    sheer_price_per_m: isSheer ? toNum(set.querySelector('[name="sheer_price_per_m"]').value) : 0,
                    install_price: toNum(set.querySelector('[name="install_price"]').value),
                    other_price: toNum(set.querySelector('[name="other_price"]').value),
                    opaque_yardage: isOpaque ? toNum(set.querySelector('[data-opaque-yardage]').textContent) : 0,
                    sheer_yardage: isSheer ? toNum(set.querySelector('[data-sheer-yardage]').textContent) : 0,
                    opaque_track: isOpaque ? toNum(set.querySelector('[data-opaque-track]').textContent) : 0,
                    sheer_track: isSheer ? toNum(set.querySelector('[data-sheer-track]').textContent) : 0,
                    total_price: toNum(set.querySelector('[data-total-price]').textContent)
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach((deco, dIdx) => {
                roomData.decorations.push({
                    deco_index: dIdx + 1,
                    is_suspended: deco.dataset.suspended === 'true',
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                    total_price: toNum(deco.querySelector('[data-deco-price-total]').textContent)
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper, wIdx) => {
                const summary = wallpaper.querySelector('[data-wallpaper-summary]');
                roomData.wallpapers.push({
                    wallpaper_index: wIdx + 1,
                    is_suspended: wallpaper.dataset.suspended === 'true',
                    height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: [...wallpaper.querySelectorAll('[name="wall_width_m"]')].map(w => toNum(w.value)),
                    total_sqm: toNum(summary.querySelector('.price:nth-of-type(2)').textContent),
                    rolls_needed: toNum(summary.querySelector('.price:nth-of-type(3)').textContent),
                    total_price: toNum(summary.querySelector('.price:nth-of-type(1)').textContent),
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    };

    const saveData = debounce(() => {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    });

    const updateLockState = () => {
        const hasRooms = document.querySelectorAll(SELECTORS.room).length > 0;
        const formControls = orderForm.querySelectorAll('input:not(#payload), select, button:not(#lockBtn, #menuBtn, #clearAllBtn)');
        const addRoomBtn = document.querySelector(SELECTORS.addRoomHeaderBtn);

        if (isLocked) {
            formControls.forEach(el => el.disabled = true);
            addRoomBtn.disabled = true;
            document.querySelector(SELECTORS.lockBtn).classList.add('btn-danger');
            document.querySelector(SELECTORS.lockBtn).classList.remove('btn-primary');
            document.querySelector('.lock-text').textContent = "ปลดล็อค";
            showToast('ฟอร์มถูกล็อคแล้ว', 'error');
        } else {
            formControls.forEach(el => el.disabled = false);
            addRoomBtn.disabled = false;
            document.querySelector(SELECTORS.lockBtn).classList.add('btn-primary');
            document.querySelector(SELECTORS.lockBtn).classList.remove('btn-danger');
            document.querySelector('.lock-text').textContent = "ล็อค";
            if(hasRooms) showToast('ฟอร์มถูกปลดล็อคแล้ว', 'success');
        }
    };

    document.addEventListener('input', (e) => {
        if (e.target.closest(SELECTORS.set) || e.target.closest(SELECTORS.decoItem) || e.target.closest(SELECTORS.wallpaperItem)) {
            recalcAll();
            saveData();
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.matches('select[name="fabric_variant"]')) {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
            recalcAll(); saveData();
        }
    });

    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.matches('[data-dropdown-toggle]')) {
            const menuId = target.dataset.dropdownToggle;
            const menu = document.querySelector(`[data-dropdown-menu="${menuId}"]`);
            if (menu) {
                document.querySelectorAll('.dropdown-menu').forEach(m => {
                    if (m !== menu) m.classList.remove('show');
                });
                menu.classList.toggle('show');
            }
        } else if (!target.closest('.btn-group')) {
            document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
        }

        if (isLocked) return;
        
        const room = target.closest(SELECTORS.room);
        const set = target.closest(SELECTORS.set);
        const deco = target.closest(SELECTORS.decoItem);
        const wallpaper = target.closest(SELECTORS.wallpaperItem);
        const act = target.dataset.act || target.closest('[data-act]')?.dataset.act;

        switch (act) {
            case 'add-set': addSet(room); break;
            case 'add-deco': addDeco(room); break;
            case 'add-wallpaper': addWallpaper(room); break;
            case 'add-wall': addWall(target); break;
            case 'del-wall': delWall(target); break;
            case 'del-room': delRoom(target); break;
            case 'del-set': delSet(target); break;
            case 'del-deco': delDeco(target); break;
            case 'del-wallpaper': delWallpaper(target); break;
            case 'clear-set': clearSet(target); break;
            case 'clear-deco': clearDeco(target); break;
            case 'clear-wallpaper': clearWallpaper(target); break;
            case 'toggle-suspend': toggleSuspend(target); break;
            case 'toggle-room-suspend': toggleRoomSuspend(target); break;
            case 'clear-room': clearRoom(target); break;
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
            .then(() => showToast('คัดลอก JSON แล้ว', 'success'))
            .catch(err => showToast('ไม่สามารถคัดลอก JSON ได้', 'error'));
    });
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        updateLockState();
        saveData();
    });
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const payload = buildPayload();
            let text = "";
            if (options.customer) {
                text += `ลูกค้า: ${payload.customer_name}\nโทร: ${payload.customer_phone}\nที่อยู่: ${payload.customer_address}\n\n`;
            }
            if (options.details) {
                payload.rooms.forEach(room => {
                    text += `--- ${room.room_name} ${room.is_suspended ? '(ระงับ)' : ''} ---\n`;
                    if (room.sets.length > 0) {
                        text += `ผ้าม่าน (${room.sets.length} จุด):\n`;
                        room.sets.forEach(set => {
                            if (set.is_suspended) return;
                            const opaque = set.fabric_variant.includes('ทึบ') ? `ผ้าทึบ ${set.opaque_yardage} หลา` : '';
                            const sheer = set.fabric_variant.includes('โปร่ง') ? `ผ้าโปร่ง ${set.sheer_yardage} หลา` : '';
                            text += `• จุดที่ ${set.set_index}: กว้าง ${set.width_m}ม. สูง ${set.height_m}ม. (${set.style} - ${set.open_type}) ราคา ${fmt(set.total_price, 0, true)}บ. ${opaque} ${sheer}\n`;
                        });
                    }
                    if (room.decorations.length > 0) {
                        text += `\nตกแต่ง (${room.decorations.length} รายการ):\n`;
                        room.decorations.forEach(deco => {
                            if (deco.is_suspended) return;
                            text += `• ${deco.type}: กว้าง ${deco.width_m}ม. สูง ${deco.height_m}ม. ราคา ${fmt(deco.total_price, 0, true)}บ.\n`;
                        });
                    }
                    if (room.wallpapers.length > 0) {
                        text += `\nวอลเปเปอร์ (${room.wallpapers.length} รายการ):\n`;
                        room.wallpapers.forEach(wallpaper => {
                            if (wallpaper.is_suspended) return;
                            const widths = wallpaper.widths.filter(w => w > 0).map(w => `${w}ม.`);
                            text += `• ความสูง ${wallpaper.height_m}ม. ผนัง: ${widths.join(', ')} ใช้ ${wallpaper.rolls_needed} ม้วน ราคา ${fmt(wallpaper.total_price, 0, true)}บ.\n`;
                        });
                    }
                    text += '\n';
                });
            }
            if (options.summary) {
                text += `รวมราคาทั้งหมด: ${fmt(payload.grand_total, 0, true)} บ.\n`;
                text += `ผ้าทึบรวม: ${fmt(payload.grand_opaque_yardage)} หลา\n`;
                text += `ผ้าโปร่งรวม: ${fmt(payload.grand_sheer_yardage)} หลา\n`;
                text += `รางทึบรวม: ${fmt(payload.grand_opaque_track)} ม.\n`;
                text += `รางโปร่งรวม: ${fmt(payload.grand_sheer_track)} ม.\n`;
            }

            navigator.clipboard.writeText(text)
                .then(() => showToast('คัดลอกข้อความแล้ว', 'success'))
                .catch(err => showToast('ไม่สามารถคัดลอกข้อความได้', 'error'));
        }
    });
    
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        const modal = document.querySelector(SELECTORS.importModal);
        modal.classList.add('visible');
    });

    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        const modal = document.querySelector(SELECTORS.importModal);
        modal.classList.remove('visible');
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const modal = document.querySelector(SELECTORS.importModal);
        const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const payload = JSON.parse(jsonText);
            document.querySelector('input[name="customer_name"]').value = payload.customer_name;
            document.querySelector('input[name="customer_address"]').value = payload.customer_address;
            document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
            roomsEl.innerHTML = ""; roomCount = 0;
            if (payload.rooms && payload.rooms.length > 0) {
                payload.rooms.forEach(addRoom);
            } else {
                addRoom();
            }
            modal.classList.remove('visible');
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
        } catch (err) {
            console.error("Failed to parse imported data:", err);
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
        }
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "marnthara_data.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast('ข้อมูลถูกดาวน์โหลดแล้ว', 'success');
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
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