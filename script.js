(function() {
    'use strict';

    // --- ค่าคงที่และฟังก์ชันตัวช่วย (ไม่เปลี่ยนแปลง) ---
    const APP_VERSION = "input-ui/3.4.0-worldclass";
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

    // --- Helper Functions (แยกออกมาเพื่อให้ Test ง่าย) ---
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
    
    /**
     * @class OrderApp
     * @description สถาปัตยกรรมใหม่แบบ Class-based และ State-driven
     */
    class OrderApp {
        constructor() {
            this.isLocked = false;
            this.state = this.loadState(); // โหลด State จาก localStorage
            this.cacheDOM(); // Cache Element ที่ใช้บ่อย
            this.attachEventListeners(); // ผูก Event Listeners
            this.render(); // Render UI ครั้งแรก
        }

        // --- State Management ---
        
        /**
         * โครงสร้าง State เริ่มต้น
         */
        getInitialState() {
            return {
                customer_name: "",
                customer_address: "",
                customer_phone: "",
                rooms: [{
                    id: Date.now(),
                    room_name: "",
                    price_per_m_raw: "",
                    style: "",
                    sets: [],
                    decorations: [],
                    wallpapers: []
                }]
            };
        }

        /**
         * โหลด State จาก Local Storage หรือใช้ค่าเริ่มต้น
         */
        loadState() {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                try {
                    return JSON.parse(storedData);
                } catch (err) {
                    console.error("Failed to load data from storage:", err);
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
            return this.getInitialState();
        }

        /**
         * บันทึก State ปัจจุบันลง Local Storage
         */
        saveState() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        }

        /**
         * อัปเดต State และทำการ Render ใหม่ (หัวใจของ State-driven UI)
         */
        setState(updater) {
            updater(this.state);
            this.render();
            this.saveState();
        }

        // --- DOM & Event Handling ---

        /**
         * ค้นหาและเก็บ Element ที่สำคัญไว้ใน instance
         */
        cacheDOM() {
            this.dom = {
                orderForm: document.querySelector('#orderForm'),
                roomsContainer: document.querySelector('#rooms'),
                grandTotal: document.querySelector('#grandTotal'),
                setCount: document.querySelector('#setCount'),
                setCountSets: document.querySelector('#setCountSets'),
                setCountDeco: document.querySelector('#setCountDeco'),
                // ... (เพิ่ม selectors อื่นๆ ที่จำเป็น)
                customerName: document.querySelector('input[name="customer_name"]'),
                customerAddress: document.querySelector('input[name="customer_address"]'),
                customerPhone: document.querySelector('input[name="customer_phone"]'),
            };
            this.dom.orderForm.action = WEBHOOK_URL;
        }

        /**
         * ผูก Event Listener หลัก
         */
        attachEventListeners() {
            // ใช้ Event Delegation จัดการ Input/Change ทั้งฟอร์ม
            this.dom.orderForm.addEventListener('input', this.handleFormInput.bind(this));
            this.dom.orderForm.addEventListener('change', this.handleFormInput.bind(this));
            
            // จัดการ Click ทั้งหมด
            document.body.addEventListener('click', this.handleGlobalClick.bind(this));
        }

        handleFormInput(e) {
            const target = e.target;
            const { name, value } = target;

            // อัปเดตข้อมูลลูกค้า
            if (['customer_name', 'customer_address', 'customer_phone'].includes(name)) {
                this.setState(state => state[name] = value);
                return;
            }

            // อัปเดตข้อมูลใน Room, Set, Deco, Wallpaper
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
                    const item = room[itemType].find(i => i.id === itemId);
                    
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
            const btn = e.target.closest("button[data-act]");
            if (!btn || this.isLocked) return;
            e.preventDefault();

            const { act } = btn.dataset;
            const roomEl = btn.closest('[data-room]');
            const roomId = roomEl ? Number(roomEl.dataset.id) : null;
            const itemEl = btn.closest('[data-set], [data-deco-item], [data-wallpaper-item]');
            const itemId = itemEl ? Number(itemEl.dataset.id) : null;
            
            // Action Handlers
            const actions = {
                'add-room': () => this.addRoom(),
                'del-room': () => this.delRoom(roomId),
                'add-set': () => this.addSet(roomId),
                'del-set': () => this.delItem(roomId, 'sets', itemId),
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

        // --- Action Methods (Modify State) ---

        addRoom() {
            this.setState(state => {
                state.rooms.push({
                    id: Date.now(),
                    room_name: "", price_per_m_raw: "", style: "",
                    sets: [], decorations: [], wallpapers: []
                });
            });
        }
        
        delRoom(roomId) {
            this.setState(state => state.rooms = state.rooms.filter(r => r.id !== roomId));
        }
        
        addSet(roomId) {
            this.setState(state => {
                const room = state.rooms.find(r => r.id === roomId);
                room.sets.push({
                    id: Date.now(), width_m: "", height_m: "",
                    fabric_variant: "ทึบ", open_type: "", sheer_price_per_m: ""
                });
            });
        }

        addDeco(roomId) {
            this.setState(state => {
                 const room = state.rooms.find(r => r.id === roomId);
                 room.decorations.push({
                    id: Date.now(), type: "", width_m: "", height_m: "", price_sqyd: ""
                 });
            });
        }
        
        addWallpaper(roomId) {
             this.setState(state => {
                 const room = state.rooms.find(r => r.id === roomId);
                 room.wallpapers.push({
                    id: Date.now(), height_m: "", price_per_roll: "", widths: [""]
                 });
            });
        }
        
        delItem(roomId, itemType, itemId) {
            this.setState(state => {
                const room = state.rooms.find(r => r.id === roomId);
                room[itemType] = room[itemType].filter(i => i.id !== itemId);
            });
        }

        addWall(roomId, wallpaperId) {
            this.setState(state => {
                const room = state.rooms.find(r => r.id === roomId);
                const wallpaper = room.wallpapers.find(w => w.id === wallpaperId);
                wallpaper.widths.push("");
            });
        }

        delWall(roomId, wallpaperId, wallIndex) {
            this.setState(state => {
                const room = state.rooms.find(r => r.id === roomId);
                const wallpaper = room.wallpapers.find(w => w.id === wallpaperId);
                wallpaper.widths.splice(wallIndex, 1);
            });
        }


        // --- Rendering ---
        
        /**
         * ฟังก์ชันหลักในการวาด UI ทั้งหมดจาก State
         */
        render() {
            // Render Customer Info
            this.dom.customerName.value = this.state.customer_name;
            this.dom.customerAddress.value = this.state.customer_address;
            this.dom.customerPhone.value = this.state.customer_phone;
            
            // Render Rooms
            this.dom.roomsContainer.innerHTML = this.state.rooms.map((room, index) => this.renderRoom(room, index)).join('');
            
            // Recalculate and Render Summary
            this.updateSummary();
        }

        renderRoom(room, index) {
            const roomTpl = document.getElementById('roomTpl').innerHTML;
            const priceOptions = PRICING.fabric.map(p => `<option value="${p}" ${p == room.price_per_m_raw ? 'selected' : ''}>${fmt(p, 0, true)}</option>`).join('');
            const styleOptions = ['ลอน', 'ตาไก่', 'จีบ'].map(s => `<option ${s === room.style ? 'selected' : ''}>${s}</option>`).join('');

            return roomTpl
                .replace(/{{roomId}}/g, room.id)
                .replace('{{roomName}}', room.room_name)
                .replace('{{roomNamePlaceholder}}', `ห้อง ${String(index + 1).padStart(2, "0")}`)
                .replace('{{priceOptions}}', priceOptions)
                .replace('{{styleOptions}}', styleOptions)
                .replace('{{sets}}', room.sets.map(s => this.renderSet(s)).join(''))
                .replace('{{decorations}}', room.decorations.map(d => this.renderDeco(d)).join(''))
                .replace('{{wallpapers}}', room.wallpapers.map(w => this.renderWallpaper(w)).join(''));
        }
        
        renderSet(set) {
            // ... Logic to render a Set item from the 'set' object
            // This is a simplified example. In a real scenario, you'd use a templating function.
            const hasSheer = set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง";
            const sheerPriceOptions = PRICING.sheer.map(p => `<option value="${p}" ${p == set.sheer_price_per_m ? 'selected' : ''}>${fmt(p, 0, true)}</option>`).join('');

            return `<div class="set" data-set data-id="${set.id}">
                <div class="item-head">
                  <div class="item-badge">S</div>
                   <span style="flex:1;"></span>
                   <button type="button" class="btn btn-icon btn-danger" data-act="del-set" title="ลบชุด">−</button>
                </div>
                <div class="row">
                    <div><label class="required">กว้าง (ม.)</label><input class="field" name="width_m" type="number" step="0.01" min="0" value="${set.width_m}" required /></div>
                    <div><label class="required">สูง (ม.)</label><input class="field" name="height_m" type="number" step="0.01" min="0" value="${set.height_m}" required /></div>
                </div>
                <div class="row ${hasSheer ? 'three-col' : ''}">
                    <div><label>ชนิดผ้า</label><select class="field" name="fabric_variant">
                        <option ${set.fabric_variant === 'ทึบ' ? 'selected' : ''}>ทึบ</option>
                        <option ${set.fabric_variant === 'โปร่ง' ? 'selected' : ''}>โปร่ง</option>
                        <option ${set.fabric_variant === 'ทึบ&โปร่ง' ? 'selected' : ''}>ทึบ&โปร่ง</option>
                    </select></div>
                     <div ${!hasSheer ? 'class="hidden"' : ''}><label>ราคาผ้าโปร่ง</label><select class="field" name="sheer_price_per_m">${sheerPriceOptions}</select></div>
                </div>
                </div>`;
        }

        renderDeco(deco) { /* ... render logic ... */ return ``; }
        renderWallpaper(wp) { /* ... render logic ... */ return ``; }


        // --- Calculation & Summary Update ---
        
        updateSummary() {
            let grandTotal = 0;
            // ... More summary variables

            this.state.rooms.forEach(room => {
                const baseRaw = toNum(room.price_per_m_raw);
                const sPlus = stylePlus(room.style);
                
                room.sets.forEach(set => {
                    const w = clamp01(set.width_m), h = clamp01(set.height_m);
                    const hPlus = heightPlus(h);
                    let opaquePrice = 0, sheerPrice = 0;

                    if (w > 0 && h > 0) {
                        if (set.fabric_variant === "ทึบ" || set.fabric_variant === "ทึบ&โปร่ง") {
                            opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                        }
                        if (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") {
                            const sheerBase = clamp01(set.sheer_price_per_m);
                            sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                        }
                    }
                    grandTotal += opaquePrice + sheerPrice;
                });
                
                // ... calculate for decorations and wallpapers
            });

            this.dom.grandTotal.textContent = fmt(grandTotal, 0, true);
            // ... update other summary fields
        }
    }

    // --- Initialisation ---
    document.addEventListener('DOMContentLoaded', () => {
        new OrderApp();
    });

})();