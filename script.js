(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper-m3";
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
        lockBtn: '#lockBtn', addRoomHeaderBtn: '#addRoomHeaderBtn', submitBtn: '#submitBtn',
        grandTotal: '#grandTotal', setCount: '#setCount', grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric',
        dialog: '#confirmationDialog', dialogTitle: '.dialog-title', dialogBody: '.dialog-body', dialogConfirm: '#dialogConfirm', dialogCancel: '#dialogCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]', roomPricePerM: 'select[name="room_price_per_m"]', roomStyle: 'select[name="room_style"]',
        setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        toastContainer: '#toast-container',
        grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        copyTextBtn: '#copyTextBtn', copyOptionsDialog: '#copyOptionsDialog', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn',
        importDialog: '#importDialog', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel'
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
        else { toast.style.backgroundColor = 'var(--bg-surface)'; toast.style.color = 'var(--on-surface)'; }

        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }
    
    const showConfirmation = (title, body) => {
        return new Promise((resolve) => {
            const dialogEl = document.querySelector(SELECTORS.dialog);
            dialogEl.querySelector(SELECTORS.dialogTitle).textContent = title;
            dialogEl.querySelector(SELECTORS.dialogBody).textContent = body;
            dialogEl.showModal();
            const cleanup = (result) => {
                dialogEl.close();
                dialogEl.querySelector(SELECTORS.dialogConfirm).onclick = null;
                dialogEl.querySelector(SELECTORS.dialogCancel).onclick = null;
                resolve(result);
            };
            dialogEl.querySelector(SELECTORS.dialogConfirm).onclick = () => cleanup(true);
            dialogEl.querySelector(SELECTORS.dialogCancel).onclick = () => cleanup(false);
        });
    };

    function showCopyOptionsDialog() {
        return new Promise((resolve) => {
            const dialog = document.querySelector(SELECTORS.copyOptionsDialog);
            dialog.showModal();
            const confirmBtn = document.querySelector(SELECTORS.copyOptionsConfirm);
            const cancelBtn = document.querySelector(SELECTORS.copyOptionsCancel);
            
            const cleanup = (result) => {
                dialog.close();
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
                created.querySelector('[data-suspend-text]').textContent = 'visibility_off';
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
                created.querySelector('[data-suspend-text]').textContent = 'visibility_off';
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
                created.querySelector('[data-suspend-text]').textContent = 'visibility_off';
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
    }
    
    function toggleSuspend(btn) {
        const item = btn.closest('.set, .deco-item, .wallpaper-item');
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        const iconSpan = btn.querySelector('[data-suspend-text]');
        if (iconSpan) iconSpan.textContent = isSuspended ? 'visibility_off' : 'visibility';
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

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            const totalItems = items.length;
            
            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}/${totalItems}` : `${iIdx + 1}`;
            });
        });
    }

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);
            
            // Recalc for Curtains (Sets)
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') { /* ... clear UI ... */ return; }
                const w = clamp01(set.querySelector('input[name="width_m"]').value), h = clamp01(set.querySelector('input[name="height_m"]').value);
                const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]').value;
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                if (w > 0 && h > 0) {
                    if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                        opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                        opaqueYards = CALC.fabricYardage(style, w);
                        opaqueTrack = w;
                    }
                    if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                        const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]').value);
                        sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                        sheerYards = CALC.fabricYardage(style, w);
                        sheerTrack = w;
                    }
                }
                set.querySelector('[data-set-price-total]').textContent = fmt(opaquePrice + sheerPrice, 0, true);
                set.querySelector('[data-set-price-opaque]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-set-price-sheer]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-set-yardage-opaque]').textContent = `${fmt(opaqueYards, 2)} หลา`;
                set.querySelector('[data-set-yardage-sheer]').textContent = `${fmt(sheerYards, 2)} หลา`;
                set.querySelector('[data-set-opaque-track]').textContent = `${fmt(opaqueTrack, 2)} ม.`;
                set.querySelector('[data-set-sheer-track]').textContent = `${fmt(sheerTrack, 2)} ม.`;
                roomSum += opaquePrice + sheerPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });

            // Recalc for Decorations
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const summaryEl = deco.querySelector('[data-deco-summary]');
                if (deco.dataset.suspended === 'true') {
                    summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.หลา`;
                    return;
                }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value), h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]').value);
                const areaSqyd = w * h * SQM_TO_SQYD;
                const decoPrice = Math.round(areaSqyd * price);
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(decoPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(areaSqyd, 2)}</span> ตร.หลา`;
                roomSum += decoPrice;
            });

            // Recalc for Wallpapers
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                const summaryEl = item.querySelector('[data-wallpaper-summary]');
                if (item.dataset.suspended === 'true') {
                    summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`;
                    return;
                }
                const h = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                const rollPrice = clamp01(item.querySelector('[name="wallpaper_price_roll"]').value);
                const widths = Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value));
                const totalWidth = widths.reduce((acc, curr) => acc + curr, 0);
                const totalAreaSqm = totalWidth * h;
                const rollsUsed = totalAreaSqm > 0 ? Math.ceil(totalAreaSqm / WALLPAPER_SQM_PER_ROLL) : 0;
                const wallpaperPrice = rollsUsed * rollPrice;
                
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalAreaSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${rollsUsed}</span> ม้วน`;
                roomSum += wallpaperPrice;
            });

            grand += roomSum;
        });
        
        // Update Grand Totals
        const setsCount = document.querySelectorAll(SELECTORS.set).length;
        const decoCount = document.querySelectorAll(SELECTORS.decoItem).length;
        const totalItemsCount = setsCount + decoCount + document.querySelectorAll(SELECTORS.wallpaperItem).length;
        
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = totalItemsCount;
        document.querySelector(SELECTORS.setCountSets).textContent = setsCount;
        document.querySelector(SELECTORS.setCountDeco).textContent = decoCount;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;

        saveData();
    }
    
    function updateLockState() {
        const lockIcon = document.querySelector('[data-lock-icon]');
        const lockText = document.querySelector('[data-lock-text]');
        const allFields = document.querySelectorAll('#orderForm input, #orderForm select, #orderForm textarea');
        const addRoomBtn = document.querySelector(SELECTORS.addRoomHeaderBtn);

        isLocked = document.querySelectorAll(SELECTORS.room).length > 0 && document.querySelector(SELECTORS.lockBtn).dataset.locked === 'true';

        lockIcon.textContent = isLocked ? 'lock' : 'lock_open';
        lockText.textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        
        allFields.forEach(el => el.disabled = isLocked);
        addRoomBtn.disabled = isLocked;
        document.querySelectorAll('.btn:not(.text-btn):not(#lockBtn):not(#clearAllBtn):not(#menuBtn)').forEach(btn => {
            btn.disabled = isLocked;
        });
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value),
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    width_m: clamp01(setEl.querySelector('input[name="width_m"]').value),
                    height_m: clamp01(setEl.querySelector('input[name="height_m"]').value),
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                    is_suspended: setEl.dataset.suspended === 'true'
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: clamp01(decoEl.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(decoEl.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: decoEl.dataset.suspended === 'true'
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                const widths = Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value));
                roomData.wallpapers.push({
                    height_m: clamp01(item.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(item.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths,
                    is_suspended: item.dataset.suspended === 'true'
                });
            });

            payload.rooms.push(roomData);
        });
        return payload;
    }

    function saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
        } catch (e) {
            console.error("Failed to save data to localStorage", e);
        }
    }
    
    function copyText(payload, options) {
        let text = "";
        if (options.customer) {
            text += `ลูกค้า: ${payload.customer_name}\n`;
            if (payload.customer_phone) text += `เบอร์โทร: ${payload.customer_phone}\n`;
            if (payload.customer_address) text += `รายละเอียด: ${payload.customer_address}\n`;
            text += `--------------------------\n`;
        }
        
        if (options.details) {
            payload.rooms.forEach(room => {
                text += `ห้อง: ${room.room_name}\n`;
                const sets = room.sets.filter(s => !s.is_suspended);
                const decos = room.decorations.filter(d => !d.is_suspended);
                const wallpapers = room.wallpapers.filter(w => !w.is_suspended);

                if (sets.length > 0) {
                    text += `  - ผ้าม่าน (${sets.length} จุด)\n`;
                    sets.forEach(s => {
                        text += `    - กว้าง ${s.width_m}ม. x สูง ${s.height_m}ม. (ชนิด: ${s.fabric_variant}, สไตล์: ${room.style})\n`;
                    });
                }
                if (decos.length > 0) {
                    text += `  - ตกแต่ง (${decos.length} รายการ)\n`;
                    decos.forEach(d => {
                        text += `    - ${d.type} กว้าง ${d.width_m}ม. x สูง ${d.height_m}ม.\n`;
                    });
                }
                if (wallpapers.length > 0) {
                    text += `  - วอลเปเปอร์ (${wallpapers.length} รายการ)\n`;
                    wallpapers.forEach(w => {
                        text += `    - สูง ${w.height_m}ม. กว้างรวม ${w.widths.reduce((a, b) => a + b, 0)}ม.\n`;
                    });
                }
                text += `--------------------------\n`;
            });
        }
        
        if (options.summary) {
            const grandTotal = toNum(document.querySelector(SELECTORS.grandTotal).textContent);
            const grandFabric = document.querySelector(SELECTORS.grandFabric).textContent;
            const grandSheerFabric = document.querySelector(SELECTORS.grandSheerFabric).textContent;
            const grandOpaqueTrack = document.querySelector(SELECTORS.grandOpaqueTrack).textContent;
            const grandSheerTrack = document.querySelector(SELECTORS.grandSheerTrack).textContent;
            
            text += `สรุปยอดรวม\n`;
            text += `ราคารวม: ${fmt(grandTotal, 0, true)} บาท\n`;
            text += `ผ้าทึบที่ใช้: ${grandFabric}\n`;
            text += `ผ้าโปร่งที่ใช้: ${grandSheerFabric}\n`;
            text += `รางทึบที่ใช้: ${grandOpaqueTrack}\n`;
            text += `รางโปร่งที่ใช้: ${grandSheerTrack}\n`;
        }

        navigator.clipboard.writeText(text).then(() => {
            showToast('คัดลอกข้อมูลแล้ว', 'success');
        }).catch(err => {
            showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
            console.error('Failed to copy text:', err);
        });
    }

    // --- Event Listeners & Initialization ---
    document.addEventListener("click", e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.act;
        const roomEl = btn.closest(SELECTORS.room);

        switch(action) {
            case 'add-set': addSet(roomEl); break;
            case 'del-set': delSet(btn); break;
            case 'clear-set': clearSet(btn); break;
            case 'add-deco': addDeco(roomEl); break;
            case 'del-deco': delDeco(btn); break;
            case 'clear-deco': clearDeco(btn); break;
            case 'add-wallpaper': addWallpaper(roomEl); break;
            case 'del-wallpaper': delWallpaper(btn); break;
            case 'clear-wallpaper': clearWallpaper(btn); break;
            case 'add-wall': addWall(btn); break;
            case 'del-wall': delWall(btn); break;
            case 'del-room': delRoom(btn); break;
            case 'toggle-suspend': toggleSuspend(btn); break;
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener("click", () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener("click", () => clearAllData());

    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        lockBtn.dataset.locked = (lockBtn.dataset.locked === 'true' ? 'false' : 'true');
        updateLockState();
        const msg = (lockBtn.dataset.locked === 'true' ? 'ล็อคหน้าจอแล้ว' : 'ปลดล็อคหน้าจอแล้ว');
        showToast(msg, 'success');
    });

    const debouncedRecalc = debounce(recalcAll);
    document.addEventListener('input', e => {
        if (isLocked) return;
        if (e.target.matches('input[type="number"], input[type="text"], select')) {
            debouncedRecalc();
        }
        if (e.target.matches('select[name="fabric_variant"]')) {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
        if (e.target.matches(SELECTORS.roomNameInput)) {
            renumber();
        }
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        const dropdown = document.querySelector(SELECTORS.menuDropdown);
        dropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        const dropdown = document.querySelector(SELECTORS.menuDropdown);
        if (dropdown.classList.contains('show') && !dropdown.contains(e.target) && !document.querySelector(SELECTORS.menuBtn).contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
    
    document.querySelector('#copyTextBtn').addEventListener('click', async () => {
        const options = await showCopyOptionsDialog();
        if (options) {
            copyText(buildPayload(), options);
        }
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const data = JSON.stringify(buildPayload(), null, 2);
        navigator.clipboard.writeText(data).then(() => {
            showToast('คัดลอกข้อมูล JSON แล้ว', 'success');
        }).catch(err => {
            showToast('ไม่สามารถคัดลอกข้อมูล JSON ได้', 'error');
            console.error('Failed to copy JSON:', err);
        });
    });
    
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        const dialog = document.querySelector(SELECTORS.importDialog);
        dialog.showModal();
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        try {
            const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
            const payload = JSON.parse(jsonText);
            document.querySelector('input[name="customer_name"]').value = payload.customer_name || "";
            document.querySelector('input[name="customer_address"]').value = payload.customer_address || "";
            document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || "";
            
            roomsEl.innerHTML = ""; roomCount = 0;
            if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
            else addRoom();
            
            document.querySelector(SELECTORS.importDialog).close();
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
            saveData();
        } catch (e) {
            showToast('รูปแบบข้อมูลไม่ถูกต้อง', 'error');
            console.error('Failed to import JSON', e);
        }
    });
    
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importDialog).close();
    });

    // Initial load
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