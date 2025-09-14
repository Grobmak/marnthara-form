(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.0.0-refactored";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4"; // Incremented version for new data structure
    const SQM_TO_SQYD = 1.19599;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [
            { threshold: 3.2, add_per_m: 300 }, 
            { threshold: 2.8, add_per_m: 200 }, 
            { threshold: 2.5, add_per_m: 150 }
        ],
    };
    
    const CALC = {
        fabricYardage: (style, width) => {
            if (width <= 0 || !style) return 0;
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
        }
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', copyJsonLink: '#copyJsonLink', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomFooterBtn: '#addRoomFooterBtn',
        grandTotal: '#grandTotal', setCount: '#setCount', grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]',
        setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        toastContainer: '#toast-container',
        grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        copyTextLink: '#copyTextLink', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn',
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        submitLink: '#submitLink' // Added new selector for submit button
    };

    // --- STATE ---
    let roomCount = 0;
    let isLocked = false;

    // --- UTILITY FUNCTIONS ---
    const toNum = v => {
        if (typeof v === 'string') v = v.replace(/,/g, '');
        const num = parseFloat(v);
        return Number.isFinite(num) ? num : 0;
    };
    const clamp01 = v => Math.max(0, toNum(v));
    const fmt = (n, fixed = 2, asCurrency = false) => {
        if (!Number.isFinite(n)) return "0";
        return n.toLocaleString("th-TH", { 
            minimumFractionDigits: asCurrency ? 0 : fixed, 
            maximumFractionDigits: asCurrency ? 0 : fixed 
        });
    };
    const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };

    // --- UI FUNCTIONS (Toasts, Modals) ---
    function showToast(message, type = 'default') {
        const container = document.querySelector(SELECTORS.toastContainer);
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }

    const showModal = (selector) => {
        return new Promise((resolve) => {
            const modalEl = document.querySelector(selector);
            if (!modalEl) { resolve(null); return; }
            modalEl.classList.add('visible');
            const confirmBtn = modalEl.querySelector('[id*="Confirm"]');
            const cancelBtn = modalEl.querySelector('[id*="Cancel"]');
            
            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                if (confirmBtn) confirmBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
                resolve(result);
            };

            if (confirmBtn) confirmBtn.onclick = () => cleanup(true);
            if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
        });
    };
    
    async function showConfirmation(title, body) {
        const modalEl = document.querySelector(SELECTORS.modal);
        if (!modalEl) return true;
        modalEl.querySelector(SELECTORS.modalTitle).textContent = title;
        modalEl.querySelector(SELECTORS.modalBody).textContent = body;
        return await showModal(SELECTORS.modal);
    }

    async function showCopyOptionsModal() {
        if (!await showModal(SELECTORS.copyOptionsModal)) return false;
        return {
            customer: document.querySelector(SELECTORS.copyCustomerInfo)?.checked ?? false,
            details: document.querySelector(SELECTORS.copyRoomDetails)?.checked ?? false,
            summary: document.querySelector(SELECTORS.copySummary)?.checked ?? false,
        };
    }
    
    async function showImportModal() {
        const importJsonArea = document.querySelector(SELECTORS.importJsonArea);
        importJsonArea.value = '';
        if (!await showModal(SELECTORS.importModal)) return false;
        try {
            return JSON.parse(importJsonArea.value);
        } catch (e) {
            showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
            return false;
        }
    }

    // --- CORE DOM MANIPULATION ---
    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl)?.content?.cloneNode(true);
        if (!frag) return;
        const room = frag.querySelector(SELECTORS.room);
        room.dataset.index = roomCount;
        document.querySelector(SELECTORS.roomsContainer).appendChild(frag);
        const created = document.querySelector(`${SELECTORS.room}:last-of-type`);

        if (prefill) {
            created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }

        renumber();
        recalcAll();
        saveData();
        created.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }
    
    function populatePriceOptions(selectEl, prices) {
        if (!selectEl) return;
        selectEl.innerHTML = `<option value="" hidden>เลือกราคา</option>`;
        prices.forEach(p => {
            const option = document.createElement('option');
            option.value = p; 
            option.textContent = p.toLocaleString("th-TH");
            selectEl.appendChild(option);
        });
    }

    function addSet(roomEl, prefill) {
        if (isLocked) return;
        const setsWrap = roomEl.querySelector(SELECTORS.setsContainer);
        const frag = document.querySelector(SELECTORS.setTpl)?.content?.cloneNode(true);
        if (!frag || !setsWrap) return;
        setsWrap.appendChild(frag);
        const created = setsWrap.querySelector(`${SELECTORS.set}:last-of-type`);
        
        populatePriceOptions(created.querySelector('select[name="set_price_per_m"]'), PRICING.fabric);
        populatePriceOptions(created.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);

        if (prefill) {
            created.querySelector('input[name="width_m"]').value = prefill.width_m ?? "";
            created.querySelector('input[name="height_m"]').value = prefill.height_m ?? "";
            created.querySelector('select[name="set_style"]').value = prefill.style || "ลอน";
            created.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
            created.querySelector('select[name="set_price_per_m"]').value = prefill.price_per_m_raw || "";
            created.querySelector('select[name="sheer_price_per_m"]').value = prefill.sheer_price_per_m || "";
            if (prefill.is_suspended) suspendItem(created, true, false);
        }
        toggleSetFabricUI(created);
        renumber();
        recalcAll();
        saveData();
    }
    
    function addDeco(roomEl, prefill) {
        if (isLocked) return;
        const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl)?.content?.cloneNode(true);
        if (!frag || !decoWrap) return;
        decoWrap.appendChild(frag);
        const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);
        
        if (prefill) {
            created.querySelector('[name="deco_type"]').value = prefill.type || "";
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m ?? "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmt(prefill.price_sqyd, 0, true) ?? "";
            if (prefill.is_suspended) suspendItem(created, true, false);
        }
        renumber();
        recalcAll();
        saveData();
    }

    function addWallpaper(roomEl, prefill) {
        if (isLocked) return;
        const wallpaperWrap = roomEl.querySelector(SELECTORS.wallpapersContainer);
        const frag = document.querySelector(SELECTORS.wallpaperTpl)?.content?.cloneNode(true);
        if (!frag || !wallpaperWrap) return;
        wallpaperWrap.appendChild(frag);
        const created = wallpaperWrap.querySelector(`${SELECTORS.wallpaperItem}:last-of-type`);

        if (prefill) {
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="wallpaper_price_roll"]').value = fmt(prefill.price_per_roll, 0, true) ?? "";
            (prefill.widths || []).forEach(w => addWall(created.querySelector('[data-act="add-wall"]'), w));
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
            addWall(created.querySelector('[data-act="add-wall"]'));
        }
        renumber();
        recalcAll();
        saveData();
    }

    function addWall(btn, prefillWidth) {
        if (isLocked) return;
        const wallsContainer = btn.closest(SELECTORS.wallpaperItem)?.querySelector(SELECTORS.wallsContainer);
        const frag = document.querySelector(SELECTORS.wallTpl)?.content?.cloneNode(true);
        if (!frag || !wallsContainer) return;
        if (prefillWidth) {
            frag.querySelector('input[name="wall_width_m"]').value = prefillWidth;
        }
        wallsContainer.appendChild(frag);
    }
    
    function suspendItem(item, isSuspended, notify = true) {
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        const suspendIcon = item.querySelector('[data-act="toggle-suspend"] .material-symbols-outlined');
        if (suspendIcon) suspendIcon.textContent = isSuspended ? 'play_circle' : 'pause_circle';
        if (notify) showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function performActionWithConfirmation(btn, actionConfig) {
        if (isLocked) return;
        if (actionConfig.confirm && !await showConfirmation(actionConfig.title, actionConfig.body)) return;
        
        const item = btn.closest(actionConfig.selector);
        if (item) {
            actionConfig.action(item, btn);
            renumber();
            recalcAll();
            saveData();
            if (actionConfig.toast) showToast(actionConfig.toast, 'success');
        }
    }

    // --- DATA & CALCULATIONS ---
    
    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0, grandOpaqueTrack = 0, grandSheerTrack = 0;
        
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            let roomSum = 0;
            
            // CURTAIN SETS
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                
                if (set.dataset.suspended !== 'true') {
                    const w = clamp01(set.querySelector('input[name="width_m"]')?.value);
                    const h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                    const style = set.querySelector('select[name="set_style"]')?.value;
                    const variant = set.querySelector('select[name="fabric_variant"]')?.value;
                    const sPlus = stylePlus(style);
                    const hPlus = heightPlus(h);

                    if (w > 0 && h > 0) {
                        if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                            const baseRaw = clamp01(set.querySelector('select[name="set_price_per_m"]')?.value);
                            if (baseRaw > 0) {
                                opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                                opaqueYards = CALC.fabricYardage(style, w);
                                opaqueTrack = w;
                            }
                        }
                        if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                            const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                            if (sheerBase > 0) {
                                sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                                sheerYards = CALC.fabricYardage(style, w);
                                sheerTrack = w;
                            }
                        }
                    }
                }
                set.querySelector('[data-set-price-total]').textContent = fmt(opaquePrice + sheerPrice, 0, true);
                set.querySelector('[data-set-price-opaque]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-set-price-sheer]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);
                roomSum += opaquePrice + sheerPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });
            // DECORATIONS
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                let decoPrice = 0, areaSqyd = 0;
                if (deco.dataset.suspended !== 'true') {
                    const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                    const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                    const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                    areaSqyd = w * h * SQM_TO_SQYD;
                    decoPrice = Math.round(areaSqyd * price);
                }
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmt(decoPrice, 0, true)}</b> บ. • พื้นที่: <b>${fmt(areaSqyd, 2)}</b> ตร.หลา`;
                roomSum += decoPrice;
            });
            // WALLPAPERS
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let wallpaperPrice = 0, areaSqm = 0, rollsNeeded = 0;
                if (wallpaper.dataset.suspended !== 'true') {
                    const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                    const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                    rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                    wallpaperPrice = Math.round(rollsNeeded * pricePerRoll);
                    areaSqm = totalWidth * h;
                }
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <b>${fmt(wallpaperPrice, 0, true)}</b> บ. • พื้นที่: <b>${fmt(areaSqm, 2)}</b> ตร.ม. • ใช้ <b>${rollsNeeded}</b> ม้วน`;
                roomSum += wallpaperPrice;
            });
            const itemCount = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
            room.querySelector('[data-room-brief]').innerHTML = `<span>${itemCount} รายการ • ${fmt(roomSum, 0, true)} บาท</span>`;
            grand += roomSum;
        });
        // Update summary footer
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        const allItems = document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
        const curtainSets = document.querySelectorAll(SELECTORS.set);
        document.querySelector(SELECTORS.setCount).textContent = allItems.length;
        document.querySelector(SELECTORS.setCountSets).textContent = curtainSets.length;
        document.querySelector(SELECTORS.setCountDeco).textContent = allItems.length - curtainSets.length;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
    }
    
    // --- PAYLOAD & LOCAL STORAGE ---
    function buildPayload() {
        const payload = {
            metadata: {
                version: APP_VERSION,
                timestamp: new Date().toISOString()
            },
            customer_info: {
                customer_name: document.querySelector('#customer_name')?.value,
                customer_phone: document.querySelector('#customer_phone')?.value,
                customer_address: document.querySelector('#customer_address')?.value
            },
            rooms: []
        };
        
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput)?.value,
                sets: [],
                decorations: [],
                wallpapers: []
            };

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const isSuspended = set.dataset.suspended === 'true';
                roomData.sets.push({
                    is_suspended: isSuspended,
                    width_m: toNum(set.querySelector('input[name="width_m"]')?.value),
                    height_m: toNum(set.querySelector('input[name="height_m"]')?.value),
                    style: set.querySelector('select[name="set_style"]')?.value,
                    fabric_variant: set.querySelector('select[name="fabric_variant"]')?.value,
                    price_per_m_raw: toNum(set.querySelector('select[name="set_price_per_m"]')?.value),
                    sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]')?.value),
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isSuspended = deco.dataset.suspended === 'true';
                roomData.decorations.push({
                    is_suspended: isSuspended,
                    type: deco.querySelector('[name="deco_type"]')?.value,
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value)
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const isSuspended = wallpaper.dataset.suspended === 'true';
                roomData.wallpapers.push({
                    is_suspended: isSuspended,
                    height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value),
                    widths: Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).map(el => toNum(el.value))
                });
            });

            payload.rooms.push(roomData);
        });

        return payload;
    }
    
    function loadPayload(payload) {
        if (!payload) return;
        document.querySelector('#customer_name').value = payload.customer_info?.customer_name || '';
        document.querySelector('#customer_phone').value = payload.customer_info?.customer_phone || '';
        document.querySelector('#customer_address').value = payload.customer_info?.customer_address || '';
        
        document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
        roomCount = 0;
        
        (payload.rooms || []).forEach(roomData => addRoom(roomData));
        recalcAll();
        showToast("นำเข้าข้อมูลเรียบร้อยแล้ว", "success");
    }
    
    function saveData() {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.error("Failed to save data to localStorage:", e);
            showToast("ไม่สามารถบันทึกข้อมูลได้", "error");
        }
    }

    // --- MAIN EVENT HANDLERS ---
    function init() {
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);

        // Events for new items
        roomsContainer.addEventListener('input', debounce(recalcAll));
        roomsContainer.addEventListener('change', debounce(recalcAll));

        // Global event listeners
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-act]');
            if (!target || isLocked) return;
            const action = target.dataset.act;
            const item = target.closest('[data-set], [data-deco-item], [data-wallpaper-item]');
            
            const actions = {
                'del-room': { 
                    selector: SELECTORS.room, 
                    confirm: true, 
                    title: 'ลบห้องนี้?', 
                    body: 'คุณต้องการลบห้องนี้และรายการทั้งหมดหรือไม่?', 
                    action: (el) => el.remove() 
                },
                'add-set': { 
                    selector: SELECTORS.room, 
                    action: (el) => addSet(el) 
                },
                'del-set': { 
                    selector: SELECTORS.set, 
                    action: (el) => el.remove() 
                },
                'toggle-suspend': {
                    selector: '[data-set], [data-deco-item], [data-wallpaper-item]',
                    action: (el) => suspendItem(el, !(el.dataset.suspended === 'true')),
                    toast: ''
                },
                'add-deco': { 
                    selector: SELECTORS.room, 
                    action: (el) => addDeco(el) 
                },
                'del-deco': { 
                    selector: SELECTORS.decoItem, 
                    action: (el) => el.remove() 
                },
                'add-wallpaper': {
                    selector: SELECTORS.room,
                    action: (el) => addWallpaper(el)
                },
                'del-wallpaper': {
                    selector: SELECTORS.wallpaperItem,
                    action: (el) => el.remove()
                },
                'add-wall': { 
                    selector: SELECTORS.wallpaperItem, 
                    action: (el, btn) => addWall(btn)
                },
                'del-wall': {
                    selector: '.wall-input-row',
                    action: (el) => el.remove()
                }
            };
            
            if (actions[action]) {
                performActionWithConfirmation(target, actions[action]);
            }
        });

        // Toggle fabric UI based on selection
        roomsContainer.addEventListener('change', (e) => {
            const target = e.target;
            if (target.matches('select[name="fabric_variant"]')) {
                const setEl = target.closest(SELECTORS.set);
                if (setEl) toggleSetFabricUI(setEl);
            }
        });
        
        function toggleSetFabricUI(setEl) {
            const variant = setEl.querySelector('select[name="fabric_variant"]')?.value;
            setEl.querySelector(SELECTORS.sheerWrap)?.classList.toggle('hidden', variant === "ทึบ");
            setEl.querySelector('[data-fabric-wrap]')?.classList.toggle('hidden', variant === "โปร่ง");
        }

        // Lock/Unlock button logic
        document.querySelector(SELECTORS.lockBtn).addEventListener('click', async () => {
            if (!isLocked) {
                if (!await showConfirmation('ล็อกฟอร์ม?', 'คุณต้องการล็อกการแก้ไขข้อมูลทั้งหมดหรือไม่?')) return;
            }
            isLocked = !isLocked;
            updateLockState();
        });
        
        function updateLockState() {
            const lockIcon = document.querySelector('.lock-icon');
            const lockText = document.querySelector('.lock-text');
            const allInputs = document.querySelectorAll('input, select, textarea, button:not(#lockBtn, #menuBtn)');
            
            lockIcon.textContent = isLocked ? 'lock' : 'lock_open';
            lockText.textContent = isLocked ? 'ปลดล็อก' : 'ล็อก';
            document.querySelectorAll(SELECTORS.room).forEach(room => room.classList.toggle('is-locked', isLocked));
            document.querySelectorAll('.btn-chip').forEach(btn => btn.disabled = isLocked);
            document.querySelectorAll('.btn-icon').forEach(btn => btn.disabled = isLocked);
            document.querySelectorAll('.add-room-container button').forEach(btn => btn.disabled = isLocked);
            document.querySelector(SELECTORS.clearAllBtn).disabled = isLocked;
            document.querySelector(SELECTORS.importBtn).disabled = isLocked;
            document.querySelector(SELECTORS.payloadInput).disabled = isLocked;
            
            allInputs.forEach(input => {
                input.disabled = isLocked;
            });
            showToast(isLocked ? 'ฟอร์มถูกล็อกแล้ว' : 'ฟอร์มถูกปลดล็อกแล้ว', 'info');
        }

        // Main action buttons (in header dropdown)
        document.querySelector(SELECTORS.copyTextLink).addEventListener('click', async (e) => {
            e.preventDefault();
            const options = await showCopyOptionsModal();
            if (!options) return;
            
            let textToCopy = "";
            const payload = buildPayload();
            const customerInfo = payload.customer_info;
            const rooms = payload.rooms;
            const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;

            if (options.customer && (customerInfo.customer_name || customerInfo.customer_phone || customerInfo.customer_address)) {
                textToCopy += `ลูกค้า: ${customerInfo.customer_name || '-'}\n`;
                textToCopy += `โทร: ${customerInfo.customer_phone || '-'}\n`;
                textToCopy += `ที่อยู่: ${customerInfo.customer_address || '-'}\n\n`;
            }

            if (options.details) {
                rooms.forEach(room => {
                    if (room.room_name) textToCopy += `== ${room.room_name} ==\n`;
                    if (room.sets.length > 0) {
                        textToCopy += `รายการผ้าม่าน:\n`;
                        room.sets.forEach(set => {
                            const w = set.width_m;
                            const h = set.height_m;
                            const style = set.style;
                            const variant = set.fabric_variant;
                            const rawPrice = set.price_per_m_raw;
                            const sheerPrice = set.sheer_price_per_m;

                            if (!set.is_suspended) {
                                textToCopy += `  - กว้าง ${w}ม. x สูง ${h}ม. (${variant}, ${style})\n`;
                                if (rawPrice > 0) textToCopy += `    > ราคาผ้าทึบ: ${rawPrice.toLocaleString("th-TH")}บ./ม.\n`;
                                if (sheerPrice > 0) textToCopy += `    > ราคาผ้าโปร่ง: ${sheerPrice.toLocaleString("th-TH")}บ./ม.\n`;
                            }
                        });
                    }
                    if (room.decorations.length > 0) {
                         textToCopy += `รายการตกแต่ง:\n`;
                         room.decorations.forEach(deco => {
                            if (!deco.is_suspended) {
                                textToCopy += `  - ${deco.type || 'ตกแต่ง'}: ${deco.width_m}ม. x ${deco.height_m}ม. (ราคา ${deco.price_sqyd.toLocaleString("th-TH")}บ./ตร.หลา)\n`;
                            }
                         });
                    }
                    if (room.wallpapers.length > 0) {
                         textToCopy += `รายการวอลเปเปอร์:\n`;
                         room.wallpapers.forEach(wp => {
                             if (!wp.is_suspended) {
                                textToCopy += `  - วอลเปเปอร์สูง ${wp.height_m}ม. (ราคา ${wp.price_per_roll.toLocaleString("th-TH")}บ./ม้วน)\n`;
                                textToCopy += `    > กว้างผนังรวม: ${wp.widths.join(', ')}ม.\n`;
                             }
                         });
                    }
                    if (room.sets.length > 0 || room.decorations.length > 0 || room.wallpapers.length > 0) {
                        textToCopy += '\n';
                    }
                });
            }

            if (options.summary) {
                textToCopy += `=== สรุปยอดรวม ===\n`;
                textToCopy += `ผ้าทึบ: ${document.querySelector(SELECTORS.grandFabric).textContent}\n`;
                textToCopy += `ผ้าโปร่ง: ${document.querySelector(SELECTORS.grandSheerFabric).textContent}\n`;
                textToCopy += `รางทึบ: ${document.querySelector(SELECTORS.grandOpaqueTrack).textContent}\n`;
                textToCopy += `รางโปร่ง: ${document.querySelector(SELECTORS.grandSheerTrack).textContent}\n`;
                textToCopy += `จำนวนชุด: ${document.querySelector(SELECTORS.setCount).textContent} ชุด\n`;
                textToCopy += `รวมสุทธิ: ${document.querySelector(SELECTORS.grandTotal).textContent} บาท\n`;
            }
            
            if (textToCopy) {
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    showToast("คัดลอกข้อมูลสรุปแล้ว!", "success");
                } catch (err) {
                    showToast("ไม่สามารถคัดลอกได้", "error");
                }
            } else {
                showToast("ไม่มีข้อมูลให้คัดลอก", "warning");
            }
        });
        
        document.querySelector(SELECTORS.copyJsonLink).addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2));
                showToast("คัดลอก JSON แล้ว!", "success");
            } catch (err) {
                showToast("ไม่สามารถคัดลอก JSON ได้", "error");
            }
        });

        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            if (await showConfirmation("ลบข้อมูลทั้งหมด?", "คุณต้องการลบข้อมูลทั้งหมดในฟอร์มหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้")) {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            }
        });
        
        document.querySelector(SELECTORS.exportBtn).addEventListener('click', (e) => {
            e.preventDefault();
            const payload = JSON.stringify(buildPayload(), null, 2);
            const blob = new Blob([payload], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'marnthara-data.json';
            a.click();
            URL.revokeObjectURL(url);
            showToast("ส่งออกข้อมูลแล้ว", "success");
        });
        
        document.querySelector(SELECTORS.importBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const payload = await showImportModal();
            if (payload) loadPayload(payload);
        });

        // Menu Dropdown
        document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
            document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
        });
        window.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-container')) {
                document.querySelector(SELECTORS.menuDropdown).classList.remove('show');
            }
        });
        
        // Form Submission
        // Changed to use click event on the link and submit the form programmatically
        document.querySelector(SELECTORS.submitLink).addEventListener("click", (e) => {
            e.preventDefault();
            const payloadInput = document.querySelector(SELECTORS.payloadInput);
            if(payloadInput) payloadInput.value = JSON.stringify(buildPayload());
            
            // This will trigger the form's submit event listener
            document.querySelector(SELECTORS.orderForm).submit();
        });
        
        orderForm.addEventListener("submit", (e) => {
            e.preventDefault();
            // In a real scenario, you might use fetch() here. For now, we just show a toast.
            showToast("ส่งข้อมูลแล้ว...", "success");
        });

        // Initial Load from localStorage
        try {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                loadPayload(JSON.parse(storedData));
            } else {
                addRoom();
            }
        } catch(err) {
            localStorage.removeItem(STORAGE_KEY); 
            addRoom();
        }
        updateLockState();
    }

    // --- START THE APP ---
    document.addEventListener('DOMContentLoaded', init);
})();