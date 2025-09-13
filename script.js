(function() {
    'use strict';
    const APP_VERSION = "input-ui/5.0.0-iOS-Styled";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v5";
    const SQM_TO_SQYD = 1.19599;

    const PRICING = {
        fabric: [1000,1200,1300,1400,1500,1600,1700,1800,1900,2000,2100,2200,2300,2400,2500],
        sheer: [1000,1100,1200,1300,1400,1500],
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
            if (stripsPerRoll === 0) return Infinity;
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        }
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        lockBtn: '#lockBtn', addRoomHeaderBtn: '#addRoomHeaderBtn',
        grandTotal: '#grandTotal', setCount: '#setCount', grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]', roomPricePerM: 'select[name="room_price_per_m"]', roomStyle: 'select[name="room_style"]',
        setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        toastContainer: '#toast-container',
        grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal',
        menuBtn: '#menuBtn',
    };

    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    if (orderForm) orderForm.action = WEBHOOK_URL;

    let roomCount = 0;
    let isLocked = false;

    const toNum = v => {
        if (typeof v === 'string') v = v.replace(/,/g, '');
        const num = parseFloat(v);
        return isNaN(num) ? 0 : num;
    };
    const clamp01 = v => Math.max(0, toNum(v));
    const fmt = (n, fixed = 2, asCurrency = false) => {
        const options = asCurrency 
            ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } 
            : { minimumFractionDigits: fixed, maximumFractionDigits: fixed };
        try { return Number(n).toLocaleString("th-TH", options); } catch (e) { return String(n); }
    };
    const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        for (const entry of PRICING.height) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };

    function showToast(message, type = 'success') {
        const container = document.querySelector(SELECTORS.toastContainer);
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }

    const showModal = (selector, onConfirm) => {
        return new Promise((resolve) => {
            const modalEl = document.querySelector(selector);
            if (!modalEl) { resolve(null); return; }
            modalEl.classList.add('visible');
            const confirmBtn = modalEl.querySelector('[id$="Confirm"]');
            const cancelBtn = modalEl.querySelector('[id$="Cancel"]');

            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                if (confirmBtn) confirmBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
                document.removeEventListener('keydown', handleEscape);
                resolve(result);
            };
            const handleEscape = (e) => { if (e.key === 'Escape') cleanup(false); };

            if (confirmBtn) confirmBtn.onclick = async () => cleanup(onConfirm ? await onConfirm() : true);
            if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
            document.addEventListener('keydown', handleEscape);
        });
    };

    const showConfirmation = (title, body) => {
        const modalEl = document.querySelector(SELECTORS.modal);
        if (modalEl) {
            modalEl.querySelector(SELECTORS.modalTitle).textContent = title;
            modalEl.querySelector(SELECTORS.modalBody).textContent = body;
        }
        return showModal(SELECTORS.modal);
    };

    const showCopyOptionsModal = () => showModal(SELECTORS.copyOptionsModal, () => ({
        customer: document.querySelector('#copyCustomerInfo')?.checked ?? false,
        details: document.querySelector('#copyRoomDetails')?.checked ?? false,
        summary: document.querySelector('#copySummary')?.checked ?? false,
    }));

    function populatePriceOptions(selectEl, prices) {
        if (!selectEl) return;
        selectEl.innerHTML = `<option value="" hidden>เลือก</option>`;
        prices.forEach(p => {
            const option = document.createElement('option');
            option.value = p; option.textContent = p.toLocaleString("th-TH");
            selectEl.appendChild(option);
        });
    }

    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl)?.content?.cloneNode(true);
        if (!frag) return;
        const roomNode = frag.querySelector(SELECTORS.room);
        if (roomNode) roomNode.dataset.index = roomCount;
        populatePriceOptions(frag.querySelector(SELECTORS.roomPricePerM), PRICING.fabric);
        roomsEl.appendChild(frag);
        const created = roomsEl.querySelector(`${SELECTORS.room}:last-of-type`);
        if (!created) return;

        if (prefill) {
            created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
            created.querySelector(SELECTORS.roomPricePerM).value = prefill.price_per_m_raw || "";
            created.querySelector(SELECTORS.roomStyle).value = prefill.style || "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                const st = created.querySelector('[data-suspend-text]'); if (st) st.textContent = 'ใช้งาน';
            }
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        } else {
             addSet(created);
        }

        renumber(); recalcAll(); saveData();
        created.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว');
    }

    function addSet(roomEl, prefill) {
        if (isLocked) return;
        const setsWrap = roomEl.querySelector(SELECTORS.setsContainer);
        if (!setsWrap) return;
        const frag = document.querySelector(SELECTORS.setTpl)?.content?.cloneNode(true);
        if (!frag) return;
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
                const st = created.querySelector('[data-suspend-text]'); if (st) st.textContent = 'ใช้งาน';
            }
        }
        toggleSetFabricUI(created); renumber(); recalcAll(); saveData();
    }

    function addDeco(roomEl, prefill) {
        if (isLocked) return;
        const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
        if (!decoWrap) return;
        const frag = document.querySelector(SELECTORS.decoTpl)?.content?.cloneNode(true);
        if (!frag) return;
        decoWrap.appendChild(frag);
        const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);
        if (prefill) {
            created.querySelector('[name="deco_type"]').value = prefill.type || "";
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m ?? "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="deco_price_sqyd"]').value = prefill.price_sqyd ?? "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                const st = created.querySelector('[data-suspend-text]'); if (st) st.textContent = 'ใช้งาน';
            }
        }
        renumber(); recalcAll(); saveData();
    }

    function addWallpaper(roomEl, prefill) {
        if (isLocked) return;
        const wallpaperWrap = roomEl.querySelector(SELECTORS.wallpapersContainer);
        if (!wallpaperWrap) return;
        const frag = document.querySelector(SELECTORS.wallpaperTpl)?.content?.cloneNode(true);
        if (!frag) return;
        wallpaperWrap.appendChild(frag);
        const created = wallpaperWrap.querySelector(`${SELECTORS.wallpaperItem}:last-of-type`);
        if (!created) return;

        if (prefill) {
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="wallpaper_price_roll"]').value = prefill.price_per_roll ?? "";
            (prefill.widths || []).forEach(w => addWall(created.querySelector('[data-act="add-wall"]'), w));
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                const st = created.querySelector('[data-suspend-text]'); if (st) st.textContent = 'ใช้งาน';
            }
        } else {
            addWall(created.querySelector('[data-act="add-wall"]'));
        }
        renumber(); recalcAll(); saveData();
    }

    function addWall(btn, prefillWidth) {
        if (isLocked) return;
        const wallpaperItem = btn.closest(SELECTORS.wallpaperItem);
        const wallsContainer = wallpaperItem?.querySelector(SELECTORS.wallsContainer);
        if (!wallsContainer) return;
        const frag = document.querySelector(SELECTORS.wallTpl)?.content?.cloneNode(true);
        if (!frag) return;
        if (prefillWidth !== undefined) {
            const input = frag.querySelector('input[name="wall_width_m"]');
            if (input) input.value = prefillWidth;
        }
        wallsContainer.appendChild(frag);
    }

    function toggleSuspend(btn) {
        const item = btn.closest('.room, .set, .deco-item, .wallpaper-item');
        if (!item) return;
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        const suspendTextEl = btn.querySelector('[data-suspend-text]');
        if (suspendTextEl) suspendTextEl.textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'นำกลับมาใช้'}แล้ว`, 'warning');
    }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const nameInput = room.querySelector(SELECTORS.roomNameInput);
            if (nameInput) nameInput.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            items.forEach((item, iIdx) => {
                const badge = item.querySelector("[data-item-title]");
                if (badge) badge.textContent = `${iIdx + 1}`;
            });
        });
    }

    const debouncedRecalc = debounce(() => {
        recalcAll();
        saveData();
    }, 200);

    function recalcAll() {
        let grand = { total: 0, opaqueYards: 0, sheerYards: 0, opaqueTrack: 0, sheerTrack: 0, setCount: 0, decoCount: 0, curtainCount: 0 };

        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const isRoomSuspended = room.dataset.suspended === 'true';
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const style = room.querySelector(SELECTORS.roomStyle)?.value;
            const sPlus = stylePlus(style);

            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                const isSuspended = isRoomSuspended || set.dataset.suspended === 'true';
                const w = clamp01(set.querySelector('input[name="width_m"]')?.value);
                const h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                const hPlus = heightPlus(h);
                const variant = set.querySelector('select[name="fabric_variant"]')?.value;
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;

                if (!isSuspended && w > 0 && h > 0) {
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
                    grand.opaqueYards += opaqueYards;
                    grand.sheerYards += sheerYards;
                    grand.opaqueTrack += opaqueTrack;
                    grand.sheerTrack += sheerTrack;
                    grand.curtainCount++;
                    grand.setCount++;
                    roomSum += opaquePrice + sheerPrice;
                }
                updateSetUI(set, { opaquePrice, sheerPrice, opaqueYards, sheerYards, opaqueTrack, sheerTrack });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isSuspended = isRoomSuspended || deco.dataset.suspended === 'true';
                const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                const areaSqyd = w * h * SQM_TO_SQYD;
                const decoPrice = isSuspended ? 0 : Math.round(areaSqyd * price);
                const summaryEl = deco.querySelector('[data-deco-summary]');
                if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">${fmt(decoPrice,0,true)}</span> • พื้นที่: <span class="price">${fmt(areaSqyd,2)}</span> ตร.หลา`;
                if (!isSuspended && w > 0 && h > 0) {
                    roomSum += decoPrice;
                    grand.setCount++;
                    grand.decoCount++;
                }
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const isSuspended = isRoomSuspended || wallpaper.dataset.suspended === 'true';
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                const wallpaperPrice = isSuspended ? 0 : Math.round(rollsNeeded * pricePerRoll);
                const areaSqm = totalWidth * h;
                const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
                if (summaryEl) summaryEl.innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice,0,true)}</span> • พื้นที่: <span class="price">${fmt(areaSqm,2)}</span> ตร.ม. • ใช้ <span class="price">${rollsNeeded}</span> ม้วน`;
                if (!isSuspended && totalWidth > 0 && h > 0) {
                    roomSum += wallpaperPrice;
                    grand.setCount++;
                    grand.decoCount++;
                }
            });

            const totalItemsInRoom = room.querySelectorAll('[data-set]:not(.is-suspended), [data-deco-item]:not(.is-suspended), [data-wallpaper-item]:not(.is-suspended)').length;
            const briefEl = room.querySelector('[data-room-brief]');
            if (briefEl) briefEl.innerHTML = `<span class="num">${totalItemsInRoom} จุด</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span>`;
            grand.total += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand.total, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = grand.setCount;
        document.querySelector(SELECTORS.setCountSets).textContent = grand.curtainCount;
        document.querySelector(SELECTORS.setCountDeco).textContent = grand.decoCount;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grand.opaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grand.sheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grand.opaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grand.sheerTrack, 2)} ม.`;
    }

    function updateSetUI(set, data) {
        set.querySelector('[data-set-price-total]').textContent = fmt((data.opaquePrice||0) + (data.sheerPrice||0), 0, true);
        set.querySelector('[data-set-price-opaque]').textContent = fmt(data.opaquePrice || 0, 0, true);
        set.querySelector('[data-set-price-sheer]').textContent = fmt(data.sheerPrice || 0, 0, true);
        set.querySelector('[data-set-yardage-opaque]').textContent = fmt(data.opaqueYards || 0, 2);
        set.querySelector('[data-set-yardage-sheer]').textContent = fmt(data.sheerYards || 0, 2);
    }

    function toggleSetFabricUI(setEl) {
        if (!setEl) return;
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        const sheerWrap = setEl.querySelector(SELECTORS.sheerWrap);
        if (sheerWrap) sheerWrap.classList.toggle("hidden", !hasSheer);
        const optsRow = setEl.querySelector('[data-set-options-row]');
        if (optsRow) optsRow.classList.toggle("three-col", hasSheer);
        const sheerPriceLabel = setEl.querySelector("[data-sheer-price-label]");
        if (sheerPriceLabel) sheerPriceLabel.classList.toggle("hidden", !hasSheer);
        const sheerYardLabel = setEl.querySelector("[data-sheer-yardage-label]");
        if (sheerYardLabel) sheerYardLabel.classList.toggle("hidden", !hasSheer);
    }

    function buildPayload() {
        const payload = {
            app_version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]')?.value || '',
            customer_phone: document.querySelector('input[name="customer_phone"]')?.value || '',
            customer_address: document.querySelector('input[name="customer_address"]')?.value || '',
            quote_date: document.querySelector('input[name="quote_date"]')?.value || '',
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || '',
                price_per_m_raw: toNum(roomEl.querySelector(SELECTORS.roomPricePerM)?.value),
                style: roomEl.querySelector(SELECTORS.roomStyle)?.value || '',
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [], decorations: [], wallpapers: []
            };
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    width_m: toNum(setEl.querySelector('input[name="width_m"]')?.value), height_m: toNum(setEl.querySelector('input[name="height_m"]')?.value),
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value || '', open_type: setEl.querySelector('select[name="open_type"]')?.value || '',
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value), is_suspended: setEl.dataset.suspended === 'true',
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value || '', width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value), price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                    is_suspended: decoEl.dataset.suspended === 'true',
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                roomData.wallpapers.push({
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value), price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)), is_suspended: wallpaperEl.dataset.suspended === 'true',
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function saveData() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload())); } catch(e) {} }

    function loadPayload(payload) {
        if (!payload || !payload.rooms) { showToast("ข้อมูลไม่ถูกต้อง", "error"); return; }
        document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
        document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
        document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
        document.querySelector('input[name="quote_date"]').value = payload.quote_date || '';
        roomsEl.innerHTML = ""; roomCount = 0;
        if (payload.rooms.length > 0) payload.rooms.forEach(addRoom); else addRoom();
        showToast("โหลดข้อมูลสำเร็จ");
    }

    async function handleAction(e) {
        const btn = e.target.closest('button[data-act]');
        if (!btn) {
            // clicking summary toggle etc.
            return;
        }
        const action = btn.dataset.act;
        const roomEl = btn.closest(SELECTORS.room);
        const itemEl = btn.closest('.set, .deco-item, .wallpaper-item');
        e.preventDefault();

        const actions = {
            'add-set': () => addSet(roomEl), 'add-deco': () => addDeco(roomEl), 'add-wallpaper': () => addWallpaper(roomEl),
            'del-room': async () => { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; roomEl.remove(); renumber(); debouncedRecalc(); showToast('ลบห้องแล้ว'); },
            'del-set': async () => { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; itemEl.remove(); renumber(); debouncedRecalc(); },
            'del-deco': async () => { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; itemEl.remove(); renumber(); debouncedRecalc(); },
            'del-wallpaper': async () => { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์?')) return; itemEl.remove(); renumber(); debouncedRecalc(); },
            'clear-room': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูลห้อง', 'ยืนยันการล้างข้อมูลทุกรายการในห้องนี้?')) return; roomEl.querySelector('[data-sets]').innerHTML=''; roomEl.querySelector('[data-decorations]').innerHTML=''; roomEl.querySelector('[data-wallpapers]').innerHTML=''; addSet(roomEl); renumber(); debouncedRecalc(); },
            'clear-set': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; itemEl.querySelectorAll('input, select').forEach(el => { if (el.name === 'fabric_variant') el.value='ทึบ'; else el.value=''; }); toggleSetFabricUI(itemEl); debouncedRecalc(); },
            'clear-deco': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; itemEl.querySelectorAll('input, select').forEach(el => el.value=''); debouncedRecalc(); },
            'clear-wallpaper': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; itemEl.querySelectorAll('input').forEach(el => el.value=''); itemEl.querySelector(SELECTORS.wallsContainer).innerHTML=''; addWall(itemEl.querySelector('[data-act="add-wall"]')); debouncedRecalc(); },
            'del-wall': () => { if(isLocked) return; btn.closest('.wall-input-row').remove(); debouncedRecalc(); },
            'add-wall': () => addWall(btn),
            'toggle-suspend': () => toggleSuspend(btn), 'toggle-suspend-room': () => toggleSuspend(btn),
            'menu-room': () => btn.nextElementSibling.classList.toggle('show'),
            'menu-item': () => btn.nextElementSibling.classList.toggle('show')
        };
        if (actions[action]) actions[action]();
    }

    document.addEventListener('click', (e) => {
        // close any open menu-dropdown when clicking outside
        document.querySelectorAll('.menu-dropdown.show').forEach(dd => {
            if (!dd.contains(e.target) && !dd.previousElementSibling?.contains(e.target)) dd.classList.remove('show');
        });
    });

    document.addEventListener('DOMContentLoaded', () => {
        const today = new Date().toISOString().substring(0, 10);
        const quoteInput = document.querySelector('input[name="quote_date"]');
        if (quoteInput && !quoteInput.value) quoteInput.value = today;

        try {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) loadPayload(JSON.parse(storedData)); else addRoom();
        } catch(err) { addRoom(); }

        orderForm.addEventListener("click", handleAction);
        orderForm.addEventListener("input", debouncedRecalc);
        orderForm.addEventListener("change", (e) => {
            const select = e.target.closest('select[name="fabric_variant"]');
            if (select) toggleSetFabricUI(select.closest(SELECTORS.set));
            debouncedRecalc();
        });
        const custInfo = document.querySelector('#customerInfo');
        if (custInfo) custInfo.addEventListener("input", debounce(saveData));

        document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
        document.querySelector('#clearAllBtn').addEventListener('click', async () => { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ''); if (quoteInput) quoteInput.value = today; addRoom(); saveData(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); });

        document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
            isLocked = !isLocked;
            document.body.classList.toggle('is-locked', isLocked);
            document.querySelectorAll('input, select, button').forEach(el => {
                const isExempt = el.closest('.menu-dropdown') || el.id === 'menuBtn' || el.closest('.actions') || el.closest('.modal-actions');
                if (!isExempt) el.disabled = isLocked;
            });
            const lockBtn = document.querySelector(SELECTORS.lockBtn);
            lockBtn.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อคฟอร์ม';
            const useEl = lockBtn.querySelector('use');
            if (useEl) useEl.setAttribute('href', isLocked ? '#icon-unlock' : '#icon-lock');
            showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'warning');
        });

        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
             const options = await showCopyOptionsModal();
             if (!options) return;
             const payload = buildPayload();
             let text = '';
             if (options.customer) text += `ลูกค้า: ${payload.customer_name} | โทร: ${payload.customer_phone}\n`;
             if (options.details) {
                 payload.rooms.forEach((r,i) => {
                     text += `\n[ห้อง ${i+1}] ${r.room_name} | สไตล์: ${r.style} | ราคา/ม: ${r.price_per_m_raw}\n`;
                     r.sets.forEach((s,si)=> text += `  - จุด ${si+1}: กว้าง ${s.width_m}ม สูง ${s.height_m}ม\n`);
                 });
             }
             if (options.summary) text += `\nสรุปราคารวม: ${document.querySelector(SELECTORS.grandTotal).textContent}\n`;
             navigator.clipboard?.writeText(text).then(()=> showToast('คัดลอกสำเร็จ'), ()=> showToast('คัดลอกไม่สำเร็จ','error'));
        });

        // import/export handlers
        document.querySelector('#importBtn').addEventListener('click', () => {
            document.querySelector('#importModal').classList.add('visible');
            document.querySelector('#importJsonArea').value = '';
        });
        document.querySelector('#importCancel').addEventListener('click', () => document.querySelector('#importModal').classList.remove('visible'));
        document.querySelector('#importConfirm').addEventListener('click', () => {
            try {
                const obj = JSON.parse(document.querySelector('#importJsonArea').value);
                loadPayload(obj);
                document.querySelector('#importModal').classList.remove('visible');
            } catch (e) { showToast('JSON ไม่ถูกต้อง', 'error'); }
        });
        document.querySelector('#exportBtn').addEventListener('click', () => {
            const data = JSON.stringify(buildPayload(), null, 2);
            const blob = new Blob([data], {type: 'application/json'});
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'marnthara_export.json'; a.click();
            URL.revokeObjectURL(a.href);
        });

        // close copy options
        document.querySelector('#copyOptionsCancel')?.addEventListener('click', () => document.querySelector(SELECTORS.copyOptionsModal).classList.remove('visible'));
        document.querySelector('#copyOptionsConfirm')?.addEventListener('click', () => {
            document.querySelector(SELECTORS.copyOptionsModal).classList.remove('visible');
        });

        // modal confirm/cancel id mapping for showModal
        document.querySelector('#modalCancel')?.addEventListener('click', () => { document.querySelector(SELECTORS.modal).classList.remove('visible'); });
        document.querySelector('#modalConfirm')?.addEventListener('click', () => { document.querySelector(SELECTORS.modal).classList.remove('visible'); });

        // small accessibility: close menu dropdown when pressing Escape
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.menu-dropdown.show').forEach(dd => dd.classList.remove('show')); });
    });

})();
