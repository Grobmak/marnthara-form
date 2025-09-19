(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.3.2-ux-enhanced";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4"; // Keep v4 for data compatibility
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
            const totalArea = totalWidth * height;
            const baseRolls = Math.ceil(totalArea / 5.3);
            const finalRolls = baseRolls > 0 ? baseRolls + 1 : 0;
            return finalRolls;
        }
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', clearAllBtn: '#clearAllBtn', copyJsonBtn: '#copyJsonBtn',
        lockBtn: '#lockBtn', addRoomFooterBtn: '#addRoomFooterBtn', lockText: '#lockText',
        grandTotal: '#grandTotal', setCount: '#setCount',
        detailedSummaryContainer: '#detailed-material-summary',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]',
        toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn',
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        submitBtn: '#submitBtn'
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
        return n.toLocaleString("th-TH", { 
            minimumFractionDigits: asCurrency ? 0 : fixed, 
            maximumFractionDigits: asCurrency ? 0 : fixed 
        });
    };
    const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };

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
    
    async function showImportModal() {
        const importJsonArea = document.querySelector(SELECTORS.importJsonArea);
        importJsonArea.value = '';
        if (!await showModal(SELECTORS.importModal)) return false;
        try {
            return JSON.parse(importJsonArea.value);
        } catch (e) {
            showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
            return false;
        }
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
            created.querySelector('input[name="width_m"]').value = prefill.width_m ?? "";
            created.querySelector('input[name="height_m"]').value = prefill.height_m ?? "";
            created.querySelector('select[name="set_style"]').value = prefill.style || "ลอน";
            created.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
            created.querySelector('select[name="set_price_per_m"]').value = prefill.price_per_m_raw || "";
            created.querySelector('select[name="sheer_price_per_m"]').value = prefill.sheer_price_per_m || "";
            created.querySelector('input[name="fabric_code"]').value = prefill.fabric_code || "";
            created.querySelector('select[name="opening_style"]').value = prefill.opening_style || "แยกกลาง";
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
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m ?? "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmt(prefill.price_sqyd, 0, true) ?? "";
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
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="wallpaper_price_roll"]').value = fmt(prefill.price_per_roll, 0, true) ?? "";
            created.querySelector('[name="wallpaper_install_roll"]').value = fmt(prefill.install_per_roll, 0, true) ?? "";
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
            frag.querySelector('input[name="wall_width_m"]').value = prefillWidth;
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
                    if (opaquePrice + sheerPrice > 0) {
                        pricedItemCount++;
                    }
                }
                const totalSetPrice = opaquePrice + sheerPrice;
                let summaryHtml = `ราคา: <b>${fmt(totalSetPrice, 0, true)}</b> บ.`;
                const details = [];
                if (opaquePrice > 0) details.push(`ทึบ: ${fmt(opaquePrice, 0, true)}`);
                if (sheerPrice > 0) details.push(`โปร่ง: ${fmt(sheerPrice, 0, true)}`);
                if (details.length > 0 && totalSetPrice > 0) {
                    summaryHtml += ` <small>(${details.join(', ')})</small>`;
                }
                set.querySelector('[data-set-summary]').innerHTML = summaryHtml;
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);
                roomSum += opaquePrice + sheerPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });

            // DECORATIONS
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                let decoPrice = 0, sqYd = 0;
                if (deco.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                    const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                    const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
<<<<<<< HEAD
                    const type = deco.querySelector('[name="deco_type"]')?.value || "ของตกแต่ง";

                    if (w > 0 && h > 0 && price > 0) {
                        sqYd = (w * h) * SQM_TO_SQYD;
                        decoPrice = Math.round(sqYd * price);
=======
                    areaSqyd = w * h * SQM_TO_SQYD;
                    decoPrice = Math.round(areaSqyd * price);
                    if (decoPrice > 0) {
>>>>>>> parent of aa8f231 (+)
                        pricedItemCount++;
                    }
                    if (type && decoPrice > 0) {
                        decoCounts[type] = (decoCounts[type] || 0) + 1;
                    }
                }
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmt(decoPrice, 0, true)}</b> บ.`;
                roomSum += decoPrice;
            });

            // WALLPAPERS
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
<<<<<<< HEAD
                let wallpaperPrice = 0, installPrice = 0, totalRolls = 0;
                if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                    const installPerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_install_roll"]')?.value);
                    const totalWidth = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, input) => sum + clamp01(input.value), 0);

                    if (h > 0 && totalWidth > 0 && (pricePerRoll > 0 || installPerRoll > 0)) {
                        totalRolls = CALC.wallpaperRolls(totalWidth, h);
                        wallpaperPrice = totalRolls * pricePerRoll;
                        installPrice = totalRolls * installPerRoll;
                        pricedItemCount++;
                    }
                }
                const totalWallpaperItemPrice = wallpaperPrice + installPrice;
                let summaryHtml = `ราคา: <b>${fmt(totalWallpaperItemPrice, 0, true)}</b> บ.`;
                if (wallpaperPrice > 0 || installPrice > 0) {
                    summaryHtml += `<small> (วอลล์: ${fmt(wallpaperPrice, 0, true)} บ., ค่าช่าง: ${fmt(installPrice, 0, true)} บ.)</small>`;
                }
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = summaryHtml;
                roomSum += totalWallpaperItemPrice;
                totalWallpaperRolls += totalRolls;
            });
            
=======
                let wallpaperPrice = 0, widthSum = 0, rolls = 0;
                if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                    const price = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                    wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(wInput => {
                        widthSum += clamp01(wInput.value);
                    });
                    if (widthSum > 0 && height > 0 && price > 0) {
                        rolls = CALC.wallpaperRolls(widthSum, height);
                        wallpaperPrice = rolls * price;
                        pricedItemCount++;
                    }
                }
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <b>${fmt(wallpaperPrice, 0, true)}</b> บ. (${fmt(rolls, 0)} ม้วน)`;
                totalWallpaperRolls += rolls;
                roomSum += wallpaperPrice;
            });
            
            room.querySelector('[data-room-summary]').textContent = fmt(roomSum, 0, true);
