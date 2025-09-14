(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3; // This constant will no longer be used for calculation

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
        rail: { "รางโชว์": 350, "รางM": 300, "รางM (ไฟฟ้า)": 6500, "รางเทปคาน": 200, "รางเทปโซฟา": 200 }
    };
    const CALC = {
        fabric_width_m: 1.4,
        sheer_width_m: 2.8,
        curtain_multiplier: 2.5,
        sheer_multiplier: 2.5,
        default_rail_length_m: 2.5,
        rail_multiplier: 1
    };
    const WALLPAPER_ROLL_SIZE = { width: 0.53, length: 10 };

    const SELECTORS = {
        orderForm: "#orderForm",
        roomTpl: "#roomTpl",
        roomContainer: "#roomsContainer",
        roomCard: ".room-card",
        curtainTpl: "#curtainTpl",
        curtainContainer: "[data-curtains-container]",
        wallTpl: "#wallTpl",
        wallsContainer: "[data-walls-container]",
        addRoomBtn: "#addRoomHeaderBtn",
        payloadInput: "#payload",
        submitBtn: "#submitBtn",
        totalPrice: "#totalPrice",
        totalArea: "#totalArea",
        totalQuantity: "#totalQuantity",
        lockBtn: "#lockBtn",
        clearAllBtn: "#clearAllBtn",
        importBtn: "#importBtn",
        exportBtn: "#exportBtn",
        menuBtn: "#menuBtn",
        menuDropdown: "#menuDropdown",
        toastContainer: "#toast-container"
    };

    const orderForm = document.querySelector(SELECTORS.orderForm);
    const roomsContainer = document.querySelector(SELECTORS.roomContainer);
    const roomTpl = document.querySelector(SELECTORS.roomTpl);
    const curtainTpl = document.querySelector(SELECTORS.curtainTpl);
    const wallTpl = document.querySelector(SELECTORS.wallTpl);
    const addRoomBtn = document.querySelector(SELECTORS.addRoomBtn);
    const lockBtn = document.querySelector(SELECTORS.lockBtn);
    const clearAllBtn = document.querySelector(SELECTORS.clearAllBtn);
    const importBtn = document.querySelector(SELECTORS.importBtn);
    const exportBtn = document.querySelector(SELECTORS.exportBtn);

    let isLocked = false;
    let roomCounter = 0;

    // Helper functions
    const formatPrice = (price) => {
        return price.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    const formatArea = (area) => {
        return area.toFixed(2);
    };

    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    };

    const showToast = (message, type = "info") => {
        const toastContainer = document.querySelector(SELECTORS.toastContainer);
        if (!toastContainer) return;

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        toastContainer.appendChild(toast);

        // Add 'show' class to trigger the transition
        setTimeout(() => {
            toast.classList.add("show");
        }, 10); // Small delay to ensure the transition is applied

        // Hide and remove the toast after a few seconds
        setTimeout(() => {
            toast.classList.remove("show");
            toast.addEventListener("transitionend", () => {
                toast.remove();
            }, { once: true });
        }, 3000);
    };

    // Calculation functions
    const getPricePerMeter = (priceOption, width) => {
        const option = priceOption.find(p => width <= p.threshold);
        return option ? option.add_per_m : 0;
    };

    const calculateHeightSurcharge = (height) => {
        for (const h of PRICING.height) {
            if (height > h.threshold) {
                return (height - h.threshold) * h.add_per_m;
            }
        }
        return 0;
    };

    const calculateCurtainPriceAndQuantity = (width, height, priceIndex, style, type) => {
        const priceList = PRICING[type];
        if (!priceList || priceIndex >= priceList.length) {
            return { quantity: 0, price: 0 };
        }

        const pricePerYard = priceList[priceIndex];
        const fabricWidth = (type === 'fabric') ? CALC.fabric_width_m : CALC.sheer_width_m;
        const multiplier = (type === 'fabric') ? CALC.curtain_multiplier : CALC.sheer_multiplier;

        const quantity = Math.ceil((width * multiplier) / fabricWidth) * height;
        const basePrice = quantity * pricePerYard * SQM_TO_SQYD; // Converted to SQYD for price
        const surcharge = PRICING.style_surcharge[style] || 0;
        const heightSurcharge = calculateHeightSurcharge(height);

        return {
            quantity: quantity,
            price: basePrice + surcharge + heightSurcharge
        };
    };

    const calculateRailPrice = (length, type) => {
        const pricePerMeter = PRICING.rail[type];
        if (!pricePerMeter) return 0;
        const railLength = Math.max(length, CALC.default_rail_length_m);
        return railLength * pricePerMeter;
    };

    const calculateWallpaperPriceAndQuantity = (height, walls, pricePerRoll) => {
        const totalWallWidth = walls.reduce((sum, wall) => sum + wall.width, 0);
        const totalArea = totalWallWidth * height;

        const rollsNeeded = Math.ceil(totalArea / WALLPAPER_ROLL_SIZE.width / WALLPAPER_ROLL_SIZE.length);
        const price = rollsNeeded * pricePerRoll;

        return {
            rolls: rollsNeeded,
            area: totalArea,
            price: price
        };
    };

    // Update functions
    const updateCurtainSummary = (container, type) => {
        const width = parseFloat(container.querySelector('[name="curtain_width_m"]').value) || 0;
        const height = parseFloat(container.querySelector('[name="curtain_height_m"]').value) || 0;
        const priceIndex = parseInt(container.querySelector('[name="curtain_price_m_option"]').value) || 0;
        const style = container.querySelector('[name="curtain_style"]').value;
        const railType = container.querySelector('[name="curtain_rail_type"]').value;
        const railLength = parseFloat(container.querySelector('[name="curtain_rail_length"]').value) || 0;

        const summaryEl = container.querySelector('[data-curtain-summary]');

        if (width === 0 || height === 0) {
            summaryEl.querySelector('.price').textContent = '0';
            summaryEl.querySelector('.area').textContent = '0.00';
            summaryEl.querySelector('.quantity').textContent = '0';
            summaryEl.querySelector('.rail-price').textContent = '0';
            return;
        }

        const { quantity, price } = calculateCurtainPriceAndQuantity(width, height, priceIndex, style, type);
        const railPrice = calculateRailPrice(railLength, railType);

        summaryEl.querySelector('.price').textContent = formatPrice(price + railPrice);
        summaryEl.querySelector('.area').textContent = formatArea(width * height);
        summaryEl.querySelector('.quantity').textContent = formatArea(quantity);
        summaryEl.querySelector('.rail-price').textContent = formatPrice(railPrice);
    };

    const updateWallpaperSummary = (container) => {
        const height = parseFloat(container.querySelector('[name="wallpaper_height_m"]').value) || 0;
        const pricePerRoll = parseFloat(container.querySelector('[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0;
        const wallInputs = container.querySelectorAll('[name="wall_width_m"]');

        const walls = Array.from(wallInputs).map(input => ({
            width: parseFloat(input.value) || 0
        }));

        const summaryEl = container.querySelector('[data-wallpaper-summary]');

        if (height === 0 || walls.length === 0 || walls.every(w => w.width === 0)) {
            summaryEl.querySelector('.price').textContent = '0';
            summaryEl.querySelector('.area').textContent = '0.00';
            summaryEl.querySelector('.rolls').textContent = '0';
            return;
        }

        const { rolls, area, price } = calculateWallpaperPriceAndQuantity(height, walls, pricePerRoll);

        summaryEl.querySelector('.price').textContent = formatPrice(price);
        summaryEl.querySelector('.area').textContent = formatArea(area);
        summaryEl.querySelector('.rolls').textContent = rolls;
    };

    const updateRoomSummary = (roomCard) => {
        const roomTotalSummary = roomCard.querySelector('[data-room-summary]');
        let roomTotalPrice = 0;
        let roomTotalArea = 0;

        // Calculate for curtains
        roomCard.querySelectorAll('.curtain-card').forEach(curtainCard => {
            const width = parseFloat(curtainCard.querySelector('[name="curtain_width_m"]').value) || 0;
            const height = parseFloat(curtainCard.querySelector('[name="curtain_height_m"]').value) || 0;
            const priceIndex = parseInt(curtainCard.querySelector('[name="curtain_price_m_option"]').value) || 0;
            const style = curtainCard.querySelector('[name="curtain_style"]').value;
            const type = curtainCard.dataset.type;
            const railType = curtainCard.querySelector('[name="curtain_rail_type"]').value;
            const railLength = parseFloat(curtainCard.querySelector('[name="curtain_rail_length"]').value) || 0;

            const { price } = calculateCurtainPriceAndQuantity(width, height, priceIndex, style, type);
            const railPrice = calculateRailPrice(railLength, railType);

            roomTotalPrice += price + railPrice;
            roomTotalArea += width * height;
        });

        // Calculate for wallpapers
        roomCard.querySelectorAll('.wallpaper-card').forEach(wallpaperCard => {
            const height = parseFloat(wallpaperCard.querySelector('[name="wallpaper_height_m"]').value) || 0;
            const pricePerRoll = parseFloat(wallpaperCard.querySelector('[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0;
            const wallInputs = wallpaperCard.querySelectorAll('[name="wall_width_m"]');

            const walls = Array.from(wallInputs).map(input => ({
                width: parseFloat(input.value) || 0
            }));

            const { area, price } = calculateWallpaperPriceAndQuantity(height, walls, pricePerRoll);

            roomTotalPrice += price;
            roomTotalArea += area;
        });

        roomTotalSummary.querySelector('.price').textContent = formatPrice(roomTotalPrice);
        roomTotalSummary.querySelector('.area').textContent = formatArea(roomTotalArea);
    };

    const updateGrandTotal = () => {
        let grandTotalPrice = 0;
        let grandTotalArea = 0;

        document.querySelectorAll(SELECTORS.roomCard).forEach(roomCard => {
            const roomSummary = roomCard.querySelector('[data-room-summary]');
            grandTotalPrice += parseFloat(roomSummary.querySelector('.price').textContent.replace(/,/g, '')) || 0;
            grandTotalArea += parseFloat(roomSummary.querySelector('.area').textContent) || 0;
        });

        document.querySelector(SELECTORS.totalPrice).textContent = formatPrice(grandTotalPrice);
        document.querySelector(SELECTORS.totalArea).textContent = formatArea(grandTotalArea);
    };

    const fullUpdate = debounce(() => {
        document.querySelectorAll(SELECTORS.roomCard).forEach(roomCard => {
            roomCard.querySelectorAll('.curtain-card').forEach(curtainCard => {
                updateCurtainSummary(curtainCard, curtainCard.dataset.type);
            });
            roomCard.querySelectorAll('.wallpaper-card').forEach(wallpaperCard => {
                updateWallpaperSummary(wallpaperCard);
            });
            updateRoomSummary(roomCard);
        });
        updateGrandTotal();
        savePayload();
    }, 500);

    // Event handlers
    const addCurtain = (container, type) => {
        const newCurtain = curtainTpl.content.cloneNode(true).querySelector('.curtain-card');
        newCurtain.dataset.type = type;
        const isSheer = type === 'sheer';

        // Update card title and class
        const roomHeadEl = newCurtain.querySelector('.room-head');
        roomHeadEl.textContent = isSheer ? 'ผ้าโปร่ง' : 'ผ้าม่าน';
        roomHeadEl.classList.add(isSheer ? 'sheer-bg' : 'fabric-bg');

        // Update options
        const priceSelect = newCurtain.querySelector('[name="curtain_price_m_option"]');
        const priceOptions = PRICING[type];
        priceSelect.innerHTML = priceOptions.map((price, index) => `<option value="${index}">${formatPrice(price)}</option>`).join('');

        // Hide rail for sheer
        const railSection = newCurtain.querySelector('[data-rail-section]');
        if (isSheer) {
            railSection.style.display = 'none';
        } else {
            const railSelect = newCurtain.querySelector('[name="curtain_rail_type"]');
            railSelect.innerHTML = Object.keys(PRICING.rail).map(key => `<option value="${key}">${key} (${formatPrice(PRICING.rail[key])} บ./ม.)</option>`).join('');
        }

        // Add event listeners
        newCurtain.addEventListener('input', fullUpdate);
        newCurtain.querySelector('[data-act="del-curtain"]').addEventListener('click', () => {
            newCurtain.remove();
            fullUpdate();
        });

        container.appendChild(newCurtain);
        fullUpdate();
    };

    const addWallpaper = (container) => {
        const newWallpaper = document.querySelector('#wallpaperTpl').content.cloneNode(true).querySelector('.wallpaper-card');

        newWallpaper.querySelector('[data-act="add-wall"]').addEventListener('click', () => {
            const wallsContainer = newWallpaper.querySelector('[data-walls-container]');
            const newWall = wallTpl.content.cloneNode(true);
            wallsContainer.appendChild(newWall);
            fullUpdate();
        });

        newWallpaper.addEventListener('input', fullUpdate);
        newWallpaper.querySelector('[data-act="del-wallpaper"]').addEventListener('click', () => {
            newWallpaper.remove();
            fullUpdate();
        });

        // Add an initial wall input
        const wallsContainer = newWallpaper.querySelector('[data-walls-container]');
        wallsContainer.appendChild(wallTpl.content.cloneNode(true));

        container.appendChild(newWallpaper);
        fullUpdate();
    };

    const addRoom = () => {
        const newRoom = roomTpl.content.cloneNode(true).querySelector(SELECTORS.roomCard);
        const roomNameInput = newRoom.querySelector('[name="room_name"]');
        roomNameInput.value = `ห้องที่ ${++roomCounter}`;

        newRoom.querySelector('[data-act="add-curtain-fabric"]').addEventListener('click', () => {
            addCurtain(newRoom.querySelector(SELECTORS.curtainContainer), 'fabric');
        });
        newRoom.querySelector('[data-act="add-curtain-sheer"]').addEventListener('click', () => {
            addCurtain(newRoom.querySelector(SELECTORS.curtainContainer), 'sheer');
        });
        newRoom.querySelector('[data-act="add-wallpaper"]').addEventListener('click', () => {
            addWallpaper(newRoom.querySelector(SELECTORS.curtainContainer));
        });
        newRoom.querySelector('[data-act="del-room"]').addEventListener('click', () => {
            newRoom.remove();
            fullUpdate();
        });

        newRoom.addEventListener('input', (e) => {
            if (e.target.closest('.wallpaper-card')) {
                const wallsContainer = e.target.closest('.walls-section').querySelector('[data-walls-container]');
                if (e.target.classList.contains('wall-input-row') && e.target.querySelector('[name="wall_width_m"]')) {
                    const input = e.target.querySelector('[name="wall_width_m"]');
                    if (input.value && input === wallsContainer.lastElementChild.querySelector('[name="wall_width_m"]')) {
                        const newWall = wallTpl.content.cloneNode(true);
                        wallsContainer.appendChild(newWall);
                    }
                }
            }
            fullUpdate();
        });

        newRoom.addEventListener('click', (e) => {
            if (e.target.matches('[data-act="del-wall"]')) {
                e.target.closest('.wall-input-row').remove();
                fullUpdate();
            }
        });

        roomsContainer.appendChild(newRoom);
        fullUpdate();
    };

    // Data handling
    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customerName: document.querySelector('[name="customer_name"]').value,
            customerPhone: document.querySelector('[name="customer_phone"]').value,
            customerAddress: document.querySelector('[name="customer_address"]').value,
            rooms: []
        };

        document.querySelectorAll(SELECTORS.roomCard).forEach(roomCard => {
            const room = {
                roomName: roomCard.querySelector('[name="room_name"]').value,
                curtains: [],
                wallpapers: []
            };

            // Curtains
            roomCard.querySelectorAll('.curtain-card').forEach(curtainCard => {
                const type = curtainCard.dataset.type;
                const width = parseFloat(curtainCard.querySelector('[name="curtain_width_m"]').value) || 0;
                const height = parseFloat(curtainCard.querySelector('[name="curtain_height_m"]').value) || 0;
                const priceIndex = parseInt(curtainCard.querySelector('[name="curtain_price_m_option"]').value) || 0;
                const style = curtainCard.querySelector('[name="curtain_style"]').value;
                const railType = curtainCard.querySelector('[name="curtain_rail_type"]').value;
                const railLength = parseFloat(curtainCard.querySelector('[name="curtain_rail_length"]').value) || 0;

                const { quantity, price } = calculateCurtainPriceAndQuantity(width, height, priceIndex, style, type);
                const railPrice = calculateRailPrice(railLength, railType);

                room.curtains.push({
                    type: type,
                    width: width,
                    height: height,
                    style: style,
                    priceOptionIndex: priceIndex,
                    quantity: quantity,
                    price: price,
                    rail: {
                        type: railType,
                        length: railLength,
                        price: railPrice
                    }
                });
            });

            // Wallpapers
            roomCard.querySelectorAll('.wallpaper-card').forEach(wallpaperCard => {
                const height = parseFloat(wallpaperCard.querySelector('[name="wallpaper_height_m"]').value) || 0;
                const pricePerRoll = parseFloat(wallpaperCard.querySelector('[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0;
                const walls = Array.from(wallpaperCard.querySelectorAll('[name="wall_width_m"]')).map(input => parseFloat(input.value) || 0).filter(w => w > 0);

                const { rolls, area, price } = calculateWallpaperPriceAndQuantity(height, walls.map(w => ({ width: w })), pricePerRoll);

                room.wallpapers.push({
                    height: height,
                    pricePerRoll: pricePerRoll,
                    walls: walls,
                    rolls: rolls,
                    area: area,
                    price: price
                });
            });

            payload.rooms.push(room);
        });

        return payload;
    };

    const loadPayload = (payload) => {
        // Clear existing content
        roomsContainer.innerHTML = '';
        roomCounter = 0;

        // Load customer data
        document.querySelector('[name="customer_name"]').value = payload.customerName || '';
        document.querySelector('[name="customer_phone"]').value = payload.customerPhone || '';
        document.querySelector('[name="customer_address"]').value = payload.customerAddress || '';

        // Load rooms
        payload.rooms.forEach(roomData => {
            const newRoom = roomTpl.content.cloneNode(true).querySelector(SELECTORS.roomCard);
            const roomNameInput = newRoom.querySelector('[name="room_name"]');
            roomNameInput.value = roomData.roomName || `ห้องที่ ${++roomCounter}`;

            const curtainsContainer = newRoom.querySelector(SELECTORS.curtainContainer);
            const wallpapersContainer = newRoom.querySelector(SELECTORS.curtainContainer); // Re-use the same container for wallpapers

            // Load curtains
            (roomData.curtains || []).forEach(curtainData => {
                const newCurtain = curtainTpl.content.cloneNode(true).querySelector('.curtain-card');
                const isSheer = curtainData.type === 'sheer';
                newCurtain.dataset.type = curtainData.type;
                newCurtain.querySelector('.room-head').textContent = isSheer ? 'ผ้าโปร่ง' : 'ผ้าม่าน';
                newCurtain.querySelector('.room-head').classList.add(isSheer ? 'sheer-bg' : 'fabric-bg');
                newCurtain.querySelector('[name="curtain_width_m"]').value = curtainData.width;
                newCurtain.querySelector('[name="curtain_height_m"]').value = curtainData.height;
                newCurtain.querySelector('[name="curtain_price_m_option"]').value = curtainData.priceOptionIndex;
                newCurtain.querySelector('[name="curtain_style"]').value = curtainData.style;
                if (!isSheer) {
                    newCurtain.querySelector('[name="curtain_rail_type"]').value = curtainData.rail.type;
                    newCurtain.querySelector('[name="curtain_rail_length"]').value = curtainData.rail.length;
                } else {
                    newCurtain.querySelector('[data-rail-section]').style.display = 'none';
                }

                newCurtain.addEventListener('input', fullUpdate);
                newCurtain.querySelector('[data-act="del-curtain"]').addEventListener('click', () => {
                    newCurtain.remove();
                    fullUpdate();
                });
                curtainsContainer.appendChild(newCurtain);
            });

            // Load wallpapers
            (roomData.wallpapers || []).forEach(wallpaperData => {
                const newWallpaper = document.querySelector('#wallpaperTpl').content.cloneNode(true).querySelector('.wallpaper-card');
                newWallpaper.querySelector('[name="wallpaper_height_m"]').value = wallpaperData.height;
                newWallpaper.querySelector('[name="wallpaper_price_roll"]').value = wallpaperData.pricePerRoll;
                const wallsContainer = newWallpaper.querySelector('[data-walls-container]');

                (wallpaperData.walls || []).forEach(wallWidth => {
                    const newWall = wallTpl.content.cloneNode(true);
                    newWall.querySelector('[name="wall_width_m"]').value = wallWidth;
                    wallsContainer.appendChild(newWall);
                });
                // Add an empty one at the end if the last one has a value
                if (wallpaperData.walls && wallpaperData.walls.length > 0) {
                    wallsContainer.appendChild(wallTpl.content.cloneNode(true));
                }

                newWallpaper.querySelector('[data-act="add-wall"]').addEventListener('click', () => {
                    const wallsContainer = newWallpaper.querySelector('[data-walls-container]');
                    const newWall = wallTpl.content.cloneNode(true);
                    wallsContainer.appendChild(newWall);
                    fullUpdate();
                });

                newWallpaper.addEventListener('input', fullUpdate);
                newWallpaper.querySelector('[data-act="del-wallpaper"]').addEventListener('click', () => {
                    newWallpaper.remove();
                    fullUpdate();
                });
                wallpapersContainer.appendChild(newWallpaper);
            });

            newRoom.querySelector('[data-act="add-curtain-fabric"]').addEventListener('click', () => {
                addCurtain(newRoom.querySelector(SELECTORS.curtainContainer), 'fabric');
            });
            newRoom.querySelector('[data-act="add-curtain-sheer"]').addEventListener('click', () => {
                addCurtain(newRoom.querySelector(SELECTORS.curtainContainer), 'sheer');
            });
            newRoom.querySelector('[data-act="add-wallpaper"]').addEventListener('click', () => {
                addWallpaper(newRoom.querySelector(SELECTORS.curtainContainer));
            });
            newRoom.querySelector('[data-act="del-room"]').addEventListener('click', () => {
                newRoom.remove();
                fullUpdate();
            });

            newRoom.addEventListener('input', (e) => {
                if (e.target.closest('.wallpaper-card')) {
                    const wallsContainer = e.target.closest('.walls-section').querySelector('[data-walls-container]');
                    if (e.target.classList.contains('wall-input-row') && e.target.querySelector('[name="wall_width_m"]')) {
                        const input = e.target.querySelector('[name="wall_width_m"]');
                        if (input.value && input === wallsContainer.lastElementChild.querySelector('[name="wall_width_m"]')) {
                            const newWall = wallTpl.content.cloneNode(true);
                            wallsContainer.appendChild(newWall);
                        }
                    }
                }
                fullUpdate();
            });

            newRoom.addEventListener('click', (e) => {
                if (e.target.matches('[data-act="del-wall"]')) {
                    e.target.closest('.wall-input-row').remove();
                    fullUpdate();
                }
            });

            roomsContainer.appendChild(newRoom);
        });
        fullUpdate();
    };


    const savePayload = () => {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            console.log("Data saved to localStorage.");
        } catch (err) {
            console.error("Failed to save data to localStorage:", err);
            showToast("Failed to save data automatically.", "error");
        }
    };

    const updateLockState = () => {
        isLocked = document.body.classList.toggle('locked', isLocked);
        lockBtn.innerHTML = isLocked ? '<span class="lock-text">ปลดล็อค</span> <span class="lock-icon">🔓</span>' : '<span class="lock-text">ล็อค</span> <span class="lock-icon">🔒</span>';
        showToast(isLocked ? "ล็อคข้อมูลแล้ว" : "ปลดล็อคข้อมูลแล้ว", "info");
    };

    // Initial setup
    document.addEventListener("DOMContentLoaded", () => {
        // Toggle menu dropdown
        document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
            const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
            if (menuDropdown) menuDropdown.classList.toggle('show');
        });

        // Close menu when clicking outside
        window.addEventListener('click', (e) => {
            const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
            const menuBtn = document.querySelector(SELECTORS.menuBtn);
            if (menuDropdown && menuBtn && !menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
                menuDropdown.classList.remove('show');
            }
        });

        orderForm.addEventListener("submit", (e) => {
            const payload = buildPayload();
            const payloadInput = document.querySelector(SELECTORS.payloadInput);
            if (payloadInput) payloadInput.value = JSON.stringify(payload);
            showToast("ส่งข้อมูลแล้ว...", "success");
        });
        
        window.addEventListener('load', () => {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                try {
                    const payload = JSON.parse(storedData);
                    loadPayload(payload);
                } catch(err) {
                    console.error("Failed to load data from storage:", err);
                    localStorage.removeItem(STORAGE_KEY); 
                    addRoom();
                }
            } else {
                addRoom();
            }
            updateLockState();
        });

        addRoomBtn.addEventListener('click', addRoom);
        lockBtn.addEventListener('click', updateLockState);
        clearAllBtn.addEventListener('click', () => {
            if (confirm("คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด?")) {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            }
        });

        exportBtn.addEventListener('click', () => {
            const payload = buildPayload();
            const dataStr = JSON.stringify(payload, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            const exportFileDefaultName = 'marnthara_data.json';
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            showToast("Export ข้อมูลแล้ว!", "success");
        });

        importBtn.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.onchange = e => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = event => {
                        try {
                            const importedPayload = JSON.parse(event.target.result);
                            loadPayload(importedPayload);
                            savePayload();
                            showToast("Import ข้อมูลสำเร็จ!", "success");
                        } catch (err) {
                            showToast("ไฟล์ไม่ถูกต้องหรือไม่ใช่ JSON", "error");
                        }
                    };
                    reader.readAsText(file);
                }
            };
            fileInput.click();
        });
    });

})();