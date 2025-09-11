(function() {
    'use strict';
    const APP_VERSION = "input-ui/4.0.0-m3-liquidglass";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3;

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
        roomMenuBtn: '.room-menu-btn', setMenuBtn: '.set-menu-btn', decoMenuBtn: '.deco-menu-btn', wallpaperMenuBtn: '.wallpaper-menu-btn',
        roomMenuDropdown: '.room-menu-dropdown', setMenuDropdown: '.set-menu-dropdown', decoMenuDropdown: '.deco-menu-dropdown', wallpaperMenuDropdown: '.wallpaper-menu-dropdown',
    };

    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    orderForm.action = WEBHOOK_URL;
    
    let roomCount = 0;
    let isLocked = false;
    
    const toNum = v => {
        if (typeof v === 'string') v = v.replace(/,/g, '');
        return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0;
    };
    const clamp01 = v => Math.max(0, toNum(v));
    const fmt = (n, fixed = 2, asCurrency = false) => {
        if (!Number.isFinite(n)) return "0";
        const options = asCurrency 
            ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } 
            : { minimumFractionDigits: fixed, maximumFractionDigits: fixed };
        return n.toLocaleString("th-TH", options);
    };
    const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };

    function showToast(message, type = 'default') {
        const container = document.querySelector(SELECTORS.toastContainer);
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;

        if (type === 'success') toast.classList.add('toast-success');
        else if (type === 'warning') toast.classList.add('toast-warning');
        else if (type === 'error') toast.classList.add('toast-error');
        else { toast.style.backgroundColor = 'var(--card-bg)'; toast.style.color = 'var(--fg)'; }

        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }
    
    const showConfirmation = (title, body) => {
        return new Promise((resolve) => {
            const modalEl = document.querySelector(SELECTORS.modal);
            modalEl.querySelector(SELECTORS.modalTitle).textContent = title;
            modalEl.querySelector(SELECTORS.modalBody).textContent = body;
            modalEl.classList.add('visible');
            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                modalEl.querySelector(SELECTORS.modalConfirm).onclick = null;
                modalEl.querySelector(SELECTORS.modalCancel).onclick = null;
                resolve(result);
            };
            modalEl.querySelector(SELECTORS.modalConfirm).onclick = () => cleanup(true);
            modalEl.querySelector(SELECTORS.modalCancel).onclick = () => cleanup(false);
        });
    };

    function showCopyOptionsModal() {
        return new Promise((resolve) => {
            const modal = document.querySelector(SELECTORS.copyOptionsModal);
            modal.classList.add('visible');
            const confirmBtn = document.querySelector(SELECTORS.copyOptionsConfirm);
            const cancelBtn = document.querySelector(SELECTORS.copyOptionsCancel);
            
            const cleanup = (result) => {
                modal.classList.remove('visible');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(result);
            };
            confirmBtn.onclick = () => {
                const options = {
                    customer: document.querySelector(SELECTORS.copyCustomerInfo).checked,
                    details: document.querySelector(SELECTORS.copyRoomDetails).checked,
                    summary: document.querySelector(SELECTORS.copySummary).checked,
                };
                cleanup(options);
            };
            cancelBtn.onclick = () => cleanup(false);
        });
    }

    const showImportModal = () => {
        return new Promise((resolve) => {
            const modal = document.querySelector(SELECTORS.importModal);
            modal.classList.add('visible');
            const importBtn = document.querySelector(SELECTORS.importConfirm);
            const cancelBtn = document.querySelector(SELECTORS.importCancel);
            const textarea = document.querySelector(SELECTORS.importJsonArea);

            const cleanup = (result) => {
                modal.classList.remove('visible');
                importBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(result);
            };
            importBtn.onclick = () => cleanup(textarea.value);
            cancelBtn.onclick = () => cleanup(null);
        });
    }

    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                price_per_m_raw: toNum(roomEl.querySelector(SELECTORS.roomPricePerM).value),
                sheer_price_per_m_raw: toNum(roomEl.querySelector('select[name="room_sheer_price_per_m"]').value),
                style: roomEl.querySelector(SELECTORS.roomStyle).value,
                install_price_per_m: toNum(roomEl.querySelector('select[name="room_install_price_per_m"]').value),
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: []
            };
            
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    set_name: setEl.querySelector('input[name="set_name"]').value,
                    set_height_m: clamp01(setEl.querySelector('input[name="set_height_m"]').value),
                    set_width_m: clamp01(setEl.querySelector('input[name="set_width_m"]').value),
                    price_per_m: toNum(setEl.querySelector('select[name="set_price_per_m"]').value),
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="set_sheer_price_per_m"]').value),
                    style: setEl.querySelector('select[name="set_style"]').value,
                    install_price_per_m: toNum(setEl.querySelector('input[name="set_install_price_per_m"]').value),
                    sheer_width_m: clamp01(setEl.querySelector('input[name="sheer_width_m"]').value)
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    deco_name: decoEl.querySelector('input[name="deco_name"]').value,
                    deco_qty: clamp01(decoEl.querySelector('input[name="deco_qty"]').value),
                    deco_price: toNum(decoEl.querySelector('input[name="deco_price"]').value)
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                roomData.wallpapers.push({
                    wallpaper_name: wallpaperEl.querySelector('input[name="wallpaper_name"]').value,
                    wallpaper_height_m: clamp01(wallpaperEl.querySelector('input[name="wallpaper_height_m"]').value),
                    wallpaper_price_roll: toNum(wallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value),
                    walls: [...wallpaperEl.querySelectorAll('input[name="wall_width_m"]')]
                               .map(input => clamp01(input.value))
                });
            });

            payload.rooms.push(roomData);
        });
        return payload;
    };
    
    const calculateRoomTotal = debounce(roomEl => {
        const roomData = buildPayload().rooms.find(r => {
            const index = parseInt(roomEl.dataset.index);
            return r.room_name === roomEl.querySelector(SELECTORS.roomNameInput).value || index;
        });
        if (!roomData) return;
        
        let roomTotal = 0;
        let roomFabricYardage = 0;
        let roomSheerFabricYardage = 0;
        let roomOpaqueTrack = 0;
        let roomSheerTrack = 0;
        
        roomData.sets.forEach(set => {
            const height = set.set_height_m;
            const width = set.set_width_m;
            const style = set.style;
            const isSheer = set.sheer_width_m > 0;
            
            const fabricYardage = CALC.fabricYardage(style, width);
            const sheerYardage = isSheer ? CALC.fabricYardage(style, set.sheer_width_m) : 0;
            
            roomFabricYardage += fabricYardage;
            roomSheerFabricYardage += sheerYardage;
            roomOpaqueTrack += width;
            roomSheerTrack += isSheer ? set.sheer_width_m : 0;
            
            const basePrice = (set.price_per_m * width) + (set.sheer_price_per_m * set.sheer_width_m);
            const stylePrice = stylePlus(style) * (width + (isSheer ? set.sheer_width_m : 0));
            const heightPrice = heightPlus(height) * (width + (isSheer ? set.sheer_width_m : 0));
            const installPrice = set.install_price_per_m * (width + (isSheer ? set.sheer_width_m : 0));
            
            const setTotal = basePrice + stylePrice + heightPrice + installPrice;
            roomTotal += setTotal;
            
            const setEl = roomEl.querySelector(`[data-set] input[name="set_name"][value="${set.set_name}"]`).closest(SELECTORS.set);
            if (setEl) {
                setEl.querySelector('[data-set-summary]').innerHTML = 
                    `ราคา: <span class="price">${fmt(setTotal, 0)}</span> บ. • ใช้ผ้าทึบ: <span class="price">${fmt(fabricYardage, 2)}</span> หลา • ใช้ผ้าโปร่ง: <span class="price">${fmt(sheerYardage, 2)}</span> หลา`;
            }
        });
        
        roomData.decorations.forEach(deco => {
            const decoTotal = deco.deco_qty * deco.deco_price;
            roomTotal += decoTotal;
        });

        roomData.wallpapers.forEach(wallpaper => {
            const totalWidth = wallpaper.walls.reduce((sum, w) => sum + w, 0);
            const rollsNeeded = CALC.wallpaperRolls(totalWidth, wallpaper.wallpaper_height_m);
            const price = wallpaper.wallpaper_price_roll;
            const wallpaperTotal = rollsNeeded * price;
            const area = totalWidth * wallpaper.wallpaper_height_m;

            roomTotal += wallpaperTotal;

            const wallpaperEl = roomEl.querySelector(`[data-wallpaper-item] input[name="wallpaper_name"][value="${wallpaper.wallpaper_name}"]`).closest(SELECTORS.wallpaperItem);
            if (wallpaperEl) {
                wallpaperEl.querySelector('[data-wallpaper-summary]').innerHTML = 
                    `ราคา: <span class="price">${fmt(wallpaperTotal, 0)}</span> บ. • พื้นที่: <span class="price">${fmt(area, 2)}</span> ตร.ม. • ใช้ <span class="price">${fmt(rollsNeeded, 0)}</span> ม้วน`;
            }
        });
        
        const roomTotalEl = roomEl.querySelector(SELECTORS.roomTotal);
        if (roomTotalEl) roomTotalEl.textContent = fmt(roomTotal, 0);
        
        const roomTotalDisplayEl = roomEl.querySelector(SELECTORS.roomTotalDisplay);
        if (roomTotalDisplayEl) roomTotalDisplayEl.textContent = fmt(roomTotal, 0);
        
        updateGrandTotal();
    }, 200);

    const updateGrandTotal = debounce(() => {
        let grandTotal = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = buildPayload().rooms.find(r => {
                const index = parseInt(roomEl.dataset.index);
                return r.room_name === roomEl.querySelector(SELECTORS.roomNameInput).value || index;
            });
            if (roomData && roomEl.dataset.suspended !== 'true') {
                let roomTotal = 0;
                roomData.sets.forEach(set => {
                    const totalWidth = set.set_width_m + (set.sheer_width_m || 0);
                    const basePrice = (set.price_per_m * set.set_width_m) + (set.sheer_price_per_m * set.sheer_width_m);
                    const stylePrice = stylePlus(set.style) * totalWidth;
                    const heightPrice = heightPlus(set.set_height_m) * totalWidth;
                    const installPrice = set.install_price_per_m * totalWidth;
                    roomTotal += basePrice + stylePrice + heightPrice + installPrice;
                    
                    grandFabric += CALC.fabricYardage(set.style, set.set_width_m);
                    grandSheerFabric += set.sheer_width_m > 0 ? CALC.fabricYardage(set.style, set.sheer_width_m) : 0;
                    grandOpaqueTrack += set.set_width_m;
                    grandSheerTrack += set.sheer_width_m || 0;
                });
                roomData.decorations.forEach(deco => {
                    roomTotal += deco.deco_qty * deco.deco_price;
                });
                roomData.wallpapers.forEach(wallpaper => {
                    const totalWidth = wallpaper.walls.reduce((sum, w) => sum + w, 0);
                    const rollsNeeded = CALC.wallpaperRolls(totalWidth, wallpaper.wallpaper_height_m);
                    roomTotal += rollsNeeded * wallpaper.wallpaper_price_roll;
                });
                grandTotal += roomTotal;
            }
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandFabric, 2)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerFabric, 2)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack, 2)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack, 2)} ม.`;

        const totalSets = document.querySelectorAll(SELECTORS.set).length;
        const totalDeco = document.querySelectorAll(SELECTORS.decoItem).length;
        const totalWallpaper = document.querySelectorAll(SELECTORS.wallpaperItem).length;
        document.querySelector(SELECTORS.setCountSets).textContent = `${totalSets} ชุด`;
        document.querySelector(SELECTORS.setCountDeco).textContent = `${totalDeco} รายการ`;
        document.querySelector('#setCountWallpaper').textContent = `${totalWallpaper} รายการ`;
    }, 200);

    const populatePriceOptions = (selectEl, prices) => {
        selectEl.innerHTML = `<option value="0">ไม่รวม</option>${prices.map(p => `<option value="${p}">${p}</option>`).join('')}`;
    };

    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        const room = frag.querySelector(SELECTORS.room);
        room.dataset.index = roomCount;
        populatePriceOptions(room.querySelector(SELECTORS.roomPricePerM), PRICING.fabric);
        populatePriceOptions(room.querySelector('select[name="room_sheer_price_per_m"]'), PRICING.sheer);
        roomsEl.appendChild(frag);
        
        const created = roomsEl.querySelector(`${SELECTORS.room}:last-of-type`);
        if (prefill) {
            created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
            created.querySelector(SELECTORS.roomPricePerM).value = prefill.price_per_m_raw || "";
            created.querySelector('select[name="room_sheer_price_per_m"]').value = prefill.sheer_price_per_m_raw || "";
            created.querySelector('select[name="room_install_price_per_m"]').value = prefill.install_price_per_m || "0";
            created.querySelector(SELECTORS.roomStyle).value = prefill.style || "";
            if (prefill.is_suspended) {
                created.dataset.suspended = 'true';
                created.classList.add('is-suspended');
            }
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }

        const hasItems = created.querySelectorAll(SELECTORS.set).length > 0 ||
                         created.querySelectorAll(SELECTORS.decoItem).length > 0 ||
                         created.querySelectorAll(SELECTORS.wallpaperItem).length > 0;
        if (!hasItems) {
            created.querySelector('input[name="room_height_m"]').value = "";
            created.querySelector('input[name="room_width_m"]').value = "";
        }
        
        updateSummaryVisibility(created);
        created.querySelector(SELECTORS.roomNameInput).focus();
        updateGrandTotal();
    }
    
    function addSet(roomEl, prefill) {
        const setsContainer = roomEl.querySelector(SELECTORS.setsContainer);
        const frag = document.querySelector(SELECTORS.setTpl).content.cloneNode(true);
        setsContainer.appendChild(frag);

        const created = setsContainer.querySelector(`${SELECTORS.set}:last-of-type`);
        populatePriceOptions(created.querySelector('select[name="set_price_per_m"]'), PRICING.fabric);
        populatePriceOptions(created.querySelector('select[name="set_sheer_price_per_m"]'), PRICING.sheer);
        
        if (prefill) {
            created.querySelector('input[name="set_name"]').value = prefill.set_name || "";
            created.querySelector('input[name="set_height_m"]').value = prefill.set_height_m || "";
            created.querySelector('input[name="set_width_m"]').value = prefill.set_width_m || "";
            created.querySelector('select[name="set_price_per_m"]').value = prefill.price_per_m || "";
            created.querySelector('select[name="set_sheer_price_per_m"]').value = prefill.sheer_price_per_m || "";
            created.querySelector('select[name="set_style"]').value = prefill.style || "";
            created.querySelector('input[name="set_install_price_per_m"]').value = prefill.install_price_per_m || "";
            if (prefill.sheer_width_m > 0) {
                 created.querySelector('[data-sheer-wrap]').classList.remove('hidden');
                 created.querySelector('input[name="sheer_width_m"]').value = prefill.sheer_width_m || "";
            } else {
                 created.querySelector('[data-sheer-wrap]').classList.add('hidden');
            }
        }
        updateSummaryVisibility(roomEl);
        calculateRoomTotal(roomEl);
    }
    
    function addDeco(roomEl, prefill) {
        const decosContainer = roomEl.querySelector(SELECTORS.decorationsContainer);
        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
        decosContainer.appendChild(frag);
        const created = decosContainer.querySelector(`${SELECTORS.decoItem}:last-of-type`);
        if(prefill) {
            created.querySelector('input[name="deco_name"]').value = prefill.deco_name || "";
            created.querySelector('input[name="deco_qty"]').value = prefill.deco_qty || "1";
            created.querySelector('input[name="deco_price"]').value = fmt(prefill.deco_price, 0, true);
        }
        updateSummaryVisibility(roomEl);
        calculateRoomTotal(roomEl);
    }

    function addWallpaper(roomEl, prefill) {
        const wallpapersContainer = roomEl.querySelector(SELECTORS.wallpapersContainer);
        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        wallpapersContainer.appendChild(frag);
        const created = wallpapersContainer.querySelector(`${SELECTORS.wallpaperItem}:last-of-type`);
        if(prefill) {
            created.querySelector('input[name="wallpaper_name"]').value = prefill.wallpaper_name || "";
            created.querySelector('input[name="wallpaper_height_m"]').value = prefill.wallpaper_height_m || "";
            created.querySelector('input[name="wallpaper_price_roll"]').value = prefill.wallpaper_price_roll || "";
            if (prefill.walls && prefill.walls.length > 0) {
                const wallsContainer = created.querySelector(SELECTORS.wallsContainer);
                prefill.walls.forEach(w => addWall(wallsContainer, w));
            } else {
                addWall(created.querySelector(SELECTORS.wallsContainer));
            }
        } else {
            addWall(created.querySelector(SELECTORS.wallsContainer));
        }
        updateSummaryVisibility(roomEl);
        calculateRoomTotal(roomEl);
    }

    function addWall(wallsContainer, prefill) {
        const frag = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
        wallsContainer.appendChild(frag);
        const created = wallsContainer.querySelector('.wall-input-row:last-of-type');
        if (prefill) { created.querySelector('input[name="wall_width_m"]').value = prefill || ""; }
        const wallpaperEl = wallsContainer.closest(SELECTORS.wallpaperItem);
        calculateRoomTotal(wallpaperEl.closest(SELECTORS.room));
    }

    const removeParent = (e, selector) => {
        const el = e.target.closest(selector);
        if (el) el.remove();
    };

    const updateSummaryVisibility = (roomEl) => {
        const setsVisible = roomEl.querySelectorAll(SELECTORS.set).length > 0;
        const decosVisible = roomEl.querySelectorAll(SELECTORS.decoItem).length > 0;
        const wallpapersVisible = roomEl.querySelectorAll(SELECTORS.wallpaperItem).length > 0;
        
        const summary = roomEl.querySelector(SELECTORS.roomTotal);
        if (summary) summary.closest('.room-head-right').classList.toggle('hidden', !setsVisible && !decosVisible && !wallpapersVisible);
        
        const totalFooter = roomEl.querySelector('.total');
        if (totalFooter) totalFooter.classList.toggle('hidden', !setsVisible && !decosVisible && !wallpapersVisible);
    }

    const updateLockState = () => {
        isLocked = document.querySelector(SELECTORS.lockBtn).dataset.locked === 'true';
        document.querySelector('body').classList.toggle('locked', isLocked);
    };

    const saveData = debounce(() => {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        console.log("Data saved to local storage.");
    }, 5000);

    const loadData = () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name || "";
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || "";
                document.querySelector('input[name="customer_address"]').value = payload.customer_address || "";
                roomsEl.innerHTML = ""; roomCount = 0;
                if (payload.rooms && payload.rooms.length > 0) payload.rooms.forEach(addRoom);
                else addRoom();
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY); addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
        updateGrandTotal();
    };

    const createTextPayload = (options) => {
        const data = buildPayload();
        let text = "";

        if (options.customer) {
            text += `ลูกค้า: ${data.customer_name}\n`;
            text += `เบอร์โทร: ${data.customer_phone}\n`;
            text += `รายละเอียดเพิ่มเติม: ${data.customer_address}\n\n`;
        }

        if (options.details) {
            data.rooms.forEach((room) => {
                if (room.is_suspended) return;

                text += `ห้อง: ${room.room_name || 'ห้องที่ #'+(data.rooms.indexOf(room)+1)}\n`;
                room.sets.forEach((set) => {
                    const totalWidth = set.set_width_m + (set.sheer_width_m || 0);
                    const basePrice = (set.price_per_m * set.set_width_m) + (set.sheer_price_per_m * set.sheer_width_m);
                    const stylePrice = stylePlus(set.style) * totalWidth;
                    const heightPrice = heightPlus(set.set_height_m) * totalWidth;
                    const installPrice = set.install_price_per_m * totalWidth;
                    const total = basePrice + stylePrice + heightPrice + installPrice;

                    text += `  - ${set.set_name || 'ชุด'}: กว้าง ${fmt(set.set_width_m, 2)} ม. x สูง ${fmt(set.set_height_m, 2)} ม. (${set.style})\n`;
                    if (set.sheer_width_m > 0) {
                        text += `    (ผ้าโปร่ง กว้าง ${fmt(set.sheer_width_m, 2)} ม.)\n`;
                    }
                    text += `    ราคา: ${fmt(total, 0)} บ. (ผ้าทึบ ${fmt(set.price_per_m, 0)} บ./ม., ผ้าโปร่ง ${fmt(set.sheer_price_per_m, 0)} บ./ม., ค่าติดตั้ง ${fmt(set.install_price_per_m, 0)} บ./ม.)\n`;
                });
                room.decorations.forEach((deco) => {
                    text += `  - ของตกแต่ง: ${deco.deco_name} x ${deco.deco_qty} ราคา ${fmt(deco.deco_price, 0)} บ./ชิ้น\n`;
                });
                room.wallpapers.forEach((wallpaper) => {
                    const totalWidth = wallpaper.walls.reduce((sum, w) => sum + w, 0);
                    const rollsNeeded = CALC.wallpaperRolls(totalWidth, wallpaper.wallpaper_height_m);
                    const total = rollsNeeded * wallpaper.wallpaper_price_roll;
                    text += `  - วอลล์: ${wallpaper.wallpaper_name}\n`;
                    text += `    ความสูง ${fmt(wallpaper.wallpaper_height_m, 2)} ม. / ความกว้างรวม ${fmt(totalWidth, 2)} ม. (${fmt(rollsNeeded, 0)} ม้วน)\n`;
                    text += `    ราคา ${fmt(total, 0)} บ. (${fmt(wallpaper.wallpaper_price_roll, 0)} บ./ม้วน)\n`;
                });
                text += '\n';
            });
        }
        
        if (options.summary) {
            const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;
            const grandFabric = document.querySelector(SELECTORS.grandFabric).textContent;
            const grandSheerFabric = document.querySelector(SELECTORS.grandSheerFabric).textContent;
            const grandOpaqueTrack = document.querySelector(SELECTORS.grandOpaqueTrack).textContent;
            const grandSheerTrack = document.querySelector(SELECTORS.grandSheerTrack).textContent;
            
            text += 'สรุปวัสดุ:\n';
            text += `  - ผ้าทึบ: ${grandFabric}\n`;
            text += `  - ผ้าโปร่ง: ${grandSheerFabric}\n`;
            text += `  - รางทึบ: ${grandOpaqueTrack}\n`;
            text += `  - รางโปร่ง: ${grandSheerTrack}\n`;
            text += `รวมทั้งหมด: ${grandTotal} บ. (ยังไม่รวมค่าติดตั้ง)\n`;
        }
        
        return text;
    };

    document.addEventListener('input', (e) => {
        const roomEl = e.target.closest(SELECTORS.room);
        if (roomEl) {
            if (e.target.matches('input[name="room_name"]')) {
                const nameDisplay = roomEl.querySelector('[data-room-name-display]');
                nameDisplay.textContent = e.target.value || 'ห้องที่ #' + roomEl.dataset.index;
            } else if (e.target.matches('select[name="set_sheer_price_per_m"]')) {
                 const sheerWrap = e.target.closest(SELECTORS.set).querySelector(SELECTORS.sheerWrap);
                 if (e.target.value > 0) {
                     sheerWrap.classList.remove('hidden');
                 } else {
                     sheerWrap.classList.add('hidden');
                 }
            } else if (e.target.matches('input[name="sheer_width_m"]')) {
                 const sheerWidth = e.target.value;
                 if (sheerWidth > 0) {
                     const sheerSelect = e.target.closest(SELECTORS.set).querySelector('select[name="set_sheer_price_per_m"]');
                     if (sheerSelect.value === '0') {
                         sheerSelect.value = '1000';
                     }
                 }
            }
            calculateRoomTotal(roomEl);
        }
        saveData();
    });

    document.addEventListener('click', async (e) => {
        if (isLocked && !e.target.closest('#lockBtn')) {
            showToast("ฟอร์มถูกล็อคอยู่", "warning");
            return;
        }

        if (e.target.closest('#addRoomHeaderBtn')) {
            addRoom();
            const lastRoom = roomsEl.querySelector(`${SELECTORS.room}:last-of-type`);
            lastRoom.scrollIntoView({ behavior: 'smooth', block: 'end' });
            lastRoom.querySelector(SELECTORS.roomNameInput).focus();
            return;
        }

        const addSetBtn = e.target.closest('[data-act="add-set"]');
        if (addSetBtn) {
            const roomEl = addSetBtn.closest(SELECTORS.room);
            addSet(roomEl);
            roomEl.querySelector(`${SELECTORS.set}:last-of-type input`).focus();
            return;
        }

        const addDecoBtn = e.target.closest('[data-act="add-deco"]');
        if (addDecoBtn) {
            const roomEl = addDecoBtn.closest(SELECTORS.room);
            addDeco(roomEl);
            roomEl.querySelector(`${SELECTORS.decoItem}:last-of-type input`).focus();
            return;
        }

        const addWallpaperBtn = e.target.closest('[data-act="add-wallpaper"]');
        if (addWallpaperBtn) {
            const roomEl = addWallpaperBtn.closest(SELECTORS.room);
            addWallpaper(roomEl);
            roomEl.querySelector(`${SELECTORS.wallpaperItem}:last-of-type input`).focus();
            return;
        }

        const addWallBtn = e.target.closest('[data-act="add-wall"]');
        if (addWallBtn) {
            const wallsContainer = addWallBtn.closest(SELECTORS.wallsContainer) || addWallBtn.previousElementSibling;
            addWall(wallsContainer);
            wallsContainer.querySelector('.wall-input-row:last-of-type input').focus();
            return;
        }

        const dupRoomBtn = e.target.closest('[data-act="dup-room"]');
        if (dupRoomBtn) {
            const roomEl = dupRoomBtn.closest(SELECTORS.room);
            const roomData = buildPayload().rooms.find(r => r.room_name === roomEl.querySelector(SELECTORS.roomNameInput).value);
            if (roomData) {
                addRoom(roomData);
                showToast("คัดลอกห้องเรียบร้อย", "success");
            }
            return;
        }

        const dupSetBtn = e.target.closest('[data-act="dup-set"]');
        if (dupSetBtn) {
            const setEl = dupSetBtn.closest(SELECTORS.set);
            const roomEl = setEl.closest(SELECTORS.room);
            const setData = buildPayload().rooms.find(r => r.room_name === roomEl.querySelector(SELECTORS.roomNameInput).value)
                               .sets.find(s => s.set_name === setEl.querySelector('input[name="set_name"]').value);
            if (setData) {
                addSet(roomEl, setData);
                showToast("คัดลอกชุดเรียบร้อย", "success");
            }
            return;
        }

        const dupDecoBtn = e.target.closest('[data-act="dup-deco"]');
        if (dupDecoBtn) {
            const decoEl = dupDecoBtn.closest(SELECTORS.decoItem);
            const roomEl = decoEl.closest(SELECTORS.room);
            const decoData = buildPayload().rooms.find(r => r.room_name === roomEl.querySelector(SELECTORS.roomNameInput).value)
                               .decorations.find(d => d.deco_name === decoEl.querySelector('input[name="deco_name"]').value);
            if (decoData) {
                addDeco(roomEl, decoData);
                showToast("คัดลอกของตกแต่งเรียบร้อย", "success");
            }
            return;
        }

        const dupWallpaperBtn = e.target.closest('[data-act="dup-wallpaper"]');
        if (dupWallpaperBtn) {
            const wallpaperEl = dupWallpaperBtn.closest(SELECTORS.wallpaperItem);
            const roomEl = wallpaperEl.closest(SELECTORS.room);
            const wallpaperData = buildPayload().rooms.find(r => r.room_name === roomEl.querySelector(SELECTORS.roomNameInput).value)
                                     .wallpapers.find(w => w.wallpaper_name === wallpaperEl.querySelector('input[name="wallpaper_name"]').value);
            if (wallpaperData) {
                addWallpaper(roomEl, wallpaperData);
                showToast("คัดลอกวอลล์เรียบร้อย", "success");
            }
            return;
        }

        const delRoomBtn = e.target.closest('[data-act="del-room"]');
        if (delRoomBtn) {
            const confirmed = await showConfirmation("ยืนยันการลบ", "คุณต้องการลบห้องนี้ใช่หรือไม่?");
            if (confirmed) {
                removeParent(e, SELECTORS.room);
                updateGrandTotal();
                showToast("ลบห้องเรียบร้อย", "success");
            }
            return;
        }
        
        const delSetBtn = e.target.closest('[data-act="del-set"]');
        if (delSetBtn) {
            const roomEl = delSetBtn.closest(SELECTORS.room);
            const confirmed = await showConfirmation("ยืนยันการลบ", "คุณต้องการลบชุดนี้ใช่หรือไม่?");
            if (confirmed) {
                removeParent(e, SELECTORS.set);
                calculateRoomTotal(roomEl);
                updateSummaryVisibility(roomEl);
                showToast("ลบชุดเรียบร้อย", "success");
            }
            return;
        }

        const delDecoBtn = e.target.closest('[data-act="del-deco"]');
        if (delDecoBtn) {
            const roomEl = delDecoBtn.closest(SELECTORS.room);
            const confirmed = await showConfirmation("ยืนยันการลบ", "คุณต้องการลบรายการนี้ใช่หรือไม่?");
            if (confirmed) {
                removeParent(e, SELECTORS.decoItem);
                calculateRoomTotal(roomEl);
                updateSummaryVisibility(roomEl);
                showToast("ลบของตกแต่งเรียบร้อย", "success");
            }
            return;
        }

        const delWallpaperBtn = e.target.closest('[data-act="del-wallpaper"]');
        if (delWallpaperBtn) {
            const roomEl = delWallpaperBtn.closest(SELECTORS.room);
            const confirmed = await showConfirmation("ยืนยันการลบ", "คุณต้องการลบวอลล์นี้ใช่หรือไม่?");
            if (confirmed) {
                removeParent(e, SELECTORS.wallpaperItem);
                calculateRoomTotal(roomEl);
                updateSummaryVisibility(roomEl);
                showToast("ลบวอลล์เรียบร้อย", "success");
            }
            return;
        }

        const delWallBtn = e.target.closest('[data-act="del-wall"]');
        if (delWallBtn) {
            const wallpaperEl = delWallBtn.closest(SELECTORS.wallpaperItem);
            const roomEl = wallpaperEl.closest(SELECTORS.room);
            removeParent(e, '.wall-input-row');
            calculateRoomTotal(roomEl);
            return;
        }

        const toggleSuspendBtn = e.target.closest('[data-act="toggle-suspend"]');
        if (toggleSuspendBtn) {
            const roomEl = toggleSuspendBtn.closest(SELECTORS.room);
            const isSuspended = roomEl.dataset.suspended === 'true';
            roomEl.dataset.suspended = isSuspended ? 'false' : 'true';
            roomEl.classList.toggle('is-suspended', !isSuspended);
            updateGrandTotal();
            showToast(isSuspended ? "ยกเลิกการระงับห้องเรียบร้อย" : "ระงับห้องเรียบร้อย", "success");
            return;
        }

        if (e.target.closest('#clearAllBtn')) {
            const confirmed = await showConfirmation("ยืนยันการล้างข้อมูล", "ข้อมูลทั้งหมดจะถูกล้าง คุณแน่ใจหรือไม่?");
            if (confirmed) {
                localStorage.removeItem(STORAGE_KEY);
                roomsEl.innerHTML = "";
                addRoom();
                showToast("ข้อมูลทั้งหมดถูกล้างแล้ว", "success");
                updateGrandTotal();
            }
            return;
        }
        
        if (e.target.closest('#lockBtn')) {
            const confirmed = await showConfirmation("ยืนยันการล็อคฟอร์ม", "เมื่อล็อคฟอร์มแล้วจะไม่สามารถเพิ่ม/ลบรายการได้ คุณต้องการดำเนินการต่อหรือไม่?");
            if (confirmed) {
                const lockBtn = document.querySelector(SELECTORS.lockBtn);
                const isCurrentlyLocked = lockBtn.dataset.locked === 'true';
                if (!isCurrentlyLocked) {
                    lockBtn.dataset.locked = 'true';
                    lockBtn.querySelector('.lock-text').textContent = 'ปลดล็อค';
                    lockBtn.querySelector('.lock-icon').textContent = 'lock';
                    lockBtn.classList.add('outline');
                    showToast("ฟอร์มถูกล็อคแล้ว", "success");
                }
                updateLockState();
            }
            return;
        }
        
        if (e.target.closest('#lockBtn') && document.querySelector('#lockBtn').dataset.locked === 'true') {
            const lockBtn = document.querySelector(SELECTORS.lockBtn);
            lockBtn.dataset.locked = 'false';
            lockBtn.querySelector('.lock-text').textContent = 'ล็อค';
            lockBtn.querySelector('.lock-icon').textContent = 'lock_open';
            lockBtn.classList.remove('outline');
            showToast("ปลดล็อคฟอร์มแล้ว", "success");
            updateLockState();
            return;
        }

        const menuBtn = e.target.closest(SELECTORS.menuBtn);
        if (menuBtn) {
            e.preventDefault();
            document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
            return;
        }
        
        const roomMenuBtn = e.target.closest(SELECTORS.roomMenuBtn);
        if (roomMenuBtn) {
            e.preventDefault();
            const dropdown = roomMenuBtn.closest('.menu-container').querySelector(SELECTORS.roomMenuDropdown);
            dropdown.classList.toggle('show');
            return;
        }

        const setMenuBtn = e.target.closest(SELECTORS.setMenuBtn);
        if (setMenuBtn) {
            e.preventDefault();
            const dropdown = setMenuBtn.closest('.menu-container').querySelector(SELECTORS.setMenuDropdown);
            dropdown.classList.toggle('show');
            return;
        }
        
        const decoMenuBtn = e.target.closest(SELECTORS.decoMenuBtn);
        if (decoMenuBtn) {
            e.preventDefault();
            const dropdown = decoMenuBtn.closest('.menu-container').querySelector(SELECTORS.decoMenuDropdown);
            dropdown.classList.toggle('show');
            return;
        }

        const wallpaperMenuBtn = e.target.closest(SELECTORS.wallpaperMenuBtn);
        if (wallpaperMenuBtn) {
            e.preventDefault();
            const dropdown = wallpaperMenuBtn.closest('.menu-container').querySelector(SELECTORS.wallpaperMenuDropdown);
            dropdown.classList.toggle('show');
        }

        if (e.target.closest('#copyTextBtn')) {
            const options = await showCopyOptionsModal();
            if (options) {
                const text = createTextPayload(options);
                navigator.clipboard.writeText(text).then(() => {
                    showToast("คัดลอกข้อความเรียบร้อย", "success");
                }).catch(err => {
                    showToast("ไม่สามารถคัดลอกข้อความได้", "error");
                    console.error('Failed to copy text: ', err);
                });
            }
            return;
        }
        
        if (e.target.closest('#copyJsonBtn')) {
             const payload = buildPayload();
             navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
                 showToast("คัดลอก JSON เรียบร้อย", "success");
             }).catch(err => {
                 showToast("ไม่สามารถคัดลอก JSON ได้", "error");
                 console.error('Failed to copy JSON: ', err);
             });
             return;
        }

        if (e.target.closest('#exportBtn')) {
            const payload = buildPayload();
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'marnthara_data.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast("ไฟล์ JSON ถูกส่งออกแล้ว", "success");
        }

        if (e.target.closest('#importBtn')) {
            const jsonText = await showImportModal();
            if (jsonText) {
                try {
                    const payload = JSON.parse(jsonText);
                    document.querySelector('input[name="customer_name"]').value = payload.customer_name || "";
                    document.querySelector('input[name="customer_phone"]').value = payload.customer_phone || "";
                    document.querySelector('input[name="customer_address"]').value = payload.customer_address || "";
                    roomsEl.innerHTML = ""; roomCount = 0;
                    if (payload.rooms && payload.rooms.length > 0) {
                        payload.rooms.forEach(addRoom);
                    }
                    saveData();
                    showToast("นำเข้าข้อมูลเรียบร้อย", "success");
                } catch(err) {
                    showToast("รูปแบบ JSON ไม่ถูกต้อง", "error");
                    console.error("Failed to parse imported JSON:", err);
                }
            }
        }
        
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.querySelector(SELECTORS.modal).classList.contains('visible')) {
            document.querySelector(SELECTORS.modalCancel).click();
        }
        if (e.key === 'Escape' && document.querySelector(SELECTORS.copyOptionsModal).classList.contains('visible')) {
            document.querySelector(SELECTORS.copyOptionsCancel).click();
        }
        if (e.key === 'Escape' && document.querySelector(SELECTORS.importModal).classList.contains('visible')) {
            document.querySelector(SELECTORS.importCancel).click();
        }
    });

    document.addEventListener('scroll', () => {
        const header = document.querySelector('.header');
        if (window.scrollY > 0) {
            header.style.top = '0';
            header.style.borderRadius = '0 0 16px 16px';
            header.style.boxShadow = '0 8px 16px var(--lg-shadow-color)';
        } else {
            header.style.top = '16px';
            header.style.borderRadius = '28px';
            header.style.boxShadow = '0 4px 12px var(--lg-shadow-color)';
        }
    });

    window.addEventListener('load', loadData);
    window.addEventListener('beforeunload', saveData);
    
    document.addEventListener('click', e => {
        const menuDropdowns = document.querySelectorAll('.menu-dropdown');
        menuDropdowns.forEach(dropdown => {
            if (!dropdown.contains(e.target) && !e.target.closest('.menu-container')) {
                dropdown.classList.remove('show');
            }
        });
    });

})();