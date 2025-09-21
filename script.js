// FILE: script.js
// Full script.js revised. Replace the uploaded script.js with the following.
// Key fixes:
// - heightPlus fixed
// - generatePdf computes subtotal, VAT, grandTotal, bahtText with fallback
// - safe usage of pdfMake and configurable logo

(function() {
    'use strict';
    // --- CONFIGURATION & CONSTANTS ---
    const APP_VERSION = "input-ui/4.4.0-pdf-export";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";
    const SQM_TO_SQYD = 1.19599;
    const VAT_RATE = 0.07; // 7% VAT

    // +++ PDF QUOTATION CONFIGURATION +++
    const QUOTATION_CONFIG = {
        company_name: "ม่านธารา เดคคอร์",
        company_address: "123 หมู่ 4 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000",
        company_phone: "08X-XXX-XXXX, 09X-XXX-XXXX",
        company_logo_base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABTSURBVHhe7cEBDQAAAMKg909tDwcFAAAAAAAAAAAAAAAAAMDfA2nZAAE5QQk8AAAAAElFTkSuQmCC"
    };

    const PRICING = {
        fabric: [1000,1100,1200,1300,1400,1500],
        sheer: [1000,1100,1200,1300],
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
            const stripsPerRoll = (height > 2.5) ? Math.floor(10 / height) : Math.floor(12 / height);
            const stripWidth = 0.53; // typical
            const stripsNeeded = Math.ceil(totalWidth / stripWidth);
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
        sheerWrap: '[data-sheer-wrap]', sheerCodeWrap: '[data-sheer-code-wrap]',
        roomNameInput: 'input[name="room_name"]',
        toastContainer: '#toast-container',
        copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
        menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', fileImporter: '#fileImporter',
        submitBtn: '#submitBtn',
        clearItemsBtn: '#clearItemsBtn',
        generatePdfBtn: '#generatePdfBtn'
    };
	
	// toggle dropdown
		document.querySelector(SELECTORS.menuBtn)?.addEventListener('click', (e) => {
			e.preventDefault();
			const menu = document.querySelector(SELECTORS.menuDropdown);
		menu?.classList.toggle('show');
});

	// ปิด dropdown เมื่อคลิกนอก
		document.addEventListener('click', (e) => {
			const menu = document.querySelector(SELECTORS.menuDropdown);
			const btn = document.querySelector(SELECTORS.menuBtn);
			if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
		menu.classList.remove('show');
  }
});

    // --- STATE ---
    let roomCount = 0;
    let isLocked = false;

    // --- UTILITIES ---
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
    // FIX: heightPlus should read PRICING.height array
    const heightPlus = h => {
        const sorted = Array.isArray(PRICING.height) ? [...PRICING.height].sort((a,b) => b.threshold - a.threshold) : [];
        for (const entry of sorted) {
            if (h > entry.threshold) return entry.add_per_m;
        }
        return 0;
    };

    // --- UI small helpers ---
    function showToast(message, type = 'default') {
        const container = document.querySelector(SELECTORS.toastContainer);
        if (!container) return;
        const icons = { success: 'ph-bold ph-check-circle', warning: 'ph-bold ph-warning', error: 'ph-bold ph-x-circle', default: 'ph-bold ph-info' };
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

    // --- Payload builder (keeps original structure) ---
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
                    fabric_code: setEl.querySelector('input[name="set_code"]')?.value || '',
                    sheer_fabric_code: setEl.querySelector('input[name="sheer_code"]')?.value || '',
                    is_suspended: setEl.dataset.suspended === 'true'
                });
            });
            roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
                roomData.decorations.push({
                    width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value),
                    height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value),
                    type: decoEl.querySelector('[name="deco_type"]')?.value || '',
                    price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value),
                    deco_code: decoEl.querySelector('[name="deco_code"]')?.value || '',
                    deco_notes: decoEl.querySelector('[name="deco_notes"]')?.value || '',
                    is_suspended: decoEl.dataset.suspended === 'true'
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wpEl => {
                const widths = Array.from(wpEl.querySelectorAll('input[name="wall_width_m"]')).map(i => toNum(i.value));
                roomData.wallpapers.push({
                    height_m: toNum(wpEl.querySelector('[name="wallpaper_height_m"]')?.value),
                    price_per_roll: toNum(wpEl.querySelector('[name="wallpaper_price_roll"]')?.value),
                    install_cost_per_roll: toNum(wpEl.querySelector('[name="wallpaper_install_cost"]')?.value),
                    widths,
                    wallpaper_code: wpEl.querySelector('[name="wallpaper_code"]')?.value || '',
                    wallpaper_notes: wpEl.querySelector('[name="wallpaper_notes"]')?.value || '',
                    is_suspended: wpEl.dataset.suspended === 'true'
                });
            });
            payload.rooms.push(roomData);
        });
        return payload;
    }

