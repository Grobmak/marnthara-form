(function() {
    'use strict';
    const APP_VERSION = "input-ui/4.0.0-m3";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";
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
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl', copyOptionsTpl: '#copyOptionsTpl',
        payloadInput: '#payload',
        addRoomHeaderBtn: '#addRoomHeaderBtn', submitBtn: '#submitBtn',
        grandTotal: '#grandTotal', setCount: '#setCount', setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        lockBtn: '#lockBtn', clearAllBtn: '#clearAllBtn',
        grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric', grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', copyTextBtn: '#copyTextBtn', copyJsonBtn: '#copyJsonBtn',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        toastContainer: '#toast-container',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]', roomPricePerM: 'select[name="room_price_per_m"]', roomStyle: 'select[name="room_style"]',
        copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel', copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary'
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
    const debounce = (fn, ms = 120) => {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), ms);
        };
    };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) {
            if (h > entry.threshold) return entry.add_per_m;
        }
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
        else {
            toast.style.backgroundColor = 'var(--sys-color-surface)';
            toast.style.color = 'var(--sys-color-on-surface)';
        }

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
            const modal = document.querySelector(SELECTORS.confirmationModal);
            modal.classList.add('visible');
            modal.querySelector(SELECTORS.modalTitle).textContent = 'เลือกข้อมูลที่ต้องการคัดลอก';
            
            const bodyContent = document.querySelector(SELECTORS.copyOptionsTpl).content.cloneNode(true);
            const modalBody = modal.querySelector(SELECTORS.modalBody);
            modalBody.innerHTML = '';
            modalBody.appendChild(bodyContent);
            
            const confirmBtn = modal.querySelector('#copyOptionsConfirm');
            const cancelBtn = modal.querySelector('#copyOptionsCancel');

            const cleanup = (result) => {
                modal.classList.remove('visible');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                modalBody.innerHTML = ''; // Clear temporary content
                resolve(result);
            };

            confirmBtn.onclick = () => {
                const options = {
                    customer: modal.querySelector(SELECTORS.copyCustomerInfo).checked,
                    details: modal.querySelector(SELECTORS.copyRoomDetails).checked,
                    summary: modal.querySelector(SELECTORS.copySummary).checked,
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

        renumber();
        recalcAll();
        saveData();
        updateLockState();
        created.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }

    function populatePriceOptions(selectEl, prices) {
        selectEl.innerHTML = `<option value="" hidden>เลือก</option>`;
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
            }
        }
        toggleSetFabricUI(created);
        renumber();
        recalcAll();
        saveData();
        updateLockState();
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
            }
        }
        renumber();
        recalcAll();
        saveData();
        updateLockState();
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
            }
        } else {
            addWall(created.querySelector('[data-act="add-wall"]'));
        }

        renumber();
        recalcAll();
        saveData();
        updateLockState();
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
        btn.closest(SELECTORS.decoItem).querySelectorAll('input, select').forEach(el => {
            el.value = '';
        });
        recalcAll();
        saveData();
        updateLockState();
        showToast('ล้างข้อมูลตกแต่งแล้ว', 'success');
    }

    function toggleSetFabricUI(setEl) {
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        setEl.querySelector(SELECTORS.sheerWrap).classList.toggle("hidden", !hasSheer);
        
        const summaryRow = setEl.querySelector('.item-details');
        summaryRow.querySelectorAll('[data-opaque-price-label]').forEach(el => el.classList.toggle('hidden', variant !== "ทึบ" && variant !== "ทึบ&โปร่ง"));
        summaryRow.querySelectorAll('[data-sheer-price-label]').forEach(el => el.classList.toggle('hidden', variant !== "โปร่ง" && variant !== "ทึบ&โปร่ง"));
        summaryRow.querySelectorAll('[data-opaque-yardage-label]').forEach(el => el.classList.toggle('hidden', variant !== "ทึบ" && variant !== "ทึบ&โปร่ง"));
        summaryRow.querySelectorAll('[data-sheer-yardage-label]').forEach(el => el.classList.toggle('hidden', variant !== "โปร่ง" && variant !== "ทึบ&โปร่ง"));
        summaryRow.querySelectorAll('[data-opaque-track-label]').forEach(el => el.classList.toggle('hidden', variant !== "ทึบ" && variant !== "ทึบ&โปร่ง"));
        summaryRow.querySelectorAll('[data-sheer-track-label]').forEach(el => el.classList.toggle('hidden', variant !== "โปร่ง" && variant !== "ทึบ&โปร่ง"));
    }

    function toggleSuspend(btn) {
        const item = btn.closest('.item-card');
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        btn.querySelector('[data-suspend-text]').textContent = isSuspended ? 'visibility_off' : 'visibility';
        recalcAll();
        saveData();
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
        let sets = 0, decos = 0;
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;

            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            const totalItems = items.length;

            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}/${totalItems}` : `${iIdx + 1}`;
            });
            sets += room.querySelectorAll(SELECTORS.set).length;
            decos += room.querySelectorAll(SELECTORS.decoItem).length;
        });
        document.querySelector(SELECTORS.setCountSets).textContent = sets;
        document.querySelector(SELECTORS.setCountDeco).textContent = decos;
    }

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        let setsCount = 0;

        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);

            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') {
                    set.querySelector('[data-set-price-total]').textContent = "0";
                    set.querySelector('[data-set-yardage-total]').textContent = "0.00";
                    set.querySelector('[data-set-price-opaque]').textContent = "0";
                    set.querySelector('[data-set-price-sheer]').textContent = "0";
                    set.querySelector('[data-set-yardage-opaque]').textContent = "0.00";
                    set.querySelector('[data-set-yardage-sheer]').textContent = "0.00";
                    set.querySelector('[data-set-opaque-track]').textContent = "0.00";
                    set.querySelector('[data-set-sheer-track]').textContent = "0.00";
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
                set.querySelector('[data-set-price-total]').textContent = fmt(opaquePrice + sheerPrice, 0, true);
                set.querySelector('[data-set-yardage-total]').textContent = fmt(opaqueYards + sheerYards, 2);
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
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value), h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
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
                let totalArea = 0;
                let wallSum = 0;
                wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                    const w = clamp01(input.value);
                    if (w > 0 && h > 0) {
                        totalArea += (w * h);
                        wallSum++;
                    }
                });
                const numRolls = Math.ceil(totalArea / WALLPAPER_SQM_PER_ROLL);
                const wallpaperPrice = numRolls * pricePerRoll;
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalArea, 2)}</span> ตร.ม. • ใช้ <span class="price">${numRolls}</span> ม้วน`;
                roomSum += wallpaperPrice;
            });

            room.querySelector('[data-room-brief]').innerHTML = `
                <span class="num">${room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length}</span> จุด • 
                <span class="num">${room.querySelectorAll(SELECTORS.set).length}</span> ชุด • 
                ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บ.
            `;
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        
        const summaryTpl = `
            <details class="summary-details">
                <summary class="summary-details-head">สรุปวัสดุ</summary>
                <div class="summary-popup">
                    <div class="summary-item"><div class="summary-label">ผ้าทึบที่ใช้</div><div class="summary-value price" id="grandFabric">${fmt(grandOpaqueYards, 2)} หลา</div></div>
                    <div class="summary-item"><div class="summary-label">ผ้าโปร่งที่ใช้</div><div class="summary-value price" id="grandSheerFabric">${fmt(grandSheerYards, 2)} หลา</div></div>
                    <div class="summary-item"><div class="summary-label">รางทึบที่ใช้</div><div class="summary-value price" id="grandOpaqueTrack">${fmt(grandOpaqueTrack, 2)} ม.</div></div>
                    <div class="summary-item"><div class="summary-label">รางโปร่งที่ใช้</div><div class="summary-value price" id="grandSheerTrack">${fmt(grandSheerTrack, 2)} ม.</div></div>
                </div>
            </details>
        `;
        document.querySelector('.actions').innerHTML = summaryTpl; // Removed buttons
    }

    function buildPayload() {
        const payload = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: toNum(room.querySelector(SELECTORS.roomPricePerM).value),
                style: room.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: []
            };

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const w = clamp01(set.querySelector('input[name="width_m"]').value);
                const h = clamp01(set.querySelector('input[name="height_m"]').value);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                const openType = set.querySelector('select[name="open_type"]').value;
                const sheerPrice = toNum(set.querySelector('select[name="sheer_price_per_m"]').value);
                const isSuspended = set.dataset.suspended === 'true';
                roomData.sets.push({
                    width_m: w,
                    height_m: h,
                    fabric_variant: variant,
                    open_type: openType,
                    sheer_price_per_m: sheerPrice,
                    is_suspended: isSuspended,
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const type = deco.querySelector('[name="deco_type"]').value;
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]').value);
                const isSuspended = deco.dataset.suspended === 'true';
                roomData.decorations.push({
                    type: type,
                    width_m: w,
                    height_m: h,
                    price_sqyd: price,
                    is_suspended: isSuspended,
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                const widths = [];
                wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                    const w = clamp01(input.value);
                    if (w > 0) widths.push(w);
                });
                const isSuspended = wallpaper.dataset.suspended === 'true';
                roomData.wallpapers.push({
                    height_m: h,
                    price_per_roll: pricePerRoll,
                    widths: widths,
                    is_suspended: isSuspended,
                });
            });

            payload.rooms.push(roomData);
        });
        return payload;
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function exportJson() {
        const payload = buildPayload();
        const jsonStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `marnthara-data-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Export ข้อมูลสำเร็จ', 'success');
    }

    async function importJson() {
        if (isLocked) return;
        const modal = document.querySelector(SELECTORS.importModal);
        modal.classList.add('visible');
        const jsonArea = modal.querySelector(SELECTORS.importJsonArea);
        const confirmBtn = modal.querySelector(SELECTORS.importConfirm);
        const cancelBtn = modal.querySelector(SELECTORS.importCancel);

        return new Promise((resolve) => {
            const cleanup = (result) => {
                modal.classList.remove('visible');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(result);
            };

            confirmBtn.onclick = async () => {
                try {
                    const payload = JSON.parse(jsonArea.value);
                    const shouldImport = await showConfirmation('ยืนยันการนำเข้า', 'การนำเข้าจะแทนที่ข้อมูลปัจจุบันทั้งหมด คุณแน่ใจหรือไม่?');
                    if (shouldImport) {
                        applyPayload(payload);
                        showToast('นำเข้าข้อมูลสำเร็จ', 'success');
                    }
                } catch (err) {
                    showToast('รูปแบบข้อมูล JSON ไม่ถูกต้อง', 'error');
                }
                cleanup(true);
            };
            cancelBtn.onclick = () => cleanup(false);
        });
    }
    
    function applyPayload(payload) {
        document.querySelector('input[name="customer_name"]').value = payload.customer_name;
        document.querySelector('input[name="customer_address"]').value = payload.customer_address;
        document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
        roomsEl.innerHTML = "";
        roomCount = 0;
        if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
        else addRoom();
    }

    async function copyToClipboard(options) {
        const payload = buildPayload();
        let text = "";

        if (options.customer && payload.customer_name) {
            text += `ลูกค้า: ${payload.customer_name}\n`;
            if (payload.customer_phone) text += `เบอร์: ${payload.customer_phone}\n`;
            if (payload.customer_address) text += `รายละเอียด: ${payload.customer_address}\n`;
            text += "\n";
        }
        
        if (options.details) {
            let roomIdx = 1;
            payload.rooms.forEach(room => {
                const roomTitle = room.room_name || `ห้อง ${String(roomIdx).padStart(2, "0")}`;
                text += `=== ${roomTitle} ===\n`;
                text += `ราคาผ้า: ${fmt(room.price_per_m_raw, 0, true)} บ. Style: ${room.style}\n`;
                
                room.sets.forEach((set, sIdx) => {
                    const status = set.is_suspended ? ' (ระงับ)' : '';
                    text += `- จุดที่ ${sIdx+1}: ${set.width_m}x${set.height_m} ม. (${set.fabric_variant}${status}) ${set.open_type} - ราคา ${fmt((set.price || 0) + (set.sheer_price || 0), 0, true)} บ.\n`;
                });
                room.decorations.forEach((deco, dIdx) => {
                    const status = deco.is_suspended ? ' (ระงับ)' : '';
                    text += `- ตกแต่งที่ ${dIdx+1}: ${deco.type} ${deco.width_m}x${deco.height_m} ม. ราคา ${fmt(deco.price, 0, true)} บ.${status}\n`;
                });
                room.wallpapers.forEach((wp, wIdx) => {
                    const status = wp.is_suspended ? ' (ระงับ)' : '';
                    text += `- วอลเปเปอร์ที่ ${wIdx+1}: สูง ${wp.height_m} ม. กว้าง ${wp.widths.join(', ')} ม. ราคา ${fmt(wp.price, 0, true)} บ. ใช้ ${wp.rolls} ม้วน${status}\n`;
                });
                text += "\n";
                roomIdx++;
            });
        }
        
        if (options.summary) {
            const grandTotal = toNum(document.querySelector(SELECTORS.grandTotal).textContent.replace(/,/g, ''));
            const opaqueYards = toNum(document.querySelector(SELECTORS.grandFabric').textContent.replace(/[^0-9.]/g, ''));
            const sheerYards = toNum(document.querySelector(SELECTORS.grandSheerFabric').textContent.replace(/[^0-9.]/g, ''));
            const opaqueTrack = toNum(document.querySelector(SELECTORS.grandOpaqueTrack').textContent.replace(/[^0-9.]/g, ''));
            const sheerTrack = toNum(document.querySelector(SELECTORS.grandSheerTrack').textContent.replace(/[^0-9.]/g, ''));
            
            text += "=== สรุปยอดรวม ===\n";
            text += `ราคารวม: ${fmt(grandTotal, 0, true)} บ.\n`;
            text += `ผ้าทึบ: ${fmt(opaqueYards, 2)} หลา\n`;
            text += `ผ้าโปร่ง: ${fmt(sheerYards, 2)} หลา\n`;
            text += `รางทึบ: ${fmt(opaqueTrack, 2)} ม.\n`;
            text += `รางโปร่ง: ${fmt(sheerTrack, 2)} ม.\n`;
        }

        try {
            await navigator.clipboard.writeText(text.trim());
            showToast('คัดลอกข้อมูลสำเร็จ!', 'success');
        } catch (err) {
            showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
        }
    }
    
    function updateLockState() {
        const lockIcon = document.querySelector(SELECTORS.lockBtn).querySelector('.lock-icon');
        if (isLocked) {
            lockIcon.textContent = 'lock';
            lockIcon.classList.add('filled');
            document.body.classList.add('locked');
            document.querySelectorAll('input, select, .btn:not(.btn-text):not(.fab)').forEach(el => {
                if(el.dataset.act !== 'toggle-lock' && el.id !== 'lockBtn') el.disabled = true;
            });
        } else {
            lockIcon.textContent = 'lock_open';
            lockIcon.classList.remove('filled');
            document.body.classList.remove('locked');
            document.querySelectorAll('input, select, .btn').forEach(el => el.disabled = false);
        }
    }

    // Event Listeners
    document.addEventListener('click', (e) => {
        if (e.target.closest(SELECTORS.addRoomHeaderBtn)) addRoom();
        if (e.target.closest('[data-act="del-room"]')) delRoom(e.target);
        if (e.target.closest('[data-act="add-set"]')) addSet(e.target.closest(SELECTORS.room));
        if (e.target.closest('[data-act="add-deco"]')) addDeco(e.target.closest(SELECTORS.room));
        if (e.target.closest('[data-act="add-wallpaper"]')) addWallpaper(e.target.closest(SELECTORS.room));
        if (e.target.closest('[data-act="del-set"]')) delSet(e.target);
        if (e.target.closest('[data-act="del-deco"]')) delDeco(e.target);
        if (e.target.closest('[data-act="del-wallpaper"]')) delWallpaper(e.target);
        if (e.target.closest('[data-act="del-wall"]')) delWall(e.target);
        if (e.target.closest('[data-act="clear-set"]')) clearSet(e.target);
        if (e.target.closest('[data-act="clear-deco"]')) clearDeco(e.target);
        if (e.target.closest('[data-act="clear-wallpaper"]')) clearWallpaper(e.target);
        if (e.target.closest(SELECTORS.clearAllBtn)) clearAllData();
        if (e.target.closest(SELECTORS.menuBtn)) document.querySelector(SELECTORS.menuDropdown).classList.toggle('visible');
        if (e.target.closest(SELECTORS.exportBtn)) exportJson();
        if (e.target.closest(SELECTORS.importBtn)) importJson();
        if (e.target.closest(SELECTORS.lockBtn)) {
            isLocked = !isLocked;
            updateLockState();
            showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'default');
        }
        if (e.target.closest(SELECTORS.copyTextBtn)) {
            showCopyOptionsModal().then(result => {
                if (result) {
                    copyToClipboard(result);
                }
            });
        }
        if (e.target.closest('[data-act="suspend-set"]') || e.target.closest('[data-act="suspend-deco"]') || e.target.closest('[data-act="suspend-wallpaper"]')) {
            toggleSuspend(e.target);
        }
    });

    document.addEventListener('input', debounce((e) => {
        if (e.target.closest(SELECTORS.room) || e.target.closest('#customerInfo')) {
            recalcAll();
            saveData();
        }
        if (e.target.closest(SELECTORS.set) && e.target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
    }));
    
    document.addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        if (!menuDropdown.contains(e.target) && !document.querySelector(SELECTORS.menuBtn).contains(e.target)) {
            menuDropdown.classList.remove('visible');
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
                applyPayload(payload);
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