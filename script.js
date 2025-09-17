(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.5.1-bug-fix";
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
            if (stripsPerRoll === 0) return Infinity; // Prevent division of zero
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        }
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', clearAllBtn: '#clearAllBtn', copyJsonBtn: '#copyJsonBtn',
        lockBtn: '#lockBtn', addRoomFooterBtn: '#addRoomFooterBtn', lockText: '#lockText',
        grandTotal: '#grandTotal', setCount: '#setCount', grandProfit: '#grandProfit', grandProfitPercent: '#grandProfitPercent', grandProfitText: '.actual-profit-text',
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
        
        // NEW Selectors for actual costs
        actualCostCard: '#actualCostCard',
        actualSellingPriceInput: '#actual_selling_price',
        actualCostInputs: '#actual-costs-container input',
        addOtherCostBtn: '#addOtherCostBtn',
        otherCostsContainer: '#other-costs-container',
        otherCostInputs: '.other-cost-input',
        totalCostDisplay: '#totalCostDisplay',
        profitDisplay: '#profitDisplay',
        profitPercentDisplay: '#profitPercentDisplay'
    };

    // --- STATE ---
    let roomCount = 0;
    let isLocked = false;
    let otherCostCount = 0;

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
    const fmtPercent = (n) => {
        if (!Number.isFinite(n)) return "0";
        return n.toLocaleString("th-TH", { 
            style: 'percent', 
            minimumFractionDigits: 0, 
            maximumFractionDigits: 2 
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
    
    function addOtherCost(prefillName = '', prefillCost = '') {
        otherCostCount++;
        const container = document.querySelector(SELECTORS.otherCostsContainer);
        if (!container) return;

        const otherCostItem = document.createElement('div');
        otherCostItem.className = 'form-group other-cost-item';
        otherCostItem.dataset.index = otherCostCount;
        otherCostItem.innerHTML = `
            <label>ค่าใช้จ่ายอื่นๆ #${otherCostCount}</label>
            <input type="text" name="other_cost_name_${otherCostCount}" placeholder="ระบุชื่อค่าใช้จ่าย" value="${prefillName}">
            <input type="text" inputmode="numeric" class="other-cost-input" name="other_cost_value_${otherCostCount}" placeholder="0" value="${prefillCost}">
            <button type="button" class="btn-icon btn-icon-small danger" data-act="remove-other-cost">
                <i class="ph-bold ph-x"></i>
            </button>
        `;
        container.appendChild(otherCostItem);
        otherCostItem.querySelector('.other-cost-input').addEventListener('input', debounce(recalcAll));
        otherCostItem.querySelector('[data-act="remove-other-cost"]').addEventListener('click', (e) => {
            e.preventDefault();
            otherCostItem.remove();
            recalcAll();
            saveData();
        });
        recalcAll();
        saveData();
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

    function getSummaryText(payload) {
        let text = "";
        if (payload.customer && payload.customer.name) {
            text += `ลูกค้า: ${payload.customer.name}\n`;
            if (payload.customer.phone) text += `เบอร์โทร: ${payload.customer.phone}\n`;
        }
        
        let grandTotal = 0;
        let setCount = 0;

        if (payload.rooms && payload.rooms.length > 0) {
            payload.rooms.forEach(room => {
                if (room.room_name) {
                    text += `\n--- ห้อง ${room.room_name} ---\n`;
                }

                if (room.sets && room.sets.length > 0) {
                    room.sets.forEach((set, i) => {
                        const price = set.total_price_incl_surcharge ?? 0;
                        grandTotal += price;
                        setCount++;
                        if (set.is_suspended) return;
                        text += `\nรายการที่ ${i+1}: ${set.fabric_variant} (${set.style})\n`;
                        text += `  กว้าง ${set.width_m} ม. x สูง ${set.height_m} ม.\n`;
                        text += `  ใช้ผ้า: ${fmt(set.fabric_yardage, 2)} หลา (ประมาณ)\n`;
                        if (set.sheer_price_per_m) {
                             text += `  ราคาผ้าทึบ: ${fmt(set.price_per_m_raw, 0, true)} บ./ม.`;
                             text += `  ราคาผ้าโปร่ง: ${fmt(set.sheer_price_per_m, 0, true)} บ./ม.\n`;
                        } else {
                            text += `  ราคาผ้า: ${fmt(set.price_per_m_raw, 0, true)} บ./ม.\n`;
                        }
                        text += `  **ราคา: ${fmt(price, 0, true)} บ.**\n`;
                    });
                }
                
                if (room.decorations && room.decorations.length > 0) {
                    room.decorations.forEach((deco, i) => {
                        const price = deco.total_price ?? 0;
                        grandTotal += price;
                        setCount++;
                        if (deco.is_suspended) return;
                        text += `\nของตกแต่งที่ ${i+1}: ${deco.type}\n`;
                        text += `  **ราคา: ${fmt(price, 0, true)} บ.**\n`;
                    });
                }

                if (room.wallpapers && room.wallpapers.length > 0) {
                    room.wallpapers.forEach((wallpaper, i) => {
                        const price = wallpaper.total_price ?? 0;
                        grandTotal += price;
                        setCount++;
                        if (wallpaper.is_suspended) return;
                        text += `\nวอลล์เปเปอร์ที่ ${i+1}\n`;
                        text += `  ความกว้างรวม: ${fmt(wallpaper.total_width, 2)} ม.\n`;
                        text += `  ความสูง: ${fmt(wallpaper.height_m, 2)} ม.\n`;
                        text += `  ใช้: ${wallpaper.rolls_needed} ม้วน\n`;
                        text += `  ราคา: ${fmt(wallpaper.price_per_roll, 0, true)} บ./ม้วน\n`;
                        text += `  **ราคา: ${fmt(price, 0, true)} บ.**\n`;
                    });
                }
            });
        }
        
        text += `\n--- สรุปยอดรวม ---\n`;
        text += `รวม ${setCount} รายการ\n`;
        text += `ยอดรวมทั้งหมด: ${fmt(grandTotal, 0, true)} บาท`;
        
        return text;
    }
    
    // --- MAIN CALCULATION LOGIC ---
    const recalcAll = debounce(() => {
        let grandTotal = 0;
        let setCount = 0;
        let totalFabrics = 0;
        let totalSheers = 0;

        document.querySelectorAll(SELECTORS.set).forEach(set => {
            if (set.dataset.suspended === 'true') return;
            const width = clamp01(set.querySelector('input[name="width_m"]').value);
            const height = clamp01(set.querySelector('input[name="height_m"]').value);
            const style = set.querySelector('select[name="set_style"]').value;
            const fabric_variant = set.querySelector('select[name="fabric_variant"]').value;
            const price_per_m_raw = toNum(set.querySelector('select[name="set_price_per_m"]').value);
            const sheer_price_per_m = toNum(set.querySelector('select[name="sheer_price_per_m"]').value);

            let price_per_m_adj = price_per_m_raw + stylePlus(style) + heightPlus(height);
            let sheer_price_per_m_adj = sheer_price_per_m;
            let total_price = 0;
            let fabric_yardage = CALC.fabricYardage(style, width);

            if (fabric_variant === "ทึบ") {
                total_price = fabric_yardage * 0.9 * price_per_m_adj; // 0.9m = 1 yard
                totalFabrics += fabric_yardage * 0.9;
            } else if (fabric_variant === "โปร่ง") {
                total_price = fabric_yardage * 0.9 * sheer_price_per_m_adj;
                totalSheers += fabric_yardage * 0.9;
            } else if (fabric_variant === "ทึบและโปร่ง") {
                total_price = (fabric_yardage * 0.9 * price_per_m_adj) + (fabric_yardage * 0.9 * sheer_price_per_m_adj);
                totalFabrics += fabric_yardage * 0.9;
                totalSheers += fabric_yardage * 0.9;
            }

            const summaryEl = set.querySelector('[data-set-summary]');
            if (summaryEl) {
                summaryEl.innerHTML = `ใช้ผ้า: <b>${fmt(fabric_yardage, 2)} หลา</b> | ราคา: <b>${fmt(total_price, 0, true)} บ.</b>`;
            }
            grandTotal += total_price;
            setCount++;
            set.dataset.total_price = total_price;
            set.dataset.fabric_yardage = fabric_yardage;
        });

        document.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
            if (deco.dataset.suspended === 'true') return;
            const width = clamp01(deco.querySelector('[name="deco_width_m"]').value);
            const height = clamp01(deco.querySelector('[name="deco_height_m"]').value);
            const price_sqyd = toNum(deco.querySelector('[name="deco_price_sqyd"]').value);

            const total_price = width * height * SQM_TO_SQYD * price_sqyd;
            grandTotal += total_price;
            setCount++;
            deco.dataset.total_price = total_price;

            const summaryEl = deco.querySelector('[data-deco-summary]');
            if (summaryEl) {
                summaryEl.innerHTML = `ราคา: <b>${fmt(total_price, 0, true)} บ.</b>`;
            }
        });
        
        document.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
            if (wallpaper.dataset.suspended === 'true') return;
            const height = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]').value);
            const price_per_roll = toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]').value);
            let totalWidth = 0;
            wallpaper.querySelectorAll('[name="wall_width_m"]').forEach(input => {
                totalWidth += clamp01(input.value);
            });
            
            const rolls_needed = CALC.wallpaperRolls(totalWidth, height);
            const total_price = rolls_needed * price_per_roll;
            grandTotal += total_price;
            setCount++;
            wallpaper.dataset.total_price = total_price;
            wallpaper.dataset.rolls_needed = rolls_needed;
            
            const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
            if (summaryEl) {
                summaryEl.innerHTML = `ใช้: <b>${rolls_needed} ม้วน</b> | ราคา: <b>${fmt(total_price, 0, true)} บ.</b>`;
            }
        });
        
        // --- ACTUAL COST & PROFIT CALCULATION ---
        const actualSellingPrice = toNum(document.querySelector(SELECTORS.actualSellingPriceInput).value);
        let totalCost = 0;
        
        // Sum up predefined costs
        document.querySelectorAll(SELECTORS.actualCostInputs).forEach(input => {
            totalCost += toNum(input.value);
        });

        // Sum up dynamically added 'other' costs
        document.querySelectorAll(SELECTORS.otherCostInputs).forEach(input => {
             totalCost += toNum(input.value);
        });

        const actualCostCard = document.querySelector(SELECTORS.actualCostCard);
        const grandProfitText = document.querySelector(SELECTORS.grandProfitText);
        const profitDisplay = document.querySelector(SELECTORS.profitDisplay);
        const profitPercentDisplay = document.querySelector(SELECTORS.profitPercentDisplay);
        const totalCostDisplay = document.querySelector(SELECTORS.totalCostDisplay);

        if (actualSellingPrice > 0) {
            actualCostCard.style.display = 'block';
            grandProfitText.style.display = 'block';
            const profit = actualSellingPrice - totalCost;
            const profitPercent = (profit / actualSellingPrice) * 100;
            
            profitDisplay.textContent = fmt(profit, 0, true);
            profitPercentDisplay.textContent = fmtPercent(profitPercent / 100);
            totalCostDisplay.textContent = fmt(totalCost, 0, true);
        } else {
            actualCostCard.style.display = 'none';
            grandProfitText.style.display = 'none';
        }

        document.querySelector(SELECTORS.grandProfit).textContent = fmt(actualSellingPrice - totalCost, 0, true);
        document.querySelector(SELECTORS.grandProfitPercent).textContent = fmtPercent((actualSellingPrice - totalCost) / actualSellingPrice);
        
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grandTotal, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = setCount;

        saveData();
    });

    // --- DATA HANDLING ---
    function serializeForm() {
        const payload = {
            version: APP_VERSION,
            customer: {},
            rooms: [],
            actual_costs: {
                selling_price: toNum(document.querySelector(SELECTORS.actualSellingPriceInput).value),
                predefined_costs: {},
                other_costs: []
            }
        };

        const customerInfo = document.querySelector('#customerInfo');
        payload.customer.customer_name = customerInfo.querySelector('#customer_name').value;
        payload.customer.customer_phone = customerInfo.querySelector('#customer_phone').value;
        payload.customer.customer_address = customerInfo.querySelector('#customer_address').value;
        
        // Serialize predefined costs
        const predefinedCostsContainer = document.querySelector('#actual-costs-container');
        if (predefinedCostsContainer) {
             predefinedCostsContainer.querySelectorAll('input').forEach(input => {
                payload.actual_costs.predefined_costs[input.name] = toNum(input.value);
            });
        }

        // Serialize other costs
        document.querySelectorAll(SELECTORS.otherCostsContainer + ' .other-cost-item').forEach(item => {
            const name = item.querySelector('input[type="text"]').value;
            const value = toNum(item.querySelector('input[inputmode="numeric"]').value);
            payload.actual_costs.other_costs.push({ name, value });
        });

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput).value,
                sets: [],
                decorations: [],
                wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const is_suspended = setEl.dataset.suspended === 'true';
                const total_price = toNum(setEl.dataset.total_price);
                const fabric_yardage = toNum(setEl.dataset.fabric_yardage);
                if (is_suspended && total_price === 0) return;
                
                const data = {
                    width_m: toNum(setEl.querySelector('[name="width_m"]').value),
                    height_m: toNum(setEl.querySelector('[name="height_m"]').value),
                    set_style: setEl.querySelector('[name="set_style"]').value,
                    fabric_variant: setEl.querySelector('[name="fabric_variant"]').value,
                    set_price_per_m: toNum(setEl.querySelector('[name="set_price_per_m"]').value),
                    sheer_price_per_m: toNum(setEl.querySelector('[name="sheer_price_per_m"]').value)
                };

                roomData.sets.push({
                    ...data,
                    total_price_incl_surcharge: total_price,
                    fabric_yardage: fabric_yardage,
                    is_suspended
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                const is_suspended = decoEl.dataset.suspended === 'true';
                const total_price = toNum(decoEl.dataset.total_price);
                if (is_suspended && total_price === 0) return;
                
                const data = {
                    deco_type: decoEl.querySelector('[name="deco_type"]').value,
                    deco_width_m: toNum(decoEl.querySelector('[name="deco_width_m"]').value),
                    deco_height_m: toNum(decoEl.querySelector('[name="deco_height_m"]').value),
                    deco_price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]').value)
                };

                roomData.decorations.push({
                    ...data,
                    total_price: total_price,
                    is_suspended
                });
            });
            
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const is_suspended = wallpaperEl.dataset.suspended === 'true';
                const total_price = toNum(wallpaperEl.dataset.total_price);
                const rolls_needed = toNum(wallpaperEl.dataset.rolls_needed);
                if (is_suspended && total_price === 0) return;
                
                const heights = wallpaperEl.querySelector('[name="wallpaper_height_m"]').value;
                const prices = wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value;
                const widths = Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(input => toNum(input.value));
                
                roomData.wallpapers.push({
                    height_m: toNum(heights),
                    price_per_roll: toNum(prices),
                    widths: widths,
                    rolls_needed,
                    total_price,
                    is_suspended
                });
            });

            if (roomData.sets.length > 0 || roomData.decorations.length > 0 || roomData.wallpapers.length > 0) {
                payload.rooms.push(roomData);
            }
        });
        
        return payload;
    }
    
    function loadPayload(payload) {
        if (!payload) return;
        document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
        otherCostCount = 0;
        document.querySelector(SELECTORS.otherCostsContainer).innerHTML = "";

        if (payload.customer) {
            document.querySelector('#customer_name').value = payload.customer.customer_name || "";
            document.querySelector('#customer_phone').value = payload.customer.customer_phone || "";
            document.querySelector('#customer_address').value = payload.customer.customer_address || "";
        }
        
        // Load actual costs
        if (payload.actual_costs) {
            document.querySelector(SELECTORS.actualSellingPriceInput).value = payload.actual_costs.selling_price;
            if (payload.actual_costs.predefined_costs) {
                for (const key in payload.actual_costs.predefined_costs) {
                    const input = document.querySelector(`#${key}`);
                    if (input) input.value = payload.actual_costs.predefined_costs[key];
                }
            }
            if (payload.actual_costs.other_costs) {
                payload.actual_costs.other_costs.forEach(cost => {
                    addOtherCost(cost.name, cost.value);
                });
            }
        }

        if (payload.rooms && payload.rooms.length > 0) {
            payload.rooms.forEach(room => addRoom(room));
        } else {
            addRoom();
        }
        
        recalcAll();
    }
    
    function saveData() {
        const payload = serializeForm();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
    }
    
    function updateLockState() {
        isLocked = document.querySelector(SELECTORS.lockBtn).classList.contains('active');
        const elementsToLock = document.querySelectorAll(
            `input, select, textarea, .add-room-container button, 
            .item-card-controls button, .action-buttons button, 
            [data-act="remove-wall"], [data-act="add-wall"],
            ${SELECTORS.addOtherCostBtn}`
        );
        elementsToLock.forEach(el => {
            el.disabled = isLocked;
        });
        document.querySelector(SELECTORS.lockText).textContent = isLocked ? "ปลดล็อก" : "ล็อก";
        const lockIcon = document.querySelector('.lock-icon');
        lockIcon.className = isLocked ? 'ph-bold ph-lock-key-fill lock-icon' : 'ph-bold ph-lock-key-open lock-icon';
        if (isLocked) {
             document.querySelector(SELECTORS.orderForm).classList.add('locked');
        } else {
             document.querySelector(SELECTORS.orderForm).classList.remove('locked');
        }
    }

    // --- EVENT LISTENERS & INIT ---
    function init() {
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        
        orderForm.addEventListener('input', debounce(recalcAll));
        orderForm.addEventListener('change', recalcAll);

        // Actual cost inputs and selling price
        const costInputs = document.querySelectorAll(SELECTORS.actualCostInputs);
        costInputs.forEach(input => {
            input.addEventListener('input', debounce(recalcAll));
        });
        
        document.querySelector(SELECTORS.actualSellingPriceInput).addEventListener('input', debounce(recalcAll));
        document.querySelector(SELECTORS.addOtherCostBtn).addEventListener('click', () => addOtherCost());
        
        document.querySelector(SELECTORS.roomsContainer).addEventListener('click', (e) => {
            if (e.target.closest('[data-act="add-set"]')) {
                addSet(e.target.closest(SELECTORS.room));
            } else if (e.target.closest('[data-act="add-deco"]')) {
                addDeco(e.target.closest(SELECTORS.room));
            } else if (e.target.closest('[data-act="add-wallpaper"]')) {
                addWallpaper(e.target.closest(SELECTORS.room));
            } else if (e.target.closest('[data-act="add-wall"]')) {
                addWall(e.target.closest('[data-act="add-wall"]'));
            } else if (e.target.closest('[data-act="remove-set"]')) {
                 performActionWithConfirmation(e.target, { 
                    selector: SELECTORS.set, 
                    action: el => el.remove(), 
                    confirm: true, 
                    title: 'ลบรายการนี้?', 
                    body: 'คุณต้องการลบรายการนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้',
                    toast: 'ลบรายการสำเร็จ'
                });
            } else if (e.target.closest('[data-act="remove-room"]')) {
                performActionWithConfirmation(e.target, { 
                    selector: SELECTORS.room, 
                    action: el => el.remove(), 
                    confirm: true, 
                    title: 'ลบห้องนี้?', 
                    body: 'คุณต้องการลบห้องนี้และรายการทั้งหมดใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้',
                    toast: 'ลบห้องสำเร็จ'
                });
            } else if (e.target.closest('[data-act="remove-deco"]')) {
                 performActionWithConfirmation(e.target, {
                    selector: SELECTORS.decoItem,
                    action: el => el.remove(),
                    confirm: true,
                    title: 'ลบรายการนี้?',
                    body: 'คุณต้องการลบรายการของตกแต่งนี้ใช่หรือไม่?',
                    toast: 'ลบรายการสำเร็จ'
                });
            } else if (e.target.closest('[data-act="remove-wallpaper"]')) {
                performActionWithConfirmation(e.target, {
                    selector: SELECTORS.wallpaperItem,
                    action: el => el.remove(),
                    confirm: true,
                    title: 'ลบรายการนี้?',
                    body: 'คุณต้องการลบรายการวอลล์เปเปอร์นี้ใช่หรือไม่?',
                    toast: 'ลบรายการสำเร็จ'
                });
            } else if (e.target.closest('[data-act="remove-wall"]')) {
                performActionWithConfirmation(e.target, { 
                    selector: '.wall-input-row',
                    action: el => el.remove(),
                    confirm: true,
                    title: 'ลบผนังนี้?',
                    body: 'คุณต้องการลบความกว้างของผนังนี้ใช่หรือไม่?',
                    toast: 'ลบผนังสำเร็จ'
                });
            } else if (e.target.closest('[data-act="toggle-suspend"]')) {
                const item = e.target.closest('[data-set], [data-deco-item], [data-wallpaper-item]');
                if (item) {
                    const isSuspended = item.dataset.suspended === 'true';
                    suspendItem(item, !isSuspended);
                    recalcAll();
                    saveData();
                }
            } else if (e.target.closest('[name="deco_type"]')) {
                const selectEl = e.target.closest('[name="deco_type"]');
                const displayEl = e.target.closest(SELECTORS.decoItem)?.querySelector('.deco-type-display');
                if (displayEl) {
                    displayEl.textContent = `(${selectEl.value})`;
                }
            } else if (e.target.closest('[name="fabric_variant"]')) {
                toggleSetFabricUI(e.target.closest(SELECTORS.set));
            }
        });
        
        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => addRoom());
        
        document.querySelector(SELECTORS.lockBtn).addEventListener('click', () => {
            document.querySelector(SELECTORS.lockBtn).classList.toggle('active');
            updateLockState();
        });
        
        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const payload = serializeForm();
            try {
                await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                showToast('คัดลอก JSON สำเร็จ', 'success');
            } catch (err) {
                showToast('ไม่สามารถคัดลอก JSON ได้', 'error');
                console.error('Failed to copy JSON: ', err);
            }
            menuDropdown.classList.remove('show');
        });
        
        document.querySelector(SELECTORS.exportBtn).addEventListener('click', (e) => {
            e.preventDefault();
            const payload = serializeForm();
            const jsonString = JSON.stringify(payload, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", URL.createObjectURL(blob));
            downloadAnchorNode.setAttribute("download", `quotation_${payload.customer.customer_name || 'data'}.json`);
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
    
    // Additional functions
    function toggleSetFabricUI(setEl) {
        const variant = setEl.querySelector('[name="fabric_variant"]').value;
        const sheerWrap = setEl.querySelector(SELECTORS.sheerWrap);
        const setPriceInput = setEl.querySelector('[name="set_price_per_m"]');
        
        if (variant === 'ทึบ') {
            sheerWrap.style.display = 'none';
            setPriceInput.disabled = false;
        } else if (variant === 'โปร่ง') {
            sheerWrap.style.display = 'none';
            setPriceInput.disabled = true;
        } else {
            sheerWrap.style.display = 'flex';
            setPriceInput.disabled = false;
        }
    }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((roomEl, roomIndex) => {
            roomEl.querySelector(SELECTORS.roomNameInput).placeholder = `ชื่อห้อง #${roomIndex + 1}`;
        });
        document.querySelectorAll(SELECTORS.set).forEach((setEl, setIndex) => {
            const title = setEl.querySelector('.item-title > span');
            if (title) title.textContent = `ผ้าม่าน #${setIndex + 1}`;
        });
        document.querySelectorAll(SELECTORS.decoItem).forEach((decoEl, decoIndex) => {
            const title = decoEl.querySelector('.item-title > span');
            if (title) title.textContent = `ของตกแต่ง #${decoIndex + 1}`;
        });
        document.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaperEl, wallpaperIndex) => {
            const title = wallpaperEl.querySelector('.item-title > span');
            if (title) title.textContent = `วอลล์เปเปอร์ #${wallpaperIndex + 1}`;
        });
    }

    // --- START THE APP ---
    document.addEventListener('DOMContentLoaded', init);
})();