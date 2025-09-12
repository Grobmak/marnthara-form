(function() {
    'use strict';
    const APP_VERSION = "input-ui/4.0.0-m3-liquidglass-fixed-v2"; // Updated version
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";
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
        wallpaperRolls: (totalWidth, height) => {
            if (totalWidth <= 0 || height <= 0) return 0;
            const stripsPerRoll = Math.floor(10 / height);
            if (stripsPerRoll === 0) return Infinity;
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
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        roomMenuBtn: '.room-menu-btn', setMenuBtn: '.set-menu-btn', decoMenuBtn: '.deco-menu-btn', wallpaperMenuBtn: '.wallpaper-menu-btn',
        roomMenuDropdown: '.room-menu-dropdown', setMenuDropdown: '.set-menu-dropdown', decoMenuDropdown: '.deco-menu-dropdown', wallpaperMenuDropdown: '.wallpaper-menu-dropdown',
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
        const created = frag.querySelector(SELECTORS.set);
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
        
        setsWrap.appendChild(frag);
        toggleSetFabricUI(created); renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มจุดผ้าม่านแล้ว', 'success');
    }
    
    function addDeco(roomEl, prefill) {
        if (isLocked) return;
        const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
        const created = frag.querySelector(SELECTORS.decoItem);
        if (prefill) {
            created.querySelector('[name="deco_type"]').value = prefill.type || "";
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m ?? "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmt(prefill.price_sqyd, 0, true) ?? "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
            }
        }
        decoWrap.appendChild(frag);
        renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มรายการตกแต่งแล้ว', 'success');
    }
    
    function addWallpaper(roomEl, prefill) {
        if (isLocked) return;
        const wallpaperWrap = roomEl.querySelector(SELECTORS.wallpapersContainer);
        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        const created = frag.querySelector(SELECTORS.wallpaperItem);
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
        wallpaperWrap.appendChild(frag);
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
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ/โปร่ง";
        setEl.querySelector(SELECTORS.sheerWrap).classList.toggle('hidden', !hasSheer);
    }
    
    function delItem(el, name) {
        const room = el.closest(SELECTORS.room);
        const currentCount = room.querySelectorAll(`[data-${name}]`).length;
        if (currentCount > 1) {
            el.remove();
            renumber(); recalcAll(); saveData();
            showToast(`ลบรายการ ${name} แล้ว`, 'warning');
        } else {
            showToast(`ต้องมีอย่างน้อย 1 รายการ ${name}`, 'error');
        }
    }

    function delRoom(el) {
        if (roomsEl.querySelectorAll(SELECTORS.room).length > 1) {
            showConfirmation('ยืนยันการลบห้อง', 'คุณแน่ใจหรือไม่ว่าต้องการลบห้องนี้? การกระทำนี้ไม่สามารถย้อนกลับได้')
                .then(confirmed => {
                    if (confirmed) {
                        el.remove();
                        renumber(); recalcAll(); saveData();
                        showToast('ลบห้องแล้ว', 'warning');
                    }
                });
        } else {
            showToast('ต้องมีอย่างน้อย 1 ห้อง', 'error');
        }
    }

    function clearRoom(el) {
        showConfirmation('ยืนยันการล้างข้อมูลห้อง', 'คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมดในห้องนี้?')
            .then(confirmed => {
                if (confirmed) {
                    const roomEl = el.closest(SELECTORS.room);
                    roomEl.querySelector(SELECTORS.setsContainer).innerHTML = "";
                    roomEl.querySelector(SELECTORS.decorationsContainer).innerHTML = "";
                    roomEl.querySelector(SELECTORS.wallpapersContainer).innerHTML = "";
                    addSet(roomEl); // Add one default set back
                    recalcAll(); saveData();
                    showToast('ล้างข้อมูลห้องแล้ว', 'warning');
                }
            });
    }

    function clearAll() {
        showConfirmation('ยืนยันการล้างข้อมูลทั้งหมด', 'คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้')
            .then(confirmed => {
                if (confirmed) {
                    roomsEl.innerHTML = "";
                    addRoom();
                    document.querySelector('input[name="customer_name"]').value = "";
                    document.querySelector('input[name="customer_phone"]').value = "";
                    document.querySelector('input[name="customer_address"]').value = "";
                    recalcAll(); saveData();
                    showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
                }
            });
    }
    
    function toggleSuspend(el) {
        const item = el.closest('[data-suspendable]');
        const isSuspended = item.dataset.suspended === 'true';
        item.dataset.suspended = !isSuspended;
        item.classList.toggle('is-suspended', !isSuspended);
        recalcAll(); saveData();
        showToast(isSuspended ? 'ยกเลิกการพักงานแล้ว' : 'พักงานรายการแล้ว', 'info');
    }

    const renumber = () => {
        roomsEl.querySelectorAll(SELECTORS.room).forEach((room, i) => {
            room.dataset.index = i + 1;
            room.querySelector('summary > h3').textContent = `ห้องที่ ${i + 1}: ${room.querySelector(SELECTORS.roomNameInput).value || 'ยังไม่มีชื่อ'}`;
            room.querySelectorAll(SELECTORS.set).forEach((set, j) => {
                set.dataset.index = j + 1;
                set.querySelector('.set-title').textContent = `จุดที่ ${j + 1}`;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco, j) => {
                deco.dataset.index = j + 1;
                deco.querySelector('.deco-title').textContent = `รายการตกแต่งที่ ${j + 1}`;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wp, j) => {
                wp.dataset.index = j + 1;
                wp.querySelector('.wallpaper-title').textContent = `วอลเปเปอร์ที่ ${j + 1}`;
            });
        });
    };
    
    const recalcAll = debounce(() => {
        let grandTotal = 0;
        let setCount = 0;
        let setCountSets = 0;
        let setCountDeco = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        
        roomsEl.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomTotal = recalcRoom(room);
            grandTotal += roomTotal.total;
            setCount += roomTotal.count;
            setCountSets += roomTotal.setCount;
            setCountDeco += roomTotal.decoCount + roomTotal.wallpaperCount;
            grandFabric += roomTotal.totalFabric;
            grandSheerFabric += roomTotal.totalSheerFabric;
            grandOpaqueTrack += roomTotal.totalOpaqueTrack;
            grandSheerTrack += roomTotal.totalSheerTrack;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = fmt(setCount, 0, false);
        document.querySelector(SELECTORS.setCountSets).textContent = fmt(setCountSets, 0, false);
        document.querySelector(SELECTORS.setCountDeco).textContent = fmt(setCountDeco, 0, false);
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandFabric, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerFabric, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
        
        saveData();
    });

    function recalcRoom(roomEl) {
        let roomTotal = 0;
        let setCount = 0;
        let setCountSets = 0;
        let setCountDeco = 0;
        let totalFabric = 0;
        let totalSheerFabric = 0;
        let totalOpaqueTrack = 0;
        let totalSheerTrack = 0;
        
        const roomPricePerM = clamp01(roomEl.querySelector(SELECTORS.roomPricePerM).value);
        const roomStyle = roomEl.querySelector(SELECTORS.roomStyle).value;
        const isRoomSuspended = roomEl.dataset.suspended === 'true';

        roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
            if (setEl.dataset.suspended === 'true' || isRoomSuspended) return;
            const setResult = recalcSet(setEl, roomPricePerM, roomStyle);
            roomTotal += setResult.total;
            setCountSets++;
            totalFabric += setResult.fabricYardage;
            totalSheerFabric += setResult.sheerYardage;
            totalOpaqueTrack += setResult.opaqueTrack;
            totalSheerTrack += setResult.sheerTrack;
        });

        roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
            if (decoEl.dataset.suspended === 'true' || isRoomSuspended) return;
            const decoResult = recalcDeco(decoEl);
            roomTotal += decoResult.total;
            setCountDeco++;
        });
        
        roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
            if (wallpaperEl.dataset.suspended === 'true' || isRoomSuspended) return;
            const wallpaperResult = recalcWallpaper(wallpaperEl);
            roomTotal += wallpaperResult.total;
            setCountDeco++;
        });

        roomEl.querySelector('[data-room-total] .price').textContent = fmt(roomTotal, 0, true);
        roomEl.querySelector('[data-room-fabric] .price').textContent = fmt(totalFabric, 2) + " หลา";
        roomEl.querySelector('[data-room-sheer-fabric] .price').textContent = fmt(totalSheerFabric, 2) + " หลา";

        return {
            total: roomTotal,
            count: setCount,
            setCount: setCountSets,
            decoCount: setCountDeco,
            wallpaperCount: roomEl.querySelectorAll(SELECTORS.wallpaperItem).length,
            totalFabric: totalFabric,
            totalSheerFabric: totalSheerFabric,
            totalOpaqueTrack: totalOpaqueTrack,
            totalSheerTrack: totalSheerTrack,
        };
    }
    
    function recalcSet(setEl, roomPricePerM, roomStyle) {
        const width = clamp01(setEl.querySelector('[name="width_m"]').value);
        const height = clamp01(setEl.querySelector('[name="height_m"]').value);
        const fabricVariant = setEl.querySelector('[name="fabric_variant"]').value;
        const sheerPricePerM = clamp01(setEl.querySelector('[name="sheer_price_per_m"]').value);
        
        const styleSurcharge = stylePlus(roomStyle);
        const heightSurcharge = heightPlus(height);
        
        const fabricYardage = (fabricVariant === "ทึบ" || fabricVariant === "ทึบ/โปร่ง") ? CALC.fabricYardage(roomStyle, width) : 0;
        const sheerYardage = (fabricVariant === "โปร่ง" || fabricVariant === "ทึบ/โปร่ง") ? CALC.fabricYardage(roomStyle, width) : 0;
        
        const opaqueTrack = (fabricVariant === "ทึบ" || fabricVariant === "ทึบ/โปร่ง") ? width : 0;
        const sheerTrack = (fabricVariant === "โปร่ง" || fabricVariant === "ทึบ/โปร่ง") ? width : 0;

        // Calculate prices
        const opaquePrice = opaqueTrack > 0 ? (opaqueTrack * roomPricePerM) + (opaqueTrack * heightSurcharge) + styleSurcharge : 0;
        const sheerPrice = sheerTrack > 0 ? (sheerTrack * sheerPricePerM) + (sheerTrack * heightSurcharge) : 0;
        const total = opaquePrice + sheerPrice;

        setEl.querySelector('[data-set-total] .price').textContent = fmt(total, 0, true);
        setEl.querySelector('[data-set-opaque-yardage]').textContent = fmt(fabricYardage, 2);
        setEl.querySelector('[data-set-sheer-yardage]').textContent = fmt(sheerYardage, 2);
        setEl.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
        setEl.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);

        return {
            total: total,
            fabricYardage: fabricYardage,
            sheerYardage: sheerYardage,
            opaqueTrack: opaqueTrack,
            sheerTrack: sheerTrack,
        };
    }

    function recalcDeco(decoEl) {
        const width = clamp01(decoEl.querySelector('[name="deco_width_m"]').value);
        const height = clamp01(decoEl.querySelector('[name="deco_height_m"]').value);
        const price = clamp01(decoEl.querySelector('[name="deco_price_sqyd"]').value);

        const total = (width * height * SQM_TO_SQYD) * price;

        decoEl.querySelector('[data-deco-total] .price').textContent = fmt(total, 0, true);
        decoEl.querySelector('[data-deco-area]').textContent = fmt(width * height, 2);
        
        return { total: total };
    }

    function recalcWallpaper(wallpaperEl) {
        const height = clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value);
        const pricePerRoll = clamp01(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value);
        
        let totalWidth = 0;
        wallpaperEl.querySelectorAll('[name="wall_width_m"]').forEach(input => {
            totalWidth += clamp01(input.value);
        });

        const rolls = CALC.wallpaperRolls(totalWidth, height);
        const totalArea = totalWidth * height;
        const total = rolls * pricePerRoll;

        wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-child(1)').textContent = fmt(total, 0, true);
        wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-child(2)').textContent = fmt(totalArea, 2);
        wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-child(3)').textContent = fmt(rolls, 0);

        return { total: total };
    }

    function delWall(btn) {
        const wallRow = btn.closest('.wall-input-row');
        const wallsContainer = wallRow.parentElement;
        if (wallsContainer.children.length > 1) {
            wallRow.remove();
            recalcAll(); saveData();
        } else {
            showToast('ต้องมีอย่างน้อย 1 ผนัง', 'error');
        }
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function loadData() {
        try {
            const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!data) { addRoom(); return; }

            document.querySelector('input[name="customer_name"]').value = data.customer_name || "";
            document.querySelector('input[name="customer_phone"]').value = data.customer_phone || "";
            document.querySelector('input[name="customer_address"]').value = data.customer_address || "";
            roomsEl.innerHTML = "";
            (data.rooms || []).forEach(r => addRoom(r));

            const hasRooms = roomsEl.querySelectorAll(SELECTORS.room).length > 0;
            if (!hasRooms) addRoom();
            
            recalcAll();
        } catch (e) {
            console.error("Failed to load data from localStorage", e);
            addRoom();
        }
    }

    function buildPayload() {
        const rooms = [];
        let totalOpaqueTrack = 0;
        let totalSheerTrack = 0;

        roomsEl.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const sets = [];
            const decorations = [];
            const wallpapers = [];
            const isSuspended = roomEl.dataset.suspended === 'true';

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const width = clamp01(setEl.querySelector('[name="width_m"]').value);
                const isSetSuspended = setEl.dataset.suspended === 'true';
                if (!isSetSuspended && !isSuspended) {
                    totalOpaqueTrack += setEl.querySelector('[name="fabric_variant"]').value !== "โปร่ง" ? width : 0;
                    totalSheerTrack += setEl.querySelector('[name="fabric_variant"]').value !== "ทึบ" ? width : 0;
                }
                
                sets.push({
                    width_m: width,
                    height_m: clamp01(setEl.querySelector('[name="height_m"]').value),
                    fabric_variant: setEl.querySelector('[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('[name="open_type"]').value,
                    sheer_price_per_m: clamp01(setEl.querySelector('[name="sheer_price_per_m"]').value),
                    is_suspended: isSetSuspended,
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: clamp01(decoEl.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(decoEl.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: clamp01(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: decoEl.dataset.suspended === 'true',
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const widths = [];
                wallpaperEl.querySelectorAll('[name="wall_width_m"]').forEach(input => widths.push(clamp01(input.value)));
                wallpapers.push({
                    height_m: clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: clamp01(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths,
                    is_suspended: wallpaperEl.dataset.suspended === 'true',
                });
            });

            rooms.push({
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: clamp01(roomEl.querySelector(SELECTORS.roomPricePerM).value),
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                is_suspended: isSuspended,
                sets: sets,
                decorations: decorations,
                wallpapers: wallpapers,
            });
        });
        
        return {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: rooms,
            version: APP_VERSION,
            grand_total: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            grand_fabric: toNum(document.querySelector(SELECTORS.grandFabric).textContent),
            grand_sheer_fabric: toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent),
            grand_opaque_track: totalOpaqueTrack,
            grand_sheer_track: totalSheerTrack,
        };
    }

    function copyJson() {
        const payload = buildPayload();
        const jsonString = JSON.stringify(payload, null, 2);
        navigator.clipboard.writeText(jsonString)
            .then(() => showToast('คัดลอก JSON แล้ว', 'success'))
            .catch(err => showToast('ไม่สามารถคัดลอกได้', 'error'));
    }

    async function copyText() {
        try {
            const options = await showCopyOptionsModal();
            if (!options) return;

            let textToCopy = "";
            const payload = buildPayload();
            const grandTotal = fmt(payload.grand_total, 0, true);

            if (options.customer) {
                textToCopy += "==== ข้อมูลลูกค้า ====\n";
                textToCopy += `ชื่อ: ${payload.customer_name}\n`;
                textToCopy += `โทร: ${payload.customer_phone}\n`;
                if (payload.customer_address) {
                    textToCopy += `รายละเอียด: ${payload.customer_address}\n`;
                }
                textToCopy += "\n";
            }

            if (options.details) {
                textToCopy += "==== รายละเอียดงาน ====\n";
                payload.rooms.forEach((room, i) => {
                    const roomStatus = room.is_suspended ? " (พักงาน)" : "";
                    textToCopy += `ห้องที่ ${i+1}: ${room.room_name || 'ยังไม่มีชื่อ'}${roomStatus}\n`;
                    if (room.is_suspended) return;
                    
                    if (room.sets.length > 0) {
                        textToCopy += "  **ผ้าม่าน**\n";
                        room.sets.forEach((set, j) => {
                            const setStatus = set.is_suspended ? " (พักงาน)" : "";
                            textToCopy += `  - จุดที่ ${j+1}${setStatus}\n`;
                            if (set.is_suspended) return;

                            textToCopy += `    กว้าง ${set.width_m} ม. สูง ${set.height_m} ม.\n`;
                            textToCopy += `    รูปแบบ: ${room.style}\n`;
                            textToCopy += `    ชนิดผ้า: ${set.fabric_variant}\n`;
                            if (set.sheer_price_per_m) textToCopy += `    ราคาผ้าโปร่ง: ${fmt(set.sheer_price_per_m, 0, true)} บ.\n`;
                            textToCopy += `    ราคาต่อเมตร: ${fmt(room.price_per_m_raw, 0, true)} บ. (สไตล์: ${room.style})\n`;
                            textToCopy += `    ยอดรวม: ${fmt(recalcSet(roomsEl.querySelector(`[data-room][data-index='${i+1}']`).querySelector(`[data-set][data-index='${j+1}']`), room.price_per_m_raw, room.style).total, 0, true)} บ.\n`;
                        });
                    }

                    if (room.decorations.length > 0) {
                        textToCopy += "  **งานตกแต่ง**\n";
                        room.decorations.forEach((deco, j) => {
                            const decoStatus = deco.is_suspended ? " (พักงาน)" : "";
                            textToCopy += `  - รายการที่ ${j+1} (${deco.type})${decoStatus}\n`;
                            if (deco.is_suspended) return;
                            textToCopy += `    กว้าง ${deco.width_m} ม. สูง ${deco.height_m} ม. ราคา ${fmt(deco.price_sqyd, 0, true)} บ./หลา\n`;
                            textToCopy += `    ยอดรวม: ${fmt(recalcDeco(roomsEl.querySelector(`[data-room][data-index='${i+1}']`).querySelector(`[data-deco-item][data-index='${j+1}']`)).total, 0, true)} บ.\n`;
                        });
                    }
                    
                    if (room.wallpapers.length > 0) {
                        textToCopy += "  **วอลเปเปอร์**\n";
                        room.wallpapers.forEach((wp, j) => {
                            const wpStatus = wp.is_suspended ? " (พักงาน)" : "";
                            textToCopy += `  - รายการที่ ${j+1}${wpStatus}\n`;
                            if (wp.is_suspended) return;
                            textToCopy += `    ความสูง: ${wp.height_m} ม.\n`;
                            textToCopy += `    ความกว้าง: ${wp.widths.join(' ม., ')} ม.\n`;
                            textToCopy += `    ราคาต่อม้วน: ${fmt(wp.price_per_roll, 0, true)} บ.\n`;
                            textToCopy += `    ยอดรวม: ${fmt(recalcWallpaper(roomsEl.querySelector(`[data-room][data-index='${i+1}']`).querySelector(`[data-wallpaper-item][data-index='${j+1}']`)).total, 0, true)} บ.\n`;
                        });
                    }
                    textToCopy += "\n";
                });
            }

            if (options.summary) {
                textToCopy += "==== สรุปวัสดุ ====\n";
                textToCopy += `ผ้าทึบที่ใช้: ${fmt(payload.grand_fabric, 2)} หลา\n`;
                textToCopy += `ผ้าโปร่งที่ใช้: ${fmt(payload.grand_sheer_fabric, 2)} หลา\n`;
                textToCopy += `รางทึบที่ใช้: ${fmt(payload.grand_opaque_track, 2)} ม.\n`;
                textToCopy += `รางโปร่งที่ใช้: ${fmt(payload.grand_sheer_track, 2)} ม.\n`;
                textToCopy += "\n";
                textToCopy += `==== ยอดรวม ====\n`;
                textToCopy += `ราคารวม: ${grandTotal} บ.\n`;
                textToCopy += `จำนวนจุด: ${payload.setCount}\n`;
                textToCopy += `ผ้าม่าน(ชุด): ${payload.setCountSets}\n`;
                textToCopy += `ตกแต่งเพิ่ม(ชุด): ${payload.setCountDeco}\n`;
            }

            navigator.clipboard.writeText(textToCopy.trim())
                .then(() => showToast('คัดลอกข้อมูลเรียบร้อยแล้ว', 'success'))
                .catch(err => showToast('ไม่สามารถคัดลอกได้', 'error'));

        } catch (e) {
            console.error("Error copying text", e);
            showToast('เกิดข้อผิดพลาดในการคัดลอก', 'error');
        }
    }

    function exportJson() {
        const payload = buildPayload();
        const jsonString = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Marnthara-Export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('ส่งออกข้อมูลแล้ว', 'success');
    }

    function importJson() {
        const modal = document.querySelector(SELECTORS.importModal);
        const textarea = modal.querySelector(SELECTORS.importJsonArea);
        textarea.value = "";
        modal.classList.add('visible');
        
        const confirmBtn = modal.querySelector(SELECTORS.importConfirm);
        const cancelBtn = modal.querySelector(SELECTORS.importCancel);
        
        const cleanup = (result) => {
            modal.classList.remove('visible');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            if (result) {
                try {
                    const data = JSON.parse(textarea.value);
                    roomsEl.innerHTML = "";
                    (data.rooms || []).forEach(r => addRoom(r));
                    
                    document.querySelector('input[name="customer_name"]').value = data.customer_name || "";
                    document.querySelector('input[name="customer_phone"]').value = data.customer_phone || "";
                    document.querySelector('input[name="customer_address"]').value = data.customer_address || "";

                    const hasRooms = roomsEl.querySelectorAll(SELECTORS.room).length > 0;
                    if (!hasRooms) addRoom();
                    
                    recalcAll();
                    showToast('นำเข้าข้อมูลสำเร็จ', 'success');
                } catch (e) {
                    showToast('รูปแบบข้อมูล JSON ไม่ถูกต้อง', 'error');
                    console.error("Import error:", e);
                }
            }
        };

        confirmBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);
    }
    
    function toggleLock() {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ล็อคข้อมูลแล้ว' : 'ปลดล็อคข้อมูลแล้ว', isLocked ? 'warning' : 'success');
    }
    
    function updateLockState() {
        document.body.classList.toggle('is-locked', isLocked);
        const lockIcon = document.querySelector(SELECTORS.lockBtn).querySelector('.lock-icon');
        const lockText = document.querySelector(SELECTORS.lockBtn).querySelector('.lock-text');
        lockIcon.textContent = isLocked ? 'lock' : 'lock_open';
        lockText.textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadData();
    });

    // Event listener delegation for room actions
    roomsEl.addEventListener('input', (e) => {
        if (isLocked) { e.preventDefault(); return; }
        recalcAll();
        if (e.target.name === 'room_name') {
            renumber();
        }
    });
    
    roomsEl.addEventListener('click', (e) => {
        const target = e.target.closest('[data-act]');
        if (!target) return;
        const action = target.dataset.act;

        const actions = {
            'add-set': () => addSet(e.target.closest(SELECTORS.room)),
            'add-deco': () => addDeco(e.target.closest(SELECTORS.room)),
            'add-wallpaper': () => addWallpaper(e.target.closest(SELECTORS.room)),
            'toggle-room-suspend': () => toggleSuspend(e.target.closest(SELECTORS.room)),
            'clear-room': () => clearRoom(e.target.closest(SELECTORS.room)),
            'del-room': () => delRoom(e.target.closest(SELECTORS.room)),
            'toggle-set-suspend': () => toggleSuspend(e.target.closest(SELECTORS.set)),
            'del-set': () => delItem(e.target.closest(SELECTORS.set), 'set'),
            'toggle-deco-suspend': () => toggleSuspend(e.target.closest(SELECTORS.decoItem)),
            'del-deco': () => delItem(e.target.closest(SELECTORS.decoItem), 'deco-item'),
            'toggle-wallpaper-suspend': () => toggleSuspend(e.target.closest(SELECTORS.wallpaperItem)),
            'del-wallpaper': () => delItem(e.target.closest(SELECTORS.wallpaperItem), 'wallpaper-item'),
            'del-wall': () => delWall(target),
        };

        if (actions[action]) {
            actions[action]();
        }
    });

    roomsEl.addEventListener('change', (e) => {
        if (e.target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
        recalcAll();
    });

    document.addEventListener('click', (e) => {
        // Close all other open dropdowns
        document.querySelectorAll('.menu-dropdown.show').forEach(dropdown => {
            const container = dropdown.closest('.menu-container');
            if (container && !container.contains(e.target)) {
                 dropdown.classList.remove('show');
            } else if (!container && e.target.id !== 'menuBtn' && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
        
        // Handle clicks on any menu button
        const menuBtn = e.target.closest('.room-menu-btn, .set-menu-btn, .deco-menu-btn, .wallpaper-menu-btn');
        const mainMenuBtn = e.target.closest('#menuBtn');

        if (menuBtn) {
            e.preventDefault();
            const dropdown = menuBtn.closest('.menu-container').querySelector('.menu-dropdown');
            dropdown.classList.toggle('show');
        } else if (mainMenuBtn) {
            e.preventDefault();
            const dropdown = document.querySelector(SELECTORS.menuDropdown);
            dropdown.classList.toggle('show');
        }
    });

    orderForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        showToast('กำลังส่งข้อมูล...', 'info');
        // The form will submit to the webhook URL
        orderForm.submit();
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', () => clearAll());
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => toggleLock());
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => copyJson());
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', () => copyText());
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => importJson());
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => exportJson());

})();