(function() {
    // =================================================================================
    // --- APP-WIDE CONFIGURATION ---
    // =================================================================================
    const CONFIG = {
        // เปลี่ยนค่าจาก YOUR_WEBHOOK_URL_HERE เป็น null เพื่อปิดการทำงานชั่วคราว
        WEBHOOK_URL: null,
        PRICING: {
            fabric: [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000],
            sheer: [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000]
        },
        APP_VERSION: '1.0'
    };

    // =================================================================================
    // --- DOM REFERENCES (VIEW) ---
    // =================================================================================
    const DOMElements = {
        orderForm: document.querySelector('#orderForm'),
        roomsContainer: document.querySelector('[data-rooms-container]'),
        templates: {
            room: document.querySelector('#room-template'),
            set: document.querySelector('#set-template'),
            deco: document.querySelector('#deco-template'),
        },
        lockBtn: document.querySelector('#lockBtn'),
        submitBtn: document.querySelector('#submitBtn'),
        toastContainer: document.querySelector('[data-toast-container]'),
        copyJsonBtn: document.querySelector('[data-act="copy-json"]'),
        copyTextBtn: document.querySelector('[data-act="copy-text"]'),
    };

    // =================================================================================
    // --- STATE MANAGEMENT & INITIALIZATION (MODEL) ---
    // =================================================================================
    let state = {};

    function generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    function getNewSet() {
        return {
            id: generateId(),
            width_m: '',
            height_m: '',
            fabric_variant: 'ทึบ',
            open_type: '',
            sheer_price_per_m: '',
            is_suspended: false,
            calculations: {}
        };
    }

    function getNewDeco() {
        return {
            id: generateId(),
            type: '',
            width_m: '',
            height_m: '',
            price_sqyd: '',
            is_suspended: false,
            calculations: {}
        };
    }

    function getNewRoom() {
        return {
            id: generateId(),
            name: '',
            style: 'จีบ',
            price_per_m: 350,
            sets: [getNewSet()],
            decorations: [],
            calculations: {}
        };
    }

    function initState() {
        const savedState = localStorage.getItem('curtain-calculator-state');
        if (savedState) {
            state = JSON.parse(savedState);
            // Ensure all necessary properties exist for backward compatibility
            if (!state.customer) state.customer = { name: '', address: '', phone: '' };
            if (!state.rooms || state.rooms.length === 0) state.rooms = [getNewRoom()];
            state.rooms.forEach(room => {
                if (!room.sets) room.sets = [];
                if (!room.decorations) room.decorations = [];
                room.sets.forEach(set => {
                    if (set.is_suspended === undefined) set.is_suspended = false;
                });
                room.decorations.forEach(deco => {
                    if (deco.is_suspended === undefined) deco.is_suspended = false;
                });
            });
            if (state.isLocked === undefined) state.isLocked = false;
        } else {
            state = {
                isLocked: false,
                customer: { name: '', address: '', phone: '' },
                rooms: [getNewRoom()],
                summary: {}
            };
        }
    }

    const debouncedSave = debounce(() => {
        localStorage.setItem('curtain-calculator-state', JSON.stringify(state));
    }, 500);

    // =================================================================================
    // --- HELPER FUNCTIONS ---
    // =================================================================================
    function debounce(func, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
        };
    }

    function fmt(num, decimals = 2) {
        if (typeof num !== 'number' || isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }

    function fmtCurrency(num) {
        if (typeof num !== 'number' || isNaN(num)) return '0';
        return num.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    
    function toNum(str) {
        return parseFloat(String(str).replace(/,/g, '')) || 0;
    }

    // =================================================================================
    // --- CALCULATION LOGIC ---
    // =================================================================================
    const Calculator = {
        calculateSet(set, room) {
            const width = toNum(set.width_m);
            const height = toNum(set.height_m);
            const opaquePricePerM = toNum(room.price_per_m);
            const sheerPricePerM = toNum(set.sheer_price_per_m);

            if (set.is_suspended) {
                return { total: 0, opaquePrice: 0, sheerPrice: 0, opaqueYards: 0, sheerYards: 0, opaqueTrack: 0, sheerTrack: 0 };
            }

            // Opaque calculations
            const opaqueYards = width > 0 && height > 0 ? (width * 2 * 1.5) / 0.9144 : 0;
            const opaquePrice = opaqueYards > 0 ? opaqueYards * opaquePricePerM * 0.9144 : 0;
            const opaqueTrack = width > 0 ? width : 0;

            // Sheer calculations
            const hasSheer = set.fabric_variant === 'โปร่ง' || set.fabric_variant === 'ทึบ&โปร่ง';
            const sheerYards = hasSheer && width > 0 && height > 0 ? (width * 2.5 * 1.5) / 0.9144 : 0;
            const sheerPrice = hasSheer && sheerYards > 0 ? sheerYards * sheerPricePerM * 0.9144 : 0;
            const sheerTrack = hasSheer && width > 0 ? width : 0;

            let total = 0;
            if (set.fabric_variant === 'ทึบ') total = opaquePrice;
            if (set.fabric_variant === 'โปร่ง') total = sheerPrice;
            if (set.fabric_variant === 'ทึบ&โปร่ง') total = opaquePrice + sheerPrice;

            return {
                total: total,
                opaquePrice: opaquePrice,
                sheerPrice: sheerPrice,
                opaqueYards: opaqueYards,
                sheerYards: sheerYards,
                opaqueTrack: opaqueTrack,
                sheerTrack: sheerTrack,
            };
        },

        calculateDeco(deco) {
            const width = toNum(deco.width_m);
            const height = toNum(deco.height_m);
            const priceSqyd = toNum(deco.price_sqyd);

            if (deco.is_suspended) {
                return { total: 0, areaSqyd: 0 };
            }

            const areaSqyd = width > 0 && height > 0 ? (width * height * 1.09361) : 0;
            const total = areaSqyd > 0 ? areaSqyd * priceSqyd : 0;

            return { total: total, areaSqyd: areaSqyd };
        },

        runAllCalculations(currentState) {
            let grandTotal = 0;
            let totalSets = 0;
            let totalDeco = 0;
            let grandOpaqueYards = 0;
            let grandSheerYards = 0;
            let grandOpaqueTrack = 0;
            let grandSheerTrack = 0;
            let totalPoints = 0;
            let totalUnits = 0;

            currentState.rooms.forEach(room => {
                let roomPrice = 0;
                let roomSets = 0;
                let roomDeco = 0;
                let roomUnits = 0;

                room.sets.forEach(set => {
                    const calc = this.calculateSet(set, room);
                    set.calculations = calc;
                    if (!set.is_suspended) {
                        roomPrice += calc.total;
                        grandOpaqueYards += calc.opaqueYards;
                        grandSheerYards += calc.sheerYards;
                        grandOpaqueTrack += calc.opaqueTrack;
                        grandSheerTrack += calc.sheerTrack;
                        totalSets++;
                        totalPoints++;
                        roomSets++;
                        roomUnits += calc.opaqueYards > 0 || calc.sheerYards > 0 ? 1 : 0;
                    }
                });

                room.decorations.forEach(deco => {
                    const calc = this.calculateDeco(deco);
                    deco.calculations = calc;
                    if (!deco.is_suspended) {
                        roomPrice += calc.total;
                        totalDeco++;
                        totalPoints++;
                        roomDeco++;
                        roomUnits += calc.areaSqyd > 0 ? 1 : 0;
                    }
                });

                room.calculations = {
                    price: roomPrice,
                    sets: roomSets,
                    deco: roomDeco,
                    units: roomUnits
                };
                grandTotal += roomPrice;
            });

            currentState.summary = {
                grandTotal,
                totalSets,
                totalDeco,
                totalPoints,
                grandOpaqueYards,
                grandSheerYards,
                grandOpaqueTrack,
                grandSheerTrack
            };
        }
    };

    // =================================================================================
    // --- RENDERING LOGIC (VIEW) ---
    // =================================================================================
    function populateSelect(selectEl, prices, selectedValue) {
        selectEl.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'เลือกราคา';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        selectEl.appendChild(defaultOption);

        prices.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p.toLocaleString("th-TH");
            selectEl.appendChild(option);
        });
        selectEl.value = selectedValue || "";
    }

    function render() {
        Calculator.runAllCalculations(state);

        // --- Render Customer Info
        document.querySelector('[data-bind="customer.name"]').value = state.customer.name;
        document.querySelector('[data-bind="customer.address"]').value = state.customer.address;
        document.querySelector('[data-bind="customer.phone"]').value = state.customer.phone;

        // --- Render Rooms
        DOMElements.roomsContainer.innerHTML = '';
        state.rooms.forEach((roomData, roomIndex) => {
            const roomEl = DOMElements.templates.room.content.cloneNode(true).firstElementChild;
            roomEl.dataset.roomId = roomData.id;

            // Bind room data
            roomEl.querySelector('[data-bind="room.name"]').value = roomData.name;
            roomEl.querySelector('[data-bind="room.name"]').placeholder = `ห้อง ${String(roomIndex + 1).padStart(2, "0")}`;
            roomEl.querySelector('[data-bind="room.style"]').value = roomData.style;
            populateSelect(roomEl.querySelector('[data-bind="room.price_per_m"]'), CONFIG.PRICING.fabric, roomData.price_per_m);

            // Render sets
            const setsContainer = roomEl.querySelector('[data-sets-container]');
            roomData.sets.forEach((setData, setIndex) => {
                const setEl = DOMElements.templates.set.content.cloneNode(true).firstElementChild;
                setEl.dataset.setId = setData.id;
                setEl.classList.toggle('is-suspended', setData.is_suspended);

                // Bind set data
                setEl.querySelector('[data-bind="set.width_m"]').value = setData.width_m;
                setEl.querySelector('[data-bind="set.height_m"]').value = setData.height_m;
                setEl.querySelector('[data-bind="set.fabric_variant"]').value = setData.fabric_variant;
                setEl.querySelector('[data-bind="set.open_type"]').value = setData.open_type;
                populateSelect(setEl.querySelector('[data-bind="set.sheer_price_per_m"]'), CONFIG.PRICING.sheer, setData.sheer_price_per_m);

                // Display calculation results
                const calc = setData.calculations || {};
                setEl.querySelector('[data-suspend-text]').textContent = setData.is_suspended ? 'ใช้งาน' : 'ระงับ';
                setEl.querySelector('[data-item-title]').textContent = `${setIndex + 1}`;
                setEl.querySelector('[data-set-price="total"]').textContent = fmtCurrency(calc.total);
                setEl.querySelector('[data-set-price="opaque"]').textContent = fmtCurrency(calc.opaquePrice);
                setEl.querySelector('[data-set-price="sheer"]').textContent = fmtCurrency(calc.sheerPrice);
                setEl.querySelector('[data-set-yardage="opaque"]').textContent = fmt(calc.opaqueYards);
                setEl.querySelector('[data-set-yardage="sheer"]').textContent = fmt(calc.sheerYards);
                setEl.querySelector('[data-set-track="opaque"]').textContent = fmt(calc.opaqueTrack);
                setEl.querySelector('[data-set-track="sheer"]').textContent = fmt(calc.sheerTrack);

                // Toggle UI based on variant
                const hasOpaque = setData.fabric_variant === 'ทึบ' || setData.fabric_variant === 'ทึบ&โปร่ง';
                const hasSheer = setData.fabric_variant === 'โปร่ง' || setData.fabric_variant === 'ทึบ&โปร่ง';
                setEl.querySelector('[data-set-options-row]').classList.toggle("three-col", hasSheer);
                setEl.querySelector('[data-sheer-wrap]').classList.toggle("hidden", !hasSheer);
                ['price', 'yardage', 'track'].forEach(type => {
                    setEl.querySelector(`[data-set-${type}-wrap="opaque"]`).classList.toggle("hidden", !hasOpaque);
                    setEl.querySelector(`[data-set-${type}-wrap="sheer"]`).classList.toggle("hidden", !hasSheer);
                });

                setsContainer.appendChild(setEl);
            });

            // Render decorations
            const decosContainer = roomEl.querySelector('[data-decos-container]');
            roomData.decorations.forEach((decoData, decoIndex) => {
                const decoEl = DOMElements.templates.deco.content.cloneNode(true).firstElementChild;
                decoEl.dataset.decoId = decoData.id;
                decoEl.classList.toggle('is-suspended', decoData.is_suspended);

                // Bind deco data
                decoEl.querySelector('[data-bind="deco.type"]').value = decoData.type;
                decoEl.querySelector('[data-bind="deco.width_m"]').value = decoData.width_m;
                decoEl.querySelector('[data-bind="deco.height_m"]').value = decoData.height_m;
                decoEl.querySelector('[data-bind="deco.price_sqyd"]').value = decoData.price_sqyd;

                // Display calculation results
                const calc = decoData.calculations || {};
                decoEl.querySelector('[data-suspend-text]').textContent = decoData.is_suspended ? 'ใช้งาน' : 'ระงับ';
                decoEl.querySelector('[data-item-title]').textContent = `${decoIndex + 1}`;
                decoEl.querySelector('[data-deco-summary]').innerHTML = `ราคา: <span class="price">${fmtCurrency(calc.total)}</span> บ. • พื้นที่: <span class="price">${fmt(calc.areaSqyd)}</span> ตร.หลา`;

                decosContainer.appendChild(decoEl);
            });

            // Room summary brief
            const brief = roomEl.querySelector('[data-room-brief]');
            const roomCalc = roomData.calculations;
            brief.innerHTML = `<span class="num">จุด ${fmtCurrency(roomCalc.sets + roomCalc.deco)}</span> • <span class="num">ชุด ${fmtCurrency(roomCalc.units)}</span> • ราคา <span class="num price">${fmtCurrency(roomCalc.price)}</span> บาท`;

            DOMElements.roomsContainer.appendChild(roomEl);
        });

        // --- Render Grand Summary
        const summary = state.summary;
        document.querySelector('[data-summary="grandTotal"]').textContent = fmtCurrency(summary.grandTotal);
        document.querySelector('[data-summary="totalPoints"]').textContent = fmtCurrency(summary.totalPoints);
        document.querySelector('[data-summary="totalSets"]').textContent = fmtCurrency(summary.totalSets);
        document.querySelector('[data-summary="totalDeco"]').textContent = fmtCurrency(summary.totalDeco);
        document.querySelector('[data-summary="grandOpaqueYards"]').textContent = `${fmt(summary.grandOpaqueYards)} หลา`;
        document.querySelector('[data-summary="grandSheerYards"]').textContent = `${fmt(summary.grandSheerYards)} หลา`;
        document.querySelector('[data-summary="grandOpaqueTrack"]').textContent = `${fmt(summary.grandOpaqueTrack)} ม.`;
        document.querySelector('[data-summary="grandSheerTrack"]').textContent = `${fmt(summary.grandSheerTrack)} ม.`;

        // --- Render Lock State
        DOMElements.lockBtn.classList.toggle('btn-danger', state.isLocked);
        DOMElements.lockBtn.classList.toggle('btn-primary', !state.isLocked);
        DOMElements.lockBtn.querySelector('.lock-text').textContent = state.isLocked ? 'ปลดล็อค' : 'ล็อก';
        DOMElements.lockBtn.querySelector('.lock-icon').textContent = state.isLocked ? '🔓' : '🔒';
        document.querySelectorAll('input, select, button').forEach(el => {
            if (el.id !== 'lockBtn' && !el.closest('.modal')) {
                el.disabled = state.isLocked;
            }
        });

        debouncedSave();
    }

    // =================================================================================
    // --- EVENT HANDLERS & ACTIONS (CONTROLLER) ---
    // =================================================================================
    const Actions = {
        addRoom: () => { state.rooms.push(getNewRoom()); showToast('เพิ่มห้องใหม่แล้ว', 'success'); },
        delRoom: (btn) => {
            const roomId = btn.closest('[data-room-id]').dataset.roomId;
            state.rooms = state.rooms.filter(r => r.id !== roomId);
            if (state.rooms.length === 0) Actions.addRoom();
            showToast('ลบห้องแล้ว', 'success');
        },
        addSet: (btn) => {
            const roomId = btn.closest('[data-room-id]').dataset.roomId;
            const room = state.rooms.find(r => r.id === roomId);
            if (room) room.sets.push(getNewSet());
            showToast('เพิ่มจุดผ้าม่านแล้ว', 'success');
        },
        delSet: (btn) => {
            const roomId = btn.closest('[data-room-id]').dataset.roomId;
            const setId = btn.closest('[data-set-id]').dataset.setId;
            const room = state.rooms.find(r => r.id === roomId);
            if (room) room.sets = room.sets.filter(s => s.id !== setId);
            showToast('ลบจุดผ้าม่านแล้ว', 'success');
        },
        clearSet: (btn) => {
            const roomId = btn.closest('[data-room-id]').dataset.roomId;
            const setId = btn.closest('[data-set-id]').dataset.setId;
            const room = state.rooms.find(r => r.id === roomId);
            const set = room?.sets.find(s => s.id === setId);
            if(set) Object.assign(set, { width_m: '', height_m: '', fabric_variant: 'ทึบ', open_type: '', sheer_price_per_m: '' });
            showToast('ล้างข้อมูลจุดผ้าม่านแล้ว', 'success');
        },
        addDeco: (btn) => {
            const roomId = btn.closest('[data-room-id]').dataset.roomId;
            const room = state.rooms.find(r => r.id === roomId);
            if (room) room.decorations.push(getNewDeco());
            showToast('เพิ่มรายการตกแต่งแล้ว', 'success');
        },
        delDeco: (btn) => {
            const roomId = btn.closest('[data-room-id]').dataset.roomId;
            const decoId = btn.closest('[data-deco-id]').dataset.decoId;
            const room = state.rooms.find(r => r.id === roomId);
            if (room) room.decorations = room.decorations.filter(d => d.id !== decoId);
            showToast('ลบรายการตกแต่งแล้ว', 'success');
        },
        clearDeco: (btn) => {
            const roomId = btn.closest('[data-room-id]').dataset.roomId;
            const decoId = btn.closest('[data-deco-id]').dataset.decoId;
            const room = state.rooms.find(r => r.id === roomId);
            const deco = room?.decorations.find(d => d.id === decoId);
            if(deco) Object.assign(deco, { type: '', width_m: '', height_m: '', price_sqyd: '' });
            showToast('ล้างข้อมูลตกแต่งแล้ว', 'success');
        },
        toggleSuspend: (btn) => {
            const roomId = btn.closest('[data-room-id]').dataset.roomId;
            const room = state.rooms.find(r => r.id === roomId);
            const itemId = btn.closest('[data-set-id], [data-deco-id]').dataset.setId || btn.closest('[data-set-id], [data-deco-id]').dataset.decoId;
            const item = room?.sets.find(i => i.id === itemId) || room?.decorations.find(i => i.id === itemId);
            if (item) {
                item.is_suspended = !item.is_suspended;
                showToast(`รายการถูก${item.is_suspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
            }
        },
        clearAll: () => {
            initState();
            state.rooms = [getNewRoom()];
            state.customer = { name: '', address: '', phone: '' };
            showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
        },
        toggleLock: () => {
            state.isLocked = !state.isLocked;
            showToast(state.isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', state.isLocked ? 'warning' : 'success');
        },
        updateBoundValue: (el) => {
            const bindPath = el.dataset.bind;
            if (!bindPath) return;

            const [type, key] = bindPath.split('.');
            let value = el.value;

            if (type === 'customer') {
                state.customer[key] = value;
            } else if (type === 'room' || type === 'set' || type === 'deco') {
                const roomId = el.closest('[data-room-id]')?.dataset.roomId;
                const room = state.rooms.find(r => r.id === roomId);
                if (!room) return;

                if (type === 'room') {
                    room[key] = value;
                } else {
                    const itemId = el.closest(`[data-${type}-id]`)?.dataset[`${type}Id`];
                    const collection = type === 'set' ? room.sets : room.decorations;
                    const item = collection.find(i => i.id === itemId);
                    if (item) {
                       // For numeric inputs, clean the value
                       if(el.inputMode === 'numeric') {
                           value = value.replace(/[^0-9.]/g, '');
                           el.value = value;
                       }
                       item[key] = value;
                    }
                }
            }
        }
    };

    const debouncedRender = debounce(render, 300);

    // Event listeners
    document.addEventListener('input', (e) => {
        Actions.updateBoundValue(e.target);
        debouncedRender();
    });
    
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn || (state.isLocked && btn.dataset.act !== 'toggleLock')) {
            return;
        }

        const act = btn.dataset.act;
        const action = Actions[act];

        if (action) {
            const isDestructive = act.startsWith('del') || act.startsWith('clear');
            if (isDestructive) {
                const titles = { 'delRoom': 'ลบห้อง', 'delSet': 'ลบจุด', 'delDeco': 'ลบรายการ', 'clearSet': 'ล้างข้อมูล', 'clearDeco': 'ล้างข้อมูล', 'clearAll': 'ล้างข้อมูลทั้งหมด' };
                const bodies = { 'clearAll': 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้', default: 'ยืนยันการกระทำนี้?' };
                if (await showConfirmation(titles[act] || 'ยืนยัน', bodies[act] || bodies.default)) {
                    action(btn);
                    render();
                }
            } else {
                action(btn);
                render();
            }
        } else if(act === 'copy-json' || act === 'copy-text') {
            if (act === 'copy-json') {
                copyToClipboard(JSON.stringify(state, null, 2), 'คัดลอก JSON แล้ว!', 'ไม่สามารถคัดลอก JSON ได้');
            } else if (act === 'copy-text') {
                const options = await showCopyOptionsModal();
                if (options) {
                    copyToClipboard(buildTextPayload(state, options), 'คัดลอกข้อความแล้ว!', 'ไม่สามารถคัดลอกข้อความได้');
                }
            }
        }
    });

    DOMElements.orderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // ตรวจสอบว่ามี Webhook URL หรือไม่
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

    // =================================================================================
    // --- UI HELPERS (Modals, Toasts, Clipboard) ---
    // =================================================================================
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        DOMElements.toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }

    const showConfirmation = (title, body) => {
        return new Promise(resolve => {
            const modalEl = document.querySelector('#confirmationModal');
            modalEl.querySelector('#modalTitle').textContent = title;
            modalEl.querySelector('#modalBody').textContent = body;
            modalEl.classList.add('visible');
            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                modalEl.querySelector('#modalConfirm').onclick = null;
                modalEl.querySelector('#modalCancel').onclick = null;
                resolve(result);
            };
            modalEl.querySelector('#modalConfirm').onclick = () => cleanup(true);
            modalEl.querySelector('#modalCancel').onclick = () => cleanup(false);
        });
    };

    const showCopyOptionsModal = () => new Promise(resolve => {
        const modal = document.querySelector('#copyOptionsModal');
        modal.classList.add('visible');
        const confirmBtn = modal.querySelector('#copyOptionsConfirm');
        const cancelBtn = modal.querySelector('#copyOptionsCancel');
        const cleanup = (result) => {
            modal.classList.remove('visible');
            confirmBtn.onclick = null; cancelBtn.onclick = null;
            resolve(result);
        };
        confirmBtn.onclick = () => cleanup({
            customer: modal.querySelector('#copyCustomerInfo').checked,
            details: modal.querySelector('#copyRoomDetails').checked,
            summary: modal.querySelector('#copySummary').checked,
        });
        cancelBtn.onclick = () => cleanup(false);
    });

    async function copyToClipboard(text, successMsg, errorMsg) {
          try {
            await navigator.clipboard.writeText(text);
            showToast(successMsg, 'success');
        } catch(err) {
            console.error("Failed to copy: ", err);
            showToast(errorMsg, 'error');
        }
    }

    function buildTextPayload(currentState, options) {
        let text = "";
        if (options.customer && currentState.customer) {
            text += "--- ข้อมูลลูกค้า ---\n";
            text += `ชื่อ: ${currentState.customer.name || '-'}\n`;
            text += `ที่อยู่: ${currentState.customer.address || '-'}\n`;
            text += `เบอร์โทร: ${currentState.customer.phone || '-'}\n\n`;
        }
        if (options.details && currentState.rooms) {
            text += "--- รายละเอียดแต่ละจุด ---\n";
            currentState.rooms.forEach((room, rIndex) => {
                if(room.is_suspended) return;
                const roomName = room.name || `ห้อง ${String(rIndex + 1).padStart(2, "0")}`;
                text += `\n** ห้อง: ${roomName} (${room.style} - ${fmtCurrency(room.price_per_m)} บ./ม.) **\n`;

                room.sets.forEach((set, sIndex) => {
                    if (set.is_suspended) return;
                    text += `\n• จุดผ้าม่านที่ ${sIndex + 1}: กว้าง ${fmt(toNum(set.width_m))} ม. x สูง ${fmt(toNum(set.height_m))} ม.\n`;
                    text += `  - ชนิด: ${set.fabric_variant} | เปิด: ${set.open_type || 'ไม่ระบุ'}\n`;
                    text += `  - ราคา: ${fmtCurrency(set.calculations.total)} บ.\n`;
                });

                room.decorations.forEach((deco, dIndex) => {
                    if (deco.is_suspended) return;
                    text += `\n• รายการตกแต่งที่ ${dIndex + 1}: ${deco.type}\n`;
                    text += `  - กว้าง ${fmt(toNum(deco.width_m))} ม. x สูง ${fmt(toNum(deco.height_m))} ม.\n`;
                    text += `  - ราคา: ${fmtCurrency(deco.calculations.total)} บ.\n`;
                });
            });
            text += "\n";
        }
        if (options.summary && currentState.summary) {
            text += "--- สรุปยอดรวม ---\n";
            text += `ราคารวม: ${fmtCurrency(currentState.summary.grandTotal)} บาท\n`;
            text += `ผ้าทึบที่ใช้: ${fmt(currentState.summary.grandOpaqueYards)} หลา\n`;
            text += `ผ้าโปร่งที่ใช้: ${fmt(currentState.summary.grandSheerYards)} หลา\n`;
        }
        return text.trim();
    }

    // =================================================================================
    // --- INITIALIZATION ---
    // =================================================================================
    initState();
    render();

})();