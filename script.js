(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/5.5.1-stable-hotfix";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";

    const PDF_EXPORT_DELAY_MS = 500;

    const SHOP_CONFIG = {
        name: "ม่านธารา ผ้าม่านและของตกแต่ง",
        address: "65/8 หมู่ 2 ต.ท่าศาลา อ.เมือง จ.ลพบุรี 15000",
        phone: "092-985-9395, 082-552-5595",
        taxId: "1234567890123",
        logoUrl: "https://i.imgur.com/l7y85nI.png",
        baseVatRate: 0.07, // The standard 7% VAT rate.
        pdf: {
            paymentTerms: "ชำระมัดจำ 50%",
            priceValidity: "30 วัน",
            notes: [
                "ราคานี้รวมค่าติดตั้งแล้ว",
                "ชำระมัดจำ 50% เพื่อยืนยันการสั่งผลิตสินค้า",
                "ใบเสนอราคานี้มีอายุ 30 วัน นับจากวันที่เสนอราคา"
            ]
        }
    };

    const SQM_TO_SQYD = 1.19599;

    const PRICING = {
        fabric: [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [
            { threshold: 3.2, add_per_m: 300 },
            { threshold: 2.8, add_per_m: 200 },
            { threshold: 2.5, add_per_m: 100 }
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
        sheerCodeWrap: '[data-sheer-code-wrap]',
        roomNameInput: 'input[name="room_name"]',
        toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', fileImporter: '#fileImporter',
        submitBtn: '#submitBtn',
        clearItemsBtn: '#clearItemsBtn',
        exportPdfBtn: '#exportPdfBtn',
        exportOptionsModal: '#exportOptionsModal', exportOptionsConfirm: '#exportOptionsConfirm', exportOptionsCancel: '#exportOptionsCancel',
        printableContent: '#printable-content',
        // --- Updated Quick Navigation Selectors ---
        quickNavBtn: '#quickNavBtn',
        quickNavDropdown: '#quickNavDropdown',
        quickNavRoomList: '#quickNavRoomList',
        expandAllRoomsBtn: '#expandAllRoomsBtn',
        collapseAllRoomsBtn: '#collapseAllRoomsBtn',
        // --- General ---
        roomCard: '.room-card',
        itemCard: '.item-card',
        itemTitle: '[data-item-title]'
    };

    let isLocked = false;

    const toNum = v => {
        if (typeof v === 'string') v = v.replace(/,/g, '');
        const num = parseFloat(v);
        return Number.isFinite(num) ? num : 0;
    };
    const clamp01 = v => Math.max(0, toNum(v));
    const fmt = (n, fixed = 2, asCurrency = false) => {
        if (!Number.isFinite(n)) return "0";
        return n.toLocaleString('en-US', { minimumFractionDigits: asCurrency ? 2 : fixed, maximumFractionDigits: asCurrency ? 2 : fixed });
    };
    const fmtTH = (n, fixed = 0) => {
        if (!Number.isFinite(n)) return "0";
        return n.toLocaleString('th-TH', { minimumFractionDigits: fixed, maximumFractionDigits: fixed });
    };
    const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    const disableAnimationsTemporarily = (ms = 600) => {
        document.body.classList.add('disable-animations');
        setTimeout(() => document.body.classList.remove('disable-animations'), ms);
    };

    const stylePlus = s => PRICING.style_surcharge[s] ?? 0;
    const heightPlus = h => {
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };
    function bahttext(num) {
        num = Number(num);
        if (isNaN(num)) return "ข้อมูลตัวเลขไม่ถูกต้อง";
        const txtNumArr = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า', 'สิบ'];
        const txtDigitArr = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
        if (num === 0) return 'ศูนย์บาทถ้วน';
        const [integerPart, decimalPart] = num.toFixed(2).split('.');
        const satang = parseInt(decimalPart, 10);
        function convert(n) {
            if (n === null || n === undefined) return '';
            let output = '';
            const strN = String(n);
            for (let i = 0; i < strN.length; i++) {
                const digit = parseInt(strN[i], 10);
                if (digit !== 0) {
                    if ((strN.length - i - 1) % 6 === 0 && i !== strN.length - 1) {
                        return convert(strN.substring(0, i + 1)) + 'ล้าน' + convert(strN.substring(i + 1));
                    }
                    output += txtNumArr[digit] + txtDigitArr[strN.length - i - 1];
                }
            }
            return output;
        }
        let bahtTxt = convert(integerPart).replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด') + 'บาท';
        if (satang > 0) {
            bahtTxt += convert(satang).replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด') + 'สตางค์';
        } else {
            bahtTxt += 'ถ้วน';
        }
        return bahtTxt;
    }

    const animateAndScroll = (element) => {
        if (!element) return;
        // If global animations are disabled, do a direct jump.
        if (document.body.classList.contains('disable-animations')) {
            element.scrollIntoView({ behavior: 'auto', block: 'center' });
            return;
        }
        // Smooth scroll + highlight animation with safe cleanup.
        try {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
            element.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
        element.classList.add('item-created');
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            element.classList.remove('item-created');
        };
        const onEnd = () => cleanup();
        element.addEventListener('animationend', onEnd, { once: true });
        // Fallback in case animationend does not fire.
        setTimeout(cleanup, 900);
    };

    function animateAndRemove(item) {
        if (!item) return;
        const parentScrollTarget = item.parentElement?.closest('.card, .items-container') || document.body;
        try {
            parentScrollTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) {}
        item.classList.add('item-removing');
        let removed = false;
        const doRemove = () => {
            if (removed) return;
            removed = true;
            try { item.remove(); } catch (e) {}
            try { renumber(); recalcAll(); saveData(); } catch (e) {}
        };
        const onEnd = () => doRemove();
        item.addEventListener('animationend', onEnd, { once: true });
        // Fallback timeout if animationend never fires.
        setTimeout(doRemove, 700);
    }

    function showToast(message, type = 'default') {
        const container = document.querySelector(SELECTORS.toastContainer);
        if (!container) return;
        const icons = { success: 'ph-bold ph-check-circle', warning: 'ph-bold ph-warning', error: 'ph-bold ph-x-circle', default: 'ph-bold ph-info' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<i class="${icons[type] || icons.default}"></i> ${message}`;
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
    async function showExportOptionsModal() {
        const confirmed = await showModal(SELECTORS.exportOptionsModal);
        if (!confirmed) return null;
        const modalEl = document.querySelector(SELECTORS.exportOptionsModal);
        return {
            vatOption: modalEl.querySelector('input[name="vat_option"]:checked').value,
            exportMethod: modalEl.querySelector('#exportMethod').value,
        };
    }

    // --- Core DOM Functions ---
    function addRoom(prefill) {
        if (isLocked) return;
        const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
        const frag = document.querySelector(SELECTORS.roomTpl)?.content?.cloneNode(true);
        if (!frag || !roomsContainer) return;

        const room = frag.querySelector(SELECTORS.room);
        room.id = `room-${Date.now()}`;
        roomsContainer.appendChild(frag);
        const created = roomsContainer.querySelector(`${SELECTORS.room}:last-of-type`);

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
            created.querySelector('input[name="sheer_fabric_code"]').value = prefill.sheer_fabric_code || "";
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
            created.querySelector('[name="deco_price_sqyd"]').value = fmtTH(prefill.price_sqyd) ?? "";
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

    function handleDecoTypeChange(e) {
        const decoEl = e.target.closest(SELECTORS.decoItem);
        if (!decoEl) return;
        const type = e.target.value.trim();
        const displayEl = decoEl.querySelector('.deco-type-display');
        if (displayEl) {
            displayEl.textContent = type ? `(${type})` : '';
        }
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
            created.querySelector('[name="wallpaper_price_roll"]').value = fmtTH(prefill.price_per_roll) ?? "";
            created.querySelector('[name="wallpaper_install_cost"]').value = fmtTH(prefill.install_cost_per_roll ?? 300);
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

    function renumber() {
        document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
            const roomNameInput = room.querySelector(SELECTORS.roomNameInput);
            if(roomNameInput) {
                roomNameInput.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            }
            const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
            const totalItemsInRoom = items.length;
            items.forEach((item, iIdx) => {
                const titleEl = item.querySelector(SELECTORS.itemTitle);
                if (titleEl) {
                    titleEl.textContent = `${iIdx + 1}/${totalItemsInRoom}`;
                }
            });
        });
        updateQuickNavMenu();
    }

    function toggleSetFabricUI(setEl) {
        if (!setEl) return;
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        const sheerWrap = setEl.querySelector(SELECTORS.sheerWrap);
        const sheerCodeWrap = setEl.querySelector(SELECTORS.sheerCodeWrap);
        if(sheerWrap) sheerWrap.classList.toggle("hidden", !hasSheer);
        if(sheerCodeWrap) sheerCodeWrap.classList.toggle("hidden", !hasSheer);
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
    function toggleLock() {
        isLocked = !isLocked;
        updateLockState();
        showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'warning');
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
                    if (opaquePrice + sheerPrice > 0) pricedItemCount++;
                }
                const totalSetPrice = opaquePrice + sheerPrice;
                let summaryHtml = `ราคา: <b>${fmtTH(totalSetPrice)}</b> บ.`;
                const details = [];
                if (opaquePrice > 0) details.push(`ทึบ: ${fmtTH(opaquePrice)}`);
                if (sheerPrice > 0) details.push(`โปร่ง: ${fmtTH(sheerPrice)}`);
                if (details.length > 0 && totalSetPrice > 0) summaryHtml += ` <small>(${details.join(', ')})</small>`;
                set.querySelector('[data-set-summary]').innerHTML = summaryHtml;
                set.querySelector('[data-set-yardage-opaque]').textContent = fmtTH(opaqueYards, 2);
                set.querySelector('[data-set-opaque-track]').textContent = fmtTH(opaqueTrack, 2);
                set.querySelector('[data-set-yardage-sheer]').textContent = fmtTH(sheerYards, 2);
                set.querySelector('[data-set-sheer-track]').textContent = fmtTH(sheerTrack, 2);
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
                deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmtTH(decoPrice)}</b> บ. • พื้นที่: <b>${fmtTH(areaSqyd, 2)}</b> ตร.หลา`;
                roomSum += decoPrice;
            });

            // WALLPAPERS
            room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
                let totalItemPrice = 0, materialPrice = 0, installPrice = 0, areaSqm = 0, rollsNeeded = 0;
                if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                    const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                    const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                    const installCostPerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_install_cost"]')?.value);
                    const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                    areaSqm = totalWidth * h;
                    rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                    materialPrice = Math.round(rollsNeeded * pricePerRoll);
                    installPrice = Math.round(rollsNeeded * installCostPerRoll);
                    totalItemPrice = materialPrice + installPrice;
                    if (totalItemPrice > 0) {
                       pricedItemCount++;
                        if (Number.isFinite(rollsNeeded)) totalWallpaperRolls += rollsNeeded;
                    }
                }
                let summaryHtml = `รวม: <b>${fmtTH(totalItemPrice)}</b> บ.`;
                if (totalItemPrice > 0) summaryHtml += ` <small>(วอลล์: ${fmtTH(materialPrice)}, ค่าช่าง: ${fmtTH(installPrice)})</small>`;
                summaryHtml += ` • พื้นที่: <b>${fmtTH(areaSqm, 2)}</b> ตร.ม. • ใช้: <b>${Number.isFinite(rollsNeeded) ? rollsNeeded : 'N/A'}</b> ม้วน`;
                wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = summaryHtml;
                roomSum += totalItemPrice;
            });

            const itemCount = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
            room.querySelector('[data-room-brief]').innerHTML = `<span>${itemCount} รายการ • ${fmtTH(roomSum)} บาท</span>`;
            grand += roomSum;
        });

        document.querySelector(SELECTORS.grandTotal).textContent = fmtTH(grand);
        document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

        // UPDATE DETAILED MATERIAL SUMMARY
        const summaryContainer = document.querySelector(SELECTORS.detailedSummaryContainer);
        if(summaryContainer) {
            let html = '';
            if (grandOpaqueYards > 0 || grandSheerYards > 0) {
                html += `<h4><i class="ph-bold ph-blinds"></i> ผ้าม่าน</h4><ul>`;
                if (grandOpaqueYards > 0) html += `<li>ผ้าทึบ: <b>${fmtTH(grandOpaqueYards, 2)}</b> หลา</li>`;
                if (grandSheerYards > 0) html += `<li>ผ้าโปร่ง: <b>${fmtTH(grandSheerYards, 2)}</b> หลา</li>`;
                if (grandOpaqueTrack > 0) html += `<li>รางทึบ: <b>${fmtTH(grandOpaqueTrack, 2)}</b> ม.</li>`;
                if (grandSheerTrack > 0) html += `<li>รางโปร่ง: <b>${fmtTH(grandSheerTrack, 2)}</b> ม.</li>`;
                if (hasDoubleBracket) html += `<li class="summary-note">** มีรายการที่ต้องใช้ขาสองชั้น</li>`;
                html += `</ul>`;
            }
            if (Object.keys(decoCounts).length > 0) {
                 html += `<h4><i class="ph-bold ph-file-image"></i> งานตกแต่ง</h4><ul>`;
                 for (const type in decoCounts) html += `<li>${type}: <b>${decoCounts[type]}</b> ชุด</li>`;
                 html += `</ul>`;
            }
            if (totalWallpaperRolls > 0) {
                 html += `<h4><i class="ph-bold ph-paint-roller"></i> วอลเปเปอร์</h4><ul>`;
                 html += `<li>จำนวนที่ต้องใช้: <b>${totalWallpaperRolls}</b> ม้วน</li>`;
                 html += `</ul>`;
            }
            if (html === '') html = '<p class="empty-summary">ยังไม่มีรายการวัสดุ</p>';
            summaryContainer.innerHTML = html;
        }
    }

    // --- TEXT SUMMARY ENGINE ---
    function generateSummaryText(payload, type) {
        const grandTotal = payload.rooms.reduce((roomSum, room) => {
            if (room.is_suspended) return roomSum;
            const setsTotal = room.sets.reduce((sum, set) => {
                if (set.is_suspended || set.width_m <= 0) return sum;
                const sPlus = stylePlus(set.style), hPlus = heightPlus(set.height_m);
                const opaquePrice = set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0 ? Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m) : 0;
                const sheerPrice = set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0 ? Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m) : 0;
                return sum + opaquePrice + sheerPrice;
            }, 0);
            const decosTotal = room.decorations.reduce((sum, deco) => {
                if (deco.is_suspended || deco.width_m <= 0) return sum;
                return sum + Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
            }, 0);
            const wpsTotal = room.wallpapers.reduce((sum, wp) => {
                if (wp.is_suspended) return sum;
                const totalWidth = wp.widths.reduce((a, b) => a + b, 0);
                if (totalWidth <= 0) return sum;
                const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                return sum + Math.round(rolls * wp.price_per_roll) + Math.round(rolls * (wp.install_cost_per_roll || 0));
            }, 0);
            return roomSum + setsTotal + decosTotal + wpsTotal;
        }, 0);

        let text = `สรุปข้อมูล (${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'numeric', year: 'numeric' })})\n`;
        text += `ลูกค้า: ${payload.customer_name || '-'}\n`;
        if (type === 'customer' || type === 'owner') {
            text += `เบอร์โทร: ${payload.customer_phone || '-'}\n`;
            text += `ที่อยู่: ${payload.customer_address || '-'}\n`;
        }
        text += '------------------------------\n';

        if (type === 'customer') {
            text += `\nสรุปรายการ\n`;
            payload.rooms.forEach(room => {
                if (room.is_suspended) return;
                const activeItems = [...room.sets, ...room.decorations, ...room.wallpapers].filter(item => !item.is_suspended);
                if (activeItems.length === 0) return;
                text += `\n**ห้อง: ${room.room_name || 'ไม่ระบุ'}**\n`;
                activeItems.forEach(item => {
                    if (item.style) { // It's a curtain set
                        const w = toNum(item.width_m);
                        const h = toNum(item.height_m);
                        const sPlus = stylePlus(item.style);
                        const hPlus = heightPlus(h);
                        const opaquePrice = item.fabric_variant.includes("ทึบ") && item.price_per_m_raw > 0 ? Math.round((item.price_per_m_raw + sPlus + hPlus) * w) : 0;
                        const sheerPrice = item.fabric_variant.includes("โปร่ง") && item.sheer_price_per_m > 0 ? Math.round((item.sheer_price_per_m + sPlus + hPlus) * w) : 0;
                        const total = opaquePrice + sheerPrice;
                        text += `- ม่าน${item.fabric_variant.replace('ทึบ&โปร่ง', 'ทึบและโปร่ง')} (กว้าง ${fmt(w,2)} ม. x สูง ${fmt(h,2)} ม.) ราคา ${fmtTH(total,0)} บ.\n`;
                    } else if (item.deco_type) { // It's a decoration
                        const total = Math.round(toNum(item.width_m) * toNum(item.height_m) * SQM_TO_SQYD * toNum(item.price_sqyd));
                        text += `- ${item.deco_type} (กว้าง ${fmt(item.width_m,2)} ม. x สูง ${fmt(item.height_m,2)} ม.) ราคา ${fmtTH(total,0)} บ.\n`;
                    } else if (item.widths) { // It's a wallpaper
                        const totalWidth = item.widths.reduce((a, b) => a + b, 0);
                        const rolls = CALC.wallpaperRolls(totalWidth, toNum(item.height_m));
                        const materialPrice = Math.round(rolls * toNum(item.price_per_roll));
                        const installPrice = Math.round(rolls * toNum(item.install_cost_per_roll));
                        text += `- วอลเปเปอร์ (รวมกว้าง ${fmt(totalWidth,2)} ม. x สูง ${fmt(item.height_m,2)} ม.) ใช้ ${rolls} ม้วน, ราคา ${fmtTH(materialPrice + installPrice,0)} บ.\n`;
                    }
                });
            });
            text += `\n------------------------------\n`;
            text += `รวมเป็นเงิน: ${fmtTH(grandTotal,0)} บาท\n`;
            text += `(ตัวอักษร: ${bahttext(grandTotal)})\n`;
        }
        
        // Detailed material summary for the owner
        if (type === 'owner') {
             const materials = { opaque: 0, sheer: 0, opaqueTrack: 0, sheerTrack: 0, rolls: 0, decos: {} };
             payload.rooms.forEach(room => {
                 if(room.is_suspended) return;
                 room.sets.forEach(set => {
                     if(set.is_suspended || set.width_m <= 0) return;
                     const w = toNum(set.width_m);
                     const style = set.style;
                     if(set.fabric_variant.includes("ทึบ")) {
                         materials.opaque += CALC.fabricYardage(style, w);
                         materials.opaqueTrack += w;
                     }
                     if(set.fabric_variant.includes("โปร่ง")) {
                         materials.sheer += CALC.fabricYardage(style, w);
                         materials.sheerTrack += w;
                     }
                 });
                 room.decorations.forEach(deco => {
                     if(deco.is_suspended || !deco.type) return;
                     materials.decos[deco.type] = (materials.decos[deco.type] || 0) + 1;
                 });
                 room.wallpapers.forEach(wp => {
                     if(wp.is_suspended) return;
                     const totalWidth = wp.widths.reduce((a,b) => a+b, 0);
                     materials.rolls += CALC.wallpaperRolls(totalWidth, toNum(wp.height_m));
                 });
             });
            text += `\nสรุปยอดใช้วัสดุ\n`;
            text += `- ผ้าทึบ: ${fmtTH(materials.opaque,2)} หลา\n`;
            text += `- ผ้าโปร่ง: ${fmtTH(materials.sheer,2)} หลา\n`;
            text += `- รางทึบ: ${fmtTH(materials.opaqueTrack,2)} ม.\n`;
            text += `- รางโปร่ง: ${fmtTH(materials.sheerTrack,2)} ม.\n`;
            if(Object.keys(materials.decos).length > 0) {
                 text += `- งานตกแต่ง:\n`;
                 for (const type in materials.decos) {
                     text += `  - ${type}: ${materials.decos[type]} ชุด\n`;
                 }
            }
            text += `- วอลเปเปอร์: ${fmtTH(materials.rolls,0)} ม้วน\n`;
            text += `\n------------------------------\n`;
            text += `ยอดรวม: ${fmtTH(grandTotal,0)} บาท\n`;
        }

        if (type === 'payload') {
            text = JSON.stringify(payload, null, 2);
        }

        return text;
    }

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
                    width_m: toNum(setEl.querySelector('input[name="width_m"]')?.value), height_m: toNum(setEl.querySelector('input[name="height_m"]')?.value), style: setEl.querySelector('select[name="set_style"]')?.value || '', fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value || '', price_per_m_raw: toNum(setEl.querySelector('select[name="set_price_per_m"]')?.value), sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value), fabric_code: setEl.querySelector('input[name="fabric_code"]')?.value || '', sheer_fabric_code: setEl.querySelector('input[name="sheer_fabric_code"]')?.value || '', opening_style: setEl.querySelector('select[name="opening_style"]')?.value || '', track_color: setEl.querySelector('select[name="track_color"]')?.value || '', notes: setEl.querySelector('input[name="notes"]')?.value || '', is_suspended: setEl.dataset.suspended === 'true',
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    type: decoEl.querySelector('[name="deco_type"]')?.value || '', width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value), height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value), price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value), deco_code: decoEl.querySelector('[name="deco_code"]')?.value || '', deco_notes: decoEl.querySelector('[name="deco_notes"]')?.value || '', is_suspended: decoEl.dataset.suspended === 'true',
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
                roomData.wallpapers.push({
                    height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value), wallpaper_code: wallpaperEl.querySelector('[name="wallpaper_code"]')?.value || '', price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value), install_cost_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_install_cost"]')?.value), wallpaper_notes: wallpaperEl.querySelector('[name="wallpaper_notes"]')?.value || '', widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)), is_suspended: wallpaperEl.dataset.suspended === 'true',
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
    }

    function loadPayload(payload) {
        if (!payload || !payload.rooms) { showToast("ข้อมูลตัวเลขไม่ถูกต้อง", "error"); return; }
        document.querySelector('[name="customer_name"]').value = payload.customer_name || '';
        document.querySelector('[name="customer_address"]').value = payload.customer_address || '';
        document.querySelector('[name="customer_phone"]').value = payload.customer_phone || '';
        document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
        if (payload.rooms.length > 0) payload.rooms.forEach(addRoom);
        else addRoom();
        showToast("โหลดข้อมูลสำเร็จ", "success");
    }

    function jumpToRoom(roomId) {
        const target = document.getElementById(roomId);
        if (target) {
            try {
                target.scrollIntoView({ behavior: 'auto', block: 'start' });
            } catch (e) {
                target.scrollIntoView();
            }
            target.classList.add('scrolling-jump');
            setTimeout(() => target.classList.remove('scrolling-jump'), 600);
        }
    }

    function updateQuickNavMenu() {
        const roomListContainer = document.querySelector(SELECTORS.quickNavRoomList);
        const quickNavBtn = document.querySelector(SELECTORS.quickNavBtn);
        if (!roomListContainer || !quickNavBtn) return;

        roomListContainer.innerHTML = '';
        const rooms = document.querySelectorAll(SELECTORS.room);

        if (rooms.length < 2) {
            quickNavBtn.style.display = 'none';
            return;
        } else {
            quickNavBtn.style.display = 'inline-flex';
        }

        rooms.forEach((room, index) => {
            const roomNameInput = room.querySelector(SELECTORS.roomNameInput);
            const roomName = (roomNameInput && roomNameInput.value.trim()) ? roomNameInput.value.trim() : (roomNameInput && roomNameInput.placeholder) ? roomNameInput.placeholder : `ห้อง ${index + 1}`;
            const roomId = room.id;
            if (!roomId) return;

            const link = document.createElement('a');
            link.href = `#${roomId}`;
            link.dataset.jumpTo = roomId;
            link.innerHTML = `<i class="ph ph-arrow-bend-right-down"></i> ${roomName}`;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                jumpToRoom(roomId);
            });
            roomListContainer.appendChild(link);
        });
    }

    // --- MAIN INITIALIZATION FUNCTION ---
    function init() {
        console.log("Marnthara Input UI initialized.");

        // Event Delegation for the main form
        document.querySelector(SELECTORS.orderForm).addEventListener('change', debounce((e) => {
            const el = e.target;
            const parentSet = el.closest(SELECTORS.set);
            const parentDeco = el.closest(SELECTORS.decoItem);
            const parentWallpaper = el.closest(SELECTORS.wallpaperItem);
            const isSet = !!parentSet;
            const isDeco = !!parentDeco;
            const isWallpaper = !!parentWallpaper;

            if (el.name === "fabric_variant" && isSet) {
                toggleSetFabricUI(parentSet);
            }
            if (el.name === "deco_type" && isDeco) {
                handleDecoTypeChange(e);
            }
            recalcAll();
            saveData();
        }));

        document.querySelector(SELECTORS.orderForm).addEventListener('input', debounce((e) => {
            const el = e.target;
            const parentSet = el.closest(SELECTORS.set);
            const parentDeco = el.closest(SELECTORS.decoItem);
            const parentWallpaper = el.closest(SELECTORS.wallpaperItem);
            const isSet = !!parentSet;
            const isDeco = !!parentDeco;
            const isWallpaper = !!parentWallpaper;

            if (el.name.startsWith("customer")) {
                saveData();
            }
            if (el.name === "room_name") {
                saveData();
                updateQuickNavMenu();
            }
            if (isSet || isDeco || isWallpaper) {
                recalcAll();
                saveData();
            }
        }));

        document.querySelector(SELECTORS.orderForm).addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const action = btn.dataset.act;
            const parentRoom = btn.closest(SELECTORS.room);
            const parentItem = btn.closest(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);

            e.preventDefault();

            switch(action) {
                case 'add-room': addRoom(); break;
                case 'add-set': if(parentRoom) addSet(parentRoom); break;
                case 'add-deco': if(parentRoom) addDeco(parentRoom); break;
                case 'add-wallpaper': if(parentRoom) addWallpaper(parentRoom); break;
                case 'add-wall': if(parentItem) addWall(btn); break;
                case 'remove-wall':
                case 'remove-set':
                case 'remove-deco':
                case 'remove-wallpaper':
                    if (isLocked) return;
                    if (await showConfirmation('ลบรายการนี้?', 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?')) {
                        animateAndRemove(e.target.closest('.list-item, .wall-input-row'));
                    }
                    break;
                case 'remove-room':
                    if (isLocked) return;
                    if (await showConfirmation('ลบห้องนี้?', 'คุณแน่ใจหรือไม่ว่าต้องการลบห้องนี้และรายการทั้งหมดภายใน?')) {
                        animateAndRemove(parentRoom);
                    }
                    break;
                case 'toggle-suspend':
                    if (isLocked) return;
                    if (parentItem) {
                        const isSuspended = parentItem.dataset.suspended === 'true';
                        suspendItem(parentItem, !isSuspended);
                        recalcAll();
                        saveData();
                    }
                    break;
                case 'toggle-suspend-room':
                    if (isLocked) return;
                    if (parentRoom) {
                        const isSuspended = parentRoom.dataset.suspended === 'true';
                        suspendRoom(parentRoom, !isSuspended);
                    }
                    break;
                case 'toggle-expand-room':
                    if(parentRoom) {
                        parentRoom.classList.toggle('expanded');
                    }
                    break;
                case 'toggle-room-menu':
                    const menu = parentRoom.querySelector('.room-options-menu');
                    const roomCard = parentRoom.closest('.room-card');
                    if(menu && roomCard) {
                        menu.classList.toggle('show');
                        roomCard.classList.toggle('overflow-visible', menu.classList.contains('show'));
                    }
                    break;
                case 'copy-summary':
                    if (isLocked) { showToast('กรุณาปลดล็อคฟอร์มก่อน', 'error'); return; }
                    const summaryType = btn.dataset.copyType;
                    const payload = buildPayload();
                    const textToCopy = generateSummaryText(payload, summaryType);
                    try {
                        await navigator.clipboard.writeText(textToCopy);
                        showToast('คัดลอกข้อมูลสำเร็จ!', 'success');
                    } catch (err) {
                        console.error('Failed to copy text: ', err);
                        showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
                    }
                    break;
            }
        });

        // Event Delegation for the main footer/header buttons
        document.querySelector('.main-footer').addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const action = btn.dataset.act;
            e.preventDefault();
            
            switch (action) {
                case 'lock-form': toggleLock(); break;
                case 'add-room': addRoom(); break;
                case 'clear-all':
                    const confirmed = await showConfirmation('ล้างข้อมูลทั้งหมด', 'คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลทั้งหมดในฟอร์มนี้? การกระทำนี้ไม่สามารถย้อนกลับได้');
                    if (confirmed) {
                        localStorage.removeItem(STORAGE_KEY);
                        window.location.reload();
                    }
                    break;
                case 'expand-all':
                    document.querySelectorAll(SELECTORS.room).forEach(room => room.classList.add('expanded'));
                    break;
                case 'collapse-all':
                    document.querySelectorAll(SELECTORS.room).forEach(room => room.classList.remove('expanded'));
                    break;
                case 'copy-to-clipboard':
                    showModal(SELECTORS.copyOptionsModal);
                    break;
                case 'export-pdf-modal':
                    showModal(SELECTORS.exportOptionsModal);
                    break;
                case 'export-pdf':
                    // This is handled in a separate module
                    break;
            }
        });

        document.querySelector(SELECTORS.orderForm).addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const payload = buildPayload();
            document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
            form.submit();
        });
        
        // Handle dropdown menus
        document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.querySelector(SELECTORS.quickNavDropdown).classList.remove('show');
            document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
        });
        
        document.querySelector(SELECTORS.quickNavBtn).addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.querySelector(SELECTORS.menuDropdown).classList.remove('show');
            document.querySelector(SELECTORS.quickNavDropdown).classList.toggle('show');
        });

        document.querySelector(SELECTORS.importBtn).addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelector(SELECTORS.fileImporter).click();
        });
        document.querySelector(SELECTORS.fileImporter).addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const payload = JSON.parse(event.target.result);
                    loadPayload(payload);
                } catch (err) {
                    console.error("Failed to parse file:", err);
                    showToast("ไฟล์ที่เลือกไม่ถูกต้อง", "error");
                }
            };
            reader.readAsText(file);
        });
        
        document.querySelector(SELECTORS.exportBtn).addEventListener('click', (e) => {
            e.preventDefault();
            const payload = buildPayload();
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const customerName = payload.customer_name ? `-${payload.customer_name}` : '';
            a.download = `marnthara-order${customerName}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        document.querySelector(SELECTORS.copyOptionsConfirm).addEventListener('click', async () => {
             const selectedType = document.querySelector('input[name="copy_type"]:checked')?.value;
             if(selectedType) {
                 const textToCopy = generateSummaryText(buildPayload(), selectedType);
                 try {
                     await navigator.clipboard.writeText(textToCopy);
                     showToast('คัดลอกข้อมูลสำเร็จ!', 'success');
                 } catch(err) {
                     showToast('ไม่สามารถคัดลอกข้อมูลได้', 'error');
                 }
                 document.querySelector(SELECTORS.copyOptionsModal).classList.remove('visible');
             }
        });

        window.addEventListener('click', (e) => {
            if (!e.target.closest('.main-header')) {
                document.querySelector(SELECTORS.menuDropdown)?.classList.remove('show');
                document.querySelector(SELECTORS.quickNavDropdown)?.classList.remove('show');
            }
            if (!e.target.closest('.room-options-container')) {
                document.querySelectorAll('.room-options-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                    menu.closest('.room-card')?.classList.remove('overflow-visible');
                });
            }
        });
        
        // --- INITIAL LOAD ---
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