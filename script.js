(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.2.0";
    // REMINDER: Replace this with your actual webhook URL
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };
    const CALC = {
        fabricYardage: (style, width) => {
            if (style === "ตาไก่" || style === "จีบ") {
                return (width * 2.0 + 0.6) / 0.9;
            } else if (style === "ลอน") {
                return (width * 2.6 + 0.6) / 0.9;
            }
            return 0;
        },
        heightSurcharge: (height) => {
            let surcharge = 0;
            for (const item of PRICING.height) {
                if (height > item.threshold) {
                    surcharge += (height - item.threshold) * item.add_per_m;
                    height = item.threshold;
                }
            }
            return surcharge;
        },
        calculatePrices: (item) => {
            const result = {
                opaque_fabric_cost: 0,
                sheer_fabric_cost: 0,
                deco_cost: 0,
                track_cost: 0,
                style_cost: 0,
                surcharge_cost: 0,
                total_cost: 0,
                room_total_cost: 0,
            };

            if (item.opaque_fabric_id !== "" && item.width_m > 0) {
                const pricePerYard = PRICING.fabric[item.opaque_fabric_id];
                const fabricYards = CALC.fabricYardage(item.style, item.width_m);
                const surcharge = CALC.heightSurcharge(item.height_m);
                result.opaque_fabric_cost = Math.ceil(fabricYards) * pricePerYard;
                result.surcharge_cost = surcharge * Math.ceil(item.width_m);
                result.style_cost = PRICING.style_surcharge[item.style] * item.width_m;
                result.track_cost = item.width_m * (item.style === "ตาไก่" ? 250 : 200);
            }

            if (item.sheer_fabric_id !== "" && item.width_m > 0) {
                const pricePerYard = PRICING.sheer[item.sheer_fabric_id];
                const fabricYards = CALC.fabricYardage(item.style, item.width_m);
                result.sheer_fabric_cost = Math.ceil(fabricYards) * pricePerYard;
            }

            result.total_cost = result.opaque_fabric_cost + result.sheer_fabric_cost + result.track_cost + result.style_cost + result.surcharge_cost;
            result.room_total_cost = result.total_cost;
            return result;
        },
        calculateDecoPrices: (deco) => {
            const sqYd = deco.deco_width_m * deco.deco_height_m * SQM_TO_SQYD;
            return sqYd * parseFloat(deco.deco_price_sqyd);
        }
    };

    const SELECTORS = {
        roomsContainer: '#roomsContainer',
        addRoomHeaderBtn: '#addRoomHeaderBtn',
        lockBtn: '#lockBtn',
        clearAllBtn: '#clearAllBtn',
        saveBtn: '#saveBtn',
        loadBtn: '#loadBtn',
        summaryBtn: '#summaryBtn',
        submitBtn: '#submitBtn',
        orderForm: '#orderForm',
        payloadInput: '#payloadInput',
    };

    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    let roomCount = 0;
    let isLocked = false;

    function showToast(message, type = 'info') {
        const toastContainer = document.querySelector('.toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    function debounce(func, timeout = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => { func.apply(this, args); }, timeout);
        };
    }

    function clamp01(v) {
        v = parseFloat(v);
        return (isNaN(v) || v < 0) ? 0 : v;
    }

    function renumber() {
        roomsEl.querySelectorAll('.room').forEach((roomEl, roomIndex) => {
            const roomNameEl = roomEl.querySelector('.room-head .room-name');
            roomNameEl.textContent = `ห้อง ${roomIndex + 1}`;
            roomNameEl.dataset.roomIndex = roomIndex;
            roomEl.querySelectorAll('.curtain-item').forEach((itemEl, itemIndex) => {
                itemEl.querySelector('.item-badge').textContent = `${itemIndex + 1}`;
                itemEl.querySelector('.item-badge').dataset.itemIndex = itemIndex;
            });
            roomEl.querySelectorAll('.deco-item').forEach((decoEl, decoIndex) => {
                decoEl.querySelector('.item-badge').textContent = `${decoIndex + 1}`;
                decoEl.querySelector('.item-badge').dataset.itemIndex = decoIndex;
            });
        });
    }

    function recalcAll() {
        const rooms = document.querySelectorAll('.room');
        rooms.forEach(roomEl => {
            let roomTotal = 0;
            const curtainItems = roomEl.querySelectorAll('.curtain-item');
            curtainItems.forEach(itemEl => {
                const fields = itemEl.querySelectorAll('.field');
                const values = {};
                fields.forEach(f => values[f.name] = f.type === 'text' ? f.value : f.value.trim());

                if (values.width_m === '' || values.height_m === '' || values.opaque_fabric_id === '') {
                    itemEl.querySelector('[data-cost-display]').textContent = '0.00';
                    return;
                }

                const prices = CALC.calculatePrices({
                    style: itemEl.querySelector('[name="style"]').value,
                    width_m: clamp01(values.width_m),
                    height_m: clamp01(values.height_m),
                    opaque_fabric_id: values.opaque_fabric_id,
                    sheer_fabric_id: values.sheer_fabric_id,
                });
                itemEl.querySelector('[data-cost-display]').textContent = prices.total_cost.toLocaleString('th-TH');
                roomTotal += prices.total_cost;
            });

            const decoItems = roomEl.querySelectorAll('.deco-item');
            decoItems.forEach(decoEl => {
                const fields = decoEl.querySelectorAll('.field');
                const values = {};
                fields.forEach(f => values[f.name] = f.type === 'text' ? f.value : f.value.trim());

                if (values.deco_width_m === '' || values.deco_height_m === '' || values.deco_price_sqyd === '') {
                    decoEl.querySelector('[data-deco-cost-display]').textContent = '0.00';
                    return;
                }

                const price = CALC.calculateDecoPrices({
                    deco_width_m: clamp01(values.deco_width_m),
                    deco_height_m: clamp01(values.deco_height_m),
                    deco_price_sqyd: values.deco_price_sqyd,
                });
                decoEl.querySelector('[data-deco-cost-display]').textContent = price.toLocaleString('th-TH');
                roomTotal += price;
            });

            roomEl.querySelector('[data-room-total]').textContent = roomTotal.toLocaleString('th-TH');
        });

        updateSummary();
        saveData();
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            install_price: parseFloat(document.querySelector('input[name="install_price"]').value),
            delivery_price: parseFloat(document.querySelector('input[name="delivery_price"]').value),
            rooms: [],
        };
        document.querySelectorAll('.room').forEach(roomEl => {
            const roomData = {
                items: [],
                decos: [],
            };
            roomEl.querySelectorAll('.curtain-item').forEach(itemEl => {
                const itemData = {};
                itemEl.querySelectorAll('.field').forEach(f => itemData[f.name] = f.type === 'number' ? clamp01(f.value) : f.value);
                roomData.items.push(itemData);
            });
            roomEl.querySelectorAll('.deco-item').forEach(decoEl => {
                const decoData = {};
                decoEl.querySelectorAll('.field').forEach(f => decoData[f.name] = f.type === 'number' ? clamp01(f.value) : f.value);
                roomData.decos.push(decoData);
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function saveData() {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (err) {
            console.error("Failed to save data to storage:", err);
            showToast('ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    }

    function addRoom(roomPayload = null) {
        roomCount++;
        const roomEl = document.createElement('div');
        roomEl.className = 'card room';
        roomEl.dataset.roomIndex = roomCount - 1;
        roomEl.innerHTML = `
            <div class="row room-head">
                <span class="room-name" data-room-index="${roomCount - 1}">ห้อง ${roomCount}</span>
                <span style="flex:1;"></span>
                <button type="button" class="btn btn-xs btn-primary outline" data-act="add-curtain">+ เพิ่มผ้าม่าน</button>
                <button type="button" class="btn btn-xs btn-primary outline" data-act="add-deco">+ เพิ่มรายการตกแต่ง</button>
                <button type="button" class="btn btn-icon btn-danger" data-act="del-room" title="ลบห้อง">✕</button>
            </div>
            <div class="room-items"></div>
            <div class="row summary">
                <div class="summary-details">
                    <div>รวม: <span data-room-total>0</span></div>
                    <div class="summary-popup"></div>
                </div>
            </div>
        `;
        const itemsContainer = roomEl.querySelector('.room-items');

        const addCurtainItem = (itemPayload = null) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'curtain-item';
            itemEl.innerHTML = `
                <div class="row head-row">
                    <div class="item-badge" data-item-title></div>
                    <button type="button" class="btn btn-xs btn-warning" data-act="toggle-suspend" style="--primary: var(--warning);"><span data-suspend-text>ระงับ</span></button>
                    <span style="flex:1;"></span>
                    <button type="button" class="btn btn-xs" data-act="clear-curtain">ล้าง</button>
                    <button type="button" class="btn btn-icon btn-danger" data-act="del-item" title="ลบรายการ">✕</button>
                </div>
                <div class="row curtain-row">
                    <div><label>สไตล์</label><select class="field" name="style" required><option value="" hidden>เลือก</option><option>ตาไก่</option><option>จีบ</option><option>ลอน</option></select></div>
                    <div><label>กว้าง(ม.)</label><input class="field" name="width_m" type="number" step="0.01" min="0" required /></div>
                    <div><label>สูง(ม.)</label><input class="field" name="height_m" type="number" step="0.01" min="0" required /></div>
                    <div><label>ผ้าทึบ</label><select class="field" name="opaque_fabric_id" required><option value="" hidden>เลือก</option>${PRICING.fabric.map((p, i) => `<option value="${i}">ผ้าทึบ ${i + 1} (${p} บ./หลา)</option>`).join('')}</select></div>
                    <div><label>ผ้าโปร่ง</label><select class="field" name="sheer_fabric_id"><option value="">ไม่มี</option>${PRICING.sheer.map((p, i) => `<option value="${i}">ผ้าโปร่ง ${i + 1} (${p} บ./หลา)</option>`).join('')}</select></div>
                </div>
                <div class="row cost-row">
                    <span>ราคา:</span>
                    <span class="cost-display" data-cost-display>0.00</span>
                </div>
            `;
            itemsContainer.appendChild(itemEl);
            if (itemPayload) {
                for (const key in itemPayload) {
                    const field = itemEl.querySelector(`[name="${key}"]`);
                    if (field) field.value = itemPayload[key];
                }
            }
        };

        const addDecoItem = (decoPayload = null) => {
            const decoEl = document.createElement('div');
            decoEl.className = 'deco-item';
            decoEl.innerHTML = `
                <div class="row head-row">
                    <div class="item-badge" data-item-title style="background-color: var(--secondary);"></div>
                    <button type="button" class="btn btn-xs btn-warning" data-act="toggle-suspend" style="--primary: var(--warning);"><span data-suspend-text>ระงับ</span></button>
                    <span style="flex:1;"></span>
                    <button type="button" class="btn btn-xs" data-act="clear-deco">ล้าง</button>
                    <button type="button" class="btn btn-icon btn-danger" data-act="del-deco" title="ลบรายการ">✕</button>
                </div>
                <div class="row deco-row">
                    <div><label>ประเภท</label><select class="field" name="deco_type" required><option value="" hidden>เลือก</option><option>มู่ลี่ไม้</option><option>ม่านม้วน</option><option>ปรับแสง</option><option>ฉากPVC</option></select></div>
                    <div><label>กว้าง(ม.)</label><input class="field" name="deco_width_m" type="number" step="0.01" min="0" required /></div>
                    <div><label>สูง(ม.)</label><input class="field" name="deco_height_m" type="number" step="0.01" min="0" required /></div>
                    <div><label>ราคา/ตร.หลา</label><input class="field" name="deco_price_sqyd" type="text" inputmode="numeric" required /></div>
                </div>
                <div class="row cost-row">
                    <span>ราคา:</span>
                    <span class="cost-display" data-deco-cost-display>0.00</span>
                </div>
            `;
            itemsContainer.appendChild(decoEl);
            if (decoPayload) {
                for (const key in decoPayload) {
                    const field = decoEl.querySelector(`[name="${key}"]`);
                    if (field) field.value = decoPayload[key];
                }
            }
        };

        if (roomPayload) {
            roomPayload.items.forEach(addCurtainItem);
            roomPayload.decos.forEach(addDecoItem);
        } else {
            addCurtainItem();
        }

        roomsEl.appendChild(roomEl);
        renumber();
        recalcAll();
    }

    function updateLockState() {
        const lockIcon = document.querySelector('.lock-icon');
        const lockText = document.querySelector('.lock-text');
        const formEl = document.querySelector(SELECTORS.orderForm);
        const inputs = formEl.querySelectorAll('input, select, button:not(#lockBtn):not(#summaryBtn):not(#loadBtn)');
        
        isLocked = localStorage.getItem('isLocked') === 'true';

        if (isLocked) {
            lockIcon.textContent = '🔒';
            lockText.textContent = 'ปลดล็อค';
            inputs.forEach(el => el.disabled = true);
            showToast('แอปพลิเคชันถูกล็อคแล้ว', 'info');
        } else {
            lockIcon.textContent = '🔓';
            lockText.textContent = 'ล็อค';
            inputs.forEach(el => el.disabled = false);
            showToast('แอปพลิเคชันถูกปลดล็อคแล้ว', 'info');
        }
    }

    function updateSummary() {
        const rooms = document.querySelectorAll('.room');
        const totalItems = document.querySelectorAll('.curtain-item').length + document.querySelectorAll('.deco-item').length;
        const totalCost = Array.from(rooms).reduce((sum, roomEl) => sum + parseFloat(roomEl.querySelector('[data-room-total]').textContent.replace(/,/g, '') || 0), 0);
        const installPrice = parseFloat(document.querySelector('input[name="install_price"]').value || 0);
        const deliveryPrice = parseFloat(document.querySelector('input[name="delivery_price"]').value || 0);
        
        document.querySelector('#summaryBtn').dataset.summaryContent = `
            <div><strong>รายการรวม:</strong> ${totalItems} จุด</div>
            <div><strong>ค่าวัสดุรวม:</strong> ${totalCost.toLocaleString('th-TH')} บาท</div>
            <div><strong>ค่าช่าง:</strong> ${(totalItems * installPrice).toLocaleString('th-TH')} บาท</div>
            <div><strong>ค่าขนส่ง:</strong> ${deliveryPrice.toLocaleString('th-TH')} บาท</div>
            <hr style="margin: 8px 0; border: 0; border-top: 1px solid var(--line);">
            <div><strong>ยอดรวมทั้งหมด:</strong> ${(totalCost + (totalItems * installPrice) + deliveryPrice).toLocaleString('th-TH')} บาท</div>
        `;
    }

    document.addEventListener('input', debounce(recalcAll, 300));

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', addRoom);
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        localStorage.setItem('isLocked', isLocked);
        updateLockState();
    });
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', () => {
        if (confirm('ยืนยันการล้างข้อมูลทั้งหมด?')) {
            localStorage.removeItem(STORAGE_KEY);
            document.querySelector(SELECTORS.orderForm).reset();
            roomsEl.innerHTML = "";
            roomCount = 0;
            addRoom();
            showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
        }
    });
    document.querySelector(SELECTORS.saveBtn).addEventListener('click', () => {
        saveData();
        showToast('บันทึกข้อมูลเรียบร้อย', 'success');
    });
    document.querySelector(SELECTORS.loadBtn).addEventListener('click', () => {
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
                showToast('โหลดข้อมูลเรียบร้อย', 'success');
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY);
                addRoom();
                showToast('ไม่สามารถโหลดข้อมูลได้ ข้อมูลเสียหาย', 'error');
            }
        } else {
            showToast('ไม่มีข้อมูลที่บันทึกไว้', 'info');
        }
        updateLockState();
    });
    document.querySelector(SELECTORS.summaryBtn).addEventListener('click', (e) => {
        e.stopPropagation();
        const popup = e.target.closest('.actions').querySelector('.summary-popup');
        popup.innerHTML = e.target.dataset.summaryContent;
        popup.classList.toggle('show');
    });

    document.addEventListener('click', e => {
        if (e.target.closest('.summary-popup')) return;
        document.querySelectorAll('.summary-popup.show').forEach(p => p.classList.remove('show'));

        const target = e.target.closest('button[data-act], a[data-act]');
        if (!target) return;

        const action = target.dataset.act;
        const parentRoom = target.closest('.room');
        const parentItem = target.closest('.curtain-item, .deco-item');

        switch (action) {
            case 'add-curtain':
                parentRoom.querySelector('.room-items').appendChild(
                    document.createRange().createContextualFragment(`
                        <div class="curtain-item">
                            <div class="row head-row">
                                <div class="item-badge" data-item-title></div>
                                <button type="button" class="btn btn-xs btn-warning" data-act="toggle-suspend" style="--primary: var(--warning);"><span data-suspend-text>ระงับ</span></button>
                                <span style="flex:1;"></span>
                                <button type="button" class="btn btn-xs" data-act="clear-curtain">ล้าง</button>
                                <button type="button" class="btn btn-icon btn-danger" data-act="del-item" title="ลบรายการ">✕</button>
                            </div>
                            <div class="row curtain-row">
                                <div><label>สไตล์</label><select class="field" name="style" required><option value="" hidden>เลือก</option><option>ตาไก่</option><option>จีบ</option><option>ลอน</option></select></div>
                                <div><label>กว้าง(ม.)</label><input class="field" name="width_m" type="number" step="0.01" min="0" required /></div>
                                <div><label>สูง(ม.)</label><input class="field" name="height_m" type="number" step="0.01" min="0" required /></div>
                                <div><label>ผ้าทึบ</label><select class="field" name="opaque_fabric_id" required><option value="" hidden>เลือก</option>${PRICING.fabric.map((p, i) => `<option value="${i}">ผ้าทึบ ${i + 1} (${p} บ./หลา)</option>`).join('')}</select></div>
                                <div><label>ผ้าโปร่ง</label><select class="field" name="sheer_fabric_id"><option value="">ไม่มี</option>${PRICING.sheer.map((p, i) => `<option value="${i}">ผ้าโปร่ง ${i + 1} (${p} บ./หลา)</option>`).join('')}</select></div>
                            </div>
                            <div class="row cost-row">
                                <span>ราคา:</span>
                                <span class="cost-display" data-cost-display>0.00</span>
                            </div>
                        </div>
                    `)
                );
                renumber();
                recalcAll();
                break;
            case 'add-deco':
                parentRoom.querySelector('.room-items').appendChild(
                    document.createRange().createContextualFragment(`
                        <div class="deco-item">
                            <div class="row head-row">
                                <div class="item-badge" data-item-title style="background-color: var(--secondary);"></div>
                                <button type="button" class="btn btn-xs btn-warning" data-act="toggle-suspend" style="--primary: var(--warning);"><span data-suspend-text>ระงับ</span></button>
                                <span style="flex:1;"></span>
                                <button type="button" class="btn btn-xs" data-act="clear-deco">ล้าง</button>
                                <button type="button" class="btn btn-icon btn-danger" data-act="del-deco" title="ลบรายการ">✕</button>
                            </div>
                            <div class="row deco-row">
                                <div><label>ประเภท</label><select class="field" name="deco_type" required><option value="" hidden>เลือก</option><option>มู่ลี่ไม้</option><option>ม่านม้วน</option><option>ปรับแสง</option><option>ฉากPVC</option></select></div>
                                <div><label>กว้าง(ม.)</label><input class="field" name="deco_width_m" type="number" step="0.01" min="0" required /></div>
                                <div><label>สูง(ม.)</label><input class="field" name="deco_height_m" type="number" step="0.01" min="0" required /></div>
                                <div><label>ราคา/ตร.หลา</label><input class="field" name="deco_price_sqyd" type="text" inputmode="numeric" required /></div>
                            </div>
                            <div class="row cost-row">
                                <span>ราคา:</span>
                                <span class="cost-display" data-deco-cost-display>0.00</span>
                            </div>
                        </div>
                    `)
                );
                renumber();
                recalcAll();
                break;
            case 'del-item':
            case 'del-deco':
                if (confirm('ยืนยันการลบรายการนี้?')) {
                    parentItem.remove();
                    renumber();
                    recalcAll();
                }
                break;
            case 'del-room':
                if (confirm('ยืนยันการลบห้องนี้?')) {
                    parentRoom.remove();
                    renumber();
                    recalcAll();
                }
                break;
            case 'clear-curtain':
            case 'clear-deco':
                parentItem.querySelectorAll('.field').forEach(field => field.value = '');
                recalcAll();
                break;
            case 'toggle-suspend':
                const isSuspended = parentItem.classList.toggle('suspended');
                parentItem.querySelectorAll('.field').forEach(field => field.disabled = isSuspended);
                target.querySelector('[data-suspend-text]').textContent = isSuspended ? 'เปิดใช้งาน' : 'ระงับ';
                recalcAll();
                break;
        }
    });

    document.querySelector(SELECTORS.orderForm).addEventListener('submit', (e) => {
        e.preventDefault();
        const submitBtn = document.querySelector(SELECTORS.submitBtn);
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังส่ง...';
        const payload = buildPayload();
        
        // This is a placeholder for your actual submission logic.
        // You should replace this with a real fetch() or AJAX call.
        // For now, it just simulates success.
        console.log('Payload to be sent:', payload);
        
        setTimeout(() => {
            submitBtn.disabled = isLocked;
            submitBtn.textContent = 'ส่งไปคำนวณ';
            showToast('ส่งข้อมูลสำเร็จแล้ว', 'success');
        }, 3000);
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
                localStorage.removeItem(STORAGE_KEY);
                addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
    });
})();