(function() {
    'use strict';
    const APP_VERSION = "input-ui/M3-redesign";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.m3";
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
        selectEl.innerHTML = `<option value="" hidden></option>`;
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
        const sheerWrap = setEl.querySelector(SELECTORS.sheerWrap);
        sheerWrap.style.display = hasSheer ? 'block' : 'none';
    }
    
    function toggleSuspend(btn) {
        const item = btn.closest('.set, .deco-item, .wallpaper-item');
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.style.opacity = isSuspended ? '0.5' : '1';
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
                if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}` : `${iIdx + 1}`;
            });
        });
    }

    function recalcAll() {
        let grandTotal = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        let setCount = 0, setCountSets = 0, setCountDeco = 0, setCountWallpaper = 0;
        
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
                setCount++; setCountSets++;
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
                if (deco.dataset.suspended === 'true') {
                    deco.querySelector('[data-deco-summary]').textContent = `ราคา: 0 บ. • พื้นที่: 0.00 ตร.หลา`;
                    return;
                }
                setCount++; setCountDeco++;
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value), h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const price_sqyd = clamp01(deco.querySelector('[name="deco_price_sqyd"]').value);
                const area_sqm = w * h;
                const area_sqyd = area_sqm * SQM_TO_SQYD;
                const price = Math.round(area_sqyd * price_sqyd);
                deco.querySelector('[data-deco-summary]').textContent = `ราคา: ${fmt(price, 0, true)} บ. • พื้นที่: ${fmt(area_sqyd, 2)} ตร.หลา`;
                roomSum += price;
            });
            
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                if (item.dataset.suspended === 'true') {
                    item.querySelector('[data-wallpaper-summary]').textContent = `ราคา: 0 บ. • พื้นที่: 0.00 ตร.ม. • ใช้ 0 ม้วน`;
                    return;
                }
                setCount++; setCountWallpaper++;
                const h = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                const price_roll = clamp01(item.querySelector('[name="wallpaper_price_roll"]').value);
                const totalWidth = Array.from(item.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const area_sqm = h * totalWidth;
                const rolls = area_sqm > 0 ? Math.ceil(area_sqm / WALLPAPER_SQM_PER_ROLL) : 0;
                const price = Math.round(rolls * price_roll);
                item.querySelector('[data-wallpaper-summary]').textContent = `ราคา: ${fmt(price, 0, true)} บ. • พื้นที่: ${fmt(area_sqm, 2)} ตร.ม. • ใช้ ${rolls} ม้วน`;
                roomSum += price;
            });

            room.querySelector('[data-room-brief]').innerHTML = `<span class="num">${room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length} จุด</span> • <span class="num">${room.querySelectorAll(SELECTORS.set).length} ชุด</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บ.`;
            grandTotal += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = setCount;
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
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                style: room.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: []
            };

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                roomData.sets.push({
                    width_m: clamp01(set.querySelector('input[name="width_m"]').value),
                    height_m: clamp01(set.querySelector('input[name="height_m"]').value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                    open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]').value),
                    is_suspended: set.dataset.suspended === 'true'
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                roomData.decorations.push({
                    width_m: clamp01(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: deco.dataset.suspended === 'true'
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
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
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload())); }
        catch (e) { console.error("Could not save data to local storage", e); }
    }

    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        isLocked = roomsEl.childElementCount > 0;
        document.querySelectorAll('input, select, .room-actions button, .set-header button').forEach(el => {
            if (el.id !== 'lockBtn' && el.id !== 'clearAllBtn' && el.id !== 'menuBtn') {
                el.disabled = isLocked;
            }
        });
        lockBtn.textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
    }

    function copyJson() {
        const payload = buildPayload();
        try { navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); showToast("คัดลอก JSON แล้ว", "success"); }
        catch (e) { showToast("ไม่สามารถคัดลอก JSON ได้", "error"); console.error(e); }
    }

    async function copyText() {
        const options = await showCopyOptionsModal();
        if (!options) return;
        
        let text = "";
        const payload = buildPayload();
        const fmtPrice = n => fmt(n, 0, true) + " บ.";
        const fmtMeasure = (n, unit) => `${fmt(n, 2)} ${unit}`;
        
        if (options.customer) {
            text += `**ข้อมูลลูกค้า**\n`;
            text += `- ชื่อลูกค้า: ${payload.customer_name}\n`;
            text += `- เบอร์โทร: ${payload.customer_phone}\n`;
            text += `- รายละเอียด: ${payload.customer_address}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach((room, roomIndex) => {
                text += `**ห้องที่ ${roomIndex + 1}: ${room.room_name}**\n`;
                
                room.sets.forEach((set, setIndex) => {
                    text += `- ผ้าม่านจุดที่ ${setIndex + 1}: กว้าง ${set.width_m} ม. x สูง ${set.height_m} ม. (${set.fabric_variant})\n`;
                });
                room.decorations.forEach((deco, decoIndex) => {
                    text += `- ตกแต่งจุดที่ ${decoIndex + 1}: กว้าง ${deco.width_m} ม. x สูง ${deco.height_m} ม.\n`;
                });
                room.wallpapers.forEach((wallpaper, wallpaperIndex) => {
                    text += `- วอลเปเปอร์จุดที่ ${wallpaperIndex + 1}: สูง ${wallpaper.height_m} ม. x กว้าง ${wallpaper.widths.join(', ')} ม.\n`;
                });
                text += "\n";
            });
        }

        if (options.summary) {
            const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;
            const grandFabric = document.querySelector(SELECTORS.grandFabric).textContent;
            const grandSheerFabric = document.querySelector(SELECTORS.grandSheerFabric).textContent;
            const grandOpaqueTrack = document.querySelector(SELECTORS.grandOpaqueTrack).textContent;
            const grandSheerTrack = document.querySelector(SELECTORS.grandSheerTrack).textContent;
            const setCount = document.querySelector(SELECTORS.setCount).textContent;

            text += `**สรุปยอดรวม**\n`;
            text += `- จำนวนจุดติดตั้ง: ${setCount}\n`;
            text += `- ผ้าทึบที่ใช้: ${grandFabric}\n`;
            text += `- ผ้าโปร่งที่ใช้: ${grandSheerFabric}\n`;
            text += `- รางทึบที่ใช้: ${grandOpaqueTrack}\n`;
            text += `- รางโปร่งที่ใช้: ${grandSheerTrack}\n`;
            text += `- ราคารวม: ${grandTotal} บ.\n`;
        }
        
        try { navigator.clipboard.writeText(text); showToast("คัดลอกข้อความแล้ว", "success"); }
        catch (e) { showToast("ไม่สามารถคัดลอกข้อความได้", "error"); console.error(e); }
    }

    function importData() {
        const importModal = document.querySelector(SELECTORS.importModal);
        const importJsonArea = document.querySelector(SELECTORS.importJsonArea);
        importJsonArea.value = '';
        importModal.classList.add('visible');

        const importConfirm = document.querySelector(SELECTORS.importConfirm);
        const importCancel = document.querySelector(SELECTORS.importCancel);
        
        importConfirm.onclick = () => {
            try {
                const data = JSON.parse(importJsonArea.value);
                document.querySelector('input[name="customer_name"]').value = data.customer_name || '';
                document.querySelector('input[name="customer_phone"]').value = data.customer_phone || '';
                document.querySelector('input[name="customer_address"]').value = data.customer_address || '';
                roomsEl.innerHTML = "";
                roomCount = 0;
                if (data.rooms && data.rooms.length > 0) {
                    data.rooms.forEach(addRoom);
                } else {
                    addRoom();
                }
                showToast("นำเข้าข้อมูลสำเร็จ", "success");
            } catch(e) {
                showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
                console.error("Failed to parse JSON:", e);
            }
            importModal.classList.remove('visible');
        };
        importCancel.onclick = () => {
            importModal.classList.remove('visible');
        };
    }
    
    // Event Listeners
    document.addEventListener('input', debounce(recalcAll, 300));
    document.addEventListener('click', (e) => {
        if (e.target.dataset.act === 'add-set') addSet(e.target.closest(SELECTORS.room));
        else if (e.target.dataset.act === 'add-deco') addDeco(e.target.closest(SELECTORS.room));
        else if (e.target.dataset.act === 'add-wallpaper') addWallpaper(e.target.closest(SELECTORS.room));
        else if (e.target.dataset.act === 'add-wall') addWall(e.target);
        else if (e.target.dataset.act === 'del-room') delRoom(e.target);
        else if (e.target.dataset.act === 'del-set') delSet(e.target);
        else if (e.target.dataset.act === 'del-deco') delDeco(e.target);
        else if (e.target.dataset.act === 'del-wallpaper') delWallpaper(e.target);
        else if (e.target.dataset.act === 'del-wall') delWall(e.target);
        else if (e.target.dataset.act === 'suspend-item') toggleSuspend(e.target);
    });

    document.getElementById('addRoomHeaderBtn').addEventListener('click', () => addRoom());
    document.getElementById('clearAllBtn').addEventListener('click', clearAllData);
    document.getElementById('lockBtn').addEventListener('click', updateLockState);
    document.getElementById('copyJsonBtn').addEventListener('click', copyJson);
    document.getElementById('copyTextBtn').addEventListener('click', copyText);
    document.getElementById('importBtn').addEventListener('click', importData);
    document.getElementById('exportBtn').addEventListener('click', () => {
        const payload = JSON.stringify(buildPayload(), null, 2);
        try {
            navigator.clipboard.writeText(payload);
            showToast("คัดลอก JSON แล้ว", "success");
        } catch(e) {
            showToast("ไม่สามารถคัดลอก JSON ได้", "error");
        }
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
        e.stopPropagation();
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
    });
})();