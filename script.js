(function() {
    'use strict';

    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/3.4.0-liquid";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };

    // --- DOM SELECTORS ---
    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms',
        roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        addRoomHeaderBtn: '#addRoomHeaderBtn', clearAllBtn: '#clearAllBtn', lockBtn: '#lockBtn',
        copyJsonBtn: '#copyJsonBtn', copyTextBtn: '#copyTextBtn', submitBtn: '#submitBtn', showSummaryBtn: '#showSummaryBtn',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn',
        grandTotal: '#grandTotal', setCount: '#setCount', setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        summaryModal: '#summaryModal',
        copyOptionsModal: '#copyOptionsModal',
        importModal: '#importModal',
        toastContainer: '#toast-container',
    };

    // --- UTILITY FUNCTIONS ---
    const toNum = v => Number.isFinite(parseFloat(String(v).replace(/,/g, ''))) ? parseFloat(String(v).replace(/,/g, '')) : 0;
    const clamp01 = v => Math.max(0, toNum(v));
    const fmt = (n, fixed = 2) => Number.isFinite(n) ? n.toLocaleString("th-TH", { minimumFractionDigits: fixed, maximumFractionDigits: fixed }) : "0.00";
    const fmtCurrency = n => Number.isFinite(n) ? n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "0";
    const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    // --- STATE & CORE LOGIC ---
    const App = {
        isLocked: false,
        roomCount: 0,
        currentCalculations: {},

        init() {
            this.loadData();
            this.bindEvents();
            this.updateUI();
        },

        bindEvents() {
            const form = document.querySelector(SELECTORS.orderForm);
            form.addEventListener("input", debounce(() => this.recalculateAndSave()));
            form.addEventListener("change", () => this.recalculateAndSave());
            form.addEventListener("click", this.handleFormClick.bind(this));
            
            document.querySelector('#customerInfo').addEventListener("input", debounce(() => this.recalculateAndSave()));
            document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => this.addRoom());
            document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', () => this.clearAllData());
            document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => this.toggleLock());
            document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => this.copyJson());
            document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', () => this.copyText());
            document.querySelector(SELECTORS.showSummaryBtn).addEventListener('click', () => UI.showSummaryModal(this.currentCalculations));
            
            // Menu events
            document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => UI.toggleMenu(true));
            document.querySelector(SELECTORS.importBtn).addEventListener('click', () => this.importData());
            document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => this.exportData());
            window.addEventListener('click', (e) => {
                if (!e.target.closest('.menu-container')) UI.toggleMenu(false);
            });
            
            form.addEventListener("submit", (e) => {
                const payload = this.buildPayload();
                form.querySelector('#payload').value = JSON.stringify(payload);
                UI.showToast("ส่งข้อมูลแล้ว...", "success");
            });
        },
        
        recalculateAndSave() {
            const payload = this.buildPayload();
            this.currentCalculations = Calculator.calculateAll(payload);
            this.updateUI();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        },

        updateUI() {
            UI.renderAll(this.currentCalculations);
            UI.updateLockState(this.isLocked);
            UI.renumber();
        },

        // --- Data Handling ---
        buildPayload() { /* ... function to read all inputs from DOM and build a data object ... */ 
            const payload = {
                app_version: APP_VERSION,
                customer_name: document.querySelector('input[name="customer_name"]')?.value || '',
                customer_phone: document.querySelector('input[name="customer_phone"]')?.value || '',
                customer_address: document.querySelector('input[name="customer_address"]')?.value || '',
                rooms: []
            };
            document.querySelectorAll('[data-room]').forEach(roomEl => {
                const roomData = {
                    room_name: roomEl.querySelector('input[name="room_name"]')?.value || '',
                    price_per_m_raw: toNum(roomEl.querySelector('select[name="room_price_per_m"]')?.value),
                    style: roomEl.querySelector('select[name="room_style"]')?.value || '',
                    sets: [], decorations: [], wallpapers: []
                };
                roomEl.querySelectorAll('[data-set]').forEach(setEl => roomData.sets.push({
                    width_m: toNum(setEl.querySelector('[name="width_m"]')?.value), height_m: toNum(setEl.querySelector('[name="height_m"]')?.value),
                    fabric_variant: setEl.querySelector('[name="fabric_variant"]')?.value || '',
                    sheer_price_per_m: toNum(setEl.querySelector('[name="sheer_price_per_m"]')?.value),
                    is_suspended: setEl.dataset.suspended === 'true',
                }));
                roomEl.querySelectorAll('[data-deco-item]').forEach(decoEl => roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value || '', width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value), price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                    is_suspended: decoEl.dataset.suspended === 'true',
                }));
                roomEl.querySelectorAll('[data-wallpaper-item]').forEach(wpEl => roomData.wallpapers.push({
                    height_m: toNum(wpEl.querySelector('[name="wallpaper_height_m"]')?.value), price_per_roll: toNum(wpEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    widths: Array.from(wpEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)),
                    is_suspended: wpEl.dataset.suspended === 'true',
                }));
                payload.rooms.push(roomData);
            });
            return payload;
        },

        loadPayload(payload) {
            if (!payload || !payload.rooms) return UI.showToast("ข้อมูลไม่ถูกต้อง", "error");

            document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
            document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
            document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
            
            const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
            roomsContainer.innerHTML = "";
            this.roomCount = 0;
            if (payload.rooms.length > 0) payload.rooms.forEach(room => this.addRoom(room, false));
            else this.addRoom(null, false);

            this.recalculateAndSave();
            UI.showToast("โหลดข้อมูลสำเร็จ", "success");
        },

        loadData() {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                try { this.loadPayload(JSON.parse(storedData)); } 
                catch(err) {
                    console.error("Failed to load stored data:", err);
                    localStorage.removeItem(STORAGE_KEY); 
                    this.addRoom(null, false);
                }
            } else { this.addRoom(null, false); }
        },
        
        saveData() {
            const payload = this.buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        },
        
        async importData() {
            UI.toggleMenu(false);
            const json = await UI.showImportModal();
            if(json) {
                try {
                    const payload = JSON.parse(json);
                    this.loadPayload(payload);
                } catch (e) {
                    UI.showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
                }
            }
        },

        exportData() {
            UI.toggleMenu(false);
            const payload = this.buildPayload();
            const jsonString = JSON.stringify(payload, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const date = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `marnthara-quote-${payload.customer_name || 'customer'}-${date}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            UI.showToast('Export ข้อมูลสำเร็จ', 'success');
        },


        // --- Actions ---
        handleFormClick(e) {
            const btn = e.target.closest('button[data-act]');
            if (!btn || (this.isLocked && !btn.closest('.room-head'))) return;

            const action = btn.dataset.act;
            const roomEl = btn.closest('[data-room]');
            const itemEl = btn.closest('[data-set], [data-deco-item], [data-wallpaper-item]');

            const actions = {
                'add-set': () => this.addSet(roomEl),
                'add-deco': () => this.addDeco(roomEl),
                'add-wallpaper': () => this.addWallpaper(roomEl),
                'add-wall': () => this.addWall(btn),
                'del-room': () => this.delRoom(btn),
                'del-set': () => this.delItem(itemEl, 'จุดผ้าม่าน'),
                'del-deco': () => this.delItem(itemEl, 'รายการตกแต่ง'),
                'del-wallpaper': () => this.delItem(itemEl, 'รายการวอลเปเปอร์'),
                'del-wall': () => { btn.closest('.wall-input-row').remove(); this.recalculateAndSave(); },
                'clear-set': () => this.clearItem(itemEl, 'จุดนี้', 'input, select', { fabric_variant: 'ทึบ' }),
                'clear-deco': () => this.clearItem(itemEl, 'รายการนี้', 'input, select'),
                'clear-wallpaper': () => {
                    if (this.clearItem(itemEl, 'รายการนี้', 'input')) {
                        const wallsContainer = itemEl.querySelector('[data-walls-container]');
                        wallsContainer.innerHTML = '';
                        this.addWall(itemEl.querySelector('[data-act="add-wall"]'));
                    }
                },
                'toggle-suspend': () => {
                    const isSuspended = !(itemEl.dataset.suspended === 'true');
                    itemEl.dataset.suspended = isSuspended;
                    this.recalculateAndSave();
                    UI.showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
                },
            };
            
            if (actions[action]) actions[action]();
        },
        
        addRoom(prefill = null, showMsg = true) {
            if (this.isLocked) return;
            this.roomCount++;
            const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
            const room = frag.querySelector('[data-room]');
            room.dataset.index = this.roomCount;
            UI.populatePriceOptions(room.querySelector('select[name="room_price_per_m"]'), PRICING.fabric);
            document.querySelector(SELECTORS.roomsContainer).appendChild(frag);
            const created = document.querySelector(`${'[data-room]'}:last-of-type`);

            if (prefill) {
                created.querySelector('input[name="room_name"]').value = prefill.room_name || "";
                created.querySelector('select[name="room_price_per_m"]').value = prefill.price_per_m_raw || "";
                created.querySelector('select[name="room_style"]').value = prefill.style || "";
                (prefill.sets || []).forEach(s => this.addSet(created, s, false));
                (prefill.decorations || []).forEach(d => this.addDeco(created, d, false));
                (prefill.wallpapers || []).forEach(w => this.addWallpaper(created, w, false));
            }
            if (created.querySelectorAll('[data-set], [data-deco-item], [data-wallpaper-item]').length === 0) {
                this.addSet(created, null, false);
            }
            this.recalculateAndSave();
            if (showMsg) {
                 created.scrollIntoView({ behavior: 'smooth', block: 'end' });
                 UI.showToast('เพิ่มห้องใหม่แล้ว', 'success');
            }
        },

        addSet(roomEl, prefill = null, showMsg = true) {
            const set = UI.addItem(roomEl, '[data-sets]', SELECTORS.setTpl, '[data-set]', showMsg ? 'เพิ่มจุดผ้าม่านแล้ว' : '');
            if (set) {
                UI.populatePriceOptions(set.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);
                if (prefill) {
                    set.querySelector('input[name="width_m"]').value = prefill.width_m ?? "";
                    set.querySelector('input[name="height_m"]').value = prefill.height_m ?? "";
                    set.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
                    set.querySelector('select[name="sheer_price_per_m"]').value = prefill.sheer_price_per_m || "";
                    if (prefill.is_suspended) set.dataset.suspended = 'true';
                }
                this.recalculateAndSave();
            }
        },

        addDeco(roomEl, prefill = null, showMsg = true) {
            const deco = UI.addItem(roomEl, '[data-decorations]', SELECTORS.decoTpl, '[data-deco-item]', showMsg ? 'เพิ่มรายการตกแต่งแล้ว' : '');
            if (deco && prefill) {
                deco.querySelector('[name="deco_type"]').value = prefill.type || "";
                deco.querySelector('[name="deco_width_m"]').value = prefill.width_m ?? "";
                deco.querySelector('[name="deco_height_m"]').value = prefill.height_m ?? "";
                deco.querySelector('[name="deco_price_sqyd"]').value = fmtCurrency(prefill.price_sqyd) ?? "";
                if (prefill.is_suspended) deco.dataset.suspended = 'true';
                this.recalculateAndSave();
            }
        },

        addWallpaper(roomEl, prefill = null, showMsg = true) {
            const wallpaper = UI.addItem(roomEl, '[data-wallpapers]', SELECTORS.wallpaperTpl, '[data-wallpaper-item]', showMsg ? 'เพิ่มวอลเปเปอร์แล้ว' : '');
            if (wallpaper) {
                if (prefill) {
                    wallpaper.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m ?? "";
                    wallpaper.querySelector('[name="wallpaper_price_roll"]').value = fmtCurrency(prefill.price_per_roll) ?? "";
                    (prefill.widths || []).forEach(w => this.addWall(wallpaper.querySelector('[data-act="add-wall"]'), w));
                    if (prefill.is_suspended) wallpaper.dataset.suspended = 'true';
                } else {
                    this.addWall(wallpaper.querySelector('[data-act="add-wall"]'));
                }
                this.recalculateAndSave();
            }
        },
        
        addWall(btn, prefillWidth = null) {
            const wallsContainer = btn.closest('[data-wallpaper-item]')?.querySelector('[data-walls-container]');
            if (!wallsContainer) return;
            const frag = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
            if (prefillWidth) frag.querySelector('input[name="wall_width_m"]').value = prefillWidth;
            wallsContainer.appendChild(frag);
        },

        async delRoom(btn) {
            if (await UI.showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้ทั้งหมด?')) {
                btn.closest('[data-room]').remove();
                this.recalculateAndSave();
                UI.showToast('ลบห้องแล้ว', 'success');
            }
        },

        async delItem(itemEl, name) {
            if (await UI.showConfirmation(`ลบ${name}`, `ยืนยันการลบ${name}นี้?`)) {
                itemEl.remove();
                this.recalculateAndSave();
                UI.showToast(`ลบ${name}แล้ว`, 'success');
            }
        },
        
        async clearItem(itemEl, name, selector, defaults = {}) {
            if (await UI.showConfirmation('ล้างข้อมูล', `ยืนยันการล้างข้อมูลใน${name}?`)) {
                itemEl.querySelectorAll(selector).forEach(el => {
                    el.value = defaults[el.name] !== undefined ? defaults[el.name] : '';
                });
                this.recalculateAndSave();
                UI.showToast('ล้างข้อมูลแล้ว', 'success');
                return true;
            }
            return false;
        },

        async clearAllData() {
            if (this.isLocked) return;
            if (await UI.showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมดและไม่สามารถกู้คืนได้')) {
                document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
                this.roomCount = 0;
                document.querySelectorAll('#customerInfo input').forEach(i => i.value = "");
                this.addRoom(null, false);
                this.recalculateAndSave();
                UI.showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
            }
        },

        toggleLock() {
            this.isLocked = !this.isLocked;
            document.querySelectorAll('input, select, button').forEach(el => {
                const isExempt = el.id === 'menuBtn' || el.id === 'clearAllBtn' || el.id === 'lockBtn' || el.id === 'copyJsonBtn' || el.id === 'copyTextBtn' || el.id === 'showSummaryBtn' || el.closest('.modal') || el.closest('.menu-dropdown');
                if (!isExempt) el.disabled = this.isLocked;
            });
            UI.updateLockState(this.isLocked);
            UI.showToast(this.isLocked ? 'ฟอร์มถูกล็อค' : 'ฟอร์มถูกปลดล็อค', 'warning');
        },

        copyJson() {
            const payload = this.buildPayload();
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                .then(() => UI.showToast('คัดลอก JSON แล้ว', 'success'))
                .catch(err => UI.showToast('คัดลอกล้มเหลว', 'error'));
        },

        async copyText() {
            const options = await UI.showCopyOptionsModal();
            if (!options) return;
            const text = UI.buildTextSummary(this.buildPayload(), this.currentCalculations, options);
            navigator.clipboard.writeText(text)
                .then(() => UI.showToast('คัดลอกข้อความสำเร็จ', 'success'))
                .catch(err => UI.showToast('คัดลอกล้มเหลว', 'error'));
        },
    };

    // --- PURE CALCULATION LOGIC ---
    const Calculator = {
        stylePlus: s => PRICING.style_surcharge[s] ?? 0,
        heightPlus: h => {
            const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
            for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
            return 0;
        },
        fabricYardage: (style, width) => {
            if (width <= 0) return 0;
            if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
            if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
            return 0;
        },
        wallpaperRolls: (totalWidth, height) => {
            if (totalWidth <= 0 || height <= 0) return 0;
            const stripsPerRoll = Math.floor(10 / height);
            if (stripsPerRoll === 0) return Infinity;
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        },

        calculateAll(payload) {
            const results = {
                rooms: [],
                grandTotal: 0,
                grandOpaqueYards: 0, grandSheerYards: 0,
                grandOpaqueTrack: 0, grandSheerTrack: 0,
                totalSets: 0, totalDeco: 0,
            };

            payload.rooms.forEach(room => {
                const roomResult = { total: 0, items: 0, sets: [], decorations: [], wallpapers: [] };
                const sPlus = this.stylePlus(room.style);

                room.sets.forEach(set => {
                    if (set.is_suspended) return;
                    const w = set.width_m, h = set.height_m;
                    const hPlus = this.heightPlus(h);
                    let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0;
                    
                    if (w > 0 && h > 0) {
                        if (set.fabric_variant === "ทึบ" || set.fabric_variant === "ทึบ&โปร่ง") {
                            opaquePrice = Math.round((room.price_per_m_raw + sPlus + hPlus) * w);
                            opaqueYards = this.fabricYardage(room.style, w);
                        }
                        if (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") {
                            sheerPrice = Math.round((set.sheer_price_per_m + sPlus + hPlus) * w);
                            sheerYards = this.fabricYardage(room.style, w);
                        }
                    }
                    const total = opaquePrice + sheerPrice;
                    roomResult.sets.push({ total, opaquePrice, sheerPrice });
                    roomResult.total += total;
                    results.grandOpaqueYards += opaqueYards;
                    results.grandSheerYards += sheerYards;
                    if(opaqueYards > 0) results.grandOpaqueTrack += w;
                    if(sheerYards > 0) results.grandSheerTrack += w;
                    results.totalSets++;
                });
                
                room.decorations.forEach(deco => {
                    if(deco.is_suspended) return;
                    const areaSqyd = deco.width_m * deco.height_m * SQM_TO_SQYD;
                    const total = Math.round(areaSqyd * deco.price_sqyd);
                    roomResult.decorations.push({ total, areaSqyd });
                    roomResult.total += total;
                    results.totalDeco++;
                });

                room.wallpapers.forEach(wp => {
                    if(wp.is_suspended) return;
                    const totalWidth = wp.widths.reduce((sum, w) => sum + w, 0);
                    const rollsNeeded = this.wallpaperRolls(totalWidth, wp.height_m);
                    const total = Math.round(rollsNeeded * wp.price_per_roll);
                    const areaSqm = totalWidth * wp.height_m;
                    roomResult.wallpapers.push({ total, areaSqm, rollsNeeded });
                    roomResult.total += total;
                    results.totalDeco++;
                });

                roomResult.items = room.sets.length + room.decorations.length + room.wallpapers.length;
                results.rooms.push(roomResult);
                results.grandTotal += roomResult.total;
            });

            return results;
        }
    };

    // --- UI RENDERING & INTERACTIONS ---
    const UI = {
        renderAll(calc) {
            if (!calc.rooms) return;
            document.querySelectorAll('[data-room]').forEach((roomEl, rIdx) => {
                const roomCalc = calc.rooms[rIdx];
                if (!roomCalc) return;
                roomEl.querySelector('.room-brief').innerHTML = `<span class="num">${roomCalc.items}</span> จุด • <span class="price">${fmtCurrency(roomCalc.total)}</span> บาท`;
                roomEl.classList.toggle('is-suspended', roomEl.dataset.suspended === 'true');

                // Render sets
                roomEl.querySelectorAll('[data-set]').forEach((setEl, sIdx) => {
                    const setCalc = roomCalc.sets.find((_, i) => i === sIdx); // Simple mapping
                    this.toggleSetFabricUI(setEl);
                    setEl.classList.toggle('is-suspended', setEl.dataset.suspended === 'true');
                    setEl.querySelector('[data-suspend-text]').textContent = setEl.dataset.suspended === 'true' ? 'ใช้งาน' : 'ระงับ';
                    if (!setCalc || setEl.dataset.suspended === 'true') {
                        setEl.querySelector('[data-set-price-total]').textContent = '0';
                        setEl.querySelector('[data-set-price-opaque]').textContent = '0';
                        setEl.querySelector('[data-set-price-sheer]').textContent = '0';
                    } else {
                        setEl.querySelector('[data-set-price-total]').textContent = fmtCurrency(setCalc.total);
                        setEl.querySelector('[data-set-price-opaque]').textContent = fmtCurrency(setCalc.opaquePrice);
                        setEl.querySelector('[data-set-price-sheer]').textContent = fmtCurrency(setCalc.sheerPrice);
                    }
                });
                
                // Render decos
                roomEl.querySelectorAll('[data-deco-item]').forEach((decoEl, dIdx) => {
                    const decoCalc = roomCalc.decorations.find((_, i) => i === dIdx);
                    decoEl.classList.toggle('is-suspended', decoEl.dataset.suspended === 'true');
                    decoEl.querySelector('[data-suspend-text]').textContent = decoEl.dataset.suspended === 'true' ? 'ใช้งาน' : 'ระงับ';
                    const summaryEl = decoEl.querySelector('[data-deco-summary]');
                    if (!decoCalc || decoEl.dataset.suspended === 'true') {
                         summaryEl.innerHTML = `ราคา: <b class="price">0</b> • พื้นที่: <b class="price">0.00</b> ตร.หลา`;
                    } else {
                        summaryEl.innerHTML = `ราคา: <b class="price">${fmtCurrency(decoCalc.total)}</b> • พื้นที่: <b class="price">${fmt(decoCalc.areaSqyd)}</b> ตร.หลา`;
                    }
                });

                // Render wallpapers
                roomEl.querySelectorAll('[data-wallpaper-item]').forEach((wpEl, wIdx) => {
                    const wpCalc = roomCalc.wallpapers.find((_, i) => i === wIdx);
                    wpEl.classList.toggle('is-suspended', wpEl.dataset.suspended === 'true');
                    wpEl.querySelector('[data-suspend-text]').textContent = wpEl.dataset.suspended === 'true' ? 'ใช้งาน' : 'ระงับ';
                    const summaryEl = wpEl.querySelector('[data-wallpaper-summary]');
                    if (!wpCalc || wpEl.dataset.suspended === 'true') {
                        summaryEl.innerHTML = `ราคา: <b class="price">0</b> • พื้นที่: <b class="price">0.00</b> ตร.ม. • ใช้ <b class="price">0</b> ม้วน`;
                    } else {
                        summaryEl.innerHTML = `ราคา: <b class="price">${fmtCurrency(wpCalc.total)}</b> • พื้นที่: <b class="price">${fmt(wpCalc.areaSqm)}</b> ตร.ม. • ใช้ <b class="price">${wpCalc.rollsNeeded}</b> ม้วน`;
                    }
                });
            });

            // Update footer
            document.querySelector(SELECTORS.grandTotal).textContent = fmtCurrency(calc.grandTotal);
            document.querySelector(SELECTORS.setCount).textContent = calc.totalSets + calc.totalDeco;
            document.querySelector(SELECTORS.setCountSets).textContent = calc.totalSets;
            document.querySelector(SELECTORS.setCountDeco).textContent = calc.totalDeco;
        },

        showToast(message, type = 'default') { /* ... shows toast notification ... */ 
            const container = document.querySelector(SELECTORS.toastContainer);
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                toast.addEventListener('transitionend', () => toast.remove());
            }, 3000);
        },
        
        showConfirmation(title, body) {
            return this.showModal('#confirmationModal', { title, body });
        },
        
        showCopyOptionsModal() {
            return this.showModal(SELECTORS.copyOptionsModal, {});
        },
        
        showImportModal() {
            return this.showModal(SELECTORS.importModal, {});
        },

        showSummaryModal(calc) {
            document.querySelector('#summaryGrandFabric').textContent = `${fmt(calc.grandOpaqueYards)} หลา`;
            document.querySelector('#summaryGrandSheerFabric').textContent = `${fmt(calc.grandSheerYards)} หลา`;
            document.querySelector('#summaryGrandOpaqueTrack').textContent = `${fmt(calc.grandOpaqueTrack)} ม.`;
            document.querySelector('#summaryGrandSheerTrack').textContent = `${fmt(calc.grandSheerTrack)} ม.`;
            this.showModal(SELECTORS.summaryModal, {});
        },

        showModal(selector, { title, body }) {
            return new Promise((resolve) => {
                const modalEl = document.querySelector(selector);
                if (title) modalEl.querySelector('.modal-title').textContent = title;
                if (body) modalEl.querySelector('.modal-body').textContent = body;
                modalEl.classList.add('visible');

                const cleanup = (result) => {
                    modalEl.classList.remove('visible');
                    confirmBtn.onclick = null;
                    cancelBtn.onclick = null;
                    resolve(result);
                };

                const confirmBtn = modalEl.querySelector('[data-modal-action="confirm"]');
                const cancelBtn = modalEl.querySelector('[data-modal-action="cancel"]');
                
                confirmBtn.onclick = () => {
                    if (selector === SELECTORS.copyOptionsModal) {
                        cleanup({
                            customer: modalEl.querySelector('#copyCustomerInfo')?.checked,
                            details: modalEl.querySelector('#copyRoomDetails')?.checked,
                            summary: modalEl.querySelector('#copySummary')?.checked,
                        });
                    } else if (selector === SELECTORS.importModal) {
                        cleanup(modalEl.querySelector('#importJsonArea')?.value);
                    } else {
                        cleanup(true);
                    }
                };
                
                if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
            });
        },

        populatePriceOptions(selectEl, prices) {
            if (!selectEl) return;
            selectEl.innerHTML = `<option value="" hidden>เลือก</option>`;
            prices.forEach(p => {
                const option = document.createElement('option');
                option.value = p; option.textContent = p.toLocaleString("th-TH");
                selectEl.appendChild(option);
            });
        },

        addItem(roomEl, containerSelector, tplSelector, itemSelector, msg) {
            const container = roomEl.querySelector(containerSelector);
            const frag = document.querySelector(tplSelector)?.content?.cloneNode(true);
            if (!container || !frag) return null;
            container.appendChild(frag);
            const created = container.querySelector(`${itemSelector}:last-of-type`);
            if (msg) UI.showToast(msg, 'success');
            return created;
        },
        
        toggleSetFabricUI(setEl) {
            const variant = setEl.querySelector('select[name="fabric_variant"]').value;
            const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
            setEl.querySelector('[data-sheer-wrap]')?.classList.toggle("hidden", !hasSheer);
            setEl.querySelector('[data-sheer-price-label]')?.classList.toggle("hidden", !hasSheer);
            setEl.querySelector('[data-opaque-price-label]')?.classList.toggle("hidden", variant === "โปร่ง");
            setEl.querySelector('[data-set-options-row]').classList.toggle("three-col", hasSheer);
        },
        
        updateLockState(isLocked) {
            const lockBtn = document.querySelector(SELECTORS.lockBtn);
            if (!lockBtn) return;
            lockBtn.classList.toggle('btn-primary', !isLocked);
            lockBtn.classList.toggle('btn-danger', isLocked);
            lockBtn.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
            lockBtn.querySelector('.lock-icon').textContent = isLocked ? '🔓' : '🔒';
        },
        
        renumber() {
            document.querySelectorAll('[data-room]').forEach((room, rIdx) => {
                room.querySelector('input[name="room_name"]').placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
                const items = room.querySelectorAll('[data-set], [data-deco-item], [data-wallpaper-item]');
                items.forEach((item, iIdx) => {
                    item.querySelector("[data-item-title]").textContent = iIdx + 1;
                });
            });
        },
        
        toggleMenu(state) {
            const menu = document.querySelector(SELECTORS.menuDropdown);
            if (menu) menu.classList.toggle('show', state);
        },
        
        buildTextSummary(payload, calc, options) {
            let summary = "สรุปใบเสนอราคา\n\n";
            if (options.customer) {
                summary += `ลูกค้า: ${payload.customer_name || '-'}\n`;
                summary += `เบอร์โทร: ${payload.customer_phone || '-'}\n`;
                summary += `ที่อยู่: ${payload.customer_address || '-'}\n\n`;
            }

            if (options.details) {
                payload.rooms.forEach((room, rIdx) => {
                    const roomCalc = calc.rooms[rIdx];
                    summary += `ห้อง ${rIdx + 1}: ${room.room_name || `ห้อง ${String(rIdx + 1).padStart(2, "0")}`} (รวม ${fmtCurrency(roomCalc.total)} บ.)\n`;
                    
                    room.sets.forEach((set, sIdx) => {
                        if (set.is_suspended) return;
                        const setCalc = roomCalc.sets.find((_,i) => i === sIdx);
                        summary += `  - ผ้าม่าน #${sIdx + 1}: กว้าง ${fmt(set.width_m)} x สูง ${fmt(set.height_m)} ม. [${set.fabric_variant}] ราคา ${fmtCurrency(setCalc.total)} บ.\n`;
                    });
                    
                    room.decorations.forEach((deco, dIdx) => {
                        if (deco.is_suspended) return;
                        const decoCalc = roomCalc.decorations.find((_,i) => i === dIdx);
                        summary += `  - ตกแต่ง #${dIdx + 1}: ${deco.type} ราคา ${fmtCurrency(decoCalc.total)} บ.\n`;
                    });
                    
                    room.wallpapers.forEach((wp, wIdx) => {
                        if (wp.is_suspended) return;
                        const wpCalc = roomCalc.wallpapers.find((_,i) => i === wIdx);
                        summary += `  - วอลเปเปอร์ #${wIdx + 1}: ใช้ ${wpCalc.rollsNeeded} ม้วน ราคา ${fmtCurrency(wpCalc.total)} บ.\n`;
                    });
                    summary += '\n';
                });
            }

            if (options.summary) {
                summary += "สรุปยอดรวม:\n";
                summary += `- ผ้าทึบ: ${fmt(calc.grandOpaqueYards)} หลา\n`;
                summary += `- ผ้าโปร่ง: ${fmt(calc.grandSheerYards)} หลา\n`;
                summary += `- รางทึบ: ${fmt(calc.grandOpaqueTrack)} ม.\n`;
                summary += `- รางโปร่ง: ${fmt(calc.grandSheerTrack)} ม.\n`;
                summary += `- **รวมสุทธิ: ${fmtCurrency(calc.grandTotal)} บาท**\n`;
            }
            return summary;
        },
    };

    // --- INITIALIZE THE APP ---
    document.addEventListener('DOMContentLoaded', () => App.init());

})();