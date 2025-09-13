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
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel',
        customerInfoForm: '#customerInfo'
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
            
            if (confirmBtn) confirmBtn.onclick = async () => {
                const result = onConfirm ? await onConfirm() : true;
                cleanup(result);
            };
            if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
            document.addEventListener('keydown', handleEscape);
        });
    };
    
    const showConfirmation = (title, body) => {
        const modalEl = document.querySelector(SELECTORS.modal);
        if (modalEl) {
            modalEl.querySelector(SELECTORS.modalTitle).textContent = title;
            modalEl.querySelector(SELECTORS.modalBody).textContent = body;
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
        populatePriceOptions(room.querySelector(SELECTORS.roomPricePerM), PRICING.fabric);
        roomsEl.appendChild(frag);
        const created = roomsEl.querySelector(`${SELECTORS.room}:last-of-type`);

        if (prefill) {
            created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
            created.querySelector(SELECTORS.roomPricePerM).value = prefill.price_per_m_raw || "";
            created.querySelector(SELECTORS.roomStyle).value = prefill.style || "";
             if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
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
        
        // Populate fabric and sheer options
        populatePriceOptions(created.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);

        if (prefill) {
            created.querySelector('input[name="width_m"]').value = prefill.width_m ?? "";
            created.querySelector('input[name="height_m"]').value = prefill.height_m ?? "";
            created.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
            created.querySelector('select[name="open_type"]').value = prefill.open_type || "";
            created.querySelector('select[name="sheer_price_per_m"]').value = prefill.sheer_price_per_m || "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
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
            created.querySelector('[name="deco_type"]').value = prefill.type || "";
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m ?? "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmt(prefill.price_sqyd, 0, true) ?? "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
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
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="wallpaper_price_roll"]').value = fmt(prefill.price_per_roll, 0, true) ?? "";
            (prefill.widths || []).forEach(w => addWall(created.querySelector('[data-act="add-wall"]'), w));
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
                created.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
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
        if (prefillWidth) {
            frag.querySelector('input[name="wall_width_m"]').value = prefillWidth;
        }
        wallsContainer.appendChild(frag);
    }
    
    function toggleSuspend(btn) {
        const item = btn.closest('.room-card, .item-card');
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
            room.querySelector(SELECTORS.roomNameInput).placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            items.forEach((item, iIdx) => {
                item.querySelector("[data-item-title]").textContent = `${iIdx + 1}`;
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
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <span class="price">${fmt(decoPrice, 0, true)}</span> • พื้นที่: <span class="price">${fmt(areaSqyd, 2)}</span> ตร.หลา`;
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
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <span class="price">${fmt(wallpaperPrice, 0, true)}</span> • พื้นที่: <span class="price">${fmt(areaSqm, 2)}</span> ตร.ม. • ใช้ <span class="price">${rollsNeeded}</span> ม้วน`;
                if (!isSuspended) {
                    roomSum += wallpaperPrice;
                    grand.setCount++;
                    grand.decoCount++;
                }
            });

            const totalItemsInRoom = room.querySelectorAll('[data-set], [data-deco-item], [data-wallpaper-item]').length;
            room.querySelector('[data-room-brief]').innerHTML = `<span class="num">${totalItemsInRoom} จุด</span> • ราคา <span class="num price">${fmt(roomSum, 0, true)}</span>`;
            grand.total += roomSum;
        });

        // --- Update Grand Total UI ---
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand.total, 0, true);
        document.querySelector(SELECTORS.setCountSets).textContent = grand.curtainCount;
        document.querySelector(SELECTORS.setCountDeco).textContent = grand.decoCount;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grand.opaqueYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grand.sheerYards, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grand.opaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grand.sheerTrack, 2)} ม.`;
    }

    function updateSetUI(setEl, { opaquePrice, sheerPrice, opaqueYards, sheerYards, opaqueTrack, sheerTrack }) {
        const isSuspended = setEl.dataset.suspended === 'true';
        const isOpaque = setEl.querySelector('select[name="fabric_variant"]')?.value === 'ทึบ' || setEl.querySelector('select[name="fabric_variant"]')?.value === 'ทึบ&โปร่ง';
        const isSheer = setEl.querySelector('select[name="fabric_variant"]')?.value === 'โปร่ง' || setEl.querySelector('select[name="fabric_variant"]')?.value === 'ทึบ&โปร่ง';
        
        const summary = setEl.querySelector('[data-set-summary]');
        if (summary) {
            let html = '<div>';
            if (isOpaque && !isSuspended) {
                html += `<span>ราคาผ้าทึบ: <span class="price">${fmt(opaquePrice, 0, true)}</span></span> • <span>ผ้า: <span class="price">${fmt(opaqueYards, 2)}</span> หลา</span> • <span>ราง: <span class="price">${fmt(opaqueTrack, 2)}</span> ม.</span>`;
            }
            if (isSheer && !isSuspended) {
                html += `<br><span>ราคาผ้าโปร่ง: <span class="price">${fmt(sheerPrice, 0, true)}</span></span> • <span>ผ้า: <span class="price">${fmt(sheerYards, 2)}</span> หลา</span> • <span>ราง: <span class="price">${fmt(sheerTrack, 2)}</span> ม.</span>`;
            }
            html += '</div>';
            summary.innerHTML = html;
        }

        const sheerWrapEl = setEl.querySelector(SELECTORS.sheerWrap);
        if (sheerWrapEl) {
            sheerWrapEl.style.display = isSheer ? 'block' : 'none';
        }
    }

    function toggleSetFabricUI(setEl) {
        const variantSelect = setEl.querySelector('select[name="fabric_variant"]');
        if (!variantSelect) return;
        const sheerWrapEl = setEl.querySelector(SELECTORS.sheerWrap);
        if (!sheerWrapEl) return;
        sheerWrapEl.style.display = (variantSelect.value === 'โปร่ง' || variantSelect.value === 'ทึบ&โปร่ง') ? 'block' : 'none';
    }

    // --- DATA HANDLING ---
    function collectData() {
        const data = {
            customer_info: {
                customer_name: document.querySelector('#customer_name').value,
                customer_phone: document.querySelector('#customer_phone').value,
                customer_address: document.querySelector('#customer_address').value,
            },
            rooms: [],
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                is_suspended: roomEl.dataset.suspended === 'true',
                price_per_m_raw: toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value),
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                sets: [],
                decorations: [],
                wallpapers: []
            };
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    is_suspended: setEl.dataset.suspended === 'true',
                    width_m: toNum(setEl.querySelector('input[name="width_m"]').value),
                    height_m: toNum(setEl.querySelector('input[name="height_m"]').value),
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    open_type: setEl.querySelector('select[name="open_type"]').value,
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value),
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    is_suspended: decoEl.dataset.suspended === 'true',
                    type: decoEl.querySelector('[name="deco_type"]').value,
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]').value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]').value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value),
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                roomData.wallpapers.push({
                    is_suspended: wallpaperEl.dataset.suspended === 'true',
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value),
                    widths: Array.from(wallpaperEl.querySelectorAll('input[name="wall_width_m"]')).map(el => toNum(el.value)),
                });
            });
            data.rooms.push(roomData);
        });
        return data;
    }

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
    }

    function loadData() {
        try {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (!storedData) return;
            const data = JSON.parse(storedData);
            
            document.querySelector('#customer_name').value = data.customer_info.customer_name || '';
            document.querySelector('#customer_phone').value = data.customer_info.customer_phone || '';
            document.querySelector('#customer_address').value = data.customer_info.customer_address || '';

            roomsEl.innerHTML = '';
            roomCount = 0;
            if (data.rooms) {
                data.rooms.forEach(room => addRoom(room));
            }
        } catch (e) {
            console.error("Failed to load data from localStorage", e);
        }
    }

    function copyDataToClipboard(data, type) {
        if (type === 'json') {
            const jsonString = JSON.stringify(data, null, 2);
            navigator.clipboard.writeText(jsonString);
            showToast('คัดลอก JSON สำเร็จ!', 'success');
        } else if (type === 'text') {
            const textSummary = generateTextSummary(data);
            navigator.clipboard.writeText(textSummary);
            showToast('คัดลอกข้อความสำเร็จ!', 'success');
        }
    }

    function generateTextSummary(data) {
        let text = "Marnthara Calculator - สรุปรายการ\n\n";

        if (document.querySelector(SELECTORS.copyCustomerInfo)?.checked) {
            text += "--- ข้อมูลลูกค้า ---\n";
            text += `ชื่อ: ${data.customer_info.customer_name || "-"}\n`;
            text += `เบอร์โทร: ${data.customer_info.customer_phone || "-"}\n`;
            text += `ที่อยู่/รายละเอียด: ${data.customer_info.customer_address || "-"}\n\n`;
        }

        if (document.querySelector(SELECTORS.copyRoomDetails)?.checked) {
            text += "--- รายละเอียดแต่ละห้อง ---\n\n";
            data.rooms.forEach(room => {
                const roomTotal = room.sets.reduce((sum, s) => {
                    const basePrice = toNum(room.price_per_m_raw);
                    const sheerBase = toNum(s.sheer_price_per_m);
                    const styleSurcharge = stylePlus(room.style);
                    const heightSurcharge = heightPlus(toNum(s.height_m));
                    let price = 0;
                    if (s.fabric_variant === "ทึบ" || s.fabric_variant === "ทึบ&โปร่ง") {
                        price += Math.round((basePrice + styleSurcharge + heightSurcharge) * toNum(s.width_m));
                    }
                    if (s.fabric_variant === "โปร่ง" || s.fabric_variant === "ทึบ&โปร่ง") {
                        price += Math.round((sheerBase + styleSurcharge + heightSurcharge) * toNum(s.width_m));
                    }
                    return sum + (s.is_suspended ? 0 : price);
                }, 0);
                const decoTotal = room.decorations.reduce((sum, d) => {
                    const price = toNum(d.price_sqyd) * toNum(d.width_m) * toNum(d.height_m) * SQM_TO_SQYD;
                    return sum + (d.is_suspended ? 0 : Math.round(price));
                }, 0);
                const wallpaperTotal = room.wallpapers.reduce((sum, w) => {
                    const totalWidth = w.widths.reduce((wSum, wWidth) => wSum + wWidth, 0);
                    const rolls = CALC.wallpaperRolls(totalWidth, toNum(w.height_m));
                    return sum + (w.is_suspended ? 0 : Math.round(rolls * toNum(w.price_per_roll)));
                }, 0);
                const roomGrandTotal = roomTotal + decoTotal + wallpaperTotal;
                
                text += `* ห้อง: ${room.room_name || `ห้อง ${data.rooms.indexOf(room) + 1}`} (${room.is_suspended ? "ระงับ" : "ใช้งาน"}) - ${fmtTextSummary(roomGrandTotal, true)}\n`;
                if (!room.is_suspended) {
                    room.sets.forEach((set, i) => {
                        if (!set.is_suspended) {
                            text += `  - จุดที่ ${i + 1}: กว้าง ${fmtTextSummary(set.width_m)} ม. x สูง ${fmtTextSummary(set.height_m)} ม. [${set.fabric_variant} ${room.style}]\n`;
                        }
                    });
                    room.decorations.forEach((deco, i) => {
                        if (!deco.is_suspended) {
                            text += `  - รายการตกแต่งที่ ${i + 1}: ${deco.type} [กว้าง ${fmtTextSummary(deco.width_m)} ม. x สูง ${fmtTextSummary(deco.height_m)} ม.]\n`;
                        }
                    });
                    room.wallpapers.forEach((wallpaper, i) => {
                        if (!wallpaper.is_suspended) {
                            text += `  - วอลเปเปอร์ที่ ${i + 1}: สูง ${fmtTextSummary(wallpaper.height_m)} ม. [กว้าง ${wallpaper.widths.map(fmtTextSummary).join(' + ')} ม.]\n`;
                        }
                    });
                }
                text += "\n";
            });
        }

        if (document.querySelector(SELECTORS.copySummary)?.checked) {
            text += "--- สรุปยอดรวม ---\n";
            const grand = {};
            document.querySelectorAll(SELECTORS.grandTotal).forEach(el => grand.total = el.textContent);
            document.querySelectorAll(SELECTORS.grandFabric).forEach(el => grand.fabric = el.textContent);
            document.querySelectorAll(SELECTORS.grandSheerFabric).forEach(el => grand.sheerFabric = el.textContent);
            document.querySelectorAll(SELECTORS.grandOpaqueTrack).forEach(el => grand.opaqueTrack = el.textContent);
            document.querySelectorAll(SELECTORS.grandSheerTrack).forEach(el => grand.sheerTrack = el.textContent);
            document.querySelectorAll(SELECTORS.setCountSets).forEach(el => grand.setCountSets = el.textContent);
            document.querySelectorAll(SELECTORS.setCountDeco).forEach(el => grand.setCountDeco = el.textContent);

            text += `ยอดรวมทั้งหมด: ${grand.total}\n`;
            text += `ผ้าทึบ: ${grand.fabric}\n`;
            text += `ผ้าโปร่ง: ${grand.sheerFabric}\n`;
            text += `รางทึบ: ${grand.opaqueTrack}\n`;
            text += `รางโปร่ง: ${grand.sheerTrack}\n`;
            text += `จำนวนจุด: ${grand.setCountSets} จุดผ้าม่าน + ${grand.setCountDeco} จุดอื่นๆ\n`;
        }

        return text;
    }

    // --- EVENT LISTENERS ---
    function initEventListeners() {
        document.addEventListener('click', (e) => {
            const dropdowns = document.querySelectorAll('.menu-dropdown.show');
            const isMenuBtn = e.target.closest('.dropdown-wrapper');
            if (isMenuBtn) {
                dropdowns.forEach(d => {
                    if (d !== isMenuBtn.querySelector('.menu-dropdown')) {
                        d.classList.remove('show');
                    }
                });
            } else {
                dropdowns.forEach(d => d.classList.remove('show'));
            }
        });

        document.addEventListener('change', (e) => {
            const name = e.target.name;
            if (name === 'fabric_variant') {
                toggleSetFabricUI(e.target.closest(SELECTORS.set));
            }
            debouncedRecalc();
        });

        document.addEventListener('input', (e) => {
            const name = e.target.name;
            if (name === 'room_name' || name === 'deco_type' || name === 'width_m' || name === 'height_m' || name === 'deco_width_m' || name === 'deco_height_m' || name === 'deco_price_sqyd' || name === 'wallpaper_height_m' || name === 'wallpaper_price_roll' || name === 'wall_width_m') {
                 debouncedRecalc();
            }
        });

        document.addEventListener('click', handleAction);
    }
    
    function handleAction(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const action = btn.dataset.act;
        const itemEl = btn.closest('.room-card, .item-card, .modal-content');
        const actions = {
            'add-room': () => addRoom(),
            'add-set': () => addSet(itemEl),
            'add-deco': () => addDeco(itemEl),
            'add-wallpaper': () => addWallpaper(itemEl),
            'del-room': async () => { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; itemEl.remove(); renumber(); recalcAll(); saveData(); showToast('ลบห้องสำเร็จ', 'success'); },
            'del-set': async () => { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการนี้?')) return; itemEl.remove(); renumber(); recalcAll(); saveData(); showToast('ลบรายการสำเร็จ', 'success'); },
            'del-deco': async () => { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการนี้?')) return; itemEl.remove(); renumber(); recalcAll(); saveData(); showToast('ลบรายการสำเร็จ', 'success'); },
            'del-wallpaper': async () => { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการนี้?')) return; itemEl.remove(); renumber(); recalcAll(); saveData(); showToast('ลบรายการสำเร็จ', 'success'); },
            'clear-all': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'ยืนยันการล้างข้อมูลทั้งหมด? ข้อมูลที่บันทึกไว้จะถูกลบด้วย')) return; roomsEl.innerHTML = ''; localStorage.removeItem(STORAGE_KEY); document.querySelector(SELECTORS.customerInfoForm).reset(); recalcAll(); showToast('ล้างข้อมูลทั้งหมดสำเร็จ', 'success'); },
            'submit': () => {
                if (isLocked) { e.preventDefault(); showToast('ฟอร์มถูกล็อคอยู่', 'warning'); return; }
                const data = collectData();
                document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(data);
            },
            'copy-json': () => copyDataToClipboard(collectData(), 'json'),
            'copy-text': async () => {
                const options = await showCopyOptionsModal();
                if (options) {
                    document.querySelector(SELECTORS.copyCustomerInfo).checked = options.customer;
                    document.querySelector(SELECTORS.copyRoomDetails).checked = options.details;
                    document.querySelector(SELECTORS.copySummary).checked = options.summary;
                    copyDataToClipboard(collectData(), 'text');
                }
            },
            'lock': () => {
                isLocked = !isLocked;
                document.querySelectorAll('input, select, textarea, button:not([id="lockBtn"])').forEach(el => {
                    el.disabled = isLocked;
                });
                const lockIcon = btn.querySelector('.material-symbols-outlined');
                const lockText = btn.querySelector('.lock-text');
                if (isLocked) {
                    lockIcon.textContent = 'lock';
                    lockText.textContent = 'ปลดล็อคฟอร์ม';
                    showToast('ฟอร์มถูกล็อคแล้ว', 'warning');
                } else {
                    lockIcon.textContent = 'lock_open';
                    lockText.textContent = 'ล็อคฟอร์ม';
                    showToast('ฟอร์มถูกปลดล็อคแล้ว', 'success');
                }
            },
            'import': () => showModal(SELECTORS.importModal, async () => {
                try {
                    const json = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
                    roomsEl.innerHTML = '';
                    roomCount = 0;
                    if (json.rooms) json.rooms.forEach(room => addRoom(room));
                    if (json.customer_info) {
                         document.querySelector('#customer_name').value = json.customer_info.customer_name || '';
                         document.querySelector('#customer_phone').value = json.customer_info.customer_phone || '';
                         document.querySelector('#customer_address').value = json.customer_info.customer_address || '';
                    }
                    saveData();
                    showToast('นำเข้าข้อมูลสำเร็จ', 'success');
                    return true;
                } catch (e) {
                    showToast('รูปแบบ JSON ไม่ถูกต้อง', 'error');
                    return false;
                }
            }),
            'export': () => {
                const data = JSON.stringify(collectData(), null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `marnthara_data_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('ส่งออกข้อมูลสำเร็จ', 'success');
            },
            'clear-set': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; itemEl.querySelectorAll('input, select').forEach(el => { el.value = el.querySelector('option[selected]')?.value ?? ''; }); toggleSetFabricUI(itemEl); debouncedRecalc(); },
            'clear-deco': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; itemEl.querySelectorAll('input, select').forEach(el => { el.value = ''; }); debouncedRecalc(); },
            'clear-wallpaper': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; itemEl.querySelectorAll('input').forEach(el => el.value = ''); itemEl.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(itemEl.querySelector('[data-act="add-wall"]')); debouncedRecalc(); },
            'del-wall': () => { if(isLocked) return; btn.closest('.wall-input-row').remove(); debouncedRecalc(); },
            'add-wall': () => addWall(btn),
            'toggle-suspend': () => toggleSuspend(btn),
            'toggle-suspend-room': () => toggleSuspend(btn),
            'menu-room': () => btn.nextElementSibling.classList.toggle('show'),
            'menu-item': () => btn.nextElementSibling.classList.toggle('show')
        };
        if (actions[action]) actions[action]();
    }
    
    // --- Initial Setup ---
    document.addEventListener('DOMContentLoaded', () => {
        initEventListeners();
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            loadData();
        } else {
            addRoom();
        }
        document.querySelector('#appVersion').textContent = APP_VERSION;
    });
})();