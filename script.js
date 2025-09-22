(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/5.0.0-pdf-export";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path"; // NOTE: Secure this endpoint if used.
    const STORAGE_KEY = "marnthara.input.v4"; // Keep v4 for data compatibility

    // NEW: Shop & PDF Configuration - EDIT YOUR DETAILS HERE
    const SHOP_CONFIG = {
        name: "ม่านธารา ผ้าม่านและของตกแต่ง",
        address: "123 หมู่ 4 ต.วังเพลิง อ.โคกสำโรง จ.ลพบุรี 15120",
        phone: "081-234-5678",
        taxId: "1234567890123",
        logoUrl: "https://i.imgur.com/l7y85nI.png", // Recommended: Use a square logo (e.g., 200x200px) hosted online
        vatRate: 0.07 // 7% VAT. Set to 0 to disable.
    };

    const SQM_TO_SQYD = 1.19599;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
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
                if (opaquePrice > 0) details.push(`ทึบ: ${fmtTH(opaquePrice)} บ.`);
                if (sheerPrice > 0) details.push(`โปร่ง: ${fmtTH(sheerPrice)} บ.`);
                if (details.length > 0) {
                    summaryHtml += `<br><small>(${details.join(', ')})</small>`;
                }
                const isSuspended = set.dataset.suspended === 'true' || isRoomSuspended;
                set.querySelector('[data-set-summary]').innerHTML = isSuspended ? 'ระงับรายการนี้' : summaryHtml;

                roomSum += totalSetPrice;
                grand += totalSetPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });

            // DECORATION ITEMS
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                let decoPrice = 0;
                if (deco.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                    const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                    const pricePerSqyd = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                    if (w > 0 && h > 0 && pricePerSqyd > 0) {
                        decoPrice = Math.round(w * h * SQM_TO_SQYD * pricePerSqyd);
                        const type = deco.querySelector('[name="deco_type"]')?.value || "ของตกแต่ง";
                        decoCounts[type] = (decoCounts[type] || 0) + 1;
                        pricedItemCount++;
                    }
                }
                const isSuspended = deco.dataset.suspended === 'true' || isRoomSuspended;
                deco.querySelector('[data-deco-summary]').textContent = isSuspended ? 'ระงับรายการนี้' : `ราคา: ${fmtTH(decoPrice)} บ.`;
                roomSum += decoPrice;
                grand += decoPrice;
            });

            // WALLPAPER ITEMS
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let totalWidth = 0;
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                    totalWidth += clamp01(input.value);
                });
                const rolls = CALC.wallpaperRolls(totalWidth, h);
                const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                const installCostPerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_install_cost"]')?.value);
                let wallpaperPrice = 0;
                if (rolls > 0) {
                    wallpaperPrice = rolls * (pricePerRoll + installCostPerRoll);
                    pricedItemCount++;
                }
                const isSuspended = wallpaper.dataset.suspended === 'true' || isRoomSuspended;
                const summaryText = isSuspended ? 'ระงับรายการนี้' : `จำนวน ${fmtTH(rolls)} ม้วน | ราคา: ${fmtTH(wallpaperPrice)} บ.`;
                wallpaper.querySelector('[data-wallpaper-summary]').textContent = summaryText;
                roomSum += wallpaperPrice;
                grand += wallpaperPrice;
                totalWallpaperRolls += rolls;
            });

            // Update room summary
            const roomSummary = room.querySelector('.room-brief');
            if (roomSummary) {
                if (room.dataset.suspended === 'true') {
                    roomSummary.textContent = "ห้องนี้ถูกระงับ";
                } else {
                    roomSummary.textContent = `${fmtTH(roomSum, 2)} บ.`;
                }
            }
        });

        // --- FINAL SUMMARY ---
        // VAT Calculation fix - ensure vat is a number with two decimal places
        const vat = Number((grand * SHOP_CONFIG.vatRate).toFixed(2));
        const grandTotalWithVat = grand + vat;
        const grandTotal = grand + vat;
        
        // Update PDF Preview Summary (if it exists)
        const detailedSummary = document.querySelector(SELECTORS.detailedSummaryContainer);
        if (detailedSummary) {
            let detailsHtml = `
            <h3><i class="ph-bold ph-package"></i> สรุปวัสดุ</h3>
            <table>
                <tbody>
                    <tr>
                        <td><b>รวมงานผ้าม่าน</b></td>
                        <td class="numeric">${fmtTH(grandOpaqueYards, 2)} หลา</td>
                    </tr>
                    <tr>
                        <td><b>รวมงานผ้าโปร่ง</b></td>
                        <td class="numeric">${fmtTH(grandSheerYards, 2)} หลา</td>
                    </tr>
                    <tr>
                        <td><b>รวมความยาวราง</b></td>
                        <td class="numeric">${fmtTH(grandOpaqueTrack + grandSheerTrack, 2)} ม.</td>
                    </tr>
            `;

            for (const [type, count] of Object.entries(decoCounts)) {
                 detailsHtml += `<tr><td><b>${type}</b></td><td class="numeric">${count} ชุด</td></tr>`;
            }

            if (totalWallpaperRolls > 0) {
                detailsHtml += `<tr><td><b>รวมวอลล์เปเปอร์</b></td><td class="numeric">${fmtTH(totalWallpaperRolls)} ม้วน</td></tr>`;
            }

            detailedSummary.innerHTML = detailsHtml + `</tbody></table>`;
        }


        // Update footer totals
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount.toLocaleString("th-TH");
        document.querySelector(SELECTORS.grandTotal).innerHTML = `<span>${fmtTH(grandTotal, 2)}</span>`;

        // Update PDF generation data payload
        const payloadEl = document.querySelector(SELECTORS.payloadInput);
        if (payloadEl) {
            const formData = new FormData(document.querySelector(SELECTORS.orderForm));
            const data = {};
            for (const [key, value] of formData.entries()) {
                data[key] = value;
            }
            data.grandTotal = grand;
            data.vat = vat;
            data.grandTotalWithVat = grandTotalWithVat;
            data.grandOpaqueYards = grandOpaqueYards;
            data.grandSheerYards = grandSheerYards;
            data.grandOpaqueTrack = grandOpaqueTrack;
            data.grandSheerTrack = grandSheerTrack;
            data.totalWallpaperRolls = totalWallpaperRolls;
            data.hasDoubleBracket = hasDoubleBracket;
            data.decoCounts = decoCounts;
            data.bahtText = bahttext(grandTotal);
            payloadEl.value = JSON.stringify(data);
        }
    }

    // --- EVENT LISTENERS & DELEGATION ---
    function setupEventListeners() {
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const addRoomBtn = document.querySelector(SELECTORS.addRoomFooterBtn);
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const clearAllBtn = document.querySelector(SELECTORS.clearAllBtn);
        const clearItemsBtn = document.querySelector(SELECTORS.clearItemsBtn);
        const copyTextBtn = document.querySelector(SELECTORS.copyTextBtn);
        const exportPdfBtn = document.querySelector(SELECTORS.exportPdfBtn);
        const importBtn = document.querySelector(SELECTORS.importBtn);
        const exportBtn = document.querySelector(SELECTORS.exportBtn);
        const fileImporter = document.querySelector(SELECTORS.fileImporter);

        if (!roomsContainer || !orderForm) { console.error("Required DOM elements not found."); return; }

        orderForm.addEventListener('input', debounce(() => {
            recalcAll();
            saveData();
        }));

        document.addEventListener('click', async (e) => {
            if (e.target.closest('[data-act="add-set"]')) {
                const room = e.target.closest(SELECTORS.room);
                if (room) addSet(room);
            }
            if (e.target.closest('[data-act="add-deco"]')) {
                const room = e.target.closest(SELECTORS.room);
                if (room) addDeco(room);
            }
            if (e.target.closest('[data-act="add-wallpaper"]')) {
                const room = e.target.closest(SELECTORS.room);
                if (room) addWallpaper(room);
            }
            if (e.target.closest('[data-act="add-wall"]')) {
                addWall(e.target.closest('[data-act="add-wall"]'));
                recalcAll();
                saveData();
            }

            const actions = {
                'remove-room': { selector: SELECTORS.room, action: animateAndRemove, isRemoval: true, confirm: true, title: 'ลบห้องนี้?', body: 'ข้อมูลทั้งหมดในห้องนี้จะถูกลบอย่างถาวร' },
                'remove-set': { selector: SELECTORS.set, action: animateAndRemove, isRemoval: true, confirm: true, title: 'ลบรายการนี้?', body: 'รายการนี้จะถูกลบอย่างถาวร' },
                'remove-deco': { selector: SELECTORS.decoItem, action: animateAndRemove, isRemoval: true, confirm: true, title: 'ลบรายการนี้?', body: 'รายการนี้จะถูกลบอย่างถาวร' },
                'remove-wallpaper': { selector: SELECTORS.wallpaperItem, action: animateAndRemove, isRemoval: true, confirm: true, title: 'ลบรายการนี้?', body: 'รายการนี้จะถูกลบอย่างถาวร' },
                'remove-wall': { selector: '.wall-input-row', action: (item) => { item.remove(); }, isRemoval: true, confirm: false },
                'toggle-suspend': { selector: '[data-suspended]', action: (item) => suspendItem(item, item.dataset.suspended !== 'true'), isRemoval: false },
                'toggle-suspend-room': { selector: SELECTORS.room, action: (item) => suspendRoom(item, item.dataset.suspended !== 'true'), isRemoval: false },
                'toggle-room-menu': { selector: SELECTORS.room, action: (item, btn) => {
                        e.stopPropagation();
                        const menu = item.querySelector('.room-options-menu');
                        const card = item.closest('.card');
                        document.querySelectorAll('.room-options-menu.show').forEach(m => m !== menu && m.classList.remove('show'));
                        document.querySelectorAll('.room-card.overflow-visible').forEach(c => c !== card && c.classList.remove('overflow-visible'));
                        if (menu && card) {
                            menu.classList.toggle('show');
                            card.classList.toggle('overflow-visible', menu.classList.contains('show'));
                        }
                     }, isRemoval: false }
            };

            const actionBtn = e.target.closest('[data-act]');
            if (actionBtn && actions[actionBtn.dataset.act]) {
                const config = actions[actionBtn.dataset.act];
                performActionWithConfirmation(actionBtn, config);
            }

            if (e.target.closest('[data-act="add-room-before"]')) {
                // This feature is not implemented in the current version.
                showToast('ฟีเจอร์นี้ยังไม่พร้อมใช้งานในเวอร์ชั่นนี้', 'warning');
            }

            // Toggle sheer fabric fields
            if (e.target.closest('[name="fabric_variant"]')) {
                const selectEl = e.target;
                const setEl = selectEl.closest(SELECTORS.set);
                if (setEl) {
                    toggleSetFabricUI(setEl);
                }
            }
        });

        // Other main button listeners
        if (addRoomBtn) addRoomBtn.addEventListener('click', () => addRoom());
        if (lockBtn) lockBtn.addEventListener('click', toggleLockState);
        if (clearAllBtn) clearAllBtn.addEventListener('click', async () => {
            if (await showConfirmation('ล้างข้อมูลทั้งหมด?', 'ข้อมูลทั้งหมดในฟอร์มจะถูกลบอย่างถาวรและไม่สามารถกู้คืนได้')) {
                clearAllData();
            }
        });
        if (clearItemsBtn) clearItemsBtn.addEventListener('click', async () => {
            if (await showConfirmation('ล้างรายการทั้งหมด?', 'รายการผ้าม่านและของตกแต่งทั้งหมดจะถูกลบออกจากทุกห้อง')) {
                clearAllItems();
            }
        });
        if (copyTextBtn) copyTextBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const option = await showCopyOptionsModal();
            if (option) {
                 copySummaryToClipboard(option);
            }
        });
        if (exportPdfBtn) exportPdfBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            generatePDF();
        });
        if (exportBtn) exportBtn.addEventListener('click', exportData);
        if (importBtn) importBtn.addEventListener('click', () => fileImporter.click());
        if (submitBtn) submitBtn.addEventListener('click', handleSubmit);
        if (fileImporter) fileImporter.addEventListener('change', (e) => {
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
            const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
            if (!e.target.closest('.menu-container')) menuDropdown.classList.remove('show');
            if (!e.target.closest('.room-options-container')) {
                document.querySelectorAll('.room-options-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                    menu.closest('.room-card')?.classList.remove('overflow-visible');
                });
            }
        });
        const menuBtn = document.querySelector(SELECTORS.menuBtn);
        if(menuBtn) menuBtn.addEventListener('click', () => {
            const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
            menuDropdown.classList.toggle('show');
        });

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