(function() {
    'use strict';
    const APP_VERSION = "input-ui/4.0.1-m3-liquidglass";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v4";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3;

    const PRICING = {
        fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
        sheer: [1000, 1100, 1200, 1300, 1400, 1500],
        style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
        height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
    };
    const CALC = {
        getFabricPrice: (variant) => {
            const index = parseInt(variant) - 1;
            return PRICING.fabric[index] || 0;
        },
        getSheerPrice: (variant) => {
            const index = parseInt(variant) - 1;
            return PRICING.sheer[index] || 0;
        },
        getStyleSurcharge: (style) => {
            return PRICING.style_surcharge[style] || 0;
        },
        getHeightSurcharge: (height_m) => {
            const height = parseFloat(height_m);
            if (isNaN(height)) return 0;
            const surcharge = PRICING.height.find(h => height >= h.threshold);
            return surcharge ? height * surcharge.add_per_m : 0;
        },
        calculatePoint: (width_m, height_m, style, fabric_variant, sheer_variant) => {
            const width = parseFloat(width_m);
            const height = parseFloat(height_m);
            if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
                return { price: 0, area_sqyd: 0 };
            }

            const fabric_price = CALC.getFabricPrice(fabric_variant);
            const sheer_price = CALC.getSheerPrice(sheer_variant);
            const style_surcharge = CALC.getStyleSurcharge(style);
            const height_surcharge = CALC.getHeightSurcharge(height);

            const area_sqm = width * height * 2.5;
            const area_sqyd = area_sqm * SQM_TO_SQYD;

            const base_price = area_sqyd * (fabric_price + sheer_price);
            const price = base_price + style_surcharge + height_surcharge;

            return { price, area_sqyd };
        },
        calculateSet: (setEl) => {
            let totalPrice = 0;
            let totalPoints = 0;
            const pointsEl = setEl.querySelectorAll(SELECTORS.point);
            pointsEl.forEach(pointEl => {
                if (!isSuspended(pointEl)) {
                    totalPoints++;
                    totalPrice += parseFloat(pointEl.querySelector('.price').textContent) || 0;
                }
            });
            const decoPrice = calculateDeco(setEl);
            totalPrice += decoPrice;
            return { price: totalPrice, points: totalPoints };
        },
        calculateDeco: (setEl) => {
            let totalPrice = 0;
            setEl.querySelectorAll(SELECTORS.deco).forEach(decoEl => {
                if (!isSuspended(decoEl)) {
                    const price = parseFloat(decoEl.querySelector('[name="deco_price"]').value) || 0;
                    const qty = parseInt(decoEl.querySelector('[name="deco_qty"]').value) || 0;
                    totalPrice += price * qty;
                }
            });
            return totalPrice;
        },
        calculateWallpaper: (wallpaperEl) => {
            const height = parseFloat(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value) || 0;
            const price_roll = parseFloat(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value) || 0;
            if (height <= 0 || price_roll <= 0) return { price: 0, area_sqm: 0, rolls: 0 };

            let total_width = 0;
            wallpaperEl.querySelectorAll('[name="wall_width_m"]').forEach(input => {
                total_width += parseFloat(input.value) || 0;
            });

            const area_sqm = total_width * height;
            const rolls = Math.ceil(area_sqm / WALLPAPER_SQM_PER_ROLL);
            const price = rolls * price_roll;
            
            return { price, area_sqm, rolls };
        },
    };

    const SELECTORS = {
        orderForm: '#orderForm',
        roomsContainer: '#roomsContainer',
        roomTpl: '#roomTpl',
        room: '.room-card',
        roomCount: '#roomCount',
        setTpl: '#setTpl',
        set: '.set-card',
        pointTpl: '#pointTpl',
        point: '.point-input-row',
        decoTpl: '#decoTpl',
        deco: '.deco-card',
        wallpaperTpl: '#wallpaperTpl',
        wallpaper: '.wallpaper-card',
        wallTpl: '#wallTpl',
        wall: '.wall-input-row',
        summaryContainer: '#summaryContainer',
        materialsSummary: '#materialsSummary',
        priceSummary: '#priceSummary',
        payloadInput: '#payload',
    };

    const orderForm = document.querySelector(SELECTORS.orderForm);
    const roomsEl = document.querySelector(SELECTORS.roomsContainer);

    // --- State Management ---
    const loadState = () => {
        const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (state) {
            document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(state);
            renderPayload(state);
            showToast('Load data from LocalStorage');
        } else {
            showToast('Ready to start new order');
        }
        updateAllSummary();
    };

    const saveState = () => {
        const payload = buildPayload();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    };

    const showToast = (message) => {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.classList.add('toast');
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toastContainer.removeChild(toast);
            }, 300);
        }, 3000);
    };

    // --- DOM Manipulation & Rendering ---
    const renderPayload = (payload) => {
        document.querySelector('[name="customer_name"]').value = payload.customer_name || '';
        document.querySelector('[name="customer_tel"]').value = payload.customer_tel || '';
        document.querySelector('[name="customer_address"]').value = payload.customer_address || '';
        document.querySelector('[name="order_date"]').value = payload.order_date || '';
        document.querySelector('[name="order_id"]').value = payload.order_id || '';
        document.querySelector('[name="staff_name"]').value = payload.staff_name || '';
        document.querySelector('[name="status"]').value = payload.status || '';
        
        roomsEl.innerHTML = '';
        if (payload.rooms) {
            payload.rooms.forEach(room => renderRoom(room, roomsEl));
        }
    };

    const renderRoom = (room, container) => {
        const template = document.querySelector(SELECTORS.roomTpl);
        const clone = template.content.cloneNode(true);
        const roomEl = clone.querySelector(SELECTORS.room);
        roomEl.dataset.roomId = room.id;
        
        roomEl.querySelector('[name="room_name"]').value = room.name || '';
        if (room.suspended) roomEl.classList.add('suspended');
        if (room.locked) {
            roomEl.classList.add('locked-field');
            roomEl.querySelector('[data-act="lock-room"]').querySelector('span').textContent = 'lock_open';
        }

        const setsContainer = roomEl.querySelector('.card-body');
        room.sets.forEach(set => renderSet(set, setsContainer));
        room.deco.forEach(deco => renderDeco(deco, setsContainer));
        room.wallpaper.forEach(wallpaper => renderWallpaper(wallpaper, setsContainer));

        container.appendChild(clone);
        updateRoomIndex();
    };

    const renderSet = (set, container) => {
        const setTpl = document.querySelector(SELECTORS.setTpl);
        const setClone = setTpl.content.cloneNode(true);
        const setEl = setClone.querySelector(SELECTORS.set);
        setEl.dataset.setId = set.id;
        if (set.suspended) setEl.classList.add('suspended');
        if (set.locked) {
            setEl.classList.add('locked-field');
            setEl.querySelector('[data-act="lock-set"]').querySelector('span').textContent = 'lock_open';
        }

        const pointsContainer = setEl.querySelector('[data-points-container]');
        set.points.forEach(point => renderPoint(point, pointsContainer));

        container.appendChild(setClone);
        updateRoomIndex();
    };

    const renderPoint = (point, container) => {
        const pointTpl = document.querySelector(SELECTORS.pointTpl);
        const pointClone = pointTpl.content.cloneNode(true);
        const pointEl = pointClone.querySelector(SELECTORS.point);
        pointEl.dataset.pointId = point.id;
        
        pointEl.querySelector('[name="width_m"]').value = point.width_m || '';
        pointEl.querySelector('[name="height_m"]').value = point.height_m || '';
        pointEl.querySelector('[name="style"]').value = point.style || 'ตาไก่';
        pointEl.querySelector('[name="fabric_variant"]').value = point.fabric_variant || '';
        pointEl.querySelector('[name="sheer_variant"]').value = point.sheer_variant || '';
        
        container.appendChild(pointClone);
    };

    const renderDeco = (deco, container) => {
        const decoTpl = document.querySelector(SELECTORS.decoTpl);
        const decoClone = decoTpl.content.cloneNode(true);
        const decoEl = decoClone.querySelector(SELECTORS.deco);
        decoEl.dataset.decoId = deco.id;
        if (deco.suspended) decoEl.classList.add('suspended');
        
        decoEl.querySelector('[name="deco_item"]').value = deco.item || '';
        decoEl.querySelector('[name="deco_price"]').value = deco.price || '';
        decoEl.querySelector('[name="deco_qty"]').value = deco.qty || '';

        container.appendChild(decoClone);
    };

    const renderWallpaper = (wallpaper, container) => {
        const wallpaperTpl = document.querySelector(SELECTORS.wallpaperTpl);
        const wallpaperClone = wallpaperTpl.content.cloneNode(true);
        const wallpaperEl = wallpaperClone.querySelector(SELECTORS.wallpaper);
        wallpaperEl.dataset.wallpaperId = wallpaper.id;
        if (wallpaper.suspended) wallpaperEl.classList.add('suspended');

        wallpaperEl.querySelector('[name="wallpaper_item"]').value = wallpaper.item || '';
        wallpaperEl.querySelector('[name="wallpaper_height_m"]').value = wallpaper.height_m || '';
        wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value = wallpaper.price_roll || '';

        const wallsContainer = wallpaperEl.querySelector('[data-walls-container]');
        wallpaper.walls.forEach(wall => {
            const wallTpl = document.querySelector(SELECTORS.wallTpl);
            const wallClone = wallTpl.content.cloneNode(true);
            const wallEl = wallClone.querySelector(SELECTORS.wall);
            wallEl.querySelector('[name="wall_width_m"]').value = wall.width_m || '';
            wallsContainer.appendChild(wallClone);
        });

        container.appendChild(wallpaperClone);
    };

    // --- Data and Summary Builders ---
    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            customer_name: document.querySelector('[name="customer_name"]').value,
            customer_tel: document.querySelector('[name="customer_tel"]').value,
            customer_address: document.querySelector('[name="customer_address"]').value,
            order_date: document.querySelector('[name="order_date"]').value,
            order_id: document.querySelector('[name="order_id"]').value,
            staff_name: document.querySelector('[name="staff_name"]').value,
            status: document.querySelector('[name="status"]').value,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const room = {
                id: roomEl.dataset.roomId,
                name: roomEl.querySelector('[name="room_name"]').value,
                suspended: roomEl.classList.contains('suspended'),
                locked: roomEl.classList.contains('locked-field'),
                sets: [],
                deco: [],
                wallpaper: []
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const set = {
                    id: setEl.dataset.setId,
                    suspended: setEl.classList.contains('suspended'),
                    locked: setEl.classList.contains('locked-field'),
                    points: []
                };
                setEl.querySelectorAll(SELECTORS.point).forEach(pointEl => {
                    const point = {
                        id: pointEl.dataset.pointId,
                        width_m: parseFloat(pointEl.querySelector('[name="width_m"]').value) || 0,
                        height_m: parseFloat(pointEl.querySelector('[name="height_m"]').value) || 0,
                        style: pointEl.querySelector('[name="style"]').value,
                        fabric_variant: pointEl.querySelector('[name="fabric_variant"]').value,
                        sheer_variant: pointEl.querySelector('[name="sheer_variant"]').value,
                    };
                    set.points.push(point);
                });
                room.sets.push(set);
            });

            roomEl.querySelectorAll(SELECTORS.deco).forEach(decoEl => {
                room.deco.push({
                    id: decoEl.dataset.decoId,
                    suspended: decoEl.classList.contains('suspended'),
                    item: decoEl.querySelector('[name="deco_item"]').value,
                    price: parseFloat(decoEl.querySelector('[name="deco_price"]').value) || 0,
                    qty: parseInt(decoEl.querySelector('[name="deco_qty"]').value) || 0,
                });
            });

            roomEl.querySelectorAll(SELECTORS.wallpaper).forEach(wallpaperEl => {
                const wallpaper = {
                    id: wallpaperEl.dataset.wallpaperId,
                    suspended: wallpaperEl.classList.contains('suspended'),
                    item: wallpaperEl.querySelector('[name="wallpaper_item"]').value,
                    height_m: parseFloat(wallpaperEl.querySelector('[name="wallpaper_height_m"]').value) || 0,
                    price_roll: parseFloat(wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value) || 0,
                    walls: []
                };
                wallpaperEl.querySelectorAll('[name="wall_width_m"]').forEach(input => {
                    wallpaper.walls.push({ width_m: parseFloat(input.value) || 0 });
                });
                room.wallpaper.push(wallpaper);
            });

            payload.rooms.push(room);
        });
        return payload;
    };

    const updateAllSummary = () => {
        let totalRoomsPrice = 0;
        let totalFabricYards = {};
        let totalSheerYards = {};
        let totalWallpaperRolls = 0;
        let totalWallpaperArea = 0;
        let totalDecoPrice = 0;

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            if (isSuspended(roomEl)) return;

            let roomPrice = 0;
            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                if (isSuspended(setEl)) return;

                let setPrice = 0;
                let setFabricYards = {};
                let setSheerYards = {};

                setEl.querySelectorAll(SELECTORS.point).forEach(pointEl => {
                    if (isSuspended(pointEl)) return;
                    const width = parseFloat(pointEl.querySelector('[name="width_m"]').value) || 0;
                    const height = parseFloat(pointEl.querySelector('[name="height_m"]').value) || 0;
                    const style = pointEl.querySelector('[name="style"]').value;
                    const fabric_variant = pointEl.querySelector('[name="fabric_variant"]').value;
                    const sheer_variant = pointEl.querySelector('[name="sheer_variant"]').value;

                    const { price, area_sqyd } = CALC.calculatePoint(width, height, style, fabric_variant, sheer_variant);
                    pointEl.querySelector('.price').textContent = price.toLocaleString('th-TH');
                    pointEl.querySelector('.price:last-of-type').textContent = area_sqyd.toFixed(2);
                    
                    if (fabric_variant) {
                        setFabricYards[fabric_variant] = (setFabricYards[fabric_variant] || 0) + area_sqyd;
                    }
                    if (sheer_variant) {
                        setSheerYards[sheer_variant] = (setSheerYards[sheer_variant] || 0) + area_sqyd;
                    }
                    setPrice += price;
                });

                const decoPrice = CALC.calculateDeco(setEl);
                setEl.querySelectorAll(SELECTORS.deco).forEach(decoEl => {
                    const price = parseFloat(decoEl.querySelector('[name="deco_price"]').value) || 0;
                    const qty = parseInt(decoEl.querySelector('[name="deco_qty"]').value) || 0;
                    const itemTotal = price * qty;
                    decoEl.querySelector('.deco-total-price').textContent = itemTotal.toLocaleString('th-TH');
                });
                setPrice += decoPrice;

                setEl.querySelector('.set-total-price').textContent = setPrice.toLocaleString('th-TH');
                roomPrice += setPrice;

                for (const variant in setFabricYards) {
                    totalFabricYards[variant] = (totalFabricYards[variant] || 0) + setFabricYards[variant];
                }
                for (const variant in setSheerYards) {
                    totalSheerYards[variant] = (totalSheerYards[variant] || 0) + setSheerYards[variant];
                }
            });

            roomEl.querySelectorAll(SELECTORS.wallpaper).forEach(wallpaperEl => {
                if (isSuspended(wallpaperEl)) return;
                const { price, area_sqm, rolls } = CALC.calculateWallpaper(wallpaperEl);
                wallpaperEl.querySelector('.wallpaper-total-price').textContent = price.toLocaleString('th-TH');
                wallpaperEl.querySelector('.wallpaper-total-rolls').textContent = rolls;
                roomPrice += price;
                totalWallpaperRolls += rolls;
                totalWallpaperArea += area_sqm;
            });

            roomEl.querySelector('[data-room-total-price]').textContent = roomPrice.toLocaleString('th-TH');
            totalRoomsPrice += roomPrice;
        });
        
        const materialsSummaryEl = document.querySelector(SELECTORS.materialsSummary);
        const priceSummaryEl = document.querySelector(SELECTORS.priceSummary);
        materialsSummaryEl.innerHTML = '';
        priceSummaryEl.innerHTML = '';
        
        const createSummaryItem = (label, value, isPrice = false) => {
            const div = document.createElement('div');
            div.classList.add('summary-item');
            const labelSpan = document.createElement('span');
            labelSpan.classList.add('label');
            labelSpan.textContent = label;
            const valueSpan = document.createElement('span');
            valueSpan.textContent = isPrice ? parseFloat(value).toLocaleString('th-TH') + ' บ.' : value;
            if(isPrice) valueSpan.classList.add('price');
            div.appendChild(labelSpan);
            div.appendChild(valueSpan);
            return div;
        };

        for (const variant in totalFabricYards) {
            materialsSummaryEl.appendChild(createSummaryItem(`ผ้า V.${variant}`, `${totalFabricYards[variant].toFixed(2)} ตร.หลา`));
        }
        for (const variant in totalSheerYards) {
            materialsSummaryEl.appendChild(createSummaryItem(`ผ้าโปร่ง V.${variant}`, `${totalSheerYards[variant].toFixed(2)} ตร.หลา`));
        }
        if (totalWallpaperArea > 0) {
             materialsSummaryEl.appendChild(createSummaryItem('วอลเปเปอร์', `${totalWallpaperArea.toFixed(2)} ตร.ม.`));
        }

        priceSummaryEl.appendChild(createSummaryItem('ราคารวม', totalRoomsPrice, true));
        priceSummaryEl.appendChild(createSummaryItem('จำนวนจุด', document.querySelectorAll(SELECTORS.point).length));
        priceSummaryEl.appendChild(createSummaryItem('จำนวนชุด', document.querySelectorAll(SELECTORS.set).length));
        priceSummaryEl.appendChild(createSummaryItem('จำนวนห้อง', document.querySelectorAll(SELECTORS.room).length));
        
        document.querySelector(SELECTORS.roomCount).textContent = document.querySelectorAll(SELECTORS.room).length;
    };

    const updateRoomIndex = () => {
        document.querySelectorAll(SELECTORS.room).forEach((roomEl, i) => {
            roomEl.querySelector('[data-room-index]').textContent = i + 1;
            roomEl.querySelectorAll(SELECTORS.set).forEach((setEl, j) => {
                setEl.querySelector('[data-set-index]').textContent = j + 1;
                setEl.querySelectorAll(SELECTORS.deco).forEach((decoEl, k) => {
                    decoEl.querySelector('[data-deco-index]').textContent = k + 1;
                });
            });
            roomEl.querySelectorAll(SELECTORS.wallpaper).forEach((wallpaperEl, k) => {
                wallpaperEl.querySelector('[data-wallpaper-index]').textContent = k + 1;
            });
        });
    };
    
    // --- Helper Functions ---
    const isSuspended = (el) => el.classList.contains('suspended');
    const isLocked = (el) => el.classList.contains('locked-field');

    // --- Event Listeners ---
    document.addEventListener('DOMContentLoaded', loadState);

    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('ยืนยันการล้างข้อมูลทั้งหมด?')) {
            localStorage.removeItem(STORAGE_KEY);
            window.location.reload();
        }
    });

    document.getElementById('lockAllBtn').addEventListener('click', () => {
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            roomEl.classList.add('locked-field');
            roomEl.querySelectorAll('[data-act="lock-room"] span').forEach(el => el.textContent = 'lock_open');
        });
        showToast('ล็อคข้อมูลทั้งหมด');
        saveState();
    });

    document.getElementById('clearAllBtn').addEventListener('click', () => {
        if (confirm('ยืนยันการลบข้อมูลทั้งหมด?')) {
            localStorage.removeItem(STORAGE_KEY);
            showToast('ล้างข้อมูลทั้งหมด');
            window.location.reload();
        }
    });

    orderForm.addEventListener('change', (e) => {
        const field = e.target;
        if (field.type === 'number' && field.value < 0) {
            field.classList.add('invalid-input');
            showToast('กรุณาใส่ตัวเลขที่เป็นบวก');
        } else {
            field.classList.remove('invalid-input');
        }
        updateAllSummary();
        saveState();
    });
    
    orderForm.addEventListener('input', (e) => {
        updateAllSummary();
        saveState();
    });

    roomsEl.addEventListener('click', (e) => {
        const target = e.target.closest('[data-act]');
        if (!target) return;
        
        const action = target.dataset.act;
        const parentRoom = target.closest(SELECTORS.room);
        const parentSet = target.closest(SELECTORS.set);
        const parentDeco = target.closest(SELECTORS.deco);
        const parentWallpaper = target.closest(SELECTORS.wallpaper);
        const parentWall = target.closest(SELECTORS.wall);

        const actions = {
            'add-room': () => renderRoom({ id: 'room_' + Date.now(), sets: [], deco: [], wallpaper: [] }, roomsEl),
            'del-room': () => { if (confirm('ลบห้องนี้?')) { parentRoom.remove(); updateRoomIndex(); updateAllSummary(); saveState(); } },
            'toggle-room-suspend': () => { parentRoom.classList.toggle('suspended'); updateAllSummary(); saveState(); },
            'lock-room': () => {
                parentRoom.classList.toggle('locked-field');
                target.querySelector('span').textContent = parentRoom.classList.contains('locked-field') ? 'lock_open' : 'lock';
                saveState();
            },
            'copy-room': () => {
                const roomData = buildPayload().rooms.find(r => r.id === parentRoom.dataset.roomId);
                const newRoom = JSON.parse(JSON.stringify(roomData));
                newRoom.id = 'room_' + Date.now();
                renderRoom(newRoom, roomsEl);
                showToast('คัดลอกห้องแล้ว');
                updateRoomIndex();
                updateAllSummary();
                saveState();
            },
            'add-set': () => renderSet({ id: 'set_' + Date.now(), points: [] }, parentRoom.querySelector('.card-body')),
            'del-set': () => { if (confirm('ลบชุดนี้?')) { parentSet.remove(); updateAllSummary(); saveState(); } },
            'toggle-set-suspend': () => { parentSet.classList.toggle('suspended'); updateAllSummary(); saveState(); },
            'lock-set': () => {
                parentSet.classList.toggle('locked-field');
                target.querySelector('span').textContent = parentSet.classList.contains('locked-field') ? 'lock_open' : 'lock';
                saveState();
            },
            'copy-set': () => {
                const roomData = buildPayload().rooms.find(r => r.id === parentRoom.dataset.roomId);
                const setData = roomData.sets.find(s => s.id === parentSet.dataset.setId);
                const newSet = JSON.parse(JSON.stringify(setData));
                newSet.id = 'set_' + Date.now();
                renderSet(newSet, parentRoom.querySelector('.card-body'));
                showToast('คัดลอกชุดแล้ว');
                updateAllSummary();
                saveState();
            },
            'add-point': () => renderPoint({ id: 'point_' + Date.now() }, parentSet.querySelector('[data-points-container]')),
            'del-point': () => { if (confirm('ลบจุดนี้?')) { target.closest(SELECTORS.point).remove(); updateAllSummary(); saveState(); } },
            'add-deco': () => renderDeco({ id: 'deco_' + Date.now() }, parentSet.querySelector('.card-body')),
            'del-deco': () => { if (confirm('ลบรายการตกแต่งนี้?')) { parentDeco.remove(); updateAllSummary(); saveState(); } },
            'toggle-deco-suspend': () => { parentDeco.classList.toggle('suspended'); updateAllSummary(); saveState(); },
            'add-wallpaper': () => renderWallpaper({ id: 'wallpaper_' + Date.now(), walls: [] }, parentRoom.querySelector('.card-body')),
            'del-wallpaper': () => { if (confirm('ลบรายการวอลเปเปอร์นี้?')) { parentWallpaper.remove(); updateAllSummary(); saveState(); } },
            'toggle-wallpaper-suspend': () => { parentWallpaper.classList.toggle('suspended'); updateAllSummary(); saveState(); },
            'add-wall': () => {
                const wallTpl = document.querySelector(SELECTORS.wallTpl);
                const wallClone = wallTpl.content.cloneNode(true);
                parentWallpaper.querySelector('[data-walls-container]').appendChild(wallClone);
            },
            'del-wall': () => { parentWall.remove(); updateAllSummary(); saveState(); }
        };

        if (actions[action]) {
            actions[action]();
        }
    });

    document.addEventListener('click', (e) => {
        document.querySelectorAll('.menu-dropdown.show').forEach(dropdown => {
             if (!dropdown.parentElement.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });

        const menuBtn = e.target.closest('.room-menu-btn, .set-menu-btn, .deco-menu-btn, .wallpaper-menu-btn, #menuBtn');
        if (menuBtn) {
            e.preventDefault();
            const dropdown = menuBtn.closest('.menu-container').querySelector('.menu-dropdown');
            dropdown.classList.toggle('show');
            return;
        }
    });

    orderForm.addEventListener("submit", (e) => {
        const payload = buildPayload();
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
    });
})();