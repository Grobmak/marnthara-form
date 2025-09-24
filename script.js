(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/5.5.1-stable-hotfix";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";

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

    // ======================= [FIX] UPDATED SELECTORS TO MATCH NEW HTML =======================
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
        // --- Updated Quick Navigation Selectors ---
        quickNavBtn: '#quickNavBtn',
        quickNavDropdown: '#quickNavDropdown',
        quickNavRoomList: '#quickNavRoomList',
        expandAllRoomsBtn: '#expandAllRoomsBtn',
        collapseAllRoomsBtn: '#collapseAllRoomsBtn',
    };
    // ======================= END [FIX] =======================

    let roomCount = 0;
    let isLocked = false;

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

// 8. FIX: Improved animation performance
const disableAnimationsTemporarily = (ms = 600) => {
    const body = document.body;
    if (body) {
        body.classList.add('disable-animations');
        setTimeout(() => {
            if (body) {
                body.classList.remove('disable-animations');
            }
        }, ms);
    }
};

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

// 1. FIX: Duplicate function declaration
// Keep only the complete animateAndScroll function (line ~90-95)
const animateAndScroll = (element) => {
    if (!element) return;
    // If global animations are disabled, do a direct jump.
    if (document.body.classList.contains('disable-animations')) {
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
        return;
    }
    // Smooth scroll + highlight animation with safe cleanup.
    try {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
    element.classList.add('item-created');
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        element.classList.remove('item-created');
    };
    const onEnd = () => cleanup();
    element.addEventListener('animationend', onEnd, { once: true });
    // Fallback in case animationend does not fire.
    setTimeout(cleanup, 900);
};

