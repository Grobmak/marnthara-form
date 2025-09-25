(function() {
    'use strict';

    // =================================================================================
    //  MODULE: CONFIG & CONSTANTS
    //  (Configuration, constants, and static data)
    // =================================================================================

    const Config = {
        APP_VERSION: "input-ui/6.0.0-refactored",
        WEBHOOK_URL: "https://your-make-webhook-url.com/your-unique-path",
        STORAGE_KEY: "marnthara.input.v5_datacenter",
        PDF_EXPORT_DELAY_MS: 500,
        SQM_TO_SQYD: 1.19599,
        SHOP: {
            name: "ม่านธารา ผ้าม่านและของตกแต่ง",
            address: "65/8 หมู่ 2 ต.ท่าศาลา อ.เมือง จ.ลพบุรี 15000",
            phone: "092-985-9395, 082-552-5595",
            taxId: "1234567890123",
            logoUrl: "https://i.imgur.com/l7y85nI.png",
            baseVatRate: 0.07,
            pdf: {
                paymentTerms: "ชำระมัดจำ 50%",
                priceValidity: "30 วัน",
                notes: [
                    "ราคานี้รวมค่าติดตั้งแล้ว",
                    "ชำระมัดจำ 50% เพื่อยืนยันการสั่งผลิตสินค้า",
                    "ใบเสนอราคานี้มีอายุ 30 วัน นับจากวันที่เสนอราคา"
                ]
            }
        },
        PRICING: {
            fabric: [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200],
            sheer: [1000, 1100, 1200, 1300, 1400, 1500],
            style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
            height: [
                { threshold: 3.2, add_per_m: 300 },
                { threshold: 2.8, add_per_m: 200 },
                { threshold: 2.5, add_per_m: 100 }
            ],
        }
    };

    // =================================================================================
    //  MODULE: HELPERS
    //  (Utility functions used across the application)
    // =================================================================================

    const Helpers = {
        toNum: v => {
            if (typeof v === 'string') v = v.replace(/,/g, '');
            const num = parseFloat(v);
            return Number.isFinite(num) ? num : 0;
        },
        fmtTH: (n, fixed = 0) => {
            if (!Number.isFinite(n)) return "0";
            return n.toLocaleString('th-TH', { minimumFractionDigits: fixed, maximumFractionDigits: fixed });
        },
        debounce: (fn, ms = 250) => {
            let t;
            return (...a) => {
                clearTimeout(t);
                t = setTimeout(() => fn(...a), ms);
            };
        },
        generateUUID: () => {
            // Basic UUID for unique keys, crypto.randomUUID() is better if available
            return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
                (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
            );
        },
        bahttext: (num) => {
            num = Number(num);
            if (isNaN(num)) return "ข้อมูลตัวเลขไม่ถูกต้อง";
            const txtNumArr = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า', 'สิบ'];
            const txtDigitArr = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
            if (num === 0) return 'ศูนย์บาทถ้วน';
            const [integerPart, decimalPart] = num.toFixed(2).split('.');
            const satang = parseInt(decimalPart, 10);

            function convert(n) {
                if (n === null || n === undefined) return '';
                let output = '';
                const strN = String(n);
                for (let i = 0; i < strN.length; i++) {
                    const digit = parseInt(strN[i], 10);
                    if (digit !== 0) {
                        if ((strN.length - i - 1) % 6 === 0 && i !== strN.length - 1) {
                            return convert(strN.substring(0, i + 1)) + 'ล้าน' + convert(strN.substring(i + 1));
                        }
                        output += txtNumArr[digit] + txtDigitArr[strN.length - i - 1];
                    }
                }
                return output;
            }
            let bahtTxt = convert(integerPart).replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด') + 'บาท';
            if (satang > 0) {
                bahtTxt += convert(satang).replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด') + 'สตางค์';
            } else {
                bahtTxt += 'ถ้วน';
            }
            return bahtTxt;
        }
    };

    // =================================================================================
    //  MODULE: CALCULATIONS
    //  (Pure functions for business logic and pricing)
    // =================================================================================

    const Calculations = {
        stylePlus: (style) => Config.PRICING.style_surcharge[style] ?? 0,
        heightPlus: (h) => {
            const sorted = [...Config.PRICING.height].sort((a, b) => b.threshold - a.threshold);
            for (const entry of sorted) {
                if (h > entry.threshold) return entry.add_per_m;
            }
            return 0;
        },
        fabricYardage: (style, width) => {
            if (width <= 0 || !style) return 0;
            if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
            if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
            return 0;
        },
        wallpaperRolls: (totalWidth, height) => {
            if (totalWidth <= 0 || height <= 0) return 0;
            const stripsPerRoll = (height > 2.5) ? Math.floor(10 / height) : 3;
            if (stripsPerRoll <= 0) return Infinity;
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        },

        calculateAll: (state) => {
            let grandTotal = 0,
                grandOpaqueYards = 0,
                grandSheerYards = 0,
                grandOpaqueTrack = 0,
                grandSheerTrack = 0;
            let totalWallpaperRolls = 0;
            let hasDoubleBracket = false;
            const decoCounts = {};
            let pricedItemCount = 0;
            const itemCalculations = new Map();

            state.rooms.forEach(room => {
                let roomSum = 0;
                const isRoomSuspended = room.is_suspended;

                room.sets.forEach(set => {
                    let opaquePrice = 0,
                        sheerPrice = 0,
                        opaqueYards = 0,
                        sheerYards = 0,
                        opaqueTrack = 0,
                        sheerTrack = 0;
                    if (!set.is_suspended && !isRoomSuspended && set.width_m > 0 && set.height_m > 0) {
                        const sPlus = Calculations.stylePlus(set.set_style);
                        const hPlus = Calculations.heightPlus(set.height_m);
                        if (set.fabric_variant === "ทึบ&โปร่ง") hasDoubleBracket = true;

                        if (set.fabric_variant.includes("ทึบ") && set.set_price_per_m > 0) {
                            opaquePrice = Math.round((set.set_price_per_m + sPlus + hPlus) * set.width_m);
                            opaqueYards = Calculations.fabricYardage(set.set_style, set.width_m);
                            opaqueTrack = set.width_m;
                        }
                        if (set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0) {
                            sheerPrice = Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m);
                            sheerYards = Calculations.fabricYardage(set.set_style, set.width_m);
                            sheerTrack = set.width_m;
                        }
                        if (opaquePrice + sheerPrice > 0) pricedItemCount++;
                    }
                    const totalSetPrice = opaquePrice + sheerPrice;
                    itemCalculations.set(set.id, { total: totalSetPrice, opaquePrice, sheerPrice });
                    roomSum += totalSetPrice;
                    grandOpaqueYards += opaqueYards;
                    grandSheerYards += sheerYards;
                    grandOpaqueTrack += opaqueTrack;
                    grandSheerTrack += sheerTrack;
                });

                room.decorations.forEach(deco => {
                    let decoPrice = 0,
                        areaSqyd = 0;
                    if (!deco.is_suspended && !isRoomSuspended && deco.deco_width_m > 0 && deco.deco_height_m > 0) {
                        areaSqyd = deco.deco_width_m * deco.deco_height_m * Config.SQM_TO_SQYD;
                        decoPrice = Math.round(areaSqyd * deco.deco_price_sqyd);
                        if (decoPrice > 0) {
                            pricedItemCount++;
                            if (deco.deco_type) decoCounts[deco.deco_type] = (decoCounts[deco.deco_type] || 0) + 1;
                        }
                    }
                    itemCalculations.set(deco.id, { total: decoPrice, areaSqyd });
                    roomSum += decoPrice;
                });

                room.wallpapers.forEach(wp => {
                    let totalItemPrice = 0,
                        materialPrice = 0,
                        installPrice = 0,
                        areaSqm = 0,
                        rollsNeeded = 0;
                    if (!wp.is_suspended && !isRoomSuspended) {
                        const totalWidth = wp.widths.reduce((sum, w) => sum + w, 0);
                        if (totalWidth > 0 && wp.wallpaper_height_m > 0) {
                            areaSqm = totalWidth * wp.wallpaper_height_m;
                            rollsNeeded = Calculations.wallpaperRolls(totalWidth, wp.wallpaper_height_m);
                            materialPrice = Math.round(rollsNeeded * wp.wallpaper_price_roll);
                            installPrice = Math.round(rollsNeeded * wp.wallpaper_install_cost);
                            totalItemPrice = materialPrice + installPrice;
                            if (totalItemPrice > 0) {
                                pricedItemCount++;
                                if (Number.isFinite(rollsNeeded)) totalWallpaperRolls += rollsNeeded;
                            }
                        }
                    }
                    itemCalculations.set(wp.id, { total: totalItemPrice, materialPrice, installPrice, areaSqm, rollsNeeded });
                    roomSum += totalItemPrice;
                });
                itemCalculations.set(room.id, { total: roomSum });
                grandTotal += roomSum;
            });

            const materialSummary = {
                opaqueYards: grandOpaqueYards,
                sheerYards: grandSheerYards,
                opaqueTrack: grandOpaqueTrack,
                sheerTrack: grandSheerTrack,
                hasDoubleBracket: hasDoubleBracket,
                decoCounts: decoCounts,
                wallpaperRolls: totalWallpaperRolls,
            };

            return {
                grandTotal,
                pricedItemCount,
                materialSummary,
                itemCalculations
            };
        }
    };


    // =================================================================================
    //  MODULE: STATE MANAGER
    //  (Handles the application's single source of truth)
    // =================================================================================

    const State = {
        _data: {},
        _subscribers: [],

        init() {
            this._data = Storage.loadState();
            if (!this._data.rooms || this._data.rooms.length === 0) {
                this.addRoom(false); // Add one initial room if empty
            }
        },
        
        subscribe(callback) {
            this._subscribers.push(callback);
        },
        
        _notify() {
            // Create a deep copy to prevent direct mutation of the state
            const stateSnapshot = JSON.parse(JSON.stringify(this._data));
            this._subscribers.forEach(callback => callback(stateSnapshot));
        },

        getState() {
             return JSON.parse(JSON.stringify(this._data));
        },
        
        setState(newState, shouldNotify = true) {
            this._data = newState;
            Storage.saveState(this._data);
            if(shouldNotify) this._notify();
        },

        updateCustomer(field, value) {
            this._data.customer[field] = value;
            this.setState(this._data);
        },

        addRoom(shouldNotify = true) {
            const newRoom = {
                id: Helpers.generateUUID(),
                room_name: '',
                is_suspended: false,
                sets: [],
                decorations: [],
                wallpapers: []
            };
            this._data.rooms.push(newRoom);
            this.setState(this._data, shouldNotify);
            return newRoom.id;
        },
        
        updateRoom(roomId, field, value) {
            const room = this._data.rooms.find(r => r.id === roomId);
            if (room) {
                room[field] = value;
                 if (field === 'is_suspended') { // Cascade suspension
                    room.sets.forEach(i => i.is_suspended = value);
                    room.decorations.forEach(i => i.is_suspended = value);
                    room.wallpapers.forEach(i => i.is_suspended = value);
                }
                this.setState(this._data);
            }
        },
        
        deleteRoom(roomId) {
            this._data.rooms = this._data.rooms.filter(r => r.id !== roomId);
            this.setState(this._data);
        },

        clearRoom(roomId) {
            const room = this._data.rooms.find(r => r.id === roomId);
            if(room) {
                room.sets = [];
                room.decorations = [];
                room.wallpapers = [];
                this.setState(this._data);
            }
        },

        addItem(roomId, itemType) {
             const room = this._data.rooms.find(r => r.id === roomId);
             if(!room) return null;

             let newItem;
             const baseItem = { id: Helpers.generateUUID(), is_suspended: room.is_suspended };

             switch(itemType) {
                 case 'set':
                    newItem = { ...baseItem, width_m: 0, height_m: 0, set_style: 'ลอน', fabric_variant: 'ทึบ', set_price_per_m: 0, sheer_price_per_m: 0, fabric_code: '', sheer_fabric_code: '', opening_style: 'แยกกลาง', track_color: 'ขาว', notes: ''};
                    room.sets.push(newItem);
                    break;
                 case 'deco':
                    newItem = { ...baseItem, deco_type: '', deco_width_m: 0, deco_height_m: 0, deco_price_sqyd: 0, deco_code: '', deco_notes: ''};
                    room.decorations.push(newItem);
                    break;
                case 'wallpaper':
                    newItem = { ...baseItem, wallpaper_height_m: 0, wallpaper_code: '', wallpaper_price_roll: 0, wallpaper_install_cost: 300, wallpaper_notes: '', widths: [0]};
                    room.wallpapers.push(newItem);
                    break;
             }
             this.setState(this._data);
             return newItem.id;
        },

        updateItem(roomId, itemId, field, value) {
            const room = this._data.rooms.find(r => r.id === roomId);
            if(!room) return;
            const item = [...room.sets, ...room.decorations, ...room.wallpapers].find(i => i.id === itemId);
            if(item) {
                item[field] = value;
                this.setState(this._data);
            }
        },
        
        clearItem(roomId, itemId) {
             const room = this._data.rooms.find(r => r.id === roomId);
             if(!room) return;
             
             let itemIndex = room.sets.findIndex(i => i.id === itemId);
             if(itemIndex > -1) {
                 room.sets[itemIndex] = { ...room.sets[itemIndex], width_m: 0, height_m: 0, set_style: 'ลอน', fabric_variant: 'ทึบ', set_price_per_m: 0, sheer_price_per_m: 0, fabric_code: '', sheer_fabric_code: '', opening_style: 'แยกกลาง', track_color: 'ขาว', notes: '' };
                 this.setState(this._data);
                 return;
             }
             itemIndex = room.decorations.findIndex(i => i.id === itemId);
             if(itemIndex > -1) {
                  room.decorations[itemIndex] = { ...room.decorations[itemIndex], deco_type: '', deco_width_m: 0, deco_height_m: 0, deco_price_sqyd: 0, deco_code: '', deco_notes: '' };
                  this.setState(this._data);
                  return;
             }
             itemIndex = room.wallpapers.findIndex(i => i.id === itemId);
             if(itemIndex > -1) {
                 room.wallpapers[itemIndex] = { ...room.wallpapers[itemIndex], wallpaper_height_m: 0, wallpaper_code: '', wallpaper_price_roll: 0, wallpaper_install_cost: 300, wallpaper_notes: '', widths: [0] };
                 this.setState(this._data);
             }
        },

        deleteItem(roomId, itemId) {
            const room = this._data.rooms.find(r => r.id === roomId);
            if(room) {
                room.sets = room.sets.filter(i => i.id !== itemId);
                room.decorations = room.decorations.filter(i => i.id !== itemId);
                room.wallpapers = room.wallpapers.filter(i => i.id !== itemId);
                this.setState(this._data);
            }
        },

        addWallpaperWall(roomId, wallpaperId) {
             const room = this._data.rooms.find(r => r.id === roomId);
             const wallpaper = room?.wallpapers.find(w => w.id === wallpaperId);
             if (wallpaper) {
                 wallpaper.widths.push(0);
                 this.setState(this._data);
             }
        },

        updateWallpaperWall(roomId, wallpaperId, wallIndex, value) {
             const room = this._data.rooms.find(r => r.id === roomId);
             const wallpaper = room?.wallpapers.find(w => w.id === wallpaperId);
             if (wallpaper && wallpaper.widths[wallIndex] !== undefined) {
                 wallpaper.widths[wallIndex] = value;
                 this.setState(this._data);
             }
        },

        deleteWallpaperWall(roomId, wallpaperId, wallIndex) {
            const room = this._data.rooms.find(r => r.id === roomId);
            const wallpaper = room?.wallpapers.find(w => w.id === wallpaperId);
            if (wallpaper && wallpaper.widths.length > 1) { // Prevent deleting the last wall
                wallpaper.widths.splice(wallIndex, 1);
                this.setState(this._data);
            }
        },
        
        clearAllItems() {
            this._data.rooms = [];
            this.addRoom(false); // Add one fresh room
            this.setState(this._data);
        },

        toggleLock() {
            this._data.ui.isLocked = !this._data.ui.isLocked;
            this.setState(this._data);
        }
    };

    // =================================================================================
    //  MODULE: STORAGE
    //  (Handles localStorage interactions)
    // =================================================================================
    
    const Storage = {
        saveState(state) {
            try {
                localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(state));
            } catch (err) {
                console.error("Failed to save state:", err);
            }
        },
        
        loadState() {
            try {
                const storedData = localStorage.getItem(Config.STORAGE_KEY);
                if (storedData) {
                    // Basic migration/validation can be added here
                    const parsed = JSON.parse(storedData);
                    if (parsed.customer && parsed.rooms) {
                        // Ensure UI state exists
                        if (!parsed.ui) parsed.ui = { isLocked: false };
                        return parsed;
                    }
                }
            } catch (err) {
                console.error("Failed to load state:", err);
            }
            // Return a default initial state if loading fails
            return {
                app_version: Config.APP_VERSION,
                customer: {
                    customer_name: '',
                    customer_phone: '',
                    customer_address: ''
                },
                rooms: [],
                ui: { isLocked: false }
            };
        }
    };


    // =================================================================================
    //  MODULE: UI / RENDERER
    //  (Handles all DOM manipulations and rendering based on state)
    // =================================================================================
    
    const UI = {
        // ... (UI rendering logic will go here)
    };


    // =================================================================================
    //  MODULE: PDF & EXPORTS
    //  (Handles PDF generation and text summaries)
    // =================================================================================

    const Exports = {
        // ... (Exporting logic will go here)
    };


    // =================================================================================
    //  MODULE: APPLICATION
    //  (Main application controller, event listeners, and initialization)
    // =================================================================================

    const App = {
        init() {
            State.init();
            State.subscribe(this.render);
            this.attachEventListeners();
            this.render(State.getState()); // Initial render
        },

        render(state) {
            console.log("Rendering with new state...", state);
            // This is where you would call specific render functions
            // e.g., Render.customerInfo(state.customer);
            // Render.rooms(state.rooms);
            // Render.footer(state, calculations);
        },
        
        attachEventListeners() {
            const form = document.querySelector('#orderForm');
            const debouncedUpdate = Helpers.debounce((id, field, value) => {
                 // Determine what to update based on element's name
                 const [type, ...rest] = id.split('-'); // e.g., ['customer', 'name'] or ['set', 'uuid', 'width_m']
                 
                 // This is a simplified version. A real implementation would be more robust.
                 if(type === 'customer') {
                     State.updateCustomer(field, value);
                 } else if (type === 'room') {
                     const [_, roomId] = id.split('-');
                     State.updateRoom(roomId, 'room_name', value);
                 } else {
                     // Handle item updates
                 }
            }, 300);

            form.addEventListener('input', (e) => {
                const target = e.target;
                const value = target.type === 'checkbox' ? target.checked : target.value;
                const id = target.dataset.id; // We will need to add data-id attributes to our inputs
                const field = target.name;
                
                if (id && field) {
                    // Instead of direct DOM manipulation and recalc, we update the state
                    // debouncedUpdate(id, field, value);
                    // For now, let's log it
                     console.log(`State update needed: ID=${id}, Field=${field}, Value=${value}`);
                }
            });

            document.getElementById('addRoomFooterBtn').addEventListener('click', () => {
                const newRoomId = State.addRoom();
                // We don't need to manually animate/scroll here. The render function should handle it.
                // The render function can check for a "newly added" flag in the state if needed for animation.
                console.log(`Added new room with id: ${newRoomId}`);
            });
            
            // ... Add all other event listeners here
            // Each listener's job is to call a State method and nothing else.
            // Example:
            // document.getElementById('lockBtn').addEventListener('click', () => State.toggleLock());
        },
    };

    // Kickstart the application
    document.addEventListener('DOMContentLoaded', () => App.init());

})();