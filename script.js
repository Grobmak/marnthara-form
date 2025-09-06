(function() {
    // =================================================================================
    // --- UTILITY FUNCTIONS ---
    // =================================================================================

    const SELECTORS = {
        form: '#orderForm', rooms: '#rooms', addRoom: '#addRoomHeaderBtn',
        clearAll: '#clearAllBtn', lockBtn: '#lockBtn',
        copyJson: '#copyJsonBtn', submitBtn: '#submitBtn',
        modalOverlay: '.modal-overlay', modalTitle: '#modalTitle',
        modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        toastContainer: '#toast-container', payloadInput: '#payload',
        grandTotal: '#grandTotal', grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric',
        grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        setCount: '#setCount', setCountSets: '#setCountSets', setCountDeco: '#setCountDeco'
    };
    const STORAGE_KEY = 'marntharaStateV3';
    let roomCount = 0;
    let isLocked = false;

    // =================================================================================
    // --- STATE & DATA MANAGEMENT ---
    // =================================================================================

    function buildPayload() {
        const payload = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            rooms: []
        };
        document.querySelectorAll('[data-room]').forEach(roomEl => {
            const roomData = {
                name: roomEl.querySelector('input[name="room_name"]').value,
                price_per_m: parseFloat(roomEl.querySelector('select[name="room_price_per_m"]').value) || 0,
                style: roomEl.querySelector('select[name="room_style"]').value,
                track_price: parseFloat(roomEl.querySelector('input[name="room_track_price"]').value) || 0,
                install_price: parseFloat(roomEl.querySelector('input[name="room_install_price"]').value) || 0,
                misc_price: parseFloat(roomEl.querySelector('input[name="room_misc_price"]').value) || 0,
                total_sets: 0,
                total_decorations: 0,
                total_sets_cost: 0,
                total_decorations_cost: 0,
                total_room_cost: 0,
                sets: [],
                decorations: []
            };

            roomEl.querySelectorAll('[data-set]:not(.is-suspended)').forEach((setEl, setIdx) => {
                const setData = {
                    title: `ชุดที่ ${setIdx + 1}`,
                    width_m: parseFloat(setEl.querySelector('[name="width_m"]').value) || 0,
                    height_m: parseFloat(setEl.querySelector('[name="height_m"]').value) || 0,
                    quantity: parseInt(setEl.querySelector('[name="quantity"]').value) || 1,
                    open_type: setEl.querySelector('[name="open_type"]').value,
                    fabric_variant: setEl.querySelector('[name="fabric_variant"]').value,
                    sheer_price_per_m: parseFloat(setEl.querySelector('[name="sheer_price_per_m"]').value) || 0,
                    price_per_m: roomData.price_per_m,
                    fold_times: parseFloat(setEl.querySelector('[name="fold_times"]').value) || 2.5,
                    extra_cm: parseFloat(setEl.querySelector('[name="extra_cm"]').value) || 15
                };
                roomData.sets.push(setData);
            });

            roomEl.querySelectorAll('[data-deco]:not(.is-suspended)').forEach((decoEl, decoIdx) => {
                const decoData = {
                    title: `ตกแต่งที่ ${decoIdx + 1}`,
                    type: decoEl.querySelector('[name="type"]').value,
                    width_m: parseFloat(decoEl.querySelector('[name="width_m"]').value) || 0,
                    height_m: parseFloat(decoEl.querySelector('[name="height_m"]').value) || 0,
                    quantity: parseInt(decoEl.querySelector('[name="quantity"]').value) || 1,
                    price_sqm: parseFloat(decoEl.querySelector('[name="price_sqm"]').value) || 0
                };
                roomData.decorations.push(decoData);
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    // =================================================================================
    // --- CORE LOGIC ---
    // =================================================================================

    function calculateTotal(payload) {
        let grandTotal = 0, grandFabric = 0, grandSheerFabric = 0, grandOpaqueTrack = 0, grandSheerTrack = 0, setCountSets = 0, setCountDeco = 0;
        payload.rooms.forEach(room => {
            let roomTotal = 0;
            room.sets.forEach(set => {
                setCountSets++;
                const isSheer = set.fabric_variant.includes('โปร่ง');
                const fabricPricePerM = isSheer ? set.sheer_price_per_m : set.price_per_m;
                const trackPricePerM = room.track_price;
                const widthInM = set.width_m;
                const heightInM = set.height_m + (set.extra_cm / 100);

                const fabricUsedYd = ((widthInM * set.fold_times) * heightInM) * 1.0936133;
                const trackUsedM = widthInM * (set.open_type === 'แยกกลาง' ? 2 : 1);
                const itemCost = (fabricUsedYd * fabricPricePerM) + (trackUsedM * trackPricePerM) + (room.install_price) + (room.misc_price);
                const totalItemCost = itemCost * set.quantity;

                roomTotal += totalItemCost;
                if (isSheer) {
                    grandSheerFabric += fabricUsedYd;
                    grandSheerTrack += trackUsedM;
                } else {
                    grandFabric += fabricUsedYd;
                    grandOpaqueTrack += trackUsedM;
                }

                set.total_cost = totalItemCost;
            });

            room.decorations.forEach(deco => {
                setCountDeco++;
                const areaSqM = deco.width_m * deco.height_m;
                const decoCost = areaSqM * deco.price_sqm;
                const totalDecoCost = decoCost * deco.quantity;
                roomTotal += totalDecoCost;
                deco.total_cost = totalDecoCost;
            });

            room.total_room_cost = roomTotal;
            grandTotal += roomTotal;
        });

        const totalSets = setCountSets + setCountDeco;
        return {
            grandTotal: grandTotal,
            grandFabric: grandFabric,
            grandSheerFabric: grandSheerFabric,
            grandOpaqueTrack: grandOpaqueTrack,
            grandSheerTrack: grandSheerTrack,
            setCountSets: setCountSets,
            setCountDeco: setCountDeco,
            totalSets: totalSets
        };
    }

    function updateSummary() {
        const payload = buildPayload();
        const summary = calculateTotal(payload);
        document.querySelector(SELECTORS.grandTotal).textContent = summary.grandTotal.toFixed(2);
        document.querySelector(SELECTORS.grandFabric).textContent = summary.grandFabric.toFixed(2) + ' หลา';
        document.querySelector(SELECTORS.grandSheerFabric).textContent = summary.grandSheerFabric.toFixed(2) + ' หลา';
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = summary.grandOpaqueTrack.toFixed(2) + ' ม.';
        document.querySelector(SELECTORS.grandSheerTrack).textContent = summary.grandSheerTrack.toFixed(2) + ' ม.';
        document.querySelector(SELECTORS.setCount).textContent = summary.totalSets;
        document.querySelector(SELECTORS.setCountSets).textContent = summary.setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = summary.setCountDeco;
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        updateRoomSummaries();
        saveState();
    }

    function updateRoomSummaries() {
        document.querySelectorAll('[data-room]').forEach((roomEl, roomIdx) => {
            const roomData = buildPayload().rooms[roomIdx];
            if (!roomData) return;
            const briefEl = roomEl.querySelector('[data-room-brief]');
            const totalSets = roomData.sets.length + roomData.decorations.length;
            const totalItems = roomData.sets.length;
            briefEl.innerHTML = `<span class="num">จุด ${totalSets}</span> • <span class="num">ชุด ${totalItems}</span> • ราคา <span class="num price">${roomData.total_room_cost.toFixed(2)}</span> บาท`;
            roomEl.querySelectorAll('[data-set]').forEach((setEl, setIdx) => {
                const setData = roomData.sets[setIdx];
                if (!setData) return;
                setEl.querySelector('[data-item-title]').textContent = setIdx + 1;
                setEl.querySelector('[data-set-brief]').innerHTML = `<span class="num">${calculateSetFabric(setData).toFixed(2)}</span> หลา • <span class="num price">${setData.total_cost.toFixed(2)}</span> บาท`;
            });
            roomEl.querySelectorAll('[data-deco]').forEach((decoEl, decoIdx) => {
                const decoData = roomData.decorations[decoIdx];
                if (!decoData) return;
                decoEl.querySelector('[data-item-title]').textContent = decoIdx + 1;
                decoEl.querySelector('[data-deco-brief]').innerHTML = `<span class="num">${(decoData.width_m * decoData.height_m).toFixed(2)}</span> ตร.ม. • <span class="num price">${decoData.total_cost.toFixed(2)}</span> บาท`;
            });
        });
    }

    function calculateSetFabric(set) {
        const widthInM = set.width_m;
        const heightInM = set.height_m + (set.extra_cm / 100);
        return ((widthInM * set.fold_times) * heightInM) * 1.0936133;
    }

    function setOptions(selectEl, prices) {
        selectEl.innerHTML = '<option value="" hidden>เลือก</option>';
        prices.forEach(price => {
            const option = document.createElement('option');
            option.value = price;
            option.textContent = price;
            selectEl.appendChild(option);
        });
    }

    function toggleSuspend(el) {
        const isSuspended = el.classList.toggle('is-suspended');
        const suspendText = el.querySelector('[data-suspend-text]');
        suspendText.textContent = isSuspended ? 'ยกเลิก' : 'ระงับ';
    }

    function addRoom() {
        const roomsEl = document.querySelector(SELECTORS.rooms);
        const template = document.querySelector('#roomTpl');
        const clone = template.content.cloneNode(true);
        clone.querySelector('[name="room_name"]').value = `ห้องที่ ${++roomCount}`;
        roomsEl.appendChild(clone);
        setPriceOptions();
        updateSummary();
    }

    function addSet(roomEl) {
        const setsEl = roomEl.querySelector('[data-sets]');
        const template = document.querySelector('#setTpl');
        const clone = template.content.cloneNode(true);
        setsEl.appendChild(clone);
        setPriceOptions();
        updateSummary();
    }

    function addDeco(roomEl) {
        const decosEl = roomEl.querySelector('[data-decorations]');
        const template = document.querySelector('#decoTpl');
        const clone = template.content.cloneNode(true);
        decosEl.appendChild(clone);
        updateSummary();
    }

    function setPriceOptions() {
        document.querySelectorAll('select[name="room_price_per_m"]').forEach(el => setOptions(el, [
            300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000
        ]));
        document.querySelectorAll('select[name="sheer_price_per_m"]').forEach(el => setOptions(el, [
            300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000
        ]));
    }

    function showModal(title, body, onConfirm, isDanger = true) {
        const modalOverlay = document.querySelector(SELECTORS.modalOverlay);
        document.querySelector(SELECTORS.modalTitle).textContent = title;
        document.querySelector(SELECTORS.modalBody).textContent = body;
        const confirmBtn = document.querySelector(SELECTORS.modalConfirm);
        confirmBtn.classList.toggle('btn-danger', isDanger);
        confirmBtn.classList.toggle('btn-primary', !isDanger);
        confirmBtn.onclick = onConfirm;
        document.querySelector(SELECTORS.modalCancel).onclick = () => hideModal();
        modalOverlay.classList.add('visible');
    }

    function hideModal() {
        document.querySelector(SELECTORS.modalOverlay).classList.remove('visible');
    }

    function showToast(message, type = 'info') {
        const toastContainer = document.querySelector(SELECTORS.toastContainer);
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }

    function toggleLockState() {
        isLocked = !isLocked;
        document.querySelectorAll(SELECTORS.form + ' input, ' + SELECTORS.form + ' select, ' + SELECTORS.form + ' button:not(' + SELECTORS.lockBtn + ')').forEach(el => {
            el.disabled = isLocked;
        });
        document.querySelector(SELECTORS.lockBtn + ' .lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        document.querySelector(SELECTORS.lockBtn + ' .lock-icon').textContent = isLocked ? '🔓' : '🔒';
        document.querySelector(SELECTORS.submitBtn).disabled = isLocked;
        saveState();
        showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'info');
    }

    function saveState() {
        const stateToSave = {
            isLocked: isLocked,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            rooms: buildPayload().rooms
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }

    function loadState() {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const data = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = data.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = data.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = data.customer_phone || '';
                isLocked = data.isLocked || false;
                const roomsEl = document.querySelector(SELECTORS.rooms);
                roomsEl.innerHTML = "";
                roomCount = 0;
                if (data.rooms && data.rooms.length > 0) {
                    data.rooms.forEach(roomData => {
                        addRoom();
                        const newRoomEl = roomsEl.lastElementChild;
                        newRoomEl.querySelector('input[name="room_name"]').value = roomData.name;
                        newRoomEl.querySelector('select[name="room_price_per_m"]').value = roomData.price_per_m;
                        newRoomEl.querySelector('select[name="room_style"]').value = roomData.style;
                        newRoomEl.querySelector('input[name="room_track_price"]').value = roomData.track_price;
                        newRoomEl.querySelector('input[name="room_install_price"]').value = roomData.install_price;
                        newRoomEl.querySelector('input[name="room_misc_price"]').value = roomData.misc_price;

                        roomData.sets.forEach(setData => {
                            addSet(newRoomEl);
                            const newSetEl = newRoomEl.querySelector('[data-sets]').lastElementChild;
                            newSetEl.querySelector('input[name="width_m"]').value = setData.width_m;
                            newSetEl.querySelector('input[name="height_m"]').value = setData.height_m;
                            newSetEl.querySelector('input[name="fold_times"]').value = setData.fold_times;
                            newSetEl.querySelector('input[name="extra_cm"]').value = setData.extra_cm;
                            newSetEl.querySelector('input[name="quantity"]').value = setData.quantity;
                            newSetEl.querySelector('select[name="open_type"]').value = setData.open_type;
                            newSetEl.querySelector('select[name="fabric_variant"]').value = setData.fabric_variant;
                            if (setData.fabric_variant.includes('โปร่ง')) {
                                newSetEl.querySelector('[data-sheer-wrap]').classList.remove('hidden');
                                newSetEl.querySelector('select[name="sheer_price_per_m"]').value = setData.sheer_price_per_m;
                            }
                        });

                        roomData.decorations.forEach(decoData => {
                            addDeco(newRoomEl);
                            const newDecoEl = newRoomEl.querySelector('[data-decorations]').lastElementChild;
                            newDecoEl.querySelector('input[name="type"]').value = decoData.type;
                            newDecoEl.querySelector('input[name="width_m"]').value = decoData.width_m;
                            newDecoEl.querySelector('input[name="height_m"]').value = decoData.height_m;
                            newDecoEl.querySelector('input[name="quantity"]').value = decoData.quantity;
                            newDecoEl.querySelector('input[name="price_sqm"]').value = decoData.price_sqm;
                        });
                    });
                } else {
                    addRoom();
                }
            } catch (err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY);
                addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
        updateSummary();
    }

    function updateLockState() {
        document.querySelector(SELECTORS.lockBtn + ' .lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        document.querySelector(SELECTORS.lockBtn + ' .lock-icon').textContent = isLocked ? '🔓' : '🔒';
        document.querySelectorAll(SELECTORS.form + ' input, ' + SELECTORS.form + ' select, ' + SELECTORS.form + ' button:not(' + SELECTORS.lockBtn + ')').forEach(el => {
            el.disabled = isLocked;
        });
        document.querySelector(SELECTORS.submitBtn).disabled = isLocked;
    }

    // =================================================================================
    // --- EVENT LISTENERS ---
    // =================================================================================
    
    document.addEventListener('DOMContentLoaded', () => {
        loadState();
        document.querySelector(SELECTORS.form).addEventListener('input', updateSummary);
        document.querySelector(SELECTORS.form).addEventListener('change', updateSummary);
        document.querySelector(SELECTORS.addRoom).addEventListener('click', addRoom);
        document.querySelector(SELECTORS.lockBtn).addEventListener('click', toggleLockState);
        document.querySelector(SELECTORS.copyJson).addEventListener('click', () => {
            const payload = buildPayload();
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                .then(() => showToast('คัดลอกข้อมูล JSON เรียบร้อยแล้ว', 'success'))
                .catch(err => {
                    console.error('Failed to copy JSON:', err);
                    showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
                });
        });
        document.addEventListener('click', e => {
            if (e.target.dataset.act === 'add-set') addSet(e.target.closest('[data-room]'));
            if (e.target.dataset.act === 'add-deco') addDeco(e.target.closest('[data-room]'));
            if (e.target.dataset.act === 'toggle-suspend') toggleSuspend(e.target.closest('[data-set], [data-deco]'));
            if (e.target.dataset.act === 'del-set') showModal('ยืนยันการลบ', 'คุณแน่ใจหรือไม่ว่าต้องการลบจุดผ้าม่านนี้?', () => {
                e.target.closest('[data-set]').remove();
                hideModal();
                updateSummary();
            });
            if (e.target.dataset.act === 'del-deco') showModal('ยืนยันการลบ', 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการตกแต่งนี้?', () => {
                e.target.closest('[data-deco]').remove();
                hideModal();
                updateSummary();
            });
            if (e.target.dataset.act === 'del-room') showModal('ยืนยันการลบ', 'คุณแน่ใจหรือไม่ว่าต้องการลบห้องนี้?', () => {
                e.target.closest('[data-room]').remove();
                hideModal();
                updateSummary();
            });
            if (e.target.dataset.act === 'clear-set') e.target.closest('[data-set]').querySelectorAll('input').forEach(input => input.value = '');
            if (e.target.id === 'clearAllBtn') showModal('ล้างข้อมูลทั้งหมด', 'คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด?', () => {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            });
        });
        document.querySelector('select[name="fabric_variant"]').addEventListener('change', e => {
            const parent = e.target.closest('[data-set]');
            if (e.target.value.includes('โปร่ง')) {
                parent.querySelector('[data-sheer-wrap]').classList.remove('hidden');
            } else {
                parent.querySelector('[data-sheer-wrap]').classList.add('hidden');
            }
        });
    });
})();