// 2. FIX: Incomplete animateAndRemove function
function animateAndRemove(item) {
    if (!item) return;
    
    const parentScrollTarget = item.parentElement?.closest('.card, .items-container') || document.body;
    try {
        parentScrollTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {}
    
    item.classList.add('item-removing');
    let removed = false;
    
    const doRemove = () => {
        if (removed) return;
        removed = true;
        try { 
            item.remove(); 
        } catch (e) {}
        try { 
            renumber(); 
            recalcAll(); 
            saveData(); 
        } catch (e) {}
    };
    
    const onEnd = () => doRemove();
    item.addEventListener('animationend', onEnd, { once: true });
    // Fallback timeout if animationend never fires
    setTimeout(doRemove, 700);
}

// 3. FIX: Missing closing brace in showToast function
function showToast(message, type = 'default') {
    const container = document.querySelector(SELECTORS.toastContainer);
    if (!container) return;
    
    const icons = { 
        success: 'ph-bold ph-check-circle', 
        warning: 'ph-bold ph-warning', 
        error: 'ph-bold ph-x-circle', 
        default: 'ph-bold ph-info' 
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="${icons[type] || icons.default}"></i> ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
} // <- This closing brace was missing

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
    async function showExportOptionsModal() {
        const confirmed = await showModal(SELECTORS.exportOptionsModal);
        if (!confirmed) return null;
        const modalEl = document.querySelector(SELECTORS.exportOptionsModal);
        return {
            vatOption: modalEl.querySelector('input[name="vat_option"]:checked').value,
            exportMethod: modalEl.querySelector('#exportMethod').value,
        };
    }

    // --- Core DOM Functions ---
// 6. FIX: Improved room creation with proper ID assignment
function addRoom(prefill) {
    if (isLocked) return;
    roomCount++;
    const frag = document.querySelector(SELECTORS.roomTpl)?.content?.cloneNode(true);
    if (!frag) return;
    
    const room = frag.querySelector(SELECTORS.room);
    room.dataset.index = roomCount;
    
    // Generate a unique, consistent ID
    const roomId = `room-${Date.now()}-${roomCount}`;
    room.id = roomId;
    
    document.querySelector(SELECTORS.roomsContainer).appendChild(frag);
    const created = document.querySelector(`${SELECTORS.room}:last-of-type`);

    if (prefill) {
        created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
        if (prefill.is_suspended) {
            setTimeout(() => suspendRoom(created, true, false), 0);
        }
        (prefill.sets || []).forEach(s => addSet(created, s));
        (prefill.decorations || []).forEach(d => addDeco(created, d));
        (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
    }

    renumber();
    recalcAll();
    saveData();
    if (!prefill) {
        showToast('เพิ่มห้องใหม่แล้ว', 'success');
        animateAndScroll(created);
    }
}

    function populatePriceOptions(selectEl, prices) {
        if (!selectEl) return;
        selectEl.innerHTML = `<option value="" hidden>เลือกราคา</option>`;
        prices.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p.toLocaleString("th-TH");
            selectEl.appendChild(option);
        });
    }

    function addSet(roomEl, prefill) {
        if (isLocked) return;
        const setsWrap = roomEl.querySelector(SELECTORS.setsContainer);
        const frag = document.querySelector(SELECTORS.setTpl)?.content?.cloneNode(true);
        if (!frag || !setsWrap) return;
        setsWrap.appendChild(frag);
        const created = setsWrap.querySelector(`${SELECTORS.set}:last-of-type`);

        populatePriceOptions(created.querySelector('select[name="set_price_per_m"]'), PRICING.fabric);
        populatePriceOptions(created.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);

        if (prefill) {
            created.querySelector('input[name="width_m"]').value = prefill.width_m > 0 ? prefill.width_m.toFixed(2) : "";
            created.querySelector('input[name="height_m"]').value = prefill.height_m > 0 ? prefill.height_m.toFixed(2) : "";
            created.querySelector('select[name="set_style"]').value = prefill.style || "ลอน";
            created.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
            created.querySelector('select[name="set_price_per_m"]').value = prefill.price_per_m_raw || "";
            created.querySelector('select[name="sheer_price_per_m"]').value = prefill.sheer_price_per_m || "";
            created.querySelector('input[name="fabric_code"]').value = prefill.fabric_code || "";
            created.querySelector('input[name="sheer_fabric_code"]').value = prefill.sheer_fabric_code || "";
            created.querySelector('select[name="opening_style"]').value = prefill.opening_style || "แยกกลาง";
            created.querySelector('select[name="track_color"]').value = prefill.track_color || "ขาว";
            created.querySelector('input[name="notes"]').value = prefill.notes || "";
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
             animateAndScroll(created);
        }
        toggleSetFabricUI(created);
        renumber();
        recalcAll();
        saveData();
    }

    function addDeco(roomEl, prefill) {
        if (isLocked) return;
        const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl)?.content?.cloneNode(true);
        if (!frag || !decoWrap) return;
        decoWrap.appendChild(frag);
        const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);

        if (prefill) {
            const type = prefill.type || "";
            created.querySelector('[name="deco_type"]').value = type;
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m > 0 ? prefill.width_m.toFixed(2) : "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m > 0 ? prefill.height_m.toFixed(2) : "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmtTH(prefill.price_sqyd) ?? "";
            created.querySelector('[name="deco_code"]').value = prefill.deco_code || "";
            created.querySelector('[name="deco_notes"]').value = prefill.deco_notes || "";
            const displayEl = created.querySelector('.deco-type-display');
            if (displayEl && type) {
                displayEl.textContent = `(${type})`;
            }
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
            animateAndScroll(created);
        }
        renumber();
        recalcAll();
        saveData();
    }

    function addWallpaper(roomEl, prefill) {
        if (isLocked) return;
        const wallpaperWrap = roomEl.querySelector(SELECTORS.wallpapersContainer);
        const frag = document.querySelector(SELECTORS.wallpaperTpl)?.content?.cloneNode(true);
        if (!frag || !wallpaperWrap) return;
        wallpaperWrap.appendChild(frag);
        const created = wallpaperWrap.querySelector(`${SELECTORS.wallpaperItem}:last-of-type`);

        if (prefill) {
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m > 0 ? prefill.height_m.toFixed(2) : "";
            created.querySelector('[name="wallpaper_code"]').value = prefill.wallpaper_code || "";
            created.querySelector('[name="wallpaper_price_roll"]').value = fmtTH(prefill.price_per_roll) ?? "";
            created.querySelector('[name="wallpaper_install_cost"]').value = fmtTH(prefill.install_cost_per_roll ?? 300);
            created.querySelector('[name="wallpaper_notes"]').value = prefill.wallpaper_notes || "";
            (prefill.widths || []).forEach(w => addWall(created.querySelector('[data-act="add-wall"]'), w));
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
            addWall(created.querySelector('[data-act="add-wall"]'));
            animateAndScroll(created);
        }
        renumber();
        recalcAll();
        saveData();
    }

    function addWall(btn, prefillWidth) {
        if (isLocked) return;
        const wallsContainer = btn.closest(SELECTORS.wallpaperItem)?.querySelector(SELECTORS.wallsContainer);
        const frag = document.querySelector(SELECTORS.wallTpl)?.content?.cloneNode(true);
        if (!frag || !wallsContainer) return;
        if (prefillWidth) {
            frag.querySelector('input[name="wall_width_m"]').value = prefillWidth > 0 ? prefillWidth.toFixed(2) : "";
        }
        wallsContainer.appendChild(frag);

        const newWallInputRow = wallsContainer.querySelector('.wall-input-row:last-of-type');
        if (newWallInputRow) {
            animateAndScroll(newWallInputRow);
            newWallInputRow.querySelector('input').focus();
        }
    }

    function suspendItem(item, isSuspended, notify = true) {
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        const suspendIcon = item.querySelector('[data-act="toggle-suspend"] i');
        if (suspendIcon) {
            suspendIcon.className = isSuspended ? 'ph-bold ph-play-circle' : 'ph-bold ph-pause-circle';
        }
        if (notify) showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    function suspendRoom(roomEl, isSuspended, notify = true) {
        roomEl.dataset.suspended = isSuspended;
        roomEl.classList.toggle('is-suspended', isSuspended);

        const suspendText = roomEl.querySelector('[data-act="toggle-suspend-room"] span');
        if (suspendText) {
            suspendText.textContent = isSuspended ? 'ใช้งานห้อง' : 'ระงับห้อง';
        }

        roomEl.querySelectorAll('.set-item, .deco-item, .wallpaper-item').forEach(item => {
            suspendItem(item, isSuspended, false);
        });

        if (notify) showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
        recalcAll();
        saveData();
    }

    async function performActionWithConfirmation(btn, actionConfig) {
        if (isLocked) return;
        if (actionConfig.confirm && !await showConfirmation(actionConfig.title, actionConfig.body)) return;
        const item = btn.closest(actionConfig.selector);
        if (!item) return;
        if (actionConfig.toast) showToast(actionConfig.toast, 'success');
        if (actionConfig.isRemoval) {
            actionConfig.action(item);
        } else {
            actionConfig.action(item, btn);
            renumber();
            recalcAll();
            saveData();
        }
    }

    // --- Data & Calculations ---
// 10. FIX: Ensure all selectors exist before using them
function recalcAll() {
    let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0, grandOpaqueTrack = 0, grandSheerTrack = 0;
    let totalWallpaperRolls = 0;
    let hasDoubleBracket = false;
    const decoCounts = {};
    let pricedItemCount = 0;

    document.querySelectorAll(SELECTORS.room).forEach(room => {
        let roomSum = 0;
        const isRoomSuspended = room.dataset.suspended === 'true';

        // CURTAIN SETS
        room.querySelectorAll(SELECTORS.set).forEach(set => {
            let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
            if (set.dataset.suspended !== 'true' && !isRoomSuspended) {
                const w = clamp01(set.querySelector('input[name="width_m"]')?.value);
                const h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                const style = set.querySelector('select[name="set_style"]')?.value;
                const variant = set.querySelector('select[name="fabric_variant"]')?.value;
                const sPlus = stylePlus(style);
                const hPlus = heightPlus(h);
                if(variant === "ทึบ&โปร่ง") hasDoubleBracket = true;
                if (w > 0 && h > 0) {
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
            set.querySelector('[data-set-yardage-opaque]').textContent = fmtTH(opaqueYards, 2);
            set.querySelector('[data-set-opaque-track]').textContent = fmtTH(opaqueTrack, 2);
            set.querySelector('[data-set-yardage-sheer]').textContent = fmtTH(sheerYards, 2);
            set.querySelector('[data-set-sheer-track]').textContent = fmtTH(sheerTrack, 2);
            roomSum += opaquePrice + sheerPrice;
            grandOpaqueYards += opaqueYards;
            grandSheerYards += sheerYards;
            grandOpaqueTrack += opaqueTrack;
            grandSheerTrack += sheerTrack;
        });

        // DECORATIONS
        room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
            let decoPrice = 0, areaSqyd = 0;
            if (deco.dataset.suspended !== 'true' && !isRoomSuspended) {
                const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                areaSqyd = w * h * SQM_TO_SQYD;
                decoPrice = Math.round(areaSqyd * price);
                if (decoPrice > 0) {
                    pricedItemCount++;
                    const type = deco.querySelector('[name="deco_type"]').value.trim();
                    if(type) decoCounts[type] = (decoCounts[type] || 0) + 1;
                }
            }
            deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmtTH(decoPrice)}</b> บ. • พื้นที่: <b>${fmtTH(areaSqyd, 2)}</b> ตร.หลา`;
            roomSum += decoPrice;
        });

        // WALLPAPERS
        room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
            let totalItemPrice = 0, materialPrice = 0, installPrice = 0, areaSqm = 0, rollsNeeded = 0;
            if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                const installCostPerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_install_cost"]')?.value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                areaSqm = totalWidth * h;
                rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                materialPrice = Math.round(rollsNeeded * pricePerRoll);
                installPrice = Math.round(rollsNeeded * installCostPerRoll);
                totalItemPrice = materialPrice + installPrice;
                if (totalItemPrice > 0) {
                   pricedItemCount++;
                    if (Number.isFinite(rollsNeeded)) totalWallpaperRolls += rollsNeeded;
                }
            }
            let summaryHtml = `รวม: <b>${fmtTH(totalItemPrice)}</b> บ.`;
            if (totalItemPrice > 0) summaryHtml += ` <small>(วอลล์: ${fmtTH(materialPrice)}, ค่าช่าง: ${fmtTH(installPrice)})</small>`;
            summaryHtml += ` • พื้นที่: <b>${fmtTH(areaSqm, 2)}</b> ตร.ม. • ใช้: <b>${Number.isFinite(rollsNeeded) ? rollsNeeded : 'N/A'}</b> ม้วน`;
            wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = summaryHtml;
            roomSum += totalItemPrice;
        });

        const itemCount = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        room.querySelector('[data-room-brief]').innerHTML = `<span>${itemCount} รายการ • ${fmtTH(roomSum)} บาท</span>`;
        grand += roomSum;
    });

    // Add null checks for all DOM queries
    const grandTotalEl = document.querySelector(SELECTORS.grandTotal);
    const setCountEl = document.querySelector(SELECTORS.setCount);
    const summaryContainer = document.querySelector(SELECTORS.detailedSummaryContainer);
    
    if (grandTotalEl) grandTotalEl.textContent = fmtTH(grand);
    if (setCountEl) setCountEl.textContent = pricedItemCount;
    if (summaryContainer) {
        let html = '';
        if (grandOpaqueYards > 0 || grandSheerYards > 0) {
            html += `<h4><i class="ph-bold ph-blinds"></i> ผ้าม่าน</h4><ul>`;
            if (grandOpaqueYards > 0) html += `<li>ผ้าทึบ: <b>${fmtTH(grandOpaqueYards, 2)}</b> หลา</li>`;
            if (grandSheerYards > 0) html += `<li>ผ้าโปร่ง: <b>${fmtTH(grandSheerYards, 2)}</b> หลา</li>`;
            if (grandOpaqueTrack > 0) html += `<li>รางทึบ: <b>${fmtTH(grandOpaqueTrack, 2)}</b> ม.</li>`;
            if (grandSheerTrack > 0) html += `<li>รางโปร่ง: <b>${fmtTH(grandSheerTrack, 2)}</b> ม.</li>`;
            if (hasDoubleBracket) html += `<li class="summary-note">** มีรายการที่ต้องใช้ขาสองชั้น</li>`;
            html += `</ul>`;
        }
        if (Object.keys(decoCounts).length > 0) {
             html += `<h4><i class="ph-bold ph-file-image"></i> งานตกแต่ง</h4><ul>`;
             for (const type in decoCounts) html += `<li>${type}: <b>${decoCounts[type]}</b> ชุด</li>`;
             html += `</ul>`;
        }
        if (totalWallpaperRolls > 0) {
             html += `<h4><i class="ph-bold ph-paint-roller"></i> วอลเปเปอร์</h4><ul>`;
             html += `<li>จำนวนที่ต้องใช้: <b>${totalWallpaperRolls}</b> ม้วน</li>`;
             html += `</ul>`;
        }
        if (html === '') html = '<p class="empty-summary">ยังไม่มีรายการวัสดุ</p>';
        summaryContainer.innerHTML = html;
    }
}

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
                    fabric_code: setEl.querySelector('input[name="fabric_code"]')?.value || '',
                    sheer_fabric_code: setEl.querySelector('input[name="sheer_fabric_code"]')?.value || '',
                    opening_style: setEl.querySelector('select[name="opening_style"]')?.value || '',
                    track_color: setEl.querySelector('select[name="track_color"]')?.value || '',
                    notes: setEl.querySelector('input[name="notes"]')?.value || '',
                    is_suspended: setEl.dataset.suspended === 'true',
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value || '',
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                    deco_code: decoEl.querySelector('[name="deco_code"]')?.value || '',
                    deco_notes: decoEl.querySelector('[name="deco_notes"]')?.value || '',
                    is_suspended: decoEl.dataset.suspended === 'true',
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                roomData.wallpapers.push({
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value),
                    wallpaper_code: wallpaperEl.querySelector('[name="wallpaper_code"]')?.value || '',
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    install_cost_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_install_cost"]')?.value),
                    wallpaper_notes: wallpaperEl.querySelector('[name="wallpaper_notes"]')?.value || '',
                    widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)),
                    is_suspended: wallpaperEl.dataset.suspended === 'true',
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
    }
    
// 9. FIX: Better error handling in loadPayload
function loadPayload(payload) {
    if (!payload || !payload.rooms) { 
        showToast("ข้อมูลตัวเลขไม่ถูกต้อง", "error"); 
        return; 
    }
    
    try {
        const customerNameEl = document.querySelector('[name="customer_name"]');
        const customerAddressEl = document.querySelector('[name="customer_address"]');
        const customerPhoneEl = document.querySelector('[name="customer_phone"]');
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        
        if (customerNameEl) customerNameEl.value = payload.customer_name || '';
        if (customerAddressEl) customerAddressEl.value = payload.customer_address || '';
        if (customerPhoneEl) customerPhoneEl.value = payload.customer_phone || '';
        if (roomsContainer) roomsContainer.innerHTML = "";
        
        roomCount = 0;
        
        if (payload.rooms.length > 0) {
            payload.rooms.forEach(roomData => addRoom(roomData));
        } else {
            addRoom();
        }
        
        showToast("โหลดข้อมูลสำเร็จ", "success");
    } catch (error) {
        console.error("Error loading payload:", error);
        showToast("เกิดข้อผิดพลาดในการโหลดข้อมูล", "error");
    }
}
    
// 4. FIX: Properly structured jumpToRoom function
function jumpToRoom(roomId) {
    const target = document.getElementById(roomId);
    if (target) {
        // Use non-smooth scroll to avoid conflicts with other element animations
        try {
            target.scrollIntoView({ behavior: 'auto', block: 'start' });
        } catch (e) {
            // fallback
            target.scrollIntoView();
        }
        // Visual feedback without affecting layout
        target.classList.add('scrolling-jump');
        setTimeout(() => target.classList.remove('scrolling-jump'), 600);
    }
}

// 5. FIX: Improved updateQuickNavMenu function
function updateQuickNavMenu() {
    const roomListContainer = document.querySelector(SELECTORS.quickNavRoomList);
    const quickNavBtn = document.querySelector(SELECTORS.quickNavBtn);
    if (!roomListContainer || !quickNavBtn) return;

    roomListContainer.innerHTML = ''; // Clear previous links
    const rooms = document.querySelectorAll(SELECTORS.room);

    if (rooms.length < 2) {
        quickNavBtn.style.display = 'none'; // Hide if not useful
        return;
    } else {
        quickNavBtn.style.display = 'inline-flex';
    }

    rooms.forEach((room, index) => {
        const roomNameInput = room.querySelector(SELECTORS.roomNameInput);
        const roomName = (roomNameInput && roomNameInput.value.trim()) 
            ? roomNameInput.value.trim() 
            : (roomNameInput && roomNameInput.placeholder) 
                ? roomNameInput.placeholder 
                : `ห้อง ${index + 1}`;
        
        // Ensure room has an ID
        const roomId = room.id || `room-${index + 1}`;
        if (!room.id) {
            room.id = roomId;
        }

        const link = document.createElement('a');
        link.href = `#${roomId}`;
        link.dataset.jumpTo = roomId;
        link.innerHTML = `<i class="ph ph-arrow-bend-right-down"></i> ${roomName}`;

        link.addEventListener('click', (e) => {
            e.preventDefault();
            jumpToRoom(roomId);
        });

        roomListContainer.appendChild(link);
    });
}
    
    function renumber() {
        document.querySelectorAll(SELECTORS.set).forEach((el, i) => {
            el.querySelector('[data-set-num]').textContent = i + 1;
        });
        document.querySelectorAll(SELECTORS.decoItem).forEach((el, i) => {
            el.querySelector('[data-deco-num]').textContent = i + 1;
        });
        document.querySelectorAll(SELECTORS.wallpaperItem).forEach((el, i) => {
            el.querySelector('[data-wallpaper-num]').textContent = i + 1;
        });
        updateQuickNavMenu();
    }

    function toggleSetFabricUI(set) {
        if (!set) return;
        const variant = set.querySelector('select[name="fabric_variant"]')?.value;
        const hasOpaque = variant === 'ทึบ' || variant === 'ทึบ&โปร่ง';
        const hasSheer = variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง';
        set.querySelector('[data-opaque-wrap]')?.classList.toggle('d-none', !hasOpaque);
        set.querySelector('[data-sheer-wrap]')?.classList.toggle('d-none', !hasSheer);
        set.querySelector('[data-sheer-code-wrap]')?.classList.toggle('d-none', !hasSheer);
    }
    
    function attachListeners() {
        document.addEventListener('input', debounce((e) => {
            const el = e.target;
            const parent = el.closest('[data-set], [data-deco-item], [data-wallpaper-item]');
            if (parent) recalcAll();
            saveData();
        }));

        document.addEventListener('change', (e) => {
            const el = e.target;
            if (el.matches('select[name="fabric_variant"]')) {
                const parent = el.closest('[data-set]');
                toggleSetFabricUI(parent);
                recalcAll();
                saveData();
            } else if (el.matches('input[type="file"][data-act="import-file"]')) {
                const file = el.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(event) {
                        try {
                            const data = JSON.parse(event.target.result);
                            loadPayload(data);
                        } catch (error) {
                            showToast("ไม่สามารถโหลดไฟล์ได้", "error");
                            console.error("File loading error:", error);
                        }
                    };
                    reader.readAsText(file);
                }
            } else {
                const parent = el.closest('[data-set], [data-deco-item], [data-wallpaper-item]');
                if (parent) recalcAll();
                saveData();
            }
        });

        document.addEventListener('click', (e) => {
            // Handle core actions via a single listener
            const action = e.target.closest('[data-act]');
            if (!action) return;

            const actions = {
                "add-room": { action: addRoom, selector: null, confirm: false, isRemoval: false },
                "add-set": { action: addSet, selector: SELECTORS.room, confirm: false, isRemoval: false },
                "add-deco": { action: addDeco, selector: SELECTORS.room, confirm: false, isRemoval: false },
                "add-wallpaper": { action: addWallpaper, selector: SELECTORS.room, confirm: false, isRemoval: false },
                "add-wall": { action: addWall, selector: SELECTORS.wallpaperItem, confirm: false, isRemoval: false },

                "remove-set": { action: animateAndRemove, selector: SELECTORS.set, confirm: true, title: "ลบรายการผ้าม่าน", body: "คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?", isRemoval: true, toast: "ลบรายการผ้าม่านแล้ว" },
                "remove-deco": { action: animateAndRemove, selector: SELECTORS.decoItem, confirm: true, title: "ลบรายการตกแต่ง", body: "คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?", isRemoval: true, toast: "ลบรายการตกแต่งแล้ว" },
                "remove-wallpaper": { action: animateAndRemove, selector: SELECTORS.wallpaperItem, confirm: true, title: "ลบรายการวอลเปเปอร์", body: "คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?", isRemoval: true, toast: "ลบรายการวอลเปเปอร์แล้ว" },
                "remove-wall": { action: (item) => { item.remove(); recalcAll(); saveData(); }, selector: '.wall-input-row', confirm: false, isRemoval: true, toast: "ลบรายการผนังแล้ว" },

                "toggle-suspend": { action: suspendItem, selector: '[data-suspended]', confirm: false, isRemoval: false },
                "toggle-suspend-room": { action: suspendRoom, selector: SELECTORS.room, confirm: false, isRemoval: false },
                
                "expand-room": { action: (item) => item.classList.remove('is-collapsed'), selector: SELECTORS.room, confirm: false, isRemoval: false },
                "collapse-room": { action: (item) => item.classList.add('is-collapsed'), selector: SELECTORS.room, confirm: false, isRemoval: false },
                "expand-all-rooms": { action: () => document.querySelectorAll(SELECTORS.room).forEach(el => el.classList.remove('is-collapsed')), selector: null, confirm: false, isRemoval: false },
                "collapse-all-rooms": { action: () => document.querySelectorAll(SELECTORS.room).forEach(el => el.classList.add('is-collapsed')), selector: null, confirm: false, isRemoval: false },

                "toggle-options-menu": {
                    action: (item) => {
                        const menu = item.querySelector('.room-options-menu');
                        if (menu) {
                            const show = menu.classList.toggle('show');
                            item.closest('.room-card')?.classList.toggle('overflow-visible', show);
                        }
                    },
                    selector: '.room-options-container', confirm: false, isRemoval: false,
                },

                "lock-form": {
                    action: (el) => {
                        const lockBtn = document.querySelector(SELECTORS.lockBtn);
                        if (!lockBtn) return;
                        isLocked = !isLocked;
                        updateLockState();
                        showToast(`ฟอร์มถูก${isLocked ? 'ล็อค' : 'ปลดล็อค'}แล้ว`, 'warning');
                    },
                    selector: null, confirm: false, isRemoval: false
                },
                "export-as-text": {
                    action: async () => {
                        const confirmed = await showModal(SELECTORS.copyOptionsModal);
                        if (!confirmed) return;
                        const modalEl = document.querySelector(SELECTORS.copyOptionsModal);
                        const includeVat = modalEl.querySelector('input[name="copy_vat_option"]:checked')?.value === 'include';
                        const text = generateTextOutput(includeVat);
                        try {
                            await navigator.clipboard.writeText(text);
                            showToast('คัดลอกข้อมูลใบเสนอราคาแล้ว', 'success');
                        } catch (err) {
                            console.error('Failed to copy text: ', err);
                            showToast('คัดลอกไม่สำเร็จ', 'error');
                        }
                    }, selector: null, confirm: false, isRemoval: false
                },
                "export-as-pdf": { action: generatePdf, selector: null, confirm: false, isRemoval: false },
                "import-file": { action: () => document.querySelector(SELECTORS.fileImporter)?.click(), selector: null, confirm: false, isRemoval: false },
                "clear-all": {
                    action: async () => {
                        const confirmed = await showConfirmation('ล้างข้อมูลทั้งหมด', 'คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลทั้งหมดในฟอร์มนี้? การกระทำนี้ไม่สามารถย้อนกลับได้');
                        if (confirmed) {
                            localStorage.removeItem(STORAGE_KEY);
                            window.location.reload();
                        }
                    }, selector: null, confirm: true, isRemoval: false
                }
            };
            
            const actionConfig = actions[action.dataset.act];
            if (actionConfig) {
                if (actionConfig.isRemoval) {
                    performActionWithConfirmation(action, actionConfig);
                } else if (actionConfig.selector) {
                    const item = action.closest(actionConfig.selector);
                    if (item) {
                        actionConfig.action(item, action);
                        renumber();
                        recalcAll();
                        saveData();
                    }
                } else {
                    actionConfig.action(action);
                    if (actionConfig.act !== 'lock-form' && actionConfig.act !== 'export-as-text' && actionConfig.act !== 'export-as-pdf' && actionConfig.act !== 'import-file' && actionConfig.act !== 'clear-all') {
                        renumber();
                        recalcAll();
                        saveData();
                    }
                }
            }
        });
    }

    function updateLockState() {
        document.body.classList.toggle('is-locked', isLocked);
        document.querySelector(SELECTORS.lockText).textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
    }

    function toggleMenu() {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const quickNavDropdown = document.querySelector(SELECTORS.quickNavDropdown);
        if (quickNavDropdown) quickNavDropdown.classList.remove('show');
        if (menuDropdown) menuDropdown.classList.toggle('show');
    }

    function setupHeaderMenus() {
        const menuBtn = document.querySelector(SELECTORS.menuBtn);
        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleMenu();
            });
        }
        
