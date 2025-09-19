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

    // --- BUG FIX FUNCTION ---
    // Forces the browser to recalculate the FAB's position after a scroll/reflow.
    function forceFabRepaint() {
        const fab = document.querySelector(SELECTORS.fabContainer);
        if (!fab) return;
        fab.style.visibility = 'hidden';
        void fab.offsetHeight; // This line forces the browser to recalculate layout
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

    // --- CORE DOM MANIPULATION ---
    function setActiveRoom(roomElement) {
        if (activeRoomEl === roomElement) return;
        if (activeRoomEl) activeRoomEl.classList.remove('is-active-room');
        activeRoomEl = roomElement;
        if (activeRoomEl) activeRoomEl.classList.add('is-active-room');
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
            // Prefill data... (logic is unchanged)
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
            // Prefill data... (logic is unchanged)
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
            // Prefill data... (logic is unchanged)
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
    
    // The rest of the functions (suspendItem, performAction, recalcAll, buildPayload, saveData, etc.)
    // remain the same as the previous version. They are omitted here for brevity but should be included in the final file.
    // ...
    // Assume all the calculation and data handling functions are here
    // ...

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

    // --- EVENT LISTENERS & INITIALIZATION ---
    function init() {
        // ... (All other initial event listeners for form inputs, etc., are unchanged) ...
        const orderForm = document.querySelector(SELECTORS.orderForm);
        const debouncedRecalcAndSave = debounce(() => { recalcAll(); saveData(); }, 150);
        orderForm.addEventListener("input", debouncedRecalcAndSave);
        orderForm.addEventListener("change", e => {
            if (e.target.matches('select[name="fabric_variant"]')) {
                toggleSetFabricUI(e.target.closest(SELECTORS.set));
            }
            debouncedRecalcAndSave();
        });

        // --- MASTER CLICK HANDLER ---
        document.body.addEventListener("click", e => {
            const btn = e.target.closest('[data-act]');
            if (!btn) {
                // Close popups if clicked outside
                if (!e.target.closest('.menu-container')) document.querySelector(SELECTORS.menuDropdown).classList.remove('show');
                if (!e.target.closest(SELECTORS.fabContainer)) toggleFabMenu(false);
                return;
            }

            if (btn.closest(SELECTORS.fabActions)) {
                toggleFabMenu(false);
            }

            const action = btn.dataset.act;
            const actions = {
                'add-room': () => addRoom(), 'add-set': () => addSet(activeRoomEl),
                'add-deco': () => addDeco(activeRoomEl), 'add-wallpaper': () => addWallpaper(activeRoomEl),
                'add-wall': () => addWall(btn),
                // ... (all other actions like del-room, clear-set etc. are unchanged) ...
            };

            if (actions[action]) {
                e.preventDefault();
                actions[action]();

                // BUG FIX: If the action was one that adds content, force the FAB to repaint after a delay.
                if (['add-room', 'add-set', 'add-deco', 'add-wallpaper'].includes(action)) {
                    setTimeout(forceFabRepaint, 400);
                }
            }
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

        // Initial Load from localStorage
        try {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                // Assume loadPayload function exists and works
                // loadPayload(JSON.parse(storedData));
            } else {
                addRoom();
            }
        } catch(err) {
            console.error("Failed to load from localStorage:", err);
            localStorage.removeItem(STORAGE_KEY); 
            addRoom();
        }
        if (!activeRoomEl) setActiveRoom(document.querySelector(SELECTORS.room));
        recalcAll();
        // Assume updateLockState exists
        // updateLockState();
    }

    document.addEventListener('DOMContentLoaded', init);
    
    // NOTE: For the final code, you would merge this simplified 'init' and FAB logic
    // back into your full 'script.js' file, replacing the old FAB and event listener sections.
    // The calculation and data functions don't need to be changed.
})();