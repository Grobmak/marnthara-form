(function() {
    'use strict';
    // --- APP CONFIGURATION ---
    const APP_VERSION = "input-ui/4.1.0-iOS-Theme";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4.1";
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
            if (stripsPerRoll === 0) return Infinity;
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        }
    };

    // --- DOM SELECTORS ---
    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', copyJsonBtn: '#copyJsonBtn', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomHeaderBtn: '#addRoomHeaderBtn',
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
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel'
    };
    
    // --- STATE ---
    let isLocked = false;
    
    // --- UTILITY FUNCTIONS ---
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
        return n.toLocaleString("th-TH", options);
    };
    const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        for (const entry of PRICING.height) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };

    // --- UI FUNCTIONS ---
    function showToast(message, type = 'success') {
        const container = document.querySelector(SELECTORS.toastContainer);
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
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(result);
            };
            confirmBtn.onclick = async () => cleanup(onConfirm ? await onConfirm() : true);
            cancelBtn.onclick = () => cleanup(false);
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

    // --- CORE LOGIC ---
    function addRoom(prefill) {
        if (isLocked) return;
        const roomsEl = document.querySelector(SELECTORS.roomsContainer);
        const frag = document.querySelector(SELECTORS.roomTpl)?.content?.cloneNode(true);
        if (!frag) return;
        populatePriceOptions(frag.querySelector(SELECTORS.roomPricePerM), PRICING.fabric);
        roomsEl.appendChild(frag);
        const created = roomsEl.querySelector(`${SELECTORS.room}:last-of-type`);

        if (prefill) {
            created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
            created.querySelector(SELECTORS.roomPricePerM).value = prefill.price_per_m_raw || "";
            created.querySelector(SELECTORS.roomStyle).value = prefill.style || "";
            // ... (restore other prefill data)
        } else {
             addSet(created);
        }
        renumber(); recalcAll(); saveData();
        if (!prefill) created.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
        const frag = document.querySelector(SELECTORS.setTpl)?.content?.cloneNode(true);
        if (!frag) return;
        setsWrap.appendChild(frag);
        const created = setsWrap.querySelector(`${SELECTORS.set}:last-of-type`);
        populatePriceOptions(created.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);
        if (prefill) { /* ... restore set data ... */ }
        toggleSetFabricUI(created); renumber(); recalcAll(); saveData();
    }
    
    function addDeco(roomEl, prefill) { /* ... similar to addSet ... */ }
    function addWallpaper(roomEl, prefill) { /* ... similar to addSet ... */ }
    function addWall(btn, prefillWidth) { /* ... similar to addSet ... */ }
    
    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            room.querySelector(SELECTORS.roomNameInput).placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            items.forEach((item, iIdx) => {
                item.querySelector("[data-item-title]").textContent = `${iIdx + 1}`;
            });
        });
    }

    const debouncedRecalc = debounce(() => { recalcAll(); saveData(); });

    function recalcAll() {
        // Calculation logic remains the same...
    }
    
    function toggleSetFabricUI(setEl) {
        if (!setEl) return;
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        setEl.querySelector(SELECTORS.sheerWrap)?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector('[data-set-options-row]')?.classList.toggle("three-col", hasSheer);
        // ... show/hide logic for labels
    }
    
    function buildPayload() {
        return {
            app_version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]')?.value || '',
            customer_phone: document.querySelector('input[name="customer_phone"]')?.value || '',
            customer_address: document.querySelector('input[name="customer_address"]')?.value || '',
            customer_date: document.querySelector('input[name="customer_date"]')?.value || '',
            rooms: Array.from(document.querySelectorAll(SELECTORS.room)).map(roomEl => ({
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || '',
                price_per_m_raw: toNum(roomEl.querySelector(SELECTORS.roomPricePerM)?.value),
                style: roomEl.querySelector(SELECTORS.roomStyle)?.value || '',
                // ... map sets, decos, wallpapers
            }))
        };
    }

    function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload())); }
    
    function loadPayload(payload) {
        if (!payload || !payload.rooms) { showToast("ข้อมูลไม่ถูกต้อง", "error"); return; }
        document.querySelector('input[name="customer_name"]').value = payload.customer_name || '';
        document.querySelector('input[name="customer_address"]').value = payload.customer_address || '';
        document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || '';
        document.querySelector('input[name="customer_date"]').value = payload.customer_date || '';
        const roomsEl = document.querySelector(SELECTORS.roomsContainer);
        roomsEl.innerHTML = "";
        if (payload.rooms.length > 0) payload.rooms.forEach(addRoom); else addRoom();
        showToast("โหลดข้อมูลสำเร็จ");
    }

    // --- Action Handler ---
    async function handleAction(e) {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const action = btn.dataset.act;
        // The rest of the action handler logic remains largely the same...
    }
    
    // --- Initial Setup & Event Listeners ---
    document.addEventListener('DOMContentLoaded', () => {
        // Simplified for brevity, the logic is the same as the previous version
        // just ensuring it handles the new date field
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) { try { loadPayload(JSON.parse(storedData)); } catch(err) { addRoom(); } } 
        else { addRoom(); }
        
        const orderForm = document.querySelector(SELECTORS.orderForm);
        orderForm.addEventListener("click", handleAction);
        orderForm.addEventListener("input", debouncedRecalc);
        orderForm.addEventListener("change", debouncedRecalc);
        document.querySelector('#customerInfo').addEventListener("input", debounce(saveData));
        document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async () => {
            if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return;
            document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
            document.querySelectorAll('#customerInfo input').forEach(i => i.value = "");
            addRoom();
            saveData();
            showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
        });
        document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
            isLocked = !isLocked;
            document.body.classList.toggle('is-locked', isLocked);
            document.querySelectorAll('input, select, button:not(#menuBtn):not(#lockBtn)').forEach(el => {
                if (!el.closest('.menu-dropdown')) el.disabled = isLocked;
            });
            const lockBtn = document.querySelector(SELECTORS.lockBtn);
            lockBtn.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อคฟอร์ม';
            showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ปลดล็อคฟอร์มแล้ว', 'warning');
        });

        window.addEventListener('click', (e) => {
            document.querySelectorAll('.menu-dropdown.show').forEach(menu => {
                if (!menu.parentElement.contains(e.target)) menu.classList.remove('show');
            });
        });
    });
})();