>>>>>>> parent of aa8f231 (+)
            grand += roomSum;
            room.querySelector('.room-brief').textContent = `${fmt(roomSum, 0, true)} บ.`;
        });
        
<<<<<<< HEAD
        // Update totals
=======
        // Update grand total & counts
>>>>>>> parent of aa8f231 (+)
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

        // Update detailed summary
<<<<<<< HEAD
        const detailedSummary = document.querySelector(SELECTORS.detailedSummaryContainer);
        detailedSummary.innerHTML = '';
        if (grandOpaqueYards > 0) {
            detailedSummary.innerHTML += `<p>ผ้าทึบรวม: <b>${fmt(grandOpaqueYards, 2)}</b> หลา</p>`;
        }
        if (grandSheerYards > 0) {
            detailedSummary.innerHTML += `<p>ผ้าโปร่งรวม: <b>${fmt(grandSheerYards, 2)}</b> หลา</p>`;
        }
        if (grandOpaqueTrack > 0 || grandSheerTrack > 0) {
            detailedSummary.innerHTML += `<p>รางรวม: <b>${fmt(grandOpaqueTrack + grandSheerTrack, 2)}</b> ม.</p>`;
        }
        if (hasDoubleBracket) {
            detailedSummary.innerHTML += `<p><small><i>หมายเหตุ: มีรางคู่ (ทึบ&โปร่ง)</i></small></p>`;
        }
        if (totalWallpaperRolls > 0) {
            detailedSummary.innerHTML += `<p>วอลล์เปเปอร์: <b>${totalWallpaperRolls}</b> ม้วน</p>`;
        }
        for (const type in decoCounts) {
            if (decoCounts[type] > 0) {
                detailedSummary.innerHTML += `<p>${type} รวม: <b>${decoCounts[type]}</b> รายการ</p>`;
            }
=======
        let summaryHtml = '';
        if (grandOpaqueYards > 0) summaryHtml += `<div><b>ผ้าทึบ:</b> ${fmt(grandOpaqueYards, 2)} หลา</div>`;
        if (grandSheerYards > 0) summaryHtml += `<div><b>ผ้าโปร่ง:</b> ${fmt(grandSheerYards, 2)} หลา</div>`;
        if (totalWallpaperRolls > 0) summaryHtml += `<div><b>วอลล์เปเปอร์:</b> ${fmt(totalWallpaperRolls, 0)} ม้วน</div>`;
        if (Object.keys(decoCounts).length > 0) {
            Object.entries(decoCounts).forEach(([type, count]) => {
                summaryHtml += `<div><b>${type}:</b> ${count} รายการ</div>`;
            });
>>>>>>> parent of aa8f231 (+)
        }
        if (hasDoubleBracket) {
            summaryHtml += `<div class="warning-text">มีรายการผ้าม่าน 2 ชั้น (ต้องใช้รางคู่)</div>`;
        }
        document.querySelector(SELECTORS.detailedSummaryContainer).innerHTML = summaryHtml;
    }

