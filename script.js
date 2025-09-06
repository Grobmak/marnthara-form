(function() {
    'use strict';

    // --- Module 1: DOM Selectors & Utilities ---
    const DOM = {
        SELECTORS: {
            addRoomHeaderBtn: '#addRoomHeaderBtn',
            clearAllBtn: '#clearAllBtn',
            lockBtn: '#lockBtn',
            orderForm: '#orderForm',
            roomsContainer: '#rooms-container',
            summaryTotalPrice: '.summary-total-price',
            summaryFabricPrice: '.summary-fabric-price',
            summaryDecoPrice: '.summary-deco-price',
            summaryDiscountPrice: '.summary-discount-price',
            payloadInput: '#payloadInput',
            submitBtn: '#submitBtn',
            customerName: 'input[name="customer_name"]',
            customerAddress: 'input[name="customer_address"]',
            customerPhone: 'input[name="customer_phone"]',
            discountInput: 'input[name="discount"]',
            depositInput: 'input[name="deposit"]',
        },
        elements: {}, // To store cached elements

        init() {
            for (const key in this.SELECTORS) {
                this.elements[key] = document.querySelector(this.SELECTORS[key]);
            }
        },
        findRoomCard(el) {
            return el.closest('.room-card');
        },
        findItemCard(el) {
            return el.closest('.item-card');
        },
        createRoomElement(roomData = {}) {
            const roomIndex = document.querySelectorAll('.room-card').length;
            const roomClass = `room-card ${roomIndex % 2 === 1 ? 'alt' : ''} ${roomIndex % 3 === 2 ? 'alt-2' : ''}`;
            const roomHtml = `
                <div class="${roomClass}">
                    <div class="room-head closed" data-act="toggle-room">
                        <h2><span data-room-name-display>${roomData.name || 'ห้องใหม่'}</span> <span class="room-size-display" data-room-size-display></span></h2>
                        <button type="button" class="btn btn-icon btn-danger" data-act="del-room" title="ลบห้อง">✕</button>
                    </div>
                    <div class="room-body closed">
                        <div class="row two-col">
                            <div><label>ชื่อห้อง</label><input class="field" type="text" name="room_name" value="${roomData.name || ''}" placeholder="เช่น ห้องนั่งเล่น" /></div>
                            <div><label>หมายเหตุ</label><input class="field" type="text" name="room_note" value="${roomData.note || ''}" placeholder="เช่น ผ้าม่านหน้าต่าง" /></div>
                        </div>
                        <div class="item-head" data-act="toggle-item">
                            <h4>ผ้าม่าน</h4>
                            <span class="item-badge" data-item-title></span>
                            <span class="quantity-display" data-quantity-display></span>
                            <span style="flex:1;"></span>
                            <button type="button" class="btn btn-xs" data-act="clear-curtain">ล้าง</button>
                            <button type="button" class="btn btn-icon btn-danger" data-act="del-curtain" title="ลบรายการ">✕</button>
                        </div>
                        <div class="item-body">
                            <div class="row item-row">
                                <div><label>ชนิดผ้า</label><select class="field" name="curtain_fabric_type" required><option value="" hidden>เลือก</option><option>ผ้าทึบ</option><option>ผ้าโปร่ง</option></select></div>
                                <div><label>รูปแบบ</label><select class="field" name="curtain_style" required><option value="" hidden>เลือก</option><option>ตาไก่</option><option>ลอน</option><option>จีบ</option></select></div>
                                <div><label>ความกว้าง(ม.)</label><input class="field" name="curtain_width_m" type="number" step="0.01" min="0" required /></div>
                                <div><label>ความสูง(ม.)</label><input class="field" name="curtain_height_m" type="number" step="0.01" min="0" required /></div>
                                <div><label>จำนวน</label><input class="field" name="curtain_qty" type="number" min="1" required value="1" /></div>
                            </div>
                            <div class="row">
                                <label>หมายเหตุ</label><input class="field" type="text" name="curtain_note" placeholder="หมายเหตุผ้าม่าน" />
                            </div>
                            <div class="item-row-head">
                                <h5>อุปกรณ์ตกแต่ง</h5>
                                <button type="button" class="btn btn-primary btn-xs" data-act="add-deco">+ เพิ่ม</button>
                            </div>
                            <div class="item-list" data-item-list></div>
                        </div>
                    </div>
                </div>
            `;
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = roomHtml.trim();
            const newRoom = tempDiv.firstChild;
            
            // Populate curtain fields if data exists
            if (roomData.curtain) {
                const curtainFields = newRoom.querySelectorAll('[name^="curtain_"]');
                curtainFields.forEach(field => {
                    if (field.type === 'number' || field.type === 'text') {
                        field.value = roomData.curtain[field.name.replace('curtain_', '')] || '';
                    } else if (field.tagName === 'SELECT') {
                        field.value = roomData.curtain[field.name.replace('curtain_', '')] || '';
                    }
                });
            }

            return newRoom;
        },
        createDecoElement(decoData = {}) {
            const decoHtml = `
                <div class="item-card">
                    <div class="item-card-head">
                        <span class="item-badge" data-item-title style="background-color: var(--secondary);"></span>
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
                    <div class="row">
                        <label>หมายเหตุ</label><input class="field" type="text" name="deco_note" placeholder="หมายเหตุอุปกรณ์" />
                    </div>
                </div>
            `;
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = decoHtml.trim();
            const newDeco = tempDiv.firstChild;

            // Populate deco fields if data exists
            if (decoData.type) {
                newDeco.querySelector('select[name="deco_type"]').value = decoData.type || '';
                newDeco.querySelector('input[name="deco_width_m"]').value = decoData.width_m || '';
                newDeco.querySelector('input[name="deco_height_m"]').value = decoData.height_m || '';
                newDeco.querySelector('input[name="deco_price_sqyd"]').value = decoData.price_sqyd || '';
                newDeco.querySelector('input[name="deco_note"]').value = decoData.note || '';
                if (decoData.suspended) {
                    newDeco.classList.add('suspended');
                    newDeco.querySelector('[data-suspend-text]').textContent = 'เรียกคืน';
                }
            }
            return newDeco;
        },
        showToast(message, type = 'success') {
            const toastContainer = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            toastContainer.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 100);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    };

    // --- Module 2: State Management & LocalStorage ---
    const State = {
        STORAGE_KEY: "marnthara.input.v3",
        APP_VERSION: "input-ui/3.2.0",
        isLocked: false,
        roomCount: 0,

        save() {
            try {
                const payload = State.buildPayload();
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
                return true;
            } catch (err) {
                console.error("Failed to save data to storage:", err);
                return false;
            }
        },

        load() {
            try {
                const storedData = localStorage.getItem(this.STORAGE_KEY);
                if (storedData) {
                    return JSON.parse(storedData);
                }
            } catch (err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(this.STORAGE_KEY);
            }
            return null;
        },

        buildPayload() {
            const form = DOM.elements.orderForm;
            const rooms = Array.from(document.querySelectorAll('.room-card')).map(roomCard => {
                const roomName = roomCard.querySelector('[name="room_name"]').value;
                const roomNote = roomCard.querySelector('[name="room_note"]').value;
                const curtainCard = roomCard.querySelector('.item-body');
                
                const curtain = {
                    fabric_type: curtainCard.querySelector('[name="curtain_fabric_type"]').value,
                    style: curtainCard.querySelector('[name="curtain_style"]').value,
                    width_m: parseFloat(curtainCard.querySelector('[name="curtain_width_m"]').value) || 0,
                    height_m: parseFloat(curtainCard.querySelector('[name="curtain_height_m"]').value) || 0,
                    qty: parseInt(curtainCard.querySelector('[name="curtain_qty"]').value) || 1,
                    note: curtainCard.querySelector('[name="curtain_note"]').value,
                };
                
                const decorations = Array.from(roomCard.querySelectorAll('.item-card')).map(decoCard => ({
                    type: decoCard.querySelector('[name="deco_type"]').value,
                    width_m: parseFloat(decoCard.querySelector('[name="deco_width_m"]').value) || 0,
                    height_m: parseFloat(decoCard.querySelector('[name="deco_height_m"]').value) || 0,
                    price_sqyd: parseFloat(decoCard.querySelector('[name="deco_price_sqyd"]').value.replace(/,/g, '')) || 0,
                    note: decoCard.querySelector('[name="deco_note"]').value,
                    suspended: decoCard.classList.contains('suspended')
                }));
                
                return { room_name: roomName, room_note: roomNote, curtain, decorations };
            });

            return {
                app_version: this.APP_VERSION,
                customer_name: form.elements.customer_name.value,
                customer_address: form.elements.customer_address.value,
                customer_phone: form.elements.customer_phone.value,
                order_date: form.elements.order_date.value,
                order_time: form.elements.order_time.value,
                seller_name: form.elements.seller_name.value,
                customer_note: form.elements.customer_note.value,
                rooms,
                discount: parseFloat(form.elements.discount.value.replace(/,/g, '')) || 0,
                deposit: parseFloat(form.elements.deposit.value.replace(/,/g, '')) || 0,
                total_price: parseFloat(document.querySelector('.summary-total-price').textContent.replace(/,/g, '')) || 0,
                total_fabric_price: parseFloat(document.querySelector('.summary-fabric-price').textContent.replace(/,/g, '')) || 0,
                total_deco_price: parseFloat(document.querySelector('.summary-deco-price').textContent.replace(/,/g, '')) || 0,
            };
        }
    };

    // --- Module 3: Calculations & Constants ---
    const Calculations = {
        SQM_TO_SQYD: 1.19599,
        PRICING: {
            fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
            sheer: [1000, 1100, 1200, 1300, 1400, 1500],
            style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
            height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
        },
        
        getMaterialPrice(type, width, height) {
            const heightAdd = this.PRICING.height.find(h => height >= h.threshold);
            let basePrice = 0;
            if (type === "ผ้าทึบ") {
                basePrice = this.PRICING.fabric[Math.min(this.PRICING.fabric.length - 1, Math.ceil(width) - 1)] || 0;
            } else if (type === "ผ้าโปร่ง") {
                basePrice = this.PRICING.sheer[Math.min(this.PRICING.sheer.length - 1, Math.ceil(width) - 1)] || 0;
            }
            const price = basePrice + (heightAdd ? heightAdd.add_per_m * Math.ceil(height - heightAdd.threshold + 0.01) : 0);
            return price < 0 ? 0 : price; // Ensure price is not negative
        },

        calculateRoomTotals(roomCard) {
            const curtainBody = roomCard.querySelector('.item-body');
            const roomNameEl = roomCard.querySelector('[data-room-name-display]');
            const roomSizeEl = roomCard.querySelector('[data-room-size-display]');
            
            let roomTotalPrice = 0;
            let roomFabricPrice = 0;
            let roomDecoPrice = 0;

            // Curtain Calculation
            const curtainFabricType = curtainBody.querySelector('[name="curtain_fabric_type"]').value;
            const curtainStyle = curtainBody.querySelector('[name="curtain_style"]').value;
            const curtainWidth = parseFloat(curtainBody.querySelector('[name="curtain_width_m"]').value) || 0;
            const curtainHeight = parseFloat(curtainBody.querySelector('[name="curtain_height_m"]').value) || 0;
            const curtainQty = parseInt(curtainBody.querySelector('[name="curtain_qty"]').value) || 1;
            
            let fabricPrice = 0;
            let styleSurcharge = 0;
            if (curtainFabricType && curtainWidth > 0 && curtainHeight > 0) {
                fabricPrice = this.getMaterialPrice(curtainFabricType, curtainWidth, curtainHeight);
                styleSurcharge = this.PRICING.style_surcharge[curtainStyle] || 0;
                roomFabricPrice = (fabricPrice + styleSurcharge) * curtainQty;
            }

            // Decoration Calculation
            Array.from(roomCard.querySelectorAll('.item-card:not(.suspended)')).forEach(decoCard => {
                const decoWidth = parseFloat(decoCard.querySelector('[name="deco_width_m"]').value) || 0;
                const decoHeight = parseFloat(decoCard.querySelector('[name="deco_height_m"]').value) || 0;
                const decoPricePerSqYd = parseFloat(decoCard.querySelector('[name="deco_price_sqyd"]').value.replace(/,/g, '')) || 0;
                const areaSqYd = (decoWidth * decoHeight) * this.SQM_TO_SQYD;
                roomDecoPrice += areaSqYd * decoPricePerSqYd;
            });

            roomTotalPrice = roomFabricPrice + roomDecoPrice;

            roomNameEl.textContent = roomCard.querySelector('[name="room_name"]').value || 'ห้องใหม่';
            roomSizeEl.textContent = `(รวม ${roomTotalPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท)`;

            return { roomTotalPrice, roomFabricPrice, roomDecoPrice };
        },

        updateTotalSummary() {
            let totalFabricPrice = 0;
            let totalDecoPrice = 0;
            let totalRoomsPrice = 0;

            Array.from(document.querySelectorAll('.room-card')).forEach(roomCard => {
                const { roomTotalPrice, roomFabricPrice, roomDecoPrice } = this.calculateRoomTotals(roomCard);
                totalRoomsPrice += roomTotalPrice;
                totalFabricPrice += roomFabricPrice;
                totalDecoPrice += roomDecoPrice;
            });
            
            const discountInput = DOM.elements.discountInput;
            const discountValue = parseFloat(discountInput.value.replace(/,/g, '')) || 0;
            
            const finalPrice = totalRoomsPrice - discountValue;

            DOM.elements.summaryTotalPrice.textContent = finalPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            DOM.elements.summaryFabricPrice.textContent = totalFabricPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            DOM.elements.summaryDecoPrice.textContent = totalDecoPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            DOM.elements.summaryDiscountPrice.textContent = discountValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            
            State.save();
        }
    };

    // --- Module 4: Main Application Logic ---
    const App = {
        init() {
            DOM.init();
            this.bindEvents();
            this.loadInitialData();
        },

        bindEvents() {
            document.addEventListener('input', this.handleInput.bind(this));
            document.addEventListener('change', this.handleChange.bind(this));
            document.addEventListener('click', this.handleClick.bind(this));
            DOM.elements.orderForm.addEventListener('submit', this.handleSubmit.bind(this));
        },

        loadInitialData() {
            const payload = State.load();
            if (payload && payload.rooms && payload.rooms.length > 0) {
                payload.rooms.forEach(roomData => this.addRoom(roomData));
            } else {
                this.addRoom();
            }
            this.updateLockState();
            Calculations.updateTotalSummary();
        },

        handleInput(e) {
            State.save();
            if (e.target.closest('.room-card')) {
                Calculations.updateTotalSummary();
            } else if (e.target.closest('#summaryCard')) {
                Calculations.updateTotalSummary();
            }
        },

        handleChange(e) {
            State.save();
            if (e.target.closest('.room-card')) {
                Calculations.updateTotalSummary();
            }
        },

        handleClick(e) {
            const action = e.target.closest('[data-act]')?.dataset.act;
            if (!action) return;

            e.preventDefault();

            if (State.isLocked && !['lock', 'clearAll'].includes(action)) {
                DOM.showToast('กรุณาปลดล็อคก่อนแก้ไขข้อมูล', 'warning');
                return;
            }

            switch(action) {
                case 'toggle-room':
                    this.toggleRoom(e.target);
                    break;
                case 'del-room':
                    this.deleteRoom(e.target);
                    break;
                case 'toggle-item':
                    this.toggleItem(e.target);
                    break;
                case 'clear-curtain':
                    this.clearCurtain(e.target);
                    break;
                case 'del-curtain':
                    this.deleteCurtain(e.target);
                    break;
                case 'add-deco':
                    this.addDeco(e.target);
                    break;
                case 'clear-deco':
                    this.clearDeco(e.target);
                    break;
                case 'del-deco':
                    this.deleteDeco(e.target);
                    break;
                case 'toggle-suspend':
                    this.toggleSuspend(e.target);
                    break;
                case 'add-room':
                    this.addRoom();
                    break;
                case 'lock':
                    this.toggleLock();
                    break;
                case 'clearAll':
                    this.clearAll();
                    break;
            }
        },

        handleSubmit(e) {
            e.preventDefault();
            const submitBtn = DOM.elements.submitBtn;
            if (State.isLocked) {
                DOM.showToast('กรุณาปลดล็อคก่อนส่งข้อมูล', 'warning');
                return;
            }
            submitBtn.disabled = true;
            submitBtn.textContent = 'กำลังส่ง...';

            DOM.elements.payloadInput.value = JSON.stringify(State.buildPayload());

            // For demonstration, simulate a successful API call
            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = 'ส่งไปคำนวณ';
                DOM.showToast('ส่งข้อมูลสำเร็จแล้ว', 'success');
            }, 3000);
        },

        addRoom(roomData = {}) {
            const newRoom = DOM.createRoomElement(roomData);
            DOM.elements.roomsContainer.appendChild(newRoom);
            if (roomData.decorations && roomData.decorations.length > 0) {
                roomData.decorations.forEach(decoData => this.addDeco(newRoom, decoData));
            }
            State.roomCount++;
            State.save();
            Calculations.updateTotalSummary();
        },

        deleteRoom(target) {
            const roomCard = DOM.findRoomCard(target);
            if (roomCard && confirm('คุณต้องการลบห้องนี้ใช่หรือไม่?')) {
                roomCard.remove();
                State.roomCount--;
                this.updateRoomStyles();
                State.save();
                Calculations.updateTotalSummary();
            }
        },

        updateRoomStyles() {
            const rooms = document.querySelectorAll('.room-card');
            rooms.forEach((room, index) => {
                room.classList.remove('alt', 'alt-2');
                if (index % 2 === 1) room.classList.add('alt');
                if (index % 3 === 2) room.classList.add('alt-2');
            });
        },

        toggleRoom(target) {
            const roomCard = DOM.findRoomCard(target);
            if (roomCard) {
                roomCard.classList.toggle('closed');
                roomCard.querySelector('.room-head').classList.toggle('closed');
                roomCard.querySelector('.room-body').classList.toggle('closed');
            }
        },
        
        toggleItem(target) {
            const itemHead = target.closest('.item-head');
            const itemBody = itemHead.nextElementSibling;
            itemHead.classList.toggle('closed');
            itemBody.classList.toggle('closed');
        },
        
        clearCurtain(target) {
            const roomCard = DOM.findRoomCard(target);
            if (roomCard) {
                roomCard.querySelector('[name="curtain_fabric_type"]').value = '';
                roomCard.querySelector('[name="curtain_style"]').value = '';
                roomCard.querySelector('[name="curtain_width_m"]').value = '';
                roomCard.querySelector('[name="curtain_height_m"]').value = '';
                roomCard.querySelector('[name="curtain_qty"]').value = '1';
                roomCard.querySelector('[name="curtain_note"]').value = '';
                State.save();
                Calculations.updateTotalSummary();
            }
        },

        deleteCurtain(target) {
            if (confirm('คุณต้องการลบรายการผ้าม่านใช่หรือไม่?')) {
                this.clearCurtain(target);
            }
        },
        
        addDeco(target, decoData = {}) {
            const roomCard = DOM.findRoomCard(target);
            if (roomCard) {
                const decoList = roomCard.querySelector('[data-item-list]');
                const newDeco = DOM.createDecoElement(decoData);
                decoList.appendChild(newDeco);
                State.save();
                Calculations.updateTotalSummary();
            }
        },

        clearDeco(target) {
            const itemCard = DOM.findItemCard(target);
            if (itemCard) {
                itemCard.querySelector('select[name="deco_type"]').value = '';
                itemCard.querySelector('input[name="deco_width_m"]').value = '';
                itemCard.querySelector('input[name="deco_height_m"]').value = '';
                itemCard.querySelector('input[name="deco_price_sqyd"]').value = '';
                itemCard.querySelector('input[name="deco_note"]').value = '';
                itemCard.classList.remove('suspended');
                itemCard.querySelector('[data-suspend-text]').textContent = 'ระงับ';
                State.save();
                Calculations.updateTotalSummary();
            }
        },

        deleteDeco(target) {
            const itemCard = DOM.findItemCard(target);
            if (itemCard && confirm('คุณต้องการลบอุปกรณ์ตกแต่งนี้ใช่หรือไม่?')) {
                itemCard.remove();
                State.save();
                Calculations.updateTotalSummary();
            }
        },
        
        toggleSuspend(target) {
            const itemCard = DOM.findItemCard(target);
            if (itemCard) {
                const isSuspended = itemCard.classList.toggle('suspended');
                target.querySelector('[data-suspend-text]').textContent = isSuspended ? 'เรียกคืน' : 'ระงับ';
                State.save();
                Calculations.updateTotalSummary();
            }
        },
        
        toggleLock() {
            State.isLocked = !State.isLocked;
            this.updateLockState();
        },
        
        updateLockState() {
            const lockIcon = DOM.elements.lockBtn.querySelector('.lock-icon');
            const lockText = DOM.elements.lockBtn.querySelector('.lock-text');
            const allInputs = document.querySelectorAll('#orderForm input, #orderForm select, #orderForm textarea, #orderForm button');
            
            allInputs.forEach(el => {
                if (el.id !== 'lockBtn' && el.id !== 'clearAllBtn') {
                    el.disabled = State.isLocked;
                }
            });
            
            if (State.isLocked) {
                lockText.textContent = 'ปลดล็อค';
                lockIcon.textContent = '🔓';
                DOM.showToast('หน้าจอถูกล็อคแล้ว', 'warning');
            } else {
                lockText.textContent = 'ล็อค';
                lockIcon.textContent = '🔒';
                DOM.showToast('หน้าจอถูกปลดล็อคแล้ว', 'success');
            }
        },
        
        clearAll() {
            if (confirm('คุณต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?')) {
                localStorage.removeItem(State.STORAGE_KEY);
                window.location.reload();
            }
        }
    };

    App.init();
})();