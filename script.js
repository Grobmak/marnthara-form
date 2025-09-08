(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.1-refactor"; // version update
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3.1"; // new storage key for new structure
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5;

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
        roomNameInput: 'input[name="room_name"]', 
        // === เปลี่ยนแปลง: ลบ roomPricePerM, roomStyle ออกไป ===
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

    function showToast(message, type = 'default') { /* ... no changes ... */ }
    const showConfirmation = (title, body) => { /* ... no changes ... */ };
    function showCopyOptionsModal() { /* ... no changes ... */ }

    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        const room = frag.querySelector(SELECTORS.room);
        room.dataset.index = roomCount;
        // === เปลี่ยนแปลง: ลบการสร้างตัวเลือกราคาผ้าในห้อง ===
        roomsEl.appendChild(frag);
        const created = roomsEl.querySelector(`${SELECTORS.room}:last-of-type`);

        if (prefill) {
            created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
            // === เปลี่ยนแปลง: ลบการ prefill ราคาและสไตล์ในห้อง ===
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }
        
        const hasItems = created.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length > 0;
        // === เปลี่ยนแปลง: ห้องใหม่จะไม่มีอะไรเลย รอผู้ใช้กดเพิ่ม ===
        if (!prefill && !hasItems) {
            // New rooms start empty
        }

        renumber(); recalcAll(); saveData(); updateLockState();
        created.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }

    function populatePriceOptions(selectEl, prices) { /* ... no changes ... */ }

    // === เปลี่ยนแปลง: ฟังก์ชันนี้มีการแก้ไขเยอะ ===
    function addSet(roomEl, prefill) {
        if (isLocked) return;
        const setsWrap = roomEl.querySelector(SELECTORS.setsContainer);
        const frag = document.querySelector(SELECTORS.setTpl).content.cloneNode(true);
        setsWrap.appendChild(frag);
        const created = setsWrap.querySelector(`${SELECTORS.set}:last-of-type`);
        
        // ย้ายการสร้างตัวเลือกราคามาไว้ที่นี่
        populatePriceOptions(created.querySelector('select[name="set_price_per_m"]'), PRICING.fabric);
        populatePriceOptions(created.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);

        if (prefill) {
            // เพิ่มการ prefill ราคาและสไตล์ในจุด
            created.querySelector('select[name="set_price_per_m"]').value = prefill.price_per_m_raw || "";
            created.querySelector('select[name="set_style"]').value = prefill.style || "";

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
    
    function addDeco(roomEl, prefill) { /* ... no changes ... */ }
    function addWallpaper(roomEl, prefill) { /* ... no changes ... */ }
    function addWall(btn, prefillWidth) { /* ... no changes ... */ }
    async function clearDeco(btn) { /* ... no changes ... */ }
    function toggleSetFabricUI(setEl) { /* ... no changes ... */ }
    function toggleSuspend(btn) { /* ... no changes ... */ }
    async function delRoom(btn) { /* ... no changes ... */ }
    async function delSet(btn) { /* ... no changes ... */ }
    async function delDeco(btn) { /* ... no changes ... */ }
    async function delWallpaper(btn) { /* ... no changes ... */ }
    async function delWall(btn) { /* ... no changes ... */ }
    async function clearSet(btn) { /* ... no changes ... */ }
    async function clearWallpaper(btn) { /* ... no changes ... */ }
    async function clearAllData() { /* ... no changes ... */ }
    function renumber() { /* ... no changes ... */ }

    // === เปลี่ยนแปลง: ฟังก์ชันนี้มีการแก้ไข Logic การคำนวณ ===
    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            // ลบการดึงค่าราคาและสไตล์จากห้อง
            
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                if (set.dataset.suspended === 'true') { /* ... clear UI ... */ return; }

                // ย้ายการดึงค่าราคาและสไตล์มาไว้ใน Loop ของจุด
                const baseRaw = toNum(set.querySelector('select[name="set_price_per_m"]').value);
                const style = set.querySelector('select[name="set_style"]').value;
                const sPlus = stylePlus(style);

                const w = clamp01(set.querySelector('input[name="width_m"]').value), h = clamp01(set.querySelector('input[name="height_m"]').value);
                const hPlus = heightPlus(h), variant = set.querySelector('select[name="fabric_variant"]').value;
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;

                if (w > 0 && h > 0 && baseRaw > 0 && style) { // เพิ่มเงื่อนไขการตรวจสอบ
                    if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                        opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                        opaqueYards = CALC.fabricYardage(style, w);
                        opaqueTrack = w;
                    }
                    if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                        const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]').value);
                        if(sheerBase > 0) { // ตรวจสอบว่ามีราคาผ้าโปร่ง
                           sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                           sheerYards = CALC.fabricYardage(style, w);
                           sheerTrack = w;
                        }
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
                grandOpaqueYards += opaqueYards; grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack; grandSheerTrack += sheerTrack;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => { /* ... no changes ... */ });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => { /* ... no changes ... */ });
            
            const totalItemsInRoom = room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
            const totalUnitsInRoom = [...room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`)]
                .reduce((sum, set) => sum + (set.querySelector('select[name="fabric_variant"]').value === "ทึบ&โปร่ง" ? 2 : 1), 0) 
                + room.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
            
            const brief = room.querySelector("[data-room-brief]");
            if (brief) brief.innerHTML = `<span class="num">จุด ${fmt(totalItemsInRoom, 0, true)}</span> • <span class="num">ชุด ${fmt(totalUnitsInRoom, 0, true)}</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span> บาท`;
            grand += roomSum;
        });

        const totalSets = [...document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"])`)]
            .reduce((sum, set) => sum + (set.querySelector('select[name="fabric_variant"]').value === "ทึบ&โปร่ง" ? 2 : 1), 0);
        const totalDeco = document.querySelectorAll(`${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        const totalPoints = document.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
        
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = fmt(totalPoints, 0, true);
        document.querySelector(SELECTORS.setCountSets).textContent = fmt(totalSets, 0, true);
        document.querySelector(SELECTORS.setCountDeco).textContent = fmt(totalDeco, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandOpaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;
    }

    // === เปลี่ยนแปลง: ฟังก์ชันนี้มีการแก้ไขโครงสร้างข้อมูล ===
    function buildPayload() {
        return {
            customer_name: document.querySelector('input[name="customer_name"]').value || "",
            customer_address: document.querySelector('input[name="customer_address"]').value || "",
            customer_phone: document.querySelector('input[name="customer_phone"]').value || "",
            app_version: APP_VERSION,
            generated_at: new Date().toISOString(),
            rooms: [...document.querySelectorAll(SELECTORS.room)].map(room => ({
                room_name: room.querySelector(SELECTORS.roomNameInput).value || "",
                // ลบ price_per_m_raw และ style ออกจากห้อง
                sets: [...room.querySelectorAll(SELECTORS.set)].map(set => ({
                    // เพิ่ม price_per_m_raw และ style เข้าไปในจุด
                    price_per_m_raw: toNum(set.querySelector('select[name="set_price_per_m"]').value),
                    style: set.querySelector('select[name="set_style"]').value,
                    width_m: clamp01(set.querySelector('input[name="width_m"]').value), height_m: clamp01(set.querySelector('input[name="height_m"]').value),
                    fabric_variant: set.querySelector('select[name="fabric_variant"]').value, open_type: set.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: clamp01(set.querySelector('select[name="sheer_price_per_m"]').value), is_suspended: set.dataset.suspended === 'true',
                })),
                decorations: [...room.querySelectorAll(SELECTORS.decoItem)].map(deco => ({
                    type: deco.querySelector('[name="deco_type"]').value, width_m: clamp01(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: clamp01(deco.querySelector('[name="deco_height_m"]').value), price_sqyd: clamp01(deco.querySelector('[name="deco_price_sqyd"]').value),
                    is_suspended: deco.dataset.suspended === 'true',
                })),
                wallpapers: [...room.querySelectorAll(SELECTORS.wallpaperItem)].map(wp => ({
                    height_m: clamp01(wp.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: clamp01(wp.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: [...wp.querySelectorAll('[name="wall_width_m"]')].map(input => clamp01(input.value)),
                    is_suspended: wp.dataset.suspended === 'true',
                }))
            }))
        };
    }
    
    const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); });
    function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload())); }
    function updateLockState() { /* ... no changes ... */ }
    function toggleLock() { /* ... no changes ... */ }
    function formatNumericInput(e) { /* ... no changes ... */ }

    document.addEventListener("change", e => { /* ... no changes ... */ });
    document.addEventListener("input", e => { /* ... no changes ... */ });
    document.addEventListener("click", async (e) => { /* ... no changes ... */ });
    orderForm.addEventListener("submit", (e) => { /* ... (remains the same) ... */ });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name;
                document.querySelector('input[name="customer_address"]').value = payload.customer_address;
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
                roomsEl.innerHTML = ""; roomCount = 0;
                if (payload.rooms && payload.rooms.length > 0) {
                    payload.rooms.forEach(addRoom);
                } else {
                    addRoom(); // Add one empty room if saved data is empty
                }
            } catch(err) {
                console.error("Failed to load data from storage (might be old format):", err);
                localStorage.removeItem(STORAGE_KEY); 
                addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
    });
})();