(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.2.0-refined";
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
            if (stripsPerRoll === 0) return Infinity; // Prevent division from zero
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
        copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn',
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        submitBtn: '#submitBtn'
    };

    // --- STATE ---
    let roomCount = 0;
    let isLocked = false;
    let activeSwipe = {
        element: null,
        startX: 0,
        currentX: 0,
        isSwiping: false,
    };
    const SWIPE_THRESHOLD = 80;

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
    
    function removeRoom(roomEl) {
        if (roomEl) {
            roomEl.classList.add('deleting');
            roomEl.addEventListener('transitionend', () => {
                roomEl.remove();
                renumber();
                recalcAll();
                saveData();
            });
            showToast('ลบห้องสำเร็จ', 'success');
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
        let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0, grandOpaqueTrack = 0, grandSheerTrack = 0;
        let totalWallpaperRolls = 0;
        let hasDoubleBracket = false;
        const decoCounts = {};
        let pricedItemCount = 0;
        
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            let roomSum = 0;
            
            // CURTAIN SETS
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                
                if (set.dataset.suspended !== 'true') {
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
                    if (opaquePrice + sheerPrice > 0) { pricedItemCount++; }
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
                if (deco.dataset.suspended !== 'true') {
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
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmt(decoPrice, 0, true)}</b> บ. • พื้นที่: <b>${fmt(areaSqyd, 2)}</b> ตร.หลา`;
                roomSum += decoPrice;
            });

            // WALLPAPERS
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let wallpaperPrice = 0, areaSqm = 0, rollsNeeded = 0;
                if (wallpaper.dataset.suspended !== 'true') {
                    const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                    const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                    rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                    wallpaperPrice = Math.round(rollsNeeded * pricePerRoll);
                    areaSqm = totalWidth * h;
                    if (wallpaperPrice > 0) {
                        pricedItemCount++;
                        if (Number.isFinite(rollsNeeded)) {
                            totalWallpaperRolls += rollsNeeded;
                        }
                    }
                }
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <b>${fmt(wallpaperPrice, 0, true)}</b> บ. • พื้นที่: <b>${fmt(areaSqm, 2)}</b> ตร.ม. • ใช้ <b>${rollsNeeded}</b> ม้วน`;
                roomSum += wallpaperPrice;
            });
            const itemCount = room.querySelectorAll(`${SELECTORS.set}:not([data-suspended="true"]), ${SELECTORS.decoItem}:not([data-suspended="true"]), ${SELECTORS.wallpaperItem}:not([data-suspended="true"])`).length;
            room.querySelector('[data-room-brief]').innerHTML = `<span>${itemCount} รายการ • ${fmt(roomSum, 0, true)} บาท</span>`;
            grand += roomSum;
        });

        const grandSummary = createSummaryHtml(grandOpaqueYards, grandSheerYards, grandOpaqueTrack, grandSheerTrack, totalWallpaperRolls, decoCounts, hasDoubleBracket);
        document.querySelector(SELECTORS.detailedSummaryContainer).innerHTML = grandSummary;
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;
        return {
            grand,
            grandOpaqueYards,
            grandSheerYards,
            grandOpaqueTrack,
            grandSheerTrack,
            totalWallpaperRolls,
            decoCounts,
            hasDoubleBracket
        };
    }

    function createSummaryHtml(oy, sy, ot, st, wr, dc, hdb) {
        let html = '';
        if (oy > 0) html += `<p>ผ้าทึบ: ${fmt(oy, 2)} หลา</p>`;
        if (sy > 0) html += `<p>ผ้าโปร่ง: ${fmt(sy, 2)} หลา</p>`;
        if (ot > 0) html += `<p>รางผ้าทึบ: ${fmt(ot, 2)} ม.</p>`;
        if (st > 0) html += `<p>รางผ้าโปร่ง: ${fmt(st, 2)} ม.</p>`;
        if (wr > 0) html += `<p>วอลเปเปอร์: ${wr} ม้วน</p>`;
        for(const type in dc) {
            if(dc[type] > 0) html += `<p>ตกแต่ง (${type}): ${dc[type]} จุด</p>`;
        }
        if (hdb) html += `<b>*มีงานผ้าทึบและโปร่งต้องใช้ขายึด 2 ชั้น</b>`;
        return html;
    }

    function generatePayload() {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer_info: {
                customer_name: document.querySelector('#customer_name')?.value || "",
                customer_phone: document.querySelector('#customer_phone')?.value || "",
                customer_address: document.querySelector('#customer_address')?.value || "",
            },
            rooms: Array.from(document.querySelectorAll(SELECTORS.room)).map((room, i) => {
                const roomData = {
                    room_name: room.querySelector(SELECTORS.roomNameInput)?.value || "",
                    sets: [],
                    decorations: [],
                    wallpapers: [],
                };
                room.querySelectorAll(SELECTORS.set).forEach(set => {
                    if (set.dataset.suspended === 'true') return;
                    roomData.sets.push({
                        width_m: toNum(set.querySelector('input[name="width_m"]')?.value),
                        height_m: toNum(set.querySelector('input[name="height_m"]')?.value),
                        style: set.querySelector('select[name="set_style"]')?.value || "ลอน",
                        fabric_variant: set.querySelector('select[name="fabric_variant"]')?.value || "ทึบ",
                        price_per_m_raw: toNum(set.querySelector('select[name="set_price_per_m"]')?.value),
                        sheer_price_per_m: toNum(set.querySelector('select[name="sheer_price_per_m"]')?.value),
                    });
                });
                room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                    if (deco.dataset.suspended === 'true') return;
                    roomData.decorations.push({
                        type: deco.querySelector('[name="deco_type"]')?.value || "",
                        width_m: toNum(deco.querySelector('[name="deco_width_m"]')?.value),
                        height_m: toNum(deco.querySelector('[name="deco_height_m"]')?.value),
                        price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value),
                    });
                });
                room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                    if (wallpaper.dataset.suspended === 'true') return;
                    roomData.wallpapers.push({
                        height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value),
                        price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value),
                        widths: Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).map(el => toNum(el.value)),
                    });
                });
                return roomData;
            }),
        };
        const summary = recalcAll();
        payload.summary = {
            grand_total: summary.grand,
            priced_item_count: toNum(document.querySelector(SELECTORS.setCount)?.textContent),
            fabric_opaque_yards: summary.grandOpaqueYards,
            fabric_sheer_yards: summary.grandSheerYards,
            track_opaque_m: summary.grandOpaqueTrack,
            track_sheer_m: summary.grandSheerTrack,
            wallpaper_rolls: summary.totalWallpaperRolls,
            decoration_counts: summary.decoCounts
        };
        return payload;
    }

    function loadPayload(payload) {
        if (!payload) return;
        document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
        document.querySelector('#customer_name').value = payload.customer_info?.customer_name || "";
        document.querySelector('#customer_phone').value = payload.customer_info?.customer_phone || "";
        document.querySelector('#customer_address').value = payload.customer_info?.customer_address || "";
        
        roomCount = 0;
        (payload.rooms || []).forEach(roomData => addRoom(roomData));
        recalcAll();
        showToast("นำเข้าข้อมูลสำเร็จ", "success");
    }

    function toggleLock() {
        isLocked = !isLocked;
        document.querySelectorAll('input, select, textarea').forEach(el => {
            el.disabled = isLocked;
        });
        document.querySelectorAll('.btn-chip, .btn-icon:not(.lock-icon)').forEach(el => {
            el.disabled = isLocked;
        });
        document.querySelector(SELECTORS.addRoomFooterBtn).disabled = isLocked;
        document.body.classList.toggle('is-locked', isLocked);

        const lockIcon = document.querySelector('#lockBtn i');
        if (isLocked) {
            lockIcon.className = 'ph-bold ph-lock-key lock-icon';
            showToast('แบบฟอร์มถูกล็อคแล้ว', 'info');
        } else {
            lockIcon.className = 'ph-bold ph-lock-key-open lock-icon';
            showToast('แบบฟอร์มถูกปลดล็อคแล้ว', 'info');
        }
        updateLockState();
    }
    
    function updateLockState() {
        const lockIcon = document.querySelector('#lockBtn i');
        if (isLocked) {
            lockIcon.className = 'ph-bold ph-lock-key lock-icon';
        } else {
            lockIcon.className = 'ph-bold ph-lock-key-open lock-icon';
        }
    }

    function renumber() {
        document.querySelectorAll(`${SELECTORS.room}`).forEach((room, i) => {
            room.dataset.index = i + 1;
            room.querySelector('[name="room_name"]').placeholder = `ห้อง ${String(i + 1).padStart(2, '0')}`;
        });
    }

    function toggleSetFabricUI(setEl) {
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const sheerWrap = setEl.querySelector('[name="sheer_price_per_m"]').closest('.form-group');
        const setWrap = setEl.querySelector('[name="set_price_per_m"]').closest('.form-group');

        if (variant === "ทึบ") {
            sheerWrap.style.display = 'none';
            setWrap.style.display = 'flex';
        } else if (variant === "โปร่ง") {
            sheerWrap.style.display = 'flex';
            setWrap.style.display = 'none';
        } else if (variant === "ทึบ&โปร่ง") {
            sheerWrap.style.display = 'flex';
            setWrap.style.display = 'flex';
        }
        recalcAll();
    }


    // --- EVENT LISTENERS ---
    function init() {
        // Main event delegation for clicks
        document.addEventListener('click', async (e) => {
            if (isLocked) return;
            const target = e.target.closest('[data-act]');
            if (!target) return;

            const action = target.dataset.act;
            const item = target.closest('[data-set], [data-deco-item], [data-wallpaper-item]');
            const roomEl = target.closest(SELECTORS.room);

            const actions = {
                'add-set': { selector: SELECTORS.room, action: (el) => addSet(el) },
                'add-deco': { selector: SELECTORS.room, action: (el) => addDeco(el) },
                'add-wallpaper': { selector: SELECTORS.room, action: (el) => addWallpaper(el) },
                'add-wall': { selector: SELECTORS.wallpaperItem, action: (el, btn) => addWall(btn) },
                'del-set': { selector: SELECTORS.set, confirm: true, title: 'ยืนยันการลบ', body: 'คุณต้องการลบรายการผ้าม่านนี้ใช่หรือไม่?', action: (el) => el.remove(), toast: 'ลบรายการสำเร็จ' },
                'del-deco': { selector: SELECTORS.decoItem, confirm: true, title: 'ยืนยันการลบ', body: 'คุณต้องการลบรายการตกแต่งนี้ใช่หรือไม่?', action: (el) => el.remove(), toast: 'ลบรายการสำเร็จ' },
                'del-wallpaper': { selector: SELECTORS.wallpaperItem, confirm: true, title: 'ยืนยันการลบ', body: 'คุณต้องการลบรายการวอลเปเปอร์นี้ใช่หรือไม่?', action: (el) => el.remove(), toast: 'ลบรายการสำเร็จ' },
                'del-wall': { selector: '.wall-input-row', action: (el) => el.remove(), toast: 'ลบรายการสำเร็จ' },
                'toggle-suspend': { selector: '.item-card', action: (el) => suspendItem(el, el.dataset.suspended !== 'true') },
            };
            
            if (actions[action]) {
                const config = actions[action];
                performActionWithConfirmation(target, config);
            }
        });

        // Event delegation for input and select changes
        document.addEventListener('input', debounce(e => {
            const target = e.target;
            if (target.matches('input, select, textarea')) {
                recalcAll();
                saveData();
            }
        }));
        
        // Specific change listeners for UI toggles
        document.addEventListener('change', e => {
            const target = e.target;
            if (target.matches('select[name="fabric_variant"]')) {
                const setEl = target.closest(SELECTORS.set);
                if (setEl) toggleSetFabricUI(setEl);
            }
        });

        // Swipe-to-delete logic for rooms
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        if (roomsContainer) {
            let startX = 0;
            let currentX = 0;
            let isSwiping = false;
            let targetRoom = null;
            const SWIPE_THRESHOLD = 80;

            roomsContainer.addEventListener('touchstart', e => {
                if (e.target.closest('input, textarea, select')) return;
                const roomEl = e.target.closest(SELECTORS.room);
                if (!roomEl || isLocked) return;

                targetRoom = roomEl;
                startX = e.touches[0].clientX;
                currentX = startX;
                isSwiping = true;
                e.stopPropagation();
            }, { passive: true });

            roomsContainer.addEventListener('touchmove', e => {
                if (!isSwiping || !targetRoom) return;
                currentX = e.touches[0].clientX;
                const deltaX = currentX - startX;
                if (deltaX < 0) {
                    // Only swipe if moving to the left
                    const swipeContainer = targetRoom.querySelector('.swipe-container');
                    const swipeContent = targetRoom.querySelector('.swipe-content');
                    swipeContent.style.transform = `translateX(${Math.max(-SWIPE_THRESHOLD, deltaX)}px)`;
                    swipeContainer.classList.add('swiping-left');
                    swipeContainer.style.setProperty('--swipe-distance', `${Math.abs(deltaX)}px`);
                }
                e.preventDefault(); // Prevent page scroll
            }, { passive: false });

            roomsContainer.addEventListener('touchend', async e => {
                if (!isSwiping || !targetRoom) return;

                const deltaX = currentX - startX;
                const swipeContainer = targetRoom.querySelector('.swipe-container');
                const swipeContent = targetRoom.querySelector('.swipe-content');

                if (deltaX < -SWIPE_THRESHOLD) {
                    if (await showConfirmation('ยืนยันการลบ', `คุณต้องการลบห้อง "${targetRoom.querySelector(SELECTORS.roomNameInput)?.value || 'ห้องนี้'}" ใช่หรือไม่?`)) {
                        removeRoom(targetRoom);
                    } else {
                        // Reset if cancelled
                        swipeContent.style.transform = '';
                        swipeContainer.classList.remove('swiping-left');
                        swipeContainer.style.removeProperty('--swipe-distance');
                    }
                } else {
                    // Reset if swipe is not enough
                    swipeContent.style.transform = '';
                    swipeContainer.classList.remove('swiping-left');
                    swipeContainer.style.removeProperty('--swipe-distance');
                }
                
                // Clean up state
                startX = 0;
                currentX = 0;
                isSwiping = false;
                targetRoom = null;
            });
        }


        // Lock/Unlock Button
        document.querySelector(SELECTORS.lockBtn).addEventListener('click', toggleLock);
        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => addRoom());
        
        // Menu functionality
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const options = await showCopyOptionsModal();
            if (!options) return;
            const payload = generatePayload();
            let clipboardText = '';
            if (options.customer) { clipboardText += formatCustomerInfo(payload.customer_info); }
            if (options.details) { clipboardText += formatRoomDetails(payload.rooms); }
            if (options.summary) { clipboardText += formatGrandSummary(payload.summary); }
            
            if (clipboardText.trim().length > 0) {
                navigator.clipboard.writeText(clipboardText.trim())
                    .then(() => showToast('คัดลอกข้อมูลสำเร็จ', 'success'))
                    .catch(() => showToast('ไม่สามารถคัดลอกได้', 'error'));
            } else {
                showToast('ไม่มีข้อมูลให้คัดลอก', 'warning');
            }
            document.querySelector(SELECTORS.copyOptionsModal).classList.remove('visible');
            menuDropdown.classList.remove('show');
        });

        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', (e) => {
            e.preventDefault();
            const payload = generatePayload();
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                .then(() => showToast('คัดลอก JSON สำเร็จ', 'success'))
                .catch(() => showToast('ไม่สามารถคัดลอกได้', 'error'));
            menuDropdown.classList.remove('show');
        });

        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            menuDropdown.classList.remove('show');
            if (!await showConfirmation('ยืนยันการลบข้อมูลทั้งหมด', 'ข้อมูลทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้ คุณแน่ใจหรือไม่?')) return;
            localStorage.removeItem(STORAGE_KEY);
            document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
            addRoom();
            recalcAll();
            showToast('ล้างข้อมูลสำเร็จ', 'success');
        });

        document.querySelector(SELECTORS.exportBtn).addEventListener('click', (e) => {
            e.preventDefault();
            const payload = generatePayload();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `quotation-${new Date().toISOString().slice(0, 10)}.json`);
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