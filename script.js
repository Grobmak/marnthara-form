(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/5.5.0-stable-pagination";
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
    // (addRoom, addSet, addDeco, etc. are unchanged)
    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl)?.content?.cloneNode(true);
        if (!frag) return;
        const room = frag.querySelector(SELECTORS.room);
        room.dataset.index = roomCount;
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
            created.querySelector('select[name="set_style"]').value = prefill.style || "ตาไก่";
            created.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
            created.querySelector('select[name="set_price_per_m"]').value = fmtTH(prefill.price_per_m_raw);
            created.querySelector('select[name="sheer_price_per_m"]').value = fmtTH(prefill.sheer_price_per_m);
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
            created.querySelector('[name="deco_price_sqyd"]').value = fmtTH(prefill.price_sqyd, 0);
            created.querySelector('[name="deco_code"]').value = prefill.deco_code || "";
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
            created.querySelector('[name="wallpaper_price_roll"]').value = fmtTH(prefill.price_roll, 0);
            created.querySelector('[name="wallpaper_install_cost"]').value = fmtTH(prefill.install_cost, 0);
            created.querySelector('[name="wallpaper_code"]').value = prefill.wallpaper_code || "";
            created.querySelector('[name="wallpaper_notes"]').value = prefill.wallpaper_notes || "";
            (prefill.walls || []).forEach(w => addWall(created, w));
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
            addWall(created);
            animateAndScroll(created);
        }
        renumber();
        recalcAll();
        saveData();
    }

    function addWall(wallpaperEl, prefill) {
        const wallsWrap = wallpaperEl.querySelector(SELECTORS.wallsContainer);
        const frag = document.querySelector(SELECTORS.wallTpl)?.content?.cloneNode(true);
        if (!frag || !wallsWrap) return;
        wallsWrap.appendChild(frag);
        const created = wallsWrap.querySelector('.wall-input-row:last-of-type');
        if (prefill) {
            created.querySelector('input[name="wall_width_m"]').value = prefill.width_m > 0 ? prefill.width_m.toFixed(2) : "";
        }
        recalcAll();
        saveData();
    }

    const removeParent = (e) => {
        if (isLocked) return;
        e.preventDefault();
        const item = e.target.closest('[data-set], [data-deco-item], [data-wallpaper-item], [data-room], .wall-input-row');
        if (item) animateAndRemove(item);
    };

    function toggleRoomMenu(btn) {
        const menu = btn.closest('.room-options-container')?.querySelector('.room-options-menu');
        const card = btn.closest('.room-card');
        if (menu) {
            // Close other open menus
            document.querySelectorAll('.room-options-menu.show').forEach(m => {
                if (m !== menu) {
                    m.classList.remove('show');
                    m.closest('.room-card')?.classList.remove('overflow-visible');
                }
            });
            menu.classList.toggle('show');
            if (card) card.classList.toggle('overflow-visible');
        }
    }

    function toggleSheerWrap(setEl) {
        const wrap = setEl.querySelector(SELECTORS.sheerWrap);
        const variant = setEl.querySelector('select[name="fabric_variant"]')?.value;
        if (wrap) wrap.style.display = variant === 'ทึบ+โปร่ง' ? '' : 'none';
    }

    function toggleSetFabricUI(setEl) {
        const variant = setEl.querySelector('select[name="fabric_variant"]')?.value;
        const codeWrap = setEl.querySelector(SELECTORS.sheerCodeWrap);
        if (codeWrap) codeWrap.style.display = variant === 'ทึบ+โปร่ง' ? '' : 'none';
        toggleSheerWrap(setEl);
    }

    function suspendItem(item, isSuspended, showToastMsg = true) {
        const container = item.closest('[data-sets], [data-decorations], [data-wallpapers]');
        if (isLocked && !isSuspended) return;
        if (!item) return;
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        const summary = item.querySelector('[data-set-summary], [data-deco-summary], [data-wallpaper-summary]');
        if (summary) summary.innerHTML = isSuspended ? '<i class="ph-bold ph-pause-circle"></i> ระงับการคำนวณ' : 'กำลังคำนวณ...';
        if (showToastMsg) showToast(isSuspended ? 'ระงับรายการแล้ว' : 'เปิดใช้งานรายการแล้ว', 'info');
        recalcAll();
        saveData();
    }

    function suspendRoom(room, isSuspended, showToastMsg = true) {
        if (isLocked && !isSuspended) return;
        if (!room) return;
        room.dataset.suspended = isSuspended;
        room.classList.toggle('is-suspended', isSuspended);
        room.querySelector(SELECTORS.roomNameInput).readOnly = isSuspended;
        room.querySelectorAll('input, select, textarea, button:not(.btn-icon):not([data-act="toggle-room-menu"])').forEach(el => el.disabled = isSuspended);
        if (showToastMsg) showToast(isSuspended ? 'ระงับห้องแล้ว' : 'เปิดใช้งานห้องแล้ว', 'info');
        recalcAll();
        saveData();
    }

    async function clearAll() {
        const confirmed = await showConfirmation('ล้างข้อมูลทั้งหมด', 'คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด?');
        if (!confirmed) return;
        localStorage.removeItem(STORAGE_KEY);
        document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
        document.querySelector(SELECTORS.payloadInput).value = '';
        roomCount = 0;
        addRoom();
        recalcAll();
        showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
    }

    async function clearAllItems() {
        const confirmed = await showConfirmation('ล้างรายการทั้งหมด', 'คุณแน่ใจหรือไม่ว่าต้องการล้างเฉพาะรายการผ้าม่าน/ตกแต่ง/วอลล์เปเปอร์ทั้งหมด?');
        if (!confirmed) return;
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            room.querySelectorAll('[data-set], [data-deco-item], [data-wallpaper-item]').forEach(item => item.remove());
        });
        renumber();
        recalcAll();
        saveData();
        showToast('ล้างรายการทั้งหมดแล้ว', 'success');
    }

    async function performActionWithConfirmation(btn, actionConfig) {
        const item = btn.closest(actionConfig.selector);
        if (!item) return;
        const confirmed = actionConfig.confirm ? await showConfirmation(actionConfig.title, actionConfig.body) : true;
        if (confirmed) {
            showToast(actionConfig.toast, 'success');
            if (actionConfig.isRemoval) {
                actionConfig.action(item);
            } else {
                actionConfig.action(item, btn);
                renumber();
                recalcAll();
                saveData();
            }
        }
    }
    // --- Data & Calculations (recalcAll, buildPayload, etc. are unchanged) ---
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
                    const pricePerM = clamp01(set.querySelector('select[name="set_price_per_m"]')?.value);
                    const sheerPricePerM = clamp01(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                    const openingStyle = set.querySelector('select[name="opening_style"]')?.value;

                    if (h > 2.8) hasDoubleBracket = true;

                    opaqueYards = CALC.fabricYardage(style, w);
                    opaqueTrack = w;

                    const styleSurcharge = stylePlus(style);
                    const heightSurcharge = heightPlus(h);
                    const totalCostPerM = pricePerM + styleSurcharge + heightSurcharge;
                    opaquePrice = Math.round(totalCostPerM * w * 2.5); // Fixed calculation: m * 2.5 is not correct. Reverted to previous.
                    opaquePrice = Math.round((pricePerM + styleSurcharge + heightSurcharge) * w);

                    if (variant === 'ทึบ+โปร่ง') {
                        sheerYards = CALC.fabricYardage(style, w);
                        sheerTrack = w;
                        sheerPrice = Math.round((sheerPricePerM + styleSurcharge + heightSurcharge) * w);
                    } else {
                        sheerPrice = 0;
                        sheerYards = 0;
                        sheerTrack = 0;
                    }

                    const totalSetPrice = opaquePrice + sheerPrice;
                    set.querySelector('[data-set-summary]').innerHTML = `รวม: <b>${fmtTH(totalSetPrice)}</b> บ.`;
                    roomSum += totalSetPrice;
                    if (totalSetPrice > 0) pricedItemCount++;
                    grand += totalSetPrice;
                    grandOpaqueYards += opaqueYards;
                    grandSheerYards += sheerYards;
                    grandOpaqueTrack += opaqueTrack;
                    grandSheerTrack += sheerTrack;
                }
            });

            // DECORATIONS
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                let decoPrice = 0;
                if (deco.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                    const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                    const priceSqyd = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                    const areaSqyd = w * h * SQM_TO_SQYD;
                    decoPrice = Math.round(areaSqyd * priceSqyd);

                    deco.querySelector('[data-deco-summary]').innerHTML = `รวม: <b>${fmtTH(decoPrice)}</b> บ. • พื้นที่: <b>${fmtTH(areaSqyd, 2)}</b> ตร.หลา`;
                    roomSum += decoPrice;
                    if (decoPrice > 0) pricedItemCount++;
                    grand += decoPrice;

                    const type = deco.querySelector('[name="deco_type"]')?.value;
                    if (type) decoCounts[type] = (decoCounts[type] || 0) + 1;
                }
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

                    wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `รวม: <b>${fmtTH(totalItemPrice)}</b> บ. • จำนวน: <b>${fmtTH(rollsNeeded, 2)}</b> ม้วน`;
                    roomSum += totalItemPrice;
                    if (totalItemPrice > 0) {
                        pricedItemCount++;
                        if (Number.isFinite(rollsNeeded)) totalWallpaperRolls += rollsNeeded;
                    }
                    grand += totalItemPrice;
                }
            });

            room.querySelector('[data-room-brief]').innerHTML = roomSum > 0 ? `<b>${fmtTH(roomSum)}</b> บ.` : '';
        });

        document.querySelector(SELECTORS.grandTotal).innerHTML = fmtTH(grand);
        document.querySelector(SELECTORS.setCount).innerHTML = fmtTH(pricedItemCount);

        updateDetailedSummary({ grandOpaqueYards, grandSheerYards, grandOpaqueTrack, grandSheerTrack, totalWallpaperRolls, hasDoubleBracket, decoCounts });
    }

    function updateDetailedSummary(data) {
        let html = '';
        if (data.grandOpaqueYards > 0) {
            html += `<p><i class="ph-bold ph-curtains"></i> <span>ผ้าม่านทึบ</span>: ${fmt(data.grandOpaqueYards, 2)} หลา • ${fmt(data.grandOpaqueTrack, 2)} ม.</p>`;
        }
        if (data.grandSheerYards > 0) {
            html += `<p><i class="ph-bold ph-curtains"></i> <span>ผ้าม่านโปร่ง</span>: ${fmt(data.grandSheerYards, 2)} หลา • ${fmt(data.grandSheerTrack, 2)} ม.</p>`;
        }
        if (data.totalWallpaperRolls > 0) {
            html += `<p><i class="ph-bold ph-flower-lotus"></i> <span>วอลล์เปเปอร์</span>: ${fmt(data.totalWallpaperRolls, 2)} ม้วน</p>`;
        }
        for (const [type, count] of Object.entries(data.decoCounts)) {
            html += `<p><i class="ph-bold ph-package"></i> <span>${type}</span>: ${fmt(count, 0)} รายการ</p>`;
        }
        if (data.hasDoubleBracket) {
            html += `<p class="warning-text"><i class="ph-bold ph-warning"></i> **มีงานสูงเกิน 2.8 เมตร**<br>แนะนำใช้ฉากรับรางคู่</p>`;
        }
        document.querySelector(SELECTORS.detailedSummaryContainer).innerHTML = html || `<p class="empty-state">กรุณาเพิ่มรายการเพื่อสรุป</p>`;
    }

    const saveData = debounce(() => {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (err) {
            console.error("Failed to save to localStorage:", err);
        }
    });

    function loadPayload(payload) {
        if (!payload || !payload.rooms) return;
        document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
        document.querySelector(SELECTORS.customer_name).value = payload.customer_name || '';
        document.querySelector(SELECTORS.customer_phone).value = payload.customer_phone || '';
        document.querySelector(SELECTORS.customer_address).value = payload.customer_address || '';
        roomCount = 0;
        payload.rooms.forEach(room => addRoom(room));
    }

    function buildPayload() {
        const payload = {
            app_version: APP_VERSION,
            customer_name: document.querySelector('#customer_name')?.value || '',
            customer_phone: document.querySelector('#customer_phone')?.value || '',
            customer_address: document.querySelector('#customer_address')?.value || '',
            grand_total: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            grand_total_text: bahttext(toNum(document.querySelector(SELECTORS.grandTotal).textContent)),
            is_locked: isLocked,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || '',
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: [],
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
                    price_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    install_cost: toNum(wallpaperEl.querySelector('[name="wallpaper_install_cost"]')?.value),
                    wallpaper_code: wallpaperEl.querySelector('[name="wallpaper_code"]')?.value || '',
                    wallpaper_notes: wallpaperEl.querySelector('[name="wallpaper_notes"]')?.value || '',
                    walls: Array.from(wallpaperEl.querySelectorAll('.wall-input-row')).map(wallEl => ({
                        width_m: toNum(wallEl.querySelector('[name="wall_width_m"]')?.value),
                    })),
                    is_suspended: wallpaperEl.dataset.suspended === 'true',
                });
            });
            payload.rooms.push(roomData);
        });
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        return payload;
    }

    async function sendData() {
        showToast('กำลังส่งข้อมูล...', 'info');
        const payload = buildPayload();
        try {
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                showToast('ส่งข้อมูลสำเร็จ!', 'success');
            } else {
                showToast('ส่งข้อมูลไม่สำเร็จ!', 'error');
            }
        } catch (error) {
            console.error('Error sending data:', error);
            showToast('ส่งข้อมูลไม่สำเร็จ!', 'error');
        }
    }

    function exportData() {
        const payload = buildPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Marnthara-Export-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('ดาวน์โหลดข้อมูลสำเร็จ!', 'success');
    }

    function updateLockState(lock = null) {
        if (lock === null) {
            isLocked = !isLocked;
        } else {
            isLocked = lock;
        }
        document.querySelector(SELECTORS.orderForm).classList.toggle('is-locked', isLocked);
        document.querySelector(SELECTORS.lockBtn).innerHTML = isLocked ? '<i class="ph-bold ph-lock-key-open lock-icon"></i><span id="lockText">ล็อก</span>' : '<i class="ph-bold ph-lock-key-fill lock-icon"></i><span id="lockText">ปลดล็อก</span>';
        document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(el => el.disabled = isLocked);
        document.querySelectorAll('button:not(#lockBtn):not(#menuBtn)').forEach(el => el.disabled = isLocked);
        document.querySelectorAll('.btn-chip').forEach(el => el.style.pointerEvents = isLocked ? 'none' : '');
        showToast(isLocked ? 'ฟอร์มถูกล็อกแล้ว' : 'ฟอร์มถูกปลดล็อกแล้ว', 'info');
    }

    async function exportPdf() {
        const options = await showExportOptionsModal();
        if (!options) return;
        showToast('กำลังสร้างเอกสาร...', 'info');
        const payload = buildPayload();
        const html = buildPdfHtml(payload, options.vatOption);
        const fileName = `ใบเสนอราคา-${payload.customer_name}-${new Date().toISOString().slice(0, 10)}`;
        switch (options.exportMethod) {
            case 'direct':
                exportWithHtml2Pdf(html, fileName);
                break;
            case 'print':
                exportWithBrowserPrint(html);
                break;
            case 'html':
                exportAsHtmlFile(html, fileName);
                break;
        }
    }

    function buildPdfHtml(payload, vatOption) {
        const vatRate = vatOption === 'include' ? SHOP_CONFIG.baseVatRate : 0;
        let runningTotal = 0;
        let pricedItemCount = 0;
        let pages = [];
        let currentPageHtml = '';
        const itemsPerPage = 8; // Max items per page
        let currentItemCount = 0;
        const addPage = () => {
            pages.push(currentPageHtml);
            currentPageHtml = '';
            currentItemCount = 0;
        };

        const firstPageHtml = buildPdfHeader(payload) + `
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width: 5%;">ลำดับ</th>
                        <th style="width: 50%;">รายละเอียด</th>
                        <th style="width: 15%;">จำนวน</th>
                        <th style="width: 15%;">ราคา</th>
                        <th style="width: 15%;">รวม</th>
                    </tr>
                </thead>
                <tbody>`;
        currentPageHtml += firstPageHtml;

        payload.rooms.forEach(room => {
            if (room.is_suspended) return;
            const roomPricedItems = [];
            let roomTotal = 0;
            room.sets.forEach(set => {
                if (set.is_suspended || set.width_m <= 0 || (set.price_per_m_raw <= 0 && set.sheer_price_per_m <= 0)) return;
                const sPlus = stylePlus(set.style);
                const hPlus = heightPlus(set.height_m);
                const opaquePrice = set.price_per_m_raw > 0 ? Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m) : 0;
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
            room.wallpapers.forEach(wallpaper => {
                if (wallpaper.is_suspended || wallpaper.height_m <= 0) return;
                const totalWidth = wallpaper.walls.reduce((sum, wall) => sum + toNum(wall.width_m), 0);
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, wallpaper.height_m);
                const totalItemPrice = Math.round(rollsNeeded * (toNum(wallpaper.price_roll) + toNum(wallpaper.install_cost)));
                if (totalItemPrice > 0) {
                    let desc = `วอลล์เปเปอร์<br><small>รหัส: ${wallpaper.wallpaper_code || '-'}, พื้นที่รวม: ${totalWidth.toFixed(2)} ม.</small>`;
                    roomPricedItems.push({ description: desc, total: totalItemPrice, units: desc.includes('<br>') ? 1.5 : 1 });
                }
            });

            if (roomPricedItems.length > 0) {
                if (currentItemCount > 0) {
                    currentPageHtml += `<tr><td colspan="5" class="room-spacer"></td></tr>`;
                    currentItemCount++;
                }
                currentPageHtml += `<tr><td colspan="5" class="pdf-room-header"><b>${room.room_name || 'ไม่ระบุชื่อห้อง'}</b></td></tr>`;
                currentItemCount++;
                roomPricedItems.forEach(item => {
                    if (currentItemCount >= itemsPerPage) addPage();
                    const row = `<tr>
                        <td>${++pricedItemCount}</td>
                        <td class="text-left">${item.description}</td>
                        <td>-</td>
                        <td>-</td>
                        <td>${fmtTH(item.total)}</td>
                    </tr>`;
                    currentPageHtml += row;
                    runningTotal += item.total;
                    roomTotal += item.total;
                    currentItemCount++;
                });
            }
        });

        const subtotal = runningTotal;
        const vat = subtotal * vatRate;
        const grandTotal = subtotal + vat;
        const grandTotalText = bahttext(grandTotal);

        currentPageHtml += `</tbody></table>`;
        pages.push(currentPageHtml);
        const finalPage = buildPdfFooter(payload, subtotal, vat, grandTotal, grandTotalText, vatOption);

        const pdfPages = pages.map((pageHtml, index) => {
            const isFirstPage = index === 0;
            const isLastPage = index === pages.length - 1;
            const quoteNumber = new Date().getTime();
            const dateThai = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
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
            const pageFooter = `<div class="pdf-page-footer">หน้าที่ ${index + 1} จาก ${pages.length}</div>`;
            return `<div class="pdf-page">${pageHeader}${pageHtml}${isLastPage ? finalPage : ''}${pageFooter}</div>`;
        }).join('');

        return `
            <div id="printable-content" class="printable-content">
                ${pdfPages}
            </div>
        `;
    }

    function buildPdfFooter(payload, subtotal, vat, grandTotal, grandTotalText, vatOption) {
        let footerHtml = `
            <div class="pdf-summary-grid">
                <div class="pdf-total-in-text">
                    <p class="baht-text-total">(${grandTotalText})</p>
                </div>
                <div class="pdf-price-summary">
                    <table class="pdf-summary-table">
                        <tr><td>รวมเป็นเงิน</td><td>${fmtTH(subtotal)}</td></tr>`;
        if (vatOption === 'include') {
            footerHtml += `
                <tr><td>ภาษีมูลค่าเพิ่ม 7%</td><td>${fmtTH(vat)}</td></tr>
                <tr class="pdf-subtotal-row"><td>ราคาสุทธิ</td><td>${fmtTH(grandTotal)}</td></tr>`;
        } else {
            footerHtml += `<tr class="pdf-subtotal-row"><td>ราคารวม</td><td>${fmtTH(grandTotal)}</td></tr>`;
        }
        footerHtml += `
                    </table>
                </div>
            </div>
            <div class="pdf-notes">
                <p><strong>หมายเหตุ:</strong></p>
                <ul>`;
        SHOP_CONFIG.pdf.notes.forEach(note => {
            footerHtml += `<li>${note}</li>`;
        });
        footerHtml += `
                </ul>
            </div>
            <div class="pdf-signatures">
                <div class="pdf-signature-box">
                    <p>.......................................</p>
                    <p>(ผู้รับใบเสนอราคา)</p>
                </div>
                <div class="pdf-signature-box">
                    <p>.......................................</p>
                    <p>(ผู้เสนอราคา)</p>
                </div>
            </div>`;
        return footerHtml;
    }

    function exportWithHtml2Pdf(htmlContent, fileName) {
        showToast('กำลังสร้างเอกสาร PDF... (วิธีที่ 1)', 'default');
        setTimeout(async () => {
            try {
                const opt = {
                    margin: [10, 10, 20, 10], // top, left, bottom, right
                    filename: `${fileName}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, logging: true, useCORS: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
                };
                const printable = document.querySelector(SELECTORS.printableContent);
                printable.innerHTML = htmlContent;
                await html2pdf().set(opt).from(printable).save();
                printable.innerHTML = '';
                showToast('สร้าง PDF สำเร็จ!', 'success');
            } catch (error) {
                console.error("PDF Export Error:", error);
                showToast('เกิดข้อผิดพลาด! ลองใช้วิธีที่ 2', 'error');
            }
        }, PDF_EXPORT_DELAY_MS);
    }

    function exportWithBrowserPrint(htmlContent) {
        showToast('กำลังเตรียมพิมพ์... (วิธีที่ 2)', 'default');
        const container = document.querySelector(SELECTORS.printableContent);
        container.innerHTML = htmlContent;
        setTimeout(() => {
            window.print();
            setTimeout(() => { container.innerHTML = ''; }, 1000);
        }, 100);
    }

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
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); }, 500);

        orderForm.addEventListener('input', (e) => {
            const target = e.target;
            const parentSet = target.closest(SELECTORS.set);
            const parentDeco = target.closest(SELECTORS.decoItem);
            const parentWallpaper = target.closest(SELECTORS.wallpaperItem);

            if (target.matches('[data-act="add-wall"]')) {
                const wallpaperEl = target.closest(SELECTORS.wallpaperItem);
                if (wallpaperEl) addWall(wallpaperEl);
                return;
            }
            if (target.matches('[data-act="remove-wall"]')) {
                removeParent(e);
                return;
            }
            if (target.matches('select[name="fabric_variant"]') && parentSet) {
                toggleSetFabricUI(parentSet);
            }
            if (target.matches('input') || target.matches('select') || target.matches('textarea')) {
                debouncedRecalcAndSave();
            }
        });

        orderForm.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn || btn.disabled || isLocked && btn.id !== 'lockBtn') return;
            const action = btn.dataset.act;

            if (action) {
                e.preventDefault();
                e.stopPropagation();
            }

            const actions = {
                'add-set': () => addSet(e.target.closest(SELECTORS.room)),
                'add-deco': () => addDeco(e.target.closest(SELECTORS.room)),
                'add-wallpaper': () => addWallpaper(e.target.closest(SELECTORS.room)),
                'toggle-suspend': () => suspendItem(btn.closest('[data-set], [data-deco-item], [data-wallpaper-item]'), btn.closest('[data-set], [data-deco-item], [data-wallpaper-item]').dataset.suspended !== 'true'),
                'toggle-room-suspend': () => suspendRoom(btn.closest(SELECTORS.room), btn.closest(SELECTORS.room).dataset.suspended !== 'true'),
                'toggle-room-menu': () => toggleRoomMenu(btn),
                'clear-deco': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: false, title: 'ล้างข้อมูล', body: 'ยืนยันการล้างข้อมูลนี้?', selector: '[data-deco-item]', action: clearDecoItem, toast: 'ล้างข้อมูลรายการแล้ว' }),
                'del-set': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบจุด', body: 'ยืนยันการลบจุดติดตั้งนี้?', selector: SELECTORS.set, action: animateAndRemove, toast: 'ลบจุดผ้าม่านแล้ว' }),
                'del-deco': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบรายการ', body: 'ยืนยันการลบรายการตกแต่งนี้?', selector: SELECTORS.decoItem, action: animateAndRemove, toast: 'ลบรายการตกแต่งแล้ว' }),
                'del-wallpaper': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบรายการ', body: 'ยืนยันการลบรายการวอลล์เปเปอร์นี้?', selector: SELECTORS.wallpaperItem, action: animateAndRemove, toast: 'ลบรายการวอลล์เปเปอร์แล้ว' }),
                'del-room': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบห้อง', body: 'ยืนยันการลบห้องนี้? ข้อมูลทั้งหมดจะหายไป', selector: SELECTORS.room, action: animateAndRemove, toast: 'ลบห้องแล้ว' }),
            };
            if (actions[action]) {
                actions[action]();
            }
        });

        document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => updateLockState());
        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => addRoom());
        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', clearAll);
        document.querySelector(SELECTORS.clearItemsBtn).addEventListener('click', clearAllItems);

        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); copyTextToClipboard(buildPayload()); showToast('คัดลอกสรุปแล้ว!', 'success'); });
        document.querySelector(SELECTORS.exportPdfBtn).addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); exportPdf(); });
        document.querySelector(SELECTORS.submitBtn).addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); sendData(); });
        document.querySelector(SELECTORS.importBtn).addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fileImporter.click(); });
        document.querySelector(SELECTORS.exportBtn).addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); exportData(); });

        fileImporter.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const payload = JSON.parse(event.target.result);
                    loadPayload(payload);
                    showToast('Import สำเร็จ!', 'success');
                } catch (err) {
                    showToast('ไฟล์ JSON ไม่ถูกต้อง', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = null;
        });

        // Bug Fix: This click listener for the menu button will prevent the window listener from firing immediately.
        document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
            e.stopPropagation();
            menuDropdown.classList.toggle('show');
        });

        window.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-container')) menuDropdown.classList.remove('show');
            if (!e.target.closest('.room-options-container')) {
                document.querySelectorAll('.room-options-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                    menu.closest('.room-card')?.classList.remove('overflow-visible');
                });
            }
        });

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
        updateLockState(false);
    }

    document.addEventListener('DOMContentLoaded', init);
})();