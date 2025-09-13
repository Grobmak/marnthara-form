(function() {
    'use strict';
    // --- APP CONFIGURATION ---
    const APP_VERSION = "input-ui/4.0.0-M3";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path"; // CHANGE THIS TO YOUR MAKE.COM WEBHOOK URL
    const STORAGE_KEY = "marnthara.input.v4";
    const SQM_TO_SQYD = 1.19599;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };

    const CALC = {
        fabricYardage: (style, width) => {
            if (width <= 0) return 0;
            if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
            if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
            return 0;
        },
        wallpaperRolls: (totalWidth, height) => {
            if (totalWidth <= 0 || height <= 0) return 0;
            const stripsPerRoll = Math.floor(10 / height);
            if (stripsPerRoll === 0) return Infinity;
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        }
    };

    // --- DOM SELECTORS ---
    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', copyJsonBtn: '#copyJsonBtn', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomHeaderBtn: '#addRoomHeaderBtn', submitBtn: '#submitBtn',
        grandTotal: '#grandTotal', setCount: '#setCount', grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        roomNameInput: 'input[name="room_name"]', roomPricePerM: 'select[name="room_price_per_m"]', roomStyle: 'select[name="room_style"]',
        setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
        toastContainer: '#toast-container',
        grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn',
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel'
    };

    // --- DOM ELEMENTS CACHE ---
    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    orderForm.action = WEBHOOK_URL;
    
    // --- STATE ---
    let roomCount = 0;
    let isLocked = false;
    
    // --- UTILITY FUNCTIONS ---
    const toNum = v => {
        if (typeof v === 'string') v = v.replace(/,/g, '');
        const num = parseFloat(v);
        return isNaN(num) ? 0 : num;
    };
    const clamp01 = v => Math.max(0, toNum(v));
    const fmt = (n, fixed = 2, asCurrency = false) => {
        const options = asCurrency 
            ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } 
            : { minimumFractionDigits: fixed, maximumFractionDigits: fixed };
        return n.toLocaleString("th-TH", options);
    };
    const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        for (const entry of PRICING.height) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };
    
    const fmtTextSummary = (n, asCurrency = false) => {
        if (asCurrency) return `${n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} บ.`;
        return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // --- UI FUNCTIONS ---
    function showToast(message, type = 'success') {
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
    
    const showModal = (selector, onConfirm) => {
        return new Promise((resolve) => {
            const modalEl = document.querySelector(selector);
            if (!modalEl) { resolve(null); return; }
            modalEl.classList.add('visible');
            const confirmBtn = modalEl.querySelector('[id$="Confirm"]');
            const cancelBtn = modalEl.querySelector('[id$="Cancel"]');
            
            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                if (confirmBtn) confirmBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
                document.removeEventListener('keydown', handleEscape);
                resolve(result);
            };

            const handleEscape = (e) => {
                if (e.key === 'Escape') cleanup(false);
            };
            
            if (confirmBtn) {
                confirmBtn.onclick = async () => {
                    const result = onConfirm ? await onConfirm() : true;
                    cleanup(result);
                };
            }
            if (cancelBtn) {
                cancelBtn.onclick = () => cleanup(false);
            }
            document.addEventListener('keydown', handleEscape);
        });
    };
    
    const showConfirmation = (title, body) => {
        const modalEl = document.querySelector(SELECTORS.modal);
        if (modalEl) {
            const modalTitleEl = modalEl.querySelector(SELECTORS.modalTitle);
            const modalBodyEl = modalEl.querySelector(SELECTORS.modalBody);
            if (modalTitleEl) modalTitleEl.textContent = title;
            if (modalBodyEl) modalBodyEl.textContent = body;
        }
        return showModal(SELECTORS.modal);
    };

    const showCopyOptionsModal = () => showModal(SELECTORS.copyOptionsModal, () => ({
        customer: document.querySelector(SELECTORS.copyCustomerInfo)?.checked ?? false,
        details: document.querySelector(SELECTORS.copyRoomDetails)?.checked ?? false,
        summary: document.querySelector(SELECTORS.copySummary)?.checked ?? false,
    }));

    // --- CORE LOGIC ---
    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl)?.content?.cloneNode(true);
        if (!frag) return;
        const room = frag.querySelector(SELECTORS.room);
        room.dataset.index = roomCount;
        const priceSelect = room.querySelector(SELECTORS.roomPricePerM);
        if (priceSelect) {
            populatePriceOptions(priceSelect, PRICING.fabric);
        }
        roomsEl.appendChild(frag);
        const created = roomsEl.querySelector(`${SELECTORS.room}:last-of-type`);

        if (prefill) {
            const roomNameInput = created.querySelector(SELECTORS.roomNameInput);
            if (roomNameInput) roomNameInput.value = prefill.room_name || "";
            const pricePerMSelect = created.querySelector(SELECTORS.roomPricePerM);
            if (pricePerMSelect) pricePerMSelect.value = prefill.price_per_m_raw || "";
            const styleSelect = created.querySelector(SELECTORS.roomStyle);
            if (styleSelect) styleSelect.value = prefill.style || "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                const suspendText = created.querySelector('[data-suspend-text]');
                if (suspendText) suspendText.textContent = 'ใช้งาน';
            }
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        } else {
             addSet(created);
        }
        
        renumber(); recalcAll(); saveData();
        created.scrollIntoView({ behavior: 'smooth', block: 'end' });
        if (!prefill) showToast('เพิ่มห้องใหม่แล้ว');
    }

    function populatePriceOptions(selectEl, prices) {
        if (!selectEl) return;
        selectEl.innerHTML = `<option value="" hidden>เลือก</option>`;
        prices.forEach(p => {
            const option = document.createElement('option');
            option.value = p; option.textContent = p.toLocaleString("th-TH");
            selectEl.appendChild(option);
        });
    }

    function addSet(roomEl, prefill) {
        if (isLocked) return;
        const setsWrap = roomEl.querySelector(SELECTORS.setsContainer);
        if (!setsWrap) return;
        const frag = document.querySelector(SELECTORS.setTpl)?.content?.cloneNode(true);
        if (!frag) return;
        setsWrap.appendChild(frag);
        const created = setsWrap.querySelector(`${SELECTORS.set}:last-of-type`);
        const sheerSelect = created.querySelector('select[name="sheer_price_per_m"]');
        if (sheerSelect) {
            populatePriceOptions(sheerSelect, PRICING.sheer);
        }

        if (prefill) {
            const widthInput = created.querySelector('input[name="width_m"]');
            if (widthInput) widthInput.value = prefill.width_m ?? "";
            const heightInput = created.querySelector('input[name="height_m"]');
            if (heightInput) heightInput.value = prefill.height_m ?? "";
            const variantSelect = created.querySelector('select[name="fabric_variant"]');
            if (variantSelect) variantSelect.value = prefill.fabric_variant || "ทึบ";
            const openTypeSelect = created.querySelector('select[name="open_type"]');
            if (openTypeSelect) openTypeSelect.value = prefill.open_type || "";
            const sheerPriceSelect = created.querySelector('select[name="sheer_price_per_m"]');
            if (sheerPriceSelect) sheerPriceSelect.value = prefill.sheer_price_per_m || "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                const suspendText = created.querySelector('[data-suspend-text]');
                if (suspendText) suspendText.textContent = 'ใช้งาน';
            }
        }
        toggleSetFabricUI(created); renumber(); recalcAll(); saveData();
    }
    
    function addDeco(roomEl, prefill) {
        if (isLocked) return;
        const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
        if (!decoWrap) return;
        const frag = document.querySelector(SELECTORS.decoTpl)?.content?.cloneNode(true);
        if (!frag) return;
        decoWrap.appendChild(frag);
        const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);
        if (prefill) {
            const typeInput = created.querySelector('[name="deco_type"]');
            if (typeInput) typeInput.value = prefill.type || "";
            const widthInput = created.querySelector('[name="deco_width_m"]');
            if (widthInput) widthInput.value = prefill.width_m ?? "";
            const heightInput = created.querySelector('[name="deco_height_m"]');
            if (heightInput) heightInput.value = prefill.height_m ?? "";
            const priceInput = created.querySelector('[name="deco_price_sqyd"]');
            if (priceInput) priceInput.value = fmt(prefill.price_sqyd, 0, true) ?? "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                const suspendText = created.querySelector('[data-suspend-text]');
                if (suspendText) suspendText.textContent = 'ใช้งาน';
            }
        }
        renumber(); recalcAll(); saveData();
    }

    function addWallpaper(roomEl, prefill) {
        if (isLocked) return;
        const wallpaperWrap = roomEl.querySelector(SELECTORS.wallpapersContainer);
        if (!wallpaperWrap) return;
        const frag = document.querySelector(SELECTORS.wallpaperTpl)?.content?.cloneNode(true);
        if (!frag) return;
        wallpaperWrap.appendChild(frag);
        const created = wallpaperWrap.querySelector(`${SELECTORS.wallpaperItem}:last-of-type`);

        if (prefill) {
            const heightInput = created.querySelector('[name="wallpaper_height_m"]');
            if (heightInput) heightInput.value = prefill.height_m ?? "";
            const priceInput = created.querySelector('[name="wallpaper_price_roll"]');
            if (priceInput) priceInput.value = fmt(prefill.price_per_roll, 0, true) ?? "";
            (prefill.widths || []).forEach(w => addWall(created.querySelector('[data-act="add-wall"]'), w));
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                const suspendText = created.querySelector('[data-suspend-text]');
                if (suspendText) suspendText.textContent = 'ใช้งาน';
            }
        } else {
            addWall(created.querySelector('[data-act="add-wall"]'));
        }
        renumber(); recalcAll(); saveData();
    }

    function addWall(btn, prefillWidth) {
        if (isLocked) return;
        const wallsContainer = btn.closest(SELECTORS.wallpaperItem)?.querySelector(SELECTORS.wallsContainer);
        if (!wallsContainer) return;
        const frag = document.querySelector(SELECTORS.wallTpl)?.content?.cloneNode(true);
        if (!frag) return;
        const wallInput = frag.querySelector('input[name="wall_width_m"]');
        if (wallInput && prefillWidth) {
            wallInput.value = prefillWidth;
        }
        wallsContainer.appendChild(frag);
    }
    
    function toggleSuspend(btn) {
        const item = btn.closest('.room, .set, .deco-item, .wallpaper-item');
        if (!item) return;
        const isSuspended = !(item.dataset.suspended === 'true');
        item.dataset.suspended = isSuspended;
        item.classList.toggle('is-suspended', isSuspended);
        const suspendTextEl = btn.querySelector('[data-suspend-text]');
        if (suspendTextEl) suspendTextEl.textContent = isSuspended ? 'ใช้งาน' : 'ระงับ';
        recalcAll(); saveData();
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'นำกลับมาใช้'}แล้ว`, 'warning');
    }
    
    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const roomNameInput = room.querySelector(SELECTORS.roomNameInput);
            if (roomNameInput) {
                roomNameInput.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            }
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            items.forEach((item, iIdx) => {
                const itemTitle = item.querySelector("[data-item-title]");
                if (itemTitle) {
                    itemTitle.textContent = `${iIdx + 1}`;
                }
            });
        });
    }

    const debouncedRecalc = debounce(() => {
        recalcAll();
        saveData();
    });

    function recalcAll() {
        let grand = { total: 0, opaqueYards: 0, sheerYards: 0, opaqueTrack: 0, sheerTrack: 0, setCount: 0, decoCount: 0, curtainCount: 0 };
        
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            let roomSum = 0;
            const isRoomSuspended = room.dataset.suspended === 'true';
            const baseRaw = toNum(room.querySelector(SELECTORS.roomPricePerM)?.value);
            const style = room.querySelector(SELECTORS.roomStyle)?.value;
            const sPlus = stylePlus(style);

            // --- Recalc Sets ---
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                const isSuspended = isRoomSuspended || set.dataset.suspended === 'true';
                const w = clamp01(set.querySelector('input[name="width_m"]')?.value);
                const h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                const hPlus = heightPlus(h);
                const variant = set.querySelector('select[name="fabric_variant"]')?.value;
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;

                if (!isSuspended && w > 0 && h > 0) {
                    if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                        opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                        opaqueYards = CALC.fabricYardage(style, w);
                        opaqueTrack = w;
                    }
                    if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                        const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                        sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                        sheerYards = CALC.fabricYardage(style, w);
                        sheerTrack = w;
                    }
                    grand.opaqueYards += opaqueYards;
                    grand.sheerYards += sheerYards;
                    grand.opaqueTrack += opaqueTrack;
                    grand.sheerTrack += sheerTrack;
                    grand.curtainCount++;
                    grand.setCount++;
                    roomSum += opaquePrice + sheerPrice;
                }
                updateSetUI(set, { opaquePrice, sheerPrice, opaqueYards, sheerYards, opaqueTrack, sheerTrack });
            });

            // --- Recalc Decos ---
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isSuspended = isRoomSuspended || deco.dataset.suspended === 'true';
                const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                const areaSqyd = w * h * SQM_TO_SQYD;
                const decoPrice = isSuspended ? 0 : Math.round(areaSqyd * price);
                const decoSummary = deco.querySelector('[data-deco-summary]');
                if (decoSummary) {
                    decoSummary.innerHTML = `ราคา: <span class="price">${fmt(decoPrice, 0, true)}</span> • พื้นที่: <span class="price">${fmt(areaSqyd, 2)}</span> ตร.หลา`;
                }
                if (!isSuspended) {
                    roomSum += decoPrice;
                    grand.setCount++;
                    grand.decoCount++;
                }
            });

            // --- Recalc Wallpapers ---
             room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const isSuspended = isRoomSuspended || wallpaper.dataset.suspended === 'true';
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                const wallpaperPrice = isSuspended ? 0 : Math.round(rollsNeeded * pricePerRoll);
                const areaSqm = totalWidth * h;
                const wallpaperSummary = wallpaper.querySelector('[data-wallpaper-summary]');
                if (wallpaperSummary) {
                    wallpaperSummary.innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> • พื้นที่: <span class="price">${fmt(areaSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${rollsNeeded}</span> ม้วน`;
                }
                if (!isSuspended) {
                    roomSum += wallpaperPrice;
                    grand.setCount++;
                    grand.decoCount++;
                }
            });

            const totalItemsInRoom = room.querySelectorAll('[data-set], [data-deco-item], [data-wallpaper-item]').length;
            const roomBrief = room.querySelector('[data-room-brief]');
            if (roomBrief) {
                roomBrief.innerHTML = `<span class="num">${totalItemsInRoom} จุด</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span>`;
            }
            grand.total += roomSum;
        });

        // --- Update Grand Total UI ---
        const grandTotalEl = document.querySelector(SELECTORS.grandTotal);
        if (grandTotalEl) grandTotalEl.textContent = fmt(grand.total, 0, true);
        const setCountEl = document.querySelector(SELECTORS.setCount);
        if (setCountEl) setCountEl.textContent = grand.setCount;
        const setCountSetsEl = document.querySelector(SELECTORS.setCountSets);
        if (setCountSetsEl) setCountSetsEl.textContent = grand.curtainCount;
        const setCountDecoEl = document.querySelector(SELECTORS.setCountDeco);
        if (setCountDecoEl) setCountDecoEl.textContent = grand.decoCount;
        const grandFabricEl = document.querySelector(SELECTORS.grandFabric);
        if (grandFabricEl) grandFabricEl.textContent = `${fmt(grand.opaqueYards, 2)} หลา`;
        const grandSheerFabricEl = document.querySelector(SELECTORS.grandSheerFabric);
        if (grandSheerFabricEl) grandSheerFabricEl.textContent = `${fmt(grand.sheerYards, 2)} หลา`;
        const grandOpaqueTrackEl = document.querySelector(SELECTORS.grandOpaqueTrack);
        if (grandOpaqueTrackEl) grandOpaqueTrackEl.textContent = `${fmt(grand.opaqueTrack, 2)} ม.`;
        const grandSheerTrackEl = document.querySelector(SELECTORS.grandSheerTrack);
        if (grandSheerTrackEl) grandSheerTrackEl.textContent = `${fmt(grand.sheerTrack, 2)} ม.`;
    }

    function updateSetUI(set, data) {
        const setPriceTotalEl = set.querySelector('[data-set-price-total]');
        if (setPriceTotalEl) setPriceTotalEl.textContent = fmt(data.opaquePrice + data.sheerPrice, 0, true);
        const setPriceOpaqueEl = set.querySelector('[data-set-price-opaque]');
        if (setPriceOpaqueEl) setPriceOpaqueEl.textContent = fmt(data.opaquePrice, 0, true);
        const setPriceSheerEl = set.querySelector('[data-set-price-sheer]');
        if (setPriceSheerEl) setPriceSheerEl.textContent = fmt(data.sheerPrice, 0, true);
        const setYardageOpaqueEl = set.querySelector('[data-set-yardage-opaque]');
        if (setYardageOpaqueEl) setYardageOpaqueEl.textContent = fmt(data.opaqueYards, 2);
        const setYardageSheerEl = set.querySelector('[data-set-yardage-sheer]');
        if (setYardageSheerEl) setYardageSheerEl.textContent = fmt(data.sheerYards, 2);
        const setOpaqueTrackEl = set.querySelector('[data-set-opaque-track]');
        if (setOpaqueTrackEl) setOpaqueTrackEl.textContent = fmt(data.opaqueTrack, 2);
        const setSheerTrackEl = set.querySelector('[data-set-sheer-track]');
        if (setSheerTrackEl) setSheerTrackEl.textContent = fmt(data.sheerTrack, 2);
    }
    
    function toggleSetFabricUI(setEl) {
        if (!setEl) return;
        const variantSelect = setEl.querySelector('select[name="fabric_variant"]');
        const variant = variantSelect ? variantSelect.value : '';
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        setEl.querySelector(SELECTORS.sheerWrap)?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector('[data-set-options-row]')?.classList.toggle("three-col", hasSheer);
        setEl.querySelector("[data-sheer-price-label]")?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-yardage-label]")?.classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-track-label]")?.classList.toggle("hidden", !hasSheer);
        const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
        setEl.querySelector("[data-opaque-price-label]")?.classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-yardage-label]")?.classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-track-label]")?.classList.toggle("hidden", !hasOpaque);
    }
    
    function buildPayload() {
        const payload = {
            app_version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]')?.value || '',
            customer_phone: document.querySelector('input[name="customer_phone"]')?.value || '',
            customer_address: document.querySelector('input[name="customer_address"]')?.value || '',
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomNameInput = roomEl.querySelector(SELECTORS.roomNameInput);
            const pricePerMSelect = roomEl.querySelector(SELECTORS.roomPricePerM);
            const roomStyleSelect = roomEl.querySelector(SELECTORS.roomStyle);
            
            const roomData = {
                room_name: roomNameInput?.value || '',
                price_per_m_raw: toNum(pricePerMSelect?.value),
                style: roomStyleSelect?.value || '',
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [], decorations: [], wallpapers: []
            };
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    width_m: toNum(setEl.querySelector('input[name="width_m"]')?.value), height_m: toNum(setEl.querySelector('input[name="height_m"]')?.value),
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value || '', open_type: setEl.querySelector('select[name="open_type"]')?.value || '',
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value), is_suspended: setEl.dataset.suspended === 'true',
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value || '', width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value), price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                    is_suspended: decoEl.dataset.suspended === 'true',
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                roomData.wallpapers.push({
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value), price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)), is_suspended: wallpaperEl.dataset.suspended === 'true',
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function buildTextSummary(options) {
        const payload = buildPayload();
        let summary = "--- รายละเอียดการสั่งซื้อ ---\n";

        if (options.customer) {
            summary += "\n**ข้อมูลลูกค้า**\n";
            summary += `- ชื่อ: ${payload.customer_name || 'N/A'}\n`;
            summary += `- โทร: ${payload.customer_phone || 'N/A'}\n`;
            summary += `- รายละเอียด: ${payload.customer_address || 'N/A'}\n`;
        }

        if (options.details) {
            payload.rooms.forEach((room, roomIndex) => {
                if (room.is_suspended) return;
                summary += `\n**ห้อง ${room.room_name || (roomIndex + 1)}** (ราคาต่อเมตร: ${fmtTextSummary(room.price_per_m_raw, true)}, สไตล์: ${room.style || 'N/A'})`;
                
                const allItems = [...room.sets, ...room.decorations, ...room.wallpapers];
                allItems.forEach((item, itemIndex) => {
                    if (item.is_suspended) return;
                    summary += `\n  - จุดที่ ${itemIndex + 1}: `;
                    if (item.fabric_variant) { // It's a curtain set
                        const w = item.width_m, h = item.height_m;
                        summary += `ผ้าม่าน (${item.fabric_variant}) - กว้าง ${fmtTextSummary(w)} ม. x สูง ${fmtTextSummary(h)} ม.\n`;
                        const totalCurtainPrice = Math.round((room.price_per_m_raw + stylePlus(room.style) + heightPlus(h)) * w) + (item.sheer_price_per_m ? Math.round((item.sheer_price_per_m + stylePlus(room.style) + heightPlus(h)) * w) : 0);
                        summary += `    - ราคา: ${fmtTextSummary(totalCurtainPrice, true)}\n`;
                    } else if (item.type) { // It's a decoration item
                        const w = item.width_m, h = item.height_m;
                        summary += `${item.type} - กว้าง ${fmtTextSummary(w)} ม. x สูง ${fmtTextSummary(h)} ม.\n`;
                        const decoPrice = Math.round(w * h * SQM_TO_SQYD * item.price_sqyd);
                        summary += `    - ราคา: ${fmtTextSummary(decoPrice, true)}\n`;
                    } else if (item.widths) { // It's a wallpaper item
                        const h = item.height_m;
                        const totalWidth = item.widths.reduce((sum, w) => sum + w, 0);
                        const rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                        const areaSqm = totalWidth * h;
                        summary += `วอลเปเปอร์ - พื้นที่รวม ${fmtTextSummary(areaSqm)} ตร.ม. (${rollsNeeded} ม้วน)\n`;
                        const wallpaperPrice = Math.round(rollsNeeded * item.price_per_roll);
                        summary += `    - ราคา: ${fmtTextSummary(wallpaperPrice, true)}\n`;
                    }
                });
            });
        }
        
        if (options.summary) {
            const grandTotalEl = document.querySelector(SELECTORS.grandTotal);
            const grandTotal = grandTotalEl ? toNum(grandTotalEl.textContent) : 0;
            summary += `\n\n--- สรุปยอดรวม ---\n`;
            summary += `- ราคารวมทั้งหมด: **${fmtTextSummary(grandTotal, true)}**\n`;
            summary += `- ผ้าทึบ: ${document.querySelector(SELECTORS.grandFabric)?.textContent || 'N/A'}\n`;
            summary += `- ผ้าโปร่ง: ${document.querySelector(SELECTORS.grandSheerFabric)?.textContent || 'N/A'}\n`;
            summary += `- รางทึบ: ${document.querySelector(SELECTORS.grandOpaqueTrack)?.textContent || 'N/A'}\n`;
            summary += `- รางโปร่ง: ${document.querySelector(SELECTORS.grandSheerTrack)?.textContent || 'N/A'}\n`;
        }

        return summary;
    }

    function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload())); }
    
    function loadPayload(payload) {
        if (!payload || !payload.rooms) { showToast("ข้อมูลไม่ถูกต้อง", "error"); return; }
        const customerNameInput = document.querySelector('input[name="customer_name"]');
        if (customerNameInput) customerNameInput.value = payload.customer_name || '';
        const customerAddressInput = document.querySelector('input[name="customer_address"]');
        if (customerAddressInput) customerAddressInput.value = payload.customer_address || '';
        const customerPhoneInput = document.querySelector('input[name="customer_phone"]');
        if (customerPhoneInput) customerPhoneInput.value = payload.customer_phone || '';
        
        roomsEl.innerHTML = ""; roomCount = 0;
        if (payload.rooms.length > 0) payload.rooms.forEach(addRoom); else addRoom();
        showToast("โหลดข้อมูลสำเร็จ");
    }

    // --- Action Handlers ---
    async function handleAction(e) {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const action = btn.dataset.act;
        const roomEl = btn.closest(SELECTORS.room);
        const itemEl = btn.closest('.set, .deco-item, .wallpaper-item');
        e.preventDefault();

        const actions = {
            'add-set': () => addSet(roomEl), 'add-deco': () => addDeco(roomEl), 'add-wallpaper': () => addWallpaper(roomEl),
            'del-room': async () => { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; roomEl.remove(); roomCount = roomsEl.querySelectorAll(SELECTORS.room).length; renumber(); debouncedRecalc(); showToast('ลบห้องแล้ว', 'success'); },
            'del-set': async () => { if (isLocked || !await showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) return; itemEl.remove(); renumber(); debouncedRecalc(); showToast('ลบจุดผ้าม่านแล้ว', 'success'); },
            'del-deco': async () => { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) return; itemEl.remove(); renumber(); debouncedRecalc(); showToast('ลบรายการตกแต่งแล้ว', 'success'); },
            'del-wallpaper': async () => { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์?')) return; itemEl.remove(); renumber(); debouncedRecalc(); showToast('ลบรายการวอลเปเปอร์แล้ว', 'success'); },
            'clear-room': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูลห้อง', 'ยืนยันการล้างข้อมูลทุกรายการในห้องนี้?')) return; roomEl.querySelectorAll('[data-sets], [data-decorations], [data-wallpapers]').forEach(c => c.innerHTML = ''); addSet(roomEl); renumber(); debouncedRecalc(); showToast('ล้างข้อมูลห้องแล้ว', 'success'); },
            'clear-set': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในจุดนี้?')) return; itemEl.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : ''; }); toggleSetFabricUI(itemEl); debouncedRecalc(); },
            'clear-deco': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; itemEl.querySelectorAll('input, select').forEach(el => { el.value = ''; }); debouncedRecalc(); },
            'clear-wallpaper': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; itemEl.querySelectorAll('input').forEach(el => el.value = ''); const wallsContainer = itemEl.querySelector(SELECTORS.wallsContainer); if (wallsContainer) wallsContainer.innerHTML = ''; addWall(itemEl.querySelector('[data-act="add-wall"]')); debouncedRecalc(); },
            'del-wall': () => { if(isLocked) return; const wallRow = btn.closest('.wall-input-row'); if (wallRow) wallRow.remove(); debouncedRecalc(); },
            'add-wall': () => addWall(btn),
            'toggle-suspend': () => toggleSuspend(btn),
            'toggle-suspend-room': () => toggleSuspend(btn),
            'menu-room': () => { const menu = btn.nextElementSibling; if(menu) menu.classList.toggle('show'); },
            'menu-item': () => { const menu = btn.nextElementSibling; if(menu) menu.classList.toggle('show'); }
        };
        if (actions[action]) actions[action]();
    }
    
    // --- Initial Setup & Event Listeners ---
    document.addEventListener('DOMContentLoaded', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try { loadPayload(JSON.parse(storedData)); } catch(err) { addRoom(); }
        } else { addRoom(); }
        
        if (orderForm) {
            orderForm.addEventListener("click", handleAction);
            orderForm.addEventListener("input", debouncedRecalc);
            orderForm.addEventListener("change", (e) => {
                const select = e.target.closest('select[name="fabric_variant"]');
                if (select) toggleSetFabricUI(select.closest(SELECTORS.set));
                debouncedRecalc();
            });
            orderForm.addEventListener("submit", (e) => {
                const payloadInput = document.querySelector(SELECTORS.payloadInput);
                if (payloadInput) payloadInput.value = JSON.stringify(buildPayload());
                showToast("กำลังส่งข้อมูล...");
            });
        }
        
        const customerInfoEl = document.querySelector('#customerInfo');
        if (customerInfoEl) {
            customerInfoEl.addEventListener("input", debounce(saveData));
        }

        const addRoomHeaderBtnEl = document.querySelector(SELECTORS.addRoomHeaderBtn);
        if (addRoomHeaderBtnEl) {
            addRoomHeaderBtnEl.addEventListener('click', () => addRoom());
        }
        
        const clearAllBtnEl = document.querySelector(SELECTORS.clearAllBtn);
        if (clearAllBtnEl) {
            clearAllBtnEl.addEventListener('click', async () => { 
                if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return; 
                if (roomsEl) roomsEl.innerHTML = ""; 
                roomCount = 0; 
                document.querySelectorAll('#customerInfo input').forEach(i => i.value = ""); 
                addRoom(); 
                saveData(); 
                showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning'); 
            });
        }
        
        // Lock functionality
        const lockBtnEl = document.querySelector(SELECTORS.lockBtn);
        if (lockBtnEl) {
            lockBtnEl.addEventListener('click', () => {
                isLocked = !isLocked;
                document.body.classList.toggle('is-locked', isLocked);
                document.querySelectorAll('input, select, button').forEach(el => {
                    const isExempt = el.closest('.menu-dropdown') || el.id === 'menuBtn' || el.id === 'copyJsonBtn' || el.id === 'copyTextBtn' || el.id === 'importBtn' || el.id === 'exportBtn' || el.id === 'clearAllBtn' || el.id === 'lockBtn';
                    if (!isExempt) el.disabled = isLocked;
                });
                const lockBtn = document.querySelector(SELECTORS.lockBtn);
                const lockText = lockBtn?.querySelector('.lock-text');
                const lockIcon = lockBtn?.querySelector('.material-symbols-outlined');
                if (lockText) lockText.textContent = isLocked ? 'ปลดล็อค' : 'ล็อคฟอร์ม';
                if (lockIcon) lockIcon.textContent = isLocked ? 'lock_open' : 'lock';
                showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'warning');
            });
        }

        // Copy/Paste/Import/Export
        const copyJsonBtnEl = document.querySelector(SELECTORS.copyJsonBtn);
        if (copyJsonBtnEl) {
            copyJsonBtnEl.addEventListener('click', () => { 
                navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2))
                    .then(() => showToast('คัดลอก JSON แล้ว'))
                    .catch(() => showToast('คัดลอกล้มเหลว', 'error')); 
            });
        }
        
        const copyTextBtnEl = document.querySelector(SELECTORS.copyTextBtn);
        if (copyTextBtnEl) {
            copyTextBtnEl.addEventListener('click', async () => {
                const options = await showCopyOptionsModal();
                if (!options) return;
                const text = buildTextSummary(options); 
                navigator.clipboard.writeText(text)
                    .then(() => showToast('คัดลอกข้อความสำเร็จ'))
                    .catch(() => showToast('คัดลอกล้มเหลว', 'error'));
            });
        }

        const importBtnEl = document.querySelector(SELECTORS.importBtn);
        if (importBtnEl) {
            importBtnEl.addEventListener('click', () => showModal(SELECTORS.importModal));
        }

        const importConfirmEl = document.querySelector(SELECTORS.importConfirm);
        if (importConfirmEl) {
            importConfirmEl.addEventListener('click', () => {
                const importJsonAreaEl = document.querySelector(SELECTORS.importJsonArea);
                const jsonText = importJsonAreaEl ? importJsonAreaEl.value : '';
                try {
                    const payload = JSON.parse(jsonText);
                    loadPayload(payload);
                } catch (e) {
                    showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
                }
            });
        }

        const importCancelEl = document.querySelector(SELECTORS.importCancel);
        if (importCancelEl) {
            importCancelEl.addEventListener('click', () => {
                const importModalEl = document.querySelector(SELECTORS.importModal);
                if (importModalEl) importModalEl.classList.remove('visible');
            });
        }
        
        const exportBtnEl = document.querySelector(SELECTORS.exportBtn);
        if (exportBtnEl) {
            exportBtnEl.addEventListener('click', () => {
                const data = JSON.stringify(buildPayload(), null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `marnthara_data_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('ส่งออกข้อมูลสำเร็จ');
            });
        }

        // Menu, Modal, and Dropdown closing logic
        window.addEventListener('click', (e) => {
            document.querySelectorAll('.menu-dropdown.show').forEach(menu => {
                if (!menu.parentElement.contains(e.target)) menu.classList.remove('show');
            });
        });
    });
})();