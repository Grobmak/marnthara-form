(function() {
    'use strict';
    const APP_VERSION = "input-ui/4.0.0-m3-liquidglass";
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
        fabric: (width, height, price, style) => {
            const area = width * height;
            const styleSurcharge = PRICING.style_surcharge[style] || 0;
            let heightSurcharge = 0;
            for (const h of PRICING.height) {
                if (height > h.threshold) {
                    heightSurcharge = (height - h.threshold) * h.add_per_m;
                    break;
                }
            }
            return area * price * SQM_TO_SQYD + styleSurcharge + heightSurcharge;
        },
        wallpaper: (area, price) => {
            const rolls = Math.ceil(area / WALLPAPER_SQM_PER_ROLL);
            return rolls * price;
        },
        deco: (quantity, price) => quantity * price,
    };

    const SELECTORS = {
        addRoomBtn: '#addRoomBtn',
        roomsContainer: '#rooms-container',
        overallSummary: '#overallSummary',
        payloadInput: '#payloadInput',
        orderForm: '#orderForm',
        menuBtn: '#menuBtn',
        menuDropdown: '#menuDropdown',
        importBtn: '#importBtn',
        exportBtn: '#exportBtn',
        
        room: '[data-room]',
        set: '[data-set]',
        deco: '[data-deco]',
        wallpaper: '[data-wallpaper]',
    };

    const roomTpl = document.getElementById('roomTpl');
    const setTpl = document.getElementById('setTpl');
    const widthTpl = document.getElementById('widthTpl');
    const decoTpl = document.getElementById('decoTpl');
    const wallpaperTpl = document.getElementById('wallpaperTpl');
    const wallTpl = document.getElementById('wallTpl');

    const roomsEl = document.querySelector(SELECTORS.roomsContainer);
    const addRoomBtn = document.querySelector(SELECTORS.addRoomBtn);
    const overallSummaryEl = document.querySelector(SELECTORS.overallSummary);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    const menuBtn = document.querySelector(SELECTORS.menuBtn);
    const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
    const importBtn = document.querySelector(SELECTORS.importBtn);
    const exportBtn = document.querySelector(SELECTORS.exportBtn);

    const formatPrice = (price) => {
        return new Intl.NumberFormat('th-TH').format(Math.round(price));
    };

    const formatArea = (area) => {
        return area.toFixed(2);
    };

    const updateRoomSummary = (roomEl) => {
        let totalRoomPrice = 0;
        let totalRoomArea = 0;

        roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
            if (!setEl.dataset.suspend) {
                const widthInputs = setEl.querySelectorAll('input[name="width_m"]');
                const height = parseFloat(setEl.querySelector('input[name="height_m"]').value) || 0;
                const fabricPrice = parseFloat(setEl.querySelector('input[name="fabric_price_variant"]').value.replace(/,/g, '')) || 0;
                const sheerPrice = setEl.querySelector('input[name="sheer_price_variant"]') ? (parseFloat(setEl.querySelector('input[name="sheer_price_variant"]').value.replace(/,/g, '')) || 0) : 0;
                const style = setEl.querySelector('select[name="style"]').value;
                const hasSheer = setEl.querySelector('input[name="has_sheer"]').checked;

                let setPrice = 0;
                let setArea = 0;
                widthInputs.forEach(input => {
                    const width = parseFloat(input.value) || 0;
                    if (width > 0 && height > 0) {
                        setPrice += CALC.fabric(width, height, fabricPrice, style);
                        setArea += width * height;
                        if (hasSheer) {
                            setPrice += CALC.fabric(width, height, sheerPrice, style);
                        }
                    }
                });

                setEl.querySelector('[data-set-summary] .price:nth-of-type(1)').textContent = formatPrice(setPrice);
                setEl.querySelector('[data-set-summary] .price:nth-of-type(2)').textContent = formatArea(setArea);
                totalRoomPrice += setPrice;
                totalRoomArea += setArea;
            }
        });

        roomEl.querySelectorAll(SELECTORS.deco).forEach(decoEl => {
            if (!decoEl.dataset.suspend) {
                const quantity = parseFloat(decoEl.querySelector('input[name="deco_quantity"]').value) || 0;
                const price = parseFloat(decoEl.querySelector('input[name="deco_price"]').value.replace(/,/g, '')) || 0;
                const decoPrice = CALC.deco(quantity, price);
                decoEl.querySelector('[data-deco-summary] .price').textContent = formatPrice(decoPrice);
                totalRoomPrice += decoPrice;
            }
        });

        roomEl.querySelectorAll(SELECTORS.wallpaper).forEach(wallpaperEl => {
            if (!wallpaperEl.dataset.suspend) {
                const height = parseFloat(wallpaperEl.querySelector('input[name="wallpaper_height_m"]').value) || 0;
                const pricePerRoll = parseFloat(wallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0;
                const wallWidths = wallpaperEl.querySelectorAll('input[name="wall_width_m"]');
                let totalArea = 0;
                wallWidths.forEach(input => {
                    const width = parseFloat(input.value) || 0;
                    totalArea += width * height;
                });
                const rolls = Math.ceil(totalArea / WALLPAPER_SQM_PER_ROLL);
                const wallpaperPrice = CALC.wallpaper(totalArea, pricePerRoll);

                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = formatPrice(wallpaperPrice);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = formatArea(totalArea);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = rolls;
                totalRoomPrice += wallpaperPrice;
                totalRoomArea += totalArea;
            }
        });
        
        roomEl.querySelector('.room-summary .price:nth-of-type(1)').textContent = formatPrice(totalRoomPrice);
        roomEl.querySelector('.room-summary .price:nth-of-type(2)').textContent = formatArea(totalRoomArea);
    };

    const updateOverallSummary = () => {
        let overallPrice = 0;
        let overallArea = 0;

        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomPrice = parseFloat(roomEl.querySelector('.room-summary .price:nth-of-type(1)').textContent.replace(/,/g, '')) || 0;
            const roomArea = parseFloat(roomEl.querySelector('.room-summary .price:nth-of-type(2)').textContent.replace(/,/g, '')) || 0;
            overallPrice += roomPrice;
            overallArea += roomArea;
        });

        overallSummaryEl.querySelector('.price:nth-of-type(1)').textContent = formatPrice(overallPrice);
        overallSummaryEl.querySelector('.price:nth-of-type(2)').textContent = formatArea(overallArea);
    };

    const updateAll = () => {
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            updateRoomSummary(roomEl);
        });
        updateOverallSummary();
    };

    const addRoom = () => {
        const roomEl = roomTpl.content.cloneNode(true);
        const container = roomEl.querySelector(SELECTORS.room);
        container.dataset.id = Date.now();
        roomsEl.appendChild(container);
        updateAll();
    };

    const addSet = (roomEl) => {
        const setEl = setTpl.content.cloneNode(true);
        const container = setEl.querySelector(SELECTORS.set);
        container.dataset.id = Date.now();
        roomEl.appendChild(container);
        updateSetNumbers(roomEl);
        updateAll();
    };

    const addDeco = (roomEl) => {
        const decoEl = decoTpl.content.cloneNode(true);
        const container = decoEl.querySelector(SELECTORS.deco);
        container.dataset.id = Date.now();
        roomEl.appendChild(container);
        updateDecoNumbers(roomEl);
        updateAll();
    };

    const addWallpaper = (roomEl) => {
        const wallpaperEl = wallpaperTpl.content.cloneNode(true);
        const container = wallpaperEl.querySelector(SELECTORS.wallpaper);
        container.dataset.id = Date.now();
        roomEl.appendChild(container);
        updateWallpaperNumbers(roomEl);
        updateAll();
    };

    const addWidth = (setEl) => {
        const widthEl = widthTpl.content.cloneNode(true);
        setEl.querySelector('[data-widths-container]').appendChild(widthEl);
    };

    const addWall = (wallpaperEl) => {
        const wallEl = wallTpl.content.cloneNode(true);
        wallpaperEl.querySelector('[data-walls-container]').appendChild(wallEl);
    };

    const delRoom = (target) => {
        const roomEl = target.closest(SELECTORS.room);
        if (confirm("คุณต้องการลบห้องนี้ใช่หรือไม่?")) {
            roomEl.remove();
            updateAll();
        }
    };

    const delSet = (target) => {
        const setEl = target.closest(SELECTORS.set);
        const roomEl = setEl.closest(SELECTORS.room);
        if (confirm("คุณต้องการลบชุดนี้ใช่หรือไม่?")) {
            setEl.remove();
            updateSetNumbers(roomEl);
            updateAll();
        }
    };
    
    const delDeco = (target) => {
        const decoEl = target.closest(SELECTORS.deco);
        const roomEl = decoEl.closest(SELECTORS.room);
        if (confirm("คุณต้องการลบของตกแต่งนี้ใช่หรือไม่?")) {
            decoEl.remove();
            updateDecoNumbers(roomEl);
            updateAll();
        }
    };

    const delWallpaper = (target) => {
        const wallpaperEl = target.closest(SELECTORS.wallpaper);
        const roomEl = wallpaperEl.closest(SELECTORS.room);
        if (confirm("คุณต้องการลบวอลล์เปเปอร์นี้ใช่หรือไม่?")) {
            wallpaperEl.remove();
            updateWallpaperNumbers(roomEl);
            updateAll();
        }
    };

    const delWidth = (target) => {
        target.closest('.width-input-row').remove();
    };
    
    const delWall = (target) => {
        target.closest('.wall-input-row').remove();
    };
    
    const toggleSetFabricUI = (setEl) => {
        const fabricType = setEl.querySelector('select[name="fabric_variant"]').value;
        const sheerGroup = setEl.querySelector('[data-sheer-group]');
        const hasSheerCheckbox = setEl.querySelector('input[name="has_sheer"]');
        if (fabricType === 'dimout' || fabricType === 'blackout') {
            sheerGroup.classList.remove('hidden');
            hasSheerCheckbox.parentElement.classList.remove('hidden');
        } else {
            sheerGroup.classList.add('hidden');
            hasSheerCheckbox.parentElement.classList.add('hidden');
            hasSheerCheckbox.checked = false;
        }
    };
    
    const toggleSuspend = (target) => {
        const el = target.closest('.section');
        const isSuspended = el.dataset.suspend;
        const toggleBtn = target.closest('.menu-dropdown').querySelector('[data-act$="-suspend"]');
        if (isSuspended) {
            el.dataset.suspend = '';
            el.classList.remove('alert-suspended');
            toggleBtn.innerHTML = '<span class="material-symbols-outlined">pause_circle</span> พัก';
        } else {
            el.dataset.suspend = 'true';
            el.classList.add('alert-suspended');
            toggleBtn.innerHTML = '<span class="material-symbols-outlined">play_circle</span> กลับมาใช้งาน';
        }
        updateAll();
    };

    const clearInputs = (container) => {
        container.querySelectorAll('input').forEach(input => {
            if (input.type === 'number' || input.type === 'text') {
                input.value = '';
            } else if (input.type === 'checkbox') {
                input.checked = false;
            }
        });
        container.querySelectorAll('select').forEach(select => {
            select.selectedIndex = 0;
        });
    };
    
    const clearRoom = (target) => {
        const roomEl = target.closest(SELECTORS.room);
        roomEl.querySelectorAll('.section').forEach(section => section.remove());
        clearInputs(roomEl);
        updateAll();
    };

    const clearSet = (target) => {
        const setEl = target.closest(SELECTORS.set);
        setEl.querySelector('[data-widths-container]').innerHTML = '';
        clearInputs(setEl);
        updateAll();
    };
    
    const clearDeco = (target) => {
        const decoEl = target.closest(SELECTORS.deco);
        clearInputs(decoEl);
        updateAll();
    };
    
    const clearWallpaper = (target) => {
        const wallpaperEl = target.closest(SELECTORS.wallpaper);
        wallpaperEl.querySelector('[data-walls-container]').innerHTML = '';
        clearInputs(wallpaperEl);
        updateAll();
    };

    const updateSetNumbers = (roomEl) => {
        roomEl.querySelectorAll(SELECTORS.set).forEach((set, index) => {
            set.querySelector('.set-number').textContent = index + 1;
        });
    };

    const updateDecoNumbers = (roomEl) => {
        roomEl.querySelectorAll(SELECTORS.deco).forEach((deco, index) => {
            deco.querySelector('.deco-number').textContent = index + 1;
        });
    };

    const updateWallpaperNumbers = (roomEl) => {
        roomEl.querySelectorAll(SELECTORS.wallpaper).forEach((wallpaper, index) => {
            wallpaper.querySelector('.wallpaper-number').textContent = index + 1;
        });
    };

    const buildPayload = () => {
        const payload = {
            version: APP_VERSION,
            rooms: []
        };
        document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
            const roomData = {
                id: roomEl.dataset.id,
                name: roomEl.querySelector('input[name="room_name"]').value,
                summary: {
                    price: parseFloat(roomEl.querySelector('.room-summary .price:nth-of-type(1)').textContent.replace(/,/g, '')),
                    area: parseFloat(roomEl.querySelector('.room-summary .price:nth-of-type(2)').textContent.replace(/,/g, '')),
                },
                sets: [],
                decos: [],
                wallpapers: [],
            };

            roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
                const isSuspended = setEl.dataset.suspend === 'true';
                const widthInputs = setEl.querySelectorAll('input[name="width_m"]');
                const widths = Array.from(widthInputs).map(input => parseFloat(input.value) || 0);

                roomData.sets.push({
                    id: setEl.dataset.id,
                    is_suspended: isSuspended,
                    style: setEl.querySelector('select[name="style"]').value,
                    height_m: parseFloat(setEl.querySelector('input[name="height_m"]').value) || 0,
                    widths_m: widths,
                    fabric_variant: setEl.querySelector('select[name="fabric_variant"]').value,
                    fabric_price: parseFloat(setEl.querySelector('input[name="fabric_price_variant"]').value.replace(/,/g, '')) || 0,
                    has_sheer: setEl.querySelector('input[name="has_sheer"]').checked,
                    sheer_variant: setEl.querySelector('select[name="sheer_variant"]').value,
                    sheer_price: parseFloat(setEl.querySelector('input[name="sheer_price_variant"]').value.replace(/,/g, '')) || 0,
                    summary: {
                        price: parseFloat(setEl.querySelector('[data-set-summary] .price:nth-of-type(1)').textContent.replace(/,/g, '')),
                        area: parseFloat(setEl.querySelector('[data-set-summary] .price:nth-of-type(2)').textContent.replace(/,/g, '')),
                    }
                });
            });

            roomEl.querySelectorAll(SELECTORS.deco).forEach(decoEl => {
                const isSuspended = decoEl.dataset.suspend === 'true';
                roomData.decos.push({
                    id: decoEl.dataset.id,
                    is_suspended: isSuspended,
                    detail: decoEl.querySelector('input[name="deco_detail"]').value,
                    quantity: parseFloat(decoEl.querySelector('input[name="deco_quantity"]').value) || 0,
                    price: parseFloat(decoEl.querySelector('input[name="deco_price"]').value.replace(/,/g, '')) || 0,
                    summary: {
                        price: parseFloat(decoEl.querySelector('[data-deco-summary] .price').textContent.replace(/,/g, '')),
                    }
                });
            });
            
            roomEl.querySelectorAll(SELECTORS.wallpaper).forEach(wallpaperEl => {
                const isSuspended = wallpaperEl.dataset.suspend === 'true';
                const wallWidths = Array.from(wallpaperEl.querySelectorAll('input[name="wall_width_m"]')).map(input => parseFloat(input.value) || 0);
                roomData.wallpapers.push({
                    id: wallpaperEl.dataset.id,
                    is_suspended: isSuspended,
                    code: wallpaperEl.querySelector('input[name="wallpaper_code"]').value,
                    height_m: parseFloat(wallpaperEl.querySelector('input[name="wallpaper_height_m"]').value) || 0,
                    wall_widths_m: wallWidths,
                    price_per_roll: parseFloat(wallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value.replace(/,/g, '')) || 0,
                    summary: {
                        price: parseFloat(wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent.replace(/,/g, '')),
                        area: parseFloat(wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent.replace(/,/g, '')),
                        rolls: parseFloat(wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent.replace(/,/g, '')),
                    }
                });
            });
            
            payload.rooms.push(roomData);
        });
        return payload;
    };

    const importPayload = (payload) => {
        if (!payload || !payload.rooms) {
            alert('Invalid JSON file.');
            return;
        }

        roomsEl.innerHTML = '';
        payload.rooms.forEach(roomData => {
            const roomEl = roomTpl.content.cloneNode(true).querySelector(SELECTORS.room);
            roomEl.dataset.id = roomData.id;
            roomEl.querySelector('input[name="room_name"]').value = roomData.name;
            roomsEl.appendChild(roomEl);

            roomData.sets.forEach(setData => {
                const setEl = setTpl.content.cloneNode(true).querySelector(SELECTORS.set);
                setEl.dataset.id = setData.id;
                setEl.querySelector('select[name="style"]').value = setData.style;
                setEl.querySelector('input[name="height_m"]').value = setData.height_m;
                setEl.querySelector('select[name="fabric_variant"]').value = setData.fabric_variant;
                setEl.querySelector('input[name="fabric_price_variant"]').value = setData.fabric_price;
                setEl.querySelector('input[name="has_sheer"]').checked = setData.has_sheer;
                setEl.querySelector('select[name="sheer_variant"]').value = setData.sheer_variant;
                setEl.querySelector('input[name="sheer_price_variant"]').value = setData.sheer_price;

                if (setData.is_suspended) {
                    setEl.dataset.suspend = 'true';
                    setEl.classList.add('alert-suspended');
                    setEl.querySelector('[data-act="toggle-set-suspend"]').innerHTML = '<span class="material-symbols-outlined">play_circle</span> กลับมาใช้งาน';
                }

                toggleSetFabricUI(setEl);
                setData.widths_m.forEach(width => {
                    const widthEl = widthTpl.content.cloneNode(true).querySelector('.width-input-row');
                    widthEl.querySelector('input[name="width_m"]').value = width;
                    setEl.querySelector('[data-widths-container]').appendChild(widthEl);
                });
                roomEl.appendChild(setEl);
            });

            roomData.decos.forEach(decoData => {
                const decoEl = decoTpl.content.cloneNode(true).querySelector(SELECTORS.deco);
                decoEl.dataset.id = decoData.id;
                decoEl.querySelector('input[name="deco_detail"]').value = decoData.detail;
                decoEl.querySelector('input[name="deco_quantity"]').value = decoData.quantity;
                decoEl.querySelector('input[name="deco_price"]').value = decoData.price;

                if (decoData.is_suspended) {
                    decoEl.dataset.suspend = 'true';
                    decoEl.classList.add('alert-suspended');
                    decoEl.querySelector('[data-act="toggle-deco-suspend"]').innerHTML = '<span class="material-symbols-outlined">play_circle</span> กลับมาใช้งาน';
                }
                roomEl.appendChild(decoEl);
            });
            
            roomData.wallpapers.forEach(wallpaperData => {
                const wallpaperEl = wallpaperTpl.content.cloneNode(true).querySelector(SELECTORS.wallpaper);
                wallpaperEl.dataset.id = wallpaperData.id;
                wallpaperEl.querySelector('input[name="wallpaper_code"]').value = wallpaperData.code;
                wallpaperEl.querySelector('input[name="wallpaper_height_m"]').value = wallpaperData.height_m;
                wallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value = wallpaperData.price_per_roll;
                
                if (wallpaperData.is_suspended) {
                    wallpaperEl.dataset.suspend = 'true';
                    wallpaperEl.classList.add('alert-suspended');
                    wallpaperEl.querySelector('[data-act="toggle-wallpaper-suspend"]').innerHTML = '<span class="material-symbols-outlined">play_circle</span> กลับมาใช้งาน';
                }
                
                wallpaperData.wall_widths_m.forEach(width => {
                    const wallEl = wallTpl.content.cloneNode(true).querySelector('.wall-input-row');
                    wallEl.querySelector('input[name="wall_width_m"]').value = width;
                    wallpaperEl.querySelector('[data-walls-container]').appendChild(wallEl);
                });
                roomEl.appendChild(wallpaperEl);
            });

            updateSetNumbers(roomEl);
            updateDecoNumbers(roomEl);
            updateWallpaperNumbers(roomEl);
        });

        updateAll();
        saveToLocalStorage();
    };

    const saveToLocalStorage = () => {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.error("Could not save to local storage", e);
        }
    };

    const loadFromLocalStorage = () => {
        try {
            const payload = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (payload) {
                importPayload(payload);
            } else {
                addRoom();
            }
        } catch (e) {
            console.error("Could not load from local storage", e);
            addRoom();
        }
    };

    const exportToJson = () => {
        const payload = buildPayload();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `marnthara_order_${Date.now()}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    // Event Listeners
    document.addEventListener('DOMContentLoaded', loadFromLocalStorage);

    orderForm.addEventListener('input', (e) => {
        const target = e.target;
        if (target.closest(SELECTORS.room)) {
            updateAll();
        }
        if (target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
        saveToLocalStorage();
    });

    addRoomBtn.addEventListener('click', addRoom);
    
    roomsEl.addEventListener('click', (e) => {
        const target = e.target;
        const action = target.closest('[data-act]')?.dataset.act;
        const roomEl = target.closest(SELECTORS.room);

        const actions = {
            'add-set': () => addSet(roomEl),
            'add-deco': () => addDeco(roomEl),
            'add-wallpaper': () => addWallpaper(roomEl),
            'add-width': () => addWidth(target.closest(SELECTORS.set)),
            'add-wall': () => addWall(target.closest(SELECTORS.wallpaper)),
            
            'dup-room': () => {
                const roomData = buildPayload().rooms.find(r => r.id == roomEl.dataset.id);
                if (roomData) {
                    delete roomData.id;
                    roomData.name += ' (สำเนา)';
                    const clonedPayload = { version: APP_VERSION, rooms: [roomData] };
                    importPayload(clonedPayload);
                }
            },
            'dup-set': () => {
                const setEl = target.closest(SELECTORS.set);
                const roomData = buildPayload().rooms.find(r => r.id == roomEl.dataset.id);
                if (roomData) {
                    const setData = roomData.sets.find(s => s.id == setEl.dataset.id);
                    if (setData) {
                        delete setData.id;
                        const clonedSetEl = setTpl.content.cloneNode(true).querySelector(SELECTORS.set);
                        clonedSetEl.dataset.id = Date.now();
                        clonedSetEl.querySelector('select[name="style"]').value = setData.style;
                        clonedSetEl.querySelector('input[name="height_m"]').value = setData.height_m;
                        clonedSetEl.querySelector('select[name="fabric_variant"]').value = setData.fabric_variant;
                        clonedSetEl.querySelector('input[name="fabric_price_variant"]').value = setData.fabric_price;
                        clonedSetEl.querySelector('input[name="has_sheer"]').checked = setData.has_sheer;
                        clonedSetEl.querySelector('select[name="sheer_variant"]').value = setData.sheer_variant;
                        clonedSetEl.querySelector('input[name="sheer_price_variant"]').value = setData.sheer_price;

                        toggleSetFabricUI(clonedSetEl);
                        setData.widths_m.forEach(width => {
                            const widthEl = widthTpl.content.cloneNode(true).querySelector('.width-input-row');
                            widthEl.querySelector('input[name="width_m"]').value = width;
                            clonedSetEl.querySelector('[data-widths-container]').appendChild(widthEl);
                        });
                        setEl.parentNode.insertBefore(clonedSetEl, setEl.nextSibling);
                        updateSetNumbers(roomEl);
                        updateAll();
                    }
                }
            },
            'dup-deco': () => {
                const decoEl = target.closest(SELECTORS.deco);
                const roomData = buildPayload().rooms.find(r => r.id == roomEl.dataset.id);
                if (roomData) {
                    const decoData = roomData.decos.find(d => d.id == decoEl.dataset.id);
                    if (decoData) {
                        delete decoData.id;
                        const clonedDecoEl = decoTpl.content.cloneNode(true).querySelector(SELECTORS.deco);
                        clonedDecoEl.dataset.id = Date.now();
                        clonedDecoEl.querySelector('input[name="deco_detail"]').value = decoData.detail;
                        clonedDecoEl.querySelector('input[name="deco_quantity"]').value = decoData.quantity;
                        clonedDecoEl.querySelector('input[name="deco_price"]').value = decoData.price;
                        decoEl.parentNode.insertBefore(clonedDecoEl, decoEl.nextSibling);
                        updateDecoNumbers(roomEl);
                        updateAll();
                    }
                }
            },
            'dup-wallpaper': () => {
                const wallpaperEl = target.closest(SELECTORS.wallpaper);
                const roomData = buildPayload().rooms.find(r => r.id == roomEl.dataset.id);
                if (roomData) {
                    const wallpaperData = roomData.wallpapers.find(w => w.id == wallpaperEl.dataset.id);
                    if (wallpaperData) {
                        delete wallpaperData.id;
                        const clonedWallpaperEl = wallpaperTpl.content.cloneNode(true).querySelector(SELECTORS.wallpaper);
                        clonedWallpaperEl.dataset.id = Date.now();
                        clonedWallpaperEl.querySelector('input[name="wallpaper_code"]').value = wallpaperData.code;
                        clonedWallpaperEl.querySelector('input[name="wallpaper_height_m"]').value = wallpaperData.height_m;
                        clonedWallpaperEl.querySelector('input[name="wallpaper_price_roll"]').value = wallpaperData.price_per_roll;
                        
                        wallpaperData.wall_widths_m.forEach(width => {
                            const wallEl = wallTpl.content.cloneNode(true).querySelector('.wall-input-row');
                            wallEl.querySelector('input[name="wall_width_m"]').value = width;
                            clonedWallpaperEl.querySelector('[data-walls-container]').appendChild(wallEl);
                        });
                        wallpaperEl.parentNode.insertBefore(clonedWallpaperEl, wallpaperEl.nextSibling);
                        updateWallpaperNumbers(roomEl);
                        updateAll();
                    }
                }
            },

            'toggle-set-suspend': () => toggleSuspend(target),
            'toggle-deco-suspend': () => toggleSuspend(target),
            'toggle-wallpaper-suspend': () => toggleSuspend(target),
            'clear-room': () => clearRoom(target),
            'clear-set': () => clearSet(target),
            'clear-deco': () => clearDeco(target),
            'clear-wallpaper': () => clearWallpaper(target),
            'del-room': () => delRoom(target),
            'del-set': () => delSet(target),
            'del-deco': () => delDeco(target),
            'del-wallpaper': () => delWallpaper(target),
            'del-width': () => delWidth(target),
            'del-wall': () => delWall(target),
        };

        if (actions[action]) {
            actions[action]();
        }
    });

    roomsEl.addEventListener('change', (e) => {
        if (e.target.name === 'fabric_variant') {
            toggleSetFabricUI(e.target.closest(SELECTORS.set));
        }
    });

    document.addEventListener('click', (e) => {
        document.querySelectorAll('.menu-dropdown.show').forEach(dropdown => {
             if (!dropdown.parentElement.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });

        const menuBtn = e.target.closest('.room-menu-btn, .set-menu-btn, .deco-menu-btn, .wallpaper-menu-btn');
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
        // e.preventDefault();
        // window.location.href = `whatsapp://send?text=${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
    });

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
        e.preventDefault();
        menuDropdown.classList.toggle('show');
    });

    exportBtn.addEventListener('click', exportToJson);

    importBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const payload = JSON.parse(event.target.result);
                        if (confirm("การนำเข้าข้อมูลจะเขียนทับข้อมูลที่มีอยู่ทั้งหมด คุณต้องการดำเนินการต่อหรือไม่?")) {
                            importPayload(payload);
                        }
                    } catch (error) {
                        alert('ไม่สามารถอ่านไฟล์ JSON ได้ กรุณาตรวจสอบไฟล์');
                        console.error("Error reading JSON file:", error);
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    });

    // Initial setup on load
    updateAll();
})();