<<<<<<< HEAD
    function generateCopyText(option) {
        const customerInfo = {
            name: document.querySelector('#customer_name')?.value || 'ลูกค้า',
            phone: document.querySelector('#customer_phone')?.value || '',
            address: document.querySelector('#customer_address')?.value || ''
        };
        const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;
        const now = new Date();
        const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        let result = '';

        if (option === 'customer') {
            result += `ใบเสนอราคา (${dateStr})\n\n`;
            result += `ลูกค้า: ${customerInfo.name}\n`;
            if (customerInfo.phone) result += `เบอร์โทร: ${customerInfo.phone}\n\n`;
            result += `รายละเอียดงาน\n`;
            result += `------------------------------------\n`;

            let itemIndex = 1;
            document.querySelectorAll(SELECTORS.room).forEach(room => {
                if (room.dataset.suspended === 'true') return;
                const roomName = room.querySelector(SELECTORS.roomNameInput)?.value;
                result += `*${roomName}*\n`;
                
                room.querySelectorAll('.set-item, .deco-item, .wallpaper-item').forEach(item => {
                    if (item.dataset.suspended === 'true') return;
                    let itemName = `รายการที่ ${itemIndex}`;
                    const itemType = item.querySelector('.item-title > span').textContent;
                    
                    if (item.classList.contains('set-item')) {
                        const width = clamp01(item.querySelector('[name="width_m"]')?.value);
                        const height = clamp01(item.querySelector('[name="height_m"]')?.value);
                        const style = item.querySelector('[name="set_style"]')?.value;
                        const variant = item.querySelector('[name="fabric_variant"]')?.value;
                        itemName = `${itemType} - ${style} (${variant})`;
                        if (width > 0 && height > 0) {
                            itemName += ` ${width}x${height} ม.`;
                        }
                    } else if (item.classList.contains('deco-item')) {
                         const type = item.querySelector('[name="deco_type"]')?.value || "ของตกแต่ง";
                         itemName = `ของตกแต่ง - ${type}`;
                    } else if (item.classList.contains('wallpaper-item')) {
                         itemName = `วอลล์เปเปอร์`;
                    }
                    
                    const priceEl = item.querySelector('.item-summary b');
                    const price = priceEl ? priceEl.textContent.trim() : '0';
                    result += `- ${itemName}: ${price} บ.\n`;
                    itemIndex++;
                });
                result += '\n';
            });
            result += `------------------------------------\n`;
            result += `รวมทั้งหมด: ${grandTotal} บ.\n`;
        
        } else if (option === 'owner') {
            result += `*รายละเอียดทั้งหมด (สำหรับร้านค้า) - ${dateStr} ${timeStr}*\n\n`;
            result += `ลูกค้า: ${customerInfo.name}\n`;
            if (customerInfo.phone) result += `เบอร์โทร: ${customerInfo.phone}\n`;
            if (customerInfo.address) result += `ที่อยู่: ${customerInfo.address}\n`;
            result += `------------------------------------\n\n`;

            document.querySelectorAll(SELECTORS.room).forEach(room => {
                const roomName = room.querySelector(SELECTORS.roomNameInput)?.value || 'ไม่ระบุห้อง';
                const isRoomSuspended = room.dataset.suspended === 'true';
                const roomBrief = room.querySelector('.room-brief')?.textContent || '';
                
                result += `*${roomName}* ${isRoomSuspended ? '(ระงับ)' : ''} | ${roomBrief}\n`;
                
                // Curtains
                room.querySelectorAll(SELECTORS.set).forEach(set => {
                    const suspended = set.dataset.suspended === 'true';
                    const width = clamp01(set.querySelector('[name="width_m"]')?.value);
                    const height = clamp01(set.querySelector('[name="height_m"]')?.value);
                    const style = set.querySelector('[name="set_style"]')?.value;
                    const variant = set.querySelector('[name="fabric_variant"]')?.value;
                    const price = set.querySelector('[name="set_price_per_m"]')?.value;
                    const sheerPrice = set.querySelector('[name="sheer_price_per_m"]')?.value;
                    const code = set.querySelector('[name="fabric_code"]')?.value || '-';
                    const opening = set.querySelector('[name="opening_style"]')?.value;
                    const notes = set.querySelector('[name="notes"]')?.value || '-';
                    
                    const setPrice = set.querySelector('[data-set-summary] b').textContent;
                    const opaqueYd = set.querySelector('[data-set-yardage-opaque]').textContent;
                    const sheerYd = set.querySelector('[data-set-yardage-sheer]').textContent;
                    const opaqueTrack = set.querySelector('[data-set-opaque-track]').textContent;
                    const sheerTrack = set.querySelector('[data-set-sheer-track]').textContent;
                    
                    result += `  - ผ้าม่าน (${suspended ? 'ระงับ' : 'ใช้งาน'})\n`;
                    result += `    ขนาด: ${width}x${height} ม.\n`;
                    result += `    รูปแบบ: ${style}, ชนิด: ${variant}, เปิด: ${opening}\n`;
                    result += `    รหัสผ้า: ${code}\n`;
                    result += `    ราคา/ม.: ทึบ ${price} / โปร่ง ${sheerPrice}\n`;
                    result += `    ใช้ผ้า: ทึบ ${opaqueYd} หลา / โปร่ง ${sheerYd} หลา\n`;
                    result += `    ราง: ทึบ ${opaqueTrack} ม. / โปร่ง ${sheerTrack} ม.\n`;
                    result += `    ราคา: ${setPrice} บ.\n`;
                    if (notes !== '-') result += `    หมายเหตุ: ${notes}\n`;
                    result += `\n`;
                });

                // Decorations
                room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                    const suspended = deco.dataset.suspended === 'true';
                    const width = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                    const height = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                    const type = deco.querySelector('[name="deco_type"]')?.value || "ของตกแต่ง";
                    const priceSqYd = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                    const decoPrice = deco.querySelector('[data-deco-summary] b').textContent;

                    result += `  - ของตกแต่ง - ${type} (${suspended ? 'ระงับ' : 'ใช้งาน'})\n`;
                    result += `    ขนาด: ${width}x${height} ม.\n`;
                    result += `    ราคา/ตร.หลา: ${priceSqYd} บ.\n`;
                    result += `    ราคา: ${decoPrice} บ.\n\n`;
                });

                // Wallpapers
                room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                    const suspended = wallpaper.dataset.suspended === 'true';
                    const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                    const installPerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_install_roll"]')?.value);
                    const totalRolls = CALC.wallpaperRolls(Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, input) => sum + clamp01(input.value), 0), height);
                    const wallpaperPrice = totalRolls * pricePerRoll;
                    const installPrice = totalRolls * installPerRoll;

                    result += `  - วอลล์เปเปอร์ (${suspended ? 'ระงับ' : 'ใช้งาน'})\n`;
                    result += `    สูง: ${height} ม.\n`;
                    result += `    ความกว้างผนังรวม: ${Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).reduce((sum, input) => sum + clamp01(input.value), 0)} ม.\n`;
                    result += `    ใช้: ${totalRolls} ม้วน\n`;
                    result += `    ราคาวอลล์: ${fmt(wallpaperPrice, 0, true)} บ. (${pricePerRoll} บ./ม้วน)\n`;
                    result += `    ค่าช่าง: ${fmt(installPrice, 0, true)} บ. (${installPerRoll} บ./ม้วน)\n`;
                    result += `    รวม: ${fmt(wallpaperPrice + installPrice, 0, true)} บ.\n\n`;
                });
                
            });
            result += `------------------------------------\n`;
            result += `*ยอดรวมทั้งหมด:* ${grandTotal} บ.\n`;
        } else if (option === 'seamstress') {
             result += `*รายละเอียดงานเย็บผ้าม่าน - ${dateStr} ${timeStr}*\n\n`;
             document.querySelectorAll(SELECTORS.room).forEach(room => {
                const roomName = room.querySelector(SELECTORS.roomNameInput)?.value || 'ไม่ระบุห้อง';
                const isRoomSuspended = room.dataset.suspended === 'true';
                if (isRoomSuspended) return;
                
                let roomHasSets = false;
                room.querySelectorAll(SELECTORS.set).forEach(set => {
                    if (set.dataset.suspended === 'true') return;
                    roomHasSets = true;
                });
                if (!roomHasSets) return;
                
                result += `*${roomName}*\n`;
                
                room.querySelectorAll(SELECTORS.set).forEach(set => {
                    if (set.dataset.suspended === 'true') return;
                    const width = clamp01(set.querySelector('[name="width_m"]')?.value);
                    const height = clamp01(set.querySelector('[name="height_m"]')?.value);
                    const style = set.querySelector('[name="set_style"]')?.value;
                    const variant = set.querySelector('[name="fabric_variant"]')?.value;
                    const code = set.querySelector('[name="fabric_code"]')?.value || '-';
                    const opening = set.querySelector('[name="opening_style"]')?.value;
                    const notes = set.querySelector('[name="notes"]')?.value || '-';
                    const opaqueYd = set.querySelector('[data-set-yardage-opaque]').textContent;
                    const sheerYd = set.querySelector('[data-set-yardage-sheer]').textContent;
                    
                    result += `  - ขนาด: ${width}x${height} ม.\n`;
                    result += `    รูปแบบ: ${style}\n`;
                    result += `    ผ้า: ${variant} รหัส ${code}\n`;
                    result += `    ใช้ผ้า: ทึบ ${opaqueYd} หลา / โปร่ง ${sheerYd} หลา\n`;
                    result += `    รูปแบบเปิด: ${opening}\n`;
                    if (notes !== '-') result += `    หมายเหตุ: ${notes}\n`;
                    result += `\n`;
                });
             });
        }
        return result.trim();
    }
    
    function savePayload() {
        const payload = { customer: {}, rooms: [] };
        payload.customer = {
            name: document.querySelector('#customer_name')?.value || "",
            phone: document.querySelector('#customer_phone')?.value || "",
            address: document.querySelector('#customer_address')?.value || ""
        };

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const room = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || "",
=======
    // --- DATA HANDLING ---
    const collectData = () => {
        const payload = {
            customer_name: document.getElementById('customer_name').value,
            customer_phone: document.getElementById('customer_phone').value,
            customer_address: document.getElementById('customer_address').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value,
>>>>>>> parent of aa8f231 (+)
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
<<<<<<< HEAD
                room.sets.push({
                    is_suspended: setEl.dataset.suspended === 'true',
                    width_m: clamp01(setEl.querySelector('[name="width_m"]')?.value),
                    height_m: clamp01(setEl.querySelector('[name="height_m"]')?.value),
                    style: setEl.querySelector('[name="set_style"]')?.value,
                    fabric_variant: setEl.querySelector('[name="fabric_variant"]')?.value,
                    price_per_m_raw: clamp01(setEl.querySelector('[name="set_price_per_m"]')?.value),
                    sheer_price_per_m: clamp01(setEl.querySelector('[name="sheer_price_per_m"]')?.value),
                    fabric_code: setEl.querySelector('[name="fabric_code"]')?.value || "",
                    opening_style: setEl.querySelector('[name="opening_style"]')?.value,
                    notes: setEl.querySelector('[name="notes"]')?.value || ""
=======
                const is_suspended = setEl.dataset.suspended === 'true';
                roomData.sets.push({
                    is_suspended,
                    width_m: toNum(setEl.querySelector('[name="width_m"]')?.value),
                    height_m: toNum(setEl.querySelector('[name="height_m"]')?.value),
                    style: setEl.querySelector('[name="set_style"]')?.value,
                    fabric_variant: setEl.querySelector('[name="fabric_variant"]')?.value,
                    price_per_m_raw: toNum(setEl.querySelector('[name="set_price_per_m"]')?.value),
                    sheer_price_per_m: toNum(setEl.querySelector('[name="sheer_price_per_m"]')?.value),
                    fabric_code: setEl.querySelector('[name="fabric_code"]')?.value,
                    notes: setEl.querySelector('[name="notes"]')?.value,
>>>>>>> parent of aa8f231 (+)
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
<<<<<<< HEAD
                room.decorations.push({
                    is_suspended: decoEl.dataset.suspended === 'true',
                    type: decoEl.querySelector('[name="deco_type"]')?.value || "",
                    width_m: clamp01(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: clamp01(decoEl.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: clamp01(decoEl.querySelector('[name="deco_price_sqyd"]')?.value)
=======
                const is_suspended = decoEl.dataset.suspended === 'true';
                roomData.decorations.push({
                    is_suspended,
                    type: decoEl.querySelector('[name="deco_type"]')?.value,
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value),
>>>>>>> parent of aa8f231 (+)
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
<<<<<<< HEAD
                room.wallpapers.push({
                    is_suspended: wallpaperEl.dataset.suspended === 'true',
                    height_m: clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: clamp01(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    install_per_roll: clamp01(wallpaperEl.querySelector('[name="wallpaper_install_roll"]')?.value),
                    widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(input => clamp01(input.value))
=======
                const is_suspended = wallpaperEl.dataset.suspended === 'true';
                const widths = [];
                wallpaperEl.querySelectorAll('[name="wall_width_m"]').forEach(wInput => {
                    widths.push(toNum(wInput.value));
                });
                roomData.wallpapers.push({
                    is_suspended,
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    widths,
>>>>>>> parent of aa8f231 (+)
                });
            });

            payload.rooms.push(room);
        });

        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload, null, 2);
        return payload;
    };
    
<<<<<<< HEAD
    function loadPayload(payload) {
        if (!payload || !payload.rooms) {
            showToast("รูปแบบข้อมูลไม่ถูกต้อง", "error");
            return;
        }
        document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
        document.querySelector('#customer_name').value = payload.customer.name || "";
        document.querySelector('#customer_phone').value = payload.customer.phone || "";
        document.querySelector('#customer_address').value = payload.customer.address || "";
        
        payload.rooms.forEach(room => addRoom(room));
        renumber();
        recalcAll();
        showToast('นำเข้าข้อมูลสำเร็จ', 'success');
    }

    // --- MAIN APP LOGIC ---
    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, roomIdx) => {
            room.dataset.index = roomIdx + 1;
            const roomNameInput = room.querySelector(SELECTORS.roomNameInput);
            if (!roomNameInput.value) {
                roomNameInput.placeholder = `ห้องที่ ${roomIdx + 1}`;
            }

            // Renumber sets, deco, wallpaper
            room.querySelectorAll(SELECTORS.set).forEach((set, i) => set.querySelector('[data-set-count]').textContent = `#${i+1}`);
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco, i) => deco.querySelector('[data-deco-count]').textContent = `#${i+1}`);
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper, i) => wallpaper.querySelector('[data-wallpaper-count]').textContent = `#${i+1}`);
        });
    }

    const saveData = debounce(() => {
        try {
            const payload = savePayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (err) {
            console.error("Failed to save to localStorage:", err);
            showToast("บันทึกข้อมูลไม่สำเร็จ", "error");
        }
    });

    function toggleSetFabricUI(set) {
        const variant = set.querySelector('select[name="fabric_variant"]')?.value;
        const opaqueWrap = set.querySelector('[data-opaque-wrap]');
        const sheerWrap = set.querySelector('[data-sheer-wrap]');
        if (opaqueWrap && sheerWrap) {
            opaqueWrap.classList.toggle('hidden', variant === "โปร่ง");
            sheerWrap.classList.toggle('hidden', variant === "ทึบ");
        }
    }

    function updateLockState() {
        const lockIcon = document.querySelector('.lock-icon');
        const lockText = document.querySelector('#lockText');
        const formElements = document.querySelectorAll('#orderForm input, #orderForm select, #orderForm textarea, #orderForm button:not(#lockBtn, #menuBtn)');
        
        isLocked = !isLocked;
        lockIcon.className = isLocked ? 'ph-bold ph-lock-key lock-icon' : 'ph-bold ph-lock-key-open lock-icon';
        lockText.textContent = isLocked ? 'ปลดล็อก' : 'ล็อก';
        
        formElements.forEach(el => {
            if (el.dataset.act === 'remove-item' || el.dataset.act === 'remove-room' || el.dataset.act === 'remove-wall' || el.dataset.act === 'toggle-suspend' || el.dataset.act === 'toggle-suspend-room' ) {
                 // Do nothing, these buttons are always active
            } else {
                el.disabled = isLocked;
            }
        });

        document.querySelectorAll('[data-act="add-set"], [data-act="add-deco"], [data-act="add-wallpaper"], [data-act="add-wall"], #addRoomFooterBtn').forEach(btn => {
            btn.classList.toggle('hidden', isLocked);
        });
        
        showToast(isLocked ? 'ฟอร์มถูกล็อกแล้ว' : 'ฟอร์มถูกปลดล็อกแล้ว', 'warning');
    }

    function init() {
        // Event Listeners for UI
        const roomContainer = document.querySelector(SELECTORS.roomsContainer);
        const form = document.querySelector(SELECTORS.orderForm);
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        
        form.addEventListener('input', (e) => {
            recalcAll();
            saveData();
            if (e.target.name === 'fabric_variant') {
                toggleSetFabricUI(e.target.closest(SELECTORS.set));
            }
        });

        roomContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-act]');
            if (!btn || isLocked) return;
            const action = btn.dataset.act;
            const roomEl = btn.closest(SELECTORS.room);
            const parentItem = btn.closest('.item-card');
            
            const actions = {
                'add-set': { action: () => addSet(roomEl), isRemoval: false },
                'add-deco': { action: () => addDeco(roomEl), isRemoval: false },
                'add-wallpaper': { action: () => addWallpaper(roomEl), isRemoval: false },
                'add-wall': { action: (item) => addWall(item), isRemoval: false },
                'remove-room': { 
                    action: animateAndRemove, 
                    selector: SELECTORS.room, 
                    isRemoval: true,
                    confirm: true,
                    title: 'ยืนยันการลบห้อง',
                    body: 'คุณต้องการลบห้องนี้และรายการทั้งหมดในห้องนี้ใช่หรือไม่?'
                },
                'remove-item': { 
                    action: animateAndRemove, 
                    selector: '.item-card', 
                    isRemoval: true,
                    confirm: true,
                    title: 'ยืนยันการลบรายการ',
                    body: 'คุณต้องการลบรายการนี้ใช่หรือไม่?'
                },
                'remove-wall': {
                    action: (wall) => { wall.remove(); renumber(); recalcAll(); saveData(); },
                    selector: '.wall-input-row',
                    isRemoval: true,
                    confirm: true,
                    title: 'ยืนยันการลบผนัง',
                    body: 'คุณต้องการลบผนังนี้ใช่หรือไม่?'
                },
                'toggle-suspend': { 
                    action: (item) => suspendItem(item, item.dataset.suspended !== 'true'), 
                    selector: '.item-card', 
                    isRemoval: false 
                },
                'toggle-suspend-room': { 
                    action: (room) => suspendRoom(room, room.dataset.suspended !== 'true'), 
                    selector: SELECTORS.room, 
                    isRemoval: false
                }
            };

            if (actions[action]) {
                const config = actions[action];
                if (config.isRemoval && config.confirm) {
                    performActionWithConfirmation(btn, config);
                } else if (config.isRemoval) {
                    config.action(btn.closest(config.selector));
                } else {
                    config.action(btn);
                    renumber();
                    recalcAll();
                    saveData();
                }
            } else if (action === 'toggle-room-menu') {
                document.querySelectorAll('.room-options-menu.show').forEach(menu => menu.classList.remove('show'));
                btn.nextElementSibling.classList.toggle('show');
            }
        });
        
        document.querySelector('#addRoomFooterBtn').addEventListener('click', () => addRoom());
        document.querySelector('#lockBtn').addEventListener('click', updateLockState);
        document.querySelector('#clearAllBtn').addEventListener('click', async () => {
            if (await showConfirmation('ยืนยันการลบข้อมูลทั้งหมด', 'ข้อมูลทั้งหมดในฟอร์มจะถูกลบออกอย่างถาวร คุณต้องการดำเนินการต่อหรือไม่?')) {
                localStorage.removeItem(STORAGE_KEY);
                document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
                addRoom();
                showToast('ลบข้อมูลทั้งหมดแล้ว', 'success');
            }
        });
        document.querySelector('#copyTextBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            const option = await showCopyOptionsModal();
            if (option) {
                const text = generateCopyText(option);
                navigator.clipboard.writeText(text).then(() => {
                    showToast('คัดลอกข้อมูลเรียบร้อยแล้ว!', 'success');
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                    showToast('คัดลอกไม่สำเร็จ', 'error');
                });
            }
        });
        document.querySelector('#copyJsonBtn').addEventListener('click', (e) => {
            e.preventDefault();
            const payloadString = document.querySelector(SELECTORS.payloadInput).value;
             navigator.clipboard.writeText(payloadString).then(() => {
                showToast('คัดลอก JSON เรียบร้อยแล้ว!', 'success');
            }).catch(err => {
                console.error('Failed to copy: ', err);
                showToast('คัดลอกไม่สำเร็จ', 'error');
            });
        });
        document.querySelector('#exportBtn').addEventListener('click', () => {
             const payload = savePayload();
             const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
             const downloadAnchorNode = document.createElement('a');
             downloadAnchorNode.setAttribute("href", dataStr);
             downloadAnchorNode.setAttribute("download", `quotation_${new Date().toISOString().split('T')[0]}.json`);
             document.body.appendChild(downloadAnchorNode);
             downloadAnchorNode.click();
             downloadAnchorNode.remove();
             showToast('ส่งออกข้อมูลสำเร็จ', 'success');
        });
        document.querySelector('#importBtn').addEventListener('click', async () => {
=======
    const saveData = debounce(() => {
        try {
            const data = collectData();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(data);
            console.log('Data saved.');
        } catch (e) {
            console.error('Failed to save data to localStorage:', e);
        }
    });

    const loadPayload = (payload) => {
        if (!payload || !payload.rooms) {
            showToast("ข้อมูลไม่ถูกต้อง", "error");
            return;
        }
        document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
        roomCount = 0;
        
        document.getElementById('customer_name').value = payload.customer_name || "";
        document.getElementById('customer_phone').value = payload.customer_phone || "";
        document.getElementById('customer_address').value = payload.customer_address || "";
        
        payload.rooms.forEach(roomData => addRoom(roomData));
        recalcAll();
        showToast('โหลดข้อมูลเสร็จสมบูรณ์', 'success');
    };

    // --- COPY / EXPORT ---
    const generateSummaryText = async (option) => {
        const payload = collectData();
        const data = {
            customer_name: payload.customer_name,
            phone: payload.customer_phone,
            address: payload.customer_address,
            summary: {},
            details: []
        };
        let grandTotal = 0;
        
        payload.rooms.forEach(room => {
            if (room.is_suspended) return;
            const roomTotal = room.sets.filter(s => !s.is_suspended).reduce((sum, s) => sum + (s.width_m * (toNum(s.price_per_m_raw) + stylePlus(s.style) + heightPlus(s.height_m))) + (s.width_m * (s.fabric_variant.includes("โปร่ง") ? toNum(s.sheer_price_per_m) + stylePlus(s.style) + heightPlus(s.height_m) : 0)), 0)
                          + room.decorations.filter(d => !d.is_suspended).reduce((sum, d) => sum + (d.width_m * d.height_m * SQM_TO_SQYD * toNum(d.price_sqyd)), 0)
                          + room.wallpapers.filter(w => !w.is_suspended).reduce((sum, w) => sum + (CALC.wallpaperRolls(w.widths.reduce((a,b)=>a+b,0), w.height_m) * toNum(w.price_per_roll)), 0);
            
            grandTotal += roomTotal;
            if (roomTotal > 0) {
                const roomName = room.room_name || `ห้อง ${room.sets.length + room.decorations.length + room.wallpapers.length} รายการ`;
                data.details.push(`- **${roomName}**`);
            }

            room.sets.filter(s => !s.is_suspended).forEach(s => {
                const type = s.fabric_variant.includes("ทึบ") && s.fabric_variant.includes("โปร่ง") ? "ผ้าม่านทึบ+โปร่ง" : s.fabric_variant.includes("ทึบ") ? "ผ้าม่านทึบ" : "ผ้าม่านโปร่ง";
                const total = Math.round((toNum(s.price_per_m_raw) + toNum(s.sheer_price_per_m) + stylePlus(s.style) + heightPlus(s.height_m)) * s.width_m);
                const style = s.style === 'ตาไก่' ? 'ตอกตาไก่' : 'จีบ/ลอน';
                const size = `${fmt(s.width_m, 2, false)} x ${fmt(s.height_m, 2, false)} ม.`;
                const notes = s.notes ? ` (${s.notes})` : '';

                if (option === 'customer' || option === 'owner') {
                    data.details.push(`  - ${type} ${size} ราคา ${fmt(total, 0, true)} บ.`);
                }
                if (option === 'seamstress' || option === 'owner') {
                    const yards = CALC.fabricYardage(s.style, s.width_m);
                    const sheerYards = s.fabric_variant.includes("โปร่ง") ? CALC.fabricYardage(s.style, s.width_m) : 0;
                    data.details.push(`  - ${s.fabric_code} ${type} ${style} ขนาด ${size} ใช้ผ้า ${fmt(yards, 2)} หลา${sheerYards > 0 ? ` (โปร่ง ${fmt(sheerYards, 2)} หลา)` : ''}${notes}`);
                }
            });

            room.decorations.filter(d => !d.is_suspended).forEach(d => {
                 const total = Math.round(d.width_m * d.height_m * SQM_TO_SQYD * toNum(d.price_sqyd));
                 const size = `${fmt(d.width_m, 2, false)} x ${fmt(d.height_m, 2, false)} ม.`;
                 data.details.push(`  - ${d.type} ${size} ราคา ${fmt(total, 0, true)} บ.`);
            });
            
            room.wallpapers.filter(w => !w.is_suspended).forEach(w => {
                 const totalWidth = w.widths.reduce((a,b)=>a+b,0);
                 const rolls = CALC.wallpaperRolls(totalWidth, w.height_m);
                 const total = rolls * toNum(w.price_per_roll);
                 data.details.push(`  - วอลล์เปเปอร์ ${fmt(w.height_m, 2, false)} ม. x กว้างรวม ${fmt(totalWidth, 2, false)} ม. (${fmt(rolls, 0)} ม้วน) ราคา ${fmt(total, 0, true)} บ.`);
            });
        });

        // Add summary to the top for customer option
        if (option === 'customer' || option === 'owner') {
            data.summary.total_price = fmt(grandTotal, 0, true);
        }
        
        let output = "";
        if (option === 'customer' || option === 'owner') {
            output += `**สรุปราคางาน${payload.customer_name ? `ของ ${payload.customer_name}` : ''}**\n\n`;
            output += `**เบอร์โทร:** ${payload.customer_phone || "-"}\n`;
            output += `**ที่อยู่:** ${payload.customer_address || "-"}\n\n`;
            output += `**รายการ:**\n`;
            output += data.details.join('\n');
            output += `\n\n**รวมราคา: ${data.summary.total_price} บ.**`;
        } else if (option === 'seamstress') {
            output += `**รายการสำหรับช่างเย็บ:**\n`;
            output += data.details.join('\n');
        } else {
            return false;
        }

        return output;
    };

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        const form = document.querySelector(SELECTORS.orderForm);
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        const detailedSummary = document.querySelector(SELECTORS.detailedSummaryContainer);

        form.addEventListener('input', debounce(saveData));
        form.addEventListener('change', debounce(recalcAll));

        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => addRoom());
        document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
            isLocked = !isLocked;
            updateLockState();
        });

        roomsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn || isLocked) return;

            const actions = {
                'add-set': { action: (item) => addSet(item.closest(SELECTORS.room)), isRemoval: false, toast: 'เพิ่มรายการผ้าม่านแล้ว' },
                'add-deco': { action: (item) => addDeco(item.closest(SELECTORS.room)), isRemoval: false, toast: 'เพิ่มรายการงานตกแต่งแล้ว' },
                'add-wallpaper': { action: (item) => addWallpaper(item.closest(SELECTORS.room)), isRemoval: false, toast: 'เพิ่มรายการวอลล์เปเปอร์แล้ว' },
                'add-wall': { action: addWall, isRemoval: false, toast: null },
                'remove-room': { action: animateAndRemove, isRemoval: true, confirm: true, title: 'ลบห้อง', body: 'คุณแน่ใจหรือไม่ว่าต้องการลบห้องนี้?' },
                'remove-set': { action: animateAndRemove, isRemoval: true, confirm: true, title: 'ลบผ้าม่าน', body: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?' },
                'remove-deco': { action: animateAndRemove, isRemoval: true, confirm: true, title: 'ลบงานตกแต่ง', body: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?' },
                'remove-wallpaper': { action: animateAndRemove, isRemoval: true, confirm: true, title: 'ลบวอลล์เปเปอร์', body: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?' },
                'remove-wall': { action: (item) => { animateAndRemove(item.closest('.wall-input-row')); }, isRemoval: true, confirm: false, toast: 'ลบผนังแล้ว' },
                'toggle-suspend': { action: suspendItem, isRemoval: false, toast: null },
                'toggle-suspend-room': { action: suspendRoom, isRemoval: false, toast: null },
                'toggle-room-menu': { action: (item) => item.closest('.room-options-container').querySelector('.room-options-menu').classList.toggle('show'), isRemoval: false, toast: null },
            };

            const action = actions[btn.dataset.act];
            if (action) {
                if (action.confirm) {
                    showConfirmation(action.title, action.body).then(result => {
                        if (result) {
                             if (action.isRemoval) animateAndRemove(btn.closest(action.selector));
                            else action.action(btn.closest(action.selector));
                        }
                    });
                } else {
                    if (action.isRemoval) animateAndRemove(btn.closest(action.selector));
                    else action.action(btn);
                }
            }

            e.preventDefault();
        });

        roomsContainer.addEventListener('change', (e) => {
            if (isLocked) return;
            const select = e.target.closest('select[name="fabric_variant"]');
            if (select) {
                toggleSetFabricUI(select.closest(SELECTORS.set));
            }
        });

        function toggleSetFabricUI(setEl) {
            const variant = setEl.querySelector('select[name="fabric_variant"]').value;
            const opaqueSelect = setEl.querySelector('select[name="set_price_per_m"]');
            const sheerSelect = setEl.querySelector('select[name="sheer_price_per_m"]');
            
            opaqueSelect.disabled = !variant.includes("ทึบ");
            sheerSelect.disabled = !variant.includes("โปร่ง");

            if(opaqueSelect.disabled) opaqueSelect.value = "";
            if(sheerSelect.disabled) sheerSelect.value = "";
            
            recalcAll();
        }

        // Action buttons
        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async () => {
            const confirmed = await showConfirmation("ล้างข้อมูลทั้งหมด", "คุณแน่ใจหรือไม่? ข้อมูลทั้งหมดจะถูกลบ");
            if (confirmed) {
                localStorage.removeItem(STORAGE_KEY);
                document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
                roomCount = 0;
                addRoom();
                recalcAll();
                showToast("ล้างข้อมูลเรียบร้อยแล้ว", "success");
            }
        });

        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async () => {
            const option = await showCopyOptionsModal();
            if (option) {
                const text = await generateSummaryText(option);
                try {
                    await navigator.clipboard.writeText(text);
                    showToast("คัดลอกสรุปเรียบร้อยแล้ว", "success");
                } catch (err) {
                    showToast("ไม่สามารถคัดลอกได้", "error");
                    console.error('Failed to copy text: ', err);
                }
            }
        });
        
        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async () => {
            try {
                const data = collectData();
                const jsonText = JSON.stringify(data, null, 2);
                await navigator.clipboard.writeText(jsonText);
                showToast("คัดลอก JSON เรียบร้อยแล้ว", "success");
            } catch (err) {
                showToast("ไม่สามารถคัดลอก JSON ได้", "error");
                console.error('Failed to copy JSON: ', err);
            }
        });
        
        document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
            const data = collectData();
            const jsonText = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonText], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `marnthara_quotation_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast("ส่งออกข้อมูลเรียบร้อยแล้ว", "success");
        });
        
        document.querySelector(SELECTORS.importBtn).addEventListener('click', async () => {
            const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
>>>>>>> parent of aa8f231 (+)
            menuDropdown.classList.remove('show');
            const payload = await showImportModal();
            if (payload) loadPayload(payload);
        });

        // Menu & Popup Toggles
        window.addEventListener('click', (e) => {
            // Close main menu
            if (!e.target.closest('.menu-container')) {
                document.querySelector(SELECTORS.menuDropdown).classList.remove('show');
            }
            // Close room menus
            if (!e.target.closest('[data-act="toggle-room-menu"]')) {
                document.querySelectorAll('.room-options-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });
        document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
            menuDropdown.classList.toggle('show');
        });

        // Initial Load from localStorage
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

    // --- START THE APP ---
    document.addEventListener('DOMContentLoaded', setupEventListeners);
})();