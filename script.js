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

    async function clearRoom(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในห้องนี้?')) return;
        const room = btn.closest(SELECTORS.room);
        room.querySelector(SELECTORS.roomNameInput).value = "";
        room.querySelector(SELECTORS.roomPricePerM).value = "";
        room.querySelector(SELECTORS.roomStyle).value = "";
        room.querySelector(SELECTORS.setsContainer).innerHTML = "";
        room.querySelector(SELECTORS.decorationsContainer).innerHTML = "";
        room.querySelector(SELECTORS.wallpapersContainer).innerHTML = "";
        addSet(room);
        renumber(); recalcAll(); saveData(); updateLockState();
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

    function toggleSuspendRoom(btn) {
        const room = btn.closest(SELECTORS.room);
        const isSuspended = !(room.dataset.suspended === 'true');
        room.dataset.suspended = isSuspended;
        room.classList.toggle('is-suspended', isSuspended);
        btn.querySelector('[data-suspend-text]').textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }
    async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); }
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); item.querySelectorAll('input').forEach(el => el.value = ''); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); }
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }
    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const sets = Array.from(room.querySelectorAll(SELECTORS.set));
            const decoItems = Array.from(room.querySelectorAll(SELECTORS.decoItem));
            const wallpaperItems = Array.from(room.querySelectorAll(SELECTORS.wallpaperItem));
            const allItems = [...sets, ...decoItems, ...wallpaperItems];
            const activeSets = sets.filter(s => s.dataset.suspended !== 'true');
            const activeDeco = decoItems.filter(d => d.dataset.suspended !== 'true');
            const activeWallpaper = wallpaperItems.filter(w => w.dataset.suspended !== 'true');
            room.querySelector('[data-room-brief] .num:nth-child(1)').textContent = activeSets.length + activeDeco.length + activeWallpaper.length;
            room.querySelector('[data-room-brief] .num:nth-child(2)').textContent = activeSets.length;
        });
        document.querySelectorAll(SELECTORS.set).forEach((set, sIdx) => {
            const lbl = set.querySelector("[data-item-title]");
            if (lbl) lbl.textContent = `${sIdx + 1}`;
        });
        document.querySelectorAll(SELECTORS.decoItem).forEach((deco, dIdx) => {
            const lbl = deco.querySelector("[data-item-title]");
            if (lbl) lbl.textContent = `${dIdx + 1}`;
        });
        document.querySelectorAll(SELECTORS.wallpaperItem).forEach((item, wIdx) => {
            const lbl = item.querySelector("[data-item-title]");
            if (lbl) lbl.textContent = `${wIdx + 1}`;
        });
    }
    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        let setCount = 0, setCountSets = 0, setCountDeco = 0;

        document.querySelectorAll(SELECTORS.room).forEach(room => {
            let roomTotal = 0;
            const roomPricePerM = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const roomStyle = room.querySelector(SELECTORS.roomStyle)?.value;
            const roomIsSuspended = room.dataset.suspended === 'true';

            if (!roomPricePerM || !roomStyle) {
                room.querySelector('[data-room-total-price]').textContent = fmt(0, 0, true);
                return;
            }

            // Sets calculation
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const isSuspended = set.dataset.suspended === 'true' || roomIsSuspended;
                const width = clamp01(set.querySelector('input[name="width_m"]')?.value);
                const height = clamp01(set.querySelector('input[name="height_m"]')?.value);
                const variant = set.querySelector('select[name="fabric_variant"]')?.value;
                const sheerPricePerM = toNum(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                
                const opaqueYards = (variant === "ทึบ" || variant === "ทึบ&โปร่ง") ? CALC.fabricYardage(roomStyle, width) : 0;
                const sheerYards = (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") ? CALC.fabricYardage(roomStyle, width) : 0;
                const opaqueTrack = (variant === "ทึบ" || variant === "ทึบ&โปร่ง") ? width : 0;
                const sheerTrack = (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") ? width : 0;
                const pricePerSet = (opaqueYards * roomPricePerM + sheerYards * sheerPricePerM + opaqueTrack * 250 + sheerTrack * 250) + (stylePlus(roomStyle) * opaqueTrack) + (heightPlus(height) * (opaqueTrack + sheerTrack));
                const total = isSuspended ? 0 : pricePerSet;
                
                set.querySelector('[data-opaque-yardage-label]').textContent = fmt(opaqueYards);
                set.querySelector('[data-sheer-yardage-label]').textContent = fmt(sheerYards);
                set.querySelector('[data-opaque-track-label]').textContent = fmt(opaqueTrack);
                set.querySelector('[data-sheer-track-label]').textContent = fmt(sheerTrack);
                set.querySelector('[data-set-price]').textContent = fmt(pricePerSet, 0, true);
                set.classList.toggle('is-disabled', isSuspended);

                if (!isSuspended) {
                    roomTotal += total; grand += total;
                    grandOpaqueYards += opaqueYards; grandSheerYards += sheerYards;
                    grandOpaqueTrack += opaqueTrack; grandSheerTrack += sheerTrack;
                    setCountSets++; setCount++;
                }
            });

            // Decorations calculation
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isSuspended = deco.dataset.suspended === 'true' || roomIsSuspended;
                const width = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                const height = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const priceSqyd = toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                const sqm = width * height;
                const sqyd = sqm * SQM_TO_SQYD;
                const total = isSuspended ? 0 : sqyd * priceSqyd;
                deco.querySelector('.price:nth-child(1)').textContent = fmt(sqyd * priceSqyd, 0, true);
                deco.querySelector('.price:nth-child(2)').textContent = fmt(sqyd);
                deco.classList.toggle('is-disabled', isSuspended);
                if (!isSuspended) {
                    roomTotal += total; grand += total; setCountDeco++; setCount++;
                }
            });

            // Wallpapers calculation
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                const isSuspended = item.dataset.suspended === 'true' || roomIsSuspended;
                const height = clamp01(item.querySelector('[name="wallpaper_height_m"]')?.value);
                const pricePerRoll = toNum(item.querySelector('[name="wallpaper_price_roll"]')?.value);
                const widths = Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(i => clamp01(i.value));
                const totalWidth = widths.reduce((acc, curr) => acc + curr, 0);
                const totalSqm = totalWidth * height;
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, height);
                const total = isSuspended ? 0 : rollsNeeded * pricePerRoll;
                item.querySelector('.price:nth-child(1)').textContent = fmt(total, 0, true);
                item.querySelector('.price:nth-child(2)').textContent = fmt(totalSqm);
                item.querySelector('.price:nth-child(3)').textContent = fmt(rollsNeeded, 0);
                item.classList.toggle('is-disabled', isSuspended);
                if (!isSuspended) {
                    roomTotal += total; grand += total; setCount++;
                }
            });

            room.querySelector('[data-room-total-price]').textContent = fmt(roomTotal, 0, true);
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = fmt(setCount, 0);
        document.querySelector(SELECTORS.setCountSets).textContent = fmt(setCountSets, 0);
        document.querySelector(SELECTORS.setCountDeco).textContent = fmt(setCountDeco, 0);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack)} ม.`;
        saveData();
    }
    
    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function buildPayload() {
        const rooms = [];
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput)?.value,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM)?.value),
                style: room.querySelector(SELECTORS.roomStyle)?.value,
                is_suspended: room.dataset.suspended === 'true',
                sets: [], decorations: [], wallpapers: []
            };

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                roomData.sets.push({
                    width_m: toNum(set.querySelector('input[name="width_m"]')?.value),
                    height_m: toNum(set.querySelector('input[name="height_m"]')?.value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]')?.value,
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]')?.value),
                    open_type: set.querySelector('select[name="open_type"]')?.value,
                    is_suspended: set.dataset.suspended === 'true'
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                roomData.decorations.push({
                    type: deco.querySelector('[name="deco_type"]')?.value,
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value),
                    is_suspended: deco.dataset.suspended === 'true'
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                const widths = Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(i => toNum(i.value));
                roomData.wallpapers.push({
                    height_m: toNum(item.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(item.querySelector('[name="wallpaper_price_roll"]')?.value),
                    is_suspended: item.dataset.suspended === 'true',
                    widths: widths
                });
            });

            rooms.push(roomData);
        });
        
        const grandTotal = toNum(document.querySelector(SELECTORS.grandTotal).textContent);
        const setCount = toNum(document.querySelector(SELECTORS.setCount).textContent);
        
        return {
            customer_name: document.querySelector('input[name="customer_name"]')?.value,
            customer_phone: document.querySelector('input[name="customer_phone"]')?.value,
            customer_address: document.querySelector('input[name="customer_address"]')?.value,
            grand_total: grandTotal,
            set_count: setCount,
            rooms: rooms
        };
    }
    
    function updateLockState() {
        isLocked = document.querySelectorAll(SELECTORS.room).length > 2;
        document.querySelector(SELECTORS.addRoomHeaderBtn).disabled = isLocked;
        document.querySelector(SELECTORS.lockBtn).classList.toggle('locked', isLocked);
    }
    
    document.addEventListener('input', debounce(recalcAll));
    document.addEventListener('change', recalcAll);

    document.addEventListener('click', async e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;

        e.preventDefault();
        
        switch (act) {
            case 'add-room':
            case 'add-room-header': addRoom(); break;
            case 'del-room': delRoom(e.target); break;
            case 'clear-room': clearRoom(e.target); break;
            case 'toggle-suspend-room': toggleSuspendRoom(e.target); break;
            case 'add-set': addSet(e.target.closest(SELECTORS.room)); break;
            case 'del-set': delSet(e.target); break;
            case 'clear-set': clearSet(e.target); break;
            case 'toggle-suspend': toggleSuspend(e.target); break;
            case 'add-deco': addDeco(e.target.closest(SELECTORS.room)); break;
            case 'del-deco': delDeco(e.target); break;
            case 'clear-deco': clearDeco(e.target); break;
            case 'toggle-suspend-deco': toggleSuspend(e.target); break;
            case 'add-wallpaper': addWallpaper(e.target.closest(SELECTORS.room)); break;
            case 'del-wallpaper': delWallpaper(e.target); break;
            case 'clear-wallpaper': clearWallpaper(e.target); break;
            case 'toggle-suspend-wallpaper': toggleSuspend(e.target); break;
            case 'add-wall': addWall(e.target); break;
            case 'del-wall': delWall(e.target); break;
            case 'toggle-menu': e.target.closest('.action-menu-container').classList.toggle('active'); break;
            case 'clear-all': clearAllData(); break;
            case 'lock':
                isLocked = !isLocked;
                e.target.classList.toggle('locked', isLocked);
                document.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
                document.querySelector('.lock-icon').textContent = isLocked ? '🔓' : '🔒';
                document.querySelectorAll('.btn.btn-xs.btn-primary.outline').forEach(btn => btn.disabled = isLocked);
                updateLockState();
                showToast(isLocked ? 'ล็อคหน้าแล้ว' : 'ปลดล็อคหน้าแล้ว', isLocked ? 'warning' : 'success');
                break;
            case 'copy-json':
                navigator.clipboard.writeText(document.querySelector(SELECTORS.payloadInput).value);
                showToast('คัดลอก JSON แล้ว', 'success');
                break;
            case 'copy-text':
                const options = await showCopyOptionsModal();
                if (options) {
                    const text = generateTextSummary(options);
                    navigator.clipboard.writeText(text);
                    showToast('คัดลอกข้อความแล้ว', 'success');
                }
                break;
            case 'import': document.querySelector(SELECTORS.importModal).classList.add('visible'); break;
            case 'import-cancel': document.querySelector(SELECTORS.importModal).classList.remove('visible'); break;
            case 'import-confirm': importData(); break;
            case 'export': exportData(); break;
        }
    });

    document.addEventListener('change', e => {
        if (e.target.matches('[name="fabric_variant"]')) {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
    });

    document.addEventListener('click', e => {
        const container = e.target.closest('.action-menu-container');
        document.querySelectorAll('.action-menu-container.active').forEach(c => {
            if (c !== container) c.classList.remove('active');
        });
        if (container) {
            container.classList.toggle('active');
        }
    });

    document.addEventListener('click', e => {
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