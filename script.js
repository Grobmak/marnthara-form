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
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended-room');
                created.querySelector('[data-suspend-room-text]').textContent = 'ใช้งานห้อง';
            }
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
        if (!decoWrap) return;
        const frag = document.querySelector(SELECTORS.decoTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Deco template not found."); return; }
        decoWrap.appendChild(frag);
        const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);
        if (prefill) {
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
        if (!wallpaperWrap) return;
        const frag = document.querySelector(SELECTORS.wallpaperTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Wallpaper template not found."); return; }
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
        const wallsContainer = btn.closest(SELECTORS.wallpaperItem)?.querySelector(SELECTORS.wallsContainer);
        if (!wallsContainer) return;
        const frag = document.querySelector(SELECTORS.wallTpl)?.content?.cloneNode(true);
        if (!frag) { console.error("Wall template not found."); return; }
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

    async function toggleSuspendRoom(btn) {
        const room = btn.closest(SELECTORS.room);
        if (!room) return;
        const isSuspended = !(room.dataset.suspended === 'true');
        const confirmationText = `ยืนยันการ${isSuspended ? 'ระงับ' : 'ใช้งาน'}ห้องนี้และรายการทั้งหมดภายใน?`;
        if (!await showConfirmation('ระงับ/ใช้งานห้อง', confirmationText)) return;
        
        room.dataset.suspended = isSuspended;
        room.classList.toggle('is-suspended-room', isSuspended);
        room.querySelector('[data-suspend-room-text]').textContent = isSuspended ? 'ใช้งานห้อง' : 'ระงับห้อง';
        
        // Also toggle suspend state for all items inside the room
        room.querySelectorAll('.set, .deco-item, .wallpaper-item').forEach(item => {
            item.dataset.suspended = isSuspended;
            item.classList.toggle('is-suspended', isSuspended);
            const suspendTextEl = item.querySelector('[data-suspend-text]');
            if (suspendTextEl) suspendTextEl.textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        });

        recalcAll(); saveData();
        showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function clearRoom(btn) {
        const room = btn.closest(SELECTORS.room);
        if (!room) return;
        if (!await showConfirmation('ล้างข้อมูลห้อง', 'ยืนยันการล้างข้อมูลทั้งหมดในห้องนี้?')) return;
        
        room.querySelectorAll('input').forEach(i => i.value = '');
        room.querySelectorAll('select').forEach(s => s.value = s.querySelector('option[hidden]') ? '' : 'ทึบ');
        
        const setsContainer = room.querySelector(SELECTORS.setsContainer);
        if (setsContainer) setsContainer.innerHTML = '';
        
        const decoContainer = room.querySelector(SELECTORS.decorationsContainer);
        if (decoContainer) decoContainer.innerHTML = '';

        const wallpaperContainer = room.querySelector(SELECTORS.wallpapersContainer);
        if (wallpaperContainer) wallpaperContainer.innerHTML = '';

        room.dataset.suspended = 'false';
        room.classList.remove('is-suspended-room');
        const suspendRoomTextEl = room.querySelector('[data-suspend-room-text]');
        if (suspendRoomTextEl) suspendRoomTextEl.textContent = 'ระงับห้อง';
        
        addSet(room); // Add a new empty set to the room
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลห้องแล้ว', 'success');
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
        let setCount = 0, setCountSets = 0, setCountDeco = 0;
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const sets = room.querySelectorAll(SELECTORS.set);
            const decos = room.querySelectorAll(SELECTORS.decoItem);
            const wallpapers = room.querySelectorAll(SELECTORS.wallpaperItem);
            
            const items = [...sets, ...decos, ...wallpapers];
            setCountSets += sets.length;
            setCountDeco += decos.length + wallpapers.length;
            
            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = items.length > 1 ? `${iIdx + 1}/${items.length}` : `${iIdx + 1}`;
            });
            
            setCount += items.length;
            const briefEl = room.querySelector('[data-room-brief]');
            if(briefEl) briefEl.innerHTML = `<span class="num">จุด ${sets.length}</span> • <span class="num">ชุด ${decos.length + wallpapers.length}</span> • ราคา <span class="num price">0</span> บาท`;
        });
        document.querySelector(SELECTORS.setCount).textContent = setCount;
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
    }

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const style = room.querySelector(SELECTORS.roomStyle)?.value;
            const sPlus = stylePlus(style);
            
            const isRoomSuspended = room.dataset.suspended === 'true';

            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                const isSetSuspended = isRoomSuspended || set.dataset.suspended === 'true';
                
                const w = clamp01(set.querySelector('input[name="width_m"]')?.value), h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]')?.value;

                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                
                if (!isSetSuspended && w > 0 && h > 0) {
                    if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                        opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                        opaqueYards = CALC.fabricYardage(style, w);
                        opaqueTrack = w;
                    }
                    if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                        const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                        sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                        sheerYards = CALC.fabricYardage(style, w);
                        sheerTrack = w;
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
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isDecoSuspended = isRoomSuspended || deco.dataset.suspended === 'true';
                const summaryEl = deco.querySelector('[data-deco-summary]');
                
                let decoPrice = 0, areaSqyd = 0;
                if (!isDecoSuspended) {
                    const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value), h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                    const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                    areaSqyd = w * h * SQM_TO_SQYD;
                    decoPrice = Math.round(areaSqyd * price);
                }
                
                if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">${fmt(decoPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(areaSqyd, 2)}</span> ตร.หลา`;
                roomSum += decoPrice;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const isWallpaperSuspended = isRoomSuspended || wallpaper.dataset.suspended === 'true';
                const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
                
                let wallpaperPrice = 0, totalAreaSqm = 0, totalRolls = 0;
                if (!isWallpaperSuspended) {
                    const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                    const totalWidth = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                    
                    totalAreaSqm = totalWidth * h;
                    totalRolls = CALC.wallpaperRolls(totalWidth, h);
                    wallpaperPrice = Math.round(totalRolls * pricePerRoll);
                }

                if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalAreaSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${fmt(totalRolls, 0, true)}</span> ม้วน`;
                roomSum += wallpaperPrice;
            });

            grand += roomSum;
            const briefEl = room.querySelector('[data-room-brief]');
            if (briefEl) {
                const briefText = briefEl.innerHTML;
                briefEl.innerHTML = briefText.replace(/ราคา <span class="num price">.*?<\/span> บ./, `ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บ.`);
            }
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;

        saveData();
    }
    
    function buildPayload() {
        const rooms = [];
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomName = roomEl.querySelector(SELECTORS.roomNameInput)?.value;
            if (!roomName) return;

            const roomData = {
                room_name: roomName,
                price_per_m: toNum(roomEl.querySelector(SELECTORS.roomPricePerM)?.value),
                style: roomEl.querySelector(SELECTORS.roomStyle)?.value,
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const width_m = toNum(setEl.querySelector('input[name="width_m"]')?.value);
                const height_m = toNum(setEl.querySelector('input[name="height_m"]')?.value);
                if (width_m <= 0 || height_m <= 0) return;
                roomData.sets.push({
                    width_m: width_m,
                    height_m: height_m,
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value,
                    open_type: setEl.querySelector('select[name="open_type"]')?.value,
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value),
                    is_suspended: setEl.dataset.suspended === 'true',
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const decoPrice = toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value);
                if (decoPrice <= 0) return;
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value,
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: decoPrice,
                    is_suspended: decoEl.dataset.suspended === 'true',
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const height = toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value);
                const pricePerRoll = toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value);
                if (height <= 0 || pricePerRoll <= 0) return;
                const widths = Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value));
                roomData.wallpapers.push({
                    height_m: height,
                    price_per_roll: pricePerRoll,
                    widths: widths,
                    is_suspended: wallpaperEl.dataset.suspended === 'true',
                });
            });

            rooms.push(roomData);
        });
        
        return {
            app_version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]')?.value,
            customer_phone: document.querySelector('input[name="customer_phone"]')?.value,
            customer_address: document.querySelector('input[name="customer_address"]')?.value,
            rooms: rooms
        };
    }
    
    function loadPayload(payload) {
        if (!payload) return;
        document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
        document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
        document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
        roomsEl.innerHTML = '';
        roomCount = 0;
        (payload.rooms || []).forEach(r => addRoom(r));
        if (payload.rooms.length === 0) addRoom();
        recalcAll();
        showToast('นำเข้าข้อมูลสำเร็จแล้ว', 'success');
    }

    function buildTextSummary(options) {
        let summary = "";
        const payload = buildPayload();
        
        if (options.customer) {
            summary += `ลูกค้า: ${payload.customer_name || 'ไม่ระบุ'}\n`;
            summary += `เบอร์โทร: ${payload.customer_phone || 'ไม่ระบุ'}\n`;
            summary += `รายละเอียด: ${payload.customer_address || 'ไม่ระบุ'}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach(room => {
                summary += `=== ห้อง ${room.room_name} ${room.is_suspended ? '(ระงับ)' : ''} ===\n`;
                summary += `ราคาผ้าทึบ: ${fmt(room.price_per_m, 0, true)} บ. (${room.style})\n`;

                room.sets.forEach((set, i) => {
                    if (set.is_suspended) return;
                    summary += `  จุดที่ ${i + 1}: กว้าง ${fmt(set.width_m, 2)} ม. x สูง ${fmt(set.height_m, 2)} ม. (${set.fabric_variant}, ${set.open_type})\n`;
                    if (set.fabric_variant === "ทึบ&โปร่ง" || set.fabric_variant === "โปร่ง") {
                        summary += `    ราคาผ้าโปร่ง: ${fmt(set.sheer_price_per_m, 0, true)} บ.\n`;
                    }
                });

                room.decorations.forEach((deco, i) => {
                    if (deco.is_suspended) return;
                    summary += `  ตกแต่งที่ ${i + 1}: ${deco.type}, กว้าง ${fmt(deco.width_m, 2)} ม. x สูง ${fmt(deco.height_m, 2)} ม., ราคา ${fmt(deco.price_sqyd, 0, true)} บ./หลา\n`;
                });

                room.wallpapers.forEach((wallpaper, i) => {
                    if (wallpaper.is_suspended) return;
                    summary += `  วอลเปเปอร์ที่ ${i + 1}: สูง ${fmt(wallpaper.height_m, 2)} ม., ราคา ${fmt(wallpaper.price_per_roll, 0, true)} บ./ม้วน\n`;
                    summary += `    ผนัง: ${wallpaper.widths.map(w => fmt(w, 2) + ' ม.').join(', ')}\n`;
                });
                
                const roomTotalEl = document.querySelector(`[data-room][data-index="${payload.rooms.indexOf(room) + 1}"] .total .price`);
                if (roomTotalEl) {
                    summary += `  ราคารวมห้อง: ${roomTotalEl.textContent} บ.\n`;
                }
                summary += "\n";
            });
        }

        if (options.summary) {
            const grandTotal = document.querySelector(SELECTORS.grandTotal)?.textContent;
            const grandFabric = document.querySelector(SELECTORS.grandFabric)?.textContent;
            const grandSheerFabric = document.querySelector(SELECTORS.grandSheerFabric)?.textContent;
            const grandOpaqueTrack = document.querySelector(SELECTORS.grandOpaqueTrack)?.textContent;
            const grandSheerTrack = document.querySelector(SELECTORS.grandSheerTrack)?.textContent;
            
            summary += "=== สรุปยอดรวม ===\n";
            if (grandTotal) summary += `ราคารวม: ${grandTotal} บ.\n`;
            if (grandFabric) summary += `ผ้าทึบที่ใช้: ${grandFabric}\n`;
            if (grandSheerFabric) summary += `ผ้าโปร่งที่ใช้: ${grandSheerFabric}\n`;
            if (grandOpaqueTrack) summary += `รางทึบที่ใช้: ${grandOpaqueTrack}\n`;
            if (grandSheerTrack) summary += `รางโปร่งที่ใช้: ${grandSheerTrack}\n`;
        }

        return summary;
    }

    function copyToClipboard(text) {
        if (!navigator.clipboard) {
            fallbackCopyToClipboard(text);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            showToast("คัดลอกแล้ว", "success");
        }).catch(err => {
            console.error('Could not copy text: ', err);
            showToast("คัดลอกไม่สำเร็จ", "error");
        });
    }

    function fallbackCopyToClipboard(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            showToast("คัดลอกแล้ว (วิธีสำรอง)", "success");
        } catch (err) {
            console.error('Fallback: Could not copy text: ', err);
            showToast("คัดลอกไม่สำเร็จ (วิธีสำรอง)", "error");
        }
        document.body.removeChild(textArea);
    }
    
    function saveData() {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch(e) {
            console.error("Failed to save data to storage.", e);
            showToast("บันทึกข้อมูลไม่สำเร็จ", "error");
        }
    }

    function updateLockState() {
        const roomInputs = document.querySelectorAll(SELECTORS.roomNameInput);
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        if (roomInputs.length === 1 && !roomInputs[0].value) {
            isLocked = true;
            if (lockBtn) {
                lockBtn.querySelector(".lock-text").textContent = "ล็อค";
                lockBtn.querySelector(".lock-icon").textContent = "🔒";
            }
        } else {
            isLocked = false;
            if (lockBtn) {
                lockBtn.querySelector(".lock-text").textContent = "ปลดล็อค";
                lockBtn.querySelector(".lock-icon").textContent = "🔓";
            }
        }
        document.querySelectorAll(
            `button[data-act^="del-"], button[data-act^="clear-"], button[data-act^="add-"], #clearAllBtn`
        ).forEach(btn => {
            if (btn.dataset.act.includes('room') && btn.dataset.act !== 'add-room') {
                btn.disabled = false;
            } else {
                btn.disabled = isLocked;
            }
        });
        
    }

    document.addEventListener("change", debounce(recalcAll));
    document.addEventListener("input", debounce(recalcAll));

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const action = btn.dataset.act;
        const parentRoom = btn.closest(SELECTORS.room);

        switch (action) {
            case 'add-room': addRoom(); break;
            case 'del-room': delRoom(btn); break;
            case 'add-set': addSet(parentRoom); break;
            case 'del-set': delSet(btn); break;
            case 'clear-set': clearSet(btn); break;
            case 'add-deco': addDeco(parentRoom); break;
            case 'del-deco': delDeco(btn); break;
            case 'clear-deco': clearDeco(btn); break;
            case 'add-wallpaper': addWallpaper(parentRoom); break;
            case 'del-wallpaper': delWallpaper(btn); break;
            case 'clear-wallpaper': clearWallpaper(btn); break;
            case 'add-wall': addWall(btn); recalcAll(); break;
            case 'del-wall': delWall(btn); break;
            case 'toggle-suspend': toggleSuspend(btn); break;
            case 'suspend-room': toggleSuspendRoom(btn); break;
            case 'clear-room': clearRoom(btn); break;
            case 'room-menu': break;
            default: console.warn('Unknown action:', action);
        }
    });

    document.addEventListener("change", (e) => {
        const selectEl = e.target.closest('select[name="fabric_variant"]');
        if (selectEl) {
            toggleSetFabricUI(selectEl.closest(SELECTORS.set));
        }
    });

    document.querySelector('#addRoomHeaderBtn').addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', () => clearAllData());

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        copyToClipboard(JSON.stringify(payload, null, 2));
    });
    
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const textSummary = buildTextSummary(options);
            copyToClipboard(textSummary);
        }
    });
    
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? "ถูกล็อคแล้ว" : "ปลดล็อคแล้ว", isLocked ? "warning" : "success");
    });
    
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });

    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
        const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
        try {
            const payload = JSON.parse(jsonText);
            loadPayload(payload);
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
        } catch(e) {
            showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
        }
    });
    
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "marnthara-input.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast("ส่งออกข้อมูลสำเร็จ", "success");
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