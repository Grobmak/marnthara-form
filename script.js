(function() {
    'use strict';
    // --- CONSTANTS (unchanged) ---
    const APP_VERSION = "input-ui/pro-5.0.0";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v5";
    const SQM_TO_SQYD = 1.19599; const WALLPAPER_SQM_PER_ROLL = 5.3;
    const PRICING = { fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500], sheer: [1000, 1100, 1200, 1300, 1400, 1500], style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 }, height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }], };
    const CALC = { fabricYardage: (style, width) => { if (width <= 0) return 0; if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9; if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9; return 0; }, };

    // --- SELECTORS (Updated for Pro UI) ---
    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', lockBtn: '#lockBtn', addRoomFab: '#addRoomFab', submitBtn: '#submitBtn', clearAllBtn: '#clearAllBtn',
        grandTotal: '#grandTotal', 
        setCount: '#setCount', setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric', grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]', roomPricePerM: 'select[name="room_price_per_m"]', roomStyle: 'select[name="room_style"]',
        toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', copyJsonBtn: '#copyJsonBtn',
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        materialSheet: '#materialSheet', showSheetBtn: '#showSheetBtn',
    };

    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    if(orderForm) orderForm.action = WEBHOOK_URL;
    let roomCount = 0; let isLocked = false;
    
    // --- Utility Functions (unchanged) ---
    const toNum = v => { if (typeof v === 'string') v = v.replace(/,/g, ''); return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0; }; const clamp01 = v => Math.max(0, toNum(v)); const fmt = (n, fixed = 2, asCurrency = false) => { if (!Number.isFinite(n)) return "0"; const options = asCurrency ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: fixed, maximumFractionDigits: fixed }; return n.toLocaleString("th-TH", options); }; const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }; const stylePlus = s => PRICING.style_surcharge[s] ?? 0; const heightPlus = h => { const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold); for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; } return 0; };

    // --- UI Functions (Toast, Dialogs are unchanged) ---
    function showToast(message, type = 'default') { /* ... */ }
    const showDialog = (selector, title, body) => { /* ... */ };

    // --- NEW: Bottom Sheet Controls ---
    function showMaterialSheet() {
        const sheet = document.querySelector(SELECTORS.materialSheet);
        if (sheet) sheet.classList.add('visible');
    }
    function hideMaterialSheet() {
        const sheet = document.querySelector(SELECTORS.materialSheet);
        if (sheet) sheet.classList.remove('visible');
    }

    // --- Core App Functions (addRoom updated for animation) ---
    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        // ... (rest of function is the same until appendChild)
        roomsEl.appendChild(frag);
        const created = roomsEl.querySelector(`${SELECTORS.room}:last-of-type`);

        // Add fade-in animation
        created.classList.add('fade-in');

        if (prefill) { /* ... prefill logic ... */ }
        
        renumber(); recalcAll(); saveData(); updateLockState();
        created.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }
    // ... addSet, addDeco, addWallpaper, etc. are unchanged
    
    // --- Recalculation (Updated to populate Bottom Sheet) ---
    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        
        // ... (The entire calculation logic inside the forEach loops is unchanged)
        // At the end of the function, update the new UI elements:
        
        const totalSets = [...document.querySelectorAll(`${SELECTORS.set}:not(.is-suspended)`)].reduce((sum, set) => sum + (set.querySelector('select[name="fabric_variant"]').value === "ทึบ&โปร่ง" ? 2 : 1), 0);
        const totalDeco = document.querySelectorAll(`${SELECTORS.decoItem}:not(.is-suspended), ${SELECTORS.wallpaperItem}:not(.is-suspended)`).length;
        const totalPoints = document.querySelectorAll(`.item-card:not(.is-suspended)`).length;
        
        // Update Bottom App Bar
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        
        // Update Bottom Sheet
        document.querySelector(SELECTORS.setCount).textContent = fmt(totalPoints, 0);
        document.querySelector(SELECTORS.setCountSets).textContent = fmt(totalSets, 0);
        document.querySelector(SELECTORS.setCountDeco).textContent = fmt(totalDeco, 0);
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(grandOpaqueYards, 2);
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(grandSheerYards, 2);
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(grandOpaqueTrack, 2);
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(grandSheerTrack, 2);
    }
    
    // ... (buildPayload, buildTextPayload, saveData, updateLockState, etc. are unchanged)
    
    // --- Event Listeners (Updated for new buttons) ---
    document.addEventListener("click", async (e) => {
        // Check for scrim click to close sheet first
        if (e.target.matches(SELECTORS.materialSheet)) {
            hideMaterialSheet();
            return;
        }

        const btn = e.target.closest("button");
        if (!btn) {
            return;
        }
        
        const act = btn.dataset.act;
        if (btn.type !== 'submit' && btn.form !== orderForm) e.preventDefault();
        
        const actions = { /* ... unchanged ... */ };
        if (actions[act]) actions[act](btn);

        // Handle buttons by ID
        switch (btn.id) {
            case SELECTORS.addRoomFab.substring(1): addRoom(); break;
            case SELECTORS.clearAllBtn.substring(1): clearAllData(); break;
            case SELECTORS.lockBtn.substring(1): toggleLock(); break;
            case SELECTORS.showSheetBtn.substring(1): showMaterialSheet(); break;
            case SELECTORS.copyJsonBtn.substring(1):
                const payload = buildPayload();
                navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                    .then(() => showToast("คัดลอก JSON แล้ว", "success"))
                    .catch(err => showToast("ไม่สามารถคัดลอกได้: " + err, "error"));
                break;
            case SELECTORS.copyTextBtn.substring(1): // This button might not exist anymore, but keeping for safety
                const options = await showDialog(SELECTORS.copyOptionsModal);
                if (options) { /* ... copy text logic ... */ }
                break;
            case SELECTORS.exportBtn.substring(1): /* ... export logic ... */ break;
            case SELECTORS.importBtn.substring(1):
                document.querySelector(SELECTORS.importJsonArea).value = '';
                document.querySelector(SELECTORS.importModal).classList.add('visible');
                break;
        }
    });

    // Make sure to add the sheet listener
    const sheet = document.querySelector(SELECTORS.materialSheet);
    if(sheet) {
        sheet.addEventListener('click', (e) => {
            if (e.target === sheet) { // Only close if scrim is clicked directly
                hideMaterialSheet();
            }
        });
    }

    // --- (Paste the rest of the unchanged JS functions here) ---
    // e.g., showToast, showDialog, addSet, addDeco, buildPayload, etc.

})();