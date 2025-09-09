(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper";
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
            
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') { 
                    set.querySelector('[data-set-price-total]').textContent = "0"; 
                    set.querySelector('[data-set-price-opaque]').textContent = "0";
                    set.querySelector('[data-set-price-sheer]').textContent = "0";
                    set.querySelector('[data-set-yardage-opaque]').textContent = "0";
                    set.querySelector('[data-set-yardage-sheer]').textContent = "0";
                    set.querySelector('[data-set-opaque-track]').textContent = "0";
                    set.querySelector('[data-set-sheer-track]').textContent = "0";
                    return;
                }
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
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);
                roomSum += opaquePrice + sheerPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });
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
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
                if (wallpaper.dataset.suspended === 'true') {
                    summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`;
                    return;
                }
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                let totalWidth = 0;
                wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(input => { totalWidth += clamp01(input.value); });
                const areaSqm = h * totalWidth;
                const rollsNeeded = areaSqm > 0 ? Math.ceil(areaSqm / WALLPAPER_SQM_PER_ROLL) : 0;
                const wallpaperPrice = Math.round(rollsNeeded * pricePerRoll);
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(areaSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${rollsNeeded}</span> ม้วน`;
                roomSum += wallpaperPrice;
            });
            room.querySelector('[data-room-total-price]').textContent = fmt(roomSum, 0, true);
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2) + ' หลา';
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2) + ' หลา';
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + ' ม.';
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + ' ม.';

        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(SELECTORS.set).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(SELECTORS.decoItem).length;
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(SELECTORS.set, SELECTORS.decoItem, SELECTORS.wallpaperItem).length;
    }

    function buildPayload() {
        const payload = {
            app: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value.trim(),
            customer_phone: document.querySelector('input[name="customer_phone"]').value.trim(),
            customer_address: document.querySelector('input[name="customer_address"]').value.trim(),
            grand_total: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            grand_fabric: toNum(document.querySelector(SELECTORS.grandFabric).textContent),
            grand_sheer_fabric: toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent),
            grand_opaque_track: toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent),
            grand_sheer_track: toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent),
            total_sets: toNum(document.querySelector(SELECTORS.setCountSets).textContent),
            total_decorations: toNum(document.querySelector(SELECTORS.setCountDeco).textContent),
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value.trim(),
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                style: room.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: [],
                room_total: toNum(room.querySelector('[data-room-total-price]').textContent),
            };
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const w = toNum(set.querySelector('input[name="width_m"]').value);
                const h = toNum(set.querySelector('input[name="height_m"]').value);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                const opaquePrice = toNum(set.querySelector('[data-set-price-opaque]').textContent);
                const sheerPrice = toNum(set.querySelector('[data-set-price-sheer]').textContent);
                const opaqueYards = toNum(set.querySelector('[data-set-yardage-opaque]').textContent);
                const sheerYards = toNum(set.querySelector('[data-set-yardage-sheer]').textContent);
                const opaqueTrack = toNum(set.querySelector('[data-set-opaque-track]').textContent);
                const sheerTrack = toNum(set.querySelector('[data-set-sheer-track]').textContent);
                roomData.sets.push({
                    width_m: w, height_m: h, fabric_variant: variant,
                    is_suspended: set.dataset.suspended === 'true',
                    open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]').value),
                    opaque_price: opaquePrice, sheer_price: sheerPrice,
                    opaque_yards: opaqueYards, sheer_yards: sheerYards,
                    opaque_track: opaqueTrack, sheer_track: sheerTrack,
                });
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const w = toNum(deco.querySelector('[name="deco_width_m"]').value);
                const h = toNum(deco.querySelector('[name="deco_height_m"]').value);
                roomData.decorations.push({
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: w, height_m: h, price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: deco.dataset.suspended === 'true',
                });
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const h = toNum(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                const widths = [];
                wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(input => { widths.push(toNum(input.value)); });
                roomData.wallpapers.push({
                    height_m: h, price_per_roll: pricePerRoll, widths,
                    is_suspended: wallpaper.dataset.suspended === 'true',
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }
    
    function saveData() {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch(err) {
            console.error("Failed to save data to storage:", err);
            showToast("ไม่สามารถบันทึกข้อมูลได้", "error");
        }
    }
    
    function updateLockState() {
        const hasRooms = roomsEl.querySelectorAll(SELECTORS.room).length > 0;
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const addRoomBtn = document.querySelector(SELECTORS.addRoomHeaderBtn);
        const clearAllBtn = document.querySelector(SELECTORS.clearAllBtn);
        isLocked = lockBtn.classList.contains('is-locked');
        
        lockBtn.title = isLocked ? "ปลดล็อคเพื่อแก้ไข" : "ล็อคเพื่อป้องกันการแก้ไข";
        addRoomBtn.disabled = isLocked;
        clearAllBtn.disabled = isLocked;
        
        const allFields = document.querySelectorAll('.field, .btn[data-act]');
        allFields.forEach(el => {
            if (el.id !== 'lockBtn' && el.id !== 'menuBtn') {
                el.disabled = isLocked;
            }
        });
    }

    /* Event Listeners */
    document.addEventListener('input', debounce(recalcAll));
    document.addEventListener('input', debounce(saveData));
    document.addEventListener('click', e => {
        const action = e.target.dataset.act || e.target.closest('[data-act]')?.dataset.act;
        if (!action || isLocked) return;
        
        switch(action) {
            case 'add-set': addSet(e.target.closest(SELECTORS.room)); break;
            case 'add-deco': addDeco(e.target.closest(SELECTORS.room)); break;
            case 'add-wallpaper': addWallpaper(e.target.closest(SELECTORS.room)); break;
            case 'add-wall': addWall(e.target); break;
            case 'del-room': delRoom(e.target); break;
            case 'del-set': delSet(e.target); break;
            case 'del-deco': delDeco(e.target); break;
            case 'del-wallpaper': delWallpaper(e.target); break;
            case 'del-wall': delWall(e.target); break;
            case 'clear-set': clearSet(e.target); break;
            case 'clear-deco': clearDeco(e.target); break;
            case 'clear-wallpaper': clearWallpaper(e.target); break;
            case 'suspend-item': toggleSuspend(e.target); break;
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        lockBtn.classList.toggle('is-locked');
        updateLockState();
    });

    roomsEl.addEventListener('change', e => {
        const setEl = e.target.closest(SELECTORS.set);
        if (setEl && e.target.name === 'fabric_variant') {
            toggleSetFabricUI(setEl);
        }
    });

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async () => {
        const payload = buildPayload();
        try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            showToast("คัดลอก JSON แล้ว", "success");
        } catch (err) {
            console.error('Failed to copy JSON: ', err);
            showToast('คัดลอก JSON ไม่สำเร็จ', 'error');
        }
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (!options) return;
        const payload = buildPayload();
        let textToCopy = "";

        if (options.customer) {
            textToCopy += `**ข้อมูลลูกค้า**\n`;
            if (payload.customer_name) textToCopy += `ชื่อ: ${payload.customer_name}\n`;
            if (payload.customer_phone) textToCopy += `เบอร์โทร: ${payload.customer_phone}\n`;
            if (payload.customer_address) textToCopy += `รายละเอียด: ${payload.customer_address}\n\n`;
        }
        
        if (options.details) {
            textToCopy += `**รายละเอียดห้องและจุด**\n`;
            payload.rooms.forEach((room, rIdx) => {
                if (room.is_suspended) return;
                textToCopy += `--- ห้อง ${room.room_name || `0${rIdx+1}`} (${room.style})\n`;
                room.sets.forEach((set, sIdx) => {
                    if (set.is_suspended) return;
                    textToCopy += `  - จุดที่ ${sIdx+1}: ${set.width_m} x ${set.height_m} ม. (${set.fabric_variant}) ราคารวม ${fmt(set.opaque_price + set.sheer_price, 0, true)} บ. (ผ้าทึบ ${fmt(set.opaque_yards, 2)} หลา / โปร่ง ${fmt(set.sheer_yards, 2)} หลา)\n`;
                });
                room.decorations.forEach((deco, dIdx) => {
                    if (deco.is_suspended) return;
                    textToCopy += `  - ตกแต่ง ${deco.type}: ${deco.width_m} x ${deco.height_m} ม. ราคารวม ${fmt(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd, 0, true)} บ.\n`;
                });
                room.wallpapers.forEach((wall, wIdx) => {
                    if (wall.is_suspended) return;
                    textToCopy += `  - วอลเปเปอร์: ${wall.height_m} ม. กว้างรวม ${wall.widths.reduce((sum, w) => sum + w, 0)} ม. ใช้ ${Math.ceil(wall.widths.reduce((sum, w) => sum + w, 0) * wall.height_m / WALLPAPER_SQM_PER_ROLL)} ม้วน ราคารวม ${fmt(Math.ceil(wall.widths.reduce((sum, w) => sum + w, 0) * wall.height_m / WALLPAPER_SQM_PER_ROLL) * wall.price_per_roll, 0, true)} บ.\n`;
                });
            });
            textToCopy += `\n`;
        }

        if (options.summary) {
            textToCopy += `**สรุปยอดรวม**\n`;
            textToCopy += `ราคารวม: ${fmt(payload.grand_total, 0, true)} บ.\n`;
            textToCopy += `ผ้าทึบที่ใช้: ${fmt(payload.grand_fabric, 2)} หลา\n`;
            textToCopy += `ผ้าโปร่งที่ใช้: ${fmt(payload.grand_sheer_fabric, 2)} หลา\n`;
            textToCopy += `รางทึบที่ใช้: ${fmt(payload.grand_opaque_track, 2)} ม.\n`;
            textToCopy += `รางโปร่งที่ใช้: ${fmt(payload.grand_sheer_track, 2)} ม.\n`;
            textToCopy += `จำนวนผ้าม่าน: ${payload.total_sets} ชุด\n`;
            textToCopy += `จำนวนตกแต่งเพิ่ม: ${payload.total_decorations} ชุด\n`;
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
            showToast("คัดลอกข้อความแล้ว", "success");
        } catch (err) {
            console.error('Failed to copy text: ', err);
            showToast('คัดลอกข้อความไม่สำเร็จ', 'error');
        }
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });

    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });

    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
        document.querySelector(SELECTORS.importJsonArea).value = "";
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const jsonStr = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const payload = JSON.parse(jsonStr);
            localStorage.setItem(STORAGE_KEY, jsonStr);
            location.reload();
        } catch(e) {
            showToast("รูปแบบข้อมูล JSON ไม่ถูกต้อง", "error");
        }
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', async () => {
        const payload = buildPayload();
        try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            showToast("คัดลอกข้อมูลสำหรับนำเข้าแล้ว", "success");
        } catch(err) {
            console.error('Failed to export data: ', err);
            showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
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