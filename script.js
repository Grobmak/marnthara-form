(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/5.3.0-multipage-pdf";
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
    async function showExportOptionsModal() {
        const confirmed = await showModal(SELECTORS.exportOptionsModal);
        if (!confirmed) return null;
        const modalEl = document.querySelector(SELECTORS.exportOptionsModal);
        return {
            vatOption: modalEl.querySelector('input[name="vat_option"]:checked').value,
            exportMethod: modalEl.querySelector('#exportMethod').value,
        };
    }

    // --- CORE DOM MANIPULATION ---
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

    // --- DATA & CALCULATIONS ---
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

        document.querySelector(SELECTORS.grandTotal).textContent = fmtTH(grand);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

        // UPDATE DETAILED MATERIAL SUMMARY
        const summaryContainer = document.querySelector(SELECTORS.detailedSummaryContainer);
        if(summaryContainer) {
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
                    width_m: toNum(setEl.querySelector('input[name="width_m"]')?.value), height_m: toNum(setEl.querySelector('input[name="height_m"]')?.value), style: setEl.querySelector('select[name="set_style"]')?.value || '', fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value || '', price_per_m_raw: toNum(setEl.querySelector('select[name="set_price_per_m"]')?.value), sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value), fabric_code: setEl.querySelector('input[name="fabric_code"]')?.value || '', sheer_fabric_code: setEl.querySelector('input[name="sheer_fabric_code"]')?.value || '', opening_style: setEl.querySelector('select[name="opening_style"]')?.value || '', track_color: setEl.querySelector('select[name="track_color"]')?.value || '', notes: setEl.querySelector('input[name="notes"]')?.value || '', is_suspended: setEl.dataset.suspended === 'true',
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value || '', width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value), height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value), price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value), deco_code: decoEl.querySelector('[name="deco_code"]')?.value || '', deco_notes: decoEl.querySelector('[name="deco_notes"]')?.value || '', is_suspended: decoEl.dataset.suspended === 'true',
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                roomData.wallpapers.push({
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value), wallpaper_code: wallpaperEl.querySelector('[name="wallpaper_code"]')?.value || '', price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value), install_cost_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_install_cost"]')?.value), wallpaper_notes: wallpaperEl.querySelector('[name="wallpaper_notes"]')?.value || '', widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)), is_suspended: wallpaperEl.dataset.suspended === 'true',
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
    }

    function loadPayload(payload) {
        if (!payload || !payload.rooms) { showToast("ข้อมูลไม่ถูกต้อง", "error"); return; }
        document.querySelector('[name="customer_name"]').value = payload.customer_name || '';
        document.querySelector('[name="customer_address"]').value = payload.customer_address || '';
        document.querySelector('[name="customer_phone"]').value = payload.customer_phone || '';
        document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
        roomCount = 0;
        if (payload.rooms.length > 0) payload.rooms.forEach(addRoom);
        else addRoom();
        showToast("โหลดข้อมูลสำเร็จ", "success");
    }
    
    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            room.querySelector(SELECTORS.roomNameInput).placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            const totalItemsInRoom = items.length;
            items.forEach((item, iIdx) => {
                const titleEl = item.querySelector("[data-item-title]");
                if (titleEl) titleEl.textContent = `${iIdx + 1}/${totalItemsInRoom}`;
            });
        });
    }

    function toggleSetFabricUI(setEl) {
        if (!setEl) return;
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        setEl.querySelector(SELECTORS.sheerWrap)?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector(SELECTORS.sheerCodeWrap)?.classList.toggle("hidden", !hasSheer);
    }

    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        if (!lockBtn) return;
        lockBtn.classList.toggle('is-locked', isLocked);
        lockBtn.title = isLocked ? 'ปลดล็อคฟอร์ม' : 'ล็อคฟอร์ม';
        lockBtn.querySelector('.lock-icon').className = isLocked ? 'ph-bold ph-lock-key lock-icon' : 'ph-bold ph-lock-key-open lock-icon';
        const lockTextEl = document.querySelector(SELECTORS.lockText);
        if (lockTextEl) lockTextEl.textContent = isLocked ? 'ปลดล็อค' : 'ล็อก';
        document.querySelectorAll('input, select, textarea, button').forEach(el => {
            const isExempt = el.closest('.summary-footer') || el.closest('.main-header') || el.closest('.modal-wrapper') || el.closest('.room-options-menu');
            if (!isExempt) el.disabled = isLocked;
        });
    }

    function toggleLock() {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'warning');
    }

    // --- DOCUMENT EXPORT ENGINE ---

    function generateQuotationHtml(payload, options) {
        const { vatRate } = options;

        // 1. Flatten all valid items into a single list
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
                    roomPricedItems.push({ description: desc, total: totalSetPrice });
                }
            });

            room.decorations.forEach(deco => {
                if (deco.is_suspended || deco.width_m <= 0) return;
                const decoPrice = Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
                if (decoPrice > 0) {
                    let desc = `${deco.type || 'งานตกแต่ง'} <br><small>รหัส: ${deco.deco_code || '-'}, ขนาด ${deco.width_m.toFixed(2)} x ${deco.height_m.toFixed(2)} ม.</small>`;
                    roomPricedItems.push({ description: desc, total: decoPrice });
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
                    roomPricedItems.push({ description: desc, total: wpPrice });
                }
            });

            if (roomPricedItems.length > 0) {
                lineItems.push({ isRoomHeader: true, roomName: room.room_name || 'ไม่ระบุชื่อห้อง' });
                lineItems.push(...roomPricedItems);
            }
        });

        const subTotal = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
        if (subTotal === 0) return null;

        const vatAmount = subTotal * vatRate;
        const grandTotal = subTotal + vatAmount;

        // 2. Paginate the items
        const ROWS_PER_FIRST_PAGE = 15;
        const ROWS_PER_SUBSEQUENT_PAGE = 22;
        const pages = [];
        let currentPageItems = [];

        lineItems.forEach(item => {
            const rowCount = item.isRoomHeader ? 1 : 1; // Simple row count
            const limit = pages.length === 0 ? ROWS_PER_FIRST_PAGE : ROWS_PER_SUBSEQUENT_PAGE;
            if ((currentPageItems.reduce((acc, i) => acc + (i.isRoomHeader ? 1 : 1), 0) + rowCount) > limit && currentPageItems.length > 0) {
                pages.push(currentPageItems);
                currentPageItems = [];
            }
            currentPageItems.push(item);
        });
        if (currentPageItems.length > 0) pages.push(currentPageItems);

        // 3. Build HTML for each page
        const today = new Date();
        const dateThai = today.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        const quoteNumber = `QT-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
        
        let allPagesHtml = '';
        let cumulativeTotal = 0;
        let itemNo = 1;

        pages.forEach((pageItems, pageIndex) => {
            const isFirstPage = pageIndex === 0;
            const isLastPage = pageIndex === pages.length - 1;

            // Page Header
            const docHeader = `
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
                        <div class="pdf-title-box"><h1>${isFirstPage ? 'ใบเสนอราคา' : 'ใบเสนอราคา (ต่อ)'}</h1></div>
                        <table class="pdf-quote-meta">
                            <tr><td>เลขที่:</td><td>${quoteNumber}</td></tr>
                            <tr><td>วันที่:</td><td>${dateThai}</td></tr>
                            <tr><td>หน้า:</td><td>${pageIndex + 1} / ${pages.length}</td></tr>
                        </table>
                    </div>
                </header>
            `;
            const customerDetails = isFirstPage ? `
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
            ` : `<div style="height: 8mm;"></div>`; // Spacer for subsequent pages

            // Table Content
            let tableRows = '';
            if (!isFirstPage) {
                tableRows += `<tr class="pdf-subtotal-row"><td colspan="4">ยอดยกมา</td><td class="pdf-text-right">${fmt(cumulativeTotal, 2, true)}</td></tr>`;
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
                tableFooter = `<tfoot><tr class="pdf-subtotal-row"><td colspan="4">ยอดยกไป</td><td class="pdf-text-right">${fmt(cumulativeTotal, 2, true)}</td></tr></tfoot>`;
            }

            // Page Footer
            const docFooter = `
                <footer class="pdf-footer-section">
                    <div class="pdf-signature-box"><p>.................................................</p><p>ผู้เสนอราคา</p><p>(${SHOP_CONFIG.name})</p><p>วันที่: ${dateThai}</p></div>
                    <div class="pdf-signature-box"><p>.................................................</p><p>ลูกค้า / ผู้มีอำนาจลงนาม</p><p>&nbsp;</p><p>วันที่: ......./......./............</p></div>
                </footer>
            `;

            const summarySection = isLastPage ? `
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
            ` : '';

            allPagesHtml += `
                <div class="pdf-page-wrapper">
                    <div class="pdf-container">
                        ${docHeader}
                        ${customerDetails}
                        <table class="pdf-items-table">
                            <thead><tr><th style="width:5%;">ลำดับ</th><th style="width:50%;">รายการ</th><th style="width:10%;">จำนวน</th><th style="width:17.5%;">ราคา/หน่วย</th><th style="width:17.5%;">รวม (บาท)</th></tr></thead>
                            <tbody>${tableRows}</tbody>
                            ${tableFooter}
                        </table>
                        ${summarySection}
                        ${isLastPage ? docFooter : ''}
                    </div>
                </div>
            `;
        });
        
        return {
            html: `<div id="quotation-template">${allPagesHtml}</div>`,
            fileName: `${quoteNumber}_${payload.customer_name.trim().replace(/\s+/g, '-') || 'quote'}`
        };
    }
    
    async function exportDirectPdf(htmlContent, fileName) {
        showToast('กำลังสร้าง PDF... (วิธีที่ 1)', 'default');
        
        const element = document.createElement('div');
        element.innerHTML = htmlContent;
        
        const opt = {
            margin: [10, 5, 10, 5], filename: `${fileName}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        setTimeout(async () => {
            try {
                // The page numbers are now part of the HTML content, so the post-processing loop is no longer needed here.
                await html2pdf().from(element).set(opt).save();
                showToast('สร้าง PDF สำเร็จ!', 'success');
            } catch (error) {
                console.error("Direct PDF Export Error:", error);
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

        const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); }, 150);

        orderForm.addEventListener("input", e => {
            const el = e.target;
            if(el.name === 'deco_price_sqyd' || el.name === 'wallpaper_price_roll' || el.name === 'wallpaper_install_cost') {
                 const value = toNum(el.value);
                 const cursorPosition = el.selectionStart;
                 const oldLength = el.value.length;
                 el.value = value > 0 ? value.toLocaleString('en-US') : '';
                 const newLength = el.value.length;
                 el.setSelectionRange(cursorPosition + (newLength - oldLength), cursorPosition + (newLength - oldLength));
            }
            debouncedRecalcAndSave();
        });

        const handleDecoTypeChange = (target) => {
            const itemCard = target.closest(SELECTORS.decoItem);
            if (itemCard) {
                const displayEl = itemCard.querySelector('.deco-type-display');
                if (displayEl) {
                    const selectedText = target.options[target.selectedIndex]?.text || target.value;
                    displayEl.textContent = selectedText ? `(${selectedText})` : '';
                }
            }
        };

        orderForm.addEventListener("change", e => {
            if (e.target.name === 'deco_type') handleDecoTypeChange(e.target);
            if (e.target.matches('select[name="fabric_variant"]')) toggleSetFabricUI(e.target.closest(SELECTORS.set));
            debouncedRecalcAndSave();
        });

        orderForm.addEventListener("click", e => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;

            const action = btn.dataset.act;
            const roomEl = btn.closest(SELECTORS.room);

            const roomMenu = btn.closest('.room-options-menu');
            if (roomMenu) {
                roomMenu.classList.remove('show');
                roomEl?.classList.remove('overflow-visible');
            }

            const actions = {
                'add-set': () => addSet(roomEl), 'add-deco': () => addDeco(roomEl), 'add-wallpaper': () => addWallpaper(roomEl), 'add-wall': () => addWall(btn),
                'toggle-room-menu': () => {
                     e.preventDefault();
                     const menu = btn.nextElementSibling;
                     const card = btn.closest('.room-card');
                     const isOpening = !menu.classList.contains('show');
                     document.querySelectorAll('.room-options-menu.show').forEach(m => {
                         m.classList.remove('show');
                         m.closest('.room-card')?.classList.remove('overflow-visible');
                     });
                     if (isOpening) {
                        menu.classList.add('show');
                        card?.classList.add('overflow-visible');
                     }
                },
                'toggle-suspend-room': () => { e.preventDefault(); if(!roomEl) return; suspendRoom(roomEl, !(roomEl.dataset.suspended === 'true')); },
                'clear-room': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูลในห้อง', body: 'ยืนยันการลบทุกรายการในห้องนี้?', selector: SELECTORS.room, action: (item) => { item.querySelector(SELECTORS.setsContainer).innerHTML = ""; item.querySelector(SELECTORS.decorationsContainer).innerHTML = ""; item.querySelector(SELECTORS.wallpapersContainer).innerHTML = ""; }, toast: 'ล้างข้อมูลในห้องแล้ว' }),
                'del-room': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบห้อง', body: 'ยืนยันการลบห้องนี้?', selector: SELECTORS.room, action: animateAndRemove, toast: 'ลบห้องแล้ว' }),
                'del-set': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบจุด', body: 'ยืนยันการลบจุดติดตั้งนี้?', selector: SELECTORS.set, action: animateAndRemove, toast: 'ลบจุดผ้าม่านแล้ว' }),
                'del-deco': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบรายการ', body: 'ยืนยันการลบรายการตกแต่งนี้?', selector: SELECTORS.decoItem, action: animateAndRemove, toast: 'ลบรายการตกแต่งแล้ว' }),
                'del-wallpaper': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบรายการ', body: 'ยืนยันการลบรายการวอลเปเปอร์?', selector: SELECTORS.wallpaperItem, action: animateAndRemove, toast: 'ลบรายการวอลเปเปอร์แล้ว' }),
                'del-wall': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบผนัง', body: 'ยืนยันการลบผนังนี้?', selector: '.wall-input-row', action: animateAndRemove, toast: 'ลบผนังแล้ว' }),
                'clear-set': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูล', body: 'ยืนยันการล้างข้อมูลในจุดนี้?', selector: SELECTORS.set, action: (item) => { item.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : el.name === 'set_style' ? 'ลอน' : el.name === 'opening_style' ? 'แยกกลาง' : el.name === 'track_color' ? 'ขาว' : ''; }); toggleSetFabricUI(item); }, toast: 'ล้างข้อมูลผ้าม่านแล้ว' }),
                'clear-deco': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูล', body: 'ยืนยันการล้างข้อมูลในรายการนี้?', selector: SELECTORS.decoItem, action: (item) => { item.querySelectorAll('input, select').forEach(el => el.value = ''); item.querySelector('.deco-type-display').textContent = ''; }, toast: 'ล้างข้อมูลตกแต่งแล้ว' }),
                'clear-wallpaper': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูล', body: 'ยืนยันการล้างข้อมูลในรายการนี้?', selector: SELECTORS.wallpaperItem, action: (item) => { item.querySelectorAll('input').forEach(el => { el.value = (el.name === 'wallpaper_install_cost') ? '300' : ''; }); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); }, toast: 'ล้างข้อมูลวอลเปเปอร์แล้ว' }),
                'toggle-suspend': () => {
                    const item = btn.closest('.set-item, .deco-item, .wallpaper-item');
                    suspendItem(item, !(item.dataset.suspended === 'true'));
                    recalcAll(); saveData();
                }
            };
            if (actions[action]) {
                if (action !== 'toggle-room-menu') e.preventDefault();
                actions[action]();
            }
        });

        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => addRoom());
        document.querySelector(SELECTORS.lockBtn).addEventListener('click', toggleLock);

        document.querySelector(SELECTORS.exportPdfBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            menuDropdown.classList.remove('show');
            const options = await showExportOptionsModal();
            if (!options) return;

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

        // Other menu actions
        document.querySelector(SELECTORS.importBtn).addEventListener('click', (e) => {
            e.preventDefault();
            menuDropdown.classList.remove('show');
            fileImporter.click();
        });
        
        fileImporter.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const payload = JSON.parse(event.target.result);
                    loadPayload(payload);
                } catch (err) {
                    showToast('ไฟล์ JSON ไม่ถูกต้อง', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = null;
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
        document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => menuDropdown.classList.toggle('show'));

        // Initial Load
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
            addRoom(); // Start fresh if storage is corrupted
        }
        recalcAll();
        updateLockState();
    }

    document.addEventListener('DOMContentLoaded', init);
})();