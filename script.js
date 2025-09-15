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
            if (stripsPerRoll === 0) return Infinity; // Prevent division by zero
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
        submitBtn: '#submitBtn',
        customerName: '#customer_name', customerPhone: '#customer_phone', customerAddress: '#customer_address'
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
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
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
                
                set.querySelector('[data-set-price-total]').textContent = fmt(opaquePrice + sheerPrice, 0, true);
                set.querySelector('[data-set-price-opaque]').textContent = fmt(opaquePrice, 0, true);
                set.querySelector('[data-set-price-sheer]').textContent = fmt(sheerPrice, 0, true);
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

        // Update summary footer
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

        // --- UPDATE DETAILED MATERIAL SUMMARY (NEW) ---
        const summaryContainer = document.querySelector(SELECTORS.detailedSummaryContainer);
        if(summaryContainer) {
            let html = '';
            // Curtain Section
            if (grandOpaqueYards > 0 || grandSheerYards > 0) {
                html += `<h4><i class="ph-bold ph-blinds"></i> ผ้าม่าน</h4><ul>`;
                if (grandOpaqueYards > 0) html += `<li>ผ้าทึบ: <b>${fmt(grandOpaqueYards)}</b> หลา</li>`;
                if (grandSheerYards > 0) html += `<li>ผ้าโปร่ง: <b>${fmt(grandSheerYards)}</b> หลา</li>`;
                if (grandOpaqueTrack > 0) html += `<li>รางทึบ: <b>${fmt(grandOpaqueTrack)}</b> ม.</li>`;
                if (grandSheerTrack > 0) html += `<li>รางโปร่ง: <b>${fmt(grandSheerTrack)}</b> ม.</li>`;
                if (hasDoubleBracket) html += `<li class="summary-note">** มีรายการที่ต้องใช้ขาสองชั้น</li>`;
                html += `</ul>`;
            }
            // Decoration Section
            if (Object.keys(decoCounts).length > 0) {
                html += `<h4><i class="ph-bold ph-paint-brush"></i> ของตกแต่ง</h4><ul>`;
                for (const type in decoCounts) {
                    html += `<li>${type}: <b>${decoCounts[type]}</b> รายการ</li>`;
                }
                html += `</ul>`;
            }
            // Wallpaper Section
            if (totalWallpaperRolls > 0) {
                html += `<h4><i class="ph-bold ph-wall"></i> วอลเปเปอร์</h4><ul>`;
                html += `<li>รวม: <b>${totalWallpaperRolls}</b> ม้วน</li>`;
                html += `</ul>`;
            }

            if (html === '') {
                html = '<p style="text-align:center; color: var(--on-surface-variant);">ไม่มีรายการที่คิดราคาได้</p>';
            }
            summaryContainer.innerHTML = html;
        }
    }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, i) => {
            room.dataset.index = i + 1;
            const title = room.querySelector(SELECTORS.roomNameInput);
            if (!title.value) {
                title.placeholder = `ห้อง ${String(i + 1).padStart(2, '0')}`;
            }
        });
    }

    function toggleSetFabricUI(setEl) {
        const variantSelect = setEl.querySelector('select[name="fabric_variant"]');
        const sheerWrap = setEl.querySelector(SELECTORS.sheerWrap);
        if (variantSelect.value === "ทึบ&โปร่ง") {
            sheerWrap.style.display = 'flex';
        } else {
            sheerWrap.style.display = 'none';
        }
    }
    
    // --- DATA SAVING & LOADING ---
    function collectData() {
        const payload = {
            customer: {
                name: document.querySelector(SELECTORS.customerName)?.value,
                phone: document.querySelector(SELECTORS.customerPhone)?.value,
                address: document.querySelector(SELECTORS.customerAddress)?.value,
            },
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value,
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    width_m: clamp01(setEl.querySelector('input[name="width_m"]')?.value),
                    height_m: clamp01(setEl.querySelector('input[name="height_m"]')?.value),
                    style: setEl.querySelector('select[name="set_style"]')?.value,
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value,
                    price_per_m_raw: clamp01(setEl.querySelector('select[name="set_price_per_m"]')?.value),
                    sheer_price_per_m: clamp01(setEl.querySelector('select[name="sheer_price_per_m"]')?.value),
                    is_suspended: setEl.dataset.suspended === 'true',
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value,
                    width_m: clamp01(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: clamp01(decoEl.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: clamp01(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                    is_suspended: decoEl.dataset.suspended === 'true',
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const widths = Array.from(wallpaperEl.querySelectorAll('input[name="wall_width_m"]')).map(el => clamp01(el.value));
                roomData.wallpapers.push({
                    height_m: clamp01(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: clamp01(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    widths: widths,
                    is_suspended: wallpaperEl.dataset.suspended === 'true',
                });
            });

            payload.rooms.push(roomData);
        });
        return payload;
    }
    
    const saveData = debounce(() => {
        const data = collectData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(data);
    });

    function loadPayload(data) {
        if (!data) return;
        
        // Clear existing rooms and items
        document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
        roomCount = 0;
        
        if (data.customer) {
            document.querySelector(SELECTORS.customerName).value = data.customer.name || "";
            document.querySelector(SELECTORS.customerPhone).value = data.customer.phone || "";
            document.querySelector(SELECTORS.customerAddress).value = data.customer.address || "";
        }
        
        if (data.rooms && data.rooms.length > 0) {
            data.rooms.forEach(room => addRoom(room));
        } else {
            addRoom();
        }
        recalcAll();
        saveData();
        showToast('นำเข้าข้อมูลสำเร็จ', 'success');
    }

    function updateLockState() {
        document.querySelectorAll('input, select, textarea, .btn-chip, .danger[data-act], #addRoomFooterBtn').forEach(el => {
            if (el.id !== 'lockBtn') {
                 el.disabled = isLocked;
                 el.classList.toggle('disabled', isLocked);
            }
        });
        const lockIcon = document.querySelector('.lock-icon');
        if (lockIcon) {
            lockIcon.className = isLocked ? 'ph-bold ph-lock-key' : 'ph-bold ph-lock-key-open';
        }
        showToast(`ฟอร์มถูก${isLocked ? 'ล็อค' : 'ปลดล็อค'}แล้ว`, 'warning');
    }
    
    async function copyTextSummary(options) {
        const payload = collectData();
        let text = '';
        
        if (options.customer && payload.customer.name) {
            text += `=== ข้อมูลลูกค้า ===\n`;
            text += `ชื่อลูกค้า: ${payload.customer.name || 'ไม่ได้ระบุ'}\n`;
            text += `เบอร์โทรศัพท์: ${payload.customer.phone || 'ไม่ได้ระบุ'}\n`;
            text += `ที่อยู่: ${payload.customer.address || 'ไม่ได้ระบุ'}\n\n`;
        }
        
        if (options.details && payload.rooms.length > 0) {
            text += `=== รายละเอียดรายการ ===\n`;
            payload.rooms.forEach(room => {
                const roomName = room.room_name || `ห้องที่ ${room.room_index}`;
                text += `\n** ${roomName} **\n`;

                room.sets.forEach(set => {
                    const price = (clamp01(set.price_per_m_raw) + stylePlus(set.style) + heightPlus(set.height_m)) * set.width_m + (clamp01(set.sheer_price_per_m) + stylePlus(set.style) + heightPlus(set.height_m)) * set.width_m;
                    text += `- ผ้าม่าน (${set.fabric_variant}, ${set.style}): กว้าง ${fmt(set.width_m, 2)} ม. x สูง ${fmt(set.height_m, 2)} ม. ราคา: ${fmt(price, 0, true)} บ.\n`;
                });
                room.decorations.forEach(deco => {
                    const areaSqyd = deco.width_m * deco.height_m * SQM_TO_SQYD;
                    const price = areaSqyd * deco.price_sqyd;
                    text += `- ของตกแต่ง (${deco.type}): กว้าง ${fmt(deco.width_m, 2)} ม. x สูง ${fmt(deco.height_m, 2)} ม. ราคา: ${fmt(price, 0, true)} บ.\n`;
                });
                room.wallpapers.forEach(wp => {
                    const totalWidth = wp.widths.reduce((sum, w) => sum + w, 0);
                    const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                    const price = rolls * wp.price_per_roll;
                    text += `- วอลเปเปอร์: สูง ${fmt(wp.height_m, 2)} ม. (ใช้ ${rolls} ม้วน) ราคา: ${fmt(price, 0, true)} บ.\n`;
                });
            });
        }
        
        if (options.summary) {
            const grandTotal = toNum(document.querySelector(SELECTORS.grandTotal).textContent);
            const pricedItems = toNum(document.querySelector(SELECTORS.setCount).textContent);
            text += `\n=== สรุปยอดรวม ===\n`;
            text += `จำนวนรายการที่คิดราคา: ${pricedItems} รายการ\n`;
            text += `รวมทั้งหมด: ${fmt(grandTotal, 0, true)} บาท\n`;
        }

        try {
            await navigator.clipboard.writeText(text.trim());
            showToast('คัดลอกข้อมูลสำเร็จ', 'success');
        } catch (err) {
            showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
            console.error('Failed to copy: ', err);
        }
    }

    // --- EVENT LISTENERS ---
    function init() {
        const formEl = document.querySelector(SELECTORS.orderForm);
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        
        if (!formEl || !roomsContainer || !menuDropdown) {
            console.error('Required DOM elements not found. Stopping initialization.');
            return;
        }

        // Global change listener for live calculation and save
        formEl.addEventListener('input', debounce(e => {
            const target = e.target;
            // Update decoration type display
            if (target.matches('[name="deco_type"]')) {
                const displayEl = target.closest(SELECTORS.decoItem)?.querySelector('.deco-type-display');
                if (displayEl) { displayEl.textContent = `(${target.value.trim()})`; }
            }
            // Toggle sheer fabric UI
            if (target.matches('select[name="fabric_variant"]')) {
                toggleSetFabricUI(target.closest(SELECTORS.set));
            }
            recalcAll();
            saveData();
        }));

        // Action delegation for buttons
        document.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const action = btn.dataset.act;
            e.preventDefault();

            if (action === 'del-room') {
                await performActionWithConfirmation(btn, {
                    action: (item) => item.remove(),
                    selector: SELECTORS.room,
                    confirm: true,
                    title: 'ลบห้อง',
                    body: 'คุณแน่ใจหรือไม่ว่าต้องการลบห้องนี้? การกระทำนี้ไม่สามารถย้อนกลับได้',
                    toast: 'ลบห้องแล้ว'
                });
            } else if (action === 'add-set') {
                addSet(btn.closest(SELECTORS.room));
            } else if (action === 'add-deco') {
                addDeco(btn.closest(SELECTORS.room));
            } else if (action === 'add-wallpaper') {
                addWallpaper(btn.closest(SELECTORS.room));
            } else if (action === 'del-set') {
                await performActionWithConfirmation(btn, {
                    action: (item) => item.remove(),
                    selector: SELECTORS.set,
                    confirm: true,
                    title: 'ลบรายการผ้าม่าน',
                    body: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการผ้าม่านนี้?',
                    toast: 'ลบรายการผ้าม่านแล้ว'
                });
            } else if (action === 'clear-set') {
                await performActionWithConfirmation(btn, {
                    action: (item) => {
                        item.querySelectorAll('input').forEach(input => input.value = "");
                        item.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
                        if (item.dataset.suspended === 'true') {
                            suspendItem(item, false, false);
                        }
                    },
                    selector: SELECTORS.set,
                    confirm: false,
                    toast: 'ล้างข้อมูลผ้าม่านแล้ว'
                });
            } else if (action === 'del-deco') {
                 await performActionWithConfirmation(btn, {
                    action: (item) => item.remove(),
                    selector: SELECTORS.decoItem,
                    confirm: true,
                    title: 'ลบรายการของตกแต่ง',
                    body: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการของตกแต่งนี้?',
                    toast: 'ลบรายการของตกแต่งแล้ว'
                });
            } else if (action === 'add-wall') {
                 addWall(btn);
                 recalcAll();
                 saveData();
            } else if (action === 'del-wall') {
                await performActionWithConfirmation(btn, {
                    action: (item) => item.remove(),
                    selector: '.wall-input-row',
                    confirm: false,
                    toast: 'ลบผนังแล้ว'
                });
            } else if (action === 'del-wallpaper') {
                await performActionWithConfirmation(btn, {
                    action: (item) => item.remove(),
                    selector: SELECTORS.wallpaperItem,
                    confirm: true,
                    title: 'ลบรายการวอลเปเปอร์',
                    body: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการวอลเปเปอร์นี้?',
                    toast: 'ลบรายการวอลเปเปอร์แล้ว'
                });
            } else if (action === 'toggle-suspend') {
                const item = btn.closest(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
                if (item) {
                    const isSuspended = item.dataset.suspended === 'true';
                    suspendItem(item, !isSuspended);
                    recalcAll();
                    saveData();
                }
            }
        });

        document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
            isLocked = !isLocked;
            updateLockState();
        });

        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => addRoom());
        
        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            menuDropdown.classList.remove('show');
            if (await showConfirmation('ล้างข้อมูลทั้งหมด', 'คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
                localStorage.removeItem(STORAGE_KEY);
                document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
                roomCount = 0;
                document.querySelectorAll('input, textarea, select').forEach(el => el.value = '');
                addRoom();
                recalcAll();
                showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
            }
        });

        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            menuDropdown.classList.remove('show');
            const options = await showCopyOptionsModal();
            if (options) copyTextSummary(options);
        });

        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const data = collectData();
            try {
                await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                showToast('คัดลอกข้อมูล JSON สำเร็จ', 'success');
            } catch (err) {
                showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
            }
            menuDropdown.classList.remove('show');
        });

        document.querySelector(SELECTORS.exportBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const data = collectData();
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute('href', url);
            downloadAnchorNode.setAttribute('download', 'marnthara-quotation.json');
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
        
        document.querySelector(SELECTORS.submitBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            menuDropdown.classList.remove('show');
            if (await showConfirmation('ส่งข้อมูล', 'คุณแน่ใจหรือไม่ว่าต้องการส่งข้อมูลนี้?')) {
                const data = collectData();
                const formData = new FormData(document.getElementById('orderForm'));
                const payload = formData.get('payload');
                // You can add your fetch or AJAX logic here to send the payload to the webhook
                console.log("Sending payload to webhook:", payload);
                showToast('ส่งข้อมูลสำเร็จ', 'success');
            }
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