(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.3.0-actual-cost";
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
            const stripsPerRoll = Math.floor(10 / height);
            if (stripsPerRoll === 0) return Infinity; // Prevent division by zero
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        }
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', clearAllBtn: '#clearAllBtn', copyJsonBtn: '#copyJsonBtn',
        lockBtn: '#lockBtn', addRoomFooterBtn: '#addRoomFooterBtn', lockText: '#lockText',
        grandTotal: '#grandTotal', setCount: '#setCount', grandProfit: '#grandProfit', grandProfitText: '.actual-profit-text',
        detailedSummaryContainer: '#detailed-material-summary',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]',
        toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
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
        if (!await showModal(SELECTORS.copyOptionsModal)) return false;
        return {
            customer: document.querySelector(SELECTORS.copyCustomerInfo)?.checked ?? false,
            details: document.querySelector(SELECTORS.copyRoomDetails)?.checked ?? false,
            summary: document.querySelector(SELECTORS.copySummary)?.checked ?? false,
        };
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
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }

        renumber();
        recalcAll();
        saveData();
        created.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว', 'success');
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
            created.querySelector('input[name="set_actual_selling_price"]').value = prefill.actual_selling_price ? fmt(prefill.actual_selling_price, 0, true) : "";
            created.querySelector('input[name="set_actual_cost"]').value = prefill.actual_cost ? fmt(prefill.actual_cost, 0, true) : "";
            if (prefill.is_suspended) suspendItem(created, true, false);
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
            created.querySelector('[name="deco_actual_selling_price"]').value = prefill.actual_selling_price ? fmt(prefill.actual_selling_price, 0, true) : "";
            created.querySelector('[name="deco_actual_cost"]').value = prefill.actual_cost ? fmt(prefill.actual_cost, 0, true) : "";
            const displayEl = created.querySelector('.deco-type-display');
            if (displayEl && type) {
                displayEl.textContent = `(${type})`;
            }
            if (prefill.is_suspended) suspendItem(created, true, false);
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
            created.querySelector('[name="wallpaper_actual_selling_price"]').value = prefill.actual_selling_price ? fmt(prefill.actual_selling_price, 0, true) : "";
            created.querySelector('[name="wallpaper_actual_cost"]').value = prefill.actual_cost ? fmt(prefill.actual_cost, 0, true) : "";
            (prefill.widths || []).forEach(w => addWall(created.querySelector('[data-act="add-wall"]'), w));
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
            addWall(created.querySelector('[data-act="add-wall"]'));
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
        
        const newWallInput = wallsContainer.querySelector('.wall-input-row:last-of-type input');
        if (newWallInput) {
            newWallInput.focus();
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

    async function performActionWithConfirmation(btn, actionConfig) {
        if (isLocked) return;
        if (actionConfig.confirm && !await showConfirmation(actionConfig.title, actionConfig.body)) return;
        
        const item = btn.closest(actionConfig.selector);
        if (item) {
            actionConfig.action(item, btn);
            renumber();
            recalcAll();
            saveData();
            if (actionConfig.toast) showToast(actionConfig.toast, 'success');
        }
    }

    // --- DATA & CALCULATIONS ---
    function recalcAll() {
        let grandTotal = 0, grandActualCost = 0, hasActualPrice = false;
        let grandOpaqueYards = 0, grandSheerYards = 0, grandOpaqueTrack = 0, grandSheerTrack = 0;
        let totalWallpaperRolls = 0;
        let hasDoubleBracket = false;
        const decoCounts = {};
        let pricedItemCount = 0;
        
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            let roomSum = 0;
            
            // CURTAIN SETS
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                let itemPrice = 0, itemCost = 0;
                let opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;

                if (set.dataset.suspended !== 'true') {
                    const actualSellingPrice = clamp01(set.querySelector('input[name="set_actual_selling_price"]')?.value);
                    const actualCost = clamp01(set.querySelector('input[name="set_actual_cost"]')?.value);

                    if (actualSellingPrice > 0 && actualCost > 0) {
                        // Use actual prices for calculation
                        itemPrice = actualSellingPrice;
                        itemCost = actualCost;
                        hasActualPrice = true;
                    } else {
                        // Fallback to old calculation
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
                                    itemPrice += Math.round((baseRaw + sPlus + hPlus) * w);
                                    opaqueYards = CALC.fabricYardage(style, w);
                                    opaqueTrack = w;
                                }
                            }
                            if (variant.includes("โปร่ง")) {
                                const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                                if (sheerBase > 0) {
                                    itemPrice += Math.round((sheerBase + sPlus + hPlus) * w);
                                    sheerYards = CALC.fabricYardage(style, w);
                                    sheerTrack = w;
                                }
                            }
                        }
                    }
                    if (itemPrice > 0) {
                        pricedItemCount++;
                    }
                }
                let summaryHtml = `ราคา: <b>${fmt(itemPrice, 0, true)}</b> บ.`;
                set.querySelector('[data-set-summary]').innerHTML = summaryHtml;
                set.querySelector('[data-set-yardage-opaque]').textContent = fmt(opaqueYards, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmt(sheerYards, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmt(opaqueTrack, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmt(sheerTrack, 2);
                roomSum += itemPrice;
                grandTotal += itemPrice;
                grandActualCost += itemCost;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            }); 
            
            // DECORATIONS
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                let itemPrice = 0, itemCost = 0;
                let areaSqyd = 0;
                if (deco.dataset.suspended !== 'true') {
                    const actualSellingPrice = clamp01(deco.querySelector('[name="deco_actual_selling_price"]')?.value);
                    const actualCost = clamp01(deco.querySelector('[name="deco_actual_cost"]')?.value);

                    if (actualSellingPrice > 0 && actualCost > 0) {
                        itemPrice = actualSellingPrice;
                        itemCost = actualCost;
                        hasActualPrice = true;
                    } else {
                        const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                        const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                        const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                        areaSqyd = w * h * SQM_TO_SQYD;
                        itemPrice = Math.round(areaSqyd * price);
                    }
                    if (itemPrice > 0) {
                        pricedItemCount++;
                        const type = deco.querySelector('[name="deco_type"]').value.trim();
                        if(type) { decoCounts[type] = (decoCounts[type] || 0) + 1; }
                    }
                }
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmt(itemPrice, 0, true)}</b> บ. • พื้นที่: <b>${fmt(areaSqyd, 2)}</b> ตร.หลา`;
                roomSum += itemPrice;
                grandTotal += itemPrice;
                grandActualCost += itemCost;
            });
            
            // WALLPAPERS
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let itemPrice = 0, itemCost = 0;
                let totalSqm = 0, rollsNeeded = 0;
                if (wallpaper.dataset.suspended !== 'true') {
                    const actualSellingPrice = clamp01(wallpaper.querySelector('[name="wallpaper_actual_selling_price"]')?.value);
                    const actualCost = clamp01(wallpaper.querySelector('[name="wallpaper_actual_cost"]')?.value);

                    if (actualSellingPrice > 0 && actualCost > 0) {
                        itemPrice = actualSellingPrice;
                        itemCost = actualCost;
                        hasActualPrice = true;
                    } else {
                        const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                        const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                        let totalWidth = 0;
                        wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                            totalWidth += clamp01(input.value);
                        });
                        rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                        totalSqm = totalWidth * h;
                        itemPrice = Math.round(rollsNeeded * pricePerRoll);
                    }
                    if (itemPrice > 0) {
                        pricedItemCount++;
                    }
                }
                const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
                if (summaryEl) {
                    summaryEl.innerHTML = `ราคา: <b>${fmt(itemPrice, 0, true)}</b> บ. • ${fmt(rollsNeeded, 0)} ม้วน • พื้นที่: ${fmt(totalSqm, 2)} ตร.ม.`;
                }
                roomSum += itemPrice;
                grandTotal += itemPrice;
                grandActualCost += itemCost;
            });

            room.querySelector('[data-room-brief]').textContent = `ยอดรวม: ${fmt(roomSum, 0, true)} บ.`;
        });
        
        // Update Grand Totals
        const grandTotalEl = document.querySelector(SELECTORS.grandTotal);
        const grandProfitEl = document.querySelector(SELECTORS.grandProfit);
        const profitDisplayEl = document.querySelector(SELECTORS.grandProfitText);
        
        grandTotalEl.textContent = fmt(grandTotal, 0, true);
        
        if (hasActualPrice) {
            const grandProfit = grandTotal - grandActualCost;
            profitDisplayEl.style.display = 'block';
            grandProfitEl.textContent = fmt(grandProfit, 0, true);
        } else {
            profitDisplayEl.style.display = 'none';
        }

        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

        // Update Detailed Material Summary
        const summaryEl = document.querySelector(SELECTORS.detailedSummaryContainer);
        let summaryText = "";
        
        if (grandOpaqueYards > 0) {
            summaryText += `<p>• ผ้าทึบ: <b class="curtain-color">${fmt(grandOpaqueYards, 2)}</b> หลา</p>`;
        }
        if (grandSheerYards > 0) {
            summaryText += `<p>• ผ้าโปร่ง: <b class="curtain-color">${fmt(grandSheerYards, 2)}</b> หลา</p>`;
        }
        if (grandOpaqueTrack > 0) {
            summaryText += `<p>• รางทึบ: <b class="curtain-color">${fmt(grandOpaqueTrack, 2)}</b> ม.</p>`;
        }
        if (grandSheerTrack > 0) {
            summaryText += `<p>• รางโปร่ง: <b class="curtain-color">${fmt(grandSheerTrack, 2)}</b> ม.</p>`;
        }
        
        for (const type in decoCounts) {
            summaryText += `<p>• งาน ${type}: <b class="deco-color">${decoCounts[type]}</b> รายการ</p>`;
        }

        if (totalWallpaperRolls > 0) {
            summaryText += `<p>• วอลล์เปเปอร์: <b class="wallpaper-color">${fmt(totalWallpaperRolls, 0)}</b> ม้วน</p>`;
        }

        summaryEl.innerHTML = summaryText || "ไม่มีรายการ";
    }

    function serializeForm() {
        const formData = {
            version: APP_VERSION,
            customer: {
                name: document.getElementById('customer_name').value.trim(),
                phone: document.getElementById('customer_phone').value.trim(),
                address: document.getElementById('customer_address').value.trim()
            },
            rooms: []
        };
        
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput).value.trim(),
                sets: [],
                decorations: [],
                wallpapers: []
            };

            // Curtain Sets
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const isSuspended = set.dataset.suspended === 'true';
                roomData.sets.push({
                    width_m: toNum(set.querySelector('[name="width_m"]').value),
                    height_m: toNum(set.querySelector('[name="height_m"]').value),
                    style: set.querySelector('[name="set_style"]').value,
                    fabric_variant: set.querySelector('[name="fabric_variant"]').value,
                    price_per_m_raw: toNum(set.querySelector('[name="set_price_per_m"]').value),
                    sheer_price_per_m: toNum(set.querySelector('[name="sheer_price_per_m"]').value),
                    actual_selling_price: toNum(set.querySelector('[name="set_actual_selling_price"]').value),
                    actual_cost: toNum(set.querySelector('[name="set_actual_cost"]').value),
                    is_suspended: isSuspended
                });
            });

            // Decorations
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isSuspended = deco.dataset.suspended === 'true';
                roomData.decorations.push({
                    type: deco.querySelector('[name="deco_type"]').value.trim(),
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]').value),
                    actual_selling_price: toNum(deco.querySelector('[name="deco_actual_selling_price"]').value),
                    actual_cost: toNum(deco.querySelector('[name="deco_actual_cost"]').value),
                    is_suspended: isSuspended
                });
            });

            // Wallpapers
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const isSuspended = wallpaper.dataset.suspended === 'true';
                const widths = [];
                wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(input => {
                    widths.push(toNum(input.value));
                });
                roomData.wallpapers.push({
                    height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value),
                    actual_selling_price: toNum(wallpaper.querySelector('[name="wallpaper_actual_selling_price"]').value),
                    actual_cost: toNum(wallpaper.querySelector('[name="wallpaper_actual_cost"]').value),
                    widths: widths,
                    is_suspended: isSuspended
                });
            });

            formData.rooms.push(roomData);
        });

        return formData;
    }

    function loadPayload(payload) {
        if (!payload || !payload.rooms) return;
        
        document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
        roomCount = 0;
        
        if (payload.customer) {
            document.getElementById('customer_name').value = payload.customer.name || "";
            document.getElementById('customer_phone').value = payload.customer.phone || "";
            document.getElementById('customer_address').value = payload.customer.address || "";
        }

        payload.rooms.forEach(room => addRoom(room));
    }
    
    function saveData() {
        try {
            const data = serializeForm();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (err) {
            console.error("Failed to save data to localStorage:", err);
            showToast('บันทึกข้อมูลอัตโนมัติล้มเหลว', 'error');
        }
    }

    // --- EVENT LISTENERS & INIT ---
    function init() {
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        
        const updateLockState = () => {
            isLocked = lockBtn.querySelector('i').classList.contains('ph-lock-key');
            document.querySelectorAll('input, select, textarea, button').forEach(el => {
                if (el.id !== 'lockBtn' && el.id !== 'menuBtn') {
                    el.disabled = isLocked;
                }
            });
            document.querySelector(SELECTORS.lockText).textContent = isLocked ? "ปลดล็อก" : "ล็อก";
            if (isLocked) {
                lockBtn.querySelector('i').className = 'ph-bold ph-lock-key lock-icon';
                showToast('ฟอร์มถูกล็อกแล้ว', 'info');
            } else {
                lockBtn.querySelector('i').className = 'ph-bold ph-lock-key-open lock-icon';
                showToast('ฟอร์มถูกปลดล็อกแล้ว', 'info');
            }
        };

        const debouncedSaveAndRecalc = debounce(() => {
            saveData();
            recalcAll();
        }, 300);

        orderForm.addEventListener('input', (e) => {
            const target = e.target;
            if (target.matches('input[type="number"], input[type="text"], select, textarea')) {
                debouncedSaveAndRecalc();
            }
        });

        orderForm.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.dataset.act;
            if (isLocked && action !== 'toggle-lock') return;

            const actions = {
                'del-room': { selector: SELECTORS.room, confirm: true, title: 'ลบห้อง', body: 'ยืนยันที่จะลบห้องนี้หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้', action: item => item.remove(), toast: 'ลบห้องแล้ว' },
                'add-set': { selector: SELECTORS.room, action: item => addSet(item) },
                'del-set': { selector: SELECTORS.set, confirm: true, title: 'ลบผ้าม่าน', body: 'ยืนยันที่จะลบรายการผ้าม่านนี้หรือไม่?', action: item => item.remove(), toast: 'ลบรายการแล้ว' },
                'add-deco': { selector: SELECTORS.room, action: item => addDeco(item) },
                'del-deco': { selector: SELECTORS.decoItem, confirm: true, title: 'ลบงานตกแต่ง', body: 'ยืนยันที่จะลบรายการงานตกแต่งนี้หรือไม่?', action: item => item.remove(), toast: 'ลบรายการแล้ว' },
                'add-wallpaper': { selector: SELECTORS.room, action: item => addWallpaper(item) },
                'del-wallpaper': { selector: SELECTORS.wallpaperItem, confirm: true, title: 'ลบวอลล์เปเปอร์', body: 'ยืนยันที่จะลบรายการวอลล์เปเปอร์นี้หรือไม่?', action: item => item.remove(), toast: 'ลบรายการแล้ว' },
                'add-wall': { selector: SELECTORS.wallpaperItem, action: (item, btn) => addWall(btn) },
                'del-wall': { selector: '.wall-input-row', action: item => item.remove(), toast: 'ลบผนังแล้ว' },
                'toggle-suspend': { selector: '.item-card', action: item => {
                    const isSuspended = item.dataset.suspended === 'true';
                    suspendItem(item, !isSuspended);
                }}
            };

            if (actions[action]) {
                await performActionWithConfirmation(btn, actions[action]);
            }
        });
        
        lockBtn.addEventListener('click', () => {
            isLocked = !isLocked;
            updateLockState();
        });
        
        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => {
            if (isLocked) {
                showToast("ฟอร์มถูกล็อกอยู่ โปรดปลดล็อกก่อน", "warning");
                return;
            }
            addRoom();
        });

        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            menuDropdown.classList.remove('show');
            if (!await showConfirmation('ล้างข้อมูลทั้งหมด', 'การกระทำนี้จะล้างข้อมูลทั้งหมดในฟอร์มและไม่สามารถย้อนกลับได้ คุณแน่ใจหรือไม่?')) {
                return;
            }
            localStorage.removeItem(STORAGE_KEY);
            document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
            document.getElementById('customer_name').value = "";
            document.getElementById('customer_phone').value = "";
            document.getElementById('customer_address').value = "";
            roomCount = 0;
            addRoom();
            showToast('ล้างข้อมูลสำเร็จ', 'success');
        });

        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', (e) => {
            e.preventDefault();
            const data = serializeForm();
            navigator.clipboard.writeText(JSON.stringify(data, null, 2))
                .then(() => showToast('คัดลอก JSON แล้ว', 'success'))
                .catch(err => showToast('คัดลอก JSON ล้มเหลว', 'error'));
            menuDropdown.classList.remove('show');
        });

        document.querySelector(SELECTORS.exportBtn).addEventListener('click', (e) => {
            e.preventDefault();
            const data = serializeForm();
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", url);
            downloadAnchorNode.setAttribute("download", `marnthara-data-${Date.now()}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            showToast('ส่งออกข้อมูลสำเร็จ', 'success');
            menuDropdown.classList.remove('show');
        });
        
        document.querySelector(SELECTORS.importBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            menuDropdown.classList.remove('show');
            const payload = await showImportModal();
            if (payload) loadPayload(payload);
        });

        // Menu Dropdown Toggle
        document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
            menuDropdown.classList.toggle('show');
        });
        window.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-container')) {
                menuDropdown.classList.remove('show');
            }
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
            localStorage.removeItem(STORAGE_KEY); 
            addRoom();
        }
        recalcAll();
        updateLockState();
    }

    // --- START THE APP ---
    document.addEventListener('DOMContentLoaded', init);
})();