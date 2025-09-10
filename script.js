(function() {
    'use strict';
    // --- CONSTANTS ---
    const APP_VERSION = "input-ui/m3-4.0.0";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";
    const WALLPAPER_SQM_PER_ROLL = 5.3;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };

    const SELECTORS = {
        mainContent: 'main.main-content',
        addRoomBtn: '#addRoomBtn',
        addRoomFab: '#addRoomFab',
        roomsContainer: '#rooms-container',
        menuBtn: '#menuBtn',
        menuDropdown: '#menuDropdown',
        lockBtn: '#lockBtn',
        clearBtn: '#clearBtn',
        importBtn: '#importBtn',
        exportBtn: '#exportBtn',
        payloadInput: '#payloadInput',
        orderForm: '#orderForm',
        toastContainer: '#toast-container',
        dialogContainer: '#dialog-container',
        dialogOkBtn: '#dialog-ok-btn',
        dialogCancelBtn: '#dialog-cancel-btn',
        priceTotalFabric: '#fabricPriceTotal',
        priceTotalWallpaper: '#wallpaperPriceTotal',
        priceTotalAll: '#totalPrice',
        roomItem: '.room-item'
    };

    let roomCount = 0;

    // --- Helper Functions ---
    function formatPrice(price) { return parseFloat(price).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function showToast(message, type = 'default') {
        const toastContainer = document.querySelector(SELECTORS.toastContainer);
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function showDialog(message, title = 'แจ้งเตือน', onConfirm = null) {
        const dialogContainer = document.querySelector(SELECTORS.dialogContainer);
        dialogContainer.innerHTML = `
            <div class="md-dialog">
                <h3 class="title-large">${title}</h3>
                <p>${message}</p>
                <div class="dialog-actions">
                    <md-filled-button type="button" id="dialog-ok-btn">ตกลง</md-filled-button>
                    ${onConfirm ? '<md-outlined-button type="button" id="dialog-cancel-btn">ยกเลิก</md-outlined-button>' : ''}
                </div>
            </div>
        `;
        const dialog = dialogContainer.querySelector('.md-dialog');
        dialogContainer.classList.add('show');
        
        dialogContainer.querySelector('#dialog-ok-btn').onclick = () => {
            dialogContainer.classList.remove('show');
            if (onConfirm) onConfirm();
        };
        if (onConfirm) {
            dialogContainer.querySelector('#dialog-cancel-btn').onclick = () => {
                dialogContainer.classList.remove('show');
            };
        }
    }

    // --- Form & Logic Functions ---
    function calculateTotal() {
        let fabricTotal = 0;
        let wallpaperTotal = 0;
        document.querySelectorAll(SELECTORS.roomItem).forEach(roomEl => {
            const productType = roomEl.querySelector('.md-tab.active').dataset.productType;
            if (productType === 'fabric') {
                const priceEl = roomEl.querySelector('[data-fabric-summary] .price');
                if (priceEl) fabricTotal += parseFloat(priceEl.textContent.replace(/,/g, '')) || 0;
            } else if (productType === 'wallpaper') {
                const priceEl = roomEl.querySelector('[data-wallpaper-summary] .price');
                if (priceEl) wallpaperTotal += parseFloat(priceEl.textContent.replace(/,/g, '')) || 0;
            }
        });
        document.querySelector(SELECTORS.priceTotalFabric).textContent = formatPrice(fabricTotal);
        document.querySelector(SELECTORS.priceTotalWallpaper).textContent = formatPrice(wallpaperTotal);
        document.querySelector(SELECTORS.priceTotalAll).textContent = formatPrice(fabricTotal + wallpaperTotal);
    }

    function calculateFabricPrice(roomEl) {
        const length = parseFloat(roomEl.querySelector('input[name="fabric_length_m"]').value) || 0;
        const height = parseFloat(roomEl.querySelector('input[name="fabric_height_m"]').value) || 0;
        const pricePerSqm = parseFloat(roomEl.querySelector('input[name="fabric_price_sqm"]').value) || 0;
        const style = roomEl.querySelector('input[name="fabric_style"]').value || '';
        
        const styleSurcharge = PRICING.style_surcharge[style] || 0;
        const totalSqm = length * height;
        let totalPrice = totalSqm * pricePerSqm;
        
        const heightTier = PRICING.height.find(h => height > h.threshold);
        if (heightTier) {
            totalPrice += (height - heightTier.threshold) * heightTier.add_per_m;
        }
        totalPrice += styleSurcharge;
        
        const summaryEl = roomEl.querySelector('[data-fabric-summary] .price');
        if (summaryEl) summaryEl.textContent = formatPrice(totalPrice);
        calculateTotal();
    }

    function calculateWallpaperPrice(roomEl) {
        const wallpaperWidth = parseFloat(roomEl.querySelector('input[name="wallpaper_width_m"]').value) || 0;
        const roomHeight = parseFloat(roomEl.querySelector('input[name="wallpaper_height_m"]').value) || 0;
        const pricePerRoll = parseFloat(roomEl.querySelector('input[name="wallpaper_price_roll"]').value) || 0;

        let totalWallWidth = 0;
        roomEl.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
            totalWallWidth += parseFloat(input.value) || 0;
        });

        const totalSqm = totalWallWidth * roomHeight;
        const rollsNeeded = wallpaperWidth > 0 && totalSqm > 0 ? Math.ceil(totalWallWidth / wallpaperWidth) : 0;
        const totalPrice = rollsNeeded * pricePerRoll;

        const summaryEl = roomEl.querySelector('[data-wallpaper-summary]');
        if (summaryEl) {
            summaryEl.querySelector('.price:nth-of-type(1)').textContent = formatPrice(totalPrice);
            summaryEl.querySelector('.price:nth-of-type(2)').textContent = formatPrice(totalSqm);
            summaryEl.querySelector('.price:nth-of-type(3)').textContent = rollsNeeded.toLocaleString();
        }
        calculateTotal();
    }
    
    function addRoom(payload = null) {
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        const template = document.getElementById('roomTpl');
        const clone = document.importNode(template.content, true);
        const roomEl = clone.querySelector('.room-item');
        
        roomCount++;
        roomEl.querySelector('[data-room-title]').textContent = `ห้องที่ ${roomCount}`;
        roomEl.dataset.roomId = roomCount;
        roomsContainer.appendChild(roomEl);
        
        if (payload) {
            roomEl.querySelector('input[name="fabric_style"]').value = payload.fabric_style || '';
            roomEl.querySelector('input[name="fabric_price_sqm"]').value = payload.fabric_price_sqm || '';
            roomEl.querySelector('input[name="fabric_length_m"]').value = payload.fabric_length_m || '';
            roomEl.querySelector('input[name="fabric_height_m"]').value = payload.fabric_height_m || '';
            
            const wallsContainer = roomEl.querySelector('[data-walls-container]');
            if (payload.walls && payload.walls.length > 0) {
                payload.walls.forEach(wall => addWall(roomEl, wall));
            } else {
                addWall(roomEl);
            }
            
            const tabFabric = roomEl.querySelector('.md-tab-fabric');
            const tabWallpaper = roomEl.querySelector('.md-tab-wallpaper');
            const contentFabric = roomEl.querySelector('.fabric-content');
            const contentWallpaper = roomEl.querySelector('.wallpaper-content');
            
            if (payload.type === 'wallpaper') {
                tabFabric.classList.remove('active');
                tabWallpaper.classList.add('active');
                contentFabric.classList.remove('active');
                contentWallpaper.classList.add('active');
                roomEl.querySelector('input[name="wallpaper_width_m"]').value = payload.wallpaper_width_m || '';
                roomEl.querySelector('input[name="wallpaper_height_m"]').value = payload.wallpaper_height_m || '';
                roomEl.querySelector('input[name="wallpaper_price_roll"]').value = payload.wallpaper_price_roll || '';
            } else {
                roomEl.querySelector('input[name="wallpaper_width_m"]').value = payload.wallpaper_width_m || '';
                roomEl.querySelector('input[name="wallpaper_height_m"]').value = payload.wallpaper_height_m || '';
                roomEl.querySelector('input[name="wallpaper_price_roll"]').value = payload.wallpaper_price_roll || '';
            }
        } else {
            addWall(roomEl);
        }
        
        roomEl.addEventListener('input', () => {
            const productType = roomEl.querySelector('.md-tab.active').dataset.productType;
            if (productType === 'fabric') calculateFabricPrice(roomEl);
            else calculateWallpaperPrice(roomEl);
            saveDataToStorage();
        });
        
        roomEl.addEventListener('click', e => {
            if (e.target.closest('[data-act="del-room"]')) {
                showDialog('คุณต้องการลบห้องนี้หรือไม่?', 'ยืนยันการลบ', () => {
                    roomEl.remove();
                    reorderRooms();
                    calculateTotal();
                    saveDataToStorage();
                    showToast('ลบห้องเรียบร้อย', 'success');
                });
            } else if (e.target.closest('.md-tab')) {
                const targetTab = e.target.closest('.md-tab');
                const productType = targetTab.dataset.productType;
                
                roomEl.querySelectorAll('.md-tab').forEach(tab => tab.classList.remove('active'));
                targetTab.classList.add('active');
                
                roomEl.querySelectorAll('.product-content').forEach(content => content.classList.remove('active'));
                roomEl.querySelector(`[data-product-content="${productType}"]`).classList.add('active');
                
                if (productType === 'fabric') calculateFabricPrice(roomEl);
                else calculateWallpaperPrice(roomEl);
                saveDataToStorage();
            }
        });
        
        calculateTotal();
    }

    function addWall(roomEl, payload = null) {
        const wallsContainer = roomEl.querySelector('[data-walls-container]');
        const template = document.getElementById('wallTpl');
        const clone = document.importNode(template.content, true);
        const wallEl = clone.querySelector('.wall-input-row');
        
        wallsContainer.appendChild(wallEl);
        
        if (payload) {
            wallEl.querySelector('input[name="wall_width_m"]').value = payload.wall_width_m || '';
        }
        
        wallEl.addEventListener('input', () => {
            calculateWallpaperPrice(roomEl);
            saveDataToStorage();
        });
        
        wallEl.querySelector('[data-act="del-wall"]').onclick = () => {
            wallEl.remove();
            calculateWallpaperPrice(roomEl);
            saveDataToStorage();
        };
    }
    
    function reorderRooms() {
        roomCount = 0;
        document.querySelectorAll(SELECTORS.roomItem).forEach((roomEl, index) => {
            roomCount = index + 1;
            roomEl.querySelector('[data-room-title]').textContent = `ห้องที่ ${roomCount}`;
            roomEl.dataset.roomId = roomCount;
        });
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            notes: document.querySelector('textarea[name="notes"]').value,
            rooms: []
        };
        
        document.querySelectorAll(SELECTORS.roomItem).forEach(roomEl => {
            const productType = roomEl.querySelector('.md-tab.active').dataset.productType;
            const roomData = {
                type: productType
            };
            
            if (productType === 'fabric') {
                roomData.fabric_style = roomEl.querySelector('input[name="fabric_style"]').value;
                roomData.fabric_price_sqm = parseFloat(roomEl.querySelector('input[name="fabric_price_sqm"]').value);
                roomData.fabric_length_m = parseFloat(roomEl.querySelector('input[name="fabric_length_m"]').value);
                roomData.fabric_height_m = parseFloat(roomEl.querySelector('input[name="fabric_height_m"]').value);
            } else { // wallpaper
                roomData.wallpaper_width_m = parseFloat(roomEl.querySelector('input[name="wallpaper_width_m"]').value);
                roomData.wallpaper_height_m = parseFloat(roomEl.querySelector('input[name="wallpaper_height_m"]').value);
                roomData.wallpaper_price_roll = parseFloat(roomEl.querySelector('input[name="wallpaper_price_roll"]').value);
                roomData.walls = [];
                roomEl.querySelectorAll('input[name="wall_width_m"]').forEach(wallInput => {
                    roomData.walls.push({ wall_width_m: parseFloat(wallInput.value) });
                });
            }
            payload.rooms.push(roomData);
        });
        
        return payload;
    }

    function saveDataToStorage() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function updateLockState() {
        const form = document.querySelector(SELECTORS.orderForm);
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const isLocked = form.dataset.locked === 'true';
        
        if (isLocked) {
            form.querySelectorAll('input, textarea').forEach(el => el.setAttribute('readonly', 'readonly'));
            form.querySelectorAll('button:not(#lockBtn), .md-text-field label, .md-text-field input, .md-text-field textarea').forEach(el => el.classList.add('locked'));
            lockBtn.querySelector('span').textContent = 'lock';
            lockBtn.querySelector('.lock-text').textContent = 'ปลดล็อค';
            showToast('ฟอร์มถูกล็อคแล้ว', 'success');
        } else {
            form.querySelectorAll('input, textarea').forEach(el => el.removeAttribute('readonly'));
            form.querySelectorAll('.locked').forEach(el => el.classList.remove('locked'));
            lockBtn.querySelector('span').textContent = 'lock_open';
            lockBtn.querySelector('.lock-text').textContent = 'ล็อค';
            showToast('ฟอร์มถูกปลดล็อคแล้ว', 'success');
        }
    }
    
    // --- Event Listeners ---
    document.addEventListener("DOMContentLoaded", () => {
        const mainContent = document.querySelector(SELECTORS.mainContent);
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const addRoomBtn = document.querySelector(SELECTORS.addRoomBtn);
        const addRoomFab = document.querySelector(SELECTORS.addRoomFab);
        const menuBtn = document.querySelector(SELECTORS.menuBtn);
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const clearBtn = document.querySelector(SELECTORS.clearBtn);
        const importBtn = document.querySelector(SELECTORS.importBtn);
        const exportBtn = document.querySelector(SELECTORS.exportBtn);
        const roomsEl = document.querySelector(SELECTORS.roomsContainer);
        
        addRoomBtn.onclick = () => addRoom();
        addRoomFab.onclick = () => addRoom();

        menuBtn.onclick = () => menuDropdown.classList.toggle('show');
        lockBtn.onclick = () => {
            const form = document.querySelector(SELECTORS.orderForm);
            form.dataset.locked = form.dataset.locked === 'true' ? 'false' : 'true';
            updateLockState();
            menuDropdown.classList.remove('show');
        };
        clearBtn.onclick = () => {
            showDialog('คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด?', 'ยืนยันการล้าง', () => {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            });
        };
        importBtn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = e => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = event => {
                    try {
                        const data = JSON.parse(event.target.result);
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                        location.reload();
                    } catch(err) {
                        showToast('ไฟล์ไม่ถูกต้อง', 'error');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
            menuDropdown.classList.remove('show');
        };
        exportBtn.onclick = () => {
            const payload = buildPayload();
            const jsonString = JSON.stringify(payload, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `marnthara-data-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            menuDropdown.classList.remove('show');
            showToast('ส่งออกข้อมูลเรียบร้อย', 'success');
        };

        // Close menu dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (menuDropdown && menuBtn && !menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
                menuDropdown.classList.remove('show');
            }
        });
        
        // Hide FAB on scroll
        let lastScrollTop = 0;
        window.addEventListener('scroll', () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            if (scrollTop > lastScrollTop) {
                addRoomFab.classList.remove('fab-show');
            } else {
                addRoomFab.classList.add('fab-show');
            }
            lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
        });

        orderForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const payload = buildPayload();
            document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
            showToast("กำลังส่งข้อมูล...", "success");
            // Optional: send data to a webhook
            // fetch(WEBHOOK_URL, {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(payload)
            // }).then(response => {
            //     if (response.ok) {
            //         showToast('ส่งข้อมูลสำเร็จ!', 'success');
            //     } else {
            //         showToast('เกิดข้อผิดพลาดในการส่งข้อมูล', 'error');
            //     }
            // }).catch(error => {
            //     console.error('Error:', error);
            //     showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
            // });
        });
        
        // Initial load
        window.addEventListener('load', () => {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                try {
                    const payload = JSON.parse(storedData);
                    document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                    document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                    document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
                    document.querySelector('textarea[name="notes"]').value = payload.notes || '';
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
            addRoomFab.classList.add('fab-show');
        });
    });
})();