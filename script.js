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
    
    const fmtTextSummary = (n, fixed = 2) => n.toLocaleString("th-TH", { minimumFractionDigits: fixed, maximumFractionDigits: fixed });
    const fmtTextCurrency = n => n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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
    
    function copyTextSummary() {
        showCopyOptionsModal().then(options => {
            if (!options) return;
            const data = getFormData();
            let text = "";
            let customerInfoText = "";
            let roomsText = "";
            let summaryText = "";

            if (options.customer) {
                customerInfoText = `
**ข้อมูลลูกค้า**
ชื่อลูกค้า: ${data.customer_name || 'ไม่ระบุ'}
เบอร์โทรศัพท์: ${data.customer_phone || 'ไม่ระบุ'}
ที่อยู่ / รายละเอียด: ${data.customer_address || 'ไม่ระบุ'}
`.trim();
                text += customerInfoText + "\n\n";
            }
            
            if (options.details) {
                const roomDetails = data.rooms.map(room => {
                    let roomStr = `**ห้อง ${room.room_name || 'ไม่ระบุ'}**\n`;
                    if (room.is_suspended) {
                        roomStr = `**[ระงับ]** ~~ห้อง ${room.room_name || 'ไม่ระบุ'}~~`
                    }
                    if (room.total_price > 0) {
                       roomStr += ` (ยอดรวม: ${fmtTextCurrency(room.total_price)} บ.)\n`;
                    } else {
                       roomStr += `\n`
                    }
                    if (room.sets.length > 0) {
                        roomStr += "  - **ผ้าม่าน**\n";
                        room.sets.forEach((set, i) => {
                            const isSuspended = room.is_suspended || set.is_suspended;
                            const suspendedPrefix = isSuspended ? "**[ระงับ]** ~~" : "";
                            const suspendedSuffix = isSuspended ? "~~" : "";
                            const priceText = isSuspended ? "0" : fmtTextCurrency(set.total_price);
                            const yardText = isSuspended ? "0.00" : fmtTextSummary(set.opaque_fabric_yards + set.sheer_fabric_yards);
                            roomStr += `    - รายการที่ ${i + 1}: ${set.width_m}ม. x ${set.height_m}ม. (${set.fabric_variant} ${set.open_type}, ${yardText} หลา) ${suspendedPrefix}ราคา ${priceText} บ.${suspendedSuffix}\n`;
                        });
                    }
                    if (room.decorations.length > 0) {
                        roomStr += "  - **ของตกแต่ง**\n";
                        room.decorations.forEach((deco, i) => {
                            const isSuspended = room.is_suspended || deco.is_suspended;
                            const suspendedPrefix = isSuspended ? "**[ระงับ]** ~~" : "";
                            const suspendedSuffix = isSuspended ? "~~" : "";
                            const priceText = isSuspended ? "0" : fmtTextCurrency(deco.total_price);
                            roomStr += `    - รายการที่ ${i + 1}: ${deco.type || 'ไม่ระบุ'} (${deco.width_m}ม. x ${deco.height_m}ม.) ${suspendedPrefix}ราคา ${priceText} บ.${suspendedSuffix}\n`;
                        });
                    }
                    if (room.wallpapers.length > 0) {
                         roomStr += "  - **วอลเปเปอร์**\n";
                         room.wallpapers.forEach((wallpaper, i) => {
                            const isSuspended = room.is_suspended || wallpaper.is_suspended;
                            const suspendedPrefix = isSuspended ? "**[ระงับ]** ~~" : "";
                            const suspendedSuffix = isSuspended ? "~~" : "";
                            const priceText = isSuspended ? "0" : fmtTextCurrency(wallpaper.total_price);
                            const rollsText = isSuspended ? "0" : wallpaper.total_rolls;
                            roomStr += `    - รายการที่ ${i + 1}: ${wallpaper.widths_m.join('+')}ม. (สูง ${wallpaper.height_m}ม., ${rollsText} ม้วน) ${suspendedPrefix}ราคา ${priceText} บ.${suspendedSuffix}\n`;
                         });
                    }
                    return roomStr;
                }).join("\n");
                roomsText = roomDetails;
                text += roomsText + "\n\n";
            }

            if (options.summary) {
                const grandTotals = recalcAll();
                const summaryLines = [
                    `**ยอดรวมทั้งหมด: ${fmtTextCurrency(grandTotals.total)} บ.**`,
                    `จำนวน: ${grandTotals.setCount} จุดผ้าม่าน + ${grandTotals.decoCount} จุดอื่นๆ`,
                    `ผ้าทึบ: ${fmtTextSummary(grandTotals.opaqueYards)} หลา`,
                    `ผ้าโปร่ง: ${fmtTextSummary(grandTotals.sheerYards)} หลา`,
                    `รางทึบ: ${fmtTextSummary(grandTotals.opaqueTrack)} ม.`,
                    `รางโปร่ง: ${fmtTextSummary(grandTotals.sheerTrack)} ม.`
                ];
                summaryText = `**สรุปยอดรวม**\n${summaryLines.join("\n")}`;
                text += summaryText;
            }

            if (text.trim() === "") {
                showToast("ไม่มีข้อมูลให้คัดลอก", "warning");
                return;
            }

            navigator.clipboard.writeText(text.trim())
                .then(() => showToast("คัดลอกข้อความสรุปแล้ว"))
                .catch(err => {
                    console.error('Failed to copy: ', err);
                    showToast("ไม่สามารถคัดลอกข้อความได้", "error");
                });
        });
    }

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
        const newWall = frag.querySelector('.wall-input-row');
        if (prefillWidth) {
            newWall.querySelector('input[name="wall_width_m"]').value = prefillWidth;
        }
        wallsContainer.appendChild(frag);
        debouncedRecalc(); // FIXED: Add debounced recalc here
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
    
    const debouncedRecalc = debounce(() => { recalcAll(); saveData(); });

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
                if (!isSuspended) {
                    grand.decoCount++;
                    grand.setCount++;
                    roomSum += decoPrice;
                }
                updateDecoUI(deco, { decoPrice });
            });

            // --- Recalc Wallpapers ---
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                const isSuspended = isRoomSuspended || wallpaper.dataset.suspended === 'true';
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                const price = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                const widths = Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => clamp01(el.value));
                const totalWidth = widths.reduce((sum, w) => sum + w, 0);
                const rolls = CALC.wallpaperRolls(totalWidth, h);
                const wallpaperPrice = isSuspended ? 0 : Math.round(rolls * price);
                if (!isSuspended) {
                    grand.decoCount++;
                    grand.setCount++;
                    roomSum += wallpaperPrice;
                }
                updateWallpaperUI(wallpaper, { rolls, wallpaperPrice });
            });

            updateRoomUI(room, { roomSum });
            grand.total += roomSum;
        });
        updateGrandTotalUI(grand);
        return grand;
    }

    function updateSetUI(setEl, { opaquePrice, sheerPrice, opaqueYards, sheerYards, opaqueTrack, sheerTrack }) {
        const summary = setEl.querySelector('[data-set-summary]');
        if (!summary) return;
        summary.innerHTML = `
            ${opaqueYards > 0 ? `<p>ผ้าทึบ: <span>${fmt(opaqueYards)}</span> หลา</p><p>รางทึบ: <span>${fmt(opaqueTrack)}</span> ม.</p>` : ''}
            ${sheerYards > 0 ? `<p>ผ้าโปร่ง: <span>${fmt(sheerYards)}</span> หลา</p><p>รางโปร่ง: <span>${fmt(sheerTrack)}</span> ม.</p>` : ''}
            <p>ราคา: <span class="price">${fmt(opaquePrice + sheerPrice, 0)}</span> บ.</p>
        `;
    }

    function updateDecoUI(decoEl, { decoPrice }) {
        const summary = decoEl.querySelector('[data-deco-summary]');
        if (!summary) return;
        summary.innerHTML = `<p>ราคา: <span class="price">${fmt(decoPrice, 0)}</span> บ.</p>`;
    }
    
    function updateWallpaperUI(wallpaperEl, { rolls, wallpaperPrice }) {
        const summary = wallpaperEl.querySelector('[data-wallpaper-summary]');
        if (!summary) return;
        summary.innerHTML = `
            <p>ใช้ <span>${fmt(rolls, 0)}</span> ม้วน</p>
            <p>ราคา: <span class="price">${fmt(wallpaperPrice, 0)}</span> บ.</p>
        `;
    }

    function updateRoomUI(roomEl, { roomSum }) {
        const roomBrief = roomEl.querySelector('[data-room-brief]');
        const roomSummary = roomEl.querySelector('[data-room-summary]');
        const setCount = roomEl.querySelectorAll('.item-card:not(.is-suspended)').length;
        if (roomBrief) roomBrief.innerHTML = `<span class="num">${setCount}</span> จุด • ราคา <span class="num price">${fmt(roomSum, 0)}</span> บ.`;
        if (roomSummary) roomSummary.innerHTML = `ยอดรวมห้อง: <span class="price">${fmt(roomSum, 0)}</span> บ.`;
    }

    function updateGrandTotalUI({ total, opaqueYards, sheerYards, opaqueTrack, sheerTrack, setCount, decoCount }) {
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(total, 0) + ' บ.';
        document.querySelector(SELECTORS.grandFabric).textContent = fmt(opaqueYards) + ' หลา';
        document.querySelector(SELECTORS.grandSheerFabric).textContent = fmt(sheerYards) + ' หลา';
        document.querySelector(SELECTORS.grandOpaqueTrack).textContent = fmt(opaqueTrack) + ' ม.';
        document.querySelector(SELECTORS.grandSheerTrack).textContent = fmt(sheerTrack) + ' ม.';
        document.querySelector(SELECTORS.setCountSets).textContent = setCount - decoCount;
        document.querySelector(SELECTORS.setCountDeco).textContent = decoCount;
    }
    
    // --- DATA HANDLING ---
    function getFormData() {
        const data = {
            customer_name: document.querySelector('#customer_name')?.value || "",
            customer_phone: document.querySelector('#customer_phone')?.value || "",
            customer_address: document.querySelector('#customer_address')?.value || "",
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach((room) => {
            const roomData = {
                is_suspended: room.dataset.suspended === 'true',
                room_name: room.querySelector('[name="room_name"]')?.value || "",
                price_per_m_raw: toNum(room.querySelector('[name="room_price_per_m"]')?.value),
                style: room.querySelector('[name="room_style"]')?.value || "",
                total_price: 0,
                sets: [],
                decorations: [],
                wallpapers: []
            };
            const roomSummary = toNum(room.querySelector('[data-room-summary] .price')?.textContent);
            roomData.total_price = roomSummary;
            
            room.querySelectorAll(SELECTORS.set).forEach((set) => {
                const isSuspended = set.dataset.suspended === 'true';
                const total_price = toNum(set.querySelector('[data-set-summary] .price')?.textContent);
                const opaque_fabric_yards = toNum(set.querySelector('[data-set-summary] p:nth-child(1) span')?.textContent);
                const sheer_fabric_yards = toNum(set.querySelector('[data-set-summary] p:nth-child(2) span')?.textContent);
                roomData.sets.push({
                    is_suspended: isSuspended,
                    width_m: toNum(set.querySelector('[name="width_m"]')?.value),
                    height_m: toNum(set.querySelector('[name="height_m"]')?.value),
                    fabric_variant: set.querySelector('[name="fabric_variant"]')?.value || "",
                    open_type: set.querySelector('[name="open_type"]')?.value || "",
                    sheer_price_per_m: toNum(set.querySelector('[name="sheer_price_per_m"]')?.value),
                    total_price,
                    opaque_fabric_yards: isSuspended ? 0 : opaque_fabric_yards,
                    sheer_fabric_yards: isSuspended ? 0 : sheer_fabric_yards
                });
            });

            room.querySelectorAll(SELECTORS.decoItem).forEach((deco) => {
                const isSuspended = deco.dataset.suspended === 'true';
                const total_price = toNum(deco.querySelector('[data-deco-summary] .price')?.textContent);
                roomData.decorations.push({
                    is_suspended: isSuspended,
                    type: deco.querySelector('[name="deco_type"]')?.value || "",
                    width_m: toNum(deco.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(deco.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: toNum(deco.querySelector('[name="deco_price_sqyd"]')?.value),
                    total_price
                });
            });

            room.querySelectorAll(SELECTORS.wallpaperItem).forEach((wallpaper) => {
                const isSuspended = wallpaper.dataset.suspended === 'true';
                const total_price = toNum(wallpaper.querySelector('[data-wallpaper-summary] .price')?.textContent);
                const total_rolls = toNum(wallpaper.querySelector('[data-wallpaper-summary] span')?.textContent);
                roomData.wallpapers.push({
                    is_suspended: isSuspended,
                    height_m: toNum(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value),
                    widths_m: Array.from(wallpaper.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)),
                    total_price,
                    total_rolls: isSuspended ? 0 : total_rolls
                });
            });

            data.rooms.push(roomData);
        });
        return data;
    }
    
    function saveData() {
        try {
            const data = getFormData();
            const payload = JSON.stringify(data);
            document.querySelector(SELECTORS.payloadInput).value = payload;
            localStorage.setItem(STORAGE_KEY, payload);
            console.log("Data saved to localStorage.");
        } catch (e) {
            console.error("Failed to save data:", e);
        }
    }
    
    function loadData() {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (!storedData) return;
        try {
            const data = JSON.parse(storedData);
            if (!data) return;

            document.querySelector('#customer_name').value = data.customer_name || "";
            document.querySelector('#customer_phone').value = data.customer_phone || "";
            document.querySelector('#customer_address').value = data.customer_address || "";
            
            roomsEl.innerHTML = "";
            (data.rooms || []).forEach(roomData => addRoom(roomData));
            
            if (data.is_locked) {
                toggleLock(null, true);
            }
            renumber();
            recalcAll();
            showToast('โหลดข้อมูลที่บันทึกไว้แล้ว');
        } catch (e) {
            console.error("Failed to load data:", e);
            localStorage.removeItem(STORAGE_KEY);
        }
    }
    
    // --- EVENT LISTENERS ---
    function initEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.closest(SELECTORS.menuBtn)) {
                e.preventDefault();
                document.querySelector(SELECTORS.menuDropdown)?.classList.toggle('show');
            } else if (!e.target.closest('.dropdown-wrapper')) {
                 document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('show'));
            }
        });

        orderForm.addEventListener('click', handleActionClick);
        orderForm.addEventListener('input', (e) => {
            const action = e.target.dataset.act;
            if (action !== 'add-wall' && action !== 'del-wall') {
                debouncedRecalc();
            }
        });
        
        document.querySelector(SELECTORS.addRoomHeaderBtn)?.addEventListener('click', (e) => {
            e.preventDefault();
            addRoom();
        });

        document.querySelector(SELECTORS.copyTextBtn)?.addEventListener('click', (e) => {
            e.preventDefault();
            copyTextSummary();
        });
        
        document.querySelector(SELECTORS.copyJsonBtn)?.addEventListener('click', (e) => {
            e.preventDefault();
            copyJson();
        });
        
        document.querySelector(SELECTORS.clearAllBtn)?.addEventListener('click', (e) => {
            e.preventDefault();
            clearAll();
        });

        document.querySelector(SELECTORS.lockBtn)?.addEventListener('click', (e) => {
            e.preventDefault();
            toggleLock();
        });

        document.querySelector(SELECTORS.importBtn)?.addEventListener('click', async (e) => {
            e.preventDefault();
            const result = await showModal(SELECTORS.importModal);
            if (!result) return;
            const jsonText = document.querySelector(SELECTORS.importJsonArea).value;
            importData(jsonText);
        });

        document.querySelector(SELECTORS.exportBtn)?.addEventListener('click', (e) => {
            e.preventDefault();
            exportData();
        });
        
        document.querySelector('#customerInfo')?.addEventListener('input', debouncedRecalc);
    }
    
    async function handleActionClick(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        e.preventDefault();
        const action = btn.dataset.act;
        const itemEl = btn.closest('.item-card, .room-card');

        const actions = {
            'add-room': () => addRoom(),
            'add-set': () => addSet(itemEl),
            'add-deco': () => addDeco(itemEl),
            'add-wallpaper': () => addWallpaper(itemEl),
            'del-room': async () => { if (isLocked || !await showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) return; itemEl.remove(); roomCount = document.querySelectorAll(SELECTORS.room).length; renumber(); recalcAll(); saveData(); showToast('ลบห้องแล้ว', 'error'); },
            'del-set': async () => { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการนี้?')) return; itemEl.remove(); renumber(); recalcAll(); saveData(); showToast('ลบรายการแล้ว', 'error'); },
            'del-deco': async () => { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการนี้?')) return; itemEl.remove(); renumber(); recalcAll(); saveData(); showToast('ลบรายการแล้ว', 'error'); },
            'del-wallpaper': async () => { if (isLocked || !await showConfirmation('ลบรายการ', 'ยืนยันการลบรายการนี้?')) return; itemEl.remove(); renumber(); recalcAll(); saveData(); showToast('ลบรายการแล้ว', 'error'); },
            'clear-set': async () => { if (isLocked || !await showConfirmation('ล้างข้อมูล', 'ยืนยันการล้างข้อมูลในรายการนี้?')) return; itemEl.querySelectorAll('input, select').forEach(el => { el.value = ''; }); toggleSetFabricUI(itemEl); debouncedRecalc(); },
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
    
    function copyJson() {
        try {
            const data = getFormData();
            const jsonStr = JSON.stringify(data, null, 2);
            navigator.clipboard.writeText(jsonStr)
                .then(() => showToast('คัดลอก JSON แล้ว'))
                .catch(() => showToast('ไม่สามารถคัดลอก JSON ได้', 'error'));
        } catch (e) {
            console.error("Error copying JSON:", e);
            showToast("เกิดข้อผิดพลาดในการคัดลอก JSON", "error");
        }
    }

    function clearAll() {
        showConfirmation("ล้างข้อมูลทั้งหมด", "ยืนยันการล้างข้อมูลทั้งหมด? ข้อมูลที่บันทึกไว้ในเครื่องจะถูกลบไปด้วย")
            .then(confirm => {
                if (confirm) {
                    roomsEl.innerHTML = "";
                    roomCount = 0;
                    document.querySelector('#customer_name').value = '';
                    document.querySelector('#customer_phone').value = '';
                    document.querySelector('#customer_address').value = '';
                    localStorage.removeItem(STORAGE_KEY);
                    recalcAll();
                    showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
                }
            });
    }

    function toggleLock(force = null, isLoad = false) {
        if (!isLoad) {
            showConfirmation(isLocked ? 'ปลดล็อค' : 'ล็อคฟอร์ม', isLocked ? 'ยืนยันการปลดล็อคฟอร์ม?' : 'เมื่อล็อคฟอร์มแล้วจะไม่สามารถแก้ไขข้อมูลได้ ยืนยันที่จะล็อคฟอร์ม?')
                .then(confirm => {
                    if (confirm) {
                        isLocked = !isLocked;
                        updateLockState();
                    }
                });
        } else {
            isLocked = force;
            updateLockState();
        }
    }

    function updateLockState() {
        const inputs = document.querySelectorAll('input, select, textarea, button:not(#menuBtn):not(#lockBtn):not(#exportBtn):not(#importBtn):not([data-act="menu-room"]):not([data-act="menu-item"])');
        inputs.forEach(input => { input.disabled = isLocked; });
        document.querySelector(SELECTORS.lockBtn).querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อคฟอร์ม';
        const lockIcon = document.querySelector(SELECTORS.lockBtn).querySelector('.material-symbols-outlined');
        lockIcon.textContent = isLocked ? 'lock' : 'lock_open';
        showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว');
        saveData();
    }
    
    function exportData() {
        const data = getFormData();
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marnthara_data_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('ดาวน์โหลดข้อมูลแล้ว');
    }

    function importData(jsonText) {
        try {
            const data = JSON.parse(jsonText);
            localStorage.setItem(STORAGE_KEY, jsonText);
            loadData();
            showToast('นำเข้าข้อมูลสำเร็จ');
        } catch (e) {
            showToast('ไฟล์ JSON ไม่ถูกต้อง', 'error');
            console.error("Import error:", e);
        }
    }
    
    function toggleSetFabricUI(setEl) {
        const variant = setEl.querySelector('select[name="fabric_variant"]')?.value;
        const sheerWrap = setEl.querySelector(SELECTORS.sheerWrap);
        if (sheerWrap) {
            sheerWrap.style.display = (variant === 'โปร่ง' || variant === 'ทึบ&โปร่ง') ? 'block' : 'none';
        }
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
        document.getElementById('appVersion').textContent = APP_VERSION;
    });

})();