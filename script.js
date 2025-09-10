(function() {
    'use strict';
    const APP_VERSION = "input-ui/4.0.0";
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
        setCountSets: '#setCountSets', setCountDeco: '#setCountDeco', setCountWallpaper: '#setCountWallpaper',
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
        const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        const room = frag.querySelector(SELECTORS.room);
        populatePriceOptions(room.querySelector(SELECTORS.roomPricePerM), PRICING.fabric);
        roomsEl.appendChild(frag);
        const created = roomsEl.lastElementChild;

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
        const created = setsWrap.lastElementChild;
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
        const created = decoWrap.lastElementChild;
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
        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        wallpaperWrap.appendChild(frag);
        const created = wallpaperWrap.lastElementChild;

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
    async function clearWallpaper(btn) { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; const item = btn.closest(SELECTORS.wallpaperItem); item.querySelectorAll('input[type="number"]').forEach(el => el.value = ''); item.querySelectorAll('input[type="text"]').forEach(el => el.value = ''); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); recalcAll(); saveData(); updateLockState(); showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success'); }

    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }

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
        let setCount = 0, setCountSets = 0, setCountDeco = 0, setCountWallpaper = 0;

        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);

            const sets = room.querySelectorAll(SELECTORS.set);
            const decos = room.querySelectorAll(SELECTORS.decoItem);
            const wallpapers = room.querySelectorAll(SELECTORS.wallpaperItem);

            sets.forEach((set) => {
                const isSuspended = set.dataset.suspended === 'true';
                if (isSuspended) {
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
                const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]').value;
                const specialPrice = toNum(set.querySelector('input[name="special_price"]').value);

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

                const finalPrice = specialPrice > 0 ? specialPrice : (opaquePrice + sheerPrice);
                set.querySelector('[data-set-price-total]').textContent = fmt(finalPrice, 0, true);
                set.querySelector('[data-set-price-opaque]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-set-price-sheer]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);

                roomSum += finalPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
                if (finalPrice > 0) setCountSets++;
            });

            decos.forEach(deco => {
                const summaryEl = deco.querySelector('[data-deco-summary]');
                const isSuspended = deco.dataset.suspended === 'true';
                if (isSuspended) {
                    summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.หลา`;
                    return;
                }
                const w = clamp01(deco.querySelector('[name="deco_width_m"]').value),
                      h = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]').value);
                const areaSqyd = (w * h) * SQM_TO_SQYD;
                const decoPrice = Math.round(areaSqyd * price);
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(decoPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(areaSqyd, 2)}</span> ตร.หลา`;
                roomSum += decoPrice;
                if (decoPrice > 0) setCountDeco++;
            });

            wallpapers.forEach(wallpaper => {
                const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
                const isSuspended = wallpaper.dataset.suspended === 'true';
                if (isSuspended) {
                    summaryEl.innerHTML = `ราคา: <span class="price">0</span> บ. • พื้นที่: <span class="price">0.00</span> ตร.ม. • ใช้ <span class="price">0</span> ม้วน`;
                    return;
                }
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                const widths = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).map(i => clamp01(i.value));
                const totalWidth = widths.reduce((sum, w) => sum + w, 0);
                const areaSqm = totalWidth * h;
                const rolls = Math.ceil(areaSqm / WALLPAPER_SQM_PER_ROLL);
                const wallpaperPrice = rolls * pricePerRoll;
                summaryEl.innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> บ. • พื้นที่: <span class="price" data-wallpaper-area-sqm>${fmt(areaSqm, 2)}</span> ตร.ม. • ใช้ <span class="price" data-wallpaper-rolls>${rolls}</span> ม้วน`;
                roomSum += wallpaperPrice;
                if (wallpaperPrice > 0) setCountWallpaper++;
            });

            const roomBrief = room.querySelector('[data-room-brief]');
            roomBrief.innerHTML = `<span class="num">จุด ${sets.length}</span> • <span class="num">ชุด ${sets.length + decos.length + wallpapers.length}</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บ.`;
            grand += roomSum;
            setCount = setCountSets + setCountDeco + setCountWallpaper;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = setCount;
        document.querySelector(SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(SELECTORS.setCountDeco).textContent = setCountDeco;
        document.querySelector(SELECTORS.setCountWallpaper).textContent = setCountWallpaper;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;

        saveData();
    }

    function buildPayload() {
        const payload = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            app_version: APP_VERSION,
            grand_total: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            grand_fabric_yards: toNum(document.querySelector(SELECTORS.grandFabric).textContent),
            grand_sheer_yards: toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent),
            grand_opaque_track: toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent),
            grand_sheer_track: toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent),
            set_count: toNum(document.querySelector(SELECTORS.setCount).textContent),
            set_count_sets: toNum(document.querySelector(SELECTORS.setCountSets).textContent),
            set_count_deco: toNum(document.querySelector(SELECTORS.setCountDeco).textContent),
            set_count_wallpaper: toNum(document.querySelector(SELECTORS.setCountWallpaper).textContent),
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value || roomEl.querySelector(SELECTORS.roomNameInput).placeholder,
                price_per_m_raw: toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value),
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: []
            };
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    width_m: clamp01(setEl.querySelector('input[name="width_m"]').value),
                    height_m: clamp01(setEl.querySelector('input[name="height_m"]').value),
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                    open_type: setEl.querySelector('select[name="open_type"]').value,
                    special_price: toNum(setEl.querySelector('input[name="special_price"]').value),
                    is_suspended: setEl.dataset.suspended === 'true',
                    opaque_price: toNum(setEl.querySelector('[data-set-price-opaque]').textContent),
                    sheer_price: toNum(setEl.querySelector('[data-set-price-sheer]').textContent),
                    total_price: toNum(setEl.querySelector('[data-set-price-total]').textContent),
                    opaque_yards: toNum(setEl.querySelector('[data-set-yardage-opaque]').textContent),
                    sheer_yards: toNum(setEl.querySelector('[data-set-yardage-sheer]').textContent),
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const w = clamp01(decoEl.querySelector('[name="deco_width_m"]').value),
                      h = clamp01(decoEl.querySelector('[name="deco_height_m"]').value);
                const areaSqyd = (w * h) * SQM_TO_SQYD;
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: w, height_m: h,
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                    area_sqyd: areaSqyd,
                    total_price: toNum(decoEl.querySelector('[data-deco-summary] .price').textContent),
                    is_suspended: decoEl.dataset.suspended === 'true',
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const widths = Array.from(wallpaperEl.querySelectorAll('input[name="wall_width_m"]')).map(i => clamp01(i.value));
                roomData.wallpapers.push({
                    height_m: clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths,
                    area_sqm: toNum(wallpaperEl.querySelector('[data-wallpaper-area-sqm]').textContent),
                    rolls: toNum(wallpaperEl.querySelector('[data-wallpaper-rolls]').textContent),
                    total_price: toNum(wallpaperEl.querySelector('[data-wallpaper-summary] .price').textContent),
                    is_suspended: wallpaperEl.dataset.suspended === 'true',
                });
            });
            if (roomData.sets.length > 0 || roomData.decorations.length > 0 || roomData.wallpapers.length > 0) {
                payload.rooms.push(roomData);
            }
        });
        return payload;
    }

    function copyToClipboard(text) {
        if (!navigator.clipboard) {
            fallbackCopyTextToClipboard(text);
            return;
        }
        navigator.clipboard.writeText(text).then(function() {
            showToast('คัดลอกข้อมูลแล้ว', 'success');
        }, function(err) {
            console.error('Async: Could not copy text: ', err);
            showToast('ไม่สามารถคัดลอกได้', 'error');
        });
    }

    function fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('คัดลอกข้อมูลแล้ว', 'success');
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
            showToast('ไม่สามารถคัดลอกได้', 'error');
        }
        document.body.removeChild(textArea);
    }

    function buildCopyText(options) {
        const payload = buildPayload();
        let text = ``;
        if (options.customer) {
            text += `=== ข้อมูลลูกค้า ===
ชื่อ: ${payload.customer_name || '-'}
เบอร์โทร: ${payload.customer_phone || '-'}
รายละเอียด: ${payload.customer_address || '-'}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach(room => {
                text += `=== ห้อง ${room.room_name} ===\n`;
                text += `ราคาผ้า: ${fmt(room.price_per_m_raw, 0, true)} บ./ม. | สไตล์: ${room.style}\n`;
                room.sets.forEach((s, idx) => {
                    if (s.is_suspended) return;
                    text += `\nจุดผ้าม่านที่ ${idx + 1}:
  กว้าง: ${s.width_m} ม. | สูง: ${s.height_m} ม.
  ประเภท: ${s.fabric_variant} | รูปแบบเปิด: ${s.open_type || '-'}
  ราคา: ${fmt(s.total_price, 0, true)} บ. (ทึบ: ${fmt(s.opaque_price, 0, true)} บ. | โปร่ง: ${fmt(s.sheer_price, 0, true)} บ.)
  ใช้ผ้า: ทึบ ${fmt(s.opaque_yards, 2)} หลา | โปร่ง ${fmt(s.sheer_yards, 2)} หลา\n`;
                });
                room.decorations.forEach((d, idx) => {
                    if (d.is_suspended) return;
                    text += `\nรายการตกแต่งที่ ${idx + 1}:
  ประเภท: ${d.type || '-'}
  กว้าง: ${d.width_m} ม. | สูง: ${d.height_m} ม.
  ราคา: ${fmt(d.total_price, 0, true)} บ. | พื้นที่: ${fmt(d.area_sqyd, 2)} ตร.หลา\n`;
                });
                room.wallpapers.forEach((w, idx) => {
                    if (w.is_suspended) return;
                    text += `\nรายการวอลเปเปอร์ที่ ${idx + 1}:
  สูง: ${w.height_m} ม. | ผนังกว้างรวม: ${fmt(w.widths.reduce((a,b)=>a+b, 0), 2)} ม.
  ใช้: ${w.rolls} ม้วน | ราคา: ${fmt(w.price_per_roll, 0, true)} บ./ม้วน
  ราคารวม: ${fmt(w.total_price, 0, true)} บ.\n`;
                });
                text += `\nราคาห้องรวม: ${fmt(room.sets.map(s => s.total_price).reduce((a, b) => a + b, 0) + room.decorations.map(d => d.total_price).reduce((a, b) => a + b, 0) + room.wallpapers.map(w => w.total_price).reduce((a,b)=>a+b, 0), 0, true)} บ.
---------------------------\n\n`;
            });
        }

        if (options.summary) {
            text += `\n=== สรุปยอดรวม ===
ราคารวมทั้งหมด: ${fmt(payload.grand_total, 0, true)} บ.
จำนวนผ้าม่าน: ${payload.set_count_sets} จุด
จำนวนตกแต่ง: ${payload.set_count_deco} รายการ
จำนวนวอลเปเปอร์: ${payload.set_count_wallpaper} รายการ
ผ้าทึบที่ใช้: ${fmt(payload.grand_fabric_yards, 2)} หลา
ผ้าโปร่งที่ใช้: ${fmt(payload.grand_sheer_yards, 2)} หลา
รางทึบที่ใช้: ${fmt(payload.grand_opaque_track, 2)} ม.
รางโปร่งที่ใช้: ${fmt(payload.grand_sheer_track, 2)} ม.\n\n`;
        }

        return text;
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function loadData() {
        try {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
                roomsEl.innerHTML = "";
                if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
                else addRoom();
                return true;
            }
        } catch(err) {
            console.error("Failed to load data from storage:", err);
            localStorage.removeItem(STORAGE_KEY);
        }
        return false;
    }

    function updateLockState() {
        const roomInputs = roomsEl.querySelectorAll('input, select, textarea');
        const headerButtons = document.querySelectorAll('#addRoomHeaderBtn, #clearAllBtn');
        const roomButtons = roomsEl.querySelectorAll('button:not(#lockBtn)');
        const copyJsonBtn = document.querySelector(SELECTORS.copyJsonBtn);
        const copyTextBtn = document.querySelector(SELECTORS.copyTextBtn);
        const submitBtn = document.querySelector(SELECTORS.submitBtn);

        if (isLocked) {
            [...roomInputs, ...headerButtons, ...roomButtons, copyJsonBtn, copyTextBtn, submitBtn].forEach(el => el.disabled = true);
            document.querySelector(SELECTORS.lockBtn).innerHTML = '<span class="lock-text">ปลดล็อค</span> <span class="lock-icon">🔓</span>';
            document.querySelector(SELECTORS.lockBtn).classList.remove('btn-primary');
            document.querySelector(SELECTORS.lockBtn).classList.add('btn-warning');
        } else {
            [...roomInputs, ...headerButtons, ...roomButtons, copyJsonBtn, copyTextBtn, submitBtn].forEach(el => el.disabled = false);
            document.querySelector(SELECTORS.lockBtn).innerHTML = '<span class="lock-text">ล็อค</span> <span class="lock-icon">🔒</span>';
            document.querySelector(SELECTORS.lockBtn).classList.remove('btn-warning');
            document.querySelector(SELECTORS.lockBtn).classList.add('btn-primary');
        }
    }

    function init() {
        if (!loadData()) addRoom();
        renumber();
        recalcAll();
        updateLockState();
        showToast(`Marnthara Input v${APP_VERSION} พร้อมใช้งานแล้ว`, 'success');

        document.addEventListener('input', debounce((e) => {
            if (e.target.closest(SELECTORS.room)) {
                recalcAll();
            } else if (e.target.closest('#customerInfo')) {
                saveData();
            }
        }, 300));

        document.addEventListener('change', (e) => {
            const el = e.target;
            if (el.matches('select[name="fabric_variant"]')) {
                toggleSetFabricUI(el.closest(SELECTORS.set));
            }
            recalcAll();
        });

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const action = btn.dataset.act;
            const roomEl = btn.closest(SELECTORS.room);
            const setEl = btn.closest(SELECTORS.set);
            const decoEl = btn.closest(SELECTORS.decoItem);
            const wallpaperEl = btn.closest(SELECTORS.wallpaperItem);

            if (isLocked && action !== 'suspend-item' && action !== 'del-wall') {
                showToast('ฟอร์มถูกล็อคอยู่', 'warning');
                return;
            }

            switch(action) {
                case 'add-set': addSet(roomEl); break;
                case 'add-deco': addDeco(roomEl); break;
                case 'add-wallpaper': addWallpaper(roomEl); break;
                case 'add-wall': addWall(btn); break;
                case 'del-room': delRoom(btn); break;
                case 'del-set': delSet(btn); break;
                case 'del-deco': delDeco(btn); break;
                case 'del-wallpaper': delWallpaper(btn); break;
                case 'del-wall': delWall(btn); break;
                case 'clear-set': clearSet(btn); break;
                case 'clear-deco': clearDeco(btn); break;
                case 'clear-wallpaper': clearWallpaper(btn); break;
                case 'suspend-item': toggleSuspend(btn); break;
                default: break;
            }
        });

        document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);

        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
            const payload = buildPayload();
            copyToClipboard(JSON.stringify(payload, null, 2));
        });

        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
            const options = await showCopyOptionsModal();
            if (options) {
                const text = buildCopyText(options);
                copyToClipboard(text);
            }
        });

        document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
            isLocked = !isLocked;
            updateLockState();
            showToast(`ฟอร์มถูก${isLocked ? 'ล็อค' : 'ปลดล็อค'}แล้ว`, 'info');
        });

        document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
            document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
        });

        document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
            const modal = document.querySelector(SELECTORS.importModal);
            modal.classList.add('visible');
        });

        document.querySelector(SELECTORS.importCancel).addEventListener('click', () => {
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
        });

        document.querySelector(SELECTORS.importConfirm).addEventListener('click', () => {
            try {
                const data = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                document.querySelector(SELECTORS.importModal).classList.remove('visible');
                showToast('นำเข้าข้อมูลสำเร็จ. กำลังโหลด...', 'success');
                setTimeout(() => location.reload(), 1000);
            } catch (e) {
                showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
            }
        });

        document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
            const payload = buildPayload();
            const jsonText = JSON.stringify(payload, null, 2);
            const blob = new Blob([jsonText], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `marnthara-order-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('ส่งออกข้อมูลสำเร็จ', 'success');
        });
    }
    
    // Initial call
    init();
})();