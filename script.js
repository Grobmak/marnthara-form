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
        let setCountSets = 0, setCountDeco = 0;

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
                    set.querySelector('[data-set-yardage-opaque]').textContent = "0.00";
                    set.querySelector('[data-set-yardage-sheer]').textContent = "0.00";
                    set.querySelector('[data-set-opaque-track]').textContent = "0.00";
                    set.querySelector('[data-set-sheer-track]').textContent = "0.00";
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
                    if (variant === "ทึบ" || variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                        setCountSets++;
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
                const price = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                let totalSqm = w * h, totalSqyd = totalSqm * SQM_TO_SQYD;
                let totalPrice = totalSqyd * price;
                
                if (totalSqm > 0 && price > 0) {
                    setCountDeco++;
                }

                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(totalPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalSqyd, 2)}</span> ตร.หลา`;
                roomSum += totalPrice;
            });
            
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                const summaryEl = item.querySelector('[data-wallpaper-summary]');
                if (item.dataset.suspended === 'true') {
                    summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`;
                    return;
                }

                const height = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(item.querySelector('[name="wallpaper_price_roll"]').value);
                const totalWidth = Array.from(item.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                
                if (height > 0 && pricePerRoll > 0 && totalWidth > 0) {
                    setCountDeco++;
                }

                const totalSqm = totalWidth * height;
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, height);
                const totalPrice = rollsNeeded * pricePerRoll;

                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(totalPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${rollsNeeded}</span> ม้วน`;
                roomSum += totalPrice;
            });

            room.querySelector('[data-room-total]').textContent = fmt(roomSum, 0, true);
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;

        saveData();
    }

    function buildPayload() {
        const payload = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            timestamp: new Date().toLocaleString("th-TH"),
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                style: room.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: []
            };

            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                roomData.sets.push({
                    is_suspended: set.dataset.suspended === 'true',
                    width_m: clamp01(set.querySelector('input[name="width_m"]').value),
                    height_m: clamp01(set.querySelector('input[name="height_m"]').value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                    open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]').value)
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                roomData.decorations.push({
                    is_suspended: deco.dataset.suspended === 'true',
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: clamp01(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value)
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((item) => {
                roomData.wallpapers.push({
                    is_suspended: item.dataset.suspended === 'true',
                    height_m: clamp01(item.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(item.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value))
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
        } catch (e) {
            console.error("Failed to save data to storage:", e);
        }
    }
    
    function updateLockState() {
        const rooms = document.querySelectorAll(SELECTORS.room);
        const hasData = document.querySelector('#customerInfo input').value || rooms.length > 1 || rooms[0]?.querySelectorAll('input, select').length > 1;
        isLocked = hasData;
        document.querySelector(SELECTORS.lockBtn).classList.toggle('btn-primary', !isLocked);
        document.querySelector(SELECTORS.lockBtn).classList.toggle('btn-danger', isLocked);
        document.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        document.querySelector('.lock-icon').textContent = isLocked ? '🔓' : '🔒';
    }

    function copyTextFromHTML() {
        showCopyOptionsModal().then(options => {
            if (!options) return;
            let textOutput = '';
            
            if (options.customer) {
                const customerName = document.querySelector('input[name="customer_name"]').value;
                const customerPhone = document.querySelector('input[name="customer_phone"]').value;
                const customerAddress = document.querySelector('input[name="customer_address"]').value;
                textOutput += `**ข้อมูลลูกค้า**\n`;
                if (customerName) textOutput += `ชื่อ: ${customerName}\n`;
                if (customerPhone) textOutput += `เบอร์โทร: ${customerPhone}\n`;
                if (customerAddress) textOutput += `รายละเอียดเพิ่มเติม: ${customerAddress}\n`;
                textOutput += `\n`;
            }

            if (options.details) {
                document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
                    const roomName = room.querySelector('input[name="room_name"]').value || `ห้อง ${rIdx + 1}`;
                    const style = room.querySelector('select[name="room_style"]').value;
                    const pricePerM = room.querySelector('select[name="room_price_per_m"]').value;
                    textOutput += `**${roomName}**\n`;
                    textOutput += `สไตล์: ${style || '-'}\n`;
                    textOutput += `ราคาผ้าทึบ: ${pricePerM || '-'} บ./ม.\n\n`;

                    room.querySelectorAll(SELECTORS.set).forEach((set, sIdx) => {
                        if (set.dataset.suspended === 'true') return;
                        const w = set.querySelector('input[name="width_m"]').value, h = set.querySelector('input[name="height_m"]').value;
                        const variant = set.querySelector('select[name="fabric_variant"]').value;
                        const openType = set.querySelector('select[name="open_type"]').value;
                        const opaquePrice = set.querySelector('[data-set-price-opaque]').textContent;
                        const sheerPrice = set.querySelector('[data-set-price-sheer]').textContent;
                        const totalSetPrice = set.querySelector('[data-set-price-total]').textContent;
                        const opaqueYards = set.querySelector('[data-set-yardage-opaque]').textContent;
                        const sheerYards = set.querySelector('[data-set-yardage-sheer]').textContent;
                        
                        textOutput += `จุดที่ ${sIdx + 1} (${variant}, กว้าง ${w} ม., สูง ${h} ม.)\n`;
                        if (openType) textOutput += `- รูปแบบเปิด: ${openType}\n`;
                        if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") textOutput += `- ราคาผ้าทึบ: ${opaquePrice} บ. (ใช้ ${opaqueYards} หลา)\n`;
                        if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") textOutput += `- ราคาผ้าโปร่ง: ${sheerPrice} บ. (ใช้ ${sheerYards} หลา)\n`;
                        textOutput += `- ราคารวมจุด: ${totalSetPrice} บ.\n\n`;
                    });

                    room.querySelectorAll(SELECTORS.decoItem).forEach((deco, dIdx) => {
                        if (deco.dataset.suspended === 'true') return;
                        const type = deco.querySelector('[name="deco_type"]').value;
                        const w = deco.querySelector('[name="deco_width_m"]').value, h = deco.querySelector('[name="deco_height_m"]').value;
                        const price = deco.querySelector('[data-deco-summary] .price').textContent;
                        textOutput += `ตกแต่งที่ ${dIdx + 1}: ${type} (กว้าง ${w} ม., สูง ${h} ม.) - ราคา: ${price} บ.\n\n`;
                    });

                    room.querySelectorAll(SELECTORS.wallpaperItem).forEach((item, wIdx) => {
                        if (item.dataset.suspended === 'true') return;
                        const h = item.querySelector('[name="wallpaper_height_m"]').value;
                        const price = item.querySelector('[data-wallpaper-summary] .price').textContent;
                        const rolls = item.querySelector('[data-wallpaper-summary] .price:last-of-type').textContent;
                        const totalWidths = Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(el => el.value).filter(v => v).join(', ');
                        textOutput += `วอลเปเปอร์ที่ ${wIdx + 1} (สูง ${h} ม., กว้าง ${totalWidths} ม.) - ใช้ ${rolls} ม้วน - ราคา: ${price} บ.\n\n`;
                    });
                });
            }

            if (options.summary) {
                const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;
                const grandFabric = document.querySelector(SELECTORS.grandFabric).textContent;
                const grandSheerFabric = document.querySelector(SELECTORS.grandSheerFabric).textContent;
                const grandOpaqueTrack = document.querySelector(SELECTORS.grandOpaqueTrack).textContent;
                const grandSheerTrack = document.querySelector(SELECTORS.grandSheerTrack).textContent;
                const setCount = document.querySelector(SELECTORS.setCount).textContent;
                
                textOutput += `**สรุปยอดรวม**\n`;
                textOutput += `ราคารวม: ${grandTotal} บ.\n`;
                textOutput += `จำนวนจุด/รายการรวม: ${setCount}\n`;
                textOutput += `ผ้าทึบที่ใช้: ${grandFabric}\n`;
                textOutput += `ผ้าโปร่งที่ใช้: ${grandSheerFabric}\n`;
                textOutput += `รางทึบที่ใช้: ${grandOpaqueTrack}\n`;
                textOutput += `รางโปร่งที่ใช้: ${grandSheerTrack}\n`;
            }

            if (textOutput) {
                navigator.clipboard.writeText(textOutput.trim()).then(() => {
                    showToast('คัดลอกข้อมูลเรียบร้อยแล้ว', 'success');
                }).catch(err => {
                    showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
                });
            }
        });
    }

    function handleFileImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.customer_name || data.rooms) {
                    if (data.customer_name) document.querySelector('input[name="customer_name"]').value = data.customer_name;
                    if (data.customer_phone) document.querySelector('input[name="customer_phone"]').value = data.customer_phone;
                    if (data.customer_address) document.querySelector('input[name="customer_address"]').value = data.customer_address;

                    roomsEl.innerHTML = "";
                    roomCount = 0;
                    if (data.rooms && data.rooms.length > 0) data.rooms.forEach(addRoom);
                    else addRoom();
                    saveData();
                    showToast('นำเข้าข้อมูลสำเร็จ', 'success');
                } else {
                    showToast('ไฟล์ JSON ไม่ถูกต้อง', 'error');
                }
            } catch (err) {
                showToast('ไฟล์ JSON ไม่ถูกต้อง', 'error');
            }
        };
        reader.readAsText(file);
    }

    function exportJsonFile() {
        const payload = buildPayload();
        const jsonString = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marnthara_data_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Event listeners
    document.addEventListener("change", debounce(e => {
        if (e.target.closest(SELECTORS.room)) recalcAll();
    }));
    document.addEventListener("input", debounce(e => {
        if (e.target.closest('#customerInfo')) saveData();
        if (e.target.closest(SELECTORS.room)) recalcAll();
    }));

    document.addEventListener("click", async e => {
        if (e.target.dataset.act === 'add-set') addSet(e.target.closest(SELECTORS.room));
        if (e.target.dataset.act === 'add-deco') addDeco(e.target.closest(SELECTORS.room));
        if (e.target.dataset.act === 'add-wallpaper') addWallpaper(e.target.closest(SELECTORS.room));
        if (e.target.dataset.act === 'add-wall') addWall(e.target);
        if (e.target.dataset.act === 'del-room') await delRoom(e.target);
        if (e.target.dataset.act === 'del-set') await delSet(e.target);
        if (e.target.dataset.act === 'del-deco') await delDeco(e.target);
        if (e.target.dataset.act === 'del-wallpaper') await delWallpaper(e.target);
        if (e.target.dataset.act === 'del-wall') await delWall(e.target);
        if (e.target.dataset.act === 'clear-set') await clearSet(e.target);
        if (e.target.dataset.act === 'clear-deco') await clearDeco(e.target);
        if (e.target.dataset.act === 'clear-wallpaper') await clearWallpaper(e.target);
        if (e.target.dataset.act === 'suspend-item') toggleSuspend(e.target);
        if (e.target.dataset.act === 'clear-room') {
            if (isLocked) { showToast('ไม่สามารถล้างข้อมูลห้องได้เมื่อถูกล็อค', 'error'); return; }
            if (await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในห้องนี้?')) {
                const room = e.target.closest(SELECTORS.room);
                room.querySelectorAll('input, select').forEach(el => { el.value = ''; });
                room.querySelector(SELECTORS.setsContainer).innerHTML = '';
                room.querySelector(SELECTORS.decorationsContainer).innerHTML = '';
                room.querySelector(SELECTORS.wallpapersContainer).innerHTML = '';
                addSet(room);
                renumber(); recalcAll(); saveData();
                showToast('ล้างข้อมูลห้องแล้ว', 'success');
            }
        }
    });

    document.querySelector(SELECTORS.clearAllBtn).addEventListener("click", clearAllData);
    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener("click", () => addRoom());
    document.querySelector(SELECTORS.lockBtn).addEventListener("click", updateLockState);
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener("click", () => {
        const payload = buildPayload();
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
            showToast('คัดลอก JSON เรียบร้อยแล้ว', 'success');
        }).catch(err => {
            showToast('ไม่สามารถคัดลอก JSON ได้', 'error');
        });
    });
    document.querySelector(SELECTORS.copyTextBtn).addEventListener("click", copyTextFromHTML);
    document.querySelector(SELECTORS.submitBtn).addEventListener("click", () => {
        const form = document.querySelector(SELECTORS.orderForm);
        form.checkValidity();
        form.reportValidity();
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener("click", () => {
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });

    document.querySelector(SELECTORS.importBtn).addEventListener("click", () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener("click", () => {
        const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const data = JSON.parse(jsonText);
            if (data.customer_name || data.rooms) {
                if (data.customer_name) document.querySelector('input[name="customer_name"]').value = data.customer_name;
                if (data.customer_phone) document.querySelector('input[name="customer_phone"]').value = data.customer_phone;
                if (data.customer_address) document.querySelector('input[name="customer_address"]').value = data.customer_address;
                
                roomsEl.innerHTML = ""; roomCount = 0;
                if (data.rooms && data.rooms.length > 0) data.rooms.forEach(addRoom);
                else addRoom();
                saveData();
                document.querySelector(SELECTORS.importModal).classList.remove('visible');
                showToast('นำเข้าข้อมูลสำเร็จ', 'success');
            } else {
                showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
            }
        } catch(err) {
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
        }
    });

    document.querySelector(SELECTORS.importCancel).addEventListener("click", () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });
    
    document.querySelector(SELECTORS.exportBtn).addEventListener("click", exportJsonFile);

    window.addEventListener("click", (e) => {
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