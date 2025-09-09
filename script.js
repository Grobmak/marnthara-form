(function() {
    'use strict';

    // --- ค่าคงที่และฟังก์ชันตัวช่วย ---
    const APP_VERSION = "input-ui/3.6.0-stable";
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
        if (typeof v === 'string') v = String(v).replace(/,/g, '');
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
            this.cacheDOM();
            this.state = this.loadState();
            this.attachEventListeners();
            this.render();
        }

        // --- State Management ---
        getInitialState() {
            return {
                customer_name: "",
                customer_address: "",
                customer_phone: "",
                rooms: [this.createRoomState()] // Start with one empty room
            };
        }

        createRoomState() {
            return {
                id: Date.now() + Math.random(),
                room_name: "", price_per_m_raw: "", style: "",
                sets: [], decorations: [], wallpapers: []
            };
        }

        loadState() {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                try {
                    const parsed = JSON.parse(storedData);
                    if (parsed.rooms && parsed.rooms.length > 0) return parsed;
                } catch (err) {
                    console.error("Failed to load data:", err);
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
            return this.getInitialState();
        }

        saveState() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        }

        setState(updater) {
            updater(this.state);
            this.render();
            this.saveState();
        }

        // --- DOM & Event Handling ---
        cacheDOM() {
            this.dom = {
                orderForm: document.getElementById('orderForm'),
                roomsContainer: document.getElementById('rooms'),
                customerName: document.querySelector('input[name="customer_name"]'),
                customerAddress: document.querySelector('input[name="customer_address"]'),
                customerPhone: document.querySelector('input[name="customer_phone"]'),
                lockBtn: document.getElementById('lockBtn'),
                // Summary elements in footer
                grandTotal: document.getElementById('grandTotal'),
                setCount: document.getElementById('setCount'),
                setCountSets: document.getElementById('setCountSets'),
                setCountDeco: document.getElementById('setCountDeco'),
                // Summary elements in popup
                grandFabric: document.getElementById('grandFabric'),
                grandSheerFabric: document.getElementById('grandSheerFabric'),
                grandOpaqueTrack: document.getElementById('grandOpaqueTrack'),
                grandSheerTrack: document.getElementById('grandSheerTrack'),
                grandWallpaper: document.getElementById('grandWallpaper'),
                // Wrappers for visibility toggle
                grandFabricWrap: document.getElementById('grandFabricWrap'),
                grandSheerFabricWrap: document.getElementById('grandSheerFabricWrap'),
                grandOpaqueTrackWrap: document.getElementById('grandOpaqueTrackWrap'),
                grandSheerTrackWrap: document.getElementById('grandSheerTrackWrap'),
                grandWallpaperWrap: document.getElementById('grandWallpaperWrap'),
            };
            this.dom.orderForm.action = WEBHOOK_URL;

            // Cache templates
            this.templates = {
                room: document.getElementById('roomTpl').innerHTML,
                set: document.getElementById('setTpl').innerHTML,
                deco: document.getElementById('decoTpl').innerHTML,
                wallpaper: document.getElementById('wallpaperTpl').innerHTML,
                wall: document.getElementById('wallTpl').innerHTML,
            };
        }

        attachEventListeners() {
            this.dom.orderForm.addEventListener('input', this.handleFormInput.bind(this));
            this.dom.orderForm.addEventListener('change', this.handleFormInput.bind(this));
            document.body.addEventListener('click', this.handleGlobalClick.bind(this));
        }
        
        handleFormInput(e) {
            const target = e.target;
            const { name, value } = target;

            if (this.isLocked) return;

            if (['customer_name', 'customer_address', 'customer_phone'].includes(name)) {
                this.setState(state => { state[name] = value; });
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
                'toggle-suspend': () => this.toggleSuspend(roomId, itemEl.dataset, itemId),
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
        toggleLock() { this.isLocked = !this.isLocked; this.render(); }
        addRoom() { this.setState(state => { state.rooms.push(this.createRoomState()); }); }
        delRoom(roomId) { this.setState(state => { state.rooms = state.rooms.filter(r => r.id !== roomId); }); }
        addSet(roomId) { this.setState(state => roomById(state, roomId)?.sets.push({ id: Date.now() + Math.random(), width_m: "", height_m: "", fabric_variant: "ทึบ", open_type: "", sheer_price_per_m: "", is_suspended: false })); }
        addDeco(roomId) { this.setState(state => roomById(state, roomId)?.decorations.push({ id: Date.now() + Math.random(), type: "", width_m: "", height_m: "", price_sqyd: "", is_suspended: false })); }
        addWallpaper(roomId) { this.setState(state => roomById(state, roomId)?.wallpapers.push({ id: Date.now() + Math.random(), height_m: "", price_per_roll: "", widths: [""], is_suspended: false })); }
        delItem(roomId, itemType, itemId) { this.setState(state => { const room = roomById(state, roomId); if (room) room[itemType] = room[itemType].filter(i => i.id !== itemId); }); }
        toggleSuspend(roomId, itemDataset, itemId) {
            const itemType = itemDataset.set ? 'sets' : itemDataset.decoItem ? 'decorations' : 'wallpapers';
            this.setState(state => { const item = itemById(state, roomId, itemType, itemId); if(item) item.is_suspended = !item.is_suspended; });
        }
        addWall(roomId, wpId) { this.setState(state => itemById(state, roomId, 'wallpapers', wpId)?.widths.push("")); }
        delWall(roomId, wpId, wallIndex) { this.setState(state => itemById(state, roomId, 'wallpapers', wpId)?.widths.splice(wallIndex, 1)); }

        // --- Rendering ---
        render() {
            this.dom.customerName.value = this.state.customer_name;
            this.dom.customerAddress.value = this.state.customer_address;
            this.dom.customerPhone.value = this.state.customer_phone;
            
            this.dom.roomsContainer.innerHTML = this.state.rooms.map((room, index) => this.renderRoom(room, index)).join('');
            
            this.updateSummary();
            this.updateLockStateUI();
        }

        renderRoom(room, index) {
            const priceOpts = PRICING.fabric.map(p => `<option value="${p}" ${p == room.price_per_m_raw ? 'selected' : ''}>${fmt(p, 0, true)}</option>`).join('');
            const styleOpts = ['ลอน', 'ตาไก่', 'จีบ'].map(s => `<option ${s === room.style ? 'selected' : ''}>${s}</option>`).join('');

            return this.templates.room
                .replace(/{{roomId}}/g, room.id)
                .replace('{{roomName}}', room.room_name)
                .replace('{{roomNamePlaceholder}}', `ห้อง ${String(index + 1).padStart(2, "0")}`)
                .replace('{{priceOptions}}', priceOpts)
                .replace('{{styleOptions}}', styleOpts)
                .replace('{{sets}}', (room.sets || []).map(this.renderSet.bind(this)).join(''))
                .replace('{{decorations}}', (room.decorations || []).map(this.renderDeco.bind(this)).join(''))
                .replace('{{wallpapers}}', (room.wallpapers || []).map(this.renderWallpaper.bind(this)).join(''));
        }

        renderSet(set, index) {
            const sheerPriceOpts = PRICING.sheer.map(p => `<option value="${p}" ${p == set.sheer_price_per_m ? 'selected' : ''}>${fmt(p, 0, true)}</option>`).join('');
            const hasSheer = set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง";
            return this.templates.set.replace(/{{id}}/g, set.id)
                .replace('{{index}}', index + 1)
                .replace('{{width_m}}', set.width_m)
                .replace('{{height_m}}', set.height_m)
                .replace('{{openTypeOptions}}', ['แยกกลาง', 'สไลด์เดี่ยว'].map(o => `<option value="${o}" ${o === set.open_type ? 'selected' : ''}>${o}</option>`).join(''))
                .replace('{{fabricVariantOptions}}', ['ทึบ', 'โปร่ง', 'ทึบ&โปร่ง'].map(v => `<option value="${v}" ${v === set.fabric_variant ? 'selected' : ''}>${v}</option>`).join(''))
                .replace('{{sheerPriceOptions}}', sheerPriceOpts)
                .replace('{{sheerWrapClass}}', hasSheer ? '' : 'hidden')
                .replace('{{optionsRowClass}}', hasSheer ? 'three-col' : '')
                .replace('{{isSuspendedClass}}', set.is_suspended ? 'is-suspended' : '')
                .replace('{{suspendText}}', set.is_suspended ? 'ใช้งาน' : 'ระงับ');
        }

        renderDeco(deco, index) {
            return this.templates.deco.replace(/{{id}}/g, deco.id)
                .replace('{{index}}', index + 1)
                .replace('{{decoTypeOptions}}', ['มู่ลี่ไม้', 'ม่านม้วน', 'ปรับแสง', 'ฉากPVC'].map(t => `<option value="${t}" ${t === deco.type ? 'selected' : ''}>${t}</option>`).join(''))
                .replace('{{width_m}}', deco.width_m)
                .replace('{{height_m}}', deco.height_m)
                .replace('{{price_sqyd}}', deco.price_sqyd)
                .replace('{{isSuspendedClass}}', deco.is_suspended ? 'is-suspended' : '')
                .replace('{{suspendText}}', deco.is_suspended ? 'ใช้งาน' : 'ระงับ');
        }
        
        renderWallpaper(wp, index) {
            const wallsHtml = (wp.widths || []).map((w, i) => this.renderWall(w, i)).join('');
            return this.templates.wallpaper.replace(/{{id}}/g, wp.id)
                .replace('{{index}}', index + 1)
                .replace('{{height_m}}', wp.height_m)
                .replace('{{price_roll}}', wp.price_per_roll)
                .replace('{{walls}}', wallsHtml)
                .replace('{{isSuspendedClass}}', wp.is_suspended ? 'is-suspended' : '')
                .replace('{{suspendText}}', wp.is_suspended ? 'ใช้งาน' : 'ระงับ');
        }
        
        renderWall(width, index) {
            return this.templates.wall
                .replace('{{index}}', index)
                .replace('{{width_m}}', width);
        }

        updateSummary() {
            let grand = { total: 0, opaqueYards: 0, sheerYards: 0, opaqueTrack: 0, sheerTrack: 0, wallpaperRolls: 0, points: 0, sets: 0, deco: 0 };
            
            this.state.rooms.forEach(room => {
                const baseRaw = toNum(room.price_per_m_raw);
                const style = room.style;
                const sPlus = stylePlus(style);

                (room.sets || []).forEach(set => {
                    if (set.is_suspended) return;
                    grand.points++;
                    const w = clamp01(set.width_m), h = clamp01(set.height_m);
                    const hPlus = heightPlus(h);
                    let opaquePrice = 0, sheerPrice = 0;
                    if (w > 0 && h > 0) {
                        if (set.fabric_variant === "ทึบ" || set.fabric_variant === "ทึบ&โปร่ง") {
                            opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                            grand.opaqueYards += CALC.fabricYardage(style, w);
                            grand.opaqueTrack += w;
                            grand.sets++;
                        }
                        if (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") {
                            const sheerBase = clamp01(set.sheer_price_per_m);
                            sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                            grand.sheerYards += CALC.fabricYardage(style, w);
                            grand.sheerTrack += w;
                            if (set.fabric_variant === "โปร่ง") grand.sets++;
                        }
                    }
                    grand.total += opaquePrice + sheerPrice;
                });
                // ... calculations for deco and wallpaper
            });

            this.dom.grandTotal.textContent = fmt(grand.total, 0, true);
            this.dom.setCount.textContent = fmt(grand.points, 0);
            this.dom.setCountSets.textContent = fmt(grand.sets, 0);
            this.dom.setCountDeco.textContent = fmt(grand.deco, 0);
            
            this.dom.grandFabric.textContent = `${fmt(grand.opaqueYards, 2)} หลา`;
            this.dom.grandSheerFabric.textContent = `${fmt(grand.sheerYards, 2)} หลา`;
            this.dom.grandOpaqueTrack.textContent = `${fmt(grand.opaqueTrack, 2)} ม.`;
            this.dom.grandSheerTrack.textContent = `${fmt(grand.sheerTrack, 2)} ม.`;
            this.dom.grandWallpaper.textContent = `${fmt(grand.wallpaperRolls, 0)} ม้วน`;

            this.dom.grandFabricWrap.classList.toggle("hidden", grand.opaqueYards === 0);
            this.dom.grandSheerFabricWrap.classList.toggle("hidden", grand.sheerYards === 0);
            this.dom.grandOpaqueTrackWrap.classList.toggle("hidden", grand.opaqueTrack === 0);
            this.dom.grandSheerTrackWrap.classList.toggle("hidden", grand.sheerTrack === 0);
            this.dom.grandWallpaperWrap.classList.toggle("hidden", grand.wallpaperRolls === 0);
        }

        updateLockStateUI() {
            const isFormLocked = this.isLocked;
            document.querySelectorAll('input, select, button').forEach(el => {
                if (el.id === 'lockBtn' || el.closest('#lockBtn')) return;
                el.disabled = isFormLocked;
            });
            this.dom.lockBtn.querySelector('.lock-text').textContent = isFormLocked ? 'ปลดล็อค' : 'ล็อก';
            this.dom.lockBtn.querySelector('.lock-icon').textContent = isFormLocked ? '🔓' : '🔒';
            this.dom.lockBtn.classList.toggle('btn-primary', !isFormLocked);
            this.dom.lockBtn.classList.toggle('btn-danger', isFormLocked);
        }
    }

    // --- Helper functions for state access ---
    const roomById = (state, roomId) => state.rooms.find(r => r.id === roomId);
    const itemById = (state, roomId, itemType, itemId) => roomById(state, roomId)?.[itemType]?.find(i => i.id === itemId);

    // --- INITIALIZATION ---
    // This listener ensures the script runs only after the entire page is loaded.
    document.addEventListener('DOMContentLoaded', () => {
        new OrderApp();
    });

})();