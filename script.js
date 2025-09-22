(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/5.0.3-pdf-serverless";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";

    const SHOP_CONFIG = {
        name: "ม่านธารา ผ้าม่านและของตกแต่ง",
        address: "65/8 หมู่ 2 ต.ท่าศาลา อ.เมือง จ.ลพบุรี 15000",
        phone: "092-985-9395, 082-552-5595",
        taxId: "1234567890123",
        logoUrl: "", // EXAMPLE: "https://i.imgur.com/your-logo.png"
        vatRate: 0.07 // 7% VAT. Set to 0 to disable.
    };

    const SQM_TO_SQYD = 1.19599;

    const PRICING = {
        fabric: [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [
            { threshold: 3.2, add_per_m: 300 },
            { threshold: 2.8, add_per_m: 200 },
            { threshold: 2.5, add_per_m: 100 }
        ],
    };

    const CALC = {
        fabricYardage: (style, width) => {
            if (width <= 0 || !style) return 0;
            if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
            if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
            return 0;
        },
        wallpaperRolls: (totalWidth, height) => {
            if (totalWidth <= 0 || height <= 0) return 0;
            const stripsPerRoll = (height > 2.5) ? Math.floor(10 / height) : 3;
            if (stripsPerRoll <= 0) return Infinity;
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        }
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        clearAllBtn: '#clearAllBtn', lockBtn: '#lockBtn', addRoomFooterBtn: '#addRoomFooterBtn', lockText: '#lockText', grandTotal: '#grandTotal', setCount: '#setCount',
        detailedSummaryContainer: '#detailed-material-summary', modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]', decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]', sheerCodeWrap: '[data-sheer-code-wrap]', roomNameInput: 'input[name="room_name"]', toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', fileImporter: '#fileImporter', exportPdfBtn: '#exportPdfBtn'
    };

    let roomCount = 0;
    let isLocked = false;

    // --- UTILITY FUNCTIONS ---
    const toNum = v => {
        if (typeof v === 'string') v = v.replace(/,/g, '');
        const num = parseFloat(v);
        return Number.isFinite(num) ? num : 0;
    };
    const clamp01 = v => Math.max(0, toNum(v));
    const fmtTH = (n, fixed = 0) => {
        if (!Number.isFinite(n)) return "0";
         const options = { minimumFractionDigits: fixed, maximumFractionDigits: fixed };
        return n.toLocaleString('th-TH', options);
    };
    const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };
    const animateAndScroll = (element) => {
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('item-created');
        element.addEventListener('animationend', () => element.classList.remove('item-created'), { once: true });
    };
    function animateAndRemove(item) {
        if (!item) return;
        item.classList.add('item-removing');
        item.addEventListener('animationend', () => {
            item.remove();
            renumber();
            recalcAll();
            saveData();
        }, { once: true });
    }

    // --- UI FUNCTIONS (Toasts, Modals) ---
    function showToast(message, type = 'default') {
        const container = document.querySelector(SELECTORS.toastContainer);
        if (!container) return;
        const icons = { success: 'ph-bold ph-check-circle', warning: 'ph-bold ph-warning', error: 'ph-bold ph-x-circle', default: 'ph-bold ph-info' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<i class="${icons[type] || icons.default}"></i> ${message}`;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }
    const showModal = (selector) => {
        return new Promise((resolve) => {
            const modalEl = document.querySelector(selector);
            if (!modalEl) { resolve(null); return; }
            modalEl.classList.add('visible');
            const confirmBtn = modalEl.querySelector('[id*="Confirm"]');
            const cancelBtn = modalEl.querySelector('[id*="Cancel"]');
            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                if (confirmBtn) confirmBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
                resolve(result);
            };
            if (confirmBtn) confirmBtn.onclick = () => cleanup(true);
            if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
        });
    };
    async function showConfirmation(title, body) {
        const modalEl = document.querySelector(SELECTORS.modal);
        if (!modalEl) return true;
        modalEl.querySelector(SELECTORS.modalTitle).textContent = title;
        modalEl.querySelector(SELECTORS.modalBody).textContent = body;
        return await showModal(SELECTORS.modal);
    }
    async function showCopyOptionsModal() {
        const modalEl = document.querySelector(SELECTORS.copyOptionsModal);
        modalEl.querySelectorAll('input[name="copy_option"]').forEach(radio => radio.checked = false);
        if (!await showModal(SELECTORS.copyOptionsModal)) return false;
        const selected = modalEl.querySelector('input[name="copy_option"]:checked');
        return selected ? selected.value : false;
    }

    // --- CORE DOM MANIPULATION ---
    function addRoom(prefill) {
        // ... (Function content remains the same as your original)
    }
    function populatePriceOptions(selectEl, prices) {
        // ... (Function content remains the same as your original)
    }
    function addSet(roomEl, prefill) {
        // ... (Function content remains the same as your original)
    }
    function addDeco(roomEl, prefill) {
       // ... (Function content remains the same as your original)
    }
    function addWallpaper(roomEl, prefill) {
       // ... (Function content remains the same as your original)
    }
    function addWall(btn, prefillWidth) {
       // ... (Function content remains the same as your original)
    }
    function suspendItem(item, isSuspended, notify = true) {
       // ... (Function content remains the same as your original)
    }
    function suspendRoom(roomEl, isSuspended, notify = true) {
        // ... (Function content remains the same as your original)
    }

    // --- DATA & CALCULATIONS ---
    function recalcAll() {
        // ... (Function content remains the same as your original)
    }
    function buildPayload() {
        // ... (Function content remains the same as your original)
    }

    // --- PERSISTENCE ---
    function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload())); }
    function loadPayload(payload) {
        // ... (Function content remains the same as your original)
    }

    // --- UI HELPERS & STATE MANAGEMENT ---
    function renumber() {
        // ... (Function content remains the same as your original)
    }
    function toggleSetFabricUI(setEl) {
        // ... (Function content remains the same as your original)
    }
    function updateLockState() {
        // ... (Function content remains the same as your original)
    }
    function toggleLock() {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'warning');
    }

    // --- TEXT SUMMARY BUILDERS ---
    function buildCustomerSummary(payload) {
        // ... (Function content remains the same as your original)
    }
    function buildSeamstressSummary(payload) {
        // ... (Function content remains the same as your original)
    }
    function buildOwnerSummary(payload) {
        // ... (Function content remains the same as your original)
    }

    // --- PDF Generation (OVERHAULED FOR SERVER-SIDE RELIABILITY) ---
    async function generatePdfQuotation() {
        showToast('กำลังสร้างใบเสนอราคา...', 'default');
        const payload = buildPayload();

        const hasPricedItems = payload.rooms.some(room => {
            if (room.is_suspended) return false;
            const hasSet = room.sets.some(s => !s.is_suspended && s.width_m > 0 && s.price_per_m_raw > 0);
            const hasDeco = room.decorations.some(d => !d.is_suspended && d.width_m > 0 && d.price_sqyd > 0);
            const hasWallpaper = room.wallpapers.some(w => !w.is_suspended && w.widths.reduce((a, b) => a + b, 0) > 0 && w.price_per_roll > 0);
            return hasSet || hasDeco || hasWallpaper;
        });

        if (!hasPricedItems) {
            showToast('ไม่มีรายการที่มีราคาสำหรับสร้างใบเสนอราคา', 'warning');
            return;
        }

        // **MODIFIED**: Use a relative path for the function URL
        const PDF_GENERATOR_URL = "/api/generate-pdf";

        try {
            const response = await fetch(PDF_GENERATOR_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // **MODIFIED**: Send both payload and shopConfig
                body: JSON.stringify({ payload: payload, shopConfig: SHOP_CONFIG }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Server Error: ${response.statusText}`);
            }

            const pdfBlob = await response.blob();
            const url = window.URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;

            const today = new Date();
            const quoteNumber = `QT-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
            const customerName = payload.customer_name.trim().replace(/\s+/g, '-') || 'quote';
            a.download = `${quoteNumber}_${customerName}.pdf`;
            
            document.body.appendChild(a);
            a.click();

            window.URL.revokeObjectURL(url);
            a.remove();
            
            showToast('สร้าง PDF สำเร็จ!', 'success');

        } catch (error) {
            console.error("PDF Generation Error:", error);
            showToast(`สร้าง PDF ล้มเหลว: ${error.message}`, 'error');
        }
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        // ... (This entire function remains the same as your original)
    }

    function init() {
        // ... (This entire function remains the same as your original)
    }

    document.addEventListener('DOMContentLoaded', init);
})();
