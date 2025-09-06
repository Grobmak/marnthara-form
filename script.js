(function() {
    // --- APP-WIDE CONFIGURATION & STATE ---
    const APP_VERSION = 'v5.1';
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
        customer: { name: '', address: '', phone: '' },
        rooms: [],
    };
    let confirmAction = null;

    // --- UTILITY FUNCTIONS ---
    function formatNumber(num) { 
        return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num); 
    }
    function formatPrice(num) { 
        return `${new Intl.NumberFormat('th-TH').format(Math.round(num))}`;
    }
    function toNum(v) { return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0; }
    function clamp01(v) { return Math.max(0, toNum(v)); }

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
        confirmAction = null;
    }

    // --- DATA & CALCULATIONS ---
    const CALC = {
        getOpaquePrice: (baseRaw, style, width, height) => {
            const hPlus = 0; // Simplified for now, as in previous code
            const sPlus = (style === "ลอน") ? 200 : 0;
            return Math.round((baseRaw + sPlus + hPlus) * width);
        },
        getSheerPrice: (sheerBase, style, width, height) => {
            const hPlus = 0; // Simplified
            const sPlus = (style === "ลอน") ? 200 : 0;
            return Math.round((sheerBase + sPlus + hPlus) * width);
        },
        getDecoPrice: (width, height, priceSqyd) => Math.round(width * height * 1.19599 * priceSqyd),
        getOpaqueYardage: (style, width) => {
            if (width <= 0) return 0;
            if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
            if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
            return 0;
        },
        getSheerYardage: (style, width) => {
            if (width <= 0) return 0;
            if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
            if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
            return 0;
        }
    };

    // --- STATE MANAGEMENT ---
    function updateGrandTotals() {
        let grandTotal = 0, grandOpaqueYards = 0, grandSheerYards = 0, grandOpaqueTrack = 0, grandSheerTrack = 0;
        let totalPoints = 0, totalSets = 0, totalDeco = 0;

        state.rooms.forEach(room => {
            room.sets.forEach(set => {
                if (set.isSuspended) return;
                const w = clamp01(set.width_m), h = clamp01(set.height_m);
                if (w > 0 && h > 0) {
                    if (set.fabric_variant === 'ทึบ' || set.fabric_variant === 'ทึบ&โปร่ง') {
                        grandTotal += CALC.getOpaquePrice(room.price_per_m_raw, room.style, w, h);
                        grandOpaqueYards += CALC.getOpaqueYardage(room.style, w);
                        grandOpaqueTrack += w;
                    }
                    if (set.fabric_variant === 'โปร่ง' || set.fabric_variant === 'ทึบ&โปร่ง') {
                        grandTotal += CALC.getSheerPrice(set.sheer_price_per_m, room.style, w, h);
                        grandSheerYards += CALC.getSheerYardage(room.style, w);
                        grandSheerTrack += w;
                    }
                }
                totalPoints++;
                totalSets += set.fabric_variant === 'ทึบ&โปร่ง' ? 2 : 1;
            });
            room.decorations.forEach(deco => {
                if (deco.isSuspended) return;
                const w = clamp01(deco.width_m), h = clamp01(deco.height_m), p = clamp01(deco.price_sqyd);
                if (w > 0 && h > 0 && p > 0) {
                    grandTotal += CALC.getDecoPrice(w, h, p);
                }
                totalPoints++;
                totalDeco++;
            });
        });

        if (ELEMENTS.grandTotal) ELEMENTS.grandTotal.textContent = formatPrice(grandTotal);
        if (ELEMENTS.setCount) ELEMENTS.setCount.textContent = totalPoints;
        if (ELEMENTS.setCountSets) ELEMENTS.setCountSets.textContent = totalSets;
        if (ELEMENTS.setCountDeco) ELEMENTS.setCountDeco.textContent = totalDeco;
        if (ELEMENTS.grandFabric) ELEMENTS.grandFabric.textContent = `${formatNumber(grandOpaqueYards)} หลา`;
        if (ELEMENTS.grandSheerFabric) ELEMENTS.grandSheerFabric.textContent = `${formatNumber(grandSheerYards)} หลา`;
        if (ELEMENTS.grandOpaqueTrack) ELEMENTS.grandOpaqueTrack.textContent = `${formatNumber(grandOpaqueTrack)} ม.`;
        if (ELEMENTS.grandSheerTrack) ELEMENTS.grandSheerTrack.textContent = `${formatNumber(grandSheerTrack)} ม.`;
        
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
    }
    
    function render() {
        if (!ELEMENTS.roomsContainer) return;
        ELEMENTS.roomsContainer.innerHTML = '';
        state.rooms.forEach((room, roomIndex) => {
            const roomTpl = document.getElementById(SELECTORS.roomTpl.slice(1));
            const roomEl = roomTpl.content.cloneNode(true).querySelector('[data-room]');
            roomEl.dataset.roomIndex = roomIndex;
            
            // Render room data
            roomEl.querySelector('input[name="room_name"]').value = room.room_name;
            const priceSelect = roomEl.querySelector('select[name="room_price_per_m"]');
            priceSelect.innerHTML = `<option value="" hidden>เลือก</option>` + CONFIG.FABRIC_PRICES.map(p => `<option value="${p}">${p}</option>`).join('');
            priceSelect.value = room.price_per_m_raw;
            const styleSelect = roomEl.querySelector('select[name="room_style"]');
            styleSelect.value = room.style;

            // Render sets
            const setsContainer = roomEl.querySelector('[data-sets]');
            room.sets.forEach((set, setIndex) => {
                const setTpl = document.getElementById(SELECTORS.setTpl.slice(1));
                const setEl = setTpl.content.cloneNode(true).querySelector('[data-set]');
                setEl.dataset.setIndex = setIndex;
                if (set.isSuspended) setEl.classList.add('is-suspended');

                setEl.querySelector('[data-item-title]').textContent = `จุดที่ ${setIndex + 1}`;
                setEl.querySelector('input[name="width_m"]').value = set.width_m;
                setEl.querySelector('input[name="height_m"]').value = set.height_m;
                setEl.querySelector('select[name="fabric_variant"]').value = set.fabric_variant;
                setEl.querySelector('select[name="open_type"]').value = set.open_type;
                const sheerSelect = setEl.querySelector('select[name="sheer_price_per_m"]');
                sheerSelect.innerHTML = `<option value="" hidden>เลือก</option>` + CONFIG.SHEER_PRICES.map(p => `<option value="${p}">${p}</option>`).join('');
                sheerSelect.value = set.sheer_price_per_m;
                
                // Update set calculations
                const w = clamp01(set.width_m), h = clamp01(set.height_m);
                let totalSetPrice = 0, opaquePrice = 0, sheerPrice = 0;
                let opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;

                if (!set.isSuspended) {
                    if (set.fabric_variant === 'ทึบ' || set.fabric_variant === 'ทึบ&โปร่ง') {
                        opaquePrice = CALC.getOpaquePrice(room.price_per_m_raw, room.style, w, h);
                        opaqueYards = CALC.getOpaqueYardage(room.style, w);
                        opaqueTrack = w;
                    }
                    if (set.fabric_variant === 'โปร่ง' || set.fabric_variant === 'ทึบ&โปร่ง') {
                        sheerPrice = CALC.getSheerPrice(set.sheer_price_per_m, room.style, w, h);
                        sheerYards = CALC.getSheerYardage(room.style, w);
                        sheerTrack = w;
                    }
                    totalSetPrice = opaquePrice + sheerPrice;
                }

                setEl.querySelector('[data-set-price-total]').textContent = formatPrice(totalSetPrice);
                setEl.querySelector('[data-set-price-opaque]').textContent = formatPrice(opaquePrice);
                setEl.querySelector('[data-set-price-sheer]').textContent = formatPrice(sheerPrice);
                setEl.querySelector('[data-set-yardage-opaque]').textContent = formatNumber(opaqueYards);
                setEl.querySelector('[data-set-yardage-sheer]').textContent = formatNumber(sheerYards);
                setEl.querySelector('[data-set-opaque-track]').textContent = formatNumber(opaqueTrack);
                setEl.querySelector('[data-set-sheer-track]').textContent = formatNumber(sheerTrack);
                
                setsContainer.appendChild(setEl);
            });

            // Render decorations
            const decosContainer = roomEl.querySelector('[data-decorations]');
            room.decorations.forEach((deco, decoIndex) => {
                const decoTpl = document.getElementById(SELECTORS.decoTpl.slice(1));
                const decoEl = decoTpl.content.cloneNode(true).querySelector('[data-deco-item]');
                decoEl.dataset.decoIndex = decoIndex;
                if (deco.isSuspended) decoEl.classList.add('is-suspended');

                decoEl.querySelector('[data-item-title]').textContent = `ตกแต่งที่ ${decoIndex + 1}`;
                decoEl.querySelector('input[name="width_m"]').value = deco.width_m;
                decoEl.querySelector('input[name="height_m"]').value = deco.height_m;
                decoEl.querySelector('input[name="price_sqyd"]').value = deco.price_sqyd;
                
                // Update deco calculation
                let decoPrice = 0;
                if (!deco.isSuspended) {
                    decoPrice = CALC.getDecoPrice(clamp01(deco.width_m), clamp01(deco.height_m), clamp01(deco.price_sqyd));
                }
                decoEl.querySelector('[data-total]').textContent = formatPrice(decoPrice);

                decosContainer.appendChild(decoEl);
            });

            // Update room brief
            const activeSetsInRoom = room.sets.filter(s => !s.isSuspended);
            const activeDecosInRoom = room.decorations.filter(d => !d.isSuspended);
            const totalItemsInRoom = activeSetsInRoom.length + activeDecosInRoom.length;
            const totalUnitsInRoom = activeSetsInRoom.reduce((sum, s) => sum + (s.fabric_variant === 'ทึบ&โปร่ง' ? 2 : 1), 0);
            const roomSummary = activeSetsInRoom.reduce((sum, s) => sum + CALC.getOpaquePrice(room.price_per_m_raw, room.style, s.width_m, s.height_m) + CALC.getSheerPrice(s.sheer_price_per_m, room.style, s.width_m, s.height_m), 0) +
                               activeDecosInRoom.reduce((sum, d) => sum + CALC.getDecoPrice(d.width_m, d.height_m, d.price_sqyd), 0);
            
            const briefEl = roomEl.querySelector('[data-room-brief]');
            briefEl.innerHTML = `<span class="num">จุด ${totalItemsInRoom}</span> • <span class="num">ชุด ${totalUnitsInRoom}</span> • ราคา <span class="num price">${formatPrice(roomSummary)}</span> บาท`;
            
            ELEMENTS.roomsContainer.appendChild(roomEl);
        });

        // Set customer info
        document.querySelector('input[name="customer_name"]').value = state.customer.name;
        document.querySelector('input[name="customer_address"]').value = state.customer.address;
        document.querySelector('input[name="customer_phone"]').value = state.customer.phone;

        updateGrandTotals();
    }

    function addRoom() {
        if (state.isLocked) return;
        const newRoom = {
            room_name: `ห้อง ${String(state.rooms.length + 1).padStart(2, "0")}`,
            price_per_m_raw: '',
            style: '',
            sets: [{
                width_m: '', height_m: '', fabric_variant: 'ทึบ', open_type: 'แยกกลาง', sheer_price_per_m: '', isSuspended: false
            }],
            decorations: []
        };
        state.rooms.push(newRoom);
        render();
        showToast('เพิ่มห้องใหม่แล้ว');
    }

    function handleEvent(e) {
        const target = e.target;
        const action = target.dataset.action;
        const roomEl = target.closest('[data-room-index]');
        const roomIndex = roomEl ? parseInt(roomEl.dataset.roomIndex) : -1;
        const setEl = target.closest('[data-set-index]');
        const setIndex = setEl ? parseInt(setEl.dataset.setIndex) : -1;
        const decoEl = target.closest('[data-deco-index]');
        const decoIndex = decoEl ? parseInt(decoEl.dataset.decoIndex) : -1;
        const itemType = setEl ? 'set' : 'deco';

        switch (target.id) {
            case 'addRoomHeaderBtn': addRoom(); break;
            case 'clearAllBtn': showModal('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้', () => {
                state.customer = { name: '', address: '', phone: '' };
                state.rooms = [];
                addRoom();
                render();
                hideModal();
                showToast('ล้างข้อมูลทั้งหมดแล้ว');
            });
            break;
            case 'lockBtn':
                state.isLocked = !state.isLocked;
                updateLockState();
                showToast(state.isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว');
                break;
            case 'copyJsonBtn':
                navigator.clipboard.writeText(JSON.stringify(state, null, 2))
                    .then(() => showToast('คัดลอก JSON แล้ว!'));
                break;
            case 'submitBtn':
                // Implement submission logic here
                showToast('ฟังก์ชันการส่งข้อมูลกำลังถูกพัฒนา...');
                break;
        }

        switch (action) {
            case 'add-set':
                if (roomIndex !== -1) {
                    state.rooms[roomIndex].sets.push({ width_m: '', height_m: '', fabric_variant: 'ทึบ', open_type: 'แยกกลาง', sheer_price_per_m: '', isSuspended: false });
                    render();
                    showToast('เพิ่มจุดผ้าม่านแล้ว');
                }
                break;
            case 'add-deco':
                if (roomIndex !== -1) {
                    state.rooms[roomIndex].decorations.push({ width_m: '', height_m: '', price_sqyd: '', isSuspended: false });
                    render();
                    showToast('เพิ่มรายการตกแต่งแล้ว');
                }
                break;
            case 'del-room':
                if (roomIndex !== -1) {
                    showModal('ลบห้อง', 'ยืนยันการลบห้องนี้?', () => {
                        state.rooms.splice(roomIndex, 1);
                        if (state.rooms.length === 0) addRoom();
                        render();
                        hideModal();
                        showToast('ลบห้องแล้ว');
                    });
                }
                break;
            case 'del-set':
                if (roomIndex !== -1 && setIndex !== -1) {
                    showModal('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?', () => {
                        state.rooms[roomIndex].sets.splice(setIndex, 1);
                        render();
                        hideModal();
                        showToast('ลบจุดผ้าม่านแล้ว');
                    });
                }
                break;
            case 'del-deco':
                if (roomIndex !== -1 && decoIndex !== -1) {
                    showModal('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?', () => {
                        state.rooms[roomIndex].decorations.splice(decoIndex, 1);
                        render();
                        hideModal();
                        showToast('ลบรายการตกแต่งแล้ว');
                    });
                }
                break;
            case 'toggle-suspend':
                if (setEl && roomIndex !== -1 && setIndex !== -1) {
                    state.rooms[roomIndex].sets[setIndex].isSuspended = !state.rooms[roomIndex].sets[setIndex].isSuspended;
                    render();
                    showToast(`รายการถูก${state.rooms[roomIndex].sets[setIndex].isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`);
                } else if (decoEl && roomIndex !== -1 && decoIndex !== -1) {
                    state.rooms[roomIndex].decorations[decoIndex].isSuspended = !state.rooms[roomIndex].decorations[decoIndex].isSuspended;
                    render();
                    showToast(`รายการถูก${state.rooms[roomIndex].decorations[decoIndex].isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`);
                }
                break;
        }
    }

    function handleInput(e) {
        const target = e.target;
        const roomEl = target.closest('[data-room-index]');
        const roomIndex = roomEl ? parseInt(roomEl.dataset.roomIndex) : -1;
        const setEl = target.closest('[data-set-index]');
        const setIndex = setEl ? parseInt(setEl.dataset.setIndex) : -1;
        const decoEl = target.closest('[data-deco-index]');
        const decoIndex = decoEl ? parseInt(decoEl.dataset.decoIndex) : -1;

        if (target.name.startsWith('customer_')) {
            state.customer[target.name.replace('customer_', '')] = target.value;
        } else if (roomIndex !== -1) {
            if (setIndex !== -1) {
                state.rooms[roomIndex].sets[setIndex][target.name] = toNum(target.value);
            } else if (decoIndex !== -1) {
                state.rooms[roomIndex].decorations[decoIndex][target.name] = toNum(target.value);
            } else if (target.name === 'room_name') {
                state.rooms[roomIndex].room_name = target.value;
            } else if (target.name === 'room_price_per_m') {
                state.rooms[roomIndex].price_per_m_raw = toNum(target.value);
            } else if (target.name === 'room_style') {
                state.rooms[roomIndex].style = target.value;
            }
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

    // --- INITIALIZATION ---
    function init() {
        for (const key in SELECTORS) {
            ELEMENTS[key] = document.querySelector(SELECTORS[key]);
        }
        
        // Event Listeners
        document.addEventListener('click', handleEvent);
        document.addEventListener('input', handleInput);
        document.addEventListener('change', render);

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