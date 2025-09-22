(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/5.0.2-pdf-robust";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path"; // NOTE: Secure this endpoint if used.
    const STORAGE_KEY = "marnthara.input.v4"; // Keep v4 for data compatibility

    // NEW: Shop & PDF Configuration - EDIT YOUR DETAILS HERE
    const SHOP_CONFIG = {
        name: "ม่านธารา ผ้าม่านและของตกแต่ง",
        address: "65/8 หมู่ 2 ต.ท่าศาลา อ.เมือง จ.ลพบุรี 15000",
        phone: "092-985-9395, 082-552-5595",
        taxId: "1234567890123",
        // IMPORTANT: Add your publicly accessible logo URL here.
        // A square logo (e.g., 200x200px) hosted on a service like Imgur works best.
        // If left empty (''), the PDF will be generated without a logo.
        logoUrl: "", // EXAMPLE: "https://i.imgur.com/l7y85nI.png"
        vatRate: 0.07 // 7% VAT. Set to 0 to disable.
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
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '#walls-container',
        sheerWrap: '[data-sheer-wrap]',
        sheerCodeWrap: '[data-sheer-code-wrap]',
        roomNameInput: 'input[name="room_name"]',
        toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', fileImporter: '#fileImporter',
        submitBtn: '#submitBtn',
        clearItemsBtn: '#clearItemsBtn',
        exportPdfBtn: '#exportPdfBtn'
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
        const options = {
            minimumFractionDigits: asCurrency ? 2 : fixed,
            maximumFractionDigits: asCurrency ? 2 : fixed
        };
        return n.toLocaleString('en-US', options);
    };
    const fmtTH = (n, fixed = 0) => {
        if (!Number.isFinite(n)) return "0";
         const options = {
            minimumFractionDigits: fixed,
            maximumFractionDigits: fixed
        };
        return n.toLocaleString('th-TH', options);
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
        let bahtTxt = '';
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
                    const isMillion = (strN.length - i - 1) % 6 === 0 && i !== strN.length - 1;
                    if (isMillion) {
                        output += convert(strN.substring(0, i + 1)) + 'ล้าน';
                        return output + convert(strN.substring(i + 1));
                    }
                    output += txtNumArr[digit];
                    output += txtDigitArr[strN.length - i - 1];
                }
            }
            return output;
        }

        bahtTxt = convert(integerPart);
        bahtTxt = bahtTxt.replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด');
        bahtTxt += 'บาท';

        if (satang > 0) {
            let satangTxt = convert(satang);
            satangTxt = satangTxt.replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด');
            bahtTxt += satangTxt + 'สตางค์';
        } else {
            bahtTxt += 'ถ้วน';
        }
        return bahtTxt;
    }


    const animateAndScroll = (element) => {
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('item-created');
        element.addEventListener('animationend', () => {
            element.classList.remove('item-created');
        }, { once: true });
    };

    function animateAndRemove(item) {
        if (!item) return;
        const parentContainer = item.parentElement.closest('.card, .items-container');
        if (parentContainer) {
            parentContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
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

        const icons = {
            success: 'ph-bold ph-check-circle',
            warning: 'ph-bold ph-warning',
            error: 'ph-bold ph-x-circle',
            default: 'ph-bold ph-info'
        };

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
        const selected = modalEl.querySelector('input[name="copy_option"]:checked');
        return selected ? selected.value : false;
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

    // --- PERSISTENCE ---
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

    // --- UI HELPERS & STATE MANAGEMENT ---
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

    // --- TEXT SUMMARY BUILDERS (LINE-Optimized) ---
    function buildCustomerSummary(payload) {
        let summary = "";
        let grandTotal = 0;
        summary += `สรุปใบเสนอราคา\n`;
        summary += `ลูกค้า: ${payload.customer_name || '-'}\n`;
        summary += `โทร: ${payload.customer_phone || '-'}\n\n`;
        payload.rooms.forEach((room, rIdx) => {
            if (room.is_suspended) return;
            let roomTotal = 0;
            let roomDetailsText = "";
            let hasContent = false;
            room.sets.forEach((set, sIdx) => {
                if (set.is_suspended) return;
                let setPrice = 0;
                const hPlus = heightPlus(set.height_m);
                const sPlus = stylePlus(set.style);
                if (set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0) {
                    setPrice += Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m);
                }
                if (set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0) {
                    setPrice += Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m);
                }
                if (setPrice > 0) {
                    roomTotal += setPrice;
                    hasContent = true;
                    roomDetailsText += ` - ผ้าม่าน #${sIdx + 1}: ${fmtTH(setPrice)} บ.\n`;
                }
            });
            room.decorations.forEach((deco, dIdx) => {
                if (deco.is_suspended) return;
                const decoPrice = Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
                if(decoPrice > 0) {
                    roomTotal += decoPrice;
                    hasContent = true;
                    roomDetailsText += ` - ${deco.type || 'ตกแต่ง'} #${dIdx + 1}: ${fmtTH(decoPrice)} บ.\n`;
                }
            });
            room.wallpapers.forEach((wp, wIdx) => {
                if (wp.is_suspended) return;
                const totalWidth = wp.widths.reduce((a,b) => a + b, 0);
                const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                const materialPrice = Math.round(rolls * wp.price_per_roll);
                const installPrice = Math.round(rolls * (wp.install_cost_per_roll || 0));
                const wpPrice = materialPrice + installPrice;
                if (wpPrice > 0) {
                    roomTotal += wpPrice;
                    hasContent = true;
                    roomDetailsText += ` - วอลเปเปอร์ #${wIdx + 1}: ${fmtTH(wpPrice)} บ.\n`;
                }
            });
            if (hasContent) {
                summary += `*ห้อง ${room.room_name || `ห้อง ${rIdx + 1}`}*\n`;
                summary += `(รวม ${fmtTH(roomTotal)} บ.)\n${roomDetailsText}\n`;
            }
            grandTotal += roomTotal;
        });
        summary += `====================\n`;
        summary += `*รวมราคาสุทธิ: ${fmtTH(grandTotal)} บาท*\n`;
        return summary;
    }

    function buildSeamstressSummary(payload) {
        let summary = `*สรุปงานเย็บผ้า*\nลูกค้า: ${payload.customer_name || '-'}\n`;
        summary += `====================\n`;
        let hasCurtains = false;
        payload.rooms.forEach((room, rIdx) => {
            if (room.is_suspended) return;
            const sets = room.sets.filter(s => !s.is_suspended && s.width_m > 0 && s.height_m > 0);
            if (sets.length === 0) return;
            hasCurtains = true;
            summary += `\n*ห้อง: ${room.room_name || `ห้อง ${rIdx + 1}`}*\n`;
            sets.forEach((set, sIdx) => {
                summary += `\n*ชุดที่ ${sIdx + 1} (${set.fabric_variant})*\n`;
                summary += `ขนาด:\n`;
                summary += ` กว้าง ${fmtTH(set.width_m, 2)} x สูง ${fmtTH(set.height_m, 2)} ม.\n`;
                summary += `รูปแบบ: ${set.style}\n`;
                summary += `การเปิด: ${set.opening_style}\n`;
                if (set.fabric_variant === "ทึบ&โปร่ง") {
                    summary += `รหัสผ้าทึบ: ${set.fabric_code || '-'}\n`;
                    summary += `รหัสผ้าโปร่ง: ${set.sheer_fabric_code || '-'}\n`;
                } else {
                    summary += `รหัสผ้า: ${set.fabric_code || '-'}\n`;
                }
                summary += `หมายเหตุ: ${set.notes || '-'}\n`;
            });
            summary += `--------------------\n`;
        });
        if (!hasCurtains) {
            return "ไม่มีรายการผ้าม่านที่ต้องผลิตในใบเสนอนี้";
        }
        return summary;
    }

    function buildOwnerSummary(payload) {
        let summary = `*สรุปทั้งหมด (ร้านค้า)*\n`;
        let grandTotal = 0;
        summary += `ลูกค้า: ${payload.customer_name || '-'}\n`;
        summary += `โทร: ${payload.customer_phone || '-'}\n`;
        summary += `====================\n`;
        payload.rooms.forEach((room, rIdx) => {
            if (room.is_suspended) return;
            let roomTotal = 0;
            let roomDetailsText = "";
            let hasContent = false;
            room.sets.forEach((set, sIdx) => {
                if (set.is_suspended) return;
                let setPrice = 0;
                const hPlus = heightPlus(set.height_m);
                const sPlus = stylePlus(set.style);
                let isPriced = false;
                if (set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0) {
                    setPrice += Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m);
                    isPriced = true;
                }
                if (set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0) {
                    setPrice += Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m);
                    isPriced = true;
                }
                if (isPriced) {
                    roomTotal += setPrice;
                    hasContent = true;
                    const yarnage = CALC.fabricYardage(set.style, set.width_m);
                    const costPerM = set.price_per_m_raw;
                    roomDetailsText += ` - ผ้าม่าน #${sIdx+1}: ${fmtTH(setPrice)} บ. (ผ้าทึบ: ${set.fabric_code||'-'}, ราคา: ${fmtTH(costPerM)}/ม., ผ้าโปร่ง: ${set.sheer_fabric_code||'-'}, ราคา: ${fmtTH(set.sheer_price_per_m||0)}/ม.)\n`;
                }
            });
            room.decorations.forEach((deco, dIdx) => {
                if (deco.is_suspended) return;
                const decoPrice = Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
                if (decoPrice > 0) {
                    roomTotal += decoPrice;
                    hasContent = true;
                    roomDetailsText += ` - ${deco.type||'ตกแต่ง'} #${dIdx+1}: ${fmtTH(decoPrice)} บ. (รหัส: ${deco.deco_code||'-'}, ราคา/ตร.หลา: ${fmtTH(deco.price_sqyd)} บ.)\n`;
                }
            });
            room.wallpapers.forEach((wp, wIdx) => {
                if (wp.is_suspended) return;
                const totalWidth = wp.widths.reduce((a,b) => a + b, 0);
                const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                const materialPrice = Math.round(rolls * wp.price_per_roll);
                const installPrice = Math.round(rolls * (wp.install_cost_per_roll || 0));
                const wpPrice = materialPrice + installPrice;
                if (wpPrice > 0) {
                    roomTotal += wpPrice;
                    hasContent = true;
                    roomDetailsText += ` - วอลเปเปอร์ #${wIdx+1}: ${fmtTH(wpPrice)} บ. (${rolls} ม้วน @ ${fmtTH(wp.price_per_roll)} บ./ม้วน)\n`;
                }
            });
            if (hasContent) {
                summary += `*ห้อง ${room.room_name || `ห้อง ${rIdx + 1}`}* (รวม: ${fmtTH(roomTotal)} บ.)\n${roomDetailsText}\n`;
            }
            grandTotal += roomTotal;
        });
        summary += `====================\n`;
        summary += `*รวมทั้งหมด: ${fmtTH(grandTotal)} บาท*\n`;
        return summary;
    }

    // --- PDF Generation (OVERHAULED FOR SERVER-SIDE RELIABILITY) ---
    async function generatePdfQuotation() {
        showToast('กำลังสร้างใบเสนอราคา...', 'default');
        const payload = buildPayload();

        // ตรวจสอบว่ามีรายการที่สามารถคำนวณราคาได้หรือไม่
        const hasPricedItems = payload.rooms.some(room => {
            if (room.is_suspended) return false;
            const hasSet = room.sets.some(s => !s.is_suspended && s.width_m > 0 && s.price_per_m_raw > 0);
            const hasDeco = room.decorations.some(d => !d.is_suspended && d.width_m > 0 && d.price_sqyd > 0);
            const hasWallpaper = room.wallpapers.some(w => !w.is_suspended && w.widths.reduce((a, b) => a + b, 0) > 0 && w.price_per_roll > 0);
            return hasSet || hasDeco || hasWallpaper;
        });

        if (!hasPricedItems) {
            showToast('ไม่มีรายการที่มีราคาสำหรับสร้างใบเสนอราคา', 'warning');
            return;
        }

        // ---  สำคัญ! นี่คือ URL ของ Serverless Function ที่คุณจะต้องสร้างในขั้นตอนถัดไป ---
        const PDF_GENERATOR_URL = "YOUR_SERVERLESS_FUNCTION_URL_HERE"; // <--- ใส่ URL ของคุณที่นี่

        if (PDF_GENERATOR_URL === "YOUR_SERVERLESS_FUNCTION_URL_HERE") {
             showToast('ยังไม่ได้ตั้งค่า URL สำหรับสร้าง PDF', 'error');
             console.error("Please set your PDF_GENERATOR_URL in script.js");
             return;
        }

        try {
            const response = await fetch(PDF_GENERATOR_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                // หากเซิร์ฟเวอร์ตอบกลับมาว่ามีปัญหา
                const errorData = await response.json();
                throw new Error(errorData.message || `เกิดข้อผิดพลาดบนเซิร์ฟเวอร์: ${response.statusText}`);
            }

            // รับไฟล์ PDF กลับมาเป็น Blob (Binary Large Object)
            const pdfBlob = await response.blob();

            // สร้าง URL ชั่วคราวสำหรับไฟล์ Blob ที่ได้รับ
            const url = window.URL.createObjectURL(pdfBlob);
            
            // สร้าง element 'a' เพื่อทำการดาวน์โหลด
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;

            // ตั้งชื่อไฟล์
            const today = new Date();
            const quoteNumber = `QT-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
            const customerName = payload.customer_name.trim().replace(/\s+/g, '-') || 'quote';
            a.download = `${quoteNumber}_${customerName}.pdf`;
            
            document.body.appendChild(a);
            a.click(); // สั่งให้เบราว์เซอร์ดาวน์โหลดไฟล์

            // เคลียร์ URL ที่สร้างขึ้นชั่วคราว
            window.URL.revokeObjectURL(url);
            a.remove();
            
            showToast('สร้าง PDF สำเร็จ!', 'success');

        } catch (error) {
            console.error("PDF Generation Error:", error);
            showToast(`สร้าง PDF ล้มเหลว: ${error.message}`, 'error');
        }
    }


    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const fileImporter = document.querySelector(SELECTORS.fileImporter);

        // Debounce for form inputs
        orderForm?.addEventListener('input', debounce(() => {
            recalcAll();
            saveData();
        }, 300));

        // Add Room Button in Footer
        document.querySelector(SELECTORS.addRoomFooterBtn)?.addEventListener('click', () => addRoom());
        document.querySelector(SELECTORS.clearAllBtn)?.addEventListener('click', async () => {
            if (await showConfirmation("ยืนยันการล้างข้อมูล", "คุณแน่ใจหรือไม่ที่จะลบข้อมูลทั้งหมดในฟอร์มนี้? การกระทำนี้ไม่สามารถย้อนกลับได้")) {
                document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
                roomCount = 0;
                addRoom();
                recalcAll();
                saveData();
                showToast("ล้างข้อมูลทั้งหมดแล้ว", "success");
            }
        });

        // Event Delegation for dynamic elements
        roomsContainer.addEventListener('click', async (e) => {
            const act = e.target.closest('[data-act]');
            if (!act || isLocked) return;

            const actions = {
                "add-set": { action: (room) => addSet(room) },
                "add-deco": { action: (room) => addDeco(room) },
                "add-wallpaper": { action: (room) => addWallpaper(room) },
                "remove-room": {
                    selector: SELECTORS.room,
                    action: animateAndRemove,
                    isRemoval: true,
                    confirm: true,
                    title: "ยืนยันการลบห้อง",
                    body: "คุณแน่ใจหรือไม่ที่จะลบห้องนี้? การกระทำนี้ไม่สามารถย้อนกลับได้",
                },
                "remove-item": {
                    selector: ".set-item, .deco-item, .wallpaper-item",
                    action: animateAndRemove,
                    isRemoval: true,
                    confirm: true,
                    title: "ยืนยันการลบรายการ",
                    body: "คุณแน่ใจหรือไม่ที่จะลบรายการนี้? การกระทำนี้ไม่สามารถย้อนกลับได้",
                },
                "add-wall": { action: (item, btn) => addWall(btn) },
                "remove-wall": {
                    selector: ".wall-input-row",
                    action: animateAndRemove,
                    isRemoval: true,
                },
                "toggle-suspend": {
                    selector: ".set-item, .deco-item, .wallpaper-item",
                    action: (item) => suspendItem(item, item.dataset.suspended !== 'true'),
                },
                "toggle-suspend-room": {
                    selector: SELECTORS.room,
                    action: (room) => suspendRoom(room, room.dataset.suspended !== 'true'),
                },
                "toggle-menu": {
                    action: (room) => {
                        const menu = room.querySelector('.room-options-menu');
                        if (menu) {
                            menu.classList.toggle('show');
                            room.classList.toggle('overflow-visible');
                        }
                    }
                },
                "move-up": {
                    selector: ".set-item, .deco-item, .wallpaper-item",
                    action: (item) => {
                        const prev = item.previousElementSibling;
                        if (prev) item.parentElement.insertBefore(item, prev);
                        renumber();
                        saveData();
                    }
                },
                "move-down": {
                    selector: ".set-item, .deco-item, .wallpaper-item",
                    action: (item) => {
                        const next = item.nextElementSibling;
                        if (next) item.parentElement.insertBefore(next, item);
                        renumber();
                        saveData();
                    }
                },
                "copy-item": {
                    selector: ".set-item, .deco-item, .wallpaper-item",
                    action: (item) => {
                         const roomEl = item.closest(SELECTORS.room);
                         const payload = buildPayload();
                         const roomIndex = Array.from(document.querySelectorAll(SELECTORS.room)).indexOf(roomEl);
                         let itemData = null;
                         if (item.classList.contains('set-item')) {
                             const setIndex = Array.from(roomEl.querySelectorAll('.set-item')).indexOf(item);
                             itemData = payload.rooms[roomIndex].sets[setIndex];
                             addSet(roomEl, itemData);
                         } else if (item.classList.contains('deco-item')) {
                             const decoIndex = Array.from(roomEl.querySelectorAll('.deco-item')).indexOf(item);
                             itemData = payload.rooms[roomIndex].decorations[decoIndex];
                             addDeco(roomEl, itemData);
                         } else if (item.classList.contains('wallpaper-item')) {
                             const wpIndex = Array.from(roomEl.querySelectorAll('.wallpaper-item')).indexOf(item);
                             itemData = payload.rooms[roomIndex].wallpapers[wpIndex];
                             addWallpaper(roomEl, itemData);
                         }
                         showToast('คัดลอกรายการสำเร็จ', 'success');
                    }
                }
            };
            const config = actions[act.dataset.act];
            if (config) {
                const item = act.closest(config.selector || SELECTORS.room);
                if (item) {
                    if (config.confirm) {
                        if (await showConfirmation(config.title, config.body)) {
                            config.action(item);
                        }
                    } else {
                        config.action(item);
                    }
                }
            }
        });

        // Event Delegation for select changes
        roomsContainer.addEventListener('change', (e) => {
            const selectEl = e.target;
            if (selectEl.matches('select[name="fabric_variant"]')) {
                toggleSetFabricUI(selectEl.closest(SELECTORS.set));
            } else if (selectEl.matches('select[name="deco_type"]')) {
                const decoItem = selectEl.closest(SELECTORS.decoItem);
                const displayEl = decoItem?.querySelector('.deco-type-display');
                if (displayEl) displayEl.textContent = `(${selectEl.value.trim()})`;
            }
        });

        // Other buttons
        document.querySelector(SELECTORS.lockBtn)?.addEventListener('click', toggleLock);
        document.querySelector(SELECTORS.copyTextBtn)?.addEventListener('click', async () => {
            const choice = await showCopyOptionsModal();
            if (choice) {
                const payload = buildPayload();
                let text = '';
                if (choice === 'customer') text = buildCustomerSummary(payload);
                else if (choice === 'seamstress') text = buildSeamstressSummary(payload);
                else if (choice === 'owner') text = buildOwnerSummary(payload);
                
                try {
                    await navigator.clipboard.writeText(text);
                    showToast('คัดลอกข้อมูลสำเร็จ!', 'success');
                } catch (err) {
                    console.error("Failed to copy text:", err);
                    showToast('คัดลอกข้อมูลไม่สำเร็จ', 'error');
                }
            }
        });

        document.querySelector(SELECTORS.exportBtn)?.addEventListener('click', () => {
            const payload = buildPayload();
            const jsonStr = JSON.stringify(payload, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const today = new Date();
            const fileName = `quotation-data-${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}.json`;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('ส่งออกข้อมูลสำเร็จ', 'success');
        });

        document.querySelector(SELECTORS.importBtn)?.addEventListener('click', () => fileImporter.click());

        fileImporter?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
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
            e.target.value = null;
        });

        // Menu & Popup Toggles
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

        // Handle PDF Export
        document.querySelector(SELECTORS.exportPdfBtn)?.addEventListener('click', generatePdfQuotation);
    }

    function init() {
        setupEventListeners();
        // Initial Load from localStorage
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