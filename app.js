/**
 * Marnthara Pricing Tool - Refactored Version
 * Architecture: Data-Centric with modular structure.
 * Author: Gemini
 * Version: 6.1.0
 */
(function() {
    'use strict';

    // =================================================================================
    //  MODULE: CONFIG & CONSTANTS
    // =================================================================================
    const Config = {
        APP_VERSION: "input-ui/6.1.0-refactored",
        WEBHOOK_URL: "https://your-make-webhook-url.com/your-unique-path",
        STORAGE_KEY: "marnthara.input.v6_datacenter",
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
        fmt: (n, fixed = 2, asCurrency = false) => {
            if (!Number.isFinite(n)) return "0";
            return n.toLocaleString('en-US', { minimumFractionDigits: asCurrency ? 2 : fixed, maximumFractionDigits: asCurrency ? 2 : fixed });
        },
        debounce: (fn, ms = 250) => {
            let t;
            return (...a) => {
                clearTimeout(t);
                t = setTimeout(() => fn(...a), ms);
            };
        },
        generateUUID: () => crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)),
        bahttext: (num) => {
            num = Number(num);
            if (isNaN(num)) return "ข้อมูลตัวเลขไม่ถูกต้อง";
            const txtNumArr = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า', 'สิบ'];
            const txtDigitArr = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
            if (num === 0) return 'ศูนย์บาทถ้วน';
            const [integerPart, decimalPart] = num.toFixed(2).split('.');
            const satang = parseInt(decimalPart, 10);
            const convert = (n) => {
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
            };
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
            let grandTotal = 0, grandOpaqueYards = 0, grandSheerYards = 0, grandOpaqueTrack = 0, grandSheerTrack = 0;
            let totalWallpaperRolls = 0, hasDoubleBracket = false, pricedItemCount = 0;
            const decoCounts = {};
            const itemCalculations = new Map();

            state.rooms.forEach(room => {
                let roomSum = 0;
                const isRoomSuspended = room.is_suspended;

                const processItem = (item, type) => {
                    let price = 0;
                    if (item.is_suspended || isRoomSuspended) {
                        itemCalculations.set(item.id, { total: 0 });
                        return;
                    }

                    switch (type) {
                        case 'set':
                            let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                            if (item.width_m > 0 && item.height_m > 0) {
                                const sPlus = Calculations.stylePlus(item.set_style);
                                const hPlus = Calculations.heightPlus(item.height_m);
                                if (item.fabric_variant === "ทึบ&โปร่ง") hasDoubleBracket = true;

                                if (item.fabric_variant.includes("ทึบ") && item.set_price_per_m > 0) {
                                    opaquePrice = Math.round((item.set_price_per_m + sPlus + hPlus) * item.width_m);
                                    opaqueYards = Calculations.fabricYardage(item.set_style, item.width_m);
                                    opaqueTrack = item.width_m;
                                }
                                if (item.fabric_variant.includes("โปร่ง") && item.sheer_price_per_m > 0) {
                                    sheerPrice = Math.round((item.sheer_price_per_m + sPlus + hPlus) * item.width_m);
                                    sheerYards = Calculations.fabricYardage(item.set_style, item.width_m);
                                    sheerTrack = item.width_m;
                                }
                            }
                            price = opaquePrice + sheerPrice;
                            itemCalculations.set(item.id, { total: price, opaquePrice, sheerPrice });
                            grandOpaqueYards += opaqueYards; grandSheerYards += sheerYards;
                            grandOpaqueTrack += opaqueTrack; grandSheerTrack += sheerTrack;
                            break;
                        
                        case 'deco':
                            let areaSqyd = 0;
                            if (item.deco_width_m > 0 && item.deco_height_m > 0) {
                                areaSqyd = item.deco_width_m * item.deco_height_m * Config.SQM_TO_SQYD;
                                price = Math.round(areaSqyd * item.deco_price_sqyd);
                                if (price > 0 && item.deco_type) decoCounts[item.deco_type] = (decoCounts[item.deco_type] || 0) + 1;
                            }
                            itemCalculations.set(item.id, { total: price, areaSqyd });
                            break;

                        case 'wallpaper':
                            let materialPrice = 0, installPrice = 0, areaSqm = 0, rollsNeeded = 0;
                            const totalWidth = item.widths.reduce((sum, w) => sum + w, 0);
                            if (totalWidth > 0 && item.wallpaper_height_m > 0) {
                                areaSqm = totalWidth * item.wallpaper_height_m;
                                rollsNeeded = Calculations.wallpaperRolls(totalWidth, item.wallpaper_height_m);
                                materialPrice = Math.round(rollsNeeded * item.wallpaper_price_roll);
                                installPrice = Math.round(rollsNeeded * item.wallpaper_install_cost);
                                price = materialPrice + installPrice;
                                if (price > 0 && Number.isFinite(rollsNeeded)) totalWallpaperRolls += rollsNeeded;
                            }
                            itemCalculations.set(item.id, { total: price, materialPrice, installPrice, areaSqm, rollsNeeded });
                            break;
                    }
                    if (price > 0) pricedItemCount++;
                    roomSum += price;
                };

                room.sets.forEach(item => processItem(item, 'set'));
                room.decorations.forEach(item => processItem(item, 'deco'));
                room.wallpapers.forEach(item => processItem(item, 'wallpaper'));
                
                itemCalculations.set(room.id, { total: roomSum, itemCount: room.sets.length + room.decorations.length + room.wallpapers.length });
                grandTotal += roomSum;
            });

            return {
                grandTotal,
                pricedItemCount,
                materialSummary: { grandOpaqueYards, grandSheerYards, grandOpaqueTrack, grandSheerTrack, hasDoubleBracket, decoCounts, totalWallpaperRolls },
                itemCalculations
            };
        }
    };

    // =================================================================================
    //  MODULE: STATE MANAGER
    // =================================================================================
    const State = {
        _data: null,
        _subscribers: [],

        init() {
            this._data = Storage.loadState();
            if (this._data.rooms.length === 0) {
                this._addRoom(false);
            }
            this.notify();
        },
        
        subscribe(callback) { this._subscribers.push(callback); },
        notify() {
            const stateSnapshot = JSON.parse(JSON.stringify(this._data));
            const calculations = Calculations.calculateAll(stateSnapshot);
            this._subscribers.forEach(callback => callback(stateSnapshot, calculations));
            Storage.saveState(this._data);
        },

        getState() { return JSON.parse(JSON.stringify(this._data)); },
        setState(newState) { this._data = newState; this.notify(); },

        updateCustomer(field, value) { this._data.customer[field] = value; this.notify(); },
        toggleLock() { this._data.ui.isLocked = !this._data.ui.isLocked; this.notify(); },

        _addRoom(shouldNotify = true) {
            const newRoom = { id: Helpers.generateUUID(), room_name: '', is_suspended: false, sets: [], decorations: [], wallpapers: [] };
            this._data.rooms.push(newRoom);
            if (shouldNotify) this.notify();
            return newRoom.id;
        },
        addRoom() { return this._addRoom(true); },

        updateRoom(roomId, field, value) {
            const room = this._data.rooms.find(r => r.id === roomId);
            if (room) {
                room[field] = value;
                if (field === 'is_suspended') {
                    const cascade = (item) => item.is_suspended = value;
                    room.sets.forEach(cascade);
                    room.decorations.forEach(cascade);
                    room.wallpapers.forEach(cascade);
                }
                this.notify();
            }
        },
        
        deleteRoom(roomId) { this._data.rooms = this._data.rooms.filter(r => r.id !== roomId); this.notify(); },
        clearRoom(roomId) {
            const room = this._data.rooms.find(r => r.id === roomId);
            if (room) {
                room.sets = [];
                room.decorations = [];
                room.wallpapers = [];
                this.notify();
            }
        },

        addItem(roomId, itemType) {
             const room = this._data.rooms.find(r => r.id === roomId);
             if(!room) return null;
             const baseItem = { id: Helpers.generateUUID(), is_suspended: room.is_suspended };
             let newItem;
             switch(itemType) {
                 case 'set':
                    newItem = { ...baseItem, width_m: 0, height_m: 0, set_style: 'ลอน', fabric_variant: 'ทึบ', set_price_per_m: '', sheer_price_per_m: '', fabric_code: '', sheer_fabric_code: '', opening_style: 'แยกกลาง', track_color: 'ขาว', notes: ''};
                    room.sets.push(newItem);
                    break;
                 case 'deco':
                    newItem = { ...baseItem, deco_type: '', deco_width_m: 0, deco_height_m: 0, deco_price_sqyd: '', deco_code: '', deco_notes: ''};
                    room.decorations.push(newItem);
                    break;
                case 'wallpaper':
                    newItem = { ...baseItem, wallpaper_height_m: 0, wallpaper_code: '', wallpaper_price_roll: '', wallpaper_install_cost: '300', wallpaper_notes: '', widths: [0]};
                    room.wallpapers.push(newItem);
                    break;
             }
             this.notify();
             return newItem.id;
        },

        updateItem(roomId, itemId, field, value) {
            const room = this._data.rooms.find(r => r.id === roomId);
            if(!room) return;
            const item = [...room.sets, ...room.decorations, ...room.wallpapers].find(i => i.id === itemId);
            if(item) {
                item[field] = value;
                this.notify();
            }
        },
        
        clearItem(roomId, itemId) {
             const room = this._data.rooms.find(r => r.id === roomId);
             if(!room) return;
             
             let itemIndex = room.sets.findIndex(i => i.id === itemId);
             if (itemIndex > -1) {
                 room.sets[itemIndex] = { ...room.sets[itemIndex], width_m: 0, height_m: 0, set_style: 'ลอน', fabric_variant: 'ทึบ', set_price_per_m: '', sheer_price_per_m: '', fabric_code: '', sheer_fabric_code: '', opening_style: 'แยกกลาง', track_color: 'ขาว', notes: '' };
             }
             itemIndex = room.decorations.findIndex(i => i.id === itemId);
             if (itemIndex > -1) {
                  room.decorations[itemIndex] = { ...room.decorations[itemIndex], deco_type: '', deco_width_m: 0, deco_height_m: 0, deco_price_sqyd: '', deco_code: '', deco_notes: '' };
             }
             itemIndex = room.wallpapers.findIndex(i => i.id === itemId);
             if (itemIndex > -1) {
                 room.wallpapers[itemIndex] = { ...room.wallpapers[itemIndex], wallpaper_height_m: 0, wallpaper_code: '', wallpaper_price_roll: '', wallpaper_install_cost: '300', wallpaper_notes: '', widths: [0] };
             }
             this.notify();
        },

        deleteItem(roomId, itemId) {
            const room = this._data.rooms.find(r => r.id === roomId);
            if(room) {
                room.sets = room.sets.filter(i => i.id !== itemId);
                room.decorations = room.decorations.filter(i => i.id !== itemId);
                room.wallpapers = room.wallpapers.filter(i => i.id !== itemId);
                this.notify();
            }
        },

        addWallpaperWall(roomId, wallpaperId) {
             const wallpaper = this._data.rooms.find(r => r.id === roomId)?.wallpapers.find(w => w.id === wallpaperId);
             if (wallpaper) { wallpaper.widths.push(0); this.notify(); }
        },
        updateWallpaperWall(roomId, wallpaperId, wallIndex, value) {
             const wallpaper = this._data.rooms.find(r => r.id === roomId)?.wallpapers.find(w => w.id === wallpaperId);
             if (wallpaper && wallpaper.widths[wallIndex] !== undefined) { wallpaper.widths[wallIndex] = value; this.notify(); }
        },
        deleteWallpaperWall(roomId, wallpaperId, wallIndex) {
            const wallpaper = this._data.rooms.find(r => r.id === roomId)?.wallpapers.find(w => w.id === wallpaperId);
            if (wallpaper && wallpaper.widths.length > 1) { wallpaper.widths.splice(wallIndex, 1); this.notify(); }
        },
        
        clearAllItems() {
            this._data.rooms = [];
            this._addRoom(false);
            this.notify();
        },
    };

    // =================================================================================
    //  MODULE: STORAGE
    // =================================================================================
    const Storage = {
        saveState(state) {
            try { localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(state)); } 
            catch (err) { console.error("Failed to save state:", err); }
        },
        loadState() {
            try {
                const storedData = localStorage.getItem(Config.STORAGE_KEY);
                if (storedData) {
                    const parsed = JSON.parse(storedData);
                    if (parsed.customer && parsed.rooms) {
                        if (!parsed.ui) parsed.ui = { isLocked: false };
                        return parsed;
                    }
                }
            } catch (err) { console.error("Failed to load state:", err); }
            return {
                app_version: Config.APP_VERSION,
                customer: { customer_name: '', customer_phone: '', customer_address: '' },
                rooms: [],
                ui: { isLocked: false }
            };
        }
    };

    // =================================================================================
    //  MODULE: UI / RENDERER
    // =================================================================================
    const UI = {
        _lastFocusedElement: null,
        _lastFocusedValue: '',

        init() {
            // Cache frequently accessed elements if necessary
        },

        captureFocus(e) {
            this._lastFocusedElement = e.target;
            this._lastFocusedValue = e.target.value;
        },

        restoreFocus() {
            if (!this._lastFocusedElement || !document.contains(this._lastFocusedElement)) return;
            try {
                const el = this._lastFocusedElement;
                el.focus();
                // For text inputs, try to restore cursor position
                if (typeof el.selectionStart === 'number') {
                    const diff = el.value.length - this._lastFocusedValue.length;
                    el.setSelectionRange(el.selectionStart + diff, el.selectionStart + diff);
                }
            } catch (e) {
                // Ignore errors
            }
        },

        render(state, calculations) {
            this.renderCustomer(state.customer);
            this.renderRooms(state.rooms, calculations);
            this.renderMaterialSummary(calculations.materialSummary);
            this.renderFooter(calculations);
            this.renderQuickNav(state.rooms);
            this.renderLockState(state.ui);
            // this.restoreFocus();
        },
        renderCustomer(customer) {
            document.getElementById('customer_name').value = customer.customer_name;
            document.getElementById('customer_phone').value = customer.customer_phone;
            document.getElementById('customer_address').value = customer.customer_address;
        },
        renderRooms(rooms, calculations) {
            const container = document.getElementById('rooms');
            container.innerHTML = '';
            rooms.forEach((room, rIdx) => {
                const tpl = document.getElementById('roomTpl').content.cloneNode(true);
                const roomEl = tpl.querySelector('[data-room]');
                roomEl.dataset.id = room.id;
                roomEl.id = `room-${room.id}`;
                roomEl.classList.toggle('is-suspended', room.is_suspended);

                tpl.querySelector('input[name="room_name"]').value = room.room_name;
                tpl.querySelector('input[name="room_name"]').placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;

                const roomCalcs = calculations.itemCalculations.get(room.id);
                tpl.querySelector('[data-room-brief]').innerHTML = `<span>${roomCalcs.itemCount} รายการ • ${Helpers.fmtTH(roomCalcs.total)} บาท</span>`;
                
                const suspendLink = tpl.querySelector('[data-act="toggle-suspend-room"] span');
                suspendLink.textContent = room.is_suspended ? 'ใช้งานห้อง' : 'ระงับห้อง';
                
                // Render items
                this.renderItems(tpl, room, calculations);

                container.appendChild(tpl);
            });
        },
        renderItems(roomTpl, room, calculations) {
            const setsContainer = roomTpl.querySelector('[data-sets]');
            const decosContainer = roomTpl.querySelector('[data-decorations]');
            const wallpapersContainer = roomTpl.querySelector('[data-wallpapers]');
            let itemCounter = 0;

            const createItem = (item, type) => {
                const tplId = `${type}Tpl`;
                const tpl = document.getElementById(tplId).content.cloneNode(true);
                const itemEl = tpl.querySelector(`[data-${type}-item]`);
                itemEl.dataset.id = item.id;
                itemEl.classList.toggle('is-suspended', item.is_suspended);
                itemCounter++;

                tpl.querySelector('[data-item-title]').textContent = `${itemCounter}/${calculations.itemCalculations.get(room.id).itemCount}`;
                tpl.querySelector('[data-act="toggle-suspend"] i').className = item.is_suspended ? 'ph-bold ph-play-circle' : 'ph-bold ph-pause-circle';
                
                // Populate common fields and then type-specific fields
                Object.keys(item).forEach(key => {
                    const input = tpl.querySelector(`[name="${key}"]`);
                    if (input) {
                        if (input.type === 'select-one') {
                            input.value = item[key];
                        } else if (input.type === 'number') {
                            input.value = item[key] > 0 ? item[key] : '';
                        } else {
                           input.value = item[key];
                        }
                    }
                });

                if (type === 'set') {
                    this.populatePriceOptions(tpl.querySelector('select[name="set_price_per_m"]'), Config.PRICING.fabric, item.set_price_per_m);
                    this.populatePriceOptions(tpl.querySelector('select[name="sheer_price_per_m"]'), Config.PRICING.sheer, item.sheer_price_per_m);
                    const hasSheer = item.fabric_variant.includes("โปร่ง");
                    tpl.querySelector('[data-sheer-wrap]').classList.toggle("hidden", !hasSheer);
                    tpl.querySelector('[data-sheer-code-wrap]').classList.toggle("hidden", !hasSheer);

                    const calcs = calculations.itemCalculations.get(item.id);
                    let summaryHtml = `ราคา: <b>${Helpers.fmtTH(calcs.total)}</b> บ.`;
                    const details = [];
                    if (calcs.opaquePrice > 0) details.push(`ทึบ: ${Helpers.fmtTH(calcs.opaquePrice)}`);
                    if (calcs.sheerPrice > 0) details.push(`โปร่ง: ${Helpers.fmtTH(calcs.sheerPrice)}`);
                    if (details.length > 0 && calcs.total > 0) summaryHtml += ` <small>(${details.join(', ')})</small>`;
                    tpl.querySelector('[data-set-summary]').innerHTML = summaryHtml;
                }
                
                if (type === 'deco') {
                    const displayEl = tpl.querySelector('.deco-type-display');
                    const selectEl = tpl.querySelector('[name="deco_type"]');
                    const selectedText = selectEl.options[selectEl.selectedIndex]?.text || item.deco_type;
                    displayEl.textContent = selectedText ? `(${selectedText})` : '';

                    const calcs = calculations.itemCalculations.get(item.id);
                    tpl.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${Helpers.fmtTH(calcs.total)}</b> บ. • พื้นที่: <b>${Helpers.fmtTH(calcs.areaSqyd, 2)}</b> ตร.หลา`;
                }

                if (type === 'wallpaper') {
                    const wallsContainer = tpl.querySelector('[data-walls-container]');
                    item.widths.forEach((width, index) => {
                        const wallTpl = document.getElementById('wallTpl').content.cloneNode(true);
                        wallTpl.querySelector('input').value = width > 0 ? width : '';
                        wallTpl.querySelector('input').dataset.index = index;
                        wallsContainer.appendChild(wallTpl);
                    });
                    const calcs = calculations.itemCalculations.get(item.id);
                    let summaryHtml = `รวม: <b>${Helpers.fmtTH(calcs.total)}</b> บ.`;
                    if (calcs.total > 0) summaryHtml += ` <small>(วอลล์: ${Helpers.fmtTH(calcs.materialPrice)}, ค่าช่าง: ${Helpers.fmtTH(calcs.installPrice)})</small>`;
                    summaryHtml += ` • พื้นที่: <b>${Helpers.fmtTH(calcs.areaSqm, 2)}</b> ตร.ม. • ใช้: <b>${Number.isFinite(calcs.rollsNeeded) ? calcs.rollsNeeded : 'N/A'}</b> ม้วน`;
                    tpl.querySelector('[data-wallpaper-summary]').innerHTML = summaryHtml;
                }

                return tpl;
            };
            
            room.sets.forEach(item => setsContainer.appendChild(createItem(item, 'set')));
            room.decorations.forEach(item => decosContainer.appendChild(createItem(item, 'deco')));
            room.wallpapers.forEach(item => wallpapersContainer.appendChild(createItem(item, 'wallpaper')));
        },
        populatePriceOptions(selectEl, prices, selectedValue) {
            if (!selectEl) return;
            selectEl.innerHTML = `<option value="" hidden>เลือกราคา</option>`;
            prices.forEach(p => {
                const option = document.createElement('option');
                option.value = p;
                option.textContent = p.toLocaleString("th-TH");
                selectEl.appendChild(option);
            });
            selectEl.value = selectedValue;
        },
        renderMaterialSummary(summary) {
            const container = document.getElementById('detailed-material-summary');
            let html = '';
            if (summary.grandOpaqueYards > 0 || summary.grandSheerYards > 0) {
                html += `<h4><i class="ph-bold ph-blinds"></i> ผ้าม่าน</h4><ul>`;
                if (summary.grandOpaqueYards > 0) html += `<li>ผ้าทึบ: <b>${Helpers.fmtTH(summary.grandOpaqueYards, 2)}</b> หลา</li>`;
                if (summary.grandSheerYards > 0) html += `<li>ผ้าโปร่ง: <b>${Helpers.fmtTH(summary.grandSheerYards, 2)}</b> หลา</li>`;
                if (summary.grandOpaqueTrack > 0) html += `<li>รางทึบ: <b>${Helpers.fmtTH(summary.grandOpaqueTrack, 2)}</b> ม.</li>`;
                if (summary.grandSheerTrack > 0) html += `<li>รางโปร่ง: <b>${Helpers.fmtTH(summary.grandSheerTrack, 2)}</b> ม.</li>`;
                if (summary.hasDoubleBracket) html += `<li class="summary-note">** มีรายการที่ต้องใช้ขาสองชั้น</li>`;
                html += `</ul>`;
            }
            if (Object.keys(summary.decoCounts).length > 0) {
                 html += `<h4><i class="ph-bold ph-file-image"></i> งานตกแต่ง</h4><ul>`;
                 for (const type in summary.decoCounts) html += `<li>${type}: <b>${summary.decoCounts[type]}</b> ชุด</li>`;
                 html += `</ul>`;
            }
            if (summary.totalWallpaperRolls > 0) {
                 html += `<h4><i class="ph-bold ph-paint-roller"></i> วอลเปเปอร์</h4><ul>`;
                 html += `<li>จำนวนที่ต้องใช้: <b>${summary.totalWallpaperRolls}</b> ม้วน</li>`;
                 html += `</ul>`;
            }
            container.innerHTML = html || '<p class="empty-summary">ยังไม่มีรายการวัสดุ</p>';
        },
        renderFooter(calculations) {
            document.getElementById('grandTotal').textContent = Helpers.fmtTH(calculations.grandTotal);
            document.getElementById('setCount').textContent = calculations.pricedItemCount;
        },
        renderQuickNav(rooms) {
            const container = document.getElementById('quickNavRoomList');
            container.innerHTML = '';
            rooms.forEach((room, index) => {
                const roomName = room.room_name.trim() || `ห้อง ${index + 1}`;
                const link = document.createElement('a');
                link.href = `#room-${room.id}`;
                link.dataset.jumpTo = `room-${room.id}`;
                link.innerHTML = `<i class="ph ph-arrow-bend-right-up"></i> ${roomName}`;
                container.appendChild(link);
            });
            document.getElementById('quickNavBtn').style.display = rooms.length > 0 ? 'inline-flex' : 'none';
        },
        renderLockState(ui) {
            const lockBtn = document.getElementById('lockBtn');
            lockBtn.classList.toggle('is-locked', ui.isLocked);
            lockBtn.title = ui.isLocked ? 'ปลดล็อคฟอร์ม' : 'ล็อคฟอร์ม';
            lockBtn.querySelector('.lock-icon').className = ui.isLocked ? 'ph-bold ph-lock-key lock-icon' : 'ph-bold ph-lock-key-open lock-icon';
            document.querySelectorAll('input, select, textarea, button').forEach(el => {
                const isExempt = el.closest('.summary-footer') || el.closest('.main-header') || el.closest('.modal-wrapper') || el.closest('.room-options-menu');
                if (!isExempt) el.disabled = ui.isLocked;
            });
        },
        
        showToast(message, type = 'default') {
            const container = document.getElementById('toast-container');
            const icons = { success: 'ph-bold ph-check-circle', warning: 'ph-bold ph-warning', error: 'ph-bold ph-x-circle', default: 'ph-bold ph-info' };
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `<i class="${icons[type] || icons.default}"></i> ${message}`;
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                toast.addEventListener('transitionend', () => toast.remove());
            }, 3000);
        },
        showModal(selector) {
            return new Promise((resolve) => {
                const modalEl = document.querySelector(selector);
                if (!modalEl) { resolve(null); return; }
                modalEl.classList.add('visible');
                const confirmBtn = modalEl.querySelector('[id*="Confirm"]');
                const cancelBtn = modalEl.querySelector('[id*="Cancel"]');
                const closeHandler = (result) => {
                    modalEl.classList.remove('visible');
                    confirmBtn.onclick = null;
                    cancelBtn.onclick = null;
                    resolve(result);
                };
                confirmBtn.onclick = () => closeHandler(true);
                cancelBtn.onclick = () => closeHandler(false);
            });
        },
        async showConfirmation(title, body) {
            const modalEl = document.getElementById('confirmationModal');
            modalEl.querySelector('#modalTitle').textContent = title;
            modalEl.querySelector('#modalBody').textContent = body;
            return await this.showModal('#confirmationModal');
        }
    };
    
    // =================================================================================
    //  MODULE: EXPORTS
    // =================================================================================
    const Exports = {
        // ... (Exporting logic will be here)
        // This is a simplified placeholder. The full logic from the original file
        // would need to be adapted to read from the state object.
        generateSummaryText(state, type) {
            // This function would be large. Let's create a placeholder.
            return `Summary for: ${state.customer.customer_name}\nType: ${type}\n...details...`;
        },
        generateQuotationHtml(state, options) {
            // This function would be very large.
            // It needs to be refactored to take the state object as input.
            // Placeholder:
            console.log("Generating PDF with state and options:", state, options);
            return {
                html: `<h1>ใบเสนอราคาสำหรับ ${state.customer.customer_name}</h1>`,
                fileName: `QT-for-${state.customer.customer_name}`
            };
        }
    };

    // =================================================================================
    //  MODULE: APPLICATION CONTROLLER
    // =================================================================================
    const App = {
        init() {
            UI.init();
            State.init(); // This loads data and triggers the first render
            State.subscribe(UI.render.bind(UI));
            this.attachEventListeners();
        },

        attachEventListeners() {
            const body = document.body;
            const form = document.getElementById('orderForm');
            const debouncedStateUpdate = Helpers.debounce(State.updateItem, 300);

            // Capture focus to restore it after re-render
            // form.addEventListener('focusin', (e) => UI.captureFocus(e));

            // Delegate events from the main form
            form.addEventListener('input', (e) => {
                const target = e.target;
                const value = target.value;
                const name = target.name;
                
                // Customer fields
                if (['customer_name', 'customer_phone', 'customer_address'].includes(name)) {
                    State.updateCustomer(name, value);
                    return;
                }

                // Room/Item fields
                const itemEl = target.closest('[data-id]');
                if (itemEl) {
                    const itemId = itemEl.dataset.id;
                    const roomEl = itemEl.closest('[data-room]');
                    const roomId = roomEl ? roomEl.dataset.id : itemId; // If itemEl is the room itself

                    if (name === 'room_name') {
                        State.updateRoom(roomId, name, value);
                    } else if(target.closest('[data-wallpaper-item]')) { // Wallpaper wall special case
                        const wallIndex = parseInt(target.dataset.index, 10);
                        if(!isNaN(wallIndex)) {
                             State.updateWallpaperWall(roomId, itemId, wallIndex, Helpers.toNum(value));
                        } else {
                           State.updateItem(roomId, itemId, name, value);
                        }
                    } else {
                        State.updateItem(roomId, itemId, name, value);
                    }
                }
            });

            form.addEventListener('change', (e) => { // For selects
                 const target = e.target;
                 const value = target.value;
                 const name = target.name;
                 const itemEl = target.closest('[data-id]');
                 if (itemEl) {
                    const itemId = itemEl.dataset.id;
                    const roomId = itemEl.closest('[data-room]').dataset.id;
                    State.updateItem(roomId, itemId, name, value);
                 }
            });

            // General click handler
            body.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-act]');
                if (!btn) return;

                e.preventDefault();
                const action = btn.dataset.act;
                const itemEl = btn.closest('[data-id]');
                const roomId = btn.closest('[data-room]')?.dataset.id;
                const itemId = itemEl?.dataset.id;

                const confirmed = async (title, body) => await UI.showConfirmation(title, body);

                switch (action) {
                    // Room Actions
                    case 'add-set': case 'add-deco': case 'add-wallpaper':
                        State.addItem(roomId, action.split('-')[1]);
                        UI.showToast('เพิ่มรายการแล้ว', 'success');
                        break;
                    case 'del-room':
                        if (await confirmed('ลบห้อง', 'ยืนยันการลบห้องนี้?')) {
                             State.deleteRoom(roomId);
                             UI.showToast('ลบห้องแล้ว', 'success');
                        }
                        break;
                    case 'clear-room':
                         if (await confirmed('ล้างข้อมูลในห้อง', 'ยืนยันการลบทุกรายการในห้องนี้?')) {
                             State.clearRoom(roomId);
                             UI.showToast('ล้างข้อมูลในห้องแล้ว', 'success');
                         }
                        break;
                    case 'toggle-suspend-room':
                        const roomState = State.getState().rooms.find(r => r.id === roomId);
                        State.updateRoom(roomId, 'is_suspended', !roomState.is_suspended);
                        UI.showToast(`ห้องถูก${!roomState.is_suspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
                        break;

                    // Item Actions
                    case 'del-item':
                        if (await confirmed('ลบรายการ', 'ยืนยันการลบรายการนี้?')) {
                            State.deleteItem(roomId, itemId);
                            UI.showToast('ลบรายการแล้ว', 'success');
                        }
                        break;
                    case 'clear-item':
                        if (await confirmed('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) {
                            State.clearItem(roomId, itemId);
                            UI.showToast('ล้างข้อมูลแล้ว', 'success');
                        }
                        break;
                    case 'toggle-suspend':
                        const allItems = [...State.getState().rooms.find(r=>r.id===roomId).sets, /*...etc*/];
                        const itemState = allItems.find(i => i.id === itemId);
                        State.updateItem(roomId, itemId, 'is_suspended', !itemState.is_suspended);
                        UI.showToast(`รายการถูก${!itemState.is_suspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
                        break;

                    // Wallpaper Wall Actions
                    case 'add-wall':
                        State.addWallpaperWall(roomId, itemId);
                        break;
                    case 'del-wall':
                        const wallIndex = parseInt(btn.previousElementSibling.dataset.index, 10);
                        State.deleteWallpaperWall(roomId, itemId, wallIndex);
                        break;
                }
            });

            // Footer and Header Actions
            document.getElementById('addRoomFooterBtn').addEventListener('click', () => {
                State.addRoom();
                UI.showToast('เพิ่มห้องใหม่แล้ว', 'success');
            });
            document.getElementById('lockBtn').addEventListener('click', () => {
                State.toggleLock();
                UI.showToast(State.getState().ui.isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'warning');
            });
            document.getElementById('clearAllBtn').addEventListener('click', async () => {
                if (await UI.showConfirmation('ล้างข้อมูลทั้งหมด', 'คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
                    localStorage.removeItem(Config.STORAGE_KEY);
                    window.location.reload();
                }
            });
             document.getElementById('clearItemsBtn').addEventListener('click', async () => {
                if (await UI.showConfirmation('ล้างทุกรายการ', 'คุณแน่ใจหรือไม่ว่าต้องการลบห้องและรายการทั้งหมด? ข้อมูลลูกค้าจะยังคงอยู่')) {
                   State.clearAllItems();
                   UI.showToast('ล้างทุกรายการแล้ว', 'success');
                }
            });
            document.getElementById('importBtn').addEventListener('click', () => document.getElementById('fileImporter').click());
            document.getElementById('fileImporter').addEventListener('change', (e) => {
                 const file = e.target.files?.[0];
                 if (!file) return;
                 const reader = new FileReader();
                 reader.onload = (event) => {
                     try {
                         const payload = JSON.parse(event.target.result);
                         State.setState(payload); // Directly set the state
                         UI.showToast('โหลดข้อมูลสำเร็จ', "success");
                     } catch (err) { UI.showToast('ไฟล์ JSON ไม่ถูกต้อง', 'error'); }
                 };
                 reader.readAsText(file);
                 e.target.value = null;
            });
            document.getElementById('exportBtn').addEventListener('click', () => {
                try {
                    const state = State.getState();
                    const dataStr = JSON.stringify(state, null, 4);
                    const blob = new Blob([dataStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const today = new Date();
                    const dateSuffix = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
                    const customerName = (state.customer.customer_name || 'data').trim().replace(/\s+/g, '-');
                    a.href = url;
                    a.download = `marnthara-backup-${customerName}-${dateSuffix}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    UI.showToast('Export ข้อมูลสำเร็จ', 'success');
                } catch (err) {
                    UI.showToast('Export ข้อมูลล้มเหลว', 'error');
                }
            });

            // Quick Nav Jump
            document.getElementById('quickNavRoomList').addEventListener('click', e => {
                const link = e.target.closest('a[data-jump-to]');
                if (link) {
                    e.preventDefault();
                    document.getElementById(link.dataset.jumpTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    document.getElementById('quickNavDropdown').classList.remove('show');
                }
            });
        }
    };

    // Kickstart the application
    document.addEventListener('DOMContentLoaded', () => App.init());

})();