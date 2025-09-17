(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.3.0-refined-gemini";
    const STORAGE_KEY = "marnthara.input.v4";
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
            if (stripsPerRoll <= 0) return Infinity; 
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
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn',
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        copyTextCustomerBtn: '#copyTextCustomerBtn', copyTextTailorBtn: '#copyTextTailorBtn', copyTextFullBtn: '#copyTextFullBtn',
        submitBtn: '#submitBtn' // Note: This button is no longer in index.html, but the logic remains to avoid errors.
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
            created.querySelector('input[name="fabric_code"]').value = prefill.fabric_code ?? "";
            created.querySelector('input[name="width_m"]').value = prefill.width_m ?? "";
            created.querySelector('input[name="height_m"]').value = prefill.height_m ?? "";
            created.querySelector('select[name="set_style"]').value = prefill.style || "ลอน";
            created.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
            created.querySelector('input[name="opening_method"]').value = prefill.opening_method ?? "";
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
            if (displayEl) {
                displayEl.textContent = type ? `(${type})` : '';
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
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <b>${fmt(wallpaperPrice, 0, true)}</b> บ. • จำนวนม้วน: <b>${fmt(rollsNeeded, 2)}</b> ม้วน`;
                roomSum += wallpaperPrice;
            });

            room.querySelector('[data-room-brief]').textContent = `฿${fmt(roomSum, 0, true)}`;
            grand += roomSum;
        });

        // Update overall summary
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

        // Update detailed summary
        const summaryEl = document.querySelector(SELECTORS.detailedSummaryContainer);
        let summaryHtml = '';
        if (grandOpaqueYards > 0) {
            summaryHtml += `<p>• ผ้าทึบ: <b>${fmt(grandOpaqueYards, 2)}</b> หลา • ราง: <b>${fmt(grandOpaqueTrack, 2)}</b> ม.</p>`;
        }
        if (grandSheerYards > 0) {
            summaryHtml += `<p>• ผ้าโปร่ง: <b>${fmt(grandSheerYards, 2)}</b> หลา • ราง: <b>${fmt(grandSheerTrack, 2)}</b> ม.</p>`;
        }
        if (totalWallpaperRolls > 0) {
            summaryHtml += `<p>• วอลเปเปอร์: <b>${fmt(totalWallpaperRolls, 2)}</b> ม้วน</p>`;
        }
        for (const type in decoCounts) {
            summaryHtml += `<p>• ${type}: <b>${decoCounts[type]}</b> รายการ</p>`;
        }
        if (hasDoubleBracket) {
            summaryHtml += `<p class="alert-text"><i class="ph-bold ph-warning-circle"></i> มีรายการที่ต้องใช้รางคู่</p>`;
        }
        summaryEl.innerHTML = summaryHtml;
    }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, i) => {
            room.querySelector(SELECTORS.roomNameInput).placeholder = `ห้อง ${i < 9 ? '0' : ''}${i + 1}`;
            room.dataset.index = i + 1;
            room.querySelectorAll(SELECTORS.set).forEach((set, j) => {
                set.querySelector('.item-title span').textContent = `ผ้าม่าน #${j + 1}`;
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco, j) => {
                deco.querySelector('.item-title span').textContent = `ตกแต่ง #${j + 1}`;
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper, j) => {
                wallpaper.querySelector('.item-title span').textContent = `วอลเปเปอร์ #${j + 1}`;
            });
        });
    }

    function serializeData() {
        const payload = {
            customer_info: {
                name: document.getElementById('customer_name')?.value || '',
                phone: document.getElementById('customer_phone')?.value || '',
                address: document.getElementById('customer_address')?.value || ''
            },
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(room => {
            const roomData = {
                room_name: room.querySelector(SELECTORS.roomNameInput)?.value || '',
                sets: [],
                decorations: [],
                wallpapers: []
            };

            // Sets
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                roomData.sets.push({
                    fabric_code: set.querySelector('[name="fabric_code"]')?.value || '',
                    width_m: toNum(set.querySelector('[name="width_m"]')?.value),
                    height_m: toNum(set.querySelector('[name="height_m"]')?.value),
                    style: set.querySelector('[name="set_style"]')?.value || '',
                    fabric_variant: set.querySelector('[name="fabric_variant"]')?.value || '',
                    opening_method: set.querySelector('[name="opening_method"]')?.value || '',
                    price_per_m_raw: toNum(set.querySelector('[name="set_price_per_m"]')?.value),
                    sheer_price_per_m: toNum(set.querySelector('[name="sheer_price_per_m"]')?.value),
                    is_suspended: set.dataset.suspended === 'true'
                });
            });

            // Decorations
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                roomData.decorations.push({
                    type: deco.querySelector('[name="deco_type"]')?.value || '',
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value),
                    is_suspended: deco.dataset.suspended === 'true'
                });
            });
            
            // Wallpapers
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const widths = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value));
                roomData.wallpapers.push({
                    height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value),
                    widths: widths,
                    is_suspended: wallpaper.dataset.suspended === 'true'
                });
            });

            payload.rooms.push(roomData);
        });
        return payload;
    }
    
    function loadPayload(payload) {
        if (!payload || !payload.rooms) return;

        // Clear existing data
        document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
        roomCount = 0;
        
        // Load customer info
        if (payload.customer_info) {
            document.getElementById('customer_name').value = payload.customer_info.name || '';
            document.getElementById('customer_phone').value = payload.customer_info.phone || '';
            document.getElementById('customer_address').value = payload.customer_info.address || '';
        }

        // Load rooms
        payload.rooms.forEach(roomData => addRoom(roomData));

        if (payload.rooms.length === 0) {
            addRoom(); // Add an empty room if payload is empty
        }
        recalcAll();
        saveData();
        showToast('นำเข้าข้อมูลสำเร็จ', 'success');
    }

    function saveData() {
        const payload = serializeData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
    }
    
    function generateTextSummary(payload, type) {
        if (!payload) return "";
        let summary = "";
        
        const customerInfo = payload.customer_info;
        const rooms = payload.rooms;
        const grandTotal = document.getElementById(SELECTORS.grandTotal)?.textContent;
        
        switch (type) {
            case 'customer':
                summary += `**ข้อมูลลูกค้า**\n`;
                if (customerInfo.name) summary += `ชื่อ: ${customerInfo.name}\n`;
                if (customerInfo.phone) summary += `โทร: ${customerInfo.phone}\n`;
                summary += "\n";

                summary += `**รายการสินค้า**\n`;
                rooms.forEach((room, roomIndex) => {
                    const roomName = room.room_name || `ห้อง ${roomIndex + 1}`;
                    room.sets.forEach((set, setIndex) => {
                        if (set.is_suspended) return;
                        summary += `> ${roomName}: ผ้าม่าน #${setIndex + 1} (${set.style} - ${set.fabric_variant})\n`;
                        summary += `> ราคา: ${fmt(getSetPrice(set), 0, true)} บ.\n`;
                    });
                    room.decorations.forEach((deco, decoIndex) => {
                        if (deco.is_suspended) return;
                        summary += `> ${roomName}: ตกแต่ง #${decoIndex + 1} (${deco.type || 'ไม่ระบุ'})\n`;
                        summary += `> ราคา: ${fmt(getDecoPrice(deco), 0, true)} บ.\n`;
                    });
                    room.wallpapers.forEach((wp, wpIndex) => {
                        if (wp.is_suspended) return;
                        summary += `> ${roomName}: วอลเปเปอร์ #${wpIndex + 1}\n`;
                        summary += `> ราคา: ${fmt(getWallpaperPrice(wp), 0, true)} บ.\n`;
                    });
                });
                summary += "\n";
                summary += `**ยอดรวม**\n`;
                summary += `รวมทั้งสิ้น: ฿${grandTotal} บาท\n`;
                break;
            
            case 'tailor':
                summary += `**งานสำหรับช่างตัดเย็บ**\n\n`;
                rooms.forEach((room, roomIndex) => {
                    const roomName = room.room_name || `ห้อง ${roomIndex + 1}`;
                    room.sets.forEach((set, setIndex) => {
                        if (set.is_suspended) return;
                        summary += `--- ${roomName}: ผ้าม่าน #${setIndex + 1} ---\n`;
                        if (set.fabric_code) summary += `> รหัสผ้า: ${set.fabric_code}\n`;
                        summary += `> กว้าง: ${fmt(set.width_m, 2)} ม.\n`;
                        summary += `> สูง: ${fmt(set.height_m, 2)} ม.\n`;
                        summary += `> สไตล์: ${set.style}\n`;
                        summary += `> ชนิดผ้า: ${set.fabric_variant}\n`;
                        if (set.opening_method) summary += `> รูปแบบการเปิด: ${set.opening_method}\n`;
                        summary += `> ผ้าที่ใช้: ${fmt(CALC.fabricYardage(set.style, set.width_m), 2)} หลา\n`;
                        summary += "\n";
                    });
                });
                break;

            case 'full':
                summary += `**ข้อมูลลูกค้า**\n`;
                if (customerInfo.name) summary += `ชื่อ: ${customerInfo.name}\n`;
                if (customerInfo.phone) summary += `โทร: ${customerInfo.phone}\n`;
                if (customerInfo.address) summary += `ที่อยู่: ${customerInfo.address}\n`;
                summary += "\n";
                
                summary += `**รายละเอียดงานทั้งหมด**\n`;
                rooms.forEach((room, roomIndex) => {
                    const roomName = room.room_name || `ห้อง ${roomIndex + 1}`;
                    summary += `--- ${roomName} ---\n`;
                    
                    room.sets.forEach((set, setIndex) => {
                        if (set.is_suspended) return;
                        const style = set.style || 'ลอน';
                        const variant = set.fabric_variant || 'ทึบ';
                        const w = fmt(set.width_m, 2);
                        const h = fmt(set.height_m, 2);
                        const price = fmt(set.price_per_m_raw, 0, true);
                        const sheerPrice = fmt(set.sheer_price_per_m, 0, true);
                        const yardage = fmt(CALC.fabricYardage(style, set.width_m), 2);
                        
                        summary += `> ผ้าม่าน #${setIndex + 1} (${style} - ${variant})\n`;
                        if (set.fabric_code) summary += `> รหัสผ้า: ${set.fabric_code}\n`;
                        summary += `> ขนาด: กว้าง ${w} ม. x สูง ${h} ม.\n`;
                        if (set.opening_method) summary += `> รูปแบบการเปิด: ${set.opening_method}\n`;
                        if (variant.includes("ทึบ")) summary += `> ราคาผ้าทึบ: ${price} บ./ม. (ใช้ผ้า ${yardage} หลา)\n`;
                        if (variant.includes("โปร่ง")) summary += `> ราคาผ้าโปร่ง: ${sheerPrice} บ./ม. (ใช้ผ้า ${yardage} หลา)\n`;
                        summary += `> ราคา: ${fmt(getSetPrice(set), 0, true)} บ.\n`;
                    });
                    
                    room.decorations.forEach((deco, decoIndex) => {
                        if (deco.is_suspended) return;
                        const w = fmt(deco.width_m, 2);
                        const h = fmt(deco.height_m, 2);
                        const price = fmt(deco.price_sqyd, 0, true);
                        const areaSqyd = fmt(deco.width_m * deco.height_m * SQM_TO_SQYD, 2);
                        summary += `> ตกแต่ง #${decoIndex + 1} (${deco.type || 'ไม่ระบุ'})\n`;
                        summary += `> ขนาด: กว้าง ${w} ม. x สูง ${h} ม.\n`;
                        summary += `> ราคา: ${price} บ./ตร.หลา (พื้นที่ ${areaSqyd} ตร.หลา)\n`;
                        summary += `> ราคา: ${fmt(getDecoPrice(deco), 0, true)} บ.\n`;
                    });
                    
                    room.wallpapers.forEach((wp, wpIndex) => {
                        if (wp.is_suspended) return;
                        const h = fmt(wp.height_m, 2);
                        const price = fmt(wp.price_per_roll, 0, true);
                        const totalWidth = wp.widths.reduce((sum, width) => sum + width, 0);
                        const rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                        summary += `> วอลเปเปอร์ #${wpIndex + 1}\n`;
                        summary += `> ขนาด: สูง ${h} ม. x กว้างรวม ${fmt(totalWidth, 2)} ม.\n`;
                        summary += `> ราคา: ${price} บ./ม้วน (ใช้ ${fmt(rollsNeeded, 2)} ม้วน)\n`;
                        summary += `> ราคา: ${fmt(getWallpaperPrice(wp), 0, true)} บ.\n`;
                    });
                    summary += `\n`;
                });
                
                summary += `**สรุปยอดรวม**\n`;
                summary += `จำนวนรายการ: ${document.getElementById(SELECTORS.setCount)?.textContent} รายการ\n`;
                summary += `รวมทั้งสิ้น: ฿${grandTotal} บาท\n`;
                break;
        }

        return summary.trim();
    }
    
    function getSetPrice(set) {
        const w = toNum(set.width_m);
        const h = toNum(set.height_m);
        const style = set.style;
        const variant = set.fabric_variant;
        const sPlus = stylePlus(style);
        const hPlus = heightPlus(h);
        let opaquePrice = 0, sheerPrice = 0;
        if (w > 0 && h > 0) {
            if (variant.includes("ทึบ")) {
                const baseRaw = toNum(set.price_per_m_raw);
                opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
            }
            if (variant.includes("โปร่ง")) {
                const sheerBase = toNum(set.sheer_price_per_m);
                sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
            }
        }
        return opaquePrice + sheerPrice;
    }
    
    function getDecoPrice(deco) {
        const w = toNum(deco.width_m);
        const h = toNum(deco.height_m);
        const price = toNum(deco.price_sqyd);
        return Math.round(w * h * SQM_TO_SQYD * price);
    }
    
    function getWallpaperPrice(wp) {
        const h = toNum(wp.height_m);
        const pricePerRoll = toNum(wp.price_per_roll);
        const totalWidth = wp.widths.reduce((sum, width) => sum + toNum(width), 0);
        const rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
        return Math.round(rollsNeeded * pricePerRoll);
    }
    
    // --- EVENT HANDLERS ---
    function setupEventListeners() {
        const form = document.querySelector(SELECTORS.orderForm);
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);

        form.addEventListener('input', debounce(() => {
            recalcAll();
            saveData();
        }));
        
        form.addEventListener('change', debounce(() => {
            recalcAll();
            saveData();
        }));
        
        form.addEventListener('click', (e) => {
            if (isLocked) {
                showToast("ฟอร์มถูกล็อคอยู่", "warning");
                e.preventDefault();
                return;
            }
            const target = e.target.closest('[data-act]');
            if (!target) return;
            const act = target.dataset.act;
            
            const actions = {
                'add-set': { action: (item) => addSet(item.closest(SELECTORS.room)), selector: SELECTORS.room, toast: 'เพิ่มรายการผ้าม่านแล้ว' },
                'add-deco': { action: (item) => addDeco(item.closest(SELECTORS.room)), selector: SELECTORS.room, toast: 'เพิ่มรายการตกแต่งแล้ว' },
                'add-wallpaper': { action: (item) => addWallpaper(item.closest(SELECTORS.room)), selector: SELECTORS.room, toast: 'เพิ่มรายการวอลเปเปอร์แล้ว' },
                'add-room': { action: addRoom, selector: null, toast: 'เพิ่มห้องใหม่แล้ว' },
                'add-wall': { action: addWall, selector: SELECTORS.wallpaperItem },
                'del-set': { action: (item) => item.remove(), selector: SELECTORS.set, confirm: true, title: 'ลบรายการนี้?', body: 'คุณต้องการลบรายการผ้าม่านนี้จริงหรือ?', toast: 'ลบรายการผ้าม่านแล้ว' },
                'del-deco': { action: (item) => item.remove(), selector: SELECTORS.decoItem, confirm: true, title: 'ลบรายการนี้?', body: 'คุณต้องการลบรายการตกแต่งนี้จริงหรือ?', toast: 'ลบรายการตกแต่งแล้ว' },
                'del-wallpaper': { action: (item) => item.remove(), selector: SELECTORS.wallpaperItem, confirm: true, title: 'ลบรายการนี้?', body: 'คุณต้องการลบรายการวอลเปเปอร์นี้จริงหรือ?', toast: 'ลบรายการวอลเปเปอร์แล้ว' },
                'del-wall': { action: (item) => item.closest('.wall-input-row').remove(), selector: '.wall-input-row', toast: 'ลบผนังแล้ว' },
                'del-room': { action: (item) => item.remove(), selector: SELECTORS.room, confirm: true, title: 'ลบห้องนี้?', body: 'การลบห้องจะลบรายการทั้งหมดภายในห้องนั้นด้วย คุณยืนยันหรือไม่?', toast: 'ลบห้องแล้ว' },
                'toggle-suspend': { action: (item, btn) => {
                    const isSuspended = item.dataset.suspended !== 'true';
                    suspendItem(item, isSuspended);
                }, selector: '[data-suspended]' }
            };

            if (act in actions) {
                const config = actions[act];
                performActionWithConfirmation(target, config);
            }
        });
        
        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => {
            if (isLocked) { showToast("ฟอร์มถูกล็อคอยู่", "warning"); return; }
            addRoom();
        });

        document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
            isLocked = !isLocked;
            updateLockState();
            saveData();
            showToast(`ฟอร์มถูก${isLocked ? 'ล็อค' : 'ปลดล็อค'}แล้ว`, isLocked ? 'warning' : 'success');
        });
        
        document.querySelector('body').addEventListener('change', (e) => {
            const setItem = e.target.closest(SELECTORS.set);
            if (setItem && e.target.name === 'fabric_variant') {
                toggleSetFabricUI(setItem);
            }
        });
        
        document.querySelector('body').addEventListener('input', debounce((e) => {
            const decoItem = e.target.closest(SELECTORS.decoItem);
            if (decoItem && e.target.name === 'deco_type') {
                const displayEl = decoItem.querySelector('.deco-type-display');
                if (displayEl) {
                    displayEl.textContent = e.target.value.trim() ? `(${e.target.value.trim()})` : '';
                }
            }
        }, 300));

        // Global functions
        function updateLockState() {
            document.querySelectorAll('input, select, textarea, button').forEach(el => {
                if (el.id !== 'lockBtn' && el.id !== 'menuBtn') {
                    el.disabled = isLocked;
                }
            });
            document.querySelectorAll('.btn-icon, .btn-chip').forEach(el => {
                el.disabled = isLocked;
            });
            document.querySelector(SELECTORS.lockText).textContent = isLocked ? 'ปลดล็อก' : 'ล็อก';
            const lockIcon = document.querySelector('.lock-icon');
            if (lockIcon) {
                lockIcon.className = isLocked ? 'ph-bold ph-lock' : 'ph-bold ph-lock-key-open';
            }
        }
        
        function toggleSetFabricUI(setEl) {
            const variant = setEl.querySelector('[name="fabric_variant"]').value;
            const sheerWrap = setEl.querySelector(SELECTORS.sheerWrap);
            if (sheerWrap) {
                sheerWrap.style.display = variant.includes("โปร่ง") ? '' : 'none';
            }
        }
        
        // Menu Actions
        document.querySelector(SELECTORS.copyTextCustomerBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const payload = serializeData();
            const textSummary = generateTextSummary(payload, 'customer');
            try {
                await navigator.clipboard.writeText(textSummary);
                showToast('คัดลอกสรุปส่งลูกค้าสำเร็จ', 'success');
            } catch (err) {
                showToast('ไม่สามารถคัดลอกได้', 'error');
            }
            menuDropdown.classList.remove('show');
        });
        
        document.querySelector(SELECTORS.copyTextTailorBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const payload = serializeData();
            const textSummary = generateTextSummary(payload, 'tailor');
            try {
                await navigator.clipboard.writeText(textSummary);
                showToast('คัดลอกสรุปส่งช่างสำเร็จ', 'success');
            } catch (err) {
                showToast('ไม่สามารถคัดลอกได้', 'error');
            }
            menuDropdown.classList.remove('show');
        });
        
        document.querySelector(SELECTORS.copyTextFullBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const payload = serializeData();
            const textSummary = generateTextSummary(payload, 'full');
            try {
                await navigator.clipboard.writeText(textSummary);
                showToast('คัดลอกรายละเอียดทั้งหมดสำเร็จ', 'success');
            } catch (err) {
                showToast('ไม่สามารถคัดลอกได้', 'error');
            }
            menuDropdown.classList.remove('show');
        });

        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const payload = serializeData();
                await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                showToast('คัดลอก JSON สำเร็จ', 'success');
            } catch (err) {
                showToast('ไม่สามารถคัดลอกได้', 'error');
            }
            menuDropdown.classList.remove('show');
        });
        
        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            if (await showConfirmation('ยืนยันการลบข้อมูลทั้งหมด?', 'ข้อมูลทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้')) {
                localStorage.removeItem(STORAGE_KEY);
                document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
                roomCount = 0;
                addRoom();
                recalcAll();
                showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
            }
            menuDropdown.classList.remove('show');
        });

        document.querySelector(SELECTORS.exportBtn).addEventListener('click', (e) => {
            e.preventDefault();
            const payload = serializeData();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
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

    function init() {
        setupEventListeners();
        recalcAll();
        updateLockState();
    }
})();