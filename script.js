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
    const CALC_FACTOR = {
        curtain: 2.5,
        sheer_default: 2.5,
        sheer_three_pass: 3.0,
        sheer_wave_curtain: 2.0,
    };
    const TEXT_SUM_HEADERS = {
        customer: "ข้อมูลลูกค้า",
        total: "ยอดรวมสุทธิ",
        curtain: "ยอดรวมผ้าม่าน",
        wallpaper: "ยอดรวมวอลเปเปอร์",
        install: "ค่าติดตั้ง",
        misc: "ค่าเบ็ดเตล็ด",
        discount: "ส่วนลด",
    };

    const SELECTORS = {
        addRoomHeaderBtn: "#addRoomHeaderBtn",
        addRoomBtn: "#addRoomBtn",
        roomsContainer: "#roomsContainer",
        roomTpl: "#roomTpl",
        roomTotal: "[data-room-total]",
        roomSuspended: ".is-suspended",
        setTpl: "#setTpl",
        setsContainer: "[data-sets-container]",
        addSetBtn: "[data-act='add-set']",
        delSetBtn: "[data-act='del-set']",
        delWallBtn: "[data-act='del-wall']",
        wallpaperTpl: "#wallpaperTpl",
        wallsContainer: "[data-walls-container]",
        addWallBtn: "[data-act='add-wall']",
        copyJsonBtn: "#copyJsonBtn",
        copyTextBtn: "#copyTextBtn",
        submitBtn: "#submitBtn",
        summaryBtn: "#summaryBtn",
        clearBtn: "#clearBtn",
        lockBtn: "#lockBtn",
        lockText: ".lock-text",
        orderForm: "#orderForm",
        jsonModal: "#jsonModal",
        textModal: "#textModal",
        jsonPayload: "#jsonPayload",
        textSummary: "#textSummary",
        modalCloseBtn: "[data-act='close-modal']",
        modalCopyJsonBtn: "[data-act='copy-json']",
        modalCopyTextBtn: "[data-act='copy-text']",
        menuBtn: "#menuBtn",
        menuDropdown: "#menuDropdown",
        importBtn: "#importBtn",
        exportBtn: "#exportBtn",
        payloadInput: "#payloadInput"
    };

    const CURRENCY_FORMAT = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 });
    const NUMBER_FORMAT = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
    const CURRENCY_INPUT_OPTIONS = {
        prefix: '',
        suffix: ' บ.',
        centsLimit: 0,
        thousandsSeparator: ',',
        decimalPlaces: 0
    };
    const METER_INPUT_OPTIONS = {
        prefix: '',
        suffix: ' ม.',
        centsLimit: 2,
        thousandsSeparator: ',',
        decimalPlaces: 2
    };

    let roomCount = 0;
    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const orderForm = document.querySelector(SELECTORS.orderForm);

    const formatCurrency = (value) => CURRENCY_FORMAT.format(value).replace('฿', '').trim();
    const formatNumber = (value) => NUMBER_FORMAT.format(value);
    const parseCurrency = (str) => parseFloat(String(str).replace(/[^\d.]/g, '') || 0);

    function showToast(message, type = 'info') {
        const toastContainer = document.querySelector('.toast-container') || (() => {
            const el = document.createElement('div');
            el.className = 'toast-container';
            document.body.appendChild(el);
            return el;
        })();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function calculateCurtainTotal(setEl) {
        if (setEl.classList.contains('is-suspended')) return { total: 0, sqm: 0, sqyd: 0 };
        const width = parseCurrency(setEl.querySelector('[name="width_m"]').value);
        const height = parseCurrency(setEl.querySelector('[name="height_m"]').value);
        const qty = parseCurrency(setEl.querySelector('[name="qty"]').value);
        const fabricPrice = parseCurrency(setEl.querySelector('[name="fabric_price"]').value);
        const style = setEl.querySelector('[name="style"]').value;
        const sheerIncluded = setEl.querySelector('[name="sheer_include"]').checked;
        const sheerPrice = sheerIncluded ? parseCurrency(setEl.querySelector('[name="sheer_price"]').value) : 0;
        const misc = parseCurrency(setEl.querySelector('[name="misc"]').value);

        if (width <= 0 || height <= 0 || qty <= 0 || fabricPrice <= 0) return { total: 0, sqm: 0, sqyd: 0 };

        const sqm = width * height * qty;
        const sqyd = sqm * SQM_TO_SQYD;
        const calcFactor = getCalculationFactor(setEl);
        const calcSqm = sqm * calcFactor;
        const calcSqyd = sqm * SQM_TO_SQYD * calcFactor;
        const styleSurcharge = PRICING.style_surcharge[style] || 0;
        const heightPrice = getHeightPrice(height);

        const curtainTotal = (calcSqm * fabricPrice) + (heightPrice * width * qty) + (styleSurcharge * width * qty);
        const sheerTotal = sheerIncluded ? (calcSqm * sheerPrice) : 0;
        const total = curtainTotal + sheerTotal + misc;

        return { total, sqm: sqm, sqyd: sqm * SQM_TO_SQYD, curtainTotal, sheerTotal, misc };
    }

    function calculateWallpaperTotal(setEl) {
        if (setEl.classList.contains('is-suspended')) return { total: 0, sqm: 0, rolls: 0 };
        const wallpaperHeight = parseCurrency(setEl.querySelector('[name="wallpaper_height_m"]').value);
        const pricePerRoll = parseCurrency(setEl.querySelector('[name="wallpaper_price_roll"]').value);
        if (wallpaperHeight <= 0 || pricePerRoll <= 0) return { total: 0, sqm: 0, rolls: 0 };

        const wallWidths = Array.from(setEl.querySelectorAll('[name="wall_width_m"]')).map(input => parseCurrency(input.value)).filter(val => val > 0);
        const totalWidth = wallWidths.reduce((sum, width) => sum + width, 0);
        const totalArea = totalWidth * wallpaperHeight;

        const rollLength = 10;
        const rollWidth = 0.53;
        const areaPerRoll = rollLength * rollWidth;
        const numRolls = Math.ceil(totalArea / areaPerRoll);

        const total = numRolls * pricePerRoll;

        return { total, sqm: totalArea, rolls: numRolls };
    }

    function updateSetSummary(setEl) {
        const type = setEl.dataset.setType;
        const summaryEl = setEl.querySelector('[data-set-summary]') || setEl.querySelector('[data-wallpaper-summary]');
        if (!summaryEl) return;

        if (type === 'curtain') {
            const { total, sqm, sqyd } = calculateCurtainTotal(setEl);
            summaryEl.innerHTML = `ราคา: <span class="price">${formatCurrency(total)} บ.</span> • พื้นที่: <span class="price">${formatNumber(sqm)} ตร.ม.</span> • ผ้า: <span class="price">${formatNumber(sqyd)} ตร.หลา</span>`;
        } else if (type === 'wallpaper') {
            const { total, sqm, rolls } = calculateWallpaperTotal(setEl);
            summaryEl.innerHTML = `ราคา: <span class="price">${formatCurrency(total)} บ.</span> • พื้นที่: <span class="price">${formatNumber(sqm)}</span> ตร.ม. • ใช้ <span class="price">${rolls}</span> ม้วน`;
        }
    }

    function updateRoomTotals() {
        const rooms = document.querySelectorAll('.room');
        let grandTotal = 0;
        let curtainTotal = 0;
        let wallpaperTotal = 0;
        let installTotal = 0;
        let discountTotal = 0;
        let miscTotal = 0;

        rooms.forEach(roomEl => {
            let roomTotal = 0;
            let roomCurtainTotal = 0;
            let roomWallpaperTotal = 0;
            let roomMiscTotal = 0;

            const sets = roomEl.querySelectorAll('.set[data-set-type="curtain"]');
            sets.forEach(setEl => {
                const { total, misc } = calculateCurtainTotal(setEl);
                roomTotal += total;
                roomCurtainTotal += total;
                roomMiscTotal += misc;
            });
            
            const wallpapers = roomEl.querySelectorAll('.set[data-set-type="wallpaper"]');
            wallpapers.forEach(setEl => {
                const { total, sqm, rolls } = calculateWallpaperTotal(setEl);
                roomTotal += total;
                roomWallpaperTotal += total;
            });

            roomEl.querySelector(SELECTORS.roomTotal).textContent = formatCurrency(roomTotal);
            grandTotal += roomTotal;
            curtainTotal += roomCurtainTotal;
            wallpaperTotal += roomWallpaperTotal;
        });

        document.getElementById('grandTotal').textContent = formatCurrency(grandTotal);
        document.getElementById('curtainTotal').textContent = formatCurrency(curtainTotal);
        document.getElementById('wallpaperTotal').textContent = formatCurrency(wallpaperTotal);
        // Assuming install/discount/misc are not calculated dynamically here, but would be added later
        // For now, these will be 0 as per the initial HTML
        // document.getElementById('installTotal').textContent = formatCurrency(installTotal);
        // document.getElementById('discountTotal').textContent = formatCurrency(discountTotal);
        // document.getElementById('miscTotal').textContent = formatCurrency(miscTotal);
    }

    function handleInput(e) {
        const input = e.target;
        const setEl = input.closest('.set');
        if (setEl) {
            updateSetSummary(setEl);
            updateRoomTotals();
        }
    }

    function addOptions(selectEl, options, prices) {
        options.forEach((option, index) => {
            const opt = document.createElement('option');
            opt.value = prices[index];
            opt.textContent = `${option} (${formatCurrency(prices[index])} บ.)`;
            selectEl.appendChild(opt);
        });
    }

    function addSelectOptions(setEl) {
        const fabricSelect = setEl.querySelector('[name="fabric_price"]');
        if (fabricSelect) {
            addOptions(fabricSelect, PRICING.fabric.map((p, i) => `Option ${i + 1}`), PRICING.fabric);
        }
        const sheerSelect = setEl.querySelector('[name="sheer_price"]');
        if (sheerSelect) {
            addOptions(sheerSelect, PRICING.sheer.map((p, i) => `Option ${i + 1}`), PRICING.sheer);
        }
        const styleSelect = setEl.querySelector('[name="style"]');
        if (styleSelect) {
            Object.keys(PRICING.style_surcharge).forEach(style => {
                const opt = document.createElement('option');
                opt.value = style;
                opt.textContent = style;
                if (PRICING.style_surcharge[style] > 0) {
                    opt.textContent += ` (+${formatCurrency(PRICING.style_surcharge[style])} บ.)`;
                }
                styleSelect.appendChild(opt);
            });
        }
    }

    function addRoom(payload = null) {
        const roomTpl = document.querySelector(SELECTORS.roomTpl);
        const roomEl = roomTpl.content.cloneNode(true).firstElementChild;
        roomCount++;
        roomEl.dataset.roomId = `room-${roomCount}`;
        const roomNameInput = roomEl.querySelector('[name="room_name"]');
        roomNameInput.value = `ห้องที่ ${roomCount}`;
        roomEl.querySelector(SELECTORS.addSetBtn).addEventListener('click', () => addSet(roomEl));
        roomEl.querySelector('[data-act="del-room"]').addEventListener('click', (e) => {
            if (confirm("คุณต้องการลบห้องนี้หรือไม่?")) {
                roomEl.remove();
                updateRoomTotals();
            }
        });
        roomEl.querySelector('[data-act="suspend-room"]').addEventListener('click', (e) => toggleSuspend(roomEl, 'room'));
        
        roomsEl.appendChild(roomEl);
        
        if (payload) {
            roomNameInput.value = payload.name;
            const setsContainer = roomEl.querySelector(SELECTORS.setsContainer);
            setsContainer.innerHTML = "";
            payload.sets.forEach(setPayload => {
                if (setPayload.type === 'curtain') {
                    addSet(roomEl, setPayload);
                } else if (setPayload.type === 'wallpaper') {
                    addWallpaperSet(roomEl, setPayload);
                }
            });
        } else {
            addSet(roomEl);
        }
        updateRoomTotals();
    }

    function addSet(roomEl, payload = null) {
        const setTpl = document.querySelector(SELECTORS.setTpl);
        const setEl = setTpl.content.cloneNode(true).firstElementChild;
        addSelectOptions(setEl);
        setEl.querySelector('[name="sheer_include"]').addEventListener('change', (e) => {
            const sheerFields = setEl.querySelector('[data-sheer-fields]');
            sheerFields.style.display = e.target.checked ? 'grid' : 'none';
            updateSetSummary(setEl);
            updateRoomTotals();
        });
        setEl.querySelector('[data-act="del-set"]').addEventListener('click', () => {
            if (confirm("คุณต้องการลบชุดนี้หรือไม่?")) {
                setEl.remove();
                updateRoomTotals();
            }
        });
        setEl.querySelector('[data-act="suspend-set"]').addEventListener('click', (e) => toggleSuspend(setEl, 'set'));
        
        const setsContainer = roomEl.querySelector(SELECTORS.setsContainer);
        setsContainer.appendChild(setEl);
        
        if (payload) {
            setEl.querySelector('[name="width_m"]').value = payload.width_m;
            setEl.querySelector('[name="height_m"]').value = payload.height_m;
            setEl.querySelector('[name="qty"]').value = payload.qty;
            setEl.querySelector('[name="misc"]').value = payload.misc_text;
            setEl.querySelector('[name="fabric_price"]').value = payload.fabric_price;
            setEl.querySelector('[name="style"]').value = payload.style;
            setEl.querySelector('[name="sheer_include"]').checked = payload.sheer_include;
            setEl.querySelector('[name="sheer_price"]').value = payload.sheer_price;
            if (payload.sheer_include) {
                setEl.querySelector('[data-sheer-fields]').style.display = 'grid';
            }
        }
        updateSetSummary(setEl);
        updateRoomTotals();
    }
    
    function addWallpaperSet(roomEl, payload = null) {
        const wallpaperTpl = document.querySelector(SELECTORS.wallpaperTpl);
        const setEl = wallpaperTpl.content.cloneNode(true).firstElementChild;
        setEl.querySelector('[data-act="del-set"]').addEventListener('click', () => {
            if (confirm("คุณต้องการลบชุดนี้หรือไม่?")) {
                setEl.remove();
                updateRoomTotals();
            }
        });
        setEl.querySelector('[data-act="suspend-set"]').addEventListener('click', (e) => toggleSuspend(setEl, 'set'));
        setEl.querySelector('[data-act="add-wall"]').addEventListener('click', () => addWallInput(setEl));
        
        const setsContainer = roomEl.querySelector(SELECTORS.setsContainer);
        setsContainer.appendChild(setEl);
        
        if (payload) {
            setEl.querySelector('[name="wallpaper_name"]').value = payload.name;
            setEl.querySelector('[name="wallpaper_height_m"]').value = payload.height_m;
            setEl.querySelector('[name="wallpaper_price_roll"]').value = payload.price_roll;
            setEl.querySelector('[data-walls-container]').innerHTML = "";
            payload.wall_widths.forEach(width => addWallInput(setEl, width));
        } else {
            addWallInput(setEl);
        }
        updateSetSummary(setEl);
        updateRoomTotals();
    }

    function addWallInput(setEl, width = null) {
        const wallTpl = document.querySelector(SELECTORS.wallTpl);
        const wallEl = wallTpl.content.cloneNode(true).firstElementChild;
        if (width) {
            wallEl.querySelector('[name="wall_width_m"]').value = width;
        }
        wallEl.querySelector('[data-act="del-wall"]').addEventListener('click', () => {
            wallEl.remove();
            updateSetSummary(setEl);
            updateRoomTotals();
        });
        setEl.querySelector('[data-walls-container]').appendChild(wallEl);
        updateSetSummary(setEl);
        updateRoomTotals();
    }

    function toggleSuspend(el, type) {
        const isSuspended = el.classList.toggle('is-suspended');
        const suspendBtn = el.querySelector(`[data-act="suspend-${type}"]`);
        if (isSuspended) {
            suspendBtn.textContent = 'ยกเลิกระงับ';
            showToast(`ระงับการคำนวณ ${type} แล้ว`, 'warning');
        } else {
            suspendBtn.textContent = 'ระงับการคำนวณ';
            showToast(`ยกเลิกระงับ ${type} แล้ว`, 'success');
        }
        updateRoomTotals();
    }

    function getHeightPrice(height) {
        let price = 0;
        for (const h of PRICING.height) {
            if (height > h.threshold) {
                price += h.add_per_m;
            }
        }
        return price;
    }

    function getCalculationFactor(setEl) {
        const sheerType = setEl.querySelector('[name="sheer_type"]').value;
        const openCloseType = setEl.querySelector('[name="open_close_type"]').value;
        let factor = CALC_FACTOR.curtain;
        if (sheerType === "ทึบ&โปร่ง" && openCloseType === "ม่านลอน") {
            factor = CALC_FACTOR.sheer_wave_curtain;
        }
        return factor;
    }

    function buildPayload() {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('input[name="customer_name"]').value,
            customer_phone: document.querySelector('input[name="customer_phone"]').value,
            customer_address: document.querySelector('input[name="customer_address"]').value,
            rooms: []
        };
        document.querySelectorAll('.room').forEach(roomEl => {
            const roomPayload = {
                name: roomEl.querySelector('[name="room_name"]').value,
                is_suspended: roomEl.classList.contains('is-suspended'),
                sets: []
            };
            roomEl.querySelectorAll('.set').forEach(setEl => {
                const type = setEl.dataset.setType;
                if (type === 'curtain') {
                    const setPayload = {
                        type: 'curtain',
                        is_suspended: setEl.classList.contains('is-suspended'),
                        width_m: parseCurrency(setEl.querySelector('[name="width_m"]').value),
                        height_m: parseCurrency(setEl.querySelector('[name="height_m"]').value),
                        qty: parseCurrency(setEl.querySelector('[name="qty"]').value),
                        misc_text: setEl.querySelector('[name="misc"]').value,
                        fabric_price: parseCurrency(setEl.querySelector('[name="fabric_price"]').value),
                        style: setEl.querySelector('[name="style"]').value,
                        sheer_include: setEl.querySelector('[name="sheer_include"]').checked,
                        sheer_price: parseCurrency(setEl.querySelector('[name="sheer_price"]').value),
                        fabric_type: setEl.querySelector('[name="fabric_type"]').value,
                        open_close_type: setEl.querySelector('[name="open_close_type"]').value,
                    };
                    roomPayload.sets.push(setPayload);
                } else if (type === 'wallpaper') {
                    const setPayload = {
                        type: 'wallpaper',
                        is_suspended: setEl.classList.contains('is-suspended'),
                        name: setEl.querySelector('[name="wallpaper_name"]').value,
                        height_m: parseCurrency(setEl.querySelector('[name="wallpaper_height_m"]').value),
                        price_roll: parseCurrency(setEl.querySelector('[name="wallpaper_price_roll"]').value),
                        wall_widths: Array.from(setEl.querySelectorAll('[name="wall_width_m"]')).map(input => parseCurrency(input.value)).filter(val => val > 0)
                    };
                    roomPayload.sets.push(setPayload);
                }
            });
            payload.rooms.push(roomPayload);
        });
        return payload;
    }

    function generateSummaryText() {
        const payload = buildPayload();
        let text = `${TEXT_SUM_HEADERS.customer}\n`;
        text += `ชื่อ: ${payload.customer_name}\n`;
        text += `เบอร์โทร: ${payload.customer_phone}\n`;
        text += `ที่อยู่: ${payload.customer_address}\n\n`;

        let curtainTotal = 0;
        let wallpaperTotal = 0;
        let grandTotal = 0;

        payload.rooms.forEach(room => {
            if (!room.is_suspended) {
                text += `### ${room.name} ###\n`;
                room.sets.forEach(set => {
                    if (!set.is_suspended) {
                        if (set.type === 'curtain') {
                            const total = calculateCurtainTotal(document.querySelector(`[data-room-id="${room.id}"] .set`)); // This part needs refactoring to work with payload directly
                            text += `- ผ้าม่าน: กว้าง ${set.width_m}ม. x สูง ${set.height_m}ม. x ${set.qty} ชุด. ราคา ${formatCurrency(total.total)} บ.\n`;
                            curtainTotal += total.curtainTotal;
                            grandTotal += total.total;
                        } else if (set.type === 'wallpaper') {
                            const total = calculateWallpaperTotal(document.querySelector(`[data-room-id="${room.id}"] .set[data-set-type="wallpaper"]`)); // This also needs refactoring
                            text += `- วอลเปเปอร์: ${set.name}. ราคา ${formatCurrency(total.total)} บ.\n`;
                            wallpaperTotal += total.total;
                            grandTotal += total.total;
                        }
                    }
                });
                text += "\n";
            }
        });
        
        text += `---\n`;
        text += `${TEXT_SUM_HEADERS.curtain}: ${formatCurrency(curtainTotal)} บ.\n`;
        text += `${TEXT_SUM_HEADERS.wallpaper}: ${formatCurrency(wallpaperTotal)} บ.\n`;
        text += `${TEXT_SUM_HEADERS.total}: ${formatCurrency(grandTotal)} บ.\n`;
        
        return text;
    }

    function updateLockState() {
        const lockBtn = document.querySelector(SELECTORS.lockBtn);
        const lockText = document.querySelector(SELECTORS.lockText);
        const isLocked = document.body.classList.toggle('is-locked');
        lockText.textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
    }

    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleInput);

    document.querySelector(SELECTORS.addRoomHeaderBtn).addEventListener('click', () => addRoom());
    document.querySelector(SELECTORS.addRoomBtn).addEventListener('click', () => addRoom());
    
    document.querySelector(SELECTORS.summaryBtn).addEventListener('click', () => {
        const text = generateSummaryText();
        document.querySelector(SELECTORS.textSummary).value = text;
        document.querySelector(SELECTORS.textModal).classList.add('visible');
    });

    document.querySelector(SELECTORS.copyJsonBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const jsonString = JSON.stringify(payload, null, 2);
        document.querySelector(SELECTORS.jsonPayload).value = jsonString;
        document.querySelector(SELECTORS.jsonModal).classList.add('visible');
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', () => {
        const text = generateSummaryText();
        navigator.clipboard.writeText(text).then(() => showToast('คัดลอกข้อความแล้ว', 'success')).catch(err => showToast('ไม่สามารถคัดลอกได้', 'error'));
    });
    
    document.querySelector(SELECTORS.submitBtn).addEventListener("click", (e) => {
        e.preventDefault();
        const payload = buildPayload();
        console.log(JSON.stringify(payload));
        showToast("ส่งข้อมูลแล้ว...", "success");
    });
    
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', updateLockState);
    
    document.querySelector(SELECTORS.clearBtn).addEventListener('click', () => {
        if (confirm("คุณต้องการลบข้อมูลทั้งหมดหรือไม่?")) {
            localStorage.removeItem(STORAGE_KEY);
            document.location.reload();
        }
    });

    // Handle modal close
    document.querySelectorAll(SELECTORS.modalCloseBtn).forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal-overlay').classList.remove('visible');
        });
    });

    // Handle modal copy
    document.querySelector(SELECTORS.modalCopyJsonBtn).addEventListener('click', () => {
        const jsonPayload = document.querySelector(SELECTORS.jsonPayload);
        jsonPayload.select();
        document.execCommand('copy');
        showToast('คัดลอก JSON แล้ว', 'success');
    });

    document.querySelector(SELECTORS.modalCopyTextBtn).addEventListener('click', () => {
        const textSummary = document.querySelector(SELECTORS.textSummary);
        textSummary.select();
        document.execCommand('copy');
        showToast('คัดลอกข้อความแล้ว', 'success');
    });

    // Handle dropdown menus
    document.addEventListener('click', (e) => {
        const menuBtn = e.target.closest('[data-act="toggle-menu"]');
        if (menuBtn) {
            const dropdown = menuBtn.nextElementSibling;
            if (dropdown && dropdown.classList.contains('menu-dropdown')) {
                const isShowing = dropdown.classList.contains('show');
                document.querySelectorAll('.menu-dropdown.show').forEach(el => el.classList.remove('show'));
                if (!isShowing) {
                    dropdown.classList.add('show');
                }
            }
        } else {
            document.querySelectorAll('.menu-dropdown.show').forEach(el => el.classList.remove('show'));
        }
    });

    // Handle main menu
    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
        const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
        menuDropdown.classList.toggle('show');
    });

    document.querySelector(SELECTORS.importBtn).addEventListener('click', () => {
        const json = prompt("วาง JSON ที่นี่:");
        if (json) {
            try {
                const data = JSON.parse(json);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                document.location.reload();
            } catch (err) {
                showToast("ข้อมูล JSON ไม่ถูกต้อง", "error");
            }
        }
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', () => {
        const payload = buildPayload();
        const jsonString = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marnthara-data-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('ส่งออกข้อมูลแล้ว', 'success');
    });
    
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