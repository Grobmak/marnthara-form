(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.4.0-material3-glass";
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
            created.querySelector('input[name="width_m"]').value = prefill.width_m ?? "";
            created.querySelector('input[name="height_m"]').value = prefill.height_m ?? "";
            created.querySelector('select[name="set_style"]').value = prefill.style || "ลอน";
            created.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
            created.querySelector('select[name="set_price_per_m"]').value = prefill.price_per_m_raw || "";
            created.querySelector('select[name="sheer_price_per_m"]')?.value = prefill.sheer_price_per_m || "";
            created.querySelector('input[name="fabric_code"]').value = prefill.fabric_code || "";
            created.querySelector('select[name="opening_style"]').value = prefill.opening_style || "แยกกลาง";
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
            created.querySelector('[name="deco_width_m"]').value = prefill.width_m ?? "";
            created.querySelector('[name="deco_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="deco_price_sqyd"]').value = fmt(prefill.price_sqyd, 0, true) ?? "";
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
            created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m ?? "";
            created.querySelector('[name="wallpaper_price_roll"]').value = fmt(prefill.price_per_roll, 0, true) ?? "";
            created.querySelector('[name="wallpaper_install_cost"]').value = fmt(prefill.install_cost_per_roll ?? 300, 0, true);
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
            frag.querySelector('input[name="wall_width_m"]').value = prefillWidth;
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
    
        if (notify) showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
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
                let decoPrice = 0;
                if (deco.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const w = clamp01(deco.querySelector('input[name="deco_width_m"]')?.value);
                    const h = clamp01(deco.querySelector('input[name="deco_height_m"]')?.value);
                    const priceSqYd = clamp01(deco.querySelector('input[name="deco_price_sqyd"]')?.value);
                    const type = deco.querySelector('input[name="deco_type"]')?.value;

                    if (w > 0 && h > 0 && priceSqYd > 0) {
                        decoPrice = Math.round(w * h * SQM_TO_SQYD * priceSqYd);
                        pricedItemCount++;
                    }
                    if (type) decoCounts[type] = (decoCounts[type] || 0) + 1;
                }
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmt(decoPrice, 0, true)}</b> บ.`;
                roomSum += decoPrice;
            });

            // WALLPAPERS
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let wallpaperPrice = 0, rollCount = 0;
                if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const h = clamp01(wallpaper.querySelector('input[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('input[name="wallpaper_price_roll"]')?.value);
                    const installCost = clamp01(wallpaper.querySelector('input[name="wallpaper_install_cost"]')?.value);
                    let totalWidth = 0;
                    wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                        totalWidth += clamp01(input.value);
                    });
                    if (totalWidth > 0 && h > 0 && pricePerRoll > 0) {
                        rollCount = CALC.wallpaperRolls(totalWidth, h);
                        wallpaperPrice = Math.round(rollCount * pricePerRoll + rollCount * installCost);
                        pricedItemCount++;
                    }
                }
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <b>${fmt(wallpaperPrice, 0, true)}</b> บ. (${rollCount} ม้วน)`;
                roomSum += wallpaperPrice;
                totalWallpaperRolls += rollCount;
            });

            room.querySelector('[data-room-brief]').textContent = `รวม ${fmt(roomSum, 0, true)} บ.`;
            grand += roomSum;
        });
        
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;
        generateDetailedSummary(grandOpaqueYards, grandSheerYards, grandOpaqueTrack, grandSheerTrack, totalWallpaperRolls, decoCounts, hasDoubleBracket);
    }

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, roomIdx) => {
            room.querySelector('.room-name-input').placeholder = `ห้อง ${roomIdx + 1}`;
            room.querySelectorAll('.item-card').forEach((item, itemIdx) => {
                const titleSpan = item.querySelector('.item-number');
                if (titleSpan) titleSpan.textContent = itemIdx + 1;
            });
        });
    }

    function toggleSetFabricUI(set) {
        const variantSelect = set.querySelector('select[name="fabric_variant"]');
        const setPriceGroup = set.querySelector('select[name="set_price_per_m"]').closest('.form-group');
        const sheerPriceRow = set.querySelector('.sheer-price-row');
        const sheerWrap = set.querySelector(SELECTORS.sheerWrap);

        if (!variantSelect || !setPriceGroup || !sheerPriceRow || !sheerWrap) return;
        
        const variant = variantSelect.value;
        const hasOpaque = variant.includes("ทึบ");
        const hasSheer = variant.includes("โปร่ง");

        setPriceGroup.style.display = hasOpaque ? '' : 'none';
        sheerPriceRow.style.display = hasSheer ? 'grid' : 'none';
        sheerWrap.style.display = hasSheer ? '' : 'none';

        set.classList.toggle('has-sheer', hasSheer);
        set.classList.toggle('has-opaque', hasOpaque);
    }
    
    function generateDetailedSummary(grandOpaqueYards, grandSheerYards, grandOpaqueTrack, grandSheerTrack, totalWallpaperRolls, decoCounts, hasDoubleBracket) {
        const summaryContainer = document.querySelector(SELECTORS.detailedSummaryContainer);
        if (!summaryContainer) return;
        
        let summaryHtml = '';

        if (grandOpaqueYards > 0) {
            summaryHtml += `<p><i class="ph ph-ruler-square"></i> รางทึบ: <b>${fmt(grandOpaqueTrack, 2)}</b> ม.
                            <br><i class="ph ph-ruler-simple"></i> ผ้าทึบ: <b>${fmt(grandOpaqueYards, 2)}</b> หลา</p>`;
        }
        if (grandSheerYards > 0) {
            summaryHtml += `<p><i class="ph ph-ruler-square"></i> รางโปร่ง: <b>${fmt(grandSheerTrack, 2)}</b> ม.
                            <br><i class="ph ph-ruler-simple"></i> ผ้าโปร่ง: <b>${fmt(grandSheerYards, 2)}</b> หลา</p>`;
        }
        if (totalWallpaperRolls > 0) {
             summaryHtml += `<p><i class="ph ph-painting-house"></i> วอลล์เปเปอร์: <b>${totalWallpaperRolls}</b> ม้วน</p>`;
        }
        for (const type in decoCounts) {
            if (decoCounts[type] > 0) {
                summaryHtml += `<p><i class="ph ph-flower-lotus"></i> ${type}: <b>${decoCounts[type]}</b> รายการ</p>`;
            }
        }
        if (hasDoubleBracket) {
            summaryHtml += `<p><i class="ph ph-brackets-angle"></i> มีรางคู่ (ตัวยึดผนัง)</p>`;
        }
        
        summaryContainer.innerHTML = summaryHtml || '<p class="text-secondary">ไม่มีข้อมูลวัสดุ</p>';
    }
    
    // --- DATA HANDLING ---
    function collectPayload() {
        const payload = {
            version: APP_VERSION,
            customer: {
                name: document.getElementById('customer_name')?.value,
                phone: document.getElementById('customer_phone')?.value,
                address: document.getElementById('customer_address')?.value,
            },
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value,
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [],
                decorations: [],
                wallpapers: []
            };

            // Sets
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    width_m: toNum(setEl.querySelector('input[name="width_m"]')?.value),
                    height_m: toNum(setEl.querySelector('input[name="height_m"]')?.value),
                    style: setEl.querySelector('select[name="set_style"]')?.value,
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value,
                    price_per_m_raw: toNum(setEl.querySelector('select[name="set_price_per_m"]')?.value),
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value),
                    fabric_code: setEl.querySelector('input[name="fabric_code"]')?.value,
                    sheer_code: setEl.querySelector('input[name="sheer_code"]')?.value,
                    opening_style: setEl.querySelector('select[name="opening_style"]')?.value,
                    notes: setEl.querySelector('input[name="notes"]')?.value,
                    is_suspended: setEl.dataset.suspended === 'true'
                });
            });

            // Decorations
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    type: decoEl.querySelector('input[name="deco_type"]')?.value,
                    width_m: toNum(decoEl.querySelector('input[name="deco_width_m"]')?.value),
                    height_m: toNum(decoEl.querySelector('input[name="deco_height_m"]')?.value),
                    price_sqyd: toNum(decoEl.querySelector('input[name="deco_price_sqyd"]')?.value),
                    is_suspended: decoEl.dataset.suspended === 'true'
                });
            });
            
            // Wallpapers
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                const widths = [];
                wallpaperEl.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                    widths.push(toNum(input.value));
                });
                roomData.wallpapers.push({
                    height_m: toNum(wallpaperEl.querySelector('input[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wallpaperEl.querySelector('input[name="wallpaper_price_roll"]')?.value),
                    install_cost_per_roll: toNum(wallpaperEl.querySelector('input[name="wallpaper_install_cost"]')?.value),
                    widths: widths,
                    is_suspended: wallpaperEl.dataset.suspended === 'true'
                });
            });

            payload.rooms.push(roomData);
        });
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
        return payload;
    }
    
    function loadPayload(payload) {
        if (!payload || !payload.rooms) return;
        document.querySelector(SELECTORS.roomsContainer).innerHTML = '';
        document.getElementById('customer_name').value = payload.customer?.name || '';
        document.getElementById('customer_phone').value = payload.customer?.phone || '';
        document.getElementById('customer_address').value = payload.customer?.address || '';
        payload.rooms.forEach(room => addRoom(room));
    }

    function saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(collectPayload()));
        } catch(err) {
            console.error("Failed to save to localStorage:", err);
            showToast("ไม่สามารถบันทึกข้อมูลได้", "error");
        }
    }
    
    // --- SUMMARY TEXT GENERATION ---
    function generateSummaryText(option) {
        const payload = collectPayload();
        let summary = '';
        if (option === 'customer') {
            summary += `สรุปราคางานสำหรับลูกค้า\n`;
            summary += `----------------------\n`;
            if (payload.customer.name) summary += `ลูกค้า: ${payload.customer.name}\n`;
            if (payload.customer.phone) summary += `เบอร์โทร: ${payload.customer.phone}\n`;
            if (payload.customer.address) summary += `ที่อยู่: ${payload.customer.address}\n\n`;
            summary += `รายการทั้งหมด:\n`;
            
            payload.rooms.forEach(room => {
                if (!room.is_suspended && room.sets.length > 0) {
                    summary += `> ${room.room_name || 'ห้อง'}\n`;
                    room.sets.forEach(set => {
                        if (!set.is_suspended && set.price_per_m_raw > 0) {
                            const total = Math.round((set.price_per_m_raw + stylePlus(set.style) + heightPlus(set.height_m)) * set.width_m);
                            summary += `  - ${set.fabric_variant} ${set.style} ขนาด ${set.width_m} x ${set.height_m} ม. | ราคา ${fmt(total, 0, true)} บ.\n`;
                        }
                    });
                }
            });
            summary += `\nรวมค่าใช้จ่ายทั้งหมด: ${fmt(toNum(document.getElementById('grandTotal').textContent), 0, true)} บ.\n`;
            summary += `\nกรุณาติดต่อสอบถามเพิ่มเติม`;
        } else if (option === 'seamstress') {
             summary += `รายละเอียดงานสำหรับช่างเย็บ\n`;
             summary += `-------------------------\n`;
             payload.rooms.forEach(room => {
                 if (!room.is_suspended && room.sets.length > 0) {
                     summary += `> ห้อง: ${room.room_name || 'ไม่ระบุ'}\n`;
                     room.sets.forEach(set => {
                         if (!set.is_suspended && set.price_per_m_raw > 0) {
                             const yards = CALC.fabricYardage(set.style, set.width_m);
                             summary += `  - ${set.fabric_variant} | รหัส: ${set.fabric_code || '-'} | ขนาด: ${set.width_m}x${set.height_m} ม. | รูปแบบ: ${set.style} | ผ้า: ${fmt(yards, 2)} หลา\n`;
                         }
                     });
                 }
             });
        } else if (option === 'owner') {
            summary = JSON.stringify(payload, null, 2);
        }
        return summary;
    }

    // --- MAIN EVENT LISTENERS ---
    function initListeners() {
        const form = document.querySelector(SELECTORS.orderForm);
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);

        form.addEventListener('input', debounce(recalcAll));
        form.addEventListener('change', debounce(recalcAll));
        form.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            e.preventDefault();
            const action = btn.dataset.act;

            const actions = {
                'add-set': { action: addSet, selector: SELECTORS.room, toast: 'เพิ่มรายการผ้าม่านแล้ว' },
                'add-deco': { action: addDeco, selector: SELECTORS.room, toast: 'เพิ่มรายการอุปกรณ์เสริมแล้ว' },
                'add-wallpaper': { action: addWallpaper, selector: SELECTORS.room, toast: 'เพิ่มรายการวอลล์เปเปอร์แล้ว' },
                'add-wall': { action: addWall, selector: SELECTORS.wallpaperItem },
                'remove-set': { action: animateAndRemove, selector: SELECTORS.set, confirm: true, title: 'ลบรายการผ้าม่าน', body: 'ยืนยันการลบรายการผ้าม่านนี้?' , isRemoval: true },
                'remove-deco': { action: animateAndRemove, selector: SELECTORS.decoItem, confirm: true, title: 'ลบรายการอุปกรณ์เสริม', body: 'ยืนยันการลบรายการอุปกรณ์เสริมนี้?' , isRemoval: true },
                'remove-wallpaper': { action: animateAndRemove, selector: SELECTORS.wallpaperItem, confirm: true, title: 'ลบรายการวอลล์เปเปอร์', body: 'ยืนยันการลบรายการวอลล์เปเปอร์นี้?' , isRemoval: true },
                'remove-wall': { action: (item) => item.remove(), selector: '.wall-input-row', isRemoval: true },
                'toggle-suspend': { action: (item) => suspendItem(item, item.dataset.suspended !== 'true'), selector: '.item-card' },
                'toggle-room-menu': { action: (item) => item.querySelector('.room-options-menu')?.classList.toggle('show') },
                'toggle-suspend-room': { action: (item) => suspendRoom(item, item.dataset.suspended !== 'true'), selector: SELECTORS.room },
            };
            if (actions[action]) {
                performActionWithConfirmation(btn, actions[action]);
            }
        });

        // Toggle Item Content for sets and deco
        roomsContainer.addEventListener('click', (e) => {
            const header = e.target.closest('.item-header');
            if (header) {
                const itemCard = header.closest('.item-card');
                itemCard.classList.toggle('is-open');
            }
        });

        // Lock button handler
        lockBtn.addEventListener('click', async () => {
            if (isLocked && !await showConfirmation('ปลดล็อกฟอร์ม?', 'หากปลดล็อกจะสามารถแก้ไขข้อมูลได้')) {
                return;
            }
            isLocked = !isLocked;
            updateLockState();
            showToast(isLocked ? 'ฟอร์มถูกล็อกแล้ว' : 'ฟอร์มถูกปลดล็อกแล้ว', 'info');
        });

        // Footer add room button
        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => {
            if (isLocked) {
                showToast('ฟอร์มถูกล็อกอยู่', 'warning');
                return;
            }
            addRoom();
        });

        // Copy JSON button
        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', (e) => {
            e.preventDefault();
            const payload = JSON.stringify(collectPayload(), null, 2);
            navigator.clipboard.writeText(payload).then(() => {
                showToast('คัดลอกข้อมูล JSON แล้ว', 'success');
            }).catch(err => {
                showToast('ไม่สามารถคัดลอกได้', 'error');
                console.error('Failed to copy JSON:', err);
            });
            menuDropdown.classList.remove('show');
        });

        // Clear all data button
        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            if (await showConfirmation('ลบข้อมูลทั้งหมด?', 'คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลทั้งหมด?')) {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            }
            menuDropdown.classList.remove('show');
        });

        // Export data button
        document.querySelector(SELECTORS.exportBtn).addEventListener('click', (e) => {
            e.preventDefault();
            const payload = JSON.stringify(collectPayload(), null, 2);
            const blob = new Blob([payload], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `marnthara_quotation_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('ส่งออกข้อมูลแล้ว', 'success');
            menuDropdown.classList.remove('show');
        });

        // Import data button
        document.querySelector(SELECTORS.importBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            menuDropdown.classList.remove('show');
            const payload = await showImportModal();
            if (payload) loadPayload(payload);
        });

        // Copy text button
        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const option = await showCopyOptionsModal();
            if (option) {
                const summaryText = generateSummaryText(option);
                navigator.clipboard.writeText(summaryText).then(() => {
                    showToast('คัดลอกข้อมูลเรียบร้อยแล้ว', 'success');
                }).catch(err => {
                    showToast('ไม่สามารถคัดลอกได้', 'error');
                    console.error('Failed to copy text:', err);
                });
            }
            menuDropdown.classList.remove('show');
        });
        
        // Submit button
        document.querySelector(SELECTORS.submitBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const payload = collectPayload();
            if (!WEBHOOK_URL.includes("your-make-webhook-url.com")) {
                showToast("ยังไม่ได้ตั้งค่า URL Webhook", "error");
                return;
            }
            if (await showConfirmation('ยืนยันการส่งข้อมูล?', 'ต้องการส่งข้อมูลนี้ไปยังระบบอัตโนมัติหรือไม่?')) {
                try {
                    const response = await fetch(WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (response.ok) {
                        showToast('ส่งข้อมูลเรียบร้อยแล้ว', 'success');
                    } else {
                        throw new Error('Server responded with an error');
                    }
                } catch (error) {
                    console.error('Error submitting data:', error);
                    showToast('การส่งข้อมูลล้มเหลว โปรดลองอีกครั้ง', 'error');
                }
            }
            menuDropdown.classList.remove('show');
        });

        // Menu & Popup Toggles
        window.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-container')) {
                document.querySelector(SELECTORS.menuDropdown).classList.remove('show');
            }
            if (!e.target.closest('[data-act="toggle-room-menu"]')) {
                document.querySelectorAll('.room-options-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });
        document.querySelector(SELECTORS.menuBtn).addEventListener('click', () => {
            menuDropdown.classList.toggle('show');
        });
    }

    function updateLockState() {
        const lockText = document.querySelector(SELECTORS.lockText);
        const lockIcon = document.querySelector('.lock-icon');
        document.querySelector(SELECTORS.orderForm).querySelectorAll('input, select, textarea, button').forEach(el => {
            const isIgnored = el.closest('.header-actions') || el.id === 'lockBtn' || el.id === 'lockText' || el.closest('.modal-wrapper') || el.closest('.summary-footer');
            if (!isIgnored) {
                el.disabled = isLocked;
            }
        });
        if (lockText) lockText.textContent = isLocked ? 'ปลดล็อก' : 'ล็อก';
        if (lockIcon) lockIcon.className = `ph-bold ph-lock-key${isLocked ? '-open' : ''} lock-icon`;
    }

    // --- START THE APP ---
    function init() {
        initListeners();
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
        recalcAll();
        updateLockState();
    }

    document.addEventListener('DOMContentLoaded', init);
})();