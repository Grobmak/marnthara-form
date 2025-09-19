(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/5.0.0-fab";
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
        // --- NEW FAB SELECTORS ---
        fabContainer: '#fabContainer', fabMainBtn: '#fabMainBtn', fabActions: '.fab-actions',
        // --- NEW SELECTORS ---
        backdrop: '#backdrop',
        roomOptionsMenu: '.room-options-menu'
    };

    // --- STATE ---
    let roomCount = 0;
    let isLocked = false;
    let activeRoomEl = null; // To track the currently selected room

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

    // --- UI FUNCTIONS (Toasts, Modals, Menus) ---
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

    function toggleBackdrop(isVisible) {
        document.querySelector(SELECTORS.backdrop).classList.toggle('show', isVisible);
    }

    function closeAllMenus(excludeElement = null) {
        document.querySelector(SELECTORS.menuDropdown).classList.remove('show');
        document.querySelectorAll(SELECTORS.roomOptionsMenu).forEach(m => m.classList.remove('show'));
        document.querySelector(SELECTORS.fabActions).classList.remove('show');
        document.querySelector(SELECTORS.fabMainBtn).classList.remove('active');

        // Toggle backdrop based on what's still visible (if anything)
        const isAnyMenuVisible = document.querySelector(SELECTORS.menuDropdown).classList.contains('show') ||
                                 document.querySelector(SELECTORS.roomOptionsMenu + '.show') ||
                                 document.querySelector(SELECTORS.fabActions).classList.contains('show');

        if (!isAnyMenuVisible) {
            toggleBackdrop(false);
        }
    }

    function toggleFabMenu(forceState) {
        const actions = document.querySelector(SELECTORS.fabActions);
        const mainBtn = document.querySelector(SELECTORS.fabMainBtn);
        const newState = forceState !== undefined ? forceState : !actions.classList.contains('show');
        
        if (newState) {
            closeAllMenus(actions);
            actions.classList.add('show');
            mainBtn.classList.add('active');
            toggleBackdrop(true);
        } else {
            actions.classList.remove('show');
            mainBtn.classList.remove('active');
            toggleBackdrop(false);
        }
    }

    // --- CORE DOM MANIPULATION ---
    function setActiveRoom(roomElement) {
        if (activeRoomEl === roomElement) return;

        if (activeRoomEl) {
            activeRoomEl.classList.remove('is-active-room');
        }
        
        activeRoomEl = roomElement;
        
        if (activeRoomEl) {
            activeRoomEl.classList.add('is-active-room');
        }
    }

    function addRoom(prefill) {
        if (isLocked) return;
        roomCount++;
        const frag = document.querySelector(SELECTORS.roomTpl)?.content?.cloneNode(true);
        if (!frag) return;
        const room = frag.querySelector(SELECTORS.room);
        room.dataset.index = roomCount;
        document.querySelector(SELECTORS.roomsContainer).appendChild(frag);
        const created = document.querySelector(`${SELECTORS.room}:last-of-type`);
        setActiveRoom(created);

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
        if (isLocked || !roomEl) return;
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
        if (isLocked || !roomEl) return;
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
        if (isLocked || !roomEl) return;
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
                if (details.length > 0) {
                    summaryHtml += `<br><small>(${details.join(' + ')})</small>`;
                }
                set.querySelector('[data-set-summary]').innerHTML = summaryHtml;
                roomSum += totalSetPrice;
                grand += totalSetPrice;
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
                    const priceSqyd = clamp01(deco.querySelector('input[name="deco_price_sqyd"]')?.value);
                    if (w > 0 && h > 0 && priceSqyd > 0) {
                        decoPrice = Math.round(w * h * SQM_TO_SQYD * priceSqyd);
                    }
                    if (decoPrice > 0) pricedItemCount++;
                }
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmt(decoPrice, 0, true)}</b> บ.`;
                roomSum += decoPrice;
                grand += decoPrice;
                
                const type = deco.querySelector('[name="deco_type"]')?.value || 'อื่นๆ';
                decoCounts[type] = (decoCounts[type] || 0) + 1;
            });
            
            // WALLPAPERS
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let wallpaperPrice = 0, installCost = 0, totalWidth = 0;
                if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const h = clamp01(wallpaper.querySelector('input[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('input[name="wallpaper_price_roll"]')?.value);
                    const installPerRoll = clamp01(wallpaper.querySelector('input[name="wallpaper_install_cost"]')?.value);
                    
                    wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(input => {
                        totalWidth += clamp01(input.value);
                    });

                    if (totalWidth > 0 && h > 0) {
                        const rolls = CALC.wallpaperRolls(totalWidth, h);
                        wallpaperPrice = Math.round(rolls * pricePerRoll);
                        installCost = Math.round(rolls * installPerRoll);
                        totalWallpaperRolls += rolls;
                    }
                    if (wallpaperPrice + installCost > 0) pricedItemCount++;
                }
                const totalWallpaperCost = wallpaperPrice + installCost;
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = `ราคา: <b>${fmt(totalWallpaperCost, 0, true)}</b> บ. <small>(${totalWallpaperRolls.toFixed(1)} ม้วน)</small>`;
                roomSum += totalWallpaperCost;
                grand += totalWallpaperCost;
            });

            // Update room summary
            room.querySelector('[data-room-summary-total]').textContent = fmt(roomSum, 0, true);
        });

        // Update footer summary
        document.querySelector(SELECTORS.grandTotal).textContent = fmt(grand, 0, true);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

        updateDetailedSummary(grandOpaqueYards, grandSheerYards, grandOpaqueTrack, grandSheerTrack, totalWallpaperRolls, decoCounts, hasDoubleBracket);
    }
    
    // ... (rest of the functions remain the same) ...
    // Note: The rest of the script is not modified but is included for completeness.

    // --- MAIN EVENT LISTENERS ---
    function initEventListeners() {
        document.querySelector(SELECTORS.fabMainBtn).addEventListener('click', () => {
            toggleFabMenu();
        });

        document.querySelector(SELECTORS.backdrop).addEventListener('click', closeAllMenus);

        document.addEventListener('click', (e) => {
            const isFabBtn = e.target.closest(SELECTORS.fabMainBtn);
            const isMenuBtn = e.target.closest(SELECTORS.menuBtn);
            const isRoomMenuBtn = e.target.closest('[data-act="toggle-room-menu"]');

            if (isFabBtn) {
                // Handled by specific listener above
                return;
            }

            if (isMenuBtn) {
                closeAllMenus(SELECTORS.menuDropdown);
                document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
                toggleBackdrop(document.querySelector(SELECTORS.menuDropdown).classList.contains('show'));
                return;
            }

            if (isRoomMenuBtn) {
                const roomMenu = isRoomMenuBtn.closest('.room-options-container').querySelector(SELECTORS.roomOptionsMenu);
                const isShowing = roomMenu.classList.contains('show');
                closeAllMenus(roomMenu);
                if (!isShowing) {
                    roomMenu.classList.add('show');
                    toggleBackdrop(true);
                } else {
                    toggleBackdrop(false);
                }
                return;
            }

            // If click is outside of any of the menus, close all menus
            if (!e.target.closest('.fab-actions') && !e.target.closest('.menu-dropdown') && !e.target.closest('.room-options-menu')) {
                closeAllMenus();
            }

            // Set active room on click
            const clickedRoom = e.target.closest(SELECTORS.room);
            if (clickedRoom) {
                setActiveRoom(clickedRoom);
            }
        });
        
        // --- ADDED FAB ACTION LISTENERS ---
        document.querySelector(SELECTORS.fabContainer).addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;

            const action = btn.dataset.act;
            const roomEl = activeRoomEl; // Use the currently active room

            if (!roomEl) {
                showToast("โปรดเลือกห้องก่อนเพิ่มรายการ", "warning");
                return;
            }
            
            closeAllMenus();

            switch (action) {
                case 'add-wallpaper': addWallpaper(roomEl); break;
                case 'add-deco': addDeco(roomEl); break;
                case 'add-set': addSet(roomEl); break;
                case 'add-room': addRoom(); break;
                default: break;
            }
        });

        // --- ROOM ACTION LISTENERS ---
        document.getElementById('rooms').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const action = btn.dataset.act;

            const actions = {
                'add-set': { selector: SELECTORS.room, action: addSet },
                'add-deco': { selector: SELECTORS.room, action: addDeco },
                'add-wallpaper': { selector: SELECTORS.room, action: addWallpaper },
                'add-wall': { selector: SELECTORS.wallpaperItem, action: addWall },
                'del-set': { selector: SELECTORS.set, action: animateAndRemove, isRemoval: true, confirm: true, title: 'ลบผ้าม่าน?', body: 'คุณต้องการลบรายการผ้าม่านนี้หรือไม่?' },
                'del-deco': { selector: SELECTORS.decoItem, action: animateAndRemove, isRemoval: true, confirm: true, title: 'ลบงานตกแต่ง?', body: 'คุณต้องการลบรายการงานตกแต่งนี้หรือไม่?' },
                'del-wallpaper': { selector: SELECTORS.wallpaperItem, action: animateAndRemove, isRemoval: true, confirm: true, title: 'ลบวอลเปเปอร์?', body: 'คุณต้องการลบรายการวอลเปเปอร์นี้หรือไม่?' },
                'del-wall': { selector: '.wall-input-row', action: animateAndRemove, isRemoval: true, toast: 'ลบผนังแล้ว' },
                'clear-room': { selector: SELECTORS.room, action: clearRoom, confirm: true, title: 'ล้างข้อมูลห้อง?', body: 'ข้อมูลรายการทั้งหมดในห้องนี้จะถูกลบ' },
                'del-room': { selector: SELECTORS.room, action: deleteRoom, isRemoval: true, confirm: true, title: 'ลบห้องนี้?', body: 'ห้องนี้และรายการทั้งหมดจะถูกลบออกอย่างถาวร' },
                'toggle-suspend': { selector: '[data-suspended]', action: (item) => suspendItem(item, item.dataset.suspended !== 'true') },
                'toggle-suspend-room': { selector: '[data-room]', action: (item) => suspendRoom(item, item.dataset.suspended !== 'true') }
            };

            const config = actions[action];
            if (config) {
                if (config.isRemoval && config.toast) showToast(config.toast, 'success');
                performActionWithConfirmation(btn, config);
            }
        });
        
        // ... (remaining event listeners) ...
    }

    // --- START THE APP ---
    document.addEventListener('DOMContentLoaded', init);
})();