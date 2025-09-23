(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/5.2.0-robust-export";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";

    // CONFIG: Delay in milliseconds before html2pdf starts rendering.
    // Increase this value (e.g., to 1000) if blank PDFs still occur.
    const PDF_EXPORT_DELAY_MS = 500;

    const SHOP_CONFIG = {
        name: "ม่านธารา ผ้าม่านและของตกแต่ง",
        address: "65/8 หมู่ 2 ต.ท่าศาลา อ.เมือง จ.ลพบุรี 15000",
        phone: "092-985-9395, 082-552-5595",
        taxId: "1234567890123",
        logoUrl: "https://i.imgur.com/l7y85nI.png",
        baseVatRate: 0.07, // The standard 7% VAT rate.
        pdf: {
            paymentTerms: "ชำระมัดจำ 50%",
            priceValidity: "30 วัน",
            notes: [
                "ราคานี้รวมค่าติดตั้งแล้ว",
                "ชำระมัดจำ 50% เพื่อยืนยันการสั่งผลิตสินค้า",
                "ใบเสนอราคานี้มีอายุ 30 วัน นับจากวันที่เสนอราคา"
            ]
        }
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
        exportPdfBtn: '#exportPdfBtn',
        exportOptionsModal: '#exportOptionsModal', exportOptionsConfirm: '#exportOptionsConfirm', exportOptionsCancel: '#exportOptionsCancel',
        printableContent: '#printable-content',
    };

    // --- STATE ---
    let roomCount = 0;
    let isLocked = false;

    // --- UTILITY FUNCTIONS ---
    const toNum = v => {
        if (typeof v === 'string') v = v.replace(/,/g, '');
        const num = parseFloat(v);
        return Number.isFinite(num) ? num : 0;
    };
    const clamp01 = v => Math.max(0, toNum(v));
    const fmt = (n, fixed = 2, asCurrency = false) => {
        if (!Number.isFinite(n)) return "0";
        return n.toLocaleString('en-US', { minimumFractionDigits: asCurrency ? 2 : fixed, maximumFractionDigits: asCurrency ? 2 : fixed });
    };
    const fmtTH = (n, fixed = 0) => {
        if (!Number.isFinite(n)) return "0";
        return n.toLocaleString('th-TH', { minimumFractionDigits: fixed, maximumFractionDigits: fixed });
    };
    const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };
    function bahttext(num) {
        num = Number(num);
        if (isNaN(num)) return "ข้อมูลตัวเลขไม่ถูกต้อง";
        const txtNumArr = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า', 'สิบ'];
        const txtDigitArr = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
        if (num === 0) return 'ศูนย์บาทถ้วน';
        const [integerPart, decimalPart] = num.toFixed(2).split('.');
        const satang = parseInt(decimalPart, 10);
        function convert(n) {
            if (n === null || n === undefined) return '';
            let output = '';
            const strN = String(n);
            for (let i = 0; i < strN.length; i++) {
                const digit = parseInt(strN[i], 10);
                if (digit !== 0) {
                    if ((strN.length - i - 1) % 6 === 0 && i !== strN.length - 1) {
                        return convert(strN.substring(0, i + 1)) + 'ล้าน' + convert(strN.substring(i + 1));
                    }
                    output += txtNumArr[digit] + txtDigitArr[strN.length - i - 1];
                }
            }
            return output;
        }
        let bahtTxt = convert(integerPart).replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด') + 'บาท';
        if (satang > 0) {
            bahtTxt += convert(satang).replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด') + 'สตางค์';
        } else {
            bahtTxt += 'ถ้วน';
        }
        return bahtTxt;
    }
    const animateAndScroll = (element) => {
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('item-created');
        element.addEventListener('animationend', () => element.classList.remove('item-created'), { once: true });
    };
    function animateAndRemove(item) {
        if (!item) return;
        item.parentElement.closest('.card, .items-container')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        return modalEl.querySelector('input[name="copy_option"]:checked')?.value || false;
    }
    
    // --- DOCUMENT EXPORT MODAL ---
    async function showExportOptionsModal() {
        const confirmed = await showModal(SELECTORS.exportOptionsModal);
        if (!confirmed) return null;
        const modalEl = document.querySelector(SELECTORS.exportOptionsModal);
        return {
            vatOption: modalEl.querySelector('input[name="vat_option"]:checked').value,
            exportMethod: modalEl.querySelector('#exportMethod').value,
        };
    }

    // --- CORE DOM MANIPULATION & DATA ---
    // (addRoom, addSet, addDeco, etc. are unchanged)
    // --- Most DOM functions from the previous version are still valid ---
    // --- ... They are omitted here for brevity but should be included ---
    // --- The following are the core calculation and data functions ---
    
    // [ Functions addRoom, populatePriceOptions, addSet, addDeco, addWallpaper, addWall, suspendItem, suspendRoom, performActionWithConfirmation should be here, they are unchanged ]

    function recalcAll() {
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0, grandOpaqueTrack = 0, grandSheerTrack = 0;
        let totalWallpaperRolls = 0;
        let hasDoubleBracket = false;
        const decoCounts = {};
        let pricedItemCount = 0;

        document.querySelectorAll(SELECTORS.room).forEach(room => {
            let roomSum = 0;
            const isRoomSuspended = room.dataset.suspended === 'true';

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                if (set.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const w = clamp01(set.querySelector('input[name="width_m"]')?.value);
                    const h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                    const style = set.querySelector('select[name="set_style"]')?.value;
                    const variant = set.querySelector('select[name="fabric_variant"]')?.value;
                    if(variant === "ทึบ&โปร่ง") hasDoubleBracket = true;
                    if (w > 0 && h > 0) {
                        const sPlus = stylePlus(style);
                        const hPlus = heightPlus(h);
                        if (variant.includes("ทึบ")) {
                            const baseRaw = clamp01(set.querySelector('select[name="set_price_per_m"]')?.value);
                            if (baseRaw > 0) {
                                opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                                opaqueYards = CALC.fabricYardage(style, w);
                                opaqueTrack = w;
                            }
                        }
                        if (variant.includes("โปร่ง")) {
                            const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                            if (sheerBase > 0) {
                                sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                                sheerYards = CALC.fabricYardage(style, w);
                                sheerTrack = w;
                            }
                        }
                    }
                    if (opaquePrice + sheerPrice > 0) pricedItemCount++;
                }
                const totalSetPrice = opaquePrice + sheerPrice;
                let summaryHtml = `ราคา: <b>${fmtTH(totalSetPrice)}</b> บ.`;
                const details = [];
                if (opaquePrice > 0) details.push(`ทึบ: ${fmtTH(opaquePrice)}`);
                if (sheerPrice > 0) details.push(`โปร่ง: ${fmtTH(sheerPrice)}`);
                if (details.length > 0 && totalSetPrice > 0) summaryHtml += ` <small>(${details.join(', ')})</small>`;
                set.querySelector('[data-set-summary]').innerHTML = summaryHtml;
                roomSum += totalSetPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                let decoPrice = 0;
                if (deco.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                    const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                    const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                    const areaSqyd = w * h * SQM_TO_SQYD;
                    decoPrice = Math.round(areaSqyd * price);
                    if (decoPrice > 0) {
                        pricedItemCount++;
                        const type = deco.querySelector('[name="deco_type"]').value.trim();
                        if(type) decoCounts[type] = (decoCounts[type] || 0) + 1;
                    }
                }
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmtTH(decoPrice)}</b> บ.`;
                roomSum += decoPrice;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let totalItemPrice = 0;
                if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                    const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                    const rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                    const materialPrice = Math.round(rollsNeeded * clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value));
                    const installPrice = Math.round(rollsNeeded * clamp01(wallpaper.querySelector('[name="wallpaper_install_cost"]')?.value));
                    totalItemPrice = materialPrice + installPrice;
                    if (totalItemPrice > 0) {
                       pricedItemCount++;
                        if (Number.isFinite(rollsNeeded)) totalWallpaperRolls += rollsNeeded;
                    }
                }
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `รวม: <b>${fmtTH(totalItemPrice)}</b> บ.`;
                roomSum += totalItemPrice;
            });

            const itemCount = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
            room.querySelector('[data-room-brief]').innerHTML = `<span>${itemCount} รายการ • ${fmtTH(roomSum)} บาท</span>`;
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmtTH(grand);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

        const summaryContainer = document.querySelector(SELECTORS.detailedSummaryContainer);
        if(summaryContainer) {
            let html = '';
            if (grandOpaqueYards > 0) html += `<h4><i class="ph-bold ph-blinds"></i> ผ้าม่าน</h4><ul><li>ผ้าทึบ: <b>${fmtTH(grandOpaqueYards, 2)}</b> หลา</li><li>ผ้าโปร่ง: <b>${fmtTH(grandSheerYards, 2)}</b> หลา</li><li>รางทึบ: <b>${fmtTH(grandOpaqueTrack, 2)}</b> ม.</li><li>รางโปร่ง: <b>${fmtTH(grandSheerTrack, 2)}</b> ม.</li>${hasDoubleBracket ? `<li class="summary-note">** มีรายการที่ต้องใช้ขาสองชั้น</li>` : ''}</ul>`;
            if (Object.keys(decoCounts).length > 0) {
                 html += `<h4><i class="ph-bold ph-file-image"></i> งานตกแต่ง</h4><ul>`;
                 for (const type in decoCounts) html += `<li>${type}: <b>${decoCounts[type]}</b> ชุด</li>`;
                 html += `</ul>`;
            }
            if (totalWallpaperRolls > 0) html += `<h4><i class="ph-bold ph-paint-roller"></i> วอลเปเปอร์</h4><ul><li>จำนวนที่ต้องใช้: <b>${totalWallpaperRolls}</b> ม้วน</li></ul>`;
            summaryContainer.innerHTML = html || '<p class="empty-summary">ยังไม่มีรายการวัสดุ</p>';
        }
    }

    // [ The rest of the functions like buildPayload, saveData, loadPayload, renumber, toggleSetFabricUI, updateLockState, toggleLock, and all text summary builders should be here, they are unchanged ]

    // --- DOCUMENT EXPORT ENGINE ---

    /**
     * Generates the full HTML for the quotation document.
     * This is the central function used by all export methods.
     */
    function generateQuotationHtml(payload, options) {
        const { vatRate } = options;
        
        let subTotal = 0;
        let lineItems = [];

        payload.rooms.forEach(room => {
            if (room.is_suspended) return;
            const roomItems = [];
            
            room.sets.forEach(set => {
                if (set.is_suspended || set.width_m <= 0) return;
                const sPlus = stylePlus(set.style), hPlus = heightPlus(set.height_m);
                const opaquePrice = set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0 ? Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m) : 0;
                const sheerPrice = set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0 ? Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m) : 0;
                const totalSetPrice = opaquePrice + sheerPrice;
                if (totalSetPrice > 0) {
                    let desc = `ผ้าม่าน ${set.style} (${set.fabric_variant}) <br><small>ขนาด ${set.width_m.toFixed(2)} x ${set.height_m.toFixed(2)} ม.${set.notes ? ` - ${set.notes}`: ''}</small>`;
                    roomItems.push({ description: desc, total: totalSetPrice });
                }
            });

            room.decorations.forEach(deco => {
                if (deco.is_suspended || deco.width_m <= 0) return;
                const decoPrice = Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
                if (decoPrice > 0) {
                    let desc = `${deco.type || 'งานตกแต่ง'} <br><small>รหัส: ${deco.deco_code || '-'}, ขนาด ${deco.width_m.toFixed(2)} x ${deco.height_m.toFixed(2)} ม.</small>`;
                    roomItems.push({ description: desc, total: decoPrice });
                }
            });
            
            room.wallpapers.forEach(wp => {
                if (wp.is_suspended) return;
                const totalWidth = wp.widths.reduce((a, b) => a + b, 0);
                if (totalWidth <= 0) return;
                const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                const wpPrice = Math.round(rolls * wp.price_per_roll) + Math.round(rolls * (wp.install_cost_per_roll || 0));
                if (wpPrice > 0) {
                    let desc = `วอลเปเปอร์ <br><small>รหัส: ${wp.wallpaper_code || '-'}, สูง ${wp.height_m.toFixed(2)} ม. (ใช้ ${rolls} ม้วน)</small>`;
                    roomItems.push({ description: desc, total: wpPrice });
                }
            });

            if (roomItems.length > 0) {
                lineItems.push({ isRoomHeader: true, roomName: room.room_name || 'ไม่ระบุชื่อห้อง' });
                roomItems.forEach(item => {
                    lineItems.push(item);
                    subTotal += item.total;
                });
            }
        });

        if (subTotal === 0) return null; // No priced items

        const vatAmount = subTotal * vatRate;
        const grandTotal = subTotal + vatAmount;
        
        const today = new Date();
        const dateThai = today.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        const quoteNumber = `QT-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
        
        let tableRows = '';
        let itemNo = 1;
        lineItems.forEach(item => {
            if (item.isRoomHeader) {
                tableRows += `<tr class="pdf-room-header"><td colspan="5">ห้อง: ${item.roomName}</td></tr>`;
            } else {
                tableRows += `<tr><td class="pdf-text-center">${itemNo++}</td><td>${item.description}</td><td class="pdf-text-center">1</td><td class="pdf-text-right">${fmt(item.total, 2, true)}</td><td class="pdf-text-right">${fmt(item.total, 2, true)}</td></tr>`;
            }
        });

        const vatDisplay = vatRate > 0 ? `<tr><td colspan="2" class="pdf-label">ภาษีมูลค่าเพิ่ม ${(vatRate * 100).toFixed(0)}%</td><td class="pdf-amount">${fmt(vatAmount, 2, true)}</td></tr>` : '';

        return {
            html: `
                <div id="quotation-template">
                    <div class="pdf-container">
                        <header class="pdf-header">
                            <div class="pdf-shop-info">
                                ${SHOP_CONFIG.logoUrl ? `<img src="${SHOP_CONFIG.logoUrl}" alt="Logo" class="pdf-logo">` : ''}
                                <div class="pdf-shop-address">
                                    <strong>${SHOP_CONFIG.name}</strong><br>
                                    ${SHOP_CONFIG.address.replace(/\n/g, '<br>')}<br>
                                    โทร: ${SHOP_CONFIG.phone} | เลขประจำตัวผู้เสียภาษี: ${SHOP_CONFIG.taxId}
                                </div>
                            </div>
                            <div class="pdf-quote-details">
                                <div class="pdf-title-box"><h1>ใบเสนอราคา</h1></div>
                                <table class="pdf-quote-meta">
                                    <tr><td>เลขที่:</td><td>${quoteNumber}</td></tr>
                                    <tr><td>วันที่:</td><td>${dateThai}</td></tr>
                                </table>
                            </div>
                        </header>
                        <section class="pdf-customer-details">
                            <div class="pdf-customer-info">
                                <strong>ลูกค้า:</strong> ${payload.customer_name || ''}<br>
                                <strong>ที่อยู่:</strong> ${payload.customer_address.replace(/\n/g, '<br>') || ''}<br>
                                <strong>โทร:</strong> ${payload.customer_phone || ''}
                            </div>
                            <div class="pdf-customer-meta">
                                <strong>เงื่อนไขชำระเงิน:</strong> ${SHOP_CONFIG.pdf.paymentTerms}<br>
                                <strong>ยืนราคา:</strong> ${SHOP_CONFIG.pdf.priceValidity}
                            </div>
                        </section>
                        <table class="pdf-items-table">
                            <thead><tr><th style="width:5%;">ลำดับ</th><th style="width:50%;">รายการ</th><th style="width:10%;">จำนวน</th><th style="width:17.5%;">ราคา/หน่วย</th><th style="width:17.5%;">รวม (บาท)</th></tr></thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                        <section class="pdf-summary-section">
                            <div class="pdf-amount-in-words">
                                <strong>หมายเหตุ:</strong>
                                <ul>${SHOP_CONFIG.pdf.notes.map(n => `<li>${n}</li>`).join('')}</ul>
                                <div class="pdf-amount-text">( ${bahttext(grandTotal)} )</div>
                            </div>
                            <div class="pdf-totals-block">
                                <table>
                                    <tr><td colspan="2" class="pdf-label">รวมเป็นเงิน</td><td class="pdf-amount">${fmt(subTotal, 2, true)}</td></tr>
                                    ${vatDisplay}
                                    <tr class="pdf-grand-total"><td colspan="2" class="pdf-label">ยอดรวมสุทธิ</td><td class="pdf-amount">${fmt(grandTotal, 2, true)}</td></tr>
                                </table>
                            </div>
                        </section>
                        <footer class="pdf-footer-section">
                            <div class="pdf-signature-box"><p>.................................................</p><p>ผู้เสนอราคา</p><p>(${SHOP_CONFIG.name})</p><p>วันที่: ${dateThai}</p></div>
                            <div class="pdf-signature-box"><p>.................................................</p><p>ลูกค้า / ผู้มีอำนาจลงนาม</p><p>&nbsp;</p><p>วันที่: ......./......./............</p></div>
                        </footer>
                    </div>
                </div>`,
            fileName: `${quoteNumber}_${payload.customer_name.trim().replace(/\s+/g, '-') || 'quote'}`
        };
    }
    
    /**
     * Export Method 1: Direct PDF download using html2pdf.js
     */
    async function exportDirectPdf(htmlContent, fileName) {
        showToast('กำลังสร้าง PDF... (วิธีที่ 1)', 'default');
        
        const element = document.createElement('div');
        element.innerHTML = htmlContent;
        
        const opt = {
            margin: [10, 5, 15, 5], filename: `${fileName}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Delay to ensure rendering completes, preventing blank pages
        setTimeout(async () => {
            try {
                await html2pdf().from(element).set(opt).toPdf().get('pdf').then(pdf => {
                    const totalPages = pdf.internal.getNumberOfPages();
                    for (let i = 1; i <= totalPages; i++) {
                        pdf.setPage(i);
                        pdf.setFontSize(8);
                        pdf.setTextColor('#6c757d');
                        pdf.text(`${SHOP_CONFIG.name} | โทร: ${SHOP_CONFIG.phone}`, opt.margin[3], 297 - 8, { align: 'left' });
                        pdf.text(`หน้า ${i} / ${totalPages}`, 210 - opt.margin[1], 297 - 8, { align: 'right' });
                    }
                }).save();
                showToast('สร้าง PDF สำเร็จ!', 'success');
            } catch (error) {
                console.error("Direct PDF Export Error:", error);
                showToast('เกิดข้อผิดพลาด! ลองใช้วิธีที่ 2', 'error');
            }
        }, PDF_EXPORT_DELAY_MS);
    }
    
    /**
     * Export Method 2: Use the browser's native print-to-PDF functionality
     */
    function exportWithBrowserPrint(htmlContent) {
        showToast('กำลังเตรียมพิมพ์... (วิธีที่ 2)', 'default');
        const container = document.querySelector(SELECTORS.printableContent);
        container.innerHTML = htmlContent;
        
        // Use timeout to ensure DOM is updated before print command
        setTimeout(() => {
            window.print();
            // Clean up is not strictly necessary but good practice
            setTimeout(() => { container.innerHTML = ''; }, 1000);
        }, 100);
    }

    /**
     * Export Method 3: Download the content as a self-contained HTML file
     */
    function exportAsHtmlFile(htmlContent, fileName) {
        showToast('กำลังสร้างไฟล์ HTML... (วิธีที่ 3)', 'default');
        const fullHtml = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>ใบเสนอราคา - ${fileName}</title><style>${Array.from(document.styleSheets[0].cssRules).map(r => r.cssText).join('')}</style></head><body>${htmlContent}</body></html>`;
        const blob = new Blob([fullHtml], { type: 'text/html' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${fileName}.html`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('ดาวน์โหลด HTML สำเร็จ!', 'success');
    }

    // --- EVENT LISTENERS & INITIALIZATION ---
    function init() {
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const fileImporter = document.querySelector(SELECTORS.fileImporter);

        const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); }, 150);
        orderForm.addEventListener("input", debouncedRecalcAndSave);
        orderForm.addEventListener("change", e => {
            if (e.target.matches('select[name="fabric_variant"]')) toggleSetFabricUI(e.target.closest(SELECTORS.set));
            debouncedRecalcAndSave();
        });

        document.querySelector(SELECTORS.exportPdfBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            menuDropdown.classList.remove('show');
            const options = await showExportOptionsModal();
            if (!options) return; // User cancelled

            const payload = buildPayload();
            const vatRate = options.vatOption === 'include' ? SHOP_CONFIG.baseVatRate : 0;
            
            const quotation = generateQuotationHtml(payload, { vatRate });

            if (!quotation) {
                showToast('ไม่มีรายการที่มีราคาสำหรับสร้างเอกสาร', 'warning');
                return;
            }

            if (options.exportMethod === 'direct') {
                exportDirectPdf(quotation.html, quotation.fileName);
            } else if (options.exportMethod === 'print') {
                exportWithBrowserPrint(quotation.html);
            } else if (options.exportMethod === 'html') {
                exportAsHtmlFile(quotation.html, quotation.fileName);
            }
        });

        // [ All other event listeners like 'click' for actions, menu toggles, import/export should be here, they are mostly unchanged ]
        // [ The 'init' function should be completed with the rest of the event listeners from the previous version ]
        
        // Final part of init
        try {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) loadPayload(JSON.parse(storedData));
            else addRoom();
        } catch(err) {
            console.error("Failed to load from localStorage:", err);
            localStorage.removeItem(STORAGE_KEY);
            addRoom();
        }
        recalcAll();
        updateLockState();
    }

    document.addEventListener('DOMContentLoaded', init);
})();