(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper-m3";
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
        toast.className = 'md-toast';
        toast.textContent = message;

        if (type === 'success') toast.classList.add('success');
        else if (type === 'warning') toast.classList.add('warning');
        else if (type === 'error') toast.classList.add('error');
        else { toast.style.backgroundColor = 'var(--md-sys-color-on-surface-variant)'; toast.style.color = 'var(--md-sys-color-surface)'; }

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
                created.querySelector('[data-act="toggle-suspend"] .material-symbols-outlined').textContent = 'play_arrow';
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
                created.querySelector('[data-act="toggle-suspend"] .material-symbols-outlined').textContent = 'play_arrow';
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
                created.querySelector('[data-act="toggle-suspend"] .material-symbols-outlined').textContent = 'play_arrow';
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
        setEl.querySelector("[data-sheer-price-label]").closest('div').classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-yardage-label]").closest('div').classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-track-label]").closest('div').classList.toggle("hidden", !hasSheer);

        const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
        setEl.querySelector("[data-opaque-price-label]").closest('div').classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-yardage-label]").closest('div').classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-track-label]").closest('div').classList.toggle("hidden", !hasOpaque);
    }
    
    function toggleSuspend(btn) {
        const item = btn.closest('.set, .deco-item, .wallpaper-item');
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        btn.querySelector('[data-suspend-text]').textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        btn.querySelector('.material-symbols-outlined').textContent = isSuspended ? 'play_arrow' : 'pause';
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

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);
            
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') { 
                    set.querySelector('[data-set-price-total]').textContent = fmt(0, 0, true);
                    set.querySelector('[data-set-price-opaque]').textContent = fmt(0, 0, true);
                    set.querySelector('[data-set-price-sheer]').textContent = fmt(0, 0, true);
                    set.querySelector('[data-set-yardage-opaque]').textContent = fmt(0, 2);
                    set.querySelector('[data-set-yardage-sheer]').textContent = fmt(0, 2);
                    set.querySelector('[data-set-opaque-track]').textContent = fmt(0, 2);
                    set.querySelector('[data-set-sheer-track]').textContent = fmt(0, 2);
                    return;
                }
                const w = clamp01(set.querySelector('input[name="width_m"]').value), 
                      h = clamp01(set.querySelector('input[name="height_m"]').value);
                const hPlus = heightPlus(h), 
                      variant = set.querySelector('select[name="fabric_variant"]').value;

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
                    summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="md-quantity">0</span> ม้วน`;
                    return;
                }
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value),
                      price = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                let totalWidth = 0;
                wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                    totalWidth += clamp01(input.value);
                });
                const areaSqM = totalWidth * h;
                const rollsNeeded = Math.ceil(areaSqM / WALLPAPER_SQM_PER_ROLL);
                const wallpaperPrice = rollsNeeded * price;
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(areaSqM, 2)}</span> ตร.ม. • ใช้ <span class="md-quantity">${rollsNeeded}</span> ม้วน`;
                roomSum += wallpaperPrice;
            });
            room.querySelector('[data-room-brief] .price').textContent = fmt(roomSum, 0, true);
            room.querySelector('[data-room-brief] .num').textContent = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
            
            const setsCount = room.querySelectorAll(SELECTORS.set).length;
            const decoCount = room.querySelectorAll(SELECTORS.decoItem).length;
            room.querySelector('[data-room-brief] [data-set-count]').textContent = setsCount;
            room.querySelector('[data-room-brief] [data-deco-count]').textContent = decoCount;
            
            grand += roomSum;
        });

        const totalSets = document.querySelectorAll(SELECTORS.set).length;
        const totalDecos = document.querySelectorAll(SELECTORS.decoItem).length;
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = totalSets + totalDecos;
        document.querySelector(SELECTORS.setCountSets).textContent = totalSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = totalDecos;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
    }

    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                price_per_m: toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value),
                price_per_m_raw: roomEl.querySelector(SELECTORS.roomPricePerM).value,
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: [],
                is_suspended: roomEl.dataset.suspended === 'true'
            };
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const isSuspended = setEl.dataset.suspended === 'true';
                const w = toNum(setEl.querySelector('input[name="width_m"]').value), 
                      h = toNum(setEl.querySelector('input[name="height_m"]').value);
                roomData.sets.push({
                    width_m: w,
                    height_m: h,
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                    is_suspended: isSuspended,
                    total_price: toNum(setEl.querySelector('[data-set-price-total]').textContent),
                    yards_opaque: toNum(setEl.querySelector('[data-set-yardage-opaque]').textContent),
                    yards_sheer: toNum(setEl.querySelector('[data-set-yardage-sheer]').textContent),
                    track_opaque: toNum(setEl.querySelector('[data-set-opaque-track]').textContent),
                    track_sheer: toNum(setEl.querySelector('[data-set-sheer-track]').textContent),
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const isSuspended = decoEl.dataset.suspended === 'true';
                const w = toNum(decoEl.querySelector('[name="deco_width_m"]').value),
                      h = toNum(decoEl.querySelector('[name="deco_height_m"]').value),
                      price = toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value);
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: w,
                    height_m: h,
                    price_sqyd: price,
                    is_suspended: isSuspended,
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const isSuspended = wallpaperEl.dataset.suspended === 'true';
                const h = toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                      price = toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value);
                const widths = Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(input => toNum(input.value));
                roomData.wallpapers.push({
                    height_m: h,
                    price_per_roll: price,
                    widths: widths,
                    is_suspended: isSuspended,
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    };
    
    function copyText() {
        showCopyOptionsModal().then(options => {
            if (!options) return;
            let textToCopy = "";
            const payload = buildPayload();
            const customer = payload.customer_name || payload.customer_phone || payload.customer_address;
            if (options.customer && customer) {
                textToCopy += `ลูกค้า: ${payload.customer_name}\n`;
                textToCopy += `โทร: ${payload.customer_phone}\n`;
                textToCopy += `รายละเอียด: ${payload.customer_address}\n\n`;
            }
            if (options.details) {
                payload.rooms.forEach(room => {
                    textToCopy += `ห้อง: ${room.room_name} (${room.is_suspended ? 'ระงับ' : 'ใช้งาน'})\n`;
                    const hasItems = room.sets.length > 0 || room.decorations.length > 0 || room.wallpapers.length > 0;
                    if (!hasItems) {
                        textToCopy += `  - ไม่มีรายการ\n`;
                    }
                    if (room.sets.length > 0) {
                        room.sets.forEach((set, i) => {
                            const status = set.is_suspended ? ' (ระงับ)' : '';
                            textToCopy += `  - ผ้าม่านชุดที่ ${i + 1}${status}: กว้าง ${set.width_m}ม. สูง ${set.height_m}ม., ชนิด: ${set.fabric_variant}, สไตล์: ${room.style}, ราง: ${set.open_type}, ราคา: ${fmt(set.total_price, 0, true)} บ.\n`;
                        });
                    }
                    if (room.decorations.length > 0) {
                        room.decorations.forEach((deco, i) => {
                            const status = deco.is_suspended ? ' (ระงับ)' : '';
                            textToCopy += `  - ตกแต่งชุดที่ ${i + 1}${status}: ${deco.type} กว้าง ${deco.width_m}ม. สูง ${deco.height_m}ม., ราคา: ${fmt(toNum(deco.price_sqyd) * (deco.width_m * deco.height_m * SQM_TO_SQYD), 0, true)} บ.\n`;
                        });
                    }
                    if (room.wallpapers.length > 0) {
                        room.wallpapers.forEach((wp, i) => {
                            const status = wp.is_suspended ? ' (ระงับ)' : '';
                            const totalWidth = wp.widths.reduce((sum, w) => sum + w, 0);
                            const areaSqM = totalWidth * wp.height_m;
                            const rollsNeeded = Math.ceil(areaSqM / WALLPAPER_SQM_PER_ROLL);
                            textToCopy += `  - วอลเปเปอร์ชุดที่ ${i + 1}${status}: สูง ${wp.height_m}ม. กว้างรวม ${fmt(totalWidth, 2)}ม., ราคา: ${fmt(wp.price_per_roll, 0, true)} บ./ม้วน, ใช้ ${rollsNeeded} ม้วน\n`;
                        });
                    }
                });
                textToCopy += '\n';
            }
            if (options.summary) {
                textToCopy += `ราคารวม: ${document.querySelector(SELECTORS.grandTotal).textContent} บ.\n`;
                textToCopy += `จำนวนจุด: ${document.querySelector(SELECTORS.setCount).textContent}\n`;
                textToCopy += `ผ้าม่าน(ชุด): ${document.querySelector(SELECTORS.setCountSets).textContent}\n`;
                textToCopy += `ตกแต่งเพิ่ม(ชุด): ${document.querySelector(SELECTORS.setCountDeco).textContent}\n`;
                textToCopy += `ผ้าทึบที่ใช้: ${document.querySelector(SELECTORS.grandFabric).textContent}\n`;
                textToCopy += `ผ้าโปร่งที่ใช้: ${document.querySelector(SELECTORS.grandSheerFabric).textContent}\n`;
                textToCopy += `รางทึบที่ใช้: ${document.querySelector(SELECTORS.grandOpaqueTrack).textContent}\n`;
                textToCopy += `รางโปร่งที่ใช้: ${document.querySelector(SELECTORS.grandSheerTrack).textContent}\n`;
            }
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showToast("คัดลอกข้อมูลเรียบร้อยแล้ว", "success");
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                    showToast("ไม่สามารถคัดลอกข้อมูลได้", "error");
                });
            }
        });
    }

    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const lockIcon = lockBtn.querySelector('.lock-icon');
        const lockText = lockBtn.querySelector('.lock-text');
        
        isLocked = document.querySelectorAll(SELECTORS.room).length > 0;
        
        if (isLocked) {
            lockBtn.classList.add('md-danger');
            lockBtn.classList.remove('md-filled-button');
            lockBtn.classList.add('md-outlined-button');
            lockIcon.textContent = 'lock_open';
            lockText.textContent = 'ปลดล็อค';
        } else {
            lockBtn.classList.remove('md-danger');
            lockBtn.classList.remove('md-outlined-button');
            lockBtn.classList.add('md-filled-button');
            lockIcon.textContent = 'lock';
            lockText.textContent = 'ล็อค';
        }
    }

    document.addEventListener("click", (e) => {
        const target = e.target.closest('[data-act]');
        if (!target) return;
        const action = target.dataset.act;
        const parentRoom = target.closest(SELECTORS.room);
        switch(action) {
            case 'add-set': addSet(parentRoom); break;
            case 'add-deco': addDeco(parentRoom); break;
            case 'add-wallpaper': addWallpaper(parentRoom); break;
            case 'add-wall': addWall(target); break;
            case 'del-room': delRoom(target); break;
            case 'del-set': delSet(target); break;
            case 'del-deco': delDeco(target); break;
            case 'del-wallpaper': delWallpaper(target); break;
            case 'del-wall': delWall(target); break;
            case 'toggle-suspend': toggleSuspend(target); break;
            case 'clear-set': clearSet(target); break;
            case 'clear-deco': clearDeco(target); break;
            case 'clear-wallpaper': clearWallpaper(target); break;
        }
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener("click", () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener("click", clearAllData);
    document.querySelector(SELECTORS.lockBtn).addEventListener("click", updateLockState);
    document.querySelector(SELECTORS.copyJsonBtn).addEventListener("click", () => {
        navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2))
            .then(() => showToast("คัดลอก JSON เรียบร้อยแล้ว", "success"))
            .catch(err => {
                console.error('Failed to copy JSON: ', err);
                showToast("ไม่สามารถคัดลอก JSON ได้", "error");
            });
    });
    document.querySelector(SELECTORS.copyTextBtn).addEventListener("click", copyText);

    document.querySelector(SELECTORS.menuBtn).addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
    });

    document.querySelector(SELECTORS.importBtn).addEventListener("click", () => {
        document.querySelector(SELECTORS.importModal).classList.add('visible');
    });

    document.querySelector(SELECTORS.importCancel).addEventListener("click", () => {
        document.querySelector(SELECTORS.importModal).classList.remove('visible');
    });

    document.querySelector(SELECTORS.importConfirm).addEventListener("click", () => {
        try {
            const data = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            window.location.reload();
        } catch (e) {
            showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
        }
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener("click", () => {
        const data = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "marnthara_data.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast("ส่งออกข้อมูล JSON เรียบร้อยแล้ว", "success");
    });
    
    document.addEventListener("input", debounce(e => {
        const input = e.target;
        if (input.closest(SELECTORS.set) || input.closest(SELECTORS.decoItem) || input.closest(SELECTORS.wallpaperItem)) {
            recalcAll();
            saveData();
        } else if (input.closest(SELECTORS.orderForm)) {
            saveData();
        }
    }));

    document.querySelectorAll('input[type="text"], input[type="tel"]').forEach(input => {
        input.addEventListener("focus", (e) => {
            const field = e.target.closest('.md-text-field');
            if (field) field.classList.add('md-focused');
        });
        input.addEventListener("blur", (e) => {
            const field = e.target.closest('.md-text-field');
            if (field) field.classList.remove('md-focused');
        });
    });

    document.addEventListener("change", (e) => {
        const target = e.target;
        if (target.matches('select[name="fabric_variant"]')) {
            toggleSetFabricUI(target.closest(SELECTORS.set));
        }
        if (target.closest(SELECTORS.orderForm)) {
            recalcAll();
            saveData();
        }
    });

    const saveData = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
    };

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