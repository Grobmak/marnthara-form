(function() {
    // --- APP-WIDE CONFIGURATION & STATE ---
    const CONFIG = {
        STORAGE_KEY: 'marntharaData',
        FABRIC_PRICES: [250, 260, 270, 280, 290, 300, 310, 320, 330, 340, 350, 360, 370, 380, 390, 400, 410, 420, 430, 440, 450, 460, 470, 480, 490, 500, 520, 540, 560, 580, 600, 620, 640, 660, 680, 700, 720, 740, 760, 780, 800, 820, 840, 860, 880, 900, 950, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800, 2900, 3000, 3100, 3200, 3300, 3400, 3500, 3600, 3700, 3800, 3900, 4000],
        SHEER_PRICES: [250, 260, 270, 280, 290, 300, 310, 320, 330, 340, 350, 360, 370, 380, 390, 400, 410, 420, 430, 440, 450, 460, 470, 480, 490, 500, 520, 540, 560, 580, 600, 620, 640, 660, 680, 700, 720, 740, 760, 780, 800, 820, 840, 860, 880, 900, 950, 1000]
    };

    const SELECTORS = {
        orderForm: '#orderForm',
        roomsContainer: '#rooms',
        addRoomHeaderBtn: '#addRoomHeaderBtn',
        clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn',
        submitBtn: '#submitBtn',
        payloadInput: '#payload',
        toastContainer: '#toast-container',
        confirmationModal: '#confirmationModal',
        modalTitle: '#modalTitle',
        modalBody: '#modalBody',
        modalConfirm: '#modalConfirm',
        modalCancel: '#modalCancel',
        grandTotal: '#grandTotal',
        grandFabric: '#grandFabric',
        grandSheerFabric: '#grandSheerFabric',
        grandOpaqueTrack: '#grandOpaqueTrack',
        grandSheerTrack: '#grandSheerTrack',
        setCount: '#setCount',
        setCountSets: '#setCountSets',
        setCountDeco: '#setCountDeco',
        roomTpl: '#roomTpl',
        setTpl: '#setTpl',
        decoTpl: '#decoTpl'
    };

    let ELEMENTS = {};
    let isLocked = false;
    let roomCount = 0;
    let confirmAction = null;

    // --- UTILITY FUNCTIONS ---
    function formatNumber(num) { return new Intl.NumberFormat('th-TH').format(Math.round(num)); }
    function formatPrice(num) { return `${new Intl.NumberFormat('th-TH').format(Math.round(num))} บ.`; }
    function showToast(message, type = 'info') {
        if (!ELEMENTS.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        ELEMENTS.toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    function showModal(title, body, onConfirm) {
        if (!ELEMENTS.confirmationModal) return;
        ELEMENTS.modalTitle.textContent = title;
        ELEMENTS.modalBody.textContent = body;
        ELEMENTS.confirmationModal.classList.add('visible');
        confirmAction = onConfirm;
    }

    function hideModal() { 
        if (!ELEMENTS.confirmationModal) return;
        ELEMENTS.confirmationModal.classList.remove('visible'); 
    }

    function updateLockState() {
        if (!ELEMENTS.orderForm || !ELEMENTS.lockBtn || !ELEMENTS.submitBtn) return;
        const fields = ELEMENTS.orderForm.querySelectorAll('.field');
        const buttons = ELEMENTS.orderForm.querySelectorAll('.btn:not(#lockBtn):not(#clearAllBtn)');
        const lockText = ELEMENTS.lockBtn.querySelector('.lock-text');
        const lockIcon = ELEMENTS.lockBtn.querySelector('.lock-icon');
        
        fields.forEach(field => field.disabled = isLocked);
        buttons.forEach(btn => btn.disabled = isLocked);
        ELEMENTS.submitBtn.disabled = isLocked;
        if (lockText) lockText.textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        if (lockIcon) lockIcon.textContent = isLocked ? '🔓' : '🔒';
    }

    function populateSelect(selectEl, prices) {
        selectEl.innerHTML = '<option value="" hidden>เลือก</option>';
        prices.forEach(price => {
            const option = document.createElement('option');
            option.value = price;
            option.textContent = price;
            selectEl.appendChild(option);
        });
    }

    function calculateAll() {
        let grandTotal = 0;
        let totalFabric = 0;
        let totalSheerFabric = 0;
        let totalOpaqueTrack = 0;
        let totalSheerTrack = 0;
        let setCount = 0;
        let setCountSets = 0;
        let setCountDeco = 0;

        document.querySelectorAll('[data-room]').forEach(roomEl => {
            let roomTotal = 0;
            let roomFabric = 0;
            let roomSheerFabric = 0;
            let roomSets = 0;
            let roomDeco = 0;

            const roomName = roomEl.querySelector('input[name="room_name"]').value || 'ห้อง';
            const roomPricePerM = parseFloat(roomEl.querySelector('select[name="room_price_per_m"]').value) || 0;
            
            roomEl.querySelectorAll('[data-set]:not(.is-suspended)').forEach((setEl, setIndex) => {
                const widthM = parseFloat(setEl.querySelector('input[name="width_m"]').value) || 0;
                const heightM = parseFloat(setEl.querySelector('input[name="height_m"]').value) || 0;
                const quantity = parseInt(setEl.querySelector('input[name="quantity"]').value) || 1;
                const extraCm = parseFloat(setEl.querySelector('input[name="extra_cm"]').value) || 0;
                const foldTimes = parseFloat(setEl.querySelector('input[name="fold_times"]').value) || 2.5;
                const sheerPricePerM = parseFloat(setEl.querySelector('select[name="sheer_price_per_m"]').value) || 0;
                const trackLengthM = parseFloat(setEl.querySelector('input[name="track_length_m"]').value) || 0;

                const curtainWidth = widthM * foldTimes;
                const curtainHeight = (heightM + (extraCm / 100));
                const fabricYd = (curtainWidth * 1.09361) * (curtainHeight * 1.09361) * quantity;
                const price = roomPricePerM > 0 ? fabricYd * roomPricePerM : 0;
                
                const sheerFabricYd = sheerPricePerM > 0 ? (widthM * 1.09361) * (curtainHeight * 1.09361) * quantity : 0;
                const sheerPrice = sheerFabricYd > 0 ? sheerFabricYd * sheerPricePerM : 0;

                const setTotal = price + sheerPrice;
                roomTotal += setTotal;
                roomFabric += fabricYd;
                roomSheerFabric += sheerFabricYd;
                totalOpaqueTrack += widthM;
                totalSheerTrack += trackLengthM;
                roomSets += quantity;
                setCountSets += quantity;
                setCount++;

                const totalEl = setEl.querySelector('[data-total]');
                if (totalEl) totalEl.textContent = formatPrice(setTotal);
                const itemTitleEl = setEl.querySelector('[data-item-title]');
                if (itemTitleEl) itemTitleEl.textContent = `จุดที่ ${setIndex + 1}`;
            });

            roomEl.querySelectorAll('[data-deco]:not(.is-suspended)').forEach((decoEl, decoIndex) => {
                const pricePerSqYd = parseFloat(decoEl.querySelector('input[name="price_per_sq_yd"]').value) || 0;
                const widthM = parseFloat(decoEl.querySelector('input[name="width_m"]').value) || 0;
                const heightM = parseFloat(decoEl.querySelector('input[name="height_m"]').value) || 0;
                const sqYd = (widthM * heightM) * 1.19599;
                const decoTotal = sqYd * pricePerSqYd;
                roomTotal += decoTotal;
                roomDeco++;
                setCountDeco++;
                setCount++;

                const totalEl = decoEl.querySelector('[data-total]');
                if (totalEl) totalEl.textContent = formatPrice(decoTotal);
                const itemTitleEl = decoEl.querySelector('[data-item-title]');
                if (itemTitleEl) itemTitleEl.textContent = `ตกแต่งที่ ${decoIndex + 1}`;
            });

            const roomBriefEl = roomEl.querySelector('[data-room-brief]');
            if (roomBriefEl) roomBriefEl.innerHTML = `<span class="num">จุด ${roomSets + roomDeco}</span> • <span class="num">ชุด ${roomSets}</span> • ราคา <span class="num price">${formatNumber(roomTotal)}</span> บ.`;
            grandTotal += roomTotal;
            totalFabric += roomFabric;
            totalSheerFabric += roomSheerFabric;
        });

        if (ELEMENTS.grandTotal) ELEMENTS.grandTotal.textContent = formatPrice(grandTotal);
        if (ELEMENTS.grandFabric) ELEMENTS.grandFabric.textContent = `${totalFabric.toFixed(2)} หลา`;
        if (ELEMENTS.grandSheerFabric) ELEMENTS.grandSheerFabric.textContent = `${totalSheerFabric.toFixed(2)} หลา`;
        if (ELEMENTS.grandOpaqueTrack) ELEMENTS.grandOpaqueTrack.textContent = `${totalOpaqueTrack.toFixed(2)} ม.`;
        if (ELEMENTS.grandSheerTrack) ELEMENTS.grandSheerTrack.textContent = `${totalSheerTrack.toFixed(2)} ม.`;
        if (ELEMENTS.setCount) ELEMENTS.setCount.textContent = formatNumber(setCount);
        if (ELEMENTS.setCountSets) ELEMENTS.setCountSets.textContent = formatNumber(setCountSets);
        if (ELEMENTS.setCountDeco) ELEMENTS.setCountDeco.textContent = formatNumber(setCountDeco);
    }

    function buildPayload() {
        const customerInfo = {};
        if (ELEMENTS.orderForm) {
            ELEMENTS.orderForm.querySelectorAll('#customerInfo input').forEach(input => {
                customerInfo[input.name] = input.value;
            });
        }

        const rooms = [];
        document.querySelectorAll('[data-room]').forEach(roomEl => {
            const roomName = roomEl.querySelector('input[name="room_name"]').value;
            const roomPricePerM = parseFloat(roomEl.querySelector('select[name="room_price_per_m"]').value) || 0;
            const roomStyle = roomEl.querySelector('select[name="room_style"]').value;

            const sets = [];
            roomEl.querySelectorAll('[data-set]').forEach(setEl => {
                const suspend = setEl.classList.contains('is-suspended');
                const set = {
                    width_m: parseFloat(setEl.querySelector('input[name="width_m"]').value) || 0,
                    height_m: parseFloat(setEl.querySelector('input[name="height_m"]').value) || 0,
                    quantity: parseInt(setEl.querySelector('input[name="quantity"]').value) || 1,
                    track_type: setEl.querySelector('input[name="track_type"]').value,
                    sheer_price_per_m: parseFloat(setEl.querySelector('select[name="sheer_price_per_m"]').value) || 0,
                    extra_cm: parseFloat(setEl.querySelector('input[name="extra_cm"]').value) || 0,
                    fold_times: parseFloat(setEl.querySelector('input[name="fold_times"]').value) || 2.5,
                    track_length_m: parseFloat(setEl.querySelector('input[name="track_length_m"]').value) || 0,
                    suspended: suspend
                };
                sets.push(set);
            });

            const decorations = [];
            roomEl.querySelectorAll('[data-deco]').forEach(decoEl => {
                const suspend = decoEl.classList.contains('is-suspended');
                const deco = {
                    type: decoEl.querySelector('input[name="type"]').value,
                    price_per_sq_yd: parseFloat(decoEl.querySelector('input[name="price_per_sq_yd"]').value) || 0,
                    width_m: parseFloat(decoEl.querySelector('input[name="width_m"]').value) || 0,
                    height_m: parseFloat(decoEl.querySelector('input[name="height_m"]').value) || 0,
                    suspended: suspend
                };
                decorations.push(deco);
            });

            rooms.push({ room_name: roomName, room_price_per_m: roomPricePerM, room_style: roomStyle, sets, decorations });
        });

        return { ...customerInfo, rooms };
    }

    function addRoom(payload = null) {
        if (!ELEMENTS.roomsContainer || !ELEMENTS.roomTpl) return;
        roomCount++;
        const roomEl = ELEMENTS.roomTpl.content.cloneNode(true).firstElementChild;
        const roomNameInput = roomEl.querySelector('input[name="room_name"]');
        if (roomNameInput) roomNameInput.placeholder = `ห้องที่ ${roomCount}`;
        if (payload && roomNameInput) roomNameInput.value = payload.room_name;
        
        const priceSelect = roomEl.querySelector('select[name="room_price_per_m"]');
        if (priceSelect) populateSelect(priceSelect, CONFIG.FABRIC_PRICES);
        if (payload && priceSelect) priceSelect.value = payload.room_price_per_m;
        
        const styleSelect = roomEl.querySelector('select[name="room_style"]');
        if (payload && styleSelect) styleSelect.value = payload.room_style;
        
        ELEMENTS.roomsContainer.appendChild(roomEl);
        
        if (payload && payload.sets && payload.sets.length > 0) payload.sets.forEach(addSet.bind(null, roomEl));
        if (payload && payload.decorations && payload.decorations.length > 0) payload.decorations.forEach(addDeco.bind(null, roomEl));
    }

    function addSet(roomEl, payload = null) {
        if (!roomEl || !ELEMENTS.setTpl) return;
        const setsContainer = roomEl.querySelector('[data-sets]');
        if (!setsContainer) return;
        const setEl = ELEMENTS.setTpl.content.cloneNode(true).firstElementChild;
        const sheerSelect = setEl.querySelector('select[name="sheer_price_per_m"]');
        if (sheerSelect) populateSelect(sheerSelect, CONFIG.SHEER_PRICES);

        if (payload) {
            if (payload.suspended) setEl.classList.add('is-suspended');
            const inputs = setEl.querySelectorAll('input');
            const selects = setEl.querySelectorAll('select');
            
            inputs.forEach(input => {
                if (payload[input.name] !== undefined) input.value = payload[input.name];
            });
            selects.forEach(select => {
                if (payload[select.name] !== undefined) select.value = payload[select.name];
            });
        }
        setsContainer.appendChild(setEl);
    }

    function addDeco(roomEl, payload = null) {
        if (!roomEl || !ELEMENTS.decoTpl) return;
        const decosContainer = roomEl.querySelector('[data-decorations]');
        if (!decosContainer) return;
        const decoEl = ELEMENTS.decoTpl.content.cloneNode(true).firstElementChild;

        if (payload) {
            if (payload.suspended) decoEl.classList.add('is-suspended');
            const inputs = decoEl.querySelectorAll('input');
            inputs.forEach(input => {
                if (payload[input.name] !== undefined) input.value = payload[input.name];
            });
        }
        decosContainer.appendChild(decoEl);
    }

    // --- EVENT HANDLERS ---
    function bindEvents() {
        document.addEventListener('input', (e) => {
            if (e.target.closest('[data-room]')) calculateAll();
        });

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const action = btn.dataset.act;
            const parentRoom = btn.closest('[data-room]');
            const parentSet = btn.closest('[data-set]');
            const parentDeco = btn.closest('[data-deco]');

            switch (action) {
                case 'add-set': addSet(parentRoom); break;
                case 'add-deco': addDeco(parentRoom); break;
                case 'add-item-deco': addDeco(parentSet); break;
                case 'del-room':
                    showModal('ยืนยันการลบ', 'คุณแน่ใจหรือไม่ว่าต้องการลบห้องนี้? ข้อมูลทั้งหมดจะหายไป', () => {
                        parentRoom.remove();
                        calculateAll();
                        hideModal();
                    });
                    break;
                case 'del-set':
                    showModal('ยืนยันการลบ', 'คุณแน่ใจหรือไม่ว่าต้องการลบจุดผ้าม่านนี้?', () => {
                        parentSet.remove();
                        calculateAll();
                        hideModal();
                    });
                    break;
                case 'del-deco':
                    showModal('ยืนยันการลบ', 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการตกแต่งนี้?', () => {
                        parentDeco.remove();
                        calculateAll();
                        hideModal();
                    });
                    break;
                case 'toggle-suspend':
                    const targetEl = parentSet || parentDeco;
                    if (targetEl) {
                        if (targetEl.classList.toggle('is-suspended')) {
                            const suspendTextEl = btn.querySelector('[data-suspend-text]');
                            if (suspendTextEl) suspendTextEl.textContent = 'เรียกคืน';
                            showToast('ระงับการคำนวณเรียบร้อย', 'warning');
                        } else {
                            const suspendTextEl = btn.querySelector('[data-suspend-text]');
                            if (suspendTextEl) suspendTextEl.textContent = 'ระงับ';
                            showToast('เรียกคืนรายการเรียบร้อย', 'success');
                        }
                    }
                    calculateAll();
                    break;
                case 'clear-set':
                    if (parentSet) {
                        parentSet.querySelectorAll('input').forEach(input => input.value = '');
                        const sheerSelect = parentSet.querySelector('select[name="sheer_price_per_m"]');
                        if (sheerSelect) sheerSelect.value = '';
                    }
                    calculateAll();
                    break;
            }
        });

        if (ELEMENTS.addRoomHeaderBtn) {
            ELEMENTS.addRoomHeaderBtn.addEventListener('click', () => {
                addRoom();
                calculateAll();
            });
        }
        
        if (ELEMENTS.clearAllBtn) {
            ELEMENTS.clearAllBtn.addEventListener('click', () => {
                showModal('ยืนยันการล้างข้อมูล', 'คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด?', () => {
                    localStorage.removeItem(CONFIG.STORAGE_KEY);
                    if (ELEMENTS.roomsContainer) ELEMENTS.roomsContainer.innerHTML = '';
                    roomCount = 0;
                    addRoom();
                    calculateAll();
                    hideModal();
                });
            });
        }

        if (ELEMENTS.lockBtn) {
            ELEMENTS.lockBtn.addEventListener('click', () => {
                isLocked = !isLocked;
                updateLockState();
                showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'info');
            });
        }
        
        if (ELEMENTS.modalCancel) ELEMENTS.modalCancel.addEventListener('click', hideModal);
        if (ELEMENTS.modalConfirm) {
            ELEMENTS.modalConfirm.addEventListener('click', () => { 
                if (confirmAction) confirmAction(); 
            });
        }

        if (ELEMENTS.orderForm) {
            ELEMENTS.orderForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const payload = buildPayload();
                if (ELEMENTS.payloadInput) {
                    ELEMENTS.payloadInput.value = JSON.stringify(payload);
                }
                showToast('ส่งข้อมูลแล้ว (ฟังก์ชันนี้สำหรับทดสอบเท่านั้น)', 'success');
            });
        }

        if (ELEMENTS.copyJsonBtn) {
            ELEMENTS.copyJsonBtn.addEventListener('click', () => {
                const payload = buildPayload();
                const jsonString = JSON.stringify(payload, null, 2);
                navigator.clipboard.writeText(jsonString)
                    .then(() => showToast('คัดลอก JSON แล้ว', 'success'))
                    .catch(err => {
                        console.error('Failed to copy JSON: ', err);
                        showToast('คัดลอกไม่สำเร็จ', 'error');
                    });
            });
        }
    }

    // --- INITIALIZATION ---
    function init() {
        for (const key in SELECTORS) {
            ELEMENTS[key] = document.querySelector(SELECTORS[key]);
        }
        
        bindEvents();

        window.addEventListener('beforeunload', () => {
            const payload = buildPayload();
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload));
        });
        
        const storedData = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                const customerNameInput = document.querySelector('input[name="customer_name"]');
                const customerAddressInput = document.querySelector('input[name="customer_address"]');
                const customerPhoneInput = document.querySelector('input[name="customer_phone"]');

                if (customerNameInput) customerNameInput.value = payload.customer_name;
                if (customerAddressInput) customerAddressInput.value = payload.customer_address;
                if (customerPhoneInput) customerPhoneInput.value = payload.customer_phone;
                
                if (ELEMENTS.roomsContainer) ELEMENTS.roomsContainer.innerHTML = "";
                roomCount = 0;
                
                if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
                else addRoom();
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(CONFIG.STORAGE_KEY);
                addRoom();
            }
        } else {
            addRoom();
        }
        
        updateLockState();
        calculateAll();
    }

    document.addEventListener('DOMContentLoaded', init);
})();