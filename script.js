(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper-improved";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;

    // คำแนะนำ: PRICING object ควรย้ายไปเก็บในไฟล์ JSON หรือ API
    // เพื่อให้การอัปเดตราคาทำได้ง่ายขึ้นโดยไม่ต้องแก้ไขโค้ด
    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };
    const CALC = {
        // แก้ไขสูตรการคำนวณผ้าให้แม่นยำขึ้น (1 หลา = 0.9144 เมตร)
        fabricYardage: (width, height, isBlackout = true) => {
            const height_yd = height / 0.9144;
            let fabric_length = 0;
            if (isBlackout) fabric_length = (width * 2.0 + 0.6) / 0.9144;
            else fabric_length = (width * 2.6 + 0.6) / 0.9144;
            return Math.ceil(fabric_length);
        },
        calculateWallpaperRolls: (height_m, walls_m) => {
            if (height_m <= 0 || walls_m.length === 0) return 0;
            const roll_width_m = 0.53;
            const roll_length_m = 10.0;
            let total_rolls = 0;
            let total_area = 0;

            for (const wall_width of walls_m) {
                if (wall_width > 0) {
                    const number_of_strips = Math.ceil(wall_width / roll_width_m);
                    const total_strip_length = number_of_strips * (height_m + 0.1); //เผื่อตัด 10 ซม.
                    const rolls_for_wall = Math.ceil(total_strip_length / roll_length_m);
                    total_rolls += rolls_for_wall;
                    total_area += wall_width * height_m;
                }
            }
            return { rolls: total_rolls, area: total_area };
        },
        calculateSummary: (payload) => {
            let total = 0;
            if (payload && payload.rooms) {
                payload.rooms.forEach(room => {
                    total += room.total_price || 0;
                });
            }
            return { total };
        },
    };
    const SELECTORS = {
        app: '.app', roomList: '#rooms', roomTpl: '#roomTpl',
        curtainTpl: '#curtainTpl', wallpaperTpl: '#wallpaperTpl', otherTpl: '#otherTpl',
        summaryContainer: '#summary', toastContainer: '#toastContainer',
        orderForm: '#orderForm', payloadInput: '#payloadInput',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown',
        copyBtn: '#copyBtn', exportBtn: '#exportBtn', importBtn: '#importBtn',
        lockBtn: '#lockBtn'
    };
    const ELEMENTS = {};
    for (const key in SELECTORS) ELEMENTS[key] = document.querySelector(SELECTORS[key]);
    let roomCount = 0;
    const update = debounce(() => {
        const payload = buildPayload();
        updateSummary(payload);
        if (isLocked) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn("Could not save to localStorage.", e);
        }
    }, 500);
    function debounce(func, timeout = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => { func.apply(this, args); }, timeout);
        };
    }
    function updateRoomNumbers() {
        document.querySelectorAll('.room-card').forEach((roomCard, index) => {
            roomCard.querySelector('.room-number').textContent = index + 1;
        });
    }
    function addRoom(roomData = null) {
        const roomTpl = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        const roomCard = roomTpl.querySelector('.room-card');
        const roomId = `room-${Date.now()}`;
        roomCard.setAttribute('data-room-id', roomId);
        ELEMENTS.roomList.appendChild(roomTpl);
        if (roomData) {
            updateRoomCard(roomCard, roomData);
        }
        updateRoomNumbers();
        roomCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
        setupEventListeners(roomCard);
        update();
    }
    function addCurtain(roomCard, curtainData = null) {
        const curtainTpl = document.querySelector(SELECTORS.curtainTpl).content.cloneNode(true);
        const curtainCard = curtainTpl.querySelector('.sub-card');
        const itemId = `item-${Date.now()}`;
        curtainCard.setAttribute('data-item-id', itemId);
        roomCard.querySelector('[data-room-items]').appendChild(curtainTpl);
        if (curtainData) {
            updateCurtainCard(curtainCard, curtainData);
        }
        setupEventListeners(curtainCard);
        update();
    }
    function addWallpaper(roomCard, wallpaperData = null) {
        const wallpaperTpl = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        const wallpaperCard = wallpaperTpl.querySelector('.sub-card');
        const itemId = `item-${Date.now()}`;
        wallpaperCard.setAttribute('data-item-id', itemId);
        roomCard.querySelector('[data-room-items]').appendChild(wallpaperTpl);
        if (wallpaperData) {
            updateWallpaperCard(wallpaperCard, wallpaperData);
        }
        setupEventListeners(wallpaperCard);
        update();
    }
    function addOther(roomCard, otherData = null) {
        const otherTpl = document.querySelector(SELECTORS.otherTpl).content.cloneNode(true);
        const otherCard = otherTpl.querySelector('.sub-card');
        const itemId = `item-${Date.now()}`;
        otherCard.setAttribute('data-item-id', itemId);
        roomCard.querySelector('[data-room-items]').appendChild(otherTpl);
        if (otherData) {
            updateOtherCard(otherCard, otherData);
        }
        setupEventListeners(otherCard);
        update();
    }
    function setupEventListeners(container) {
        container.querySelectorAll('input, select, textarea').forEach(el => el.addEventListener('input', update));
        container.addEventListener('click', (e) => {
            const act = e.target.getAttribute('data-act');
            const roomCard = e.target.closest('.room-card');
            const subCard = e.target.closest('.sub-card');
            if (act === 'del-room') {
                if (confirm('คุณต้องการลบห้องนี้หรือไม่?')) { roomCard.remove(); updateRoomNumbers(); update(); }
            } else if (act === 'del-curtain' || act === 'del-wallpaper' || act === 'del-other') {
                if (confirm('คุณต้องการลบรายการนี้หรือไม่?')) { subCard.remove(); update(); }
            } else if (act === 'add-curtain') {
                addCurtain(roomCard);
            } else if (act === 'add-wallpaper') {
                addWallpaper(roomCard);
            } else if (act === 'add-other') {
                addOther(roomCard);
            } else if (act === 'add-wall') {
                const wallsContainer = subCard.querySelector('[data-walls-container]');
                const wallTpl = document.querySelector('#wallTpl').content.cloneNode(true);
                wallsContainer.appendChild(wallTpl);
                setupEventListeners(wallsContainer);
                update();
            } else if (act === 'del-wall') {
                e.target.closest('.wall-input-row').remove();
                update();
            }
        });
    }
    function buildPayload() {
        const rooms = [];
        document.querySelectorAll('.room-card').forEach(roomCard => {
            const room = {};
            room.name = roomCard.querySelector('.room-title-label').textContent;
            room.items = [];
            room.total_price = 0;
            roomCard.querySelectorAll('.sub-card').forEach(itemCard => {
                const item = {};
                const nameField = itemCard.querySelector('input[name*="_name"]');
                item.name = nameField ? nameField.value : 'ไม่ระบุ';
                const type = itemCard.getAttribute('data-item-id').startsWith('item') ? 'curtain' : 'other';
                if (type === 'curtain') {
                    const width_m = parseFloat(itemCard.querySelector('input[name="curtain_width_m"]').value) || 0;
                    const height_m = parseFloat(itemCard.querySelector('input[name="curtain_height_m"]').value) || 0;
                    const price_yard = parseFloat(itemCard.querySelector('input[name="curtain_price_yard"]').value) || 0;
                    const price_track = parseFloat(itemCard.querySelector('input[name="curtain_price_track"]').value) || 0;
                    const yarn_yardage = CALC.fabricYardage(width_m, height_m);
                    const total_price = (yarn_yardage * price_yard) + (width_m * price_track);
                    item.type = 'ผ้าม่าน';
                    item.width_m = width_m;
                    item.height_m = height_m;
                    item.price_yard = price_yard;
                    item.price_track = price_track;
                    item.yarn_yardage = yarn_yardage;
                    item.total_price = total_price;
                    room.total_price += total_price;
                } else if (item.name.includes("วอลเปเปอร์") || itemCard.querySelector('input[name="wallpaper_height_m"]')) {
                    const height_m = parseFloat(itemCard.querySelector('input[name="wallpaper_height_m"]').value) || 0;
                    const price_roll = parseFloat(itemCard.querySelector('input[name="wallpaper_price_roll"]').value) || 0;
                    const walls = Array.from(itemCard.querySelectorAll('input[name="wall_width_m"]')).map(el => parseFloat(el.value) || 0);
                    const { rolls, area } = CALC.calculateWallpaperRolls(height_m, walls);
                    const total_price = rolls * price_roll;
                    item.type = 'วอลเปเปอร์';
                    item.height_m = height_m;
                    item.price_roll = price_roll;
                    item.walls_m = walls;
                    item.total_rolls = rolls;
                    item.total_area = area;
                    item.total_price = total_price;
                    room.total_price += total_price;
                } else {
                    const qty = parseFloat(itemCard.querySelector('input[name="other_qty"]').value) || 0;
                    const price = parseFloat(itemCard.querySelector('input[name="other_price"]').value) || 0;
                    const total_price = qty * price;
                    item.type = 'รายการอื่น';
                    item.qty = qty;
                    item.price = price;
                    item.total_price = total_price;
                    room.total_price += total_price;
                }
                room.items.push(item);
            });
            rooms.push(room);
        });
        return {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_location: document.querySelector('input[name="customer_location"]').value,
            customer_note: document.querySelector('textarea[name="customer_note"]').value,
            rooms: rooms,
            app_version: APP_VERSION,
        };
    }
    function updateSummary(payload) {
        const summary = CALC.calculateSummary(payload);
        ELEMENTS.summaryContainer.innerHTML = `ราคาผ้าม่านและวอลเปเปอร์รวมทั้งหมด: <span class="price">${summary.total.toLocaleString()}</span> บ.`;
    }
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.classList.add('toast', type);
        toast.textContent = message;
        ELEMENTS.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    function copyToClipboard() {
        const payload = buildPayload();
        const jsonStr = JSON.stringify(payload, null, 2);
        navigator.clipboard.writeText(jsonStr)
            .then(() => showToast('คัดลอกข้อมูล JSON เรียบร้อยแล้ว!', 'success'))
            .catch(err => showToast('ไม่สามารถคัดลอกได้: ' + err, 'danger'));
    }
    function handleFileImport(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const payload = JSON.parse(e.target.result);
                loadPayload(payload);
                showToast('นำเข้าข้อมูลเรียบร้อยแล้ว!', 'success');
            } catch (err) {
                showToast('ไฟล์ JSON ไม่ถูกต้อง!', 'danger');
            }
        };
        reader.readAsText(file);
    }
    function loadPayload(payload) {
        document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
        document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
        document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
        document.querySelector('input[name="customer_location"]').value = payload.customer_location || '';
        document.querySelector('textarea[name="customer_note"]').value = payload.customer_note || '';
        ELEMENTS.roomList.innerHTML = "";
        if (payload.rooms && payload.rooms.length > 0) {
            payload.rooms.forEach(addRoom);
        } else {
            addRoom();
        }
        update();
    }
    function updateRoomCard(roomCard, roomData) {
        roomCard.querySelector('.room-title-label').textContent = roomData.name;
        if (roomData.items) {
            roomData.items.forEach(itemData => {
                if (itemData.type === 'ผ้าม่าน') {
                    addCurtain(roomCard, itemData);
                } else if (itemData.type === 'วอลเปเปอร์') {
                    addWallpaper(roomCard, itemData);
                } else if (itemData.type === 'รายการอื่น') {
                    addOther(roomCard, itemData);
                }
            });
        }
    }
    function updateCurtainCard(curtainCard, itemData) {
        curtainCard.querySelector('input[name="curtain_name"]').value = itemData.name;
        curtainCard.querySelector('input[name="curtain_width_m"]').value = itemData.width_m;
        curtainCard.querySelector('input[name="curtain_height_m"]').value = itemData.height_m;
        curtainCard.querySelector('input[name="curtain_price_yard"]').value = itemData.price_yard;
        curtainCard.querySelector('input[name="curtain_price_track"]').value = itemData.price_track;
    }
    function updateWallpaperCard(wallpaperCard, itemData) {
        wallpaperCard.querySelector('input[name="wallpaper_name"]').value = itemData.name;
        wallpaperCard.querySelector('input[name="wallpaper_height_m"]').value = itemData.height_m;
        wallpaperCard.querySelector('input[name="wallpaper_price_roll"]').value = itemData.price_roll;
        const wallsContainer = wallpaperCard.querySelector('[data-walls-container]');
        wallsContainer.innerHTML = '';
        if (itemData.walls_m) {
            itemData.walls_m.forEach(wall_width => {
                const wallTpl = document.querySelector('#wallTpl').content.cloneNode(true);
                const input = wallTpl.querySelector('input');
                input.value = wall_width;
                wallsContainer.appendChild(wallTpl);
            });
        }
    }
    function updateOtherCard(otherCard, itemData) {
        otherCard.querySelector('input[name="other_name"]').value = itemData.name;
        otherCard.querySelector('input[name="other_qty"]').value = itemData.qty;
        otherCard.querySelector('input[name="other_price"]').value = itemData.price;
    }
    let isLocked = false;
    function updateLockState() {
        isLocked = !isLocked;
        const formElements = ELEMENTS.orderForm.querySelectorAll('input, select, textarea');
        const lockTextEl = ELEMENTS.lockBtn.querySelector('.lock-text');
        const unlockTextEl = ELEMENTS.lockBtn.querySelector('.unlock-text');
        formElements.forEach(el => el.disabled = isLocked);
        if (isLocked) {
            lockTextEl.classList.add('hidden');
            unlockTextEl.classList.remove('hidden');
            showToast("ล็อกการแก้ไข", "info");
        } else {
            lockTextEl.classList.remove('hidden');
            unlockTextEl.classList.add('hidden');
            showToast("ปลดล็อกการแก้ไข", "info");
        }
        update();
    }
    // ใช้ Fetch API เพื่อส่งข้อมูลแทนการใช้ iframe
    async function submitFormWithFetch(e) {
        e.preventDefault();
        const payload = buildPayload();
        showToast("กำลังส่งข้อมูล...", "info");
        try {
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                showToast("ส่งข้อมูลสำเร็จ!", "success");
            } else {
                showToast(`ส่งข้อมูลไม่สำเร็จ: ${response.statusText}`, "danger");
            }
        } catch (error) {
            showToast(`เกิดข้อผิดพลาดในการส่งข้อมูล: ${error.message}`, "danger");
        }
    }
    document.addEventListener('DOMContentLoaded', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                loadPayload(payload);
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY); addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
        ELEMENTS.menuBtn.addEventListener('click', () => ELEMENTS.menuDropdown.classList.toggle('show'));
        document.addEventListener('click', (e) => {
            const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
            if (!menuDropdown.contains(e.target) && !document.querySelector(SELECTORS.menuBtn).contains(e.target)) {
                menuDropdown.classList.remove('show');
            }
        });
        ELEMENTS.copyBtn.addEventListener('click', copyToClipboard);
        ELEMENTS.exportBtn.addEventListener('click', () => {
            const payload = buildPayload();
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `marnthara_data_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('ส่งออกข้อมูล JSON เรียบร้อยแล้ว!', 'success');
        });
        ELEMENTS.importBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.onchange = (e) => handleFileImport(e.target.files[0]);
            input.click();
        });
        ELEMENTS.lockBtn.addEventListener('click', updateLockState);
        ELEMENTS.orderForm.addEventListener("submit", submitFormWithFetch);
        document.getElementById('addRoomHeaderBtn').addEventListener('click', () => addRoom());
    });
})();