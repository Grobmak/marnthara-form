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
        const item = btn.closest('.set, .deco-item, .wallpaper-item');
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
            const sets = Array.from(room.querySelectorAll(SELECTORS.set));
            const decoItems = Array.from(room.querySelectorAll(SELECTORS.decoItem));
            const wallpaperItems = Array.from(room.querySelectorAll(SELECTORS.wallpaperItem));
            const allItems = [...sets, ...decoItems, ...wallpaperItems];

            const activeSets = sets.filter(s => s.dataset.suspended !== 'true');
            const activeDeco = decoItems.filter(d => d.dataset.suspended !== 'true');
            const activeWallpaper = wallpaperItems.filter(w => w.dataset.suspended !== 'true');

            room.querySelector('[data-room-brief] .num:nth-child(1)').textContent = activeSets.length + activeDeco.length + activeWallpaper.length;
            room.querySelector('[data-room-brief] .num:nth-child(2)').textContent = activeSets.length;
        });

        document.querySelectorAll(SELECTORS.set).forEach((set, sIdx) => {
            const lbl = set.querySelector("[data-item-title]");
            if (lbl) lbl.textContent = `${sIdx + 1}`;
        });
        document.querySelectorAll(SELECTORS.decoItem).forEach((deco, dIdx) => {
            const lbl = deco.querySelector("[data-item-title]");
            if (lbl) lbl.textContent = `${dIdx + 1}`;
        });
        document.querySelectorAll(SELECTORS.wallpaperItem).forEach((item, wIdx) => {
            const lbl = item.querySelector("[data-item-title]");
            if (lbl) lbl.textContent = `${wIdx + 1}`;
        });
    }

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        let totalSets = 0, totalDeco = 0;

        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);

            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                const isSuspended = set.dataset.suspended === 'true';
                if (isSuspended) {
                    set.querySelector('[data-set-price-total]').textContent = "0";
                    set.querySelector('[data-set-yardage-opaque]').textContent = "0.00";
                    set.querySelector('[data-set-yardage-sheer]').textContent = "0.00";
                    set.querySelector('[data-set-opaque-track]').textContent = "0.00";
                    set.querySelector('[data-set-sheer-track]').textContent = "0.00";
                    return;
                }
                const w = clamp01(set.querySelector('input[name="width_m"]').value),
                    h = clamp01(set.querySelector('input[name="height_m"]').value);
                const hPlus = heightPlus(h),
                    variant = set.querySelector('select[name="fabric_variant"]').value;

                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;

                if (w > 0 && h > 0) {
                    if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                        opaquePrice = Math.round((baseRaw + hPlus) * w + sPlus);
                        opaqueYards = CALC.fabricYardage(style, w);
                        opaqueTrack = w;
                    }
                    if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                        const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]').value);
                        sheerPrice = Math.round((sheerBase + hPlus) * w + sPlus);
                        sheerYards = CALC.fabricYardage(style, w);
                        sheerTrack = w;
                    }
                }
                set.querySelector('[data-set-price-total]').textContent = fmt(opaquePrice + sheerPrice, 0, true);
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);

                roomSum += opaquePrice + sheerPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
                totalSets++;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isSuspended = deco.dataset.suspended === 'true';
                if (isSuspended) {
                    deco.querySelector('[data-deco-sqyd]').textContent = "0.00";
                    deco.querySelector('[data-deco-price]').textContent = "0";
                    return;
                }
                const w = clamp01(deco.querySelector('input[name="deco_width_m"]').value),
                    h = clamp01(deco.querySelector('input[name="deco_height_m"]').value),
                    price = clamp01(deco.querySelector('input[name="deco_price_sqyd"]').value);
                const sqyd = w * h * SQM_TO_SQYD;
                const total = Math.round(sqyd * price);
                deco.querySelector('[data-deco-sqyd]').textContent = fmt(sqyd, 2);
                deco.querySelector('[data-deco-price]').textContent = fmt(total, 0, true);
                roomSum += total;
                totalDeco++;
            });
            
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                const isSuspended = item.dataset.suspended === 'true';
                if (isSuspended) {
                    item.querySelector('[data-wallpaper-summary] .price:first-of-type').textContent = "0";
                    item.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = "0.00";
                    item.querySelector('[data-wallpaper-summary] .price:last-of-type').textContent = "0";
                    return;
                }
                const h = clamp01(item.querySelector('[name="wallpaper_height_m"]').value);
                const price = clamp01(item.querySelector('[name="wallpaper_price_roll"]').value);
                const totalWidth = Array.from(item.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                
                const totalSqm = totalWidth * h;
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                const total = rollsNeeded * price;

                item.querySelector('[data-wallpaper-summary] .price:first-of-type').textContent = fmt(total, 0, true);
                item.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = fmt(totalSqm, 2);
                item.querySelector('[data-wallpaper-summary] .price:last-of-type').textContent = fmt(rollsNeeded, 0);
                roomSum += total;
                totalDeco++;
            });

            room.querySelector('[data-room-total]').textContent = fmt(roomSum, 0, true);
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCountSets).textContent = totalSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = totalDeco;
        document.querySelector(SELECTORS.setCount).textContent = totalSets + totalDeco;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2);
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2);
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2);
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2);
    }
    
    function buildPayload() {
        const payload = {};
        const customerInfo = document.querySelector("#customerInfo");
        payload.customer_name = customerInfo.querySelector('input[name="customer_name"]').value;
        payload.customer_phone = customerInfo.querySelector('input[name="customer_phone"]').value;
        payload.customer_address = customerInfo.querySelector('input[name="customer_address"]').value;
        payload.timestamp = new Date().toISOString();
        payload.version = APP_VERSION;
        
        payload.rooms = Array.from(document.querySelectorAll(SELECTORS.room)).map((room, rIdx) => {
            const roomData = {};
            const roomNameEl = room.querySelector(SELECTORS.roomNameInput);
            roomData.room_name = roomNameEl.value || roomNameEl.placeholder;
            roomData.price_per_m = room.querySelector(SELECTORS.roomPricePerM).value;
            roomData.style = room.querySelector(SELECTORS.roomStyle).value;

            roomData.sets = Array.from(room.querySelectorAll(SELECTORS.set)).map((set, sIdx) => {
                const isSuspended = set.dataset.suspended === 'true';
                const w = clamp01(set.querySelector('input[name="width_m"]').value);
                const h = clamp01(set.querySelector('input[name="height_m"]').value);
                return {
                    "id": `set_${rIdx+1}_${sIdx+1}`,
                    "width_m": w,
                    "height_m": h,
                    "is_suspended": isSuspended,
                    "open_type": set.querySelector('select[name="open_type"]').value,
                    "fabric_variant": set.querySelector('select[name="fabric_variant"]').value,
                    "sheer_price_per_m": set.querySelector('select[name="sheer_price_per_m"]').value
                };
            });
            roomData.decorations = Array.from(room.querySelectorAll(SELECTORS.decoItem)).map((deco, dIdx) => {
                const isSuspended = deco.dataset.suspended === 'true';
                return {
                    "id": `deco_${rIdx+1}_${dIdx+1}`,
                    "type": deco.querySelector('[name="deco_type"]').value,
                    "width_m": deco.querySelector('[name="deco_width_m"]').value,
                    "height_m": deco.querySelector('[name="deco_height_m"]').value,
                    "price_sqyd": deco.querySelector('[name="deco_price_sqyd"]').value,
                    "is_suspended": isSuspended
                };
            });
            roomData.wallpapers = Array.from(room.querySelectorAll(SELECTORS.wallpaperItem)).map((item, wIdx) => {
                const isSuspended = item.dataset.suspended === 'true';
                const widths = Array.from(item.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value));
                return {
                    "id": `wallpaper_${rIdx+1}_${wIdx+1}`,
                    "height_m": item.querySelector('[name="wallpaper_height_m"]').value,
                    "price_per_roll": item.querySelector('[name="wallpaper_price_roll"]').value,
                    "widths": widths,
                    "is_suspended": isSuspended
                };
            });

            return roomData;
        });

        return payload;
    }

    function generateCopyText(options) {
        const payload = buildPayload();
        let text = "";

        if (options.customer) {
            text += `
--- ข้อมูลลูกค้า ---
ลูกค้า: ${payload.customer_name || "-"}
เบอร์โทร: ${payload.customer_phone || "-"}
รายละเอียด: ${payload.customer_address || "-"}
`;
        }
        
        if (options.details) {
            payload.rooms.forEach(room => {
                text += `
=== ห้อง: ${room.room_name} ===
`;
                const roomPriceText = room.price_per_m ? `ราคาผ้า (ทึบ) ${fmt(toNum(room.price_per_m), 0, true)} บ./ม. | ` : "";
                const roomStyleText = room.style ? `สไตล์ ${room.style}` : "";
                text += `(${roomPriceText}${roomStyleText})\n`;

                room.sets.forEach((set, sIdx) => {
                    const isSuspended = set.is_suspended;
                    if (isSuspended) return;
                    text += `
จุดผ้าม่านที่ ${sIdx+1}:
    - กว้าง ${fmt(set.width_m, 2)} ม.
    - สูง ${fmt(set.height_m, 2)} ม.
    - ประเภทผ้า: ${set.fabric_variant}
    - ลักษณะเปิด: ${set.open_type || "-"}
`;
                });
                room.decorations.forEach((deco, dIdx) => {
                    if (deco.is_suspended) return;
                    text += `
รายการตกแต่งที่ ${dIdx+1}:
    - ประเภท: ${deco.type}
    - ราคา: ${fmt(toNum(deco.price_sqyd), 0, true)} บ./หลา
    - ขนาด: กว้าง ${deco.width_m || 0} ม. x ยาว ${deco.height_m || 0} ม.
`;
                });
                room.wallpapers.forEach((item, wIdx) => {
                    if (item.is_suspended) return;
                    const totalWidth = item.widths.reduce((sum, w) => sum + w, 0);
                    text += `
รายการวอลเปเปอร์ที่ ${wIdx+1}:
    - ราคา: ${fmt(toNum(item.price_per_roll), 0, true)} บ./ม้วน
    - ความสูง: ${item.height_m} ม.
    - ความกว้างผนังรวม: ${fmt(totalWidth, 2)} ม.
`;
                });
            });
        }
        
        if (options.summary) {
            const grandTotal = toNum(document.querySelector(SELECTORS.grandTotal).textContent.replace(/,/g, ''));
            text += `
--- สรุปยอดรวม ---
ราคารวม: ${fmt(grandTotal, 0, true)} บ.
จำนวนจุดรวม: ${document.querySelector(SELECTORS.setCount).textContent}
ผ้าม่าน (ชุด): ${document.querySelector(SELECTORS.setCountSets).textContent}
ตกแต่งเพิ่ม (ชุด): ${document.querySelector(SELECTORS.setCountDeco).textContent}
`;
        }

        return text.trim();
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const lockText = lockBtn.querySelector('.lock-text');
        const lockIcon = lockBtn.querySelector('.lock-icon');
        
        const allInputs = document.querySelectorAll('input, select, textarea');
        isLocked = lockBtn.dataset.locked === 'true';

        if (isLocked) {
            allInputs.forEach(el => el.disabled = true);
            lockText.textContent = 'ปลดล็อค';
            lockIcon.textContent = '🔓';
            lockBtn.classList.remove('btn-primary');
            lockBtn.classList.add('btn-warning');
        } else {
            allInputs.forEach(el => el.disabled = false);
            lockText.textContent = 'ล็อค';
            lockIcon.textContent = '🔒';
            lockBtn.classList.add('btn-primary');
            lockBtn.classList.remove('btn-warning');
        }
        
        // Hide/show action buttons based on lock state
        document.querySelectorAll('[data-act]').forEach(btn => {
            if (btn.dataset.act.includes('add') || btn.dataset.act.includes('del') || btn.dataset.act.includes('clear')) {
                btn.classList.toggle('hidden', isLocked);
            }
        });
        document.querySelector(SELECTORS.clearAllBtn).classList.toggle('hidden', isLocked);
        document.querySelector(SELECTORS.submitBtn).classList.toggle('hidden', isLocked);
        document.querySelector(SELECTORS.copyTextBtn).classList.toggle('hidden', isLocked);
        document.querySelector(SELECTORS.copyJsonBtn).classList.toggle('hidden', isLocked);
        document.querySelector(SELECTORS.importBtn).classList.toggle('hidden', isLocked);
        document.querySelector(SELECTORS.exportBtn).classList.toggle('hidden', isLocked);
    }

    // --- Event Listeners ---
    document.addEventListener('input', debounce(e => {
        recalcAll();
        saveData();
        if (e.target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
    }));
    document.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-act]');
        if (!target) return;
        const action = target.dataset.act;
        const item = target.closest('.set, .deco-item, .wallpaper-item');

        switch (action) {
            case 'add-set': addSet(target.closest(SELECTORS.room)); break;
            case 'add-deco': addDeco(target.closest(SELECTORS.room)); break;
            case 'add-wallpaper': addWallpaper(target.closest(SELECTORS.room)); break;
            case 'add-wall': addWall(target); break;
            case 'del-room': delRoom(target); break;
            case 'del-set': delSet(target); break;
            case 'del-deco': delDeco(target); break;
            case 'del-wallpaper': delWallpaper(target); break;
            case 'del-wall': delWall(target); break;
            case 'clear-set': clearSet(target); break;
            case 'clear-deco': clearDeco(target); break;
            case 'clear-wallpaper': clearWallpaper(target); break;
            case 'suspend-item': toggleSuspend(target); break;
            default: break;
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        const btn = document.querySelector(SELECTORS.lockBtn);
        btn.dataset.locked = btn.dataset.locked === 'true' ? 'false' : 'true';
        updateLockState();
    });

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
            .then(() => showToast("คัดลอก JSON แล้ว", 'success'))
            .catch(() => showToast("ไม่สามารถคัดลอก JSON ได้", 'error'));
    });
    
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (!options) return;
        const text = generateCopyText(options);
        navigator.clipboard.writeText(text)
            .then(() => showToast("คัดลอกข้อความแล้ว", 'success'))
            .catch(() => showToast("ไม่สามารถคัดลอกข้อความได้", 'error'));
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
            document.querySelector('input[name="customer_name"]').value = payload.customer_name;
            document.querySelector('input[name="customer_address"]').value = payload.customer_address;
            document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
            roomsEl.innerHTML = ""; roomCount = 0;
            if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
            else addRoom();
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
            showToast('นำเข้าข้อมูลสำเร็จ', 'success');
        } catch (err) {
            console.error("Failed to parse JSON:", err);
            showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
        }
    });
    
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "marnthara_data.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast("ส่งออกข้อมูลเป็นไฟล์ JSON แล้ว", 'success');
    });
    
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        if (!menuDropdown.contains(e.target) && !document.querySelector(SELECTORS.menuBtn).contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
    });

    orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name;
                document.querySelector('input[name="customer_address"]').value = payload.customer_address;
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
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