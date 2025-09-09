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
        setCountSets: '#setCountSets', setCountDeco: '#setCountDeco', setCountWallpaper: '#setCountWallpaper',
        toastContainer: '#toast-container',
        grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack', grandWallpaperRolls: '#grandWallpaperRolls', grandWallpaperSqm: '#grandWallpaperSqm',
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
                if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}/${totalItems}` : `${iIdx + 1}`;
            });
        });
    }

    function recalcAll() {
        let grandTotal = 0, setCount = 0, grandFabric = 0, grandSheerFabric = 0,
            grandOpaqueTrack = 0, grandSheerTrack = 0, setCountSets = 0, setCountDeco = 0,
            setCountWallpaper = 0, grandWallpaperSqm = 0, grandWallpaperRolls = 0;

        document.querySelectorAll(SELECTORS.room).forEach(room => {
            if (room.dataset.suspended === 'true') return;
            let roomTotal = 0;
            const roomPricePerM = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const roomStyle = room.querySelector(SELECTORS.roomStyle).value;

            // Recalc Sets
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                if (set.dataset.suspended === 'true') return;
                const width = clamp01(set.querySelector('[name="width_m"]').value);
                const height = clamp01(set.querySelector('[name="height_m"]').value);
                const variant = set.querySelector('[name="fabric_variant"]').value;
                const sheerPricePerM = toNum(set.querySelector('[name="sheer_price_per_m"]').value);

                let setTotal = 0;
                let opaqueYardage = 0, sheerYardage = 0, opaqueTrack = 0, sheerTrack = 0;

                const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
                if (hasOpaque) {
                    opaqueYardage = CALC.fabricYardage(roomStyle, width);
                    opaqueTrack = width;
                    setTotal += (opaqueYardage * 0.9 * roomPricePerM) + (opaqueTrack * (stylePlus(roomStyle) + heightPlus(height)));
                }
                const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
                if (hasSheer) {
                    sheerYardage = CALC.fabricYardage("จีบ", width);
                    sheerTrack = width;
                    setTotal += (sheerYardage * 0.9 * sheerPricePerM) + (sheerTrack * heightPlus(height));
                }

                set.querySelector('[data-opaque-yardage]').textContent = fmt(opaqueYardage);
                set.querySelector('[data-sheer-yardage]').textContent = fmt(sheerYardage);
                set.querySelector('[data-opaque-track]').textContent = fmt(opaqueTrack);
                set.querySelector('[data-sheer-track]').textContent = fmt(sheerTrack);
                set.querySelector('[data-set-total]').textContent = fmt(setTotal, 0, true);

                roomTotal += setTotal;
                grandTotal += setTotal;
                grandFabric += opaqueYardage;
                grandSheerFabric += sheerYardage;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
                setCount++;
                if (hasOpaque || hasSheer) setCountSets++;
            });

            // Recalc Decorations
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                if (deco.dataset.suspended === 'true') return;
                const width = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const height = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const pricePerSqyd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                const areaSqm = width * height;
                const areaSqyd = areaSqm * SQM_TO_SQYD;
                const decoTotal = areaSqyd * pricePerSqyd;

                deco.querySelector('[data-deco-total]').textContent = fmt(decoTotal, 0, true);
                roomTotal += decoTotal;
                grandTotal += decoTotal;
                setCount++;
                setCountDeco++;
            });

            // Recalc Wallpapers
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wp => {
                if (wp.dataset.suspended === 'true') return;
                const height = clamp01(wp.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wp.querySelector('[name="wallpaper_price_roll"]').value);
                let totalWidth = 0;
                wp.querySelectorAll('[name="wall_width_m"]').forEach(input => {
                    totalWidth += clamp01(input.value);
                });
                
                const area = totalWidth * height;
                const rolls = Math.ceil(area / WALLPAPER_SQM_PER_ROLL);
                const wallpaperTotal = rolls * pricePerRoll;

                wp.querySelector('[data-wallpaper-total]').textContent = fmt(wallpaperTotal, 0, true);
                wp.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = fmt(area);
                wp.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(rolls, 0);

                roomTotal += wallpaperTotal;
                grandTotal += wallpaperTotal;
                grandWallpaperSqm += area;
                grandWallpaperRolls += rolls;
                setCount++;
                setCountWallpaper++;
            });

            room.querySelector('[data-room-total]').textContent = fmt(roomTotal, 0, true);
            const briefs = room.querySelectorAll('[data-room-brief] .num');
            if (briefs.length >= 3) {
                briefs[0].textContent = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
                briefs[1].textContent = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}`).length;
                briefs[2].textContent = fmt(roomTotal, 0, true);
            }
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = fmt(setCount, 0);
        document.querySelector(SELECTORS.setCountSets).textContent = fmt(setCountSets, 0);
        document.querySelector(SELECTORS.setCountDeco).textContent = fmt(setCountDeco, 0);
        document.querySelector(SELECTORS.setCountWallpaper).textContent = fmt(setCountWallpaper, 0);
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandFabric, 2);
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerFabric, 2);
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2);
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2);
        document.querySelector(SELECTORS.grandWallpaperSqm).textContent = fmt(grandWallpaperSqm, 2);
        document.querySelector(SELECTORS.grandWallpaperRolls).textContent = fmt(grandWallpaperRolls, 0);
    }

    function buildPayload() {
        const payload = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            grand_total: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            grand_fabric: toNum(document.querySelector(SELECTORS.grandFabric).textContent),
            grand_sheer_fabric: toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent),
            grand_opaque_track: toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent),
            grand_sheer_track: toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent),
            grand_wallpaper_sqm: toNum(document.querySelector(SELECTORS.grandWallpaperSqm).textContent),
            grand_wallpaper_rolls: toNum(document.querySelector(SELECTORS.grandWallpaperRolls).textContent),
            app_version: APP_VERSION,
            is_locked: isLocked,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const isSuspended = room.dataset.suspended === 'true';
            const roomPayload = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                style: room.querySelector(SELECTORS.roomStyle).value,
                is_suspended: isSuspended,
                sets: [],
                decorations: [],
                wallpapers: []
            };
            if (isSuspended) { payload.rooms.push(roomPayload); return; }

            // sets
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const isSuspended = set.dataset.suspended === 'true';
                roomPayload.sets.push({
                    width_m: toNum(set.querySelector('[name="width_m"]').value),
                    height_m: toNum(set.querySelector('[name="height_m"]').value),
                    fabric_variant: set.querySelector('[name="fabric_variant"]').value,
                    open_type: set.querySelector('[name="open_type"]').value,
                    sheer_price_per_m: toNum(set.querySelector('[name="sheer_price_per_m"]').value),
                    is_suspended: isSuspended,
                    total_price: toNum(set.querySelector('[data-set-total]').textContent),
                    opaque_yardage: toNum(set.querySelector('[data-opaque-yardage]').textContent),
                    sheer_yardage: toNum(set.querySelector('[data-sheer-yardage]').textContent),
                    opaque_track: toNum(set.querySelector('[data-opaque-track]').textContent),
                    sheer_track: toNum(set.querySelector('[data-sheer-track]').textContent)
                });
            });

            // decorations
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isSuspended = deco.dataset.suspended === 'true';
                roomPayload.decorations.push({
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: isSuspended,
                    total_price: toNum(deco.querySelector('[data-deco-total]').textContent)
                });
            });

            // wallpapers
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wp => {
                const isSuspended = wp.dataset.suspended === 'true';
                const widths = Array.from(wp.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value));
                roomPayload.wallpapers.push({
                    height_m: toNum(wp.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wp.querySelector('[name="wallpaper_price_roll"]').value),
                    is_suspended: isSuspended,
                    widths: widths,
                    total_price: toNum(wp.querySelector('[data-wallpaper-total]').textContent)
                });
            });
            
            payload.rooms.push(roomPayload);
        });
        return payload;
    }

    function updateLockState() {
        isLocked = document.querySelectorAll(SELECTORS.room).length > 0 &&
                   document.querySelector(SELECTORS.room).querySelector(SELECTORS.roomNameInput).value !== "" &&
                   document.querySelector(SELECTORS.room).querySelector(SELECTORS.roomPricePerM).value !== "" &&
                   document.querySelector(SELECTORS.room).querySelector(SELECTORS.roomStyle).value !== "";
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        lockBtn.classList.toggle('btn-primary', !isLocked);
        lockBtn.classList.toggle('btn-warning', isLocked);
        lockBtn.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        lockBtn.querySelector('.lock-icon').textContent = isLocked ? '🔓' : '🔒';
        document.querySelectorAll('input, select, .btn-primary:not(#lockBtn), .btn-danger, .btn-warning, #addRoomHeaderBtn').forEach(el => {
            if (el.dataset.act === 'toggle-suspend' || el.dataset.act === 'clear-set' || el.dataset.act === 'clear-deco' || el.dataset.act === 'clear-wallpaper' || el.dataset.act === 'del-wall' || el.dataset.act === 'del-set' || el.dataset.act === 'del-deco' || el.dataset.act === 'del-wallpaper' || el.dataset.act === 'add-wall' || el.id === 'clearAllBtn' || el.id === 'submitBtn' || el.id === 'lockBtn' || el.id === 'copyTextBtn' || el.id === 'copyJsonBtn' || el.id === 'menuBtn' || el.id === 'importBtn' || el.id === 'exportBtn' || el.id === 'addRoomHeaderBtn') return;
            el.disabled = isLocked;
        });
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function exportData() {
        const payload = buildPayload();
        const jsonString = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marnthara-data-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('ข้อมูลถูก Export แล้ว', 'success');
    }

    function importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (!data.rooms) throw new Error("Invalid JSON structure");
            roomsEl.innerHTML = "";
            roomCount = 0;
            if (data.customer_name) document.querySelector('input[name="customer_name"]').value = data.customer_name;
            if (data.customer_phone) document.querySelector('input[name="customer_phone"]').value = data.customer_phone;
            if (data.customer_address) document.querySelector('input[name="customer_address"]').value = data.customer_address;
            data.rooms.forEach(addRoom);
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
        } catch (error) {
            showToast('ไฟล์ JSON ไม่ถูกต้อง', 'error');
            console.error('Import failed:', error);
        } finally {
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
        }
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('คัดลอกข้อมูลสำเร็จ', 'success');
        } catch (err) {
            console.error('Failed to copy:', err);
            showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
        }
    }

    async function generateCopyText() {
        const options = await showCopyOptionsModal();
        if (!options) return;

        let output = "";
        const customerInfo = {
            name: document.querySelector('input[name="customer_name"]').value,
            phone: document.querySelector('input[name="customer_phone"]').value,
            address: document.querySelector('input[name="customer_address"]').value
        };
        const grandTotals = {
            grandTotal: document.querySelector(SELECTORS.grandTotal).textContent,
            grandFabric: document.querySelector(SELECTORS.grandFabric).textContent,
            grandSheerFabric: document.querySelector(SELECTORS.grandSheerFabric).textContent,
            grandOpaqueTrack: document.querySelector(SELECTORS.grandOpaqueTrack).textContent,
            grandSheerTrack: document.querySelector(SELECTORS.grandSheerTrack).textContent,
            grandWallpaperSqm: document.querySelector(SELECTORS.grandWallpaperSqm).textContent,
            grandWallpaperRolls: document.querySelector(SELECTORS.grandWallpaperRolls).textContent
        };

        if (options.customer) {
            output += `รายละเอียดลูกค้า\n`;
            if (customerInfo.name) output += `ชื่อ: ${customerInfo.name}\n`;
            if (customerInfo.phone) output += `เบอร์โทร: ${customerInfo.phone}\n`;
            if (customerInfo.address) output += `ที่อยู่/รายละเอียด: ${customerInfo.address}\n`;
            output += `\n`;
        }
        if (options.details) {
            document.querySelectorAll(SELECTORS.room).forEach(room => {
                const roomName = room.querySelector(SELECTORS.roomNameInput).value || room.querySelector(SELECTORS.roomNameInput).placeholder;
                output += `=== ${roomName} ===\n`;
                const roomTotal = room.querySelector('[data-room-total]').textContent;
                output += `ยอดรวมห้อง: ${roomTotal} บาท\n\n`;

                room.querySelectorAll(SELECTORS.set).forEach((set, i) => {
                    const isSuspended = set.dataset.suspended === 'true';
                    const title = `จุดติดตั้งที่ ${i + 1}`;
                    if (isSuspended) {
                        output += ` - [ระงับ] ${title}\n\n`;
                        return;
                    }
                    const width = toNum(set.querySelector('[name="width_m"]').value);
                    const height = toNum(set.querySelector('[name="height_m"]').value);
                    const variant = set.querySelector('[name="fabric_variant"]').value;
                    const openType = set.querySelector('[name="open_type"]').value;
                    const pricePerM = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
                    const sheerPricePerM = toNum(set.querySelector('[name="sheer_price_per_m"]').value);
                    const style = room.querySelector(SELECTORS.roomStyle).value;
                    const total = toNum(set.querySelector('[data-set-total]').textContent);
                    const opaqueYardage = toNum(set.querySelector('[data-opaque-yardage]').textContent);
                    const sheerYardage = toNum(set.querySelector('[data-sheer-yardage]').textContent);
                    const opaqueTrack = toNum(set.querySelector('[data-opaque-track]').textContent);
                    const sheerTrack = toNum(set.querySelector('[data-sheer-track]').textContent);

                    output += ` - ${title}\n`;
                    output += `   ขนาด: กว้าง ${fmt(width, 2)} ม. x สูง ${fmt(height, 2)} ม.\n`;
                    output += `   ชนิด: ${variant} (${style})\n`;
                    output += `   ราคาผ้าทึบ: ${pricePerM} บ./ม.\n`;
                    if (variant.includes("โปร่ง")) output += `   ราคาผ้าโปร่ง: ${sheerPricePerM} บ./ม.\n`;
                    output += `   การเปิด: ${openType}\n`;
                    output += `   ใช้ผ้าทึบ: ${fmt(opaqueYardage, 2)} หลา\n`;
                    if (variant.includes("โปร่ง")) output += `   ใช้ผ้าโปร่ง: ${fmt(sheerYardage, 2)} หลา\n`;
                    output += `   ใช้รางทึบ: ${fmt(opaqueTrack, 2)} ม.\n`;
                    if (variant.includes("โปร่ง")) output += `   ใช้รางโปร่ง: ${fmt(sheerTrack, 2)} ม.\n`;
                    output += `   ราคาจุดนี้: ${fmt(total, 0, true)} บาท\n\n`;
                });

                room.querySelectorAll(SELECTORS.decoItem).forEach((deco, i) => {
                    const isSuspended = deco.dataset.suspended === 'true';
                    const title = `รายการตกแต่งที่ ${i + 1}`;
                    if (isSuspended) {
                        output += ` - [ระงับ] ${title}\n\n`;
                        return;
                    }
                    const type = deco.querySelector('[name="deco_type"]').value;
                    const width = toNum(deco.querySelector('[name="deco_width_m"]').value);
                    const height = toNum(deco.querySelector('[name="deco_height_m"]').value);
                    const pricePerSqyd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                    const total = toNum(deco.querySelector('[data-deco-total]').textContent);

                    output += ` - ${title}\n`;
                    if (type) output += `   ประเภท: ${type}\n`;
                    output += `   ขนาด: กว้าง ${fmt(width, 2)} ม. x สูง ${fmt(height, 2)} ม.\n`;
                    output += `   ราคาต่อ ตร.หลา: ${fmt(pricePerSqyd, 0, true)} บาท\n`;
                    output += `   ราคาจุดนี้: ${fmt(total, 0, true)} บาท\n\n`;
                });

                room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wp, i) => {
                    const isSuspended = wp.dataset.suspended === 'true';
                    const title = `รายการวอลเปเปอร์ที่ ${i + 1}`;
                    if (isSuspended) {
                        output += ` - [ระงับ] ${title}\n\n`;
                        return;
                    }
                    const height = toNum(wp.querySelector('[name="wallpaper_height_m"]').value);
                    const pricePerRoll = toNum(wp.querySelector('[name="wallpaper_price_roll"]').value);
                    const total = toNum(wp.querySelector('[data-wallpaper-total]').textContent);
                    const area = toNum(wp.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent);
                    const rolls = toNum(wp.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent);

                    output += ` - ${title}\n`;
                    output += `   ความสูงห้อง: ${fmt(height, 2)} ม.\n`;
                    output += `   ราคาต่อม้วน: ${fmt(pricePerRoll, 0, true)} บาท\n`;
                    output += `   พื้นที่: ${fmt(area, 2)} ตร.ม.\n`;
                    output += `   ใช้: ${fmt(rolls, 0)} ม้วน\n`;
                    output += `   ราคาจุดนี้: ${fmt(total, 0, true)} บาท\n\n`;
                });
            });
        }

        if (options.summary) {
            output += `=== สรุปยอดรวม ===\n`;
            output += `ผ้าม่าน (ผ้าทึบ): ${grandTotals.grandFabric} หลา\n`;
            output += `ผ้าม่าน (ผ้าโปร่ง): ${grandTotals.grandSheerFabric} หลา\n`;
            output += `รางทึบ: ${grandTotals.grandOpaqueTrack} ม.\n`;
            output += `รางโปร่ง: ${grandTotals.grandSheerTrack} ม.\n`;
            output += `วอลเปเปอร์: ${grandTotals.grandWallpaperRolls} ม้วน (${grandTotals.grandWallpaperSqm} ตร.ม.)\n`;
            output += `\n`;
            output += `ราคาทั้งหมด: ${grandTotals.grandTotal} บาท\n`;
        }

        copyToClipboard(output);
    }

    // --- Event Listeners ---
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-act]');
        if (!target) {
            const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
            if (!menuDropdown.contains(e.target) && !document.querySelector(SELECTORS.menuBtn).contains(e.target)) {
                menuDropdown.classList.remove('show');
            }
            return;
        }

        const action = target.dataset.act;
        const room = target.closest(SELECTORS.room);
        
        switch (action) {
            case 'add-set': addSet(room); break;
            case 'add-deco': addDeco(room); break;
            case 'add-wallpaper': addWallpaper(room); break;
            case 'del-room': delRoom(target); break;
            case 'del-set': delSet(target); break;
            case 'del-deco': delDeco(target); break;
            case 'del-wallpaper': delWallpaper(target); break;
            case 'clear-set': clearSet(target); break;
            case 'clear-deco': clearDeco(target); break;
            case 'clear-wallpaper': clearWallpaper(target); break;
            case 'toggle-suspend': toggleSuspend(target); break;
            case 'add-wall': addWall(target); break;
            case 'del-wall': delWall(target); break;
        }
    });

    document.addEventListener('change', debounce((e) => {
        if (e.target.closest(SELECTORS.set) && e.target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
        renumber(); recalcAll(); saveData(); updateLockState();
    }));

    document.addEventListener('input', debounce((e) => {
        if (e.target.matches('input[name="room_name"], input[name="wallpaper_height_m"], input[name="wallpaper_price_roll"], input[name="wall_width_m"], select[name="room_price_per_m"], select[name="room_style"]')) {
            updateLockState();
        }
        recalcAll(); saveData();
    }));

    document.addEventListener('keyup', debounce(() => { recalcAll(); saveData(); }));

    // Global Action Buttons
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', updateLockState);
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => copyToClipboard(JSON.stringify(buildPayload(), null, 2)));
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', generateCopyText);
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => document.querySelector(SELECTORS.menuDropdown).classList.toggle('show'));
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => document.querySelector(SELECTORS.importModal).classList.add('visible'));
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', exportData);
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => document.querySelector(SELECTORS.importModal).classList.remove('visible'));
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => importData(document.querySelector(SELECTORS.importJsonArea).value));

    // Tab Logic
    document.addEventListener('click', (e) => {
        if (e.target.matches('.tab-btn')) {
            const tabBtn = e.target;
            const tabList = tabBtn.closest('.tab-list');
            const tabs = tabList.querySelectorAll('.tab-btn');
            tabs.forEach(btn => btn.classList.remove('active'));
            tabBtn.classList.add('active');

            const tabContents = tabBtn.closest('.tabs').querySelectorAll('.tab-content');
            const targetTab = tabBtn.dataset.tabFor;
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.dataset.tabContent === targetTab) {
                    content.classList.add('active');
                }
            });
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