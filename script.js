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
        fabricYardage: (style, w, h) => {
            let width = w, height = h;
            if (style === 'จีบ') width = width * 2;
            else if (style === 'ลอน') width = width * 2.5;
            else width = width * 1.5;
            return (width * height) * SQM_TO_SQYD / 0.9;
        },
        sheerYardage: (isSheer, w, h) => {
            if (!isSheer) return 0;
            return (w * h) * SQM_TO_SQYD / 0.9;
        },
        setPrice: (style, fabricPrice, sheerPrice, w, h, railMeter) => {
            let total = 0;
            const fabricYd = CALC.fabricYardage(style, w, h);
            const sheerYd = CALC.sheerYardage(true, w, h);
            total += Math.ceil(fabricYd) * fabricPrice;
            total += Math.ceil(sheerYd) * sheerPrice;
            total += railMeter * 150;
            total += PRICING.style_surcharge[style];
            return total;
        },
        wallpaperPrice: (height, rollPrice, widths) => {
            const wallArea = widths.reduce((sum, w) => sum + (w * height), 0);
            const numRolls = Math.ceil(wallArea / WALLPAPER_SQM_PER_ROLL);
            return numRolls * rollPrice;
        }
    };
    const SELECTORS = {
        orderForm: '#orderForm',
        rooms: '#rooms',
        roomTpl: '#roomTpl',
        setTpl: '#setTpl',
        decoTpl: '#decoTpl',
        wallpaperTpl: '#wallpaperTpl',
        wallTpl: '#wallTpl',
        addRoomHeaderBtn: '#addRoomHeaderBtn',
        copyJsonBtn: '#copyJsonBtn',
        copyTextBtn: '#copyTextBtn',
        clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn',
        confirmationModal: '#confirmationModal',
        copyOptionsModal: '#copyOptionsModal',
        totalPrice: '#totalPrice',
        totalSets: '#totalSets',
        totalRooms: '#totalRooms',
        totalFabricYd: '#totalFabricYd',
        totalSheerYd: '#totalSheerYd',
        totalRailMeter: '#totalRailMeter',
        toastContainer: '#toastContainer',
    };

    const orderForm = document.querySelector(SELECTORS.orderForm);
    const roomsEl = document.querySelector(SELECTORS.rooms);
    const roomTpl = document.querySelector(SELECTORS.roomTpl);
    const setTpl = document.querySelector(SELECTORS.setTpl);
    const decoTpl = document.querySelector(SELECTORS.decoTpl);
    const wallpaperTpl = document.querySelector(SELECTORS.wallpaperTpl);
    const wallTpl = document.querySelector(SELECTORS.wallTpl);
    const confirmationModal = document.querySelector(SELECTORS.confirmationModal);
    const copyOptionsModal = document.querySelector(SELECTORS.copyOptionsModal);
    let roomCount = 0;

    const toNum = (val) => parseFloat(val) || 0;
    const fmt = (num) => num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const showToast = (message, type = 'info') => {
        const container = document.querySelector('.toast-container') || (() => {
            const div = document.createElement('div');
            div.className = 'toast-container';
            document.body.appendChild(div);
            return div;
        })();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    };
    const showConfirmation = (message, onConfirm) => {
        const modal = document.querySelector(SELECTORS.confirmationModal);
        modal.querySelector('p').textContent = message;
        modal.style.display = 'flex';
        const confirmBtn = modal.querySelector('#confirmClear');
        const cancelBtn = modal.querySelector('#cancelClear');
        const handleConfirm = () => { onConfirm(); modal.style.display = 'none'; confirmBtn.removeEventListener('click', handleConfirm); };
        const handleCancel = () => { modal.style.display = 'none'; confirmBtn.removeEventListener('click', handleConfirm); };
        confirmBtn.addEventListener('click', handleConfirm, { once: true });
        cancelBtn.addEventListener('click', handleCancel, { once: true });
    };

    const addRoom = (payload = {}) => {
        const roomEl = roomTpl.content.cloneNode(true).firstElementChild;
        roomEl.dataset.roomIndex = ++roomCount;
        roomsEl.appendChild(roomEl);
        
        const nameField = roomEl.querySelector('input[name="room_name"]');
        const hasCurtainsCheckbox = roomEl.querySelector('input[name="hasCurtains"]');
        const curtainSetsContainer = roomEl.querySelector('[data-curtain-sets-container]');
        
        if (payload.room_name) nameField.value = payload.room_name;
        if (payload.hasCurtains === false) {
            hasCurtainsCheckbox.checked = false;
            curtainSetsContainer.style.display = 'none';
        }

        hasCurtainsCheckbox.addEventListener('change', () => {
            if (hasCurtainsCheckbox.checked) {
                curtainSetsContainer.style.display = 'block';
                if (roomEl.querySelectorAll('.set-item').length === 0) {
                    addSet(roomEl);
                }
            } else {
                curtainSetsContainer.style.display = 'none';
            }
            recalcAll();
        });

        if (payload.sets && payload.sets.length > 0) payload.sets.forEach(set => addSet(roomEl, set));
        else if (payload.hasCurtains !== false) addSet(roomEl);

        if (payload.decorations && payload.decorations.length > 0) payload.decorations.forEach(deco => addDeco(roomEl, deco));
        if (payload.wallpapers && payload.wallpapers.length > 0) payload.wallpapers.forEach(wallpaper => addWallpaper(roomEl, wallpaper));

        recalcAll();
        return roomEl;
    };
    const addSet = (roomEl, payload = {}) => {
        const setsContainer = roomEl.querySelector('[data-sets-container]');
        const setEl = setTpl.content.cloneNode(true).firstElementChild;
        setEl.dataset.setIndex = setsContainer.children.length + 1;
        setsContainer.appendChild(setEl);
        
        const inputs = setEl.querySelectorAll('input, select');
        inputs.forEach(input => {
            if (payload[input.name] !== undefined) {
                if (input.type === 'checkbox') input.checked = payload[input.name];
                else input.value = payload[input.name];
            }
            input.addEventListener('input', () => recalcAll());
        });
        recalcAll();
    };
    const addDeco = (roomEl, payload = {}) => {
        const decoContainer = roomEl.querySelector('[data-deco-container]');
        const decoEl = decoTpl.content.cloneNode(true).firstElementChild;
        decoEl.dataset.decoItemIndex = decoContainer.children.length + 1;
        decoContainer.appendChild(decoEl);
        
        const inputs = decoEl.querySelectorAll('input');
        inputs.forEach(input => {
            if (payload[input.name]) input.value = payload[input.name];
            input.addEventListener('input', () => recalcAll());
        });
        recalcAll();
    };
    const addWallpaper = (roomEl, payload = {}) => {
        const wallpaperContainer = roomEl.querySelector('[data-wallpaper-container]');
        const wallpaperEl = wallpaperTpl.content.cloneNode(true).firstElementChild;
        wallpaperEl.dataset.wallpaperItemIndex = wallpaperContainer.children.length + 1;
        wallpaperContainer.appendChild(wallpaperEl);
        
        const inputs = wallpaperEl.querySelectorAll('input');
        inputs.forEach(input => {
            if (payload[input.name]) input.value = payload[input.name];
            input.addEventListener('input', () => recalcAll());
        });
        
        const wallsContainer = wallpaperEl.querySelector('[data-walls-container]');
        if (payload.walls && payload.walls.length > 0) {
            payload.walls.forEach(wallWidth => addWall(wallsContainer, wallWidth));
        } else {
            addWall(wallsContainer);
        }
        recalcAll();
    };
    const addWall = (wallsContainer, wallWidth = '') => {
        const wallEl = wallTpl.content.cloneNode(true).firstElementChild;
        const widthInput = wallEl.querySelector('input');
        widthInput.value = wallWidth;
        wallsContainer.appendChild(wallEl);
        widthInput.addEventListener('input', () => recalcAll());
    };
    const delRoom = (btn) => btn.closest('.room').remove();
    const delSet = (btn) => btn.closest('.set-item').remove();
    const delDeco = (btn) => btn.closest('.deco-item').remove();
    const delWallpaper = (btn) => btn.closest('.wallpaper-item').remove();
    const delWall = (btn) => btn.closest('.wall-input-row').remove();
    const recalcAll = () => {
        let totalPrice = 0;
        let totalSets = 0;
        let totalRooms = roomsEl.children.length;
        let totalFabricYd = 0;
        let totalSheerYd = 0;
        let totalRailMeter = 0;

        document.querySelectorAll('.room').forEach(roomEl => {
            const hasCurtainsCheckbox = roomEl.querySelector('input[name="hasCurtains"]');
            const hasCurtains = hasCurtainsCheckbox ? hasCurtainsCheckbox.checked : true;
            let roomPrice = 0;
            let roomFabricYd = 0;
            let roomSheerYd = 0;

            if (hasCurtains) {
                roomEl.querySelectorAll('.set-item').forEach(setEl => {
                    const width_m = toNum(setEl.querySelector('input[name="width_m"]').value);
                    const height_m = toNum(setEl.querySelector('input[name="height_m"]').value);
                    const fabric_price = toNum(setEl.querySelector('input[name="fabric_price"]').value);
                    const sheer_price = toNum(setEl.querySelector('input[name="sheer_price"]').value);
                    const curtain_style = setEl.querySelector('select[name="curtain_style"]').value;
                    const rail_meter = toNum(setEl.querySelector('input[name="rail_meter"]').value);
                    const isSheer = setEl.querySelector('input[name="isSheer"]').checked;
                    const isSuspended = setEl.querySelector('input[name="isSuspended"]').checked;

                    if (!isSuspended) {
                        const fabricYd = CALC.fabricYardage(curtain_style, width_m, height_m);
                        const sheerYd = isSheer ? CALC.sheerYardage(isSheer, width_m, height_m) : 0;
                        const price = (Math.ceil(fabricYd) * fabric_price) + (Math.ceil(sheerYd) * sheer_price) + (rail_meter * 150) + PRICING.style_surcharge[curtain_style];

                        setEl.querySelector('.set-summary .price:nth-child(1)').textContent = fmt(price);
                        setEl.querySelector('.set-summary .price:nth-child(2)').textContent = fmt(fabricYd);
                        setEl.querySelector('.set-summary .price:nth-child(3)').textContent = fmt(sheerYd);

                        roomPrice += price;
                        roomFabricYd += fabricYd;
                        roomSheerYd += sheerYd;
                        totalSets++;
                    }
                });
            }

            roomEl.querySelectorAll('.deco-item').forEach(decoEl => {
                const price = toNum(decoEl.querySelector('input[name="deco_price"]').value);
                roomPrice += price;
            });
            roomEl.querySelectorAll('.wallpaper-item').forEach(wallpaperEl => {
                const height = toNum(wallpaperEl.querySelector('input[name="wallpaper_height_m"]').value);
                const rollPrice = toNum(wallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value);
                const wallWidths = Array.from(wallpaperEl.querySelectorAll('input[name="wall_width_m"]')).map(input => toNum(input.value));
                
                const wallArea = wallWidths.reduce((sum, w) => sum + (w * height), 0);
                const numRolls = Math.ceil(wallArea / WALLPAPER_SQM_PER_ROLL);
                const price = numRolls * rollPrice;
                
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-child(1)').textContent = fmt(price);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-child(2)').textContent = fmt(wallArea);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-child(3)').textContent = numRolls;
                
                roomPrice += price;
            });

            roomEl.querySelector('.room-summary .price:nth-child(1)').textContent = fmt(roomPrice);
            roomEl.querySelector('.room-summary .price:nth-child(2)').textContent = fmt(roomFabricYd);
            roomEl.querySelector('.room-summary .price:nth-child(3)').textContent = fmt(roomSheerYd);

            totalPrice += roomPrice;
            totalFabricYd += roomFabricYd;
            totalSheerYd += roomSheerYd;
        });

        document.querySelector(SELECTORS.totalPrice).textContent = fmt(totalPrice);
        document.querySelector(SELECTORS.totalSets).textContent = totalSets;
        document.querySelector(SELECTORS.totalRooms).textContent = totalRooms;
        document.querySelector(SELECTORS.totalFabricYd).textContent = fmt(totalFabricYd);
        document.querySelector(SELECTORS.totalSheerYd).textContent = fmt(totalSheerYd);
        // Recalculate and update total rail meter
        totalRailMeter = 0;
        document.querySelectorAll('.set-item').forEach(setEl => {
            const isSuspended = setEl.querySelector('input[name="isSuspended"]').checked;
            const railMeter = toNum(setEl.querySelector('input[name="rail_meter"]').value);
            if (!isSuspended) {
                totalRailMeter += railMeter;
            }
        });
        document.querySelector(SELECTORS.totalRailMeter).textContent = fmt(totalRailMeter);
        saveData();
    };
    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            rooms: []
        };
        document.querySelectorAll('.room').forEach(roomEl => {
            const hasCurtainsCheckbox = roomEl.querySelector('input[name="hasCurtains"]');
            const hasCurtains = hasCurtainsCheckbox ? hasCurtainsCheckbox.checked : true;
            const roomData = {
                room_name: roomEl.querySelector('input[name="room_name"]').value,
                hasCurtains: hasCurtains,
                sets: [],
                decorations: [],
                wallpapers: []
            };
            if (hasCurtains) {
                roomEl.querySelectorAll('.set-item').forEach(setEl => {
                    const set = {
                        width_m: toNum(setEl.querySelector('input[name="width_m"]').value),
                        height_m: toNum(setEl.querySelector('input[name="height_m"]').value),
                        fabric_price: toNum(setEl.querySelector('input[name="fabric_price"]').value),
                        sheer_price: toNum(setEl.querySelector('input[name="sheer_price"]').value),
                        curtain_style: setEl.querySelector('select[name="curtain_style"]').value,
                        rail_meter: toNum(setEl.querySelector('input[name="rail_meter"]').value),
                        isSheer: setEl.querySelector('input[name="isSheer"]').checked,
                        isSuspended: setEl.querySelector('input[name="isSuspended"]').checked,
                    };
                    roomData.sets.push(set);
                });
            }
            roomEl.querySelectorAll('.deco-item').forEach(decoEl => {
                const deco = {
                    deco_name: decoEl.querySelector('input[name="deco_name"]').value,
                    deco_price: toNum(decoEl.querySelector('input[name="deco_price"]').value),
                };
                roomData.decorations.push(deco);
            });
            roomEl.querySelectorAll('.wallpaper-item').forEach(wallpaperEl => {
                const wallpaper = {
                    wallpaper_name: wallpaperEl.querySelector('input[name="wallpaper_name"]').value,
                    wallpaper_code: wallpaperEl.querySelector('input[name="wallpaper_code"]').value,
                    wallpaper_height_m: toNum(wallpaperEl.querySelector('input[name="wallpaper_height_m"]').value),
                    wallpaper_price_roll: toNum(wallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value),
                    walls: Array.from(wallpaperEl.querySelectorAll('input[name="wall_width_m"]')).map(input => toNum(input.value))
                };
                roomData.wallpapers.push(wallpaper);
            });
            payload.rooms.push(roomData);
        });
        return payload;
    };
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            showToast('คัดลอกสำเร็จ!', 'success');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToast('คัดลอกไม่สำเร็จ!', 'error');
        });
    };
    const formatPayloadAsText = (payload, includeCustomerInfo) => {
        let text = '';
        if (includeCustomerInfo) {
            text += `ลูกค้า: ${payload.customer_name}\n`;
            text += `ที่อยู่: ${payload.customer_address}\n`;
            text += `เบอร์โทร: ${payload.customer_phone}\n\n`;
        }
        payload.rooms.forEach(room => {
            text += `--- ${room.room_name || 'ห้อง'} ---\n`;
            if (room.hasCurtains && room.sets.length > 0) {
                room.sets.forEach((set, i) => {
                    const price = CALC.setPrice(set.curtain_style, set.fabric_price, set.sheer_price, set.width_m, set.height_m, set.rail_meter);
                    text += `\nจุดที่ ${i + 1}: ${set.curtain_style} (กว้าง ${set.width_m} ม. x สูง ${set.height_m} ม.)\n`;
                    text += `• ผ้าหลัก: ${set.fabric_price} บ. (${fmt(CALC.fabricYardage(set.curtain_style, set.width_m, set.height_m))} หลา)\n`;
                    if (set.isSheer) text += `• ผ้าโปร่ง: ${set.sheer_price} บ. (${fmt(CALC.sheerYardage(true, set.width_m, set.height_m))} หลา)\n`;
                    text += `• ราง: ${set.rail_meter} ม.\n`;
                    text += `• ราคา: ${fmt(price)} บ.\n`;
                });
            } else if (!room.hasCurtains) {
                text += "ไม่มีผ้าม่านในห้องนี้\n";
            }
            if (room.decorations.length > 0) {
                text += `\nรายการตกแต่ง:\n`;
                room.decorations.forEach(deco => {
                    text += `• ${deco.deco_name}: ${fmt(deco.deco_price)} บ.\n`;
                });
            }
            if (room.wallpapers.length > 0) {
                text += `\nวอลเปเปอร์:\n`;
                room.wallpapers.forEach(wallpaper => {
                    const price = CALC.wallpaperPrice(wallpaper.wallpaper_height_m, wallpaper.wallpaper_price_roll, wallpaper.walls);
                    const wallArea = wallpaper.walls.reduce((sum, w) => sum + (w * wallpaper.wallpaper_height_m), 0);
                    const numRolls = Math.ceil(wallArea / WALLPAPER_SQM_PER_ROLL);
                    text += `• ${wallpaper.wallpaper_name} (${wallpaper.wallpaper_code}) ${fmt(wallpaper.wallpaper_height_m)}ม. x ${wallpaper.walls.join('ม. + ')}ม.\n`;
                    text += `  ราคา: ${fmt(price)} บ. • พื้นที่: ${fmt(wallArea)} ตร.ม. • ใช้ ${numRolls} ม้วน\n`;
                });
            }
            const roomTotal = room.sets.reduce((sum, set) => sum + CALC.setPrice(set.curtain_style, set.fabric_price, set.sheer_price, set.width_m, set.height_m, set.rail_meter), 0)
                            + room.decorations.reduce((sum, deco) => sum + deco.deco_price, 0)
                            + room.wallpapers.reduce((sum, wallpaper) => sum + CALC.wallpaperPrice(wallpaper.wallpaper_height_m, wallpaper.wallpaper_price_roll, wallpaper.walls), 0);
            text += `\nยอดรวมห้อง: ${fmt(roomTotal)} บ.\n\n`;
        });
        const total = payload.rooms.reduce((sum, room) => sum + (room.sets.reduce((s, set) => s + CALC.setPrice(set.curtain_style, set.fabric_price, set.sheer_price, set.width_m, set.height_m, set.rail_meter), 0) + room.decorations.reduce((s, deco) => s + deco.deco_price, 0) + room.wallpapers.reduce((s, wallpaper) => s + CALC.wallpaperPrice(wallpaper.wallpaper_height_m, wallpaper.wallpaper_price_roll, wallpaper.walls), 0)), 0);
        text += `\n===============`;
        text += `\nราคารวมทั้งหมด: ${fmt(total)} บ.`;
        return text;
    };
    const saveData = () => {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.error("Failed to save data to localStorage", e);
        }
    };
    const clearAllData = () => {
        showConfirmation("คุณต้องการล้างข้อมูลทั้งหมดใช่ไหม?", () => {
            localStorage.removeItem(STORAGE_KEY);
            roomsEl.innerHTML = "";
            roomCount = 0;
            addRoom();
            recalcAll();
        });
    };
    const toggleLock = () => {
        const isLocked = document.querySelector('#lockBtn').classList.toggle('locked');
        const fields = document.querySelectorAll('#orderForm input, #orderForm select, #orderForm textarea, #orderForm button:not(#lockBtn)');
        fields.forEach(field => {
            field.disabled = isLocked;
        });
        document.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        document.querySelector('.lock-icon').textContent = isLocked ? '🔓' : '🔒';
    };

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const act = btn.dataset.act;
        const actions = {
            'add-room': addRoom, 'add-set': addSet, 'add-deco': addDeco, 'add-wallpaper': addWallpaper, 'add-wall': addWall,
            'del-room': delRoom, 'del-set': delSet, 'del-deco': delDeco, 'del-wallpaper': delWallpaper, 'del-wall': delWall
        };
        if (actions[act]) actions[act](btn.closest('.room') || btn.closest('.wallpaper-item') || btn.closest('.walls-section') || btn);
        else if (btn.id === "addRoomHeaderBtn") addRoom();
        else if (btn.id === "clearAllBtn") clearAllData();
        else if (btn.id === "lockBtn") toggleLock();
        else if (btn.id === "copyJsonBtn") copyToClipboard(JSON.stringify(buildPayload(), null, 2));
        else if (btn.id === "copyTextBtn") {
            const modal = document.querySelector(SELECTORS.copyOptionsModal);
            modal.style.display = 'flex';
            document.querySelector('#copyFullText').addEventListener('click', () => { copyToClipboard(formatPayloadAsText(buildPayload(), true)); modal.style.display = 'none'; });
            document.querySelector('#copyDetailsOnly').addEventListener('click', () => { copyToClipboard(formatPayloadAsText(buildPayload(), false)); modal.style.display = 'none'; });
            document.querySelector('#cancelCopy').addEventListener('click', () => modal.style.display = 'none');
        }
    });

    orderForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const payload = buildPayload();
        fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(response => {
            if (response.ok) showToast('ข้อมูลถูกส่งเรียบร้อยแล้ว!', 'success');
            else showToast('การส่งข้อมูลไม่สำเร็จ!', 'error');
        }).catch(error => {
            console.error('Error:', error);
            showToast('เกิดข้อผิดพลาดในการส่งข้อมูล!', 'error');
        });
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
                if (payload.rooms && payload.rooms.length > 0) {
                    payload.rooms.forEach(room => addRoom(room));
                } else {
                    addRoom();
                }
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY); addRoom();
            }
        } else {
// ในฟังก์ชัน addRoom()
const hasCurtainsCheckbox = roomEl.querySelector('input[name="hasCurtains"]');
const curtainSetsContainer = roomEl.querySelector('[data-curtain-sets-container]');
if (hasCurtainsCheckbox) {
    hasCurtainsCheckbox.addEventListener('change', () => {
        if (hasCurtainsCheckbox.checked) {
            curtainSetsContainer.style.display = 'block';
        } else {
            curtainSetsContainer.style.display = 'none';
        }
        recalcAll();
    });
}

// ในฟังก์ชัน recalcAll()
rooms.forEach(room => {
    const hasCurtainsCheckbox = room.element.querySelector('input[name="hasCurtains"]');
    if (hasCurtainsCheckbox && hasCurtainsCheckbox.checked) {
        // ... โค้ดคำนวณผ้าม่านเดิม ...
    }
});
        }
        recalcAll();
    });

})();