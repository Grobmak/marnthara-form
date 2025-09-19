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
        grandTotal: '#grandTotal', setCount: '#setCount', totalSqm: '#totalSqm', // ADDED: new selector for total sqm
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
        let totalWallpaperRolls = 0, totalSqm = 0; // ADDED: totalSqm
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
                let decoPrice = 0;
                if (deco.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const w = clamp01(deco.querySelector('input[name="deco_width_m"]')?.value);
                    const h = clamp01(deco.querySelector('input[name="deco_height_m"]')?.value);
                    const p = clamp01(deco.querySelector('input[name="deco_price_sqyd"]')?.value);
                    const type = deco.querySelector('input[name="deco_type"]')?.value;

                    if (p > 0 && w > 0 && h > 0) {
                        decoPrice = Math.round((w * h * SQM_TO_SQYD) * p);
                        if (type) {
                            decoCounts[type] = (decoCounts[type] || 0) + 1;
                        }
                    }
                    if (decoPrice > 0) {
                         pricedItemCount++;
                    }
                }
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmt(decoPrice, 0, true)}</b> บ.`;
                roomSum += decoPrice;
            });
            
            // WALLPAPERS
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let totalWidth = 0;
                const h = clamp01(wallpaper.querySelector('input[name="wallpaper_height_m"]')?.value);
                
                wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(wallInput => {
                    totalWidth += clamp01(wallInput.value);
                });
                
                // ADDED: Calculate total area
                const area = totalWidth * h;
                if (!isRoomSuspended) {
                     totalSqm += area;
                }

                let wallpaperPrice = 0;
                let rolls = 0;
                if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const p = clamp01(wallpaper.querySelector('input[name="wallpaper_price_roll"]')?.value);
                    const installCost = clamp01(wallpaper.querySelector('input[name="wallpaper_install_cost"]')?.value);
                    rolls = CALC.wallpaperRolls(totalWidth, h);
                    if (p > 0 && rolls > 0) {
                         wallpaperPrice = Math.round(rolls * p + rolls * installCost);
                         totalWallpaperRolls += rolls;
                    }
                    if (wallpaperPrice > 0) {
                         pricedItemCount++;
                    }
                }
                
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `จำนวนม้วน: <b>${rolls}</b> ม้วน ราคา: <b>${fmt(wallpaperPrice, 0, true)}</b> บ.`;
                roomSum += wallpaperPrice;
            });
            
            grand += roomSum;
        });
        
        // UPDATE GRAND TOTALS
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;
        document.querySelector(SELECTORS.totalSqm).textContent = fmt(totalSqm, 2); // ADDED: update total sqm display
        
        // UPDATE DETAILED SUMMARY
        updateDetailedSummary({
            grandOpaqueYards,
            grandSheerYards,
            grandOpaqueTrack,
            grandSheerTrack,
            hasDoubleBracket,
            totalWallpaperRolls,
            totalSqm, // ADDED: totalSqm
        });
    }

    function updateDetailedSummary(data) {
        const container = document.querySelector(SELECTORS.detailedSummaryContainer);
        if (!container) return;
        const { grandOpaqueYards, grandSheerYards, grandOpaqueTrack, grandSheerTrack, hasDoubleBracket, totalWallpaperRolls, totalSqm } = data; // ADDED: totalSqm
        
        let html = '';
        if (grandOpaqueYards > 0) {
            html += `<p class="material-summary-item">ผ้าทึบ: <span class="material-value"><b>${fmt(grandOpaqueYards, 2)}</b> หลา</span></p>`;
        }
        if (grandSheerYards > 0) {
             html += `<p class="material-summary-item">ผ้าโปร่ง: <span class="material-value"><b>${fmt(grandSheerYards, 2)}</b> หลา</span></p>`;
        }
        if (grandOpaqueTrack > 0) {
            html += `<p class="material-summary-item">รางม่าน (ทึบ): <span class="material-value"><b>${fmt(grandOpaqueTrack, 2)}</b> ม.</span></p>`;
        }
        if (grandSheerTrack > 0) {
            html += `<p class="material-summary-item">รางม่าน (โปร่ง): <span class="material-value"><b>${fmt(grandSheerTrack, 2)}</b> ม.</span></p>`;
        }
        if (hasDoubleBracket) {
            html += `<p class="material-summary-item">ขายึด 2 ชั้น: <span class="material-value"><b>จำเป็น</b></span></p>`;
        }
        if (totalWallpaperRolls > 0) {
            html += `<p class="material-summary-item">วอลเปเปอร์: <span class="material-value"><b>${totalWallpaperRolls}</b> ม้วน</span></p>`;
            html += `<p class="material-summary-item">พื้นที่วอลเปเปอร์: <span class="material-value"><b>${fmt(totalSqm, 2)}</b> ตร.ม.</span></p>`; // ADDED: display total sqm
        }
        
        container.innerHTML = html;
    }

    function generatePayload(customerInfo, rooms, option) {
        const data = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer: customerInfo,
            rooms: rooms.map(roomEl => {
                const room = {
                    room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || "ห้อง",
                    is_suspended: roomEl.dataset.suspended === 'true',
                    sets: [],
                    decorations: [],
                    wallpapers: []
                };

                roomEl.querySelectorAll(SELECTORS.set).forEach(set => {
                    room.sets.push({
                        is_suspended: set.dataset.suspended === 'true',
                        width_m: toNum(set.querySelector('input[name="width_m"]')?.value),
                        height_m: toNum(set.querySelector('input[name="height_m"]')?.value),
                        style: set.querySelector('select[name="set_style"]')?.value || "ลอน",
                        fabric_variant: set.querySelector('select[name="fabric_variant"]')?.value || "ทึบ",
                        fabric_code: set.querySelector('input[name="fabric_code"]')?.value || "",
                        opening_style: set.querySelector('select[name="opening_style"]')?.value || "แยกกลาง",
                        notes: set.querySelector('input[name="notes"]')?.value || "",
                        price_per_m_raw: toNum(set.querySelector('select[name="set_price_per_m"]')?.value),
                        sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]')?.value),
                    });
                });
                
                roomEl.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                    room.decorations.push({
                        is_suspended: deco.dataset.suspended === 'true',
                        type: deco.querySelector('input[name="deco_type"]')?.value || "",
                        width_m: toNum(deco.querySelector('input[name="deco_width_m"]')?.value),
                        height_m: toNum(deco.querySelector('input[name="deco_height_m"]')?.value),
                        price_sqyd: toNum(deco.querySelector('input[name="deco_price_sqyd"]')?.value),
                    });
                });

                roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                    const widths = [];
                    wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(wallInput => {
                        widths.push(toNum(wallInput.value));
                    });
                    
                    room.wallpapers.push({
                        is_suspended: wallpaper.dataset.suspended === 'true',
                        code: wallpaper.querySelector('input[name="wallpaper_code"]')?.value || "",
                        height_m: toNum(wallpaper.querySelector('input[name="wallpaper_height_m"]')?.value),
                        price_per_roll: toNum(wallpaper.querySelector('input[name="wallpaper_price_roll"]')?.value),
                        install_cost_per_roll: toNum(wallpaper.querySelector('input[name="wallpaper_install_cost"]')?.value),
                        widths: widths
                    });
                });
                return room;
            })
        };

        let output = `[ใบเสนอราคา Marnthara]\n`;
        output += `วันที่: ${new Date().toLocaleDateString("th-TH")}\n`;
        output += `ชื่อลูกค้า: ${customerInfo.customer_name}\n`;
        if (customerInfo.customer_phone) output += `เบอร์โทร: ${customerInfo.customer_phone}\n`;
        if (customerInfo.customer_address) output += `ที่อยู่: ${customerInfo.customer_address}\n`;
        output += `--------------------\n`;
        
        let grandTotal = 0;

        data.rooms.forEach(room => {
            if (room.is_suspended) return;
            let roomTotal = 0;
            output += `* ${room.room_name}\n`;
            
            room.sets.forEach(set => {
                if (set.is_suspended) return;
                const setPrice = calculateSetPrice(set);
                if (setPrice > 0) {
                     output += `  - ม่าน${set.fabric_variant} (${set.width_m}x${set.height_m}ม.) ${set.style} ราคา ${fmt(setPrice, 0, true)} บ.\n`;
                     roomTotal += setPrice;
                }
            });

            room.decorations.forEach(deco => {
                if (deco.is_suspended) return;
                const decoPrice = calculateDecoPrice(deco);
                 if (decoPrice > 0) {
                    output += `  - อุปกรณ์ ${deco.type} (${deco.width_m}x${deco.height_m}ม.) ราคา ${fmt(decoPrice, 0, true)} บ.\n`;
                    roomTotal += decoPrice;
                }
            });
            
            room.wallpapers.forEach(wallpaper => {
                if (wallpaper.is_suspended) return;
                const wallpaperPrice = calculateWallpaperPrice(wallpaper);
                const totalWidth = wallpaper.widths.reduce((sum, w) => sum + w, 0);
                const rolls = CALC.wallpaperRolls(totalWidth, wallpaper.height_m);
                if (wallpaperPrice > 0) {
                    output += `  - วอลเปเปอร์ ${wallpaper.code} (${totalWidth}x${wallpaper.height_m}ม.) จำนวน ${rolls} ม้วน ราคา ${fmt(wallpaperPrice, 0, true)} บ.\n`;
                    roomTotal += wallpaperPrice;
                }
            });

            if (roomTotal > 0) {
                output += `  > รวม ${room.room_name}: ${fmt(roomTotal, 0, true)} บ.\n`;
                grandTotal += roomTotal;
            }
        });
        
        output += `--------------------\n`;
        output += `**รวมทั้งหมด: ${fmt(grandTotal, 0, true)} บ.**\n`;

        if (option === 'seamstress') {
            output = `[สรุปงานตัดเย็บ - ${new Date().toLocaleDateString("th-TH")}]\n`;
            output += `ลูกค้า: ${customerInfo.customer_name}\n`;
            output += `เบอร์โทร: ${customerInfo.customer_phone}\n`;
            output += `--------------------\n`;
            data.rooms.forEach(room => {
                if (room.is_suspended) return;
                output += `* ${room.room_name}\n`;
                room.sets.forEach(set => {
                    if (set.is_suspended) return;
                    const opaqueYards = CALC.fabricYardage(set.style, set.width_m);
                    const sheerYards = set.fabric_variant.includes("โปร่ง") ? CALC.fabricYardage(set.style, set.width_m) : 0;
                    if (opaqueYards > 0 || sheerYards > 0) {
                        output += `  - ${set.style} (${set.opening_style}) กว้าง ${fmt(set.width_m)}ม. x สูง ${fmt(set.height_m)}ม.\n`;
                        if (opaqueYards > 0) output += `    - ผ้าทึบ: ${set.fabric_code} (${fmt(opaqueYards, 2)} หลา)\n`;
                        if (sheerYards > 0) output += `    - ผ้าโปร่ง: รหัส${set.sheer_price_per_m} (${fmt(sheerYards, 2)} หลา)\n`;
                        if (set.notes) output += `    - หมายเหตุ: ${set.notes}\n`;
                    }
                });
            });
        }
        
        if (option === 'owner') {
             // Re-run calculations to get total yards and rolls for a clean summary
            const { grandOpaqueYards, grandSheerYards, grandOpaqueTrack, grandSheerTrack, hasDoubleBracket, totalWallpaperRolls, totalSqm } = getGrandTotals(data.rooms); // ADDED: totalSqm
            
            output = `[สรุปสำหรับร้านค้า - ${new Date().toLocaleDateString("th-TH")}]\n`;
            output += `ลูกค้า: ${customerInfo.customer_name}\n`;
            output += `เบอร์โทร: ${customerInfo.customer_phone}\n`;
            output += `ที่อยู่: ${customerInfo.customer_address}\n`;
            output += `--------------------\n`;
            
            output += `**สรุปราคา**\n`;
            output += `ค่าผ้าม่าน: ${fmt(getGrandFabricTotal(data.rooms), 0, true)} บ.\n`;
            output += `ค่าวอลเปเปอร์: ${fmt(getGrandWallpaperTotal(data.rooms), 0, true)} บ.\n`;
            output += `ค่าอุปกรณ์: ${fmt(getGrandDecoTotal(data.rooms), 0, true)} บ.\n`;
            output += `ยอดรวม: **${fmt(grandTotal, 0, true)}** บ.\n`;
            output += `\n`;
            
            output += `**สรุปวัสดุ**\n`;
            if (grandOpaqueYards > 0) output += `ผ้าทึบ: ${fmt(grandOpaqueYards, 2)} หลา\n`;
            if (grandSheerYards > 0) output += `ผ้าโปร่ง: ${fmt(grandSheerYards, 2)} หลา\n`;
            if (grandOpaqueTrack > 0) output += `รางม่าน (ทึบ): ${fmt(grandOpaqueTrack, 2)} ม.\n`;
            if (grandSheerTrack > 0) output += `รางม่าน (โปร่ง): ${fmt(grandSheerTrack, 2)} ม.\n`;
            if (hasDoubleBracket) output += `ขายึด 2 ชั้น: จำเป็น\n`;
            if (totalWallpaperRolls > 0) output += `วอลเปเปอร์: ${totalWallpaperRolls} ม้วน\n`;
            if (totalSqm > 0) output += `พื้นที่วอลเปเปอร์: ${fmt(totalSqm, 2)} ตร.ม.\n`; // ADDED: total sqm for owner
            
            output += `\n`;
            output += `**สรุปค่าใช้จ่าย**\n`;
            const totalMaterialCost = data.rooms.reduce((sum, room) => {
                if (room.is_suspended) return sum;
                let roomCost = 0;
                room.sets.forEach(set => {
                    if (set.is_suspended) return;
                    roomCost += (toNum(set.price_per_m_raw) * CALC.fabricYardage(set.style, set.width_m)) * 0.9 + (toNum(set.sheer_price_per_m) * CALC.fabricYardage(set.style, set.width_m)) * 0.9;
                });
                room.wallpapers.forEach(wallpaper => {
                    if (wallpaper.is_suspended) return;
                     const totalWidth = wallpaper.widths.reduce((s, w) => s + w, 0);
                    const rolls = CALC.wallpaperRolls(totalWidth, wallpaper.height_m);
                    roomCost += rolls * toNum(wallpaper.price_per_roll);
                });
                return sum + roomCost;
            }, 0);
            output += `ค่าวัสดุ: ${fmt(totalMaterialCost, 0, true)} บ.\n`;
            output += `ค่าแรง/ค่าติดตั้ง: ${fmt(grandTotal - totalMaterialCost, 0, true)} บ.\n`;

            output += `\n`;
            output += `**รายการสินค้า**\n`;
            data.rooms.forEach(room => {
                if (room.is_suspended) return;
                output += `* ${room.room_name}\n`;
                 room.sets.forEach(set => {
                    if (set.is_suspended) return;
                     output += `  - ม่าน${set.fabric_variant}: ${set.fabric_code} (${set.width_m}x${set.height_m}ม.) ${set.style} ราคา ${fmt(calculateSetPrice(set), 0, true)} บ.\n`;
                 });
                 room.wallpapers.forEach(wallpaper => {
                     if (wallpaper.is_suspended) return;
                     const totalWidth = wallpaper.widths.reduce((s, w) => s + w, 0);
                     const rolls = CALC.wallpaperRolls(totalWidth, wallpaper.height_m);
                     output += `  - วอลเปเปอร์: ${wallpaper.code} (${totalWidth}x${wallpaper.height_m}ม.) ${rolls} ม้วน ราคา ${fmt(calculateWallpaperPrice(wallpaper), 0, true)} บ.\n`;
                 });
                 room.decorations.forEach(deco => {
                     if (deco.is_suspended) return;
                     output += `  - อุปกรณ์: ${deco.type} (${deco.width_m}x${deco.height_m}ม.) ราคา ${fmt(calculateDecoPrice(deco), 0, true)} บ.\n`;
                 });
            });
            
        }

        return output;
    }
    
    function calculateSetPrice(set) {
        const w = toNum(set.width_m);
        const h = toNum(set.height_m);
        const style = set.style;
        const variant = set.fabric_variant;
        const sPlus = stylePlus(style);
        const hPlus = heightPlus(h);
        let opaquePrice = 0, sheerPrice = 0;
        if (variant.includes("ทึบ")) {
            const baseRaw = toNum(set.price_per_m_raw);
            if (baseRaw > 0) {
                opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
            }
        }
        if (variant.includes("โปร่ง")) {
            const sheerBase = toNum(set.sheer_price_per_m);
            if (sheerBase > 0) {
                sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
            }
        }
        return opaquePrice + sheerPrice;
    }

    function calculateDecoPrice(deco) {
        const w = toNum(deco.width_m);
        const h = toNum(deco.height_m);
        const p = toNum(deco.price_sqyd);
        return p > 0 ? Math.round((w * h * SQM_TO_SQYD) * p) : 0;
    }

    function calculateWallpaperPrice(wallpaper) {
        const totalWidth = wallpaper.widths.reduce((sum, w) => sum + w, 0);
        const rolls = CALC.wallpaperRolls(totalWidth, toNum(wallpaper.height_m));
        const p = toNum(wallpaper.price_per_roll);
        const installCost = toNum(wallpaper.install_cost_per_roll);
        return rolls > 0 ? Math.round(rolls * p + rolls * installCost) : 0;
    }
    
    // ADDED: New function to get grand totals for owner report
    function getGrandTotals(rooms) {
        let grandOpaqueYards = 0, grandSheerYards = 0, grandOpaqueTrack = 0, grandSheerTrack = 0;
        let totalWallpaperRolls = 0, totalSqm = 0;
        let hasDoubleBracket = false;
        
        rooms.forEach(room => {
            if (room.is_suspended) return;
            room.sets.forEach(set => {
                if (set.is_suspended) return;
                const w = toNum(set.width_m);
                const style = set.style;
                const variant = set.fabric_variant;
                if(variant === "ทึบ&โปร่ง") hasDoubleBracket = true;
                if (w > 0) {
                    if (variant.includes("ทึบ")) {
                         if (toNum(set.price_per_m_raw) > 0) {
                            grandOpaqueYards += CALC.fabricYardage(style, w);
                            grandOpaqueTrack += w;
                        }
                    }
                    if (variant.includes("โปร่ง")) {
                        if (toNum(set.sheer_price_per_m) > 0) {
                            grandSheerYards += CALC.fabricYardage(style, w);
                            grandSheerTrack += w;
                        }
                    }
                }
            });
            room.wallpapers.forEach(wallpaper => {
                if (wallpaper.is_suspended) return;
                const totalWidth = wallpaper.widths.reduce((sum, w) => sum + w, 0);
                const h = toNum(wallpaper.height_m);
                if (totalWidth > 0 && h > 0) {
                    const rolls = CALC.wallpaperRolls(totalWidth, h);
                    if (toNum(wallpaper.price_per_roll) > 0) {
                         totalWallpaperRolls += rolls;
                         totalSqm += totalWidth * h;
                    }
                }
            });
        });
        
        return { grandOpaqueYards, grandSheerYards, grandOpaqueTrack, grandSheerTrack, hasDoubleBracket, totalWallpaperRolls, totalSqm };
    }

    function getGrandFabricTotal(rooms) {
        return rooms.reduce((sum, room) => {
            if (room.is_suspended) return sum;
            return sum + room.sets.reduce((roomSum, set) => {
                if (set.is_suspended) return roomSum;
                return roomSum + calculateSetPrice(set);
            }, 0);
        }, 0);
    }

    function getGrandWallpaperTotal(rooms) {
         return rooms.reduce((sum, room) => {
            if (room.is_suspended) return sum;
            return sum + room.wallpapers.reduce((roomSum, wallpaper) => {
                if (wallpaper.is_suspended) return roomSum;
                return roomSum + calculateWallpaperPrice(wallpaper);
            }, 0);
        }, 0);
    }
    
    function getGrandDecoTotal(rooms) {
        return rooms.reduce((sum, room) => {
            if (room.is_suspended) return sum;
            return sum + room.decorations.reduce((roomSum, deco) => {
                if (deco.is_suspended) return roomSum;
                return roomSum + calculateDecoPrice(deco);
            }, 0);
        }, 0);
    }

    function r