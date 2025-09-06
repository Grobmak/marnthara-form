/* eslint-disable no-unused-vars */
(function() {
    'use strict';
    
    // --- Constants & Config ---
    const CONFIG = {
        APP_VERSION: '4.0.0',
        PRICING: {
            fabric: [150, 200, 300, 350, 400],
            sheer: [150, 200, 250, 300]
        },
        DEFAULTS: {
            room: { name: '', style: 'ลอน', price_per_m: 300 },
            set: { width_m: '', height_m: '', fabric_variant: 'ทึบ', sheer_price_per_m: '' },
        },
    };
    
    const DOMElements = {
        orderForm: document.querySelector('#orderForm'),
        roomsContainer: document.querySelector('[data-rooms-container]'),
        lockBtn: document.querySelector('#lockBtn'),
        toastContainer: document.querySelector('#toastContainer'),
        templates: {
            room: document.querySelector('#roomTpl'),
            set: document.querySelector('#setTpl'),
        }
    };

    // --- State Management ---
    let state = {};
    
    function getNewRoom() {
        return {
            id: crypto.randomUUID(),
            ...CONFIG.DEFAULTS.room,
            sets: [getNewSet()],
            calculations: {}
        };
    }

    function getNewSet() {
        return {
            id: crypto.randomUUID(),
            ...CONFIG.DEFAULTS.set,
            is_suspended: false,
            calculations: {}
        };
    }

    function initState() {
        try {
            const savedState = JSON.parse(localStorage.getItem('curtain_calculator_state'));
            state = savedState || {
                customer: { name: '' },
                rooms: [getNewRoom()],
                summary: {},
                isLocked: false,
            };
        } catch (e) {
            console.error("Failed to load state from localStorage:", e);
            state = {
                customer: { name: '' },
                rooms: [getNewRoom()],
                summary: {},
                isLocked: false,
            };
        }
    }

    const debouncedSave = debounce(() => {
        localStorage.setItem('curtain_calculator_state', JSON.stringify(state));
    }, 1000);

    // --- Helper Functions ---
    const fmt = (n) => typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : '0.00';
    const fmtCurrency = (n) => typeof n === 'number' && !isNaN(n) ? n.toLocaleString("th-TH") : '0';
    const toNum = (s) => typeof s === 'string' ? parseFloat(s.replace(/,/g, '')) || 0 : s || 0;
    const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    function populateSelect(selectEl, prices, selectedValue) {
        selectEl.innerHTML = '';
        prices.forEach(p => {
            const option = document.createElement('option');
            option.value = p.toString();
            option.textContent = p.toLocaleString("th-TH");
            selectEl.appendChild(option);
        });
        selectEl.value = selectedValue ? selectedValue.toString() : '';
    }

    function render() {
        Calculator.runAllCalculations(state);
        
        // --- Render Customer Info
        document.querySelector('[data-bind="customer.name"]').value = state.customer.name;

        // --- Render Rooms
        DOMElements.roomsContainer.innerHTML = '';
        state.rooms.forEach((roomData, roomIndex) => {
            const roomEl = DOMElements.templates.room.content.cloneNode(true).firstElementChild;
            roomEl.dataset.roomId = roomData.id;
            
            // Bind room data
            const roomTitle = roomEl.querySelector('[data-room-title]');
            roomTitle.textContent = roomData.name || `ห้อง ${String(roomIndex + 1).padStart(2, "0")}`;
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
                populateSelect(setEl.querySelector('[data-bind="set.sheer_price_per_m"]'), CONFIG.PRICING.sheer, setData.sheer_price_per_m);
                
                // Display calculation results
                const calc = setData.calculations || {};
                setEl.querySelector('[data-suspend-text]').textContent = setData.is_suspended ? 'ใช้งาน' : 'ระงับ';
                setEl.querySelector('[data-item-title]').textContent = `จุดที่ ${setIndex + 1}`;
                setEl.querySelector('[data-set-price="total"]').textContent = fmtCurrency(calc.total);
                setEl.querySelector('[data-set-yardage="opaque"]').textContent = fmt(calc.opaqueYards);
                setEl.querySelector('[data-set-yardage="sheer"]').textContent = fmt(calc.sheerYards);
                setEl.querySelector('[data-set-track="opaque"]').textContent = fmt(calc.opaqueTrack);
                setEl.querySelector('[data-set-track="sheer"]').textContent = fmt(calc.sheerTrack);

                // Toggle UI based on variant
                const hasSheer = setData.fabric_variant === 'โปร่ง' || setData.fabric_variant === 'ทึบ&โปร่ง';
                setEl.querySelector('[data-sheer-wrap]').classList.toggle("hidden", !hasSheer);

                setsContainer.appendChild(setEl);
            });

            // Room summary brief
            const brief = roomEl.querySelector('[data-room-brief]');
            const roomCalc = roomData.calculations;
            brief.innerHTML = `จำนวน ${roomCalc.sets} จุด • ราคา <span class="num price">${fmtCurrency(roomCalc.price)}</span> บาท`;

            DOMElements.roomsContainer.appendChild(roomEl);
        });

        // --- Render Grand Summary
        const summary = state.summary;
        document.querySelector('[data-summary="grandTotal"]').textContent = fmtCurrency(summary.grandTotal);
        document.querySelector('[data-summary="grandOpaqueYards"]').textContent = `${fmt(summary.grandOpaqueYards)}`;
        document.querySelector('[data-summary="grandSheerYards"]').textContent = `${fmt(summary.grandSheerYards)}`;

        // --- Render Lock State
        DOMElements.lockBtn.classList.toggle('btn-danger', state.isLocked);
        DOMElements.lockBtn.classList.toggle('btn-primary', !state.isLocked);
        DOMElements.lockBtn.querySelector('.lock-text').textContent = state.isLocked ? 'ปลดล็อค' : 'ล็อก';
        DOMElements.lockBtn.querySelector('.lock-icon').textContent = state.isLocked ? '🔓' : '🔒';
        document.querySelectorAll('input, select, button').forEach(el => {
            if (el.dataset.act === 'clearAll' || el.dataset.act === 'toggleLock' || el.dataset.act === 'copy-text') return;
            el.disabled = state.isLocked;
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
            if(set) Object.assign(set, getNewSet());
            showToast('ล้างข้อมูลจุดผ้าม่านแล้ว', 'success');
        },
        toggleSuspend: (btn) => {
            const roomId = btn.closest('[data-room-id]').dataset.roomId;
            const room = state.rooms.find(r => r.id === roomId);
            const setId = btn.closest('[data-set-id]').dataset.setId;
            const set = room?.sets.find(i => i.id === setId);
            if (set) {
                set.is_suspended = !set.is_suspended;
                showToast(`รายการถูก${set.is_suspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
            }
        },
        clearAll: () => {
            initState();
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
            } else if (type === 'room' || type === 'set') {
                const roomId = el.closest('[data-room-id]')?.dataset.roomId;
                const room = state.rooms.find(r => r.id === roomId);
                if (!room) return;

                if (type === 'room') {
                    room[key] = value;
                } else {
                    const itemId = el.closest(`[data-${type}-id]`)?.dataset[`${type}Id`];
                    const collection = type === 'set' ? room.sets : null;
                    const item = collection.find(i => i.id === itemId);
                    if (item) {
                        if (el.inputMode === 'numeric' || el.type === 'number') {
                            value = toNum(value);
                        }
                        item[key] = value;
                    }
                }
            }
        }
    };

    const debouncedRender = debounce(render);
    
    document.addEventListener('input', (e) => {
        Actions.updateBoundValue(e.target);
        debouncedRender();
    });

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn || (state.isLocked && btn.dataset.act !== 'toggleLock' && btn.dataset.act !== 'copy-text')) return;
        
        const act = btn.dataset.act;
        const action = Actions[act];
        
        if (action) {
            const isDestructive = act.startsWith('del') || act.startsWith('clear');
            if (isDestructive) {
                const title = `ยืนยัน${act === 'clearAll' ? 'การล้าง' : 'การลบ'}`;
                const body = act === 'clearAll' ? 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้' : 'ยืนยันการกระทำนี้?';
                if (await showConfirmation(title, body)) {
                    action(btn);
                    render();
                }
            } else {
                action(btn);
                render();
            }
        } else if(act === 'copy-text') {
            copyToClipboard(buildReportText(state), 'คัดลอกข้อมูลสรุปแล้ว!', 'ไม่สามารถคัดลอกข้อมูลได้');
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

    async function copyToClipboard(text, successMsg, errorMsg) {
        try {
            await navigator.clipboard.writeText(text);
            showToast(successMsg, 'success');
        } catch(err) {
            console.error("Failed to copy: ", err);
            showToast(errorMsg, 'error');
        }
    }

    function buildReportText(currentState) {
        const fmt = (n) => typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : '0.00';
        const fmtCurrency = (n) => typeof n === 'number' && !isNaN(n) ? n.toLocaleString("th-TH") : '0';
        let text = "";
        
        text += "--- สรุปใบเสนอราคาผ้าม่าน ---\n\n";
        text += `ลูกค้า: ${currentState.customer.name || 'ไม่ระบุ'}\n`;
        text += `วันที่: ${new Date().toLocaleDateString('th-TH')}\n\n`;

        // Room and Set Details
        currentState.rooms.forEach((room, rIndex) => {
            const roomName = room.name || `ห้อง ${String(rIndex + 1).padStart(2, "0")}`;
            const sets = room.sets.filter(s => !s.is_suspended);
            if (sets.length === 0) return;

            text += `** ${roomName} (${room.style}) **\n`;
            sets.forEach((set, sIndex) => {
                const { width_m, height_m, fabric_variant, calculations } = set;
                const { total, opaqueYards, sheerYards, opaqueTrack, sheerTrack } = calculations;

                text += `• จุดที่ ${sIndex + 1}: กว้าง ${fmt(width_m)} ม. x สูง ${fmt(height_m)} ม. (${fabric_variant})\n`;
                text += `  - ราคา: ${fmtCurrency(total)} บาท\n`;
                text += `  - ผ้าที่ใช้: ทึบ ${fmt(opaqueYards)} หลา | โปร่ง ${fmt(sheerYards)} หลา\n`;
                text += `  - รางที่ใช้: ทึบ ${fmt(opaqueTrack)} ม. | โปร่ง ${fmt(sheerTrack)} ม.\n\n`;
            });
        });

        // Grand Summary
        const summary = currentState.summary;
        text += `--- สรุปยอดรวม ---\n`;
        text += `ราคารวม: ${fmtCurrency(summary.grandTotal)} บาท\n`;
        text += `ผ้าทึบรวม: ${fmt(summary.grandOpaqueYards)} หลา\n`;
        text += `ผ้าโปร่งรวม: ${fmt(summary.grandSheerYards)} หลา\n`;
        text += `รางทึบรวม: ${fmt(summary.grandOpaqueTrack)} ม.\n`;
        text += `รางโปร่งรวม: ${fmt(summary.grandSheerTrack)} ม.\n\n`;
        text += `*ยอดราคาสำหรับเสนอให้ลูกค้าเป็นยอดรวมทั้งหมด*\n`;

        return text.trim();
    }

    // =================================================================================
    // --- INITIALIZATION ---
    // =================================================================================
    initState();
    render();
})();