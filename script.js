(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper-m3";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;

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
        if (!container) return;
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
    
    const showModal = (selector) => {
        const modalEl = document.querySelector(selector);
        if (modalEl) modalEl.classList.add('visible');
    };

    const hideModal = (selector) => {
        const modalEl = document.querySelector(selector);
        if (modalEl) modalEl.classList.remove('visible');
    };
    
    const showConfirmation = (title, body) => {
        return new Promise((resolve) => {
            const modalEl = document.querySelector(SELECTORS.modal);
            if (!modalEl) { resolve(true); return; }
            modalEl.querySelector(SELECTORS.modalTitle).textContent = title;
            modalEl.querySelector(SELECTORS.modalBody).textContent = body;
            showModal(SELECTORS.modal);
            const cleanup = (result) => {
                hideModal(SELECTORS.modal);
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
            showModal(SELECTORS.copyOptionsModal);
            const confirmBtn = document.querySelector(SELECTORS.copyOptionsConfirm);
            const cancelBtn = document.querySelector(SELECTORS.copyOptionsCancel);
            
            const cleanup = (result) => {
                hideModal(SELECTORS.copyOptionsModal);
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
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
    }

    function toggleSetFabricUI(setEl) {
        if (!setEl) return;
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        setEl.querySelector(SELECTORS.sheerWrap)?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector('[data-set-options-row]')?.classList.toggle("three-col", hasSheer);
        setEl.querySelectorAll("[data-sheer-price-label], [data-set-price-sheer], [data-sheer-yardage-label], [data-set-yardage-sheer], [data-sheer-track-label], [data-set-sheer-track]")
            .forEach(el => el.classList.toggle("hidden", !hasSheer));

        const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
        setEl.querySelectorAll("[data-opaque-price-label], [data-set-price-opaque], [data-opaque-yardage-label], [data-set-yardage-opaque], [data-opaque-track-label], [data-set-opaque-track]")
            .forEach(el => el.classList.toggle("hidden", !hasOpaque));
    }
    
    function toggleSuspend(btn) {
        const item = btn.closest('.set-item, .deco-item, .wallpaper-item');
        if (!item) return;
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    async function delRoom(btn) { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; btn.closest(SELECTORS.room).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบห้องแล้ว', 'success'); }
    async function delSet(btn) { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; btn.closest(SELECTORS.set).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); }
    async function delDeco(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; btn.closest(SELECTORS.decoItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการตกแต่งแล้ว', 'success'); }
    async function delWallpaper(btn) { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์แล้ว?')) return; btn.closest(SELECTORS.wallpaperItem).remove(); renumber(); recalcAll(); saveData(); updateLockState(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); }
    async function delWall(btn) { if(isLocked) return; btn.closest('.wall-input-row').remove(); recalcAll(); saveData(); }

    async function clearSet(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; const set = btn.closest(SELECTORS.set); if (!set) return; set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); }
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); if (!item) return; item.querySelectorAll('input').forEach(el => el.value = ''); const wallsContainer = item.querySelector(SELECTORS.wallsContainer); if (wallsContainer) wallsContainer.innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); }
    
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
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const style = room.querySelector(SELECTORS.roomStyle)?.value;
            const sPlus = stylePlus(style);
            
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                if (set.dataset.suspended !== 'true') {
                    const w = clamp01(set.querySelector('input[name="width_m"]')?.value), h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                    const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]')?.value;
                    if (w > 0 && h > 0) {
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
                    roomSum += opaquePrice + sheerPrice;
                    grandOpaqueYards += opaqueYards;
                    grandSheerYards += sheerYards;
                    grandOpaqueTrack += opaqueTrack;
                    grandSheerTrack += sheerTrack;
                }
                set.querySelector('[data-set-price-total]').textContent = fmt(opaquePrice + sheerPrice, 0, true);
                set.querySelector('[data-set-price-opaque]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-set-price-sheer]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                let decoPrice = 0, areaSqyd = 0;
                if (deco.dataset.suspended !== 'true') {
                    const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value), h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                    const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                    areaSqyd = w * h * SQM_TO_SQYD;
                    decoPrice = Math.round(areaSqyd * price);
                    roomSum += decoPrice;
                }
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <span class="price">${fmt(decoPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(areaSqyd, 2)}</span> ตร.หลา`;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let wallpaperPrice = 0, rollsNeeded = 0, areaSqm = 0;
                 if (wallpaper.dataset.suspended !== 'true') {
                    const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                    const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                    rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                    wallpaperPrice = Math.round(rollsNeeded * pricePerRoll);
                    areaSqm = totalWidth * h;
                    roomSum += wallpaperPrice;
                }
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(areaSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${rollsNeeded}</span> ม้วน`;
            });
            const allItemsInRoom = room.querySelectorAll('[data-set], [data-deco-item], [data-wallpaper-item]').length;
            const curtainSetsInRoom = room.querySelectorAll('[data-set]').length;
            room.querySelector('[data-room-brief]').innerHTML = `ผ้าม่าน ${curtainSetsInRoom} จุด • รวม ${allItemsInRoom} ชุด • <span class="price">${fmt(roomSum, 0, true)}</span> ฿`;
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        const allItemsCount = document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        const curtainSetsCount = document.querySelectorAll(SELECTORS.set).length;
        const decoItemsCount = allItemsCount - curtainSetsCount;
        document.querySelector(SELECTORS.setCount).textContent = allItemsCount;
        document.querySelector(SELECTORS.setCountSets).textContent = curtainSetsCount;
        document.querySelector(SELECTORS.setCountDeco).textContent = decoItemsCount;
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2) + " หลา";
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2) + " ม.";
    }

    function buildPayload() {
        const payload = {
            app_version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]')?.value || '',
            customer_phone: document.querySelector('input[name="customer_phone"]')?.value || '',
            customer_address: document.querySelector('input[name="customer_address"]')?.value || '',
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || '',
                price_per_m_raw: toNum(roomEl.querySelector(SELECTORS.roomPricePerM)?.value),
                style: roomEl.querySelector(SELECTORS.roomStyle)?.value || '',
                sets: [], decorations: [], wallpapers: []
            };
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => roomData.sets.push({
                width_m: toNum(setEl.querySelector('input[name="width_m"]')?.value), height_m: toNum(setEl.querySelector('input[name="height_m"]')?.value),
                fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value || '', open_type: setEl.querySelector('select[name="open_type"]')?.value || '',
                sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value), is_suspended: setEl.dataset.suspended === 'true',
            }));
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => roomData.decorations.push({
                type: decoEl.querySelector('[name="deco_type"]')?.value || '', width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value),
                height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value), price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                is_suspended: decoEl.dataset.suspended === 'true',
            }));
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => roomData.wallpapers.push({
                height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value), price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)), is_suspended: wallpaperEl.dataset.suspended === 'true',
            }));
            payload.rooms.push(roomData);
        });
        return payload;
    }
    
    function loadPayload(payload) {
        if (!payload || !payload.rooms) { showToast("ข้อมูลไม่ถูกต้อง", "error"); return; }
        document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
        document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
        document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
        roomsEl.innerHTML = ""; roomCount = 0;
        if (payload.rooms.length > 0) payload.rooms.forEach(addRoom);
        else addRoom();
        showToast("โหลดข้อมูลสำเร็จ", "success");
        updateLockState();
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        if (!lockBtn) return;
        lockBtn.classList.toggle('btn-primary', !isLocked);
        lockBtn.classList.toggle('btn-danger', isLocked);
        lockBtn.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อก';
        lockBtn.querySelector('.lock-icon').textContent = isLocked ? 'lock' : 'lock_open';
        document.body.querySelectorAll('input, select, button').forEach(el => {
             const isExempt = el.closest('.summary-footer') || el.closest('.modal-overlay') || el.id === 'menuBtn' || el.closest('.menu-dropdown');
             if (!isExempt) el.disabled = isLocked;
        });
    }

    function toggleLock() {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'warning');
    }
    
    function buildTextSummary(options) {
        const payload = buildPayload();
        let summary = "สรุปใบเสนอราคา\n\n";
        if (options.customer) summary += `ข้อมูลลูกค้า:\n- ชื่อ: ${payload.customer_name}\n- เบอร์โทร: ${payload.customer_phone}\n- ที่อยู่: ${payload.customer_address}\n\n`;
        let grandTotal = 0, grandOpaqueYards = 0, grandSheerYards = 0, grandOpaqueTrack = 0, grandSheerTrack = 0;
        let roomDetails = "";
        payload.rooms.forEach((room, roomIndex) => {
            let roomTotal = 0;
            const style = room.style, sPlus = stylePlus(style);
            let roomContent = "";
            room.sets.forEach((set, setIndex) => {
                if (set.is_suspended) return;
                const w = set.width_m, h = set.height_m, hPlus = heightPlus(h), variant = set.fabric_variant;
                let setPrice = 0, setOpaqueYards = 0, setSheerYards = 0, setOpaqueTrack = 0, setSheerTrack = 0;
                if (w > 0 && h > 0) {
                    if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") { setPrice += Math.round((room.price_per_m_raw + sPlus + hPlus) * w); setOpaqueYards = CALC.fabricYardage(style, w); setOpaqueTrack = w; }
                    if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") { setPrice += Math.round((set.sheer_price_per_m + sPlus + hPlus) * w); setSheerYards = CALC.fabricYardage(style, w); setSheerTrack = w; }
                }
                if (options.details) {
                    roomContent += `  - จุดผ้าม่าน #${setIndex + 1}: กว้าง ${fmt(w, 2)} ม., สูง ${fmt(h, 2)} ม. ราคา ${fmt(setPrice, 0, true)} บ.\n`;
                    if (setOpaqueYards > 0) roomContent += `    - ผ้าทึบ: ${fmt(setOpaqueYards, 2)} หลา, ราง ${fmt(setOpaqueTrack, 2)} ม.\n`;
                    if (setSheerYards > 0) roomContent += `    - ผ้าโปร่ง: ${fmt(setSheerYards, 2)} หลา, ราง ${fmt(setSheerTrack, 2)} ม.\n`;
                }
                roomTotal += setPrice; grandOpaqueYards += setOpaqueYards; grandSheerYards += setSheerYards; grandOpaqueTrack += setOpaqueTrack; grandSheerTrack += setSheerTrack;
            });
            room.decorations.forEach((deco, decoIndex) => {
                if (deco.is_suspended) return;
                const decoPrice = Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
                if (options.details) roomContent += `  - รายการตกแต่ง #${decoIndex + 1}: ${deco.type}, ราคา ${fmt(decoPrice, 0, true)} บ.\n`;
                roomTotal += decoPrice;
            });
            room.wallpapers.forEach((wp, wpIndex) => {
                if (wp.is_suspended) return;
                const totalWidth = wp.widths.reduce((sum, w) => sum + w, 0), rollsNeeded = CALC.wallpaperRolls(totalWidth, wp.height_m);
                const wpPrice = Math.round(rollsNeeded * wp.price_per_roll);
                if (options.details) roomContent += `  - วอลเปเปอร์ #${wpIndex + 1}: ใช้ ${rollsNeeded} ม้วน, ราคา ${fmt(wpPrice, 0, true)} บ.\n`;
                roomTotal += wpPrice;
            });
            if(roomContent) {
                 roomDetails += `ห้องที่ ${roomIndex + 1}: ${room.room_name || `ห้อง ${String(roomIndex + 1).padStart(2, '0')}`}\n` + roomContent + `  - รวมราคาห้อง: ${fmt(roomTotal, 0, true)} บ.\n\n`;
            }
            grandTotal += roomTotal;
        });
        summary += roomDetails;
        if (options.summary) {
            summary += "สรุปยอดรวมทั้งหมด:\n";
            summary += `- จำนวนชุดติดตั้ง: ${document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length} ชุด\n`;
            summary += `- ปริมาณผ้าทึบ: ${fmt(grandOpaqueYards, 2)} หลา\n`;
            summary += `- ปริมาณผ้าโปร่ง: ${fmt(grandSheerYards, 2)} หลา\n`;
            summary += `- รางผ้าทึบ: ${fmt(grandOpaqueTrack, 2)} ม.\n`;
            summary += `- รางผ้าโปร่ง: ${fmt(grandSheerTrack, 2)} ม.\n`;
            summary += `- **รวมราคาสุทธิ: ${fmt(grandTotal, 0, true)} บาท**\n`;
        }
        return summary;
    }
    
    const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); });
    orderForm.addEventListener("input", debouncedRecalcAndSave);
    orderForm.addEventListener("change", e => {
        const target = e.target;
        if(target.matches('select[name="fabric_variant"], select[name="room_style"], select[name="room_price_per_m"], select[name="sheer_price_per_m"]')) {
             recalcAll(); saveData();
        }
        if (target.matches('select[name="fabric_variant"]')) {
            toggleSetFabricUI(target.closest(SELECTORS.set));
        }
    });

    orderForm.addEventListener("click", e => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const action = btn.dataset.act, roomEl = btn.closest(SELECTORS.room);
        const actions = {
            'add-set': () => addSet(roomEl), 'add-deco': () => addDeco(roomEl), 'add-wallpaper': () => addWallpaper(roomEl),
            'del-room': () => delRoom(btn), 'del-set': () => delSet(btn), 'del-deco': () => delDeco(btn),
            'del-wallpaper': () => delWallpaper(btn), 'clear-set': () => clearSet(btn), 'clear-deco': () => clearDeco(btn),
            'clear-wallpaper': () => clearWallpaper(btn), 'del-wall': () => delWall(btn), 'add-wall': () => addWall(btn),
            'toggle-suspend': () => toggleSuspend(btn)
        };
        if(actions[action]) actions[action]();
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        const options = await showCopyOptionsModal();
        if (!options) return;
        navigator.clipboard.writeText(buildTextSummary(options))
            .then(() => showToast('คัดลอกข้อความสำเร็จ', 'success'))
            .catch(err => { console.error('Failed to copy text:', err); showToast('คัดลอกล้มเหลว', 'error'); });
    });

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', toggleLock);

    const menuBtn = document.querySelector(SELECTORS.menuBtn);
    const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
    menuBtn.addEventListener('click', () => menuDropdown.classList.toggle('show'));
    window.addEventListener('click', (e) => {
        if (!menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) menuDropdown.classList.remove('show');
    });
    
    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        menuDropdown.classList.remove('show');
        navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2))
            .then(() => showToast('คัดลอกข้อมูล (JSON) แล้ว', 'success'))
            .catch(err => { console.error('Failed to copy JSON:', err); showToast('คัดลอกล้มเหลว', 'error'); });
    });
    
    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        menuDropdown.classList.remove('show');
        showModal(SELECTORS.importModal);
    });
    document.querySelector(SELECTORS.importConfirm).addEventListener('click', async () => {
        const json = document.querySelector(SELECTORS.importJsonArea).value;
        if (json && await showConfirmation('ยืนยันการนำเข้า', 'ข้อมูลปัจจุบันจะถูกเขียนทับทั้งหมด')) {
            try {
                loadPayload(JSON.parse(json));
                document.querySelector(SELECTORS.importJsonArea).value = '';
            } catch (e) {
                showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
            }
        }
        hideModal(SELECTORS.importModal);
    });
    document.querySelector(SELECTORS.importCancel).addEventListener('click', () => hideModal(SELECTORS.importModal));
    
    orderForm.addEventListener("submit", (e) => {
        e.preventDefault();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
        showToast("ส่งข้อมูลแล้ว...", "success");
        // e.target.submit(); // Uncomment to actually submit the form
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                loadPayload(JSON.parse(storedData));
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