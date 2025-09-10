(function() {
    'use strict';
    // --- CONSTANTS ---
    const APP_VERSION = "input-ui/pro-5.0.2-combined";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v5-combined";
    const SQM_TO_SQYD = 1.19599; 
    const WALLPAPER_SQM_PER_ROLL = 5.3;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };

    const CALC = {
        fabricYardage: (width, height) => {
            const widthYard = width * 1.1; // +10% for curtain pleats
            const heightYard = (height + 0.3) * SQM_TO_SQYD; // +30cm and convert to yard
            const yardage = widthYard * Math.ceil(heightYard / 1.45); // 1.45m wide fabric
            return Math.ceil(yardage / 10) * 10;
        },
        curtainPrice: (width, height, fabricPrice, sheerPrice, style) => {
            let total = 0;
            const styleSurcharge = PRICING.style_surcharge[style] || 0;
            const fabricYardage = CALC.fabricYardage(width, height);
            
            // Fabric
            if (fabricPrice) {
                total += fabricYardage * fabricPrice;
                const heightAddPrice = PRICING.height.find(h => height > h.threshold)?.add_per_m || 0;
                total += heightAddPrice * width;
                total += styleSurcharge * width;
            }
            
            // Sheer
            if (sheerPrice) {
                const sheerYardage = CALC.fabricYardage(width, height);
                total += sheerYardage * sheerPrice;
            }
            
            return Math.ceil(total / 100) * 100;
        },
        wallpaperArea: (widths, height) => {
            const totalWidth = widths.reduce((sum, w) => sum + w, 0);
            return totalWidth * height;
        },
        wallpaperRolls: (area) => {
            return Math.ceil(area / WALLPAPER_SQM_PER_ROLL);
        }
    };
    
    // --- SELECTORS ---
    const SELECTORS = {
        orderForm: '#orderForm',
        roomsContainer: '#rooms',
        roomTpl: '#roomTpl',
        setTpl: '#setTpl',
        decoTpl: '#decoTpl',
        wallpaperTpl: '#wallpaperTpl',
        wallTpl: '#wallTpl',
        grandTotalEl: '#grandTotal',
        materialSummaryEl: '#materialSummary',
        menuBtn: '#menuBtn',
        menuDropdown: '#menuDropdown',
        lockBtn: '#lockBtn',
        clearAllBtn: '#clearAllBtn',
        importBtn: '#importBtn',
        exportBtn: '#exportBtn',
        importModal: '#importModal',
        importJsonArea: '#importJsonArea',
        importConfirm: '#importConfirm',
        copyOptionsModal: '#copyOptionsModal',
        copyPriceCheckbox: '#copyPrice',
        copyMaterialCheckbox: '#copyMaterial',
        copyConfirmBtn: '[data-act="copy-confirm"]',
        toast: '#toast',
    };

    // --- STATE ---
    let roomCount = 0;
    let isLocked = false;
    let toastTimeout;

    // --- DOM ELEMENTS ---
    const orderForm = document.querySelector(SELECTORS.orderForm);
    const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
    const roomTpl = document.querySelector(SELECTORS.roomTpl);
    const setTpl = document.querySelector(SELECTORS.setTpl);
    const decoTpl = document.querySelector(SELECTORS.decoTpl);
    const wallpaperTpl = document.querySelector(SELECTORS.wallpaperTpl);
    const wallTpl = document.querySelector(SELECTORS.wallTpl);
    const grandTotalEl = document.querySelector(SELECTORS.grandTotalEl);
    const materialSummaryEl = document.querySelector(SELECTORS.materialSummaryEl);
    const menuBtn = document.querySelector(SELECTORS.menuBtn);
    const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
    const lockBtn = document.querySelector(SELECTORS.lockBtn);
    const clearAllBtn = document.querySelector(SELECTORS.clearAllBtn);
    const copyOptionsModal = document.querySelector(SELECTORS.copyOptionsModal);
    const copyPriceCheckbox = document.querySelector(SELECTORS.copyPriceCheckbox);
    const copyMaterialCheckbox = document.querySelector(SELECTORS.copyMaterialCheckbox);
    const importModal = document.querySelector(SELECTORS.importModal);
    const importJsonArea = document.querySelector(SELECTORS.importJsonArea);
    
    // --- FUNCTIONS ---

    function showToast(message, type = 'info') {
        const toast = document.querySelector(SELECTORS.toast);
        clearTimeout(toastTimeout);
        toast.textContent = message;
        toast.className = `toast show toast-${type}`;
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    
    function updateLockState() {
        const inputs = orderForm.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.disabled = isLocked;
        });
        const buttons = orderForm.querySelectorAll('button:not([data-act="copy-dialog"]):not([data-act="send-form"])');
        buttons.forEach(btn => {
            btn.disabled = isLocked;
        });
        
        const lockText = lockBtn.querySelector('.lock-text');
        lockText.textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
    }

    function populatePriceOptions() {
        const priceSelects = document.querySelectorAll('select[data-price-type]');
        priceSelects.forEach(select => {
            const priceType = select.dataset.priceType;
            const prices = PRICING[priceType] || [];
            if (prices.length > 0) {
                const fragment = document.createDocumentFragment();
                select.innerHTML = '';
                fragment.appendChild(new Option('เลือกราคา', '', true, true));
                prices.forEach(price => {
                    const option = new Option(`${price.toLocaleString()} บ.`, price);
                    fragment.appendChild(option);
                });
                select.appendChild(fragment);
            }
        });
    }

    function recalcItem(itemEl) {
        const roomId = itemEl.closest('[data-room-id]').dataset.roomId;
        const itemId = itemEl.dataset.itemId;
        const itemType = itemEl.dataset.itemType;
        
        let price = 0;
        let materials = {};
        
        if (itemType === 'set') {
            const width = parseFloat(itemEl.querySelector('input[name="set_width_m"]').value) || 0;
            const height = parseFloat(itemEl.querySelector('input[name="set_height_m"]').value) || 0;
            const fabricPrice = parseFloat(itemEl.querySelector('select[name="fabric_price"]').value) || 0;
            const sheerPrice = parseFloat(itemEl.querySelector('select[name="sheer_price"]').value) || 0;
            const style = itemEl.querySelector('select[name="set_style"]').value;
            const railPrice = parseFloat(itemEl.querySelector('input[name="rail_price_per_m"]').value) || 0;
            
            price = CALC.curtainPrice(width, height, fabricPrice, sheerPrice, style) + (width * railPrice);
            
            if (fabricPrice) {
                const fabricYardage = CALC.fabricYardage(width, height);
                const fabricName = itemEl.querySelector('input[name="set_name"]').value;
                materials[`${fabricName} (ผ้าทึบ)`] = (materials[`${fabricName} (ผ้าทึบ)`] || 0) + fabricYardage;
            }
            if (sheerPrice) {
                const sheerYardage = CALC.fabricYardage(width, height);
                const sheerName = itemEl.querySelector('input[name="set_name"]').value;
                materials[`${sheerName} (ผ้าโปร่ง)`] = (materials[`${sheerName} (ผ้าโปร่ง)`] || 0) + sheerYardage;
            }
            
            itemEl.querySelector('[data-set-summary] .price').textContent = price.toLocaleString();

        } else if (itemType === 'deco') {
            const quantity = parseInt(itemEl.querySelector('input[name="deco_quantity"]').value) || 0;
            const unitPrice = parseFloat(itemEl.querySelector('input[name="deco_price"]').value) || 0;
            price = quantity * unitPrice;
            itemEl.querySelector('[data-deco-summary] .price').textContent = price.toLocaleString();

        } else if (itemType === 'wallpaper') {
            const widthInputs = Array.from(itemEl.querySelectorAll('input[name="wall_width_m"]'));
            const widths = widthInputs.map(input => parseFloat(input.value) || 0);
            const height = parseFloat(itemEl.querySelector('input[name="wallpaper_height_m"]').value) || 0;
            const pricePerRoll = parseFloat(itemEl.querySelector('input[name="wallpaper_price_roll"]').value) || 0;
            
            const area = CALC.wallpaperArea(widths, height);
            const rolls = CALC.wallpaperRolls(area);
            price = rolls * pricePerRoll;
            
            itemEl.querySelector('[data-wallpaper-summary] .price').textContent = price.toLocaleString();
            itemEl.querySelector('[data-wallpaper-summary] [class*="sqm"]').textContent = area.toFixed(2);
            itemEl.querySelector('[data-wallpaper-summary] [class*="roll"]').textContent = rolls;
        }

        return { price, materials };
    }

    function recalcAll() {
        let grandTotal = 0;
        let allMaterials = {};
        
        const rooms = document.querySelectorAll('.room-card');
        rooms.forEach(roomEl => {
            let roomTotal = 0;
            const items = roomEl.querySelectorAll('.item-card');
            items.forEach(itemEl => {
                const { price, materials } = recalcItem(itemEl);
                roomTotal += price;
                for (const mat in materials) {
                    allMaterials[mat] = (allMaterials[mat] || 0) + materials[mat];
                }
            });
            roomEl.querySelector('.room-total-price .price').textContent = roomTotal.toLocaleString();
            grandTotal += roomTotal;
        });

        grandTotalEl.textContent = grandTotal.toLocaleString();
        
        // Update Material Summary
        materialSummaryEl.innerHTML = '';
        if (Object.keys(allMaterials).length > 0) {
            for (const mat in allMaterials) {
                const p = document.createElement('p');
                p.textContent = `${mat}: ${allMaterials[mat].toLocaleString()} หลา`;
                materialSummaryEl.appendChild(p);
            }
        } else {
            materialSummaryEl.textContent = 'ไม่มีวัสดุ';
        }

        saveData();
    }
    
    function addRoom(roomData) {
        roomCount++;
        const newRoom = roomTpl.content.cloneNode(true).querySelector('.room-card');
        newRoom.dataset.roomId = `room-${roomCount}`;
        newRoom.querySelector('[data-room-name]').textContent = roomData?.name || `ห้องที่ ${roomCount}`;
        roomsContainer.appendChild(newRoom);
        
        if (roomData?.items && roomData.items.length > 0) {
            roomData.items.forEach(item => addItem(newRoom, item));
        }
        
        recalcAll();
        return newRoom;
    }

    function addItem(roomEl, itemData) {
        const itemList = roomEl.querySelector('[data-room-items]');
        let newItem;
        
        switch(itemData.type) {
            case 'set':
                newItem = setTpl.content.cloneNode(true).querySelector('.item-card');
                newItem.dataset.itemType = 'set';
                break;
            case 'deco':
                newItem = decoTpl.content.cloneNode(true).querySelector('.item-card');
                newItem.dataset.itemType = 'deco';
                break;
            case 'wallpaper':
                newItem = wallpaperTpl.content.cloneNode(true).querySelector('.item-card');
                newItem.dataset.itemType = 'wallpaper';
                break;
            default:
                return;
        }
        
        newItem.dataset.itemId = `item-${Math.floor(Date.now() / 1000) + Math.random()}`;
        
        if (itemData) {
            newItem.querySelector('[data-item-name]').textContent = itemData.name;
            for (const key in itemData.data) {
                const input = newItem.querySelector(`[name="${key}"]`);
                if (input) input.value = itemData.data[key];
            }
            if (itemData.data.walls && itemData.data.walls.length > 0) {
                const wallsContainer = newItem.querySelector('[data-walls-container]');
                itemData.data.walls.forEach(wall => {
                    const newWall = wallTpl.content.cloneNode(true).querySelector('.wall-input-row');
                    newWall.querySelector('input[name="wall_width_m"]').value = wall.width;
                    wallsContainer.appendChild(newWall);
                });
            }
        } else {
            populatePriceOptions();
        }

        itemList.appendChild(newItem);
        recalcAll();
    }

    function delItem(itemEl) {
        const roomEl = itemEl.closest('.room-card');
        itemEl.remove();
        recalcAll();
        if (roomEl && roomEl.querySelectorAll('.item-card').length === 0) {
            // Optional: delete room if empty
        }
    }

    function delRoom(roomEl) {
        roomEl.remove();
        recalcAll();
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            grand_total: parseFloat(grandTotalEl.textContent.replace(/,/g, '')),
            rooms: []
        };
        
        document.querySelectorAll('.room-card').forEach(roomEl => {
            const roomData = {
                name: roomEl.querySelector('[data-room-name]').textContent,
                total_price: parseFloat(roomEl.querySelector('.room-total-price .price').textContent.replace(/,/g, '')),
                items: []
            };
            
            roomEl.querySelectorAll('.item-card').forEach(itemEl => {
                const itemType = itemEl.dataset.itemType;
                const itemData = {
                    type: itemType,
                    name: itemEl.querySelector('[data-item-name]').textContent,
                    data: {}
                };

                const inputs = itemEl.querySelectorAll('input, select');
                inputs.forEach(input => {
                    itemData.data[input.name] = input.value;
                });
                
                if (itemType === 'wallpaper') {
                    itemData.data.walls = Array.from(itemEl.querySelectorAll('input[name="wall_width_m"]')).map(input => ({ width: parseFloat(input.value) || 0 }));
                }
                
                roomData.items.push(itemData);
            });
            
            payload.rooms.push(roomData);
        });
        
        return payload;
    }

    function copyToClipboard(payload) {
        let copyText = `Marnthara สรุปงาน\n\n`;

        if (copyMaterialCheckbox.checked) {
            copyText += `--- สรุปวัสดุ ---\n`;
            const materialSummary = materialSummaryEl.textContent;
            copyText += materialSummary === 'ไม่มีวัสดุ' ? `ไม่มีวัสดุที่ต้องสรุป\n` : `${materialSummary}\n`;
        }

        if (copyPriceCheckbox.checked) {
            copyText += `--- สรุปราคา ---\n`;
            payload.rooms.forEach(room => {
                copyText += `* ${room.name}: ${room.total_price.toLocaleString()} บ.\n`;
            });
            copyText += `**ยอดรวมทั้งหมด: ${payload.grand_total.toLocaleString()} บ.**\n`;
        }
        
        navigator.clipboard.writeText(copyText).then(() => {
            showToast("คัดลอกข้อมูลสำเร็จ!", "success");
        }).catch(err => {
            showToast("คัดลอกข้อมูลไม่สำเร็จ: " + err, "error");
        });
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function loadData() {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
                roomsContainer.innerHTML = '';
                roomCount = 0;
                if (payload.rooms && payload.rooms.length > 0) {
                    payload.rooms.forEach(addRoom);
                } else {
                    addRoom();
                }
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY);
                addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
        recalcAll();
    }
    
    // --- EVENT LISTENERS ---
    
    document.addEventListener('input', (e) => {
        recalcAll();
    });

    document.addEventListener('click', (e) => {
        const act = e.target.dataset.act || e.target.closest('[data-act]')?.dataset.act;
        const parentRoom = e.target.closest('.room-card');
        const parentItem = e.target.closest('.item-card');
        
        switch (act) {
            case 'add-room-dialog':
                document.querySelector('#addRoomDialog').classList.add('visible');
                break;
            case 'add-room':
                const roomNameInput = document.querySelector('#roomNameInput');
                addRoom({ name: roomNameInput.value });
                document.querySelector('#addRoomDialog').classList.remove('visible');
                roomNameInput.value = '';
                break;
            case 'del-room':
                if (parentRoom) delRoom(parentRoom);
                break;
            case 'add-set':
                if (parentRoom) addItem(parentRoom, { type: 'set', name: 'ชุดผ้าม่าน' });
                break;
            case 'add-deco':
                if (parentRoom) addItem(parentRoom, { type: 'deco', name: 'ม่านตกแต่ง' });
                break;
            case 'add-wallpaper':
                if (parentRoom) addItem(parentRoom, { type: 'wallpaper', name: 'วอลเปเปอร์' });
                break;
            case 'del-item':
                if (parentItem) delItem(parentItem);
                break;
            case 'add-wall':
                if (parentItem) {
                    const wallsContainer = parentItem.querySelector('[data-walls-container]');
                    const newWall = wallTpl.content.cloneNode(true).querySelector('.wall-input-row');
                    wallsContainer.appendChild(newWall);
                    recalcAll();
                }
                break;
            case 'del-wall':
                const wallRow = e.target.closest('.wall-input-row');
                wallRow.remove();
                recalcAll();
                break;
            case 'lockBtn':
                isLocked = !isLocked;
                updateLockState();
                showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'info');
                break;
            case 'clearAllBtn':
                if (confirm('ยืนยันที่จะล้างข้อมูลทั้งหมด?')) {
                    localStorage.removeItem(STORAGE_KEY);
                    location.reload();
                }
                break;
            case 'exportBtn':
                const payload = buildPayload();
                const jsonStr = JSON.stringify(payload, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `marnthara-data-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast("Export JSON สำเร็จ!", "success");
                break;
            case 'copy-dialog':
                copyOptionsModal.classList.add('visible');
                break;
            case 'copy-confirm':
                const copyPayload = buildPayload();
                copyToClipboard(copyPayload);
                copyOptionsModal.classList.remove('visible');
                break;
            case 'importBtn':
                importJsonArea.value = '';
                importModal.classList.add('visible');
                break;
            case 'import-confirm':
                try {
                    const jsonData = JSON.parse(importJsonArea.value);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(jsonData));
                    showToast("Import JSON สำเร็จ! กำลังโหลดข้อมูลใหม่...", "success");
                    setTimeout(() => location.reload(), 500);
                } catch (e) {
                    showToast("JSON ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง", "error");
                }
                break;
            case 'close-dialog':
                e.target.closest('.dialog-scrim').classList.remove('visible');
                break;
        }
    });

    // Close dropdown menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
            menuDropdown.classList.remove('visible');
        }
    });
    
    // Open dropdown menu
    menuBtn.addEventListener('click', (e) => {
        menuDropdown.classList.toggle('visible');
    });

    orderForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const payload = buildPayload();
        // Here you would send the payload to your webhook
        // Example: fetch(WEBHOOK_URL, { method: 'POST', body: JSON.stringify(payload) });
        console.log("Payload to be sent:", payload);
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    // Initial call
    loadData();
})();