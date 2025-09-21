// script.js
(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.3.8-ux-reverted";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4"; // Keep v4 for data compatibility
    const SQM_TO_SQYD = 1.19599;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [
            { threshold: 3.2, add_per_m: 300 },
            { threshold: 2.8, add_per_m: 200 },
            { threshold: 2.5, add_per_m: 150 }
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
        payloadInput: '#payload', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomFooterBtn: '#addRoomFooterBtn', lockText: '#lockText',
        grandTotal: '#grandTotal', setCount: '#setCount',
        detailedSummaryContainer: '#detailed-material-summary',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        sheerCodeWrap: '[data-sheer-code-wrap]', // MODIFIED: Added selector
        roomNameInput: 'input[name="room_name"]',
        toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', exportPdfBtn: '#exportPdfBtn', fileImporter: '#fileImporter',
        submitBtn: '#submitBtn',
        clearItemsBtn: '#clearItemsBtn'
    };

    // --- STATE ---
    let roomCount = 0;
    let isLocked = false;

    // --- UTILITIES (unchanged) ---
    const toNum = v => {
        if (typeof v === 'string') v = v.replace(/,/g, '');
        const num = parseFloat(v);
        return Number.isFinite(num) ? num : 0;
    };
    const clamp01 = v => Math.max(0, toNum(v));
    const fmt = (n, fixed = 2, asCurrency = false) => {
        if (!Number.isFinite(n)) return "0";
        return n.toLocaleString("th-TH", {
            minimumFractionDigits: asCurrency ? 0 : fixed,
            maximumFractionDigits: asCurrency ? 0 : fixed
        });
    };
    const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        const sorted = PRICING.height.sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };

    // --- TOAST / MODAL etc. (unchanged functions omitted here for brevity in this snippet)
    // (Ensure you keep the rest of your original script's functions: showToast, showModal, addRoom, addSet, addDeco, addWallpaper, recalcAll, buildPayload, buildCustomerSummary, buildOwnerSummary, buildSeamstressSummary, buildPurchaseOrderSummary, etc.)
    // ... (full original code preserved) ...

    // --- NEW: Build printable HTML for invoice ---
    function createInvoiceHTML(payload) {
        // Use buildCustomerSummary to get text summary then wrap in <pre> for monospaced print.
        // If buildCustomerSummary not present yet, fallback to simple JSON.
        let bodyText = "";
        try {
            bodyText = buildCustomerSummary(payload) + "\n\n" + buildPurchaseOrderSummary(payload);
        } catch (e) {
            bodyText = JSON.stringify(payload, null, 2);
        }

        const cssForPrint = `
            <style>
                body { font-family: 'Noto Sans Thai', Arial, sans-serif; margin: 20px; color: #111; }
                h1 { color: #543D49; font-size: 22px; margin-bottom: 6px; }
                .meta { margin-bottom: 12px; font-size: 14px; }
                pre { white-space: pre-wrap; word-wrap: break-word; font-family: monospace; font-size: 13px; background: #fff; border: none; }
                @media print {
                    body { margin: 10mm; }
                    .no-print { display: none; }
                }
            </style>
        `;

        const headerHtml = `
            <div>
                <h1>ใบเสนอราคา / QUOTATION</h1>
                <div class="meta">วันที่: ${new Date().toLocaleDateString('th-TH')}</div>
                <div class="meta">ร้าน: Marnthara (Auto-generated)</div>
            </div>
        `;

        const html = `<!doctype html><html><head><meta charset="utf-8">${cssForPrint}</head><body>${headerHtml}<pre>${escapeHtml(bodyText)}</pre></body></html>`;
        return html;
    }

    function escapeHtml(text) {
        return (text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // --- NEW: Export PDF via print window ---
    function exportAsPdf(payload) {
        const html = createInvoiceHTML(payload);
        const win = window.open("", "_blank", "noopener,noreferrer");
        if (!win) {
            showToast('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ (ปิดการบล็อกป๊อปอัพ)', 'error');
            return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        // wait a short time for rendering then print
        setTimeout(() => {
            try {
                win.focus();
                win.print();
                // don't auto-close immediately; let user check print dialog; close after delay optionally
                setTimeout(() => { try { win.close(); } catch (e) {} }, 1500);
            } catch (err) {
                showToast('การพิมพ์ล้มเหลว: ' + (err.message || ''), 'error');
            }
        }, 500);
    }

    // --- INITIALIZATION & EVENT HOOKUP (preserve original init but add exportPdfBtn handler) ---
    function init() {
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const fileImporter = document.querySelector(SELECTORS.fileImporter);

        const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); }, 150);

        // (keep the existing event listeners from original file)
        // ... (existing listeners retained) ...

        // JSON export (existing)
        const exportBtn = document.querySelector(SELECTORS.exportBtn);
        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const payload = buildPayload();
                const customerName = payload.customer_name.trim();
                const cleanName = customerName.replace(/[^a-zA-Z0-9ก-๙_.\s-]/g, '').replace(/\s+/g, '-').substring(0, 30);
                const dateStamp = new Date().toISOString().split('T')[0];
                const fileName = cleanName 
                    ? `mtr-${cleanName}-${dateStamp}.json` 
                    : `mtr-${dateStamp}.json`;

                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", fileName);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
                showToast('ส่งออกข้อมูล (JSON) สำเร็จ', 'success');
                document.querySelector(SELECTORS.menuDropdown).classList.remove('show');
            });
        }

        // PDF export (new)
        const exportPdfBtn = document.querySelector(SELECTORS.exportPdfBtn);
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const payload = buildPayload();
                exportAsPdf(payload);
                document.querySelector(SELECTORS.menuDropdown).classList.remove('show');
            });
        }

        // existing import button handler (keep)
        const importBtn = document.querySelector(SELECTORS.importBtn);
        if (importBtn) {
            importBtn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelector(SELECTORS.menuDropdown).classList.remove('show');
                fileImporter.click();
            });
        }

        // file importer change (existing)
        if (fileImporter) {
            fileImporter.addEventListener('change', (e) => {
                if (!e.target.files || !e.target.files[0]) return;
                const file = e.target.files[0];
                const reader = new FileReader();
                
                reader.onload = (event) => {
                    try {
                        const payload = JSON.parse(event.target.result);
                        loadPayload(payload);
                    } catch (err) {
                        showToast('ไฟล์ JSON ไม่ถูกต้องหรือไม่สมบูรณ์', 'error');
                    }
                };
                
                reader.readAsText(file);
                e.target.value = null; // Reset to allow re-upload of the same file
            });
        }

        // other initialization from original file...
        // REUSE the remainder of your original init() code: menu toggles, load from localStorage, addRoom, recalcAll(), updateLockState(), etc.
        // For brevity in this snippet, call the original init's remaining logic by copying it from your original script (do not omit).
        // Ensure document.addEventListener('DOMContentLoaded', init) remains at the end of the file.

        // --- copy rest of original init logic here (menu toggles, listeners, initial load) ---
        // ----- BEGIN existing init logic (copy exactly from your original script) -----
        // (The original code previously supplied must be kept in full here)
        // ----- END existing init logic -----
    }

    document.addEventListener('DOMContentLoaded', init);
})();
