(function() {
    'use strict';
    // --- CONSTANTS ---
    const APP_VERSION = "input-ui/pro-5.0.2";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v5";
    const SQM_TO_SQYD = 1.19599; 
    const WALLPAPER_SQM_PER_ROLL = 5.3;
    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };
    const CALC = {
        fabricYardage: (width_m, height_m, style) => {
            let height_yd = height_m * SQM_TO_SQYD;
            let width_yd = width_m * SQM_TO_SQYD;
            let fullness = (style === "ลอน") ? 3 : 2.5;
            let drops = Math.ceil(width_yd / 1.5);
            return (drops * height_yd * fullness) / 2;
        },
        sheerYardage: (width_m, height_m) => {
            let width_yd = width_m * SQM_TO_SQYD;
            let fullness = 2.5;
            let drops = Math.ceil(width_yd / 2);
            return (drops * height_m * SQM_TO_SQYD * fullness) / 2;
        },
        heightSurcharge: (height_m) => {
            for (const h of PRICING.height) {
                if (height_m >= h.threshold) {
                    return h.add_per_m * height_m;
                }
            }
            return 0;
        },
        wallpaperArea: (widths_m, height_m) => widths_m.reduce((sum, width) => sum + (width * height_m), 0),
        wallpaperRolls: (widths_m, height_m) => Math.ceil(CALC.wallpaperArea(widths_m, height_m) / WALLPAPER_SQM_PER_ROLL)
    };
    const SELECTORS = {
        orderForm: '#orderForm',
        roomsContainer: '#rooms',
        roomTpl: '#roomTpl',
        setTpl: '#setTpl',
        decoTpl: '#decoTpl',
        wallpaperTpl: '#wallpaperTpl',
        wallTpl: '#wallTpl',
        lockBtn: '#lockBtn',
        lockText: '.lock-text',
        clearAllBtn: '#clearAllBtn',
        materialSummary: '#materialSummary',
        summaryContent: '#summaryContent',
        totalSummary: '#totalSummary',
        totalPrice: '[data-total-price]',
        totalFabric: '[data-total-fabric]',
        totalSheer: '[data-total-sheer]',
        totalWallpaper: '[data-total-wallpaper]',
        copyOptionsModal: '#copyOptionsModal',
        importModal: '#importModal',
        importJsonArea: '.import-json-area',
        confirmationModal: '#confirmationModal',
        toast: '#toast'
    };
    const TEXT = {
        lock: 'ล็อค',
        unlock: 'ปลดล็อค',
        confirm: {
            title: 'ยืนยัน',
            body: 'คุณต้องการล้างข้อมูลทั้งหมดหรือไม่?',
        },
        materialSummary: {
            fabric: 'ผ้าทึบ',
            sheer: 'ผ้าโปร่ง',
            wallpaper: 'วอลเปเปอร์',
        },
        copied: 'คัดลอกเรียบร้อย!',
        copyFail: 'คัดลอกไม่สำเร็จ!',
    };

    // --- STATE ---
    let isLocked = false;
    let roomCount = 0;

    // --- DOM ELEMENTS ---
    const orderForm = document.querySelector(SELECTORS.orderForm);
    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const materialSummaryEl = document.querySelector(SELECTORS.materialSummary);
    const summaryContentEl = document.querySelector(SELECTORS.summaryContent);
    const totalSummaryEl = document.querySelector(SELECTORS.totalSummary);
    const totalFabricEl = document.querySelector(SELECTORS.totalFabric);
    const totalSheerEl = document.querySelector(SELECTORS.totalSheer);
    const totalWallpaperEl = document.querySelector(SELECTORS.totalWallpaper);
    const totalPriceEl = document.querySelector(SELECTORS.totalPrice);
    const lockBtn = document.querySelector(SELECTORS.lockBtn);
    const lockText = document.querySelector(SELECTORS.lockText);
    const menuBtn = document.getElementById('menuBtn');
    const menuDropdown = document.getElementById('menuDropdown');
    const copyOptionsModal = document.querySelector(SELECTORS.copyOptionsModal);
    const importModal = document.querySelector(SELECTORS.importModal);
    const confirmationModal = document.querySelector(SELECTORS.confirmationModal);
    const toastEl = document.querySelector(SELECTORS.toast);

    // --- UTILS ---
    const formatNumber = (num) => new Intl.NumberFormat('th-TH').format(Math.round(num));
    const showToast = (message, type) => {
        toastEl.textContent = message;
        toastEl.className = `toast toast-${type} show`;
        setTimeout(() => toastEl.classList.remove('show'), 3000);
    };

    const findParentByTag = (el, tag) => {
        while (el && el.tagName !== tag.toUpperCase()) {
            el = el.parentElement;
        }
        return el;
    };

    const updateLockState = () => {
        const inputs = orderForm.querySelectorAll('input, select');
        inputs.forEach(input => input.disabled = isLocked);
        lockText.textContent = isLocked ? TEXT.unlock : TEXT.lock;
        lockBtn.classList.toggle('active', isLocked);
    };

    const showConfirmation = (title, body, onConfirm) => {
        confirmationModal.querySelector('.dialog-head h3').textContent = title;
        confirmationModal.querySelector('.dialog-body').textContent = body;
        const okBtn = confirmationModal.querySelector('[data-act="confirm-ok"]');
        const cancelBtn = confirmationModal.querySelector('[data-act="confirm-cancel"]');
        okBtn.onclick = () => { onConfirm(); confirmationModal.classList.remove('visible'); };
        cancelBtn.onclick = () => confirmationModal.classList.remove('visible');
        confirmationModal.classList.add('visible');
    };

    // --- LOGIC ---
    const calcItem = (item) => {
        const itemType = item.querySelector('input[name="item_name"]');
        const type = item.querySelector('select[name="type_curtain"]')?.value;
        const style = item.querySelector('select[name="style_curtain"]')?.value;
        const width = parseFloat(item.querySelector('input[name="width_m"]')?.value) || 0;
        const height = parseFloat(item.querySelector('input[name="height_m"]')?.value) || 0;
        const pricePerYard = parseFloat(item.querySelector('input[name="price_fabric"]')?.value.replace(/,/g, '')) || 0;
        const decoCount = parseInt(item.querySelector('input[name="deco_count"]')?.value) || 0;
        const decoPrice = parseFloat(item.querySelector('input[name="deco_price"]')?.value.replace(/,/g, '')) || 0;
        const wallpaperHeight = parseFloat(item.querySelector('input[name="wallpaper_height_m"]')?.value) || 0;
        const wallpaperPrice = parseFloat(item.querySelector('input[name="wallpaper_price_roll"]')?.value.replace(/,/g, '')) || 0;
        const wallWidths = Array.from(item.querySelectorAll('input[name="wall_width_m"]')).map(el => parseFloat(el.value) || 0);

        let itemPrice = 0;
        let fabricYardage = 0;
        let sheerYardage = 0;
        let wallpaperRolls = 0;
        let wallpaperArea = 0;

        if (item.dataset.itemId.startsWith('set')) {
            let yardage;
            if (type === 'ผ้าทึบ') {
                yardage = CALC.fabricYardage(width, height, style);
                fabricYardage = yardage;
            } else {
                yardage = CALC.sheerYardage(width, height);
                sheerYardage = yardage;
            }
            const styleSurcharge = PRICING.style_surcharge[style] || 0;
            const heightSurcharge = CALC.heightSurcharge(height);
            itemPrice = (yardage * pricePerYard) + styleSurcharge + heightSurcharge;
            item.querySelector('[data-item-summary]').innerHTML = `ราคา: <span class="price">${formatNumber(itemPrice)}</span> • ใช้ผ้า: <span class="price">${(yardage).toFixed(2)}</span> หลา`;

        } else if (item.dataset.itemId.startsWith('deco')) {
            itemPrice = decoCount * decoPrice;
            item.querySelector('[data-item-summary]').innerHTML = `ราคา: <span class="price">${formatNumber(itemPrice)}</span>`;

        } else if (item.dataset.itemId.startsWith('wallpaper')) {
            wallpaperArea = CALC.wallpaperArea(wallWidths, wallpaperHeight);
            wallpaperRolls = CALC.wallpaperRolls(wallWidths, wallpaperHeight);
            itemPrice = wallpaperRolls * wallpaperPrice;
            item.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${formatNumber(itemPrice)}</span> • พื้นที่: <span class="price">${wallpaperArea.toFixed(2)}</span> ตร.ม. • ใช้ <span class="price">${wallpaperRolls}</span> ม้วน`;
        }
        return { itemPrice, fabricYardage, sheerYardage, wallpaperRolls, wallpaperArea, itemType };
    };

    const recalcRoom = (room) => {
        let roomTotalPrice = 0;
        room.querySelectorAll('.item').forEach(item => {
            const { itemPrice } = calcItem(item);
            roomTotalPrice += itemPrice;
        });
        room.querySelector('[data-room-summary] .price').textContent = formatNumber(roomTotalPrice);
        recalcAll();
    };

    const recalcAll = () => {
        let grandTotal = 0;
        let totalFabric = 0;
        let totalSheer = 0;
        let totalWallpaperRolls = 0;
        const materialSummary = { fabric: {}, sheer: {}, wallpaper: {} };

        document.querySelectorAll('.room').forEach(room => {
            room.querySelectorAll('.item').forEach(item => {
                const { itemPrice, fabricYardage, sheerYardage, wallpaperRolls, wallpaperArea, itemType } = calcItem(item);
                grandTotal += itemPrice;
                totalFabric += fabricYardage;
                totalSheer += sheerYardage;
                totalWallpaperRolls += wallpaperRolls;

                // Update material summary
                const name = item.querySelector('input[name="item_name"]')?.value || 'ไม่ระบุชื่อ';
                if (item.dataset.itemId.startsWith('set')) {
                    const type = item.querySelector('select[name="type_curtain"]')?.value;
                    const pricing = parseFloat(item.querySelector('input[name="price_fabric"]')?.value.replace(/,/g, '')) || 0;
                    if (type === 'ผ้าทึบ') {
                        if (!materialSummary.fabric[pricing]) materialSummary.fabric[pricing] = { items: [], total: 0 };
                        materialSummary.fabric[pricing].items.push(name);
                        materialSummary.fabric[pricing].total += fabricYardage;
                    } else {
                        if (!materialSummary.sheer[pricing]) materialSummary.sheer[pricing] = { items: [], total: 0 };
                        materialSummary.sheer[pricing].items.push(name);
                        materialSummary.sheer[pricing].total += sheerYardage;
                    }
                } else if (item.dataset.itemId.startsWith('wallpaper')) {
                    const pricing = parseFloat(item.querySelector('input[name="wallpaper_price_roll"]')?.value.replace(/,/g, '')) || 0;
                    if (!materialSummary.wallpaper[pricing]) materialSummary.wallpaper[pricing] = { items: [], total: 0 };
                    materialSummary.wallpaper[pricing].items.push(name);
                    materialSummary.wallpaper[pricing].total += wallpaperRolls;
                }
            });
        });

        // Update totals
        totalPriceEl.textContent = formatNumber(grandTotal);
        totalFabricEl.textContent = totalFabric.toFixed(2);
        totalSheerEl.textContent = totalSheer.toFixed(2);
        totalWallpaperEl.textContent = totalWallpaperRolls;

        // Update material summary display
        let summaryHtml = '';
        const buildSummarySection = (title, data, unit) => {
            if (Object.keys(data).length === 0) return '';
            let html = `<h3>${title}</h3>`;
            html += '<table class="material-table"><tbody>';
            for (const price in data) {
                html += `<tr><td>${data[price].items.join(', ')}</td><td class="align-right">${data[price].total.toFixed(2)} ${unit} (${formatNumber(price)} บ./${unit})</td></tr>`;
            }
            html += '</tbody></table>';
            return html;
        };

        summaryHtml += buildSummarySection('ผ้าทึบ', materialSummary.fabric, 'หลา');
        summaryHtml += buildSummarySection('ผ้าโปร่ง', materialSummary.sheer, 'หลา');
        summaryHtml += buildSummarySection('วอลเปเปอร์', materialSummary.wallpaper, 'ม้วน');
        
        summaryContentEl.innerHTML = summaryHtml || '<p>ยังไม่มีรายการ</p>';
    };

    const populatePriceOptions = (select, prices) => {
        select.innerHTML = '<option value="" disabled selected>เลือกราคา</option>';
        prices.forEach(price => {
            const option = document.createElement('option');
            option.value = price;
            option.textContent = formatNumber(price) + ' บ./หลา';
            select.appendChild(option);
        });
    };

    const addSet = (container) => {
        const itemTpl = document.querySelector(SELECTORS.setTpl).content.cloneNode(true);
        const itemEl = itemTpl.querySelector('.item');
        const id = `set-${Date.now()}`;
        itemEl.dataset.itemId = id;
        container.appendChild(itemEl);
        
        // Populate price options
        const typeSelect = itemEl.querySelector('select[name="type_curtain"]');
        const priceInput = itemEl.querySelector('input[name="price_fabric"]');

        const updatePriceOptions = () => {
            const prices = (typeSelect.value === 'ผ้าทึบ') ? PRICING.fabric : PRICING.sheer;
            priceInput.placeholder = `ใส่ราคา หรือเลือกจาก ${prices.map(p => formatNumber(p)).join(', ')}`;
        };

        typeSelect.addEventListener('change', updatePriceOptions);
        updatePriceOptions();

        recalcRoom(findParentByTag(itemEl, 'div'));
    };

    const addDeco = (container) => {
        const itemTpl = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
        const itemEl = itemTpl.querySelector('.item');
        const id = `deco-${Date.now()}`;
        itemEl.dataset.itemId = id;
        container.appendChild(itemEl);
        recalcRoom(findParentByTag(itemEl, 'div'));
    };

    const addWallpaper = (container) => {
        const itemTpl = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        const itemEl = itemTpl.querySelector('.item');
        const id = `wallpaper-${Date.now()}`;
        itemEl.dataset.itemId = id;
        container.appendChild(itemEl);
        recalcRoom(findParentByTag(itemEl, 'div'));
    };

    const addWall = (btn) => {
        const container = btn.previousElementSibling;
        const wallTpl = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
        container.appendChild(wallTpl);
        recalcRoom(findParentByTag(btn, 'div'));
    };

    const addRoom = () => {
        const roomTpl = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        const roomEl = roomTpl.querySelector('.room');
        const id = `room-${++roomCount}`;
        roomEl.dataset.roomId = id;
        roomsEl.appendChild(roomEl);
        addSet(roomEl.querySelector('.items-container'));
        recalcAll();
    };

    const buildPayload = () => {
        const payload = {
            customer_name: orderForm.querySelector('input[name="customer_name"]').value,
            customer_address: orderForm.querySelector('input[name="customer_address"]').value,
            customer_phone: orderForm.querySelector('input[name="customer_phone"]').value,
            rooms: [],
        };
        document.querySelectorAll('.room').forEach(room => {
            const roomData = {
                room_name: room.querySelector('input[name="room_name"]').value || `ห้อง ${room.dataset.roomId.split('-')[1]}`,
                items: [],
                room_total_price: parseFloat(room.querySelector('[data-room-summary] .price').textContent.replace(/,/g, '')) || 0,
            };
            room.querySelectorAll('.item').forEach(item => {
                const itemData = {
                    item_name: item.querySelector('input[name="item_name"]')?.value || 'ไม่ระบุชื่อ',
                };
                if (item.dataset.itemId.startsWith('set')) {
                    itemData.type = 'ผ้าม่าน';
                    itemData.curtain_type = item.querySelector('select[name="type_curtain"]').value;
                    itemData.style = item.querySelector('select[name="style_curtain"]').value;
                    itemData.width_m = parseFloat(item.querySelector('input[name="width_m"]').value);
                    itemData.height_m = parseFloat(item.querySelector('input[name="height_m"]').value);
                    itemData.price_per_yard = parseFloat(item.querySelector('input[name="price_fabric"]').value.replace(/,/g, ''));
                    itemData.price = parseFloat(item.querySelector('[data-item-summary] .price').textContent.replace(/,/g, ''));
                    const yardage = (itemData.curtain_type === 'ผ้าทึบ') ? CALC.fabricYardage(itemData.width_m, itemData.height_m, itemData.style) : CALC.sheerYardage(itemData.width_m, itemData.height_m);
                    itemData.yardage_used = yardage.toFixed(2);
                } else if (item.dataset.itemId.startsWith('deco')) {
                    itemData.type = 'ม่านตกแต่ง';
                    itemData.count = parseInt(item.querySelector('input[name="deco_count"]').value);
                    itemData.price_per_unit = parseFloat(item.querySelector('input[name="deco_price"]').value.replace(/,/g, ''));
                    itemData.price = parseFloat(item.querySelector('[data-item-summary] .price').textContent.replace(/,/g, ''));
                } else if (item.dataset.itemId.startsWith('wallpaper')) {
                    itemData.type = 'วอลเปเปอร์';
                    itemData.height_m = parseFloat(item.querySelector('input[name="wallpaper_height_m"]').value);
                    itemData.wall_widths_m = Array.from(item.querySelectorAll('input[name="wall_width_m"]')).map(el => parseFloat(el.value));
                    itemData.price_per_roll = parseFloat(item.querySelector('input[name="wallpaper_price_roll"]').value.replace(/,/g, ''));
                    itemData.area_sqm = parseFloat(item.querySelector('[data-wallpaper-summary] span:nth-of-type(2)').textContent.replace(/,/g, ''));
                    itemData.rolls_used = parseInt(item.querySelector('[data-wallpaper-summary] span:nth-of-type(3)').textContent);
                    itemData.price = parseFloat(item.querySelector('[data-wallpaper-summary] .price').textContent.replace(/,/g, ''));
                }
                roomData.items.push(itemData);
            });
            payload.rooms.push(roomData);
        });

        const totalSummary = {
            total_price: parseFloat(totalPriceEl.textContent.replace(/,/g, '')) || 0,
            total_fabric_yardage: parseFloat(totalFabricEl.textContent) || 0,
            total_sheer_yardage: parseFloat(totalSheerEl.textContent) || 0,
            total_wallpaper_rolls: parseInt(totalWallpaperEl.textContent) || 0,
        };

        return { ...payload, summary: totalSummary };
    };

    const copyToClipboard = (type) => {
        const payload = buildPayload();
        let textToCopy = '';

        if (type === 'all' || type === 'details') {
            textToCopy += `ลูกค้า: ${payload.customer_name}\nที่อยู่: ${payload.customer_address}\nเบอร์โทร: ${payload.customer_phone}\n\n`;
            payload.rooms.forEach(room => {
                textToCopy += `**${room.room_name}**\n`;
                room.items.forEach(item => {
                    textToCopy += `  - ${item.item_name} (${item.type}):\n`;
                    if (item.type === 'ผ้าม่าน') {
                        textToCopy += `    - ชนิด: ${item.curtain_type}, รูปแบบ: ${item.style}\n`;
                        textToCopy += `    - ขนาด: ${item.width_m}ม. x ${item.height_m}ม.\n`;
                        textToCopy += `    - ใช้ผ้า: ${item.yardage_used} หลา (${formatNumber(item.price_per_yard)} บ./หลา)\n`;
                    } else if (item.type === 'ม่านตกแต่ง') {
                        textToCopy += `    - จำนวน: ${item.count} ชุด (${formatNumber(item.price_per_unit)} บ./ชุด)\n`;
                    } else if (item.type === 'วอลเปเปอร์') {
                        textToCopy += `    - ความสูง: ${item.height_m}ม.\n`;
                        textToCopy += `    - ความกว้างผนัง: ${item.wall_widths_m.join('ม., ')}ม.\n`;
                        textToCopy += `    - ใช้: ${item.rolls_used} ม้วน (${formatNumber(item.price_per_roll)} บ./ม้วน)\n`;
                    }
                    textToCopy += `    - ราคา: ${formatNumber(item.price)} บ.\n`;
                });
                textToCopy += `  รวม: ${formatNumber(room.room_total_price)} บ.\n\n`;
            });
        }

        if (type === 'all' || type === 'summary') {
            textToCopy += `\n--- สรุปยอดรวม ---\n`;
            textToCopy += `รวมยอด: ${formatNumber(payload.summary.total_price)} บ.\n`;
            textToCopy += `รวมจำนวนผ้า: ผ้าทึบ ${payload.summary.total_fabric_yardage.toFixed(2)} หลา / ผ้าโปร่ง ${payload.summary.total_sheer_yardage.toFixed(2)} หลา\n`;
            textToCopy += `รวมจำนวนวอลเปเปอร์: ${payload.summary.total_wallpaper_rolls} ม้วน\n`;
        }

        if (type === 'all' || type === 'materials') {
            textToCopy += `\n--- สรุปวัสดุ ---\n`;
            
            const appendMaterialSummary = (title, data, unit) => {
                if (Object.keys(data).length > 0) {
                    textToCopy += `**${title}**\n`;
                    for (const price in data) {
                        textToCopy += `  - ${data[price].items.join(', ')}: ${data[price].total.toFixed(2)} ${unit} (${formatNumber(price)} บ./${unit})\n`;
                    }
                }
            };
            
            const materialSummary = { fabric: {}, sheer: {}, wallpaper: {} };
            document.querySelectorAll('.room').forEach(room => {
                room.querySelectorAll('.item').forEach(item => {
                    if (item.dataset.itemId.startsWith('set')) {
                        const type = item.querySelector('select[name="type_curtain"]')?.value;
                        const price = parseFloat(item.querySelector('input[name="price_fabric"]')?.value.replace(/,/g, '')) || 0;
                        const name = item.querySelector('input[name="item_name"]')?.value || 'ไม่ระบุชื่อ';
                        const yardage = (type === 'ผ้าทึบ') ? CALC.fabricYardage(parseFloat(item.querySelector('input[name="width_m"]').value) || 0, parseFloat(item.querySelector('input[name="height_m"]').value) || 0, item.querySelector('select[name="style_curtain"]').value) : CALC.sheerYardage(parseFloat(item.querySelector('input[name="width_m"]').value) || 0, parseFloat(item.querySelector('input[name="height_m"]').value) || 0);
                        const summary = (type === 'ผ้าทึบ') ? materialSummary.fabric : materialSummary.sheer;
                        if (!summary[price]) summary[price] = { items: [], total: 0 };
                        summary[price].items.push(name);
                        summary[price].total += yardage;
                    } else if (item.dataset.itemId.startsWith('wallpaper')) {
                        const price = parseFloat(item.querySelector('input[name="wallpaper_price_roll"]')?.value.replace(/,/g, '')) || 0;
                        const name = item.querySelector('input[name="item_name"]')?.value || 'ไม่ระบุชื่อ';
                        const rolls = CALC.wallpaperRolls(Array.from(item.querySelectorAll('input[name="wall_width_m"]')).map(el => parseFloat(el.value) || 0), parseFloat(item.querySelector('input[name="wallpaper_height_m"]').value) || 0);
                        if (!materialSummary.wallpaper[price]) materialSummary.wallpaper[price] = { items: [], total: 0 };
                        materialSummary.wallpaper[price].items.push(name);
                        materialSummary.wallpaper[price].total += rolls;
                    }
                });
            });

            appendMaterialSummary('ผ้าทึบ', materialSummary.fabric, 'หลา');
            appendMaterialSummary('ผ้าโปร่ง', materialSummary.sheer, 'หลา');
            appendMaterialSummary('วอลเปเปอร์', materialSummary.wallpaper, 'ม้วน');
        }

        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast(TEXT.copied, 'success');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToast(TEXT.copyFail, 'error');
        });
    };

    const showCopyOptionsModal = () => {
        copyOptionsModal.classList.add('visible');
    };

    const saveData = () => {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    };

    const loadData = () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (!storedData) {
            addRoom();
            return;
        }

        try {
            const payload = JSON.parse(storedData);
            document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
            document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
            document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
            roomsEl.innerHTML = "";
            roomCount = 0;
            if (payload.rooms && payload.rooms.length > 0) {
                payload.rooms.forEach(roomData => {
                    const roomTpl = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
                    const roomEl = roomTpl.querySelector('.room');
                    const id = `room-${++roomCount}`;
                    roomEl.dataset.roomId = id;
                    roomEl.querySelector('input[name="room_name"]').value = roomData.room_name;
                    roomsEl.appendChild(roomEl);

                    const itemsContainer = roomEl.querySelector('.items-container');
                    itemsContainer.innerHTML = '';
                    roomData.items.forEach(itemData => {
                        let itemEl;
                        if (itemData.type === 'ผ้าม่าน') {
                            itemEl = document.querySelector(SELECTORS.setTpl).content.cloneNode(true).querySelector('.item');
                            itemEl.dataset.itemId = `set-${Date.now()}`;
                            itemEl.querySelector('input[name="item_name"]').value = itemData.item_name;
                            itemEl.querySelector('select[name="type_curtain"]').value = itemData.curtain_type;
                            itemEl.querySelector('select[name="style_curtain"]').value = itemData.style;
                            itemEl.querySelector('input[name="width_m"]').value = itemData.width_m;
                            itemEl.querySelector('input[name="height_m"]').value = itemData.height_m;
                            itemEl.querySelector('input[name="price_fabric"]').value = formatNumber(itemData.price_per_yard);
                        } else if (itemData.type === 'ม่านตกแต่ง') {
                            itemEl = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true).querySelector('.item');
                            itemEl.dataset.itemId = `deco-${Date.now()}`;
                            itemEl.querySelector('input[name="item_name"]').value = itemData.item_name;
                            itemEl.querySelector('input[name="deco_count"]').value = itemData.count;
                            itemEl.querySelector('input[name="deco_price"]').value = formatNumber(itemData.price_per_unit);
                        } else if (itemData.type === 'วอลเปเปอร์') {
                            itemEl = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true).querySelector('.item');
                            itemEl.dataset.itemId = `wallpaper-${Date.now()}`;
                            itemEl.querySelector('input[name="item_name"]').value = itemData.item_name;
                            itemEl.querySelector('input[name="wallpaper_height_m"]').value = itemData.height_m;
                            itemEl.querySelector('input[name="wallpaper_price_roll"]').value = formatNumber(itemData.price_per_roll);
                            const wallsContainer = itemEl.querySelector('[data-walls-container]');
                            itemData.wall_widths_m.forEach(width => {
                                const wallEl = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true).querySelector('.wall-input-row');
                                wallEl.querySelector('input[name="wall_width_m"]').value = width;
                                wallsContainer.appendChild(wallEl);
                            });
                        }
                        if (itemEl) itemsContainer.appendChild(itemEl);
                    });
                });
            } else {
                addRoom();
            }
            recalcAll();
        } catch (e) {
            console.error("Failed to load data from storage:", e);
            localStorage.removeItem(STORAGE_KEY);
            addRoom();
        }
    };

    // --- EVENTS ---
    document.addEventListener('input', (e) => {
        const itemEl = findParentByTag(e.target, 'div');
        if (itemEl && (itemEl.classList.contains('item') || itemEl.classList.contains('md-card-sub'))) {
            recalcRoom(findParentByTag(itemEl, 'div'));
        }
        if (e.target.matches('input') || e.target.matches('select')) {
            saveData();
        }
    });

    document.addEventListener('click', (e) => {
        const action = e.target.closest('[data-act]')?.dataset.act;
        const parentRoom = e.target.closest('.room');
        const parentItem = e.target.closest('.item');
        const parentWall = e.target.closest('.wall-input-row');
        const parentDialog = e.target.closest('.dialog-scrim');

        switch(action) {
            case 'add-room':
                addRoom();
                break;
            case 'del-room':
                parentRoom.remove();
                recalcAll();
                saveData();
                break;
            case 'add-set':
                addSet(parentRoom.querySelector('.items-container'));
                break;
            case 'add-deco':
                addDeco(parentRoom.querySelector('.items-container'));
                break;
            case 'add-wallpaper':
                addWallpaper(parentRoom.querySelector('.items-container'));
                break;
            case 'del-item':
                parentItem.remove();
                recalcRoom(parentRoom);
                saveData();
                break;
            case 'add-wall':
                addWall(e.target);
                break;
            case 'del-wall':
                parentWall.remove();
                recalcRoom(findParentByTag(parentWall, 'div'));
                saveData();
                break;
            case 'submit':
                showToast("กำลังส่งข้อมูล...", "success");
                break;
            case 'copy':
                showCopyOptionsModal();
                break;
            case 'copy-cancel':
                copyOptionsModal.classList.remove('visible');
                break;
            case 'copy-confirm':
                const copyDetails = document.getElementById('copyDetails').checked;
                const copySummary = document.getElementById('copySummary').checked;
                const copyMaterials = document.getElementById('copyMaterials').checked;
                let copyType = 'none';
                if (copyDetails && copySummary && copyMaterials) {
                    copyType = 'all';
                } else if (copyDetails && copySummary) {
                    copyType = 'summary';
                } else if (copyDetails) {
                    copyType = 'details';
                } else if (copySummary) {
                    copyType = 'summary';
                } else if (copyMaterials) {
                    copyType = 'materials';
                }
                copyToClipboard(copyType);
                copyOptionsModal.classList.remove('visible');
                break;
            case 'lock':
                isLocked = !isLocked;
                updateLockState();
                break;
            case 'clear-all':
                showConfirmation("ล้างข้อมูล", "คุณต้องการล้างข้อมูลทั้งหมดหรือไม่?", () => {
                    localStorage.removeItem(STORAGE_KEY);
                    location.reload();
                });
                break;
            case 'importBtn':
                importModal.classList.add('visible');
                break;
            case 'import-cancel':
                importModal.classList.remove('visible');
                break;
            case 'import-confirm':
                try {
                    const jsonData = JSON.parse(importModal.querySelector('.import-json-area').value);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(jsonData));
                    showToast("นำเข้าข้อมูลสำเร็จ! กำลังโหลดใหม่...", "success");
                    setTimeout(() => location.reload(), 1500);
                } catch (e) {
                    showToast("JSON ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง", "error");
                }
                break;
        }

        if (parentDialog && e.target === parentDialog) {
            parentDialog.classList.remove('visible');
        }
    });

    menuBtn.addEventListener('click', (e) => {
        menuDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
    });

    window.addEventListener('load', () => {
        loadData();
        updateLockState();
    });
})();