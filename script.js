(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.3.0-wallpaper";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };
    const CALC = {
        fabricYardage: (style, width_m) => {
            let ratio = 2.5;
            if (style === "ลอน") ratio = 2.2;
            if (style === "ตาไก่") ratio = 2.5;
            if (style === "จีบ") ratio = 3;
            return ((width_m * ratio) / 0.9).toFixed(2);
        },
        wallpaperRolls: (height_m, total_width_m) => {
            const sq_m = height_m * total_width_m;
            return Math.ceil(sq_m / WALLPAPER_SQM_PER_ROLL);
        },
    };

    const orderForm = document.getElementById("orderForm");
    const roomsEl = document.getElementById("roomsEl");
    const summaryBtn = document.getElementById("summaryBtn");
    const summaryPopup = document.getElementById("summaryPopup");
    const lockBtn = document.getElementById("lockBtn");
    const materialsSummaryBtn = document.getElementById("materialsSummaryBtn"); // New button element
    let roomCount = 0;

    const numberWithCommas = (x) => {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    const togglePopup = (btn, popup, isVisible) => {
        if (isVisible) {
            const rect = btn.getBoundingClientRect();
            popup.style.top = `${rect.top - popup.offsetHeight - 1}px`;
            popup.style.left = `${rect.left}px`;
        }
        popup.style.display = isVisible ? 'block' : 'none';
    };

    const showToast = (message, type) => {
        const container = document.querySelector('.toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    };

    const updateSummary = () => {
        let priceTotal = 0;
        let pointTotal = 0;
        let curtainTotal = 0;
        let decorationTotal = 0;

        const rooms = document.querySelectorAll('.room-card');
        rooms.forEach(room => {
            const roomData = getRoomData(room);
            room.total = roomData.price_total;
            priceTotal += roomData.price_total;
            pointTotal += roomData.points_total;
            curtainTotal += roomData.curtains.length;
            decorationTotal += roomData.decorations.length;
        });

        document.querySelector('.price-total').textContent = numberWithCommas(priceTotal);
        document.querySelector('.point-total').textContent = pointTotal;
        document.querySelector('.curtain-total').textContent = curtainTotal;
        document.querySelector('.decoration-total').textContent = decorationTotal;
    };

    const getRoomData = (room) => {
        const curtains = Array.from(room.querySelectorAll('.curtain-item')).map(el => {
            const width_m = parseFloat(el.querySelector('input[name="curtain_width_m"]').value) || 0;
            const height_m = parseFloat(el.querySelector('input[name="curtain_height_m"]').value) || 0;
            const style = el.querySelector('select[name="curtain_style"]').value;
            const fabric_type = el.querySelector('select[name="curtain_fabric_type"]').value;
            const fabric_code = el.querySelector('input[name="curtain_fabric_code"]').value;
            const rail_code = el.querySelector('input[name="curtain_rail_code"]').value;

            const base_price_per_yard = PRICING[fabric_type][0] || 0;
            const style_surcharge = PRICING.style_surcharge[style] || 0;
            const height_surcharge = PRICING.height.reduce((sum, h) => {
                return height_m >= h.threshold ? sum + h.add_per_m : sum;
            }, 0);

            const fabric_yardage = CALC.fabricYardage(style, width_m);
            const price_total = Math.ceil((base_price_per_yard + style_surcharge + height_surcharge) * fabric_yardage);

            el.querySelector('[data-curtain-summary] .price').textContent = numberWithCommas(price_total);
            el.querySelector('[data-curtain-summary] .price:last-child').textContent = fabric_yardage;

            return {
                name: el.querySelector('input[name="curtain_name"]').value,
                fabric_type,
                fabric_code,
                style,
                style_thai: style,
                width_m,
                height_m,
                fabric_yardage: parseFloat(fabric_yardage),
                price_total
            };
        });

        const decorations = Array.from(room.querySelectorAll('.decoration-item')).map(el => {
            const qty = parseInt(el.querySelector('input[name="decoration_qty"]').value) || 0;
            const price = parseFloat(el.querySelector('input[name="decoration_price"]').value.replace(/,/g, '')) || 0;
            const price_total = qty * price;
            el.querySelector('[data-decoration-summary] .price').textContent = numberWithCommas(price_total);
            return {
                name: el.querySelector('input[name="decoration_name"]').value,
                qty,
                price_unit: price,
                price_total
            };
        });

        const wallpapers = Array.from(room.querySelectorAll('.wallpaper-item')).map(el => {
            const height_m = parseFloat(el.querySelector('input[name="wallpaper_height_m"]').value) || 0;
            const price_per_roll = parseFloat(el.querySelector('input[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0;
            const wallpaper_code = el.querySelector('input[name="wallpaper_code"]').value;

            const wallWidths = Array.from(el.querySelectorAll('input[name="wall_width_m"]')).map(input => parseFloat(input.value) || 0);
            const total_width_m = wallWidths.reduce((sum, w) => sum + w, 0);

            const wallpaper_rolls = CALC.wallpaperRolls(height_m, total_width_m);
            const price_total = wallpaper_rolls * price_per_roll;
            const total_sqm = (height_m * total_width_m).toFixed(2);

            el.querySelector('[data-wallpaper-summary] .price:nth-child(1)').textContent = numberWithCommas(price_total);
            el.querySelector('[data-wallpaper-summary] .price:nth-child(2)').textContent = total_sqm;
            el.querySelector('[data-wallpaper-summary] .price:nth-child(3)').textContent = wallpaper_rolls;

            return {
                name: el.querySelector('input[name="wallpaper_name"]').value,
                wallpaper_code,
                height_m,
                total_width_m,
                total_sqm: parseFloat(total_sqm),
                wallpaper_rolls,
                price_per_roll,
                price_total
            };
        });

        const price_total = curtains.reduce((sum, c) => sum + c.price_total, 0) +
            decorations.reduce((sum, d) => sum + d.price_total, 0) +
            wallpapers.reduce((sum, w) => sum + w.price_total, 0);

        const points_total = curtains.length + decorations.length + wallpapers.length;

        return { curtains, decorations, wallpapers, price_total, points_total };
    };

    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            customer_name: orderForm.querySelector('input[name="customer_name"]').value,
            customer_address: orderForm.querySelector('input[name="customer_address"]').value,
            customer_phone: orderForm.querySelector('input[name="customer_phone"]').value,
            total_price: parseFloat(document.querySelector('.price-total').textContent.replace(/,/g, '')),
            total_items: parseInt(document.querySelector('.point-total').textContent),
            rooms: Array.from(document.querySelectorAll('.room-card')).map(room => {
                const roomData = getRoomData(room);
                return {
                    name: room.querySelector('.room-name').value,
                    total_price: roomData.price_total,
                    curtains: roomData.curtains,
                    decorations: roomData.decorations,
                    wallpapers: roomData.wallpapers
                };
            })
        };
        return payload;
    };

    const buildTextPayload = (options) => {
        const payload = buildPayload();
        let text = `เรียนคุณ ${payload.customer_name},\n`;
        text += `นี่คือใบเสนอราคาสรุปจาก Marnthara ครับ\n\n`;
        payload.rooms.forEach((room, roomIndex) => {
            text += `***${room.name || `ห้องที่ ${roomIndex + 1}`}***\n`;
            room.curtains.forEach(curtain => {
                text += `- ผ้าม่าน: ${curtain.name} (${curtain.style_thai}) ราคา ${numberWithCommas(curtain.price_total)} บ.\n`;
            });
            room.decorations.forEach(deco => {
                text += `- รายการตกแต่ง: ${deco.name} ราคา ${numberWithCommas(deco.price_total)} บ.\n`;
            });
            room.wallpapers.forEach(wall => {
                text += `- วอลเปเปอร์: ราคา ${numberWithCommas(wall.price_total)} บ.\n`;
            });
            text += `ยอดรวมห้อง: ${numberWithCommas(room.total_price)} บ.\n\n`;
        });
        text += `ยอดรวมทั้งหมด: ${numberWithCommas(payload.total_price)} บ.\n`;
        text += `(ราคาอาจมีการเปลี่ยนแปลงตามหน้างาน)`;
        return text;
    };

    const buildMaterialsSummaryPayload = () => {
        const payload = buildPayload();
        let summaryText = "";

        const allCurtains = payload.rooms.flatMap(room => room.curtains);
        const allDecorations = payload.rooms.flatMap(room => room.decorations);
        const allWallpapers = payload.rooms.flatMap(room => room.wallpapers);

        if (allCurtains.length > 0) {
            summaryText += "=== สรุปผ้าม่าน ===\n";
            const curtainSummary = allCurtains.reduce((acc, cur) => {
                const key = `${cur.fabric_type === 'fabric' ? 'ผ้าทึบ' : 'ผ้าโปร่ง'} - ${cur.fabric_code || '(ไม่ระบุรหัส)'} (${cur.style_thai})`;
                acc[key] = (acc[key] || 0) + cur.fabric_yardage;
                return acc;
            }, {});
            for (const [key, value] of Object.entries(curtainSummary)) {
                summaryText += `- ${key}: ${value.toFixed(2)} หลา\n`;
            }
            summaryText += "\n";
        }

        if (allDecorations.length > 0) {
            summaryText += "=== สรุปรายการตกแต่ง ===\n";
            const decorationSummary = allDecorations.reduce((acc, deco) => {
                const key = `${deco.name}`;
                acc[key] = (acc[key] || 0) + deco.qty;
                return acc;
            }, {});
            for (const [key, value] of Object.entries(decorationSummary)) {
                summaryText += `- ${key}: ${value} ชุด\n`;
            }
            summaryText += "\n";
        }

        if (allWallpapers.length > 0) {
            summaryText += "=== สรุปวอลเปเปอร์ ===\n";
            const wallpaperSummary = allWallpapers.reduce((acc, wall) => {
                const key = `${wall.wallpaper_code || '(ไม่ระบุรหัส)'}`;
                acc[key] = {
                    rolls: (acc[key]?.rolls || 0) + wall.wallpaper_rolls,
                    sqm: (acc[key]?.sqm || 0) + wall.total_sqm
                };
                return acc;
            }, {});
            for (const [key, value] of Object.entries(wallpaperSummary)) {
                summaryText += `- รหัส ${key}: ${value.rolls} ม้วน (${value.sqm.toFixed(2)} ตร.ม.)\n`;
            }
            summaryText += "\n";
        }

        if (summaryText === "") {
            summaryText = "ยังไม่มีรายการที่ต้องสรุปวัสดุ";
        }

        return summaryText;
    };


    const addRoom = (payload = {}) => {
        roomCount++;
        const roomTpl = document.getElementById("roomTpl");
        const roomClone = roomTpl.content.cloneNode(true).firstElementChild;
        roomClone.querySelector('.room-name').value = payload.name || `ห้องที่ ${roomCount}`;
        const roomContent = roomClone.querySelector('.room-sections');

        if (payload.curtains) payload.curtains.forEach(curtainData => addCurtain(roomContent, curtainData));
        if (payload.decorations) payload.decorations.forEach(decoData => addDecoration(roomContent, decoData));
        if (payload.wallpapers) payload.wallpapers.forEach(wallpaperData => addWallpaper(roomContent, wallpaperData));

        roomsEl.appendChild(roomClone);
        roomClone.addEventListener('change', updateSummary);
        updateSummary();
    };

    const addCurtain = (roomContent, payload = {}) => {
        const curtainTpl = document.getElementById("curtainTpl");
        const curtainClone = curtainTpl.content.cloneNode(true).firstElementChild;
        if (payload.name) curtainClone.querySelector('input[name="curtain_name"]').value = payload.name;
        if (payload.fabric_type) curtainClone.querySelector('select[name="curtain_fabric_type"]').value = payload.fabric_type;
        if (payload.fabric_code) curtainClone.querySelector('input[name="curtain_fabric_code"]').value = payload.fabric_code;
        if (payload.width_m) curtainClone.querySelector('input[name="curtain_width_m"]').value = payload.width_m;
        if (payload.height_m) curtainClone.querySelector('input[name="curtain_height_m"]').value = payload.height_m;
        if (payload.style) curtainClone.querySelector('select[name="curtain_style"]').value = payload.style;
        if (payload.rail_code) curtainClone.querySelector('input[name="curtain_rail_code"]').value = payload.rail_code;
        roomContent.querySelector('.curtain-section').appendChild(curtainClone);
        curtainClone.addEventListener('input', updateSummary);
        curtainClone.addEventListener('change', updateSummary);
        updateSummary();
    };

    const addDecoration = (roomContent, payload = {}) => {
        const decorationTpl = document.getElementById("decorationTpl");
        const decorationClone = decorationTpl.content.cloneNode(true).firstElementChild;
        if (payload.name) decorationClone.querySelector('input[name="decoration_name"]').value = payload.name;
        if (payload.qty) decorationClone.querySelector('input[name="decoration_qty"]').value = payload.qty;
        if (payload.price_unit) decorationClone.querySelector('input[name="decoration_price"]').value = numberWithCommas(payload.price_unit);
        roomContent.querySelector('.decoration-section').appendChild(decorationClone);
        decorationClone.addEventListener('input', updateSummary);
        decorationClone.addEventListener('change', updateSummary);
        updateSummary();
    };

    const addWallpaper = (roomContent, payload = {}) => {
        const wallpaperTpl = document.getElementById("wallpaperTpl");
        const wallpaperClone = wallpaperTpl.content.cloneNode(true).firstElementChild;
        if (payload.name) wallpaperClone.querySelector('input[name="wallpaper_name"]').value = payload.name;
        if (payload.wallpaper_code) wallpaperClone.querySelector('input[name="wallpaper_code"]').value = payload.wallpaper_code;
        if (payload.price_per_roll) wallpaperClone.querySelector('input[name="wallpaper_price_roll"]').value = numberWithCommas(payload.price_per_roll);
        if (payload.height_m) wallpaperClone.querySelector('input[name="wallpaper_height_m"]').value = payload.height_m;
        if (payload.total_width_m) {
            const wallsContainer = wallpaperClone.querySelector('[data-walls-container]');
            payload.walls.forEach(wall_width_m => {
                addWall(wallsContainer, { wall_width_m });
            });
        }
        roomContent.querySelector('.wallpaper-section').appendChild(wallpaperClone);
        wallpaperClone.addEventListener('input', updateSummary);
        wallpaperClone.addEventListener('change', updateSummary);
        updateSummary();
    };

    const addWall = (wallsContainer, payload = {}) => {
        const wallTpl = document.getElementById("wallTpl");
        const wallClone = wallTpl.content.cloneNode(true).firstElementChild;
        if (payload.wall_width_m) wallClone.querySelector('input[name="wall_width_m"]').value = payload.wall_width_m;
        wallsContainer.appendChild(wallClone);
    };

    const handleAction = (e) => {
        const roomCard = e.target.closest('.room-card');
        const roomContent = roomCard.querySelector('.room-sections');
        const action = e.target.dataset.act;
        if (action === "add-curtain") addCurtain(roomContent);
        if (action === "add-decoration") addDecoration(roomContent);
        if (action === "add-wallpaper") addWallpaper(roomContent);
        if (action === "add-wall") addWall(e.target.closest('.wallpaper-item').querySelector('[data-walls-container]'));
        if (action === "remove-room") { roomCard.remove(); updateSummary(); }
        if (action === "remove-curtain") { e.target.closest('.curtain-item').remove(); updateSummary(); }
        if (action === "remove-decoration") { e.target.closest('.decoration-item').remove(); updateSummary(); }
        if (action === "remove-wallpaper") { e.target.closest('.wallpaper-item').remove(); updateSummary(); }
        if (action === "remove-wall") { e.target.closest('.wall-input-row').remove(); updateSummary(); }
    };

    const updateLockState = () => {
        const isLocked = lockBtn.classList.contains('locked');
        orderForm.querySelectorAll('input, select, button').forEach(el => {
            if (el.id !== 'lockBtn' && el.id !== 'clearAllBtn') {
                el.disabled = isLocked;
            }
        });
        lockBtn.querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        lockBtn.querySelector('.lock-icon').textContent = isLocked ? '🔓' : '🔒';
    };

    orderForm.addEventListener('click', (e) => {
        const action = e.target.dataset.act;
        if (action) {
            e.preventDefault();
            handleAction(e);
        }
    });

    document.getElementById("addRoomHeaderBtn").addEventListener('click', addRoom);
    document.getElementById("clearAllBtn").addEventListener('click', async () => {
        const modal = document.getElementById('confirmModal');
        modal.classList.add('show');
        const confirmed = await new Promise(resolve => {
            modal.querySelector('[data-confirm="yes"]').onclick = () => { modal.classList.remove('show'); resolve(true); };
            modal.querySelector('[data-confirm="no"]').onclick = () => { modal.classList.remove('show'); resolve(false); };
        });
        if (confirmed) {
            localStorage.removeItem(STORAGE_KEY);
            roomsEl.innerHTML = "";
            roomCount = 0;
            addRoom();
            showToast('ข้อมูลทั้งหมดถูกล้างแล้ว', 'success');
        }
    });

    lockBtn.addEventListener('click', () => {
        lockBtn.classList.toggle('locked');
        updateLockState();
        showToast(lockBtn.classList.contains('locked') ? 'ล็อคฟอร์มแล้ว' : 'ปลดล็อคฟอร์มแล้ว', 'info');
    });

    summaryBtn.addEventListener('click', () => {
        togglePopup(summaryBtn, summaryPopup, summaryPopup.style.display === 'none');
    });

    document.addEventListener('click', (e) => {
        if (!summaryBtn.contains(e.target) && !summaryPopup.contains(e.target)) {
            summaryPopup.style.display = 'none';
        }
    });

    orderForm.addEventListener("click", async (e) => {
        if (e.target.id === "materialsSummaryBtn") {
            e.preventDefault();
            const text = buildMaterialsSummaryPayload();
            navigator.clipboard.writeText(text)
                .then(() => showToast('คัดลอกสรุปวัสดุแล้ว', 'success'))
                .catch(err => showToast('คัดลอกไม่สำเร็จ', 'error'));
        }
        if (e.target.id === "copyTextBtn") {
            e.preventDefault();
            const text = buildTextPayload();
            navigator.clipboard.writeText(text)
                .then(() => showToast('คัดลอกข้อความแล้ว', 'success'))
                .catch(err => showToast('คัดลอกไม่สำเร็จ', 'error'));
        }
        if (e.target.id === "sendDataBtn") {
            e.preventDefault();
            if (orderForm.checkValidity()) {
                const payload = buildPayload();
                try {
                    const response = await fetch(WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (response.ok) {
                        showToast('ส่งข้อมูลสำเร็จ!', 'success');
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
                    } else {
                        showToast('ส่งข้อมูลไม่สำเร็จ กรุณาตรวจสอบ URL', 'error');
                    }
                } catch (error) {
                    showToast('เกิดข้อผิดพลาดในการส่งข้อมูล', 'error');
                    console.error('Error sending data:', error);
                }
            } else {
                showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
            }
        }
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