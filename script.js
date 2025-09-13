(function() {
    'use strict';
    // --- APP CONFIGURATION ---
    const APP_VERSION = "input-ui/4.0.0-M3";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path"; // CHANGE THIS TO YOUR MAKE.COM WEBHOOK URL
    const STORAGE_KEY = "marnthara.input.v4";
    const SQM_TO_SQYD = 1.19599;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };

    const CALC = {
        curtain_multiplier: 2.5,
        track_multiplier: 1,
        default_cost_per_m: 800,
        default_cost_per_m_sheer: 800,
        wallpaper_roll_width: 0.53,
        wallpaper_roll_height: 10,
    };

    const SELECTORS = {
        orderForm: '#orderForm',
        roomsContainer: '#rooms',
        addRoomHeaderBtn: '#addRoomHeaderBtn',
        grandTotal: '#grandTotal',
        grandFabric: '#grandFabric',
        grandSheerFabric: '#grandSheerFabric',
        grandOpaqueTrack: '#grandOpaqueTrack',
        grandSheerTrack: '#grandSheerTrack',
        setCount: '#setCount',
        setCountSets: '#setCountSets',
        setCountDeco: '#setCountDeco',
        roomTpl: '#roomTpl',
        setTpl: '#setTpl',
        decoTpl: '#decoTpl',
        wallpaperTpl: '#wallpaperTpl',
        wallTpl: '#wallTpl',
        lockBtn: '#lockBtn',
        payloadInput: '#payload',
        toastContainer: '#toast-container',
        menuBtn: '#menuBtn',
        menuDropdown: '#menuDropdown',
        copyJsonBtn: '#copyJsonBtn',
        copyTextBtn: '#copyTextBtn',
        importBtn: '#importBtn',
        exportBtn: '#exportBtn',
        clearAllBtn: '#clearAllBtn',
        confirmationModal: '#confirmationModal',
        modalTitle: '#modalTitle',
        modalBody: '#modalBody',
        modalConfirm: '#modalConfirm',
        modalCancel: '#modalCancel',
        copyOptionsModal: '#copyOptionsModal',
        copyOptionsConfirm: '#copyOptionsConfirm',
        copyOptionsCancel: '#copyOptionsCancel',
        copyCustomerInfo: '#copyCustomerInfo',
        copyRoomDetails: '#copyRoomDetails',
        copySummary: '#copySummary',
        importModal: '#importModal',
        importJsonArea: '#importJsonArea',
        importConfirm: '#importConfirm',
        importCancel: '#importCancel',
    };

    const orderForm = document.querySelector(SELECTORS.orderForm);
    const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
    let nextRoomIndex = 1;
    let isLocked = false;
    let activeDropdown = null;

    // --- UTILITY FUNCTIONS ---
    function formatPrice(price) {
        return `${(price || 0).toLocaleString('th-TH')} บ.`;
    }

    function formatNumber(num, fixed = 2) {
        return (num || 0).toFixed(fixed);
    }

    function showToast(message, type = 'success', duration = 3000) {
        const toastContainer = document.querySelector(SELECTORS.toastContainer);
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('show'), 10);

        // Animate out and remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    function calculateSet(setElement) {
        const width = parseFloat(setElement.querySelector('input[name="width_m"]').value) || 0;
        const height = parseFloat(setElement.querySelector('input[name="height_m"]').value) || 0;
        const fabricVariant = setElement.querySelector('select[name="fabric_variant"]').value;
        const opaquePricePerM = parseFloat(setElement.closest('[data-room]').querySelector('select[name="room_price_per_m"]').value) || 0;
        const sheerPricePerM = parseFloat(setElement.querySelector('select[name="sheer_price_per_m"]').value) || 0;
        const style = setElement.closest('[data-room]').querySelector('select[name="room_style"]').value;
        const surcharge = PRICING.style_surcharge[style] || 0;

        let totalOpaquePrice = 0;
        let totalSheerPrice = 0;
        let opaqueYardage = 0;
        let sheerYardage = 0;
        let opaqueTrack = 0;
        let sheerTrack = 0;

        // Opaque Calculations
        if (fabricVariant === 'ทึบ' || fabricVariant === 'ทึบ&โปร่ง') {
            opaqueYardage = (width * CALC.curtain_multiplier) / 0.9144;
            opaqueTrack = width * CALC.track_multiplier;
            totalOpaquePrice = (opaqueYardage * 0.9144 * opaquePricePerM) + (opaqueTrack * CALC.default_cost_per_m) + surcharge;
        }

        // Sheer Calculations
        if (fabricVariant === 'โปร่ง' || fabricVariant === 'ทึบ&โปร่ง') {
            sheerYardage = (width * CALC.curtain_multiplier) / 0.9144;
            sheerTrack = width * CALC.track_multiplier;
            totalSheerPrice = (sheerYardage * 0.9144 * sheerPricePerM) + (sheerTrack * CALC.default_cost_per_m_sheer) + surcharge;
        }

        const totalSetPrice = totalOpaquePrice + totalSheerPrice;

        // Apply height surcharge
        const heightSurcharge = PRICING.height.find(h => height >= h.threshold)?.add_per_m * width || 0;
        totalOpaquePrice += heightSurcharge;
        totalSheerPrice += heightSurcharge;
        
        // Update UI
        setElement.querySelector('[data-set-price-opaque]').textContent = formatPrice(totalOpaquePrice);
        setElement.querySelector('[data-set-price-sheer]').textContent = formatPrice(totalSheerPrice);
        setElement.querySelector('[data-set-price-total]').textContent = formatPrice(totalSetPrice);
        setElement.querySelector('[data-set-yardage-opaque]').textContent = formatNumber(opaqueYardage);
        setElement.querySelector('[data-set-yardage-sheer]').textContent = formatNumber(sheerYardage);
        setElement.querySelector('[data-set-opaque-track]').textContent = formatNumber(opaqueTrack);
        setElement.querySelector('[data-set-sheer-track]').textContent = formatNumber(sheerTrack);
    }

    function calculateDeco(decoElement) {
        const type = decoElement.querySelector('input[name="deco_type"]').value;
        const pricePerSqYd = parseFloat(decoElement.querySelector('input[name="deco_price_sqyd"]').value) || 0;
        const width = parseFloat(decoElement.querySelector('input[name="deco_width_m"]').value) || 0;
        const height = parseFloat(decoElement.querySelector('input[name="deco_height_m"]').value) || 0;

        const areaSqM = width * height;
        const areaSqYd = areaSqM * SQM_TO_SQYD;
        const totalPrice = areaSqYd * pricePerSqYd;

        decoElement.querySelector('[data-deco-summary]').innerHTML = `ราคา: <span class="price">${formatPrice(totalPrice)}</span> • พื้นที่: <span>${formatNumber(areaSqYd)} ตร.หลา</span>`;
    }

    function calculateWallpaper(wallpaperElement) {
        const pricePerRoll = parseFloat(wallpaperElement.querySelector('input[name="wallpaper_price_roll"]').value) || 0;
        const height = parseFloat(wallpaperElement.querySelector('input[name="wallpaper_height_m"]').value) || 0;
        const walls = wallpaperElement.querySelectorAll('input[name="wall_width_m"]');

        let totalWidth = 0;
        walls.forEach(wall => totalWidth += parseFloat(wall.value) || 0);

        const areaSqM = totalWidth * height;
        const numRolls = Math.ceil(areaSqM / (CALC.wallpaper_roll_width * CALC.wallpaper_roll_height));
        const totalPrice = numRolls * pricePerRoll;

        wallpaperElement.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${formatPrice(totalPrice)}</span> • พื้นที่: <span>${formatNumber(areaSqM)} ตร.ม.</span> • ใช้ <span>${numRolls}</span> ม้วน`;
    }

    function updateRoomSummary(roomElement) {
        const roomName = roomElement.querySelector('.room-name').value || `ห้อง ${roomElement.dataset.roomIndex}`;
        let roomTotal = 0;
        let roomSetCount = 0;

        roomElement.querySelectorAll('[data-set]').forEach(setElement => {
            if (!setElement.classList.contains('is-suspended')) {
                roomTotal += parseFloat(setElement.querySelector('[data-set-price-total]').textContent.replace(/[^0-9.-]+/g,"")) || 0;
                roomSetCount++;
            }
        });
        
        roomElement.querySelectorAll('[data-deco-item]').forEach(decoElement => {
            if (!decoElement.classList.contains('is-suspended')) {
                const summaryText = decoElement.querySelector('[data-deco-summary]').textContent;
                const priceMatch = summaryText.match(/ราคา: ([\d,.]+) บ./);
                roomTotal += parseFloat(priceMatch[1].replace(/,/g, '')) || 0;
            }
        });

        roomElement.querySelectorAll('[data-wallpaper-item]').forEach(wallpaperElement => {
            if (!wallpaperElement.classList.contains('is-suspended')) {
                const summaryText = wallpaperElement.querySelector('[data-wallpaper-summary]').textContent;
                const priceMatch = summaryText.match(/ราคา: ([\d,.]+) บ./);
                roomTotal += parseFloat(priceMatch[1].replace(/,/g, '')) || 0;
            }
        });

        roomElement.querySelector('.room-name').placeholder = roomName;
        roomElement.querySelector('[data-room-brief]').textContent = `${roomSetCount} จุด • ราคา ${formatPrice(roomTotal)}`;
    }

    function updateGrandTotals() {
        let grandTotal = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        let setCount = 0;
        let setCountSets = 0;
        let setCountDeco = 0;

        document.querySelectorAll('[data-room]').forEach(roomElement => {
            if (!roomElement.classList.contains('is-suspended')) {
                roomElement.querySelectorAll('[data-set]').forEach(setElement => {
                    if (!setElement.classList.contains('is-suspended')) {
                        const price = parseFloat(setElement.querySelector('[data-set-price-total]').textContent.replace(/[^0-9.-]+/g,"")) || 0;
                        grandTotal += price;
                        grandFabric += parseFloat(setElement.querySelector('[data-set-yardage-opaque]').textContent) || 0;
                        grandSheerFabric += parseFloat(setElement.querySelector('[data-set-yardage-sheer]').textContent) || 0;
                        grandOpaqueTrack += parseFloat(setElement.querySelector('[data-set-opaque-track]').textContent) || 0;
                        grandSheerTrack += parseFloat(setElement.querySelector('[data-set-sheer-track]').textContent) || 0;
                        setCount++;
                        setCountSets++;
                    }
                });
                
                roomElement.querySelectorAll('[data-deco-item]').forEach(decoElement => {
                    if (!decoElement.classList.contains('is-suspended')) {
                        const summaryText = decoElement.querySelector('[data-deco-summary]').textContent;
                        const priceMatch = summaryText.match(/ราคา: ([\d,.]+) บ./);
                        grandTotal += parseFloat(priceMatch[1].replace(/,/g, '')) || 0;
                        setCount++;
                        setCountDeco++;
                    }
                });
                
                roomElement.querySelectorAll('[data-wallpaper-item]').forEach(wallpaperElement => {
                    if (!wallpaperElement.classList.contains('is-suspended')) {
                        const summaryText = wallpaperElement.querySelector('[data-wallpaper-summary]').textContent;
                        const priceMatch = summaryText.match(/ราคา: ([\d,.]+) บ./);
                        grandTotal += parseFloat(priceMatch[1].replace(/,/g, '')) || 0;
                        setCount++;
                    }
                });
            }
        });

        document.querySelector(SELECTORS.grandTotal).textContent = formatPrice(grandTotal);
        document.querySelector(SELECTORS.grandFabric).textContent = `${formatNumber(grandFabric)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${formatNumber(grandSheerFabric)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${formatNumber(grandOpaqueTrack)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${formatNumber(grandSheerTrack)} ม.`;
        document.querySelector(SELECTORS.setCount).textContent = setCount;
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
    }

    function addRoom() {
        const template = document.querySelector(SELECTORS.roomTpl);
        const clone = template.content.cloneNode(true);
        const roomElement = clone.querySelector('[data-room]');
        roomElement.dataset.roomIndex = nextRoomIndex++;
        
        // Populate price options
        const priceSelect = roomElement.querySelector('select[name="room_price_per_m"]');
        PRICING.fabric.forEach(price => {
            const option = document.createElement('option');
            option.value = price;
            option.textContent = price.toLocaleString('th-TH') + ' บ.';
            priceSelect.appendChild(option);
        });

        roomsContainer.appendChild(clone);
        attachRoomEventListeners(roomElement);
    }

    function addSet(roomElement) {
        const template = document.querySelector(SELECTORS.setTpl);
        const clone = template.content.cloneNode(true);
        const setContainer = roomElement.querySelector('[data-sets]');
        const setElement = clone.querySelector('[data-set]');
        const itemIndex = setContainer.querySelectorAll('.set-item').length + 1;
        
        setElement.querySelector('[data-item-title]').textContent = itemIndex;

        // Populate sheer price options
        const sheerPriceSelect = setElement.querySelector('select[name="sheer_price_per_m"]');
        PRICING.sheer.forEach(price => {
            const option = document.createElement('option');
            option.value = price;
            option.textContent = price.toLocaleString('th-TH') + ' บ.';
            sheerPriceSelect.appendChild(option);
        });

        setContainer.appendChild(clone);
        attachSetEventListeners(setElement);
    }
    
    function addDeco(roomElement) {
        const template = document.querySelector(SELECTORS.decoTpl);
        const clone = template.content.cloneNode(true);
        const decoContainer = roomElement.querySelector('[data-decorations]');
        const decoElement = clone.querySelector('[data-deco-item]');
        const itemIndex = decoContainer.querySelectorAll('.deco-item').length + 1;
        
        decoElement.querySelector('[data-item-title]').textContent = itemIndex;
        decoContainer.appendChild(clone);
        attachDecoEventListeners(decoElement);
    }
    
    function addWallpaper(roomElement) {
        const template = document.querySelector(SELECTORS.wallpaperTpl);
        const clone = template.content.cloneNode(true);
        const wallpaperContainer = roomElement.querySelector('[data-wallpapers]');
        const wallpaperElement = clone.querySelector('[data-wallpaper-item]');
        const itemIndex = wallpaperContainer.querySelectorAll('.wallpaper-item').length + 1;
        
        wallpaperElement.querySelector('[data-item-title]').textContent = itemIndex;
        wallpaperContainer.appendChild(clone);
        attachWallpaperEventListeners(wallpaperElement);
    }

    function addWall(wallpaperElement) {
        const template = document.querySelector(SELECTORS.wallTpl);
        const clone = template.content.cloneNode(true);
        const wallsContainer = wallpaperElement.querySelector('[data-walls-container]');
        const wallElement = clone.querySelector('.wall-input-row');
        wallsContainer.appendChild(clone);
        
        wallElement.querySelector('[data-act="del-wall"]').addEventListener('click', (e) => {
            e.stopPropagation();
            wallElement.remove();
            calculateWallpaper(wallpaperElement);
            updateRoomSummary(wallpaperElement.closest('[data-room]'));
            updateGrandTotals();
        });
        
        wallElement.querySelector('input[name="wall_width_m"]').addEventListener('input', () => {
            calculateWallpaper(wallpaperElement);
            updateRoomSummary(wallpaperElement.closest('[data-room]'));
            updateGrandTotals();
        });
    }

    function attachRoomEventListeners(roomElement) {
        roomElement.addEventListener('input', (e) => {
            const isSetInput = e.target.closest('[data-set]');
            const isDecoInput = e.target.closest('[data-deco-item]');
            const isWallpaperInput = e.target.closest('[data-wallpaper-item]');

            if (isSetInput) {
                calculateSet(isSetInput);
            } else if (isDecoInput) {
                calculateDeco(isDecoInput);
            } else if (isWallpaperInput) {
                // Wallpaper handled by its own listeners
            }
            updateRoomSummary(roomElement);
            updateGrandTotals();
        });

        roomElement.querySelector('[data-act="add-set"]').addEventListener('click', () => addSet(roomElement));
        roomElement.querySelector('[data-act="add-deco"]').addEventListener('click', () => addDeco(roomElement));
        roomElement.querySelector('[data-act="add-wallpaper"]').addEventListener('click', () => addWallpaper(roomElement));

        // Dropdown menu
        roomElement.querySelector('[data-act="menu-room"]').addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = roomElement.querySelector('.menu-dropdown');
            toggleDropdown(dropdown);
        });

        // Toggle Suspend
        roomElement.querySelector('[data-act="toggle-suspend-room"]').addEventListener('click', () => {
            roomElement.classList.toggle('is-suspended');
            const suspendText = roomElement.querySelector('[data-suspend-text]');
            suspendText.textContent = roomElement.classList.contains('is-suspended') ? 'ใช้งาน' : 'ระงับ';
            updateGrandTotals();
        });

        // Clear Room
        roomElement.querySelector('[data-act="clear-room"]').addEventListener('click', () => {
            const inputs = roomElement.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    input.checked = false;
                } else if (input.tagName === 'SELECT') {
                    input.selectedIndex = 0;
                } else {
                    input.value = '';
                }
            });
            roomElement.querySelector('[data-sets]').innerHTML = '';
            roomElement.querySelector('[data-decorations]').innerHTML = '';
            roomElement.querySelector('[data-wallpapers]').innerHTML = '';
            updateRoomSummary(roomElement);
            updateGrandTotals();
        });

        // Delete Room
        roomElement.querySelector('[data-act="del-room"]').addEventListener('click', () => {
            showConfirmationModal('ยืนยันการลบห้อง', 'คุณแน่ใจหรือไม่ว่าต้องการลบห้องนี้? การกระทำนี้ไม่สามารถย้อนกลับได้', () => {
                roomElement.remove();
                updateGrandTotals();
            });
        });
    }
    
    function attachSetEventListeners(setElement) {
        const roomElement = setElement.closest('[data-room]');
        
        // Toggle sheer price field
        setElement.querySelector('select[name="fabric_variant"]').addEventListener('change', (e) => {
            const sheerWrap = setElement.querySelector('[data-sheer-wrap]');
            if (e.target.value === 'โปร่ง' || e.target.value === 'ทึบ&โปร่ง') {
                sheerWrap.style.display = 'block';
            } else {
                sheerWrap.style.display = 'none';
            }
        });
        
        // Input change
        setElement.addEventListener('input', () => {
            calculateSet(setElement);
            updateRoomSummary(roomElement);
            updateGrandTotals();
        });
        
        // Dropdown menu
        setElement.querySelector('[data-act="menu-item"]').addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = setElement.querySelector('.menu-dropdown');
            toggleDropdown(dropdown);
        });

        // Toggle Suspend
        setElement.querySelector('[data-act="toggle-suspend"]').addEventListener('click', () => {
            setElement.classList.toggle('is-suspended');
            const suspendText = setElement.querySelector('[data-suspend-text]');
            suspendText.textContent = setElement.classList.contains('is-suspended') ? 'ใช้งาน' : 'ระงับ';
            updateRoomSummary(roomElement);
            updateGrandTotals();
        });

        // Clear Set
        setElement.querySelector('[data-act="clear-set"]').addEventListener('click', () => {
            const inputs = setElement.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    input.checked = false;
                } else if (input.tagName === 'SELECT') {
                    input.selectedIndex = 0;
                } else {
                    input.value = '';
                }
            });
            calculateSet(setElement);
            updateRoomSummary(roomElement);
            updateGrandTotals();
        });

        // Delete Set
        setElement.querySelector('[data-act="del-set"]').addEventListener('click', () => {
            showConfirmationModal('ยืนยันการลบผ้าม่าน', 'คุณแน่ใจหรือไม่ว่าต้องการลบจุดผ้าม่านนี้?', () => {
                setElement.remove();
                updateRoomSummary(roomElement);
                updateGrandTotals();
            });
        });
    }

    function attachDecoEventListeners(decoElement) {
        const roomElement = decoElement.closest('[data-room]');
        
        // Input change
        decoElement.addEventListener('input', () => {
            calculateDeco(decoElement);
            updateRoomSummary(roomElement);
            updateGrandTotals();
        });
        
        // Dropdown menu
        decoElement.querySelector('[data-act="menu-item"]').addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = decoElement.querySelector('.menu-dropdown');
            toggleDropdown(dropdown);
        });

        // Toggle Suspend
        decoElement.querySelector('[data-act="toggle-suspend"]').addEventListener('click', () => {
            decoElement.classList.toggle('is-suspended');
            const suspendText = decoElement.querySelector('[data-suspend-text]');
            suspendText.textContent = decoElement.classList.contains('is-suspended') ? 'ใช้งาน' : 'ระงับ';
            updateRoomSummary(roomElement);
            updateGrandTotals();
        });
        
        // Clear Deco
        decoElement.querySelector('[data-act="clear-deco"]').addEventListener('click', () => {
            const inputs = decoElement.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    input.checked = false;
                } else if (input.tagName === 'SELECT') {
                    input.selectedIndex = 0;
                } else {
                    input.value = '';
                }
            });
            calculateDeco(decoElement);
            updateRoomSummary(roomElement);
            updateGrandTotals();
        });
        
        // Delete Deco
        decoElement.querySelector('[data-act="del-deco"]').addEventListener('click', () => {
            showConfirmationModal('ยืนยันการลบรายการตกแต่ง', 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการตกแต่งนี้?', () => {
                decoElement.remove();
                updateRoomSummary(roomElement);
                updateGrandTotals();
            });
        });
    }
    
    function attachWallpaperEventListeners(wallpaperElement) {
        const roomElement = wallpaperElement.closest('[data-room]');
        
        // Add Wall
        wallpaperElement.querySelector('[data-act="add-wall"]').addEventListener('click', () => addWall(wallpaperElement));
        
        // Input change
        wallpaperElement.addEventListener('input', (e) => {
            if (e.target.name === 'wallpaper_price_roll' || e.target.name === 'wallpaper_height_m') {
                calculateWallpaper(wallpaperElement);
                updateRoomSummary(roomElement);
                updateGrandTotals();
            }
        });
        
        // Dropdown menu
        wallpaperElement.querySelector('[data-act="menu-item"]').addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = wallpaperElement.querySelector('.menu-dropdown');
            toggleDropdown(dropdown);
        });
        
        // Toggle Suspend
        wallpaperElement.querySelector('[data-act="toggle-suspend"]').addEventListener('click', () => {
            wallpaperElement.classList.toggle('is-suspended');
            const suspendText = wallpaperElement.querySelector('[data-suspend-text]');
            suspendText.textContent = wallpaperElement.classList.contains('is-suspended') ? 'ใช้งาน' : 'ระงับ';
            updateRoomSummary(roomElement);
            updateGrandTotals();
        });
        
        // Clear Wallpaper
        wallpaperElement.querySelector('[data-act="clear-wallpaper"]').addEventListener('click', () => {
            const inputs = wallpaperElement.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    input.checked = false;
                } else if (input.tagName === 'SELECT') {
                    input.selectedIndex = 0;
                } else {
                    input.value = '';
                }
            });
            wallpaperElement.querySelector('[data-walls-container]').innerHTML = '';
            calculateWallpaper(wallpaperElement);
            updateRoomSummary(roomElement);
            updateGrandTotals();
        });
        
        // Delete Wallpaper
        wallpaperElement.querySelector('[data-act="del-wallpaper"]').addEventListener('click', () => {
            showConfirmationModal('ยืนยันการลบรายการวอลเปเปอร์', 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการวอลเปเปอร์นี้?', () => {
                wallpaperElement.remove();
                updateRoomSummary(roomElement);
                updateGrandTotals();
            });
        });
    }
    
    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            customer: {
                name: document.querySelector('#customer_name').value,
                phone: document.querySelector('#customer_phone').value,
                address: document.querySelector('#customer_address').value,
            },
            summary: {
                total_price: parseFloat(document.querySelector(SELECTORS.grandTotal).textContent.replace(/[^0-9.-]+/g, '')) || 0,
                total_fabric_yard: parseFloat(document.querySelector(SELECTORS.grandFabric).textContent.replace(/[^0-9.-]+/g, '')) || 0,
                total_sheer_yard: parseFloat(document.querySelector(SELECTORS.grandSheerFabric).textContent.replace(/[^0-9.-]+/g, '')) || 0,
                total_opaque_track: parseFloat(document.querySelector(SELECTORS.grandOpaqueTrack).textContent.replace(/[^0-9.-]+/g, '')) || 0,
                total_sheer_track: parseFloat(document.querySelector(SELECTORS.grandSheerTrack).textContent.replace(/[^0-9.-]+/g, '')) || 0,
                item_count: parseInt(document.querySelector(SELECTORS.setCount).textContent) || 0,
            },
            rooms: []
        };
        
        document.querySelectorAll('[data-room]').forEach(roomElement => {
            if (roomElement.classList.contains('is-suspended')) return;

            const roomData = {
                name: roomElement.querySelector('input[name="room_name"]').value || `ห้อง ${roomElement.dataset.roomIndex}`,
                price_per_m: parseFloat(roomElement.querySelector('select[name="room_price_per_m"]').value) || 0,
                style: roomElement.querySelector('select[name="room_style"]').value,
                sets: [],
                decorations: [],
                wallpapers: [],
                total_price: parseFloat(roomElement.querySelector('[data-room-brief]').textContent.match(/ราคา ([\d,.]+) บ./)[1].replace(/,/g, '')) || 0
            };

            roomElement.querySelectorAll('[data-set]').forEach(setElement => {
                if (setElement.classList.contains('is-suspended')) return;
                
                roomData.sets.push({
                    item_number: parseInt(setElement.querySelector('[data-item-title]').textContent) || 0,
                    width_m: parseFloat(setElement.querySelector('input[name="width_m"]').value) || 0,
                    height_m: parseFloat(setElement.querySelector('input[name="height_m"]').value) || 0,
                    fabric_variant: setElement.querySelector('select[name="fabric_variant"]').value,
                    open_type: setElement.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: parseFloat(setElement.querySelector('select[name="sheer_price_per_m"]').value) || 0,
                    yardage_opaque: parseFloat(setElement.querySelector('[data-set-yardage-opaque]').textContent) || 0,
                    yardage_sheer: parseFloat(setElement.querySelector('[data-set-yardage-sheer]').textContent) || 0,
                    track_opaque: parseFloat(setElement.querySelector('[data-set-opaque-track]').textContent) || 0,
                    track_sheer: parseFloat(setElement.querySelector('[data-set-sheer-track]').textContent) || 0,
                    total_price: parseFloat(setElement.querySelector('[data-set-price-total]').textContent.replace(/[^0-9.-]+/g,"")) || 0
                });
            });

            roomElement.querySelectorAll('[data-deco-item]').forEach(decoElement => {
                if (decoElement.classList.contains('is-suspended')) return;
                
                const summaryText = decoElement.querySelector('[data-deco-summary]').textContent;
                const priceMatch = summaryText.match(/ราคา: ([\d,.]+) บ./);
                const areaMatch = summaryText.match(/พื้นที่: ([\d,.]+) ตร.หลา/);
                
                roomData.decorations.push({
                    item_number: parseInt(decoElement.querySelector('[data-item-title]').textContent) || 0,
                    type: decoElement.querySelector('input[name="deco_type"]').value,
                    price_per_sqyd: parseFloat(decoElement.querySelector('input[name="deco_price_sqyd"]').value) || 0,
                    width_m: parseFloat(decoElement.querySelector('input[name="deco_width_m"]').value) || 0,
                    height_m: parseFloat(decoElement.querySelector('input[name="deco_height_m"]').value) || 0,
                    area_sqyd: parseFloat(areaMatch[1]) || 0,
                    total_price: parseFloat(priceMatch[1].replace(/,/g, '')) || 0,
                });
            });

            roomElement.querySelectorAll('[data-wallpaper-item]').forEach(wallpaperElement => {
                if (wallpaperElement.classList.contains('is-suspended')) return;

                const summaryText = wallpaperElement.querySelector('[data-wallpaper-summary]').textContent;
                const priceMatch = summaryText.match(/ราคา: ([\d,.]+) บ./);
                const areaMatch = summaryText.match(/พื้นที่: ([\d,.]+) ตร.ม./);
                const rollsMatch = summaryText.match(/ใช้ ([\d,.]+) ม้วน/);

                const walls = [];
                wallpaperElement.querySelectorAll('input[name="wall_width_m"]').forEach(wall => walls.push(parseFloat(wall.value) || 0));

                roomData.wallpapers.push({
                    item_number: parseInt(wallpaperElement.querySelector('[data-item-title]').textContent) || 0,
                    price_per_roll: parseFloat(wallpaperElement.querySelector('input[name="wallpaper_price_roll"]').value) || 0,
                    height_m: parseFloat(wallpaperElement.querySelector('input[name="wallpaper_height_m"]').value) || 0,
                    wall_widths: walls,
                    area_sqm: parseFloat(areaMatch[1]) || 0,
                    rolls_used: parseInt(rollsMatch[1]) || 0,
                    total_price: parseFloat(priceMatch[1].replace(/,/g, '')) || 0,
                });
            });

            payload.rooms.push(roomData);
        });

        return payload;
    }

    // --- MAIN LOGIC ---
    function init() {
        document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', addRoom);
        
        // Lock/Unlock button
        document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
            isLocked = !isLocked;
            const formElements = orderForm.querySelectorAll('input, select, textarea, button:not(#lockBtn, #menuBtn)');
            formElements.forEach(el => el.disabled = isLocked);
            document.querySelector(SELECTORS.lockBtn).classList.toggle('is-warning', !isLocked);
            document.querySelector(SELECTORS.lockBtn).classList.toggle('is-success', isLocked);
            document.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อคฟอร์ม';
        });

        // Main dropdown menu
        document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.querySelector(SELECTORS.menuDropdown);
            toggleDropdown(dropdown);
        });
        
        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
            try {
                const data = JSON.stringify(buildPayload(), null, 2);
                navigator.clipboard.writeText(data);
                showToast("คัดลอก JSON สำเร็จ", "success");
            } catch (e) {
                showToast("คัดลอก JSON ไม่สำเร็จ", "error");
            }
        });
        
        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', () => {
            document.querySelector(SELECTORS.copyOptionsModal).classList.add('visible');
        });

        document.querySelector(SELECTORS.copyOptionsConfirm).addEventListener('click', () => {
            const copyCustomerInfo = document.querySelector(SELECTORS.copyCustomerInfo).checked;
            const copyRoomDetails = document.querySelector(SELECTORS.copyRoomDetails).checked;
            const copySummary = document.querySelector(SELECTORS.copySummary).checked;
            let textOutput = '';

            const payload = buildPayload();

            if (copyCustomerInfo) {
                textOutput += `**ข้อมูลลูกค้า**\n`;
                textOutput += `ชื่อ: ${payload.customer.name}\n`;
                textOutput += `โทร: ${payload.customer.phone}\n`;
                textOutput += `ที่อยู่/งาน: ${payload.customer.address}\n\n`;
            }

            if (copyRoomDetails && payload.rooms.length > 0) {
                textOutput += `**รายละเอียดรายการ**\n\n`;
                payload.rooms.forEach(room => {
                    textOutput += `--- **${room.name}** (${room.style} - ราคาผ้า ${room.price_per_m.toLocaleString()} บ.) ---\n`;
                    room.sets.forEach(set => {
                        textOutput += `  - ผ้าม่านจุดที่ ${set.item_number} | กว้าง ${set.width_m} ม. | สูง ${set.height_m} ม. | ${set.fabric_variant}\n`;
                    });
                    room.decorations.forEach(deco => {
                        textOutput += `  - ตกแต่งจุดที่ ${deco.item_number}: ${deco.type} | กว้าง ${deco.width_m} ม. | สูง ${deco.height_m} ม.\n`;
                    });
                    room.wallpapers.forEach(wallpaper => {
                        textOutput += `  - วอลเปเปอร์จุดที่ ${wallpaper.item_number} | สูง ${wallpaper.height_m} ม. | กว้าง ${wallpaper.wall_widths.join(' + ')} ม.\n`;
                    });
                    textOutput += `  **รวมราคาห้อง:** ${formatPrice(room.total_price)}\n\n`;
                });
            }

            if (copySummary) {
                textOutput += `**สรุปยอดรวม**\n`;
                textOutput += `จำนวนจุดติดตั้ง: ${payload.summary.item_count} (${payload.summary.item_count - payload.summary.total_fabric_yard / 0.9144 / 2.5} ตกแต่ง/วอลเปเปอร์, ${payload.summary.total_fabric_yard / 0.9144 / 2.5} ผ้าม่าน)\n`;
                textOutput += `ผ้าทึบ: ${formatNumber(payload.summary.total_fabric_yard)} หลา\n`;
                textOutput += `ผ้าโปร่ง: ${formatNumber(payload.summary.total_sheer_yard)} หลา\n`;
                textOutput += `รางทึบ: ${formatNumber(payload.summary.total_opaque_track)} ม.\n`;
                textOutput += `รางโปร่ง: ${formatNumber(payload.summary.total_sheer_track)} ม.\n`;
                textOutput += `ยอดรวมทั้งหมด: ${formatPrice(payload.summary.total_price)}\n`;
            }
            
            navigator.clipboard.writeText(textOutput);
            document.querySelector(SELECTORS.copyOptionsModal).classList.remove('visible');
            showToast("คัดลอกข้อความสำเร็จ", "success");
        });
        
        document.querySelector(SELECTORS.copyOptionsCancel).addEventListener('click', () => document.querySelector(SELECTORS.copyOptionsModal).classList.remove('visible'));

        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', () => {
            showConfirmationModal('ยืนยันการล้างข้อมูลทั้งหมด', 'คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้', () => {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            });
        });
        
        // Import/Export
        document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
            document.querySelector(SELECTORS.importModal).classList.add('visible');
            document.querySelector(SELECTORS.importJsonArea).value = '';
        });
        
        document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
            const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
            try {
                const payload = JSON.parse(jsonText);
                loadData(payload);
                document.querySelector(SELECTORS.importModal).classList.remove('visible');
                showToast("นำเข้าข้อมูลสำเร็จ", "success");
            } catch (e) {
                showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
            }
        });
        
        document.querySelector(SELECTORS.importCancel).addEventListener('click', () => document.querySelector(SELECTORS.importModal).classList.remove('visible'));
        
        document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
            const data = JSON.stringify(buildPayload(), null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `marnthara_data_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('ส่งออกข้อมูลสำเร็จ');
        });

        // Data persistence
        orderForm.addEventListener('input', () => {
            saveData();
        });

        // Menu, Modal, and Dropdown closing logic
        window.addEventListener('click', (e) => {
            document.querySelectorAll('.menu-dropdown.show').forEach(menu => {
                if (!menu.parentElement.contains(e.target)) menu.classList.remove('show');
            });
        });
        
        function toggleDropdown(dropdown) {
            document.querySelectorAll('.menu-dropdown.show').forEach(menu => {
                if (menu !== dropdown) menu.classList.remove('show');
            });
            dropdown.classList.toggle('show');
        }

        // Confirmation Modal
        function showConfirmationModal(title, body, onConfirm) {
            const modal = document.querySelector(SELECTORS.confirmationModal);
            document.querySelector(SELECTORS.modalTitle).textContent = title;
            document.querySelector(SELECTORS.modalBody).textContent = body;
            modal.classList.add('visible');
            
            const confirmBtn = document.querySelector(SELECTORS.modalConfirm);
            const cancelBtn = document.querySelector(SELECTORS.modalCancel);
            
            const confirmHandler = () => {
                onConfirm();
                modal.classList.remove('visible');
                confirmBtn.removeEventListener('click', confirmHandler);
            };

            const cancelHandler = () => {
                modal.classList.remove('visible');
                cancelBtn.removeEventListener('click', cancelHandler);
            };

            confirmBtn.addEventListener('click', confirmHandler);
            cancelBtn.addEventListener('click', cancelHandler);
        }

        orderForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
            showToast("กำลังส่งข้อมูล...", "warning", 5000);
            
            try {
                const response = await fetch(WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildPayload())
                });
                if (response.ok) {
                    showToast("ส่งข้อมูลสำเร็จ!", "success");
                } else {
                    showToast("การส่งข้อมูลล้มเหลว", "error");
                }
            } catch (error) {
                showToast("เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
            }
        });

        // Initial load
        loadData();
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function loadData(payload = null) {
        let data = payload;
        if (!data) {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                try {
                    data = JSON.parse(storedData);
                } catch (e) {
                    console.error("Failed to parse stored data", e);
                    showToast("ไม่สามารถโหลดข้อมูลที่บันทึกไว้ได้", "error");
                    return;
                }
            }
        }

        if (data) {
            // Load customer data
            if (data.customer) {
                document.querySelector('#customer_name').value = data.customer.name || '';
                document.querySelector('#customer_phone').value = data.customer.phone || '';
                document.querySelector('#customer_address').value = data.customer.address || '';
            }

            // Clear existing rooms
            roomsContainer.innerHTML = '';
            nextRoomIndex = 1;

            // Load rooms
            if (data.rooms && data.rooms.length > 0) {
                data.rooms.forEach(roomData => {
                    const template = document.querySelector(SELECTORS.roomTpl);
                    const clone = template.content.cloneNode(true);
                    const roomElement = clone.querySelector('[data-room]');
                    roomElement.dataset.roomIndex = nextRoomIndex++;
                    
                    // Populate price options
                    const priceSelect = roomElement.querySelector('select[name="room_price_per_m"]');
                    PRICING.fabric.forEach(price => {
                        const option = document.createElement('option');
                        option.value = price;
                        option.textContent = price.toLocaleString('th-TH') + ' บ.';
                        priceSelect.appendChild(option);
                    });

                    // Set room data
                    roomElement.querySelector('input[name="room_name"]').value = roomData.name;
                    roomElement.querySelector('select[name="room_price_per_m"]').value = roomData.price_per_m;
                    roomElement.querySelector('select[name="room_style"]').value = roomData.style;
                    
                    // Add sets
                    roomData.sets.forEach(setData => {
                        const setTpl = document.querySelector(SELECTORS.setTpl);
                        const setClone = setTpl.content.cloneNode(true);
                        const setContainer = roomElement.querySelector('[data-sets]');
                        const setElement = setClone.querySelector('[data-set]');
                        const itemIndex = setContainer.querySelectorAll('.set-item').length + 1;
                        
                        setElement.querySelector('[data-item-title]').textContent = itemIndex;

                        // Populate sheer price options
                        const sheerPriceSelect = setElement.querySelector('select[name="sheer_price_per_m"]');
                        PRICING.sheer.forEach(price => {
                            const option = document.createElement('option');
                            option.value = price;
                            option.textContent = price.toLocaleString('th-TH') + ' บ.';
                            sheerPriceSelect.appendChild(option);
                        });

                        // Set set data
                        setElement.querySelector('input[name="width_m"]').value = setData.width_m;
                        setElement.querySelector('input[name="height_m"]').value = setData.height_m;
                        setElement.querySelector('select[name="fabric_variant"]').value = setData.fabric_variant;
                        setElement.querySelector('select[name="open_type"]').value = setData.open_type;
                        setElement.querySelector('select[name="sheer_price_per_m"]').value = setData.sheer_price_per_m;
                        
                        setContainer.appendChild(setClone);
                        attachSetEventListeners(setElement);
                        calculateSet(setElement);
                    });

                    // Add decorations
                    roomData.decorations.forEach(decoData => {
                        const decoTpl = document.querySelector(SELECTORS.decoTpl);
                        const decoClone = decoTpl.content.cloneNode(true);
                        const decoContainer = roomElement.querySelector('[data-decorations]');
                        const decoElement = decoClone.querySelector('[data-deco-item]');
                        const itemIndex = decoContainer.querySelectorAll('.deco-item').length + 1;
                        
                        decoElement.querySelector('[data-item-title]').textContent = itemIndex;
                        
                        // Set deco data
                        decoElement.querySelector('input[name="deco_type"]').value = decoData.type;
                        decoElement.querySelector('input[name="deco_price_sqyd"]').value = decoData.price_per_sqyd;
                        decoElement.querySelector('input[name="deco_width_m"]').value = decoData.width_m;
                        decoElement.querySelector('input[name="deco_height_m"]').value = decoData.height_m;
                        
                        decoContainer.appendChild(decoClone);
                        attachDecoEventListeners(decoElement);
                        calculateDeco(decoElement);
                    });
                    
                    // Add wallpapers
                    roomData.wallpapers.forEach(wallpaperData => {
                        const wallpaperTpl = document.querySelector(SELECTORS.wallpaperTpl);
                        const wallpaperClone = wallpaperTpl.content.cloneNode(true);
                        const wallpaperContainer = roomElement.querySelector('[data-wallpapers]');
                        const wallpaperElement = wallpaperClone.querySelector('[data-wallpaper-item]');
                        const itemIndex = wallpaperContainer.querySelectorAll('.wallpaper-item').length + 1;
                        
                        wallpaperElement.querySelector('[data-item-title]').textContent = itemIndex;
                        
                        // Set wallpaper data
                        wallpaperElement.querySelector('input[name="wallpaper_price_roll"]').value = wallpaperData.price_per_roll;
                        wallpaperElement.querySelector('input[name="wallpaper_height_m"]').value = wallpaperData.height_m;
                        
                        // Add walls
                        wallpaperData.wall_widths.forEach(wallWidth => {
                            const wallTpl = document.querySelector(SELECTORS.wallTpl);
                            const wallClone = wallTpl.content.cloneNode(true);
                            const wallsContainer = wallpaperElement.querySelector('[data-walls-container]');
                            const wallElement = wallClone.querySelector('.wall-input-row');
                            wallElement.querySelector('input[name="wall_width_m"]').value = wallWidth;
                            wallsContainer.appendChild(wallClone);
                            
                            wallElement.querySelector('[data-act="del-wall"]').addEventListener('click', (e) => {
                                e.stopPropagation();
                                wallElement.remove();
                                calculateWallpaper(wallpaperElement);
                                updateRoomSummary(roomElement);
                                updateGrandTotals();
                            });
                            
                            wallElement.querySelector('input[name="wall_width_m"]').addEventListener('input', () => {
                                calculateWallpaper(wallpaperElement);
                                updateRoomSummary(roomElement);
                                updateGrandTotals();
                            });
                        });
                        
                        wallpaperContainer.appendChild(wallpaperClone);
                        attachWallpaperEventListeners(wallpaperElement);
                        calculateWallpaper(wallpaperElement);
                    });

                    roomsContainer.appendChild(clone);
                    attachRoomEventListeners(roomElement);
                    updateRoomSummary(roomElement);
                });
            } else {
                // If no stored data, add one empty room
                addRoom();
            }
            updateGrandTotals();
        } else {
            addRoom();
        }
    }

    // Initialize the app
    init();
})();