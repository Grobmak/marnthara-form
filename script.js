(function() {
    'use strict';
    const APP_VERSION = "input-ui/m3-1.0.0";
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
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', copyJsonBtn: '#copyJsonBtn', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomFab: '#addRoomFab', submitBtn: '#submitBtn',
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
        summaryBtn: '#summaryBtn', summaryPopup: '#summaryPopup',
    };

    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    const lockBtn = document.querySelector(SELECTORS.lockBtn);
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
        
        // Make sure labels on text fields in new rooms are styled correctly
        const roomLabelBg = room.querySelector('.m3-text-field.outlined label');
        if (roomLabelBg) {
           roomLabelBg.style.backgroundColor = 'var(--surface-container)';
        }

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
        
        const hasItems = created.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length > 0;
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
        const item = btn.closest('.set, .deco, .wallpaper');
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        btn.querySelector('[data-suspend-text]').textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }
    async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); }
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); item.querySelectorAll('input').forEach(el => el.value = ''); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); }
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }
    function renumber() { document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => { const input = room.querySelector(SELECTORS.roomNameInput); if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`; const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`); items.forEach((item, iIdx) => { const lbl = item.querySelector("[data-item-title]"); if (lbl) lbl.textContent = `${iIdx + 1}`; }); }); }
    function recalcAll() { 
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0; 
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        document.querySelectorAll(SELECTORS.room).forEach((room) => { 
            let roomSum = 0; 
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value); 
            const style = room.querySelector(SELECTORS.roomStyle).value; 
            const sPlus = stylePlus(style);
            
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                if (set.dataset.suspended === 'true') return;
                const width_m = clamp01(set.querySelector('input[name="width_m"]').value);
                const height_m = clamp01(set.querySelector('input[name="height_m"]').value);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                const sheerPrice = toNum(set.querySelector('select[name="sheer_price_per_m"]').value);
                
                const fYards = CALC.fabricYardage(style, width_m);
                const hPlus = heightPlus(height_m);
                const oPricePerM = baseRaw + sPlus + hPlus;
                
                let setSum = 0;
                
                if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                    setSum += width_m * oPricePerM;
                    setSum += fYards * 1.5; // Additional for sewing
                    grandOpaqueYards += fYards;
                    grandOpaqueTrack += width_m;
                }
                if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                    setSum += width_m * sheerPrice;
                    setSum += fYards * 1.5; // Additional for sewing
                    grandSheerYards += fYards;
                    grandSheerTrack += width_m;
                    set.querySelector('input[name="sheer_width_m"]').value = fmt(width_m);
                    set.querySelector('[data-sheer-yardage]').textContent = fmt(fYards);
                    set.querySelector('[data-sheer-track]').textContent = fmt(width_m);
                } else {
                    set.querySelector('[data-sheer-yardage]').textContent = "0.00";
                    set.querySelector('[data-sheer-track]').textContent = "0.00";
                    set.querySelector('input[name="sheer_width_m"]').value = "";
                }
                
                set.querySelector('[data-opaque-price]').textContent = fmt(width_m * oPricePerM, 0, true);
                set.querySelector('[data-sheer-price]').textContent = fmt(width_m * sheerPrice, 0, true);
                set.querySelector('[data-opaque-yardage]').textContent = fmt(fYards);
                set.querySelector('[data-opaque-track]').textContent = fmt(width_m);

                roomSum += setSum;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                if (deco.dataset.suspended === 'true') return;
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const price = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                const sqyd = w * h * SQM_TO_SQYD;
                const decoSum = sqyd * price;
                deco.querySelector('[data-deco-summary] .price').textContent = fmt(decoSum, 0, true);
                deco.querySelector('[data-deco-summary] .price:last-child').textContent = fmt(sqyd);
                roomSum += decoSum;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                if (item.dataset.suspended === 'true') return;
                const h = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(item.querySelector('[name="wallpaper_price_roll"]').value);
                let totalWidth = 0;
                item.querySelectorAll('[name="wall_width_m"]').forEach(input => {
                    totalWidth += clamp01(input.value);
                });
                const totalArea = totalWidth * h;
                const numRolls = Math.ceil(totalArea / WALLPAPER_SQM_PER_ROLL);
                const itemSum = numRolls * pricePerRoll;
                item.querySelector('[data-wallpaper-summary] .price:nth-child(1)').textContent = fmt(itemSum, 0, true);
                item.querySelector('[data-wallpaper-summary] .price:nth-child(2)').textContent = fmt(totalArea);
                item.querySelector('[data-wallpaper-summary] .price:nth-child(3)').textContent = numRolls;
                roomSum += itemSum;
            });
            
            grand += roomSum;
            room.querySelector('[name="room_total_price"]').value = fmt(roomSum, 0, true);
            room.querySelector('[name="room_total_m"]').value = fmt(room.querySelectorAll(SELECTORS.set).reduce((sum, s) => sum + clamp01(s.querySelector('input[name="width_m"]').value), 0));
            room.querySelector('[name="room_set_count"]').value = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack)} ม.`;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(SELECTORS.set).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(`${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
    }
    
    function updateLockState() {
        const iconEl = lockBtn.querySelector('.lock-icon');
        const formElements = document.querySelectorAll(`${SELECTORS.orderForm} input, ${SELECTORS.orderForm} select, ${SELECTORS.orderForm} textarea`);
        const addRoomBtn = document.querySelector(SELECTORS.addRoomFab);
        const main = document.querySelector('main.container');

        if (isLocked) {
            iconEl.textContent = 'lock';
            main.classList.add('is-locked');
            addRoomBtn.style.display = 'none';
        } else {
            iconEl.textContent = 'lock_open';
            main.classList.remove('is-locked');
            addRoomBtn.style.display = 'flex';
        }

        formElements.forEach(el => {
            if (el.readOnly) return; // Keep readonly inputs as they are
            el.disabled = isLocked;
        });
        
        // Disable action buttons within the form
        document.querySelectorAll('.item-actions .m3-button-icon').forEach(btn => {
            btn.disabled = isLocked;
        });
        document.querySelectorAll('.actions .m3-button-outlined, .actions .m3-button-filled').forEach(btn => {
            if (btn.id !== 'submitBtn' && btn.id !== 'copyTextBtn') { // Exclude 'ส่งไปคำนวณ' and 'คัดลอกข้อความ'
                btn.disabled = isLocked;
            }
        });
    }
    
    function toggleLockState() {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'warning');
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer_name: document.querySelector('input[name="customer_name"]').value || null,
            customer_phone: document.querySelector('input[name="customer_phone"]').value || null,
            customer_address: document.querySelector('input[name="customer_address"]').value || null,
            total_price: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            total_sets: toNum(document.querySelector(SELECTORS.setCountSets).textContent),
            total_decorations: toNum(document.querySelector(SELECTORS.setCountDeco).textContent),
            total_opaque_yards: toNum(document.querySelector(SELECTORS.grandFabric).textContent.replace(' หลา', '')),
            total_sheer_yards: toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent.replace(' หลา', '')),
            total_opaque_track: toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent.replace(' ม.', '')),
            total_sheer_track: toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent.replace(' ม.', '')),
            rooms: [],
        };
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value || null,
                room_type: room.querySelector('[name="room_type"]').value || null,
                style: room.querySelector(SELECTORS.roomStyle).value || null,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                room_note: room.querySelector('[name="room_note"]').value || null,
                sets: [],
                decorations: [],
                wallpapers: [],
            };

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                roomData.sets.push({
                    is_suspended: set.dataset.suspended === 'true',
                    width_m: clamp01(set.querySelector('input[name="width_m"]').value),
                    height_m: clamp01(set.querySelector('input[name="height_m"]').value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value || null,
                    open_type: set.querySelector('select[name="open_type"]').value || null,
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]').value),
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                roomData.decorations.push({
                    is_suspended: deco.dataset.suspended === 'true',
                    type: deco.querySelector('[name="deco_type"]').value || null,
                    width_m: clamp01(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const widths = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(input => clamp01(input.value));
                roomData.wallpapers.push({
                    is_suspended: wallpaper.dataset.suspended === 'true',
                    height_m: clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths,
                });
            });

            payload.rooms.push(roomData);
        });

        return payload;
    }
    
    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function copyToClipboard(text, message) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(message, 'success');
        }, (err) => {
            console.error('Failed to copy text: ', err);
            showToast('คัดลอกไม่สำเร็จ', 'error');
        });
    }

    async function copyTextData() {
        const options = await showCopyOptionsModal();
        if (!options) return;

        const payload = buildPayload();
        let text = "";

        if (options.customer) {
            text += "=== ข้อมูลลูกค้า ===\n";
            text += `ชื่อลูกค้า: ${payload.customer_name || "-"}\n`;
            text += `เบอร์โทร: ${payload.customer_phone || "-"}\n`;
            text += `ที่อยู่: ${payload.customer_address || "-"}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach(room => {
                text += `=== ห้อง: ${room.room_name || "-"} ===\n`;
                text += `รูปแบบ: ${room.style || "-"} ราคา: ${fmt(room.price_per_m_raw, 0, true)} บ./ม.`;
                if (room.room_note) text += ` (${room.room_note})`;
                text += "\n";

                room.sets.filter(s => !s.is_suspended).forEach((set, i) => {
                    text += `- จุดที่ ${i+1}: กว้าง ${set.width_m}ม. สูง ${set.height_m}ม. (${set.fabric_variant} ${set.open_type}) \n`;
                });
                room.decorations.filter(d => !d.is_suspended).forEach(deco => {
                    text += `- ตกแต่ง: ${deco.type || "-"} กว้าง ${deco.width_m}ม. สูง ${deco.height_m}ม. \n`;
                });
                room.wallpapers.filter(w => !w.is_suspended).forEach(wallpaper => {
                    text += `- วอลเปเปอร์: สูง ${wallpaper.height_m}ม. ความกว้างผนัง: ${wallpaper.widths.join(", ")}ม. \n`;
                });
                text += "\n";
            });
        }
        
        if (options.summary) {
            text += "=== สรุปยอดรวม ===\n";
            text += `ผ้ารวม: ${fmt(payload.total_opaque_yards)} หลา (ทึบ) + ${fmt(payload.total_sheer_yards)} หลา (โปร่ง)\n`;
            text += `รางรวม: ${fmt(payload.total_opaque_track)} ม. (ทึบ) + ${fmt(payload.total_sheer_track)} ม. (โปร่ง)\n`;
            text += `ราคารวม: ${fmt(payload.total_price, 0, true)} บ.\n`;
            text += `จำนวนชุด: ${payload.total_sets} ชุด\n\n`;
        }

        copyToClipboard(text, 'คัดลอกข้อมูลเรียบร้อยแล้ว');
    }

    // Event Listeners
    lockBtn.addEventListener('click', toggleLockState);
    document.querySelector(SELECTORS.addRoomFab).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => copyToClipboard(JSON.stringify(buildPayload()), 'คัดลอก JSON เรียบร้อยแล้ว'));
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', copyTextData);
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });
    document.querySelector(SELECTORS.summaryBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.summaryPopup).classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        const menuBtn = document.querySelector(SELECTORS.menuBtn);
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const summaryBtn = document.querySelector(SELECTORS.summaryBtn);
        const summaryPopup = document.querySelector(SELECTORS.summaryPopup);

        if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
        if (!summaryBtn.contains(e.target) && !summaryPopup.contains(e.target)) {
            summaryPopup.classList.remove('show');
        }
    });

    orderForm.addEventListener("submit", () => {
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
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
        recalcAll(); // Initial calculation on load
    });

    document.addEventListener('input', debounce(e => {
        const target = e.target;
        if (target.matches('input, select, textarea')) {
            recalcAll();
            saveData();
        }
    }, 200));

    document.addEventListener('click', async e => {
        const target = e.target.closest('[data-act]');
        if (!target) return;
        const roomEl = target.closest(SELECTORS.room);
        
        if (isLocked) return;

        switch(target.dataset.act) {
            case 'add-set': addSet(roomEl); break;
            case 'add-deco': addDeco(roomEl); break;
            case 'add-wallpaper': addWallpaper(roomEl); break;
            case 'add-wall': addWall(target); break;
            case 'del-room': delRoom(target); break;
            case 'del-set': delSet(target); break;
            case 'del-deco': delDeco(target); break;
            case 'del-wallpaper': delWallpaper(target); break;
            case 'del-wall': delWall(target); break;
            case 'clear-set': clearSet(target); break;
            case 'clear-deco': clearDeco(target); break;
            case 'clear-wallpaper': clearWallpaper(target); break;
            case 'toggle-suspend': toggleSuspend(target); break;
        }
    });

    document.addEventListener('change', e => {
        const target = e.target;
        if (target.name === "fabric_variant") {
            toggleSetFabricUI(target.closest(SELECTORS.set));
        }
        recalcAll();
        saveData();
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = JSON.stringify(buildPayload(), null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Marnthara-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('ข้อมูลถูกส่งออกแล้ว', 'success');
    });

    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        const modal = document.querySelector(SELECTORS.importModal);
        modal.classList.add('visible');
    });
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        try {
            const importData = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
            if (importData.version && importData.version.startsWith("input-ui/m3")) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(importData));
                location.reload();
            } else {
                showToast('รูปแบบข้อมูลไม่ถูกต้อง', 'error');
            }
        } catch(err) {
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
        }
    });

})();