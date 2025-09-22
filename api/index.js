const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

// ----- นำโค้ดจาก template.js มาใส่ตรงนี้เลย -----
// Utility functions
const fmt = (n, fixed = 2, asCurrency = false) => {
    if (!Number.isFinite(n)) return "0";
    const options = { minimumFractionDigits: asCurrency ? 2 : fixed, maximumFractionDigits: asCurrency ? 2 : fixed };
    return n.toLocaleString('en-US', options);
};

function bahttext(num) {
    // ... (โค้ดฟังก์ชัน bahttext ทั้งหมด)
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
                    output += convert(strN.substring(0, i + 1)) + 'ล้าน';
                    return output + convert(strN.substring(i + 1));
                }
                output += txtNumArr[digit] + txtDigitArr[strN.length - i - 1];
            }
        }
        return output;
    }
    let bahtTxt = convert(integerPart);
    bahtTxt = bahtTxt.replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด') + 'บาท';
    if (satang > 0) {
        let satangTxt = convert(satang);
        satangTxt = satangTxt.replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด');
        bahtTxt += satangTxt + 'สตางค์';
    } else {
        bahtTxt += 'ถ้วน';
    }
    return bahtTxt;
}

const generateHTML = (data) => {
    // ... (โค้ดฟังก์ชัน generateHTML ทั้งหมด)
     const { payload, shopConfig, quoteNumber, dateThai } = data;
        const SQM_TO_SQYD = 1.19599;

        let tableRows = '';
        let itemNo = 1;
        let subTotal = 0;

        payload.rooms.forEach(room => {
            if (room.is_suspended) return;
            const roomName = room.room_name || 'ไม่ระบุชื่อห้อง';
            let roomContent = '';
            let roomHasPricedItems = false;
            // Calculations for room items (sets, decos, wallpapers)
            room.sets.forEach(set => {
                if (set.is_suspended || !(set.width_m > 0 && set.height_m > 0)) return;
                 const sPlus = ({"ลอน": 200, "ตาไก่": 0, "จีบ": 0})[set.style] || 0;
                 let hPlus = 0;
                 if (set.height_m > 3.2) hPlus = 300; else if (set.height_m > 2.8) hPlus = 200; else if (set.height_m > 2.5) hPlus = 100;

                const opaquePrice = set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0 ? Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m) : 0;
                const sheerPrice = set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0 ? Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m) : 0;
                const totalSetPrice = opaquePrice + sheerPrice;
                
                if (totalSetPrice > 0) {
                    let desc = `ผ้าม่าน ${set.style} (${set.fabric_variant}) <br><small>ขนาด ${set.width_m.toFixed(2)} x ${set.height_m.toFixed(2)} ม. ${set.notes ? `- ${set.notes}`:''}</small>`;
                    roomContent += `<tr><td class="pdf-text-center">${itemNo++}</td><td>${desc}</td><td class="pdf-text-center">1</td><td class="pdf-text-right">${fmt(totalSetPrice, 2, true)}</td><td class="pdf-text-right">${fmt(totalSetPrice, 2, true)}</td></tr>`;
                    subTotal += totalSetPrice;
                    roomHasPricedItems = true;
                }
            });
            // Add similar loops for decorations and wallpapers
             if (roomHasPricedItems) {
                tableRows += `<tr class="pdf-room-header"><td colspan="5">ห้อง: ${roomName}</td></tr>${roomContent}`;
            }
        });

        const vatAmount = subTotal * shopConfig.vatRate;
        const grandTotal = subTotal + vatAmount;
        const vatDisplay = shopConfig.vatRate > 0 ? `<tr><td colspan="2" class="pdf-label">ภาษีมูลค่าเพิ่ม ${(shopConfig.vatRate * 100).toFixed(0)}%</td><td class="pdf-amount">${fmt(vatAmount, 2, true)}</td></tr>` : '';
        const logoHtml = shopConfig.logoUrl ? `<img src="${shopConfig.logoUrl}" alt="Logo" class="pdf-logo">` : '';

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700&display=swap" rel="stylesheet">
                <style>
                    :root { --primary: #543D49; --on-primary: #FFFFFF; --outline-variant: #BCC2CB; }
                    body { font-family: 'Noto Sans Thai', sans-serif; color: #333; font-size: 10pt; background-color: #fff; margin: 0;}
                    #quotation-template { padding: 0; }
                    .pdf-container { width: 100%; display: flex; flex-direction: column; } .pdf-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8mm; border-bottom: 3px solid var(--primary); padding-bottom: 5mm; } .pdf-shop-info { display: flex; align-items: flex-start; gap: 4mm; } .pdf-logo { max-width: 60px; max-height: 60px; object-fit: contain; } .pdf-shop-address { font-size: 9pt; line-height: 1.4; } .pdf-quote-details { text-align: right; flex-shrink: 0; } .pdf-title-box { background-color: var(--primary); color: var(--on-primary); padding: 2mm 5mm; margin-bottom: 2mm; display: inline-block;} .pdf-title-box h1 { font-size: 14pt; color: inherit; font-weight: 700; margin:0; } .pdf-quote-meta { font-size: 10pt; border-collapse: collapse; margin-left: auto; } .pdf-quote-meta td { padding: 1mm 0 1mm 2mm; } .pdf-quote-meta td:first-child { font-weight: bold; } .pdf-customer-details { display: flex; justify-content: space-between; padding: 4mm; border: 1px solid var(--outline-variant); margin-bottom: 8mm; font-size: 9pt; } .pdf-customer-info { flex-basis: 60%; } .pdf-customer-meta { flex-basis: 35%; text-align: right; } .pdf-items-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; } .pdf-items-table th, .pdf-items-table td { border: 1px solid #ccc; padding: 2.5mm 2mm; vertical-align: top; line-height: 1.4; } .pdf-items-table thead { display: table-header-group; } .pdf-items-table thead th { background-color: var(--primary); color: var(--on-primary); font-weight: bold; text-align: center; } .pdf-items-table tbody tr { page-break-inside: avoid; } .pdf-items-table td small { color: #555; font-size: 8pt; } .pdf-room-header td { background-color: #f2f2f2; font-weight: bold; color: var(--primary); } .pdf-text-center { text-align: center; } .pdf-text-right { text-align: right; } .pdf-summary-section { display: flex; justify-content: space-between; align-items: flex-start; padding-top: 5mm; border-top: 1px solid #ccc; page-break-inside: avoid; } .pdf-amount-in-words { flex-basis: 55%; font-size: 9pt; } .pdf-amount-in-words ul { padding-left: 5mm; margin: 2mm 0; } .pdf-amount-in-words li { margin-bottom: 1mm; } .pdf-amount-text { background-color: #f2f2f2; padding: 2mm; text-align: center; font-weight: bold; margin-top: 3mm; } .pdf-totals-block { flex-basis: 40%; } .pdf-totals-block table { width: 100%; border-collapse: collapse; font-size: 10pt; } .pdf-totals-block .pdf-label { text-align: right; padding: 2.5mm; width: 60%; } .pdf-totals-block .pdf-amount { text-align: right; padding: 2.5mm; border: 1px solid #ccc; background-color: #f9f9f9; } .pdf-grand-total .pdf-label { font-weight: bold; } .pdf-grand-total .pdf-amount { background-color: var(--primary); color: var(--on-primary); font-weight: bold; font-size: 11pt; } .pdf-footer-section { display: flex; justify-content: space-between; text-align: center; font-size: 9pt; margin-top: 10mm; border-top: 3px solid var(--primary); padding-top: 5mm; page-break-inside: avoid; } .pdf-signature-box { flex-basis: 48%; } .pdf-signature-box p { margin: 1mm 0; } .pdf-signature-box p:first-child { margin-top: 15mm; }
                </style>
            </head>
            <body><div id="quotation-template">...</div></body>
            </html>
        `;
};
// ----- สิ้นสุดส่วนที่ย้ายมา -----

// Your Shop Config
const SHOP_CONFIG = {
    // ... (เหมือนเดิม)
};

// The main function handler
module.exports = async (req, res) => {
    // ... (โค้ดส่วน handler เหมือนเดิม)
};