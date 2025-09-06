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

    updateLockState(isLocked) {
        const lockIcon = this.elements.lockBtn.querySelector('.lock-icon');
        const lockText = this.elements.lockBtn.querySelector('.lock-text');
        const allInputs = document.querySelectorAll('#orderForm input, #orderForm select, #orderForm textarea, #orderForm button');

        allInputs.forEach(el => {
            if (el.id !== 'lockBtn' && el.id !== 'clearAllBtn') {
                el.disabled = isLocked;
            }
        });

        if (isLocked) {
            lockText.textContent = 'ปลดล็อค';
            lockIcon.textContent = '🔓';
            this.showToast('หน้าจอถูกล็อคแล้ว', 'warning');
        } else {
            lockText.textContent = 'ล็อค';
            lockIcon.textContent = '🔒';
            this.showToast('หน้าจอถูกปลดล็อคแล้ว', 'success');
        }
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
};

export default DOM;