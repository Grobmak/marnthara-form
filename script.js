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
        if (summaryContainer) {
            let summaryHTML = '';

            if (grandOpaqueYards > 0 || grandSheerYards > 0) {
                 summaryHTML += `<div class="material-summary-card">
                    <h3 class="material-summary-title">
                        <i class="ph-bold ph-fabric-bowl"></i>
                        วัสดุผ้าม่าน
                    </h3>
                    <ul>`;
                if(grandOpaqueYards > 0) {
                    summaryHTML += `<li>${fmt(grandOpaqueYards, 2)} หลา (ผ้าทึบ)</li>`;
                }
                if(grandSheerYards > 0) {
                    summaryHTML += `<li>${fmt(grandSheerYards, 2)} หลา (ผ้าโปร่ง)</li>`;
                }
                summaryHTML += `</ul></div>`;
            }

            if (grandOpaqueTrack > 0 || grandSheerTrack > 0) {
                 summaryHTML += `<div class="material-summary-card">
                    <h3 class="material-summary-title">
                        <i class="ph-bold ph-ruler"></i>
                        อุปกรณ์รางม่าน
                    </h3>
                    <ul>`;
                if(hasDoubleBracket) {
                    summaryHTML += `<li>รางคู่ ${fmt(grandOpaqueTrack, 2)} ม.</li>`;
                } else {
                    if (grandOpaqueTrack > 0) {
                        summaryHTML += `<li>รางเดี่ยว ${fmt(grandOpaqueTrack, 2)} ม. (ผ้าทึบ)</li>`;
                    }
                    if (grandSheerTrack > 0) {
                        summaryHTML += `<li>รางเดี่ยว ${fmt(grandSheerTrack, 2)} ม. (ผ้าโปร่ง)</li>`;
                    }
                }
                summaryHTML += `</ul></div>`;
            }

            if (Object.keys(decoCounts).length > 0) {
                summaryHTML += `<div class="material-summary-card">
                    <h3 class="material-summary-title">
                        <i class="ph-bold ph-paint-brush-broad"></i>
                        วัสดุตกแต่ง
                    </h3>
                    <ul>`;
                for (const [type, count] of Object.entries(decoCounts)) {
                    summaryHTML += `<li>${type}: ${count} รายการ</li>`;
                }
                summaryHTML += `</ul></div>`;
            }

            if (totalWallpaperRolls > 0) {
                summaryHTML += `<div class="material-summary-card">
                    <h3 class="material-summary-title">
                        <i class="ph-bold ph-wall"></i>
                        วัสดุวอลล์เปเปอร์
                    </h3>
                    <ul><li>รวม ${totalWallpaperRolls} ม้วน</li></ul></div>`;
            }
            summaryContainer.innerHTML = summaryHTML;
        }
    }

    function renumber() {
        document.querySelectorAll(SELECTORS.set).forEach((el, i) => {
            el.querySelector('[data-item-title]').textContent = i + 1;
        });
    }

    function toggleSetFabricUI(setEl) {
        const variant = setEl.querySelector('select[name="fabric_variant"]')?.value;
        const opaqueWrap = setEl.querySelector('[data-opaque-wrap]');
        const sheerWrap = setEl.querySelector('[data-sheer-wrap]');
        
        opaqueWrap.style.display = (variant === 'ทึบ' || variant === 'ทึบ&โปร่ง') ? 'block' : 'none';
        sheerWrap.style.display = (variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง') ? 'block' : 'none';
    }

    function getData() {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('#customer_name')?.value || "",
            customer_phone: document.querySelector('#customer_phone')?.value || "",
            customer_address: document.querySelector('#customer_address')?.value || "",
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || "",
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    width_m: toNum(setEl.querySelector('[name="width_m"]')?.value),
                    height_m: toNum(setEl.querySelector('[name="height_m"]')?.value),
                    style: setEl.querySelector('[name="set_style"]')?.value,
                    fabric_variant: setEl.querySelector('[name="fabric_variant"]')?.value,
                    price_per_m_raw: toNum(setEl.querySelector('[name="set_price_per_m"]')?.value),
                    sheer_price_per_m: toNum(setEl.querySelector('[name="sheer_price_per_m"]')?.value),
                    is_suspended: setEl.dataset.suspended === 'true'
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value || "",
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                    is_suspended: decoEl.dataset.suspended === 'true'
                });
            });
            
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                roomData.wallpapers.push({
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    widths: Array.from(wallpaperEl.querySelectorAll('input[name="wall_width_m"]')).map(el => toNum(el.value)),
                    is_suspended: wallpaperEl.dataset.suspended === 'true'
                });
            });

            payload.rooms.push(roomData);
        });

        return payload;
    }

    function loadPayload(payload) {
        document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
        if (payload?.customer_name) document.querySelector('#customer_name').value = payload.customer_name;
        if (payload?.customer_phone) document.querySelector('#customer_phone').value = payload.customer_phone;
        if (payload?.customer_address) document.querySelector('#customer_address').value = payload.customer_address;

        (payload.rooms || []).forEach(roomData => addRoom(roomData));
        if (payload.rooms.length === 0) addRoom();

        recalcAll();
        saveData();
        showToast('นำเข้าข้อมูลสำเร็จ', 'success');
    }

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(getData()));
    }

    function generateSummaryText(options) {
        const data = getData();
        let summaryText = ``;

        if (options.customer) {
            summaryText += `*ข้อมูลลูกค้า*\n`;
            if (data.customer_name) summaryText += `ชื่อ: ${data.customer_name}\n`;
            if (data.customer_phone) summaryText += `โทร: ${data.customer_phone}\n`;
            if (data.customer_address) summaryText += `ที่อยู่: ${data.customer_address}\n`;
            summaryText += `\n`;
        }

        if (options.details) {
            summaryText += `*รายละเอียดงาน*\n`;
            data.rooms.forEach(room => {
                const pricedItems = room.sets.filter(s => !s.is_suspended).length +
                                    room.decorations.filter(d => !d.is_suspended).length +
                                    room.wallpapers.filter(w => !w.is_suspended).length;
                if (pricedItems > 0) {
                    summaryText += `\n**ห้อง: ${room.room_name || "ไม่ระบุ"}**\n`;
                    room.sets.filter(s => !s.is_suspended).forEach(s => {
                        const price = Math.round((toNum(s.price_per_m_raw) + stylePlus(s.style) + heightPlus(s.height_m)) * s.width_m) +
                                      Math.round((toNum(s.sheer_price_per_m) + stylePlus(s.style) + heightPlus(s.height_m)) * s.width_m);
                        const variantText = (s.fabric_variant === "ทึบ&โปร่ง") ? " (ทึบ+โปร่ง)" : "";
                        summaryText += `- ผ้าม่าน ${s.style} ${fmt(s.width_m)}x${fmt(s.height_m)} ม. ${variantText}: ${fmt(price, 0, true)} บ.\n`;
                    });
                    room.decorations.filter(d => !d.is_suspended).forEach(d => {
                        const price = Math.round(d.width_m * d.height_m * SQM_TO_SQYD * d.price_sqyd);
                        summaryText += `- ตกแต่ง ${d.type} ${fmt(d.width_m)}x${fmt(d.height_m)} ม.: ${fmt(price, 0, true)} บ.\n`;
                    });
                    room.wallpapers.filter(w => !w.is_suspended).forEach(w => {
                        const totalWidth = w.widths.reduce((sum, val) => sum + val, 0);
                        const rolls = CALC.wallpaperRolls(totalWidth, w.height_m);
                        const price = Math.round(rolls * w.price_per_roll);
                        summaryText += `- วอลล์เปเปอร์ ${fmt(w.height_m)} ม. กว้างรวม ${fmt(totalWidth)} ม.: ${fmt(price, 0, true)} บ.\n`;
                    });
                }
            });
            summaryText += `\n`;
        }

        if (options.summary) {
            summaryText += `*สรุปยอดรวม*\n`;
            const grandTotalEl = document.querySelector(SELECTORS.grandTotal);
            if (grandTotalEl) {
                summaryText += `ยอดรวมทั้งหมด: ${grandTotalEl.textContent} บ.`;
            }
        }
        
        return summaryText;
    }
    
    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        document.addEventListener('input', debounce(e => {
            const itemCard = e.target.closest(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            if (itemCard) {
                recalcAll();
                saveData();
            }
        }, 300));

        document.querySelector(SELECTORS.orderForm).addEventListener('change', e => {
             const setEl = e.target.closest(SELECTORS.set);
             if (setEl && e.target.name === 'fabric_variant') {
                 toggleSetFabricUI(setEl);
             }
             recalcAll();
             saveData();
        });

        document.querySelector(SELECTORS.orderForm).addEventListener('click', e => {
            const target = e.target.closest('[data-act]');
            if (!target) return;

            const actionMap = {
                'del-item': { 
                    selector: '.item-card', 
                    confirm: true, 
                    title: 'ยืนยันการลบรายการ', 
                    body: 'คุณต้องการลบรายการนี้ใช่หรือไม่? ข้อมูลทั้งหมดจะหายไป', 
                    action: (item) => item.remove(), 
                    toast: 'ลบรายการแล้ว'
                },
                'del-room': {
                    selector: '.room-card',
                    confirm: true,
                    title: 'ยืนยันการลบห้อง',
                    body: 'คุณต้องการลบห้องนี้ใช่หรือไม่? ข้อมูลทั้งหมดในห้องจะหายไป',
                    action: (room) => {
                        if (document.querySelectorAll(SELECTORS.room).length > 1) {
                            room.remove();
                        } else {
                            showToast("ไม่สามารถลบห้องสุดท้ายได้", "error");
                        }
                    },
                    toast: 'ลบห้องแล้ว'
                },
                'add-set': { selector: SELECTORS.room, action: addSet },
                'add-deco': { selector: SELECTORS.room, action: addDeco },
                'add-wallpaper': { selector: SELECTORS.room, action: addWallpaper },
                'add-wall': { selector: SELECTORS.wallpaperItem, action: (item, btn) => addWall(btn) },
                'del-wall': { 
                    selector: '.wall-input-row',
                    action: (item) => item.remove()
                },
                'toggle-suspend': {
                    selector: '.item-card',
                    action: (item) => suspendItem(item, item.dataset.suspended !== 'true'),
                    confirm: false
                }
            };
            
            const action = actionMap[target.dataset.act];
            if (action) {
                performActionWithConfirmation(target, action);
            }
        });

        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => addRoom());
        
        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const copyOptions = await showCopyOptionsModal();
            if (copyOptions) {
                const summaryText = generateSummaryText(copyOptions);
                try {
                    await navigator.clipboard.writeText(summaryText);
                    showToast("คัดลอกข้อมูลสรุปแล้ว", "success");
                } catch (err) {
                    showToast("ไม่สามารถคัดลอกได้: " + err, "error");
                }
            }
        });
        
        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const payload = JSON.stringify(getData(), null, 2);
            try {
                await navigator.clipboard.writeText(payload);
                showToast("คัดลอกข้อมูล JSON แล้ว", "success");
            } catch (err) {
                showToast("ไม่สามารถคัดลอกได้: " + err, "error");
            }
        });

        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const shouldClear = await showConfirmation(
                'ยืนยันการล้างข้อมูลทั้งหมด',
                'คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด? ข้อมูลที่บันทึกไว้ในเครื่องจะหายไปด้วย'
            );
            if (shouldClear) {
                localStorage.removeItem(STORAGE_KEY);
                window.location.reload();
            }
        });
        
        function updateLockState() {
            const lockIcon = document.querySelector('.lock-icon');
            const formElements = document.querySelectorAll(
                '#orderForm input, #orderForm select, #orderForm textarea, .btn'
            );
            if (isLocked) {
                document.querySelector('main').classList.add('is-locked');
                lockIcon.className = 'ph-bold ph-lock-key-fill lock-icon';
                formElements.forEach(el => el.disabled = true);
                document.querySelectorAll('.btn-icon.danger').forEach(el => el.disabled = true);
            } else {
                document.querySelector('main').classList.remove('is-locked');
                lockIcon.className = 'ph-bold ph-lock-key-open lock-icon';
                formElements.forEach(el => el.disabled = false);
            }
        }
        
        document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
            isLocked = !isLocked;
            updateLockState();
            showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'default');
        });
        
        document.querySelector(SELECTORS.exportBtn).addEventListener('click', (e) => {
            e.preventDefault();
            const data = JSON.stringify(getData(), null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", url);
            downloadAnchorNode.setAttribute("download", `quotation-data-${Date.now()}.json`);
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