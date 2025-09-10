(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3; // This constant will no longer be used for calculation

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
            if (stripsPerRoll === 0) return Infinity; // Prevent division by zero
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
        importModal: '#importModal', importJsonArea: '#importJsonArea', importConfirm: '#importConfirm', importCancel: '#importCancel'
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

    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
        const room = frag.querySelector(SELECTORS.room);
        room.dataset.index = roomCount;
        populatePriceOptions(room.querySelector(SELECTORS.roomPricePerM), PRICING.fabric);
        roomsEl.appendChild(frag);

        const created = roomsEl.querySelector(`${SELECTORS.room}:last-of-type`);
        if (prefill) {
            created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
            created.querySelector(SELECTORS.roomPricePerM).value = prefill.price_per_m_raw || "";
            created.querySelector(SELECTORS.roomStyle).value = prefill.room_style || "";
            if (prefill.sets && prefill.sets.length > 0) {
                const setsContainer = created.querySelector(SELECTORS.setsContainer);
                prefill.sets.forEach(set => addSet(setsContainer, set));
            }
            if (prefill.decorations && prefill.decorations.length > 0) {
                const decoContainer = created.querySelector(SELECTORS.decorationsContainer);
                prefill.decorations.forEach(deco => addDeco(decoContainer, deco));
            }
            if (prefill.wallpapers && prefill.wallpapers.length > 0) {
                const wallpaperContainer = created.querySelector(SELECTORS.wallpapersContainer);
                prefill.wallpapers.forEach(wallpaper => addWallpaper(wallpaperContainer, wallpaper));
            }
        } else {
            addSet(created.querySelector(SELECTORS.setsContainer));
        }
        updateTotals();
        updateRoomCount();
    }

    function addSet(container, prefill) {
        if (isLocked) return;
        const frag = document.querySelector(SELECTORS.setTpl).content.cloneNode(true);
        const set = frag.querySelector(SELECTORS.set);
        populatePriceOptions(set.querySelector('select[name="set_price_per_m"]'), PRICING.fabric);
        populatePriceOptions(set.querySelector('input[name="set_sheer_code"]')?.closest('[data-sheer-wrap]'), PRICING.sheer);
        container.appendChild(frag);
        if (prefill) {
            const created = container.querySelector(`${SELECTORS.set}:last-of-type`);
            created.querySelector('input[name="set_name"]').value = prefill.set_name || "";
            created.querySelector('input[name="set_width_m"]').value = prefill.width_m || "";
            created.querySelector('input[name="set_height_m"]').value = prefill.height_m || "";
            created.querySelector('select[name="set_style"]').value = prefill.style || "";
            created.querySelector('select[name="set_price_per_m"]').value = prefill.price_per_m_raw || "";
            created.querySelector('input[name="set_fabric_code"]').value = prefill.fabric_code || "";
            if (prefill.sheer_code) {
                const sheerWrap = created.querySelector(SELECTORS.sheerWrap);
                sheerWrap.querySelector('input[name="set_sheer_code"]').value = prefill.sheer_code;
            }
            created.querySelector('input[name="set_total_price"]').value = prefill.total_price_raw || "";
            created.querySelector('input[name="set_discount"]').value = prefill.discount_raw || "";
        }
        updateTotals();
    }
    
    function addDeco(container, prefill) {
        if (isLocked) return;
        const frag = document.querySelector(SELECTORS.decoTpl).content.cloneNode(true);
        container.appendChild(frag);
        if (prefill) {
            const created = container.querySelector(`${SELECTORS.decoItem}:last-of-type`);
            created.querySelector('input[name="deco_name"]').value = prefill.name || "";
            created.querySelector('input[name="deco_quantity"]').value = prefill.quantity || "";
            created.querySelector('input[name="deco_price"]').value = prefill.price_raw || "";
            created.querySelector('input[name="deco_total"]').value = prefill.total_raw || "";
        }
        updateTotals();
    }

    function addWallpaper(container, prefill) {
        if (isLocked) return;
        const frag = document.querySelector(SELECTORS.wallpaperTpl).content.cloneNode(true);
        container.appendChild(frag);
        if (prefill) {
            const created = container.querySelector(`${SELECTORS.wallpaperItem}:last-of-type`);
            created.querySelector('input[name="wallpaper_code"]').value = prefill.code || "";
            created.querySelector('input[name="wallpaper_height_m"]').value = prefill.height || "";
            created.querySelector('input[name="wallpaper_price_roll"]').value = prefill.price_per_roll_raw || "";
            const wallsContainer = created.querySelector(SELECTORS.wallsContainer);
            if (prefill.walls && prefill.walls.length > 0) {
                prefill.walls.forEach(width => addWall(wallsContainer, width));
            } else {
                addWall(wallsContainer);
            }
        } else {
            addWall(container.querySelector(SELECTORS.wallsContainer));
        }
        updateTotals();
    }
    
    function addWall(container, width) {
        if (isLocked) return;
        const frag = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
        container.appendChild(frag);
        if (width) {
            container.querySelector('input[name="wall_width_m"]:last-of-type').value = width;
        }
        updateTotals();
    }

    function populatePriceOptions(element, prices) {
        if (!element || !prices) return;
        if (element.tagName === "SELECT") {
            element.innerHTML = prices.map(p => `<option value="${p}">${fmt(p, 0, true)} บ.</option>`).join('');
        } else if (element.tagName === "DIV") { // This handles the sheer fabric input box
            const input = element.querySelector('input[name="set_sheer_code"]');
            const datalist = document.createElement('datalist');
            datalist.id = input.name + '-list';
            datalist.innerHTML = prices.map(p => `<option value="${p}">`).join('');
            input.setAttribute('list', datalist.id);
            document.body.appendChild(datalist);
        }
    }
    
    const updateAllTotals = () => {
        let grandTotal = 0;
        let grandFabric = 0;
        let grandSheerFabric = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        let setCount = 0;
        let decoCount = 0;

        document.querySelectorAll(SELECTORS.room).forEach(room => {
            let roomTotal = 0;
            let roomSetCount = 0;
            let roomDecoCount = 0;

            const updateSubtotal = (name, total, element) => {
                roomTotal += toNum(total);
                if (element) {
                    element.textContent = fmt(total, 0, true);
                }
            };
            
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                roomSetCount++;
                const width = clamp01(set.querySelector('input[name="set_width_m"]').value);
                const height = clamp01(set.querySelector('input[name="set_height_m"]').value);
                const style = set.querySelector('select[name="set_style"]').value;
                const pricePerM = clamp01(set.querySelector('select[name="set_price_per_m"]').value);
                const totalManualPrice = toNum(set.querySelector('input[name="set_total_price"]').value);
                const discount = clamp01(set.querySelector('input[name="set_discount"]').value);
                
                const fabricYardage = CALC.fabricYardage(style, width);
                const fabricCost = fabricYardage * (pricePerM + stylePlus(style) + heightPlus(height));

                const sheerEl = set.querySelector('input[name="set_sheer_code"]');
                const sheerPricePerM = sheerEl ? toNum(sheerEl.value) : 0;
                const sheerYardage = (width * 2.6 + 0.6) / 0.9;
                const sheerCost = sheerYardage * sheerPricePerM;
                
                let setTotal = (totalManualPrice > 0) ? totalManualPrice : (fabricCost + sheerCost - discount);
                
                set.querySelector('[data-fabric-yardage]').textContent = fmt(fabricYardage);
                set.querySelector('[data-fabric-cost]').textContent = fmt(fabricCost, 0, true);
                set.querySelector('[data-sheer-yardage]').textContent = fmt(sheerYardage);
                set.querySelector('[data-sheer-cost]').textContent = fmt(sheerCost, 0, true);
                set.querySelector('input[name="set_total_price"]').value = fmt(setTotal, 0, true);

                roomTotal += setTotal;
                grandTotal += setTotal;
                grandFabric += fabricYardage;
                grandSheerFabric += sheerYardage;
                if (style === "ลอน") grandOpaqueTrack += width;
                else grandOpaqueTrack += width;
                if (sheerEl) grandSheerTrack += width;
            });
            
            room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
                roomDecoCount++;
                const quantity = clamp01(deco.querySelector('input[name="deco_quantity"]').value);
                const price = clamp01(deco.querySelector('input[name="deco_price"]').value);
                const total = quantity * price;
                
                deco.querySelector('input[name="deco_total"]').value = fmt(total, 0, true);
                roomTotal += total;
                grandTotal += total;
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const height = clamp01(wallpaper.querySelector('input[name="wallpaper_height_m"]').value);
                const pricePerRoll = clamp01(wallpaper.querySelector('input[name="wallpaper_price_roll"]').value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                const rollsNeeded = CALC.wallpaperRolls(totalWidth, height);
                const totalCost = rollsNeeded * pricePerRoll;

                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = 
                    `ราคา: <span class="price">${fmt(totalCost, 0, true)}</span> บ. • พื้นที่: <span class="price">${fmt(totalWidth * height)}</span> ตร.ม. • ใช้ <span class="price">${rollsNeeded}</span> ม้วน`;
                
                roomTotal += totalCost;
                grandTotal += totalCost;
            });

            room.querySelector('[data-total-room-price]').textContent = fmt(roomTotal, 0, true);
            room.querySelector('[data-set-count]').textContent = roomSetCount;
            room.querySelector('[data-deco-count]').textContent = roomDecoCount;
            setCount += roomSetCount;
            decoCount += roomDecoCount;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = document.querySelectorAll(SELECTORS.room).length;
        document.querySelector(SELECTORS.grandFabric).textContent = `${fmt(grandFabric)} หลา`;
        document.querySelector(SELECTORS.grandSheerFabric).textContent = `${fmt(grandSheerFabric)} หลา`;
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = `${fmt(grandOpaqueTrack)} ม.`;
        document.querySelector(SELECTORS.grandSheerTrack).textContent = `${fmt(grandSheerTrack)} ม.`;
    };
    
    const updateRoomCount = () => {
        const rooms = document.querySelectorAll(SELECTORS.room);
        rooms.forEach((room, index) => {
            room.querySelector('.room-count').textContent = `ห้องที่ ${index + 1}`;
        });
    };

    const deleteElement = (e, selector) => {
        const item = e.target.closest(selector);
        if (item) item.remove();
        updateAllTotals();
        updateRoomCount();
    };
    
    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach((room, roomIndex) => {
            const roomData = {
                room_index: roomIndex + 1,
                room_name: room.querySelector(SELECTORS.roomNameInput).value,
                total_price_raw: toNum(room.querySelector('[data-total-room-price]').textContent),
                sets: [],
                decorations: [],
                wallpapers: []
            };
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                const totalManualPrice = toNum(set.querySelector('input[name="set_total_price"]').value);
                const totalCalculatedPrice = toNum(set.querySelector('[data-fabric-cost]').textContent) + toNum(set.querySelector('[data-sheer-cost]').textContent) - toNum(set.querySelector('input[name="set_discount"]').value);
                roomData.sets.push({
                    set_name: set.querySelector('input[name="set_name"]').value,
                    width_m: toNum(set.querySelector('input[name="set_width_m"]').value),
                    height_m: toNum(set.querySelector('input[name="set_height_m"]').value),
                    style: set.querySelector('select[name="set_style"]').value,
                    price_per_m_raw: toNum(set.querySelector('select[name="set_price_per_m"]').value),
                    fabric_code: set.querySelector('input[name="set_fabric_code"]').value,
                    sheer_code: set.querySelector('input[name="set_sheer_code"]')?.value || null,
                    total_price: (totalManualPrice > 0) ? totalManualPrice : totalCalculatedPrice,
                    total_price_raw: totalManualPrice,
                    discount: toNum(set.querySelector('input[name="set_discount"]').value)
                });
            });
            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                roomData.decorations.push({
                    name: deco.querySelector('input[name="deco_name"]').value,
                    quantity: toNum(deco.querySelector('input[name="deco_quantity"]').value),
                    price: toNum(deco.querySelector('input[name="deco_price"]').value),
                    price_raw: toNum(deco.querySelector('input[name="deco_price"]').value),
                    total: toNum(deco.querySelector('input[name="deco_total"]').value),
                    total_raw: toNum(deco.querySelector('input[name="deco_total"]').value),
                });
            });
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                roomData.wallpapers.push({
                    code: wallpaper.querySelector('input[name="wallpaper_code"]').value,
                    height: clamp01(wallpaper.querySelector('input[name="wallpaper_height_m"]').value),
                    price_per_roll: clamp01(wallpaper.querySelector('input[name="wallpaper_price_roll"]').value),
                    price_per_roll_raw: wallpaper.querySelector('input[name="wallpaper_price_roll"]').value,
                    total_width: totalWidth,
                    walls: Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).map(el => clamp01(el.value)),
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    };
    
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            showToast('คัดลอกข้อมูลสำเร็จ!', 'success');
        }).catch(err => {
            showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
            console.error('Could not copy text: ', err);
        });
    };
    
    const buildPlainTextSummary = (options) => {
        const payload = buildPayload();
        let summary = "";

        if (options.customer) {
            summary += `ข้อมูลลูกค้า\n`;
            summary += `ชื่อ: ${payload.customer_name}\n`;
            summary += `เบอร์โทร: ${payload.customer_phone}\n`;
            summary += `รายละเอียดเพิ่มเติม: ${payload.customer_address}\n\n`;
        }

        if (options.details) {
            payload.rooms.forEach(room => {
                summary += `--- ห้องที่ ${room.room_index}: ${room.room_name || 'ไม่ได้ระบุชื่อ'}\n`;
                if (room.sets && room.sets.length > 0) {
                    room.sets.forEach(set => {
                        summary += `\n- ${set.set_name || 'ไม่ระบุชื่อ'}: กว้าง ${fmt(set.width_m)} ม., สูง ${fmt(set.height_m)} ม.\n`;
                        summary += `  สไตล์: ${set.style}\n`;
                        summary += `  ผ้าทึบ: ${set.fabric_code || '-'} (ใช้ ${fmt(CALC.fabricYardage(set.style, set.width_m))} หลา)\n`;
                        if (set.sheer_code) summary += `  ผ้าโปร่ง: ${set.sheer_code} (ใช้ ${fmt(CALC.fabricYardage("ลอน", set.width_m))} หลา)\n`;
                        summary += `  ราคารวม: ${fmt(set.total_price_raw, 0, true)} บ.\n`;
                    });
                }
                if (room.wallpapers && room.wallpapers.length > 0) {
                    room.wallpapers.forEach(wallpaper => {
                        const totalWidth = wallpaper.walls.reduce((sum, width) => sum + width, 0);
                        const rollsNeeded = CALC.wallpaperRolls(totalWidth, wallpaper.height);
                        summary += `\n- วอลล์เปเปอร์ ${wallpaper.code || '-'}: สูง ${fmt(wallpaper.height)} ม.\n`;
                        summary += `  ความกว้างรวม: ${fmt(totalWidth)} ม. (ใช้ ${rollsNeeded} ม้วน)\n`;
                        summary += `  ราคารวม: ${fmt(rollsNeeded * wallpaper.price_per_roll, 0, true)} บ.\n`;
                    });
                }
                if (room.decorations && room.decorations.length > 0) {
                    room.decorations.forEach(deco => {
                        summary += `\n- ของตกแต่ง: ${deco.name || '-'}\n`;
                        summary += `  จำนวน: ${deco.quantity} ชิ้น ราคา: ${fmt(deco.total_raw, 0, true)} บ.\n`;
                    });
                }
                summary += `\nราคารวมห้อง: ${fmt(room.total_price_raw, 0, true)} บ.\n\n`;
            });
        }
        
        if (options.summary) {
            const grandTotal = document.querySelector(SELECTORS.grandTotal).textContent;
            const grandFabric = document.querySelector(SELECTORS.grandFabric).textContent;
            const grandSheerFabric = document.querySelector(SELECTORS.grandSheerFabric).textContent;
            const grandOpaqueTrack = document.querySelector(SELECTORS.grandOpaqueTrack).textContent;
            const grandSheerTrack = document.querySelector(SELECTORS.grandSheerTrack).textContent;
            
            summary += `---\n`;
            summary += `สรุปยอดรวม\n`;
            summary += `ผ้าทึบ: ${grandFabric}\n`;
            summary += `ผ้าโปร่ง: ${grandSheerFabric}\n`;
            summary += `รางทึบ: ${grandOpaqueTrack}\n`;
            summary += `รางโปร่ง: ${grandSheerTrack}\n`;
            summary += `ราคารวมทั้งหมด: ${grandTotal} บ.\n`;
        }
        return summary;
    };

    const updateLockState = () => {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const lockText = lockBtn.querySelector('.lock-text');
        const lockIcon = lockBtn.querySelector('.lock-icon');
        if (isLocked) {
            lockText.textContent = "ปลดล็อค";
            lockIcon.textContent = "🔓";
            lockBtn.classList.replace('btn-primary', 'btn-success');
            document.querySelectorAll('input, select, button[data-act]').forEach(el => el.disabled = true);
            document.querySelector(SELECTORS.submitBtn).disabled = false;
            document.querySelector(SELECTORS.copyTextBtn).disabled = false;
        } else {
            lockText.textContent = "ล็อค";
            lockIcon.textContent = "🔒";
            lockBtn.classList.replace('btn-success', 'btn-primary');
            document.querySelectorAll('input, select, button[data-act]').forEach(el => el.disabled = false);
        }
    };
    
    // --- Event Listeners ---
    document.addEventListener('input', debounce(updateAllTotals));
    
    document.addEventListener('click', e => {
        const target = e.target;
        if (target.dataset.act === 'del-room') {
            showConfirmation("ลบห้อง", "คุณแน่ใจว่าต้องการลบห้องนี้?").then(result => {
                if (result) deleteElement(e, SELECTORS.room);
            });
        } else if (target.dataset.act === 'del-set') {
            showConfirmation("ลบรายการ", "คุณแน่ใจว่าต้องการลบรายการผ้าม่านนี้?").then(result => {
                if (result) deleteElement(e, SELECTORS.set);
            });
        } else if (target.dataset.act === 'del-deco') {
            showConfirmation("ลบรายการ", "คุณแน่ใจว่าต้องการลบรายการของตกแต่งนี้?").then(result => {
                if (result) deleteElement(e, SELECTORS.decoItem);
            });
        } else if (target.dataset.act === 'del-wallpaper') {
            showConfirmation("ลบรายการ", "คุณแน่ใจว่าต้องการลบรายการวอลล์เปเปอร์นี้?").then(result => {
                if (result) deleteElement(e, SELECTORS.wallpaperItem);
            });
        } else if (target.dataset.act === 'del-wall') {
            deleteElement(e, '.wall-input-row');
        } else if (target.dataset.act === 'add-set') {
            addSet(target.closest(SELECTORS.room).querySelector(SELECTORS.setsContainer));
        } else if (target.dataset.act === 'add-deco') {
            addDeco(target.closest(SELECTORS.room).querySelector(SELECTORS.decorationsContainer));
        } else if (target.dataset.act === 'add-wallpaper') {
            addWallpaper(target.closest(SELECTORS.room).querySelector(SELECTORS.wallpapersContainer));
        } else if (target.dataset.act === 'add-wall') {
            addWall(target.closest('.walls-section').querySelector(SELECTORS.wallsContainer));
        } else if (target.id === 'addRoomHeaderBtn') {
            addRoom();
        } else if (target.id === 'lockBtn') {
            isLocked = !isLocked;
            updateLockState();
        } else if (target.id === 'clearAllBtn') {
            showConfirmation("ล้างข้อมูลทั้งหมด", "คุณแน่ใจว่าต้องการล้างข้อมูลทั้งหมด? ข้อมูลที่บันทึกไว้ในเครื่องจะถูกลบออกด้วย").then(result => {
                if (result) {
                    localStorage.removeItem(STORAGE_KEY);
                    roomsEl.innerHTML = "";
                    addRoom();
                    updateAllTotals();
                    showToast('ล้างข้อมูลสำเร็จ!', 'success');
                }
            });
        } else if (target.id === 'copyJsonBtn') {
            const payload = buildPayload();
            copyToClipboard(JSON.stringify(payload, null, 2));
        } else if (target.id === 'copyTextBtn') {
            showCopyOptionsModal().then(options => {
                if (options) {
                    const textSummary = buildPlainTextSummary(options);
                    copyToClipboard(textSummary);
                }
            });
        } else if (target.id === 'importBtn') {
            document.querySelector(SELECTORS.importModal).classList.add('visible');
        } else if (target.id === 'importCancel') {
            document.querySelector(SELECTORS.importModal).classList.remove('visible');
        } else if (target.id === 'importConfirm') {
            try {
                const json = JSON.parse(document.querySelector(SELECTORS.importJsonArea).value);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
                window.location.reload();
            } catch (err) {
                showToast('ข้อมูล JSON ไม่ถูกต้อง!', 'error');
            }
        } else if (target.id === 'exportBtn') {
            const payload = buildPayload();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `marnthara-order-${payload.customer_name || 'data'}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } else if (target.id === 'menuBtn') {
            const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
            menuDropdown.classList.toggle('show');
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        if (!menuDropdown.contains(e.target) && !document.querySelector(SELECTORS.menuBtn).contains(e.target)) {
            menuDropdown.classList.remove('show');
        }
    });

    orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                document.querySelector('input[name="customer_name"]').value = payload.customer_name;
                document.querySelector('input[name="customer_address"]').value = payload.customer_address;
                document.querySelector('input[name="customer_phone"]').value = payload.customer_phone;
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
    });
})();