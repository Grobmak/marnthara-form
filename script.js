(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/5.0.0-pdf-export";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path"; // NOTE: Secure this endpoint if used.
    const STORAGE_KEY = "marnthara.input.v4"; // Keep v4 for data compatibility

    // NEW: Shop & PDF Configuration - EDIT YOUR DETAILS HERE
    const SHOP_CONFIG = {
        name: "ม่านธารา ผ้าม่านและของตกแต่ง",
        address: "65/8 หมู่ 2 ต.ท่าศาลา อ.เมือง จ.ลพบุรี 15000",
        phone: "092-985-9395, 082-552-5595",
        taxId: "1234567890123",
        logoUrl: "https://i.imgur.com/l7y85nI.png", // Recommended: Use a square logo (e.g., 200x200px) hosted online
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
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
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
                if (details.length > 0) summaryHtml += ` (${details.join(', ')})`;
                set.querySelector('[data-set-summary]').innerHTML = summaryHtml;
                roomSum += totalSetPrice;
                grand += totalSetPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });

            // DECORATIONS
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                let decoPrice = 0;
                if (deco.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const type = deco.querySelector('input[name="deco_type"]')?.value;
                    const w = clamp01(deco.querySelector('input[name="deco_width_m"]')?.value);
                    const h = clamp01(deco.querySelector('input[name="deco_height_m"]')?.value);
                    const p = clamp01(deco.querySelector('input[name="deco_price_sqyd"]')?.value);
                    const sqyd = (w * h) * SQM_TO_SQYD;
                    if (w > 0 && h > 0 && p > 0) {
                        decoPrice = Math.round(sqyd * p);
                        if (type) {
                            if (!decoCounts[type]) decoCounts[type] = { count: 0, total: 0 };
                            decoCounts[type].count++;
                            decoCounts[type].total += decoPrice;
                        }
                        pricedItemCount++;
                    }
                }
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmtTH(decoPrice)}</b> บ.`;
                roomSum += decoPrice;
                grand += decoPrice;
            });

            // WALLPAPERS
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let wallpaperPrice = 0, totalRolls = 0, installCost = 0;
                if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const h = clamp01(wallpaper.querySelector('input[name="wallpaper_height_m"]')?.value);
                    const p = clamp01(wallpaper.querySelector('input[name="wallpaper_price_roll"]')?.value);
                    const i = clamp01(wallpaper.querySelector('input[name="wallpaper_install_cost"]')?.value);
                    const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                    if (totalWidth > 0 && h > 0) {
                        const rolls = CALC.wallpaperRolls(totalWidth, h);
                        totalRolls = rolls;
                        wallpaperPrice = Math.round(rolls * p);
                        installCost = Math.round(rolls * i);
                        pricedItemCount++;
                    }
                }
                const totalWallpaperPrice = wallpaperPrice + installCost;
                let summaryHtml = `รวม: <b>${fmtTH(totalWallpaperPrice)}</b> บ.`;
                const details = [];
                if (wallpaperPrice > 0) details.push(`ค่าของ: ${fmtTH(wallpaperPrice)}`);
                if (installCost > 0) details.push(`ค่าติดตั้ง: ${fmtTH(installCost)}`);
                if (details.length > 0) summaryHtml += ` (${details.join(', ')})`;
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = summaryHtml;
                roomSum += totalWallpaperPrice;
                grand += totalWallpaperPrice;
                totalWallpaperRolls += totalRolls;
            });

            // Update room brief
            const roomSummaryText = room.querySelector('[data-room-summary]');
            roomSummaryText.textContent = `${fmtTH(roomSum)} บ.`;
        });

        const grandTotal = grand;
        const totalVat = grandTotal * SHOP_CONFIG.vatRate;
        const grandTotalWithVat = grandTotal + totalVat;

        // Update overall summary
        document.querySelector(SELECTORS.grandTotal).textContent = `${fmtTH(grandTotal, 2)} บ.`;
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

        // Update detailed summary
        const detailedSummary = document.querySelector(SELECTORS.detailedSummaryContainer);
        let summaryHtml = '';

        if (pricedItemCount > 0) {
            summaryHtml += `<h4>ผ้าม่าน</h4><ul>`;
            if (grandOpaqueYards > 0) {
                summaryHtml += `<li>ผ้าทึบ: ${fmtTH(grandOpaqueYards, 2)} หลา</li>`;
            }
            if (grandSheerYards > 0) {
                summaryHtml += `<li>ผ้าโปร่ง: ${fmtTH(grandSheerYards, 2)} หลา</li>`;
            }
            if (grandOpaqueTrack > 0) {
                summaryHtml += `<li>รางผ้าม่าน: ${fmtTH(grandOpaqueTrack + (hasDoubleBracket ? grandSheerTrack : 0), 2)} ม.</li>`;
            }
            summaryHtml += `</ul>`;

            const decoKeys = Object.keys(decoCounts);
            if (decoKeys.length > 0) {
                summaryHtml += `<h4>ของตกแต่ง</h4><ul>`;
                decoKeys.forEach(type => {
                    summaryHtml += `<li>${type} (${decoCounts[type].count} ชิ้น): ${fmtTH(decoCounts[type].total)} บ.</li>`;
                });
                summaryHtml += `</ul>`;
            }

            if (totalWallpaperRolls > 0) {
                summaryHtml += `<h4>วอลล์เปเปอร์</h4><ul><li>${fmtTH(totalWallpaperRolls)} ม้วน</li></ul>`;
            }
        } else {
            summaryHtml = `<p>ยังไม่มีรายการที่คิดราคา</p>`;
        }
        detailedSummary.innerHTML = summaryHtml;

        saveData({ grandTotal, totalVat, grandTotalWithVat });
    }

    function renumber() {
        let setIndex = 1;
        let decoIndex = 1;
        let wallpaperIndex = 1;

        document.querySelectorAll(SELECTORS.room).forEach((room, roomIndex) => {
            const roomNumber = roomIndex + 1;
            room.querySelector(SELECTORS.roomNameInput).placeholder = `ชื่อห้อง #${roomNumber}`;
            room.dataset.index = roomNumber;
            const menu = room.querySelector('.room-options-menu');
            if (menu) {
                 menu.querySelectorAll('a').forEach(link => {
                    const text = link.textContent.replace(/ห้อง #\d+/, `ห้อง #${roomNumber}`);
                    link.innerHTML = text.replace(/ลบห้อง/, 'ลบห้อง');
                });
            }

            room.querySelectorAll(SELECTORS.set).forEach(set => {
                set.querySelector('[data-set-number]').textContent = `${setIndex++}`;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                deco.querySelector('[data-deco-number]').textContent = `${decoIndex++}`;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                wallpaper.querySelector('[data-wallpaper-number]').textContent = `${wallpaperIndex++}`;
            });
        });
    }

    // --- PDF EXPORT FUNCTIONALITY (NEW) ---
    function createPdfContent(payload) {
        const shop = SHOP_CONFIG;
        const customer = payload.customer_info;
        const totals = payload.totals;

        const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        const currentDate = new Date().toLocaleDateString('th-TH', dateOptions);

        let html = `
            <div id="pdf-container">
                <header class="pdf-header">
                    <div class="pdf-shop-details">
                        <img src="${shop.logoUrl}" alt="${shop.name}" class="pdf-logo">
                        <h1>${shop.name}</h1>
                        <p>ที่อยู่: ${shop.address}</p>
                        <p>โทร: ${shop.phone}</p>
                        <p>เลขประจำตัวผู้เสียภาษี: ${shop.taxId}</p>
                    </div>
                    <div class="pdf-quotation-info">
                        <h2>ใบเสนอราคา</h2>
                        <p>วันที่: ${currentDate}</p>
                        <p>เลขที่: ______________</p>
                    </div>
                </header>
                <div class="pdf-customer-info">
                    <h3>ข้อมูลลูกค้า</h3>
                    <p><strong>ชื่อ:</strong> ${customer.customer_name || 'ไม่ระบุ'}</p>
                    <p><strong>ที่อยู่:</strong> ${customer.customer_address || 'ไม่ระบุ'}</p>
                    <p><strong>เบอร์โทร:</strong> ${customer.customer_phone || 'ไม่ระบุ'}</p>
                </div>
        `;

        // Room and Item Details
        if (payload.rooms && payload.rooms.length > 0) {
            html += `<div class="pdf-item-details">`;
            let itemCounter = 1;
            payload.rooms.forEach(room => {
                if (room.is_suspended) return;

                html += `<h4 class="pdf-room-heading">${room.room_name || 'ไม่ระบุชื่อห้อง'}</h4>`;
                html += `<table class="pdf-table">
                            <thead>
                                <tr>
                                    <th style="width: 5%;">#</th>
                                    <th style="width: 55%;">รายละเอียด</th>
                                    <th style="width: 15%; text-align: right;">จำนวน</th>
                                    <th style="width: 25%; text-align: right;">รวม (บาท)</th>
                                </tr>
                            </thead>
                            <tbody>`;
                
                // Sets
                room.sets.forEach(set => {
                    if (set.is_suspended) return;
                    const style = set.style || 'ไม่ระบุ';
                    const variant = set.fabric_variant || 'ไม่ระบุ';
                    const width = set.width_m > 0 ? `${fmtTH(set.width_m, 2)} ม.` : 'ไม่ระบุ';
                    const height = set.height_m > 0 ? `${fmtTH(set.height_m, 2)} ม.` : 'ไม่ระบุ';
                    const price = set.total_price;
                    const details = [];
                    if (variant.includes('ทึบ')) details.push(`รหัสผ้า: ${set.fabric_code || '-'} (ราคา: ${fmtTH(set.price_per_m_raw)}/ม.)`);
                    if (variant.includes('โปร่ง')) details.push(`รหัสผ้าโปร่ง: ${set.sheer_fabric_code || '-'} (ราคา: ${fmtTH(set.sheer_price_per_m)}/ม.)`);
                    
                    html += `<tr>
                                <td class="pdf-item-number">${itemCounter++}</td>
                                <td class="pdf-item-desc">
                                    <strong>ผ้าม่าน ${variant} สไตล์ ${style}</strong>
                                    <br>ขนาด: กว้าง ${width} x สูง ${height}
                                    ${details.length > 0 ? `<br>${details.join('<br>')}` : ''}
                                    ${set.notes ? `<br><em>หมายเหตุ: ${set.notes}</em>` : ''}
                                </td>
                                <td class="pdf-item-qty">1 ชุด</td>
                                <td class="pdf-item-total">${fmtTH(price)}</td>
                            </tr>`;
                });

                // Decorations
                room.decorations.forEach(deco => {
                    if (deco.is_suspended) return;
                    const type = deco.type || 'ของตกแต่ง';
                    const width = deco.width_m > 0 ? `${fmtTH(deco.width_m, 2)} ม.` : 'ไม่ระบุ';
                    const height = deco.height_m > 0 ? `${fmtTH(deco.height_m, 2)} ม.` : 'ไม่ระบุ';
                    const price = deco.total_price;
                    html += `<tr>
                                <td class="pdf-item-number">${itemCounter++}</td>
                                <td class="pdf-item-desc">
                                    <strong>${type}</strong>
                                    <br>ขนาด: กว้าง ${width} x สูง ${height}
                                    <br>รหัส: ${deco.deco_code || '-'}
                                    ${deco.deco_notes ? `<br><em>หมายเหตุ: ${deco.deco_notes}</em>` : ''}
                                </td>
                                <td class="pdf-item-qty">1 ชุด</td>
                                <td class="pdf-item-total">${fmtTH(price)}</td>
                            </tr>`;
                });

                // Wallpapers
                room.wallpapers.forEach(wallpaper => {
                    if (wallpaper.is_suspended) return;
                    const rolls = wallpaper.total_rolls;
                    const height = wallpaper.height_m > 0 ? `${fmtTH(wallpaper.height_m, 2)} ม.` : 'ไม่ระบุ';
                    const walls = wallpaper.widths.map(w => `${fmtTH(w, 2)} ม.`).join(', ');
                    const price = wallpaper.total_price;
                    html += `<tr>
                                <td class="pdf-item-number">${itemCounter++}</td>
                                <td class="pdf-item-desc">
                                    <strong>วอลล์เปเปอร์</strong>
                                    <br>ความสูง: ${height} / ผนังกว้าง: ${walls}
                                    <br>รหัส: ${wallpaper.wallpaper_code || '-'}
                                    ${wallpaper.wallpaper_notes ? `<br><em>หมายเหตุ: ${wallpaper.wallpaper_notes}</em>` : ''}
                                </td>
                                <td class="pdf-item-qty">${fmtTH(rolls)} ม้วน</td>
                                <td class="pdf-item-total">${fmtTH(price)}</td>
                            </tr>`;
                });

                html += `</tbody></table>`;
            });
            html += `</div>`; // Close pdf-item-details
        }
        
        // Total Summary
        html += `
            <div class="pdf-footer-summary">
                <div class="pdf-amount-in-words">
                    <p>ตัวอักษร: ${bahttext(totals.grandTotalWithVat)}</p>
                    <p><strong>เงื่อนไขการชำระเงิน</strong></p>
                    <ul>
                        <li><small>การจองมัดจำงาน 50% ของราคารวมทั้งหมด</small></li>
                        <li><small>ชำระส่วนที่เหลือ 50% เมื่อติดตั้งงานแล้วเสร็จ</small></li>
                        <li><small>ใบเสนอราคามีอายุ 30 วันนับจากวันที่ออก</small></li>
                    </ul>
                </div>
                <div class="pdf-totals-block">
                    <table>
                        <tr><td class="pdf-label">รวม (ก่อนภาษี)</td><td class="pdf-amount">${fmtTH(totals.grandTotal, 2)} บ.</td></tr>
                        <tr><td class="pdf-label">ภาษีมูลค่าเพิ่ม ${SHOP_CONFIG.vatRate * 100}%</td><td class="pdf-amount">${fmtTH(totals.totalVat, 2)} บ.</td></tr>
                        <tr class="pdf-grand-total"><td class="pdf-label">รวมทั้งหมด</td><td class="pdf-amount">${fmtTH(totals.grandTotalWithVat, 2)} บ.</td></tr>
                    </table>
                </div>
            </div>
            <div class="pdf-signature-block">
                <div class="pdf-signature-column">
                    <p>ผู้เสนอราคา: .......................................</p>
                    <p>(${SHOP_CONFIG.name})</p>
                </div>
                <div class="pdf-signature-column">
                    <p>ผู้อนุมัติ: ...........................................</p>
                    <p>(ลูกค้า)</p>
                </div>
            </div>
            <p class="pdf-note">**ราคารวมนี้อาจมีการปรับเปลี่ยนตามข้อตกลงเพิ่มเติม</p>
        </div>`;

        return html;
    }

    function exportToPdf() {
        if (isLocked) {
            showToast('ปลดล็อคฟอร์มเพื่อสร้าง PDF', 'warning');
            return;
        }
        showToast('กำลังสร้าง PDF...', 'info');

        const payload = getPayloadData();
        const content = createPdfContent(payload);
        const container = document.getElementById('pdf-content-container');
        container.innerHTML = content;

        const opt = {
            margin:       10,
            filename:     'ใบเสนอราคา-ม่านธารา.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, logging: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };

        html2pdf().set(opt).from(container).save().then(() => {
            showToast('สร้าง PDF สำเร็จ!', 'success');
            container.innerHTML = '';
        }).catch(err => {
            console.error(err);
            showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
            container.innerHTML = '';
        });
    }


    // --- DATA HANDLING ---
    function getPayloadData() {
        const payload = {
            customer_info: {},
            rooms: [],
            totals: {}
        };
        const customerInfo = document.querySelector('#customerInfo');
        payload.customer_info.customer_name = customerInfo.querySelector('#customer_name').value;
        payload.customer_info.customer_phone = customerInfo.querySelector('#customer_phone').value;
        payload.customer_info.customer_address = customerInfo.querySelector('#customer_address').value;

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: []
            };

            // Sets
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const w = clamp01(setEl.querySelector('[name="width_m"]')?.value);
                const h = clamp01(setEl.querySelector('[name="height_m"]')?.value);
                const style = setEl.querySelector('[name="set_style"]')?.value;
                const variant = setEl.querySelector('[name="fabric_variant"]')?.value;
                const price_per_m_raw = clamp01(setEl.querySelector('[name="set_price_per_m"]')?.value);
                const sheer_price_per_m = clamp01(setEl.querySelector('[name="sheer_price_per_m"]')?.value);

                const opaquePrice = variant.includes('ทึบ') ? Math.round((price_per_m_raw + stylePlus(style) + heightPlus(h)) * w) : 0;
                const sheerPrice = variant.includes('โปร่ง') ? Math.round((sheer_price_per_m + stylePlus(style) + heightPlus(h)) * w) : 0;
                
                roomData.sets.push({
                    width_m: w, height_m: h, style: style, fabric_variant: variant,
                    price_per_m_raw: price_per_m_raw, sheer_price_per_m: sheer_price_per_m,
                    fabric_code: setEl.querySelector('[name="fabric_code"]')?.value,
                    sheer_fabric_code: setEl.querySelector('[name="sheer_fabric_code"]')?.value,
                    opening_style: setEl.querySelector('[name="opening_style"]')?.value,
                    track_color: setEl.querySelector('[name="track_color"]')?.value,
                    notes: setEl.querySelector('[name="notes"]')?.value,
                    total_price: opaquePrice + sheerPrice,
                    is_suspended: setEl.dataset.suspended === 'true'
                });
            });

            // Decorations
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const w = clamp01(decoEl.querySelector('[name="deco_width_m"]')?.value);
                const h = clamp01(decoEl.querySelector('[name="deco_height_m"]')?.value);
                const p = clamp01(decoEl.querySelector('[name="deco_price_sqyd"]')?.value);
                const sqyd = (w * h) * SQM_TO_SQYD;
                const price = Math.round(sqyd * p);
                
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value,
                    width_m: w, height_m: h, price_sqyd: p,
                    total_price: price,
                    deco_code: decoEl.querySelector('[name="deco_code"]')?.value,
                    deco_notes: decoEl.querySelector('[name="deco_notes"]')?.value,
                    is_suspended: decoEl.dataset.suspended === 'true'
                });
            });

            // Wallpapers
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const h = clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value);
                const p = clamp01(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value);
                const i = clamp01(wallpaperEl.querySelector('[name="wallpaper_install_cost"]')?.value);
                const widths = Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value));
                const totalWidth = widths.reduce((sum, val) => sum + val, 0);
                const rolls = CALC.wallpaperRolls(totalWidth, h);
                const total_price = Math.round((rolls * p) + (rolls * i));
                
                roomData.wallpapers.push({
                    height_m: h,
                    price_per_roll: p,
                    install_cost_per_roll: i,
                    widths: widths,
                    total_rolls: rolls,
                    total_price: total_price,
                    wallpaper_code: wallpaperEl.querySelector('[name="wallpaper_code"]')?.value,
                    wallpaper_notes: wallpaperEl.querySelector('[name="wallpaper_notes"]')?.value,
                    is_suspended: wallpaperEl.dataset.suspended === 'true'
                });
            });

            payload.rooms.push(roomData);
        });

        // Totals
        const currentGrandTotal = toNum(document.querySelector(SELECTORS.grandTotal).textContent.replace(/บ\./, '').trim());
        const vatRate = SHOP_CONFIG.vatRate;
        payload.totals.grandTotal = currentGrandTotal;
        payload.totals.totalVat = currentGrandTotal * vatRate;
        payload.totals.grandTotalWithVat = currentGrandTotal * (1 + vatRate);

        return payload;
    }

    function saveData(extraData = {}) {
        const payload = getPayloadData();
        payload.appVersion = APP_VERSION;
        Object.assign(payload.totals, extraData); // Merge totals
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function loadPayload(payload) {
        if (!payload || !payload.rooms) {
            showToast('ไฟล์ข้อมูลไม่ถูกต้องหรือไม่สมบูรณ์', 'error');
            return;
        }
        if (payload.appVersion !== APP_VERSION) {
            showToast('ข้อมูลถูกบันทึกด้วยเวอร์ชันเก่า, อาจมีการแสดงผลที่ไม่ถูกต้อง', 'warning');
        }

        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        roomsContainer.innerHTML = '';
        roomCount = 0;

        const customerInfo = document.querySelector('#customerInfo');
        customerInfo.querySelector('#customer_name').value = payload.customer_info?.customer_name || '';
        customerInfo.querySelector('#customer_phone').value = payload.customer_info?.customer_phone || '';
        customerInfo.querySelector('#customer_address').value = payload.customer_info?.customer_address || '';

        payload.rooms.forEach(room => addRoom(room));
        recalcAll();
        renumber();
        showToast('โหลดข้อมูลสำเร็จ', 'success');
    }

    // --- EVENT LISTENERS ---
    function initListeners() {
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const exportPdfBtn = document.querySelector(SELECTORS.exportPdfBtn);

        orderForm.addEventListener('input', debounce(e => {
            if (isLocked) return;
            const target = e.target;
            const item = target.closest(SELECTORS.set) || target.closest(SELECTORS.decoItem) || target.closest(SELECTORS.wallpaperItem);
            const parentRoom = target.closest(SELECTORS.room);
            if (item || parentRoom) {
                recalcAll();
                saveData();
            }
        }));

        roomsContainer.addEventListener('click', (e) => {
            if (isLocked) return;
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            e.preventDefault();
            
            const roomEl = e.target.closest(SELECTORS.room);

            const actions = {
                'add-set': () => addSet(roomEl),
                'add-deco': () => addDeco(roomEl),
                'add-wallpaper': () => addWallpaper(roomEl),
                'delete-set': (item) => performActionWithConfirmation(btn, { action: animateAndRemove, selector: SELECTORS.set, isRemoval: true, confirm: true, title: 'ยืนยันการลบ', body: 'คุณแน่ใจที่จะลบรายการนี้ใช่ไหม?', toast: 'ลบรายการแล้ว' }),
                'delete-deco': (item) => performActionWithConfirmation(btn, { action: animateAndRemove, selector: SELECTORS.decoItem, isRemoval: true, confirm: true, title: 'ยืนยันการลบ', body: 'คุณแน่ใจที่จะลบรายการนี้ใช่ไหม?', toast: 'ลบรายการแล้ว' }),
                'delete-wallpaper': (item) => performActionWithConfirmation(btn, { action: animateAndRemove, selector: SELECTORS.wallpaperItem, isRemoval: true, confirm: true, title: 'ยืนยันการลบ', body: 'คุณแน่ใจที่จะลบรายการนี้ใช่ไหม?', toast: 'ลบรายการแล้ว' }),
                'delete-room': (item) => performActionWithConfirmation(btn, { action: animateAndRemove, selector: SELECTORS.room, isRemoval: true, confirm: true, title: 'ยืนยันการลบ', body: 'การลบห้องจะลบข้อมูลทั้งหมดในห้องนี้ คุณแน่ใจหรือไม่?', toast: 'ลบห้องแล้ว' }),
                'add-room': () => addRoom(),
                'delete-wall': (item) => {
                    const row = item.closest('.wall-input-row');
                    if (row) {
                        row.remove();
                        recalcAll();
                        saveData();
                    }
                },
                'toggle-suspend': (item) => {
                    const isSuspended = item.dataset.suspended === 'true';
                    suspendItem(item, !isSuspended);
                    recalcAll();
                    saveData();
                },
                'toggle-suspend-room': (item) => {
                     const isSuspended = item.dataset.suspended === 'true';
                    suspendRoom(item, !isSuspended);
                },
                'toggle-set-menu': (item) => {
                    const menu = item.closest('.item-menu-container').querySelector('.item-options-menu');
                    const card = item.closest('.item-card');
                    card.classList.toggle('overflow-visible');
                    menu.classList.toggle('show');
                },
                'toggle-room-menu': (item) => {
                    document.querySelectorAll('.room-options-menu.show').forEach(m => {
                        if (m !== item.closest('.room-options-container').querySelector('.room-options-menu')) {
                            m.classList.remove('show');
                            m.closest('.room-card')?.classList.remove('overflow-visible');
                        }
                    });
                    const menu = item.closest('.room-options-container').querySelector('.room-options-menu');
                    const card = item.closest('.room-card');
                    card.classList.toggle('overflow-visible');
                    menu.classList.toggle('show');
                }
            };
            if (btn.dataset.act in actions) actions[btn.dataset.act](btn.closest('[data-room],[data-set],[data-deco-item],[data-wallpaper-item]') || btn);
        });

        // Add Room button at the bottom
        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => {
            if (isLocked) return;
            addRoom();
        });

        // General listeners for lock, clear, etc.
        lockBtn.addEventListener('click', toggleLockState);
        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', () => {
             performActionWithConfirmation(document.querySelector(SELECTORS.clearAllBtn), {
                action: () => {
                    localStorage.removeItem(STORAGE_KEY);
                    window.location.reload();
                },
                selector: 'body', isRemoval: true, confirm: true, title: 'ยืนยันการลบข้อมูล', body: 'การลบข้อมูลทั้งหมดจะทำให้คุณต้องเริ่มใหม่ คุณแน่ใจหรือไม่?', toast: 'ลบข้อมูลทั้งหมดแล้ว'
            });
        });
        document.querySelector(SELECTORS.clearItemsBtn).addEventListener('click', () => {
             performActionWithConfirmation(document.querySelector(SELECTORS.clearItemsBtn), {
                action: () => {
                    document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
                    roomCount = 0;
                    addRoom();
                },
                selector: 'body', isRemoval: true, confirm: true, title: 'ยืนยันการลบรายการ', body: 'การลบรายการทั้งหมดจะลบแค่ข้อมูลรายการ (ผ้าม่าน, ของตกแต่ง, วอลล์เปเปอร์) แต่ยังคงข้อมูลลูกค้าไว้', toast: 'ลบรายการทั้งหมดแล้ว'
            });
        });

        exportPdfBtn.addEventListener('click', exportToPdf);

        const toggleSetFabricUI = (setEl) => {
            const variantSelect = setEl.querySelector('select[name="fabric_variant"]');
            const sheerWrap = setEl.querySelector(SELECTORS.sheerWrap);
            const sheerCodeWrap = setEl.querySelector(SELECTORS.sheerCodeWrap);
            const updateVisibility = () => {
                const isSheer = variantSelect.value.includes('โปร่ง');
                sheerWrap.style.display = isSheer ? 'block' : 'none';
                sheerCodeWrap.style.display = isSheer ? 'block' : 'none';
            };
            variantSelect.addEventListener('change', updateVisibility);
            updateVisibility();
        };

        // Copy summary to clipboard
        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            if (isLocked) {
                showToast('ปลดล็อคฟอร์มเพื่อคัดลอก', 'warning');
                return;
            }
            const option = await showCopyOptionsModal();
            if (!option) return;

            const payload = getPayloadData();
            let text = '';
            if (option === 'customer') {
                const customerName = payload.customer_info?.customer_name || 'ลูกค้า';
                const grandTotalWithVat = payload.totals.grandTotalWithVat;
                const formattedPrice = fmtTH(grandTotalWithVat, 2);
                const phone = SHOP_CONFIG.phone;

                text = `💡 ใบเสนอราคาสำหรับคุณ ${customerName}\n\n`;
                
                payload.rooms.forEach(room => {
                    if (room.is_suspended) return;
                    text += `🏠 *ห้อง: ${room.room_name || 'ไม่ระบุ'}:*\n`;
                    room.sets.forEach(set => {
                        if (set.is_suspended) return;
                        text += `  - ${set.style || 'ผ้าม่าน'} ${set.fabric_variant || ''}: กว้าง ${fmtTH(set.width_m, 2)} ม. x สูง ${fmtTH(set.height_m, 2)} ม.\n`;
                    });
                    room.decorations.forEach(deco => {
                         if (deco.is_suspended) return;
                        text += `  - ${deco.type || 'ของตกแต่ง'}: กว้าง ${fmtTH(deco.width_m, 2)} ม. x สูง ${fmtTH(deco.height_m, 2)} ม.\n`;
                    });
                    room.wallpapers.forEach(wallpaper => {
                        if (wallpaper.is_suspended) return;
                        text += `  - วอลล์เปเปอร์: ความสูง ${fmtTH(wallpaper.height_m, 2)} ม.\n`;
                    });
                });
                text += `\n💰 *ราคารวม: ${formattedPrice} บาท*\n`;
                text += `\nขอบคุณที่ใช้บริการครับ\n☎️ ติดต่อสอบถามเพิ่มเติม: ${phone}`;

            } else if (option === 'internal') {
                const customerName = payload.customer_info?.customer_name || 'ลูกค้า';
                const totals = payload.totals;
                text = `-- ข้อมูลภายในสำหรับ ${customerName} --\n\n`;
                text += `รวม (ก่อนภาษี): ${fmtTH(totals.grandTotal, 2)} บ.\n`;
                text += `ภาษีมูลค่าเพิ่ม: ${fmtTH(totals.totalVat, 2)} บ.\n`;
                text += `รวมทั้งหมด: ${fmtTH(totals.grandTotalWithVat, 2)} บ.\n\n`;

                payload.rooms.forEach(room => {
                    text += `--- ห้อง: ${room.room_name || 'ไม่ระบุ'}${room.is_suspended ? ' (ระงับ)' : ''} ---\n`;
                    room.sets.forEach((set, i) => {
                        text += `  - ผ้าม่าน: ${set.style} ${set.fabric_variant}, กว้าง ${fmtTH(set.width_m, 2)} ม. x สูง ${fmtTH(set.height_m, 2)} ม. (${fmtTH(set.total_price)} บ.)${set.is_suspended ? ' (ระงับ)' : ''}\n`;
                    });
                    room.decorations.forEach(deco => {
                        text += `  - ของตกแต่ง: ${deco.type}, กว้าง ${fmtTH(deco.width_m, 2)} ม. x สูง ${fmtTH(deco.height_m, 2)} ม. (${fmtTH(deco.total_price)} บ.)${deco.is_suspended ? ' (ระงับ)' : ''}\n`;
                    });
                    room.wallpapers.forEach(wallpaper => {
                        text += `  - วอลล์เปเปอร์: ${fmtTH(wallpaper.total_rolls)} ม้วน (${fmtTH(wallpaper.total_price)} บ.)${wallpaper.is_suspended ? ' (ระงับ)' : ''}\n`;
                    });
                    text += '\n';
                });
            }

            try {
                await navigator.clipboard.writeText(text);
                showToast('คัดลอกข้อมูลสำเร็จ!', 'success');
            } catch (err) {
                console.error('Failed to copy: ', err);
                showToast('คัดลอกข้อมูลไม่สำเร็จ', 'error');
            }
        });

        // Import/Export JSON
        document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
            const data = getPayloadData();
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().slice(0, 10);
            a.download = `marnthara-data-${date}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Export ข้อมูลสำเร็จ', 'success');
        });
        document.querySelector(SELECTORS.importBtn).addEventListener('click', () => document.querySelector(SELECTORS.fileImporter).click());
        document.querySelector(SELECTORS.fileImporter).addEventListener('change', (e) => {
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
            if (!e.target.closest('.item-menu-container')) {
                 document.querySelectorAll('.item-options-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                    menu.closest('.item-card')?.classList.remove('overflow-visible');
                });
            }
        });
        document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => menuDropdown.classList.toggle('show'));
    }

    function toggleLockState() {
        isLocked = !isLocked;
        const lockIcon = document.querySelector('.lock-icon');
        const lockText = document.querySelector(SELECTORS.lockText);
        const orderForm = document.querySelector(SELECTORS.orderForm);

        lockIcon.className = isLocked ? 'ph-bold ph-lock-key-open lock-icon' : 'ph-bold ph-unlock lock-icon';
        lockText.textContent = isLocked ? 'ปลดล็อก' : 'ล็อก';
        orderForm.classList.toggle('is-locked', isLocked);
        orderForm.querySelectorAll('input, select, textarea, button:not(#lockBtn, #menuBtn, .btn-icon, .btn-secondary)').forEach(el => {
            el.disabled = isLocked;
        });

        showToast(isLocked ? 'ฟอร์มถูกล็อกแล้ว' : 'ฟอร์มถูกปลดล็อกแล้ว', 'info');
        updateLockState();
    }

    function updateLockState() {
        const orderForm = document.querySelector(SELECTORS.orderForm);
        orderForm.querySelectorAll('input, select, textarea, button:not(#lockBtn, #menuBtn, .btn-icon, .btn-secondary)').forEach(el => {
            el.disabled = isLocked;
        });
    }

    // Initial Load from localStorage
    function init() {
        initListeners();
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