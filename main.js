/* eslint-disable no-unused-vars */
(function() {
    'use strict';
    
    // --- Constants & Config ---
    const CONFIG = {
        APP_VERSION: '3.2.1',
        WEBHOOK_URL: 'https://webhook.site/YOUR_WEBHOOK_UUID',
        PRICING: {
            fabric: [150, 200, 300, 350, 400],
            sheer: [150, 200, 250, 300]
        },
        DEFAULTS: {
            room: { name: '', style: 'ลอน', price_per_m: 300 },
            set: { width_m: '', height_m: '', fabric_variant: 'ทึบ', open_type: '', sheer_price_per_m: '' },
            deco: { type: '', width_m: '', height_m: '', price_sqyd: '' },
        },
    };
    
    const DOMElements = {
        orderForm: document.querySelector('#orderForm'),
        roomsContainer: document.querySelector('[data-rooms-container]'),
        lockBtn: document.querySelector('#lockBtn'),
        submitBtn: document.querySelector('#submitBtn'),
        toastContainer: document.querySelector('#toastContainer'),
        templates: {
            room: document.querySelector('#roomTpl'),
            set: document.querySelector('#setTpl'),
            deco: document.querySelector('#decoTpl')
        }
    };

    // --- State Management ---
    let state = {};
    
    function getNewRoom() {
        return {
            id: crypto.randomUUID(),
            ...CONFIG.DEFAULTS.room,
            sets: [getNewSet()],
            decorations: [getNewDeco()],
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
    
    function getNewDeco() {
        return {
            id: crypto.randomUUID(),
            ...CONFIG.DEFAULTS.deco,
            is_suspended: false,
            calculations: {}
        };
    }

    function initState() {
        try {
            const savedState = JSON.parse(localStorage.getItem('curtain_calculator_state'));
            state = savedState || {
                customer: { name: '', address: '', phone: '' },
                rooms: [getNewRoom()],
                summary: {},
                isLocked: false,
            };
        } catch (e) {
            console.error("Failed to load state from localStorage:", e);
            state = {
                customer: { name: '', address: '', phone: '' },
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
            // Fix: Store string value that can be formatted to match textContent
            option.value = p.toString();
            option.textContent = p.toLocaleString("th-TH");
            selectEl.appendChild(option);
        });
        // Fix: Ensure selectedValue is also a string for comparison
        selectEl.value = selectedValue ? selectedValue.toString() : '';
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
                setEl.querySelector('[data-set-yardage="opaque"]').textContent = `${fmt(calc.opaqueYards)} หลา`;
                setEl.querySelector('[data-set-yardage="sheer"]').textContent = `${fmt(calc.sheerYards)} หลา`;
                setEl.querySelector('[data-set-track="opaque"]').textContent = `${fmt(calc.opaqueTrack)} ม.`;
                setEl.querySelector('[data-set-track="sheer"]').textContent = `${fmt(calc.sheerTrack)} ม.`;

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
    // Functions that handle user input, update the state, and trigger a re-render.
    // =================================================================================
    const Actions = {
        addRoom: () => { state.rooms.push(getNewRoom()); showToast('เพิ่มห้องใหม่แล้ว', 'success'); },
        delRoom: (btn) => {
            const roomId = btn.closest('[data-room-id]').dataset.roomId;
            state.rooms = state.rooms.filter(r => r.id !== roomId);
            if (state.rooms.length === 0) Actions.addRoom(); // Ensure at least one room
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
                        // Corrected: Convert back to a number directly if it's a numeric input type
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
        if (!btn || (state.isLocked && btn.dataset.act !== 'toggleLock')) return;
        
        const act = btn.dataset.act;
        const action = Actions[act];
        
        if (action) {
            const isDestructive = act.startsWith('del') || act.startsWith('clear');
            if (isDestructive) {
                const titles = { 'del-room': 'ลบห้อง', 'del-set': 'ลบจุด', 'del-deco': 'ลบรายการ', 'clear-set': 'ล้างข้อมูล', 'clear-deco': 'ล้างข้อมูล', 'clear-all': 'ล้างข้อมูลทั้งหมด' };
                const bodies = { 'clear-all': 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้', default: 'ยืนยันการกระทำนี้?' };
                if (await showConfirmation(titles[act] || 'ยืนยัน', bodies[act] || bodies.default)) {
                    action(btn);
                    render();
                }
            } else {
                action(btn);
                render();
            }
        } else if(act === 'copy-json' || act === 'copy-text') {
            // Non-state changing actions
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