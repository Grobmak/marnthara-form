// script.js (updated) — replaces previous script.js
(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.3.2-ux-enhanced";
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
        // Wallpaper roll calculation
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

    // --- UTIL ---
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

    // --- UI helpers ---
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

    function animateAndScroll(element) {
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('item-created');
        element.addEventListener('animationend', () => {
            element.classList.remove('item-created');
        }, { once: true });
    }
    function animateAndRemove(item) {
        if (!item) return;
        const parentContainer = item.parentElement.closest('.card, .items-container');
        if (parentContainer) parentContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        item.classList.add('item-removing');
        item.addEventListener('animationend', () => {
            item.remove();
            renumber();
            recalcAll();
            saveData();
        }, { once: true });
    }

    // --- MODAL helpers (kept from original) ---
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

    // --- DOM adders (sets, deco, wallpaper) ---
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
            if (prefill.is_suspended) setTimeout(() => suspendRoom(created, true, false), 0);
            (prefill.sets || []).forEach(s => addSet(created, s));
            (prefill.decorations || []).forEach(d => addDeco(created, d));
            (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
        }
        renumber();
        recalcAll();
        saveData();
        if (!prefill) { showToast('เพิ่มห้องใหม่แล้ว', 'success'); animateAndScroll(created); }
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
            if (displayEl && type) displayEl.textContent = `(${type})`;
            if (prefill.is_suspended) suspendItem(created, true, false);
        } else animateAndScroll(created);
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
        if (prefillWidth) frag.querySelector('input[name="wall_width_m"]').value = prefillWidth;
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
        if (suspendIcon) suspendIcon.className = isSuspended ? 'ph-bold ph-play-circle' : 'ph-bold ph-pause-circle';
        if (notify) showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }
    function suspendRoom(roomEl, isSuspended, notify = true) {
        roomEl.dataset.suspended = isSuspended;
        roomEl.classList.toggle('is-suspended', isSuspended);
        const suspendText = roomEl.querySelector('[data-act="toggle-suspend-room"] span');
        if (suspendText) suspendText.textContent = isSuspended ? 'ใช้งานห้อง' : 'ระงับห้อง';
        roomEl.querySelectorAll('.set-item, .deco-item, .wallpaper-item').forEach(item => suspendItem(item, isSuspended, false));
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
        if (actionConfig.isRemoval) actionConfig.action(item);
        else {
            actionConfig.action(item, btn);
            renumber();
            recalcAll();
            saveData();
        }
    }

    // --- CALCULATIONS & RENDER ---
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
                    if (variant === "ทึบ&โปร่ง") hasDoubleBracket = true;
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
                    if (opaquePrice + sheerPrice > 0) pricedItemCount++;
                }

                const totalSetPrice = opaquePrice + sheerPrice;
                let summaryHtml = `ราคา: <b>${fmt(totalSetPrice, 0, true)}</b> บ.`;
                const details = [];
                if (opaquePrice > 0) details.push(`ทึบ: ${fmt(opaquePrice, 0, true)}`);
                if (sheerPrice > 0) details.push(`โปร่ง: ${fmt(sheerPrice, 0, true)}`);
                if (details.length > 0 && totalSetPrice > 0) summaryHtml += ` <small>(${details.join(', ')})</small>`;
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
                        if(type) decoCounts[type] = (decoCounts[type] || 0) + 1;
                    }
                }
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmt(decoPrice, 0, true)}</b> บ. • พื้นที่: <b>${fmt(areaSqyd, 2)}</b> ตร.หลา`;
                roomSum += decoPrice;
            });

            // WALLPAPER (modified to include area sqm)
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let totalItemPrice = 0, materialPrice = 0, installPrice = 0, areaSqm = 0, rollsNeeded = 0;
                if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                    const installCostPerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_install_cost"]')?.value);
                    const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);

                    rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                    materialPrice = Math.round(rollsNeeded * pricePerRoll);
                    installPrice = Math.round(rollsNeeded * installCostPerRoll);
                    totalItemPrice = materialPrice + installPrice;
                    areaSqm = totalWidth * h;

                    if (totalItemPrice > 0) {
                        pricedItemCount++;
                        if (Number.isFinite(rollsNeeded)) totalWallpaperRolls += rollsNeeded;
                    }
                }

                let summaryHtml = `รวม: <b>${fmt(totalItemPrice, 0, true)}</b> บ.`;
                if (totalItemPrice > 0) summaryHtml += ` <small>(วอลล์: ${fmt(materialPrice, 0, true)}, ค่าช่าง: ${fmt(installPrice, 0, true)})</small>`;
                summaryHtml += ` • ใช้ <b>${rollsNeeded}</b> ม้วน`;
                // <-- NEW: show area in ตร.ม.
                summaryHtml += ` • พื้นที่: <b>${fmt(areaSqm, 2)}</b> ตร.ม.`;

                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = summaryHtml;
                roomSum += totalItemPrice;
            });

            const itemCount = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
            room.querySelector('[data-room-brief]').innerHTML = `<span>${itemCount} รายการ • ${fmt(roomSum, 0, true)} บาท</span>`;
            grand += roomSum;
        });

        // footer
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

        // DETAILED MATERIAL SUMMARY (include wallpaper area)
        const summaryContainer = document.querySelector(SELECTORS.detailedSummaryContainer);
        if(summaryContainer) {
            let html = '';
            if (grandOpaqueYards > 0 || grandSheerYards > 0) {
                html += `<h4><i class="ph-bold ph-blinds"></i> ผ้าม่าน</h4><ul>`;
                if (grandOpaqueYards > 0) html += `<li>ผ้าทึบ: <b>${fmt(grandOpaqueYards)}</b> หลา</li>`;
                if (grandSheerYards > 0) html += `<li>ผ้าโปร่ง: <b>${fmt(grandSheerYards)}</b> หลา</li>`;
                if (grandOpaqueTrack > 0) html += `<li>รางทึบ: <b>${fmt(grandOpaqueTrack)}</b> ม.</li>`;
                if (grandSheerTrack > 0) html += `<li>รางโปร่ง: <b>${fmt(grandSheerTrack)}</b> ม.</li>`;
                if (hasDoubleBracket) html += `<li class="summary-note">** มีรายการที่ต้องใช้ขาสองชั้น</li>`;
                html += `</ul>`;
            }

            if (Object.keys(decoCounts).length > 0) {
                html += `<h4><i class="ph-bold ph-paint-roller"></i> งานตกแต่ง</h4><ul>`;
                for (const type in decoCounts) html += `<li>${type}: <b>${decoCounts[type]}</b> ชุด</li>`;
                html += `</ul>`;
            }

            if (totalWallpaperRolls > 0) {
                // compute total wallpaper area across all wallpaper items
                let totalArea = 0;
                document.querySelectorAll(SELECTORS.wallpaperItem).forEach(wp => {
                    if (wp.dataset.suspended === 'true') return;
                    const h = clamp01(wp.querySelector('[name="wallpaper_height_m"]')?.value);
                    const totalW = Array.from(wp.querySelectorAll('input[name="wall_width_m"]')).reduce((s, el) => s + clamp01(el.value), 0);
                    totalArea += totalW * h;
                });
                html += `<h4><i class="ph-bold ph-file-image"></i> วอลเปเปอร์</h4><ul>`;
                html += `<li>จำนวนที่ต้องใช้: <b>${totalWallpaperRolls}</b> ม้วน</li>`;
                html += `<li>รวมพื้นที่: <b>${fmt(totalArea, 2)}</b> ตร.ม.</li>`;
                html += `</ul>`;
            }

            if (html === '') html = '<p class="empty-summary">ยังไม่มีรายการวัสดุ</p>';
            summaryContainer.innerHTML = html;
        }
    }

    // --- PAYLOAD / EXPORT ---
    function buildPayload() {
        const payload = {
            app_version: APP_VERSION,
            customer_name: document.querySelector('[name="customer_name"]')?.value || '',
            customer_phone: document.querySelector('[name="customer_phone"]')?.value || '',
            customer_address: document.querySelector('[name="customer_address"]')?.value || '',
            rooms: []
        };

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || '',
                is_suspended: roomEl.dataset.suspended === 'true',
                sets: [], decorations: [], wallpapers: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                roomData.sets.push({
                    width_m: toNum(setEl.querySelector('input[name="width_m"]')?.value),
                    height_m: toNum(setEl.querySelector('input[name="height_m"]')?.value),
                    style: setEl.querySelector('select[name="set_style"]')?.value || '',
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value || '',
                    price_per_m_raw: toNum(setEl.querySelector('select[name="set_price_per_m"]')?.value),
                    sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value),
                    fabric_code: setEl.querySelector('input[name="fabric_code"]')?.value || '',
                    opening_style: setEl.querySelector('select[name="opening_style"]')?.value || '',
                    notes: setEl.querySelector('input[name="notes"]')?.value || '',
                    is_suspended: setEl.dataset.suspended === 'true',
                });
            });

            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value || '',
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value),
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                    is_suspended: decoEl.dataset.suspended === 'true',
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                roomData.wallpapers.push({
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    install_cost_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_install_cost"]')?.value),
                    widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)),
                    is_suspended: wallpaperEl.dataset.suspended === 'true',
                });
            });

            payload.rooms.push(roomData);
        });
        return payload;
    }

    // --- STORAGE ---
    function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload())); }

    function loadPayload(payload) {
        if (!payload || !payload.rooms) { showToast("ข้อมูลไม่ถูกต้อง", "error"); return; }
        document.querySelector('[name="customer_name"]').value = payload.customer_name || '';
        document.querySelector('[name="customer_address"]').value = payload.customer_address || '';
        document.querySelector('[name="customer_phone"]').value = payload.customer_phone || '';
        document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
        roomCount = 0;
        if (payload.rooms.length > 0) payload.rooms.forEach(addRoom);
        else addRoom();
        showToast("โหลดข้อมูลสำเร็จ", "success");
    }

    // --- UI helpers continued ---
    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            room.querySelector(SELECTORS.roomNameInput).placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            const totalItemsInRoom = items.length;
            items.forEach((item, iIdx) => {
                const titleEl = item.querySelector("[data-item-title]");
                if (titleEl) titleEl.textContent = `${iIdx + 1}/${totalItemsInRoom}`;
            });
        });
    }
    function toggleSetFabricUI(setEl) {
        if (!setEl) return;
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        setEl.querySelector(SELECTORS.sheerWrap)?.classList.toggle("hidden", !hasSheer);
    }

    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        if (!lockBtn) return;
        lockBtn.classList.toggle('is-locked', isLocked);
        lockBtn.title = isLocked ? 'ปลดล็อคฟอร์ม' : 'ล็อคฟอร์ม';
        lockBtn.querySelector('.lock-icon').className = isLocked ? 'ph-bold ph-lock-key lock-icon' : 'ph-bold ph-lock-key-open lock-icon';
        const lockTextEl = document.querySelector(SELECTORS.lockText);
        if (lockTextEl) lockTextEl.textContent = isLocked ? 'ปลดล็อค' : 'ล็อก';
        document.querySelectorAll('input, select, textarea, button').forEach(el => {
            const isExempt = el.closest('.summary-footer') || el.closest('.main-header') || el.closest('.modal-wrapper') || el.closest('.room-options-menu');
            if (!isExempt) el.disabled = isLocked;
        });
    }
    function toggleLock() { isLocked = !isLocked; updateLockState(); showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'warning'); }

    // --- TEXT summaries (add wallpaper area where relevant) ---
    function buildCustomerSummary(payload) {
        let summary = "";
        let grandTotal = 0;
        summary += `ลูกค้า: ${payload.customer_name || '-'}\n`;
        summary += `โทร: ${payload.customer_phone || '-'}\n`;
        summary += `ที่อยู่: ${payload.customer_address || '-'}\n\n`;
        payload.rooms.forEach((room, rIdx) => {
            if (room.is_suspended) return;
            let roomTotal = 0;
            let roomDetailsText = "";
            let hasContent = false;
            room.sets.forEach((set, sIdx) => {
                if (set.is_suspended) return;
                let setPrice = 0;
                const hPlus = heightPlus(set.height_m);
                const sPlus = stylePlus(set.style);
                if (set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0) setPrice += Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m);
                if (set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0) setPrice += Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m);
                if (setPrice > 0) {
                    roomTotal += setPrice;
                    hasContent = true;
                    roomDetailsText += `  - ผ้าม่าน #${sIdx + 1}: ${fmt(setPrice, 0, true)} บ.\n`;
                }
            });
            room.decorations.forEach((deco, dIdx) => {
                if (deco.is_suspended) return;
                const decoPrice = Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
                if (decoPrice > 0) {
                    roomTotal += decoPrice;
                    hasContent = true;
                    roomDetailsText += `  - ${deco.type || 'ตกแต่ง'} #${dIdx + 1}: ${fmt(decoPrice, 0, true)} บ.\n`;
                }
            });
            room.wallpapers.forEach((wp, wIdx) => {
                if (wp.is_suspended) return;
                const totalWidth = wp.widths.reduce((a,b) => a + b, 0);
                const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                const materialPrice = Math.round(rolls * wp.price_per_roll);
                const installPrice = Math.round(rolls * (wp.install_cost_per_roll || 0));
                const wpPrice = materialPrice + installPrice;
                const areaSqm = totalWidth * wp.height_m;
                if (wpPrice > 0) {
                    roomTotal += wpPrice;
                    hasContent = true;
                    roomDetailsText += `  - วอลเปเปอร์ #${wIdx + 1}: ${fmt(wpPrice, 0, true)} บ. (พื้นที่ ${fmt(areaSqm,2)} ตร.ม., ใช้ ${rolls} ม้วน)\n`;
                }
            });
            if (hasContent) {
                summary += `ห้อง ${room.room_name || `ห้อง ${rIdx + 1}`} (รวม ${fmt(roomTotal, 0, true)} บ.)\n${roomDetailsText}\n`;
            }
            grandTotal += roomTotal;
        });
        summary += `--------------------\n**รวมราคาสุทธิ: ${fmt(grandTotal, 0, true)} บาท**\n`;
        return summary;
    }

    function buildSeamstressSummary(payload) {
        let summary = `**สรุปงานเย็บผ้า - ลูกค้า: ${payload.customer_name || '-'}**\n\n`;
        let hasCurtains = false;
        payload.rooms.forEach((room, rIdx) => {
            if (room.is_suspended) return;
            const sets = room.sets.filter(s => !s.is_suspended && s.width_m > 0 && s.height_m > 0);
            if (sets.length === 0) return;
            hasCurtains = true;
            summary += `--- [ ห้อง: ${room.room_name || `ห้อง ${rIdx + 1}`} ] ---\n`;
            sets.forEach((set, sIdx) => {
                summary += `\n> ชุดที่ ${sIdx + 1} (${set.fabric_variant})\n`;
                summary += `  - ขนาด: กว้าง ${fmt(set.width_m, 2)} x สูง ${fmt(set.height_m, 2)} เมตร\n`;
                summary += `  - รูปแบบ: ${set.style}\n`;
                summary += `  - การเปิด: ${set.opening_style}\n`;
                summary += `  - รหัสผ้า: ${set.fabric_code || '-'}\n`;
                summary += `  - หมายเหตุ: ${set.notes || '-'}\n`;
            });
            summary += `\n`;
        });
        if (!hasCurtains) return "ไม่มีรายการผ้าม่านที่ต้องผลิตในใบเสนอนี้";
        return summary;
    }

    function buildOwnerSummary(payload) {
        let summary = `**สรุปรายละเอียดทั้งหมด (สำหรับร้านค้า)**\n`;
        let grandTotal = 0;
        summary += `ลูกค้า: ${payload.customer_name || '-'}\n`;
        summary += `โทร: ${payload.customer_phone || '-'}\n`;
        summary += `ที่อยู่: ${payload.customer_address || '-'}\n`;
        summary += `--------------------\n\n`;
        payload.rooms.forEach((room, rIdx) => {
            if (room.is_suspended) return;
            let roomTotal = 0;
            summary += `ห้อง: ${room.room_name || `ห้อง ${rIdx + 1}`}\n`;
            room.sets.forEach((set, sIdx) => {
                if (set.is_suspended) return;
                let setTotal = 0;
                const hPlus = heightPlus(set.height_m);
                const sPlus = stylePlus(set.style);
                if (set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0) {
                    setTotal += Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m);
                }
                if (set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0) {
                    setTotal += Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m);
                }
                roomTotal += setTotal;
                summary += ` - ผ้าม่าน #${sIdx + 1}: [${set.style}, ${set.fabric_variant}] - รวม ${fmt(setTotal,0,true)} บ.\n`;
                summary += `   - ขนาด: ${fmt(set.width_m,2)}x${fmt(set.height_m,2)} ม.\n`;
            });
            room.decorations.forEach((deco, dIdx) => {
                if (deco.is_suspended) { summary += ` - ${deco.type || 'ตกแต่ง'} #${dIdx+1}: -- ระงับ --\n`; return; }
                const areaSqyd = deco.width_m * deco.height_m * SQM_TO_SQYD;
                const decoPrice = Math.round(areaSqyd * deco.price_sqyd);
                roomTotal += decoPrice;
                summary += ` - ${deco.type || 'ตกแต่ง'} #${dIdx+1} - รวม ${fmt(decoPrice,0,true)} บ.\n`;
                summary += `   - ขนาด: ${fmt(deco.width_m,2)}x${fmt(deco.height_m,2)} ม. (${fmt(areaSqyd,2)} ตร.หลา)\n`;
            });
            room.wallpapers.forEach((wp, wIdx) => {
                if (wp.is_suspended) { summary += ` - วอลเปเปอร์ #${wIdx+1}: -- ระงับ --\n`; return; }
                const totalWidth = wp.widths.reduce((a,b) => a + b, 0);
                const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                const materialPrice = Math.round(rolls * wp.price_per_roll);
                const installPrice = Math.round(rolls * (wp.install_cost_per_roll || 0));
                const wpPrice = materialPrice + installPrice;
                const areaSqm = totalWidth * wp.height_m;
                roomTotal += wpPrice;
                summary += ` - วอลเปเปอร์ #${wIdx+1}: รวม ${fmt(wpPrice,0,true)} บ. (พื้นที่ ${fmt(areaSqm,2)} ตร.ม., ใช้ ${rolls} ม้วน)\n`;
            });
            summary += `   **รวมยอดห้องนี้: ${fmt(roomTotal,0,true)} บาท**\n\n`;
            grandTotal += roomTotal;
        });
        summary += `--------------------\n**รวมราคาสุทธิทั้งหมด: ${fmt(grandTotal, 0, true)} บาท**\n`;
        return summary;
    }

    function handleFormSubmit() {
        const orderForm = document.querySelector(SELECTORS.orderForm);
        orderForm.action = WEBHOOK_URL;
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
        showToast("ส่งข้อมูลแล้ว.", "success");
        // orderForm.submit();
    }

    // --- INIT & EVENTS ---
    function init() {
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); }, 150);

        orderForm.addEventListener("input", e => {
            if(e.target.name === 'deco_price_sqyd' || e.target.name === 'wallpaper_price_roll' || e.target.name === 'wallpaper_install_cost') {
                const value = toNum(e.target.value);
                e.target.value = value > 0 ? value.toLocaleString('en-US') : '';
            }
            debouncedRecalcAndSave();
        });

        orderForm.addEventListener("change", e => {
            if (e.target.name === 'deco_type') {
                const target = e.target;
                const itemCard = target.closest(SELECTORS.decoItem);
                if (itemCard) {
                    const displayEl = itemCard.querySelector('.deco-type-display');
                    if (displayEl) {
                        const selectedText = target.options[target.selectedIndex]?.text || target.value;
                        displayEl.textContent = selectedText ? `(${selectedText})` : '';
                    }
                }
            }
            if (e.target.matches('select[name="fabric_variant"]')) toggleSetFabricUI(e.target.closest(SELECTORS.set));
            debouncedRecalcAndSave();
        });

        orderForm.addEventListener("click", e => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const action = btn.dataset.act;
            const roomEl = btn.closest(SELECTORS.room);
            const roomMenu = btn.closest('.room-options-menu');
            if (roomMenu) roomMenu.classList.remove('show');

            const actions = {
                'add-set': () => addSet(roomEl),
                'add-deco': () => addDeco(roomEl),
                'add-wallpaper': () => addWallpaper(roomEl),
                'add-wall': () => addWall(btn),
                'toggle-room-menu': () => { e.preventDefault(); btn.nextElementSibling?.classList.toggle('show'); },
                'toggle-suspend-room': () => { e.preventDefault(); if(!roomEl) return; const isSuspended = !(roomEl.dataset.suspended === 'true'); suspendRoom(roomEl, isSuspended); },
                'clear-room': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูลในห้อง', body: 'ยืนยันการลบทุกรายการในห้องนี้?', selector: SELECTORS.room, action: (item) => { item.querySelector(SELECTORS.setsContainer).innerHTML = ""; item.querySelector(SELECTORS.decorationsContainer).innerHTML = ""; item.querySelector(SELECTORS.wallpapersContainer).innerHTML = ""; }, toast: 'ล้างข้อมูลในห้องแล้ว' }),
                'del-room': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบห้อง', body: 'ยืนยันการลบห้องนี้?', selector: SELECTORS.room, action: animateAndRemove, toast: 'ลบห้องแล้ว' }),
                'del-set': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบจุด', body: 'ยืนยันการลบจุดติดตั้งนี้?', selector: SELECTORS.set, action: animateAndRemove, toast: 'ลบจุดผ้าม่านแล้ว' }),
                'del-deco': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบรายการ', body: 'ยืนยันการลบรายการตกแต่งนี้?', selector: SELECTORS.decoItem, action: animateAndRemove, toast: 'ลบรายการตกแต่งแล้ว' }),
                'del-wallpaper': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบรายการ', body: 'ยืนยันการลบรายการวอลเปเปอร์?', selector: SELECTORS.wallpaperItem, action: animateAndRemove, toast: 'ลบรายการวอลเปเปอร์แล้ว' }),
                'del-wall': () => performActionWithConfirmation(btn, { confirm: false, isRemoval: true, selector: '.wall-input-row', action: animateAndRemove }),
                'clear-set': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูล', body: 'ยืนยันการล้างข้อมูลในจุดนี้?', selector: SELECTORS.set, action: (item) => { item.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : el.name === 'set_style' ? 'ลอน' : el.name === 'opening_style' ? 'แยกกลาง' : ''; }); toggleSetFabricUI(item); }, toast: 'ล้างข้อมูลผ้าม่านแล้ว' }),
                'clear-deco': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูล', body: 'ยืนยันการล้างข้อมูลในรายการนี้?', selector: SELECTORS.decoItem, action: (item) => { item.querySelectorAll('input, select').forEach(el => el.value = ''); item.querySelector('.deco-type-display').textContent = ''; }, toast: 'ล้างข้อมูลตกแต่งแล้ว' }),
                'clear-wallpaper': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูล', body: 'ยืนยันการล้างข้อมูลในรายการนี้?', selector: SELECTORS.wallpaperItem, action: (item) => { item.querySelectorAll('input').forEach(el => { el.value = (el.name === 'wallpaper_install_cost') ? '300' : ''; }); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); }, toast: 'ล้างข้อมูลวอลเปเปอร์แล้ว' }),
                'toggle-suspend': () => { const item = btn.closest('.set-item, .deco-item, .wallpaper-item'); const isSuspended = !(item.dataset.suspended === 'true'); suspendItem(item, isSuspended); recalcAll(); saveData(); }
            };
            if (actions[action]) {
                if (action !== 'toggle-room-menu') e.preventDefault();
                actions[action]();
            }
        });

        document.querySelector(SELECTORS.addRoomFooterBtn).addEventListener('click', () => addRoom());
        document.querySelector(SELECTORS.lockBtn).addEventListener('click', toggleLock);

        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            const option = await showCopyOptionsModal();
            if (!option) return;
            const payload = buildPayload();
            let textToCopy = '';
            if (option === 'customer') textToCopy = buildCustomerSummary(payload);
            else if (option === 'seamstress') textToCopy = buildSeamstressSummary(payload);
            else if (option === 'owner') textToCopy = buildOwnerSummary(payload);
            navigator.clipboard.writeText(textToCopy).then(() => showToast('คัดลอกข้อความสำเร็จ', 'success')).catch(() => showToast('คัดลอกล้มเหลว', 'error'));
            menuDropdown.classList.remove('show');
        });

        document.querySelector(SELECTORS.submitBtn).addEventListener('click', (e) => {
            e.preventDefault();
            handleFormSubmit();
            menuDropdown.classList.remove('show');
        });

        document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async (e) => {
            e.preventDefault();
            if (isLocked || !await showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return;
            document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
            roomCount = 0;
            document.querySelectorAll('#customerInfo input, #customerInfo textarea').forEach(i => i.value = "");
            addRoom();
            saveData();
            showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
            menuDropdown.classList.remove('show');
        });

        document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2)).then(() => showToast('คัดลอก JSON แล้ว', 'success')).catch(() => showToast('คัดลอก JSON ล้มเหลว', 'error'));
            menuDropdown.classList.remove('show');
        });

        // load from localStorage
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (saved) loadPayload(saved);
            else addRoom();
        } catch (e) { addRoom(); }
        // recalc to initialize UI
        setTimeout(() => recalcAll(), 60);
    }

    // start
    document.addEventListener('DOMContentLoaded', init);
})();
