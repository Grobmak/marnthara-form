(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3; // This constant will no longer be used for calculation

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
        wallpaperRolls: (totalWidth, height) => {
            if (totalWidth <= 0 || height <= 0) return 0;
            const stripsPerRoll = Math.floor(10 / height);
            if (stripsPerRoll === 0) return Infinity; // Prevent division by zero
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        }
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', copyJsonBtn: '#copyJsonBtn', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomHeaderBtn: '#addRoomHeaderBtn', submitBtn: '#submitBtn',
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
        if (!container) return; // Add a check to ensure container exists
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;

        if (type === 'success') toast.classList.add('toast-success');
        else if (type === 'warning') toast.classList.add('toast-warning');
        else if (type === 'error') toast.classList.add('toast-error');
        else { toast.style.backgroundColor = 'var(--card-bg)'; toast.style.color = 'var(--fg)'; }

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
            if (!modalEl) { resolve(true); return; } // Resolve immediately if modal doesn't exist
            modalEl.querySelector(SELECTORS.modalTitle).textContent = title;
            modalEl.querySelector(SELECTORS.modalBody).textContent = body;
            modalEl.classList.add('visible');
            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                const confirmBtn = modalEl.querySelector(SELECTORS.modalConfirm);
                const cancelBtn = modalEl.querySelector(SELECTORS.modalCancel);
                if (confirmBtn) confirmBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
                resolve(result);
            };
            modalEl.querySelector(SELECTORS.modalConfirm).onclick = () => cleanup(true);
            modalEl.querySelector(SELECTORS.modalCancel).onclick = () => cleanup(false);
        });
    };

    function showCopyOptionsModal() {
        return new Promise((resolve) => {
            const modal = document.querySelector(SELECTORS.copyOptionsModal);
            if (!modal) { resolve(false); return; }
            modal.classList.add('visible');
            const confirmBtn = document.querySelector(SELECTORS.copyOptionsConfirm);
            const cancelBtn = document.querySelector(SELECTORS.copyOptionsCancel);
            
            const cleanup = (result) => {
                modal.classList.remove('visible');
                if (confirmBtn) confirmBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
                resolve(result);
            };
            
            confirmBtn.onclick = () => {
                const options = {
                    customer: document.querySelector(SELECTORS.copyCustomerInfo)?.checked ?? false,
                    details: document.querySelector(SELECTORS.copyRoomDetails)?.checked ?? false,
                    summary: document.querySelector(SELECTORS.copySummary)?.checked ?? false,
                };
                cleanup(options);
            };
            
            cancelBtn.onclick = () => cleanup(false);
        });
    }
    
    function formatPriceInput(event) {
        let input = event.target;
        let value = input.value.replace(/,/g, '');
        if (value === '' || isNaN(value)) {
            input.value = '';
            return;
        }
        let number = parseFloat(value);
        input.value = fmt(number, 0, true);
    }

    function formatDimensionInput(event) {
        let input = event.target;
        let value = input.value;
        if (value === '') {
            return;
        }
        let number = parseFloat(value);
        if (isNaN(number)) {
            input.value = '';
            return;
        }
        input.value = fmt(number, 2);
    }

    function setupDimensionInput(el) {
        if (el) {
            el.addEventListener('blur', formatDimensionInput);
        }
    }

    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Room template not found."); return; }
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
        
        const hasItems = created.querySelectorAll(SELECTORS.set, SELECTORS.decoItem, SELECTORS.wallpaperItem).length > 0;
        if (!hasItems) addSet(created);

        renumber(); recalcAll(); saveData(); updateLockState();
        created.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }

    function populatePriceOptions(selectEl, prices) {
        if (!selectEl) return;
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
        if (!setsWrap) return;
        const frag = document.querySelector(SELECTORS.setTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Set template not found."); return; }
        setsWrap.appendChild(frag);
        const created = setsWrap.querySelector(`${SELECTORS.set}:last-of-type`);
        populatePriceOptions(created.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);
        
        setupDimensionInput(created.querySelector('[name="width_m"]'));
        setupDimensionInput(created.querySelector('[name="height_m"]'));

        if (prefill) {
            created.querySelector('input[name="width_m"]').value = prefill.width_m ? fmt(prefill.width_m, 2) : "";
            created.querySelector('input[name="height_m"]').value = prefill.height_m ? fmt(prefill.height_m, 2) : "";
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
        if (!decoWrap) return;
        const frag = document.querySelector(SELECTORS.decoTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Deco template not found."); return; }
        decoWrap.appendChild(frag);
        const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);
        
        const priceInput = created.querySelector('[name="deco_price_sqyd"]');
        if(priceInput) {
            priceInput.addEventListener('input', formatPriceInput);
        }

        setupDimensionInput(created.querySelector('[name="deco_width_m"]'));
        setupDimensionInput(created.querySelector('[name="deco_height_m"]'));

        if (prefill) {
            created.querySelector('[name="deco_type"]').value = prefill.type || "";
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m ? fmt(prefill.width_m, 2) : "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m ? fmt(prefill.height_m, 2) : "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmt(prefill.price_sqyd, 0, true);
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
        if (!wallpaperWrap) return;
        const frag = document.querySelector(SELECTORS.wallpaperTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Wallpaper template not found."); return; }
        wallpaperWrap.appendChild(frag);
        const created = wallpaperWrap.querySelector(`${SELECTORS.wallpaperItem}:last-of-type`);
        
        const priceInput = created.querySelector('[name="wallpaper_price_roll"]');
        if(priceInput) {
            priceInput.addEventListener('input', formatPriceInput);
        }

        setupDimensionInput(created.querySelector('[name="wallpaper_height_m"]'));

        if (prefill) {
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m ? fmt(prefill.height_m, 2) : "";
            created.querySelector('[name="wallpaper_price_roll"]').value = fmt(prefill.price_per_roll, 0, true);
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
        const wallsContainer = btn.closest(SELECTORS.wallpaperItem)?.querySelector(SELECTORS.wallsContainer);
        if (!wallsContainer) return;
        const frag = document.querySelector(SELECTORS.wallTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Wall template not found."); return; }
        const created = frag.querySelector('input');
        if (prefillWidth !== undefined) {
            created.value = prefillWidth ? fmt(prefillWidth, 2) : "";
        }
        setupDimensionInput(created);
        wallsContainer.appendChild(frag);
    }

    async function clearDeco(btn) { 
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return;
        btn.closest(SELECTORS.decoItem).querySelectorAll('input, select').forEach(el => { el.value = ''; });
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลตกแต่งแล้ว', 'success');
    }

    function toggleSetFabricUI(setEl) {
        if (!setEl) return;
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        setEl.querySelector(SELECTORS.sheerWrap)?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector('[data-set-options-row]')?.classList.toggle("three-col", hasSheer);
        setEl.querySelector("[data-sheer-price-label]")?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-yardage-label]")?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-track-label]")?.classList.toggle("hidden", !hasSheer);

        const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
        setEl.querySelector("[data-opaque-price-label]")?.classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-yardage-label]")?.classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-track-label]")?.classList.toggle("hidden", !hasOpaque);
    }
    
    function toggleSuspend(btn) {
        const item = btn.closest('.set, .deco-item, .wallpaper-item');
        if (!item) return;
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        const suspendTextEl = btn.querySelector('[data-suspend-text]');
        if (suspendTextEl) suspendTextEl.textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์แล้ว?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }
    async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); if (!set) return; set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); }
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); if (!item) return; item.querySelectorAll('input').forEach(el => el.value = ''); const wallsContainer = item.querySelector(SELECTORS.wallsContainer); if (wallsContainer) wallsContainer.innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); }
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }
    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            const totalItems = items.length;
            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}/${totalItems}` : `${iIdx + 1}`;
            });
        });
    }
    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const style = room.querySelector(SELECTORS.roomStyle)?.value;
            const sPlus = stylePlus(style);
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') { /* ... clear UI ... */ return; }
                const w = clamp01(set.querySelector('input[name="width_m"]')?.value), h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]')?.value;
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                if (w > 0 && h > 0) {
                    if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                        const yards = CALC.fabricYardage(style, w);
                        const price = (baseRaw + sPlus + hPlus) * h * w; // Re-calculate price
                        opaquePrice = price; opaqueYards = yards; opaqueTrack = w;
                    }
                    if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                        const sheerPricePerM = toNum(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                        const yards = CALC.fabricYardage(style, w);
                        const price = (sheerPricePerM + sPlus + hPlus) * h * w; // Re-calculate price
                        sheerPrice = price; sheerYards = yards; sheerTrack = w;
                    }
                }
                const setPrice = opaquePrice + sheerPrice;
                const opaqueYardageText = opaqueYards > 0 ? `${fmt(opaqueYards, 2)} หลา` : "0.00 หลา";
                const sheerYardageText = sheerYards > 0 ? `${fmt(sheerYards, 2)} หลา` : "0.00 หลา";
                set.querySelector('[data-opaque-price]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-sheer-price]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-opaque-yardage]').textContent = opaqueYardageText;
                set.querySelector('[data-sheer-yardage]').textContent = sheerYardageText;
                set.querySelector('[data-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-sheer-track]').textContent = fmt(sheerTrack, 2);
                roomSum += setPrice;
                grand += setPrice; grandOpaqueYards += opaqueYards; grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack; grandSheerTrack += sheerTrack;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                if (deco.dataset.suspended === 'true') { /* ... clear UI ... */ return; }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const priceSqyd = toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                let totalPrice = 0, totalSqyd = 0;
                if (w > 0 && h > 0 && priceSqyd > 0) {
                    totalSqyd = (w * h) * SQM_TO_SQYD;
                    totalPrice = totalSqyd * priceSqyd;
                }
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <span class="price">${fmt(totalPrice, 0, true)}</span> บ. • ใช้ผ้า: <span class="price">${fmt(totalSqyd, 2)}</span> ตร.หลา`;
                roomSum += totalPrice; grand += totalPrice;
            });
            
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper) => {
                if (wallpaper.dataset.suspended === 'true') { /* ... clear UI ... */ return; }
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                let totalWidth = 0;
                wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(input => { totalWidth += clamp01(input.value); });

                let totalPrice = 0, totalSqm = 0, totalRolls = 0;
                if (h > 0 && totalWidth > 0 && pricePerRoll > 0) {
                    totalSqm = h * totalWidth;
                    totalRolls = CALC.wallpaperRolls(totalWidth, h);
                    totalPrice = totalRolls * pricePerRoll;
                }

                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${fmt(totalPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${fmt(totalRolls, 0, true)}</span> ม้วน`;
                roomSum += totalPrice; grand += totalPrice;
            });
            
            room.querySelector('[data-room-price-total]').textContent = fmt(roomSum, 0, true);
        });
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
        
        let setCountSets = 0;
        document.querySelectorAll(SELECTORS.set).forEach(s => { if(s.dataset.suspended !== 'true') setCountSets++; });
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        
        let setCountDeco = 0;
        document.querySelectorAll(SELECTORS.decoItem).forEach(d => { if(d.dataset.suspended !== 'true') setCountDeco++; });
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
        
        document.querySelector(SELECTORS.setCount).textContent = setCountSets + setCountDeco;
    }
    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer: {
                name: document.querySelector('input[name="customer_name"]').value,
                phone: document.querySelector('input[name="customer_phone"]').value,
                address: document.querySelector('input[name="customer_address"]').value
            },
            rooms: [],
            grandTotal: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            grandFabric: toNum(document.querySelector(SELECTORS.grandFabric).textContent),
            grandSheerFabric: toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent),
            grandOpaqueTrack: toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent),
            grandSheerTrack: toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent),
            totalSets: toNum(document.querySelector(SELECTORS.setCountSets).textContent),
            totalDeco: toNum(document.querySelector(SELECTORS.setCountDeco).textContent)
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector('input[name="room_name"]').value,
                price_per_m_raw: toNum(roomEl.querySelector('select[name="room_price_per_m"]').value),
                style: roomEl.querySelector('select[name="room_style"]').value,
                total_price: toNum(roomEl.querySelector('[data-room-price-total]').textContent),
                sets: [],
                decorations: [],
                wallpapers: []
            };
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const w = toNum(setEl.querySelector('input[name="width_m"]').value);
                const h = toNum(setEl.querySelector('input[name="height_m"]').value);
                const set = {
                    width_m: w,
                    height_m: h,
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                    price: toNum(setEl.querySelector('[data-opaque-price]').textContent) + toNum(setEl.querySelector('[data-sheer-price]').textContent),
                    is_suspended: setEl.dataset.suspended === 'true',
                    opaque_yardage: toNum(setEl.querySelector('[data-opaque-yardage]').textContent),
                    sheer_yardage: toNum(setEl.querySelector('[data-sheer-yardage]').textContent),
                    opaque_track_m: toNum(setEl.querySelector('[data-opaque-track]').textContent),
                    sheer_track_m: toNum(setEl.querySelector('[data-sheer-track]').textContent)
                };
                roomData.sets.push(set);
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const deco = {
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                    price: toNum(decoEl.querySelector('[data-deco-summary] .price').textContent),
                    is_suspended: decoEl.dataset.suspended === 'true'
                };
                roomData.decorations.push(deco);
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const widths = [];
                wallpaperEl.querySelectorAll('[name="wall_width_m"]').forEach(input => { widths.push(toNum(input.value)); });
                const wallpaper = {
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths,
                    total_width: widths.reduce((sum, w) => sum + w, 0),
                    price: toNum(wallpaperEl.querySelector('[data-wallpaper-summary] .price').textContent),
                    is_suspended: wallpaperEl.dataset.suspended === 'true'
                };
                roomData.wallpapers.push(wallpaper);
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function loadPayload(payload) {
        if (!payload || !payload.rooms) {
            console.warn("Invalid payload, starting fresh.");
            addRoom();
            return;
        }
        roomsEl.innerHTML = "";
        roomCount = 0;
        if(payload.customer) {
            document.querySelector('input[name="customer_name"]').value = payload.customer.name || "";
            document.querySelector('input[name="customer_phone"]').value = payload.customer.phone || "";
            document.querySelector('input[name="customer_address"]').value = payload.customer.address || "";
        }
        (payload.rooms || []).forEach(r => addRoom(r));
    }
    
    function saveData() {
        if(isLocked) return;
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function updateLockState() {
        const payload = buildPayload();
        isLocked = payload.rooms.length > 0 && payload.rooms[0].sets.length > 0;
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const lockText = lockBtn.querySelector('.lock-text');
        const lockIcon = lockBtn.querySelector('.lock-icon');
        if (isLocked) {
            lockText.textContent = 'ปลดล็อค';
            lockIcon.textContent = '🔓';
        } else {
            lockText.textContent = 'ล็อค';
            lockIcon.textContent = '🔒';
        }
    }

    function copyToClipboard(text, message) {
        if (!navigator.clipboard) { showToast('ไม่รองรับการคัดลอกบนเบราว์เซอร์นี้', 'error'); return; }
        navigator.clipboard.writeText(text).then(() => {
            showToast(message, 'success');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToast('คัดลอกไม่สำเร็จ', 'error');
        });
    }

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);

    roomsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const action = btn.dataset.act;
        const item = btn.closest(SELECTORS.room) || btn.closest(SELECTORS.set) || btn.closest(SELECTORS.decoItem) || btn.closest(SELECTORS.wallpaperItem);

        if (action === "add-set") addSet(item);
        else if (action === "add-deco") addDeco(item);
        else if (action === "add-wallpaper") addWallpaper(item);
        else if (action === "add-wall") addWall(btn);
        else if (action === "del-room") delRoom(btn);
        else if (action === "del-set") delSet(btn);
        else if (action === "del-deco") delDeco(btn);
        else if (action === "del-wallpaper") delWallpaper(btn);
        else if (action === "del-wall") delWall(btn);
        else if (action === "clear-set") clearSet(btn);
        else if (action === "clear-deco") clearDeco(btn);
        else if (action === "clear-wallpaper") clearWallpaper(btn);
        else if (action === "toggle-suspend") toggleSuspend(btn);
    });

    roomsEl.addEventListener('input', debounce(recalcAll));

    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        if (isLocked) {
            isLocked = false;
            showToast('ปลดล็อคแล้ว', 'warning');
        } else {
            isLocked = true;
            showToast('ล็อคข้อมูลแล้ว', 'success');
        }
        updateLockState();
    });

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        copyToClipboard(JSON.stringify(payload, null, 2), "คัดลอก JSON แล้ว");
    });
    
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (!options) return;
        let text = "";
        const payload = buildPayload();
        if (options.customer) {
            const cust = payload.customer;
            if (cust.name) text += `ชื่อลูกค้า: ${cust.name}\n`;
            if (cust.phone) text += `เบอร์โทร: ${cust.phone}\n`;
            if (cust.address) text += `รายละเอียด: ${cust.address}\n`;
            text += "\n";
        }
        if (options.details) {
            payload.rooms.forEach(room => {
                text += `ห้อง: ${room.room_name}\n`;
                text += ` ราคาผ้า: ${fmt(room.price_per_m_raw, 0, true)} บ./ม. • สไตล์: ${room.style}\n`;
                room.sets.forEach((set, idx) => {
                    if (set.is_suspended) return;
                    text += `  - จุดที่ ${idx + 1}: กว้าง ${fmt(set.width_m, 2)} ม. x สูง ${fmt(set.height_m, 2)} ม.\n`;
                    text += `    ชนิด: ${set.fabric_variant} • เปิด: ${set.open_type || 'ไม่มี'}\n`;
                    text += `    ราคา: ${fmt(set.price, 0, true)} บ. • ใช้ผ้า: ${fmt(set.opaque_yardage + set.sheer_yardage, 2)} หลา\n`;
                    if (set.sheer_price_per_m) text += `    ราคาผ้าโปร่ง: ${fmt(set.sheer_price_per_m, 0, true)} บ./ม.\n`;
                });
                room.decorations.forEach((deco, idx) => {
                    if (deco.is_suspended) return;
                    text += `  - รายการตกแต่งที่ ${idx + 1}: ${deco.type}\n`;
                    text += `    ขนาด: ${fmt(deco.width_m, 2)} ม. x ${fmt(deco.height_m, 2)} ม.\n`;
                    text += `    ราคา/ตร.หลา: ${fmt(deco.price_sqyd, 0, true)} บ. • รวม: ${fmt(deco.price, 0, true)} บ.\n`;
                });
                room.wallpapers.forEach((wallpaper, idx) => {
                    if (wallpaper.is_suspended) return;
                    text += `  - วอลเปเปอร์ที่ ${idx + 1}: สูง ${fmt(wallpaper.height_m, 2)} ม.\n`;
                    text += `    ราคา/ม้วน: ${fmt(wallpaper.price_per_roll, 0, true)} บ. • รวม: ${fmt(wallpaper.price, 0, true)} บ.\n`;
                    text += `    ความกว้างผนัง: ${wallpaper.widths.map(w => fmt(w, 2)).join(', ')}\n`;
                    text += `    รวม ${fmt(wallpaper.total_width, 2)} ม. • ใช้ ${fmt(CALC.wallpaperRolls(wallpaper.total_width, wallpaper.height_m), 0, true)} ม้วน\n`;
                });
                text += `\nราคาห้องนี้: ${fmt(room.total_price, 0, true)} บ.\n\n`;
            });
        }
        if (options.summary) {
            text += "--- สรุปยอดรวม ---\n";
            text += `ราคารวม: ${fmt(payload.grandTotal, 0, true)} บาท\n`;
            text += `จำนวนจุด: ${payload.totalSets + payload.totalDeco} จุด\n`;
            text += `ใช้ผ้าทึบ: ${fmt(payload.grandFabric, 2)} หลา\n`;
            text += `ใช้ผ้าโปร่ง: ${fmt(payload.grandSheerFabric, 2)} หลา\n`;
            text += `ใช้รางทึบ: ${fmt(payload.grandOpaqueTrack, 2)} ม.\n`;
            text += `ใช้รางโปร่ง: ${fmt(payload.grandSheerTrack, 2)} ม.\n`;
        }
        copyToClipboard(text, "คัดลอกข้อความแล้ว");
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        if (menuDropdown) menuDropdown.classList.toggle('show');
    });

    // Close menu when clicking outside
    window.addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const menuBtn = document.querySelector(SELECTORS.menuBtn);
        if (menuDropdown && menuBtn && !menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
    });

    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        const importModal = document.querySelector(SELECTORS.importModal);
        if (importModal) importModal.classList.add('visible');
    });
    
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marnthara_data_${new Date().toISOString().substring(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('ข้อมูลถูกดาวน์โหลดแล้ว', 'success');
    });
    
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        const importModal = document.querySelector(SELECTORS.importModal);
        if (importModal) importModal.classList.remove('visible');
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const importJsonArea = document.querySelector(SELECTORS.importJsonArea);
        try {
            const payload = JSON.parse(importJsonArea.value);
            loadPayload(payload);
            showToast('นำเข้าข้อมูลสำเร็จแล้ว', 'success');
            document.querySelector(SELECTORS.importModal)?.classList.remove('visible');
            saveData();
        } catch (e) {
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
            console.error(e);
        }
    });

    orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        const payloadInput = document.querySelector(SELECTORS.payloadInput);
        if (payloadInput) payloadInput.value = JSON.stringify(payload);
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                loadPayload(payload);
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY); 
                addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
    });
})();