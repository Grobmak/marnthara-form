(function() {
    'use strict';

    // --- Constants and Helpers (Unchanged) ---
    const APP_VERSION = "input-ui/3.5.0-stable";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };

    const CALC = {
        fabricYardage: (style, width) => {
            if (width <= 0) return 0;
            if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
            if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
            return 0;
        },
    };

    const toNum = v => {
        if (typeof v === 'string') v = v.replace(/,/g, '');
        return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0;
    };
    const clamp01 = v => Math.max(0, toNum(v));
    const fmt = (n, fixed = 2, asCurrency = false) => {
        if (!Number.isFinite(n)) return "0";
        const options = asCurrency 
            ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } 
            : { minimumFractionDigits: fixed, maximumFractionDigits: fixed };
        return n.toLocaleString("th-TH", options);
    };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };
    
    class OrderApp {
        constructor() {
            this.isLocked = false;
            this.state = this.loadState();
            this.cacheDOM();
            this.attachEventListeners();
            this.render();
        }

        // --- State Management ---
        getInitialState() {
            return {
                customer_name: "",
                customer_address: "",
                customer_phone: "",
                rooms: []
            };
        }

        loadState() {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                try {
                    const parsed = JSON.parse(storedData);
                    // Ensure rooms exist
                    if (!parsed.rooms) parsed.rooms = [];
                    return parsed;
                } catch (err) {
                    console.error("Failed to load data from storage:", err);
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
            const initialState = this.getInitialState();
            initialState.rooms.push(this.createRoomState()); // Start with one room
            return initialState;
        }

        saveState() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        }

        setState(updater, callback) {
            updater(this.state);
            this.render();
            this.saveState();
            if (callback) callback();
        }
        
        createRoomState() {
            return {
                id: Date.now(),
                room_name: "",
                price_per_m_raw: "",
                style: "",
                sets: [],
                decorations: [],
                wallpapers: []
            };
        }

        // --- DOM & Event Handling ---
        cacheDOM() {
            this.dom = {
                orderForm: document.querySelector('#orderForm'),
                roomsContainer: document.querySelector('#rooms'),
                grandTotal: document.querySelector('#grandTotal'),
                setCount: document.querySelector('#setCount'),
                setCountSets: document.querySelector('#setCountSets'),
                setCountDeco: document.querySelector('#setCountDeco'),
                customerName: document.querySelector('input[name="customer_name"]'),
                customerAddress: document.querySelector('input[name="customer_address"]'),
                customerPhone: document.querySelector('input[name="customer_phone"]'),
                lockBtn: document.querySelector('#lockBtn'),
            };
            this.dom.orderForm.action = WEBHOOK_URL;
        }

        attachEventListeners() {
            document.body.addEventListener('input', this.handleFormInput.bind(this));
            document.body.addEventListener('change', this.handleFormInput.bind(this));
            document.body.addEventListener('click', this.handleGlobalClick.bind(this));
        }
        
        handleFormInput(e) {
            const target = e.target;
            const { name, value } = target;

            if (['customer_name', 'customer_address', 'customer_phone'].includes(name)) {
                this.setState(state => state[name] = value);
                return;
            }

            const roomEl = target.closest('[data-room]');
            if (!roomEl) return;
            
            const roomId = Number(roomEl.dataset.id);
            const itemEl = target.closest('[data-set], [data-deco-item], [data-wallpaper-item]');
            const wallEl = target.closest('.wall-input-row');

            this.setState(state => {
                const room = state.rooms.find(r => r.id === roomId);
                if (!room) return;

                if (itemEl) {
                    const itemId = Number(itemEl.dataset.id);
                    const itemType = itemEl.dataset.set ? 'sets' : itemEl.dataset.decoItem ? 'decorations' : 'wallpapers';
                    const item = room[itemType]?.find(i => i.id === itemId);
                    
                    if (item) {
                         if (wallEl) {
                            const wallIndex = Number(wallEl.dataset.index);
                            item.widths[wallIndex] = value;
                        } else {
                            item[name] = value;
                        }
                    }
                } else {
                    room[name] = value;
                }
            });
        }
        
        handleGlobalClick(e) {
            const btn = e.target.closest("button");
            if (!btn) return;
            
            const act = btn.dataset.act;
            if (!act) return;

            e.preventDefault();
            
            if (act === 'toggle-lock') {
                this.toggleLock();
                return;
            }

            if (this.isLocked) return;

            const roomEl = btn.closest('[data-room]');
            const roomId = roomEl ? Number(roomEl.dataset.id) : null;
            const itemEl = btn.closest('[data-set], [data-deco-item], [data-wallpaper-item]');
            const itemId = itemEl ? Number(itemEl.dataset.id) : null;
            
            const actions = {
                'add-room': () => this.addRoom(),
                'del-room': () => this.delRoom(roomId),
                'add-set': () => this.addSet(roomId),
                'del-set': () => this.delItem(roomId, 'sets', itemId),
                'clear-set': () => this.clearItem(roomId, 'sets', itemId),
                'toggle-suspend-set': () => this.toggleSuspend(roomId, 'sets', itemId),
                'add-deco': () => this.addDeco(roomId),
                'del-deco': () => this.delItem(roomId, 'decorations', itemId),
                'add-wallpaper': () => this.addWallpaper(roomId),
                'del-wallpaper': () => this.delItem(roomId, 'wallpapers', itemId),
                'add-wall': () => this.addWall(roomId, itemId),
                'del-wall': () => {
                    const wallIndex = Number(btn.closest('.wall-input-row').dataset.index);
                    this.delWall(roomId, itemId, wallIndex);
                }
            };
            if (actions[act]) actions[act]();
        }

        // --- Action Methods ---
        toggleLock() {
            this.isLocked = !this.isLocked;
            this.updateLockStateUI();
        }
        addRoom() {
            this.setState(state => { state.rooms.push(this.createRoomState()); });
        }
        delRoom(roomId) {
            this.setState(state => state.rooms = state.rooms.filter(r => r.id !== roomId));
        }
        addSet(roomId) {
            this.setState(state => {
                const room = state.rooms.find(r => r.id === roomId);
                room?.sets.push({ id: Date.now(), width_m: "", height_m: "", fabric_variant: "ทึบ", open_type: "", sheer_price_per_m: "", is_suspended: false });
            });
        }
        addDeco(roomId) { this.setState(state => state.rooms.find(r => r.id === roomId)?.decorations.push({ id: Date.now(), type: "", width_m: "", height_m: "", price_sqyd: "", is_suspended: false })); }
        addWallpaper(roomId) { this.setState(state => state.rooms.find(r => r.id === roomId)?.wallpapers.push({ id: Date.now(), height_m: "", price_per_roll: "", widths: [""], is_suspended: false })); }
        delItem(roomId, itemType, itemId) {
            this.setState(state => {
                const room = state.rooms.find(r => r.id === roomId);
                if (room) room[itemType] = room[itemType].filter(i => i.id !== itemId);
            });
        }
        toggleSuspend(roomId, itemType, itemId) {
            this.setState(state => {
                const item = state.rooms.find(r => r.id === roomId)?.[itemType]?.find(i => i.id === itemId);
                if(item) item.is_suspended = !item.is_suspended;
            });
        }
        clearItem(roomId, itemType, itemId) {
            // A more complex action, for now we will just re-add a new one
            this.delItem(roomId, itemType, itemId);
            if (itemType === 'sets') this.addSet(roomId);
        }
        addWall(roomId, wallpaperId) { this.setState(state => state.rooms.find(r => r.id === roomId)?.wallpapers.find(w => w.id === wallpaperId)?.widths.push("")); }
        delWall(roomId, wallpaperId, wallIndex) { this.setState(state => state.rooms.find(r => r.id === roomId)?.wallpapers.find(w => w.id === wallpaperId)?.widths.splice(wallIndex, 1)); }

        // --- Rendering ---
        render() {
            this.dom.customerName.value = this.state.customer_name;
            this.dom.customerAddress.value = this.state.customer_address;
            this.dom.customerPhone.value = this.state.customer_phone;
            
            const roomHtml = this.state.rooms.map((room, index) => this.renderRoom(room, index)).join('');
            this.dom.roomsContainer.innerHTML = roomHtml;

            this.updateSummary();
            this.updateLockStateUI();
        }

        renderRoom(room, index) {
            const roomTpl = document.getElementById('roomTpl').innerHTML;
            const priceOptions = PRICING.fabric.map(p => `<option value="${p}" ${p == room.price_per_m_raw ? 'selected' : ''}>${fmt(p, 0, true)}</option>`).join('');
            const styleOptions = ['ลอน', 'ตาไก่', 'จีบ'].map(s => `<option ${s === room.style ? 'selected' : ''}>${s}</option>`).join('');
            
            // ### BUG FIX IS HERE ###
            // Using (room.sets || []) to prevent error if the property is undefined.
            const setsHtml = (room.sets || []).map((s, i) => this.renderSet(s, i + 1)).join('');
            const decorationsHtml = (room.decorations || []).map((d, i) => this.renderDeco(d, i + 1)).join('');
            const wallpapersHtml = (room.wallpapers || []).map((w, i) => this.renderWallpaper(w, i + 1)).join('');

            return roomTpl
                .replace(/{{roomId}}/g, room.id)
                .replace('{{roomName}}', room.room_name)
                .replace('{{roomNamePlaceholder}}', `ห้อง ${String(index + 1).padStart(2, "0")}`)
                .replace('{{priceOptions}}', priceOptions)
                .replace('{{styleOptions}}', styleOptions)
                .replace('{{sets}}', setsHtml)
                .replace('{{decorations}}', decorationsHtml)
                .replace('{{wallpapers}}', wallpapersHtml);
        }

        renderSet(set, index) {
            const setTpl = document.getElementById('setTpl').innerHTML;
            const sheerPriceOptions = PRICING.sheer.map(p => `<option value="${p}" ${p == set.sheer_price_per_m ? 'selected' : ''}>${fmt(p, 0, true)}</option>`).join('');
            return setTpl.replace(/{{itemId}}/g, set.id)
                .replace('{{itemIndex}}', index)
                .replace('{{width_m}}', set.width_m)
                .replace('{{height_m}}', set.height_m)
                .replace('{{open_type_options}}', ['แยกกลาง', 'สไลด์เดี่ยว'].map(o => `<option ${o === set.open_type ? 'selected' : ''}>${o}</option>`).join(''))
                .replace('{{fabric_variant_options}}', ['ทึบ', 'โปร่ง', 'ทึบ&โปร่ง'].map(v => `<option ${v === set.fabric_variant ? 'selected' : ''}>${v}</option>`).join(''))
                .replace('{{sheerPriceOptions}}', sheerPriceOptions)
                .replace('{{isSuspendedClass}}', set.is_suspended ? 'is-suspended' : '')
                .replace('{{suspendText}}', set.is_suspended ? 'ใช้งาน' : 'ระงับ')
                .replace('{{sheerWrapClass}}', (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") ? '' : 'hidden')
                .replace('{{optionsRowClass}}', (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") ? 'three-col' : '');
        }

        renderDeco(deco, index) { /* Similar implementation as renderSet */ return ''; }
        renderWallpaper(wp, index) { /* Similar implementation as renderSet */ return ''; }
        
        updateSummary() {
            let grandTotal = 0;
            // ... (rest of summary calculation logic)
            this.dom.grandTotal.textContent = fmt(grandTotal, 0, true);
        }

        updateLockStateUI() {
            document.querySelectorAll('input, select, button').forEach(el => {
                if (el.closest('#lockBtn')) return;
                el.disabled = this.isLocked;
            });
            this.dom.lockBtn.querySelector('.lock-text').textContent = this.isLocked ? 'ปลดล็อค' : 'ล็อก';
            this.dom.lockBtn.querySelector('.lock-icon').textContent = this.isLocked ? '🔓' : '🔒';
            this.dom.lockBtn.classList.toggle('btn-danger', this.isLocked);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        new OrderApp();
    });
})();