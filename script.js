(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.4.0-pdf-export";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";
    const SQM_TO_SQYD = 1.19599;
    const VAT_RATE = 0.07; // 7% VAT

    // +++ PDF QUOTATION CONFIGURATION +++
    const QUOTATION_CONFIG = {
        company_name: "ม่านธารา เดคคอร์",
        company_address: "123 หมู่ 4 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000",
        company_phone: "08X-XXX-XXXX, 09X-XXX-XXXX",
        company_logo_base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABTSURBVHhe7cEBDQAAAMKg909tDwcFAAAAAAAAAAAAAAAAAMDfA2nZAAE5QQk8AAAAAElFTkSuQmCC"
    };

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
        sheerCodeWrap: '[data-sheer-code-wrap]',
        roomNameInput: 'input[name="room_name"]',
        toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', fileImporter: '#fileImporter',
        submitBtn: '#submitBtn',
        clearItemsBtn: '#clearItemsBtn',
        generatePdfBtn: '#generatePdfBtn'
    };

    // --- STATE ---
    let roomCount = 0;
    let isLocked = false;

    // --- UTILITIES ---
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
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };

    // --- Baht text helper (robust) ---
    function getBahtText(value) {
        try {
            // Common export names
            if (typeof window.ThaiBahtText === 'function') return window.ThaiBahtText(value);
            if (typeof window.ThaiBaht === 'function') return window.ThaiBaht(value);
            if (typeof window.ThaiBaht === 'object' && typeof window.ThaiBaht.bahtText === 'function') return window.ThaiBaht.bahtText(value);
            if (typeof window.thaiBahtText === 'function') return window.thaiBahtText(value);
            if (typeof window.default === 'function' && /thai[-_ ]?baht/i.test((window.default.name || ''))) return window.default(value);
        } catch (e) {
            console.warn('getBahtText error', e);
        }
        // Fallback: formatted number + ' บาท'
        return `${fmt(value, 2)} บาท`;
    }

    // --- SMALL UI helpers ---
    const animateAndScroll = (element) => {
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('item-created');
        element.addEventListener('animationend', () => {
            element.classList.remove('item-created');
        }, { once: true });
    };
    function showToast(message, type = 'default') {
        const container = document.querySelector(SELECTORS.toastContainer);
        if (!container) return;
        const icons = { success: 'ph-bold ph-check-circle', warning: 'ph-bold ph-warning', error: 'ph-bold ph-x-circle', default: 'ph-bold ph-info' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = document.createElement('i');
        icon.className = icons[type] || icons.default;
        toast.appendChild(icon);
        toast.appendChild(document.createTextNode(message));
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }

    // --- CORE: recalcAll, addRoom, addSet, etc. (kept same logic as original) ---
    // For brevity keep logic unchanged. We'll reuse the original functions but they remain compatible.
    // ... (retain original implementations from file) ...

    // To avoid sending an extremely long file in chat, we keep the original DOM / calc functions intact.
    // Paste the original implementations here when saving locally.
    // (In your copy, leave the original recalcAll/addRoom/addSet/addDeco/addWallpaper implementations.)
    // ---------------------------------------------------------
    // For the user's convenience I include only the changed/critical sections below and final PDF code.
    // If you want the full file assembled here, I can paste the entire script.js complete.
    // ---------------------------------------------------------

    // --- PDF GENERATION (patched) ---
    async function generatePdf() {
        showToast('กำลังสร้าง PDF.', 'default');

        const payload = buildPayload();
        const customerName = payload.customer_name || 'ลูกค้า';

        const tableBody = [
            [{ text: 'ลำดับ', style: 'tableHeader' }, { text: 'รายการ', style: 'tableHeader' }, { text: 'จำนวน', style: 'tableHeader' }, { text: 'ราคา/หน่วย', style: 'tableHeader' }, { text: 'รวม', style: 'tableHeader' }]
        ];
        
        let subtotal = 0;
        let itemNumber = 1;

        payload.rooms.forEach(room => {
            if (room.is_suspended) return;
            const roomName = room.room_name || `ห้อง ${payload.rooms.indexOf(room) + 1}`;
            tableBody.push([{ text: roomName, colSpan: 5, style: 'roomHeader', fillColor: '#eeeeee' }, {}, {}, {}, {}]);

            room.sets.forEach(set => {
                if (set.is_suspended) return;
                let opaquePrice = 0, sheerPrice = 0;
                const hPlus = heightPlus(set.height_m);
                const sPlus = stylePlus(set.style);

                if (set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0) {
                    opaquePrice = Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m);
                }
                if (set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0) {
                    sheerPrice = Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m);
                }

                const totalSetPrice = opaquePrice + sheerPrice;
                if (totalSetPrice > 0) {
                    const desc = `ผ้าม่าน (${set.style}, ${set.fabric_variant})\nขนาด: ${fmt(set.width_m, 2)}x${fmt(set.height_m, 2)} ม.`;
                    tableBody.push([
                        { text: itemNumber++, style: 'tableCell', alignment: 'center' },
                        { text: desc, style: 'tableCell' },
                        { text: '1', style: 'tableCell', alignment: 'center' },
                        { text: fmt(totalSetPrice, 0, true), style: 'tableCell', alignment: 'right' },
                        { text: fmt(totalSetPrice, 0, true), style: 'tableCell', alignment: 'right' }
                    ]);
                    subtotal += totalSetPrice;
                }
            });

            room.decorations.forEach(deco => {
                if (deco.is_suspended) return;
                const areaSqyd = deco.width_m * deco.height_m * SQM_TO_SQYD;
                const decoPrice = Math.round(areaSqyd * deco.price_sqyd);
                if (decoPrice > 0) {
                    const desc = `${deco.type || 'งานตกแต่ง'}\nขนาด: ${fmt(deco.width_m,2)} x ${fmt(deco.height_m,2)} ม.`;
                    tableBody.push([
                        { text: itemNumber++, style: 'tableCell', alignment: 'center' },
                        { text: desc, style: 'tableCell' },
                        { text: `${fmt(areaSqyd,2)}`, style: 'tableCell', alignment: 'center' },
                        { text: `${fmt(deco.price_sqyd,0,true)}/ตร.หลา`, style: 'tableCell', alignment: 'right' },
                        { text: fmt(decoPrice,0,true), style: 'tableCell', alignment: 'right' }
                    ]);
                    subtotal += decoPrice;
                }
            });

            room.wallpapers.forEach(wp => {
                if (wp.is_suspended) return;
                const totalWidth = wp.widths.reduce((a, b) => a + b, 0);
                const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                const materialPrice = Math.round(rolls * wp.price_per_roll);
                const installPrice = Math.round(rolls * (wp.install_cost_per_roll || 0));
                const wpPrice = materialPrice + installPrice;
                if (wpPrice > 0) {
                    const desc = `วอลเปเปอร์ (รหัส: ${wp.wallpaper_code || '-'})`;
                    tableBody.push([
                        { text: itemNumber++, style: 'tableCell', alignment: 'center' },
                        { text: desc, style: 'tableCell' },
                        { text: rolls.toString(), style: 'tableCell', alignment: 'center' },
                        { text: fmt(wpPrice / rolls, 0, true) + '/ม้วน', style: 'tableCell', alignment: 'right' },
                        { text: fmt(wpPrice, 0, true), style: 'tableCell', alignment: 'right' }
                    ]);
                    subtotal += wpPrice;
                }
            });
        });

        const vat = subtotal * VAT_RATE;
        const grandTotal = subtotal + vat;
        const bahtText = `(${getBahtText(grandTotal)})`; // patched, robust call

        const today = new Date();
        const dateString = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;
        const docNumber = `QT-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 900) + 100)}`;
        const fileName = `ใบเสนอราคา-${(customerName||'ลูกค้า').replace(/\s+/g, '-')}-${dateString.replace(/\//g, '-')}.pdf`;

        // Use default fonts to avoid remote TTF loading issues.
        // If you have embedded vfs fonts, set pdfMake.vfs and pdfMake.fonts accordingly BEFORE calling generatePdf.
        const docDefinition = {
            pageSize: 'A4',
            defaultStyle: { font: 'Helvetica', fontSize: 10 },
            content: [
                {
                    columns: [
                        { image: QUOTATION_CONFIG.company_logo_base64, width: 60, height: 60 },
                        [
                            { text: QUOTATION_CONFIG.company_name, style: 'header' },
                            { text: QUOTATION_CONFIG.company_address },
                            { text: `โทร: ${QUOTATION_CONFIG.company_phone}` }
                        ],
                        [
                            { text: 'ใบเสนอราคา', style: 'docTitle', alignment: 'right' },
                            { text: `เลขที่: ${docNumber}`, alignment: 'right' },
                            { text: `วันที่: ${dateString}`, alignment: 'right' }
                        ]
                    ]
                },
                { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1 }], margin: [0, 10, 0, 10] },
                { text: 'ข้อมูลลูกค้า', style: 'subheader' },
                {
                    columns: [
                        {
                            stack: [
                                { text: `ชื่อ: ${payload.customer_name || '-'}` },
                                { text: `ที่อยู่: ${payload.customer_address || '-'}` },
                                { text: `โทร: ${payload.customer_phone || '-'}` }
                            ],
                            width: '*'
                        }
                    ],
                    margin: [0, 0, 0, 20]
                },
                {
                    table: {
                        headerRows: 1,
                        widths: [30, '*', 40, 70, 70],
                        body: tableBody
                    },
                    layout: 'lightHorizontalLines'
                },
                {
                    columns: [
                        { text: '', width: '*' },
                        {
                            width: 'auto',
                            style: 'totalsTable',
                            table: { body: [
                                ['รวมเป็นเงิน:', { text: fmt(subtotal, 2, true), alignment: 'right' }],
                                [`ภาษีมูลค่าเพิ่ม ${VAT_RATE * 100}%:`, { text: fmt(vat, 2, true), alignment: 'right' }],
                                [{ text: 'ยอดรวมสุทธิ:', bold: true }, { text: fmt(grandTotal, 2, true), alignment: 'right', bold: true }]
                            ]},
                            layout: 'noBorders'
                        }
                    ],
                    margin: [0, 10, 0, 5]
                },
                { text: bahtText, style: 'bahtText' },
                {
                    absolutePosition: { x: 40, y: 750 },
                    columns: [
                        { stack: [ { text: '.' }, { text: 'ผู้เสนอราคา' }, { text: `( ${QUOTATION_CONFIG.company_name} )` } ], width: 'auto', alignment: 'center' },
                        { text: '', width: '*' },
                        { stack: [ { text: '.' }, { text: 'ลูกค้า' }, { text: `( คุณ${customerName} )` } ], width: 'auto', alignment: 'center' },
                    ]
                }
            ],
            styles: {
                header: { fontSize: 16, bold: true, margin: [0, 0, 0, 5] },
                docTitle: { fontSize: 18, bold: true },
                subheader: { fontSize: 12, bold: true, margin: [0, 0, 0, 5] },
                tableHeader: { bold: true, fontSize: 10, alignment: 'center', fillColor: '#dddddd' },
                roomHeader: { bold: true, fontSize: 10, margin: [0, 4, 0, 4] },
                tableCell: { fontSize: 9, margin: [0, 2, 0, 2] },
                totalsTable: { margin: [0, 0, 0, 0] },
                bahtText: { bold: true, alignment: 'right', margin: [0, 0, 0, 40] }
            }
        };

        try {
            if (typeof pdfMake === 'undefined' || typeof pdfMake.createPdf !== 'function') {
                showToast('pdfMake ไม่พร้อมใช้งาน', 'error');
                console.error('pdfMake not found');
                return;
            }
            const pdfObj = pdfMake.createPdf(docDefinition);

            // Prefer download()
            if (typeof pdfObj.download === 'function') {
                pdfObj.download(fileName);
                showToast('สร้าง PDF สำเร็จ! กำลังดาวน์โหลด...', 'success');
                return;
            }

            // Fallback: getBlob -> create object URL -> trigger download
            if (typeof pdfObj.getBlob === 'function') {
                pdfObj.getBlob((blob) => {
                    try {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = fileName;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                        showToast('สร้าง PDF สำเร็จ! (ดาวน์โหลดโดยใช้ Blob)', 'success');
                    } catch (err) {
                        console.error('blob download failed', err);
                        showToast('สร้าง PDF เสร็จ แต่ดาวน์โหลดล้มเหลว', 'error');
                        // final fallback: open in new tab
                        if (typeof pdfObj.open === 'function') pdfObj.open();
                    }
                });
                return;
            }

            // Final fallback: open
            if (typeof pdfObj.open === 'function') {
                pdfObj.open();
                showToast('สร้าง PDF สำเร็จ! (เปิดเอกสารในแท็บใหม่)', 'success');
                return;
            }

            showToast('ไม่สามารถสร้าง/ดาวน์โหลด PDF ได้', 'error');
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
        }
    }

    // --- handleFormSubmit (unchanged) ---
    function handleFormSubmit() {
        const orderForm = document.querySelector(SELECTORS.orderForm);
        orderForm.action = WEBHOOK_URL;
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
        showToast("ส่งข้อมูลแล้ว.", "success");
        // orderForm.submit();
    }

    // --- INIT (attach listeners including PDF btn) ---
    function init() {
        // Attach existing UI listeners, menu handling, file importer, load from storage etc.
        // Keep existing init code while ensuring generatePdf button calls our patched generatePdf().
        document.querySelector(SELECTORS.generatePdfBtn)?.addEventListener('click', (e) => {
            e.preventDefault();
            generatePdf();
            document.querySelector(SELECTORS.menuDropdown)?.classList.remove('show');
        });

        // ... call the rest of original init logic: addRoom, load localStorage, etc.
        // For brevity, reuse original init body when replacing the file locally.
    }

    document.addEventListener('DOMContentLoaded', init);

    // Note: This patched file focuses on robustness for Thai-baht conversion and PDF export.
    // Replace the corresponding blocks in your original script.js with these functions if you prefer a minimal patch.
})();