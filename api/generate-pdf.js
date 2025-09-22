const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

// --- Calculation Logic & Constants (Mirrored from Frontend) ---
const SQM_TO_SQYD = 1.19599;
const CALC = {
    wallpaperRolls: (totalWidth, height) => {
        if (totalWidth <= 0 || height <= 0) return 0;
        const stripsPerRoll = (height > 2.5) ? Math.floor(10 / height) : 3;
        if (stripsPerRoll <= 0) return Infinity;
        const stripsNeeded = Math.ceil(totalWidth / 0.53);
        return Math.ceil(stripsNeeded / stripsPerRoll);
    }
};

// --- Utility Functions ---
const fmt = (n, fixed = 2, asCurrency = false) => {
    if (!Number.isFinite(n)) return "0";
    const options = {
        minimumFractionDigits: asCurrency ? 2 : fixed,
        maximumFractionDigits: asCurrency ? 2 : fixed
    };
    return n.toLocaleString('en-US', options);
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


// --- Main HTML Generation Function ---
const generateHTML = (data) => {
    const { payload, shopConfig, quoteNumber, dateThai } = data;

    let tableRows = '';
    let itemNo = 1;
    let subTotal = 0;

    payload.rooms.forEach(room => {
        if (room.is_suspended) return;

        const activeSets = room.sets.filter(s => !s.is_suspended && s.width_m > 0 && s.height_m > 0 && (s.price_per_m_raw > 0 || s.sheer_price_per_m > 0));
        const activeDecos = room.decorations.filter(d => !d.is_suspended && d.width_m > 0 && d.height_m > 0 && d.price_sqyd > 0);
        const activeWps = room.wallpapers.filter(w => !w.is_suspended && w.height_m > 0 && w.price_per_roll > 0 && w.widths.reduce((a, b) => a + b, 0) > 0);

        if (activeSets.length === 0 && activeDecos.length === 0 && activeWps.length === 0) return;

        let roomContent = '';
        const roomName = room.room_name || 'ไม่ระบุชื่อห้อง';

        // 1. Process Curtain Sets
        activeSets.forEach(set => {
            const sPlus = ({ "ลอน": 200, "ตาไก่": 0, "จีบ": 0 })[set.style] || 0;
            let hPlus = 0;
            if (set.height_m > 3.2) hPlus = 300;
            else if (set.height_m > 2.8) hPlus = 200;
            else if (set.height_m > 2.5) hPlus = 100;

            const opaquePrice = set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0 ? Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m) : 0;
            const sheerPrice = set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0 ? Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m) : 0;
            const totalSetPrice = opaquePrice + sheerPrice;

            if (totalSetPrice > 0) {
                let desc = `<b>ผ้าม่าน (${set.style}, ${set.fabric_variant})</b><br><small>ขนาด ${set.width_m.toFixed(2)} x ${set.height_m.toFixed(2)} ม. ${set.notes ? `- ${set.notes}` : ''}</small>`;
                roomContent += `<tr><td class="pdf-text-center">${itemNo++}</td><td>${desc}</td><td class="pdf-text-center">1 ชุด</td><td class="pdf-text-right">${fmt(totalSetPrice, 2, true)}</td><td class="pdf-text-right">${fmt(totalSetPrice, 2, true)}</td></tr>`;
                subTotal += totalSetPrice;
            }
        });

        // 2. Process Decorations
        activeDecos.forEach(deco => {
            const areaSqyd = deco.width_m * deco.height_m * SQM_TO_SQYD;
            const decoPrice = Math.round(areaSqyd * deco.price_sqyd);
            if (decoPrice > 0) {
                 let desc = `<b>${deco.type || 'ของตกแต่ง'}</b><br><small>ขนาด ${deco.width_m.toFixed(2)} x ${deco.height_m.toFixed(2)} ม. ${deco.deco_notes ? `- ${deco.deco_notes}` : ''}</small>`;
                 roomContent += `<tr><td class="pdf-text-center">${itemNo++}</td><td>${desc}</td><td class="pdf-text-center">${fmt(areaSqyd, 2)} ตร.หลา</td><td class="pdf-text-right">${fmt(deco.price_sqyd, 2, true)}</td><td class="pdf-text-right">${fmt(decoPrice, 2, true)}</td></tr>`;
                 subTotal += decoPrice;
            }
        });

        // 3. Process Wallpapers
        activeWps.forEach(wp => {
            const totalWidth = wp.widths.reduce((a, b) => a + b, 0);
            const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
            const materialPrice = Math.round(rolls * wp.price_per_roll);
            const installPrice = Math.round(rolls * (wp.install_cost_per_roll || 0));
            const wpPrice = materialPrice + installPrice;
             if (wpPrice > 0) {
                let desc = `<b>วอลเปเปอร์</b><br><small>รหัส ${wp.wallpaper_code || '-'}, รวม ${rolls} ม้วน ${wp.wallpaper_notes ? `- ${wp.wallpaper_notes}` : ''}</small>`;
                 roomContent += `<tr><td class="pdf-text-center">${itemNo++}</td><td>${desc}</td><td class="pdf-text-center">${rolls} ม้วน</td><td class="pdf-text-right">${fmt(wp.price_per_roll, 2, true)}</td><td class="pdf-text-right">${fmt(wpPrice, 2, true)}</td></tr>`;
                subTotal += wpPrice;
            }
        });

        if (roomContent) {
            tableRows += `<tr class="pdf-room-header"><td colspan="5">ห้อง: ${roomName}</td></tr>${roomContent}`;
        }
    });

    const vatAmount = subTotal * shopConfig.vatRate;
    const grandTotal = subTotal + vatAmount;
    const vatDisplay = shopConfig.vatRate > 0 ? `<tr><td class="pdf-label">ภาษีมูลค่าเพิ่ม ${(shopConfig.vatRate * 100).toFixed(0)}%</td><td class="pdf-amount">${fmt(vatAmount, 2, true)}</td></tr>` : '';
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
                .pdf-container { width: 100%; display: flex; flex-direction: column; } .pdf-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8mm; border-bottom: 3px solid var(--primary); padding-bottom: 5mm; } .pdf-shop-info { display: flex; align-items: flex-start; gap: 4mm; } .pdf-logo { max-width: 60px; max-height: 60px; object-fit: contain; } .pdf-shop-address { font-size: 9pt; line-height: 1.4; } .pdf-quote-details { text-align: right; flex-shrink: 0; } .pdf-title-box { background-color: var(--primary); color: var(--on-primary); padding: 2mm 5mm; margin-bottom: 2mm; display: inline-block;} .pdf-title-box h1 { font-size: 14pt; color: inherit; font-weight: 700; margin:0; } .pdf-quote-meta { font-size: 10pt; border-collapse: collapse; margin-left: auto; } .pdf-quote-meta td { padding: 1mm 0 1mm 2mm; } .pdf-quote-meta td:first-child { font-weight: bold; } .pdf-customer-details { display: flex; justify-content: space-between; padding: 4mm; border: 1px solid var(--outline-variant); margin-bottom: 8mm; font-size: 9pt; } .pdf-customer-info { flex-basis: 60%; } .pdf-customer-meta { flex-basis: 35%; text-align: right; } .pdf-items-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; } .pdf-items-table th, .pdf-items-table td { border: 1px solid #ccc; padding: 2.5mm 2mm; vertical-align: top; line-height: 1.4; } .pdf-items-table thead { display: table-header-group; } .pdf-items-table thead th { background-color: var(--primary); color: var(--on-primary); font-weight: bold; text-align: center; } .pdf-items-table tbody tr { page-break-inside: avoid; } .pdf-items-table td small { color: #555; font-size: 8pt; } .pdf-room-header td { background-color: #f2f2f2; font-weight: bold; color: var(--primary); } .pdf-text-center { text-align: center; } .pdf-text-right { text-align: right; } .pdf-summary-section { display: flex; justify-content: space-between; align-items: flex-start; padding-top: 5mm; border-top: 1px solid #ccc; page-break-inside: avoid; } .pdf-amount-in-words { flex-basis: 55%; font-size: 9pt; } .pdf-amount-in-words ul { padding-left: 5mm; margin: 2mm 0; } .pdf-amount-in-words li { margin-bottom: 1mm; } .pdf-amount-text { background-color: #f2f2f2; padding: 2mm; text-align: center; font-weight: bold; margin-top: 3mm; } .pdf-totals-block { flex-basis: 40%; } .pdf-totals-block table { width: 100%; border-collapse: collapse; font-size: 10pt; } .pdf-totals-block .pdf-label { text-align: right; padding: 2.5mm; width: 60%; } .pdf-totals-block .pdf-amount { text-align: right; padding: 2.5mm; border: 1px solid #ccc; background-color: #f9f9f9; } .pdf-grand-total .pdf-label { font-weight: bold; } .pdf-grand-total .pdf-amount { background-color: var(--primary); color: var(--on-primary); font-weight: bold; font-size: 11pt; } .pdf-footer-section { display: flex; justify-content: space-between; text-align: center; font-size: 9pt; margin-top: 10mm; border-top: 3px solid var(--primary); padding-top: 5mm; page-break-inside: avoid; } .pdf-signature-box { flex-basis: 48%; } .pdf-signature-box p { margin: 1mm 0; } .pdf-signature-box p:first-child { margin-top: 15mm; }
            </style>
        </head>
        <body>
            <div class="pdf-container">
                <header class="pdf-header">
                    <div class="pdf-shop-info">
                        ${logoHtml}
                        <div class="pdf-shop-address">
                            <strong>${shopConfig.name}</strong><br>
                            ${shopConfig.address}<br>
                            โทร: ${shopConfig.phone}<br>
                            เลขประจำตัวผู้เสียภาษี: ${shopConfig.taxId}
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
                        <strong>เรียน:</strong> ${payload.customer_name || 'ลูกค้า'}<br>
                        <strong>ที่อยู่:</strong> ${payload.customer_address || '-'}<br>
                        <strong>โทรศัพท์:</strong> ${payload.customer_phone || '-'}
                    </div>
                </section>
                <table class="pdf-items-table">
                    <thead><tr><th style="width: 5%;">ลำดับ</th><th style="width: 45%;">รายการ</th><th style="width: 15%;">จำนวน</th><th style="width: 15%;">ราคา/หน่วย</th><th style="width: 20%;">จำนวนเงิน</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
                <section class="pdf-summary-section">
                    <div class="pdf-amount-in-words">
                        <strong>เงื่อนไข:</strong>
                        <ul><li>ยืนราคา 30 วัน</li><li>ชำระมัดจำ 50% ก่อนเริ่มงาน</li><li>ส่วนที่เหลือชำระวันติดตั้งงาน</li></ul>
                        <div class="pdf-amount-text">(${bahttext(grandTotal)})</div>
                    </div>
                    <div class="pdf-totals-block">
                        <table>
                            <tr><td class="pdf-label">รวมเป็นเงิน</td><td class="pdf-amount">${fmt(subTotal, 2, true)}</td></tr>
                            ${vatDisplay}
                            <tr class="pdf-grand-total"><td class="pdf-label">ยอดรวมสุทธิ</td><td class="pdf-amount">${fmt(grandTotal, 2, true)}</td></tr>
                        </table>
                    </div>
                </section>
                <footer class="pdf-footer-section">
                    <div class="pdf-signature-box"><p>....................................................</p><p>( ${payload.customer_name || 'ลูกค้า'} )</p><p>ผู้ว่าจ้าง</p></div>
                    <div class="pdf-signature-box"><p>....................................................</p><p>( ณัฐวุฒิ ศรีวิเศษ )</p><p>ผู้เสนอราคา</p></div>
                </footer>
            </div>
        </body>
        </html>`;
};

// --- Netlify Function Handler ---
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let browser = null;
    try {
        const { payload, shopConfig } = JSON.parse(event.body);

        // Prepare data for the template
        const today = new Date();
        const quoteNumber = `QT-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
        const dateThai = today.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

        const html = generateHTML({ payload, shopConfig, quoteNumber, dateThai });

        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' }
        });

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${quoteNumber}.pdf"`
            },
            body: pdf.toString('base64'),
            isBase64Encoded: true,
        };

    } catch (error) {
        console.error('Error generating PDF:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `Failed to generate PDF: ${error.message}` }),
        };
    } finally {
        if (browser !== null) {
            await browser.close();
        }
    }
};