// 7. FIX: Prevent menu flickering and improve event handling
document.addEventListener('click', (e) => {
    // Handle header menu
    if (!e.target.closest('.main-header')) {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const quickNavDropdown = document.querySelector(SELECTORS.quickNavDropdown);
        if (menuDropdown) menuDropdown.classList.remove('show');
        if (quickNavDropdown) quickNavDropdown.classList.remove('show');
    }
    
    // Handle room options menu
    if (!e.target.closest('.room-options-container')) {
        document.querySelectorAll('.room-options-menu.show').forEach(menu => {
            menu.classList.remove('show');
            const roomCard = menu.closest('.room-card');
            if (roomCard) {
                roomCard.classList.remove('overflow-visible');
            }
        });
    }
});

// Improved quick nav button event listener
const quickNavBtn = document.querySelector(SELECTORS.quickNavBtn);
const quickNavDropdown = document.querySelector(SELECTORS.quickNavDropdown);
const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
    
if (quickNavBtn && quickNavDropdown) {
    quickNavBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (menuDropdown) menuDropdown.classList.remove('show');
        quickNavDropdown.classList.toggle('show');
    });
}
    }

    // --- PDF Export Logic ---
    async function generatePdf() {
        const options = await showExportOptionsModal();
        if (!options) return;
        
        disableAnimationsTemporarily();
        
        const printableContent = document.querySelector(SELECTORS.printableContent);
        const printableClone = printableContent.cloneNode(true);
        const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;
        const grandTotalNum = toNum(grandTotal);
        
        // Final price calculation for PDF
        let finalPrice = grandTotalNum;
        let vatText = '';
        if (options.vatOption === 'include') {
            finalPrice = grandTotalNum / (1 + SHOP_CONFIG.baseVatRate);
            vatText = `*ราคาข้างต้นยังไม่รวมภาษีมูลค่าเพิ่ม 7%`;
        } else if (options.vatOption === 'add') {
            finalPrice = grandTotalNum;
            vatText = `*ราคาข้างต้นยังไม่รวมภาษีมูลค่าเพิ่ม 7%`;
        } else { // 'none'
            finalPrice = grandTotalNum;
            vatText = `*ราคานี้เป็นราคารวมภาษีมูลค่าเพิ่มแล้ว`;
        }
        
        // Populate static data
        printableClone.querySelector('.printable-customer-name').textContent = document.querySelector('[name="customer_name"]')?.value || '';
        printableClone.querySelector('.printable-customer-address').textContent = document.querySelector('[name="customer_address"]')?.value || '';
        printableClone.querySelector('.printable-customer-phone').textContent = document.querySelector('[name="customer_phone"]')?.value || '';
        printableClone.querySelector('.printable-quote-date').textContent = new Date().toLocaleDateString('th-TH');
        
        // Hide unused elements
        printableClone.querySelectorAll('.printable-hide-if-empty').forEach(el => {
            const isEmpty = el.querySelector('ul')?.children.length === 0;
            if(isEmpty) el.style.display = 'none';
        });

        // Set final totals
        printableClone.querySelector('.printable-final-price-text').textContent = fmtTH(finalPrice, 0);
        printableClone.querySelector('.printable-final-price-baht').textContent = bahttext(finalPrice);
        printableClone.querySelector('.printable-vat-text').textContent = vatText;

        // Populate dynamic data
        const printableRoomsContainer = printableClone.querySelector(SELECTORS.roomsContainer);
        const roomsToPrint = document.querySelectorAll(SELECTORS.room);
        printableRoomsContainer.innerHTML = '';
        roomsToPrint.forEach(room => {
            if (room.dataset.suspended !== 'true' && room.querySelectorAll('.set-item:not([data-suspended="true"]), .deco-item:not([data-suspended="true"]), .wallpaper-item:not([data-suspended="true"])').length > 0) {
                printableRoomsContainer.appendChild(room.cloneNode(true));
            }
        });

        // Add special styles for PDF export
        document.body.classList.add('is-exporting-pdf');
        
        // Append to body temporarily for print
        document.body.appendChild(printableClone);
        
        // Calculate the total height of all rooms to be printed
        const totalHeight = Array.from(printableClone.querySelectorAll(SELECTORS.room)).reduce((sum, room) => sum + room.offsetHeight, 0);
        const totalPages = Math.ceil(totalHeight / (297 * 3.779528)); // A4 height in pixels (approx)
        
        // Wait a short while for the DOM to render
        await new Promise(resolve => setTimeout(resolve, PDF_EXPORT_DELAY_MS));
        
        window.print();

        // Cleanup after print dialog is closed
        setTimeout(() => {
            document.body.classList.remove('is-exporting-pdf');
            printableClone.remove();
        }, 1000);
    }

    function generateTextOutput(includeVat = false) {
        let output = `ใบเสนอราคา\n\n`;
        const customerName = document.querySelector('[name="customer_name"]')?.value;
        const customerPhone = document.querySelector('[name="customer_phone"]')?.value;
        if (customerName) output += `ลูกค้า: ${customerName}\n`;
        if (customerPhone) output += `เบอร์โทร: ${customerPhone}\n`;
        output += `วันที่: ${new Date().toLocaleDateString('th-TH')}\n\n`;
        output += `รายละเอียด:\n`;
        let total = 0;
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            if (roomEl.dataset.suspended === 'true') return;
            const roomName = roomEl.querySelector(SELECTORS.roomNameInput)?.value || 'ห้อง (ไม่ระบุชื่อ)';
            output += `\n--- ${roomName} ---\n`;
            roomEl.querySelectorAll('[data-set]:not([data-suspended="true"])').forEach(setEl => {
                const w = toNum(setEl.querySelector('input[name="width_m"]')?.value);
                const h = toNum(setEl.querySelector('input[name="height_m"]')?.value);
                const style = setEl.querySelector('select[name="set_style"]')?.value;
                const variant = setEl.querySelector('select[name="fabric_variant"]')?.value;
                const price = toNum(setEl.querySelector('[data-set-summary]').textContent.match(/\d/g).join(''));
                total += price;
                output += `- ผ้าม่าน: ${variant} ${style}, กว้าง ${w} ม. x สูง ${h} ม. - ราคา ${fmtTH(price)} บ.\n`;
            });
            roomEl.querySelectorAll('[data-deco-item]:not([data-suspended="true"])').forEach(decoEl => {
                const type = decoEl.querySelector('[name="deco_type"]')?.value || 'งานตกแต่ง';
                const price = toNum(decoEl.querySelector('[data-deco-summary]').textContent.match(/\d/g).join(''));
                total += price;
                output += `- ${type}: ราคา ${fmtTH(price)} บ.\n`;
            });
            roomEl.querySelectorAll('[data-wallpaper-item]:not([data-suspended="true"])').forEach(wallpaperEl => {
                const rolls = toNum(wallpaperEl.querySelector('[data-wallpaper-summary]').textContent.match(/\d+/)[0]);
                const price = toNum(wallpaperEl.querySelector('[data-wallpaper-summary]').textContent.match(/\d/g).join(''));
                total += price;
                output += `- วอลเปเปอร์: ใช้ ${rolls} ม้วน - ราคา ${fmtTH(price)} บ.\n`;
            });
        });
        output += `\n--- สรุปยอดรวม ---\n`;
        output += `ราคารวม: ${fmtTH(total)} บ.\n`;
        output += `จำนวนรายการที่คิดราคา: ${document.querySelector(SELECTORS.setCount)?.textContent || '0'} รายการ\n`;
        if (includeVat) {
            output += `*ราคาข้างต้นยังไม่รวมภาษีมูลค่าเพิ่ม 7%\n`;
        }
        output += `\nหมายเหตุ:\n`;
        SHOP_CONFIG.pdf.notes.forEach(note => output += `- ${note}\n`);
        output += `\nติดต่อ: ${SHOP_CONFIG.phone}\n`;
        output += `จัดทำโดย: ${SHOP_CONFIG.name}`;
        return output;
    }

    // --- INITIALIZATION ---
function init() {
    attachListeners();
    setupHeaderMenus();
    renumber();
    updateQuickNavMenu();
    updateLockState();

    // --- INITIAL LOAD ---
    try {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            loadPayload(JSON.parse(storedData));
        } else {
            addRoom();
        }
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