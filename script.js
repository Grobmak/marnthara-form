(function() {
    'use strict';

    // Core logic for state management and calculations
    const State = {
        STORAGE_KEY: 'marntharaState',
        isLocked: false,
        rooms: [],

        load() {
            const savedState = localStorage.getItem(this.STORAGE_KEY);
            if (savedState) {
                const data = JSON.parse(savedState);
                this.isLocked = data.isLocked;
                this.rooms = data.rooms;
                App.restoreUI();
            } else {
                this.addRoom();
            }
            App.updateLockState();
        },

        save() {
            const payload = {
                isLocked: this.isLocked,
                rooms: this.rooms,
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
        },

        syncStateFromDOM() {
            this.rooms = Array.from(document.querySelectorAll('.room-card')).map(roomEl => {
                const roomId = roomEl.dataset.roomId;
                const roomName = roomEl.querySelector('.room-name').value;
                const isSuspended = roomEl.classList.contains('suspended');

                const items = Array.from(roomEl.querySelectorAll('.item-card')).map(itemEl => {
                    const itemId = itemEl.dataset.itemId;
                    const isItemSuspended = itemEl.classList.contains('suspended');

                    const decorations = Array.from(itemEl.querySelectorAll('.deco-card')).map(decoEl => {
                        const decoId = decoEl.dataset.decoId;
                        const isDecoSuspended = decoEl.classList.contains('suspended');
                        return {
                            id: decoId,
                            isSuspended: isDecoSuspended,
                            deco_name: decoEl.querySelector(`[name="deco_name_${decoId}"]`).value,
                            deco_amount: decoEl.querySelector(`[name="deco_amount_${decoId}"]`).value,
                            deco_price: decoEl.querySelector(`[name="deco_price_${decoId}"]`).value,
                        };
                    });

                    return {
                        id: itemId,
                        isSuspended: isItemSuspended,
                        type: itemEl.querySelector(`[name="item_type_${itemId}"]`).value,
                        fabric_width: itemEl.querySelector(`[name="fabric_width_${itemId}"]`).value,
                        fabric_height: itemEl.querySelector(`[name="fabric_height_${itemId}"]`).value,
                        fabric_price: itemEl.querySelector(`[name="fabric_price_${itemId}"]`).value,
                        deco_count: itemEl.querySelector(`[name="deco_count_${itemId}"]`).value,
                        deco_price: itemEl.querySelector(`[name="deco_price_${itemId}"]`).value,
                        discount: itemEl.querySelector(`[name="discount_${itemId}"]`).value,
                        set_count: itemEl.querySelector(`[name="set_count_${itemId}"]`).value,
                        decorations: decorations,
                    };
                });

                return {
                    id: roomId,
                    name: roomName,
                    isSuspended: isSuspended,
                    items: items,
                };
            });
            this.save();
        },

        addRoom() {
            const roomEl = App.createRoomElement();
            App.DOM.elements.roomsContainer.appendChild(roomEl);
            App.DOM.cacheDynamicElements();
            this.syncStateFromDOM();
            App.DOM.scrollToElement(roomEl);
        },

        addItem(roomCard) {
            const itemContainer = roomCard.querySelector('.item-container');
            const itemEl = App.createItemElement();
            itemContainer.appendChild(itemEl);
            App.DOM.cacheDynamicElements();
            this.syncStateFromDOM();
            App.DOM.scrollToElement(itemEl);
        },

        addDeco(itemCard) {
            const decoContainer = itemCard.querySelector('.deco-container');
            const decoEl = App.createDecoElement();
            decoContainer.appendChild(decoEl);
            App.DOM.cacheDynamicElements();
            this.syncStateFromDOM();
            App.DOM.scrollToElement(decoEl);
        },

        deleteElement(el, type) {
            const parentRoom = App.DOM.findRoomCard(el);
            const parentItem = App.DOM.findItemCard(el);
            const prevSibling = el.previousElementSibling;

            if (confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) {
                el.remove();
                this.syncStateFromDOM();
                App.updateTotalSummary();

                let scrollToEl;
                if (type === 'room') {
                    scrollToEl = prevSibling || App.DOM.elements.roomsContainer.lastElementChild;
                } else if (type === 'item') {
                    scrollToEl = prevSibling || parentRoom.querySelector('.item-container').lastElementChild;
                } else if (type === 'deco') {
                    scrollToEl = prevSibling || parentItem.querySelector('.deco-container').lastElementChild;
                }
                App.DOM.scrollToElement(scrollToEl);
            }
        },

        toggleSuspend(el, type) {
            const target = (type === 'room') ? App.DOM.findRoomCard(el) : (type === 'item' ? App.DOM.findItemCard(el) : el.closest('.deco-card'));
            if (target) {
                target.classList.toggle('suspended');
                const isSuspended = target.classList.contains('suspended');
                el.querySelector('[data-suspend-text]').textContent = isSuspended ? 'เรียกคืน' : 'ระงับ';
                this.syncStateFromDOM();
                App.updateTotalSummary();
            }
        },

        toggleLock() {
            this.isLocked = !this.isLocked;
            App.updateLockState();
            this.save();
        },

        clearAll() {
            if (confirm('คุณต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?')) {
                localStorage.removeItem(this.STORAGE_KEY);
                App.DOM.elements.roomsContainer.innerHTML = '';
                this.rooms = [];
                this.addRoom();
                App.updateTotalSummary();
                App.DOM.showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
            }
        },

        preparePayload() {
            const customerInfo = {
                customer_name: App.DOM.elements.customerName.value,
                customer_address: App.DOM.elements.customerAddress.value,
                customer_phone: App.DOM.elements.customerPhone.value,
            };
            const summary = {
                discount: App.sanitizeValue(App.DOM.elements.discountInput.value),
                deposit: App.sanitizeValue(App.DOM.elements.depositInput.value),
                total: App.Calculations.totalPrice,
                fabric_total: App.Calculations.fabricPrice,
                deco_total: App.Calculations.decoPrice,
            };
            const data = {
                customer: customerInfo,
                summary: summary,
                rooms: this.rooms,
            };
            App.DOM.elements.payloadInput.value = JSON.stringify(data);
        }
    };

    const App = {
        init() {
            this.DOM.init();
            this.bindEvents();
            State.load();
        },

        bindEvents() {
            this.DOM.elements.addRoomHeaderBtn.addEventListener('click', () => State.addRoom());
            this.DOM.elements.lockBtn.addEventListener('click', () => State.toggleLock());
            this.DOM.elements.clearAllBtn.addEventListener('click', () => State.clearAll());
            this.DOM.elements.summaryToggleBtn.addEventListener('click', (e) => this.toggleSummary(e));

            document.addEventListener('click', e => {
                const deleteBtn = e.target.closest('.delete-btn');
                if (deleteBtn) {
                    const targetEl = deleteBtn.closest('.room-card, .item-card, .deco-card');
                    const deleteType = deleteBtn.dataset.deleteType;
                    if (targetEl && deleteType) {
                        State.deleteElement(targetEl, deleteType);
                    }
                }
            });

            document.addEventListener('click', e => {
                const suspendBtn = e.target.closest('[data-suspend-type]');
                if (suspendBtn) {
                    const suspendType = suspendBtn.dataset.suspendType;
                    State.toggleSuspend(suspendBtn, suspendType);
                }
            });

            document.addEventListener('click', e => {
                const addBtn = e.target.closest('.add-item-btn');
                if (addBtn) {
                    const roomCard = this.DOM.findRoomCard(addBtn);
                    const itemCard = this.DOM.findItemCard(addBtn);

                    if (addBtn.classList.contains('room-btn')) {
                        State.addItem(roomCard);
                    } else if (addBtn.classList.contains('deco-btn')) {
                        State.addDeco(itemCard);
                    }
                }
            });

            document.addEventListener('input', e => {
                const target = e.target;
                if (target.matches('#orderForm input, #orderForm select, #orderForm textarea')) {
                    State.syncStateFromDOM();
                    this.updateTotalSummary();
                }
            });
        },

        // DOM-related methods
        DOM: {
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
                summaryToggleBtn: '.summary-toggle-btn',
            },
            elements: {},

            init() {
                for (const key in this.SELECTORS) {
                    this.elements[key] = document.querySelector(this.SELECTORS[key]);
                }
                this.cacheDynamicElements();
            },

            cacheDynamicElements() {
                this.elements.roomAddButtons = document.querySelectorAll('.add-item-btn.room-btn');
                this.elements.itemAddButtons = document.querySelectorAll('.add-item-btn.item-btn');
                this.elements.decoAddButtons = document.querySelectorAll('.add-item-btn.deco-btn');
                this.elements.deleteButtons = document.querySelectorAll('.delete-btn');
            },

            findRoomCard(el) {
                return el.closest('.room-card');
            },

            findItemCard(el) {
                return el.closest('.item-card');
            },

            createRoomElement(roomData = {}) {
                const roomId = roomData.id || `room-${Date.now()}`;
                const roomName = roomData.name || '';
                const roomSuspended = roomData.isSuspended || false;
                const roomElement = document.createElement('div');
                roomElement.className = 'room-card ' + (roomSuspended ? 'suspended' : '');
                roomElement.dataset.roomId = roomId;

                const roomBgClass = `room-${(document.querySelectorAll('.room-card').length % 3) + 1}-bg`;
                roomElement.style.backgroundColor = `var(--${roomBgClass})`;

                roomElement.innerHTML = `
                    <div class="room-head">
                        <input class="room-name field" type="text" name="room_name_${roomId}" placeholder="เช่น ห้องนั่งเล่น" value="${roomName}" />
                        <span class="room-summary-price">0.00</span>
                        <button type="button" class="btn btn-xs btn-outline-danger delete-btn" data-delete-type="room">ลบห้อง</button>
                    </div>
                    <div class="item-container"></div>
                    <div class="actions">
                        <button type="button" class="btn btn-xs btn-primary add-item-btn room-btn">+ เพิ่มจุด</button>
                        <button type="button" class="btn btn-xs btn-danger" data-suspend-text="ระงับ" data-suspend-type="room" data-suspend-id="${roomId}">ระงับ</button>
                    </div>
                `;
                return roomElement;
            },

            createItemElement(itemData = {}) {
                const itemId = itemData.id || `item-${Date.now()}`;
                const itemType = itemData.type || 'standard';
                const itemSuspended = itemData.isSuspended || false;
                const itemElement = document.createElement('div');
                itemElement.className = 'item-card ' + (itemSuspended ? 'suspended' : '');
                itemElement.dataset.itemId = itemId;
                itemElement.innerHTML = `
                    <div class="item-head">
                        <div class="item-name-wrap">
                            <select class="item-type field" name="item_type_${itemId}">
                                <option value="standard" ${itemType === 'standard' ? 'selected' : ''}>ม่านตาไก่ / ม่านจีบ</option>
                                <option value="eyelet" ${itemType === 'eyelet' ? 'selected' : ''}>ม่านตาไก่</option>
                                <option value="pleat" ${itemType === 'pleat' ? 'selected' : ''}>ม่านจีบ</option>
                                <option value="roller" ${itemType === 'roller' ? 'selected' : ''}>ม่านม้วน</option>
                                <option value="roman" ${itemType === 'roman' ? 'selected' : ''}>ม่านพับ</option>
                            </select>
                        </div>
                        <div class="item-summary-price">0.00</div>
                        <button type="button" class="btn btn-xs btn-outline-danger delete-btn" data-delete-type="item">ลบ</button>
                    </div>
                    <div class="row three-col">
                        <div><label>ผ้าม่าน (เมตร)</label><input class="field" type="text" inputmode="numeric" name="fabric_width_${itemId}" placeholder="0" value="${itemData.fabric_width || ''}" /></div>
                        <div><label>สูง (เมตร)</label><input class="field" type="text" inputmode="numeric" name="fabric_height_${itemId}" placeholder="0" value="${itemData.fabric_height || ''}" /></div>
                        <div><label>ราคาผ้า (บาท/เมตร)</label><input class="field" type="text" inputmode="numeric" name="fabric_price_${itemId}" placeholder="0" value="${itemData.fabric_price || ''}" /></div>
                    </div>
                    <div class="row two-col">
                        <div><label>อุปกรณ์ (ชุด)</label><input class="field" type="text" inputmode="numeric" name="deco_count_${itemId}" placeholder="0" value="${itemData.deco_count || ''}" /></div>
                        <div><label>ราคาอุปกรณ์ (บาท/ชุด)</label><input class="field" type="text" inputmode="numeric" name="deco_price_${itemId}" placeholder="0" value="${itemData.deco_price || ''}" /></div>
                    </div>
                    <div class="row two-col">
                        <div><label>ส่วนลดจุดนี้ (บาท)</label><input class="field" type="text" inputmode="numeric" name="discount_${itemId}" placeholder="0" value="${itemData.discount || ''}" /></div>
                        <div><label>จำนวนชุด</label><input class="field" type="text" inputmode="numeric" name="set_count_${itemId}" placeholder="1" value="${itemData.set_count || ''}" /></div>
                    </div>
                    <div class="deco-container"></div>
                    <div class="actions">
                        <button type="button" class="btn btn-xs btn-primary add-item-btn deco-btn">+ เพิ่มตกแต่ง</button>
                        <button type="button" class="btn btn-xs btn-danger" data-suspend-text="ระงับ" data-suspend-type="item" data-suspend-id="${itemId}">ระงับ</button>
                    </div>
                `;
                return itemElement;
            },

            createDecoElement(decoData = {}) {
                const decoId = decoData.id || `deco-${Date.now()}`;
                const decoSuspended = decoData.isSuspended || false;
                const decoElement = document.createElement('div');
                decoElement.className = 'deco-card ' + (decoSuspended ? 'suspended' : '');
                decoElement.dataset.decoId = decoId;
                decoElement.innerHTML = `
                    <div class="row">
                        <div style="width:100%;"><label>อุปกรณ์ตกแต่ง</label><input class="field" type="text" name="deco_name_${decoId}" placeholder="เช่น หัวราง" value="${decoData.deco_name || ''}" /></div>
                    </div>
                    <div class="row two-col">
                        <div><label>จำนวน</label><input class="field" type="text" inputmode="numeric" name="deco_amount_${decoId}" placeholder="0" value="${decoData.deco_amount || ''}" /></div>
                        <div><label>ราคา (บาท)</label><input class="field" type="text" inputmode="numeric" name="deco_price_${decoId}" placeholder="0" value="${decoData.deco_price || ''}" /></div>
                    </div>
                    <div class="actions">
                        <button type="button" class="btn btn-xs btn-outline-danger delete-btn" data-delete-type="deco">ลบ</button>
                        <button type="button" class="btn btn-xs btn-danger" data-suspend-text="ระงับ" data-suspend-type="deco" data-suspend-id="${decoId}">ระงับ</button>
                    </div>
                `;
                return decoElement;
            },

            showToast(message, type = 'info') {
                const toastContainer = document.querySelector('.toast-container') || (() => {
                    const container = document.createElement('div');
                    container.className = 'toast-container';
                    document.body.appendChild(container);
                    return container;
                })();

                const toast = document.createElement('div');
                toast.className = `toast toast-${type}`;
                toast.textContent = message;

                toastContainer.appendChild(toast);

                setTimeout(() => {
                    toast.classList.add('fade-out');
                    toast.addEventListener('transitionend', () => toast.remove());
                }, 3000);
            },

            scrollToElement(el) {
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
            }
        },

        // Calculation-related methods
        Calculations: {
            PRICING: {
                SQM_TO_SQYD: 1.19599,
                ROLLER_SQYD: 280,
                ROMAN_SQYD: 320,
                PLEAT_SQYD: 200,
                EYELET_SQYD: 200,
            },
            totalPrice: 0,
            fabricPrice: 0,
            decoPrice: 0,

            calculateItem(itemData) {
                if (itemData.isSuspended) return { subtotal: 0, fabric: 0, deco: 0, discount: 0 };

                const {
                    type,
                    fabric_width,
                    fabric_height,
                    fabric_price,
                    deco_count,
                    deco_price,
                    discount,
                    set_count,
                    decorations,
                } = itemData;

                const fabricWidth = App.sanitizeValue(fabric_width);
                const fabricHeight = App.sanitizeValue(fabric_height);
                const fabricPrice = App.sanitizeValue(fabric_price);
                const decoCount = App.sanitizeValue(deco_count);
                const decoPrice = App.sanitizeValue(deco_price);
                const itemDiscount = App.sanitizeValue(discount);
                const setCount = App.sanitizeValue(set_count) || 1;

                let totalFabricPrice = 0;
                let totalDecoPrice = 0;
                let totalDecoFromDecorations = 0;

                if (fabricWidth > 0 && fabricHeight > 0 && fabricPrice > 0) {
                    const sqMeter = fabricWidth * fabricHeight;
                    const sqYard = sqMeter * this.PRICING.SQM_TO_SQYD;
                    const fabricCostPerSqYard = parseFloat(fabricPrice);

                    let calculatedFabricPrice = 0;
                    if (type === 'roller') {
                        calculatedFabricPrice = sqYard * (fabricCostPerSqYard || this.PRICING.ROLLER_SQYD);
                    } else if (type === 'roman') {
                        calculatedFabricPrice = sqYard * (fabricCostPerSqYard || this.PRICING.ROMAN_SQYD);
                    } else if (type === 'pleat') {
                        calculatedFabricPrice = sqYard * (fabricCostPerSqYard || this.PRICING.PLEAT_SQYD);
                    } else if (type === 'eyelet') {
                        calculatedFabricPrice = sqYard * (fabricCostPerSqYard || this.PRICING.EYELET_SQYD);
                    } else { // standard or default
                        calculatedFabricPrice = sqYard * (fabricCostPerSqYard || this.PRICING.EYELET_SQYD);
                    }

                    totalFabricPrice = calculatedFabricPrice;
                }

                if (decoCount > 0 && decoPrice > 0) {
                    totalDecoPrice = decoCount * decoPrice;
                }

                decorations.forEach(deco => {
                    if (!deco.isSuspended) {
                        totalDecoFromDecorations += App.sanitizeValue(deco.deco_amount) * App.sanitizeValue(deco.deco_price);
                    }
                });

                const subtotal = ((totalFabricPrice + totalDecoPrice + totalDecoFromDecorations) * setCount) - itemDiscount;

                return {
                    subtotal: Math.max(0, subtotal),
                    fabric: totalFabricPrice * setCount,
                    deco: (totalDecoPrice + totalDecoFromDecorations) * setCount,
                    discount: itemDiscount,
                };
            },

            updateTotalSummary() {
                let totalFabric = 0;
                let totalDeco = 0;
                let totalDiscount = App.sanitizeValue(App.DOM.elements.discountInput.value);

                State.rooms.forEach(room => {
                    if (room.isSuspended) return;

                    let roomSubtotal = 0;
                    room.items.forEach(item => {
                        const result = this.calculateItem(item);
                        roomSubtotal += result.subtotal;
                        totalFabric += result.fabric;
                        totalDeco += result.deco;
                        totalDiscount += result.discount;

                        const itemCardEl = document.querySelector(`[data-item-id="${item.id}"]`);
                        if (itemCardEl) {
                            itemCardEl.querySelector('.item-summary-price').textContent = result.subtotal.toFixed(2);
                        }
                    });

                    const roomCardEl = document.querySelector(`[data-room-id="${room.id}"]`);
                    if (roomCardEl) {
                        roomCardEl.querySelector('.room-summary-price').textContent = roomSubtotal.toFixed(2);
                    }
                });

                this.fabricPrice = totalFabric;
                this.decoPrice = totalDeco;
                this.totalPrice = Math.max(0, this.fabricPrice + this.decoPrice - totalDiscount);

                App.DOM.elements.summaryTotalPrice.textContent = this.totalPrice.toFixed(2);
                App.DOM.elements.summaryFabricPrice.textContent = this.fabricPrice.toFixed(2);
                App.DOM.elements.summaryDecoPrice.textContent = this.decoPrice.toFixed(2);
                App.DOM.elements.summaryDiscountPrice.textContent = totalDiscount.toFixed(2);

                State.preparePayload();
            }
        },

        // UI-related methods
        restoreUI() {
            State.rooms.forEach(roomData => {
                const roomEl = this.DOM.createRoomElement(roomData);
                this.DOM.elements.roomsContainer.appendChild(roomEl);
                const itemContainer = roomEl.querySelector('.item-container');

                roomData.items.forEach(itemData => {
                    const itemEl = this.DOM.createItemElement(itemData);
                    itemContainer.appendChild(itemEl);
                    const decoContainer = itemEl.querySelector('.deco-container');

                    itemData.decorations.forEach(decoData => {
                        const decoEl = this.DOM.createDecoElement(decoData);
                        decoContainer.appendChild(decoEl);
                    });
                });
            });
            State.syncStateFromDOM();
            this.updateTotalSummary();
        },

        updateLockState() {
            const lockIcon = this.DOM.elements.lockBtn.querySelector('.lock-icon');
            const lockText = this.DOM.elements.lockBtn.querySelector('.lock-text');
            const allInputs = document.querySelectorAll('#orderForm input, #orderForm select, #orderForm textarea, #orderForm button');

            allInputs.forEach(el => {
                if (el.id !== 'lockBtn' && el.id !== 'clearAllBtn') {
                    el.disabled = State.isLocked;
                }
            });

            if (State.isLocked) {
                lockText.textContent = 'ปลดล็อค';
                lockIcon.textContent = '🔓';
                this.DOM.showToast('หน้าจอถูกล็อคแล้ว', 'warning');
            } else {
                lockText.textContent = 'ล็อค';
                lockIcon.textContent = '🔒';
                this.DOM.showToast('หน้าจอถูกปลดล็อคแล้ว', 'success');
            }
        },

        sanitizeValue(value) {
            return parseFloat(value.toString().replace(/,/g, '')) || 0;
        },

        updateTotalSummary() {
            this.Calculations.updateTotalSummary();
        },

        toggleSummary(e) {
            const popup = this.DOM.elements.summaryToggleBtn.nextElementSibling;
            const toggleBtn = e.target.closest('.summary-toggle-btn');
            if (popup && toggleBtn) {
                popup.style.display = (popup.style.display === 'block') ? 'none' : 'block';
                toggleBtn.textContent = (popup.style.display === 'block') ? '▲' : '▼';
            }
        }
    };

    // The main entry point
    document.addEventListener('DOMContentLoaded', App.init.bind(App));
})();