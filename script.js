(function() {
    'use strict';
    const APP_VERSION = "input-ui/m3-1.0.0";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
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

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', copyJsonBtn: '#copyJsonBtn', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomFab: '#addRoomFab', submitBtn: '#submitBtn',
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
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        summaryBtn: '#summaryBtn', summaryPopup: '#summaryPopup',
    };

    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    orderForm.action = WEBHOOK_URL;
    
    let roomCount = 0;
    let isLocked = false;
    
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
    
    const showConfirmation = (title, body) => {
        return new Promise((resolve) => {
            const modalEl = document.querySelector(SELECTORS.modal);
            modalEl.querySelector(SELECTORS.modalTitle).textContent = title;
            modalEl.querySelector(SELECTORS.modalBody).textContent = body;
            modalEl.classList.add('visible');
            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                modalEl.querySelector(SELECTORS.modalConfirm).onclick = null;
                modalEl.querySelector(SELECTORS.modalCancel).onclick = null;
                resolve(result);
            };
            modalEl.querySelector(SELECTORS.modalConfirm).onclick = () => cleanup(true);
            modalEl.querySelector(SELECTORS.modalCancel).onclick = () => cleanup(false);
        });
    };

    function showCopyOptionsModal() {
        return new Promise((resolve) => {
            const modal = document.querySelector(SELECTORS.copyOptionsModal);
            modal.classList.add('visible');
            const confirmBtn = document.querySelector(SELECTORS.copyOptionsConfirm);
            const cancelBtn = document.querySelector(SELECTORS.copyOptionsCancel);
            
            const cleanup = (result) => {
                modal.classList.remove('visible');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(result);
            };
            
            confirmBtn.onclick = () => {
                const options = {
                    customer: document.querySelector(SELECTORS.copyCustomerInfo).checked,
                    details: document.querySelector(SELECTORS.copyRoomDetails).checked,
                    summary: document.querySelector(SELECTORS.copySummary).checked,
                };
                cleanup(options);
            };
            
            cancelBtn.onclick = () => cleanup(false);
        });
    }

    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        const room = frag.querySelector(SELECTORS.room);
        room.dataset.index = roomCount;
        populatePriceOptions(room.querySelector(SELECTORS.roomPricePerM), PRICING.fabric);
        
        // Make sure labels on text fields in new rooms are styled correctly
        const roomLabelBg = room.querySelector('.m3-text-field.outlined label');
        if (roomLabelBg) {
           roomLabelBg.style.backgroundColor = 'var(--surface-container)';
        }

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
        
        const hasItems = created.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length > 0;
        if (!hasItems) addSet(created);

        renumber(); recalcAll(); saveData(); updateLockState();
        created.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }

    function populatePriceOptions(selectEl, prices) {
        selectEl.innerHTML = `<option value="" hidden>เลือก</option>`;
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
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
            }
        }
        toggleSetFabricUI(created); renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มจุดผ้าม่านแล้ว', 'success');
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
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
            }
        }
        renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มรายการตกแต่งแล้ว', 'success');
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
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
            }
        } else {
            addWall(created.querySelector('[data-act="add-wall"]'));
        }

        renumber(); recalcAll(); saveData(); updateLockState();
        if (!prefill) showToast('เพิ่มรายการวอลเปเปอร์แล้ว', 'success');
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

    async function clearDeco(btn) { 
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return;
        btn.closest(SELECTORS.decoItem).querySelectorAll('input, select').forEach(el => { el.value = ''; });
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลตกแต่งแล้ว', 'success');
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
        const item = btn.closest('.set, .deco, .wallpaper');
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        btn.querySelector('[data-suspend-text]').textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }

    async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); }
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); item.querySelectorAll('input').forEach(el => el.value = ''); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); }
    
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            
            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = `${iIdx + 1}`;
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
                const priceTotalEl = set.querySelector('[data-set-price-total]');
                const priceOpaqueEl = set.querySelector('[data-set-price-opaque]');
                const priceSheerEl = set.querySelector('[data-set-price-sheer]');
                const yardageOpaqueEl = set.querySelector('[data-set-yardage-opaque]');
                const yardageSheerEl = set.querySelector('[data-set-yardage-sheer]');
                const trackOpaqueEl = set.querySelector('[data-set-opaque-track]');
                const trackSheerEl = set.querySelector('[data-set-sheer-track]');

                if (set.dataset.suspended === 'true') { 
                    priceTotalEl.textContent = '0';
                    priceOpaqueEl.textContent = '0';
                    priceSheerEl.textContent = '0';
                    yardageOpaqueEl.textContent = '0';
                    yardageSheerEl.textContent = '0';
                    trackOpaqueEl.textContent = '0';
                    trackSheerEl.textContent = '0';
                    return; 
                }

                const w = clamp01(set.querySelector('input[name="width_m"]').value), h = clamp01(set.querySelector('input[name="height_m"]').value);
                const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]').value;
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
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
                priceTotalEl.textContent = fmt(opaquePrice + sheerPrice, 0, true);
                priceOpaqueEl.textContent = fmt(opaquePrice, 0, true);
                priceSheerEl.textContent = fmt(sheerPrice, 0, true);
                yardageOpaqueEl.textContent = fmt(opaqueYards, 2);
                yardageSheerEl.textContent = fmt(sheerYards, 2);
                trackOpaqueEl.textContent = fmt(opaqueTrack, 2);
                trackSheerEl.textContent = fmt(sheerTrack, 2);
                roomSum += opaquePrice + sheerPrice;
                grandOpaqueYards += opaqueYards; grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack; grandSheerTrack += sheerTrack;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const summaryEl = deco.querySelector('[data-deco-summary]');
                if (deco.dataset.suspended === 'true') { summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.หลา`; return; }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value), h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]').value);
                const areaSqyd = w * h * SQM_TO_SQYD;
                const decoPrice = Math.round(areaSqyd * price);
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(decoPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(areaSqyd, 2)}</span> ตร.หลา`;
                roomSum += decoPrice;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
                if (wallpaper.dataset.suspended === 'true') { summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`; return; }
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                const totalWidth = [...wallpaper.querySelectorAll('[name="wall_width_m"]')].reduce((sum, input) => sum + clamp01(input.value), 0);
                const totalAreaSqm = totalWidth * h;
                const rollsNeeded = totalAreaSqm > 0 ? Math.ceil(totalAreaSqm / WALLPAPER_SQM_PER_ROLL) : 0;
                const wallpaperPrice = rollsNeeded * pricePerRoll;
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalAreaSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${fmt(rollsNeeded, 0)}</span> ม้วน`;
                roomSum += wallpaperPrice;
            });
            
            const totalItemsInRoom = room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
            const totalUnitsInRoom = [...room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`)].reduce((sum, set) => sum + (set.querySelector('select[name="fabric_variant"]').value === "ทึบ&โปร่ง" ? 2 : 1), 0) + room.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
            
            const brief = room.querySelector("[data-room-brief]");
            if (brief) brief.innerHTML = `<span class="num">${fmt(totalItemsInRoom, 0, true)} จุด</span> • <span class="num">${fmt(totalUnitsInRoom, 0, true)} ชุด</span> • <span class="num price">${fmt(roomSum, 0, true)} ฿</span>`;
            grand += roomSum;
        });

        const totalSets = [...document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`)].reduce((sum, set) => sum + (set.querySelector('select[name="fabric_variant"]').value === "ทึบ&โปร่ง" ? 2 : 1), 0);
        const totalDeco = document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        const totalPoints = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = fmt(totalPoints, 0, true);
        document.querySelector(SELECTORS.setCountSets).textContent = fmt(totalSets, 0, true);
        document.querySelector(SELECTORS.setCountDeco).textContent = fmt(totalDeco, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
    }

    function buildPayload() {
        return {
            customer_name: document.querySelector('input[name="customer_name"]').value || "",
            customer_address: document.querySelector('input[name="customer_address"]').value || "",
            customer_phone: document.querySelector('input[name="customer_phone"]').value || "",
            app_version: APP_VERSION,
            generated_at: new Date().toISOString(),
            rooms: [...document.querySelectorAll(SELECTORS.room)].map(room => ({
                room_name: room.querySelector(SELECTORS.roomNameInput).value || "",
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                style: room.querySelector(SELECTORS.roomStyle).value,
                sets: [...room.querySelectorAll(SELECTORS.set)].map(set => ({
                    width_m: clamp01(set.querySelector('input[name="width_m"]').value), height_m: clamp01(set.querySelector('input[name="height_m"]').value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value, open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: clamp01(set.querySelector('select[name="sheer_price_per_m"]').value), is_suspended: set.dataset.suspended === 'true',
                })),
                decorations: [...room.querySelectorAll(SELECTORS.decoItem)].map(deco => ({
                    type: deco.querySelector('[name="deco_type"]').value, width_m: clamp01(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(deco.querySelector('[name="deco_height_m"]').value), price_sqyd: clamp01(deco.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: deco.dataset.suspended === 'true',
                })),
                wallpapers: [...room.querySelectorAll(SELECTORS.wallpaperItem)].map(wp => ({
                    height_m: clamp01(wp.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: clamp01(wp.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: [...wp.querySelectorAll('[name="wall_width_m"]')].map(input => clamp01(input.value)),
                    is_suspended: wp.dataset.suspended === 'true',
                }))
            }))
        };
    }
    
    function buildTextPayload(options) {
        const payload = buildPayload();
        let text = "";

        if (options.customer) {
            text += "✅ ข้อมูลลูกค้า\n";
            text += `ชื่อ: ${payload.customer_name}\n`;
            text += `ที่อยู่: ${payload.customer_address}\n`;
            text += `เบอร์โทร: ${payload.customer_phone}\n\n`;
        }

        if (options.details) {
            text += "✅ รายละเอียดห้อง\n";
            payload.rooms.forEach((room, roomIndex) => {
                const roomName = room.room_name || `ห้อง ${String(roomIndex + 1).padStart(2, '0')}`;
                text += `\n**${roomName}** (สไตล์: ${room.style}, ราคาผ้าทึบ: ${fmt(room.price_per_m_raw, 0, true)} บ./ม.)\n`;

                room.sets.forEach((set, setIndex) => {
                    if (set.is_suspended) return;
                    let details = `  • จุดที่ ${setIndex + 1} (${set.width_m}x${set.height_m} ม.): ผ้า${set.fabric_variant}`;
                    if (set.open_type) details += `, เปิด${set.open_type}`;
                    if (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") {
                        details += `, ราคาผ้าโปร่ง: ${fmt(set.sheer_price_per_m, 0, true)} บ./ม.`;
                    }
                    text += `${details}\n`;
                });

                room.decorations.forEach((deco, decoIndex) => {
                    if (deco.is_suspended) return;
                    text += `  • รายการตกแต่งที่ ${decoIndex + 1}: ${deco.type} (${deco.width_m}x${deco.height_m} ม.) ราคา: ${fmt(deco.price_sqyd, 0, true)} บ./ตร.หลา\n`;
                });

                room.wallpapers.forEach((wp, wpIndex) => {
                    if (wp.is_suspended) return;
                    const totalWidth = wp.widths.reduce((sum, w) => sum + w, 0);
                    const totalAreaSqm = totalWidth * wp.height_m;
                    const rollsNeeded = totalAreaSqm > 0 ? Math.ceil(totalAreaSqm / WALLPAPER_SQM_PER_ROLL) : 0;
                    text += `  • วอลเปเปอร์ที่ ${wpIndex + 1}: สูง ${wp.height_m} ม., กว้างรวม ${fmt(totalWidth, 2)} ม. ราคา: ${fmt(wp.price_per_roll, 0, true)} บ./ม้วน, ใช้ ${rollsNeeded} ม้วน\n`;
                });
            });
            text += "\n";
        }
        
        if (options.summary) {
            text += "✅ สรุปยอดรวม\n";
            text += `ราคารวม: ${document.querySelector(SELECTORS.grandTotal).textContent} บาท\n`;
            text += `จำนวนชุดผ้าม่าน: ${document.querySelector(SELECTORS.setCountSets).textContent} ชุด\n`;
            text += `จำนวนรายการตกแต่ง: ${document.querySelector(SELECTORS.setCountDeco).textContent} ชุด\n`;
            text += `ผ้าทึบที่ต้องใช้: ${document.querySelector(SELECTORS.grandFabric).textContent}\n`;
            text += `ผ้าโปร่งที่ต้องใช้: ${document.querySelector(SELECTORS.grandSheerFabric).textContent}\n`;
        }
        return text.trim();
    }


    const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); });
    
    function saveData(payload) {
        if (!payload) payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function updateLockState() {
        document.querySelectorAll('input, select, button').forEach(el => {
            if (el.id === 'lockBtn' || el.closest('.m3-app-bar-actions')) return;
            el.disabled = isLocked;
        });
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const lockIcon = lockBtn.querySelector('.lock-icon');
        lockIcon.textContent = isLocked ? 'lock' : 'lock_open';
    }
    
    function toggleLock() { isLocked = !isLocked; updateLockState(); showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', isLocked ? 'warning' : 'success'); }
    
    function formatNumericInput(e) {
        const input = e.target;
        let val = input.value.replace(/[^0-9]/g, '');
        input.value = val ? parseInt(val, 10).toLocaleString('th-TH') : '';
    }

    async function importData() {
        const modal = document.querySelector(SELECTORS.importModal);
        const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const data = JSON.parse(jsonText);
            if (!data || !data.rooms) { throw new Error("Invalid JSON structure"); }
            
            if (await showConfirmation('นำเข้าข้อมูล', 'การนำเข้าข้อมูลจะลบข้อมูลปัจจุบันทั้งหมด คุณแน่ใจหรือไม่?')) {
                document.querySelector('input[name="customer_name"]').value = data.customer_name || "";
                document.querySelector('input[name="customer_address"]').value = data.customer_address || "";
                document.querySelector('input[name="customer_phone"]').value = data.customer_phone || "";
                roomsEl.innerHTML = "";
                roomCount = 0;
                data.rooms.forEach(addRoom);
                saveData(data);
                modal.classList.remove('visible');
                showToast("นำเข้าข้อมูลเรียบร้อยแล้ว", "success");
            }

        } catch (err) {
            showToast("ข้อมูล JSON ไม่ถูกต้อง: " + err.message, "error");
            console.error(err);
        }
    }

    document.addEventListener("change", e => {
        if (e.target.matches('select[name="fabric_variant"]')) {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
        debouncedRecalcAndSave();
    });

    document.addEventListener("input", e => {
        if(e.target.matches('[name="deco_price_sqyd"], [name="wallpaper_price_roll"]')) {
            formatNumericInput(e);
        }
        debouncedRecalcAndSave();
    });

    document.addEventListener("click", async (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const act = btn.dataset.act;
        if (btn.type !== 'submit') e.preventDefault();
        
        const actions = {
            'del-room': delRoom, 'del-set': delSet, 'del-deco': delDeco, 'del-wallpaper': delWallpaper, 'del-wall': delWall,
            'add-set': (b) => addSet(b.closest(SELECTORS.room)),
            'add-deco': (b) => addDeco(b.closest(SELECTORS.room)),
            'add-wallpaper': (b) => addWallpaper(b.closest(SELECTORS.room)),
            'add-wall': (b) => addWall(b),
            'clear-set': clearSet, 'clear-deco': clearDeco, 'clear-wallpaper': clearWallpaper,
            'toggle-suspend': toggleSuspend
        };

        if (actions[act]) {
            actions[act](btn);
        } else if (btn.id === SELECTORS.addRoomFab.slice(1)) {
            addRoom();
        } else if (btn.id === SELECTORS.clearAllBtn.slice(1)) {
            clearAllData();
        } else if (btn.id === SELECTORS.lockBtn.slice(1)) {
            toggleLock();
        } else if (btn.id === SELECTORS.copyJsonBtn.slice(1)) {
            navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2))
                .then(() => showToast("คัดลอก JSON แล้ว", "success"))
                .catch(err => showToast("ไม่สามารถคัดลอกได้: " + err, "error"));
        } else if (btn.id === SELECTORS.copyTextBtn.slice(1)) {
            const options = await showCopyOptionsModal();
            if (options) {
                const text = buildTextPayload(options);
                navigator.clipboard.writeText(text)
                    .then(() => showToast("คัดลอกข้อความแล้ว", "success"))
                    .catch(err => showToast("ไม่สามารถคัดลอกได้: " + err, "error"));
            }
        }
    });

    // Menu and Popups Logic
    const menuBtn = document.querySelector(SELECTORS.menuBtn);
    const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
    const summaryBtn = document.querySelector(SELECTORS.summaryBtn);
    const summaryPopup = document.querySelector(SELECTORS.summaryPopup);

    menuBtn.addEventListener('click', () => menuDropdown.classList.toggle('show'));
    summaryBtn.addEventListener('click', () => summaryPopup.classList.toggle('show'));
    
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        menuDropdown.classList.remove('show');
        const modal = document.querySelector(SELECTORS.importModal);
        document.querySelector(SELECTORS.importJsonArea).value = '';
        modal.classList.add('visible');
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        menuDropdown.classList.remove('show');
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
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener('click', importData);
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });

    document.addEventListener('click', (e) => {
        if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
        if (!summaryBtn.contains(e.target) && !summaryPopup.contains(e.target)) {
            summaryPopup.classList.remove('show');
        }
    });

    orderForm.addEventListener("submit", () => {
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
        showToast("ส่งข้อมูลแล้ว...", "success");
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
        recalcAll(); // Initial calculation on load
    });
})();