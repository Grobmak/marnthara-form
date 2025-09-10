(function() {
    'use strict';
    const APP_VERSION = "input-ui/m3-1.0.0";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };
    const CALC = {
        fabricYardage: (width_m, height_m, fold_x) => {
            const width_y = width_m * SQM_TO_SQYD;
            const yardage = width_y * fold_x;
            return yardage;
        },
        curtainPrice: (yardage, price_per_yd, style, height_m) => {
            let total = yardage * price_per_yd;
            const styleSurcharge = PRICING.style_surcharge[style] || 0;
            total += styleSurcharge;
            
            // Apply height surcharge
            for (const h of PRICING.height) {
                if (height_m >= h.threshold) {
                    total += h.add_per_m;
                    break;
                }
            }
            return total;
        },
        wallpaperArea: (width_m, height_m) => {
            return width_m * height_m;
        },
        wallpaperRolls: (total_area_sqm) => {
            return Math.ceil(total_area_sqm / WALLPAPER_SQM_PER_ROLL);
        },
    };
    const SELECTORS = {
        roomsContainer: '#roomsContainer',
        roomTpl: '#roomTpl',
        wallTpl: '#wallTpl',
        orderForm: '#orderForm',
        payloadInput: 'input[name="payload"]',
        summaryCode: '#summaryCode',
        summaryBtn: '#summaryBtn',
        summaryPopup: '#summaryPopup',
        closeSummaryBtn: '#closeSummaryBtn',
        toastContainer: '#toast-container',
        menuBtn: '#menuBtn',
        menuDropdown: '#menuDropdown',
        importBtn: '#importBtn',
        exportBtn: '#exportBtn',
        clearBtn: '#clearBtn',
    };
    let roomsEl = document.querySelector(SELECTORS.roomsContainer);
    let roomCount = 0;
    const orderForm = document.querySelector(SELECTORS.orderForm);
    const summaryCodeEl = document.querySelector(SELECTORS.summaryCode);
    const summaryBtn = document.querySelector(SELECTORS.summaryBtn);
    const summaryPopup = document.querySelector(SELECTORS.summaryPopup);
    const closeSummaryBtn = document.querySelector(SELECTORS.closeSummaryBtn);
    const menuBtn = document.querySelector(SELECTORS.menuBtn);
    const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
    const importBtn = document.querySelector(SELECTORS.importBtn);
    const exportBtn = document.querySelector(SELECTORS.exportBtn);
    const clearBtn = document.querySelector(SELECTORS.clearBtn);
    const toastContainer = document.querySelector(SELECTORS.toastContainer);

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        // Show the toast
        setTimeout(() => toast.classList.add('show'), 10); 
        // Hide after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function addWall(container) {
        const wallTpl = document.querySelector(SELECTORS.wallTpl);
        const wallEl = wallTpl.content.cloneNode(true);
        container.appendChild(wallEl);
    }
    
    function addRoom(payload = null) {
        roomCount++;
        const roomTpl = document.querySelector(SELECTORS.roomTpl);
        const roomEl = roomTpl.content.cloneNode(true).firstElementChild;
        roomEl.dataset.roomId = roomCount;
        roomEl.querySelector('input[name="room_name"]').value = payload ? payload.room_name : `ห้องที่ ${roomCount}`;
        roomsEl.appendChild(roomEl);
        
        const typeSelect = roomEl.querySelector('select[name="item_type"]');
        const curtainSection = roomEl.querySelector('[data-type-section="curtain"]');
        const wallpaperSection = roomEl.querySelector('[data-type-section="wallpaper"]');
        const wallsSection = roomEl.querySelector('.walls-section');
        const wallsContainer = roomEl.querySelector('[data-walls-container]');
        const addWallBtn = roomEl.querySelector('button[data-act="add-wall"]');
        
        const updateVisibility = () => {
            const itemType = typeSelect.value;
            curtainSection.style.display = 'none';
            wallpaperSection.style.display = 'none';
            wallsSection.style.display = 'none';

            if (itemType === 'curtain') {
                curtainSection.style.display = 'block';
            } else if (itemType === 'wallpaper') {
                wallpaperSection.style.display = 'block';
                wallsSection.style.display = 'block';
            }
        };

        typeSelect.addEventListener('change', () => {
            updateVisibility();
            recalcRoom(roomEl);
        });
        
        addWallBtn.addEventListener('click', () => addWall(wallsContainer));
        
        roomEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-act="del-wall"]')) {
                e.target.closest('.wall-input-row').remove();
                recalcRoom(roomEl);
            }
        });

        // Event listeners for recalculations
        roomEl.addEventListener('input', () => recalcRoom(roomEl));
        
        if (payload) {
            typeSelect.value = payload.item_type || '';
            updateVisibility();
            if (payload.item_type === 'curtain') {
                roomEl.querySelector('input[name="curtain_price_yard"]').value = payload.curtain.price_per_yard;
                roomEl.querySelector('input[name="curtain_width_m"]').value = payload.curtain.width_m;
                roomEl.querySelector('input[name="curtain_height_m"]').value = payload.curtain.height_m;
                roomEl.querySelector('input[name="curtain_fold_x"]').value = payload.curtain.fold_x;
                roomEl.querySelector('select[name="curtain_style"]').value = payload.curtain.style;
            } else if (payload.item_type === 'wallpaper') {
                roomEl.querySelector('input[name="wallpaper_height_m"]').value = payload.wallpaper.height_m;
                roomEl.querySelector('input[name="wallpaper_price_roll"]').value = payload.wallpaper.price_per_roll;
                wallsContainer.innerHTML = ''; // Clear existing walls
                if (payload.wallpaper.walls) payload.wallpaper.walls.forEach(w => {
                    addWall(wallsContainer);
                    const lastWall = wallsContainer.lastElementChild;
                    lastWall.querySelector('input[name="wall_width_m"]').value = w.width_m;
                });
            }
        } else {
            addWall(wallsContainer); // Add a default wall
        }
        
        recalcRoom(roomEl);
    }
    
    function recalcRoom(roomEl) {
        let totalRoomPrice = 0;
        const itemType = roomEl.querySelector('select[name="item_type"]').value;
        const currencyFormatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 });

        if (itemType === 'curtain') {
            const price_per_yd = parseFloat(roomEl.querySelector('input[name="curtain_price_yard"]').value) || 0;
            const width_m = parseFloat(roomEl.querySelector('input[name="curtain_width_m"]').value) || 0;
            const height_m = parseFloat(roomEl.querySelector('input[name="curtain_height_m"]').value) || 0;
            const fold_x = parseFloat(roomEl.querySelector('input[name="curtain_fold_x"]').value) || 2.5;
            const style = roomEl.querySelector('select[name="curtain_style"]').value;

            const yardage = CALC.fabricYardage(width_m, height_m, fold_x);
            totalRoomPrice = CALC.curtainPrice(yardage, price_per_yd, style, height_m);

            roomEl.querySelector('[data-curtain-summary] .price:nth-child(1)').textContent = currencyFormatter.format(totalRoomPrice);
            roomEl.querySelector('[data-curtain-summary] .price:nth-child(2)').textContent = yardage.toFixed(2);
        } else if (itemType === 'wallpaper') {
            const price_per_roll = parseFloat(roomEl.querySelector('input[name="wallpaper_price_roll"]').value) || 0;
            const height_m = parseFloat(roomEl.querySelector('input[name="wallpaper_height_m"]').value) || 0;
            
            let totalWallpaperArea = 0;
            const wallWidthInputs = roomEl.querySelectorAll('[data-walls-container] input[name="wall_width_m"]');
            wallWidthInputs.forEach(input => {
                const width_m = parseFloat(input.value) || 0;
                totalWallpaperArea += CALC.wallpaperArea(width_m, height_m);
            });
            
            const numRolls = CALC.wallpaperRolls(totalWallpaperArea);
            totalRoomPrice = numRolls * price_per_roll;
            
            roomEl.querySelector('[data-wallpaper-summary] .price:nth-child(1)').textContent = currencyFormatter.format(totalRoomPrice);
            roomEl.querySelector('[data-wallpaper-summary] .price:nth-child(2)').textContent = totalWallpaperArea.toFixed(2);
            roomEl.querySelector('[data-wallpaper-summary] .price:nth-child(3)').textContent = numRolls;
        }
        recalcAll();
    }
    
    function recalcAll() {
        let totalAllPrice = 0;
        document.querySelectorAll('[data-room-id]').forEach(roomEl => {
            const summaryEl = roomEl.querySelector('.item-summary');
            if (summaryEl) {
                const priceText = summaryEl.querySelector('.price').textContent;
                const price = parseFloat(priceText.replace(/[^\d\.]/g, '')) || 0;
                totalAllPrice += price;
            }
        });
        document.querySelector('.total-summary .price').textContent = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(totalAllPrice);
        
        saveToStorage();
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            rooms: []
        };
        document.querySelectorAll('[data-room-id]').forEach(roomEl => {
            const itemType = roomEl.querySelector('select[name="item_type"]').value;
            const roomData = {
                room_name: roomEl.querySelector('input[name="room_name"]').value,
                item_type: itemType
            };
            if (itemType === 'curtain') {
                roomData.curtain = {
                    price_per_yard: parseFloat(roomEl.querySelector('input[name="curtain_price_yard"]').value) || 0,
                    width_m: parseFloat(roomEl.querySelector('input[name="curtain_width_m"]').value) || 0,
                    height_m: parseFloat(roomEl.querySelector('input[name="curtain_height_m"]').value) || 0,
                    fold_x: parseFloat(roomEl.querySelector('input[name="curtain_fold_x"]').value) || 2.5,
                    style: roomEl.querySelector('select[name="curtain_style"]').value
                };
            } else if (itemType === 'wallpaper') {
                roomData.wallpaper = {
                    price_per_roll: parseFloat(roomEl.querySelector('input[name="wallpaper_price_roll"]').value) || 0,
                    height_m: parseFloat(roomEl.querySelector('input[name="wallpaper_height_m"]').value) || 0,
                    walls: []
                };
                roomEl.querySelectorAll('[data-walls-container] input[name="wall_width_m"]').forEach(input => {
                    roomData.wallpaper.walls.push({
                        width_m: parseFloat(input.value) || 0
                    });
                });
            }
            payload.rooms.push(roomData);
        });
        return payload;
    }
    
    function saveToStorage() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function updateLockState() {
        const isLocked = document.querySelector('input[name="customer_name"]').disabled;
        summaryBtn.querySelector('.material-symbols-outlined').textContent = isLocked ? 'lock' : 'expand_less';
        summaryBtn.title = isLocked ? 'ล็อกการแก้ไข' : 'รายละเอียด';
    }

    // Event listeners
    roomsEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-act="del-room"]')) {
            e.target.closest('.room').remove();
            recalcAll();
        }
    });

    summaryBtn.addEventListener('click', () => {
        const isLocked = document.querySelector('input[name="customer_name"]').disabled;
        if (isLocked) {
            document.querySelectorAll('input, select').forEach(el => el.disabled = false);
        } else {
            const payload = buildPayload();
            summaryCodeEl.textContent = JSON.stringify(payload, null, 2);
            summaryPopup.classList.add('show');
            document.querySelectorAll('input, select').forEach(el => el.disabled = true);
        }
        updateLockState();
    });

    closeSummaryBtn.addEventListener('click', () => {
        summaryPopup.classList.remove('show');
        document.querySelectorAll('input, select').forEach(el => el.disabled = false);
        updateLockState();
    });
    
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.classList.toggle('show');
    });

    importBtn.addEventListener('click', () => {
        const json = prompt("วาง JSON ที่นี่:");
        if (json) {
            try {
                const payload = JSON.parse(json);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
                roomsEl.innerHTML = ""; roomCount = 0;
                if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
                else addRoom();
            } catch(err) {
                showToast("ไม่สามารถนำเข้าข้อมูลได้: รูปแบบ JSON ไม่ถูกต้อง", "error");
            }
        }
    });

    exportBtn.addEventListener('click', () => {
        const payload = buildPayload();
        const jsonStr = JSON.stringify(payload, null, 2);
        navigator.clipboard.writeText(jsonStr).then(() => {
            showToast("คัดลอก JSON แล้ว!");
        }, (err) => {
            console.error('ไม่สามารถคัดลอกได้:', err);
            showToast("ไม่สามารถคัดลอก JSON ได้", "error");
        });
    });

    clearBtn.addEventListener('click', () => {
        if (confirm("คุณแน่ใจหรือไม่ที่จะล้างข้อมูลทั้งหมด?")) {
            localStorage.removeItem(STORAGE_KEY);
            document.querySelector('input[name="customer_name"]').value = '';
            document.querySelector('input[name="customer_address"]').value = '';
            document.querySelector('input[name="customer_phone"]').value = '';
            roomsEl.innerHTML = ""; roomCount = 0;
            addRoom();
            showToast("ล้างข้อมูลแล้ว");
        }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
        if (!summaryBtn.contains(e.target) && !summaryPopup.contains(e.target)) {
            summaryPopup.classList.remove('show');
        }
    });

    orderForm.addEventListener("submit", () => {
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
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
        recalcAll(); // Initial calculation on load
    });
})();