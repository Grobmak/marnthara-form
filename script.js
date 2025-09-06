(function() {
    // --- APP-WIDE CONFIGURATION & STATE ---
    const APP_VERSION = 'v5.0';
    const WEBHOOK_URL = 'YOUR_WEBHOOK_URL_HERE'; // *** ใส่ URL Webhook ของคุณที่นี่ ***

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
        decoTpl: '#decoTpl',
        toastContainer: '#toast-container',
        confirmationModal: '#confirmationModal',
        modalTitle: '#modalTitle',
        modalBody: '#modalBody',
        modalConfirm: '#modalConfirm',
        modalCancel: '#modalCancel',
    };

    let ELEMENTS = {};
    let state = {
        isLocked: false,
        roomCount: 0,
        rooms: []
    };
    let confirmAction = null;

    // --- UTILITY FUNCTIONS ---
    function formatNumber(num) { return new Intl.NumberFormat('th-TH').format(Math.round(num)); }
    function formatPrice(num) { return `${new Intl.NumberFormat('th-TH').format(Math.round(num))} บ.`; }

    function showToast(message) {
        if (!ELEMENTS.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast`;
        toast.textContent = message;
        ELEMENTS.toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
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

    // --- DATA & CALCULATIONS ---
    const CALC = {
        calculateSet(data) {
            const widthM = parseFloat(data.width_m) || 0;
            const heightM = parseFloat(data.height_m) || 0;
            const quantity = parseInt(data.quantity) || 1;
            const extraCm = parseFloat(data.extra_cm) || 0;
            const foldTimes = parseFloat(data.fold_times) || 2.5;

            const curtainWidth = widthM * foldTimes;
            const curtainHeight = (heightM + (extraCm / 100));

            let opaquePrice = 0, opaqueYardage = 0, opaqueTrack = 0;
            let sheerPrice = 0, sheerYardage = 0, sheerTrack = 0;
            let totalTrack = 0;

            const roomPricePerM = parseFloat(data.room_price_per_m) || 0;
            const sheerPricePerM = parseFloat(data.sheer_price_per_m) || 0;
            const trackLengthM = parseFloat(data.track_length_m) || 0;

            if (data.fabric_variant.includes('ทึบ')) {
                opaqueYardage = (curtainWidth * 1.09361) * (curtainHeight * 1.09361) * quantity;
                opaquePrice = roomPricePerM > 0 ? opaqueYardage * roomPricePerM : 0;
                opaqueTrack = trackLengthM > 0 ? trackLengthM : widthM;
            }

            if (data.fabric_variant.includes('โปร่ง')) {
                sheerYardage = sheerPricePerM > 0 ? (widthM * 1.09361) * (curtainHeight * 1.09361) * quantity : 0;
                sheerPrice = sheerYardage > 0 ? sheerYardage * sheerPricePerM : 0;
                sheerTrack = trackLengthM > 0 ? trackLengthM : widthM;
            }

            const total = opaquePrice + sheerPrice;
            totalTrack = opaqueTrack + sheerTrack;

            return { total, opaquePrice, sheerPrice, opaqueYardage, sheerYardage, opaqueTrack, sheerTrack };
        },
        calculateDeco(data) {
            const pricePerSqYd = parseFloat(data.price_per_sq_yd) || 0;
            const widthM = parseFloat(data.width_m) || 0;
            const heightM = parseFloat(data.height_m) || 0;
            const quantity = parseInt(data.quantity) || 1;

            const sqYd = (widthM * 1.09361) * (heightM * 1.09361);
            const total = sqYd * pricePerSqYd * quantity;
            return { total };
        }
    };

    // --- STATE MANAGEMENT ---
    function updateGrandTotals() {
        let grandTotal = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        let setCount = 0;
        let setCountSets = 0;
        let setCountDeco = 0;

        state.rooms.forEach(room => {
            room.sets.filter(s => !s.isSuspended).forEach(set => {
                const results = CALC.calculateSet(set);
                grandTotal += results.total;
                grandFabric += results.opaqueYardage;
                grandSheerFabric += results.sheerYardage;
                grandOpaqueTrack += results.opaqueTrack;
                grandSheerTrack += results.sheerTrack;
                setCountSets += parseInt(set.quantity) || 1;
                setCount++;
            });
            room.decorations.filter(d => !d.isSuspended).forEach(deco => {
                const results = CALC.calculateDeco(deco);
                grandTotal += results.total;
                setCountDeco += parseInt(deco.quantity) || 1;
                setCount++;
            });
        });

        if (ELEMENTS.grandTotal) ELEMENTS.grandTotal.textContent = formatPrice(grandTotal);
        if (ELEMENTS.grandFabric) ELEMENTS.grandFabric.textContent = `${formatNumber(grandFabric)} หลา`;
        if (ELEMENTS.grandSheerFabric) ELEMENTS.grandSheerFabric.textContent = `${formatNumber(grandSheerFabric)} หลา`;
        if (ELEMENTS.grandOpaqueTrack) ELEMENTS.grandOpaqueTrack.textContent = `${formatNumber(grandOpaqueTrack)} ม.`;
        if (ELEMENTS.grandSheerTrack) ELEMENTS.grandSheerTrack.textContent = `${formatNumber(grandSheerTrack)} ม.`;
        if (ELEMENTS.setCount) ELEMENTS.setCount.textContent = formatNumber(setCount);
        if (ELEMENTS.setCountSets) ELEMENTS.setCountSets.textContent = formatNumber(setCountSets);
        if (ELEMENTS.setCountDeco) ELEMENTS.setCountDeco.textContent = formatNumber(setCountDeco);

        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
    }

    function render() {
        if (!ELEMENTS.roomsContainer) return;
        ELEMENTS.roomsContainer.innerHTML = '';
        state.rooms.forEach((room, roomIndex) => {
            const roomTpl = document.getElementById(SELECTORS.roomTpl.slice(1));
            if (!roomTpl) return;
            const roomEl = roomTpl.content.cloneNode(true).querySelector('[data-room]');
            roomEl.querySelector('input[name="room_name"]').value = room.room_name;

            const setsContainer = roomEl.querySelector('[data-sets]');
            const decosContainer = roomEl.querySelector('[data-decorations]');

            let roomTotal = 0;
            let roomSetCount = 0;
            let roomDecoCount = 0;

            room.sets.forEach((set, setIndex) => {
                const setTpl = document.getElementById(SELECTORS.setTpl.slice(1));
                if (!setTpl) return;
                const setEl = setTpl.content.cloneNode(true).querySelector('[data-set]');
                
                if (set.isSuspended) {
                    setEl.classList.add('is-suspended');
                    setEl.querySelector('[data-suspend-text]').textContent = 'เปิด';
                }

                // Populate set data
                setEl.querySelector('[data-item-title]').textContent = `จุดที่ ${setIndex + 1}`;
                for (const key in set) {
                    const input = setEl.querySelector(`[name="${key}"]`);
                    if (input) input.value = set[key];
                }

                const results = CALC.calculateSet(set);
                if (!set.isSuspended) {
                    roomTotal += results.total;
                    roomSetCount++;
                }

                // Update prices and yardage
                if (setEl.querySelector('[data-set-price-total]')) setEl.querySelector('[data-set-price-total]').textContent = formatNumber(results.total);
                if (setEl.querySelector('[data-set-price-opaque]')) setEl.querySelector('[data-set-price-opaque]').textContent = formatNumber(results.opaquePrice);
                if (setEl.querySelector('[data-set-price-sheer]')) setEl.querySelector('[data-set-price-sheer]').textContent = formatNumber(results.sheerPrice);
                if (setEl.querySelector('[data-set-yardage-opaque]')) setEl.querySelector('[data-set-yardage-opaque]').textContent = formatNumber(results.opaqueYardage);
                if (setEl.querySelector('[data-set-yardage-sheer]')) setEl.querySelector('[data-set-yardage-sheer]').textContent = formatNumber(results.sheerYardage);
                if (setEl.querySelector('[data-set-opaque-track]')) setEl.querySelector('[data-set-opaque-track]').textContent = formatNumber(results.opaqueTrack);
                if (setEl.querySelector('[data-set-sheer-track]')) setEl.querySelector('[data-set-sheer-track]').textContent = formatNumber(results.sheerTrack);

                // Show/hide sheer options
                if (setEl.querySelector('[data-sheer-wrap]')) {
                    if (set.fabric_variant.includes('โปร่ง')) setEl.querySelector('[data-sheer-wrap]').classList.remove('hidden');
                    else setEl.querySelector('[data-sheer-wrap]').classList.add('hidden');
                }
                if (setEl.querySelector('[data-sheer-price-label]')) {
                    if (set.fabric_variant.includes('โปร่ง')) setEl.querySelector('[data-sheer-price-label]').classList.remove('hidden');
                    else setEl.querySelector('[data-sheer-price-label]').classList.add('hidden');
                }
                if (setEl.querySelector('[data-sheer-track-label]')) {
                    if (set.fabric_variant.includes('โปร่ง')) setEl.querySelector('[data-sheer-track-label]').classList.remove('hidden');
                    else setEl.querySelector('[data-sheer-track-label]').classList.add('hidden');
                }

                setsContainer.appendChild(setEl);
            });

            room.decorations.forEach((deco, decoIndex) => {
                const decoTpl = document.getElementById(SELECTORS.decoTpl.slice(1));
                if (!decoTpl) return;
                const decoEl = decoTpl.content.cloneNode(true).querySelector('[data-deco-item]');
                
                if (deco.isSuspended) {
                    decoEl.classList.add('is-suspended');
                    decoEl.querySelector('[data-suspend-text]').textContent = 'เปิด';
                }

                // Populate deco data
                decoEl.querySelector('[data-item-title]').textContent = `ตกแต่งที่ ${decoIndex + 1}`;
                for (const key in deco) {
                    const input = decoEl.querySelector(`[name="${key}"]`);
                    if (input) input.value = deco[key];
                }

                const results = CALC.calculateDeco(deco);
                if (!deco.isSuspended) {
                    roomTotal += results.total;
                    roomDecoCount++;
                }

                // Update prices
                if (decoEl.querySelector('[data-total]')) decoEl.querySelector('[data-total]').textContent = formatNumber(results.total);

                decosContainer.appendChild(decoEl);
            });

            // Update room brief
            roomEl.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด ${roomSetCount + roomDecoCount}</span> • <span class="num">ชุด ${roomSetCount}</span> • ราคา <span class="num price">${formatNumber(roomTotal)}</span> บาท`;

            ELEMENTS.roomsContainer.appendChild(roomEl);
        });

        updateGrandTotals();
    }

    function addRoom() {
        const newRoom = {
            room_name: `ห้องที่ ${state.roomCount + 1}`,
            sets: [{
                width_m: '',
                height_m: '',
                quantity: 1,
                extra_cm: 15,
                fold_times: 2.5,
                open_type: 'แยกกลาง',
                fabric_variant: 'ทึบ',
                sheer_price_per_m: '',
                track_length_m: '',
                isSuspended: false
            }],
            decorations: [],
            isSuspended: false
        };
        state.rooms.push(newRoom);
        state.roomCount++;
        render();
    }

    function handleEvent(e) {
        const target = e.target;
        const action = target.dataset.act;
        const roomEl = target.closest('[data-room]');
        const roomIndex = roomEl ? Array.from(ELEMENTS.roomsContainer.children).indexOf(roomEl) : -1;
        
        const setEl = target.closest('[data-set]');
        const setIndex = setEl ? Array.from(roomEl.querySelector('[data-sets]').children).indexOf(setEl) : -1;

        const decoEl = target.closest('[data-deco-item]');
        const decoIndex = decoEl ? Array.from(roomEl.querySelector('[data-decorations]').children).indexOf(decoEl) : -1;
        
        switch (action) {
            case 'add-set':
                const newSet = {
                    width_m: '',
                    height_m: '',
                    quantity: 1,
                    extra_cm: 15,
                    fold_times: 2.5,
                    open_type: 'แยกกลาง',
                    fabric_variant: 'ทึบ',
                    sheer_price_per_m: '',
                    track_length_m: '',
                    isSuspended: false
                };
                if (roomIndex !== -1) state.rooms[roomIndex].sets.push(newSet);
                render();
                break;
            case 'add-deco':
                const newDeco = {
                    width_m: '',
                    height_m: '',
                    price_per_sq_yd: '',
                    quantity: 1,
                    isSuspended: false
                };
                if (roomIndex !== -1) state.rooms[roomIndex].decorations.push(newDeco);
                render();
                break;
            case 'del-room':
                showModal('ยืนยันการลบห้อง', 'คุณแน่ใจหรือไม่ที่จะลบห้องนี้? การกระทำนี้ไม่สามารถย้อนกลับได้', () => {
                    if (roomIndex !== -1) {
                        state.rooms.splice(roomIndex, 1);
                        state.roomCount--;
                        render();
                    }
                    hideModal();
                });
                break;
            case 'del-set':
                if (roomIndex !== -1 && setIndex !== -1) {
                    state.rooms[roomIndex].sets.splice(setIndex, 1);
                    render();
                }
                break;
            case 'del-deco':
                if (roomIndex !== -1 && decoIndex !== -1) {
                    state.rooms[roomIndex].decorations.splice(decoIndex, 1);
                    render();
                }
                break;
            case 'toggle-suspend':
                if (setEl) {
                    state.rooms[roomIndex].sets[setIndex].isSuspended = !state.rooms[roomIndex].sets[setIndex].isSuspended;
                } else if (decoEl) {
                    state.rooms[roomIndex].decorations[decoIndex].isSuspended = !state.rooms[roomIndex].decorations[decoIndex].isSuspended;
                }
                render();
                break;
            case 'clear-set':
                if (roomIndex !== -1 && setIndex !== -1) {
                    const newSet = {
                        width_m: '',
                        height_m: '',
                        quantity: 1,
                        extra_cm: 15,
                        fold_times: 2.5,
                        open_type: 'แยกกลาง',
                        fabric_variant: 'ทึบ',
                        sheer_price_per_m: '',
                        track_length_m: '',
                        isSuspended: false
                    };
                    state.rooms[roomIndex].sets[setIndex] = newSet;
                    render();
                }
                break;
            case 'clear-deco':
                if (roomIndex !== -1 && decoIndex !== -1) {
                    const newDeco = {
                        width_m: '',
                        height_m: '',
                        price_per_sq_yd: '',
                        quantity: 1,
                        isSuspended: false
                    };
                    state.rooms[roomIndex].decorations[decoIndex] = newDeco;
                    render();
                }
                break;
        }
    }

    function handleInput(e) {
        const target = e.target;
        const roomEl = target.closest('[data-room]');
        const roomIndex = roomEl ? Array.from(ELEMENTS.roomsContainer.children).indexOf(roomEl) : -1;
        const setEl = target.closest('[data-set]');
        const setIndex = setEl ? Array.from(roomEl.querySelector('[data-sets]').children).indexOf(setEl) : -1;
        const decoEl = target.closest('[data-deco-item]');
        const decoIndex = decoEl ? Array.from(roomEl.querySelector('[data-decorations]').children).indexOf(decoEl) : -1;

        if (setIndex !== -1 && roomIndex !== -1) {
            state.rooms[roomIndex].sets[setIndex][target.name] = target.value;
        } else if (decoIndex !== -1 && roomIndex !== -1) {
            state.rooms[roomIndex].decorations[decoIndex][target.name] = target.value;
        } else if (roomIndex !== -1 && target.name === 'room_name') {
            state.rooms[roomIndex].room_name = target.value;
        } else if (target.name.startsWith('customer_')) {
            state[target.name] = target.value;
        }

        render();
    }

    function updateLockState() {
        if (!ELEMENTS.orderForm || !ELEMENTS.lockBtn || !ELEMENTS.submitBtn) return;
        const fields = ELEMENTS.orderForm.querySelectorAll('.field');
        const buttons = ELEMENTS.orderForm.querySelectorAll('.btn:not(#lockBtn):not(#clearAllBtn)');
        
        fields.forEach(field => field.disabled = state.isLocked);
        buttons.forEach(btn => btn.disabled = state.isLocked);
        ELEMENTS.submitBtn.disabled = state.isLocked;
        
        const lockText = ELEMENTS.lockBtn.querySelector('.lock-text');
        const lockIcon = ELEMENTS.lockBtn.querySelector('.lock-icon');
        if (lockText) lockText.textContent = state.isLocked ? 'ปลดล็อค' : 'ล็อค';
        if (lockIcon) lockIcon.textContent = state.isLocked ? '🔓' : '🔒';
    }

    function buildPayload() {
        return {
            customer_name: state.customer_name || '',
            customer_address: state.customer_address || '',
            customer_phone: state.customer_phone || '',
            rooms: state.rooms.map(room => ({
                room_name: room.room_name,
                room_price_per_m: room.room_price_per_m,
                room_style: room.room_style,
                sets: room.sets.filter(s => !s.isSuspended).map(set => ({
                    width_m: parseFloat(set.width_m) || 0,
                    height_m: parseFloat(set.height_m) || 0,
                    quantity: parseInt(set.quantity) || 1,
                    extra_cm: parseFloat(set.extra_cm) || 0,
                    fold_times: parseFloat(set.fold_times) || 2.5,
                    open_type: set.open_type,
                    fabric_variant: set.fabric_variant,
                    sheer_price_per_m: parseFloat(set.sheer_price_per_m) || 0,
                    track_length_m: parseFloat(set.track_length_m) || 0
                })),
                decorations: room.decorations.filter(d => !d.isSuspended).map(deco => ({
                    width_m: parseFloat(deco.width_m) || 0,
                    height_m: parseFloat(deco.height_m) || 0,
                    price_per_sq_yd: parseFloat(deco.price_per_sq_yd) || 0,
                    quantity: parseInt(deco.quantity) || 1
                }))
            })),
            grand_total: parseFloat(ELEMENTS.grandTotal.textContent.replace(/[^\d.]/g, '')) || 0,
            grand_fabric: parseFloat(ELEMENTS.grandFabric.textContent.replace(/[^\d.]/g, '')) || 0,
            grand_sheer_fabric: parseFloat(ELEMENTS.grandSheerFabric.textContent.replace(/[^\d.]/g, '')) || 0,
            grand_opaque_track: parseFloat(ELEMENTS.grandOpaqueTrack.textContent.replace(/[^\d.]/g, '')) || 0,
            grand_sheer_track: parseFloat(ELEMENTS.grandSheerTrack.textContent.replace(/[^\d.]/g, '')) || 0,
            set_count: parseInt(ELEMENTS.setCount.textContent.replace(/[^\d.]/g, '')) || 0,
            set_count_sets: parseInt(ELEMENTS.setCountSets.textContent.replace(/[^\d.]/g, '')) || 0,
            set_count_deco: parseInt(ELEMENTS.setCountDeco.textContent.replace(/[^\d.]/g, '')) || 0,
            app_version: APP_VERSION,
            generated_at: new Date().toISOString()
        };
    }

    // --- INITIALIZATION ---
    function init() {
        for (const key in SELECTORS) {
            ELEMENTS[key] = document.querySelector(SELECTORS[key]);
        }

        // Populate select options
        document.querySelectorAll('select[name="room_price_per_m"]').forEach(selectEl => {
            CONFIG.FABRIC_PRICES.forEach(price => {
                const option = document.createElement('option');
                option.value = price;
                option.textContent = price;
                selectEl.appendChild(option);
            });
        });

        document.querySelectorAll('select[name="sheer_price_per_m"]').forEach(selectEl => {
            CONFIG.SHEER_PRICES.forEach(price => {
                const option = document.createElement('option');
                option.value = price;
                option.textContent = price;
                selectEl.appendChild(option);
            });
        });

        // Event Listeners
        if (ELEMENTS.addRoomHeaderBtn) ELEMENTS.addRoomHeaderBtn.addEventListener('click', addRoom);
        if (ELEMENTS.clearAllBtn) ELEMENTS.clearAllBtn.addEventListener('click', () => {
            showModal('ยืนยันการล้างข้อมูลทั้งหมด', 'คุณแน่ใจหรือไม่ที่จะล้างข้อมูลทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้', () => {
                state.rooms = [];
                state.roomCount = 0;
                localStorage.removeItem(CONFIG.STORAGE_KEY);
                render();
                addRoom();
                hideModal();
            });
        });
        if (ELEMENTS.lockBtn) ELEMENTS.lockBtn.addEventListener('click', () => {
            state.isLocked = !state.isLocked;
            updateLockState();
            showToast(state.isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว');
        });
        if (ELEMENTS.copyJsonBtn) ELEMENTS.copyJsonBtn.addEventListener('click', () => {
            const payload = buildPayload();
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                .then(() => showToast('คัดลอก JSON สำเร็จ!'))
                .catch(err => console.error('Failed to copy JSON:', err));
        });

        if (ELEMENTS.orderForm) {
            ELEMENTS.orderForm.addEventListener('input', handleInput);
            ELEMENTS.orderForm.addEventListener('click', handleEvent);
            ELEMENTS.orderForm.addEventListener('change', render);
            ELEMENTS.orderForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (state.isLocked) {
                    showToast('ฟอร์มถูกล็อคอยู่');
                    return;
                }
                ELEMENTS.submitBtn.disabled = true;
                ELEMENTS.submitBtn.textContent = 'กำลังส่ง...';

                try {
                    const payload = JSON.stringify({ ...state, app_version: APP_VERSION, generated_at: new Date().toISOString() });
                    const response = await fetch(WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload
                    });

                    if (response.ok) {
                        showToast('ส่งข้อมูลสำเร็จ!');
                    } else {
                        showToast('เกิดข้อผิดพลาดในการส่งข้อมูล');
                        console.error('Submission failed with status:', response.status);
                    }
                } catch (error) {
                    showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
                    console.error('Submission error:', error);
                } finally {
                    ELEMENTS.submitBtn.disabled = state.isLocked;
                    ELEMENTS.submitBtn.textContent = 'ส่งไปคำนวณ';
                }
            });
        }
        
        // Modal Event Listeners
        if (ELEMENTS.modalConfirm) ELEMENTS.modalConfirm.addEventListener('click', () => {
            if (confirmAction) confirmAction();
        });
        if (ELEMENTS.modalCancel) ELEMENTS.modalCancel.addEventListener('click', hideModal);

        // Load saved state
        const storedData = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (storedData) {
            try {
                const savedState = JSON.parse(storedData);
                state = { ...state, ...savedState };
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(CONFIG.STORAGE_KEY);
            }
        }

        if (state.rooms.length === 0) {
            addRoom();
        } else {
            render();
        }

        updateLockState();
    }

    document.addEventListener('DOMContentLoaded', init);
})();