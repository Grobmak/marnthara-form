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

    function buildCopyText(options) {
        const parts = [];
        const payload = buildPayload();
        
        if (options.customer) {
            let customerInfo = `*ลูกค้า*\n`;
            if (payload.customer_name) customerInfo += `ชื่อ: ${payload.customer_name}\n`;
            if (payload.customer_phone) customerInfo += `เบอร์โทร: ${payload.customer_phone}\n`;
            if (payload.customer_address) customerInfo += `รายละเอียด: ${payload.customer_address}\n`;
            parts.push(customerInfo.trim());
        }

        if (options.details && payload.rooms && payload.rooms.length > 0) {
            let roomDetails = `*รายละเอียดรายการ*\n`;
            payload.rooms.forEach(room => {
                roomDetails += `\n**${room.room_name}**\n`;
                (room.sets || []).forEach((set, i) => {
                    roomDetails += `  ชุดที่ ${i + 1}: ${set.set_name} (${set.style} ${fmt(set.width_m, 2)}x${fmt(set.height_m, 2)} ม.)\n`;
                });
                (room.decorations || []).forEach((deco, i) => {
                    roomDetails += `  ของตกแต่งที่ ${i + 1}: ${deco.item} (${deco.quantity} ชิ้น) ราคา ${fmt(deco.price, 0, true)} บ.\n`;
                });
                (room.wallpapers || []).forEach((wallpaper, i) => {
                    roomDetails += `  วอลเปเปอร์ที่ ${i + 1}: ${wallpaper.name} (${fmt(wallpaper.total_sqm, 2)} ตร.ม.)\n`;
                });
            });
            parts.push(roomDetails.trim());
        }

        if (options.summary) {
            const grandTotal = roomsEl.querySelector(SELECTORS.grandTotal).textContent;
            const grandFabric = roomsEl.querySelector(SELECTORS.grandFabric).textContent;
            const grandSheerFabric = roomsEl.querySelector(SELECTORS.grandSheerFabric).textContent;
            const grandOpaqueTrack = roomsEl.querySelector(SELECTORS.grandOpaqueTrack).textContent;
            const grandSheerTrack = roomsEl.querySelector(SELECTORS.grandSheerTrack).textContent;

            let summary = `*สรุปยอด*\n`;
            summary += `รวม: ${grandTotal} บ.\n`;
            summary += `ผ้าทึบ: ${grandFabric}\n`;
            summary += `ผ้าโปร่ง: ${grandSheerFabric}\n`;
            summary += `รางทึบ: ${grandOpaqueTrack}\n`;
            summary += `รางโปร่ง: ${grandSheerTrack}\n`;
            parts.push(summary.trim());
        }

        return parts.join("\n\n");
    }

    function buildPayload() {
        const customerName = document.querySelector('input[name="customer_name"]').value;
        const customerPhone = document.querySelector('input[name="customer_phone"]').value;
        const customerAddress = document.querySelector('input[name="customer_address"]').value;
        const rooms = [...document.querySelectorAll(SELECTORS.room)].map(roomEl => {
            const roomData = {};
            roomData.room_name = roomEl.querySelector(SELECTORS.roomNameInput).value || `ห้องที่ ${roomEl.dataset.index}`;
            roomData.is_suspended = roomEl.dataset.suspended === 'true';
            
            roomData.sets = [...roomEl.querySelectorAll(SELECTORS.set)].map(setEl => {
                const setData = {};
                setData.set_name = setEl.querySelector('input[name="set_name"]').value || `ชุดที่ ${setEl.dataset.setIndex}`;
                setData.style = setEl.querySelector('select[name="style"]').value;
                setData.width_m = toNum(setEl.querySelector('input[name="width_m"]').value);
                setData.height_m = toNum(setEl.querySelector('input[name="height_m"]').value);
                setData.track_width_m = toNum(setEl.querySelector('input[name="track_width_m"]').value);
                setData.price_per_m_raw = setEl.querySelector('select[name="price_per_m"]').value;
                setData.sheer_price_per_m_raw = setEl.querySelector('select[name="sheer_price_per_m"]').value;
                setData.sheer_width_m = toNum(setEl.querySelector('input[name="sheer_width_m"]').value);
                setData.sheer_height_m = toNum(setEl.querySelector('input[name="sheer_height_m"]').value);
                setData.subtotal = toNum(setEl.querySelector('[data-set-total]').textContent.replace(/,/g, ''));
                return setData;
            });

            roomData.decorations = [...roomEl.querySelectorAll(SELECTORS.decoItem)].map(decoEl => {
                const decoData = {};
                decoData.item = decoEl.querySelector('select[name="deco_item"]').value;
                decoData.price = toNum(decoEl.querySelector('input[name="deco_price"]').value);
                decoData.quantity = toNum(decoEl.querySelector('input[name="deco_quantity"]').value);
                return decoData;
            });
            
            roomData.wallpapers = [...roomEl.querySelectorAll(SELECTORS.wallpaperItem)].map(wpEl => {
                const wpData = {};
                wpData.name = wpEl.querySelector('input[name="wallpaper_name"]').value || `วอลเปเปอร์ที่ ${wpEl.dataset.wallpaperIndex}`;
                wpData.height_m = toNum(wpEl.querySelector('input[name="wallpaper_height_m"]').value);
                wpData.price_roll = toNum(wpEl.querySelector('input[name="wallpaper_price_roll"]').value);
                wpData.walls = [...wpEl.querySelectorAll('.wall-input-row input')].map(input => toNum(input.value));
                wpData.total_sqm = toNum(wpEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent);
                return wpData;
            });

            roomData.room_total = toNum(roomEl.querySelector('[data-room-total]').textContent.replace(/,/g, ''));
            return roomData;
        });
        
        const grandTotalEl = document.querySelector(SELECTORS.grandTotal);
        const payload = {
            version: APP_VERSION,
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_address: customerAddress,
            rooms: rooms,
            grand_total: toNum(grandTotalEl.textContent.replace(/,/g, '')),
        };
        return payload;
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    const renumDebounced = debounce(() => renumber());
    const recalcDebounced = debounce(() => recalcAll());

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
        renumber();
        recalcAll();
        saveData();
        updateLockState();
        created.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }

    function populatePriceOptions(selectEl, prices) {
        selectEl.innerHTML = `<option value="">-- เลือกราคา --</option>` + prices.map(p => `<option value="${p}">${fmt(p, 0, true)} บ.</option>`).join('');
    }

    function addSet(room, prefill) {
        if (isLocked) return;
        const setsContainer = room.querySelector(SELECTORS.setsContainer);
        const frag = document.querySelector(SELECTORS.setTpl).content.cloneNode(true);
        setsContainer.appendChild(frag);
        const newSet = setsContainer.lastElementChild;
        populatePriceOptions(newSet.querySelector('select[name="price_per_m"]'), PRICING.fabric);
        populatePriceOptions(newSet.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);

        if (prefill) {
            newSet.querySelector('input[name="set_name"]').value = prefill.set_name || '';
            newSet.querySelector('select[name="style"]').value = prefill.style || 'ลอน';
            newSet.querySelector('input[name="height_m"]').value = prefill.height_m || '';
            newSet.querySelector('input[name="width_m"]').value = prefill.width_m || '';
            newSet.querySelector('input[name="track_width_m"]').value = prefill.track_width_m || '';
            newSet.querySelector('select[name="price_per_m"]').value = prefill.price_per_m_raw || '';
            newSet.querySelector('select[name="sheer_price_per_m"]').value = prefill.sheer_price_per_m_raw || '';
            newSet.querySelector('input[name="sheer_width_m"]').value = prefill.sheer_width_m || '';
            newSet.querySelector('input[name="sheer_height_m"]').value = prefill.sheer_height_m || '';
        }
        renumber();
        recalcDebounced();
    }
    
    function addDeco(room, prefill) {
        if (isLocked) return;
        const decosContainer = room.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
        decosContainer.appendChild(frag);
        const newDeco = decosContainer.lastElementChild;
        if (prefill) {
            newDeco.querySelector('select[name="deco_item"]').value = prefill.item || '';
            newDeco.querySelector('input[name="deco_price"]').value = prefill.price || '';
            newDeco.querySelector('input[name="deco_quantity"]').value = prefill.quantity || '1';
        }
        renumber();
        recalcDebounced();
    }
    
    function addWallpaper(room, prefill) {
        if (isLocked) return;
        const wallpapersContainer = room.querySelector(SELECTORS.wallpapersContainer);
        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        wallpapersContainer.appendChild(frag);
        const newWp = wallpapersContainer.lastElementChild;
        if (prefill) {
            newWp.querySelector('input[name="wallpaper_name"]').value = prefill.name || '';
            newWp.querySelector('input[name="wallpaper_height_m"]').value = prefill.height_m || '';
            newWp.querySelector('input[name="wallpaper_price_roll"]').value = prefill.price_roll || '';
            if (prefill.walls && prefill.walls.length > 0) prefill.walls.forEach(w => addWall(newWp, w));
            else addWall(newWp);
        } else {
            addWall(newWp);
        }
        renumber();
        recalcDebounced();
    }

    function addWall(wallpaper, prefill) {
        if (isLocked) return;
        const wallsContainer = wallpaper.querySelector(SELECTORS.wallsContainer);
        const frag = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
        wallsContainer.appendChild(frag);
        const newWall = wallsContainer.lastElementChild;
        if (prefill) {
            newWall.querySelector('input[name="wall_width_m"]').value = prefill || '';
        }
        recalcDebounced();
    }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, roomIdx) => {
            room.dataset.index = roomIdx + 1;
            const roomNumEl = room.querySelector('.room-num');
            if (roomNumEl) roomNumEl.textContent = `ห้องที่ ${roomIdx + 1}:`;
            
            room.querySelectorAll(SELECTORS.set).forEach((set, setIdx) => {
                set.dataset.setIndex = setIdx + 1;
                const setNumEl = set.querySelector('.set-num');
                if (setNumEl) setNumEl.textContent = `ชุดที่ ${setIdx + 1}`;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach((deco, decoIdx) => {
                deco.dataset.decoIndex = decoIdx + 1;
                const decoNumEl = deco.querySelector('.deco-num');
                if (decoNumEl) decoNumEl.textContent = `ของตกแต่งที่ ${decoIdx + 1}`;
            });
            
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wp, wpIdx) => {
                wp.dataset.wallpaperIndex = wpIdx + 1;
                const wpNumEl = wp.querySelector('.wallpaper-num');
                if (wpNumEl) wpNumEl.textContent = `วอลเปเปอร์ที่ ${wpIdx + 1}`;
            });
        });
        saveData();
    }

    function recalcAll() {
        let grandTotal = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            let roomTotal = 0;
            let roomFabric = 0;
            let roomSheerFabric = 0;
            let roomOpaqueTrack = 0;
            let roomSheerTrack = 0;
            const isSuspended = roomEl.dataset.suspended === 'true';

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const width = clamp01(setEl.querySelector('input[name="width_m"]').value);
                const height = clamp01(setEl.querySelector('input[name="height_m"]').value);
                const style = setEl.querySelector('select[name="style"]').value;
                const trackWidth = clamp01(setEl.querySelector('input[name="track_width_m"]').value);
                const pricePerM = toNum(setEl.querySelector('select[name="price_per_m"]').value);

                const sheerWidth = clamp01(setEl.querySelector('input[name="sheer_width_m"]').value);
                const sheerHeight = clamp01(setEl.querySelector('input[name="sheer_height_m"]').value);
                const sheerPricePerM = toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value);
                
                const fabricYardage = CALC.fabricYardage(style, width);
                const sheerFabricYardage = CALC.fabricYardage("ลอน", sheerWidth);
                const styleSurcharge = stylePlus(style) * (width * height);
                const heightSurcharge = heightPlus(height) * width;
                
                const fabricPrice = Math.ceil(fabricYardage * 0.9) * pricePerM + styleSurcharge + heightSurcharge;
                const sheerPrice = sheerPricePerM > 0 ? (Math.ceil(sheerFabricYardage * 0.9) * sheerPricePerM) : 0;
                
                const subtotal = fabricPrice + sheerPrice;
                const setTotalEl = setEl.querySelector('[data-set-total]');
                const setFabricEl = setEl.querySelector('[data-set-fabric]');
                const setSheerFabricEl = setEl.querySelector('[data-set-sheer-fabric]');
                
                setTotalEl.textContent = fmt(subtotal, 0, true);
                setFabricEl.textContent = fmt(fabricYardage, 2);
                setSheerFabricEl.textContent = fmt(sheerFabricYardage, 2);

                roomTotal += subtotal;
                roomFabric += fabricYardage;
                roomSheerFabric += sheerFabricYardage;
                roomOpaqueTrack += trackWidth;
                roomSheerTrack += sheerWidth;
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const price = toNum(decoEl.querySelector('input[name="deco_price"]').value);
                const quantity = toNum(decoEl.querySelector('input[name="deco_quantity"]').value);
                roomTotal += price * quantity;
            });
            
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wpEl => {
                const height = clamp01(wpEl.querySelector('input[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wpEl.querySelector('input[name="wallpaper_price_roll"]').value);
                
                const wallWidths = [...wpEl.querySelectorAll('.wall-input-row input')].map(input => clamp01(input.value));
                const totalWidth = wallWidths.reduce((sum, w) => sum + w, 0);
                const totalSqM = totalWidth * height;
                
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, height);
                const price = rollsNeeded * pricePerRoll;
                
                wpEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = fmt(price, 0, true);
                wpEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(totalSqM, 2);
                wpEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = fmt(rollsNeeded, 0);
                
                roomTotal += price;
            });
            
            if (isSuspended) {
                roomTotal = 0;
                roomFabric = 0;
                roomSheerFabric = 0;
                roomOpaqueTrack = 0;
                roomSheerTrack = 0;
            }

            const roomTotalEl = roomEl.querySelector('[data-room-total]');
            if (roomTotalEl) roomTotalEl.textContent = fmt(roomTotal, 0, true);
            
            grandTotal += roomTotal;
            grandFabric += roomFabric;
            grandSheerFabric += roomSheerFabric;
            grandOpaqueTrack += roomOpaqueTrack;
            grandSheerTrack += roomSheerTrack;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandFabric, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerFabric, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
        
        saveData();
    }
    
    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const lockIcon = lockBtn.querySelector('.lock-icon');
        const lockText = lockBtn.querySelector('.lock-text');
        
        if (isLocked) {
            document.body.classList.add('is-locked');
            lockIcon.textContent = 'lock';
            lockText.textContent = 'ปลดล็อค';
        } else {
            document.body.classList.remove('is-locked');
            lockIcon.textContent = 'lock_open';
            lockText.textContent = 'ล็อค';
        }
    }
    
    function copyToClipboard(text) {
        if (!navigator.clipboard) {
            showToast('คัดลอกได้เฉพาะใน HTTPS', 'error');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            showToast('คัดลอกแล้ว!', 'success');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToast('คัดลอกไม่สำเร็จ', 'error');
        });
    }

    // Event Listeners
    roomsEl.addEventListener('input', debounce(recalcAll));
    roomsEl.addEventListener('click', (e) => {
        const setEl = e.target.closest(SELECTORS.set);
        const decoEl = e.target.closest(SELECTORS.decoItem);
        const roomEl = e.target.closest(SELECTORS.room);
        const wallpaperEl = e.target.closest(SELECTORS.wallpaperItem);

        if (e.target.dataset.act === 'del-room' && roomEl) {
            showConfirmation('ลบห้อง', `คุณต้องการลบห้อง "${roomEl.querySelector(SELECTORS.roomNameInput).value || roomEl.querySelector('.room-num').textContent}" ใช่หรือไม่?`)
                .then(confirmed => {
                    if (confirmed) { roomEl.remove(); renumber(); recalcAll(); showToast('ลบห้องแล้ว', 'warning'); }
                });
            return;
        }
        if (e.target.dataset.act === 'copy-room' && roomEl) {
            const payload = buildPayload();
            const roomData = payload.rooms.find(r => r.room_name === (roomEl.querySelector(SELECTORS.roomNameInput).value || roomEl.querySelector('.room-num').textContent));
            addRoom(roomData);
            showToast('คัดลอกห้องแล้ว', 'success');
            return;
        }
        if (e.target.dataset.act === 'add-set' && roomEl) { addSet(roomEl); showToast('เพิ่มชุดใหม่แล้ว', 'success'); return; }
        if (e.target.dataset.act === 'del-set' && setEl) { setEl.remove(); renumber(); recalcAll(); showToast('ลบชุดแล้ว', 'warning'); return; }
        if (e.target.dataset.act === 'add-deco' && roomEl) { addDeco(roomEl); showToast('เพิ่มของตกแต่งแล้ว', 'success'); return; }
        if (e.target.dataset.act === 'del-deco' && decoEl) { decoEl.remove(); renumber(); recalcAll(); showToast('ลบของตกแต่งแล้ว', 'warning'); return; }
        if (e.target.dataset.act === 'add-wallpaper' && roomEl) { addWallpaper(roomEl); showToast('เพิ่มวอลเปเปอร์แล้ว', 'success'); return; }
        if (e.target.dataset.act === 'del-wallpaper' && wallpaperEl) { wallpaperEl.remove(); renumber(); recalcAll(); showToast('ลบวอลเปเปอร์แล้ว', 'warning'); return; }
        if (e.target.dataset.act === 'add-wall' && wallpaperEl) { addWall(wallpaperEl); showToast('เพิ่มผนังใหม่แล้ว', 'success'); return; }
        if (e.target.dataset.act === 'del-wall' && e.target.closest('.wall-input-row')) { e.target.closest('.wall-input-row').remove(); recalcDebounced(); showToast('ลบผนังแล้ว', 'warning'); return; }
        if (e.target.dataset.act === 'toggle-suspend' && roomEl) { 
            const isSuspended = roomEl.dataset.suspended === 'true';
            roomEl.dataset.suspended = (!isSuspended).toString();
            roomEl.classList.toggle('is-suspended', !isSuspended);
            recalcDebounced();
            showToast(isSuspended ? 'ยกเลิกระงับห้อง' : 'ระงับการคำนวณห้อง', 'warning');
            return;
        }

        const roomMenuBtn = e.target.closest(SELECTORS.roomMenuBtn);
        if (roomMenuBtn) {
            e.preventDefault();
            const dropdown = roomMenuBtn.closest('.menu-container').querySelector(SELECTORS.roomMenuDropdown);
            dropdown.classList.toggle('show');
            return;
        }

        const setMenuBtn = e.target.closest(SELECTORS.setMenuBtn);
        if (setMenuBtn) {
            e.preventDefault();
            const dropdown = setMenuBtn.closest('.menu-container').querySelector(SELECTORS.setMenuDropdown);
            dropdown.classList.toggle('show');
            return;
        }
        
        const decoMenuBtn = e.target.closest(SELECTORS.decoMenuBtn);
        if (decoMenuBtn) {
            e.preventDefault();
            const dropdown = decoMenuBtn.closest('.menu-container').querySelector(SELECTORS.decoMenuDropdown);
            dropdown.classList.toggle('show');
            return;
        }

        const wallpaperMenuBtn = e.target.closest(SELECTORS.wallpaperMenuBtn);
        if (wallpaperMenuBtn) {
            e.preventDefault();
            const dropdown = wallpaperMenuBtn.closest('.menu-container').querySelector(SELECTORS.wallpaperMenuDropdown);
            dropdown.classList.toggle('show');
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', () => {
        showConfirmation('ล้างทั้งหมด', 'คุณต้องการล้างข้อมูลทั้งหมดใช่หรือไม่? ข้อมูลจะหายไป')
            .then(confirmed => {
                if (confirmed) {
                    localStorage.removeItem(STORAGE_KEY);
                    location.reload();
                }
            });
    });
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ล็อคหน้าจอแล้ว' : 'ปลดล็อคหน้าจอแล้ว', 'warning');
    });
    
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        copyToClipboard(JSON.stringify(payload, null, 2));
    });
    
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const text = buildCopyText(options);
            copyToClipboard(text);
        }
    });
    
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });
    
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });
    
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const jsonData = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const payload = JSON.parse(jsonData);
            document.querySelector('input[name="customer_name"]').value = payload.customer_name;
            document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
            document.querySelector('input[name="customer_address"]').value = payload.customer_address;
            roomsEl.innerHTML = ""; roomCount = 0;
            if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
            else addRoom();
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
        } catch(e) {
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
        }
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });
    
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marnthara-data-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('ข้อมูลถูกส่งออกแล้ว', 'success');
    });

    document.addEventListener('click', (e) => {
        const menuDropdowns = document.querySelectorAll('.menu-dropdown');
        menuDropdowns.forEach(dropdown => {
            const menuBtn = dropdown.closest('.menu-container').querySelector('button');
            if (!menuBtn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
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
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
                document.querySelector('input[name="customer_address"]').value = payload.customer_address;
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