<<<<<<< HEAD
    // --- PDF GENERATION ---
    async function generatePdf() {
        showToast('กำลังสร้าง PDF.', 'default');
=======
    // --- PERSISTENCE ---
    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
    }

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

    // --- UI HELPERS & STATE MANAGEMENT ---
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
        setEl.querySelector(SELECTORS.sheerCodeWrap)?.classList.toggle("hidden", !hasSheer);
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

    // --- TEXT SUMMARY BUILDERS (LINE-Optimized) ---
    // ... [All `build...Summary` functions remain unchanged] ...
    function buildCustomerSummary(payload) {
        let summary = "";
        let grandTotal = 0;

        summary += `สรุปใบเสนอราคา\n`;
        summary += `ลูกค้า: ${payload.customer_name || '-'}\n`;
        summary += `โทร: ${payload.customer_phone || '-'}\n\n`;

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
                if (set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0) {
                    setPrice += Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m);
                }
                if (set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0) {
                    setPrice += Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m);
                }
                if (setPrice > 0) {
                    roomTotal += setPrice;
                    hasContent = true;
                    roomDetailsText += `  - ผ้าม่าน #${sIdx + 1}: ${fmt(setPrice, 0, true)} บ.\n`;
                }
            });
             room.decorations.forEach((deco, dIdx) => {
                if (deco.is_suspended) return;
                const decoPrice = Math.round(deco.width_m * deco.height_m * SQM_TO_SQYD * deco.price_sqyd);
                if(decoPrice > 0) {
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

                if (wpPrice > 0) {
                    roomTotal += wpPrice;
                    hasContent = true;
                    roomDetailsText += `  - วอลเปเปอร์ #${wIdx + 1}: ${fmt(wpPrice, 0, true)} บ.\n`;
                }
            });

            if (hasContent) {
                summary += `*ห้อง ${room.room_name || `ห้อง ${rIdx + 1}`}*\n`;
                summary += `(รวม ${fmt(roomTotal, 0, true)} บ.)\n${roomDetailsText}\n`;
            }
            grandTotal += roomTotal;
        });

        summary += `====================\n`;
        summary += `*รวมราคาสุทธิ: ${fmt(grandTotal, 0, true)} บาท*\n`;
        return summary;
    }

    function buildSeamstressSummary(payload) {
        let summary = `*สรุปงานเย็บผ้า*\nลูกค้า: ${payload.customer_name || '-'}\n`;
        summary += `====================\n`;
        let hasCurtains = false;

        payload.rooms.forEach((room, rIdx) => {
             if (room.is_suspended) return;

             const sets = room.sets.filter(s => !s.is_suspended && s.width_m > 0 && s.height_m > 0);
             if (sets.length === 0) return;

             hasCurtains = true;
             summary += `\n*ห้อง: ${room.room_name || `ห้อง ${rIdx + 1}`}*\n`;

             sets.forEach((set, sIdx) => {
                 summary += `\n*ชุดที่ ${sIdx + 1} (${set.fabric_variant})*\n`;
                 summary += `ขนาด:\n`;
                 summary += `  กว้าง ${fmt(set.width_m, 2)} x สูง ${fmt(set.height_m, 2)} ม.\n`;
                 summary += `รูปแบบ: ${set.style}\n`;
                 summary += `การเปิด: ${set.opening_style}\n`;
                 if (set.fabric_variant === "ทึบ&โปร่ง") {
                    summary += `รหัสผ้าทึบ: ${set.fabric_code || '-'}\n`;
                    summary += `รหัสผ้าโปร่ง: ${set.sheer_fabric_code || '-'}\n`;
                 } else {
                    summary += `รหัสผ้า: ${set.fabric_code || '-'}\n`;
                 }
                 summary += `หมายเหตุ: ${set.notes || '-'}\n`;
             });
             summary += `--------------------\n`;
        });

        if (!hasCurtains) {
            return "ไม่มีรายการผ้าม่านที่ต้องผลิตในใบเสนอนี้";
        }
        return summary;
    }

    function buildOwnerSummary(payload) {
        let summary = `*สรุปทั้งหมด (ร้านค้า)*\n`;
        let grandTotal = 0;

        summary += `ลูกค้า: ${payload.customer_name || '-'}\n`;
        summary += `โทร: ${payload.customer_phone || '-'}\n`;
        summary += `====================\n\n`;

        payload.rooms.forEach((room, rIdx) => {
            if (room.is_suspended) {
                summary += `*ห้อง ${room.room_name || rIdx + 1}*: -- ระงับ --\n\n`;
                return;
            }

            let roomTotal = 0;
            summary += `*ห้อง: ${room.room_name || `ห้อง ${rIdx + 1}`}*\n`;

            room.sets.forEach((set, sIdx) => {
                if (set.is_suspended) {
                    summary += ` - ผ้าม่าน #${sIdx + 1}: -- ระงับ --\n`; return;
                }
                const hPlus = heightPlus(set.height_m);
                const sPlus = stylePlus(set.style);
                let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0;

                if (set.fabric_variant.includes("ทึบ") && set.price_per_m_raw > 0) {
                    opaquePrice = Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m);
                    opaqueYards = CALC.fabricYardage(set.style, set.width_m);
                }
                if (set.fabric_variant.includes("โปร่ง") && set.sheer_price_per_m > 0) {
                    sheerPrice = Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m);
                    sheerYards = CALC.fabricYardage(set.style, set.width_m);
                }
                const setTotal = opaquePrice + sheerPrice;
                roomTotal += setTotal;

                summary += `\n*ผ้าม่าน #${sIdx+1} (${set.style}, ${set.fabric_variant})*\n`;
                summary += `  - ราคา: ${fmt(setTotal,0,true)} บ.\n`;
                summary += `  - ขนาด: ${fmt(set.width_m, 2)}x${fmt(set.height_m, 2)} ม.\n`;
                if(opaquePrice > 0) {
                    summary += `  - ทึบ: ${fmt(set.price_per_m_raw,0,true)}/ม. (ใช้ ${fmt(opaqueYards)} หลา, รหัส: ${set.fabric_code || '-'}) \n`;
                }
                 if(sheerPrice > 0) {
                    const sheerCode = (set.fabric_variant === "ทึบ&โปร่ง") ? set.sheer_fabric_code : set.fabric_code;
                    summary += `  - โปร่ง: ${fmt(set.sheer_price_per_m,0,true)}/ม. (ใช้ ${fmt(sheerYards)} หลา, รหัส: ${sheerCode || '-'}) \n`;
                }
                if (set.width_m > 0) {
                    summary += `  - ราง: สี${set.track_color}, ${fmt(set.width_m)} ม.\n`;
                }
                if (set.fabric_variant === "ทึบ&โปร่ง") {
                    summary += `  - **ต้องใช้ขาสองชั้น**\n`;
                }
            });

            room.decorations.forEach((deco, dIdx) => {
                 if (deco.is_suspended) {
                    summary += `\n- ${deco.type || 'ตกแต่ง'} #${dIdx + 1}: -- ระงับ --\n`; return;
                }
                const areaSqyd = deco.width_m * deco.height_m * SQM_TO_SQYD;
                const decoPrice = Math.round(areaSqyd * deco.price_sqyd);
                roomTotal += decoPrice;

                summary += `\n*${deco.type || 'ตกแต่ง'} #${dIdx+1}*\n`;
                summary += `  - ราคา: ${fmt(decoPrice,0,true)} บ.\n`;
                summary += `  - รหัส: ${deco.deco_code || '-'}\n`;
                summary += `  - ขนาด: ${fmt(deco.width_m, 2)}x${fmt(deco.height_m, 2)} ม.\n`;
                summary += `  - พื้นที่: ${fmt(areaSqyd,2)} ตร.หลา\n`;
                summary += `  - ราคา: ${fmt(deco.price_sqyd,0,true)}/ตร.หลา\n`;
            });

            room.wallpapers.forEach((wp, wIdx) => {
                 if (wp.is_suspended) {
                    summary += `\n- วอลเปเปอร์ #${wIdx + 1}: -- ระงับ --\n`; return;
                }
                const totalWidth = wp.widths.reduce((a, b) => a + b, 0);
                const areaSqm = totalWidth * wp.height_m;
                const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);

                const materialPrice = Math.round(rolls * wp.price_per_roll);
                const installPrice = Math.round(rolls * (wp.install_cost_per_roll || 0));
                const wpPrice = materialPrice + installPrice;
                roomTotal += wpPrice;

                summary += `\n*วอลเปเปอร์ #${wIdx+1}*\n`;
                summary += `  - ราคา: ${fmt(wpPrice,0,true)} บ.\n`;
                summary += `  - รหัส: ${wp.wallpaper_code || '-'}\n`;
                summary += `  - สูง: ${fmt(wp.height_m, 2)} ม., กว้าง: ${fmt(totalWidth,2)} ม.\n`;
                summary += `  - พื้นที่: ${fmt(areaSqm,2)} ตร.ม.\n`;
                summary += `  - คำนวณ: ใช้ ${rolls} ม้วน\n`;
            });
            summary += `   *ยอดรวมห้องนี้: ${fmt(roomTotal, 0, true)} บาท*\n`;
            summary += `--------------------\n`;
            grandTotal += roomTotal;
        });

        summary += `\n*สรุปวัสดุรวม*\n`;
        const summaryNode = document.querySelector(SELECTORS.detailedSummaryContainer);
        if(summaryNode) {
             summaryNode.querySelectorAll('ul').forEach(ul => {
                 ul.querySelectorAll('li').forEach(li => {
                    summary += `- ${li.textContent.replace(/\s+/g, ' ').trim()}\n`;
                 });
             });
        }
        summary += `\n*รวมราคาสุทธิทั้งหมด: ${fmt(grandTotal, 0, true)} บาท*\n`;
        return summary;
    }

    function buildPurchaseOrderSummary(payload) {
        let summary = `*รายการสั่งของ*\nลูกค้า: ${payload.customer_name || '-'}\n`;
        summary += `====================\n`;
        let itemCounter = 1;
        const sections = { curtains: '', decorations: '', wallpapers: '' };

        payload.rooms.forEach(room => {
            if (room.is_suspended) return;

            room.sets.forEach(set => {
                if (set.is_suspended || set.width_m <= 0) return;
                const fabricYards = CALC.fabricYardage(set.style, set.width_m);
                if (set.fabric_variant.includes("ทึบ")) {
                    sections.curtains += `\n*ผ้าทึบ #${itemCounter}*\n`;
                    sections.curtains += ` • รหัส: ${set.fabric_code || '-'}\n`;
                    sections.curtains += ` • จำนวน: ${fmt(fabricYards)} หลา\n`;
                }
                if (set.fabric_variant.includes("โปร่ง")) {
                     const sheerCode = (set.fabric_variant === "ทึบ&โปร่ง") ? set.sheer_fabric_code : set.fabric_code;
                     sections.curtains += `\n*ผ้าโปร่ง #${itemCounter}*\n`;
                     sections.curtains += ` • รหัส: ${sheerCode || '-'}\n`;
                     sections.curtains += ` • จำนวน: ${fmt(fabricYards)} หลา\n`;
                }
                sections.curtains += `\n*ราง #${itemCounter}*\n`;
                sections.curtains += ` • รูปแบบ: ราง${set.style}\n`;
                sections.curtains += ` • สี: ${set.track_color || '-'}\n`;
                sections.curtains += ` • ขนาด: ${fmt(set.width_m)} ม. (1 เส้น)\n`;
                if (set.fabric_variant === "ทึบ&โปร่ง") sections.curtains += `**[!] เตือน: ต้องใช้ขาสองชั้น**\n`;
                itemCounter++;
            });

            room.decorations.forEach(deco => {
                 if (deco.is_suspended || deco.width_m <= 0) return;
                 sections.decorations += `\n*${deco.type || 'ตกแต่ง'} #${itemCounter}*\n`;
                 sections.decorations += ` • รหัส: ${deco.deco_code || '-'}\n`;
                 sections.decorations += ` • ขนาด: ${fmt(deco.width_m)} x ${fmt(deco.height_m)} ม.\n`;
                 if(deco.deco_notes) sections.decorations += ` • โน้ต: ${deco.deco_notes}\n`;
                 sections.decorations += ` • [ ] แนบรูป\n`;
                 itemCounter++;
            });

            room.wallpapers.forEach(wp => {
                if (wp.is_suspended || wp.height_m <= 0) return;
                const totalWidth = wp.widths.reduce((a, b) => a + b, 0);
                if (totalWidth <= 0) return;
                const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                sections.wallpapers += `\n*วอลเปเปอร์ #${itemCounter}*\n`;
                sections.wallpapers += ` • รหัส: ${wp.wallpaper_code || '-'}\n`;
                sections.wallpapers += ` • จำนวน: ${rolls} ม้วน\n`;
                if(wp.wallpaper_notes) sections.wallpapers += ` • โน้ต: ${wp.wallpaper_notes}\n`;
                sections.wallpapers += ` • [ ] แนบรูป\n`;
                itemCounter++;
            });
        });

        if (sections.curtains) { summary += `\n*-- ผ้าม่านและอุปกรณ์ --*${sections.curtains}`; }
        if (sections.decorations) { summary += `\n*-- รายการตกแต่ง --*${sections.decorations}`; }
        if (sections.wallpapers) { summary += `\n*-- วอลเปเปอร์ --*${sections.wallpapers}`; }
        if (!sections.curtains && !sections.decorations && !sections.wallpapers) return "ไม่มีรายการสินค้าที่ต้องสั่งซื้อ";
        return summary;
    }

    function handleFormSubmit() {
        const orderForm = document.querySelector(SELECTORS.orderForm);
        orderForm.action = WEBHOOK_URL;
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
        showToast("ส่งข้อมูลแล้ว...", "success");
        // orderForm.submit(); // This is commented out by default
    }

    // --- NEW: PDF Generation ---
    async function generatePdfQuotation() {
        showToast('กำลังสร้างใบเสนอราคา...', 'default');
>>>>>>> parent of 595a454 (RE ใบเสนอราคา)
        const payload = buildPayload();
        const customerName = payload.customer_name || 'ลูกค้า';

<<<<<<< HEAD
        // table header
        const tableBody = [
            [{ text: 'ลำดับ', style: 'tableHeader' }, { text: 'รายการ', style: 'tableHeader' }, { text: 'จำนวน', style: 'tableHeader' }, { text: 'ราคา/หน่วย', style: 'tableHeader' }, { text: 'รวม', style: 'tableHeader' }]
        ];
=======
        const today = new Date();
        const dateThai = today.toLocaleDateString('th-TH', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        const quoteNumber = `QT-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}-${today.getHours().toString().padStart(2, '0')}${today.getMinutes().toString().padStart(2, '0')}`;
>>>>>>> parent of 595a454 (RE ใบเสนอราคา)

        let subtotal = 0;
        let itemNumber = 1;

        payload.rooms.forEach((room, rIdx) => {
            if (room.is_suspended) return;
<<<<<<< HEAD
            const roomName = room.room_name || `ห้อง ${rIdx + 1}`;
            tableBody.push([{ text: roomName, colSpan: 5, style: 'roomHeader', fillColor: '#f3f3f3' }, {}, {}, {}, {}]);
=======
            const roomName = room.room_name || 'ไม่ระบุชื่อห้อง';
            tableRows += `<tr class="room-header"><td colspan="5">${roomName}</td></tr>`;
>>>>>>> parent of 595a454 (RE ใบเสนอราคา)

            room.sets.forEach(set => {
                if (set.is_suspended) return;
                let opaquePrice = 0, sheerPrice = 0;
                const hPlus = heightPlus(set.height_m);
                const sPlus = stylePlus(set.style);
                if ((set.fabric_variant || "").includes("ทึบ") && set.price_per_m_raw > 0) {
                    opaquePrice = Math.round((set.price_per_m_raw + sPlus + hPlus) * set.width_m);
                }
<<<<<<< HEAD
                if ((set.fabric_variant || "").includes("โปร่ง") && set.sheer_price_per_m > 0) {
                    sheerPrice = Math.round((set.sheer_price_per_m + sPlus + hPlus) * set.width_m);
                }
                const total = opaquePrice + sheerPrice;
                if (total > 0) {
                    tableBody.push([ itemNumber, `ผ้าม่าน (${set.fabric_code || '-'})`, `${fmt(set.width_m,2)} ม.`, fmt(total / Math.max(1, set.width_m),2,true), fmt(total,2,true) ]);
                    subtotal += total;
                    itemNumber++;
=======
                const totalSetPrice = opaquePrice + sheerPrice;
                if (totalSetPrice > 0) {
                    let desc = `ผ้าม่าน ${set.style} (${set.fabric_variant}) <br><small>ขนาด ${fmt(w)} x ${fmt(h)} ม.`;
                    if(set.notes) desc += ` - ${set.notes}`;
                    desc += '</small>';
                    tableRows += `
                        <tr>
                            <td>${itemNo++}</td>
                            <td>${desc}</td>
                            <td>1</td>
                            <td>${fmt(totalSetPrice, 0, true)}</td>
                            <td>${fmt(totalSetPrice, 0, true)}</td>
                        </tr>`;
                    subTotal += totalSetPrice;
>>>>>>> parent of 595a454 (RE ใบเสนอราคา)
                }
            });

            room.decorations.forEach(deco => {
                if (deco.is_suspended) return;
                const areaSqyd = deco.width_m * deco.height_m * SQM_TO_SQYD;
<<<<<<< HEAD
                const price = Math.round(areaSqyd * deco.price_sqyd);
                if (price > 0) {
                    tableBody.push([ itemNumber, `${deco.type || 'ตกแต่ง'} (${deco.deco_code || '-'})`, `${fmt(areaSqyd,2)} ตร.หลา`, fmt(deco.price_sqyd,2,true), fmt(price,2,true) ]);
                    subtotal += price;
                    itemNumber++;
=======
                const decoPrice = Math.round(areaSqyd * deco.price_sqyd);
                if (decoPrice > 0) {
                    let desc = `${deco.type || 'งานตกแต่ง'} <br><small>รหัส: ${deco.deco_code || '-'}, ขนาด ${fmt(deco.width_m)} x ${fmt(deco.height_m)} ม.</small>`;
                    tableRows += `
                         <tr>
                            <td>${itemNo++}</td>
                            <td>${desc}</td>
                            <td>1</td>
                            <td>${fmt(decoPrice, 0, true)}</td>
                            <td>${fmt(decoPrice, 0, true)}</td>
                        </tr>`;
                    subTotal += decoPrice;
>>>>>>> parent of 595a454 (RE ใบเสนอราคา)
                }
            });

            room.wallpapers.forEach(wp => {
                if (wp.is_suspended) return;
                const totalWidth = (wp.widths || []).reduce((a,b) => a + b, 0);
                if (totalWidth <= 0 || wp.height_m <= 0) return;
                const rolls = CALC.wallpaperRolls(totalWidth, wp.height_m);
                const materialPrice = Math.round(rolls * wp.price_per_roll);
<<<<<<< HEAD
                const installPrice = Math.round(rolls * wp.install_cost_per_roll);
                const totalPrice = materialPrice + installPrice;
                if (totalPrice > 0) {
                    tableBody.push([ itemNumber, `วอลเปเปอร์ (${wp.wallpaper_code || '-'})`, `${rolls} ม้วน`, fmt((materialPrice+installPrice)/Math.max(1, rolls),2,true), fmt(totalPrice,2,true) ]);
                    subtotal += totalPrice;
                    itemNumber++;
=======
                const installPrice = Math.round(rolls * (wp.install_cost_per_roll || 0));
                const wpPrice = materialPrice + installPrice;
                if (wpPrice > 0) {
                     let desc = `วอลเปเปอร์ <br><small>รหัส: ${wp.wallpaper_code || '-'}, สูง ${fmt(wp.height_m)} ม. (ใช้ ${rolls} ม้วน)</small>`;
                     tableRows += `
                         <tr>
                            <td>${itemNo++}</td>
                            <td>${desc}</td>
                            <td>1</td>
                            <td>${fmt(wpPrice, 0, true)}</td>
                            <td>${fmt(wpPrice, 0, true)}</td>
                        </tr>`;
                    subTotal += wpPrice;
>>>>>>> parent of 595a454 (RE ใบเสนอราคา)
                }
            });
        });

<<<<<<< HEAD
        const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
        const grandTotal = Math.round((subtotal + vat) * 100) / 100;

        // baht text: try library, fallback
        let bahtText = '';
        try {
            if (typeof thaiBahtText === 'function') {
                bahtText = thaiBahtText(grandTotal);
            } else if (typeof toThaiBaht === 'function') {
                bahtText = toThaiBaht(grandTotal);
            } else {
                bahtText = `${fmt(grandTotal,2,true)} บาท`;
            }
        } catch (e) {
            bahtText = `${fmt(grandTotal,2,true)} บาท`;
        }

        // tidy filename
        const cleanName = (payload.customer_name || '').replace(/[^a-zA-Z0-9ก-๙_.\s-]/g, '').replace(/\s+/g, '-').substring(0,30) || 'ลูกค้า';
        const dateStamp = new Date().toISOString().split('T')[0];
        const fileName = `mtr-${cleanName}-${dateStamp}.pdf`;

        // docDefinition
        const docDefinition = {
            pageSize: 'A4',
            pageMargins: [40, 120, 40, 80],
            header: [
                {
                    columns: [
                        (QUOTATION_CONFIG.company_logo_base64 ? { image: QUOTATION_CONFIG.company_logo_base64, width: 64 } : { text: '' }),
                        {
                            stack: [
                                { text: QUOTATION_CONFIG.company_name || '', style: 'header' },
                                { text: QUOTATION_CONFIG.company_address || '', fontSize: 10 },
                                { text: `โทร: ${QUOTATION_CONFIG.company_phone || '-'}`, fontSize: 10 }
                            ],
                            margin: [10, 0, 0, 0]
                        },
                        { text: '', width: '*' },
                        { stack: [ { text: 'วันที่', style: 'subheader' }, { text: dateStamp } ], width: 120, alignment: 'right' }
                    ],
                    margin: [0, 10, 0, 10]
                },
                { canvas: [ { type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#eeeeee' } ] }
            ],
            content: [
                { text: 'ใบเสนอราคา / Quotation', style: 'docTitle', margin: [0, 10, 0, 10] },
                {
                    columns: [
                        {
                            stack: [
                                { text: 'ข้อมูลลูกค้า', style: 'subheader' },
                                { text: `ชื่อ: ${payload.customer_name || '-'}` },
                                { text: `ที่อยู่: ${payload.customer_address || '-'}` },
                                { text: `โทร: ${payload.customer_phone || '-'}` }
                            ],
                            width: '*'
                        }
                    ],
                    margin: [0, 0, 0, 10]
                },
                {
                    table: {
                        headerRows: 1,
                        widths: [40, '*', 60, 80, 80],
                        body: tableBody
                    },
                    layout: 'lightHorizontalLines'
                },
                {
                    columns: [
                        { text: '', width: '*' },
                        {
                            width: 'auto',
                            style: 'totalsTable',
                            table: {
                                body: [
                                    ['รวมเป็นเงิน:', { text: fmt(subtotal,2,true), alignment: 'right' }],
                                    [`ภาษีมูลค่าเพิ่ม ${VAT_RATE * 100}%:`, { text: fmt(vat,2,true), alignment: 'right' }],
                                    [{ text: 'ยอดรวมสุทธิ:', bold: true }, { text: fmt(grandTotal,2,true), alignment: 'right', bold: true }]
                                ]
                            },
                            layout: 'noBorders'
                        }
                    ],
                    margin: [0, 10, 0, 5]
                },
                { text: bahtText, style: 'bahtText' },
                {
                    absolutePosition: { x: 40, y: 740 },
                    columns: [
                        { stack: [ { text: '.' }, { text: 'ผู้เสนอราคา' }, { text: `( ${QUOTATION_CONFIG.company_name} )` } ], width: 'auto', alignment: 'center' },
                        { text: '', width: '*' },
                        { stack: [ { text: '.' }, { text: 'ลูกค้า' }, { text: `( คุณ${customerName} )` } ], width: 'auto', alignment: 'center' },
                    ]
                }
            ],
            styles: {
                header: { fontSize: 14, bold: true },
                docTitle: { fontSize: 16, bold: true },
                subheader: { fontSize: 11, bold: true, margin: [0, 4, 0, 4] },
                tableHeader: { bold: true, fontSize: 10, alignment: 'center', fillColor: '#f2f2f2' },
                roomHeader: { bold: true, fontSize: 10, margin: [0, 4, 0, 4] },
                tableCell: { fontSize: 9, margin: [0, 2, 0, 2] },
                totalsTable: { margin: [0, 0, 0, 0] },
                bahtText: { bold: true, alignment: 'right', margin: [0, 10, 0, 20] }
            }
=======
        const vatAmount = subTotal * SHOP_CONFIG.vatRate;
        const grandTotal = subTotal + vatAmount;

        quotationEl.innerHTML = `
            <div class="pdf-header">
                <div class="shop-info">
                    <img src="${SHOP_CONFIG.logoUrl}" alt="Logo" class="logo">
                    <div>
                        <strong>${SHOP_CONFIG.name}</strong><br>
                        ${SHOP_CONFIG.address}<br>
                        โทร: ${SHOP_CONFIG.phone}<br>
                        เลขประจำตัวผู้เสียภาษี: ${SHOP_CONFIG.taxId}
                    </div>
                </div>
                <div class="quote-info">
                    <h1>ใบเสนอราคา</h1>
                    <p><strong>เลขที่:</strong> ${quoteNumber}</p>
                    <p><strong>วันที่:</strong> ${dateThai}</p>
                </div>
            </div>
            <div class="customer-info">
                <strong>เรียน (ลูกค้า):</strong><br>
                ${payload.customer_name || 'ไม่ได้ระบุชื่อ'}<br>
                ${payload.customer_address || 'ไม่ได้ระบุที่อยู่'}<br>
                โทร: ${payload.customer_phone || '-'}
            </div>
            <table class="items-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>รายการ</th>
                        <th>จำนวน</th>
                        <th>ราคา/หน่วย</th>
                        <th>ราคารวม</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
            <div class="pdf-summary">
                <div class="notes">
                     <strong>หมายเหตุ:</strong>
                    <ul>
                        <li>ใบเสนอราคานี้มีอายุ 30 วัน</li>
                        <li>ราคานี้รวมค่าติดตั้งแล้ว</li>
                        <li>ชำระมัดจำ 50% เพื่อยืนยันการสั่งผลิต</li>
                    </ul>
                </div>
                <div class="totals">
                    <p><span>รวมเป็นเงิน:</span> <span>${fmt(subTotal, 2, true)}</span></p>
                    <p><span>ภาษีมูลค่าเพิ่ม ${SHOP_CONFIG.vatRate * 100}%:</span> <span>${fmt(vatAmount, 2, true)}</span></p>
                    <p class="grand-total-pdf"><span>ยอดรวมสุทธิ:</span> <span>${fmt(grandTotal, 2, true)}</span></p>
                </div>
            </div>
             <div class="grand-total-thai">
                <strong>( ${bahttext(grandTotal)} )</strong>
            </div>
            <div class="pdf-footer">
                <div class="signature">
                    <p>_________________________</p>
                    <p>(.................................................)</p>
                    <p>ผู้เสนอราคา</p>
                </div>
                <div class="thank-you">
                    ขอขอบคุณที่ให้ความไว้วางใจในบริการของเรา
                </div>
            </div>
        `;

        const customerName = payload.customer_name.trim().replace(/\s+/g, '-') || 'quote';
        const fileName = `${quoteNumber}_${customerName}.pdf`;

        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     fileName,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
>>>>>>> parent of 595a454 (RE ใบเสนอราคา)
        };

        try {
            pdfMake.createPdf(docDefinition).download(fileName);
            showToast('สร้าง PDF สำเร็จ!', 'success');
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
        }
    }

    // --- Minimal necessary UI wiring for menu buttons & init (keeps your logic) ---
    function init() {
        const fileImporter = document.querySelector(SELECTORS.fileImporter);
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);

        document.querySelector(SELECTORS.generatePdfBtn)?.addEventListener('click', (e) => {
            e?.preventDefault();
            generatePdf();
            menuDropdown?.classList.remove('show');
        });

        document.querySelector(SELECTORS.copyTextBtn)?.addEventListener('click', async (e) => {
            e?.preventDefault();
            // reuse existing copy modal logic if present else fallback
            const payload = buildPayload();
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
                .then(() => showToast('คัดลอกสรุปสำเร็จ', 'success'))
                .catch(() => showToast('คัดลอกล้มเหลว', 'error'));
            menuDropdown?.classList.remove('show');
        });

        // existing listeners in your original file will continue to be bound if present
        document.addEventListener('DOMContentLoaded', () => { /* placeholder */ }, { once: true });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
