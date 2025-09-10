(function() {
    'use strict';
    // --- CONSTANTS ---
    const APP_VERSION = "input-ui/m3-4.0.0";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4"; // Changed key for new version
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3;

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

    // --- SELECTORS (Updated for M3 Design) ---
    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload',
        lockBtn: '#lockBtn', addRoomFab: '#addRoomFab', submitBtn: '#submitBtn', clearAllBtn: '#clearAllBtn',
        grandTotal: '#grandTotal', setCount: '#setCount', grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]', roomPricePerM: 'select[name="room_price_per_m"]', roomStyle: 'select[name="room_style"]',
        setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        toastContainer: '#toast-container',
        grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn',
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel'
    };

    // --- DOM Elements ---
    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    if(orderForm) orderForm.action = WEBHOOK_URL;
    
    // --- State ---
    let roomCount = 0;
    let isLocked = false;
    
    // --- Utility Functions ---
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
    const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };

    // --- UI Functions ---
    function showToast(message, type = 'default') {
        const container = document.querySelector(SELECTORS.toastContainer);
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;

        if (type === 'success') toast.classList.add('toast-success');
        else if (type === 'warning') toast.classList.add('toast-warning');
        else if (type === 'error') toast.classList.add('toast-error');

        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }
    
    const showDialog = (selector, title, body) => {
        return new Promise((resolve) => {
            const modalEl = document.querySelector(selector);
            if (title) modalEl.querySelector('.dialog-title').textContent = title;
            if (body) modalEl.querySelector('.dialog-body').textContent = body;
            
            modalEl.classList.add('visible');
            
            const confirmBtn = modalEl.querySelector('[id$="Confirm"]');
            const cancelBtn = modalEl.querySelector('[id$="Cancel"]');

            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(result);
            };

            confirmBtn.onclick = () => {
                // Special handling for copy options modal
                if (selector === SELECTORS.copyOptionsModal) {
                    const options = {
                        customer: document.querySelector(SELECTORS.copyCustomerInfo).checked,
                        details: document.querySelector(SELECTORS.copyRoomDetails).checked,
                        summary: document.querySelector(SELECTORS.copySummary).checked,
                    };
                    cleanup(options);
                } else {
                    cleanup(true);
                }
            };
            cancelBtn.onclick = () => cleanup(false);
        });
    };

    // --- Core App Functions ---
    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        const room = frag.querySelector(SELECTORS.room);
        room.dataset.index = roomCount;
        populatePriceOptions(room.querySelector(SELECTORS.roomPricePerM), PRICING.fabric);
        roomsEl.appendChild(frag);
        const created = roomsEl.querySelector(`${SELECTORS.room}:last-of-type`);

        if (prefill) {
            created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
            created.querySelector(SELECTORS.roomPricePerM).value = prefill.price_per_m_raw || "";
            created.querySelector(SELECTORS.roomStyle).value = prefill.style || "";
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }
        
        // --- MODIFICATION: Do not add a default set item ---
        // const hasItems = created.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length > 0;
        // if (!hasItems && !prefill) addSet(created); // This line is removed

        renumber(); recalcAll(); saveData(); updateLockState();
        created.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }

    function populatePriceOptions(selectEl, prices) {
        const placeholder = selectEl.querySelector('option[hidden]');
        selectEl.innerHTML = '';
        if(placeholder) selectEl.appendChild(placeholder);

        prices.forEach(p => {
            const option = document.createElement('option');
            option.value = p; option.textContent = p.toLocaleString("th-TH");
            selectEl.appendChild(option);
        });
    }

    function addSet(roomEl, prefill) {
        if (isLocked) return;
        const setsWrap = roomEl.querySelector(SELECTORS.setsContainer);
        const frag = document.querySelector(SELECTORS.setTpl).content.cloneNode(true);
        setsWrap.appendChild(frag);
        const created = setsWrap.querySelector(`${SELECTORS.set}:last-of-type`);
        populatePriceOptions(created.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);

        if (prefill) {
            created.querySelector('input[name="width_m"]').value = prefill.width_m ?? "";
            created.querySelector('input[name="height_m"]').value = prefill.height_m ?? "";
            created.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
            created.querySelector('select[name="open_type"]').value = prefill.open_type || "";
            created.querySelector('select[name="sheer_price_per_m"]').value = prefill.sheer_price_per_m || "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                toggleSuspendVisuals(created, true);
            }
        }
        toggleSetFabricUI(created); renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มจุดผ้าม่านแล้ว');
    }
    
    function addDeco(roomEl, prefill) {
        if (isLocked) return;
        const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
        decoWrap.appendChild(frag);
        if (prefill) {
            const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);
            created.querySelector('[name="deco_type"]').value = prefill.type || "";
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m ?? "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmt(prefill.price_sqyd, 0, true) ?? "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                toggleSuspendVisuals(created, true);
            }
        }
        renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มรายการตกแต่งแล้ว');
    }

    function addWallpaper(roomEl, prefill) {
        if (isLocked) return;
        const wallpaperWrap = roomEl.querySelector(SELECTORS.wallpapersContainer);
        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        wallpaperWrap.appendChild(frag);
        const created = wallpaperWrap.querySelector(`${SELECTORS.wallpaperItem}:last-of-type`);

        if (prefill) {
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="wallpaper_price_roll"]').value = fmt(prefill.price_per_roll, 0, true) ?? "";
            (prefill.widths || []).forEach(w => addWall(created.querySelector('[data-act="add-wall"]'), w));
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                toggleSuspendVisuals(created, true);
            }
        } else {
            addWall(created.querySelector('[data-act="add-wall"]'));
        }

        renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มรายการวอลเปเปอร์แล้ว');
    }

    function addWall(btn, prefillWidth) {
        if (isLocked) return;
        const wallsContainer = btn.closest(SELECTORS.wallpaperItem).querySelector(SELECTORS.wallsContainer);
        const frag = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
        if (prefillWidth) {
            frag.querySelector('input[name="wall_width_m"]').value = prefillWidth;
        }
        wallsContainer.appendChild(frag);
    }

    function toggleSetFabricUI(setEl) {
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        setEl.querySelector(SELECTORS.sheerWrap).classList.toggle("hidden", !hasSheer);
        setEl.querySelector('[data-set-options-row]').classList.toggle("three-col", hasSheer);
        setEl.querySelector("[data-sheer-price-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-yardage-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-track-label]").classList.toggle("hidden", !hasSheer);

        const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
        setEl.querySelector("[data-opaque-price-label]").classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-yardage-label]").classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-track-label]").classList.toggle("hidden", !hasOpaque);
    }
    
    function toggleSuspend(btn) {
        const item = btn.closest('.item-card');
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        toggleSuspendVisuals(item, isSuspended);
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    function toggleSuspendVisuals(item, isSuspended) {
        item.classList.toggle('is-suspended', isSuspended);
        const icon = item.querySelector('[data-act="toggle-suspend"] span');
        if (icon) {
            icon.textContent = isSuspended ? 'visibility' : 'visibility_off';
        }
    }
    
    // --- Delete & Clear Functions ---
    async function delRoom(btn) { if (isLocked || !await showDialog(SELECTORS.modal, 'ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showDialog(SELECTORS.modal, 'ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showDialog(SELECTORS.modal, 'ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showDialog(SELECTORS.modal, 'ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }
    async function clearSet(btn) { if (isLocked) return; const set = btn.closest(SELECTORS.set); set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว'); }
    async function clearDeco(btn) { if (isLocked) return; btn.closest(SELECTORS.decoItem).querySelectorAll('input, select').forEach(el => { el.value = ''; }); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลตกแต่งแล้ว'); }
    async function clearWallpaper(btn) { if (isLocked) return; const item = btn.closest(SELECTORS.wallpaperItem); item.querySelectorAll('input').forEach(el => el.value = ''); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว'); }
    async function clearAllData() { if (isLocked || !await showDialog(SELECTORS.modal, 'ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('.md-card input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }

    // --- Recalculation & Data Handling ---
    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            
            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = iIdx + 1;
            });
        });
    }

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);
            
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                if (set.dataset.suspended !== 'true') {
                    const w = clamp01(set.querySelector('input[name="width_m"]').value), h = clamp01(set.querySelector('input[name="height_m"]').value);
                    const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]').value;
                    if (w > 0 && h > 0) {
                        if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                            opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                            opaqueYards = CALC.fabricYardage(style, w);
                            opaqueTrack = w;
                        }
                        if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                            const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]').value);
                            sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                            sheerYards = CALC.fabricYardage(style, w);
                            sheerTrack = w;
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
                grandOpaqueYards += opaqueYards; grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack; grandSheerTrack += sheerTrack;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const summaryEl = deco.querySelector('[data-deco-summary]');
                let decoPrice = 0, areaSqyd = 0;
                if (deco.dataset.suspended !== 'true') {
                    const w = clamp01(deco.querySelector('[name="deco_width_m"]').value), h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                    const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]').value);
                    areaSqyd = w * h * SQM_TO_SQYD;
                    decoPrice = Math.round(areaSqyd * price);
                }
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(decoPrice, 0, true)}</span> • พื้นที่: <span class="price">${fmt(areaSqyd, 2)}</span> ตร.หลา`;
                roomSum += decoPrice;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
                let wallpaperPrice = 0, totalAreaSqm = 0, rollsNeeded = 0;
                if (wallpaper.dataset.suspended !== 'true') {
                    const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                    const totalWidth = [...wallpaper.querySelectorAll('[name="wall_width_m"]')].reduce((sum, input) => sum + clamp01(input.value), 0);
                    totalAreaSqm = totalWidth * h;
                    rollsNeeded = totalAreaSqm > 0 ? Math.ceil(totalAreaSqm / WALLPAPER_SQM_PER_ROLL) : 0;
                    wallpaperPrice = rollsNeeded * pricePerRoll;
                }
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> • พื้นที่: <span class="price">${fmt(totalAreaSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${fmt(rollsNeeded, 0)}</span> ม้วน`;
                roomSum += wallpaperPrice;
            });
            
            const totalItemsInRoom = room.querySelectorAll(`.item-card:not(.is-suspended)`).length;
            const totalUnitsInRoom = [...room.querySelectorAll(`${SELECTORS.set}:not(.is-suspended)`)].reduce((sum, set) => sum + (set.querySelector('select[name="fabric_variant"]').value === "ทึบ&โปร่ง" ? 2 : 1), 0) 
                                   + room.querySelectorAll(`${SELECTORS.decoItem}:not(.is-suspended), ${SELECTORS.wallpaperItem}:not(.is-suspended)`).length;
            
            const brief = room.querySelector("[data-room-brief]");
            if (brief) brief.innerHTML = `${totalItemsInRoom} จุด • ${totalUnitsInRoom} ชุด • ${fmt(roomSum, 0, true)} บ.`;
            grand += roomSum;
        });

        const totalSets = [...document.querySelectorAll(`${SELECTORS.set}:not(.is-suspended)`)].reduce((sum, set) => sum + (set.querySelector('select[name="fabric_variant"]').value === "ทึบ&โปร่ง" ? 2 : 1), 0);
        const totalDeco = document.querySelectorAll(`${SELECTORS.decoItem}:not(.is-suspended), ${SELECTORS.wallpaperItem}:not(.is-suspended)`).length;
        const totalPoints = document.querySelectorAll(`.item-card:not(.is-suspended)`).length;
        
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = fmt(totalPoints, 0);
        document.querySelector(SELECTORS.setCountSets).textContent = fmt(totalSets, 0);
        document.querySelector(SELECTORS.setCountDeco).textContent = fmt(totalDeco, 0);
    }

    const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); });
    
    function buildPayload() { /* ... function content is unchanged ... */ return { customer_name: document.querySelector('input[name="customer_name"]').value||"", customer_address: document.querySelector('input[name="customer_address"]').value||"", customer_phone: document.querySelector('input[name="customer_phone"]').value||"", app_version: APP_VERSION, generated_at: new Date().toISOString(), rooms: [...document.querySelectorAll(SELECTORS.room)].map(room=>({ room_name: room.querySelector(SELECTORS.roomNameInput).value||"", price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value), style: room.querySelector(SELECTORS.roomStyle).value, sets: [...room.querySelectorAll(SELECTORS.set)].map(set=>({ width_m: clamp01(set.querySelector('input[name="width_m"]').value), height_m: clamp01(set.querySelector('input[name="height_m"]').value), fabric_variant: set.querySelector('select[name="fabric_variant"]').value, open_type: set.querySelector('select[name="open_type"]').value, sheer_price_per_m: clamp01(set.querySelector('select[name="sheer_price_per_m"]').value), is_suspended: set.dataset.suspended==='true' })), decorations: [...room.querySelectorAll(SELECTORS.decoItem)].map(deco=>({ type: deco.querySelector('[name="deco_type"]').value, width_m: clamp01(deco.querySelector('[name="deco_width_m"]').value), height_m: clamp01(deco.querySelector('[name="deco_height_m"]').value), price_sqyd: clamp01(deco.querySelector('[name="deco_price_sqyd"]').value), is_suspended: deco.dataset.suspended==='true' })), wallpapers: [...room.querySelectorAll(SELECTORS.wallpaperItem)].map(wp=>({ height_m: clamp01(wp.querySelector('[name="wallpaper_height_m"]').value), price_per_roll: clamp01(wp.querySelector('[name="wallpaper_price_roll"]').value), widths: [...wp.querySelectorAll('[name="wall_width_m"]')].map(input=>clamp01(input.value)), is_suspended: wp.dataset.suspended==='true' })) })) }; }
    function buildTextPayload(options) { /* ... function content is mostly unchanged, but grandFabric etc. are no longer available in the DOM, so they are commented out ... */ 
        const payload = buildPayload();
        let text = "";
        if (options.customer) { text += "✅ ข้อมูลลูกค้า\n"; text += `ชื่อ: ${payload.customer_name}\n`; text += `ที่อยู่: ${payload.customer_address}\n`; text += `เบอร์โทร: ${payload.customer_phone}\n\n`; }
        if (options.details) { text += "✅ รายละเอียดห้อง\n"; payload.rooms.forEach((room, roomIndex)=>{ const roomName = room.room_name||`ห้อง ${String(roomIndex + 1).padStart(2, '0')}`; text += `\n**${roomName}** (สไตล์: ${room.style}, ราคาผ้าทึบ: ${fmt(room.price_per_m_raw, 0, true)} บ./ม.)\n`; room.sets.forEach((set, setIndex)=>{ if (set.is_suspended) return; const { width_m, height_m, fabric_variant, open_type, sheer_price_per_m } = set; let details = `  • จุดที่ ${setIndex + 1} (${width_m}x${height_m} ม.): `; details += `ผ้า${fabric_variant}`; if (open_type) details += `, เปิด${open_type}`; if (fabric_variant==="โปร่ง"||fabric_variant==="ทึบ&โปร่ง") { details += `, ราคาผ้าโปร่ง: ${fmt(sheer_price_per_m, 0, true)} บ./ม.`; } text += `${details}\n`; }); room.decorations.forEach((deco, decoIndex)=>{ if (deco.is_suspended) return; text += `  • รายการตกแต่งที่ ${decoIndex + 1}: ${deco.type} (${deco.width_m}x${deco.height_m} ม.) ราคา: ${fmt(deco.price_sqyd, 0, true)} บ./ตร.หลา\n`; }); room.wallpapers.forEach((wp, wpIndex)=>{ if (wp.is_suspended) return; const totalWidth = wp.widths.reduce((sum, w)=>sum + w, 0); const totalAreaSqm = totalWidth * wp.height_m; const rollsNeeded = totalAreaSqm > 0 ? Math.ceil(totalAreaSqm / WALLPAPER_SQM_PER_ROLL) : 0; text += `  • วอลเปเปอร์ที่ ${wpIndex + 1}: สูง ${wp.height_m} ม., กว้างรวม ${fmt(totalWidth, 2)} ม. ราคา: ${fmt(wp.price_per_roll, 0, true)} บ./ม้วน, ใช้ ${rollsNeeded} ม้วน\n`; }); }); text += "\n"; }
        if (options.summary) {
            text += "✅ สรุปยอดรวม\n";
            text += `ราคารวม: ${document.querySelector(SELECTORS.grandTotal).textContent} บาท\n`;
            text += `จำนวนชุดผ้าม่าน: ${document.querySelector(SELECTORS.setCountSets).textContent} ชุด\n`;
            text += `จำนวนรายการตกแต่ง: ${document.querySelector(SELECTORS.setCountDeco).textContent} ชุด\n`;
            // Note: Fabric summary removed from UI, can be recalculated if needed
        }
        return text.trim();
    }
    function saveData(payload) { if (!payload) payload = buildPayload(); localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); }

    function updateLockState() {
        const isFormLocked = isLocked || false;
        document.querySelectorAll('input, select, button').forEach(el => {
            if (el.id === 'menuBtn' || document.querySelector('#menuDropdown')?.contains(el)) return;
            el.disabled = isFormLocked;
        });
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const lockText = lockBtn.querySelector('.lock-text');
        const lockIcon = lockBtn.querySelector('.material-symbols-outlined');
        
        lockText.textContent = isFormLocked ? 'ปลดล็อค' : 'ล็อค';
        lockIcon.textContent = isFormLocked ? 'lock_open' : 'lock';
        lockBtn.classList.toggle('danger', isFormLocked);
    }
    
    function toggleLock() { isLocked = !isLocked; updateLockState(); showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', isLocked ? 'warning' : 'success'); }
    
    function formatNumericInput(e) { const input = e.target; let val = input.value.replace(/[^0-9]/g, ''); input.value = val ? parseInt(val, 10).toLocaleString('th-TH') : ''; }

    async function importData() {
        const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const data = JSON.parse(jsonText);
            if (!data || !data.rooms) { showToast("ข้อมูล JSON ไม่ถูกต้อง", "error"); return; }
            
            if (await showDialog(SELECTORS.modal, 'นำเข้าข้อมูล', 'การนำเข้าข้อมูลจะลบข้อมูลปัจจุบันทั้งหมด คุณแน่ใจหรือไม่?')) {
                document.querySelector('input[name="customer_name"]').value = data.customer_name || "";
                document.querySelector('input[name="customer_address"]').value = data.customer_address || "";
                document.querySelector('input[name="customer_phone"]').value = data.customer_phone || "";
                roomsEl.innerHTML = ""; roomCount = 0;
                data.rooms.forEach(addRoom);
                saveData(data);
                document.querySelector(SELECTORS.importModal).classList.remove('visible');
                showToast("นำเข้าข้อมูลเรียบร้อยแล้ว", "success");
            }
        } catch (err) { showToast("ข้อมูล JSON ไม่ถูกต้อง: " + err.message, "error"); console.error(err); }
    }

    // --- Event Listeners ---
    document.addEventListener("change", e => {
        if (e.target.matches('select[name="fabric_variant"]')) { toggleSetFabricUI(e.target.closest(SELECTORS.set)); }
        debouncedRecalcAndSave();
    });

    document.addEventListener("input", e => {
        if(e.target.matches('[name="deco_price_sqyd"], [name="wallpaper_price_roll"]')) { formatNumericInput(e); }
        debouncedRecalcAndSave();
    });

    document.addEventListener("click", async (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const act = btn.dataset.act;
        if (btn.type !== 'submit' && btn.form !== orderForm) e.preventDefault();
        
        const actions = {
            'del-room': delRoom, 'del-set': delSet, 'del-deco': delDeco, 'del-wallpaper': delWallpaper, 'del-wall': delWall,
            'add-set': (b) => addSet(b.closest(SELECTORS.room)),
            'add-deco': (b) => addDeco(b.closest(SELECTORS.room)),
            'add-wallpaper': (b) => addWallpaper(b.closest(SELECTORS.room)),
            'add-wall': addWall,
            'clear-set': clearSet, 'clear-deco': clearDeco, 'clear-wallpaper': clearWallpaper,
            'toggle-suspend': toggleSuspend
        };

        if (actions[act]) actions[act](btn);
        else if (btn.id === SELECTORS.addRoomFab.substring(1)) addRoom();
        else if (btn.id === SELECTORS.clearAllBtn.substring(1)) clearAllData();
        else if (btn.id === SELECTORS.lockBtn.substring(1)) toggleLock();
        else if (btn.id === SELECTORS.copyTextBtn.substring(1)) {
            const options = await showDialog(SELECTORS.copyOptionsModal);
            if (options) {
                const text = buildTextPayload(options);
                navigator.clipboard.writeText(text).then(() => showToast("คัดลอกข้อความแล้ว", "success")).catch(err => showToast("ไม่สามารถคัดลอกได้: " + err, "error"));
            }
        } else if (btn.id === SELECTORS.exportBtn.substring(1)) {
            const payload = buildPayload();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
            const customerName = document.querySelector('input[name="customer_name"]').value.trim() || 'marnthara_data';
            const sanitizedName = customerName.replace(/[^a-zA-Z0-9\u0E00-\u0E7F\s]/g, '_').replace(/\s+/g, '_');
            const fileName = `${sanitizedName}.json`;
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", fileName);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            showToast("ส่งออกข้อมูลเป็นไฟล์ JSON แล้ว", "success");
        } else if (btn.id === SELECTORS.importBtn.substring(1)) {
            document.querySelector(SELECTORS.importJsonArea).value = '';
            document.querySelector(SELECTORS.importModal).classList.add('visible');
        }
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });
    
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', importData);

    document.addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const menuBtn = document.querySelector(SELECTORS.menuBtn);
        if (menuDropdown && menuBtn && !menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
    });

    orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        showToast("กำลังส่งข้อมูล...", "success");
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
                roomsEl.innerHTML = ""; roomCount = 0;
                if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
                else addRoom();
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY); addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
    });
})();