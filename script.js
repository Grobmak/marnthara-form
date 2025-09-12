(function() {
    'use strict';
    const APP_VERSION = "input-ui/4.0.0-m3-liquidglass";
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
        // selectors ใหม่สำหรับป๊อปอัป
        summaryBtn: '#summaryBtn',
        summaryPopup: '#summaryPopup',
        closeSummaryPopupBtn: '#closeSummaryPopup',
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
        renumber(); recalcAll(); saveData();
    }
    
    function delRoom(btn) {
        if (isLocked) return;
        showConfirmation("ยืนยันการลบห้อง", "คุณแน่ใจที่จะลบห้องนี้? การกระทำนี้ไม่สามารถย้อนกลับได้")
            .then(result => {
                if (result) {
                    btn.closest(SELECTORS.room).remove();
                    renumber(); recalcAll(); saveData();
                    showToast('ลบห้องแล้ว', 'success');
                }
            });
    }

    function delSet(btn) {
        if (isLocked) return;
        const roomEl = btn.closest(SELECTORS.room);
        btn.closest(SELECTORS.set).remove();
        if (roomEl.querySelectorAll(SELECTORS.set, SELECTORS.decoItem, SELECTORS.wallpaperItem).length === 0) {
            addSet(roomEl);
        }
        renumber(); recalcAll(); saveData();
        showToast('ลบจุดผ้าม่านแล้ว', 'success');
    }
    function delDeco(btn) {
        if (isLocked) return;
        const roomEl = btn.closest(SELECTORS.room);
        btn.closest(SELECTORS.decoItem).remove();
        if (roomEl.querySelectorAll(SELECTORS.set, SELECTORS.decoItem, SELECTORS.wallpaperItem).length === 0) {
            addSet(roomEl);
        }
        renumber(); recalcAll(); saveData();
        showToast('ลบรายการตกแต่งแล้ว', 'success');
    }
    function delWallpaper(btn) {
        if (isLocked) return;
        const roomEl = btn.closest(SELECTORS.room);
        btn.closest(SELECTORS.wallpaperItem).remove();
        if (roomEl.querySelectorAll(SELECTORS.set, SELECTORS.decoItem, SELECTORS.wallpaperItem).length === 0) {
            addSet(roomEl);
        }
        renumber(); recalcAll(); saveData();
        showToast('ลบรายการวอลเปเปอร์แล้ว', 'success');
    }
    function delWall(btn) {
        if (isLocked) return;
        btn.closest('.wall-input-row').remove();
        recalcAll(); saveData();
    }
    function clearRoom(btn) {
        if (isLocked) return;
        showConfirmation("ยืนยันการล้างข้อมูลห้อง", "คุณแน่ใจที่จะล้างข้อมูลในห้องนี้? การกระทำนี้ไม่สามารถย้อนกลับได้")
            .then(result => {
                if (result) {
                    const roomEl = btn.closest(SELECTORS.room);
                    roomEl.querySelector(SELECTORS.setsContainer).innerHTML = "";
                    roomEl.querySelector(SELECTORS.decorationsContainer).innerHTML = "";
                    roomEl.querySelector(SELECTORS.wallpapersContainer).innerHTML = "";
                    addSet(roomEl);
                    renumber(); recalcAll(); saveData();
                    showToast('ล้างห้องแล้ว', 'success');
                }
            });
    }
    function clearSet(btn) {
        if (isLocked) return;
        const setEl = btn.closest(SELECTORS.set);
        setEl.querySelector('[name="width_m"]').value = "";
        setEl.querySelector('[name="height_m"]').value = "";
        setEl.querySelector('[name="fabric_variant"]').value = "ทึบ";
        setEl.querySelector('[name="open_type"]').value = "";
        setEl.querySelector('[name="sheer_price_per_m"]').value = "";
        recalcAll(); saveData();
        showToast('ล้างข้อมูลในจุดนี้แล้ว', 'success');
    }
    function clearDeco(btn) {
        if (isLocked) return;
        const decoEl = btn.closest(SELECTORS.decoItem);
        decoEl.querySelector('[name="deco_type"]').value = "";
        decoEl.querySelector('[name="deco_price_sqyd"]').value = "";
        decoEl.querySelector('[name="deco_width_m"]').value = "";
        decoEl.querySelector('[name="deco_height_m"]').value = "";
        recalcAll(); saveData();
        showToast('ล้างข้อมูลในรายการนี้แล้ว', 'success');
    }
    function clearWallpaper(btn) {
        if (isLocked) return;
        const wallpaperEl = btn.closest(SELECTORS.wallpaperItem);
        wallpaperEl.querySelector('[name="wallpaper_height_m"]').value = "";
        wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value = "";
        wallpaperEl.querySelector('[data-walls-container]').innerHTML = "";
        addWall(wallpaperEl.querySelector('[data-act="add-wall"]'));
        recalcAll(); saveData();
        showToast('ล้างข้อมูลในรายการนี้แล้ว', 'success');
    }
    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, i) => {
            room.querySelector('[data-room-number]').textContent = i + 1;
            room.querySelectorAll(SELECTORS.set).forEach((set, j) => {
                set.querySelector('[data-set-number]').textContent = j + 1;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco, j) => {
                deco.querySelector('[data-deco-number]').textContent = j + 1;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper, j) => {
                wallpaper.querySelector('[data-wallpaper-number]').textContent = j + 1;
            });
        });
    }

    function recalcAll() {
        const payload = buildPayload();
        let grandTotal = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        let setCountSets = 0;
        let setCountDeco = 0;

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            let roomTotal = 0;
            
            const roomPricePerM = toNum(roomEl.querySelector('select[name="room_price_per_m"]').value);
            const roomStyle = roomEl.querySelector('select[name="room_style"]').value;
            const isSuspended = roomEl.dataset.suspended === 'true';
            
            const sets = roomEl.querySelectorAll(SELECTORS.set);
            sets.forEach(setEl => {
                const width = clamp01(setEl.querySelector('input[name="width_m"]').value);
                const height = clamp01(setEl.querySelector('input[name="height_m"]').value);
                const fabricType = setEl.querySelector('select[name="fabric_variant"]').value;
                const sheerPricePerM = toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value);
                const setStyle = setEl.querySelector('select[name="style"]').value || roomStyle;
                const isSetSuspended = setEl.dataset.suspended === 'true';
                
                let setTotal = 0;
                let fabricYardage = 0;
                let sheerFabricYardage = 0;
                let opaqueTrackLength = 0;
                let sheerTrackLength = 0;
                let heightPlusPrice = heightPlus(height);

                if (width > 0 && height > 0) {
                    if (fabricType === "ทึบ" || fabricType === "ทั้งสอง") {
                        fabricYardage = CALC.fabricYardage(setStyle, width);
                        opaqueTrackLength = width;
                        setTotal += (roomPricePerM + heightPlusPrice + stylePlus(setStyle)) * width;
                    }
                    if (fabricType === "โปร่ง" || fabricType === "ทั้งสอง") {
                        sheerFabricYardage = CALC.fabricYardage(setStyle, width);
                        sheerTrackLength = width;
                        setTotal += (sheerPricePerM + heightPlusPrice + stylePlus(setStyle)) * width;
                    }
                    if (!isSetSuspended) {
                        roomTotal += setTotal;
                        grandFabric += fabricYardage;
                        grandSheerFabric += sheerFabricYardage;
                        grandOpaqueTrack += opaqueTrackLength;
                        grandSheerTrack += sheerTrackLength;
                    }
                    setEl.querySelector('[data-set-summary] .price').textContent = fmt(setTotal, 0, true);
                    setEl.querySelector('[data-set-summary] .price:last-child').textContent = fmt(fabricYardage + sheerFabricYardage, 2);
                    setCountSets++;
                }
            });

            const decorations = roomEl.querySelectorAll(SELECTORS.decoItem);
            decorations.forEach(decoEl => {
                const type = decoEl.querySelector('[name="deco_type"]').value;
                const width = clamp01(decoEl.querySelector('[name="deco_width_m"]').value);
                const height = clamp01(decoEl.querySelector('[name="deco_height_m"]').value);
                const priceSqyd = toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value);
                const isDecoSuspended = decoEl.dataset.suspended === 'true';
                
                let decoTotal = 0;
                let decoArea = 0;
                if (width > 0 && height > 0 && priceSqyd > 0) {
                    decoArea = width * height * SQM_TO_SQYD;
                    decoTotal = decoArea * priceSqyd;
                }
                if (!isDecoSuspended) {
                    roomTotal += decoTotal;
                    setCountDeco++;
                }
                decoEl.querySelector('[data-deco-summary] .price:first-child').textContent = fmt(decoTotal, 0, true);
                decoEl.querySelector('[data-deco-summary] .price:last-child').textContent = fmt(decoArea, 2);
            });
            
            const wallpapers = roomEl.querySelectorAll(SELECTORS.wallpaperItem);
            wallpapers.forEach(wallpaperEl => {
                const height = clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value);
                const isWallpaperSuspended = wallpaperEl.dataset.suspended === 'true';

                let totalWidth = 0;
                wallpaperEl.querySelectorAll('[name="wall_width_m"]').forEach(wallWidthInput => {
                    totalWidth += clamp01(wallWidthInput.value);
                });
                
                let wallpaperTotal = 0;
                let wallpaperRolls = 0;
                let wallpaperArea = 0;

                if (totalWidth > 0 && height > 0) {
                    wallpaperArea = totalWidth * height;
                    wallpaperRolls = CALC.wallpaperRolls(totalWidth, height);
                    wallpaperTotal = wallpaperRolls * pricePerRoll;
                }

                if (!isWallpaperSuspended) {
                    roomTotal += wallpaperTotal;
                    setCountDeco++;
                }

                wallpaperEl.querySelector('[data-wallpaper-summary] .price:first-child').textContent = fmt(wallpaperTotal, 0, true);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-child(2)').textContent = fmt(wallpaperArea, 2);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:last-child').textContent = fmt(wallpaperRolls, 0, true);
            });

            if (!isSuspended) {
                grandTotal += roomTotal;
            }
            roomEl.querySelector('[data-room-total]').textContent = fmt(roomTotal, 0, true);
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandFabric, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerFabric, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            total_price: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const isSuspended = roomEl.dataset.suspended === 'true';
            const roomData = {
                room_name: roomEl.querySelector('input[name="room_name"]').value,
                price_per_m_raw: toNum(roomEl.querySelector('select[name="room_price_per_m"]').value),
                style: roomEl.querySelector('select[name="room_style"]').value,
                track_type: roomEl.querySelector('select[name="track_type"]').value,
                is_suspended: isSuspended,
                total: toNum(roomEl.querySelector('[data-room-total]').textContent),
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const isSetSuspended = setEl.dataset.suspended === 'true';
                roomData.sets.push({
                    width_m: toNum(setEl.querySelector('input[name="width_m"]').value),
                    height_m: toNum(setEl.querySelector('input[name="height_m"]').value),
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                    style: setEl.querySelector('select[name="style"]').value,
                    track_type: setEl.querySelector('select[name="track_type"]').value,
                    is_suspended: isSetSuspended
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const isDecoSuspended = decoEl.dataset.suspended === 'true';
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: isDecoSuspended
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const isWallpaperSuspended = wallpaperEl.dataset.suspended === 'true';
                const walls = [];
                wallpaperEl.querySelectorAll('[name="wall_width_m"]').forEach(wallWidthInput => {
                    walls.push(toNum(wallWidthInput.value));
                });
                roomData.wallpapers.push({
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: walls,
                    is_suspended: isWallpaperSuspended
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
    
    function loadData() {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (savedData) {
            const payload = JSON.parse(savedData);
            document.querySelector('input[name="customer_name"]').value = payload.customer_name || "";
            document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || "";
            document.querySelector('input[name="customer_address"]').value = payload.customer_address || "";
            document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
            (payload.rooms || []).forEach(room => addRoom(room));
            recalcAll();
        } else {
            addRoom();
        }
    }

    function toggleLockState() {
        isLocked = !isLocked;
        document.body.classList.toggle('is-locked', isLocked);
        showToast(isLocked ? 'ล็อคหน้าแล้ว' : 'ปลดล็อคหน้าแล้ว', isLocked ? 'error' : 'success');
    }

    function clearAll() {
        showConfirmation("ยืนยันการล้างข้อมูลทั้งหมด", "คุณแน่ใจที่จะล้างข้อมูลทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้")
            .then(result => {
                if (result) {
                    localStorage.removeItem(STORAGE_KEY);
                    document.querySelector('input[name="customer_name"]').value = "";
                    document.querySelector('input[name="customer_phone"]').value = "";
                    document.querySelector('input[name="customer_address"]').value = "";
                    document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
                    addRoom();
                    showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
                }
            });
    }

    function toggleSetFabricUI(setEl) {
        const fabricType = setEl.querySelector('select[name="fabric_variant"]').value;
        const sheerWrap = setEl.querySelector(SELECTORS.sheerWrap);
        const styleSelect = setEl.querySelector('select[name="style"]');
        const sheerRequired = fabricType === "โปร่ง" || fabricType === "ทั้งสอง";
        sheerWrap.style.display = sheerRequired ? 'block' : 'none';
        
        const styleRequired = fabricType === "ทึบ" || fabricType === "ทั้งสอง";
        styleSelect.required = styleRequired;
    }

    function toggleSuspend(el) {
        el.dataset.suspended = el.dataset.suspended === 'true' ? 'false' : 'true';
        el.classList.toggle('is-suspended');
        recalcAll();
        saveData();
    }
    
    function handleMenuDropdown(target) {
        const container = target.closest('.menu-container');
        if (!container) return;
        
        const dropdown = container.querySelector('.menu-dropdown');
        if (dropdown) {
            document.querySelectorAll('.menu-dropdown.show').forEach(d => {
                if (d !== dropdown) {
                    d.classList.remove('show');
                }
            });
            dropdown.classList.toggle('show');
        }
    }
    
    // Event listeners
    roomsEl.addEventListener('input', debounce(recalcAll));
    roomsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        e.preventDefault();
        const action = btn.dataset.act;
        const target = btn.closest('[data-room], [data-set], [data-deco-item], [data-wallpaper-item]');

        const actions = {
            'add-room': () => addRoom(),
            'add-set': () => addSet(target),
            'add-deco': () => addDeco(target),
            'add-wallpaper': () => addWallpaper(target),
            'add-wall': () => addWall(btn),
            'del-room': () => delRoom(btn),
            'del-set': () => delSet(btn),
            'del-deco': () => delDeco(btn),
            'del-wallpaper': () => delWallpaper(btn),
            'del-wall': () => delWall(btn),
            'clear-room': () => clearRoom(btn),
            'clear-set': () => clearSet(btn),
            'clear-deco': () => clearDeco(btn),
            'clear-wallpaper': () => clearWallpaper(btn),
            'toggle-room-suspend': () => toggleSuspend(target),
            'toggle-set-suspend': () => toggleSuspend(target),
            'toggle-deco-suspend': () => toggleSuspend(target),
            'toggle-wallpaper-suspend': () => toggleSuspend(target),
            'open-room-menu': () => handleMenuDropdown(btn),
            'open-set-menu': () => handleMenuDropdown(btn),
            'open-deco-menu': () => handleMenuDropdown(btn),
            'open-wallpaper-menu': () => handleMenuDropdown(btn),
        };

        if (actions[action]) {
            actions[action]();
        }
    });

    roomsEl.addEventListener('change', (e) => {
        if (e.target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
    });

    document.addEventListener('click', (e) => {
        // Handle menu dropdowns
        document.querySelectorAll('.menu-dropdown.show').forEach(dropdown => {
            if (!dropdown.parentElement.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });

        const menuBtn = e.target.closest('.room-menu-btn, .set-menu-btn, .deco-menu-btn, .wallpaper-menu-btn');
        if (menuBtn) {
            e.preventDefault();
            const dropdown = menuBtn.closest('.menu-container').querySelector('.menu-dropdown');
            dropdown.classList.toggle('show');
            return;
        }
        
        // Handle summary popup
        const summaryPopup = document.querySelector(SELECTORS.summaryPopup);
        const summaryBtn = document.querySelector(SELECTORS.summaryBtn);
        const closeBtn = e.target.closest(SELECTORS.closeSummaryPopupBtn);

        if (summaryPopup.classList.contains('show')) {
            // Check if the click is outside the popup or on the close button
            if (closeBtn || (!summaryPopup.contains(e.target) && e.target !== summaryBtn)) {
                summaryPopup.classList.remove('show');
            }
        }
    });

    // New event listener for the summary button
    document.querySelector(SELECTORS.summaryBtn).addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector(SELECTORS.summaryPopup).classList.add('show');
    });

    orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
    });
    
    document.querySelector('#customerInfo').addEventListener('input', debounce(saveData));
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', toggleLockState);
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAll);
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => handleMenuDropdown(e.target));
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const json = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const data = JSON.parse(json);
            document.querySelector('input[name="customer_name"]').value = data.customer_name || "";
            document.querySelector('input[name="customer_phone"]').value = data.customer_phone || "";
            document.querySelector('input[name="customer_address"]').value = data.customer_address || "";
            document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
            (data.rooms || []).forEach(room => addRoom(room));
            recalcAll();
            saveData();
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
        } catch (e) {
            showToast('ข้อมูลไม่ถูกต้อง', 'error');
        }
    });
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `marnthara_data_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast('ดาวน์โหลดข้อมูลแล้ว', 'success');
    });
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
            .then(() => showToast('คัดลอก JSON แล้ว', 'success'))
            .catch(err => showToast('ไม่สามารถคัดลอกได้: ' + err, 'error'));
    });
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', () => {
        showCopyOptionsModal().then(options => {
            if (!options) return;
            const payload = buildPayload();
            let text = "";
            if (options.customer) {
                text += `ชื่อลูกค้า: ${payload.customer_name}\n`;
                text += `เบอร์โทร: ${payload.customer_phone}\n`;
                text += `รายละเอียดเพิ่มเติม: ${payload.customer_address}\n\n`;
            }
            if (options.details) {
                payload.rooms.forEach((room, roomIndex) => {
                    const roomNumber = roomIndex + 1;
                    text += `--- ห้องที่ ${roomNumber}: ${room.room_name} ---\n`;
                    text += `รูปแบบ: ${room.style || '-'}\n`;
                    text += `ราคาต่อเมตร: ${fmt(room.price_per_m_raw, 0, true)} บ.\n`;
                    text += `ประเภทราง: ${room.track_type || '-'}\n\n`;

                    room.sets.forEach((set, setIndex) => {
                        const setNumber = setIndex + 1;
                        text += `  - จุดผ้าม่านที่ ${setNumber}\n`;
                        text += `    - ขนาด: ${fmt(set.width_m, 2)} ม. x ${fmt(set.height_m, 2)} ม.\n`;
                        text += `    - ผ้า: ${set.fabric_variant}\n`;
                        text += `    - การเปิด: ${set.open_type || '-'}\n`;
                    });
                    
                    room.decorations.forEach((deco, decoIndex) => {
                        const decoNumber = decoIndex + 1;
                        text += `  - รายการตกแต่งที่ ${decoNumber}\n`;
                        text += `    - ชนิด: ${deco.type}\n`;
                        text += `    - ขนาด: ${fmt(deco.width_m, 2)} ม. x ${fmt(deco.height_m, 2)} ม.\n`;
                        text += `    - ราคา/หลา: ${fmt(deco.price_sqyd, 0, true)} บ.\n`;
                    });
                    
                    room.wallpapers.forEach((wallpaper, wallpaperIndex) => {
                        const wallpaperNumber = wallpaperIndex + 1;
                        text += `  - วอลเปเปอร์ที่ ${wallpaperNumber}\n`;
                        text += `    - ความสูง: ${fmt(wallpaper.height_m, 2)} ม.\n`;
                        text += `    - ราคา/ม้วน: ${fmt(wallpaper.price_per_roll, 0, true)} บ.\n`;
                        text += `    - ความกว้างผนัง: ${wallpaper.widths.map(w => fmt(w, 2) + ' ม.').join(', ')}\n`;
                    });

                    text += "\n";
                });
            }
            if (options.summary) {
                const totalFabric = toNum(document.querySelector(SELECTORS.grandFabric).textContent.replace(' หลา', ''));
                const totalSheerFabric = toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent.replace(' หลา', ''));
                const totalOpaqueTrack = toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent.replace(' ม.', ''));
                const totalSheerTrack = toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent.replace(' ม.', ''));
                const totalCost = toNum(document.querySelector(SELECTORS.grandTotal).textContent);

                text += "--- สรุปวัสดุ ---\n";
                text += `ผ้าทึบที่ใช้: ${fmt(totalFabric, 2)} หลา\n`;
                text += `ผ้าโปร่งที่ใช้: ${fmt(totalSheerFabric, 2)} หลา\n`;
                text += `รางทึบที่ใช้: ${fmt(totalOpaqueTrack, 2)} ม.\n`;
                text += `รางโปร่งที่ใช้: ${fmt(totalSheerTrack, 2)} ม.\n`;
                text += `ราคารวม: ${fmt(totalCost, 0, true)} บ.\n`;
            }
            navigator.clipboard.writeText(text.trim())
                .then(() => showToast('คัดลอกข้อความแล้ว', 'success'))
                .catch(err => showToast('ไม่สามารถคัดลอกได้: ' + err, 'error'));
        });
    });

    // Initial load
    window.onload = () => {
        loadData();
    };
    window.addEventListener('beforeunload', saveData);
})();