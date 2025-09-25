// --- DOCUMENT & TEXT SUMMARY GENERATION ---
import { SHOP_CONFIG, SQM_TO_SQYD } from './config.js';
import { bahttext, fmt, fmtTH } from './utils.js';
import { stylePlus, heightPlus, CALC } from './calculations.js';

// --- TEXT SUMMARY ENGINE ---
export function generateSummaryText(payload, type) {
    const grandTotal = payload.rooms.reduce((roomSum, room) => {
        if (room.is_suspended) return roomSum;
        const setsTotal = room.sets.reduce((sum, set) => {
            if (set.is_suspended || set.width_m <= 0) return sum;
            const sPlus = stylePlus(set.style), hPlus = heightPlus(set.height_m);
            const opaquePrice = set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0 ? Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m) : 0;
            const sheerPrice = set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0 ? Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m) : 0;
            return sum + opaquePrice + sheerPrice;
        }, 0);
        const decosTotal = room.decorations.reduce((sum, deco) => {
            if (deco.is_suspended || deco.width_m <= 0) return sum;
            return sum + Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
        }, 0);
        const wpsTotal = room.wallpapers.reduce((sum, wp) => {
             if (wp.is_suspended) return sum;
             const totalWidth = wp.widths.reduce((a, b) => a + b, 0);
             if (totalWidth <= 0) return sum;
             const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
             return sum + Math.round(rolls * wp.price_per_roll) + Math.round(rolls * (wp.install_cost_per_roll || 0));
        }, 0);
        return roomSum + setsTotal + decosTotal + wpsTotal;
    }, 0);

    let text = `สรุปข้อมูล (${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'numeric', year: 'numeric' })})\n`;
    text += `ลูกค้า: ${payload.customer_name || '-'}\n`;
    if (type === 'customer' || type === 'owner') {
        text += `เบอร์โทร: ${payload.customer_phone || '-'}\n`;
        text += `ที่อยู่: ${payload.customer_address || '-'}\n`;
    }
    text += '------------------------------\n';

    if (type === 'customer') {
        text += `\nสรุปรายการ\n`;
        payload.rooms.forEach(room => {
            if (room.is_suspended) return;
            const activeItems = [...room.sets, ...room.decorations, ...room.wallpapers].filter(i => !i.is_suspended && (i.width_m > 0 || (i.widths && i.widths.reduce((a, b) => a + b, 0) > 0)));
            if (activeItems.length === 0) return;

            text += `\n*ห้อง: ${room.room_name || 'ไม่ระบุ'}*\n`;
            let itemCount = 0;
            room.sets.forEach(set => {
                if (set.is_suspended || set.width_m <= 0) return;
                itemCount++;
                text += ` ${itemCount}) ผ้าม่าน ${set.style} (${set.fabric_variant})\n`;
            });
            room.decorations.forEach(deco => {
                if (deco.is_suspended || deco.width_m <= 0) return;
                itemCount++;
                text += ` ${itemCount}) ${deco.type || 'ของตกแต่ง'}\n`;
            });
            room.wallpapers.forEach(wp => {
                if (wp.is_suspended || wp.widths.reduce((a, b) => a + b, 0) <= 0) return;
                itemCount++;
                text += ` ${itemCount}) วอลเปเปอร์\n`;
            });
        });

        text += '------------------------------\n';
        text += `\nสรุปยอดรวม: ${fmtTH(grandTotal)} บาท\n`;
        text += `\nขอบคุณที่ใช้บริการ\n${SHOP_CONFIG.name}\nโทร: ${SHOP_CONFIG.phone}`;
        return text;
    }

    if (type === 'purchase_order' || type === 'owner') {
        const materials = {
            opaqueFabrics: [],
            sheerFabrics: [],
            decorations: [],
            wallpapers: [],
            allSets: []
        };

        payload.rooms.forEach(room => {
            if (room.is_suspended) return;
            room.sets.forEach(set => {
                if (set.is_suspended || set.width_m <= 0) return;
                 materials.allSets.push(set);
                if (set.fabric_variant.includes('ทึบ')) {
                    materials.opaqueFabrics.push({
                        code: set.fabric_code || '??',
                        yards: CALC.fabricYardage(set.style, set.width_m)
                    });
                }
                if (set.fabric_variant.includes('โปร่ง')) {
                    materials.sheerFabrics.push({
                        code: set.sheer_fabric_code || '??',
                        yards: CALC.fabricYardage(set.style, set.width_m)
                    });
                }
            });
            room.decorations.forEach(deco => {
                if (deco.is_suspended || !deco.type || deco.width_m <= 0) return;
                materials.decorations.push({
                    type: deco.type,
                    code: deco.deco_code || 'xxx',
                    width: deco.width_m,
                    height: deco.height_m
                });
            });
            room.wallpapers.forEach(wp => {
                if (wp.is_suspended) return;
                const totalWidth = wp.widths.reduce((a, b) => a + b, 0);
                if (totalWidth > 0) {
                    const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                    if (rolls > 0) {
                       materials.wallpapers.push({
                            code: wp.wallpaper_code || 'xxx',
                            rolls: rolls
                       });
                    }
                }
            });
        });

        text += '📋 *สรุปวัสดุสำหรับสั่งซื้อผ้า*\n';
        text += '------------------------------\n';
        if (materials.opaqueFabrics.length > 0) {
            materials.opaqueFabrics.forEach(f => {
                text += `- ผ้าทึบ (Curtain Fabric)\n`;
                text += `รหัส: #${f.code || '??'}\n`;
                text += `จำนวน: ${f.yards.toFixed(2)} หลา\n\n`;
            });
        }
        if (materials.sheerFabrics.length > 0) {
             materials.sheerFabrics.forEach(f => {
                text += `- ผ้าโปร่ง (Sheer Fabric)\n`;
                text += `รหัส: #${f.code || '??'}\n`;
                text += `จำนวน: ${f.yards.toFixed(2)} หลา\n\n`;
            });
        }

        text += '------------------------------\n';
        text += '📋 *สำหรับสั่งซื้อ ราง*\n';
        text += '------------------------------\n\n';
        if (materials.allSets.length > 0) {
            let trackSetCounter = 1;
            materials.allSets.forEach(set => {
                text += `(${trackSetCounter++}) รางม่าน: ${set.style}, สี: ${set.track_color}\n`;
                if (set.fabric_variant.includes('ทึบ')) {
                    text += `  - รางทึบ: ${set.width_m.toFixed(2)} ม. (1 เส้น)\n`;
                }
                if (set.fabric_variant.includes('โปร่ง')) {
                    text += `  - รางโปร่ง: ${set.width_m.toFixed(2)} ม. (1 เส้น)\n`;
                }
                if (set.fabric_variant === 'ทึบ&โปร่ง') {
                    text += `  (❗️ต้องใช้ขาสองชั้น)\n`;
                }
                text += `\n`;
            });
        }

        text += '------------------------------\n';
        text += '📋 *สำหรับสั่งซื้อ Blind*\n';
        text += '------------------------------\n\n';
        if (materials.decorations.length > 0) {
            const decoTypeMap = {
                "มู่ลี่ไม้": "Wooden Blind",
                "ม่านม้วน": "Roller Blind",
                "ปรับแสง": "Vertical Blind",
                "ฉากกั้นห้อง": "Partition",
                "มุ้งจีบ": "Pleated Insect Screen",
                "มู่ลี่มิเนียม": "Aluminium Blind"
            };
            materials.decorations.forEach(d => {
                const englishType = decoTypeMap[d.type] ? ` (${decoTypeMap[d.type]})` : '';
                text += `- ${d.type}${englishType}\n`;
                text += `รหัส: #${d.code || 'xxx'}\n`;
                text += `ขนาด: ${d.width.toFixed(2)} x ${d.height.toFixed(2)} m.\n`;
                text += `จำนวน: 1 ชุด\n\n`;
            });
        }

        text += '------------------------------\n';
        text += '📋 *สำหรับสั่งซื้อ Wallpaper*\n';
        text += '------------------------------\n\n';
        if (materials.wallpapers.length > 0) {
            materials.wallpapers.forEach(w => {
                text += `- วอลเปเปอร์ -\n`;
                text += `รหัส: #${w.code || 'xxx'}\n`;
                text += `จำนวน: ${w.rolls} ม้วน\n\n`;
            });
        }

        text += '------------------------------\n';
        if (type === 'purchase_order') return text;
    }

    if (type === 'seamstress' || type === 'owner') {
        text += '\n🧵 *รายละเอียดสำหรับช่าง*\n';
        payload.rooms.forEach(room => {
            if (room.is_suspended) return;
            const activeSets = room.sets.filter(s => !s.is_suspended && s.width_m > 0);
            if (activeSets.length === 0) return;

            text += `\n*ห้อง: ${room.room_name || 'ไม่ระบุ'}*\n`;
            let itemCounter = 1;
            room.sets.forEach(s => {
                if (s.is_suspended || s.width_m <= 0) return;
                text += `${itemCounter++}) *ผ้าม่าน ${s.style} ${s.fabric_variant}*\n`;
                text += `  กว้าง ${s.width_m} x สูง ${s.height_m} ม.\n`;
                text += `  รูปแบบเปิด: ${s.opening_style}\n`;
                if (s.fabric_variant.includes('ทึบ')) text += `  ผ้าทึบ: รหัส ${s.fabric_code || '-'}\n`;
                if (s.fabric_variant.includes('โปร่ง')) text += `  ผ้าโปร่ง: รหัส ${s.sheer_fabric_code || '-'}\n`;
            });
        });
        text += '------------------------------\n';
        if (type === 'seamstress') return text;
    }

    if (type === 'owner') {
         text += `\n💰 *สรุปยอดรวม: ${fmtTH(grandTotal)} บาท*\n`;
    }

    return text;
}

