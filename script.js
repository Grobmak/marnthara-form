(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5;

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
        stylePlus: s => PRICING.style_surcharge[s] ?? 0,
        heightPlus: h => {
            const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
            for (const entry of sorted) {
                if (h > entry.threshold) return entry.add_per_m;
            }
            return 0;
        }
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', copyJsonBtn: '#copyJsonBtn', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomHeaderBtn: '#addRoomHeaderBtn', submitBtn: '#submitBtn',
        grandTotal: '#grandTotal', setCount: '#setCount', grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '.room', set: '.set', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '.deco-item',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '.wallpaper-item', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        toastContainer: '#toast-container',
        grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        grandWallpaper: '#grandWallpaper',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
        grandFabricWrap: '#grandFabricWrap', grandSheerFabricWrap: '#grandSheerFabricWrap', grandOpaqueTrackWrap: '#grandOpaqueTrackWrap', grandSheerTrackWrap: '#grandSheerTrackWrap', grandWallpaperWrap: '#grandWallpaperWrap'
    };
    
    // Global state variables
    let rooms = [];
    let customerInfo = { name: '', address: '', phone: '' };
    let isLocked = false;

    const toNum = v => { if (typeof v === 'string') v = v.replace(/,/g, ''); return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0; }
    const fmt = (n, fixed = 2, asCurrency = false) => {
        if (!Number.isFinite(n)) return "0";
        const options = asCurrency
            ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
            : { minimumFractionDigits: fixed, maximumFractionDigits: fixed };
        return n.toLocaleString("th-TH", options);
    }
    const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
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
    }
    const showToast = (message, type = 'default') => {
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
        setTimeout(() => { toast.classList.remove('show'); toast.addEventListener('transitionend', () => toast.remove()); }, 3000);
    }
    const populatePriceOptions = (prices, selectedValue) => {
        let html = `<option value="" hidden>เลือก</option>`;
        prices.forEach(p => {
            const isSelected = String(p) === String(selectedValue);
            html += `<option value="${p}" ${isSelected ? 'selected' : ''}>${p.toLocaleString("th-TH")}</option>`;
        });
        return html;
    }

    const calculateSet = (room, set) => {
        let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
        const w = toNum(set.width_m), h = toNum(set.height_m);
        const baseRaw = toNum(room.price_per_m_raw);
        const style = room.style;
        const hPlus = CALC.heightPlus(h);
        const sPlus = CALC.stylePlus(style);
        const variant = set.fabric_variant;
        
        if (w > 0 && h > 0) {
            if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                opaqueYards = CALC.fabricYardage(style, w);
                opaqueTrack = w;
            }
            if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                const sheerBase = toNum(set.sheer_price_per_m);
                sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                sheerYards = CALC.fabricYardage(style, w);
                sheerTrack = w;
            }
        }
        return { opaquePrice, sheerPrice, opaqueYards, sheerYards, opaqueTrack, sheerTrack };
    }
    
    const calculateDeco = (deco) => {
        const w = toNum(deco.width_m), h = toNum(deco.height_m), price_sqyd = toNum(deco.price_sqyd);
        const price = Math.round(w * h * SQM_TO_SQYD * price_sqyd);
        return { price };
    }

    const calculateWallpaper = (wallpaper) => {
        const h = toNum(wallpaper.height_m), price_roll = toNum(wallpaper.price_per_roll);
        const total_width = wallpaper.widths.reduce((sum, width) => sum + toNum(width), 0);
        const sqm = total_width * h;
        const rolls = Math.ceil(sqm / WALLPAPER_SQM_PER_ROLL);
        const price = rolls * price_roll;
        return { price, sqm, rolls };
    }

    const buildPayload = () => {
        return {
            customer_name: customerInfo.name,
            customer_address: customerInfo.address,
            customer_phone: customerInfo.phone,
            isLocked: isLocked,
            rooms: rooms.map(room => ({
                room_name: room.name,
                price_per_m_raw: toNum(room.price_per_m_raw),
                style: room.style,
                sets: room.sets.map(set => ({
                    ...set,
                    width_m: toNum(set.width_m),
                    height_m: toNum(set.height_m),
                    sheer_price_per_m: toNum(set.sheer_price_per_m),
                })),
                decorations: room.decorations.map(deco => ({
                    ...deco,
                    width_m: toNum(deco.width_m),
                    height_m: toNum(deco.height_m),
                    price_sqyd: toNum(deco.price_sqyd),
                })),
                wallpapers: room.wallpapers.map(wallpaper => ({
                    ...wallpaper,
                    height_m: toNum(wallpaper.height_m),
                    price_per_roll: toNum(wallpaper.price_per_roll),
                    widths: wallpaper.widths.map(toNum),
                }))
            }))
        };
    }
    const saveState = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
    }
    const updateLockState = () => {
        document.querySelectorAll('input, select, button').forEach(el => {
            const isDelBtn = el.dataset.act && el.dataset.act.startsWith('del');
            const isAddBtn = el.dataset.act && el.dataset.act.startsWith('add');
            if (isDelBtn || isAddBtn) {
                el.disabled = isLocked;
            }
        });
        document.querySelector('#lockBtn .lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
    }

    const renumber = () => {
        const roomsEl = document.querySelectorAll(SELECTORS.room);
        roomsEl.forEach((roomEl, rIdx) => {
            roomEl.dataset.index = rIdx;
            const input = roomEl.querySelector('input[name="room_name"]');
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            
            const allItems = roomEl.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            allItems.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = allItems.length > 1 ? `${iIdx + 1}/${allItems.length}` : `${iIdx + 1}`;
            });
        });
    }

    const recalculateAll = () => {
        let grandTotal = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0, grandWallpaperRolls = 0;
        let setCountTotal = 0, setCountSets = 0, setCountDeco = 0;
        
        rooms.forEach((room, roomIndex) => {
            let roomSum = 0;
            const roomEl = document.querySelector(`${SELECTORS.room}[data-index="${roomIndex}"]`);
            if (!roomEl) return;
            
            room.sets.forEach((set, setIndex) => {
                const setEl = roomEl.querySelectorAll(SELECTORS.set)[setIndex];
                if (set.is_suspended) {
                    setEl.querySelector('.summary').textContent = 'ระงับการใช้งาน';
                    return;
                }
                const { opaquePrice, sheerPrice, opaqueYards, sheerYards, opaqueTrack, sheerTrack } = calculateSet(room, set);
                setEl.querySelector('[data-set-price-total]').textContent = fmt(opaquePrice + sheerPrice, 0, true);
                setEl.querySelector('[data-set-price-opaque]').textContent = fmt(opaquePrice, 0, true);
                setEl.querySelector('[data-set-price-sheer]').textContent = fmt(sheerPrice, 0, true);
                setEl.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYards, 2);
                setEl.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYards, 2);
                setEl.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                setEl.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);
    
                roomSum += opaquePrice + sheerPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });
            
            room.decorations.forEach((deco, decoIndex) => {
                const decoEl = roomEl.querySelectorAll(SELECTORS.decoItem)[decoIndex];
                if (deco.is_suspended) {
                    decoEl.querySelector('.summary').textContent = 'ระงับการใช้งาน';
                    return;
                }
                const { price } = calculateDeco(deco);
                decoEl.querySelector('[data-deco-price]').textContent = fmt(price, 0, true);
                roomSum += price;
            });
            
            room.wallpapers.forEach((wallpaper, wallpaperIndex) => {
                const wallpaperEl = roomEl.querySelectorAll(SELECTORS.wallpaperItem)[wallpaperIndex];
                if (wallpaper.is_suspended) {
                    wallpaperEl.querySelector('.summary').textContent = 'ระงับการใช้งาน';
                    return;
                }
                const { price, sqm, rolls } = calculateWallpaper(wallpaper);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = fmt(price, 0, true);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(sqm, 2);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = fmt(rolls, 0);
                roomSum += price;
                grandWallpaperRolls += rolls;
            });
    
            roomEl.querySelector('[data-room-brief] .price').textContent = fmt(roomSum, 0, true);
            roomEl.querySelector('[data-room-brief] .num:nth-of-type(1)').textContent = room.sets.length + room.decorations.length + room.wallpapers.length;
            roomEl.querySelector('[data-room-brief] .num:nth-of-type(2)').textContent = room.sets.length;
            grandTotal += roomSum;
            setCountTotal += room.sets.length + room.decorations.length + room.wallpapers.length;
            setCountSets += room.sets.length;
            setCountDeco += room.decorations.length;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = setCountTotal;
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandWallpaper).textContent = fmt(grandWallpaperRolls, 0) + " ม้วน";
    }

    const render = () => {
        const roomsEl = document.querySelector(SELECTORS.roomsContainer);
        roomsEl.innerHTML = '';
        rooms.forEach((room, roomIndex) => {
            const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
            const roomEl = frag.querySelector(SELECTORS.room);
            roomEl.dataset.index = roomIndex;
            
            const roomNameInput = roomEl.querySelector('input[name="room_name"]');
            if (roomNameInput) roomNameInput.value = room.name || '';
            roomEl.querySelector('select[name="room_price_per_m"]').innerHTML = populatePriceOptions(PRICING.fabric, room.price_per_m_raw);
            roomEl.querySelector('select[name="room_style"]').value = room.style || '';

            room.sets.forEach(set => renderSet(roomEl, set));
            room.decorations.forEach(deco => renderDeco(roomEl, deco));
            room.wallpapers.forEach(wallpaper => renderWallpaper(roomEl, wallpaper));
            
            roomsEl.appendChild(roomEl);
        });

        renumber();
        recalculateAll();

        document.querySelector('input[name="customer_name"]').value = customerInfo.name;
        document.querySelector('input[name="customer_address"]').value = customerInfo.address;
        document.querySelector('input[name="customer_phone"]').value = customerInfo.phone;
        
        updateLockState();
        saveState();
    }
    const renderSet = (roomEl, set) => {
        const setsWrap = roomEl.querySelector(SELECTORS.setsContainer);
        const frag = document.querySelector(SELECTORS.setTpl).content.cloneNode(true);
        const setEl = frag.querySelector(SELECTORS.set);
        setEl.dataset.suspended = set.is_suspended;
        setEl.classList.toggle('is-suspended', set.is_suspended);
        if (set.is_suspended) setEl.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
        
        setEl.querySelector('input[name="width_m"]').value = set.width_m ?? '';
        setEl.querySelector('input[name="height_m"]').value = set.height_m ?? '';
        setEl.querySelector('select[name="fabric_variant"]').value = set.fabric_variant || 'ทึบ';
        setEl.querySelector('select[name="open_type"]').value = set.open_type || '';
        setEl.querySelector('select[name="sheer_price_per_m"]').innerHTML = populatePriceOptions(PRICING.sheer, set.sheer_price_per_m);

        toggleSetFabricUI(setEl);
        setsWrap.appendChild(frag);
    }
    
    const renderDeco = (roomEl, deco) => {
        const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
        const decoEl = frag.querySelector(SELECTORS.decoItem);
        decoEl.dataset.suspended = deco.is_suspended;
        decoEl.classList.toggle('is-suspended', deco.is_suspended);
        if (deco.is_suspended) decoEl.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';

        decoEl.querySelector('[name="deco_type"]').value = deco.type || "";
        decoEl.querySelector('[name="deco_width_m"]').value = deco.width_m ?? "";
        decoEl.querySelector('[name="deco_height_m"]').value = deco.height_m ?? "";
        decoEl.querySelector('[name="deco_price_sqyd"]').value = fmt(deco.price_sqyd, 0, true) ?? "";
        decoWrap.appendChild(frag);
    }
    const renderWallpaper = (roomEl, wallpaper) => {
        const wallpaperWrap = roomEl.querySelector(SELECTORS.wallpapersContainer);
        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        const wallpaperEl = frag.querySelector(SELECTORS.wallpaperItem);
        wallpaperEl.dataset.suspended = wallpaper.is_suspended;
        wallpaperEl.classList.toggle('is-suspended', wallpaper.is_suspended);
        if (wallpaper.is_suspended) wallpaperEl.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';

        wallpaperEl.querySelector('[name="wallpaper_height_m"]').value = wallpaper.height_m ?? "";
        wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value = fmt(wallpaper.price_per_roll, 0, true) ?? "";
        const wallsContainer = wallpaperEl.querySelector(SELECTORS.wallsContainer);
        wallpaper.widths.forEach(width => {
            const wallFrag = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
            wallFrag.querySelector('input[name="wall_width_m"]').value = width;
            wallsContainer.appendChild(wallFrag);
        });
        wallpaperWrap.appendChild(frag);
    }
    const toggleSetFabricUI = (setEl) => {
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
        setEl.querySelector('[data-sheer-wrap]').classList.toggle("hidden", !hasSheer);
        setEl.querySelector('[data-set-options-row]').classList.toggle("three-col", hasSheer);
        setEl.querySelector("[data-sheer-price-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-yardage-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-track-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-opaque-price-label]").classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-yardage-label]").classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-track-label]").classList.toggle("hidden", !hasOpaque);
    }
    
    // State Mutation
    const addRoom = () => {
        if (isLocked) return;
        const newRoom = {
            name: '',
            price_per_m_raw: '',
            style: '',
            sets: [{ width_m: '', height_m: '', fabric_variant: 'ทึบ', open_type: '', sheer_price_per_m: '', is_suspended: false }],
            decorations: [],
            wallpapers: []
        };
        rooms.push(newRoom);
        render();
        showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }
    const deleteRoom = (roomIndex) => {
        rooms.splice(roomIndex, 1);
        render();
        showToast('ลบห้องแล้ว', 'success');
    }
    const addSet = (roomIndex) => {
        if (isLocked) return;
        const newSet = { width_m: '', height_m: '', fabric_variant: 'ทึบ', open_type: '', sheer_price_per_m: '', is_suspended: false };
        rooms[roomIndex].sets.push(newSet);
        render();
        showToast('เพิ่มจุดผ้าม่านแล้ว', 'success');
    }
    const deleteSet = (roomIndex, setIndex) => {
        rooms[roomIndex].sets.splice(setIndex, 1);
        render();
        showToast('ลบจุดผ้าม่านแล้ว', 'success');
    }
    const addDeco = (roomIndex) => {
        if (isLocked) return;
        const newDeco = { type: '', width_m: '', height_m: '', price_sqyd: '', is_suspended: false };
        rooms[roomIndex].decorations.push(newDeco);
        render();
        showToast('เพิ่มรายการตกแต่งแล้ว', 'success');
    }
    const deleteDeco = (roomIndex, decoIndex) => {
        rooms[roomIndex].decorations.splice(decoIndex, 1);
        render();
        showToast('ลบรายการตกแต่งแล้ว', 'success');
    }
    const addWallpaper = (roomIndex) => {
        if (isLocked) return;
        const newWallpaper = { height_m: '', price_per_roll: '', widths: [''], is_suspended: false };
        rooms[roomIndex].wallpapers.push(newWallpaper);
        render();
        showToast('เพิ่มรายการวอลเปเปอร์แล้ว', 'success');
    }
    const deleteWallpaper = (roomIndex, wallpaperIndex) => {
        rooms[roomIndex].wallpapers.splice(wallpaperIndex, 1);
        render();
        showToast('ลบรายการวอลเปเปอร์แล้ว', 'success');
    }
    const addWall = (roomIndex, wallpaperIndex) => {
        if (isLocked) return;
        rooms[roomIndex].wallpapers[wallpaperIndex].widths.push('');
        render();
    }
    const deleteWall = (roomIndex, wallpaperIndex, wallIndex) => {
        rooms[roomIndex].wallpapers[wallpaperIndex].widths.splice(wallIndex, 1);
        render();
    }
    const toggleSuspend = (roomIndex, type, itemIndex) => {
        let item;
        if (type === 'set') item = rooms[roomIndex].sets[itemIndex];
        else if (type === 'deco') item = rooms[roomIndex].decorations[itemIndex];
        else if (type === 'wallpaper') item = rooms[roomIndex].wallpapers[itemIndex];
        if (item) item.is_suspended = !item.is_suspended;
        render();
        showToast(`รายการถูก${item?.is_suspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }
    const clearAllData = () => {
        rooms = [];
        customerInfo = { name: '', address: '', phone: '' };
        addRoom();
        render();
        showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
    }
    const toggleLock = () => {
        isLocked = !isLocked;
        render();
        showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว 🔒' : 'ฟอร์มถูกปลดล็อคแล้ว 🔓', 'info');
    }
    
    // Event listeners
    document.addEventListener('DOMContentLoaded', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                customerInfo.name = payload.customer_name ?? '';
                customerInfo.address = payload.customer_address ?? '';
                customerInfo.phone = payload.customer_phone ?? '';
                rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
                isLocked = payload.isLocked ?? false;
            } catch (err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY);
                rooms = [];
            }
        }
        if (rooms.length === 0) {
            addRoom();
        } else {
            render();
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', addRoom);
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', () => showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้').then(res => res && clearAllData()));
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', toggleLock);
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async () => {
        const payload = buildPayload();
        try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            showToast('คัดลอก JSON แล้ว', 'success');
        } catch (err) {
            console.error('Failed to copy JSON: ', err);
            showToast('ไม่สามารถคัดลอก JSON ได้', 'error');
        }
    });

    document.addEventListener('input', debounce(e => {
        const target = e.target;
        const roomEl = target.closest(SELECTORS.room);
        const roomIndex = roomEl ? Number(roomEl.dataset.index) : -1;
        const setEl = target.closest(SELECTORS.set);
        const decoEl = target.closest(SELECTORS.decoItem);
        const wallpaperEl = target.closest(SELECTORS.wallpaperItem);
        const wallEl = target.closest('.wall-input-row');

        if (target.name === 'customer_name' || target.name === 'customer_address' || target.name === 'customer_phone') {
            customerInfo[target.name.replace('customer_', '')] = target.value;
        } else if (roomIndex !== -1) {
            if (target.name === 'room_name') {
                rooms[roomIndex].name = target.value;
            } else if (target.name === 'room_price_per_m') {
                rooms[roomIndex].price_per_m_raw = target.value;
            } else if (target.name === 'room_style') {
                rooms[roomIndex].style = target.value;
            } else if (setEl) {
                const setIndex = Array.from(roomEl.querySelectorAll(SELECTORS.set)).indexOf(setEl);
                rooms[roomIndex].sets[setIndex][target.name.replace('_m', '')] = target.value;
            } else if (decoEl) {
                const decoIndex = Array.from(roomEl.querySelectorAll(SELECTORS.decoItem)).indexOf(decoEl);
                rooms[roomIndex].decorations[decoIndex][target.name.replace('deco_', '')] = target.value;
            } else if (wallpaperEl) {
                const wallpaperIndex = Array.from(roomEl.querySelectorAll(SELECTORS.wallpaperItem)).indexOf(wallpaperEl);
                if (target.name === 'wallpaper_height_m') {
                    rooms[roomIndex].wallpapers[wallpaperIndex].height_m = target.value;
                } else if (target.name === 'wallpaper_price_roll') {
                    rooms[roomIndex].wallpapers[wallpaperIndex].price_per_roll = target.value;
                } else if (wallEl && target.name === 'wall_width_m') {
                    const wallIndex = Array.from(wallpaperEl.querySelectorAll('.wall-input-row')).indexOf(wallEl);
                    rooms[roomIndex].wallpapers[wallpaperIndex].widths[wallIndex] = target.value;
                }
            }
        }
        render();
    }, 120));

    document.addEventListener('click', async e => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const action = btn.dataset.act;
        const roomEl = btn.closest(SELECTORS.room);
        const roomIndex = roomEl ? Number(roomEl.dataset.index) : -1;
        
        if (action === 'del-room' && await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) {
            deleteRoom(roomIndex);
        } else if (action === 'add-set') {
            addSet(roomIndex);
        } else if (action === 'del-set' && await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) {
            const setIndex = Array.from(roomEl.querySelectorAll(SELECTORS.set)).indexOf(btn.closest(SELECTORS.set));
            deleteSet(roomIndex, setIndex);
        } else if (action === 'add-deco') {
            addDeco(roomIndex);
        } else if (action === 'del-deco' && await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) {
            const decoIndex = Array.from(roomEl.querySelectorAll(SELECTORS.decoItem)).indexOf(btn.closest(SELECTORS.decoItem));
            deleteDeco(roomIndex, decoIndex);
        } else if (action === 'add-wallpaper') {
            addWallpaper(roomIndex);
        } else if (action === 'del-wallpaper' && await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) {
            const wallpaperIndex = Array.from(roomEl.querySelectorAll(SELECTORS.wallpaperItem)).indexOf(btn.closest(SELECTORS.wallpaperItem));
            deleteWallpaper(roomIndex, wallpaperIndex);
        } else if (action === 'add-wall') {
            const wallpaperEl = btn.closest(SELECTORS.wallpaperItem);
            const wallpaperIndex = Array.from(roomEl.querySelectorAll(SELECTORS.wallpaperItem)).indexOf(wallpaperEl);
            addWall(roomIndex, wallpaperIndex);
        } else if (action === 'del-wall') {
            const wallpaperEl = btn.closest(SELECTORS.wallpaperItem);
            const wallpaperIndex = Array.from(roomEl.querySelectorAll(SELECTORS.wallpaperItem)).indexOf(wallpaperEl);
            const wallIndex = Array.from(wallpaperEl.querySelectorAll('.wall-input-row')).indexOf(btn.closest('.wall-input-row'));
            deleteWall(roomIndex, wallpaperIndex, wallIndex);
        } else if (action === 'toggle-suspend') {
            const itemEl = btn.closest('.set, .deco-item, .wallpaper-item');
            let type, itemIndex;
            if (itemEl.classList.contains('set')) {
                type = 'set';
                itemIndex = Array.from(roomEl.querySelectorAll(SELECTORS.set)).indexOf(itemEl);
            } else if (itemEl.classList.contains('deco-item')) {
                type = 'deco';
                itemIndex = Array.from(roomEl.querySelectorAll(SELECTORS.decoItem)).indexOf(itemEl);
            } else if (itemEl.classList.contains('wallpaper-item')) {
                type = 'wallpaper';
                itemIndex = Array.from(roomEl.querySelectorAll(SELECTORS.wallpaperItem)).indexOf(itemEl);
            }
            toggleSuspend(roomIndex, type, itemIndex);
        }
    });

})();