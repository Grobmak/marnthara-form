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
        // --- MODIFIED: Wallpaper roll calculation ---
        wallpaperRolls: (totalWidth, height) => {
            if (totalWidth <= 0 || height <= 0) return 0;
            // Professional waste calculation:
            // For walls > 2.5m high, calculate strips precisely based on roll length.
            // For standard walls <= 2.5m, assume higher waste by conservatively estimating only 3 usable strips per 10m roll, to account for pattern matching and trimming.
            const stripsPerRoll = (height > 2.5) ? Math.floor(10 / height) : 3;
            if (stripsPerRoll <= 0) return Infinity; // Prevent division by zero for heights >= 10m
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
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
            // MODIFIED: Pre-fill installation cost, defaulting to 300 for old data
            created.querySelector('[name="wallpaper_install_cost"]').value = fmt(prefill.install_cost_per_roll ?? 300, 0, true);
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
        let totalWallpaperRolls = 0, grandTotalSqMeters = 0;
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
                        if(type) {
                            decoCounts[type] = (decoCounts[type] || 0) + 1;
                        }
                    }
                }

                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmt(decoPrice, 0, true)}</b> บ.`;
                deco.querySelector('[data-deco-area-sqm]').textContent = fmt(areaSqyd / SQM_TO_SQYD, 2);
                roomSum += decoPrice;
            });

            // WALLPAPERS
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(item => {
                let itemPrice = 0;
                let totalWidth = 0;
                let totalSqm = 0;
                let height = 0;

                if (item.dataset.suspended !== 'true' && !isRoomSuspended) {
                    height = clamp01(item.querySelector('[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(item.querySelector('[name="wallpaper_price_roll"]')?.value);
                    const installCost = clamp01(item.querySelector('[name="wallpaper_install_cost"]')?.value);
                    
                    item.querySelectorAll('[name="wall_width_m"]').forEach(wallInput => {
                        totalWidth += clamp01(wallInput.value);
                    });

                    const rolls = CALC.wallpaperRolls(totalWidth, height);
                    if (rolls > 0) {
                        pricedItemCount++;
                        itemPrice = Math.round(rolls * (pricePerRoll + installCost));
                        totalWallpaperRolls += rolls;
                        totalSqm = totalWidth * height;
                        grandTotalSqMeters += totalSqm;
                    }
                }
                
                // --- MODIFIED: Update wallpaper summary line with SQM ---
                const rollsDisplay = CALC.wallpaperRolls(totalWidth, height);
                const summaryEl = item.querySelector('[data-wallpaper-summary]');
                if (summaryEl) {
                    summaryEl.innerHTML = `รวม: <b>${fmt(itemPrice, 0, true)}</b> บ. • ใช้ <b>${fmt(rollsDisplay, 0, true)}</b> ม้วน • ใช้ <b>${fmt(totalSqm, 2)}</b> ตร.ม.`;
                }

                roomSum += itemPrice;
            });

            grand += roomSum;
            room.querySelector('[data-room-brief]').innerHTML = `<span><b>${fmt(roomSum, 0, true)}</b> บ.</span>`;
        });
        
        // Final Summary Updates
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        
        updateDetailedSummary({
            grandOpaqueYards, grandSheerYards, grandOpaqueTrack, grandSheerTrack,
            totalWallpaperRolls, grandTotalSqMeters,
            hasDoubleBracket, decoCounts
        });
    }

    function createOwnerSummary(data) {
        let summary = "--- รายละเอียดทั้งหมด (สำหรับร้านค้า) ---\n\n";
        
        summary += `รวมทั้งหมด: ${fmt(data.grand, 0, true)} บ.\n`;
        summary += `จำนวนรายการ: ${data.setCount}\n`;
        summary += `\n`;

        summary += `-- สรุปวัสดุรวม --\n`;
        summary += `ผ้าทึบ: ${fmt(data.grandOpaqueYards, 2)} หลา\n`;
        summary += `ผ้าโปร่ง: ${fmt(data.grandSheerYards, 2)} หลา\n`;
        summary += `ราง: ${fmt(data.grandOpaqueTrack + data.grandSheerTrack, 2)} ม.\n`;
        if (data.hasDoubleBracket) summary += `(มีงานรางคู่)\n`;
        summary += `วอลล์เปเปอร์: ${fmt(data.totalWallpaperRolls, 0, true)} ม้วน\n`;
        summary += `**วอลล์เปเปอร์: ${fmt(data.grandTotalSqMeters, 2)} ตร.ม. (พื้นที่)**\n`;
        
        for (const type in data.decoCounts) {
            summary += `${type}: ${data.decoCounts[type]} รายการ\n`;
        }

        summary += `\n-- ข้อมูลลูกค้า --\n`;
        summary += `ชื่อ: ${data.customer_name}\n`;
        summary += `เบอร์โทร: ${data.customer_phone}\n`;
        summary += `ที่อยู่: ${data.customer_address}\n`;
        summary += `\n`;
        
        summary += `-- รายละเอียดแยกห้อง --\n\n`;

        data.rooms.forEach((room, roomIndex) => {
            const roomNum = roomIndex + 1;
            summary += `[ห้อง ${roomNum}] ${room.room_name || `ห้อง ${roomNum}`}\n`;
            if (room.is_suspended) {
                summary += `(รายการถูกระงับ)\n`;
            }
            
            room.sets.forEach((set, setIndex) => {
                if (set.is_suspended) {
                    summary += `(รายการถูกระงับ) `;
                }
                summary += `> ผ้าม่าน ${setIndex + 1}: ${set.width_m}ม. x ${set.height_m}ม., รหัสผ้า: ${set.fabric_code || '-'}, ราคา: ${fmt(set.price, 0, true)} บ.\n`;
                if(set.style) summary += `> รูปแบบ: ${set.style}\n`;
                if(set.opening_style) summary += `> การเปิด: ${set.opening_style}\n`;
                if(set.variant) {
                    if (set.variant.includes("ทึบ")) summary += `> ผ้าทึบ: ${fmt(set.opaqueYards, 2)} หลา, ราง: ${fmt(set.opaqueTrack, 2)} ม.\n`;
                    if (set.variant.includes("โปร่ง")) summary += `> ผ้าโปร่ง: ${fmt(set.sheerYards, 2)} หลา, ราง: ${fmt(set.sheerTrack, 2)} ม.\n`;
                }
                if (set.notes) summary += `> หมายเหตุ: ${set.notes}\n`;
                summary += `\n`;
            });
            
            room.decorations.forEach((deco, decoIndex) => {
                if (deco.is_suspended) {
                    summary += `(รายการถูกระงับ) `;
                }
                summary += `> อุปกรณ์ ${decoIndex + 1}: ${deco.type || 'ไม่ระบุ'}, ${deco.width_m}ม. x ${deco.height_m}ม., ราคา: ${fmt(deco.price, 0, true)} บ.\n`;
                summary += `\n`;
            });

            room.wallpapers.forEach((wallpaper, wallpaperIndex) => {
                if (wallpaper.is_suspended) {
                    summary += `(รายการถูกระงับ) `;
                }
                summary += `> วอลล์เปเปอร์ ${wallpaperIndex + 1}: สูง ${wallpaper.height_m}ม., ความกว้างผนังรวม: ${wallpaper.totalWidth}ม., พื้นที่รวม: ${fmt(wallpaper.totalSqm, 2)} ตร.ม., ใช้: ${wallpaper.rolls} ม้วน, ราคา: ${fmt(wallpaper.price, 0, true)} บ.\n`;
                summary += `\n`;
            });

            summary += `\n`;
        });
        
        return summary;
    }


    // --- EVENT LISTENERS & INITIALIZATION ---
    function init() {
        // --- Form Event Listeners (Debounced for performance) ---
        const handleRecalc = debounce(recalcAll, 100);
        document.addEventListener('input', (e) => {
            const isRecalcTrigger = e.target.closest(SELECTORS.set) || e.target.closest(SELECTORS.decoItem) || e.target.closest(SELECTORS.wallpaperItem) || e.target.closest(SELECTORS.room);
            if (isRecalcTrigger) {
                handleRecalc();
            }
        });
        document.addEventListener('change', (e) => {
            const isRecalcTrigger = e.target.closest(SELECTORS.set) || e.target.closest(SELECTORS.decoItem) || e.target.closest(SELECTORS.wallpaperItem) || e.target.closest(SELECTORS.room);
            if (isRecalcTrigger) {
                handleRecalc();
            }
            if (e.target.name === 'fabric_variant') {
                toggleSetFabricUI(e.target.closest(SELECTORS.set));
            }
        });

        // --- Action Buttons ---
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-act="add-room"]')) {
                addRoom();
            } else if (e.target.closest('[data-act="add-set"]')) {
                addSet(e.target.closest(SELECTORS.room));
            } else if (e.target.closest('[data-act="add-deco"]')) {
                addDeco(e.target.closest(SELECTORS.room));
            } else if (e.target.closest('[data-act="add-wallpaper"]')) {
                addWallpaper(e.target.closest(SELECTORS.room));
            } else if (e.target.closest('[data-act="add-wall"]')) {
                addWall(e.target.closest('[data-act="add-wall"]'));
            } else if (e.target.closest('[data-act="remove-item"]')) {
                performActionWithConfirmation(e.target.closest('[data-act="remove-item"]'), {
                    selector: '.set-item, .deco-item, .wallpaper-item',
                    action: animateAndRemove,
                    isRemoval: true,
                    confirm: true,
                    title: 'ยืนยันการลบรายการ',
                    body: 'คุณต้องการลบรายการนี้ใช่หรือไม่? ข้อมูลจะถูกลบออกทั้งหมดและไม่สามารถกู้คืนได้'
                });
            } else if (e.target.closest('[data-act="remove-wall"]')) {
                performActionWithConfirmation(e.target.closest('[data-act="remove-wall"]'), {
                    selector: '.wall-input-row',
                    action: animateAndRemove,
                    isRemoval: true,
                    confirm: true,
                    title: 'ยืนยันการลบผนัง',
                    body: 'คุณต้องการลบความกว้างผนังนี้ใช่หรือไม่?'
                });
            } else if (e.target.closest('[data-act="remove-room"]')) {
                 performActionWithConfirmation(e.target.closest('[data-act="remove-room"]'), {
                    selector: SELECTORS.room,
                    action: animateAndRemove,
                    isRemoval: true,
                    confirm: true,
                    title: 'ยืนยันการลบห้อง',
                    body: 'คุณต้องการลบห้องนี้ใช่หรือไม่? ข้อมูลทั้งหมดของห้องจะถูกลบ'
                });
            } else if (e.target.closest('[data-act="duplicate-set"]')) {
                performActionWithConfirmation(e.target.closest('[data-act="duplicate-set"]'), {
                    selector: SELECTORS.set,
                    action: duplicateSet,
                    toast: 'คัดลอกชุดผ้าม่านแล้ว'
                });
            } else if (e.target.closest('[data-act="duplicate-deco"]')) {
                performActionWithConfirmation(e.target.closest('[data-act="duplicate-deco"]'), {
                    selector: SELECTORS.decoItem,
                    action: duplicateDeco,
                    toast: 'คัดลอกอุปกรณ์แล้ว'
                });
            } else if (e.target.closest('[data-act="duplicate-wallpaper"]')) {
                performActionWithConfirmation(e.target.closest('[data-act="duplicate-wallpaper"]'), {
                    selector: SELECTORS.wallpaperItem,
                    action: duplicateWallpaper,
                    toast: 'คัดลอกวอลล์เปเปอร์แล้ว'
                });
            } else if (e.target.closest('[data-act="duplicate-room"]')) {
                 performActionWithConfirmation(e.target.closest('[data-act="duplicate-room"]'), {
                    selector: SELECTORS.room,
                    action: duplicateRoom,
                    toast: 'คัดลอกห้องแล้ว'
                });
            } else if (e.target.closest('[data-act="toggle-suspend"]')) {
                const item = e.target.closest('.set-item, .deco-item, .wallpaper-item');
                const isSuspended = item.dataset.suspended === 'true';
                suspendItem(item, !isSuspended);
                recalcAll();
                saveData();
            } else if (e.target.closest('[data-act="toggle-suspend-room"]')) {
                const roomEl = e.target.closest(SELECTORS.room);
                const isSuspended = roomEl.dataset.suspended === 'true';
                suspendRoom(roomEl, !isSuspended);
            } else if (e.target.closest(SELECTORS.lockBtn)) {
                toggleLock();
            } else if (e.target.closest(SELECTORS.addRoomFooterBtn)) {
                addRoom();
            } else if (e.target.closest('[data-act="toggle-room-menu"]')) {
                document.querySelectorAll('.room-options-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                });
                e.target.closest('[data-act="toggle-room-menu"]').nextElementSibling.classList.toggle('show');
            }
        });

        // Copy actions
        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            if (isLocked) return showToast('ไม่สามารถคัดลอกได้ขณะล็อกฟอร์ม', 'warning');
            const option = await showCopyOptionsModal();
            if (option) {
                const payload = createPayload();
                let summaryText = "";
                if (option === 'customer') {
                    summaryText = createCustomerSummary(payload);
                } else if (option === 'seamstress') {
                    summaryText = createSeamstressSummary(payload);
                } else if (option === 'owner') {
                    summaryText = createOwnerSummary(payload);
                }
                
                try {
                    await navigator.clipboard.writeText(summaryText);
                    showToast('คัดลอกข้อมูลสำเร็จ!', 'success');
                } catch (err) {
                    console.error('Failed to copy text: ', err);
                    showToast('ไม่สามารถคัดลอกได้', 'error');
                }
            }
        });

        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            if (isLocked) return showToast('ไม่สามารถคัดลอกได้ขณะล็อกฟอร์ม', 'warning');
            try {
                const payload = createPayload();
                const jsonString = JSON.stringify(payload, null, 2);
                await navigator.clipboard.writeText(jsonString);
                showToast('คัดลอกข้อมูล JSON สำเร็จ!', 'success');
            } catch (err) {
                console.error('Failed to copy JSON: ', err);
                showToast('ไม่สามารถคัดลอก JSON ได้', 'error');
            }
        });

        // Import/Export
        document.querySelector(SELECTORS.exportBtn).addEventListener('click', (e) => {
            e.preventDefault();
            if (isLocked) return showToast('ไม่สามารถส่งออกได้ขณะล็อกฟอร์ม', 'warning');
            const data = JSON.stringify(createPayload(), null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `marnthara-quotation-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('ส่งออกข้อมูลสำเร็จ', 'success');
        });

        document.querySelector(SELECTORS.importBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            if (isLocked) return showToast('ไม่สามารถนำเข้าได้ขณะล็อกฟอร์ม', 'warning');
            const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
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
    document.addEventListener('DOMContentLoaded', init);
})();