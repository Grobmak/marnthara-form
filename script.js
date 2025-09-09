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
        fabricYardage: (style, width, has_sheer) => {
            let multiplier = 2.5;
            if (style === 'ลอน') multiplier = 3.0;
            if (style === 'ตาไก่') multiplier = 2.0;
            if (style === 'จีบ') multiplier = 2.0;
            return parseFloat(width) * multiplier * (has_sheer ? 2 : 1);
        },
        curtainPrice: (fabric_price, sheer_price, style, width, height, has_rail, rail_length, has_lace, fabric_type) => {
            let total = 0;
            let totalFabricYardage = 0;
            let totalSheerYardage = 0;

            const fabricTypes = fabric_type.split('&').map(t => t.trim());
            
            if (fabricTypes.includes('ทึบ')) {
                const fabricYardage = CALC.fabricYardage(style, width, false);
                const fabricSubtotal = fabricYardage * parseFloat(fabric_price);
                totalFabricYardage += fabricYardage;
                total += fabricSubtotal;
            }

            if (fabricTypes.includes('โปร่ง')) {
                const sheerYardage = CALC.fabricYardage(style, width, false);
                const sheerSubtotal = sheerYardage * parseFloat(sheer_price || fabric_price);
                totalSheerYardage += sheerYardage;
                total += sheerSubtotal;
            }

            // Additional charges based on height
            let height_surcharge = 0;
            for (const h of PRICING.height) {
                if (height > h.threshold) {
                    height_surcharge += (height - h.threshold) * h.add_per_m;
                }
            }
            total += height_surcharge;

            // Style surcharge
            const style_surcharge = PRICING.style_surcharge[style] || 0;
            total += style_surcharge;

            // Rail and Lace
            if (has_rail) total += parseFloat(rail_length) * 500;
            if (has_lace) total += parseFloat(width) * 150;
            
            return {
                price: Math.round(total),
                fabric_yardage: totalFabricYardage,
                sheer_yardage: totalSheerYardage
            };
        },
        decorationPrice: (width, height, price_sqyd) => {
            const sqyd = parseFloat(width) * parseFloat(height) * SQM_TO_SQYD;
            const price = sqyd * parseFloat(price_sqyd);
            return { price: Math.round(price), sqyd: sqyd };
        },
        wallpaperPrice: (height, wall_widths, price_roll) => {
            const totalWidth = wall_widths.reduce((sum, w) => sum + parseFloat(w), 0);
            const totalArea = totalWidth * parseFloat(height);
            const numRolls = Math.ceil(totalArea / WALLPAPER_SQM_PER_ROLL);
            const price = numRolls * parseFloat(price_roll);
            return { price: Math.round(price), area: totalArea, rolls: numRolls };
        }
    };
    
    const SELECTORS = {
        orderForm: '#orderForm',
        roomsEl: '#roomsEl',
        addRoomHeaderBtn: '#addRoomHeaderBtn',
        lockBtn: '#lockBtn',
        clearAllBtn: '#clearAllBtn',
        payloadInput: 'input[name="payload"]',
        curtainSumEl: '#curtain_sum_el',
        decorationSumEl: '#decoration_sum_el',
        wallpaperSumEl: '#wallpaper_sum_el',
        totalSumEl: '#total_sum_el',
        toastContainer: '#toastContainer',
    };

    let roomsEl = document.querySelector(SELECTORS.roomsEl);
    let roomCount = 0;
    let isLocked = false;
    let isFirstLoad = true;
    let lastSavedPayload = null;

    // --- PWA Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then((registration) => {
                    console.log('Service Worker registered with scope:', registration.scope);
                }, (err) => {
                    console.error('Service Worker registration failed:', err);
                });
        });
    }

    // --- Core Functions ---
    const buildPayload = () => {
        const payload = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            rooms: [],
        };
        document.querySelectorAll('.room-container').forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector('input[name="room_name"]').value,
                curtains: [],
                decorations: [],
                wallpapers: [],
            };

            roomEl.querySelectorAll('[data-curtain-point]').forEach(curtainEl => {
                roomData.curtains.push({
                    width: curtainEl.querySelector('input[name="curtain_width_m"]').value,
                    height: curtainEl.querySelector('input[name="curtain_height_m"]').value,
                    fabric_type: curtainEl.querySelector('select[name="fabric_type"]').value,
                    fabric_price: curtainEl.querySelector('input[name="fabric_price"]').value,
                    sheer_price: curtainEl.querySelector('input[name="sheer_price"]') ? curtainEl.querySelector('input[name="sheer_price"]').value : null,
                    style: curtainEl.querySelector('select[name="curtain_style"]').value,
                    rail_length: curtainEl.querySelector('input[name="rail_length_m"]').value,
                    has_rail: curtainEl.querySelector('input[name="has_rail"]').checked,
                    has_lace: curtainEl.querySelector('input[name="has_lace"]').checked,
                });
            });

            roomEl.querySelectorAll('[data-decoration-point]').forEach(decorationEl => {
                roomData.decorations.push({
                    name: decorationEl.querySelector('input[name="decoration_name"]').value,
                    width: decorationEl.querySelector('input[name="decoration_width_m"]').value,
                    height: decorationEl.querySelector('input[name="decoration_height_m"]').value,
                    price_sqyd: decorationEl.querySelector('input[name="decoration_price_sqyd"]').value,
                });
            });

            roomEl.querySelectorAll('[data-wallpaper-point]').forEach(wallpaperEl => {
                const walls = [];
                wallpaperEl.querySelectorAll('input[name="wall_width_m"]').forEach(wallInput => walls.push(wallInput.value));
                roomData.wallpapers.push({
                    type: wallpaperEl.querySelector('input[name="wallpaper_type"]').value,
                    code: wallpaperEl.querySelector('input[name="wallpaper_code"]').value,
                    height: wallpaperEl.querySelector('input[name="wallpaper_height_m"]').value,
                    price_roll: wallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value,
                    walls: walls
                });
            });

            payload.rooms.push(roomData);
        });
        return payload;
    };

    const saveToLocalStorage = (payload) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (err) {
            console.error("Failed to save data to local storage:", err);
            showToast('บันทึกข้อมูลไม่สำเร็จ!', 'error');
        }
    };

    const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    };

    const updateAll = debounce(() => {
        updateSummary();
        const payload = buildPayload();
        if (!isFirstLoad) {
            saveToLocalStorage(payload);
        } else {
            isFirstLoad = false;
        }
    }, 500);

    const updateSummary = () => {
        let totalCurtainPrice = 0;
        let totalDecorationPrice = 0;
        let totalWallpaperPrice = 0;
        let totalFabricYardage = 0;
        let totalSheerYardage = 0;
        let totalDecorationSqyd = 0;
        let totalWallpaperArea = 0;
        let totalWallpaperRolls = 0;

        document.querySelectorAll('.room-container').forEach(roomEl => {
            let roomTotal = 0;

            // Curtain Calculations
            roomEl.querySelectorAll('[data-curtain-point]').forEach(curtainEl => {
                const width = parseFloat(curtainEl.querySelector('input[name="curtain_width_m"]').value) || 0;
                const height = parseFloat(curtainEl.querySelector('input[name="curtain_height_m"]').value) || 0;
                const fabric_type = curtainEl.querySelector('select[name="fabric_type"]').value;
                const fabric_price = parseFloat(curtainEl.querySelector('input[name="fabric_price"]').value.replace(/,/g, '')) || 0;
                const sheer_price_el = curtainEl.querySelector('input[name="sheer_price"]');
                const sheer_price = sheer_price_el ? (parseFloat(sheer_price_el.value.replace(/,/g, '')) || 0) : 0;
                const style = curtainEl.querySelector('select[name="curtain_style"]').value;
                const rail_length = parseFloat(curtainEl.querySelector('input[name="rail_length_m"]').value) || 0;
                const has_rail = curtainEl.querySelector('input[name="has_rail"]').checked;
                const has_lace = curtainEl.querySelector('input[name="has_lace"]').checked;

                const result = CALC.curtainPrice(fabric_price, sheer_price, style, width, height, has_rail, rail_length, has_lace, fabric_type);
                curtainEl.querySelector('[data-curtain-summary] .price').textContent = result.price.toLocaleString();
                curtainEl.querySelector('[data-curtain-summary] span:last-child').textContent = result.fabric_yardage.toFixed(2) + ' ม.';

                totalCurtainPrice += result.price;
                totalFabricYardage += result.fabric_yardage;
                totalSheerYardage += result.sheer_yardage;
                roomTotal += result.price;
            });

            // Decoration Calculations
            roomEl.querySelectorAll('[data-decoration-point]').forEach(decorationEl => {
                const width = parseFloat(decorationEl.querySelector('input[name="decoration_width_m"]').value) || 0;
                const height = parseFloat(decorationEl.querySelector('input[name="decoration_height_m"]').value) || 0;
                const price_sqyd = parseFloat(decorationEl.querySelector('input[name="decoration_price_sqyd"]').value.replace(/,/g, '')) || 0;

                const result = CALC.decorationPrice(width, height, price_sqyd);
                decorationEl.querySelector('[data-decoration-summary] .price').textContent = result.price.toLocaleString();
                decorationEl.querySelector('[data-decoration-summary] span:last-child').textContent = result.sqyd.toFixed(2) + ' ตร.หลา';

                totalDecorationPrice += result.price;
                totalDecorationSqyd += result.sqyd;
                roomTotal += result.price;
            });
            
            // Wallpaper Calculations
            roomEl.querySelectorAll('[data-wallpaper-point]').forEach(wallpaperEl => {
                const height = parseFloat(wallpaperEl.querySelector('input[name="wallpaper_height_m"]').value) || 0;
                const price_roll = parseFloat(wallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0;
                const wall_widths = Array.from(wallpaperEl.querySelectorAll('input[name="wall_width_m"]')).map(input => parseFloat(input.value) || 0);

                const result = CALC.wallpaperPrice(height, wall_widths, price_roll);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price').textContent = result.price.toLocaleString();
                wallpaperEl.querySelector('[data-wallpaper-summary] span:nth-child(2)').textContent = result.area.toFixed(2) + ' ตร.ม.';
                wallpaperEl.querySelector('[data-wallpaper-summary] span:last-child').textContent = result.rolls.toString() + ' ม้วน';

                totalWallpaperPrice += result.price;
                totalWallpaperArea += result.area;
                totalWallpaperRolls += result.rolls;
                roomTotal += result.price;
            });

            roomEl.querySelector('[data-room-summary] .price').textContent = roomTotal.toLocaleString();
        });

        document.querySelector(SELECTORS.curtainSumEl).textContent = totalCurtainPrice.toLocaleString();
        document.querySelector(SELECTORS.decorationSumEl).textContent = totalDecorationPrice.toLocaleString();
        document.querySelector(SELECTORS.wallpaperSumEl).textContent = totalWallpaperPrice.toLocaleString();
        document.querySelector(SELECTORS.totalSumEl).textContent = (totalCurtainPrice + totalDecorationPrice + totalWallpaperPrice).toLocaleString();
    };

    const updateLockState = () => {
        document.querySelector(SELECTORS.lockBtn).innerHTML = isLocked ? '<span class="lock-text">ปลดล็อค</span> <span class="lock-icon">🔓</span>' : '<span class="lock-text">ล็อค</span> <span class="lock-icon">🔒</span>';
        document.querySelector(SELECTORS.addRoomHeaderBtn).style.display = isLocked ? 'none' : 'inline-block';
        document.querySelector(SELECTORS.clearAllBtn).style.display = isLocked ? 'none' : 'inline-block';
        const formEl = document.querySelector(SELECTORS.orderForm);
        formEl.querySelectorAll('input, select, button').forEach(el => {
            el.disabled = isLocked;
        });
        document.querySelector(SELECTORS.lockBtn).disabled = false;
        document.querySelector('#customerInfo').querySelectorAll('input').forEach(el => {
            el.disabled = false;
        });
    };

    const showToast = (message, type) => {
        const toastContainer = document.querySelector(SELECTORS.toastContainer);
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    };

    const updateRoomTitles = () => {
        document.querySelectorAll('.room-container').forEach((roomEl, index) => {
            roomEl.querySelector('.room-title').textContent = `ห้องที่ ${index + 1}`;
        });
    };

    const addRoom = (roomData) => {
        roomCount++;
        const template = document.getElementById('roomTpl');
        const clone = template.content.cloneNode(true);
        const newRoomEl = clone.querySelector('.room-container');
        if (roomData) {
            newRoomEl.querySelector('input[name="room_name"]').value = roomData.room_name;
            if (roomData.curtains && roomData.curtains.length > 0) roomData.curtains.forEach(addCurtainPoint.bind(null, newRoomEl));
            if (roomData.decorations && roomData.decorations.length > 0) roomData.decorations.forEach(addDecorationPoint.bind(null, newRoomEl));
            if (roomData.wallpapers && roomData.wallpapers.length > 0) roomData.wallpapers.forEach(addWallpaperPoint.bind(null, newRoomEl));
        }
        roomsEl.appendChild(newRoomEl);
        updateRoomTitles();
        showToast('เพิ่มห้องใหม่แล้ว', 'info');
    };

    const addCurtainPoint = (roomEl, curtainData) => {
        const container = roomEl.querySelector('[data-curtain-container]');
        const template = document.getElementById('curtainTpl');
        const clone = template.content.cloneNode(true);
        const newCurtainEl = clone.querySelector('[data-curtain-point]');

        if (curtainData) {
            newCurtainEl.querySelector('input[name="curtain_width_m"]').value = curtainData.width;
            newCurtainEl.querySelector('input[name="curtain_height_m"]').value = curtainData.height;
            newCurtainEl.querySelector('select[name="fabric_type"]').value = curtainData.fabric_type;
            newCurtainEl.querySelector('input[name="fabric_price"]').value = curtainData.fabric_price;
            if (curtainData.sheer_price) {
                const sheerPriceInput = document.createElement('input');
                sheerPriceInput.className = 'field';
                sheerPriceInput.type = 'text';
                sheerPriceInput.inputMode = 'numeric';
                sheerPriceInput.name = 'sheer_price';
                sheerPriceInput.value = curtainData.sheer_price;
                const label = document.createElement('label');
                label.textContent = 'ราคาผ้าโปร่ง (บ.)';
                const div = newCurtainEl.querySelector('.row:nth-child(2) > div:last-child');
                div.innerHTML = '';
                div.appendChild(label);
                div.appendChild(sheerPriceInput);
            }
            newCurtainEl.querySelector('select[name="curtain_style"]').value = curtainData.style;
            newCurtainEl.querySelector('input[name="rail_length_m"]').value = curtainData.rail_length;
            newCurtainEl.querySelector('input[name="has_rail"]').checked = curtainData.has_rail;
            newCurtainEl.querySelector('input[name="has_lace"]').checked = curtainData.has_lace;
        }

        container.appendChild(newCurtainEl);
        updateAll();
    };

    const addDecorationPoint = (roomEl, decorationData) => {
        const container = roomEl.querySelector('[data-decoration-container]');
        const template = document.getElementById('decorationTpl');
        const clone = template.content.cloneNode(true);
        const newDecorationEl = clone.querySelector('[data-decoration-point]');
        if (decorationData) {
            newDecorationEl.querySelector('input[name="decoration_name"]').value = decorationData.name;
            newDecorationEl.querySelector('input[name="decoration_width_m"]').value = decorationData.width;
            newDecorationEl.querySelector('input[name="decoration_height_m"]').value = decorationData.height;
            newDecorationEl.querySelector('input[name="decoration_price_sqyd"]').value = decorationData.price_sqyd;
        }
        container.appendChild(newDecorationEl);
        updateAll();
    };

    const addWallpaperPoint = (roomEl, wallpaperData) => {
        const container = roomEl.querySelector('[data-wallpaper-container]');
        const template = document.getElementById('wallpaperTpl');
        const clone = template.content.cloneNode(true);
        const newWallpaperEl = clone.querySelector('[data-wallpaper-point]');
        if (wallpaperData) {
            newWallpaperEl.querySelector('input[name="wallpaper_type"]').value = wallpaperData.type;
            newWallpaperEl.querySelector('input[name="wallpaper_code"]').value = wallpaperData.code;
            newWallpaperEl.querySelector('input[name="wallpaper_height_m"]').value = wallpaperData.height;
            newWallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value = wallpaperData.price_roll;
            const wallsContainer = newWallpaperEl.querySelector('[data-walls-container]');
            wallpaperData.walls.forEach(wall => {
                const wallTemplate = document.getElementById('wallTpl');
                const wallClone = wallTemplate.content.cloneNode(true);
                const newWallEl = wallClone.querySelector('.wall-input-row');
                newWallEl.querySelector('input[name="wall_width_m"]').value = wall;
                wallsContainer.appendChild(newWallEl);
            });
        } else {
            addWall(newWallpaperEl);
        }
        container.appendChild(newWallpaperEl);
        updateAll();
    };

    const addWall = (wallpaperEl) => {
        const container = wallpaperEl.querySelector('[data-walls-container]');
        const template = document.getElementById('wallTpl');
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);
        updateAll();
    };

    const copyToClipboard = (text) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast('คัดลอกสำเร็จ!', 'success');
        } catch (err) {
            console.error('Could not copy text: ', err);
            showToast('ไม่สามารถคัดลอกได้', 'error');
        }
        document.body.removeChild(textarea);
    };

    // --- Event Listeners ---
    document.addEventListener('input', (e) => {
        if (!e.target.matches('.field')) return;
        updateAll();
    });
    
    document.addEventListener('change', (e) => {
        // Special case for curtain fabric type to add sheer price field
        if (e.target.name === 'fabric_type' && e.target.closest('[data-curtain-point]')) {
            const container = e.target.closest('.row');
            const sheerPriceDiv = container.querySelector('div:last-child');
            const hasSheer = e.target.value.includes('โปร่ง');

            if (hasSheer && !sheerPriceDiv.querySelector('input[name="sheer_price"]')) {
                sheerPriceDiv.innerHTML = `<label>ราคาผ้าโปร่ง (บ.)</label><input class="field" type="text" inputmode="numeric" name="sheer_price" required />`;
            } else if (!hasSheer && sheerPriceDiv.querySelector('input[name="sheer_price"]')) {
                sheerPriceDiv.innerHTML = `<label>ราคาผ้า (บ.)</label>
                    <input type="text" list="fabric_price_list" name="fabric_price" class="field" inputmode="numeric" required />
                    <datalist id="fabric_price_list">
                        <option value="1000">
                        <option value="1200">
                        <option value="1300">
                        <option value="1400">
                        <option value="1500">
                        <option value="1600">
                        <option value="1700">
                        <option value="1800">
                        <option value="1900">
                        <option value="2000">
                        <option value="2100">
                        <option value="2200">
                        <option value="2300">
                        <option value="2400">
                        <option value="2500">
                    </datalist>`;
            }
        }
    });

    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-act]');
        if (!target) return;
        const action = target.dataset.act;
        const roomEl = target.closest('.room-container');
        const itemEl = target.closest('.item-card');

        switch(action) {
            case 'add-curtain-point': addCurtainPoint(roomEl); break;
            case 'add-decoration-point': addDecorationPoint(roomEl); break;
            case 'add-wallpaper-point': addWallpaperPoint(roomEl); break;
            case 'delete-item': itemEl.remove(); updateAll(); break;
            case 'add-wall': addWall(target.closest('[data-wallpaper-point]')); break;
            case 'delete-wall': target.closest('.wall-input-row').remove(); updateAll(); break;
            case 'add-room': addRoom(); break;
            case 'delete-room':
                if (document.querySelectorAll('.room-container').length > 1) {
                    roomEl.remove(); updateRoomTitles(); updateAll();
                    showToast('ลบห้องแล้ว', 'success');
                } else {
                    showToast('ต้องมีอย่างน้อย 1 ห้อง', 'warning');
                }
                break;
            case 'copy-json': copyToClipboard(JSON.stringify(buildPayload(), null, 2)); break;
            case 'copy-text':
                const payload = buildPayload();
                const text = `ชื่อลูกค้า: ${payload.customer_name}\nที่อยู่: ${payload.customer_address}\nเบอร์โทร: ${payload.customer_phone}\n\n` +
                    payload.rooms.map(room => {
                        let roomText = `*** ${room.room_name} ***\n`;
                        if (room.curtains.length > 0) {
                            roomText += "--- ผ้าม่าน ---\n";
                            room.curtains.forEach(c => {
                                roomText += `ชนิด: ${c.fabric_type}, สไตล์: ${c.style}, กว้าง: ${c.width}ม., สูง: ${c.height}ม., ราคาผ้า: ${c.fabric_price}บ.\n`;
                            });
                        }
                        if (room.decorations.length > 0) {
                            roomText += "--- งานตกแต่ง ---\n";
                            room.decorations.forEach(d => {
                                roomText += `รายการ: ${d.name}, กว้าง: ${d.width}ม., สูง: ${d.height}ม., ราคา: ${d.price_sqyd}บ./ตร.หลา\n`;
                            });
                        }
                        if (room.wallpapers.length > 0) {
                            roomText += "--- วอลเปเปอร์ ---\n";
                            room.wallpapers.forEach(w => {
                                roomText += `รหัส: ${w.code}, ความสูง: ${w.height}ม., ผนังกว้าง: ${w.walls.join(', ')}ม., ราคา: ${w.price_roll}บ./ม้วน\n`;
                            });
                        }
                        return roomText;
                    }).join('\n');
                copyToClipboard(text);
                break;
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => {
        addRoom();
    });
    
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อค', 'info');
    });

    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        roomsEl.innerHTML = "";
        roomCount = 0;
        addRoom();
        updateAll();
        showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
    });

    document.querySelector(SELECTORS.orderForm).addEventListener('submit', (e) => {
        const requiredFields = e.target.querySelectorAll('input:required');
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
        updateAll();
    });
})();
