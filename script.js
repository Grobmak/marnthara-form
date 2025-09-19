(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/5.2.0-theme-and-fix";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
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
            const stripsPerRoll = (height > 2.5) ? Math.floor(10 / height) : 3;
            if (stripsPerRoll <= 0) return Infinity; 
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        }
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', clearAllBtn: '#clearAllBtn', copyJsonBtn: '#copyJsonBtn',
        lockBtn: '#lockBtn', lockText: '#lockText',
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
        submitBtn: '#submitBtn',
        fabContainer: '#fabContainer', fabMainBtn: '#fabMainBtn', fabActions: '.fab-actions'
    };

    // --- STATE ---
    let roomCount = 0;
    let isLocked = false;
    let activeRoomEl = null;

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
        item.classList.add('item-removing');
        item.addEventListener('animationend', () => {
            item.remove();
            renumber();
            recalcAll();
            saveData();
        }, { once: true });
    }

    // Forces the browser to recalculate the FAB's position after a scroll/reflow.
    function forceFabRepaint() {
        const fab = document.querySelector(SELECTORS.fabContainer);
        if (!fab) return;
        fab.style.visibility = 'hidden';
        void fab.offsetHeight;
        fab.style.visibility = 'visible';
    }


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

    // --- CORE DOM MANIPULATION & LOGIC ---

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, roomIdx) => {
            const roomNameInput = room.querySelector(SELECTORS.roomNameInput);
            if (!roomNameInput.value) {
                roomNameInput.placeholder = `ห้อง ${String(roomIdx + 1).padStart(2, '0')}`;
            }

            room.querySelectorAll(SELECTORS.set).forEach((set, setIdx) => {
                const title = set.querySelector('[data-item-title]');
                title.textContent = `${roomIdx + 1}.${setIdx + 1}`;
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach((deco, decoIdx) => {
                const title = deco.querySelector('[data-item-title]');
                title.textContent = `${roomIdx + 1}.${decoIdx + 1}`;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper, wallpaperIdx) => {
                const title = wallpaper.querySelector('[data-item-title]');
                title.textContent = `${roomIdx + 1}.${wallpaperIdx + 1}`;
            });
        });
    }

    function toggleSetFabricUI(setEl) {
        const fabricVariant = setEl.querySelector('select[name="fabric_variant"]').value;
        const sheerWrap = setEl.querySelector(SELECTORS.sheerWrap);
        if (fabricVariant === 'ทึบ&โปร่ง') {
            sheerWrap.style.display = 'flex';
        } else {
            sheerWrap.style.display = 'none';
        }
    }

    function calcSet(setEl) {
        const width = clamp01(setEl.querySelector('input[name="width_m"]').value);
        const height = clamp01(setEl.querySelector('input[name="height_m"]').value);
        const style = setEl.querySelector('select[name="set_style"]').value;
        const fabricType = setEl.querySelector('select[name="fabric_variant"]').value;
        const pricePerMeter = toNum(setEl.querySelector('select[name="set_price_per_m"]').value);
        const sheerPricePerMeter = toNum(setEl.querySelector('select[name="sheer_price_per_m"]').value);
        const notes = setEl.querySelector('input[name="notes"]').value;

        if (width <= 0 || height <= 0 || !pricePerMeter) {
            setEl.querySelector('[data-set-summary]').textContent = 'กรอกข้อมูลเพื่อคำนวณราคา';
            return { total: 0, opaqueYardage: 0, sheerYardage: 0, opaqueTrack: 0, sheerTrack: 0 };
        }

        const yardageOpaque = CALC.fabricYardage(style, width);
        const trackOpaque = width + 0.1;
        const costOpaque = (yardageOpaque * pricePerMeter) + (trackOpaque * 250); // Track cost 250/m

        let total = costOpaque;
        let yardageSheer = 0;
        let trackSheer = 0;

        if (fabricType === 'ทึบ&โปร่ง') {
            yardageSheer = CALC.fabricYardage(style, width);
            trackSheer = width + 0.1;
            total += (yardageSheer * sheerPricePerMeter) + (trackSheer * 250);
        }

        const heightSurcharge = heightPlus(height);
        if (heightSurcharge > 0) {
            total += (width * heightSurcharge);
        }

        const summary = setEl.querySelector('[data-set-summary]');
        summary.innerHTML = `ผ้าทึบ: <b>${fmt(yardageOpaque, 2)}</b> หลา (@${fmt(pricePerMeter, 0, true)} บาท/ม.) | รวม: <b>${fmt(costOpaque, 0, true)}</b> บาท`;
        if (fabricType === 'ทึบ&โปร่ง') {
            summary.innerHTML += `<br>ผ้าโปร่ง: <b>${fmt(yardageSheer, 2)}</b> หลา (@${fmt(sheerPricePerMeter, 0, true)} บาท/ม.) | รวม: <b>${fmt(yardageSheer * sheerPricePerMeter + trackSheer * 250, 0, true)}</b> บาท`;
        }
        
        return { 
            total: total, 
            opaqueYardage: yardageOpaque, 
            sheerYardage: yardageSheer,
            opaqueTrack: trackOpaque,
            sheerTrack: trackSheer
        };
    }

    function calcDeco(decoEl) {
        const width = clamp01(decoEl.querySelector('input[name="deco_width_m"]').value);
        const height = clamp01(decoEl.querySelector('input[name="deco_height_m"]').value);
        const priceSqYd = toNum(decoEl.querySelector('input[name="deco_price_sqyd"]').value);
        const type = decoEl.querySelector('select[name="deco_type"]').value;

        const sqYd = (width * height) * SQM_TO_SQYD;
        const total = sqYd * priceSqYd;
        
        decoEl.querySelector('[data-deco-summary]').innerHTML = `พื้นที่: <b>${fmt(sqYd, 2)}</b> ตร.หลา | รวม: <b>${fmt(total, 0, true)}</b> บาท`;
        
        const typeDisplay = decoEl.querySelector('.deco-type-display');
        typeDisplay.textContent = type ? `(${type})` : '';

        return { total: total, sqYd: sqYd };
    }

    function calcWallpaper(wallpaperEl) {
        const height = clamp01(wallpaperEl.querySelector('input[name="wallpaper_height_m"]').value);
        const pricePerRoll = toNum(wallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value);
        const installCost = toNum(wallpaperEl.querySelector('input[name="wallpaper_install_cost"]').value);
        
        const walls = wallpaperEl.querySelectorAll('input[name="wall_width_m"]');
        const totalWidth = Array.from(walls).reduce((sum, input) => sum + clamp01(input.value), 0);
        
        if (height <= 0 || totalWidth <= 0) {
            wallpaperEl.querySelector('[data-wallpaper-summary]').textContent = 'กรอกข้อมูลเพื่อคำนวณราคา';
            return { total: 0, rolls: 0 };
        }
        
        const rolls = CALC.wallpaperRolls(totalWidth, height);
        const total = (rolls * pricePerRoll) + (rolls * installCost);
        
        wallpaperEl.querySelector('[data-wallpaper-summary]').innerHTML = `จำนวนม้วน: <b>${fmt(rolls, 0)}</b> ม้วน | รวม: <b>${fmt(total, 0, true)}</b> บาท`;
        
        return { total: total, rolls: rolls };
    }

    function recalcAll() {
        let grandTotal = 0;
        let totalItems = 0;
        const materialSummary = {};
        const rooms = document.querySelectorAll(SELECTORS.room);

        rooms.forEach(room => {
            const isSuspended = room.classList.contains('is-suspended');
            if (isSuspended) return;

            const roomBriefs = [];
            
            // Sets
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                const isItemSuspended = set.classList.contains('is-suspended');
                if (isItemSuspended) return;
                const result = calcSet(set);
                grandTotal += result.total;
                totalItems++;
                roomBriefs.push(`ม่าน ${set.querySelector('[data-item-title]').textContent}`);
                
                materialSummary.opaque = (materialSummary.opaque || 0) + result.opaqueYardage;
                materialSummary.sheer = (materialSummary.sheer || 0) + result.sheerYardage;
                materialSummary.opaqueTrack = (materialSummary.opaqueTrack || 0) + result.opaqueTrack;
                materialSummary.sheerTrack = (materialSummary.sheerTrack || 0) + result.sheerTrack;
            });

            // Decorations
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                const isItemSuspended = deco.classList.contains('is-suspended');
                if (isItemSuspended) return;
                const result = calcDeco(deco);
                grandTotal += result.total;
                totalItems++;
                roomBriefs.push(`ตกแต่ง ${deco.querySelector('[data-item-title]').textContent}`);
                
                const type = deco.querySelector('select[name="deco_type"]').value || 'อื่นๆ';
                materialSummary.deco = materialSummary.deco || {};
                materialSummary.deco[type] = (materialSummary.deco[type] || 0) + result.sqYd;
            });
            
            // Wallpapers
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const isItemSuspended = wallpaper.classList.contains('is-suspended');
                if (isItemSuspended) return;
                const result = calcWallpaper(wallpaper);
                grandTotal += result.total;
                totalItems++;
                roomBriefs.push(`วอลล์ฯ ${wallpaper.querySelector('[data-item-title]').textContent}`);

                materialSummary.wallpaper = (materialSummary.wallpaper || 0) + result.rolls;
            });

            room.querySelector('[data-room-brief]').textContent = roomBriefs.join(', ');
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = totalItems;
        
        updateDetailedSummary(materialSummary);
    }
    
    function updateDetailedSummary(summary) {
        const container = document.querySelector(SELECTORS.detailedSummaryContainer);
        if (!container) return;
        let html = '';

        if (summary.opaque || summary.sheer) {
            html += '<h4>ผ้าม่าน</h4>';
            html += '<ul>';
            if (summary.opaque) html += `<li>ผ้าทึบ: <b>${fmt(summary.opaque, 2)}</b> หลา</li>`;
            if (summary.sheer) html += `<li>ผ้าโปร่ง: <b>${fmt(summary.sheer, 2)}</b> หลา</li>`;
            if (summary.opaqueTrack) html += `<li>รางผ้าทึบ: <b>${fmt(summary.opaqueTrack, 2)}</b> เมตร</li>`;
            if (summary.sheerTrack) html += `<li>รางผ้าโปร่ง: <b>${fmt(summary.sheerTrack, 2)}</b> เมตร</li>`;
            html += '</ul>';
        }
        
        if (summary.deco && Object.keys(summary.deco).length > 0) {
            html += '<h4>ตกแต่ง</h4>';
            html += '<ul>';
            for (const type in summary.deco) {
                 html += `<li>${type}: <b>${fmt(summary.deco[type], 2)}</b> ตร.หลา</li>`;
            }
            html += '</ul>';
        }
        
        if (summary.wallpaper) {
            html += '<h4>วอลเปเปอร์</h4>';
            html += `<ul><li>รวม: <b>${fmt(summary.wallpaper, 0)}</b> ม้วน</li></ul>`;
        }

        container.innerHTML = html || '<p class="text-secondary">ไม่มีรายการในใบเสนอราคา</p>';
    }

    function buildPayload() {
        const rooms = [];
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const room = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value || roomEl.querySelector(SELECTORS.roomNameInput).placeholder,
                is_suspended: roomEl.classList.contains('is-suspended'),
                sets: [], decorations: [], wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const data = {
                    item_name: setEl.querySelector('[data-item-title]').textContent,
                    is_suspended: setEl.classList.contains('is-suspended'),
                };
                setEl.querySelectorAll('input, select').forEach(input => {
                    data[input.name] = toNum(input.value) || input.value;
                });
                room.sets.push(data);
            });
            
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const data = {
                    item_name: decoEl.querySelector('[data-item-title]').textContent,
                    is_suspended: decoEl.classList.contains('is-suspended'),
                };
                decoEl.querySelectorAll('input, select').forEach(input => {
                    data[input.name] = toNum(input.value) || input.value;
                });
                room.decorations.push(data);
            });
            
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const data = {
                    item_name: wallpaperEl.querySelector('[data-item-title]').textContent,
                    is_suspended: wallpaperEl.classList.contains('is-suspended'),
                    walls: []
                };
                wallpaperEl.querySelectorAll('input:not([name="wall_width_m"]), select').forEach(input => {
                    data[input.name] = toNum(input.value) || input.value;
                });
                wallpaperEl.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                    data.walls.push(toNum(input.value));
                });
                room.wallpapers.push(data);
            });

            rooms.push(room);
        });

        const formData = new FormData(document.querySelector(SELECTORS.orderForm));
        const customerInfo = Object.fromEntries(formData.entries());
        delete customerInfo.payload;

        return {
            app_version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer_info: customerInfo,
            rooms: rooms
        };
    }

    function saveData() {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload, null, 2);
    }
    
    function loadPayload(payload) {
        if (!payload || !payload.rooms) {
            showToast('ไฟล์ข้อมูลไม่ถูกต้อง', 'error');
            return;
        }

        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        roomsContainer.innerHTML = '';
        roomCount = 0;
        document.querySelector(SELECTORS.orderForm).reset();
        
        // Fill customer info
        if (payload.customer_info) {
            for (const key in payload.customer_info) {
                const input = document.getElementById(key);
                if (input) input.value = payload.customer_info[key];
            }
        }

        // Add rooms and their items
        payload.rooms.forEach(roomData => addRoom(roomData));
        
        recalcAll();
        saveData();
        showToast('นำเข้าข้อมูลเรียบร้อย', 'success');
    }

    // --- DOM MANIPULATION ---
    function setActiveRoom(roomElement) {
        if (activeRoomEl === roomElement) return;
        if (activeRoomEl) activeRoomEl.classList.remove('is-active-room');
        activeRoomEl = roomElement;
        if (activeRoomEl) activeRoomEl.classList.add('is-active-room');
    }
    
    function suspendItem(itemEl, suspend, save = true) {
        if (isLocked) return;
        const toggleIcon = itemEl.querySelector('[data-act="toggle-suspend"] i');
        if (suspend) {
            itemEl.classList.add('is-suspended');
            toggleIcon.classList.replace('ph-pause-circle', 'ph-play-circle');
            toggleIcon.closest('button').title = 'ใช้งาน';
        } else {
            itemEl.classList.remove('is-suspended');
            toggleIcon.classList.replace('ph-play-circle', 'ph-pause-circle');
            toggleIcon.closest('button').title = 'ระงับ';
        }
        if (save) {
            recalcAll();
            saveData();
        }
    }

    function suspendRoom(roomEl, suspend, save = true) {
        if (isLocked) return;
        const toggleIcon = roomEl.querySelector('[data-act="toggle-suspend-room"] i');
        const textSpan = roomEl.querySelector('[data-act="toggle-suspend-room"] span');
        if (suspend) {
            roomEl.classList.add('is-suspended');
            toggleIcon.classList.replace('ph-pause-circle', 'ph-play-circle');
            textSpan.textContent = 'ใช้งานห้อง';
        } else {
            roomEl.classList.remove('is-suspended');
            toggleIcon.classList.replace('ph-play-circle', 'ph-pause-circle');
            textSpan.textContent = 'ระงับห้อง';
        }
        if (save) {
            recalcAll();
            saveData();
        }
    }

    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        const room = frag.querySelector(SELECTORS.room);
        room.dataset.index = roomCount;
        document.querySelector(SELECTORS.roomsContainer).appendChild(frag);
        const created = document.querySelector(`${SELECTORS.room}:last-of-type`);
        setActiveRoom(created);
        if (prefill) {
            created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
            if (prefill.is_suspended) setTimeout(() => suspendRoom(created, true, false), 0);
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }
        renumber(); recalcAll(); saveData();
        if (!prefill) {
            showToast('เพิ่มห้องใหม่แล้ว', 'success');
            animateAndScroll(created);
        }
    }
    
    function populatePriceOptions(selectEl, prices) {
        if (!selectEl) return;
        selectEl.innerHTML = `<option value="" hidden>เลือกราคา</option>`;
        prices.forEach(p => {
            const option = new Option(p.toLocaleString("th-TH"), p);
            selectEl.add(option);
        });
    }

    function addSet(roomEl, prefill) {
        if (isLocked || !roomEl) return;
        const setsWrap = roomEl.querySelector(SELECTORS.setsContainer);
        const frag = document.querySelector(SELECTORS.setTpl).content.cloneNode(true);
        setsWrap.appendChild(frag);
        const created = setsWrap.querySelector(`${SELECTORS.set}:last-of-type`);
        populatePriceOptions(created.querySelector('select[name="set_price_per_m"]'), PRICING.fabric);
        populatePriceOptions(created.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);
        if (prefill) {
            for (const key in prefill) {
                const input = created.querySelector(`[name="${key}"]`);
                if (input) input.value = prefill[key];
            }
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
             animateAndScroll(created);
        }
        toggleSetFabricUI(created); renumber(); recalcAll(); saveData();
    }
    
    function addDeco(roomEl, prefill) {
        if (isLocked || !roomEl) return;
        const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
        decoWrap.appendChild(frag);
        const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);
        if (prefill) {
            for (const key in prefill) {
                const input = created.querySelector(`[name="${key}"]`);
                if (input) input.value = prefill[key];
            }
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
            animateAndScroll(created);
        }
        renumber(); recalcAll(); saveData();
    }

    function addWallpaper(roomEl, prefill) {
        if (isLocked || !roomEl) return;
        const wallpaperWrap = roomEl.querySelector(SELECTORS.wallpapersContainer);
        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        wallpaperWrap.appendChild(frag);
        const created = wallpaperWrap.querySelector(`${SELECTORS.wallpaperItem}:last-of-type`);
        if (prefill) {
            for (const key in prefill) {
                const input = created.querySelector(`[name="${key}"]`);
                if (input) input.value = prefill[key];
            }
            (prefill.walls || []).forEach(w => addWall(created.querySelector('[data-act="add-wall"]'), w));
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
            addWall(created.querySelector('[data-act="add-wall"]'));
            animateAndScroll(created);
        }
        renumber(); recalcAll(); saveData();
    }

    function addWall(btn, prefillWidth) {
        if (isLocked) return;
        const wallsContainer = btn.closest(SELECTORS.wallpaperItem)?.querySelector(SELECTORS.wallsContainer);
        const frag = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
        if (prefillWidth) frag.querySelector('input[name="wall_width_m"]').value = prefillWidth;
        wallsContainer.appendChild(frag);
        const newWallInputRow = wallsContainer.querySelector('.wall-input-row:last-of-type');
        if (newWallInputRow) {
            animateAndScroll(newWallInputRow);
            newWallInputRow.querySelector('input').focus();
        }
    }

    function performAction(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        
        e.preventDefault();
        const action = btn.dataset.act;
        const roomEl = btn.closest(SELECTORS.room);
        const itemEl = btn.closest('.item-card');

        switch(action) {
            case 'add-room': addRoom(); break;
            case 'add-set': addSet(roomEl); break;
            case 'add-deco': addDeco(roomEl); break;
            case 'add-wallpaper': addWallpaper(roomEl); break;
            case 'add-wall': addWall(btn); break;
            case 'toggle-suspend-room': suspendRoom(roomEl, !roomEl.classList.contains('is-suspended')); break;
            case 'toggle-suspend': suspendItem(itemEl, !itemEl.classList.contains('is-suspended')); break;
            case 'clear-room':
                if (isLocked) return;
                if (showConfirmation('ล้างข้อมูลในห้องนี้?', 'ข้อมูลรายการทั้งหมดในห้องนี้จะถูกลบ')) {
                    const containers = [
                        roomEl.querySelector(SELECTORS.setsContainer),
                        roomEl.querySelector(SELECTORS.decorationsContainer),
                        roomEl.querySelector(SELECTORS.wallpapersContainer)
                    ];
                    containers.forEach(c => c.innerHTML = '');
                    recalcAll(); saveData();
                    showToast('ล้างข้อมูลห้องแล้ว', 'default');
                }
                break;
            case 'del-room':
                if (isLocked) return;
                if (showConfirmation('ลบห้องนี้?', 'การกระทำนี้ไม่สามารถย้อนกลับได้')) {
                    animateAndRemove(roomEl);
                    showToast('ลบห้องแล้ว', 'danger');
                }
                break;
            case 'clear-set':
            case 'clear-deco':
            case 'clear-wallpaper':
                if (isLocked) return;
                const formElements = itemEl.querySelectorAll('input, select, textarea');
                formElements.forEach(el => {
                    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
                    else el.value = el.defaultValue || '';
                    if (el.name === 'wallpaper_install_cost') el.value = 300;
                });
                recalcAll(); saveData();
                showToast('ล้างข้อมูลรายการแล้ว', 'default');
                break;
            case 'del-set':
            case 'del-deco':
            case 'del-wallpaper':
                if (isLocked) return;
                if (showConfirmation('ลบรายการนี้?', 'การกระทำนี้ไม่สามารถย้อนกลับได้')) {
                    animateAndRemove(itemEl);
                    showToast('ลบรายการแล้ว', 'danger');
                }
                break;
            case 'del-wall':
                if (isLocked) return;
                btn.closest('.wall-input-row').remove();
                recalcAll(); saveData();
                break;
        }

        // BUG FIX: If the action was one that adds content, force the FAB to repaint after a delay.
        if (['add-room', 'add-set', 'add-deco', 'add-wallpaper'].includes(action)) {
            setTimeout(forceFabRepaint, 400);
        }
    }

    // --- FAB (Floating Action Button) LOGIC ---
    const fabContainer = document.querySelector(SELECTORS.fabContainer);
    const fabActionsContainer = fabContainer.querySelector(SELECTORS.fabActions);

    function createFabAction(config) {
        const button = document.createElement('button');
        button.className = `btn fab-action-item ${config.className}`;
        button.dataset.act = config.action;
        button.title = config.label;
        button.innerHTML = `<i class="ph-bold ${config.icon}"></i><span>${config.label}</span>`;
        return button;
    }

    function updateFabActions() {
        fabActionsContainer.innerHTML = '';
        const actions = [];
        if (activeRoomEl) {
            actions.push({ label: 'เพิ่มวอลเปเปอร์', icon: 'ph-image', className: 'btn-wallpaper', action: 'add-wallpaper' });
            actions.push({ label: 'เพิ่มตกแต่ง', icon: 'ph-paint-brush', className: 'btn-deco', action: 'add-deco' });
            actions.push({ label: 'เพิ่มผ้าม่าน', icon: 'ph-blinds', className: 'btn-curtain', action: 'add-set' });
        }
        actions.push({ label: 'เพิ่มห้อง', icon: 'ph-house', className: 'btn-add-room', action: 'add-room' });
        actions.forEach(config => fabActionsContainer.appendChild(createFabAction(config)));
    }
    
    function toggleFabMenu(forceState) {
        const isActive = fabContainer.classList.contains('active');
        if (forceState === false || isActive) {
            fabContainer.classList.remove('active');
        } else {
            updateFabActions();
            fabContainer.classList.add('active');
        }
    }

    function updateLockState() {
        isLocked = document.getElementById('lockBtn').classList.contains('is-locked');
        document.querySelectorAll('input, select, textarea, .btn-icon, .btn-secondary').forEach(el => {
            if (el.id !== 'lockBtn') {
                el.disabled = isLocked;
            }
        });
        const lockIcon = document.querySelector('.lock-icon');
        const lockText = document.getElementById('lockText');
        if (isLocked) {
            lockIcon.classList.replace('ph-lock-key-open', 'ph-lock-key');
            lockText.textContent = 'ปลดล็อก';
        } else {
            lockIcon.classList.replace('ph-lock-key', 'ph-lock-key-open');
            lockText.textContent = 'ล็อก';
        }
    }

    function lockToggle() {
        const lockBtn = document.getElementById('lockBtn');
        lockBtn.classList.toggle('is-locked');
        updateLockState();
        showToast(isLocked ? 'ฟอร์มถูกล็อก' : 'ฟอร์มถูกปลดล็อก', isLocked ? 'warning' : 'success');
    }

    // --- INITIALIZATION ---
    function init() {
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); }, 150);

        // Main event listeners
        orderForm.addEventListener("input", debouncedRecalcAndSave);
        orderForm.addEventListener("change", e => {
            if (e.target.matches('select[name="fabric_variant"]')) {
                toggleSetFabricUI(e.target.closest(SELECTORS.set));
            }
            debouncedRecalcAndSave();
        });
        document.body.addEventListener("click", e => {
            const btn = e.target.closest('[data-act]');
            if (!btn) {
                if (!e.target.closest('.menu-container')) document.querySelector(SELECTORS.menuDropdown).classList.remove('show');
                if (!e.target.closest(SELECTORS.fabContainer)) toggleFabMenu(false);
                return;
            }

            if (btn.closest(SELECTORS.fabActions)) {
                toggleFabMenu(false);
            }
            performAction(e);
        });
        document.querySelector(SELECTORS.fabMainBtn).addEventListener('click', e => {
            e.stopPropagation();
            toggleFabMenu();
        });
        document.querySelector(SELECTORS.menuBtn).addEventListener('click', e => {
            e.stopPropagation();
            document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
        });
        window.addEventListener('click', e => {
            const clickedRoom = e.target.closest(SELECTORS.room);
            if (clickedRoom) setActiveRoom(clickedRoom);
        });
        document.getElementById('lockBtn').addEventListener('click', lockToggle);

        // Menu actions
        document.getElementById('clearAllBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            if (isLocked) return;
            const confirmed = await showConfirmation('ล้างข้อมูลทั้งหมด?', 'การกระทำนี้จะลบทุกอย่างในฟอร์มและไม่สามารถย้อนกลับได้');
            if (confirmed) {
                document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
                document.querySelector(SELECTORS.orderForm).reset();
                localStorage.removeItem(STORAGE_KEY);
                roomCount = 0;
                addRoom();
                recalcAll();
                showToast('ล้างข้อมูลทั้งหมดแล้ว', 'danger');
            }
        });
        document.getElementById('exportBtn').addEventListener('click', (e) => {
            e.preventDefault();
            const dataStr = JSON.stringify(buildPayload(), null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `marnthara_quotation_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('ส่งออกข้อมูลแล้ว', 'success');
        });
        document.getElementById('importBtn').addEventListener('click', (e) => {
            e.preventDefault();
            showModal(SELECTORS.importModal);
        });
        document.getElementById('importConfirm').addEventListener('click', () => {
            try {
                const data = JSON.parse(document.getElementById('importJsonArea').value);
                loadPayload(data);
            } catch (error) {
                showToast('ข้อมูล JSON ไม่ถูกต้อง', 'error');
                console.error('Import failed:', error);
            }
        });
        document.getElementById('importCancel').addEventListener('click', () => showModal(SELECTORS.importModal));
        
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
        if (!activeRoomEl) setActiveRoom(document.querySelector(SELECTORS.room));
        updateLockState();
        recalcAll();
    }

    document.addEventListener('DOMContentLoaded', init);
})();