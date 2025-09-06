import Calculations from './calculations.js';
import DOM from './dom.js';

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
            this.restoreUI();
        } else {
            this.addRoom();
        }
        DOM.updateLockState(this.isLocked);
    },

    save() {
        const payload = {
            isLocked: this.isLocked,
            rooms: this.rooms,
        };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
    },

    restoreUI() {
        this.rooms.forEach(roomData => {
            const roomEl = DOM.createRoomElement(roomData);
            DOM.elements.roomsContainer.appendChild(roomEl);
            const itemContainer = roomEl.querySelector('.item-container');

            roomData.items.forEach(itemData => {
                const itemEl = DOM.createItemElement(itemData);
                itemContainer.appendChild(itemEl);
                const decoContainer = itemEl.querySelector('.deco-container');

                itemData.decorations.forEach(decoData => {
                    const decoEl = DOM.createDecoElement(decoData);
                    decoContainer.appendChild(decoEl);
                });
            });
        });
        this.syncStateFromDOM();
        Calculations.updateTotalSummary();
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
        const roomEl = DOM.createRoomElement();
        DOM.elements.roomsContainer.appendChild(roomEl);
        DOM.cacheDynamicElements();
        this.syncStateFromDOM();
        DOM.scrollToElement(roomEl);
    },

    addItem(roomCard) {
        const itemContainer = roomCard.querySelector('.item-container');
        const itemEl = DOM.createItemElement();
        itemContainer.appendChild(itemEl);
        DOM.cacheDynamicElements();
        this.syncStateFromDOM();
        DOM.scrollToElement(itemEl);
    },

    addDeco(itemCard) {
        const decoContainer = itemCard.querySelector('.deco-container');
        const decoEl = DOM.createDecoElement();
        decoContainer.appendChild(decoEl);
        DOM.cacheDynamicElements();
        this.syncStateFromDOM();
        DOM.scrollToElement(decoEl);
    },

    deleteElement(el, type) {
        const parentRoom = DOM.findRoomCard(el);
        const parentItem = DOM.findItemCard(el);
        const prevSibling = el.previousElementSibling;

        if (confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) {
            el.remove();
            this.syncStateFromDOM();
            Calculations.updateTotalSummary();

            let scrollToEl;
            if (type === 'room') {
                scrollToEl = prevSibling || DOM.elements.roomsContainer.lastElementChild;
            } else if (type === 'item') {
                scrollToEl = prevSibling || parentRoom.querySelector('.item-container').lastElementChild;
            } else if (type === 'deco') {
                scrollToEl = prevSibling || parentItem.querySelector('.deco-container').lastElementChild;
            }
            DOM.scrollToElement(scrollToEl);
        }
    },

    toggleSuspend(el, type) {
        const target = (type === 'room') ? DOM.findRoomCard(el) : (type === 'item' ? DOM.findItemCard(el) : el.closest('.deco-card'));
        if (target) {
            target.classList.toggle('suspended');
            const isSuspended = target.classList.contains('suspended');
            el.querySelector('[data-suspend-text]').textContent = isSuspended ? 'เรียกคืน' : 'ระงับ';
            this.syncStateFromDOM();
            Calculations.updateTotalSummary();
        }
    },

    toggleLock() {
        this.isLocked = !this.isLocked;
        DOM.updateLockState(this.isLocked);
        this.save();
    },

    clearAll() {
        if (confirm('คุณต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?')) {
            localStorage.removeItem(this.STORAGE_KEY);
            DOM.elements.roomsContainer.innerHTML = '';
            this.rooms = [];
            this.addRoom();
            Calculations.updateTotalSummary();
            DOM.showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
        }
    },

    preparePayload() {
        const customerInfo = {
            customer_name: DOM.elements.customerName.value,
            customer_address: DOM.elements.customerAddress.value,
            customer_phone: DOM.elements.customerPhone.value,
        };
        const summary = {
            discount: parseFloat(DOM.elements.discountInput.value) || 0,
            deposit: parseFloat(DOM.elements.depositInput.value) || 0,
            total: Calculations.totalPrice,
            fabric_total: Calculations.fabricPrice,
            deco_total: Calculations.decoPrice,
        };
        const data = {
            customer: customerInfo,
            summary: summary,
            rooms: this.rooms,
        };
        DOM.elements.payloadInput.value = JSON.stringify(data);
    }
};

export default State;