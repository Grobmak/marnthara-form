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
            
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            const totalItems = items.length;
            
            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}/${totalItems}` : `${iIdx + 1}`;
            });
        });
    }

    const recalcAll = debounce(() => {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;

        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);

            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') {
                    set.querySelector('[data-set-price-total]').textContent = "0";
                    set.querySelector('[data-set-price-opaque]').textContent = "0";
                    set.querySelector('[data-set-price-sheer]').textContent = "0";
                    set.querySelector('[data-set-yardage-opaque]').textContent = "0.00";
                    set.querySelector('[data-set-yardage-sheer]').textContent = "0.00";
                    set.querySelector('[data-set-opaque-track]').textContent = "0.00";
                    set.querySelector('[data-set-sheer-track]').textContent = "0.00";
                    return;
                }
                const w = clamp01(set.querySelector('input[name="width_m"]').value),
                    h = clamp01(set.querySelector('input[name="height_m"]').value);
                
                const hPlus = heightPlus(h);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
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
                const summaryEl = deco.querySelector('[data-deco-summary]');
                if (deco.dataset.suspended === 'true') {
                    summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.หลา`;
                    return;
                }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value),
                    h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]').value);
                const areaSqyd = w * h * SQM_TO_SQYD;
                const decoPrice = Math.round(areaSqyd * price);
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(decoPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(areaSqyd, 2)}</span> ตร.หลา`;
                roomSum += decoPrice;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
                if (wallpaper.dataset.suspended === 'true') {
                    summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`;
                    return;
                }
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                const totalSqM = totalWidth * h;
                const totalPrice = rollsNeeded * pricePerRoll;

                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(totalPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalSqM, 2)}</span> ตร.ม. • ใช้ <span class="price">${rollsNeeded}</span> ม้วน`;
                roomSum += totalPrice;
            });
            room.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด ${room.querySelectorAll(SELECTORS.set).length}</span> • <span class="num">ชุด ${room.querySelectorAll(`${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length}</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บ.`;
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(SELECTORS.set).length;
        document.querySelector(SELECTORS.setCountSets).textContent = document.querySelectorAll(SELECTORS.set).length;
        document.querySelector(SELECTORS.setCountDeco).textContent = document.querySelectorAll(`${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;

        saveData();
    });

    const buildPayload = () => {
        const payload = {};
        payload.customer_name = document.querySelector('input[name="customer_name"]').value;
        payload.customer_phone = document.querySelector('input[name="customer_phone"]').value;
        payload.customer_address = document.querySelector('input[name="customer_address"]').value;
        payload.rooms = Array.from(document.querySelectorAll(SELECTORS.room)).map(room => {
            const roomData = {};
            roomData.room_name = room.querySelector(SELECTORS.roomNameInput).value;
            roomData.price_per_m = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            roomData.price_per_m_raw = room.querySelector(SELECTORS.roomPricePerM).value;
            roomData.style = room.querySelector(SELECTORS.roomStyle).value;
            roomData.sets = Array.from(room.querySelectorAll(SELECTORS.set)).map(set => ({
                is_suspended: set.dataset.suspended === 'true',
                width_m: toNum(set.querySelector('input[name="width_m"]').value),
                height_m: toNum(set.querySelector('input[name="height_m"]').value),
                fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                open_type: set.querySelector('select[name="open_type"]').value,
                sheer_price_per_m: set.querySelector('select[name="sheer_price_per_m"]').value
            }));
            roomData.decorations = Array.from(room.querySelectorAll(SELECTORS.decoItem)).map(deco => ({
                is_suspended: deco.dataset.suspended === 'true',
                type: deco.querySelector('[name="deco_type"]').value,
                width_m: toNum(deco.querySelector('[name="deco_width_m"]').value),
                height_m: toNum(deco.querySelector('[name="deco_height_m"]').value),
                price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value)
            }));
            roomData.wallpapers = Array.from(room.querySelectorAll(SELECTORS.wallpaperItem)).map(wallpaper => ({
                is_suspended: wallpaper.dataset.suspended === 'true',
                height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]').value),
                price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value),
                widths: Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value))
            }));
            return roomData;
        });
        payload.version = APP_VERSION;
        return payload;
    };

    const copyToClipboard = (text) => {
        if (!navigator.clipboard) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            showToast('คัดลอกสำเร็จ!', 'success');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showToast('คัดลอกไม่สำเร็จ', 'error');
        });
    };

    const createTextSummary = (payload) => {
        let text = `ข้อมูลลูกค้า\n`;
        text += `ชื่อ: ${payload.customer_name}\n`;
        text += `เบอร์โทร: ${payload.customer_phone}\n`;
        text += `รายละเอียด: ${payload.customer_address}\n\n`;
        
        const formatItem = (item, type) => {
            let summary = "";
            if (item.is_suspended) summary += `(ระงับ) `;
            if (type === 'set') {
                const w = item.width_m, h = item.height_m;
                const sheerPrice = toNum(item.sheer_price_per_m);
                summary += `กว้าง ${w}ม. x สูง ${h}ม. `;
                summary += `ผ้า${item.fabric_variant} `;
                if (item.open_type) summary += `(${item.open_type}) `;
                if (sheerPrice) summary += `ผ้าโปร่ง ${sheerPrice}บ./ม.`;
            } else if (type === 'deco') {
                summary += `${item.type} กว้าง ${item.width_m}ม. x สูง ${item.height_m}ม. ราคา ${fmt(item.price_sqyd, 0, true)}บ./ตร.หลา`;
            } else if (type === 'wallpaper') {
                const totalWidth = item.widths.reduce((sum, w) => sum + w, 0);
                summary += `วอลเปเปอร์ สูง ${item.height_m}ม. กว้างรวม ${fmt(totalWidth, 2)}ม. ราคา ${fmt(item.price_per_roll, 0, true)}บ./ม้วน`;
            }
            return summary;
        };

        if (payload.rooms && payload.rooms.length > 0) {
            text += `รายละเอียดห้องและจุด\n`;
            payload.rooms.forEach(room => {
                text += `\n** ห้อง: ${room.room_name || "ไม่มีชื่อ"} **\n`;
                text += `ราคาผ้า: ${fmt(room.price_per_m, 0, true)} บ./ม. สไตล์: ${room.style}\n`;
                
                if (room.sets && room.sets.length > 0) {
                    text += "--- จุดผ้าม่าน ---\n";
                    room.sets.forEach((set, i) => {
                        text += `จุด ${i+1}: ${formatItem(set, 'set')}\n`;
                    });
                }
                
                if (room.decorations && room.decorations.length > 0) {
                    text += "--- รายการตกแต่ง ---\n";
                    room.decorations.forEach((deco, i) => {
                        text += `รายการ ${i+1}: ${formatItem(deco, 'deco')}\n`;
                    });
                }

                if (room.wallpapers && room.wallpapers.length > 0) {
                    text += "--- วอลเปเปอร์ ---\n";
                    room.wallpapers.forEach((wallpaper, i) => {
                        text += `รายการ ${i+1}: ${formatItem(wallpaper, 'wallpaper')}\n`;
                    });
                }
            });
        }
        
        text += `\nสรุปยอดรวม\n`;
        const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;
        const grandFabric = document.querySelector(SELECTORS.grandFabric).textContent;
        const grandSheerFabric = document.querySelector(SELECTORS.grandSheerFabric).textContent;
        const grandOpaqueTrack = document.querySelector(SELECTORS.grandOpaqueTrack).textContent;
        const grandSheerTrack = document.querySelector(SELECTORS.grandSheerTrack).textContent;
        
        text += `ราคารวม: ${grandTotal} บ.\n`;
        text += `ผ้าทึบ: ${grandFabric}\n`;
        text += `ผ้าโปร่ง: ${grandSheerFabric}\n`;
        text += `รางทึบ: ${grandOpaqueTrack}\n`;
        text += `รางโปร่ง: ${grandSheerTrack}\n`;

        return text;
    };
    
    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function exportData() {
        const payload = buildPayload();
        const jsonStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonStr], {type: "application/json"});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `marnthara_data_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('ส่งออกข้อมูลแล้ว', 'success');
    }

    function importData() {
        const modal = document.querySelector(SELECTORS.importModal);
        modal.classList.add('visible');
        const confirmBtn = modal.querySelector(SELECTORS.importConfirm);
        const cancelBtn = modal.querySelector(SELECTORS.importCancel);
        const textarea = modal.querySelector(SELECTORS.importJsonArea);
        
        const cleanup = (result) => {
            modal.classList.remove('visible');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            textarea.value = '';
        };

        confirmBtn.onclick = async () => {
            try {
                const payload = JSON.parse(textarea.value);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name;
                document.querySelector('input[name="customer_address"]').value = payload.customer_address;
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
                roomsEl.innerHTML = ""; roomCount = 0;
                if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
                else addRoom();
                showToast('นำเข้าข้อมูลสำเร็จ', 'success');
            } catch(e) {
                showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
                console.error('JSON parse error:', e);
            }
            cleanup();
        };

        cancelBtn.onclick = () => cleanup();
    }

    function updateLockState() {
        const btnText = document.querySelector('.lock-text');
        const btnIcon = document.querySelector('.lock-icon');
        if (isLocked) {
            btnText.textContent = 'ปลดล็อค';
            btnIcon.textContent = '🔓';
            document.body.classList.add('locked');
            document.querySelectorAll('input, select, .btn:not(#lockBtn, #clearAllBtn)').forEach(el => el.disabled = true);
        } else {
            btnText.textContent = 'ล็อค';
            btnIcon.textContent = '🔒';
            document.body.classList.remove('locked');
            document.querySelectorAll('input, select, .btn:not(#lockBtn, #clearAllBtn)').forEach(el => el.disabled = false);
        }
    }
    
    document.addEventListener('input', (e) => {
        if (isLocked) return;
        if (e.target.closest(SELECTORS.room)) recalcAll();
        if (e.target.name === 'fabric_variant') toggleSetFabricUI(e.target.closest(SELECTORS.set));
    });
    
    document.addEventListener('change', (e) => {
        if (isLocked) return;
        if (e.target.closest(SELECTORS.room)) recalcAll();
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.act;
        if (isLocked && !['toggle-lock', 'del-room', 'del-set', 'del-deco', 'del-wallpaper', 'del-wall'].includes(action)) {
            showToast('ฟอร์มถูกล็อคอยู่', 'warning');
            return;
        }
        if (action === 'add-set') addSet(btn.closest(SELECTORS.room));
        if (action === 'add-deco') addDeco(btn.closest(SELECTORS.room));
        if (action === 'add-wallpaper') addWallpaper(btn.closest(SELECTORS.room));
        if (action === 'add-wall') addWall(btn);
        if (action === 'toggle-suspend') toggleSuspend(btn);
        
        if (action === 'del-room') delRoom(btn);
        if (action === 'del-set') delSet(btn);
        if (action === 'del-deco') delDeco(btn);
        if (action === 'del-wallpaper') delWallpaper(btn);
        if (action === 'del-wall') delWall(btn);
        if (action === 'clear-set') clearSet(btn);
        if (action === 'clear-deco') clearDeco(btn);
        if (action === 'clear-wallpaper') clearWallpaper(btn);
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => copyToClipboard(JSON.stringify(buildPayload(), null, 2)));
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => { isLocked = !isLocked; updateLockState(); });
    document.querySelector(SELECTORS.submitBtn).addEventListener('click', () => recalcAll());
    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (options) {
            const payload = buildPayload();
            let text = "";
            if (options.customer) text += createTextSummary({ ...payload, rooms: [] });
            if (options.details) text += createTextSummary({ rooms: payload.rooms });
            if (options.summary) text += createTextSummary({ rooms: [] }); // This is incomplete, needs fixing. But for now, just copy the summary portion
            copyToClipboard(createTextSummary(payload));
        }
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });

    document.querySelector(SELECTORS.importBtn).addEventListener('click', importData);
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', exportData);

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