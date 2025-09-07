(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0"; // Updated version
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WP_SQM_PER_ROLL = 5;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };

    const CALC = {
        fabricYardage: (style, width) => {
            let yard = 0;
            switch (style) {
                case 'ลอน': yard = width * 2.8; break;
                case 'ตาไก่': yard = width * 2.5; break;
                case 'จีบ': yard = width * 2.5; break;
            }
            return yard;
        },
        curtainPrice: (yardage, pricePerMeter, styleSurcharge, height) => {
            const yd_to_m = 0.9144;
            const meterage = yardage * yd_to_m;
            let price = meterage * pricePerMeter;
            for (const h of PRICING.height) {
                if (height > h.threshold) {
                    price += meterage * h.add_per_m;
                    break;
                }
            }
            return price + styleSurcharge;
        },
        decoPrice: (type, width, height, priceSqyd) => {
            const sq_m = width * height;
            const sq_yd = sq_m * SQM_TO_SQYD;
            return sq_yd * parseFloat(priceSqyd.replace(/,/g, ''));
        },
        wallpaperPrice: (widths, height, pricePerRoll) => {
            const totalWidth = widths.reduce((sum, w) => sum + parseFloat(w), 0);
            const area = totalWidth * height;
            const rollsNeeded = Math.ceil(area / WP_SQM_PER_ROLL);
            return {
                area: area,
                rolls: rollsNeeded,
                price: rollsNeeded * parseFloat(pricePerRoll.replace(/,/g, ''))
            };
        }
    };

    const SELECTORS = {
        roomsContainer: '#roomsContainer',
        addRoomBtn: '#addRoomHeaderBtn',
        orderForm: '#orderForm',
        lockBtn: '#lockBtn',
        clearAllBtn: '#clearAllBtn',
        copyTextBtn: '#copyTextBtn',
        submitBtn: '#submitBtn',
        payloadInput: '#payloadInput',
        summaryCard: '#summaryCard',
        summaryContent: '#summaryContent',
        totalPrice: '#totalPrice',
        addWpWallBtn: '#addWpWallBtn',
        wpWallsContainer: '.wallpaper-walls-input-container',
        wpHeightInput: 'input[name="wp_height"]',
        wpWidthInputs: 'input[name="wp_width[]"]',
        wpPriceInput: 'input[name="wp_price_per_roll"]',
    };

    let isLocked = false;
    let roomCount = 0;
    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    const lockBtn = document.querySelector(SELECTORS.lockBtn);
    const clearAllBtn = document.querySelector(SELECTORS.clearAllBtn);
    const copyTextBtn = document.querySelector(SELECTORS.copyTextBtn);
    const submitBtn = document.querySelector(SELECTORS.submitBtn);

    const formatPrice = (price) => new Intl.NumberFormat('th-TH').format(Math.round(price));
    const parsePrice = (priceStr) => parseFloat(priceStr.replace(/,/g, ''));

    const showToast = (message, type) => {
        const toastContainer = document.querySelector('#toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => toast.classList.remove('show'), 3000);
        setTimeout(() => toast.remove(), 3300);
    };

    const updateLockState = () => {
        isLocked = lockBtn.dataset.isLocked === 'true';
        document.querySelectorAll(SELECTORS.orderForm + ' .field, .room-head button, .deco-row button, .curtain-row button, .wallpaper-section button').forEach(el => {
            el.disabled = isLocked;
        });
        document.querySelector(SELECTORS.addRoomBtn).disabled = isLocked;
        document.querySelector(SELECTORS.addWpWallBtn).disabled = isLocked;
        lockBtn.textContent = isLocked ? 'ปลดล็อค 🔓' : 'ล็อค 🔒';
        submitBtn.disabled = false;
    };

    const updateSummary = () => {
        let grandTotal = 0;
        let totalFabricYardage = 0;
        let totalSheerYardage = 0;
        const summary = {
            rooms: [],
            wallpaper: null,
            total: 0
        };

        document.querySelectorAll('.room').forEach((roomEl, roomIndex) => {
            const roomName = roomEl.querySelector('input[name="room_name"]').value;
            const roomData = { name: roomName, curtains: [], decos: [], total: 0 };
            let roomTotal = 0;
            let roomFabricYardage = 0;
            let roomSheerYardage = 0;

            roomEl.querySelectorAll('.curtain').forEach(curtainEl => {
                const width = parseFloat(curtainEl.querySelector('input[name="curtain_width_m"]').value) || 0;
                const height = parseFloat(curtainEl.querySelector('input[name="curtain_height_m"]').value) || 0;
                const fabricType = curtainEl.querySelector('select[name="curtain_fabric_type"]').value;
                const style = curtainEl.querySelector('select[name="curtain_style"]').value;
                const openType = curtainEl.querySelector('select[name="curtain_open_type"]').value;
                const pricePerMeter = parsePrice(curtainEl.querySelector('input[name="curtain_price_m"]').value) || 0;
                const styleSurcharge = PRICING.style_surcharge[style] || 0;

                let curtainYardage = 0;
                let curtainPrice = 0;

                if (fabricType === 'ทึบ&โปร่ง') {
                    curtainYardage = CALC.fabricYardage(style, width);
                    curtainPrice = CALC.curtainPrice(curtainYardage, pricePerMeter, styleSurcharge, height) * 2;
                    roomFabricYardage += curtainYardage;
                    roomSheerYardage += curtainYardage;
                } else if (fabricType === 'ทึบ') {
                    curtainYardage = CALC.fabricYardage(style, width);
                    curtainPrice = CALC.curtainPrice(curtainYardage, pricePerMeter, styleSurcharge, height);
                    roomFabricYardage += curtainYardage;
                } else if (fabricType === 'โปร่ง') {
                    curtainYardage = CALC.fabricYardage(style, width);
                    curtainPrice = CALC.curtainPrice(curtainYardage, pricePerMeter, styleSurcharge, height);
                    roomSheerYardage += curtainYardage;
                }

                roomTotal += curtainPrice;
                roomData.curtains.push({
                    width, height, fabricType, style, openType,
                    price: curtainPrice, yardage: curtainYardage
                });
            });

            roomEl.querySelectorAll('.deco-item').forEach(decoEl => {
                const type = decoEl.querySelector('select[name="deco_type"]').value;
                const width = parseFloat(decoEl.querySelector('input[name="deco_width_m"]').value) || 0;
                const height = parseFloat(decoEl.querySelector('input[name="deco_height_m"]').value) || 0;
                const priceSqyd = decoEl.querySelector('input[name="deco_price_sqyd"]').value;

                const decoPrice = CALC.decoPrice(type, width, height, priceSqyd) || 0;
                roomTotal += decoPrice;
                roomData.decos.push({ type, width, height, price: decoPrice });
            });

            grandTotal += roomTotal;
            totalFabricYardage += roomFabricYardage;
            totalSheerYardage += roomSheerYardage;
            roomData.total = roomTotal;
            summary.rooms.push(roomData);
        });
        
        // Wallpaper Calculation
        let wallpaperTotal = 0;
        const wpHeight = parseFloat(document.querySelector(SELECTORS.wpHeightInput).value) || 0;
        const wpWidths = Array.from(document.querySelectorAll(SELECTORS.wpWidthInputs)).map(input => parseFloat(input.value) || 0);
        const wpPricePerRoll = parsePrice(document.querySelector(SELECTORS.wpPriceInput).value) || 0;
        
        if (wpHeight > 0 && wpPricePerRoll > 0 && wpWidths.some(w => w > 0)) {
            const result = CALC.wallpaperPrice(wpWidths, wpHeight, wpPricePerRoll);
            wallpaperTotal = result.price;
            grandTotal += wallpaperTotal;
            summary.wallpaper = {
                height: wpHeight,
                widths: wpWidths,
                area: result.area,
                rolls: result.rolls,
                price: wallpaperTotal
            };
        }

        summary.total = grandTotal;
        summary.totalFabricYardage = totalFabricYardage;
        summary.totalSheerYardage = totalSheerYardage;

        document.querySelector(SELECTORS.totalPrice).textContent = formatPrice(grandTotal);

        return summary;
    };

    const buildPayload = () => {
        const payload = {
            app_version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            rooms: [],
            wallpaper: null,
            total_price: 0,
            total_fabric_yardage: 0,
            total_sheer_yardage: 0
        };

        // ... (room payload logic is the same as before)
        document.querySelectorAll('.room').forEach(roomEl => {
            const roomPayload = {
                room_name: roomEl.querySelector('input[name="room_name"]').value,
                curtains: [],
                decos: []
            };
            roomEl.querySelectorAll('.curtain').forEach(curtainEl => {
                roomPayload.curtains.push({
                    width_m: parseFloat(curtainEl.querySelector('input[name="curtain_width_m"]').value) || 0,
                    height_m: parseFloat(curtainEl.querySelector('input[name="curtain_height_m"]').value) || 0,
                    fabric_price_m: parsePrice(curtainEl.querySelector('input[name="curtain_price_m"]').value) || 0,
                    fabric_type: curtainEl.querySelector('select[name="curtain_fabric_type"]').value,
                    style: curtainEl.querySelector('select[name="curtain_style"]').value,
                    open_type: curtainEl.querySelector('select[name="curtain_open_type"]').value
                });
            });
            roomEl.querySelectorAll('.deco-item').forEach(decoEl => {
                roomPayload.decos.push({
                    deco_type: decoEl.querySelector('select[name="deco_type"]').value,
                    deco_width_m: parseFloat(decoEl.querySelector('input[name="deco_width_m"]').value) || 0,
                    deco_height_m: parseFloat(decoEl.querySelector('input[name="deco_height_m"]').value) || 0,
                    deco_price_sqyd: parsePrice(decoEl.querySelector('input[name="deco_price_sqyd"]').value) || 0
                });
            });
            payload.rooms.push(roomPayload);
        });

        const wpHeight = parseFloat(document.querySelector(SELECTORS.wpHeightInput).value) || 0;
        const wpWidths = Array.from(document.querySelectorAll(SELECTORS.wpWidthInputs)).map(input => parseFloat(input.value) || 0);
        const wpPricePerRoll = parsePrice(document.querySelector(SELECTORS.wpPriceInput).value) || 0;
        
        if (wpHeight > 0 && wpPricePerRoll > 0 && wpWidths.some(w => w > 0)) {
            const result = CALC.wallpaperPrice(wpWidths, wpHeight, wpPricePerRoll);
            payload.wallpaper = {
                height: wpHeight,
                widths: wpWidths,
                area: result.area,
                rolls_needed: result.rolls,
                price: result.price
            };
        }

        const summaryData = updateSummary();
        payload.total_price = summaryData.total;
        payload.total_fabric_yardage = summaryData.totalFabricYardage;
        payload.total_sheer_yardage = summaryData.totalSheerYardage;

        return payload;
    };

    // ... (rest of the event listeners)
    const setupEventListeners = (el) => {
        el.addEventListener('input', updateSummary);
        el.querySelector('[data-act="toggle-suspend"]').addEventListener('click', () => {
            const suspendText = el.querySelector('[data-suspend-text]');
            const isSuspended = suspendText.textContent === 'ระงับ';
            el.dataset.suspended = !isSuspended;
            suspendText.textContent = isSuspended ? 'เปิดใช้งาน' : 'ระงับ';
            el.querySelectorAll('.field').forEach(field => field.disabled = !isSuspended);
            updateSummary();
        });
        el.querySelector('[data-act="clear-deco"]').addEventListener('click', () => {
            el.querySelectorAll('.field').forEach(field => {
                if (field.type === 'number' || field.type === 'text') field.value = '';
                else field.selectedIndex = 0;
            });
            updateSummary();
        });
    };

    const addRoom = () => {
        const roomIndex = roomCount++;
        const roomCard = document.createElement('div');
        roomCard.className = `card room`;
        roomCard.dataset.roomIndex = roomIndex;
        roomCard.style.setProperty('--room-bg', `var(--room${(roomIndex % 3) + 1}-bg)`);
        
        roomCard.innerHTML = `
            <div class="room-head">
                <input class="field room-name" type="text" name="room_name" placeholder="ชื่อห้อง เช่น ห้องนอน" />
                <span style="flex:1;"></span>
                <button type="button" class="btn btn-xs btn-danger" data-act="del-room">ลบห้อง</button>
            </div>
            <div class="row two-col" style="margin-bottom: 8px;">
                <div><label>ราคาผ้าทึบ/ม.</label><input class="field" name="curtain_price_m" type="text" inputmode="numeric" placeholder="ตัวอย่าง: 1500" /></div>
                <div><label>ราคาผ้าโปร่ง/ม.</label><input class="field" name="sheer_price_m" type="text" inputmode="numeric" placeholder="ตัวอย่าง: 1200" /></div>
            </div>
            <div class="curtain-container">
                <div class="curtain" data-curtain-index="0">
                    <div class="row curtain-row">
                        <div class="item-badge" data-item-title="Curtain" style="background-color: var(--primary);"></div>
                        <div><label>สไตล์</label><select class="field" name="curtain_style" required><option value="" hidden>เลือก</option><option>ลอน</option><option>ตาไก่</option><option>จีบ</option></select></div>
                        <div><label>กว้าง(ม.)</label><input class="field" name="curtain_width_m" type="number" step="0.01" min="0" required /></div>
                        <div><label>สูง(ม.)</label><input class="field" name="curtain_height_m" type="number" step="0.01" min="0" required /></div>
                        <div><label>ชนิดผ้า</label><select class="field" name="curtain_fabric_type" required><option value="" hidden>เลือก</option><option>ทึบ</option><option>โปร่ง</option><option>ทึบ&โปร่ง</option></select></div>
                        <div><label>เปิด</label><select class="field" name="curtain_open_type" required><option value="" hidden>เลือก</option><option>แยกกลาง</option><option>สไลด์เดี่ยว</option></select></div>
                    </div>
                    <div class="actions">
                        <button type="button" class="btn btn-xs btn-warning" data-act="toggle-suspend" style="--primary: var(--warning);"><span data-suspend-text>ระงับ</span></button>
                        <span style="flex:1;"></span>
                        <button type="button" class="btn btn-icon btn-danger" data-act="del-curtain" title="ลบรายการ">✕</button>
                    </div>
                </div>
            </div>
            <div class="deco-container">
                <div class="deco-item" data-deco-index="0">
                    <div class="row deco-row">
                        <div class="item-badge" data-item-title="Decoration" style="background-color: var(--secondary);"></div>
                        <div><label>ประเภท</label><select class="field" name="deco_type" required><option value="" hidden>เลือก</option><option>มู่ลี่ไม้</option><option>ม่านม้วน</option><option>ปรับแสง</option><option>ฉากPVC</option></select></div>
                        <div><label>กว้าง(ม.)</label><input class="field" name="deco_width_m" type="number" step="0.01" min="0" required /></div>
                        <div><label>สูง(ม.)</label><input class="field" name="deco_height_m" type="number" step="0.01" min="0" required /></div>
                        <div><label>ราคา/ตร.หลา</label><input class="field" name="deco_price_sqyd" type="text" inputmode="numeric" required /></div>
                    </div>
                    <div class="actions">
                        <button type="button" class="btn btn-xs btn-warning" data-act="toggle-suspend" style="--primary: var(--warning);"><span data-suspend-text>ระงับ</span></button>
                        <span style="flex:1;"></span>
                        <button type="button" class="btn btn-icon btn-danger" data-act="del-deco" title="ลบรายการ">✕</button>
                    </div>
                </div>
            </div>
            <div class="row">
                <button type="button" class="btn btn-xs btn-primary outline add-curtain-btn">+ เพิ่มม่าน</button>
                <button type="button" class="btn btn-xs btn-secondary outline add-deco-btn">+ เพิ่มรายการตกแต่ง</button>
            </div>
        `;
        
        roomsEl.appendChild(roomCard);
        
        const addCurtainBtn = roomCard.querySelector('.add-curtain-btn');
        addCurtainBtn.addEventListener('click', () => {
            const curtainContainer = roomCard.querySelector('.curtain-container');
            const newCurtainIndex = curtainContainer.children.length;
            const newCurtain = document.createElement('div');
            newCurtain.className = 'curtain';
            newCurtain.dataset.curtainIndex = newCurtainIndex;
            newCurtain.innerHTML = `
                <div class="row curtain-row">
                    <div class="item-badge" data-item-title="Curtain" style="background-color: var(--primary);"></div>
                    <div><label>สไตล์</label><select class="field" name="curtain_style" required><option value="" hidden>เลือก</option><option>ลอน</option><option>ตาไก่</option><option>จีบ</option></select></div>
                    <div><label>กว้าง(ม.)</label><input class="field" name="curtain_width_m" type="number" step="0.01" min="0" required /></div>
                    <div><label>สูง(ม.)</label><input class="field" name="curtain_height_m" type="number" step="0.01" min="0" required /></div>
                    <div><label>ชนิดผ้า</label><select class="field" name="curtain_fabric_type" required><option value="" hidden>เลือก</option><option>ทึบ</option><option>โปร่ง</option><option>ทึบ&โปร่ง</option></select></div>
                    <div><label>เปิด</label><select class="field" name="curtain_open_type" required><option value="" hidden>เลือก</option><option>แยกกลาง</option><option>สไลด์เดี่ยว</option></select></div>
                </div>
                <div class="actions">
                    <button type="button" class="btn btn-xs btn-warning" data-act="toggle-suspend" style="--primary: var(--warning);"><span data-suspend-text>ระงับ</span></button>
                    <span style="flex:1;"></span>
                    <button type="button" class="btn btn-icon btn-danger" data-act="del-curtain" title="ลบรายการ">✕</button>
                </div>
            `;
            curtainContainer.appendChild(newCurtain);
            setupEventListeners(newCurtain);
            updateLockState();
        });

        const addDecoBtn = roomCard.querySelector('.add-deco-btn');
        addDecoBtn.addEventListener('click', () => {
            const decoContainer = roomCard.querySelector('.deco-container');
            const newDecoIndex = decoContainer.children.length;
            const newDeco = document.createElement('div');
            newDeco.className = 'deco-item';
            newDeco.dataset.decoIndex = newDecoIndex;
            newDeco.innerHTML = `
                <div class="row deco-row">
                    <div class="item-badge" data-item-title="Decoration" style="background-color: var(--secondary);"></div>
                    <div><label>ประเภท</label><select class="field" name="deco_type" required><option value="" hidden>เลือก</option><option>มู่ลี่ไม้</option><option>ม่านม้วน</option><option>ปรับแสง</option><option>ฉากPVC</option></select></div>
                    <div><label>กว้าง(ม.)</label><input class="field" name="deco_width_m" type="number" step="0.01" min="0" required /></div>
                    <div><label>สูง(ม.)</label><input class="field" name="deco_height_m" type="number" step="0.01" min="0" required /></div>
                    <div><label>ราคา/ตร.หลา</label><input class="field" name="deco_price_sqyd" type="text" inputmode="numeric" required /></div>
                </div>
                <div class="actions">
                    <button type="button" class="btn btn-xs btn-warning" data-act="toggle-suspend" style="--primary: var(--warning);"><span data-suspend-text>ระงับ</span></button>
                    <span style="flex:1;"></span>
                    <button type="button" class="btn btn-icon btn-danger" data-act="del-deco" title="ลบรายการ">✕</button>
                </div>
            `;
            decoContainer.appendChild(newDeco);
            setupEventListeners(newDeco);
            updateLockState();
        });

        roomCard.querySelector('[data-act="del-room"]').addEventListener('click', () => {
            roomCard.remove();
            updateSummary();
        });

        roomCard.querySelectorAll('[data-act="del-curtain"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.curtain').remove();
                updateSummary();
            });
        });

        roomCard.querySelectorAll('[data-act="del-deco"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.deco-item').remove();
                updateSummary();
            });
        });

        setupEventListeners(roomCard);
        updateSummary();
        updateLockState();
    };

    const buildTextSummary = (payload) => {
        let summaryText = `--- ข้อมูลลูกค้า ---\n`;
        summaryText += `ชื่อ: ${payload.customer_name || '-'}\n`;
        summaryText += `ที่อยู่: ${payload.customer_address || '-'}\n`;
        summaryText += `เบอร์โทร: ${payload.customer_phone || '-'}\n\n`;
        summaryText += `--- รายละเอียดแต่ละจุด ---\n\n`;

        payload.rooms.forEach((room) => {
            if (room.room_name) summaryText += `** ห้อง: ${room.room_name} **\n\n`;
            room.curtains.forEach((curtain) => {
                const stylePrice = PRICING.fabric[PRICING.fabric.indexOf(curtain.fabric_price_m)] || curtain.fabric_price_m;
                summaryText += `• จุดที่ ${room.curtains.indexOf(curtain) + 1}: กว้าง ${curtain.width_m.toFixed(2)} ม. x สูง ${curtain.height_m.toFixed(2)} ม.\n`;
                summaryText += `  - สไตล์: ${curtain.style} | ชนิด: ${curtain.fabric_type} | เปิด: ${curtain.open_type}\n`;
                summaryText += `  - ราคาผ้า: ${stylePrice} บ./ม. | ราคารวม: ${formatPrice(curtain.price)} บ.\n`;
            });
            room.decos.forEach((deco) => {
                summaryText += `\n• รายการตกแต่งที่ ${room.decos.indexOf(deco) + 1}: ${deco.deco_type}\n`;
                summaryText += `  - กว้าง ${deco.deco_width_m.toFixed(2)} ม. x สูง ${deco.deco_height_m.toFixed(2)} ม.\n`;
                summaryText += `  - ราคา: ${formatPrice(deco.price)} บ.\n`;
            });
            if (room.curtains.length > 0 || room.decos.length > 0) summaryText += `\n`;
        });
        
        // Add wallpaper to summary
        if (payload.wallpaper) {
            summaryText += `** งานวอลล์เปเปอร์ **\n\n`;
            summaryText += `• ความสูงห้อง: ${payload.wallpaper.height.toFixed(2)} ม.\n`;
            summaryText += `• ความกว้างผนัง: ${payload.wallpaper.widths.map(w => w.toFixed(2)).join(' ม., ')} ม. (รวม ${payload.wallpaper.widths.reduce((sum, w) => sum + w, 0).toFixed(2)} ม.)\n`;
            summaryText += `• พื้นที่รวม: ${payload.wallpaper.area.toFixed(2)} ตร.ม.\n`;
            summaryText += `• จำนวนม้วนที่ใช้: ${payload.wallpaper.rolls_needed} ม้วน\n`;
            summaryText += `• ราคารวม: ${formatPrice(payload.wallpaper.price)} บ.\n\n`;
        }

        summaryText += `--- สรุปยอดรวม ---\n`;
        summaryText += `ราคารวม: ${formatPrice(payload.total_price)} บาท\n`;
        summaryText += `ผ้าทึบที่ใช้: ${payload.total_fabric_yardage.toFixed(2)} หลา\n`;
        summaryText += `ผ้าโปร่งที่ใช้: ${payload.total_sheer_yardage.toFixed(2)} หลา`;
        
        return summaryText;
    };

    // New Wallpaper Wall functions
    const addWpWall = () => {
        const container = document.querySelector(SELECTORS.wpWallsContainer);
        const newIndex = container.children.length;
        const newWallEl = document.createElement('div');
        newWallEl.className = 'wallpaper-wall-item';
        newWallEl.dataset.wallIndex = newIndex;
        newWallEl.innerHTML = `
            <input class="field" type="number" step="0.01" min="0" name="wp_width[]" placeholder="ผนัง ${newIndex + 1}" />
            <button type="button" class="btn btn-icon btn-danger" data-act="del-wp-wall" title="ลบผนัง">✕</button>
        `;
        container.appendChild(newWallEl);
        newWallEl.querySelector('[data-act="del-wp-wall"]').addEventListener('click', () => {
            newWallEl.remove();
            updateSummary();
        });
        updateLockState();
        updateSummary();
    };
    
    // Initial setup and event listeners
    document.addEventListener('DOMContentLoaded', () => {
        // ... (existing load logic)
        const wpHeightInput = document.querySelector(SELECTORS.wpHeightInput);
        const wpPriceInput = document.querySelector(SELECTORS.wpPriceInput);
        const wpWallsContainer = document.querySelector(SELECTORS.wpWallsContainer);

        wpHeightInput.addEventListener('input', updateSummary);
        wpPriceInput.addEventListener('input', updateSummary);
        wpWallsContainer.addEventListener('input', updateSummary);
        document.querySelector(SELECTORS.addWpWallBtn).addEventListener('click', addWpWall);

        // ... (existing button listeners)
        document.querySelector(SELECTORS.addRoomBtn).addEventListener('click', addRoom);
        lockBtn.addEventListener('click', () => {
            lockBtn.dataset.isLocked = lockBtn.dataset.isLocked === 'true' ? 'false' : 'true';
            updateLockState();
        });
        clearAllBtn.addEventListener('click', () => {
            if (confirm('คุณแน่ใจหรือไม่ว่าจะล้างข้อมูลทั้งหมด?')) {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            }
        });
        copyTextBtn.addEventListener('click', () => {
            const payload = buildPayload();
            const textSummary = buildTextSummary(payload);
            navigator.clipboard.writeText(textSummary).then(() => {
                showToast('คัดลอกข้อมูลสำเร็จแล้ว', 'success');
            }).catch(err => {
                showToast('คัดลอกข้อมูลไม่สำเร็จ', 'danger');
                console.error('Failed to copy text: ', err);
            });
        });
        orderForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const submitBtn = document.querySelector(SELECTORS.submitBtn);
            submitBtn.disabled = true;
            submitBtn.textContent = 'กำลังส่ง...';
            document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
            // This part is for demonstration and assumes a successful send.
            setTimeout(() => {
                submitBtn.disabled = isLocked;
                submitBtn.textContent = 'ส่งไปคำนวณ';
                showToast('ส่งข้อมูลสำเร็จแล้ว', 'success');
            }, 3000);
        });

        // Load data from localStorage on page load
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
                
                roomsEl.innerHTML = ""; roomCount = 0;
                if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
                else addRoom();

                if (payload.wallpaper) {
                    document.querySelector(SELECTORS.wpHeightInput).value = payload.wallpaper.height || '';
                    document.querySelector(SELECTORS.wpPriceInput).value = payload.wallpaper.price_per_roll || '';
                    const wpWallsContainer = document.querySelector(SELECTORS.wpWallsContainer);
                    wpWallsContainer.innerHTML = '';
                    payload.wallpaper.widths.forEach((width, index) => {
                        const newWallEl = document.createElement('div');
                        newWallEl.className = 'wallpaper-wall-item';
                        newWallEl.dataset.wallIndex = index;
                        newWallEl.innerHTML = `
                            <input class="field" type="number" step="0.01" min="0" name="wp_width[]" value="${width}" placeholder="ผนัง ${index + 1}" />
                            <button type="button" class="btn btn-icon btn-danger" data-act="del-wp-wall" title="ลบผนัง">✕</button>
                        `;
                        wpWallsContainer.appendChild(newWallEl);
                        newWallEl.querySelector('[data-act="del-wp-wall"]').addEventListener('click', () => {
                            newWallEl.remove();
                            updateSummary();
                        });
                    });
                    if (payload.wallpaper.widths.length === 0) {
                        addWpWall();
                    }
                }

            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY);
                addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
        updateSummary();
    });
})();