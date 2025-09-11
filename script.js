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
    const CALC_RULES = {
        wallpaper: {
            rolls: (width_m, height_m) => {
                // roll is 0.53m wide x 10m long
                const roll_width = 0.53;
                const roll_length = 10;
                const strips_per_roll = Math.floor(roll_length / height_m);
                if (strips_per_roll === 0) return Infinity; // Can't use this roll height
                const total_width = width_m;
                const strips_needed = Math.ceil(total_width / roll_width);
                return Math.ceil(strips_needed / strips_per_roll);
            }
        }
    };

    const SELECTORS = {
        roomsContainer: '#roomsContainer',
        addRoomBtn: '#addRoomBtn',
        addRoomHeaderBtn: '#addRoomHeaderBtn',
        orderForm: '#orderForm',
        summaryCard: '#summaryCard',
        summaryContent: '#summaryContent',
        lockBtn: '#lockBtn',
        clearAllBtn: '#clearAllBtn',
        payloadInput: '#payloadInput',
        toastContainer: '#toastContainer',
        menuBtn: '#menuBtn',
        menuDropdown: '#menuDropdown',
        importBtn: '#importBtn',
        exportBtn: '#exportBtn',
        copyOptionsModal: '#copyOptionsModal',
        copyModalConfirm: '#copyModalConfirm',
        copyModalCancel: '#copyModalCancel',
    };

    const ELEMENTS = {};
    for (const key in SELECTORS) {
        ELEMENTS[key] = document.querySelector(SELECTORS[key]);
    }
    
    let roomCount = 0;

    function showToast(message, type = "info") {
        const toast = document.createElement('div');
        toast.classList.add('toast', `toast-${type}`);
        toast.textContent = message;
        ELEMENTS.toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }

    function addRoom(data = {}) {
        roomCount++;
        const roomTpl = document.getElementById('roomTpl');
        const roomEl = roomTpl.content.cloneNode(true).firstElementChild;
        roomEl.dataset.roomId = roomCount;
        roomEl.dataset.roomType = data.type || '';

        roomEl.querySelector('.room-number').textContent = `ห้องที่ ${roomCount}`;
        const roomNameInput = roomEl.querySelector('input[name="room_name"]');
        roomNameInput.value = data.name || '';
        roomNameInput.placeholder = `ห้องที่ ${roomCount}...`;

        const roomTypeRadios = roomEl.querySelectorAll('input[name="room_type"]');
        roomTypeRadios.forEach(radio => {
            if (radio.value === data.type) radio.checked = true;
        });

        ELEMENTS.roomsContainer.appendChild(roomEl);
        if (data.type) renderRoomDetails(roomEl, data);
        updateRoomBackgrounds();
        recalcAll();
        return roomEl;
    }
    
    function updateRoomBackgrounds() {
        const rooms = document.querySelectorAll('.room');
        rooms.forEach((room, index) => {
            const roomIndex = (index % 3) + 1;
            room.style.backgroundColor = `var(--room${roomIndex}-bg)`;
            const roomHead = room.querySelector('.room-head');
            roomHead.style.borderBottomColor = `var(--room${roomIndex}-bg)`;
        });
    }

    function renderRoomDetails(roomEl, data = {}) {
        const container = roomEl.querySelector('.room-details-container');
        container.innerHTML = '';
        const roomType = data.type || roomEl.dataset.roomType;
        let tplId;

        switch (roomType) {
            case 'fabric':
            case 'sheer':
                tplId = 'curtainTpl';
                break;
            case 'wallpaper':
                tplId = 'wallpaperTpl';
                break;
            default:
                return;
        }

        const detailsTpl = document.getElementById(tplId);
        const detailsEl = detailsTpl.content.cloneNode(true).firstElementChild;
        container.appendChild(detailsEl);

        if (roomType === 'fabric' || roomType === 'sheer') {
            const priceInput = detailsEl.querySelector('input[name="curtain_price_m"]');
            priceInput.value = data.price_m || '';
            const styleSelect = detailsEl.querySelector('select[name="curtain_style"]');
            styleSelect.value = data.style || 'ลอน';

            if (data.items) {
                data.items.forEach(item => addCurtainItem(detailsEl, item));
            } else {
                addCurtainItem(detailsEl);
            }
        } else if (roomType === 'wallpaper') {
            const priceInput = detailsEl.querySelector('input[name="wallpaper_price_roll"]');
            priceInput.value = data.price_roll || '';

            if (data.items) {
                data.items.forEach(item => addWallpaperItem(detailsEl, item));
            } else {
                addWallpaperItem(detailsEl);
            }
        }
    }

    function addCurtainItem(parentEl, data = {}) {
        const itemTpl = document.getElementById('curtainItemTpl');
        const itemEl = itemTpl.content.cloneNode(true).firstElementChild;
        const listContainer = parentEl.querySelector('.item-list-container');
        
        itemEl.dataset.itemId = listContainer.children.length + 1;
        
        const itemNameInput = itemEl.querySelector('input[name="curtain_item_name"]');
        const widthInput = itemEl.querySelector('input[name="curtain_width"]');
        const heightInput = itemEl.querySelector('input[name="curtain_height"]');
        const surchargeInput = itemEl.querySelector('input[name="curtain_surcharge"]');
        const discountInput = itemEl.querySelector('input[name="curtain_discount"]');

        itemNameInput.value = data.name || '';
        widthInput.value = data.width || '';
        heightInput.value = data.height || '';
        surchargeInput.value = data.surcharge || '';
        discountInput.value = data.discount || '';
        
        listContainer.appendChild(itemEl);
    }
    
    function addWallpaperItem(parentEl, data = {}) {
        const itemTpl = document.getElementById('wallpaperItemTpl');
        const itemEl = itemTpl.content.cloneNode(true).firstElementChild;
        const listContainer = parentEl.querySelector('.item-list-container');
        
        itemEl.dataset.itemId = listContainer.children.length + 1;
        
        const itemNameInput = itemEl.querySelector('input[name="wallpaper_item_name"]');
        const heightInput = itemEl.querySelector('input[name="wallpaper_height_m"]');
        
        itemNameInput.value = data.name || '';
        heightInput.value = data.height || '';
        
        listContainer.appendChild(itemEl);
        
        if (data.walls && data.walls.length > 0) {
            data.walls.forEach(wall => addWall(itemEl, wall));
        } else {
            addWall(itemEl);
        }
    }
    
    function addWall(itemEl, data = {}) {
        const wallTpl = document.getElementById('wallTpl');
        const wallEl = wallTpl.content.cloneNode(true).firstElementChild;
        const wallsContainer = itemEl.querySelector('[data-walls-container]');
        
        const widthInput = wallEl.querySelector('input[name="wall_width_m"]');
        widthInput.value = data.width || '';
        
        wallsContainer.appendChild(wallEl);
    }

    function calculateCurtainPrice(roomEl, roomData) {
        if (roomEl.dataset.roomSuspended === 'true') {
            return { total: 0, details: [] };
        }
        
        const type = roomData.type;
        const price_m = parseFloat(roomData.price_m) || 0;
        const style = roomData.style;
        const surcharge_per_meter = PRICING.style_surcharge[style] || 0;
        let room_total = 0;
        const item_details = [];

        roomData.items.forEach(item => {
            const width = parseFloat(item.width) || 0;
            const height = parseFloat(item.height) || 0;
            const surcharge = parseFloat(item.surcharge) || 0;
            const discount = parseFloat(item.discount) || 0;
            
            let price = (width * 2.5) * price_m;
            let height_surcharge = 0;
            for (const h of PRICING.height) {
                if (height > h.threshold) {
                    height_surcharge = (height - h.threshold) * h.add_per_m;
                    break;
                }
            }
            price += height_surcharge;
            price += (width * 2.5) * surcharge_per_meter;
            price += surcharge;
            price -= discount;
            price = Math.max(0, price);
            room_total += price;
            
            item_details.push({
                name: item.name,
                width,
                height,
                surcharge,
                discount,
                price: price
            });
        });

        return { total: room_total, details: item_details };
    }

    function calculateWallpaperPrice(roomEl, roomData) {
        if (roomEl.dataset.roomSuspended === 'true') {
            return { total: 0, details: [] };
        }
        
        const price_roll = parseFloat(roomData.price_roll) || 0;
        let room_total = 0;
        const item_details = [];

        roomData.items.forEach(item => {
            const height_m = parseFloat(item.height) || 0;
            let total_width_m = 0;
            item.walls.forEach(wall => {
                total_width_m += parseFloat(wall.width) || 0;
            });

            const rolls = CALC_RULES.wallpaper.rolls(total_width_m, height_m);
            const item_price = rolls * price_roll;
            const item_sqm = total_width_m * height_m;
            room_total += item_price;
            
            item_details.push({
                name: item.name,
                height: height_m,
                total_width: total_width_m,
                rolls: rolls,
                sqm: item_sqm,
                price: item_price
            });
        });

        return { total: room_total, details: item_details };
    }

    function recalcAll() {
        const rooms = Array.from(document.querySelectorAll('.room'));
        let total_order_price = 0;
        const summary_html = [];

        rooms.forEach((roomEl, index) => {
            const roomData = getRoomData(roomEl);
            let room_price = 0;
            let summary_section = '';
            
            if (roomEl.dataset.roomSuspended === 'true') {
                summary_section = `<p><strong>${roomData.name}</strong> (ระงับ) : 0 บ.</p>`;
            } else if (roomData.type === 'fabric' || roomData.type === 'sheer') {
                const result = calculateCurtainPrice(roomEl, roomData);
                room_price = result.total;
                total_order_price += room_price;
                
                const itemSummaries = result.details.map(item => `
                    <li>${item.name}: ${item.price.toLocaleString()} บ.</li>
                `).join('');
                
                summary_section = `
                    <div class="summary-room">
                        <h4>${roomData.name} <span class="price">${room_price.toLocaleString()}</span> บ.</h4>
                        <ul>${itemSummaries}</ul>
                    </div>
                `;
            } else if (roomData.type === 'wallpaper') {
                const result = calculateWallpaperPrice(roomEl, roomData);
                room_price = result.total;
                total_order_price += room_price;
                
                const itemSummaries = result.details.map(item => `
                    <li>${item.name}: ${item.price.toLocaleString()} บ. (พื้นที่: ${item.sqm.toFixed(2)} ตร.ม. • ใช้ ${item.rolls} ม้วน)</li>
                `).join('');
                
                summary_section = `
                    <div class="summary-room">
                        <h4>${roomData.name} <span class="price">${room_price.toLocaleString()}</span> บ.</h4>
                        <ul>${itemSummaries}</ul>
                    </div>
                `;
            }

            // Update individual room summaries
            const roomSummaryEl = roomEl.querySelector('.summary > .price');
            if (roomSummaryEl) {
                roomSummaryEl.textContent = room_price.toLocaleString();
            }

            const curtainSummaryEl = roomEl.querySelector('[data-curtain-summary]');
            if (curtainSummaryEl) {
                curtainSummaryEl.textContent = room_price.toLocaleString();
            }

            const wallpaperSummaryEl = roomEl.querySelector('[data-wallpaper-summary]');
            if (wallpaperSummaryEl) {
                wallpaperSummaryEl.textContent = room_price.toLocaleString();
            }

            // Update individual wallpaper item summaries
            const wallpaperItems = roomEl.querySelectorAll('.wallpaper-item');
            wallpaperItems.forEach((itemEl) => {
                const itemData = getWallpaperItemData(itemEl);
                const rolls = CALC_RULES.wallpaper.rolls(itemData.total_width, itemData.height);
                const item_price = rolls * (parseFloat(roomData.price_roll) || 0);
                const item_sqm = itemData.total_width * itemData.height;

                itemEl.querySelector('[data-wallpaper-item-price]').textContent = item_price.toLocaleString();
                itemEl.querySelector('[data-wallpaper-item-sqm]').textContent = item_sqm.toFixed(2);
                itemEl.querySelector('[data-wallpaper-item-rolls]').textContent = rolls;
            });

            summary_html.push(summary_section);
        });

        ELEMENTS.summaryContent.innerHTML = `
            ${summary_html.join('')}
            <div class="summary">
                <p><strong>ราคารวมทั้งหมด:</strong> <span class="price">${total_order_price.toLocaleString()}</span> บ.</p>
            </div>
        `;

        saveData();
    }
    
    function getRoomData(roomEl) {
        const room_id = roomEl.dataset.roomId;
        const room_name = roomEl.querySelector('input[name="room_name"]').value;
        const room_type_radio = roomEl.querySelector('input[name="room_type"]:checked');
        const room_type = room_type_radio ? room_type_radio.value : '';
        const room_suspended = roomEl.dataset.roomSuspended === 'true';
        
        const room_data = {
            id: room_id,
            name: room_name,
            type: room_type,
            suspended: room_suspended,
            items: []
        };
        
        if (room_type === 'fabric' || room_type === 'sheer') {
            room_data.price_m = roomEl.querySelector('input[name="curtain_price_m"]').value;
            room_data.style = roomEl.querySelector('select[name="curtain_style"]').value;
            room_data.items = Array.from(roomEl.querySelectorAll('.curtain-item')).map(getCurtainItemData);
        } else if (room_type === 'wallpaper') {
            room_data.price_roll = roomEl.querySelector('input[name="wallpaper_price_roll"]').value;
            room_data.items = Array.from(roomEl.querySelectorAll('.wallpaper-item')).map(getWallpaperItemData);
        }
        
        return room_data;
    }

    function getCurtainItemData(itemEl) {
        return {
            name: itemEl.querySelector('input[name="curtain_item_name"]').value,
            width: itemEl.querySelector('input[name="curtain_width"]').value,
            height: itemEl.querySelector('input[name="curtain_height"]').value,
            surcharge: itemEl.querySelector('input[name="curtain_surcharge"]').value,
            discount: itemEl.querySelector('input[name="curtain_discount"]').value,
        };
    }
    
    function getWallpaperItemData(itemEl) {
        const item_data = {
            name: itemEl.querySelector('input[name="wallpaper_item_name"]').value,
            height: itemEl.querySelector('input[name="wallpaper_height_m"]').value,
            walls: [],
            total_width: 0,
        };
        
        itemEl.querySelectorAll('.wall-input-row').forEach(wallEl => {
            const width = parseFloat(wallEl.querySelector('input[name="wall_width_m"]').value) || 0;
            item_data.walls.push({ width: width });
            item_data.total_width += width;
        });
        
        return item_data;
    }

    function buildPayload() {
        const rooms = Array.from(document.querySelectorAll('.room')).map(getRoomData);
        return {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            rooms: rooms,
            version: APP_VERSION,
            timestamp: new Date().toISOString()
        };
    }

    function saveData() {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (err) {
            console.error("Failed to save data to storage:", err);
            showToast("ไม่สามารถบันทึกข้อมูลได้", "error");
        }
    }

    function updateLockState() {
        const isLocked = ELEMENTS.lockBtn.classList.toggle('active', localStorage.getItem('isLocked') === 'true');
        const formInputs = ELEMENTS.orderForm.querySelectorAll('input, select, button:not(#lockBtn):not(#clearAllBtn)');
        formInputs.forEach(input => {
            if (input.id === 'submitBtn') {
                input.disabled = isLocked;
            } else {
                input.readOnly = isLocked;
                input.disabled = isLocked;
            }
        });
        ELEMENTS.addRoomBtn.disabled = isLocked;
        ELEMENTS.addRoomHeaderBtn.disabled = isLocked;
        document.querySelectorAll('.btn-icon, .btn-xs').forEach(btn => {
            if (btn.id !== 'menuBtn') {
                btn.disabled = isLocked;
            }
        });
        showToast(isLocked ? "ล็อคการแก้ไข" : "ปลดล็อคการแก้ไข", "info");
    }

    function openCopyModal(roomEl) {
        ELEMENTS.copyOptionsModal.dataset.targetRoomId = roomEl.dataset.roomId;
        ELEMENTS.copyOptionsModal.classList.add('show');
    }

    function copyRoom(roomEl, options) {
        const originalRoomData = getRoomData(roomEl);
        const newData = {
            name: originalRoomData.name,
            type: originalRoomData.type,
            suspended: originalRoomData.suspended,
        };

        if (options.copyDetails) {
            if (originalRoomData.type === 'fabric' || originalRoomData.type === 'sheer') {
                newData.price_m = originalRoomData.price_m;
                newData.style = originalRoomData.style;
            } else if (originalRoomData.type === 'wallpaper') {
                newData.price_roll = originalRoomData.price_roll;
            }
        }
        
        if (options.copyItems) {
            newData.items = originalRoomData.items;
        } else {
            newData.items = [];
        }

        addRoom(newData);
        showToast("คัดลอกห้องสำเร็จ", "success");
    }

    function toggleRoomSuspend(roomEl) {
        const isSuspended = roomEl.dataset.roomSuspended === 'true';
        roomEl.dataset.roomSuspended = !isSuspended;
        const toggleBtn = roomEl.querySelector('[data-act="toggle-room-suspend"]');
        toggleBtn.textContent = isSuspended ? 'ระงับ/ใช้งาน' : 'ระงับ/ใช้งาน';
        recalcAll();
        showToast(isSuspended ? "ยกเลิกระงับห้อง" : "ระงับห้อง", "warning");
    }
    
    function clearRoom(roomEl) {
        roomEl.querySelector('input[name="room_name"]').value = '';
        const roomTypeRadios = roomEl.querySelectorAll('input[name="room_type"]');
        roomTypeRadios.forEach(radio => radio.checked = false);
        const detailsContainer = roomEl.querySelector('.room-details-container');
        detailsContainer.innerHTML = '';
        roomEl.dataset.roomType = '';
        recalcAll();
        showToast("ล้างข้อมูลห้องสำเร็จ", "info");
    }

    // --- Event Listeners ---
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button, .btn');
        if (!btn) return;

        const roomEl = btn.closest('.room');
        const itemEl = btn.closest('.curtain-item, .wallpaper-item');
        const wallEl = btn.closest('.wall-input-row');
        const action = btn.dataset.act || btn.id;
        
        const dropdownMenu = btn.closest('.dropdown').querySelector('.dropdown-menu');
        if (dropdownMenu) {
            if (dropdownMenu.classList.contains('show')) {
                // If a menu is already open, and the click is inside another dropdown, close the previous one
                document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                    if (menu !== dropdownMenu) {
                        menu.classList.remove('show');
                    }
                });
            }
            dropdownMenu.classList.toggle('show');
        } else {
             // Close all dropdowns if the click is outside a dropdown button
            document.querySelectorAll('.dropdown-menu.show').forEach(menu => menu.classList.remove('show'));
        }

        switch (action) {
            case 'room-menu':
                // Handled by the dropdown logic above
                break;
            case 'toggle-room-suspend':
                toggleRoomSuspend(roomEl);
                break;
            case 'clear-room':
                clearRoom(roomEl);
                break;
            case 'del-room':
                if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบห้องนี้?')) {
                    roomEl.remove();
                    roomCount = document.querySelectorAll('.room').length;
                    recalcAll();
                    showToast("ลบห้องสำเร็จ", "danger");
                }
                break;
            case 'addRoomBtn':
            case 'addRoomHeaderBtn':
                addRoom();
                break;
            case 'copy-room':
                openCopyModal(roomEl);
                break;
            case 'del-curtain-item':
            case 'del-wallpaper-item':
                itemEl.remove();
                recalcAll();
                break;
            case 'add-curtain-item':
                addCurtainItem(roomEl);
                break;
            case 'add-wallpaper-item':
                addWallpaperItem(roomEl);
                break;
            case 'add-wall':
                addWall(itemEl);
                break;
            case 'del-wall':
                wallEl.remove();
                recalcAll();
                break;
            case 'lockBtn':
                localStorage.setItem('isLocked', ELEMENTS.lockBtn.classList.contains('active') ? 'false' : 'true');
                updateLockState();
                break;
            case 'clearAllBtn':
                if (confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด?')) {
                    localStorage.removeItem(STORAGE_KEY);
                    window.location.reload();
                }
                break;
            case 'importBtn':
                // Placeholder for import functionality
                showToast("ฟังก์ชันนำเข้ายังไม่พร้อมใช้งาน", "warning");
                break;
            case 'exportBtn':
                // Placeholder for export functionality
                showToast("ฟังก์ชันส่งออกยังไม่พร้อมใช้งาน", "warning");
                break;
        }
        recalcAll();
    });

    document.addEventListener('input', (e) => {
        const target = e.target;
        const roomEl = target.closest('.room');
        
        if (target.matches('input[name="room_type"]')) {
            roomEl.dataset.roomType = target.value;
            renderRoomDetails(roomEl, { type: target.value });
        }
        
        recalcAll();
    });

    // Handle Copy Options Modal
    ELEMENTS.copyModalConfirm.addEventListener('click', () => {
        const targetRoomId = ELEMENTS.copyOptionsModal.dataset.targetRoomId;
        const targetRoomEl = document.querySelector(`[data-room-id="${targetRoomId}"]`);
        const options = {
            copyDetails: document.getElementById('copyDetails').checked,
            copyItems: document.getElementById('copyItems').checked,
        };
        copyRoom(targetRoomEl, options);
        ELEMENTS.copyOptionsModal.classList.remove('show');
    });

    ELEMENTS.copyModalCancel.addEventListener('click', () => {
        ELEMENTS.copyOptionsModal.classList.remove('show');
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        if (!menuDropdown.contains(e.target) && !document.querySelector(SELECTORS.menuBtn).contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
            if (!menu.contains(e.target) && !e.target.closest('.dropdown')) {
                menu.classList.remove('show');
            }
        });
    });

    ELEMENTS.orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name;
                document.querySelector('input[name="customer_address"]').value = payload.customer_address;
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
                ELEMENTS.roomsContainer.innerHTML = ""; roomCount = 0;
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