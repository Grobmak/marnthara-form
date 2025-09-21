(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.3.8-ux-reverted";
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
            const stripsPerRoll = (height > 2.5) ? Math.floor(10 / height) : 3;
            if (stripsPerRoll <= 0) return Infinity;
            const stripsNeeded = Math.ceil(totalWidth / 0.53);
            return Math.ceil(stripsNeeded / stripsPerRoll);
        }
    };

    const SELECTORS = {
        orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
        payloadInput: '#payload', clearAllBtn: '#clearAllBtn',
        lockBtn: '#lockBtn', addRoomFooterBtn: '#addRoomFooterBtn', lockText: '#lockText',
        grandTotal: '#grandTotal', setCount: '#setCount',
        detailedSummaryContainer: '#detailed-material-summary',
        modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
        room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
        decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
        wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
        sheerWrap: '[data-sheer-wrap]',
        sheerCodeWrap: '[data-sheer-code-wrap]', // MODIFIED: Added selector
        roomNameInput: 'input[name="room_name"]',
        toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', fileImporter: '#fileImporter',
        submitBtn: '#submitBtn',
        clearItemsBtn: '#clearItemsBtn',
        exportPdfBtn: '#exportPdfBtn'
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
        const parentContainer = item.parentElement.closest('.card, .items-container');
        if (parentContainer) {
            parentContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        item.classList.add('item-removing');
        item.addEventListener('animationend', () => {
            item.remove();
            renumber();
            recalcAll();
            saveData();
        }, { once: true });
    }

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
        const modalEl = document.querySelector(SELECTORS.copyOptionsModal);
        modalEl.querySelectorAll('input[name="copy_option"]').forEach(radio => radio.checked = false);
        if (!await showModal(SELECTORS.copyOptionsModal)) return false;
        const selected = modalEl.querySelector('input[name="copy_option"]:checked');
        return selected ? selected.value : false;
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
            if (prefill.is_suspended) {
                setTimeout(() => suspendRoom(created, true, false), 0);
            }
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }

        renumber();
        recalcAll();
        saveData();
        if (!prefill) {
            showToast('เพิ่มห้องใหม่แล้ว', 'success');
            animateAndScroll(created);
        }
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
            created.querySelector('input[name="width_m"]').value = prefill.width_m > 0 ? prefill.width_m.toFixed(2) : "";
            created.querySelector('input[name="height_m"]').value = prefill.height_m > 0 ? prefill.height_m.toFixed(2) : "";
            created.querySelector('select[name="set_style"]').value = prefill.style || "ลอน";
            created.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
            created.querySelector('select[name="set_price_per_m"]').value = prefill.price_per_m_raw || "";
            created.querySelector('select[name="sheer_price_per_m"]').value = prefill.sheer_price_per_m || "";
            created.querySelector('input[name="fabric_code"]').value = prefill.fabric_code || "";
            created.querySelector('input[name="sheer_fabric_code"]').value = prefill.sheer_fabric_code || ""; // MODIFIED: Populate new field
            created.querySelector('select[name="opening_style"]').value = prefill.opening_style || "แยกกลาง";
            created.querySelector('select[name="track_color"]').value = prefill.track_color || "ขาว";
            created.querySelector('input[name="notes"]').value = prefill.notes || "";
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
             animateAndScroll(created);
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
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m > 0 ? prefill.width_m.toFixed(2) : "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m > 0 ? prefill.height_m.toFixed(2) : "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmt(prefill.price_sqyd, 0, true) ?? "";
            created.querySelector('[name="deco_code"]').value = prefill.deco_code || "";
            created.querySelector('[name="deco_notes"]').value = prefill.deco_notes || "";
            const displayEl = created.querySelector('.deco-type-display');
            if (displayEl && type) {
                displayEl.textContent = `(${type})`;
            }
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
            animateAndScroll(created);
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
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m > 0 ? prefill.height_m.toFixed(2) : "";
            created.querySelector('[name="wallpaper_code"]').value = prefill.wallpaper_code || "";
            created.querySelector('[name="wallpaper_price_roll"]').value = fmt(prefill.price_per_roll, 0, true) ?? "";
            created.querySelector('[name="wallpaper_install_cost"]').value = fmt(prefill.install_cost_per_roll ?? 300, 0, true);
            created.querySelector('[name="wallpaper_notes"]').value = prefill.wallpaper_notes || "";
            (prefill.widths || []).forEach(w => addWall(created.querySelector('[data-act="add-wall"]'), w));
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else {
            addWall(created.querySelector('[data-act="add-wall"]'));
            animateAndScroll(created);
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
            frag.querySelector('input[name="wall_width_m"]').value = prefillWidth > 0 ? prefillWidth.toFixed(2) : "";
        }
        wallsContainer.appendChild(frag);

        const newWallInputRow = wallsContainer.querySelector('.wall-input-row:last-of-type');
        if (newWallInputRow) {
            animateAndScroll(newWallInputRow);
            newWallInputRow.querySelector('input').focus();
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

    function suspendRoom(roomEl, isSuspended, notify = true) {
        roomEl.dataset.suspended = isSuspended;
        roomEl.classList.toggle('is-suspended', isSuspended);

        const suspendText = roomEl.querySelector('[data-act="toggle-suspend-room"] span');
        if (suspendText) {
            suspendText.textContent = isSuspended ? 'ใช้งานห้อง' : 'ระงับห้อง';
        }

        roomEl.querySelectorAll('.set-item, .deco-item, .wallpaper-item').forEach(item => {
            suspendItem(item, isSuspended, false);
        });

        if (notify) showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว', 'warning`);
        recalcAll();
        saveData();
    }

    async function performActionWithConfirmation(btn, actionConfig) {
        if (isLocked) return;

        if (actionConfig.confirm && !await showConfirmation(actionConfig.title, actionConfig.body)) return;

        const item = btn.closest(actionConfig.selector);
        if (!item) return;

        if (actionConfig.toast) showToast(actionConfig.toast, 'success');

        if (actionConfig.isRemoval) {
            actionConfig.action(item);
        } else {
            actionConfig.action(item, btn);
            renumber();
            recalcAll();
            saveData();
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
            const isRoomSuspended = room.dataset.suspended === 'true';

            // CURTAIN SETS
            room.querySelectorAll(SELECTORS.set).forEach(set => {
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
                if (set.dataset.suspended !== 'true' && !isRoomSuspended) {
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
                if (deco.dataset.suspended !== 'true' && !isRoomSuspended) {
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
                let wallpaperPrice = 0;
                let wallTotalWidth = 0;
                let rolls = 0;
                if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                    const installCost = clamp01(wallpaper.querySelector('[name="wallpaper_install_cost"]')?.value);

                    wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(wallInput => {
                        wallTotalWidth += clamp01(wallInput.value);
                    });

                    if (h > 0 && wallTotalWidth > 0 && pricePerRoll > 0) {
                        rolls = CALC.wallpaperRolls(wallTotalWidth, h);
                        wallpaperPrice = Math.round(rolls * pricePerRoll + rolls * installCost);
                        if (wallpaperPrice > 0) { pricedItemCount++; }
                    }
                }
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <b>${fmt(wallpaperPrice, 0, true)}</b> บ. • จำนวน: <b>${fmt(rolls, 0, false)}</b> ม้วน`;
                roomSum += wallpaperPrice;
                totalWallpaperRolls += rolls;
            });

            room.querySelector('[data-room-brief]').textContent = `รวม ${fmt(roomSum, 0, true)} บ.`;
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

        // Populate detailed summary
        const detailedSummary = [];
        if (grandOpaqueYards > 0) detailedSummary.push(`- ผ้าม่านทึบ: ${fmt(grandOpaqueYards, 2)} หลา`);
        if (grandSheerYards > 0) detailedSummary.push(`- ผ้าม่านโปร่ง: ${fmt(grandSheerYards, 2)} หลา`);
        if (grandOpaqueTrack > 0) detailedSummary.push(`- รางผ้าม่านทึบ: ${fmt(grandOpaqueTrack, 2)} ม.`);
        if (grandSheerTrack > 0) detailedSummary.push(`- รางผ้าม่านโปร่ง: ${fmt(grandSheerTrack, 2)} ม.`);
        if (hasDoubleBracket) detailedSummary.push(`- ขาจับรางคู่: ตามจำนวนชุด`);
        if (totalWallpaperRolls > 0) detailedSummary.push(`- วอลล์เปเปอร์: ${fmt(totalWallpaperRolls, 0, false)} ม้วน`);
        for (const type in decoCounts) {
            detailedSummary.push(`- ${type}: ${decoCounts[type]} รายการ`);
        }

        const summaryHtml = detailedSummary.length > 0 ? detailedSummary.join('<br>') : "ไม่มีรายการ";
        document.querySelector(SELECTORS.detailedSummaryContainer).innerHTML = summaryHtml;
    }

    // --- DATA HANDLING ---
    function getPayload() {
        const payload = {
            customer_name: document.getElementById('customer_name')?.value || "",
            customer_phone: document.getElementById('customer_phone')?.value || "",
            customer_address: document.getElementById('customer_address')?.value || "",
            total_price: toNum(document.querySelector(SELECTORS.grandTotal).textContent),
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const isSuspended = roomEl.dataset.suspended === 'true';
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || "",
                is_suspended: isSuspended,
                sets: [],
                decorations: [],
                wallpapers: []
            };
            if (isSuspended) {
                payload.rooms.push(roomData);
                return;
            }

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                if (setEl.dataset.suspended === 'true') return;
                const width_m = toNum(setEl.querySelector('[name="width_m"]')?.value);
                const height_m = toNum(setEl.querySelector('[name="height_m"]')?.value);
                const price_per_m_raw = toNum(setEl.querySelector('[name="set_price_per_m"]')?.value);
                const sheer_price_per_m = toNum(setEl.querySelector('[name="sheer_price_per_m"]')?.value);

                if (width_m > 0 && height_m > 0 && (price_per_m_raw > 0 || sheer_price_per_m > 0)) {
                    roomData.sets.push({
                        style: setEl.querySelector('[name="set_style"]')?.value,
                        fabric_variant: setEl.querySelector('[name="fabric_variant"]')?.value,
                        width_m: width_m,
                        height_m: height_m,
                        price_per_m_raw: price_per_m_raw,
                        sheer_price_per_m: sheer_price_per_m,
                        fabric_code: setEl.querySelector('[name="fabric_code"]')?.value,
                        sheer_fabric_code: setEl.querySelector('[name="sheer_fabric_code"]')?.value,
                        opening_style: setEl.querySelector('[name="opening_style"]')?.value,
                        track_color: setEl.querySelector('[name="track_color"]')?.value,
                        notes: setEl.querySelector('[name="notes"]')?.value
                    });
                }
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                if (decoEl.dataset.suspended === 'true') return;
                const width_m = toNum(decoEl.querySelector('[name="deco_width_m"]')?.value);
                const height_m = toNum(decoEl.querySelector('[name="deco_height_m"]')?.value);
                const price_sqyd = toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value);

                if (width_m > 0 && height_m > 0 && price_sqyd > 0) {
                    roomData.decorations.push({
                        type: decoEl.querySelector('[name="deco_type"]')?.value,
                        price_sqyd: price_sqyd,
                        width_m: width_m,
                        height_m: height_m,
                        deco_code: decoEl.querySelector('[name="deco_code"]')?.value,
                        deco_notes: decoEl.querySelector('[name="deco_notes"]')?.value,
                    });
                }
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                if (wallpaperEl.dataset.suspended === 'true') return;
                const price_per_roll = toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value);
                const install_cost = toNum(wallpaperEl.querySelector('[name="wallpaper_install_cost"]')?.value);
                const height_m = toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value);
                const widths = Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(input => toNum(input.value)).filter(w => w > 0);

                if (price_per_roll > 0 && height_m > 0 && widths.length > 0) {
                    roomData.wallpapers.push({
                        wallpaper_code: wallpaperEl.querySelector('[name="wallpaper_code"]')?.value,
                        price_per_roll: price_per_roll,
                        install_cost_per_roll: install_cost,
                        height_m: height_m,
                        widths: widths,
                        wallpaper_notes: wallpaperEl.querySelector('[name="wallpaper_notes"]')?.value
                    });
                }
            });

            payload.rooms.push(roomData);
        });

        return payload;
    }

    function saveData() {
        const payload = getPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function loadPayload(payload) {
        if (!payload || !payload.rooms) return;
        document.getElementById('customer_name').value = payload.customer_name || "";
        document.getElementById('customer_phone').value = payload.customer_phone || "";
        document.getElementById('customer_address').value = payload.customer_address || "";
        document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
        payload.rooms.forEach(r => addRoom(r));
        recalcAll();
        showToast('ข้อมูลถูกนำเข้าแล้ว', 'success');
    }

    // PDF Generation
    async function generatePDF() {
        // Hide the UI and show a loading toast
        showToast('กำลังสร้างไฟล์ PDF...', 'info');

        // Fetch data
        const data = getPayload();
        
        // Populate the hidden PDF template
        const pdfContainer = document.getElementById('pdf-template');
        document.getElementById('pdf-customer-name').textContent = data.customer_name;
        document.getElementById('pdf-customer-phone').textContent = data.customer_phone;
        document.getElementById('pdf-customer-address').textContent = data.customer_address;
        document.getElementById('pdf-date').textContent = new Date().toLocaleDateString('th-TH');
        
        const roomsContainer = document.getElementById('pdf-rooms-container');
        roomsContainer.innerHTML = '';
        const summaryBody = document.getElementById('pdf-summary-body');
        summaryBody.innerHTML = '';
        
        let grandTotal = 0;
        
        data.rooms.forEach((room, roomIndex) => {
            if (room.is_suspended) return;
            
            const roomTitle = document.createElement('h2');
            roomTitle.textContent = `ห้องที่ ${roomIndex + 1}: ${room.room_name}`;
            roomsContainer.appendChild(roomTitle);
            
            const table = document.createElement('table');
            table.className = 'item-table';
            table.innerHTML = `
                <thead>
                    <tr>
                        <th style="width: 5%;">#</th>
                        <th style="width: 35%;">รายละเอียด</th>
                        <th style="width: 30%;">ขนาด (กว้าง x สูง)</th>
                        <th>ราคา (บาท)</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            const tbody = table.querySelector('tbody');
            
            let itemIndex = 1;
            let roomTotal = 0;
            
            // Sets
            room.sets.forEach(set => {
                const row = tbody.insertRow();
                row.insertCell().textContent = itemIndex++;
                let details = '';
                if (set.fabric_variant.includes('ทึบ')) {
                    const price = Math.round((set.price_per_m_raw + stylePlus(set.style) + heightPlus(set.height_m)) * set.width_m);
                    roomTotal += price;
                    details += `ผ้าม่านทึบ (${set.style}, ${set.fabric_code || '-'}) ราคา ${fmt(set.price_per_m_raw, 0, true)} บ./ม.`;
                }
                if (set.fabric_variant.includes('โปร่ง')) {
                    if (details !== '') details += ' และ ';
                    const price = Math.round((set.sheer_price_per_m + stylePlus(set.style) + heightPlus(set.height_m)) * set.width_m);
                    roomTotal += price;
                    details += `ผ้าม่านโปร่ง (${set.style}, ${set.sheer_fabric_code || '-'}) ราคา ${fmt(set.sheer_price_per_m, 0, true)} บ./ม.`;
                }
                
                row.insertCell().innerHTML = details;
                row.insertCell().textContent = `${fmt(set.width_m, 2)} x ${fmt(set.height_m, 2)} ม.`;
                row.insertCell().textContent = fmt(roomTotal, 0, true);
            });
            
            // Decorations
            room.decorations.forEach(deco => {
                const row = tbody.insertRow();
                const price = Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
                roomTotal += price;
                row.insertCell().textContent = itemIndex++;
                row.insertCell().textContent = `${deco.type} (${deco.deco_code || '-'}) ราคา ${fmt(deco.price_sqyd, 0, true)} บ./ตร.หลา`;
                row.insertCell().textContent = `${fmt(deco.width_m, 2)} x ${fmt(deco.height_m, 2)} ม.`;
                row.insertCell().textContent = fmt(price, 0, true);
            });
            
            // Wallpapers
            room.wallpapers.forEach(wallpaper => {
                const totalWidth = wallpaper.widths.reduce((sum, w) => sum + w, 0);
                const rolls = CALC.wallpaperRolls(totalWidth, wallpaper.height_m);
                const price = Math.round(rolls * wallpaper.price_per_roll + rolls * wallpaper.install_cost_per_roll);
                roomTotal += price;
                
                const row = tbody.insertRow();
                row.insertCell().textContent = itemIndex++;
                row.insertCell().textContent = `วอลล์เปเปอร์ (${wallpaper.wallpaper_code || '-'}) ราคา ${fmt(wallpaper.price_per_roll, 0, true)} บ./ม้วน`;
                row.insertCell().textContent = `รวม ${fmt(totalWidth, 2)} ม. (ใช้ ${fmt(rolls, 0)} ม้วน)`;
                row.insertCell().textContent = fmt(price, 0, true);
            });
            
            if (itemIndex > 1) { // If there's at least one item
                const roomTotalRow = tbody.insertRow();
                roomTotalRow.className = 'total-row';
                roomTotalRow.innerHTML = `<td colspan="3" style="text-align: right;"><strong>รวมราคาทั้งหมดห้องนี้</strong></td><td><strong>${fmt(roomTotal, 0, true)}</strong></td>`;
                roomsContainer.appendChild(table);
            }
            
            grandTotal += roomTotal;
        });
        
        document.getElementById('pdf-grand-total').textContent = fmt(grandTotal, 0, true);
        
        // Use a slight delay to ensure the DOM has rendered the template
        setTimeout(() => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            
            // Use html2canvas with the hidden template
            doc.html(pdfContainer, {
                callback: function (doc) {
                    doc.save(`ใบเสนอราคา_Marnthara_${data.customer_name}.pdf`);
                    showToast('สร้างไฟล์ PDF สำเร็จ', 'success');
                },
                x: 10,
                y: 10,
                html2canvas: {
                    scale: 0.25, // Adjust scale for better resolution and fit
                    ignoreElements: (element) => element.classList.contains('hidden')
                }
            });
        }, 500);
    }
    
    // UI Event Listeners
    function setupEventListeners() {
        // ... (existing event listeners) ...
        
        // Add PDF export button listener
        document.querySelector(SELECTORS.exportPdfBtn).addEventListener('click', (e) => {
            e.preventDefault();
            generatePDF();
        });
    }

    // Initialize the app
    function init() {
        setupEventListeners();
        // ... (existing init code) ...
    }

    document.addEventListener('DOMContentLoaded', init);
})();