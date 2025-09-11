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
    
    async function delRoom(btn) {
        if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return;
        btn.closest(SELECTORS.room).remove();
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ลบห้องแล้ว', 'success');
    }
    
    async function delSet(btn) {
        if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return;
        btn.closest(SELECTORS.set).remove();
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ลบจุดผ้าม่านแล้ว', 'success');
    }

    async function delDeco(btn) {
        if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return;
        btn.closest(SELECTORS.decoItem).remove();
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ลบรายการตกแต่งแล้ว', 'success');
    }

    async function delWallpaper(btn) {
        if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) return;
        btn.closest(SELECTORS.wallpaperItem).remove();
        renumber(); recalcAll(); saveData(); updateLockState();
        showToast('ลบรายการวอลเปเปอร์แล้ว', 'success');
    }

    async function delWall(btn) {
        if(isLocked) return;
        btn.closest('.wall-input-row').remove();
        recalcAll(); saveData();
    }

    async function clearSet(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return;
        const set = btn.closest(SELECTORS.set);
        set.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; });
        toggleSetFabricUI(set);
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลผ้าม่านแล้ว', 'success');
    }

    async function clearWallpaper(btn) {
        if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return;
        const item = btn.closest(SELECTORS.wallpaperItem);
        item.querySelectorAll('input').forEach(el => el.value = '');
        item.querySelector(SELECTORS.wallsContainer).innerHTML = '';
        addWall(item.querySelector('[data-act="add-wall"]'));
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลวอลเปเปอร์แล้ว', 'success');
    }

    async function clearAllData() {
        if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return;
        roomsEl.innerHTML = "";
        roomCount = 0;
        document.querySelectorAll('#customerInfo input').forEach(i => i.value = "");
        addRoom();
        recalcAll(); saveData(); updateLockState();
        showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
    }

    function renumber() {
        const rooms = document.querySelectorAll(SELECTORS.room);
        const allSets = document.querySelectorAll(SELECTORS.set);
        const allDecos = document.querySelectorAll(SELECTORS.decoItem);
        const allWallpapers = document.querySelectorAll(SELECTORS.wallpaperItem);
        const allWalls = document.querySelectorAll('.wall-input-row');
        
        document.querySelectorAll('[data-act*="-in-room"]').forEach(el => el.disabled = isLocked);
        document.querySelectorAll('[data-act*="del-"]').forEach(el => el.disabled = isLocked);
        
        rooms.forEach((room, i) => {
            const roomIndex = i + 1;
            room.dataset.index = roomIndex;
            room.querySelector(SELECTORS.roomNameInput).placeholder = `ห้อง ${String(roomIndex).padStart(2, '0')}`;

            room.querySelectorAll(SELECTORS.set).forEach((set, j) => {
                set.querySelector('.set-num').textContent = `จุดที่ ${j + 1}`;
            });
        });
        document.querySelector(SELECTORS.setCountSets).textContent = allSets.length;
        document.querySelector(SELECTORS.setCountDeco).textContent = allDecos.length + allWallpapers.length;
        document.querySelector(SELECTORS.setCount).textContent = allSets.length + allDecos.length + allWallpapers.length;
    }

    function recalcAll() {
        let grandTotal = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;

        document.querySelectorAll(SELECTORS.room).forEach(room => {
            let roomTotal = 0;
            let roomFabric = 0;
            let roomSheerFabric = 0;
            let roomOpaqueTrack = 0;
            let roomSheerTrack = 0;
            let totalSets = 0;
            
            if (room.dataset.suspended === 'true') {
                room.querySelector('[data-room-total]').innerHTML = `ราคารวม: <span class="price">0</span> บ. (ระงับ)`;
                room.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด 0</span> • <span class="price">0</span> บ. (ระงับ)`;
                return;
            }

            // Recalc Sets
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const isSuspended = set.dataset.suspended === 'true';
                if (isSuspended) {
                    set.querySelector('[data-set-brief]').innerHTML = `<span class="price">0</span> บ. (ระงับ)`;
                    return;
                }
                totalSets++;
                const width = clamp01(set.querySelector('input[name="width_m"]').value);
                const height = clamp01(set.querySelector('input[name="height_m"]').value);
                const variant = set.querySelector('select[name="fabric_variant"]').value;
                const style = set.querySelector('select[name="style"]').value;
                const pricePerM = toNum(set.querySelector('select[name="fabric_price_per_m"]').value);
                const sheerPricePerM = toNum(set.querySelector('select[name="sheer_price_per_m"]').value);
                
                const fabricYardage = CALC.fabricYardage(style, width);
                const surcharge = stylePlus(style) + heightPlus(height);
                const trackLength = width + 0.15;
                
                let setTotal = 0;
                let opaqueYardage = 0;
                let sheerYardage = 0;

                if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                    opaqueYardage = fabricYardage;
                    const opaquePrice = (opaqueYardage * 0.9 * pricePerM) + (trackLength * surcharge);
                    setTotal += opaquePrice;
                    roomFabric += opaqueYardage;
                    roomOpaqueTrack += trackLength;
                    set.querySelector('[data-opaque-price]').textContent = fmt(opaquePrice, 0, true);
                    set.querySelector('[data-opaque-yardage]').textContent = fmt(opaqueYardage, 2);
                    set.querySelector('[data-opaque-track]').textContent = fmt(trackLength, 2);
                }

                if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                    sheerYardage = fabricYardage;
                    const sheerPrice = (sheerYardage * 0.9 * sheerPricePerM) + (trackLength * surcharge);
                    setTotal += sheerPrice;
                    roomSheerFabric += sheerYardage;
                    roomSheerTrack += trackLength;
                    set.querySelector('[data-sheer-price]').textContent = fmt(sheerPrice, 0, true);
                    set.querySelector('[data-sheer-yardage]').textContent = fmt(sheerYardage, 2);
                    set.querySelector('[data-sheer-track]').textContent = fmt(trackLength, 2);
                }
                roomTotal += setTotal;
                set.querySelector('[data-set-brief]').innerHTML = `<span class="price">${fmt(setTotal, 0, true)}</span> บ.`;
            });

            // Recalc Decorations
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isSuspended = deco.dataset.suspended === 'true';
                if (isSuspended) {
                    deco.querySelector('[data-deco-brief]').innerHTML = `<span class="price">0</span> บ. (ระงับ)`;
                    return;
                }
                const width = clamp01(deco.querySelector('[name="deco_width_m"]').value);
                const height = clamp01(deco.querySelector('[name="deco_height_m"]').value);
                const priceSqYd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);
                const areaSqM = width * (height > 0 ? height : 1);
                const areaSqYd = areaSqM * SQM_TO_SQYD;
                const decoPrice = areaSqYd * priceSqYd;
                roomTotal += decoPrice;

                deco.querySelector('[data-deco-brief]').innerHTML = `<span class="price">${fmt(decoPrice, 0, true)}</span> บ.`;
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <span class="price">${fmt(decoPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(areaSqYd, 2)}</span> ตร.หลา`;
            });

            // Recalc Wallpapers
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const isSuspended = wallpaper.dataset.suspended === 'true';
                if (isSuspended) {
                    wallpaper.querySelector('[data-wallpaper-brief]').innerHTML = `<span class="price">0</span> บ. (ระงับ)`;
                    return;
                }
                const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
                const pricePerRoll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
                let totalWidth = 0;
                wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(wallWidth => {
                    totalWidth += clamp01(wallWidth.value);
                });

                const rollsNeeded = CALC.wallpaperRolls(totalWidth, height);
                const wallpaperPrice = rollsNeeded * pricePerRoll;
                const totalArea = totalWidth * height;

                roomTotal += wallpaperPrice;
                wallpaper.querySelector('[data-wallpaper-brief]').innerHTML = `<span class="price">${fmt(wallpaperPrice, 0, true)}</span> บ.`;
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalArea, 2)}</span> ตร.ม. • ใช้ <span class="price">${rollsNeeded}</span> ม้วน`;
            });

            room.querySelector('[data-room-total]').innerHTML = `ราคารวม: <span class="price">${fmt(roomTotal, 0, true)}</span> บ.`;
            room.querySelector('[data-room-brief]').innerHTML = `<span class="num">จุด ${room.querySelectorAll(SELECTORS.set).length + room.querySelectorAll(SELECTORS.decoItem).length + room.querySelectorAll(SELECTORS.wallpaperItem).length}</span> • <span class="price">${fmt(roomTotal, 0, true)}</span> บ.`;
            room.querySelector('[data-room-brief-material]').textContent = `(ทึบ: ${fmt(roomFabric, 2)} หลา, โปร่ง: ${fmt(roomSheerFabric, 2)} หลา)`;
            grandTotal += roomTotal;
            grandFabric += roomFabric;
            grandSheerFabric += roomSheerFabric;
            grandOpaqueTrack += roomOpaqueTrack;
            grandSheerTrack += roomSheerTrack;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandFabric, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerFabric, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
        
        saveData();
    }

    function buildPayload() {
        const customerInfo = {
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
        };

        const rooms = [];
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const isSuspended = roomEl.dataset.suspended === 'true';
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: roomEl.querySelector(SELECTORS.roomPricePerM).value,
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                is_suspended: isSuspended,
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    width_m: clamp01(setEl.querySelector('input[name="width_m"]').value),
                    height_m: clamp01(setEl.querySelector('input[name="height_m"]').value),
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('select[name="open_type"]').value,
                    fabric_price_per_m: toNum(setEl.querySelector('select[name="fabric_price_per_m"]').value),
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                    is_suspended: setEl.dataset.suspended === 'true'
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: clamp01(decoEl.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(decoEl.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: decoEl.dataset.suspended === 'true'
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const widths = [];
                wallpaperEl.querySelectorAll('[name="wall_width_m"]').forEach(wallWidth => {
                    widths.push(clamp01(wallWidth.value));
                });

                roomData.wallpapers.push({
                    height_m: clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: widths,
                    is_suspended: wallpaperEl.dataset.suspended === 'true'
                });
            });

            rooms.push(roomData);
        });

        return { ...customerInfo, rooms: rooms, totals: {
            grandTotal: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            grandFabric: toNum(document.querySelector(SELECTORS.grandFabric).textContent),
            grandSheerFabric: toNum(document.querySelector(SELECTORS.grandSheerFabric).textContent),
            grandOpaqueTrack: toNum(document.querySelector(SELECTORS.grandOpaqueTrack).textContent),
            grandSheerTrack: toNum(document.querySelector(SELECTORS.grandSheerTrack).textContent),
            setCount: toNum(document.querySelector(SELECTORS.setCount).textContent),
            setCountSets: toNum(document.querySelector(SELECTORS.setCountSets).textContent),
            setCountDeco: toNum(document.querySelector(SELECTORS.setCountDeco).textContent)
        }, version: APP_VERSION };
    }

    function buildTextSummary(options) {
        const payload = buildPayload();
        let summary = "";

        if (options.customer) {
            summary += `**ข้อมูลลูกค้า**\n`;
            summary += `ชื่อ: ${payload.customer_name || 'ไม่ระบุ'}\n`;
            summary += `เบอร์โทร: ${payload.customer_phone || 'ไม่ระบุ'}\n`;
            summary += `รายละเอียด: ${payload.customer_address || 'ไม่ระบุ'}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach(room => {
                if (room.is_suspended) return;
                summary += `--- ห้อง ${room.room_name || 'ไม่ระบุ'} ---\n`;
                room.sets.forEach((set, i) => {
                    if (set.is_suspended) return;
                    const price = (set.width_m * (set.fabric_price_per_m / 0.9) * 2.0) + (set.width_m * 200); // Approximate
                    summary += `> จุดที่ ${i+1}: กว้าง ${set.width_m}ม. สูง ${set.height_m}ม. | ผ้า: ${set.fabric_variant} (${set.fabric_price_per_m} บ./ม.) | สไตล์: ${set.style} | เปิด: ${set.open_type} | ราคาประมาณ: ${fmt(price, 0, true)} บ.\n`;
                });
                room.decorations.forEach((deco, i) => {
                     if (deco.is_suspended) return;
                     summary += `> ตกแต่ง ${deco.type}: กว้าง ${deco.width_m}ม. สูง ${deco.height_m}ม. | ราคา/ตร.หลา: ${deco.price_sqyd} บ.\n`;
                });
                room.wallpapers.forEach((wallpaper, i) => {
                    if (wallpaper.is_suspended) return;
                    summary += `> วอลเปเปอร์: สูง ${wallpaper.height_m}ม. | ราคา/ม้วน: ${wallpaper.price_per_roll} บ. | กว้าง: ${wallpaper.widths.join(', ')}ม.\n`;
                });
                summary += "\n";
            });
        }
        
        if (options.summary) {
            const totals = payload.totals;
            summary += `--- สรุปยอดรวม ---\n`;
            summary += `ราคารวม: ${fmt(totals.grandTotal, 0, true)} บาท\n`;
            summary += `จำนวนจุดติดตั้ง: ${totals.setCountSets} (ผ้าม่าน) + ${totals.setCountDeco} (ตกแต่ง/วอลเปเปอร์) = ${totals.setCount} จุด\n`;
            summary += `ผ้าทึบรวม: ${fmt(totals.grandFabric, 2)} หลา\n`;
            summary += `ผ้าโปร่งรวม: ${fmt(totals.grandSheerFabric, 2)} หลา\n`;
        }

        return summary.trim();
    }
    
    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    
    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const lockText = lockBtn.querySelector('.lock-text');
        const lockIcon = lockBtn.querySelector('.lock-icon');
        
        isLocked = roomsEl.querySelectorAll('.card').length > 0;
        document.body.classList.toggle('is-locked', isLocked);
        
        lockText.textContent = isLocked ? 'เปิดแก้ไข' : 'ล็อค';
        lockIcon.textContent = isLocked ? '🔓' : '🔒';
    }

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async () => {
        try {
            const payload = buildPayload();
            const jsonString = JSON.stringify(payload, null, 2);
            await navigator.clipboard.writeText(jsonString);
            showToast('คัดลอก JSON แล้ว', 'success');
        } catch (err) {
            console.error('Failed to copy JSON: ', err);
            showToast('ไม่สามารถคัดลอก JSON ได้', 'error');
        }
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
        try {
            const options = await showCopyOptionsModal();
            if (options) {
                const text = buildTextSummary(options);
                await navigator.clipboard.writeText(text);
                showToast('คัดลอกข้อความแล้ว', 'success');
            }
        } catch (err) {
            console.error('Failed to copy text: ', err);
            showToast('ไม่สามารถคัดลอกข้อความได้', 'error');
        }
    });

    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAllData);
    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ล็อคหน้าจอแล้ว' : 'เปิดหน้าจอแก้ไขแล้ว', 'success');
    });

    document.addEventListener('input', debounce(e => {
        if (e.target.matches('input, select')) {
            recalcAll();
        }
    }, 200));

    roomsEl.addEventListener('click', e => {
        if (e.target.matches('[data-act="add-set-in-room"]')) addSet(e.target.closest(SELECTORS.room));
        else if (e.target.matches('[data-act="add-deco-in-room"]')) addDeco(e.target.closest(SELECTORS.room));
        else if (e.target.matches('[data-act="add-wallpaper-in-room"]')) addWallpaper(e.target.closest(SELECTORS.room));
        else if (e.target.matches('[data-act="del-room"]')) delRoom(e.target);
        else if (e.target.matches('[data-act="del-set"]')) delSet(e.target);
        else if (e.target.matches('[data-act="del-deco"]')) delDeco(e.target);
        else if (e.target.matches('[data-act="del-wallpaper"]')) delWallpaper(e.target);
        else if (e.target.matches('[data-act="del-wall"]')) delWall(e.target);
        else if (e.target.matches('[data-act="clear-set"]')) clearSet(e.target);
        else if (e.target.matches('[data-act="clear-deco"]')) clearDeco(e.target);
        else if (e.target.matches('[data-act="clear-wallpaper"]')) clearWallpaper(e.target);
        else if (e.target.matches('[data-act*="suspend"]')) toggleSuspend(e.target);
        else if (e.target.matches('[data-act*="menu"]')) {
            const menu = e.target.closest('.menu-container').querySelector('.menu-dropdown');
            menu.classList.toggle('show');
        }
    });
    
    roomsEl.addEventListener('change', e => {
        if (e.target.matches('select[name="fabric_variant"]')) {
            const set = e.target.closest(SELECTORS.set);
            toggleSetFabricUI(set);
        }
    });
    
    document.addEventListener('click', e => {
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