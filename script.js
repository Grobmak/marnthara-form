(function() {
    'use strict';
    // --- CONSTANTS (unchanged) ---
    const APP_VERSION = "input-ui/pro-5.0.0";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v5";
    const SQM_TO_SQYD = 1.19599; const WALLPAPER_SQM_PER_ROLL = 5.3;
    const PRICING = { fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500], sheer: [1000, 1100, 1200, 1300, 1400, 1500], style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 }, height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }], };
    const CALC = { fabricYardage: (style, width) => { if (width <= 0) return 0; if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9; if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9; return 0; }, };

    // --- SELECTORS (Updated for Pro UI) ---
    const SELECTORS = {
        orderForm: '#orderForm',
        roomsContainer: '#rooms',
        roomTpl: '#roomTpl',
        itemTpl: '#itemTpl',
        wallTpl: '#wallTpl',
        addRoomFab: '#addRoomFab',
        summarySheet: '#summarySheet',
        customerName: '#customer_name',
        customerPhone: '#customer_phone',
        customerAddress: '#customer_address',
        menuBtn: '#menuBtn',
        menuDropdown: '#menuDropdown',
        lockBtn: '#lockBtn',
        copyJsonBtn: '#copyJsonBtn',
        exportBtn: '#exportBtn',
        importBtn: '#importBtn',
        clearAllBtn: '#clearAllBtn',
        clearAllModal: '#clearAllModal',
        importModal: '#importModal',
        importJsonArea: '#importJsonArea',
        toastContainer: '#toast-container',
        materialSheet: '#summarySheet',
    };

    // --- GLOBAL STATE ---
    let isLocked = false;
    let autoSaveTimeout = null;
    let roomCounter = 0;

    // --- UTILITY FUNCTIONS (unchanged) ---
    const formatNumber = (num) => new Intl.NumberFormat('th-TH').format(Math.round(num));
    const showToast = (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.querySelector(SELECTORS.toastContainer).appendChild(toast);
        setTimeout(() => {
            toast.classList.add('visible');
            setTimeout(() => {
                toast.classList.remove('visible');
                setTimeout(() => toast.remove(), 250);
            }, 3000);
        }, 10);
    };
    const showDialog = (selector) => {
        return new Promise(resolve => {
            const modal = document.querySelector(selector);
            const confirmBtn = modal.querySelector('[data-action="confirm"]');
            const cancelBtn = modal.querySelector('[data-action="cancel"]');
            const handleConfirm = () => { modal.classList.remove('visible'); confirmBtn.removeEventListener('click', handleConfirm); cancelBtn.removeEventListener('click', handleCancel); resolve(true); };
            const handleCancel = () => { modal.classList.remove('visible'); confirmBtn.removeEventListener('click', handleConfirm); cancelBtn.removeEventListener('click', handleCancel); resolve(false); };
            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            modal.classList.add('visible');
        });
    };
    const showMaterialSheet = (selector) => {
        const sheet = document.querySelector(selector);
        sheet.classList.add('visible');
    };
    const hideMaterialSheet = (selector = SELECTORS.summarySheet) => {
        const sheet = document.querySelector(selector);
        sheet.classList.remove('visible');
    };
    const parseNumber = (value) => {
        const cleanValue = String(value).replace(/,/g, '');
        return isNaN(parseFloat(cleanValue)) ? 0 : parseFloat(cleanValue);
    };

    // --- CORE LOGIC FUNCTIONS ---
    const calculateItemPrice = (item) => {
        let price = 0;
        let totalSqM = 0;
        let totalRolls = 0;
        let totalYardage = 0;
        let totalRailPrice = 0;

        switch (item.type) {
            case 'fabric':
                const style = item.fabric_style;
                const width = parseNumber(item.fabric_width_m);
                const height = parseNumber(item.fabric_height_m);
                const pricePerYard = parseNumber(item.fabric_price_yard);
                
                const styleSurcharge = PRICING.style_surcharge[style] || 0;
                let heightSurcharge = 0;
                
                for(let h of PRICING.height) {
                    if (height >= h.threshold) {
                        heightSurcharge = h.add_per_m * height;
                        break;
                    }
                }

                totalYardage = CALC.fabricYardage(style, width);
                totalRailPrice = width * pricePerYard;
                price = (totalYardage * pricePerYard) + styleSurcharge + heightSurcharge;
                break;
            case 'roller':
                const rollerWidth = parseNumber(item.roller_width_m);
                const rollerHeight = parseNumber(item.roller_height_m);
                const rollerPricePerSqm = parseNumber(item.roller_price_sqm);
                totalSqM = rollerWidth * rollerHeight;
                price = totalSqM * rollerPricePerSqm;
                break;
            case 'wallpaper':
                const wallpaperHeight = parseNumber(item.wallpaper_height_m);
                let wallWidths = item.wall_widths_m || [];
                totalSqM = 0;
                for (let width of wallWidths) {
                    totalSqM += parseNumber(width) * wallpaperHeight;
                }
                totalRolls = Math.ceil(totalSqM / WALLPAPER_SQM_PER_ROLL);
                const wallpaperPricePerRoll = parseNumber(item.wallpaper_price_roll);
                price = totalRolls * wallpaperPricePerRoll;
                break;
        }

        return { price, totalSqM, totalRolls, totalYardage, totalRailPrice };
    };

    const updateItemSummary = (itemElement) => {
        const itemType = itemElement.dataset.tab;
        const form = itemElement.closest('form');
        const formData = new FormData(form);
        const itemData = {};
        formData.forEach((value, key) => itemData[key] = value);

        const summary = calculateItemPrice({ type: itemType, ...itemData });

        const summaryEl = itemElement.querySelector(`[data-${itemType}-summary]`);
        if (summaryEl) {
            summaryEl.querySelector('.price').textContent = formatNumber(summary.price);
            if (itemType === 'fabric') {
                summaryEl.innerHTML = `ราคา: <span class="price">${formatNumber(summary.price)}</span> • ผ้า: <span class="price">${summary.totalYardage.toFixed(2)}</span> หลา • ค่าราง: <span class="price">${formatNumber(summary.totalRailPrice)}</span>`;
            } else if (itemType === 'roller') {
                summaryEl.innerHTML = `ราคา: <span class="price">${formatNumber(summary.price)}</span> • พื้นที่: <span class="price">${summary.totalSqM.toFixed(2)}</span> ตร.ม.`;
            } else if (itemType === 'wallpaper') {
                summaryEl.innerHTML = `ราคา: <span class="price">${formatNumber(summary.price)}</span> • พื้นที่: <span class="price">${summary.totalSqM.toFixed(2)}</span> ตร.ม. • ใช้ <span class="price">${summary.totalRolls}</span> ม้วน`;
            }
        }
    };

    const updateRoomSummary = (roomElement) => {
        const roomContent = roomElement.querySelector('.room-content');
        const items = roomContent.querySelectorAll('[data-item-container]');
        let roomTotal = 0;
        items.forEach(item => {
            const itemType = item.querySelector('.tab.active').dataset.tab;
            const form = item.closest('form');
            const formData = new FormData(form);
            const itemData = {};
            formData.forEach((value, key) => itemData[key] = value);

            const summary = calculateItemPrice({ type: itemType, ...itemData });
            roomTotal += summary.price;
        });

        const roomNameEl = roomElement.querySelector('.room-name');
        const roomIndex = roomElement.dataset.roomIndex;
        roomNameEl.textContent = `ห้องที่ ${roomIndex} (ราคา: ${formatNumber(roomTotal)})`;
        saveState();
    };

    const updateAllSummaries = () => {
        const roomElements = document.querySelectorAll(SELECTORS.roomsContainer + ' > details');
        roomElements.forEach(room => updateRoomSummary(room));
        updateOverallSummary();
    };

    const updateOverallSummary = () => {
        let fabricTotal = 0;
        let sheerTotal = 0;
        let rollerTotal = 0;
        let wallpaperTotal = 0;
        let overallTotal = 0;
        
        const roomElements = document.querySelectorAll(SELECTORS.roomsContainer + ' > details');
        roomElements.forEach(room => {
            const items = room.querySelectorAll('[data-item-container]');
            items.forEach(item => {
                const itemType = item.querySelector('.tab.active').dataset.tab;
                const form = item.closest('form');
                const formData = new FormData(form);
                const itemData = {};
                formData.forEach((value, key) => itemData[key] = value);

                const summary = calculateItemPrice({ type: itemType, ...itemData });
                overallTotal += summary.price;
                if (itemType === 'fabric') fabricTotal += summary.price;
                if (itemType === 'roller') rollerTotal += summary.price;
                if (itemType === 'wallpaper') wallpaperTotal += summary.price;
            });
        });

        document.querySelector('[data-summary="fabric"]').textContent = formatNumber(fabricTotal);
        document.querySelector('[data-summary="sheer"]').textContent = formatNumber(sheerTotal);
        document.querySelector('[data-summary="roller"]').textContent = formatNumber(rollerTotal);
        document.querySelector('[data-summary="wallpaper"]').textContent = formatNumber(wallpaperTotal);
        document.querySelector('[data-summary="total"]').textContent = formatNumber(overallTotal);
    };

    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer_name: document.querySelector(SELECTORS.customerName).value,
            customer_phone: document.querySelector(SELECTORS.customerPhone).value,
            customer_address: document.querySelector(SELECTORS.customerAddress).value,
            rooms: [],
        };
        const roomElements = document.querySelectorAll(SELECTORS.roomsContainer + ' > details');
        roomElements.forEach(roomEl => {
            const roomData = { items: [] };
            const roomItems = roomEl.querySelectorAll('[data-item-container]');
            roomItems.forEach(itemEl => {
                const itemType = itemEl.querySelector('.tab.active').dataset.tab;
                const itemData = { type: itemType };
                const inputs = itemEl.querySelectorAll('input, textarea');
                inputs.forEach(input => {
                    const name = input.name;
                    let value = input.value;
                    if (input.type === 'number') {
                        value = parseNumber(value);
                    }
                    itemData[name] = value;
                });

                if (itemType === 'wallpaper') {
                    const wallsContainer = itemEl.querySelector('[data-walls-container]');
                    itemData.wall_widths_m = Array.from(wallsContainer.querySelectorAll('input[name="wall_width_m"]')).map(input => parseNumber(input.value));
                }
                
                const summary = calculateItemPrice(itemData);
                itemData.calculated_price = summary.price;
                itemData.calculated_sqm = summary.totalSqM;
                itemData.calculated_rolls = summary.totalRolls;
                itemData.calculated_yardage = summary.totalYardage;
                itemData.calculated_rail_price = summary.totalRailPrice;
                
                roomData.items.push(itemData);
            });
            payload.rooms.push(roomData);
        });
        return payload;
    };

    const saveState = () => {
        if (!isLocked) {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(() => {
                const state = buildPayload();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                showToast("บันทึกอัตโนมัติแล้ว");
            }, 1000);
        }
    };

    const loadState = () => {
        const stateStr = localStorage.getItem(STORAGE_KEY);
        if (stateStr) {
            const state = JSON.parse(stateStr);
            if (state.customer_name) document.querySelector(SELECTORS.customerName).value = state.customer_name;
            if (state.customer_phone) document.querySelector(SELECTORS.customerPhone).value = state.customer_phone;
            if (state.customer_address) document.querySelector(SELECTORS.customerAddress).value = state.customer_address;

            const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
            roomsContainer.innerHTML = '';
            state.rooms.forEach((roomData) => {
                const roomEl = addRoom();
                roomData.items.forEach(itemData => {
                    const itemEl = addItem(roomEl);
                    const tab = itemEl.querySelector(`[data-tab="${itemData.type}"]`);
                    if (tab) {
                        itemEl.querySelector('.tab.active').classList.remove('active');
                        tab.classList.add('active');
                        itemEl.querySelector('.tab-content.active').classList.remove('active');
                        itemEl.querySelector(`[data-tab-content="${itemData.type}"]`).classList.add('active');
                    }
                    for (const key in itemData) {
                        const input = itemEl.querySelector(`[name="${key}"]`);
                        if (input) {
                            input.value = itemData[key];
                        }
                    }
                    if (itemData.type === 'wallpaper' && itemData.wall_widths_m) {
                        const wallsContainer = itemEl.querySelector('[data-walls-container]');
                        wallsContainer.innerHTML = '';
                        itemData.wall_widths_m.forEach(width => {
                            addWall(wallsContainer, width);
                        });
                    }
                    updateItemSummary(itemEl);
                });
                updateRoomSummary(roomEl);
            });
        }
        updateAllSummaries();
    };

    // --- TEMPLATE & DOM MANIPULATION FUNCTIONS ---
    const addRoom = () => {
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        const roomTpl = document.querySelector(SELECTORS.roomTpl);
        const newRoom = roomTpl.content.cloneNode(true).querySelector('details');
        
        roomCounter++;
        newRoom.dataset.roomIndex = roomCounter;
        newRoom.querySelector('.room-name').textContent = `ห้องที่ ${roomCounter}`;
        roomsContainer.appendChild(newRoom);
        
        return newRoom;
    };
    
    const addItem = (roomElement) => {
        const roomContent = roomElement.querySelector('.room-content');
        const itemTpl = document.querySelector(SELECTORS.itemTpl);
        const newItem = itemTpl.content.cloneNode(true).querySelector('[data-item-container]');
        
        const itemIndex = roomElement.querySelectorAll('[data-item-container]').length + 1;
        newItem.dataset.itemIndex = itemIndex;
        roomContent.appendChild(newItem);
        
        return newItem;
    };

    const addWall = (wallsContainer, value = '') => {
        const wallTpl = document.querySelector(SELECTORS.wallTpl);
        const newWall = wallTpl.content.cloneNode(true).querySelector('.wall-input-row');
        const input = newWall.querySelector('input');
        input.value = value;
        wallsContainer.appendChild(newWall);
    };

    // --- EVENT LISTENERS ---
    window.addEventListener('load', loadState);

    document.addEventListener('input', (e) => {
        if (e.target.matches('input, textarea')) {
            const itemContainer = e.target.closest('[data-item-container]');
            if (itemContainer) {
                const itemType = itemContainer.querySelector('.tab.active').dataset.tab;
                if ((itemType === 'fabric' && ['fabric_style', 'fabric_width_m', 'fabric_height_m', 'fabric_price_yard'].includes(e.target.name)) ||
                    (itemType === 'roller' && ['roller_width_m', 'roller_height_m', 'roller_price_sqm'].includes(e.target.name)) ||
                    (itemType === 'wallpaper' && ['wallpaper_height_m', 'wallpaper_price_roll', 'wall_width_m'].includes(e.target.name))) {
                    updateItemSummary(itemContainer);
                    updateRoomSummary(itemContainer.closest('[data-room-index]'));
                }
            }
            saveState();
        }
    });

    document.addEventListener('click', async (e) => {
        // Find the action from data-act, data-action, data-tab, or button id
        const targetButton = e.target.closest('button, .tab');
        if (!targetButton) return;

        const action = targetButton.dataset.act || targetButton.dataset.action || targetButton.dataset.tab || targetButton.id;
        
        const roomElement = e.target.closest('[data-room-index]');
        const itemElement = e.target.closest('[data-item-container]');

        e.preventDefault();

        switch (action) {
            case 'addRoomFab': addRoom(); break;
            case 'add-item': addItem(roomElement); break;
            case 'del-room':
                if (roomElement && await showDialog(SELECTORS.clearAllModal)) {
                    roomElement.remove();
                    updateAllSummaries();
                }
                break;
            case 'del-item':
                if (itemElement && await showDialog(SELECTORS.clearAllModal)) {
                    itemElement.remove();
                    updateRoomSummary(roomElement);
                }
                break;
            case 'del-wall':
                e.target.closest('.wall-input-row').remove();
                if (itemElement) updateItemSummary(itemElement);
                if (roomElement) updateRoomSummary(roomElement);
                break;
            case 'add-wall': addWall(itemElement.querySelector('[data-walls-container]')); break;
            case 'fabric':
            case 'roller':
            case 'wallpaper':
                if (itemElement) {
                    itemElement.querySelector('.tab.active').classList.remove('active');
                    itemElement.querySelector('.tab-content.active').classList.remove('active');
                    e.target.classList.add('active');
                    itemElement.querySelector(`[data-tab-content="${action}"]`).classList.add('active');
                    updateItemSummary(itemElement);
                    updateRoomSummary(roomElement);
                }
                break;
            case 'menuBtn':
                const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
                menuDropdown.classList.toggle('visible');
                break;
            case 'lockBtn':
                isLocked = !isLocked;
                document.getElementById('lockBtn').querySelector('.material-symbols-outlined').textContent = isLocked ? 'lock' : 'lock_open';
                document.getElementById('lockBtn').querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
                showToast(isLocked ? 'ล็อค' : 'ปลดล็อค');
                break;
            case 'clearAllBtn':
                if (await showDialog(SELECTORS.clearAllModal)) {
                    localStorage.removeItem(STORAGE_KEY);
                    location.reload();
                }
                break;
            case 'copyJsonBtn':
                const payload = buildPayload();
                navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                    .then(() => showToast("คัดลอก JSON แล้ว", "success"))
                    .catch(err => showToast("ไม่สามารถคัดลอกได้: " + err, "error"));
                break;
            case 'exportBtn': /* ... export logic ... */ break;
            case 'importBtn':
                document.querySelector(SELECTORS.importJsonArea).value = '';
                document.querySelector(SELECTORS.importModal).classList.add('visible');
                break;
            case 'import':
                try {
                    const jsonData = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(jsonData));
                    showToast("Import JSON สำเร็จ! กำลังโหลดข้อมูลใหม่...", "success");
                    location.reload();
                } catch (e) {
                    showToast("JSON ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง", "error");
                }
                break;
            case 'cancel':
                e.target.closest('.modal-scrim').classList.remove('visible');
                break;
            case 'close':
                hideMaterialSheet();
                break;
        }
    });

    // Make sure to add the sheet listener
    const sheet = document.querySelector(SELECTORS.materialSheet);
    if(sheet) {
        sheet.addEventListener('click', (e) => {
            if (e.target === sheet) { // Only close if scrim is clicked directly
                hideMaterialSheet();
            }
        });
    }
})();