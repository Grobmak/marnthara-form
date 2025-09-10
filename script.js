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
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
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
        
        const inputs = room.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (isSuspended) {
                input.dataset.wasDisabled = input.disabled;
                input.disabled = true;
            } else {
                if (input.dataset.wasDisabled === 'false') {
                    input.disabled = false;
                }
                delete input.dataset.wasDisabled;
            }
        });
        
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
            const roomTotalEl = room.querySelector('[data-room-total]');
            const briefEl = room.querySelector('[data-room-brief]');
            let briefText = '';

            if (room.dataset.suspended === 'true') {
                roomTotalEl.textContent = '0';
                briefEl.textContent = 'ระงับการคำนวณ';
                return;
            }

            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);
            let roomOpaqueYards = 0, roomSheerYards = 0;
            let roomOpaqueTrack = 0, roomSheerTrack = 0;
            let roomSetCount = 0, roomDecoCount = 0, roomWallpaperCount = 0;

            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') {
                    set.querySelector('[data-set-price-total]').textContent = '0';
                    set.querySelector('[data-set-price-opaque]').textContent = '0';
                    set.querySelector('[data-set-price-sheer]').textContent = '0';
                    set.querySelector('[data-set-yardage-opaque]').textContent = '0.00';
                    set.querySelector('[data-set-yardage-sheer]').textContent = '0.00';
                    set.querySelector('[data-set-opaque-track]').textContent = '0.00';
                    set.querySelector('[data-set-sheer-track]').textContent = '0.00';
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
                roomOpaqueYards += opaqueYards; roomSheerYards += sheerYards;
                roomOpaqueTrack += opaqueTrack; roomSheerTrack += sheerTrack;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const summaryEl = deco.querySelector('[data-deco-summary]');
                if (deco.dataset.suspended === 'true') {
                    deco.querySelector('[data-deco-total]').textContent = '0';
                    summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.หลา`;
                    return;
                }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value), h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const price_sqyd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                const sqyd = w * h * SQM_TO_SQYD;
                const price = Math.round(sqyd * price_sqyd);
                deco.querySelector('[data-deco-total]').textContent = fmt(price, 0, true);
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(sqyd, 2)}</span> ตร.หลา`;
                roomSum += price;
            });
            
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                const summaryEl = item.querySelector('[data-wallpaper-summary]');
                if (item.dataset.suspended === 'true') {
                    item.querySelector('[data-wallpaper-total]').textContent = '0';
                    summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`;
                    return;
                }
                const h = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                const price_per_roll = toNum(item.querySelector('[name="wallpaper_price_roll"]').value);
                let totalWidth = 0;
                item.querySelectorAll('[name="wall_width_m"]').forEach(input => {
                    totalWidth += clamp01(input.value);
                });
                const sqm = totalWidth * h;
                const rolls = Math.ceil(sqm / WALLPAPER_SQM_PER_ROLL);
                const price = rolls * price_per_roll;
                item.querySelector('[data-wallpaper-total]').textContent = fmt(price, 0, true);
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(sqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${rolls}</span> ม้วน`;
                roomSum += price;
            });

            room.querySelector('[data-room-total]').textContent = fmt(roomSum, 0, true);
            const items = room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`);
            const sets = room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`);
            const decos = room.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`);
            briefText = `จุด ${items.length} • ชุด ${sets.length} • ราคา ${fmt(roomSum, 0, true)} บ.`;
            briefEl.textContent = briefText;
            
            grand += roomSum;
            grandOpaqueYards += roomOpaqueYards;
            grandSheerYards += roomSheerYards;
            grandOpaqueTrack += roomOpaqueTrack;
            grandSheerTrack += roomSheerTrack;
            roomSetCount += room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length;
            roomDecoCount += room.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length;
            roomWallpaperCount += room.querySelectorAll(`${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards + grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`; // Keep this for clarity, although it's part of grandFabric
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
        const totalItems = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        document.querySelector(SELECTORS.setCount).textContent = totalItems;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length;

        saveData();
    }
    
    function buildPayload() {
        const payload = {
            app_version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            const roomData = {
                room_name: room.querySelector('input[name="room_name"]').value,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                price_per_m_formatted: room.querySelector(SELECTORS.roomPricePerM).value,
                style: room.querySelector(SELECTORS.roomStyle).value,
                is_suspended: room.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: [],
                room_total_price: toNum(room.querySelector('[data-room-total]').textContent.replace(/,/g, ''))
            };
            if (!roomData.is_suspended) {
                room.querySelectorAll(SELECTORS.set).forEach((set) => {
                    if (set.dataset.suspended === 'true') return;
                    const w = clamp01(set.querySelector('input[name="width_m"]').value);
                    const h = clamp01(set.querySelector('input[name="height_m"]').value);
                    if (w > 0 && h > 0) {
                        roomData.sets.push({
                            width_m: w,
                            height_m: h,
                            fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                            open_type: set.querySelector('select[name="open_type"]').value,
                            sheer_price_per_m: set.querySelector('select[name="sheer_price_per_m"]').value,
                            price: toNum(set.querySelector('[data-set-price-total]').textContent),
                            is_suspended: set.dataset.suspended === 'true'
                        });
                    }
                });
                room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                    if (deco.dataset.suspended === 'true') return;
                    const w = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                    const h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                    if (w > 0 && h > 0) {
                        roomData.decorations.push({
                            type: deco.querySelector('[name="deco_type"]').value,
                            width_m: w,
                            height_m: h,
                            price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                            price: toNum(deco.querySelector('[data-deco-total]').textContent),
                            is_suspended: deco.dataset.suspended === 'true'
                        });
                    }
                });
                room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                    if (item.dataset.suspended === 'true') return;
                    const h = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                    const price_per_roll = toNum(item.querySelector('[name="wallpaper_price_roll"]').value);
                    const widths = Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(input => clamp01(input.value));
                    roomData.wallpapers.push({
                        height_m: h,
                        price_per_roll: price_per_roll,
                        widths: widths,
                        price: toNum(item.querySelector('[data-wallpaper-total]').textContent),
                        is_suspended: item.dataset.suspended === 'true'
                    });
                });
            }
            payload.rooms.push(roomData);
        });
        payload.total_price = toNum(document.querySelector(SELECTORS.grandTotal).textContent);
        payload.total_sets = toNum(document.querySelector(SELECTORS.setCount).textContent);
        payload.total_opaque_yards = toNum(document.querySelector(SELECTORS.grandFabric).textContent);
        payload.total_sheer_yards = toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent);
        payload.total_opaque_track = toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent);
        payload.total_sheer_track = toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent);
        return payload;
    }

    function buildTextPayload(options) {
        let text = "";
        const payload = buildPayload();
        
        if (options.customer) {
            text += `ลูกค้า: ${payload.customer_name}\n`;
            text += `โทร: ${payload.customer_phone}\n`;
            text += `ที่อยู่/โครงการ: ${payload.customer_address}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach((room) => {
                const roomSuspended = room.is_suspended;
                text += `=== ห้อง: ${room.room_name} ===${roomSuspended ? ' (ระงับ)' : ''}\n`;
                if (!roomSuspended) {
                    text += `  ราคาผ้า (ทึบ): ${room.price_per_m_formatted} บ./ม. | สไตล์: ${room.style}\n`;
                    room.sets.forEach((set, i) => {
                        text += `  > จุด ${i + 1}: ${set.fabric_variant} กว้าง ${set.width_m} ม. x สูง ${set.height_m} ม.\n`;
                        if (set.fabric_variant === "ทึบ" || set.fabric_variant === "ทึบ&โปร่ง") {
                            const y = CALC.fabricYardage(room.style, set.width_m);
                            text += `    - ผ้าทึบ: ${fmt(y, 2)} หลา | ราง: ${fmt(set.width_m, 2)} ม.\n`;
                        }
                        if (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") {
                            const y = CALC.fabricYardage(room.style, set.width_m);
                            text += `    - ผ้าโปร่ง: ${fmt(y, 2)} หลา | ราง: ${fmt(set.width_m, 2)} ม.\n`;
                        }
                    });
                    room.decorations.forEach((deco, i) => {
                        const sqyd = deco.width_m * deco.height_m * SQM_TO_SQYD;
                        text += `  > ตกแต่ง ${i + 1}: ${deco.type} กว้าง ${deco.width_m} ม. x สูง ${deco.height_m} ม. - ${fmt(sqyd, 2)} ตร.หลา\n`;
                    });
                    room.wallpapers.forEach((item, i) => {
                        const sqm = item.widths.reduce((sum, w) => sum + w, 0) * item.height_m;
                        const rolls = Math.ceil(sqm / WALLPAPER_SQM_PER_ROLL);
                        text += `  > วอลเปเปอร์ ${i + 1}: สูง ${item.height_m} ม. (${item.widths.length} ผนัง) - ${fmt(sqm, 2)} ตร.ม. (${rolls} ม้วน)\n`;
                    });
                    text += `  ราคารวมห้อง: ${fmt(room.room_total_price, 0, true)} บ.\n`;
                }
                text += "\n";
            });
        }

        if (options.summary) {
            text += "=== สรุปยอดรวม ===\n";
            text += `ราคารวม: ${fmt(payload.total_price, 0, true)} บาท\n`;
            text += `จำนวนจุดติดตั้ง: ${payload.total_sets} จุด\n`;
            text += `ปริมาณผ้ารวม: ${fmt(payload.total_opaque_yards, 2)} หลา (ผ้าทึบ) | ${fmt(payload.total_sheer_yards, 2)} หลา (ผ้าโปร่ง)\n`;
            text += `ปริมาณราง: ${fmt(payload.total_opaque_track, 2)} ม. (รางทึบ) | ${fmt(payload.total_sheer_track, 2)} ม. (รางโปร่ง)\n`;
        }

        return text.trim();
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function updateLockState() {
        document.querySelectorAll('input, select, textarea, .btn, .add-item-btn').forEach(el => {
            if (el.dataset.act && el.dataset.act.includes('del')) return;
            if (el.id === 'lockBtn' || el.id === 'clearAllBtn') return;
            const isSuspended = el.closest('[data-suspended="true"]');
            if (isSuspended) {
                el.disabled = true;
                return;
            }
            if (isLocked) {
                if (el.dataset.act && (el.dataset.act.startsWith('add') || el.dataset.act.startsWith('del'))) {
                    el.disabled = true;
                } else {
                    el.disabled = false;
                }
            } else {
                el.disabled = false;
            }
        });
        document.querySelector('#lockBtn').classList.toggle('btn-primary', !isLocked);
        document.querySelector('#lockBtn').classList.toggle('btn-danger', isLocked);
        document.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
    }

    const actions = {
        'add-set': (btn) => addSet(btn.closest(SELECTORS.room)),
        'add-deco': (btn) => addDeco(btn.closest(SELECTORS.room)),
        'add-wallpaper': (btn) => addWallpaper(btn.closest(SELECTORS.room)),
        'add-wall': (btn) => addWall(btn),
        'del-room': (btn) => delRoom(btn),
        'del-set': (btn) => delSet(btn),
        'del-deco': (btn) => delDeco(btn),
        'del-wallpaper': (btn) => delWallpaper(btn),
        'del-wall': (btn) => delWall(btn),
        'clear-set': (btn) => clearSet(btn),
        'clear-deco': (btn) => clearDeco(btn),
        'clear-wallpaper': (btn) => clearWallpaper(btn),
        'toggle-suspend': (btn) => toggleSuspend(btn),
        'toggle-suspend-room': (btn) => toggleSuspendRoom(btn)
    };
    
    document.addEventListener('input', debounce(e => {
        const input = e.target;
        if (input.matches('input, select') && input.closest(SELECTORS.room)) {
            recalcAll();
        }
    }));
    
    document.addEventListener('change', e => {
        const input = e.target;
        if (input.matches('select[name="fabric_variant"]')) {
            toggleSetFabricUI(input.closest(SELECTORS.set));
        }
        recalcAll();
    });

    document.addEventListener('click', async e => {
        const btn = e.target.closest('[data-act]');
        if (btn && actions[btn.dataset.act]) {
            actions[btn.dataset.act](btn);
        } else if (e.target.id === 'addRoomHeaderBtn') {
            addRoom();
        } else if (e.target.id === 'clearAllBtn') {
            clearAllData();
        } else if (e.target.id === 'lockBtn') {
            isLocked = !isLocked;
            updateLockState();
            showToast(isLocked ? 'ล็อคหน้าจอแล้ว' : 'ปลดล็อคหน้าจอแล้ว', isLocked ? 'warning' : 'success');
        } else if (e.target.id === 'copyJsonBtn') {
            const payload = buildPayload();
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                .then(() => showToast('คัดลอก JSON แล้ว', 'success'))
                .catch(err => showToast('คัดลอกล้มเหลว: ' + err, 'error'));
        } else if (e.target.id === 'copyTextBtn') {
            const options = await showCopyOptionsModal();
            if (options) {
                const textPayload = buildTextPayload(options);
                navigator.clipboard.writeText(textPayload)
                    .then(() => showToast('คัดลอกข้อความแล้ว', 'success'))
                    .catch(err => showToast('คัดลอกล้มเหลว: ' + err, 'error'));
            }
        } else if (e.target.id === 'importBtn') {
            document.querySelector(SELECTORS.importModal).classList.add('visible');
        } else if (e.target.id === 'importCancel') {
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
        } else if (e.target.id === 'importConfirm') {
            try {
                const json = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
                document.querySelector('input[name="customer_name"]').value = json.customer_name;
                document.querySelector('input[name="customer_address"]').value = json.customer_address;
                document.querySelector('input[name="customer_phone"]').value = json.customer_phone;
                roomsEl.innerHTML = ""; roomCount = 0;
                if (json.rooms && json.rooms.length > 0) json.rooms.forEach(addRoom);
                else addRoom();
                showToast('นำเข้าข้อมูลสำเร็จ', 'success');
                document.querySelector(SELECTORS.importModal).classList.remove('visible');
            } catch (err) {
                showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
                console.error('Import failed:', err);
            }
        } else if (e.target.id === 'exportBtn') {
            const payload = buildPayload();
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Marnthara_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('ส่งออกข้อมูลแล้ว', 'success');
        } else if (e.target.id === 'menuBtn') {
            const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
            menuDropdown.classList.toggle('show');
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