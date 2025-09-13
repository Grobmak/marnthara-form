(function() {
    'use strict';
    const APP_VERSION = "input-ui/4.1.0-corrected";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";
    const SQM_TO_SQYD = 1.19599;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };
    const CALC = {
        fabricYardage: (style, width) => {
            if (width <= 0) return 0;
            // This is a custom formula, likely a shortcut.
            // (width * fullness_multiplier + hem_allowance) / fabric_width_assumption
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
        summaryBtn: '#summaryBtn', summaryPopup: '#summaryPopup', closeSummaryPopup: '#closeSummaryPopup'
    };

    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    if(orderForm) orderForm.action = WEBHOOK_URL;
    
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
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
            }
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }
        
        const hasItems = created.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length > 0;
        if (!hasItems) addSet(created);

        renumber(); recalcAll(); saveData();
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
        toggleSetFabricUI(created); renumber(); recalcAll(); saveData();
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
        renumber(); recalcAll(); saveData();
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
            if (prefill.widths && prefill.widths.length > 0) {
                prefill.widths.forEach(w => addWall(created, w));
            } else {
                 addWall(created);
            }
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
            }
        } else {
            addWall(created);
        }
        wallpaperWrap.appendChild(frag);
        renumber(); recalcAll(); saveData();
        if (!prefill) showToast('เพิ่มรายการวอลเปเปอร์แล้ว', 'success');
    }
    
    function addWall(wallpaperItem, prefillWidth) {
        if (isLocked) return;
        const wallsContainer = wallpaperItem.querySelector(SELECTORS.wallsContainer);
        const frag = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
        if (prefillWidth) {
            frag.querySelector('input[name="wall_width_m"]').value = prefillWidth;
        }
        wallsContainer.appendChild(frag);
    }
    
    function toggleSetFabricUI(setEl) {
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทั้งสอง";
        setEl.querySelector(SELECTORS.sheerWrap).style.display = hasSheer ? 'block' : 'none';
    }
    
    function delItem(el, name) {
        const room = el.closest(SELECTORS.room);
        const currentCount = room.querySelectorAll(`[data-${name}]`).length;
        if (currentCount > 1) {
            el.remove();
            renumber(); recalcAll(); saveData();
            showToast(`ลบรายการแล้ว`, 'warning');
        } else {
            showToast(`ต้องมีอย่างน้อย 1 รายการ`, 'error');
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
                    roomCount = 0;
                    document.querySelector('input[name="customer_name"]').value = "";
                    document.querySelector('input[name="customer_phone"]').value = "";
                    document.querySelector('input[name="customer_address"]').value = "";
                    addRoom();
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
        showToast(!isSuspended ? 'ระงับการคำนวณรายการนี้' : 'ยกเลิกการระงับ', 'info');
    }

    const renumber = () => {
        document.querySelectorAll(SELECTORS.room).forEach((room, i) => {
            room.dataset.index = i + 1;
            room.querySelector('.room-name-display').textContent = room.querySelector(SELECTORS.roomNameInput).value || 'ยังไม่ได้ตั้งชื่อ';
            room.querySelector('[data-room-number]').textContent = i + 1;

            room.querySelectorAll(SELECTORS.set).forEach((set, j) => {
                set.dataset.index = j + 1;
                set.querySelector('[data-set-number]').textContent = j + 1;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco, j) => {
                deco.dataset.index = j + 1;
                deco.querySelector('[data-deco-number]').textContent = j + 1;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wp, j) => {
                wp.dataset.index = j + 1;
                wp.querySelector('[data-wallpaper-number]').textContent = j + 1;
            });
        });
    };
    
    const recalcAll = debounce(() => {
        let grandTotal = 0;
        let totalItems = 0;
        let totalSets = 0;
        let totalDecos = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomResult = recalcRoom(room);
            grandTotal += roomResult.total;
            totalSets += roomResult.setCount;
            totalDecos += roomResult.decoCount + roomResult.wallpaperCount;
            grandFabric += roomResult.totalFabric;
            grandSheerFabric += roomResult.totalSheerFabric;
            grandOpaqueTrack += roomResult.totalOpaqueTrack;
            grandSheerTrack += roomResult.totalSheerTrack;
        });
        
        totalItems = totalSets + totalDecos;

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = fmt(totalItems, 0);
        document.querySelector(SELECTORS.setCountSets).textContent = fmt(totalSets, 0);
        document.querySelector(SELECTORS.setCountDeco).textContent = fmt(totalDecos, 0);
        
        // Update summary popup
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandFabric, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerFabric, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
        
        saveData();
    });

    function recalcRoom(roomEl) {
        let roomTotal = 0;
        let setCount = 0;
        let decoCount = 0;
        let wallpaperCount = 0;
        let totalFabric = 0;
        let totalSheerFabric = 0;
        let totalOpaqueTrack = 0;
        let totalSheerTrack = 0;
        
        const roomPricePerM = clamp01(roomEl.querySelector(SELECTORS.roomPricePerM).value);
        const roomStyle = roomEl.querySelector(SELECTORS.roomStyle).value;
        const isRoomSuspended = roomEl.dataset.suspended === 'true';

        roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
            const isSetSuspended = setEl.dataset.suspended === 'true';
            const setResult = recalcSet(setEl, roomPricePerM, roomStyle);
            if (!isRoomSuspended && !isSetSuspended) {
                roomTotal += setResult.total;
                setCount++;
                totalFabric += setResult.fabricYardage;
                totalSheerFabric += setResult.sheerYardage;
                totalOpaqueTrack += setResult.opaqueTrack;
                totalSheerTrack += setResult.sheerTrack;
            }
        });

        roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
            const isDecoSuspended = decoEl.dataset.suspended === 'true';
            const decoResult = recalcDeco(decoEl);
            if (!isRoomSuspended && !isDecoSuspended) {
                roomTotal += decoResult.total;
                decoCount++;
            }
        });
        
        roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
            const isWallpaperSuspended = wallpaperEl.dataset.suspended === 'true';
            const wallpaperResult = recalcWallpaper(wallpaperEl);
            if (!isRoomSuspended && !isWallpaperSuspended) {
                roomTotal += wallpaperResult.total;
                wallpaperCount++;
            }
        });

        roomEl.querySelector('[data-room-total]').textContent = fmt(roomTotal, 0, true);
        roomEl.querySelector('[data-room-fabric] span.price').textContent = fmt(totalFabric, 2);
        roomEl.querySelector('[data-room-sheer-fabric] span.price').textContent = fmt(totalSheerFabric, 2);

        return {
            total: roomTotal,
            setCount,
            decoCount,
            wallpaperCount,
            totalFabric,
            totalSheerFabric,
            totalOpaqueTrack,
            totalSheerTrack,
        };
    }
    
    function recalcSet(setEl, roomPricePerM, roomStyle) {
        const width = clamp01(setEl.querySelector('[name="width_m"]').value);
        const height = clamp01(setEl.querySelector('[name="height_m"]').value);
        const fabricVariant = setEl.querySelector('[name="fabric_variant"]').value;
        const sheerPricePerM = clamp01(setEl.querySelector('[name="sheer_price_per_m"]').value);
        
        const styleSurcharge = stylePlus(roomStyle);
        const heightSurcharge = heightPlus(height);
        
        const hasOpaque = fabricVariant === "ทึบ" || fabricVariant === "ทั้งสอง";
        const hasSheer = fabricVariant === "โปร่ง" || fabricVariant === "ทั้งสอง";

        const fabricYardage = hasOpaque ? CALC.fabricYardage(roomStyle, width) : 0;
        const sheerYardage = hasSheer ? CALC.fabricYardage(roomStyle, width) : 0;
        
        const opaqueTrack = hasOpaque ? width : 0;
        const sheerTrack = hasSheer ? width : 0;

        const opaquePrice = opaqueTrack > 0 ? (opaqueTrack * roomPricePerM) + (opaqueTrack * heightSurcharge) + styleSurcharge : 0;
        const sheerPrice = sheerTrack > 0 ? (sheerTrack * sheerPricePerM) + (sheerTrack * heightSurcharge) : 0;
        const total = opaquePrice + sheerPrice;

        setEl.querySelector('[data-set-total]').textContent = fmt(total, 0, true);
        setEl.querySelector('[data-set-opaque-yardage]').textContent = fmt(fabricYardage, 2);
        setEl.querySelector('[data-set-sheer-yardage]').textContent = fmt(sheerYardage, 2);
        setEl.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
        setEl.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);

        return { total, fabricYardage, sheerYardage, opaqueTrack, sheerTrack };
    }

    function recalcDeco(decoEl) {
        const width = clamp01(decoEl.querySelector('[name="deco_width_m"]').value);
        const height = clamp01(decoEl.querySelector('[name="deco_height_m"]').value);
        const price = clamp01(decoEl.querySelector('[name="deco_price_sqyd"]').value);
        const areaM2 = width * height;
        const areaYd2 = areaM2 * SQM_TO_SQYD;
        const total = areaYd2 * price;

        decoEl.querySelector('[data-deco-total]').textContent = fmt(total, 0, true);
        decoEl.querySelector('[data-deco-area]').textContent = fmt(areaM2, 2);
        
        return { total };
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
        const total = isFinite(rolls) ? rolls * pricePerRoll : 0;

        const summaryEl = wallpaperEl.querySelector('[data-wallpaper-summary]');
        summaryEl.querySelector('.price:nth-of-type(1)').textContent = fmt(total, 0, true);
        summaryEl.querySelector('.price:nth-of-type(2)').textContent = fmt(totalArea, 2);
        summaryEl.querySelector('.price:nth-of-type(3)').textContent = isFinite(rolls) ? fmt(rolls, 0) : 'N/A';

        return { total };
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
        if (typeof(Storage) !== "undefined") {
            const payload = buildPayload(false); // Don't need full recalc for saving
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        }
    }
    
    function loadData() {
        try {
            const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!data || !data.rooms || data.rooms.length === 0) {
                addRoom();
                return;
            }

            document.querySelector('input[name="customer_name"]').value = data.customer_name || "";
            document.querySelector('input[name="customer_phone"]').value = data.customer_phone || "";
            document.querySelector('input[name="customer_address"]').value = data.customer_address || "";
            roomsEl.innerHTML = "";
            roomCount = 0;
            data.rooms.forEach(r => addRoom(r));
            
            recalcAll();
        } catch (e) {
            console.error("Failed to load data from localStorage", e);
            addRoom();
        }
    }

    function buildPayload(forSubmission = true) {
        const rooms = [];
        let grandTotal = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const sets = [];
            const decorations = [];
            const wallpapers = [];
            const roomPricePerM = clamp01(roomEl.querySelector(SELECTORS.roomPricePerM).value);
            const roomStyle = roomEl.querySelector(SELECTORS.roomStyle).value;
            const isRoomSuspended = roomEl.dataset.suspended === 'true';

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const { total, fabricYardage, sheerYardage, opaqueTrack, sheerTrack } = recalcSet(setEl, roomPricePerM, roomStyle);
                const isSetSuspended = setEl.dataset.suspended === 'true';
                if (!isRoomSuspended && !isSetSuspended) {
                    grandTotal += total;
                    grandFabric += fabricYardage;
                    grandSheerFabric += sheerYardage;
                    grandOpaqueTrack += opaqueTrack;
                    grandSheerTrack += sheerTrack;
                }
                sets.push({
                    width_m: clamp01(setEl.querySelector('[name="width_m"]').value),
                    height_m: clamp01(setEl.querySelector('[name="height_m"]').value),
                    fabric_variant: setEl.querySelector('[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('[name="open_type"]').value,
                    sheer_price_per_m: clamp01(setEl.querySelector('[name="sheer_price_per_m"]').value),
                    is_suspended: isSetSuspended,
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                 const { total } = recalcDeco(decoEl);
                 const isDecoSuspended = decoEl.dataset.suspended === 'true';
                 if (!isRoomSuspended && !isDecoSuspended) grandTotal += total;
                decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: clamp01(decoEl.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(decoEl.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: clamp01(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: isDecoSuspended,
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const { total } = recalcWallpaper(wallpaperEl);
                const isWpSuspended = wallpaperEl.dataset.suspended === 'true';
                if (!isRoomSuspended && !isWpSuspended) grandTotal += total;
                const widths = Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(input => clamp01(input.value));
                wallpapers.push({
                    height_m: clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: clamp01(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths,
                    is_suspended: isWpSuspended,
                });
            });

            rooms.push({
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: roomPricePerM,
                style: roomStyle,
                is_suspended: isRoomSuspended,
                sets, decorations, wallpapers,
            });
        });
        
        const payload = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: rooms,
            version: APP_VERSION,
        };

        if (forSubmission) {
            payload.grand_total = grandTotal;
            payload.grand_fabric = grandFabric;
            payload.grand_sheer_fabric = grandSheerFabric;
            payload.grand_opaque_track = grandOpaqueTrack;
            payload.grand_sheer_track = grandSheerTrack;
        }

        return payload;
    }

    function copyJson() {
        const payload = buildPayload(true);
        const jsonString = JSON.stringify(payload, null, 2);
        navigator.clipboard.writeText(jsonString)
            .then(() => showToast('คัดลอก JSON แล้ว', 'success'))
            .catch(err => showToast('ไม่สามารถคัดลอกได้', 'error'));
    }

    async function copyText() {
        const options = await showCopyOptionsModal();
        if (!options) return;

        let textToCopy = "";
        const payload = buildPayload(true);

        if (options.customer) {
            textToCopy += "==== ข้อมูลลูกค้า ====\n";
            textToCopy += `ชื่อ: ${payload.customer_name || "-"}\n`;
            textToCopy += `โทร: ${payload.customer_phone || "-"}\n`;
            if (payload.customer_address) textToCopy += `รายละเอียด: ${payload.customer_address}\n`;
            textToCopy += "\n";
        }

        if (options.details) {
            textToCopy += "==== รายละเอียดงาน ====\n";
            payload.rooms.forEach((room, i) => {
                const roomStatus = room.is_suspended ? " (ระงับชั่วคราว)" : "";
                textToCopy += `ห้องที่ ${i + 1}: ${room.room_name || 'ยังไม่ได้ตั้งชื่อ'}${roomStatus}\n`;
                if (room.is_suspended) { textToCopy += "\n"; return; }

                if (room.sets && room.sets.length > 0) {
                    textToCopy += "  **ผ้าม่าน**\n";
                    room.sets.forEach((set, j) => {
                        const setStatus = set.is_suspended ? " (ระงับ)" : "";
                        textToCopy += `  - จุดที่ ${j+1}: กว้าง ${set.width_m} x สูง ${set.height_m} ม. ${setStatus}\n`;
                    });
                }
                if (room.decorations && room.decorations.length > 0) {
                    textToCopy += "  **งานตกแต่ง**\n";
                    room.decorations.forEach((deco, j) => {
                        const decoStatus = deco.is_suspended ? " (ระงับ)" : "";
                        textToCopy += `  - ${deco.type}: กว้าง ${deco.width_m} x สูง ${deco.height_m} ม. ${decoStatus}\n`;
                    });
                }
                if (room.wallpapers && room.wallpapers.length > 0) {
                    textToCopy += "  **วอลเปเปอร์**\n";
                    room.wallpapers.forEach((wp, j) => {
                        const wpStatus = wp.is_suspended ? " (ระงับ)" : "";
                        textToCopy += `  - ผนังสูง ${wp.height_m} ม. (กว้างรวม ${wp.widths.reduce((a, b) => a + b, 0).toFixed(2)} ม.) ${wpStatus}\n`;
                    });
                }
                textToCopy += "\n";
            });
        }

        if (options.summary) {
            textToCopy += "==== สรุป ====\n";
            textToCopy += `ผ้าทึบ: ${fmt(payload.grand_fabric, 2)} หลา\n`;
            textToCopy += `ผ้าโปร่ง: ${fmt(payload.grand_sheer_fabric, 2)} หลา\n`;
            textToCopy += `รางทึบ: ${fmt(payload.grand_opaque_track, 2)} ม.\n`;
            textToCopy += `รางโปร่ง: ${fmt(payload.grand_sheer_track, 2)} ม.\n\n`;
            textToCopy += `ยอดรวมทั้งหมด: ${fmt(payload.grand_total, 0, true)} บาท\n`;
        }

        navigator.clipboard.writeText(textToCopy.trim())
            .then(() => showToast('คัดลอกข้อมูลเรียบร้อยแล้ว', 'success'))
            .catch(err => showToast('ไม่สามารถคัดลอกได้', 'error'));
    }

    function exportJson() {
        const payload = buildPayload(true);
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
        
        const cleanup = (doImport) => {
            modal.classList.remove('visible');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            if (doImport) {
                try {
                    const data = JSON.parse(textarea.value);
                    if (!data.rooms) throw new Error("Invalid format");
                    
                    roomsEl.innerHTML = "";
                    roomCount = 0;
                    document.querySelector('input[name="customer_name"]').value = data.customer_name || "";
                    document.querySelector('input[name="customer_phone"]').value = data.customer_phone || "";
                    document.querySelector('input[name="customer_address"]').value = data.customer_address || "";
                    data.rooms.forEach(r => addRoom(r));
                    
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
        document.body.classList.toggle('is-locked', isLocked);
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        lockBtn.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        lockBtn.querySelector('.lock-icon').textContent = isLocked ? 'lock' : 'lock_open';
        showToast(isLocked ? 'ล็อคฟอร์มแล้ว' : 'ปลดล็อคฟอร์ม', isLocked ? 'warning' : 'success');
    }

    // --- Event Listeners ---
    document.addEventListener('DOMContentLoaded', loadData);

    roomsEl.addEventListener('input', debounce((e) => {
        if (isLocked) { e.preventDefault(); return; }
        if (e.target && e.target.closest(SELECTORS.room)) {
            if (e.target.name === 'room_name') {
                renumber();
            }
            recalcAll();
        }
    }));
    
    roomsEl.addEventListener('click', (e) => {
        const target = e.target.closest('[data-act]');
        if (!target || isLocked) return;
        
        const action = target.dataset.act;
        const roomEl = target.closest(SELECTORS.room);
        const setEl = target.closest(SELECTORS.set);
        const decoEl = target.closest(SELECTORS.decoItem);
        const wallpaperEl = target.closest(SELECTORS.wallpaperItem);

        const actions = {
            'add-set': () => addSet(roomEl),
            'add-deco': () => addDeco(roomEl),
            'add-wallpaper': () => addWallpaper(roomEl),
            'del-room': () => delRoom(roomEl),
            'clear-room': () => clearRoom(roomEl),
            'toggle-room-suspend': () => toggleSuspend(roomEl),
            'del-set': () => delItem(setEl, 'set'),
            'toggle-set-suspend': () => toggleSuspend(setEl),
            'del-deco': () => delItem(decoEl, 'deco-item'),
            'toggle-deco-suspend': () => toggleSuspend(decoEl),
            'del-wallpaper': () => delItem(wallpaperEl, 'wallpaper-item'),
            'toggle-wallpaper-suspend': () => toggleSuspend(wallpaperEl),
            'add-wall': () => addWall(wallpaperEl),
            'del-wall': () => delWall(target),
        };
        if (actions[action]) actions[action]();
    });

    roomsEl.addEventListener('change', (e) => {
        if (isLocked) return;
        if (e.target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
        recalcAll();
    });

    document.addEventListener('click', (e) => {
        document.querySelectorAll('.menu-dropdown.show').forEach(dropdown => {
            if (!dropdown.closest('.menu-container').contains(e.target)) {
                 dropdown.classList.remove('show');
            }
        });
        
        const menuBtn = e.target.closest('.room-menu-btn, .set-menu-btn, .deco-menu-btn, .wallpaper-menu-btn, #menuBtn');
        if (menuBtn) {
            e.preventDefault();
            const dropdown = menuBtn.closest('.menu-container').querySelector('.menu-dropdown');
            if (dropdown) dropdown.classList.toggle('show');
        }
    });

    orderForm.addEventListener("submit", (e) => {
        e.preventDefault();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload(true));
        showToast('กำลังส่งข้อมูล...', 'info');
        orderForm.submit();
    });
    
    document.querySelector(SELECTORS.summaryBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.summaryPopup).classList.add('show');
    });
    document.querySelector(SELECTORS.closeSummaryPopup).addEventListener('click', () => {
        document.querySelector(SELECTORS.summaryPopup).classList.remove('show');
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAll);
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', toggleLock);
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', copyJson);
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', copyText);
    document.querySelector(SELECTORS.importBtn).addEventListener('click', importJson);
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', exportJson);
})();