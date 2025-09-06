(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.2.0";
    // REMINDER: Replace this with your actual webhook URL
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
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl',
        payloadInput: '#payload', copyJsonBtn: '#copyJsonBtn', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomHeaderBtn: '#addRoomHeaderBtn', submitBtn: '#submitBtn',
        grandTotal: '#grandTotal', setCount: '#setCount', grandFabric: '#grandFabric',
        grandSheerFabric: '#grandSheerFabric',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody',
        modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]', roomPricePerM: 'select[name="room_price_per_m"]', roomStyle: 'select[name="room_style"]',
        setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        toastContainer: '#toast-container',
        grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary'
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

        if (type === 'success') {
            toast.classList.add('toast-success');
        } else if (type === 'warning') {
            toast.classList.add('toast-warning');
        } else if (type === 'error') {
            toast.classList.add('toast-error');
        } else {
            toast.style.backgroundColor = 'var(--card-bg)';
            toast.style.color = 'var(--fg)';
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

    function scrollToElement(el) {
        if (!el) return;
        setTimeout(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150); // Delay to allow the DOM to render the new element
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
            (prefill.sets || []).forEach(s => addSet(created, s, false));
            (prefill.decorations || []).forEach(d => addDeco(created, d, false));
        }

        if (created.querySelectorAll(SELECTORS.set).length === 0 && created.querySelectorAll(SELECTORS.decoItem).length === 0) {
            addSet(created, null, false);
        }
        
        renumber(); 
        recalcAll(); 
        saveData(); 
        updateLockState();
        if (!prefill) {
            showToast('เพิ่มห้องใหม่แล้ว', 'success');
            scrollToElement(created.querySelector('.room-head')); // Scroll to the new room's header
        }
    }

    function populatePriceOptions(selectEl, prices) {
        selectEl.innerHTML = `<option value="" hidden>เลือก</option>`;
        prices.forEach(p => {
            const option = document.createElement('option');
            option.value = p; option.textContent = p.toLocaleString("th-TH");
            selectEl.appendChild(option);
        });
    }

    function addSet(roomEl, prefill, showToastMessage = true) {
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
        if (showToastMessage) showToast('เพิ่มจุดผ้าม่านแล้ว', 'success');
        scrollToElement(created);
    }
    
    function addDeco(roomEl, prefill, showToastMessage = true) {
        if (isLocked) return;
        const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
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
        if (showToastMessage) showToast('เพิ่มรายการตกแต่งแล้ว', 'success');
        scrollToElement(created);
    }
    
    async function clearDeco(btn) { 
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return;
        const deco = btn.closest(SELECTORS.decoItem);
        const wasSuspended = deco.dataset.suspended === 'true';
        deco.querySelectorAll('input, select').forEach(el => { el.value = ''; });
        deco.dataset.suspended = 'false';
        deco.classList.remove('is-suspended');
        deco.querySelector('[data-suspend-text]').textContent = 'ระงับ';
        recalcAll();
        saveData();
        updateLockState();
        showToast('ล้างข้อมูลตกแต่งแล้ว', 'success');
        scrollToElement(deco);
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
        const item = btn.closest('.set, .deco-item');
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        btn.querySelector('[data-suspend-text]').textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll();
        saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
        scrollToElement(item);
    }

    async function delRoom(btn) { 
        if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; 
        const prevRoom = btn.closest(SELECTORS.room).previousElementSibling;
        btn.closest(SELECTORS.room).remove(); 
        renumber(); recalcAll(); saveData(); updateLockState(); 
        showToast('ลบห้องแล้ว', 'success'); 
        scrollToElement(prevRoom || document.querySelector('.header'));
    }
    async function delSet(btn) { 
        if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; 
        const room = btn.closest(SELECTORS.room);
        const prevSet = btn.closest(SELECTORS.set).previousElementSibling;
        btn.closest(SELECTORS.set).remove(); 
        if (room.querySelectorAll(SELECTORS.set).length === 0 && room.querySelectorAll(SELECTORS.decoItem).length === 0) addSet(room, null, false); 
        renumber(); recalcAll(); saveData(); updateLockState(); 
        showToast('ลบจุดผ้าม่านแล้ว', 'success'); 
        scrollToElement(prevSet || room.querySelector('.room-head'));
    }
    async function delDeco(btn) { 
        if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; 
        const room = btn.closest(SELECTORS.room);
        const prevDeco = btn.closest(SELECTORS.decoItem).previousElementSibling;
        btn.closest(SELECTORS.decoItem).remove(); 
        if (room.querySelectorAll(SELECTORS.set).length === 0 && room.querySelectorAll(SELECTORS.decoItem).length === 0) addSet(room, null, false);
        renumber(); recalcAll(); saveData(); updateLockState(); 
        showToast('ลบรายการตกแต่งแล้ว', 'success'); 
        scrollToElement(prevDeco || room.querySelector('.room-head'));
    }
    async function clearSet(btn) { 
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; 
        const set = btn.closest(SELECTORS.set); 
        set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); 
        set.dataset.suspended = 'false';
        set.classList.remove('is-suspended');
        set.querySelector('[data-suspend-text]').textContent = 'ระงับ';
        toggleSetFabricUI(set); recalcAll(); saveData(); updateLockState(); 
        showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success'); 
        scrollToElement(set);
    }
    async function clearAllData() { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; roomsEl.innerHTML = ""; roomCount = 0; document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); addRoom(); saveData(); updateLockState(); showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}`);
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
            let roomSum = 0, roomOpaqueYards = 0, roomSheerYards = 0;
            let roomOpaqueTrack = 0, roomSheerTrack = 0;
            
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM).value);
            const style = room.querySelector(SELECTORS.roomStyle).value;
            const sPlus = stylePlus(style);
            
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') {
                    set.querySelector('[data-set-price-total]').textContent = '0';
                    set.querySelector('[data-set-price-opaque]').textContent = '0';
                    set.querySelector('[data-set-price-sheer]').textContent = '0';
                    set.querySelector('[data-set-yardage-opaque]').textContent = '0';
                    set.querySelector('[data-set-yardage-sheer]').textContent = '0';
                    set.querySelector('[data-set-opaque-track]').textContent = '0';
                    set.querySelector('[data-set-sheer-track]').textContent = '0';
                    return;
                }
                const w = clamp01(set.querySelector('input[name="width_m"]').value), h = clamp01(set.querySelector('input[name="height_m"]').value);
                const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]').value;
                
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                
                if (w > 0 && h > 0) {
                    if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                        const opaquePerM = baseRaw + sPlus + hPlus;
                        opaquePrice = Math.round(opaquePerM * w);
                        opaqueYards = CALC.fabricYardage(style, w);
                        opaqueTrack = w;
                    }
                    if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                        const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]').value);
                        const sheerPerM = sheerBase + sPlus + hPlus;
                        sheerPrice = Math.round(sheerPerM * w);
                        sheerYards = CALC.fabricYardage(style, w);
                        sheerTrack = w;
                    }
                }

                let totalSetPrice = opaquePrice + sheerPrice;
                set.querySelector('[data-set-price-total]').textContent = fmt(totalSetPrice, 0, true);
                set.querySelector('[data-set-price-opaque]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-set-price-sheer]').textContent = fmt(sheerPrice, 0, true);
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);
                
                roomSum += totalSetPrice;
                roomOpaqueYards += opaqueYards;
                roomSheerYards += sheerYards;
                roomOpaqueTrack += opaqueTrack;
                roomSheerTrack += sheerTrack;
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
            
            const brief = room.querySelector("[data-room-brief]");
            const totalSetsInRoom = room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`).length;
            const totalDecoInRoom = room.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length;
            
            const totalItemsInRoom = totalSetsInRoom + totalDecoInRoom;

            const totalUnitsInRoom = [...room.querySelectorAll(SELECTORS.set)].reduce((sum, set) => {
                if (set.dataset.suspended === 'true') return sum;
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                if (variant === "ทึบ&โปร่ง") return sum + 2;
                return sum + 1;
            }, 0) + [...room.querySelectorAll(SELECTORS.decoItem)].reduce((sum, deco) => {
                return sum + (deco.dataset.suspended === 'true' ? 0 : 1);
            }, 0);

            if (brief) brief.innerHTML = `<span class="num">จุด ${fmt(totalItemsInRoom, 0, true)}</span> • <span class="num">ชุด ${fmt(totalUnitsInRoom, 0, true)}</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บาท`;
            
            grand += roomSum; grandOpaqueYards += roomOpaqueYards;
            grandSheerYards += roomSheerYards;
            grandOpaqueTrack += roomOpaqueTrack;
            grandSheerTrack += roomSheerTrack;
        });

        const totalSets = [...document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`)].reduce((sum, set) => {
            const variant = set.querySelector('select[name="fabric_variant"]').value;
            if (variant === "ทึบ&โปร่ง") return sum + 2;
            return sum + 1;
        }, 0);
        
        const totalDeco = document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"])`).length;
        const totalPoints = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"])`).length;
        
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
                    width_m: clamp01(set.querySelector('input[name="width_m"]').value),
                    height_m: clamp01(set.querySelector('input[name="height_m"]').value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value,
                    open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: clamp01(set.querySelector('select[name="sheer_price_per_m"]').value),
                    is_suspended: set.dataset.suspended === 'true',
                })),
                decorations: [...room.querySelectorAll(SELECTORS.decoItem)].map(deco => ({
                    type: deco.querySelector('[name="deco_type"]').value,
                    width_m: clamp01(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: clamp01(deco.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: deco.dataset.suspended === 'true',
                }))
            }))
        };
    }
    
    function buildTextPayload(options) {
        let text = "";
        const payload = buildPayload();
        
        if (options.customer) {
            text += "--- ข้อมูลลูกค้า ---\n";
            text += `ชื่อ: ${payload.customer_name}\n`;
            text += `ที่อยู่: ${payload.customer_address}\n`;
            text += `เบอร์โทร: ${payload.customer_phone}\n\n`;
        }
        
        if (options.details) {
            text += "--- รายละเอียดแต่ละจุด ---\n";
            payload.rooms.forEach((room, rIndex) => {
                const roomName = room.room_name || `ห้อง ${String(rIndex + 1).padStart(2, "0")}`;
                text += `\n** ห้อง: ${roomName} (${room.style} - ${fmt(room.price_per_m_raw, 0, true)} บ./ม.) **\n`;
                
                room.sets.forEach((set, sIndex) => {
                    if (set.is_suspended) return;
                    const w = clamp01(set.width_m), h = clamp01(set.height_m);
                    const baseRaw = toNum(room.price_per_m_raw);
                    const sPlus = stylePlus(room.style);
                    const hPlus = heightPlus(h);
                    
                    let opaquePrice = 0, sheerPrice = 0;
                    if (set.fabric_variant === "ทึบ" || set.fabric_variant === "ทึบ&โปร่ง") {
                        opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                    }
                    if (set.fabric_variant === "โปร่ง" || set.fabric_variant === "ทึบ&โปร่ง") {
                        sheerPrice = Math.round((set.sheer_price_per_m + sPlus + hPlus) * w);
                    }
                    const setPrice = opaquePrice + sheerPrice;

                    text += `\n• จุดที่ ${sIndex + 1}: กว้าง ${fmt(w, 2)} ม. x สูง ${fmt(h, 2)} ม.\n`;
                    text += `  - ชนิด: ${set.fabric_variant} | เปิด: ${set.open_type || 'ไม่ระบุ'}\n`;
                    text += `  - ราคา: ${fmt(setPrice, 0, true)} บ.\n`;
                });
                
                room.decorations.forEach((deco, dIndex) => {
                    if (deco.is_suspended) return;
                    const decoPrice = Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
                    text += `\n• รายการตกแต่งที่ ${dIndex + 1}: ${deco.type}\n`;
                    text += `  - กว้าง ${fmt(deco.width_m, 2)} ม. x สูง ${fmt(deco.height_m, 2)} ม.\n`;
                    text += `  - ราคา: ${fmt(decoPrice, 0, true)} บ.\n`;
                });
            });
            text += "\n";
        }

        if (options.summary) {
            text += "--- สรุปยอดรวม ---\n";
            const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;
            const fabricYards = document.querySelector(SELECTORS.grandFabric).textContent;
            const sheerYards = document.querySelector(SELECTORS.grandSheerFabric).textContent;
            text += `ราคารวม: ${grandTotal} บาท\n`;
            text += `ผ้าทึบที่ใช้: ${fabricYards}\n`;
            text += `ผ้าโปร่งที่ใช้: ${sheerYards}\n`;
        }
        
        return text.trim();
    }

    const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); });
    
    function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload())); }

    function updateLockState() {
        const isFormLocked = isLocked || false;
        document.querySelectorAll('input, select, button').forEach(el => {
            const btn = el.closest('button');
            if (btn && (btn.id === 'lockBtn' || btn.id === 'addRoomHeaderBtn')) return;
            el.disabled = isFormLocked;
        });
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        lockBtn.classList.toggle('btn-primary', !isFormLocked);
        lockBtn.classList.toggle('btn-danger', isFormLocked);
        lockBtn.querySelector('.lock-text').textContent = isFormLocked ? 'ปลดล็อค' : 'ล็อก';
        lockBtn.querySelector('.lock-icon').textContent = isFormLocked ? '🔓' : '🔒';
    }
    
    function toggleLock() { 
        isLocked = !isLocked; 
        updateLockState(); 
        showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', isLocked ? 'warning' : 'success');
    }
    
    function formatNumericInput(e) {
        const input = e.target;
        let val = input.value.replace(/[^0-9]/g, '');
        if (val) {
            input.value = parseInt(val, 10).toLocaleString('th-TH');
        } else {
            input.value = '';
        }
    }

    document.addEventListener("change", e => {
        if (e.target.matches('select[name="fabric_variant"]')) {
            const setEl = e.target.closest(SELECTORS.set);
            if (setEl) {
                toggleSetFabricUI(setEl);
            }
        }
        debouncedRecalcAndSave();
    });

    document.addEventListener("input", e => {
        if(e.target.matches('[name="deco_price_sqyd"]')) {
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
            'del-room': delRoom, 'del-set': delSet, 'del-deco': delDeco, 'clear-deco': clearDeco,
            'add-set': (b) => addSet(b.closest(SELECTORS.room)),
            'add-deco': (b) => addDeco(b.closest(SELECTORS.room)),
            'clear-set': clearSet, 'toggle-suspend': toggleSuspend
        };
        if (actions[act]) actions[act](btn);
        else if (btn.id === "addRoomHeaderBtn") addRoom();
        else if (btn.id === "clearAllBtn") clearAllData();
        else if (btn.id === "lockBtn") toggleLock();
        else if (btn.id === "copyJsonBtn") {
            try {
                await navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2));
                showToast('คัดลอก JSON แล้ว!', 'success');
            } catch(err) {
                console.error("Failed to copy JSON: ", err);
                showToast('ไม่สามารถคัดลอก JSON ได้', 'error');
            }
        } else if (btn.id === "copyTextBtn") {
            const options = await showCopyOptionsModal();
            if (options) {
                const textToCopy = buildTextPayload(options);
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    showToast('คัดลอกข้อความแล้ว!', 'success');
                } catch(err) {
                    console.error('Failed to copy text: ', err);
                    showToast('ไม่สามารถคัดลอกข้อความได้', 'error');
                }
            }
        }
    });

    orderForm.addEventListener("submit", (e) => {
        if (isLocked) { 
            e.preventDefault(); 
            showToast('ฟอร์มถูกล็อคอยู่ ไม่สามารถส่งได้', 'error');
            return; 
        }
        const submitBtn = document.querySelector(SELECTORS.submitBtn);
        submitBtn.disabled = true; 
        submitBtn.textContent = 'กำลังส่ง...';
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
        // This part is for demonstration and assumes a successful send.
        setTimeout(() => { 
            submitBtn.disabled = isLocked; 
            submitBtn.textContent = 'ส่งไปคำนวณ'; 
            showToast('ส่งข้อมูลสำเร็จแล้ว', 'success');
        }, 3000);
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
                localStorage.removeItem(STORAGE_KEY);
                addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
    });
})();