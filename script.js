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

    const ELEMENTS = {};
    for (const key in SELECTORS) {
        ELEMENTS[key] = document.querySelector(SELECTORS[key]);
    }

    let isLocked = false;
    let roomCount = 0;
    let confirmAction = null;

    // --- UTILITY FUNCTIONS ---
    function formatNumber(num) { return new Intl.NumberFormat('th-TH').format(Math.round(num)); }
    function formatPrice(num) { return `${new Intl.NumberFormat('th-TH').format(Math.round(num))} บ.`; }
    function showToast(message, type = 'info') {
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
        ELEMENTS.modalTitle.textContent = title;
        ELEMENTS.modalBody.textContent = body;
        ELEMENTS.confirmationModal.classList.add('visible');
        confirmAction = onConfirm;
    }

    function hideModal() { ELEMENTS.confirmationModal.classList.remove('visible'); }

    function updateLockState() {
        const fields = ELEMENTS.orderForm.querySelectorAll('.field');
        const buttons = ELEMENTS.orderForm.querySelectorAll('.btn:not(#lockBtn):not(#clearAllBtn)');
        const lockText = ELEMENTS.lockBtn.querySelector('.lock-text');
        const lockIcon = ELEMENTS.lockBtn.querySelector('.lock-icon');
        
        fields.forEach(field => field.disabled = isLocked);
        buttons.forEach(btn => btn.disabled = isLocked);
        ELEMENTS.submitBtn.disabled = isLocked;
        lockText.textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        lockIcon.textContent = isLocked ? '🔓' : '🔒';
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
            const roomStyle = roomEl.querySelector('select[name="room_style"]').value;
            
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

                setEl.querySelector('[data-total]').textContent = formatPrice(setTotal);
                setEl.querySelector('[data-item-title]').textContent = `จุดที่ ${setIndex + 1}`;
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

                decoEl.querySelector('[data-total]').textContent = formatPrice(decoTotal);
                decoEl.querySelector('[data-item-title]').textContent = `ตกแต่งที่ ${decoIndex + 1}`;
            });

            roomEl.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด ${roomSets + roomDeco}</span> • <span class="num">ชุด ${roomSets}</span> • ราคา <span class="num price">${formatNumber(roomTotal)}</span> บ.`;
            grandTotal += roomTotal;
            totalFabric += roomFabric;
            totalSheerFabric += roomSheerFabric;
        });

        ELEMENTS.grandTotal.textContent = formatPrice(grandTotal);
        ELEMENTS.grandFabric.textContent = `${totalFabric.toFixed(2)} หลา`;
        ELEMENTS.grandSheerFabric.textContent = `${totalSheerFabric.toFixed(2)} หลา`;
        ELEMENTS.grandOpaqueTrack.textContent = `${totalOpaqueTrack.toFixed(2)} ม.`;
        ELEMENTS.grandSheerTrack.textContent = `${totalSheerTrack.toFixed(2)} ม.`;
        ELEMENTS.setCount.textContent = formatNumber(setCount);
        ELEMENTS.setCountSets.textContent = formatNumber(setCountSets);
        ELEMENTS.setCountDeco.textContent = formatNumber(setCountDeco);
    }

    function buildPayload() {
        const customerInfo = {};
        ELEMENTS.orderForm.querySelectorAll('#customerInfo input').forEach(input => {
            customerInfo[input.name] = input.value;
        });

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
        roomCount++;
        const roomEl = ELEMENTS.roomTpl.content.cloneNode(true).firstElementChild;
        roomEl.querySelector('input[name="room_name"]').placeholder = `ห้องที่ ${roomCount}`;
        roomEl.querySelector('input[name="room_name"]').value = payload ? payload.room_name : '';
        
        const priceSelect = roomEl.querySelector('select[name="room_price_per_m"]');
        populateSelect(priceSelect, CONFIG.FABRIC_PRICES);
        if (payload) priceSelect.value = payload.room_price_per_m;
        
        const styleSelect = roomEl.querySelector('select[name="room_style"]');
        if (payload) styleSelect.value = payload.room_style;
        
        ELEMENTS.roomsContainer.appendChild(roomEl);
        
        if (payload && payload.sets.length > 0) payload.sets.forEach(addSet.bind(null, roomEl));
        if (payload && payload.decorations.length > 0) payload.decorations.forEach(addDeco.bind(null, roomEl));
    }

    function addSet(roomEl, payload = null) {
        const setsContainer = roomEl.querySelector('[data-sets]');
        const setEl = ELEMENTS.setTpl.content.cloneNode(true).firstElementChild;
        const sheerSelect = setEl.querySelector('select[name="sheer_price_per_m"]');
        populateSelect(sheerSelect, CONFIG.SHEER_PRICES);

        if (payload) {
            if (payload.suspended) setEl.classList.add('is-suspended');
            setEl.querySelector('input[name="width_m"]').value = payload.width_m;
            setEl.querySelector('input[name="height_m"]').value = payload.height_m;
            setEl.querySelector('input[name="quantity"]').value = payload.quantity;
            setEl.querySelector('input[name="track_type"]').value = payload.track_type;
            sheerSelect.value = payload.sheer_price_per_m;
            setEl.querySelector('input[name="extra_cm"]').value = payload.extra_cm;
            setEl.querySelector('input[name="fold_times"]').value = payload.fold_times;
            setEl.querySelector('input[name="track_length_m"]').value = payload.track_length_m;
        }

        setsContainer.appendChild(setEl);
    }

    function addDeco(roomEl, payload = null) {
        const decosContainer = roomEl.querySelector('[data-decorations]');
        const decoEl = ELEMENTS.decoTpl.content.cloneNode(true).firstElementChild;

        if (payload) {
            if (payload.suspended) decoEl.classList.add('is-suspended');
            decoEl.querySelector('input[name="type"]').value = payload.type;
            decoEl.querySelector('input[name="price_per_sq_yd"]').value = payload.price_per_sq_yd;
            decoEl.querySelector('input[name="width_m"]').value = payload.width_m;
            decoEl.querySelector('input[name="height_m"]').value = payload.height_m;
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
                    if (targetEl.classList.toggle('is-suspended')) {
                        btn.querySelector('[data-suspend-text]').textContent = 'เรียกคืน';
                        showToast('ระงับการคำนวณเรียบร้อย', 'warning');
                    } else {
                        btn.querySelector('[data-suspend-text]').textContent = 'ระงับ';
                        showToast('เรียกคืนรายการเรียบร้อย', 'success');
                    }
                    calculateAll();
                    break;
                case 'clear-set':
                    parentSet.querySelectorAll('input').forEach(input => input.value = '');
                    parentSet.querySelector('select[name="sheer_price_per_m"]').value = '';
                    calculateAll();
                    break;
            }
        });

        ELEMENTS.addRoomHeaderBtn.addEventListener('click', () => {
            addRoom();
            calculateAll();
        });
        
        ELEMENTS.clearAllBtn.addEventListener('click', () => {
            showModal('ยืนยันการล้างข้อมูล', 'คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด?', () => {
                localStorage.removeItem(CONFIG.STORAGE_KEY);
                ELEMENTS.roomsContainer.innerHTML = '';
                addRoom();
                calculateAll();
                hideModal();
            });
        });

        ELEMENTS.lockBtn.addEventListener('click', () => {
            isLocked = !isLocked;
            updateLockState();
            showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'info');
        });
        
        ELEMENTS.modalCancel.addEventListener('click', hideModal);
        ELEMENTS.modalConfirm.addEventListener('click', () => { if (confirmAction) confirmAction(); });

        ELEMENTS.orderForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const payload = buildPayload();
            const payloadInput = ELEMENTS.orderForm.querySelector('input[name="payload"]');
            payloadInput.value = JSON.stringify(payload);
            showToast('ส่งข้อมูลแล้ว (ฟังก์ชันนี้สำหรับทดสอบเท่านั้น)', 'success');
        });

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

        window.addEventListener('beforeunload', () => {
            const payload = buildPayload();
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload));
        });
        
        window.addEventListener('load', () => {
            const storedData = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (storedData) {
                try {
                    const payload = JSON.parse(storedData);
                    document.querySelector('input[name="customer_name"]').value = payload.customer_name;
                    document.querySelector('input[name="customer_address"]').value = payload.customer_address;
                    document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
                    ELEMENTS.roomsContainer.innerHTML = ""; roomCount = 0;
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
        });
    }
    
    bindEvents();
})();