// --- DOCUMENT EXPORT ENGINE ---
export function generateQuotationHtml(payload, options) {
    const { vatRate } = options;

    const lineItems = [];
    payload.rooms.forEach(room => {
        if (room.is_suspended) return;
        const roomPricedItems = [];

        room.sets.forEach(set => {
            if (set.is_suspended || set.width_m <= 0) return;
            const sPlus = stylePlus(set.style), hPlus = heightPlus(set.height_m);
            const opaquePrice = set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0 ? Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m) : 0;
            const sheerPrice = set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0 ? Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m) : 0;
            const totalSetPrice = opaquePrice + sheerPrice;
            if (totalSetPrice > 0) {
                let desc = `ผ้าม่าน ${set.style} (${set.fabric_variant}) <br><small>ขนาด ${set.width_m.toFixed(2)} x ${set.height_m.toFixed(2)} ม.${set.notes ? ` - ${set.notes}`: ''}</small>`;
                roomPricedItems.push({ description: desc, total: totalSetPrice, units: desc.includes('<br>') ? 1.5 : 1 });
            }
        });

        room.decorations.forEach(deco => {
            if (deco.is_suspended || deco.width_m <= 0) return;
            const decoPrice = Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
            if (decoPrice > 0) {
                let desc = `${deco.type || 'งานตกแต่ง'} <br><small>รหัส: ${deco.deco_code || '-'}, ขนาด ${deco.width_m.toFixed(2)} x ${deco.height_m.toFixed(2)} ม.</small>`;
                roomPricedItems.push({ description: desc, total: decoPrice, units: desc.includes('<br>') ? 1.5 : 1 });
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
                roomPricedItems.push({ description: desc, total: wpPrice, units: desc.includes('<br>') ? 1.5 : 1 });
            }
        });

        if (roomPricedItems.length > 0) {
            lineItems.push({ isRoomHeader: true, roomName: room.room_name || 'ไม่ระบุชื่อห้อง', units: 1.2 });
            lineItems.push(...roomPricedItems);
        }
    });

    const subTotal = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
    if (subTotal === 0) return null;

    const vatAmount = subTotal * vatRate;
    const grandTotal = subTotal + vatAmount;

    const UNITS_PER_FIRST_PAGE = 17;
    const UNITS_PER_SUBSEQUENT_PAGE = 23;
    const pages = [];
    let currentPageItems = [];
    let currentUnits = 0;

    lineItems.forEach(item => {
        const pageLimit = pages.length === 0 ? UNITS_PER_FIRST_PAGE : UNITS_PER_SUBSEQUENT_PAGE;
        if (currentUnits + item.units > pageLimit && currentPageItems.length > 0) {
            pages.push(currentPageItems);
            currentPageItems = [];
            currentUnits = 0;
        }
        currentPageItems.push(item);
        currentUnits += item.units;
    });
    if (currentPageItems.length > 0) pages.push(currentPageItems);

    const today = new Date();
    const dateThai = today.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    const quoteNumber = `QT-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;

    let allPagesHtml = '';
    let cumulativeTotal = 0;
    let itemNo = 1;

    pages.forEach((pageItems, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const isLastPage = pageIndex === pages.length - 1;

        const pageHeader = `
            <div class="pdf-page-header">
                <div class="pdf-header">
                    <div class="pdf-shop-info">
                        ${SHOP_CONFIG.logoUrl ? `<img src="${SHOP_CONFIG.logoUrl}" alt="Logo" class="pdf-logo">` : ''}
                        <div class="pdf-shop-address">
                            <strong>${SHOP_CONFIG.name}</strong><br>
                            ${SHOP_CONFIG.address.replace(/\n/g, '<br>')}<br>
                            โทร: ${SHOP_CONFIG.phone} | เลขประจำตัวผู้เสียภาษี: ${SHOP_CONFIG.taxId}
                        </div>
                    </div>
                    <div class="pdf-quote-details">
                        <div class="pdf-title-box"><h1>ใบเสนอราคา ${pages.length > 1 ? (isFirstPage ? '' : '(ต่อ)') : ''}</h1></div>
                        <table class="pdf-quote-meta">
                            <tr><td>เลขที่:</td><td>${quoteNumber}</td></tr>
                            <tr><td>วันที่:</td><td>${dateThai}</td></tr>
                        </table>
                    </div>
                </div>
                ${isFirstPage ? `
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
                </section>` : ''}
            </div>`;

        const pageFooter = `
            <div class="pdf-page-footer">
                <div class="pdf-footer-info">
                    <span>${SHOP_CONFIG.name} | โทร: ${SHOP_CONFIG.phone}</span>
                    <span>หน้า ${pageIndex + 1} / ${pages.length}</span>
                </div>
            </div>`;

        let tableRows = '';
        if (!isFirstPage) {
            tableRows += `<tr class="pdf-subtotal-row"><td colspan="4">ยอดยกมา (Brought Forward)</td><td class="pdf-text-right">${fmt(cumulativeTotal, 2, true)}</td></tr>`;
        }

        pageItems.forEach(item => {
            if (item.isRoomHeader) {
                tableRows += `<tr class="pdf-room-header"><td colspan="5">ห้อง: ${item.roomName}</td></tr>`;
            } else {
                tableRows += `<tr><td class="pdf-text-center">${itemNo++}</td><td>${item.description}</td><td class="pdf-text-center">1</td><td class="pdf-text-right">${fmt(item.total, 2, true)}</td><td class="pdf-text-right">${fmt(item.total, 2, true)}</td></tr>`;
                cumulativeTotal += item.total;
            }
        });

        let tableFooter = '';
        if (!isLastPage) {
            tableFooter = `<tfoot><tr class="pdf-subtotal-row"><td colspan="4">ยอดยกไป (Carried Forward)</td><td class="pdf-text-right">${fmt(cumulativeTotal, 2, true)}</td></tr></tfoot>`;
        }

        const summarySection = isLastPage ? `
            <div class="pdf-summary-wrapper">
                <section class="pdf-summary-section">
                    <div class="pdf-amount-in-words">
                        <strong>หมายเหตุ:</strong>
                        <ul>${SHOP_CONFIG.pdf.notes.map(n => `<li>${n}</li>`).join('')}</ul>
                        <div class="pdf-amount-text">( ${bahttext(grandTotal)} )</div>
                    </div>
                    <div class="pdf-totals-block">
                        <table>
                            <tr><td colspan="2" class="pdf-label">รวมเป็นเงิน</td><td class="pdf-amount">${fmt(subTotal, 2, true)}</td></tr>
                            ${vatRate > 0 ? `<tr><td colspan="2" class="pdf-label">ภาษีมูลค่าเพิ่ม ${(vatRate * 100).toFixed(0)}%</td><td class="pdf-amount">${fmt(vatAmount, 2, true)}</td></tr>` : ''}
                            <tr class="pdf-grand-total"><td colspan="2" class="pdf-label">ยอดรวมสุทธิ</td><td class="pdf-amount">${fmt(grandTotal, 2, true)}</td></tr>
                        </table>
                    </div>
                </section>
                <footer class="pdf-footer-section">
                    <div class="pdf-signature-box"><p>.................................................</p><p>ผู้เสนอราคา</p><p>(${SHOP_CONFIG.name})</p><p>วันที่: ${dateThai}</p></div>
                    <div class="pdf-signature-box"><p>.................................................</p><p>ลูกค้า / ผู้มีอำนาจลงนาม</p><p>&nbsp;</p><p>วันที่: ......./......./............</p></div>
                </footer>
            </div>
        ` : '';

        allPagesHtml += `
            <div class="pdf-page">
                <div class="pdf-page-content">
                    ${pageHeader}
                    <div class="pdf-page-body">
                        <table class="pdf-items-table">
                            <thead><tr><th style="width:5%;">ลำดับ</th><th style="width:50%;">รายการ</th><th style="width:10%;">จำนวน</th><th style="width:17.5%;">ราคา/หน่วย</th><th style="width:17.5%;">รวม (บาท)</th></tr></thead>
                            <tbody>${tableRows}</tbody>
                            ${tableFooter}
                        </table>
                        ${summarySection}
                    </div>
                    ${pageFooter}
                </div>
            </div>`;
    });

    return {
        html: `<div id="quotation-template">${allPagesHtml}</div>`,
        fileName: `${quoteNumber}_${payload.customer_name.trim().replace(/\s+/g, '-') || 'quote'}`
    };
}