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
        fabricYardage: (style, width_m) => {
            const width_yd = width_m * 1.09361;
            switch (style) {
                case "จีบ": return width_yd * 2.5;
                case "ลอน": return width_yd * 2.8;
                case "ตาไก่": return width_yd * 2;
                default: return 0;
            }
        },
        sheerYardage: (width_m) => width_m * 2.5 * 1.09361,
        heightFactor: (height_m) => {
            const height = PRICING.height.find(h => height_m >= h.threshold);
            return height ? height.add_per_m : 0;
        },
    };

    const roomTpl = document.getElementById("roomTpl").content;
    const curtainTpl = document.getElementById("curtainTpl").content;
    const fabricTpl = document.getElementById("fabricTpl").content;
    const decoTpl = document.getElementById("decoTpl").content;
    const wallpaperTpl = document.getElementById("wallpaperTpl").content;
    const wallTpl = document.getElementById("wallTpl").content;

    const orderForm = document.getElementById("orderForm");
    const roomsEl = document.getElementById("roomsContainer");
    let roomCount = 0;
    
    // Helper function to create a unique ID
    const createId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const formatPrice = (price) => new Intl.NumberFormat('th-TH').format(Math.round(price));
    const toggleLock = () => {
        const isLocked = document.body.classList.toggle("locked");
        document.getElementById("lockBtn").title = isLocked ? "ปลดล็อค" : "ล็อค";
    };

    const toast = (message, type = "info") => {
        const toastContainer = document.querySelector(".toast-container");
        const toastEl = document.createElement("div");
        toastEl.className = `toast toast-${type}`;
        toastEl.textContent = message;
        toastContainer.appendChild(toastEl);
        setTimeout(() => toastEl.classList.add("show"), 10);
        setTimeout(() => {
            toastEl.classList.remove("show");
            setTimeout(() => toastEl.remove(), 500);
        }, 3000);
    };

    const addRoom = (roomData = null) => {
        const roomEl = roomTpl.cloneNode(true).firstElementChild;
        roomEl.dataset.index = roomCount;
        if (roomData) {
            roomEl.dataset.id = roomData.id;
            roomEl.querySelector('input[name="room_name"]').value = roomData.room_name;
            roomEl.querySelector('input[name="discount_baht"]').value = roomData.discount_baht;
            roomEl.querySelector('input[name="surcharge_baht"]').value = roomData.surcharge_baht;
        } else {
            roomEl.dataset.id = createId();
            roomEl.querySelector('input[name="room_name"]').value = `ห้อง ${roomCount + 1}`;
        }

        // Check if there is curtain data and add the curtain section
        if (roomData && roomData.curtains) {
            addCurtainSet(roomEl, roomData.curtains);
        }
        
        // Add deco items if they exist
        if (roomData && roomData.decos && roomData.decos.length > 0) {
            const decoContainer = roomEl.querySelector(".deco-container");
            roomData.decos.forEach(decoData => addDecoItem(decoContainer, decoData));
        }

        // Add wallpaper set if it exists
        if (roomData && roomData.wallpaper) {
            addWallpaperSet(roomEl, roomData.wallpaper);
        }
        
        roomsEl.appendChild(roomEl);
        roomCount++;
        recalcAll();
    };

    const addCurtainSet = (roomEl, curtainData = null) => {
        const curtainContainer = roomEl.querySelector(".curtain-container");
        if (curtainContainer.querySelector(".curtain-section")) return; // Prevent adding multiple sets

        const curtainSetEl = curtainTpl.cloneNode(true).firstElementChild;
        curtainContainer.appendChild(curtainSetEl);
        
        // Hide the "add curtain" button for this room
        roomEl.querySelector('[data-act="add-curtain"]').style.display = 'none';

        if (curtainData) {
            curtainSetEl.dataset.id = curtainData.id;
            // Set values based on loaded data
            const fabricPriceSelect = curtainSetEl.querySelector('select[name="fabric_price_m"]');
            if (fabricPriceSelect) fabricPriceSelect.value = curtainData.fabric_price_m || '1000';
            const styleSelect = curtainSetEl.querySelector('select[name="style_surcharge"]');
            if (styleSelect) styleSelect.value = curtainData.style_surcharge || '0';
            const sheerPriceSelect = curtainSetEl.querySelector('select[name="sheer_price_m"]');
            if (sheerPriceSelect) sheerPriceSelect.value = curtainData.sheer_price_m || '0';
            const railInput = curtainSetEl.querySelector('input[name="rail_price_per_m"]');
            if (railInput) railInput.value = curtainData.rail_price_per_m || '450';
            const installInput = curtainSetEl.querySelector('input[name="install_price_per_m"]');
            if (installInput) installInput.value = curtainData.install_price_per_m || '150';

            if (curtainData.points && curtainData.points.length > 0) {
                const pointContainer = curtainSetEl.querySelector(".curtain-point-container");
                curtainData.points.forEach(pointData => addFabricPoint(pointContainer, pointData));
            }
        } else {
            // Set default values for new set
            curtainSetEl.dataset.id = createId();
            addFabricPoint(curtainSetEl.querySelector(".curtain-point-container"));
        }
        recalcRoom(roomEl);
    };

    const delCurtainSet = (btn) => {
        const roomEl = btn.closest('[data-type="room"]');
        btn.closest('[data-type="curtain-set"]').remove();
        // Show the "add curtain" button again
        roomEl.querySelector('[data-act="add-curtain"]').style.display = '';
        recalcRoom(roomEl);
    };

    const addFabricPoint = (container, pointData = null) => {
        const pointEl = fabricTpl.cloneNode(true).firstElementChild;
        if (pointData) {
            pointEl.dataset.id = pointData.id;
            pointEl.querySelector('input[name="fabric_width_m"]').value = pointData.width_m;
            pointEl.querySelector('input[name="fabric_height_m"]').value = pointData.height_m;
            pointEl.querySelector('input[name="fabric_qty"]').value = pointData.qty;
        } else {
            pointEl.dataset.id = createId();
        }
        container.appendChild(pointEl);
        recalcRoom(container.closest('[data-type="room"]'));
    };
    
    // ... (rest of the functions remain the same) ...
    // Note: The rest of the functions (addDecoItem, addWallpaperSet, etc.) are assumed to be
    // in the original file and do not require major changes to their logic, only their
    // entry point (e.g., they will now be triggered by a button instead of on room creation).
    // The `recalcAll` and `recalcRoom` functions need to be robust enough to handle the absence
    // of curtain sections.
    const addDecoItem = (container, decoData = null) => { /* ... (remains the same) ... */ };
    const addWallpaperSet = (roomEl, wallpaperData = null) => { /* ... (remains the same) ... */ };
    const addWall = (container, wallData = null) => { /* ... (remains the same) ... */ };
    const delRoom = (btn) => { /* ... (remains the same) ... */ };
    const delPoint = (btn) => { /* ... (remains the same) ... */ };
    const delDecoItem = (btn) => { /* ... (remains the same) ... */ };
    const delWallpaperSet = (btn) => { /* ... (remains the same) ... */ };
    const delWall = (btn) => { /* ... (remains the same) ... */ };
    const clearDeco = (btn) => { /* ... (remains the same) ... */ };
    const clearWallpaper = (btn) => { /* ... (remains the same) ... */ };

    const recalcRoom = (roomEl) => {
        let roomTotalPrice = 0;
        let fabricPrice = 0, sheerPrice = 0, railPrice = 0, installPrice = 0, decoPrice = 0, wallpaperPrice = 0;
        
        // --- Recalculate Curtains ---
        const curtainSetEl = roomEl.querySelector('[data-type="curtain-set"]');
        if (curtainSetEl) {
            const fabricPricePerM = parseFloat(curtainSetEl.querySelector('select[name="fabric_price_m"]').value) || 0;
            const styleSurcharge = parseFloat(curtainSetEl.querySelector('select[name="style_surcharge"]').value) || 0;
            const sheerPricePerM = parseFloat(curtainSetEl.querySelector('select[name="sheer_price_m"]').value) || 0;
            const railPricePerM = parseFloat(curtainSetEl.querySelector('input[name="rail_price_per_m"]').value) || 0;
            const installPricePerM = parseFloat(curtainSetEl.querySelector('input[name="install_price_per_m"]').value) || 0;
            const style = curtainSetEl.querySelector('select[name="style_surcharge"] option:checked').textContent;

            curtainSetEl.querySelectorAll('[data-type="curtain-point"]').forEach(pointEl => {
                const width_m = parseFloat(pointEl.querySelector('input[name="fabric_width_m"]').value) || 0;
                const height_m = parseFloat(pointEl.querySelector('input[name="fabric_height_m"]').value) || 0;
                const qty = parseInt(pointEl.querySelector('input[name="fabric_qty"]').value) || 0;

                const fabricYardage = CALC.fabricYardage(style, width_m);
                const sheerYardage = CALC.sheerYardage(width_m);
                const heightAdd = CALC.heightFactor(height_m);
                
                const pointFabricPrice = (fabricYardage * (fabricPricePerM * SQM_TO_SQYD) + (width_m * heightAdd) + styleSurcharge) * qty;
                const pointSheerPrice = (sheerYardage * (sheerPricePerM * SQM_TO_SQYD)) * qty;
                const pointRailPrice = (width_m * railPricePerM) * qty;
                const pointInstallPrice = (width_m * installPricePerM) * qty;

                pointEl.querySelector('.fabric_price').textContent = formatPrice(pointFabricPrice);
                pointEl.querySelector('.sheer_price').textContent = formatPrice(pointSheerPrice);
                pointEl.querySelector('.rail_price').textContent = formatPrice(pointRailPrice);
                pointEl.querySelector('.install_price').textContent = formatPrice(pointInstallPrice);
                const totalPointPrice = pointFabricPrice + pointSheerPrice + pointRailPrice + pointInstallPrice;
                pointEl.querySelector('.total_point_price').textContent = formatPrice(totalPointPrice);

                fabricPrice += pointFabricPrice;
                sheerPrice += pointSheerPrice;
                railPrice += pointRailPrice;
                installPrice += pointInstallPrice;
            });
        }
        
        // --- Recalculate Decoration ---
        roomEl.querySelectorAll('[data-type="deco-item"]').forEach(itemEl => {
            const qty = parseInt(itemEl.querySelector('input[name="deco_qty"]').value) || 0;
            const price = parseFloat(itemEl.querySelector('input[name="deco_price_unit"]').value.replace(/,/g, '')) || 0;
            decoPrice += qty * price;
        });

        // --- Recalculate Wallpaper ---
        const wallpaperSetEl = roomEl.querySelector('[data-type="wallpaper-set"]');
        if (wallpaperSetEl) {
            const height = parseFloat(wallpaperSetEl.querySelector('input[name="wallpaper_height_m"]').value) || 0;
            const pricePerRoll = parseFloat(wallpaperSetEl.querySelector('input[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0;
            let totalWallWidth = 0;
            wallpaperSetEl.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                totalWallWidth += parseFloat(input.value) || 0;
            });
            const sqm = totalWallWidth * height;
            const rolls = Math.ceil(sqm / WALLPAPER_SQM_PER_ROLL);
            wallpaperPrice = rolls * pricePerRoll;
            const summaryEl = wallpaperSetEl.querySelector('[data-wallpaper-summary]');
            summaryEl.querySelector('.price:nth-child(1)').textContent = formatPrice(wallpaperPrice);
            summaryEl.querySelector('.price:nth-child(2)').textContent = (Math.round(sqm * 100) / 100).toFixed(2);
            summaryEl.querySelector('.price:nth-child(3)').textContent = rolls;
        }

        const discount = parseFloat(roomEl.querySelector('input[name="discount_baht"]').value.replace(/,/g, '')) || 0;
        const surcharge = parseFloat(roomEl.querySelector('input[name="surcharge_baht"]').value.replace(/,/g, '')) || 0;
        roomTotalPrice = (fabricPrice + sheerPrice + railPrice + installPrice + decoPrice + wallpaperPrice) - discount + surcharge;
        roomEl.querySelector('.room-summary-text .price').textContent = formatPrice(roomTotalPrice);
        recalcAll();
    };
    
    const recalcAll = () => {
        let totalFabricPrice = 0, totalSheerPrice = 0, totalRailPrice = 0, totalInstallPrice = 0;
        let totalDecoPrice = 0, totalWallpaperPrice = 0;
        let totalDiscount = 0, totalSurcharge = 0;

        document.querySelectorAll('[data-type="room"]').forEach(roomEl => {
            // Recalculate values from each room's sub-sections.
            // This is a simple sum of the component prices.
            const curtainSetEl = roomEl.querySelector('[data-type="curtain-set"]');
            if (curtainSetEl) {
                const fabricPricePerM = parseFloat(curtainSetEl.querySelector('select[name="fabric_price_m"]').value) || 0;
                const styleSurcharge = parseFloat(curtainSetEl.querySelector('select[name="style_surcharge"]').value) || 0;
                const sheerPricePerM = parseFloat(curtainSetEl.querySelector('select[name="sheer_price_m"]').value) || 0;
                const railPricePerM = parseFloat(curtainSetEl.querySelector('input[name="rail_price_per_m"]').value) || 0;
                const installPricePerM = parseFloat(curtainSetEl.querySelector('input[name="install_price_per_m"]').value) || 0;
                const style = curtainSetEl.querySelector('select[name="style_surcharge"] option:checked').textContent;

                curtainSetEl.querySelectorAll('[data-type="curtain-point"]').forEach(pointEl => {
                    const width_m = parseFloat(pointEl.querySelector('input[name="fabric_width_m"]').value) || 0;
                    const height_m = parseFloat(pointEl.querySelector('input[name="fabric_height_m"]').value) || 0;
                    const qty = parseInt(pointEl.querySelector('input[name="fabric_qty"]').value) || 0;

                    const fabricYardage = CALC.fabricYardage(style, width_m);
                    const sheerYardage = CALC.sheerYardage(width_m);
                    const heightAdd = CALC.heightFactor(height_m);
                    
                    totalFabricPrice += (fabricYardage * (fabricPricePerM * SQM_TO_SQYD) + (width_m * heightAdd) + styleSurcharge) * qty;
                    totalSheerPrice += (sheerYardage * (sheerPricePerM * SQM_TO_SQYD)) * qty;
                    totalRailPrice += (width_m * railPricePerM) * qty;
                    totalInstallPrice += (width_m * installPricePerM) * qty;
                });
            }
            
            roomEl.querySelectorAll('[data-type="deco-item"]').forEach(itemEl => {
                const qty = parseInt(itemEl.querySelector('input[name="deco_qty"]').value) || 0;
                const price = parseFloat(itemEl.querySelector('input[name="deco_price_unit"]').value.replace(/,/g, '')) || 0;
                totalDecoPrice += qty * price;
            });

            const wallpaperSetEl = roomEl.querySelector('[data-type="wallpaper-set"]');
            if (wallpaperSetEl) {
                const height = parseFloat(wallpaperSetEl.querySelector('input[name="wallpaper_height_m"]').value) || 0;
                const pricePerRoll = parseFloat(wallpaperSetEl.querySelector('input[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0;
                let totalWallWidth = 0;
                wallpaperSetEl.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                    totalWallWidth += parseFloat(input.value) || 0;
                });
                const sqm = totalWallWidth * height;
                const rolls = Math.ceil(sqm / WALLPAPER_SQM_PER_ROLL);
                totalWallpaperPrice += rolls * pricePerRoll;
            }

            totalDiscount += parseFloat(roomEl.querySelector('input[name="discount_baht"]').value.replace(/,/g, '')) || 0;
            totalSurcharge += parseFloat(roomEl.querySelector('input[name="surcharge_baht"]').value.replace(/,/g, '')) || 0;
        });

        const totalFinalPrice = (totalFabricPrice + totalSheerPrice + totalRailPrice + totalInstallPrice + totalDecoPrice + totalWallpaperPrice) - totalDiscount + totalSurcharge;
        
        document.getElementById("totalFabricPrice").textContent = formatPrice(totalFabricPrice + totalSheerPrice + totalRailPrice + totalInstallPrice);
        document.getElementById("totalWallpaperPrice").textContent = formatPrice(totalWallpaperPrice);
        document.getElementById("totalDecoPrice").textContent = formatPrice(totalDecoPrice);
        document.getElementById("totalDiscountPrice").textContent = formatPrice(totalDiscount);
        document.getElementById("totalFinalPrice").textContent = formatPrice(totalFinalPrice);
        document.getElementById("totalSummaryPrice").textContent = formatPrice(totalFinalPrice);
        saveState();
    };

    const collectData = () => {
        // ... (data collection logic remains the same) ...
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            rooms: []
        };
        document.querySelectorAll('[data-type="room"]').forEach(roomEl => {
            const roomData = {
                id: roomEl.dataset.id,
                name: roomEl.querySelector('input[name="room_name"]').value,
                discount_baht: roomEl.querySelector('input[name="discount_baht"]').value,
                surcharge_baht: roomEl.querySelector('input[name="surcharge_baht"]').value,
            };

            // Check for and collect curtain data
            const curtainSetEl = roomEl.querySelector('[data-type="curtain-set"]');
            if (curtainSetEl) {
                const curtainData = {
                    id: curtainSetEl.dataset.id,
                    fabric_price_m: curtainSetEl.querySelector('select[name="fabric_price_m"]').value,
                    style_surcharge: curtainSetEl.querySelector('select[name="style_surcharge"]').value,
                    sheer_price_m: curtainSetEl.querySelector('select[name="sheer_price_m"]').value,
                    rail_price_per_m: curtainSetEl.querySelector('input[name="rail_price_per_m"]').value,
                    install_price_per_m: curtainSetEl.querySelector('input[name="install_price_per_m"]').value,
                    points: []
                };
                curtainSetEl.querySelectorAll('[data-type="curtain-point"]').forEach(pointEl => {
                    curtainData.points.push({
                        id: pointEl.dataset.id,
                        width_m: pointEl.querySelector('input[name="fabric_width_m"]').value,
                        height_m: pointEl.querySelector('input[name="fabric_height_m"]').value,
                        qty: pointEl.querySelector('input[name="fabric_qty"]').value
                    });
                });
                roomData.curtains = curtainData;
            }

            // Check for and collect deco data
            const decoItems = roomEl.querySelectorAll('[data-type="deco-item"]');
            if (decoItems.length > 0) {
                roomData.decos = [];
                decoItems.forEach(itemEl => {
                    roomData.decos.push({
                        id: itemEl.dataset.id,
                        name: itemEl.querySelector('input[name="deco_name"]').value,
                        qty: itemEl.querySelector('input[name="deco_qty"]').value,
                        price_unit: itemEl.querySelector('input[name="deco_price_unit"]').value,
                    });
                });
            }

            // Check for and collect wallpaper data
            const wallpaperSetEl = roomEl.querySelector('[data-type="wallpaper-set"]');
            if (wallpaperSetEl) {
                const wallpaperData = {
                    id: wallpaperSetEl.dataset.id,
                    height_m: wallpaperSetEl.querySelector('input[name="wallpaper_height_m"]').value,
                    price_roll: wallpaperSetEl.querySelector('input[name="wallpaper_price_roll"]').value,
                    walls: []
                };
                wallpaperSetEl.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                    wallpaperData.walls.push({
                        width_m: input.value
                    });
                });
                roomData.wallpaper = wallpaperData;
            }

            payload.rooms.push(roomData);
        });
        return payload;
    };

    const saveState = () => {
        try {
            const data = collectData();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (err) {
            console.error("Failed to save state:", err);
        }
    };
    
    // Event Listeners
    document.addEventListener("change", (e) => {
        const roomEl = e.target.closest('[data-type="room"]');
        if (roomEl) recalcRoom(roomEl);
        else recalcAll(); // For customer info fields
    });

    document.addEventListener("input", (e) => {
        const input = e.target;
        if (input.type === "text" && input.inputMode === "numeric") {
            input.value = input.value.replace(/[^0-9]/g, '');
            input.value = new Intl.NumberFormat('th-TH').format(input.value.replace(/,/g, ''));
        }
        
        const roomEl = e.target.closest('[data-type="room"]');
        if (roomEl) recalcRoom(roomEl);
        else recalcAll();
    });

    document.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        
        const act = btn.dataset.act;
        const actions = {
            'add-curtain': () => addCurtainSet(btn.closest('[data-type="room"]')),
            'del-curtain': () => delCurtainSet(btn),
            'add-fabric': () => addFabricPoint(btn.closest('.curtain-section').querySelector('.curtain-point-container')),
            'del-point': () => delPoint(btn),
            'del-room': () => delRoom(btn),
            'add-deco': () => addDecoItem(btn.closest('[data-type="room"]').querySelector('.deco-container')),
            'del-deco-item': () => delDecoItem(btn),
            'add-wallpaper': () => addWallpaperSet(btn.closest('[data-type="room"]')),
            'del-wallpaper': () => delWallpaperSet(btn),
            'add-wall': () => addWall(btn.closest('.walls-section').querySelector('[data-walls-container]')),
            'del-wall': () => delWall(btn),
            'clear-deco': () => clearDeco(btn),
            'clear-wallpaper': () => clearWallpaper(btn),
            'toggle-suspend': () => toggleSuspend(btn)
        };
        if (actions[act]) actions[act]();
        else if (btn.id === "addRoomHeaderBtn") addRoom();
        else if (btn.id === "clearAllBtn") clearAllData();
        else if (btn.id === "lockBtn") toggleLock();
        // ... (copy JSON, copy text logic remains the same) ...
    });

    orderForm.addEventListener("submit", (e) => { 
        e.preventDefault();
        const payload = collectData();
        document.getElementById("versionInput").value = payload.version;
        document.getElementById("payloadInput").value = JSON.stringify(payload);
        toast("บันทึกข้อมูลเรียบร้อย!");
        saveState();
        // orderForm.submit(); // Uncomment to submit to webhook
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
        recalcAll();
    });
})();