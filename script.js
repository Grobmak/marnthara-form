(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-m3";
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
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl', summaryTpl: '#summaryTpl',
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
        else { toast.style.backgroundColor = 'var(--md-sys-color-inverse-surface)'; toast.style.color = 'var(--md-sys-color-inverse-on-surface)'; }

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
        } else {
            addWallpaper(created);
        }

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
            const sets = room.querySelectorAll(SELECTORS.set);
            const wallpapers = room.querySelectorAll(SELECTORS.wallpaperItem);
            const decos = room.querySelectorAll(SELECTORS.decoItem);
            sets.forEach((item, iIdx) => { item.querySelector('[data-item-title]').textContent = `จุดที่ ${iIdx + 1}`; });
            wallpapers.forEach((item, iIdx) => { item.querySelector('[data-item-title]').textContent = `วอลเปเปอร์ที่ ${iIdx + 1}`; });
            decos.forEach((item, iIdx) => { item.querySelector('[data-item-title]').textContent = `ตกแต่งที่ ${iIdx + 1}`; });
        });
    }

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        let totalSets = 0, totalDeco = 0, totalWalpaper = 0;

        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);

            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') {
                    set.querySelector('[data-set-price-total]').textContent = '0';
                    set.querySelector('[data-set-opaque-yardage]').textContent = '0 หลา';
                    set.querySelector('[data-set-sheer-yardage]').textContent = '0 หลา';
                    set.querySelector('[data-set-opaque-track]').textContent = '0 ม.';
                    set.querySelector('[data-set-sheer-track]').textContent = '0 ม.';
                    return;
                }
                const w = clamp01(set.querySelector('input[name="width_m"]').value);
                const h = clamp01(set.querySelector('input[name="height_m"]').value);
                const hPlus = heightPlus(h);
                const variant = set.querySelector('select[name="fabric_variant"]').value;

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
                set.querySelector('[data-set-opaque-yardage]').textContent = `${fmt(opaqueYards)} หลา`;
                set.querySelector('[data-set-sheer-yardage]').textContent = `${fmt(sheerYards)} หลา`;
                set.querySelector('[data-set-opaque-track]').textContent = `${fmt(opaqueTrack)} ม.`;
                set.querySelector('[data-set-sheer-track]').textContent = `${fmt(sheerTrack)} ม.`;

                roomSum += opaquePrice + sheerPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
                totalSets++;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                if (deco.dataset.suspended === 'true') {
                    deco.querySelector('[data-deco-total]').textContent = '0';
                    deco.querySelector('[data-deco-area]').textContent = '0 ตร.หลา';
                    return;
                }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const p = clamp01(deco.querySelector('[name="deco_price_sqyd"]').value);
                const area = w * h * SQM_TO_SQYD;
                const price = Math.round(area * p);
                deco.querySelector('[data-deco-total]').textContent = fmt(price, 0, true);
                deco.querySelector('[data-deco-area]').textContent = `${fmt(area)} ตร.หลา`;
                roomSum += price;
                totalDeco++;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                if (item.dataset.suspended === 'true') {
                    item.querySelector('[data-wallpaper-total]').textContent = '0';
                    item.querySelector('[data-wallpaper-area]').textContent = '0 ตร.ม.';
                    item.querySelector('[data-wallpaper-rolls]').textContent = '0 ม้วน';
                    return;
                }
                const h = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                const p = clamp01(item.querySelector('[name="wallpaper_price_roll"]').value);
                let totalArea = 0;
                item.querySelectorAll('[name="wall_width_m"]').forEach(input => {
                    totalArea += clamp01(input.value) * h;
                });
                const rolls = Math.ceil(totalArea / WALLPAPER_SQM_PER_ROLL);
                const price = Math.round(rolls * p);
                item.querySelector('[data-wallpaper-total]').textContent = fmt(price, 0, true);
                item.querySelector('[data-wallpaper-area]').textContent = `${fmt(totalArea)} ตร.ม.`;
                item.querySelector('[data-wallpaper-rolls]').textContent = `${rolls} ม้วน`;
                roomSum += price;
                totalWalpaper++;
            });
            
            room.querySelector('[data-room-total]').textContent = fmt(roomSum, 0, true);
            room.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด ${totalSets}</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บ.`;
            grand += roomSum;
        });
        
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = totalSets;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack)} ม.`;
        
        const summaryCard = document.querySelector('.summary-card');
        const summaryTpl = document.querySelector(SELECTORS.summaryTpl).content.cloneNode(true);
        if (summaryCard) summaryCard.remove();
        if (grandOpaqueYards > 0 || grandSheerYards > 0 || grandOpaqueTrack > 0 || grandSheerTrack > 0) {
            document.querySelector('#customerInfo').after(summaryTpl);
        }
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value || `ห้อง ${rIdx + 1}`,
                price_per_m: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                price_per_m_raw: room.querySelector(SELECTORS.roomPricePerM).value,
                style: room.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: []
            };
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                roomData.sets.push({
                    width_m: toNum(set.querySelector('[name="width_m"]').value),
                    height_m: toNum(set.querySelector('[name="height_m"]').value),
                    fabric_variant: set.querySelector('[name="fabric_variant"]').value,
                    open_type: set.querySelector('[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('[name="sheer_price_per_m"]').value),
                    set_note: set.querySelector('[name="set_note"]').value,
                    is_suspended: set.dataset.suspended === 'true',
                });
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                roomData.decorations.push({
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: deco.dataset.suspended === 'true',
                });
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((item) => {
                const widths = [];
                item.querySelectorAll('[name="wall_width_m"]').forEach(input => widths.push(toNum(input.value)));
                roomData.wallpapers.push({
                    height_m: toNum(item.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(item.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths,
                    is_suspended: item.dataset.suspended === 'true',
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
            console.error("Failed to save data to local storage", e);
        }
    }

    function updateLockState() {
        const lockIcon = document.querySelector('#lockBtn .lock-icon');
        const lockText = document.querySelector('#lockBtn .lock-text');
        
        if (isLocked) {
            document.body.classList.add('is-locked');
            lockIcon.textContent = 'lock';
            lockIcon.style.color = 'var(--md-sys-color-primary)';
            if (lockText) lockText.textContent = 'ล็อคแล้ว';
        } else {
            document.body.classList.remove('is-locked');
            lockIcon.textContent = 'lock_open';
            lockIcon.style.color = 'var(--md-sys-color-primary)';
            if (lockText) lockText.textContent = 'ปลดล็อค';
        }

        document.querySelectorAll('input, select, textarea').forEach(el => el.disabled = isLocked);
        document.querySelectorAll('.actions-section button, .total-summary button, .fab').forEach(el => {
            if (el.id === 'lockBtn') return;
            el.disabled = isLocked;
        });
    }

    // Event Listeners
    document.addEventListener('input', debounce(e => {
        if (e.target.closest(SELECTORS.room)) {
            recalcAll();
            saveData();
        }
    }, 200));
    document.addEventListener('click', async e => {
        if (isLocked) {
            const el = e.target.closest('[data-act]');
            if (!el || (el && !['suspend-set', 'suspend-deco', 'suspend-wallpaper', 'lockBtn', 'clearAllBtn'].includes(el.dataset.act))) {
                 showToast('หน้าจอถูกล็อคอยู่', 'warning');
            }
        }
        
        const el = e.target.closest('[data-act]');
        if (!el) return;

        const roomEl = el.closest(SELECTORS.room);
        
        switch (el.dataset.act) {
            case 'add-curtain-set': addSet(roomEl, { fabric_variant: "ทึบ&โปร่ง" }); break;
            case 'add-wallpaper': addWallpaper(roomEl); break;
            case 'add-deco': addDeco(roomEl); break;
            case 'del-room': delRoom(el); break;
            case 'del-set': delSet(el); break;
            case 'del-deco': delDeco(el); break;
            case 'del-wallpaper': delWallpaper(el); break;
            case 'del-wall': delWall(el); break;
            case 'suspend-set': toggleSuspend(el); break;
            case 'suspend-deco': toggleSuspend(el); break;
            case 'suspend-wallpaper': toggleSuspend(el); break;
            case 'clear-set': clearSet(el); break;
            case 'clear-wallpaper': clearWallpaper(el); break;
            default: break;
        }
    });

    document.addEventListener('change', e => {
        if (e.target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
        if (e.target.closest(SELECTORS.room)) {
            recalcAll();
            saveData();
        }
    });
    
    document.querySelector(SELECTORS.addRoomFab).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => { isLocked = !isLocked; updateLockState(); showToast(isLocked ? 'ล็อคหน้าจอแล้ว' : 'ปลดล็อคหน้าจอแล้ว', isLocked ? 'warning' : 'success'); });
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', e => {
        e.stopPropagation();
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });
    document.addEventListener('click', e => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        if (menuDropdown.classList.contains('show') && !menuDropdown.contains(e.target) && !document.querySelector(SELECTORS.menuBtn).contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
    });
    
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        try {
            const data = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
            if (data.rooms) {
                roomsEl.innerHTML = "";
                data.rooms.forEach(addRoom);
                document.querySelector('input[name="customer_name"]').value = data.customer_name || '';
                document.querySelector('input[name="customer_phone"]').value = data.customer_phone || '';
                document.querySelector('input[name="customer_address"]').value = data.customer_address || '';
                saveData();
                recalcAll();
                showToast('นำเข้าข้อมูลสำเร็จ', 'success');
            } else {
                showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
            }
        } catch(e) {
            showToast('JSON ไม่ถูกต้อง', 'error');
        }
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const json = JSON.stringify(payload, null, 2);
        navigator.clipboard.writeText(json).then(() => {
            showToast('คัดลอก JSON แล้ว', 'success');
        }).catch(err => {
            showToast('ไม่สามารถคัดลอกได้: ' + err, 'error');
        });
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (!options) return;
        const payload = buildPayload();
        let text = "";
        
        if (options.customer) {
            text += `ลูกค้า: ${payload.customer_name || '-'}\n`;
            text += `เบอร์โทร: ${payload.customer_phone || '-'}\n`;
            text += `รายละเอียด: ${payload.customer_address || '-'}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach(room => {
                text += `***${room.room_name}***\n`;
                if (room.sets.length > 0) {
                    text += "ผ้าม่าน:\n";
                    room.sets.forEach((set, i) => {
                        const styleLabel = set.fabric_variant === 'ทึบ&โปร่ง' ? 'ผ้าทึบ&โปร่ง' : set.fabric_variant;
                        const sheerPrice = set.sheer_price_per_m ? `(${set.sheer_price_per_m.toLocaleString("th-TH")} บ./ม.)` : '';
                        const opaquePrice = room.price_per_m ? `(${room.price_per_m.toLocaleString("th-TH")} บ./ม.)` : '';
                        const price = set.fabric_variant === 'โปร่ง' ? sheerPrice : opaquePrice;
                        text += `  - จุดที่ ${i+1}: กว้าง ${fmt(set.width_m, 2)} ม. สูง ${fmt(set.height_m, 2)} ม. - ${styleLabel} ${price}\n`;
                    });
                }
                if (room.wallpapers.length > 0) {
                     text += "\nวอลเปเปอร์:\n";
                     room.wallpapers.forEach((item, i) => {
                         text += `  - รายการที่ ${i+1}: สูง ${fmt(item.height_m)} ม. ราคา/ม้วน ${fmt(item.price_per_roll)} บ.\n`;
                         text += `    ความกว้าง: ${item.widths.map(w => fmt(w)).join(', ')}\n`;
                     });
                }
                if (room.decorations.length > 0) {
                    text += "\nตกแต่ง:\n";
                    room.decorations.forEach((item, i) => {
                        text += `  - รายการที่ ${i+1}: ${item.type || 'ไม่ระบุ'} กว้าง ${fmt(item.width_m)} ม. สูง ${fmt(item.height_m)} ม. ราคา/หลา ${fmt(item.price_sqyd, 0, true)} บ.\n`;
                    });
                }
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

            text += "***สรุปยอดรวม***\n";
            text += `ราคารวม: ${grandTotal} บ.\n`;
            text += `จำนวนจุดติดตั้ง: ${setCount} จุด\n`;
            text += `ใช้ผ้าทึบ: ${grandFabric}\n`;
            text += `ใช้ผ้าโปร่ง: ${grandSheerFabric}\n`;
            text += `ใช้รางทึบ: ${grandOpaqueTrack}\n`;
            text += `ใช้รางโปร่ง: ${grandSheerTrack}\n`;
        }
        
        navigator.clipboard.writeText(text).then(() => {
            showToast('คัดลอกข้อความแล้ว', 'success');
        }).catch(err => {
            showToast('ไม่สามารถคัดลอกได้: ' + err, 'error');
        });
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
        recalcAll();
    });
})();