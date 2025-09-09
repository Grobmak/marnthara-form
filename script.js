(function() {
    'use strict';
    const APP_VERSION = "input-ui/2025.1.0";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.2025";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3;

    // Pricing and calculation logic
    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };
    const CALC = {
        fabricYardage: (width) => (width / 0.8) * SQM_TO_SQYD,
        sheerYardage: (width) => (width / 0.8) * SQM_TO_SQYD,
        curtainPrice: (width, height, type, style) => {
            const yardage = (type === 'fabric') ? CALC.fabricYardage(width) : CALC.sheerYardage(width);
            const basePrice = (type === 'fabric') ? PRICING.fabric[Math.floor(height * 2) - 1] : PRICING.sheer[Math.floor(height * 2) - 1];
            return (basePrice * yardage) + PRICING.style_surcharge[style];
        },
        wallpaperRolls: (wallWidths, height) => {
            const totalWidth = wallWidths.reduce((acc, w) => acc + w, 0);
            return Math.ceil((totalWidth * height) / WALLPAPER_SQM_PER_ROLL);
        },
        wallpaperPrice: (wallWidths, height, pricePerRoll) => {
            const totalArea = wallWidths.reduce((acc, w) => acc + w, 0) * height;
            const rolls = CALC.wallpaperRolls(wallWidths, height);
            return { totalArea, rolls, totalPrice: rolls * pricePerRoll };
        }
    };

    // DOM Selectors
    const SELECTORS = {
        appBody: 'body',
        orderForm: '#orderForm',
        addRoomHeaderBtn: '#addRoomHeaderBtn',
        lockBtn: '#lockBtn',
        copyBtn: '#copyBtn',
        clearAllBtn: '#clearAllBtn',
        rooms: '#rooms',
        payloadInput: '#payloadInput',
        menuBtn: '#menuBtn',
        menuDropdown: '#menuDropdown',
        toast: '#toast',
        modal: '#modal',
        closeModalBtn: '[data-action="close-modal"]',
        confirmCopyBtn: '#confirmCopyBtn',
        copyTextCheckbox: '#copyTextCheckbox',
        copyJsonCheckbox: '#copyJsonCheckbox',
    };

    const ELEMENTS = {
        orderForm: document.querySelector(SELECTORS.orderForm),
        addRoomHeaderBtn: document.querySelector(SELECTORS.addRoomHeaderBtn),
        lockBtn: document.querySelector(SELECTORS.lockBtn),
        copyBtn: document.querySelector(SELECTORS.copyBtn),
        clearAllBtn: document.querySelector(SELECTORS.clearAllBtn),
        rooms: document.querySelector(SELECTORS.rooms),
        menuBtn: document.querySelector(SELECTORS.menuBtn),
        menuDropdown: document.querySelector(SELECTORS.menuDropdown),
        toast: document.querySelector(SELECTORS.toast),
        modal: document.querySelector(SELECTORS.modal),
        closeModalBtn: document.querySelector(SELECTORS.closeModalBtn),
        confirmCopyBtn: document.querySelector(SELECTORS.confirmCopyBtn),
        copyTextCheckbox: document.querySelector(SELECTORS.copyTextCheckbox),
        copyJsonCheckbox: document.querySelector(SELECTORS.copyJsonCheckbox),
        body: document.querySelector(SELECTORS.appBody)
    };

    let roomCount = 0;

    // UI Feedback functions
    const showToast = (message, type = 'info') => {
        const toast = ELEMENTS.toast;
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    };

    // Data handling functions
    const addRoom = (roomData = {}) => {
        const template = document.getElementById('roomTpl');
        const clone = template.content.cloneNode(true);
        const roomCard = clone.querySelector('.room-card');

        roomCount++;
        roomCard.dataset.roomIndex = roomCount;
        
        const roomNameInput = roomCard.querySelector('input[name="room_name"]');
        if (roomData.room_name) roomNameInput.value = roomData.room_name;
        
        const heightInput = roomCard.querySelector('input[name="height_m"]');
        if (roomData.height_m) heightInput.value = roomData.height_m;

        if (roomData.curtains && roomData.curtains.length > 0) {
            roomData.curtains.forEach(curtain => addCurtain(roomCard, curtain));
        }
        
        if (roomData.wallpapers && roomData.wallpapers.length > 0) {
            roomData.wallpapers.forEach(wallpaper => addWallpaper(roomCard, wallpaper));
        }

        ELEMENTS.rooms.appendChild(roomCard);
        updateRoomSummary(roomCard);
    };

    const addCurtain = (roomCard, curtainData = {}) => {
        const template = document.getElementById('curtainTpl');
        const clone = template.content.cloneNode(true);
        const curtainItem = clone.querySelector('.curtain-item');
        const curtainList = roomCard.querySelector('[data-curtains-container]');
        
        const typeSelect = curtainItem.querySelector('select[name="curtain_type"]');
        if (curtainData.type) typeSelect.value = curtainData.type;
        
        const styleSelect = curtainItem.querySelector('select[name="curtain_style"]');
        if (curtainData.style) styleSelect.value = curtainData.style;
        
        const widthInput = curtainItem.querySelector('input[name="curtain_width_m"]');
        if (curtainData.width_m) widthInput.value = curtainData.width_m;

        curtainList.appendChild(curtainItem);
        updateCurtainSummary(curtainItem);
    };
    
    const addWallpaper = (roomCard, wallpaperData = {}) => {
        const template = document.getElementById('wallpaperTpl');
        const clone = template.content.cloneNode(true);
        const wallpaperItem = clone.querySelector('.wallpaper-item');
        const wallpaperList = roomCard.querySelector('[data-wallpapers-container]');
        
        const heightInput = wallpaperItem.querySelector('input[name="wallpaper_height_m"]');
        if (wallpaperData.height_m) heightInput.value = wallpaperData.height_m;
        
        const priceInput = wallpaperItem.querySelector('input[name="wallpaper_price_roll"]');
        if (wallpaperData.price_roll) priceInput.value = wallpaperData.price_roll;

        if (wallpaperData.wall_widths && wallpaperData.wall_widths.length > 0) {
            wallpaperData.wall_widths.forEach(width => addWall(wallpaperItem, width));
        }
        
        wallpaperList.appendChild(wallpaperItem);
        updateWallpaperSummary(wallpaperItem);
    };
    
    const addWall = (wallpaperItem, wallData = {}) => {
        const template = document.getElementById('wallTpl');
        const clone = template.content.cloneNode(true);
        const wallInputRow = clone.querySelector('.wall-input-row');
        const wallsContainer = wallpaperItem.querySelector('[data-walls-container]');
        
        const widthInput = wallInputRow.querySelector('input[name="wall_width_m"]');
        if (wallData) widthInput.value = wallData;

        wallsContainer.appendChild(wallInputRow);
    };
    
    // UI Update functions
    const updateCurtainSummary = (curtainItem) => {
        const width = parseFloat(curtainItem.querySelector('input[name="curtain_width_m"]').value) || 0;
        const type = curtainItem.querySelector('select[name="curtain_type"]').value;
        const style = curtainItem.querySelector('select[name="curtain_style"]').value;
        const roomCard = curtainItem.closest('.room-card');
        const height = parseFloat(roomCard.querySelector('input[name="height_m"]').value) || 0;

        const yardage = CALC.fabricYardage(width);
        const price = CALC.curtainPrice(width, height, type, style);

        const summaryEl = curtainItem.querySelector('[data-curtain-summary]');
        summaryEl.innerHTML = `ราคา: <span class="price">${price.toLocaleString()}</span> บ. • ใช้ <span class="price">${yardage.toFixed(2)}</span> หลา`;
    };
    
    const updateWallpaperSummary = (wallpaperItem) => {
        const height = parseFloat(wallpaperItem.querySelector('input[name="wallpaper_height_m"]').value) || 0;
        const pricePerRoll = parseFloat(wallpaperItem.querySelector('input[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0;
        const wallWidths = Array.from(wallpaperItem.querySelectorAll('input[name="wall_width_m"]'))
            .map(input => parseFloat(input.value) || 0);

        if (wallWidths.length === 0 || height === 0) {
            const summaryEl = wallpaperItem.querySelector('[data-wallpaper-summary]');
            summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`;
            return;
        }
        
        const { totalArea, rolls, totalPrice } = CALC.wallpaperPrice(wallWidths, height, pricePerRoll);

        const summaryEl = wallpaperItem.querySelector('[data-wallpaper-summary]');
        summaryEl.innerHTML = `ราคา: <span class="price">${totalPrice.toLocaleString()}</span> บ. • พื้นที่: <span class="price">${totalArea.toFixed(2)}</span> ตร.ม. • ใช้ <span class="price">${rolls}</span> ม้วน`;
    };
    
    const updateRoomSummary = (roomCard) => {
        const height = parseFloat(roomCard.querySelector('input[name="height_m"]').value) || 0;

        const summaryEl = roomCard.querySelector('.room-summary');
        
        const totalCurtainPrice = Array.from(roomCard.querySelectorAll('.curtain-item')).reduce((acc, curtainItem) => {
            const width = parseFloat(curtainItem.querySelector('input[name="curtain_width_m"]').value) || 0;
            const type = curtainItem.querySelector('select[name="curtain_type"]').value;
            const style = curtainItem.querySelector('select[name="curtain_style"]').value;
            return acc + CALC.curtainPrice(width, height, type, style);
        }, 0);
        
        const totalWallpaperPrice = Array.from(roomCard.querySelectorAll('.wallpaper-item')).reduce((acc, wallpaperItem) => {
            const itemHeight = parseFloat(wallpaperItem.querySelector('input[name="wallpaper_height_m"]').value) || 0;
            const pricePerRoll = parseFloat(wallpaperItem.querySelector('input[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0;
            const wallWidths = Array.from(wallpaperItem.querySelectorAll('input[name="wall_width_m"]'))
                .map(input => parseFloat(input.value) || 0);
            const { totalPrice } = CALC.wallpaperPrice(wallWidths, itemHeight, pricePerRoll);
            return acc + totalPrice;
        }, 0);
        
        const totalRoomPrice = totalCurtainPrice + totalWallpaperPrice;

        if (totalRoomPrice > 0) {
            summaryEl.textContent = `รวม: ${totalRoomPrice.toLocaleString()} บ.`;
        } else {
            summaryEl.textContent = "";
        }
    };
    
    const updateAllSummaries = () => {
        document.querySelectorAll('.room-card').forEach(roomCard => {
            roomCard.querySelectorAll('.curtain-item').forEach(updateCurtainSummary);
            roomCard.querySelectorAll('.wallpaper-item').forEach(updateWallpaperSummary);
            updateRoomSummary(roomCard);
        });
    };

    // Data serialization
    const buildPayload = () => {
        const payload = {
            app_version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            rooms: []
        };
        document.querySelectorAll('.room-card').forEach(roomCard => {
            const room = {
                room_name: roomCard.querySelector('input[name="room_name"]').value,
                height_m: parseFloat(roomCard.querySelector('input[name="height_m"]').value) || 0,
                curtains: [],
                wallpapers: []
            };
            roomCard.querySelectorAll('.curtain-item').forEach(curtainItem => {
                room.curtains.push({
                    type: curtainItem.querySelector('select[name="curtain_type"]').value,
                    style: curtainItem.querySelector('select[name="curtain_style"]').value,
                    width_m: parseFloat(curtainItem.querySelector('input[name="curtain_width_m"]').value) || 0
                });
            });
            roomCard.querySelectorAll('.wallpaper-item').forEach(wallpaperItem => {
                room.wallpapers.push({
                    height_m: parseFloat(wallpaperItem.querySelector('input[name="wallpaper_height_m"]').value) || 0,
                    price_roll: parseFloat(wallpaperItem.querySelector('input[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0,
                    wall_widths: Array.from(wallpaperItem.querySelectorAll('input[name="wall_width_m"]'))
                        .map(input => parseFloat(input.value) || 0)
                });
            });
            payload.rooms.push(room);
        });
        return payload;
    };
    
    // Copy to clipboard function
    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast("คัดลอกข้อมูลเรียบร้อยแล้ว", "success");
        } catch (err) {
            console.error('Failed to copy text: ', err);
            showToast("ไม่สามารถคัดลอกข้อมูลได้", "error");
        }
    };

    // UI state management
    const updateLockState = () => {
        const isLocked = ELEMENTS.body.classList.toggle('locked-mode');
        const lockText = ELEMENTS.lockBtn.querySelector('.lock-text');
        const lockIcon = ELEMENTS.lockBtn.querySelector('.icon');
        if (isLocked) {
            lockText.textContent = "ล็อคแล้ว";
            lockIcon.textContent = "🔒";
            showToast("หน้าเว็บถูกล็อคแล้ว", "info");
        } else {
            lockText.textContent = "แก้ไข";
            lockIcon.textContent = "✏️";
            showToast("หน้าเว็บพร้อมแก้ไข", "info");
        }
    };
    
    const saveToStorage = () => {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    };

    // Event Delegation & Listeners
    ELEMENTS.addRoomHeaderBtn.addEventListener('click', () => {
        addRoom();
        saveToStorage();
        showToast("เพิ่มห้องใหม่แล้ว", "success");
    });
    
    ELEMENTS.clearAllBtn.addEventListener('click', () => {
        if (confirm("คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด?")) {
            localStorage.removeItem(STORAGE_KEY);
            ELEMENTS.rooms.innerHTML = "";
            addRoom();
            showToast("ล้างข้อมูลทั้งหมดแล้ว", "success");
        }
    });

    ELEMENTS.lockBtn.addEventListener('click', updateLockState);
    
    ELEMENTS.copyBtn.addEventListener('click', () => {
        ELEMENTS.modal.classList.add('show');
    });

    ELEMENTS.closeModalBtn.addEventListener('click', () => {
        ELEMENTS.modal.classList.remove('show');
    });

    ELEMENTS.confirmCopyBtn.addEventListener('click', () => {
        const payload = buildPayload();
        let copyContent = "";
        
        if (ELEMENTS.copyTextCheckbox.checked) {
            copyContent += `ข้อมูลลูกค้า:\nชื่อ: ${payload.customer_name}\nที่อยู่: ${payload.customer_address}\nเบอร์โทร: ${payload.customer_phone}\n\n`;
            payload.rooms.forEach(room => {
                copyContent += `ห้อง: ${room.room_name} (สูง ${room.height_m} ม.)\n`;
                room.curtains.forEach(curtain => {
                    copyContent += `  - ม่านชนิด ${curtain.type}, สไตล์ ${curtain.style}, กว้าง ${curtain.width_m} ม.\n`;
                });
                room.wallpapers.forEach(wallpaper => {
                    const { totalPrice, totalArea, rolls } = CALC.wallpaperPrice(wallpaper.wall_widths, wallpaper.height_m, wallpaper.price_roll);
                    copyContent += `  - วอลล์เปเปอร์ (สูง ${wallpaper.height_m} ม.), พื้นที่รวม ${totalArea.toFixed(2)} ตร.ม. (${rolls} ม้วน)\n`;
                });
                copyContent += `\n`;
            });
        }
        if (ELEMENTS.copyJsonCheckbox.checked) {
            copyContent += JSON.stringify(payload, null, 2);
        }
        
        if (copyContent) {
            copyToClipboard(copyContent);
        } else {
            showToast("กรุณาเลือกรูปแบบการคัดลอก", "error");
        }
        ELEMENTS.modal.classList.remove('show');
    });

    ELEMENTS.orderForm.addEventListener('input', (e) => {
        const target = e.target;
        if (target.closest('.curtain-item')) {
            updateCurtainSummary(target.closest('.curtain-item'));
            updateRoomSummary(target.closest('.room-card'));
        } else if (target.closest('.wallpaper-item')) {
            updateWallpaperSummary(target.closest('.wallpaper-item'));
            updateRoomSummary(target.closest('.room-card'));
        } else if (target.matches('[name="height_m"]')) {
            updateAllSummaries();
        }
        saveToStorage();
    });

    ELEMENTS.orderForm.addEventListener('click', (e) => {
        const target = e.target;
        const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;

        if (action === "add-curtain") {
            addCurtain(target.closest('.room-card'));
        } else if (action === "add-wallpaper") {
            addWallpaper(target.closest('.room-card'));
        } else if (action === "add-wall") {
            addWall(target.closest('.wallpaper-item'));
        } else if (action === "delete-room") {
            if (confirm("ต้องการลบห้องนี้หรือไม่?")) {
                target.closest('.room-card').remove();
                saveToStorage();
                showToast("ลบห้องแล้ว", "success");
            }
        } else if (action === "delete-curtain") {
            const roomCard = target.closest('.room-card');
            target.closest('.curtain-item').remove();
            updateRoomSummary(roomCard);
            saveToStorage();
            showToast("ลบม่านแล้ว", "success");
        } else if (action === "delete-wallpaper") {
            const roomCard = target.closest('.room-card');
            target.closest('.wallpaper-item').remove();
            updateRoomSummary(roomCard);
            saveToStorage();
            showToast("ลบวอลล์เปเปอร์แล้ว", "success");
        } else if (action === "delete-wall") {
            const wallpaperItem = target.closest('.wallpaper-item');
            target.closest('.wall-input-row').remove();
            updateWallpaperSummary(wallpaperItem);
            updateRoomSummary(wallpaperItem.closest('.room-card'));
            saveToStorage();
            showToast("ลบผนังแล้ว", "success");
        }
    });

    // Other Event Listeners
    ELEMENTS.menuBtn.addEventListener('click', () => {
        ELEMENTS.menuDropdown.classList.toggle('show');
    });

    window.addEventListener('click', (e) => {
        if (!ELEMENTS.menuDropdown.contains(e.target) && !ELEMENTS.menuBtn.contains(e.target)) {
            ELEMENTS.menuDropdown.classList.remove('show');
        }
    });

    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name;
                document.querySelector('input[name="customer_address"]').value = payload.customer_address;
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
                ELEMENTS.rooms.innerHTML = ""; roomCount = 0;
                if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
                else addRoom();
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY); 
                addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
        updateLockState(); // Call it twice to show initial unlocked state
        updateAllSummaries();
    });
})();