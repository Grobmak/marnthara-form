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
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0, "ไม่มี": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };
    const CALC = {
        fabricYardage: (style, width_m) => {
            const width_ft = width_m * 3.28084;
            let result;
            if (style === "ลอน") result = (width_ft * 2.2) / 3.28084;
            else if (style === "ตาไก่" || style === "จีบ") result = (width_ft * 3) / 3.28084;
            else result = 0;
            return result * SQM_TO_SQYD;
        },
        sheerYardage: (width_m) => (width_m * 2.5) * SQM_TO_SQYD,
        getCurtainPrice: (fabric_price, height_m, yardage) => {
            let height_surcharge = 0;
            for (const rule of PRICING.height) {
                if (height_m > rule.threshold) {
                    height_surcharge = (height_m - rule.threshold) * rule.add_per_m;
                    break;
                }
            }
            return (fabric_price * yardage) + height_surcharge;
        },
        getWallpaperPrice: (height_m, roll_price, wall_widths) => {
            const total_width_m = wall_widths.reduce((sum, width) => sum + parseFloat(width) || 0, 0);
            const total_area_sqm = total_width_m * parseFloat(height_m);
            const total_rolls = Math.ceil(total_area_sqm / WALLPAPER_SQM_PER_ROLL);
            const total_price = total_rolls * parseFloat(roll_price);
            return { total_price, total_area_sqm, total_rolls };
        }
    };

    const roomsEl = document.getElementById('rooms');
    const roomTpl = document.getElementById('roomTpl');
    const pointTpl = document.getElementById('pointTpl');
    const decoTpl = document.getElementById('decoTpl');
    const wallpaperTpl = document.getElementById('wallpaperTpl');
    const wallTpl = document.getElementById('wallTpl');
    const orderForm = document.getElementById('orderForm');

    let roomCount = 0;

    const formatNumber = (num) => (num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatInt = (num) => (num || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const recalcAll = () => {
        let total_curtain_price = 0;
        let total_deco_price = 0;
        let total_wallpaper_price = 0;
        let total_rail_price = 0;
        let total_tieback_price = 0;
        let total_installation_fee = 0;

        document.querySelectorAll('.room-card').forEach(room => {
            const roomData = recalcRoom(room);
            total_curtain_price += roomData.curtain_total_price;
            total_deco_price += roomData.deco_total_price;
            total_wallpaper_price += roomData.wallpaper_total_price;
            total_rail_price += roomData.rail_total_price;
            total_tieback_price += roomData.tieback_total_price;
            total_installation_fee += roomData.installation_fee;
        });

        const discount = parseFloat(orderForm.querySelector('input[name="discount"]').value) || 0;
        const delivery_fee = parseFloat(orderForm.querySelector('input[name="delivery_fee"]').value) || 0;
        const deposit = parseFloat(orderForm.querySelector('input[name="deposit"]').value) || 0;

        const total_net_price = total_curtain_price + total_deco_price + total_wallpaper_price + total_installation_fee + total_rail_price + total_tieback_price - discount + delivery_fee;
        const final_total = total_net_price - deposit;

        document.querySelector('[data-summary-total-curtain]').textContent = formatInt(total_curtain_price);
        document.querySelector('[data-summary-total-deco]').textContent = formatInt(total_deco_price);
        document.querySelector('[data-summary-total-wallpaper]').textContent = formatInt(total_wallpaper_price);
        document.querySelector('[data-summary-total-rail]').textContent = formatInt(total_rail_price);
        document.querySelector('[data-summary-total-tieback]').textContent = formatInt(total_tieback_price);
        document.querySelector('[data-summary-total-installation]').textContent = formatInt(total_installation_fee);
        document.querySelector('[data-summary-total-final]').textContent = formatInt(final_total);
    };

    const recalcRoom = (room) => {
        let room_total_price = 0;
        const installation_fee = parseFloat(room.querySelector('input[name="installation_fee"]').value) || 0;
        room_total_price += installation_fee;

        let curtain_total_price = 0;
        let total_fabric_price = 0;
        let total_sheer_price = 0;
        let total_rail_price = 0;
        let total_tieback_price = 0;
        let total_fabric_yardage = 0;
        let total_sheer_yardage = 0;
        let total_curtain_extra = 0;

        const style = room.querySelector('select[name="style"]').value;
        const curtainSection = room.querySelector('[data-curtain-section]');

        // If no curtains are selected, set all curtain-related values to 0 and hide the section.
        if (style === "ไม่มี") {
            curtainSection.style.display = 'none';
        } else {
            curtainSection.style.display = 'block';

            const fabric_price_per_m = parseFloat(room.querySelector('select[name="fabric_price"]').value) || 0;
            const sheer_price_per_m = parseFloat(room.querySelector('select[name="sheer_price"]').value) || 0;
            const rail_price_per_m = parseFloat(room.querySelector('input[name="rail_price"]').value) || 0;
            const tieback_price_per_set = parseFloat(room.querySelector('input[name="tieback_price"]').value) || 0;
            const curtain_height_m = parseFloat(room.querySelector('input[name="curtain_height_m"]').value) || 0;
            const curtain_width_m = parseFloat(room.querySelector('input[name="curtain_width_m"]').value) || 0;
            const style_surcharge = PRICING.style_surcharge[style] || 0;
            const extra_price = parseFloat(room.querySelector('input[name="curtain_extra_price"]').value) || 0;

            const base_yardage = CALC.fabricYardage(style, curtain_width_m);
            const fabric_price = CALC.getCurtainPrice(fabric_price_per_m, curtain_height_m, base_yardage) + style_surcharge;
            const sheer_yardage = CALC.sheerYardage(curtain_width_m);
            const sheer_price = sheer_yardage * sheer_price_per_m;
            const rail_price = rail_price_per_m * curtain_width_m;
            const tieback_price = tieback_price_per_set * 2; // Assuming 2 tiebacks per curtain set

            total_fabric_yardage = base_yardage;
            total_sheer_yardage = sheer_yardage;
            total_fabric_price = fabric_price;
            total_sheer_price = sheer_price;
            total_rail_price = rail_price;
            total_tieback_price = tieback_price;
            total_curtain_extra = extra_price;

            curtain_total_price = total_fabric_price + total_sheer_price + total_rail_price + total_tieback_price + total_curtain_extra;

            room.querySelector('[data-curtain-detail-yardage] .price').textContent = formatNumber(total_fabric_yardage);
            room.querySelector('[data-curtain-detail-sheer-yardage] .price').textContent = formatNumber(total_sheer_yardage);
            room.querySelector('[data-curtain-detail-price] .price').textContent = formatInt(total_fabric_price);
            room.querySelector('[data-curtain-detail-sheer-price] .price').textContent = formatInt(total_sheer_price);
            room.querySelector('[data-curtain-detail-total] .price').textContent = formatInt(curtain_total_price);
        }

        let deco_total_price = 0;
        room.querySelectorAll('.deco-input-row').forEach(decoItem => {
            const price = parseFloat(decoItem.querySelector('input[name="deco_price"]').value) || 0;
            deco_total_price += price;
        });
        room.querySelector('[data-deco-summary] .price').textContent = formatInt(deco_total_price);

        let wallpaper_total_price = 0;
        room.querySelectorAll('.wallpaper-input-row').forEach(wpItem => {
            const height = parseFloat(wpItem.querySelector('input[name="wallpaper_height_m"]').value) || 0;
            const price_per_roll = parseFloat(wpItem.querySelector('input[name="wallpaper_price_roll"]').value) || 0;
            const wall_widths = Array.from(wpItem.querySelectorAll('input[name="wall_width_m"]')).map(input => parseFloat(input.value) || 0);

            const wp_calc = CALC.getWallpaperPrice(height, price_per_roll, wall_widths);
            wallpaper_total_price += wp_calc.total_price;

            wpItem.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = formatInt(wp_calc.total_price);
            wpItem.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = formatNumber(wp_calc.total_area_sqm);
            wpItem.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = formatInt(wp_calc.total_rolls);
        });
        room.querySelector('[data-wallpaper-summary] .price').textContent = formatInt(wallpaper_total_price);

        room_total_price += curtain_total_price + deco_total_price + wallpaper_total_price;
        room.querySelector('[data-room-summary]').textContent = formatInt(room_total_price);

        return {
            curtain_total_price,
            deco_total_price,
            wallpaper_total_price,
            rail_total_price: total_rail_price,
            tieback_total_price: total_tieback_price,
            installation_fee,
        };
    };

    const addRoom = (payload = null) => {
        const newRoom = roomTpl.content.firstElementChild.cloneNode(true);
        newRoom.dataset.roomIndex = roomCount++;
        roomsEl.appendChild(newRoom);

        // Populate with data from payload if available
        if (payload) {
            newRoom.querySelector('input[name="room_name"]').value = payload.room_name;
            newRoom.querySelector('input[name="installation_fee"]').value = payload.installation_fee || 0;
            newRoom.querySelector('select[name="fabric_price"]').value = payload.fabric_price || 0;
            newRoom.querySelector('select[name="style"]').value = payload.style || "ไม่มี";
            newRoom.querySelector('input[name="curtain_height_m"]').value = payload.curtain_height_m || 0;
            newRoom.querySelector('input[name="curtain_width_m"]').value = payload.curtain_width_m || 0;
            newRoom.querySelector('select[name="sheer_price"]').value = payload.sheer_price || 0;
            newRoom.querySelector('input[name="rail_price"]').value = payload.rail_price || 0;
            newRoom.querySelector('input[name="tieback_price"]').value = payload.tieback_price || 0;
            newRoom.querySelector('input[name="curtain_extra_price"]').value = payload.curtain_extra_price || 0;

            if (payload.points && payload.points.length > 0) {
                const pointsContainer = newRoom.querySelector('[data-points-container]');
                pointsContainer.innerHTML = '';
                payload.points.forEach(point => addPoint(pointsContainer, point));
            }

            if (payload.deco && payload.deco.length > 0) {
                const decoContainer = newRoom.querySelector('[data-deco-container]');
                decoContainer.innerHTML = '';
                payload.deco.forEach(deco => addDeco(decoContainer, deco));
            }

            if (payload.wallpaper && payload.wallpaper.length > 0) {
                const wpContainer = newRoom.querySelector('[data-wallpaper-container]');
                wpContainer.innerHTML = '';
                payload.wallpaper.forEach(wp => addWallpaper(wpContainer, wp));
            }
        }

        recalcRoom(newRoom);
        recalcAll();
    };

    const addPoint = (container, payload = null) => {
        const newPoint = pointTpl.content.firstElementChild.cloneNode(true);
        container.appendChild(newPoint);
        if (payload) {
            newPoint.querySelector('input[name="width_m"]').value = payload.width_m || 0;
            newPoint.querySelector('input[name="rail_m"]').value = payload.rail_m || 0;
            newPoint.querySelector('input[name="tieback_count"]').value = payload.tieback_count || 0;
            newPoint.querySelector('input[name="point_discount"]').value = payload.point_discount || 0;
            newPoint.querySelector('input[name="point_extra"]').value = payload.point_extra || 0;
        }
    };

    const addDeco = (container, payload = null) => {
        const newDeco = decoTpl.content.firstElementChild.cloneNode(true);
        container.appendChild(newDeco);
        if (payload) {
            newDeco.querySelector('input[name="deco_item_name"]').value = payload.deco_item_name || '';
            newDeco.querySelector('input[name="deco_price"]').value = payload.deco_price || 0;
        }
    };

    const addWallpaper = (container, payload = null) => {
        const newWallpaper = wallpaperTpl.content.firstElementChild.cloneNode(true);
        container.appendChild(newWallpaper);
        if (payload) {
            newWallpaper.querySelector('input[name="wallpaper_item_name"]').value = payload.wallpaper_item_name || '';
            newWallpaper.querySelector('input[name="wallpaper_height_m"]').value = payload.wallpaper_height_m || 0;
            newWallpaper.querySelector('input[name="wallpaper_price_roll"]').value = payload.wallpaper_price_roll || 0;
            if (payload.walls && payload.walls.length > 0) {
                const wallsContainer = newWallpaper.querySelector('[data-walls-container]');
                wallsContainer.innerHTML = '';
                payload.walls.forEach(wall => addWall(wallsContainer, wall));
            }
        }
        recalcRoom(container.closest('.room-card'));
    };

    const addWall = (container, payload = null) => {
        const newWall = wallTpl.content.firstElementChild.cloneNode(true);
        container.appendChild(newWall);
        if (payload) {
            newWall.querySelector('input[name="wall_width_m"]').value = payload.wall_width_m || 0;
        }
    };

    const delRoom = (btn) => {
        btn.closest('.room-card').remove();
        recalcAll();
    };

    const delItem = (btn) => {
        btn.closest('.point-input-row, .deco-input-row, .wallpaper-input-row, .wall-input-row').remove();
        recalcAll();
    };

    const saveToLocalStorage = () => {
        const payload = {
            customer_name: orderForm.querySelector('input[name="customer_name"]').value,
            customer_address: orderForm.querySelector('input[name="customer_address"]').value,
            customer_phone: orderForm.querySelector('input[name="customer_phone"]').value,
            bill_no: orderForm.querySelector('input[name="bill_no"]').value,
            order_date: orderForm.querySelector('input[name="order_date"]').value,
            sales_name: orderForm.querySelector('input[name="sales_name"]').value,
            discount: orderForm.querySelector('input[name="discount"]').value,
            delivery_fee: orderForm.querySelector('input[name="delivery_fee"]').value,
            deposit: orderForm.querySelector('input[name="deposit"]').value,
            notes: orderForm.querySelector('textarea[name="notes"]').value,
            rooms: []
        };
        document.querySelectorAll('.room-card').forEach(room => {
            const room_payload = {
                room_name: room.querySelector('input[name="room_name"]').value,
                installation_fee: room.querySelector('input[name="installation_fee"]').value,
                fabric_price: room.querySelector('select[name="fabric_price"]').value,
                style: room.querySelector('select[name="style"]').value,
                curtain_height_m: room.querySelector('input[name="curtain_height_m"]').value,
                curtain_width_m: room.querySelector('input[name="curtain_width_m"]').value,
                sheer_price: room.querySelector('select[name="sheer_price"]').value,
                rail_price: room.querySelector('input[name="rail_price"]').value,
                tieback_price: room.querySelector('input[name="tieback_price"]').value,
                curtain_extra_price: room.querySelector('input[name="curtain_extra_price"]').value,
                points: [],
                deco: [],
                wallpaper: []
            };
            room.querySelectorAll('.point-input-row').forEach(point => {
                room_payload.points.push({
                    width_m: point.querySelector('input[name="width_m"]').value,
                    rail_m: point.querySelector('input[name="rail_m"]').value,
                    tieback_count: point.querySelector('input[name="tieback_count"]').value,
                    point_discount: point.querySelector('input[name="point_discount"]').value,
                    point_extra: point.querySelector('input[name="point_extra"]').value
                });
            });
            room.querySelectorAll('.deco-input-row').forEach(deco => {
                room_payload.deco.push({
                    deco_item_name: deco.querySelector('input[name="deco_item_name"]').value,
                    deco_price: deco.querySelector('input[name="deco_price"]').value
                });
            });
            room.querySelectorAll('.wallpaper-input-row').forEach(wallpaper => {
                const wp_payload = {
                    wallpaper_item_name: wallpaper.querySelector('input[name="wallpaper_item_name"]').value,
                    wallpaper_height_m: wallpaper.querySelector('input[name="wallpaper_height_m"]').value,
                    wallpaper_price_roll: wallpaper.querySelector('input[name="wallpaper_price_roll"]').value,
                    walls: []
                };
                wallpaper.querySelectorAll('input[name="wall_width_m"]').forEach(wall => {
                    wp_payload.walls.push({
                        wall_width_m: wall.value
                    });
                });
                room_payload.wallpaper.push(wp_payload);
            });
            payload.rooms.push(room_payload);
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    };

    const clearAllData = () => {
        localStorage.removeItem(STORAGE_KEY);
        orderForm.reset();
        roomsEl.innerHTML = "";
        roomCount = 0;
        addRoom();
    };

    const toggleLock = () => {
        const isLocked = document.body.classList.toggle('locked');
        document.getElementById('lockBtn').querySelector('.lock-text').textContent = isLocked ? 'ปลดล็อค' : 'ล็อค';
        document.getElementById('lockBtn').querySelector('.lock-icon').textContent = isLocked ? '🔓' : '🔒';
    };

    const copyJson = () => { /* ... (remains the same) ... */ };
    const copyText = () => { /* ... (remains the same) ... */ };

    document.addEventListener('input', (e) => {
        const field = e.target;
        if (field.closest('.room-card')) {
            recalcRoom(field.closest('.room-card'));
        }
        recalcAll();
        saveToLocalStorage();
    });

    document.addEventListener('change', (e) => {
        const field = e.target;
        if (field.closest('.room-card')) {
            recalcRoom(field.closest('.room-card'));
        }
        recalcAll();
        saveToLocalStorage();
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const act = btn.dataset.act;
        const actions = {
            'add-point': (b) => addPoint(b.closest('.room-card').querySelector('[data-points-container]')),
            'add-deco': (b) => addDeco(b.closest('.room-card').querySelector('[data-deco-container]')),
            'add-wallpaper': (b) => addWallpaper(b.closest('.room-card').querySelector('[data-wallpaper-container]')),
            'add-wall': (b) => addWall(b.closest('.wallpaper-input-row').querySelector('[data-walls-container]')),
            'del-room': delRoom,
            'del-point': delItem,
            'del-deco': delItem,
            'del-wallpaper': delItem,
            'del-wall': delItem,
        };
        if (actions[act]) actions[act](btn);
        else if (btn.id === "addRoomHeaderBtn") addRoom();
        else if (btn.id === "clearAllBtn") clearAllData();
        else if (btn.id === "lockBtn") toggleLock();
        else if (btn.id === "jsonBtn") copyJson();
        else if (btn.id === "textBtn") copyText();
    });

    orderForm.addEventListener("submit", (e) => {
        e.preventDefault();
        saveToLocalStorage();
        alert("Data saved successfully!");
        if (WEBHOOK_URL !== "https://your-make-webhook-url.com/your-unique-path") {
            const data = new FormData(orderForm);
            fetch(WEBHOOK_URL, {
                method: 'POST',
                body: new URLSearchParams(data),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }).then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                console.log('Data sent to webhook successfully!');
            }).catch(error => {
                console.error('There was a problem with the fetch operation:', error);
            });
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
                document.querySelector('input[name="bill_no"]').value = payload.bill_no;
                document.querySelector('input[name="order_date"]').value = payload.order_date;
                document.querySelector('input[name="sales_name"]').value = payload.sales_name;
                document.querySelector('input[name="discount"]').value = payload.discount;
                document.querySelector('input[name="delivery_fee"]').value = payload.delivery_fee;
                document.querySelector('input[name="deposit"]').value = payload.deposit;
                document.querySelector('textarea[name="notes"]').value = payload.notes;

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
        recalcAll();
    });
})();