(function() {
    // =================================================================================
    // --- APP-WIDE CONFIGURATION ---
    // =================================================================================
    const CONFIG = {
        WEBHOOK_URL: null, // ฟังก์ชันส่งข้อมูลถูกปิดใช้งาน
        PRICING: {
            fabric: [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000],
            sheer: [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000]
        },
        APP_VERSION: '1.0'
    };

    // =================================================================================
    // --- DOM REFERENCES (VIEW) ---
    // =================================================================================
    // ประกาศตัวแปร แต่จะหาองค์ประกอบใน DOM เมื่อหน้าเว็บโหลดเสร็จแล้ว
    let DOMElements = {};

    function getDOMElements() {
        DOMElements = {
            orderForm: document.getElementById('orderForm'),
            roomContainer: document.getElementById('roomContainer'),
            addRoomBtn: document.getElementById('addRoomBtn'),
            clearAllBtn: document.getElementById('clearAllBtn'),
            submitBtn: document.getElementById('submitBtn'),
            summaryCard: document.getElementById('summaryCard'),
            summaryGrid: document.getElementById('summaryGrid'),
            deleteModal: document.getElementById('deleteModal'),
            cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
            confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
            confirmSubmitModal: document.getElementById('confirmSubmitModal'),
            cancelSubmitBtn: document.getElementById('cancelSubmitBtn'),
            confirmSubmitBtn: document.getElementById('confirmSubmitBtn'),
            toastContainer: document.getElementById('toastContainer'),
            roomTemplate: document.getElementById('room-template'),
            setTemplate: document.getElementById('set-template'),
            decoTemplate: document.getElementById('deco-template')
        };
    }

    // =================================================================================
    // --- APP STATE (MODEL) & CORE LOGIC --
    // =================================================================================
    const state = {
        rooms: [],
        isLocked: false,
        totalPrice: 0,
        totalSqYd: 0,
        tempDeleteTarget: null
    };

    function init() {
        getDOMElements();
        loadState();
        bindEventListeners();
        render();
        updateSummary();
    }

    function generateId() {
        return Math.random().toString(36).substring(2, 9);
    }

    function saveState() {
        localStorage.setItem('curtainCalculatorState', JSON.stringify(state));
    }

    function loadState() {
        const savedState = localStorage.getItem('curtainCalculatorState');
        if (savedState) {
            try {
                Object.assign(state, JSON.parse(savedState));
            } catch (error) {
                console.error("Failed to parse saved state, starting fresh.", error);
                localStorage.removeItem('curtainCalculatorState');
            }
        }
    }

    function findItem(type, id) {
        if (type === 'room') {
            return state.rooms.find(r => r.id === id);
        } else if (type === 'set') {
            for (const room of state.rooms) {
                const set = room.sets.find(s => s.id === id);
                if (set) return { room, set };
            }
        } else if (type === 'deco') {
            for (const room of state.rooms) {
                for (const set of room.sets) {
                    const deco = set.decos.find(d => d.id === id);
                    if (deco) return { room, set, deco };
                }
            }
        }
        return null;
    }

    function calculate(room) {
        let roomTotal = 0;
        let roomSqYd = 0;

        for (const set of room.sets) {
            const width_m = parseFloat(set.width_m) || 0;
            const height_m = parseFloat(set.height_m) || 0;
            const quantity = parseInt(set.quantity) || 0;
            const extra_cm = parseFloat(set.extra_cm) || 0;
            const fold_times = parseFloat(set.fold_times) || 0;
            const price_yd = parseFloat(set.price_yd) || 0;

            let width_yd = (width_m * fold_times) * 1.09361;
            let height_yd = (height_m + (extra_cm / 100)) * 1.09361;
            let total_yd = width_yd * height_yd * quantity;
            let total_price = total_yd * price_yd;

            set.total_yd = total_yd;
            set.total_price = total_price;
            roomTotal += total_price;
            roomSqYd += total_yd;
        }

        for (const set of room.sets) {
            for (const deco of set.decos) {
                const width_m = parseFloat(deco.width_m) || 0;
                const height_m = parseFloat(deco.height_m) || 0;
                const price_sqyd = parseFloat(deco.price_sqyd) || 0;

                const sq_m = width_m * height_m;
                const sq_yd = sq_m * 1.19599;
                const total_price = sq_yd * price_sqyd;

                deco.total_sqyd = sq_yd;
                deco.total_price = total_price;
                roomTotal += total_price;
                roomSqYd += sq_yd;
            }
        }

        room.totalPrice = roomTotal;
        room.totalSqYd = roomSqYd;
    }

    function updateSummary() {
        state.totalPrice = 0;
        state.totalSqYd = 0;
        const summaryGrid = DOMElements.summaryGrid;
        summaryGrid.innerHTML = '';
        
        const summary = {
            total: {
                price: 0,
                sqyd: 0
            },
            rooms: {}
        };

        state.rooms.forEach(room => {
            calculate(room);
            state.totalPrice += room.totalPrice;
            state.totalSqYd += room.totalSqYd;

            if (room.totalPrice > 0) {
                const roomElement = document.querySelector(`.room-item[data-id="${room.id}"]`);
                if (roomElement) {
                    roomElement.querySelector('[data-room-total]').textContent = room.totalPrice.toFixed(2);
                    const roomBriefElement = roomElement.querySelector('[data-room-brief]');
                    roomBriefElement.querySelector('span:nth-of-type(1)').textContent = room.totalSqYd.toFixed(2);
                    roomBriefElement.querySelector('.price').textContent = room.totalPrice.toFixed(2);
                }

                // Populate summary object
                summary.rooms[room.id] = {
                    name: room.name || `ห้อง #${state.rooms.indexOf(room) + 1}`,
                    price: room.totalPrice,
                    sqyd: room.totalSqYd
                };
            }

            room.sets.forEach(set => {
                const setElement = document.querySelector(`.set-item[data-id="${set.id}"]`);
                if (setElement) {
                    setElement.querySelector('.set-summary-row .price').textContent = set.total_price.toFixed(2);
                    setElement.querySelector('.set-summary-row span:nth-of-type(2)').textContent = set.total_yd.toFixed(2);
                }
                
                set.decos.forEach(deco => {
                    const decoElement = document.querySelector(`.deco-item[data-id="${deco.id}"]`);
                    if (decoElement) {
                        decoElement.querySelector('.deco-summary-row .price').textContent = deco.total_price.toFixed(2);
                        decoElement.querySelector('.deco-summary-row span:nth-of-type(2)').textContent = deco.total_sqyd.toFixed(2);
                    }
                });
            });
        });

        summary.total.price = state.totalPrice;
        summary.total.sqyd = state.totalSqYd;
        state.summary = summary; // Save summary to state

        // Render summary grid
        if (state.totalPrice > 0) {
            DOMElements.summaryCard.style.display = 'block';
            for (const key in summary.rooms) {
                const room = summary.rooms[key];
                const roomSummaryDiv = document.createElement('div');
                roomSummaryDiv.className = 'summary-box';
                roomSummaryDiv.innerHTML = `
                    <strong>${room.name}</strong><br>
                    <small>ราคา: <span class="price">${room.price.toFixed(2)}</span> บ.</small><br>
                    <small>พื้นที่: <span>${room.sqyd.toFixed(2)}</span> ตร.หลา</small>
                `;
                summaryGrid.appendChild(roomSummaryDiv);
            }

            const totalSummaryDiv = document.createElement('div');
            totalSummaryDiv.className = 'summary-box';
            totalSummaryDiv.style.fontWeight = 'bold';
            totalSummaryDiv.innerHTML = `
                รวมทั้งหมด<br>
                ราคา: <span class="price">${summary.total.price.toFixed(2)}</span> บ.<br>
                พื้นที่: <span>${summary.total.sqyd.toFixed(2)}</span> ตร.หลา
            `;
            summaryGrid.appendChild(totalSummaryDiv);
        } else {
            DOMElements.summaryCard.style.display = 'none';
        }

        saveState();
    }

    function render() {
        DOMElements.roomContainer.innerHTML = '';
        state.rooms.forEach(room => {
            const roomNode = createRoomNode(room);
            DOMElements.roomContainer.appendChild(roomNode);
        });
        updateSummary();
    }

    function createRoomNode(room) {
        const template = DOMElements.roomTemplate;
        const roomNode = template.content.cloneNode(true).querySelector('.room-item');
        roomNode.dataset.id = room.id;
        
        bindData(roomNode, room, 'room');
        updatePricingOptions(roomNode.querySelector('[data-bind="room.price"]'), room.style);

        const setContainer = roomNode.querySelector('#setContainer');
        room.sets.forEach(set => {
            const setNode = createSetNode(set);
            setContainer.appendChild(setNode);
        });

        // Add 'add set' button
        const addSetBtn = document.createElement('button');
        addSetBtn.type = 'button';
        addSetBtn.className = 'btn btn-primary btn-sm mt-3';
        addSetBtn.textContent = 'เพิ่มชุด';
        addSetBtn.dataset.action = 'add-set';
        setContainer.appendChild(addSetBtn);

        return roomNode;
    }
    
    function createSetNode(set) {
        const template = DOMElements.setTemplate;
        const setNode = template.content.cloneNode(true).querySelector('.set-item');
        setNode.dataset.id = set.id;

        bindData(setNode, set, 'set');
        
        const decoContainer = setNode.querySelector('.deco-container');
        set.decos.forEach(deco => {
            const decoNode = createDecoNode(deco);
            decoContainer.appendChild(decoNode);
        });
        return setNode;
    }

    function createDecoNode(deco) {
        const template = DOMElements.decoTemplate;
        const decoNode = template.content.cloneNode(true).querySelector('.deco-item');
        decoNode.dataset.id = deco.id;
        bindData(decoNode, deco, 'deco');
        return decoNode;
    }

    function bindData(element, data, prefix) {
        element.querySelectorAll('[data-bind]').forEach(input => {
            const path = input.dataset.bind;
            const parts = path.split('.');
            if (parts[0] !== prefix) return;

            const prop = parts[1];
            if (input.tagName === 'INPUT' || input.tagName === 'SELECT') {
                input.value = data[prop] || '';
            } else if (input.tagName === 'SPAN') {
                input.textContent = data[prop] || '';
            }
        });
    }

    function updatePricingOptions(selectElement, style) {
        selectElement.innerHTML = '<option value="0">เลือกราคา</option>';
        const prices = CONFIG.PRICING[style] || [];
        prices.forEach(price => {
            const option = document.createElement('option');
            option.value = price;
            option.textContent = `${price} บ./หลา`;
            selectElement.appendChild(option);
        });
    }

    function showModal(modal) {
        modal.classList.add('show');
    }

    function hideModal(modal) {
        modal.classList.remove('show');
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        DOMElements.toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    // =================================================================================
    // --- EVENT LISTENERS (CONTROLLER) ---
    // =================================================================================
    function bindEventListeners() {
        DOMElements.addRoomBtn.addEventListener('click', () => {
            const newRoom = {
                id: generateId(),
                name: '',
                style: 'curtain',
                price: 0,
                sets: [{ id: generateId(), name: '1', width_m: '', height_m: '', quantity: '1', extra_cm: '0', fold_times: '2.5', price_yd: '', decos: [] }],
                totalPrice: 0,
                totalSqYd: 0
            };
            state.rooms.push(newRoom);
            render();
            showToast('เพิ่มห้องใหม่แล้ว', 'success');
        });

        DOMElements.clearAllBtn.addEventListener('click', () => {
            if (state.rooms.length === 0) {
                showToast('ไม่มีข้อมูลให้ล้าง', 'info');
                return;
            }
            state.tempDeleteTarget = 'all';
            showModal(DOMElements.deleteModal);
        });

        DOMEElements.confirmDeleteBtn.addEventListener('click', () => {
            hideModal(DOMElements.deleteModal);
            if (state.tempDeleteTarget === 'all') {
                state.rooms = [];
                state.totalPrice = 0;
                state.totalSqYd = 0;
                render();
                showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
            } else {
                const { type, id } = state.tempDeleteTarget;
                if (type === 'room') {
                    state.rooms = state.rooms.filter(room => room.id !== id);
                } else if (type === 'set') {
                    const room = state.rooms.find(room => room.sets.some(set => set.id === id));
                    if (room) {
                        room.sets = room.sets.filter(set => set.id !== id);
                        if (room.sets.length === 0) {
                            const newSet = { id: generateId(), name: '1', width_m: '', height_m: '', quantity: '1', extra_cm: '0', fold_times: '2.5', price_yd: '', decos: [] };
                            room.sets.push(newSet);
                        }
                    }
                } else if (type === 'deco') {
                    const room = state.rooms.find(room => room.sets.some(set => set.decos.some(deco => deco.id === id)));
                    if (room) {
                        const set = room.sets.find(set => set.decos.some(deco => deco.id === id));
                        set.decos = set.decos.filter(deco => deco.id !== id);
                    }
                }
                render();
                showToast('ลบรายการแล้ว', 'success');
            }
            state.tempDeleteTarget = null;
        });

        DOMElements.cancelDeleteBtn.addEventListener('click', () => {
            hideModal(DOMElements.deleteModal);
            state.tempDeleteTarget = null;
        });

        DOMElements.orderForm.addEventListener('input', (e) => {
            const target = e.target;
            const dataBind = target.dataset.bind;
            if (!dataBind) return;

            const [scope, prop] = dataBind.split('.');
            const element = target.closest(`[data-id]`);
            if (!element) return;
            const id = element.dataset.id;
            
            if (scope === 'room') {
                const room = findItem('room', id);
                if (room) {
                    if (prop === 'price' && e.target.value === '0') {
                        room[prop] = ''; // Store as empty string if 'เลือกราคา' is selected
                    } else {
                        room[prop] = e.target.value;
                    }
                }
                if (prop === 'style') {
                    updatePricingOptions(element.querySelector('[data-bind="room.price"]'), e.target.value);
                }
            } else if (scope === 'set') {
                const { set } = findItem('set', id);
                if (set) set[prop] = e.target.value;
            } else if (scope === 'deco') {
                const { deco } = findItem('deco', id);
                if (deco) deco[prop] = e.target.value;
            }
            updateSummary();
        });

        DOMElements.orderForm.addEventListener('click', (e) => {
            const target = e.target;
            const action = target.dataset.action;
            if (!action) return;
            
            const element = target.closest('[data-id]');
            const id = element.dataset.id;
            const type = action.split('-')[1];
            
            if (action === 'add-set') {
                const room = findItem('room', id);
                if (room) {
                    const newSet = {
                        id: generateId(),
                        name: (room.sets.length + 1).toString(),
                        width_m: '',
                        height_m: '',
                        quantity: '1',
                        extra_cm: '0',
                        fold_times: '2.5',
                        price_yd: '',
                        decos: []
                    };
                    room.sets.push(newSet);
                    render();
                    showToast('เพิ่มชุดใหม่แล้ว', 'success');
                }
            } else if (action === 'add-deco') {
                const { room, set } = findItem('set', id);
                if (set) {
                    const newDeco = {
                        id: generateId(),
                        name: (set.decos.length + 1).toString(),
                        type: '',
                        width_m: '',
                        height_m: '',
                        price_sqyd: ''
                    };
                    set.decos.push(newDeco);
                    render();
                    showToast('เพิ่มของตกแต่งใหม่แล้ว', 'success');
                }
            } else if (action === 'clear-room') {
                const room = findItem('room', id);
                if (room) {
                    room.sets = [{ id: generateId(), name: '1', width_m: '', height_m: '', quantity: '1', extra_cm: '0', fold_times: '2.5', price_yd: '', decos: [] }];
                    render();
                    showToast('ล้างข้อมูลห้องแล้ว', 'success');
                }
            } else if (action === 'clear-set') {
                const { set } = findItem('set', id);
                if (set) {
                    set.width_m = '';
                    set.height_m = '';
                    set.quantity = '1';
                    set.extra_cm = '0';
                    set.fold_times = '2.5';
                    set.price_yd = '';
                    set.decos = [];
                    render();
                    showToast('ล้างข้อมูลชุดแล้ว', 'success');
                }
            } else if (action.startsWith('delete-')) {
                state.tempDeleteTarget = { type: type, id: id };
                showModal(DOMElements.deleteModal);
            }
        });
        
        // --- Submit Logic ---
        DOMElements.orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showModal(DOMElements.confirmSubmitModal);
        });

        DOMElements.cancelSubmitBtn.addEventListener('click', () => {
            hideModal(DOMElements.confirmSubmitModal);
        });

        DOMElements.confirmSubmitBtn.addEventListener('click', async () => {
            hideModal(DOMElements.confirmSubmitModal);

            if (!CONFIG.WEBHOOK_URL) {
                showToast('ฟังก์ชันส่งข้อมูลถูกปิดใช้งานอยู่', 'info');
                return;
            }

            if (state.isLocked) {
                showToast('ฟอร์มถูกล็อคอยู่ ไม่สามารถส่งได้', 'error');
                return;
            }

            DOMElements.submitBtn.disabled = true;
            DOMElements.submitBtn.textContent = 'กำลังส่ง...';

            try {
                const payload = { ...state, app_version: CONFIG.APP_VERSION, generated_at: new Date().toISOString() };
                const response = await fetch(CONFIG.WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) throw new Error(`Server responded with ${response.status}`);
                showToast('ส่งข้อมูลสำเร็จแล้ว', 'success');
            } catch (error) {
                console.error("Submit failed:", error);
                showToast('ส่งข้อมูลไม่สำเร็จ! โปรดตรวจสอบการเชื่อมต่อ', 'error');
            } finally {
                DOMElements.submitBtn.disabled = state.isLocked;
                DOMElements.submitBtn.textContent = 'ส่งไปคำนวณ';
            }
        });
    }

    // Initialize the app on page load
    document.addEventListener('DOMContentLoaded', () => {
        init();
    });

})();