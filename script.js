(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3; // Corrected value

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };
    const CALC = {
        fabricYardage: (style, length) => {
            const yardage = length * SQM_TO_SQYD;
            switch (style) {
                case "ลอน": return yardage * 2.2;
                case "ตาไก่": return yardage * 2;
                case "จีบ": return yardage * 2;
                default: return 0;
            }
        },
        blindSQM: (width, height) => {
            return (width * height);
        }
    };

    const SELECTORS = {
        roomsContainer: '#roomsContainer',
        addRoomBtn: '#addRoomHeaderBtn',
        lockBtn: '#lockBtn',
        clearAllBtn: '#clearAllBtn',
        orderForm: '#orderForm',
        payloadInput: 'input[name="payload"]',
        totalPriceDisplay: '[data-total-price]',
        roomCard: '[data-room-card]',
        roomContent: '[data-room-content]',
        removeRoomBtn: '[data-act="remove-room"]',
        copyRoomBtn: '[data-act="copy-room"]',
        typeSelector: '.type-selector',
        curtainSection: '[data-type-content="curtain"]',
        blindSection: '[data-type-content="blind"]',
        wallpaperSection: '[data-type-content="wallpaper"]',
        addCurtainBtn: '[data-act="add-curtain"]',
        addBlindBtn: '[data-act="add-blind"]',
        addWallBtn: '[data-act="add-wall"]',
        wallInputRow: '.wall-input-row',
        removeWallBtn: '[data-act="remove-wall"]',
        wallpaperSummary: '[data-wallpaper-summary]',
        roomNameField: 'input[name="room_name"]'
    };

    const roomTpl = document.getElementById('roomTpl').content;
    const wallTpl = document.getElementById('wallTpl').content;
    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    let roomCount = 0;

    const showToast = (message, type = 'info') => {
        const toastContainer = document.querySelector('.toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = 1;
            toast.style.transform = 'translateY(0)';
        }, 10);
        setTimeout(() => {
            toast.style.opacity = 0;
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    };

    const calculateWallpaper = (roomCard) => {
        const heightEl = roomCard.querySelector('input[name="wallpaper_height_m"]');
        const priceEl = roomCard.querySelector('input[name="wallpaper_price_roll"]');
        const wallWidthInputs = roomCard.querySelectorAll('input[name="wall_width_m"]');
        const summaryEl = roomCard.querySelector(SELECTORS.wallpaperSummary);

        const height = parseFloat(heightEl.value) || 0;
        const pricePerRoll = parseFloat(priceEl.value) || 0;

        let totalWidth = 0;
        wallWidthInputs.forEach(input => {
            totalWidth += parseFloat(input.value) || 0;
        });

        const totalArea = totalWidth * height;
        const rollsNeeded = Math.ceil(totalArea / WALLPAPER_SQM_PER_ROLL);
        const totalPrice = rollsNeeded * pricePerRoll;

        summaryEl.querySelector('.price:nth-child(1)').textContent = totalPrice.toLocaleString('th-TH');
        summaryEl.querySelector('.price:nth-child(2)').textContent = totalArea.toFixed(2);
        summaryEl.querySelector('.price:nth-child(3)').textContent = rollsNeeded;
    };
    
    const updateRoomSummary = (roomCard) => {
        const roomType = roomCard.dataset.roomType;
        if (roomType === 'wallpaper') {
            calculateWallpaper(roomCard);
        }
        // ... add other types calculation here
    };

    const updateAllSummaries = () => {
        document.querySelectorAll(SELECTORS.roomCard).forEach(updateRoomSummary);
        // ... update total summary here
    };

    const addWall = (wallsContainer) => {
        const wall = wallTpl.cloneNode(true);
        const removeBtn = wall.querySelector(SELECTORS.removeWallBtn);
        removeBtn.addEventListener('click', () => {
            wallsContainer.removeChild(removeBtn.closest(SELECTORS.wallInputRow));
            updateAllSummaries();
        });
        const input = wall.querySelector('input');
        input.addEventListener('input', updateAllSummaries);
        wallsContainer.appendChild(wall);
    };

    const addRoom = (roomData) => {
        const newRoom = roomTpl.cloneNode(true);
        const roomCard = newRoom.querySelector(SELECTORS.roomCard);
        roomCount++;
        roomCard.style.order = roomCount;
        roomCard.dataset.roomId = `room-${roomCount}`;

        const roomNameEl = roomCard.querySelector(SELECTORS.roomNameField);
        roomNameEl.value = roomData?.name || `ห้อง ${roomCount}`;
        roomCard.querySelector('.room-title').textContent = roomNameEl.value;

        // ... other room type setup logic
        
        const typeSelector = roomCard.querySelector(SELECTORS.typeSelector);
        typeSelector.addEventListener('click', (e) => {
            if (e.target.matches('label')) {
                const type = e.target.dataset.type;
                roomCard.dataset.roomType = type;
                
                roomCard.querySelectorAll('[data-type-content]').forEach(el => el.style.display = 'none');
                roomCard.querySelector(`[data-type-content="${type}"]`).style.display = 'block';

                typeSelector.querySelectorAll('label').forEach(label => label.classList.remove('btn-primary'));
                e.target.classList.add('btn-primary');
                
                updateAllSummaries();
            }
        });

        const addWallBtn = roomCard.querySelector(SELECTORS.addWallBtn);
        const wallsContainer = roomCard.querySelector('[data-walls-container]');
        addWallBtn.addEventListener('click', () => addWall(wallsContainer));

        if (roomData?.walls?.length > 0) {
            roomData.walls.forEach(width => {
                addWall(wallsContainer);
                const wallInput = wallsContainer.lastElementChild.querySelector('input[name="wall_width_m"]');
                if (wallInput) wallInput.value = width;
            });
        } else {
            addWall(wallsContainer); // Add one wall input by default
        }

        const wallpaperHeightInput = roomCard.querySelector('input[name="wallpaper_height_m"]');
        if (roomData?.wallpaper_height_m) wallpaperHeightInput.value = roomData.wallpaper_height_m;
        wallpaperHeightInput.addEventListener('input', () => updateAllSummaries());
        
        const wallpaperPriceInput = roomCard.querySelector('input[name="wallpaper_price_roll"]');
        if (roomData?.wallpaper_price_roll) wallpaperPriceInput.value = roomData.wallpaper_price_roll;
        wallpaperPriceInput.addEventListener('input', () => updateAllSummaries());

        // ... other event listeners and data loading
        
        roomsEl.appendChild(roomCard);
        updateAllSummaries();
    };

    const buildPayload = () => {
        const payload = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.roomCard).forEach(roomCard => {
            const roomType = roomCard.dataset.roomType;
            const roomData = {
                id: roomCard.dataset.roomId,
                name: roomCard.querySelector(SELECTORS.roomNameField).value,
                type: roomType
            };
            if (roomType === 'wallpaper') {
                const walls = [];
                roomCard.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                    walls.push(parseFloat(input.value) || 0);
                });
                roomData.walls = walls;
                roomData.wallpaper_height_m = parseFloat(roomCard.querySelector('input[name="wallpaper_height_m"]').value) || 0;
                roomData.wallpaper_price_roll = parseFloat(roomCard.querySelector('input[name="wallpaper_price_roll"]').value) || 0;
                roomData.total_area_sqm = (roomData.walls.reduce((sum, w) => sum + w, 0) * roomData.wallpaper_height_m);
                roomData.rolls_needed = Math.ceil(roomData.total_area_sqm / WALLPAPER_SQM_PER_ROLL);
                roomData.total_price = roomData.rolls_needed * roomData.wallpaper_price_roll;
            }
            // ... add other types to payload
            payload.rooms.push(roomData);
        });
        return payload;
    };

    // ... other event listeners and functions (lock, clearAll, etc.)
    
    document.querySelector(SELECTORS.orderForm).addEventListener('submit', (e) => {
        const requiredFields = document.querySelectorAll('input[required], select[required]');
        let isFormValid = true;
        requiredFields.forEach(field => {
            if (!field.value) isFormValid = false;
        });

        if (!isFormValid) {
            e.preventDefault();
            showToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'error');
            return;
        }
        
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        showToast('กำลังส่งข้อมูล...', 'info');
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