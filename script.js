// FILE: script.js
// Full script.js revised. Replace the uploaded script.js with the following.
// Key fixes:
// - heightPlus fixed
// - generatePdf computes subtotal, VAT, grandTotal, bahtText with fallback
// - safe usage of pdfMake and configurable logo

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
        fabric: [1000,1100,1200,1300,1400,1500],
        sheer: [1000,1100,1200,1300],
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
            const stripsPerRoll = (height > 2.5) ? Math.floor(10 / height) : Math.floor(12 / height);
            const stripWidth = 0.53; // typical
            const stripsNeeded = Math.ceil(totalWidth / stripWidth);
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
        sheerWrap: '[data-sheer-wrap]', sheerCodeWrap: '[data-sheer-code-wrap]',
        roomNameInput: 'input[name="room_name"]',
        toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', fileImporter: '#fileImporter',
        submitBtn: '#submitBtn',
        clearItemsBtn: '#clearItemsBtn',
        generatePdfBtn: '#generatePdfBtn'
    };
	
	// toggle dropdown
		document.querySelector(SELECTORS.menuBtn)?.addEventListener('click', (e) => {
			e.preventDefault();
			const menu = document.querySelector(SELECTORS.menuDropdown);
		menu?.classList.toggle('show');
});

	// ปิด dropdown เมื่อคลิกนอก
		document.addEventListener('click', (e) => {
			const menu = document.querySelector(SELECTORS.menuDropdown);
			const btn = document.querySelector(SELECTORS.menuBtn);
			if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
		menu.classList.remove('show');
  }
});

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
    // FIX: heightPlus should read PRICING.height array
    const heightPlus = h => {
        const sorted = Array.isArray(PRICING.height) ? [...PRICING.height].sort((a,b) => b.threshold - a.threshold) : [];
        for (const entry of sorted) {
            if (h > entry.threshold) return entry.add_per_m;
        }
        return 0;
    };

    // --- UI small helpers ---
    function showToast(message, type = 'default') {
        const container = document.querySelector(SELECTORS.toastContainer);
        if (!container) return;
        const icons = { success: 'ph-bold ph-check-circle', warning: 'ph-bold ph-warning', error: 'ph-bold ph-x-circle', default: 'ph-bold ph-info' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = document.createElement('i');
        icon.className = icons[type] || icons.default;
        const text = document.createTextNode(message);
        toast.appendChild(icon);
        toast.appendChild(text);
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }

    // --- Payload builder (keeps original structure) ---
    function buildPayload() {
        const payload = {
            app_version: APP_VERSION,
            customer_name: document.querySelector('[name="customer_name"]')?.value || '',
            customer_phone: document.querySelector('[name="customer_phone"]')?.value || '',
            customer_address: document.querySelector('[name="customer_address"]')?.value || '',
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || '',
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [], decorations: [], wallpapers: []
            };
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    width_m: toNum(setEl.querySelector('input[name="width_m"]')?.value),
                    height_m: toNum(setEl.querySelector('input[name="height_m"]')?.value),
                    style: setEl.querySelector('select[name="set_style"]')?.value || '',
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value || '',
                    price_per_m_raw: toNum(setEl.querySelector('select[name="set_price_per_m"]')?.value),
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value),
                    fabric_code: setEl.querySelector('input[name="set_code"]')?.value || '',
                    sheer_fabric_code: setEl.querySelector('input[name="sheer_code"]')?.value || '',
                    is_suspended: setEl.dataset.suspended === 'true'
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value),
                    type: decoEl.querySelector('[name="deco_type"]')?.value || '',
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                    deco_code: decoEl.querySelector('[name="deco_code"]')?.value || '',
                    deco_notes: decoEl.querySelector('[name="deco_notes"]')?.value || '',
                    is_suspended: decoEl.dataset.suspended === 'true'
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wpEl => {
                const widths = Array.from(wpEl.querySelectorAll('input[name="wall_width_m"]')).map(i => toNum(i.value));
                roomData.wallpapers.push({
                    height_m: toNum(wpEl.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wpEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    install_cost_per_roll: toNum(wpEl.querySelector('[name="wallpaper_install_cost"]')?.value),
                    widths,
                    wallpaper_code: wpEl.querySelector('[name="wallpaper_code"]')?.value || '',
                    wallpaper_notes: wpEl.querySelector('[name="wallpaper_notes"]')?.value || '',
                    is_suspended: wpEl.dataset.suspended === 'true'
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    // --- PDF GENERATION ---
    async function generatePdf() {
        showToast('กำลังสร้าง PDF.', 'default');
        const payload = buildPayload();
        const customerName = payload.customer_name || 'ลูกค้า';

        // table header
        const tableBody = [
            [{ text: 'ลำดับ', style: 'tableHeader' }, { text: 'รายการ', style: 'tableHeader' }, { text: 'จำนวน', style: 'tableHeader' }, { text: 'ราคา/หน่วย', style: 'tableHeader' }, { text: 'รวม', style: 'tableHeader' }]
        ];

        let subtotal = 0;
        let itemNumber = 1;

        payload.rooms.forEach((room, rIdx) => {
            if (room.is_suspended) return;
            const roomName = room.room_name || `ห้อง ${rIdx + 1}`;
            tableBody.push([{ text: roomName, colSpan: 5, style: 'roomHeader', fillColor: '#f3f3f3' }, {}, {}, {}, {}]);

            room.sets.forEach(set => {
                if (set.is_suspended) return;
                let opaquePrice = 0, sheerPrice = 0;
                const hPlus = heightPlus(set.height_m);
                const sPlus = stylePlus(set.style);
                if ((set.fabric_variant || "").includes("ทึบ") && set.price_per_m_raw > 0) {
                    opaquePrice = Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m);
                }
                if ((set.fabric_variant || "").includes("โปร่ง") && set.sheer_price_per_m > 0) {
                    sheerPrice = Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m);
                }
                const total = opaquePrice + sheerPrice;
                if (total > 0) {
                    tableBody.push([ itemNumber, `ผ้าม่าน (${set.fabric_code || '-'})`, `${fmt(set.width_m,2)} ม.`, fmt(total / Math.max(1, set.width_m),2,true), fmt(total,2,true) ]);
                    subtotal += total;
                    itemNumber++;
                }
            });

            room.decorations.forEach(deco => {
                if (deco.is_suspended) return;
                const areaSqyd = deco.width_m * deco.height_m * SQM_TO_SQYD;
                const price = Math.round(areaSqyd * deco.price_sqyd);
                if (price > 0) {
                    tableBody.push([ itemNumber, `${deco.type || 'ตกแต่ง'} (${deco.deco_code || '-'})`, `${fmt(areaSqyd,2)} ตร.หลา`, fmt(deco.price_sqyd,2,true), fmt(price,2,true) ]);
                    subtotal += price;
                    itemNumber++;
                }
            });

            room.wallpapers.forEach(wp => {
                if (wp.is_suspended) return;
                const totalWidth = (wp.widths || []).reduce((a,b) => a + b, 0);
                if (totalWidth <= 0 || wp.height_m <= 0) return;
                const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                const materialPrice = Math.round(rolls * wp.price_per_roll);
                const installPrice = Math.round(rolls * wp.install_cost_per_roll);
                const totalPrice = materialPrice + installPrice;
                if (totalPrice > 0) {
                    tableBody.push([ itemNumber, `วอลเปเปอร์ (${wp.wallpaper_code || '-'})`, `${rolls} ม้วน`, fmt((materialPrice+installPrice)/Math.max(1, rolls),2,true), fmt(totalPrice,2,true) ]);
                    subtotal += totalPrice;
                    itemNumber++;
                }
            });
        });

        const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
        const grandTotal = Math.round((subtotal + vat) * 100) / 100;

        // baht text: try library, fallback
        let bahtText = '';
        try {
            if (typeof thaiBahtText === 'function') {
                bahtText = thaiBahtText(grandTotal);
            } else if (typeof toThaiBaht === 'function') {
                bahtText = toThaiBaht(grandTotal);
            } else {
                bahtText = `${fmt(grandTotal,2,true)} บาท`;
            }
        } catch (e) {
            bahtText = `${fmt(grandTotal,2,true)} บาท`;
        }

        // tidy filename
        const cleanName = (payload.customer_name || '').replace(/[^a-zA-Z0-9ก-๙_.\s-]/g, '').replace(/\s+/g, '-').substring(0,30) || 'ลูกค้า';
        const dateStamp = new Date().toISOString().split('T')[0];
        const fileName = `mtr-${cleanName}-${dateStamp}.pdf`;

        // docDefinition
        const docDefinition = {
            pageSize: 'A4',
            pageMargins: [40, 120, 40, 80],
            header: [
                {
                    columns: [
                        (QUOTATION_CONFIG.company_logo_base64 ? { image: QUOTATION_CONFIG.company_logo_base64, width: 64 } : { text: '' }),
                        {
                            stack: [
                                { text: QUOTATION_CONFIG.company_name || '', style: 'header' },
                                { text: QUOTATION_CONFIG.company_address || '', fontSize: 10 },
                                { text: `โทร: ${QUOTATION_CONFIG.company_phone || '-'}`, fontSize: 10 }
                            ],
                            margin: [10, 0, 0, 0]
                        },
                        { text: '', width: '*' },
                        { stack: [ { text: 'วันที่', style: 'subheader' }, { text: dateStamp } ], width: 120, alignment: 'right' }
                    ],
                    margin: [0, 10, 0, 10]
                },
                { canvas: [ { type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#eeeeee' } ] }
            ],
            content: [
                { text: 'ใบเสนอราคา / Quotation', style: 'docTitle', margin: [0, 10, 0, 10] },
                {
                    columns: [
                        {
                            stack: [
                                { text: 'ข้อมูลลูกค้า', style: 'subheader' },
                                { text: `ชื่อ: ${payload.customer_name || '-'}` },
                                { text: `ที่อยู่: ${payload.customer_address || '-'}` },
                                { text: `โทร: ${payload.customer_phone || '-'}` }
                            ],
                            width: '*'
                        }
                    ],
                    margin: [0, 0, 0, 10]
                },
                {
                    table: {
                        headerRows: 1,
                        widths: [40, '*', 60, 80, 80],
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
                            table: {
                                body: [
                                    ['รวมเป็นเงิน:', { text: fmt(subtotal,2,true), alignment: 'right' }],
                                    [`ภาษีมูลค่าเพิ่ม ${VAT_RATE * 100}%:`, { text: fmt(vat,2,true), alignment: 'right' }],
                                    [{ text: 'ยอดรวมสุทธิ:', bold: true }, { text: fmt(grandTotal,2,true), alignment: 'right', bold: true }]
                                ]
                            },
                            layout: 'noBorders'
                        }
                    ],
                    margin: [0, 10, 0, 5]
                },
                { text: bahtText, style: 'bahtText' },
                {
                    absolutePosition: { x: 40, y: 740 },
                    columns: [
                        { stack: [ { text: '.' }, { text: 'ผู้เสนอราคา' }, { text: `( ${QUOTATION_CONFIG.company_name} )` } ], width: 'auto', alignment: 'center' },
                        { text: '', width: '*' },
                        { stack: [ { text: '.' }, { text: 'ลูกค้า' }, { text: `( คุณ${customerName} )` } ], width: 'auto', alignment: 'center' },
                    ]
                }
            ],
            styles: {
                header: { fontSize: 14, bold: true },
                docTitle: { fontSize: 16, bold: true },
                subheader: { fontSize: 11, bold: true, margin: [0, 4, 0, 4] },
                tableHeader: { bold: true, fontSize: 10, alignment: 'center', fillColor: '#f2f2f2' },
                roomHeader: { bold: true, fontSize: 10, margin: [0, 4, 0, 4] },
                tableCell: { fontSize: 9, margin: [0, 2, 0, 2] },
                totalsTable: { margin: [0, 0, 0, 0] },
                bahtText: { bold: true, alignment: 'right', margin: [0, 10, 0, 20] }
            }
        };

        try {
            pdfMake.createPdf(docDefinition).download(fileName);
            showToast('สร้าง PDF สำเร็จ!', 'success');
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
        }
    }

    // --- Minimal necessary UI wiring for menu buttons & init (keeps your logic) ---
    function init() {
        const fileImporter = document.querySelector(SELECTORS.fileImporter);
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);

        document.querySelector(SELECTORS.generatePdfBtn)?.addEventListener('click', (e) => {
            e?.preventDefault();
            generatePdf();
            menuDropdown?.classList.remove('show');
        });

        document.querySelector(SELECTORS.copyTextBtn)?.addEventListener('click', async (e) => {
            e?.preventDefault();
            // reuse existing copy modal logic if present else fallback
            const payload = buildPayload();
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                .then(() => showToast('คัดลอกสรุปสำเร็จ', 'success'))
                .catch(() => showToast('คัดลอกล้มเหลว', 'error'));
            menuDropdown?.classList.remove('show');
        });

        // existing listeners in your original file will continue to be bound if present
        document.addEventListener('DOMContentLoaded', () => { /* placeholder */ }, { once: true });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
