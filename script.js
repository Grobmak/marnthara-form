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
    };
    const CALC_OPTIONS = {
        curtain_width_add: 0.15,
        curtain_fabric_add: 0.25,
        sheer_fabric_add: 0.1,
    };

    const SELECTORS = {
        // Main Elements
        orderForm: "#orderForm",
        roomContainer: "#roomContainer",
        addRoomHeaderBtn: "#addRoomHeaderBtn",
        grandTotalEl: "#grandTotal",
        
        // Room Elements
        roomTpl: "#roomTpl",
        roomCard: ".room-card",
        delRoomBtn: "[data-act='del-room']",
        addCurtainBtn: "[data-act='add-curtain']",
        addWallpaperBtn: "[data-act='add-wallpaper']",

        // Curtain Elements
        curtainTpl: "#curtainTpl",
        curtainSection: ".curtain-section",
        delCurtainBtn: "[data-act='del-curtain']",
        fabricPriceField: "input[name='curtain_fabric_price']",
        sheerPriceField: "input[name='curtain_sheer_price']",
        curtainSummary: "[data-curtain-summary]",
        fabricQuantityEl: "[data-fabric-quantity]",
        sheerQuantityEl: "[data-sheer-quantity]",
        curtainPriceEl: "[data-curtain-price]",

        // Wallpaper Elements
        wallpaperTpl: "#wallpaperTpl",
        wallpaperSection: ".wallpaper-section",
        delWallpaperBtn: "[data-act='del-wallpaper']",
        addWallBtn: "[data-act='add-wall']",
        wallsContainer: "[data-walls-container]",
        wallpaperSummary: "[data-wallpaper-summary]",
        wallpaperPriceEl: "[data-wallpaper-summary] .price:nth-child(1)",
        wallpaperAreaEl: "[data-wallpaper-summary] .price:nth-child(2)",
        wallpaperRollsEl: "[data-wallpaper-summary] .price:nth-child(3)",
        
        // Wall Input
        wallTpl: "#wallTpl",
        wallInputRow: ".wall-input-row",
        delWallBtn: "[data-act='del-wall']",

        // Utilities
        lockBtn: "#lockBtn",
        clearAllBtn: "#clearAllBtn",
        payloadInput: "#payload",
        menuBtn: "#menuBtn",
        menuDropdown: "#menuDropdown",
        exportBtn: "#exportBtn",
        importBtn: "#importBtn",
    };

    const roomTpl = document.querySelector(SELECTORS.roomTpl);
    const curtainTpl = document.querySelector(SELECTORS.curtainTpl);
    const wallpaperTpl = document.querySelector(SELECTORS.wallpaperTpl);
    const wallTpl = document.querySelector(SELECTORS.wallTpl);
    const roomContainer = document.querySelector(SELECTORS.roomContainer);
    const addRoomHeaderBtn = document.querySelector(SELECTORS.addRoomHeaderBtn);
    const lockBtn = document.querySelector(SELECTORS.lockBtn);
    const clearAllBtn = document.querySelector(SELECTORS.clearAllBtn);
    const exportBtn = document.querySelector(SELECTORS.exportBtn);
    const importBtn = document.querySelector(SELECTORS.importBtn);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    const grandTotalEl = document.querySelector(SELECTORS.grandTotalEl);
    
    // --- Utility Functions ---

    function showToast(message, type = "info") {
        const toast = document.createElement("div");
        toast.classList.add("toast", `toast-${type}`);
        toast.textContent = message;
        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add("show"), 100);

        // Animate out and remove
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function formatNumber(num) {
        return new Intl.NumberFormat('th-TH').format(num);
    }

    function calculateCurtainPrice(type, width, height, style, is_sheer) {
        const fabric_price = parseInt(document.querySelector(SELECTORS.fabricPriceField).value, 10) || 0;
        const sheer_price = parseInt(document.querySelector(SELECTORS.sheerPriceField).value, 10) || 0;

        let total_sqm = 0;
        let final_price_per_sqm = 0;
        let surcharge = 0;

        if (is_sheer) {
            final_price_per_sqm = sheer_price;
            total_sqm = (width + CALC_OPTIONS.curtain_width_add) * height * (1 + CALC_OPTIONS.sheer_fabric_add);
        } else {
            final_price_per_sqm = fabric_price;
            total_sqm = (width + CALC_OPTIONS.curtain_width_add) * height * (1 + CALC_OPTIONS.curtain_fabric_add);
            surcharge = PRICING.style_surcharge[style] || 0;
        }
        
        let price = total_sqm * final_price_per_sqm;
        
        // Add height surcharge if applicable
        const height_surcharge = PRICING.height.find(h => height > h.threshold);
        if (height_surcharge) {
            price += (height - height_surcharge.threshold) * height_surcharge.add_per_m;
        }

        return price + surcharge;
    }

    function calculateWallpaperSummary(section) {
        const height = parseFloat(section.querySelector("input[name='wallpaper_height_m']").value) || 0;
        const pricePerRoll = parseFloat(section.querySelector("input[name='wallpaper_price_roll']").value.replace(/,/g, '')) || 0;
        const walls = section.querySelectorAll("input[name='wall_width_m']");

        let totalWidth = 0;
        walls.forEach(wall => {
            totalWidth += parseFloat(wall.value) || 0;
        });

        if (height === 0 || totalWidth === 0 || pricePerRoll === 0) {
            return { totalArea: 0, totalRolls: 0, totalPrice: 0 };
        }

        const totalArea = totalWidth * height;
        
        // Wallpaper calculation logic based on width and height
        // Standard roll size is 0.53m width x 10m length = 5.3 sqm.
        // A more accurate way is to calculate based on the number of strips.
        // A single roll can cover a 10m length.
        const rollWidth = 0.53;
        const rollLength = 10;
        
        // Number of strips per roll
        const stripsPerRoll = Math.floor(rollLength / (height + 0.1)); // Add 10cm for margin
        
        // Number of strips needed for the total width
        const totalStripsNeeded = Math.ceil(totalWidth / rollWidth);
        
        const totalRolls = Math.ceil(totalStripsNeeded / stripsPerRoll);
        const totalPrice = totalRolls * pricePerRoll;

        return {
            totalArea: totalArea,
            totalRolls: totalRolls,
            totalPrice: totalPrice,
        };
    }

    function updateWallpaperSummary(section) {
        const summary = calculateWallpaperSummary(section);
        const summaryEl = section.querySelector(SELECTORS.wallpaperSummary);
        if (summaryEl) {
            summaryEl.querySelector(".price:nth-child(1)").textContent = formatNumber(summary.totalPrice);
            summaryEl.querySelector(".price:nth-child(2)").textContent = summary.totalArea.toFixed(2);
            summaryEl.querySelector(".price:nth-child(3)").textContent = summary.totalRolls;
        }
        updateGrandTotal();
    }
    
    function updateGrandTotal() {
        let total = 0;
        
        // Sum up all curtain prices
        document.querySelectorAll(SELECTORS.curtainSection).forEach(section => {
            const priceEl = section.querySelector(SELECTORS.curtainPriceEl);
            if (priceEl) {
                const price = parseInt(priceEl.textContent.replace(/,/g, ''), 10) || 0;
                total += price;
            }
        });
        
        // Sum up all wallpaper prices
        document.querySelectorAll(SELECTORS.wallpaperSection).forEach(section => {
            const summary = calculateWallpaperSummary(section);
            total += summary.totalPrice;
        });
        
        grandTotalEl.textContent = formatNumber(total);
    }
    
    // --- UI Manipulation Functions ---

    function addRoom(payload = null) {
        const clone = roomTpl.content.cloneNode(true);
        const roomCard = clone.querySelector(SELECTORS.roomCard);
        
        const customerName = payload ? payload.customer_name : "";
        const roomName = payload ? payload.room_name : "";
        
        if (customerName) {
            roomCard.querySelector("input[name='customer_name']").value = customerName;
            roomCard.querySelector(".customer-name-display").textContent = customerName;
        }
        if (roomName) {
            roomCard.querySelector("input[name='room_name']").value = roomName;
            roomCard.querySelector(".room-name-display").textContent = roomName;
        }

        const roomIndex = roomContainer.children.length;
        const roomHeadEl = roomCard.querySelector(".room-head");
        roomHeadEl.style.setProperty('--room-head-bg', `var(--room${(roomIndex % 3) + 1}-bg)`);

        roomCard.querySelector(SELECTORS.delRoomBtn).addEventListener("click", () => {
            roomCard.remove();
            updateGrandTotal();
            savePayload();
        });

        const curtainContainer = roomCard.querySelector(".curtains-container");
        const addCurtainBtn = roomCard.querySelector(SELECTORS.addCurtainBtn);
        addCurtainBtn.addEventListener("click", () => addCurtain(curtainContainer));

        const wallpaperContainer = roomCard.querySelector(".wallpapers-container");
        const addWallpaperBtn = roomCard.querySelector(SELECTORS.addWallpaperBtn);
        addWallpaperBtn.addEventListener("click", () => addWallpaper(wallpaperContainer));
        
        // Add event listeners for input fields to trigger save and total update
        roomCard.addEventListener("input", savePayload);

        // Load existing curtains and wallpapers if payload exists
        if (payload && payload.curtains) {
            payload.curtains.forEach(curtainData => addCurtain(curtainContainer, curtainData));
        }
        if (payload && payload.wallpapers) {
            payload.wallpapers.forEach(wallpaperData => addWallpaper(wallpaperContainer, wallpaperData));
        }

        roomContainer.appendChild(roomCard);
        
        // If it's a new room, add default content
        if (!payload) {
            addCurtain(curtainContainer);
            addWallpaper(wallpaperContainer);
        }
    }

    function addCurtain(container, payload = null) {
        const clone = curtainTpl.content.cloneNode(true);
        const section = clone.querySelector(SELECTORS.curtainSection);
        const roomCard = section.closest(SELECTORS.roomCard);

        if (payload) {
            section.querySelector("select[name='curtain_type']").value = payload.type;
            section.querySelector("input[name='curtain_width_m']").value = payload.width;
            section.querySelector("input[name='curtain_height_m']").value = payload.height;
            section.querySelector("input[name='curtain_rail_length']").value = payload.rail_length;
            section.querySelector("select[name='curtain_style']").value = payload.style;
            section.querySelector("input[name='curtain_is_sheer']").checked = payload.is_sheer;
            section.querySelector("input[name='curtain_fabric_price']").value = payload.fabric_price;
            section.querySelector("input[name='curtain_sheer_price']").value = payload.sheer_price;
        }

        const delBtn = section.querySelector(SELECTORS.delCurtainBtn);
        delBtn.addEventListener("click", () => {
            section.remove();
            savePayload();
            updateGrandTotal();
        });

        const updateCurtainSummary = () => {
            const width = parseFloat(section.querySelector("input[name='curtain_width_m']").value) || 0;
            const height = parseFloat(section.querySelector("input[name='curtain_height_m']").value) || 0;
            const type = section.querySelector("select[name='curtain_type']").value;
            const style = section.querySelector("select[name='curtain_style']").value;
            const is_sheer = section.querySelector("input[name='curtain_is_sheer']").checked;
            
            const summaryEl = section.querySelector(SELECTORS.curtainSummary);
            if (!summaryEl) return;
            
            const quantity_fabric = (width + CALC_OPTIONS.curtain_width_add) * (1 + CALC_OPTIONS.curtain_fabric_add);
            const quantity_sheer = (width + CALC_OPTIONS.curtain_width_add) * (1 + CALC_OPTIONS.sheer_fabric_add);

            summaryEl.querySelector(SELECTORS.fabricQuantityEl).textContent = quantity_fabric.toFixed(2);
            summaryEl.querySelector(SELECTORS.sheerQuantityEl).textContent = quantity_sheer.toFixed(2);
            
            const price = calculateCurtainPrice(type, width, height, style, is_sheer);
            summaryEl.querySelector(SELECTORS.curtainPriceEl).textContent = formatNumber(price);
            
            savePayload();
            updateGrandTotal();
        };

        section.querySelectorAll("input, select").forEach(field => {
            field.addEventListener("input", updateCurtainSummary);
        });
        
        container.appendChild(section);
        updateCurtainSummary();
    }

    function addWallpaper(container, payload = null) {
        const clone = wallpaperTpl.content.cloneNode(true);
        const section = clone.querySelector(SELECTORS.wallpaperSection);
        const wallsContainer = section.querySelector(SELECTORS.wallsContainer);

        if (payload) {
            section.querySelector("input[name='wallpaper_height_m']").value = payload.height;
            section.querySelector("input[name='wallpaper_price_roll']").value = payload.price_per_roll;
            if (payload.walls) {
                payload.walls.forEach(wallData => addWall(wallsContainer, wallData));
            }
        }
        
        const delBtn = section.querySelector(SELECTORS.delWallpaperBtn);
        delBtn.addEventListener("click", () => {
            section.remove();
            savePayload();
            updateGrandTotal();
        });

        section.querySelector(SELECTORS.addWallBtn).addEventListener("click", () => addWall(wallsContainer));

        section.addEventListener("input", (e) => {
            if (e.target.closest(SELECTORS.wallInputRow) || e.target.name === 'wallpaper_height_m' || e.target.name === 'wallpaper_price_roll') {
                updateWallpaperSummary(section);
                savePayload();
            }
        });
        
        container.appendChild(section);

        if (!payload || payload.walls.length === 0) {
            addWall(wallsContainer);
        } else {
            updateWallpaperSummary(section);
        }
    }

    function addWall(container, payload = null) {
        const clone = wallTpl.content.cloneNode(true);
        const row = clone.querySelector(SELECTORS.wallInputRow);
        
        if (payload) {
            row.querySelector("input[name='wall_width_m']").value = payload.width;
        }

        const delBtn = row.querySelector(SELECTORS.delWallBtn);
        delBtn.addEventListener("click", () => {
            row.remove();
            const wallpaperSection = container.closest(SELECTORS.wallpaperSection);
            if (wallpaperSection) {
                updateWallpaperSummary(wallpaperSection);
                savePayload();
            }
        });
        
        container.appendChild(row);
    }
    
    // --- Data Handling ---

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            rooms: [],
        };

        document.querySelectorAll(SELECTORS.roomCard).forEach(roomCard => {
            const roomData = {
                customer_name: roomCard.querySelector("input[name='customer_name']").value,
                room_name: roomCard.querySelector("input[name='room_name']").value,
                curtains: [],
                wallpapers: [],
            };

            roomCard.querySelectorAll(SELECTORS.curtainSection).forEach(curtainSection => {
                const curtainData = {
                    type: curtainSection.querySelector("select[name='curtain_type']").value,
                    width: parseFloat(curtainSection.querySelector("input[name='curtain_width_m']").value) || 0,
                    height: parseFloat(curtainSection.querySelector("input[name='curtain_height_m']").value) || 0,
                    rail_length: parseFloat(curtainSection.querySelector("input[name='curtain_rail_length']").value) || 0,
                    style: curtainSection.querySelector("select[name='curtain_style']").value,
                    is_sheer: curtainSection.querySelector("input[name='curtain_is_sheer']").checked,
                    fabric_price: parseFloat(curtainSection.querySelector("input[name='curtain_fabric_price']").value.replace(/,/g, '')) || 0,
                    sheer_price: parseFloat(curtainSection.querySelector("input[name='curtain_sheer_price']").value.replace(/,/g, '')) || 0,
                };
                roomData.curtains.push(curtainData);
            });

            roomCard.querySelectorAll(SELECTORS.wallpaperSection).forEach(wallpaperSection => {
                const wallpaperData = {
                    height: parseFloat(wallpaperSection.querySelector("input[name='wallpaper_height_m']").value) || 0,
                    price_per_roll: parseFloat(wallpaperSection.querySelector("input[name='wallpaper_price_roll']").value.replace(/,/g, '')) || 0,
                    walls: [],
                };
                wallpaperSection.querySelectorAll(SELECTORS.wallInputRow).forEach(wallRow => {
                    wallpaperData.walls.push({
                        width: parseFloat(wallRow.querySelector("input[name='wall_width_m']").value) || 0,
                    });
                });
                roomData.wallpapers.push(wallpaperData);
            });

            payload.rooms.push(roomData);
        });

        // Add grand total to payload
        const grandTotal = document.querySelector(SELECTORS.grandTotalEl).textContent.replace(/,/g, '');
        payload.grand_total = parseFloat(grandTotal) || 0;
        
        return payload;
    }

    function loadPayload(payload) {
        if (!payload || !payload.rooms || payload.rooms.length === 0) {
            addRoom();
            return;
        }

        // Clear existing rooms
        while (roomContainer.firstChild) {
            roomContainer.removeChild(roomContainer.firstChild);
        }

        payload.rooms.forEach(roomData => addRoom(roomData));
        updateGrandTotal();
    }
    
    function savePayload() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    // --- Event Listeners ---
    addRoomHeaderBtn.addEventListener("click", () => {
        addRoom();
        savePayload();
    });

    lockBtn.addEventListener("click", () => {
        const isLocked = document.body.classList.toggle("locked");
        localStorage.setItem("locked", isLocked);
        updateLockState(isLocked);
    });

    clearAllBtn.addEventListener("click", () => {
        if (confirm("คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด?")) {
            localStorage.removeItem(STORAGE_KEY);
            while (roomContainer.firstChild) {
                roomContainer.removeChild(roomContainer.firstChild);
            }
            addRoom();
            updateGrandTotal();
            showToast("ล้างข้อมูลแล้ว", "success");
        }
    });
    
    exportBtn.addEventListener("click", () => {
        const payload = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `marnthara_data_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast("ส่งออกข้อมูลเรียบร้อย", "success");
    });
    
    importBtn.addEventListener("click", () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const payload = JSON.parse(e.target.result);
                    if (payload && payload.rooms) {
                        loadPayload(payload);
                        savePayload(); // Save imported data to localStorage
                        showToast("นำเข้าข้อมูลเรียบร้อย", "success");
                    } else {
                        showToast("ไฟล์ JSON ไม่ถูกต้อง", "error");
                    }
                } catch(err) {
                    showToast("ไม่สามารถอ่านไฟล์ได้", "error");
                    console.error("File import error:", err);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    function updateLockState(isLocked) {
        if (isLocked) {
            document.body.classList.add("locked");
            lockBtn.innerHTML = `<span class="lock-text">ปลดล็อค</span> <span class="lock-icon">🔓</span>`;
            showToast("ล็อคหน้าจอแล้ว", "info");
        } else {
            document.body.classList.remove("locked");
            lockBtn.innerHTML = `<span class="lock-text">ล็อค</span> <span class="lock-icon">🔒</span>`;
            showToast("ปลดล็อคหน้าจอแล้ว", "info");
        }
    }

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
        updateLockState(localStorage.getItem("locked") === "true");
        updateGrandTotal(); // Initial calculation on page load
    });
})();