(function() {
    'use strict';
    // --- CONSTANTS ---
    const APP_VERSION = "input-ui/pro-5.0.1";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v5";
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

    // --- SELECTORS ---
    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', lockBtn: '#lockBtn', addRoomFab: '#addRoomFab', submitBtn: '#submitBtn', clearAllBtn: '#clearAllBtn',
        grandTotal: '#grandTotal', 
        setCount: '#setCount', setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric', grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]', roomPricePerM: 'select[name="room_price_per_m"]', roomStyle: 'select[name="room_style"]',
        toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', copyJsonBtn: '#copyJsonBtn',
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        materialSheet: '#materialSheet', showSheetBtn: '#showSheetBtn',
    };

    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    if(orderForm) orderForm.action = WEBHOOK_URL;
    let roomCount = 0; 
    let isLocked = false;
    let autoSaveTimeout = null;

    // --- Utility Functions ---
    const toNum = v => { if (typeof v === 'string') v = v.replace(/,/g, ''); return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0; }; 
    const clamp01 = v => Math.max(0, toNum(v)); 
    const fmt = (n, fixed = 2, asCurrency = false) => { if (!Number.isFinite(n)) return "0"; const options = asCurrency ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: fixed, maximumFractionDigits: fixed }; return n.toLocaleString("th-TH", options); }; 
    const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }; 
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0; 
    const heightPlus = h => { const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold); for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; } return 0; };
    const showToast = (message, type = 'default') => {
        const toastContainer = document.querySelector(SELECTORS.toastContainer);
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('visible'), 10);
        setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 250); }, 3000);
    };
    const showDialog = (selector) => {
        return new Promise(resolve => {
            const modal = document.querySelector(selector);
            if (!modal) return resolve(false);
            const confirmBtn = modal.querySelector('[data-action="confirm"], #modalConfirm');
            const cancelBtn = modal.querySelector('[data-action="cancel"], #modalCancel');
            const handleConfirm = () => { modal.classList.remove('visible'); confirmBtn.removeEventListener('click', handleConfirm); cancelBtn.removeEventListener('click', handleCancel); resolve(true); };
            const handleCancel = () => { modal.classList.remove('visible'); confirmBtn.removeEventListener('click', handleConfirm); cancelBtn.removeEventListener('click', handleCancel); resolve(false); };
            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            modal.classList.add('visible');
        });
    };
    const showMaterialSheet = () => {
        const sheet = document.querySelector(SELECTORS.materialSheet);
        if (sheet) sheet.classList.add('visible');
    };
    const hideMaterialSheet = () => {
        const sheet = document.querySelector(SELECTORS.materialSheet);
        if (sheet) sheet.classList.remove('visible');
    };

    // --- Core App Functions ---
    const renumber = () => {
        const rooms = document.querySelectorAll(SELECTORS.room);
        rooms.forEach((room, i) => {
            room.dataset.roomIndex = i + 1;
            const roomTitle = room.querySelector('summary .md-text-field label');
            if (roomTitle) roomTitle.textContent = `ห้องที่ ${i + 1}`;
            
            const sets = room.querySelectorAll(SELECTORS.set);
            sets.forEach((set, j) => {
                const itemBadge = set.querySelector('[data-item-title]');
                if (itemBadge) itemBadge.textContent = `${j + 1}`;
            });
            const decos = room.querySelectorAll(SELECTORS.decoItem);
            decos.forEach((deco, j) => {
                const itemBadge = deco.querySelector('[data-item-title]');
                if (itemBadge) itemBadge.textContent = `${j + 1}`;
            });
            const wallpapers = room.querySelectorAll(SELECTORS.wallpaperItem);
            wallpapers.forEach((wallpaper, j) => {
                const itemBadge = wallpaper.querySelector('[data-item-title]');
                if (itemBadge) itemBadge.textContent = `${j + 1}`;
            });
        });
    };
    const recalcItem = (itemEl) => {
        const form = itemEl.closest('form');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        let price = 0; let yards = 0; let trackM = 0;
        let sheerYards = 0; let sheerTrackM = 0;

        if (itemEl.matches(SELECTORS.set)) {
            const roomEl = itemEl.closest(SELECTORS.room);
            const roomStyle = roomEl.querySelector(SELECTORS.roomStyle).value;
            const roomPricePerM = toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value);
            const roomSheerPricePerM = toNum(itemEl.querySelector('select[name="sheer_price_per_m"]').value);

            const width = clamp01(data.width_m);
            const styleSurcharge = stylePlus(roomStyle);
            const heightSurcharge = heightPlus(clamp01(data.height_m));
            
            if (data.fabric_variant === 'ทึบ' || data.fabric_variant === 'ทึบ&โปร่ง') {
                yards = CALC.fabricYardage(roomStyle, width);
                trackM = width;
                price += (yards * roomPricePerM) + (trackM * 100) + styleSurcharge + heightSurcharge;
            }
            if (data.fabric_variant === 'โปร่ง' || data.fabric_variant === 'ทึบ&โปร่ง') {
                sheerYards = CALC.fabricYardage(roomStyle, width);
                sheerTrackM = width;
                price += (sheerYards * roomSheerPricePerM) + (sheerTrackM * 100) + styleSurcharge + heightSurcharge;
            }
            
            itemEl.querySelector('[data-set-price-total]').textContent = fmt(price, 0, true);
            itemEl.querySelector('[data-set-price-opaque]').textContent = fmt(price - (sheerYards * roomSheerPricePerM) - (sheerTrackM * 100), 0, true);
            itemEl.querySelector('[data-set-price-sheer]').textContent = fmt((sheerYards * roomSheerPricePerM) + (sheerTrackM * 100), 0, true);
            itemEl.querySelector('[data-set-yardage-opaque]').textContent = fmt(yards);
            itemEl.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYards);
            itemEl.querySelector('[data-set-opaque-track]').textContent = fmt(trackM);
            itemEl.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrackM);

        } else if (itemEl.matches(SELECTORS.decoItem)) {
            const width = clamp01(data.deco_width_m);
            const height = clamp01(data.deco_height_m);
            const priceSqYd = toNum(data.deco_price_sqyd);
            const sqYds = (width * height) * SQM_TO_SQYD;
            price = sqYds * priceSqYd;
            itemEl.querySelector('[data-deco-summary]').innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> • พื้นที่: <span class="price">${fmt(sqYds)}</span> ตร.หลา`;

        } else if (itemEl.matches(SELECTORS.wallpaperItem)) {
            const height = clamp01(data.wallpaper_height_m);
            const priceRoll = toNum(data.wallpaper_price_roll);
            const wallWidths = Array.from(itemEl.querySelectorAll('input[name="wall_width_m"]')).map(input => clamp01(input.value));
            const totalWidth = wallWidths.reduce((sum, w) => sum + w, 0);
            const totalSqM = totalWidth * height;
            const totalRolls = Math.ceil(totalSqM / WALLPAPER_SQM_PER_ROLL);
            price = totalRolls * priceRoll;
            itemEl.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${fmt(price, 0, true)}</span> • พื้นที่: <span class="price">${fmt(totalSqM)}</span> ตร.ม. • ใช้ <span class="price">${totalRolls}</span> ม้วน`;
        }
        recalcAll();
    };
    const recalcAll = () => {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        
        const allItems = document.querySelectorAll(`${SELECTORS.set}:not(.is-suspended), ${SELECTORS.decoItem}:not(.is-suspended), ${SELECTORS.wallpaperItem}:not(.is-suspended)`);
        allItems.forEach(itemEl => {
            const form = itemEl.closest('form');
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            if (itemEl.matches(SELECTORS.set)) {
                const roomEl = itemEl.closest(SELECTORS.room);
                const roomStyle = roomEl.querySelector(SELECTORS.roomStyle).value;
                const roomPricePerM = toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value);
                const roomSheerPricePerM = toNum(itemEl.querySelector('select[name="sheer_price_per_m"]').value);
                
                const width = clamp01(data.width_m);
                const styleSurcharge = stylePlus(roomStyle);
                const heightSurcharge = heightPlus(clamp01(data.height_m));
                
                if (data.fabric_variant === 'ทึบ' || data.fabric_variant === 'ทึบ&โปร่ง') {
                    const yards = CALC.fabricYardage(roomStyle, width);
                    const trackM = width;
                    grand += (yards * roomPricePerM) + (trackM * 100) + styleSurcharge + heightSurcharge;
                    grandOpaqueYards += yards;
                    grandOpaqueTrack += trackM;
                }
                if (data.fabric_variant === 'โปร่ง' || data.fabric_variant === 'ทึบ&โปร่ง') {
                    const sheerYards = CALC.fabricYardage(roomStyle, width);
                    const sheerTrackM = width;
                    grand += (sheerYards * roomSheerPricePerM) + (sheerTrackM * 100) + styleSurcharge + heightSurcharge;
                    grandSheerYards += sheerYards;
                    grandSheerTrack += sheerTrackM;
                }
            } else if (itemEl.matches(SELECTORS.decoItem)) {
                const width = clamp01(data.deco_width_m);
                const height = clamp01(data.deco_height_m);
                const priceSqYd = toNum(data.deco_price_sqyd);
                const sqYds = (width * height) * SQM_TO_SQYD;
                grand += sqYds * priceSqYd;
            } else if (itemEl.matches(SELECTORS.wallpaperItem)) {
                const height = clamp01(data.wallpaper_height_m);
                const priceRoll = toNum(data.wallpaper_price_roll);
                const wallWidths = Array.from(itemEl.querySelectorAll('input[name="wall_width_m"]')).map(input => clamp01(input.value));
                const totalWidth = wallWidths.reduce((sum, w) => sum + w, 0);
                const totalSqM = totalWidth * height;
                const totalRolls = Math.ceil(totalSqM / WALLPAPER_SQM_PER_ROLL);
                grand += totalRolls * priceRoll;
            }
        });
        
        const totalSets = [...document.querySelectorAll(`${SELECTORS.set}:not(.is-suspended)`)].reduce((sum, set) => sum + (set.querySelector('select[name="fabric_variant"]').value === "ทึบ&โปร่ง" ? 2 : 1), 0);
        const totalDeco = document.querySelectorAll(`${SELECTORS.decoItem}:not(.is-suspended), ${SELECTORS.wallpaperItem}:not(.is-suspended)`).length;
        const totalPoints = document.querySelectorAll(`.item-card:not(.is-suspended)`).length;
        
        // Update UI elements
        const grandTotalEl = document.querySelector(SELECTORS.grandTotal);
        if (grandTotalEl) grandTotalEl.textContent = fmt(grand, 0, true);

        const setCountEl = document.querySelector(SELECTORS.setCount);
        if (setCountEl) setCountEl.textContent = fmt(totalPoints, 0);
        
        const setCountSetsEl = document.querySelector(SELECTORS.setCountSets);
        if (setCountSetsEl) setCountSetsEl.textContent = fmt(totalSets, 0);
        
        const setCountDecoEl = document.querySelector(SELECTORS.setCountDeco);
        if (setCountDecoEl) setCountDecoEl.textContent = fmt(totalDeco, 0);
        
        const grandFabricEl = document.querySelector(SELECTORS.grandFabric);
        if (grandFabricEl) grandFabricEl.textContent = fmt(grandOpaqueYards, 2);
        
        const grandSheerFabricEl = document.querySelector(SELECTORS.grandSheerFabric);
        if (grandSheerFabricEl) grandSheerFabricEl.textContent = fmt(grandSheerYards, 2);
        
        const grandOpaqueTrackEl = document.querySelector(SELECTORS.grandOpaqueTrack);
        if (grandOpaqueTrackEl) grandOpaqueTrackEl.textContent = fmt(grandOpaqueTrack, 2);
        
        const grandSheerTrackEl = document.querySelector(SELECTORS.grandSheerTrack);
        if (grandSheerTrackEl) grandSheerTrackEl.textContent = fmt(grandSheerTrack, 2);
    };
    const addRoom = (prefill) => {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        const newRoom = frag.querySelector(SELECTORS.room);
        
        const styleSelect = newRoom.querySelector('select[name="room_style"]');
        if (styleSelect) {
            for (const key in PRICING.style_surcharge) {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = key;
                styleSelect.appendChild(option);
            }
        }
        
        const priceSelect = newRoom.querySelector('select[name="room_price_per_m"]');
        if (priceSelect) {
            PRICING.fabric.forEach(price => {
                const option = document.createElement('option');
                option.value = price;
                option.textContent = fmt(price, 0);
                priceSelect.appendChild(option);
            });
        }
        
        roomsEl.appendChild(newRoom);
        newRoom.classList.add('fade-in');
        
        if (prefill) { /* ... prefill logic ... */ }
        
        renumber(); recalcAll(); saveData();
        newRoom.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
    };
    const addSet = (btn) => {
        const roomEl = btn.closest(SELECTORS.room);
        if (!roomEl || isLocked) return;
        
        const setsContainer = roomEl.querySelector(SELECTORS.setsContainer);
        const frag = document.querySelector(SELECTORS.setTpl).content.cloneNode(true);
        const newSet = frag.querySelector(SELECTORS.set);
        
        const sheerPriceSelect = newSet.querySelector('select[name="sheer_price_per_m"]');
        if (sheerPriceSelect) {
            PRICING.sheer.forEach(price => {
                const option = document.createElement('option');
                option.value = price;
                option.textContent = fmt(price, 0);
                sheerPriceSelect.appendChild(option);
            });
        }
        
        setsContainer.appendChild(newSet);
        newSet.classList.add('fade-in');
        renumber(); recalcAll(); saveData();
    };
    const addDeco = (btn) => {
        const roomEl = btn.closest(SELECTORS.room);
        if (!roomEl || isLocked) return;
        const decosContainer = roomEl.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
        const newDeco = frag.querySelector(SELECTORS.decoItem);
        decosContainer.appendChild(newDeco);
        newDeco.classList.add('fade-in');
        renumber(); recalcAll(); saveData();
    };
    const addWallpaper = (btn) => {
        const roomEl = btn.closest(SELECTORS.room);
        if (!roomEl || isLocked) return;
        const wallpapersContainer = roomEl.querySelector(SELECTORS.wallpapersContainer);
        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        const newWallpaper = frag.querySelector(SELECTORS.wallpaperItem);
        wallpapersContainer.appendChild(newWallpaper);
        newWallpaper.classList.add('fade-in');
        addWall(newWallpaper.querySelector(SELECTORS.wallsContainer));
        renumber(); recalcAll(); saveData();
    };
    const addWall = (wallsContainer, prefillValue = '') => {
        const frag = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
        const newWall = frag.querySelector('.wall-input-row');
        const input = newWall.querySelector('input');
        input.value = prefillValue;
        wallsContainer.appendChild(newWall);
        recalcAll(); saveData();
    };
    const saveData = () => {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(() => {
            const state = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            showToast("บันทึกอัตโนมัติแล้ว");
        }, 1000);
    };
    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector('input[name="room_name"]').value,
                room_price_per_m: toNum(roomEl.querySelector('select[name="room_price_per_m"]').value),
                room_style: roomEl.querySelector('select[name="room_style"]').value,
                items: []
            };
            roomEl.querySelectorAll('.item-card').forEach(itemEl => {
                const itemData = Object.fromEntries(new FormData(itemEl.closest('form')).entries());
                itemData.suspended = itemEl.classList.contains('is-suspended');
                if (itemEl.matches(SELECTORS.set)) {
                    itemData.type = 'set';
                    itemData.calculated_price = toNum(itemEl.querySelector('[data-set-price-total]').textContent);
                } else if (itemEl.matches(SELECTORS.decoItem)) {
                    itemData.type = 'deco';
                } else if (itemEl.matches(SELECTORS.wallpaperItem)) {
                    itemData.type = 'wallpaper';
                    itemData.wall_widths_m = Array.from(itemEl.querySelectorAll('input[name="wall_width_m"]')).map(input => toNum(input.value));
                }
                roomData.items.push(itemData);
            });
            payload.rooms.push(roomData);
        });
        return payload;
    };
    const loadData = () => {
        const stateStr = localStorage.getItem(STORAGE_KEY);
        if (stateStr) {
            const state = JSON.parse(stateStr);
            if (state.customer_name) document.querySelector('input[name="customer_name"]').value = state.customer_name;
            if (state.customer_phone) document.querySelector('input[name="customer_phone"]').value = state.customer_phone;
            if (state.customer_address) document.querySelector('input[name="customer_address"]').value = state.customer_address;
            
            roomsEl.innerHTML = '';
            state.rooms.forEach(roomData => {
                const newRoom = addRoom(true);
                newRoom.querySelector('input[name="room_name"]').value = roomData.room_name;
                newRoom.querySelector('select[name="room_price_per_m"]').value = roomData.room_price_per_m;
                newRoom.querySelector('select[name="room_style"]').value = roomData.room_style;
                
                const setsContainer = newRoom.querySelector(SELECTORS.setsContainer);
                const decosContainer = newRoom.querySelector(SELECTORS.decorationsContainer);
                const wallpapersContainer = newRoom.querySelector(SELECTORS.wallpapersContainer);
                
                roomData.items.forEach(itemData => {
                    let newItem;
                    if (itemData.type === 'set') {
                        const frag = document.querySelector(SELECTORS.setTpl).content.cloneNode(true);
                        newItem = frag.querySelector(SELECTORS.set);
                        setsContainer.appendChild(newItem);
                        if (itemData.fabric_variant) newItem.querySelector('select[name="fabric_variant"]').value = itemData.fabric_variant;
                        if (itemData.open_type) newItem.querySelector('select[name="open_type"]').value = itemData.open_type;
                        if (itemData.width_m) newItem.querySelector('input[name="width_m"]').value = itemData.width_m;
                        if (itemData.height_m) newItem.querySelector('input[name="height_m"]').value = itemData.height_m;
                    } else if (itemData.type === 'deco') {
                        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
                        newItem = frag.querySelector(SELECTORS.decoItem);
                        decosContainer.appendChild(newItem);
                        if (itemData.deco_type) newItem.querySelector('select[name="deco_type"]').value = itemData.deco_type;
                        if (itemData.deco_width_m) newItem.querySelector('input[name="deco_width_m"]').value = itemData.deco_width_m;
                        if (itemData.deco_height_m) newItem.querySelector('input[name="deco_height_m"]').value = itemData.deco_height_m;
                        if (itemData.deco_price_sqyd) newItem.querySelector('input[name="deco_price_sqyd"]').value = itemData.deco_price_sqyd;
                    } else if (itemData.type === 'wallpaper') {
                        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
                        newItem = frag.querySelector(SELECTORS.wallpaperItem);
                        wallpapersContainer.appendChild(newItem);
                        if (itemData.wallpaper_height_m) newItem.querySelector('input[name="wallpaper_height_m"]').value = itemData.wallpaper_height_m;
                        if (itemData.wallpaper_price_roll) newItem.querySelector('input[name="wallpaper_price_roll"]').value = itemData.wallpaper_price_roll;
                        const wallsContainer = newItem.querySelector(SELECTORS.wallsContainer);
                        wallsContainer.innerHTML = '';
                        if (itemData.wall_widths_m && itemData.wall_widths_m.length > 0) {
                            itemData.wall_widths_m.forEach(width => addWall(wallsContainer, width));
                        } else {
                            addWall(wallsContainer);
                        }
                    }
                });
            });
            renumber(); recalcAll(); updateLockState();
        }
    };
    const clearAllData = async () => {
        const confirmed = await showDialog(SELECTORS.modal, "ล้างข้อมูลทั้งหมด", "คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้");
        if (confirmed) {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    };
    const toggleLock = () => {
        isLocked = !isLocked;
        document.body.classList.toggle('is-locked', isLocked);
        const lockIcon = document.querySelector(SELECTORS.lockBtn).querySelector('.material-symbols-outlined');
        const lockText = document.querySelector(SELECTORS.lockBtn).querySelector('.lock-text');
        if (lockIcon) lockIcon.textContent = isLocked ? 'lock' : 'lock_open';
        if (lockText) lockText.textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        showToast(isLocked ? 'ล็อค' : 'ปลดล็อค');
        updateLockState();
    };
    const updateLockState = () => {
        document.querySelectorAll('input, select, textarea').forEach(el => el.disabled = isLocked);
        document.querySelectorAll('.btn-outlined, .btn-outlined-secondary, .btn-outlined-tertiary, .fab, .danger').forEach(el => el.disabled = isLocked);
    };

    // --- EVENT LISTENERS ---
    window.addEventListener('load', loadData);

    document.addEventListener("change", (e) => {
        const itemEl = e.target.closest(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
        if (itemEl) recalcItem(itemEl);
        if (e.target.matches('input[name="room_name"], select[name="room_price_per_m"], select[name="room_style"]')) {
            recalcAll();
        }
        if (e.target.matches('select[name="fabric_variant"]')) {
            const wrap = e.target.closest(SELECTORS.set).querySelector(SELECTORS.sheerWrap);
            if (wrap) {
                if (e.target.value === 'ทึบ&โปร่ง') {
                    wrap.classList.remove('hidden');
                } else {
                    wrap.classList.add('hidden');
                }
            }
        }
        saveData();
    });

    document.addEventListener("input", debounce((e) => {
        const itemEl = e.target.closest(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
        if (itemEl) recalcItem(itemEl);
        if (e.target.matches('input[name="customer_name"], input[name="customer_phone"], input[name="customer_address"]')) {
            saveData();
        }
    }, 500));
    
    document.addEventListener("click", async (e) => {
        const btn = e.target.closest("button");
        if (!btn) {
            const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
            if (menuDropdown && menuDropdown.classList.contains('visible') && !e.target.closest('.menu-container')) {
                menuDropdown.classList.remove('visible');
            }
            if (e.target.matches(SELECTORS.materialSheet)) {
                hideMaterialSheet();
            }
            return;
        }
        if (btn.type !== 'submit' && btn.form !== orderForm) e.preventDefault();

        // Use a single action variable for clarity and robustness
        const action = btn.dataset.act || btn.id;
        
        const roomEl = btn.closest(SELECTORS.room);
        const itemEl = btn.closest('.item-card');

        switch (action) {
            case 'addRoomFab':
            case 'add-room':
                addRoom();
                break;
            case 'add-set':
                addSet(btn);
                break;
            case 'add-deco':
                addDeco(btn);
                break;
            case 'add-wallpaper':
                addWallpaper(btn);
                break;
            case 'add-wall':
                addWall(itemEl.querySelector(SELECTORS.wallsContainer));
                break;
            case 'del-room':
                if (await showDialog(SELECTORS.modal)) {
                    roomEl.remove();
                    renumber();
                    recalcAll();
                    saveData();
                }
                break;
            case 'del-set':
            case 'del-deco':
            case 'del-wallpaper':
                if (await showDialog(SELECTORS.modal)) {
                    itemEl.remove();
                    recalcAll();
                    saveData();
                }
                break;
            case 'del-wall':
                btn.closest('.wall-input-row').remove();
                recalcAll();
                saveData();
                break;
            case 'clear-set':
            case 'clear-deco':
            case 'clear-wallpaper':
                if (itemEl) {
                    const inputs = itemEl.querySelectorAll('input');
                    inputs.forEach(input => input.value = '');
                    const selects = itemEl.querySelectorAll('select');
                    selects.forEach(select => select.value = select.querySelector('option[hidden]')?.value || '');
                    recalcAll();
                    saveData();
                }
                break;
            case 'toggle-suspend':
                if (itemEl) {
                    itemEl.classList.toggle('is-suspended');
                    const icon = btn.querySelector('.material-symbols-outlined');
                    icon.textContent = itemEl.classList.contains('is-suspended') ? 'visibility' : 'visibility_off';
                    recalcAll();
                    saveData();
                    showToast(itemEl.classList.contains('is-suspended') ? "ระงับรายการแล้ว" : "ยกเลิกระงับรายการแล้ว");
                }
                break;
            case 'menuBtn':
                const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
                menuDropdown.classList.toggle('visible');
                break;
            case 'lockBtn':
                toggleLock();
                break;
            case 'clearAllBtn':
                clearAllData();
                break;
            case 'copyJsonBtn':
                const payload = buildPayload();
                navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                    .then(() => showToast("คัดลอก JSON แล้ว", "success"))
                    .catch(err => showToast("ไม่สามารถคัดลอกได้: " + err, "error"));
                break;
            case 'importBtn':
                document.querySelector(SELECTORS.importJsonArea).value = '';
                document.querySelector(SELECTORS.importModal).classList.add('visible');
                break;
            case 'importConfirm':
                try {
                    const jsonData = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(jsonData));
                    showToast("Import JSON สำเร็จ! กำลังโหลดข้อมูลใหม่...", "success");
                    location.reload();
                } catch (e) {
                    showToast("JSON ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง", "error");
                }
                break;
            case 'showSheetBtn':
                showMaterialSheet();
                break;
        }
    });

    const dialogs = document.querySelectorAll('.dialog-scrim');
    dialogs.forEach(dialog => {
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.classList.remove('visible');
            }
        });
    });
    
    const sheet = document.querySelector(SELECTORS.materialSheet);
    if(sheet) {
        sheet.addEventListener('click', (e) => {
            if (e.target === sheet) {
                hideMaterialSheet();
            }
        });
    }
    
    // Initial call
    loadData();
})();