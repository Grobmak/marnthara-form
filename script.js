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
        fabric: (width, height, price_per_yd, style) => {
            const fabric_sqyd = width * height * SQM_TO_SQYD;
            const style_surcharge = PRICING.style_surcharge[style] || 0;
            return (fabric_sqyd * price_per_yd) + style_surcharge;
        },
        sheer: (width, height, price_per_yd) => {
            const sheer_sqyd = width * height * SQM_TO_SQYD;
            return sheer_sqyd * price_per_yd;
        },
        deco: (points, price_per_point) => points * price_per_point,
        wallpaper: (area, price_per_roll) => {
            const rolls = Math.ceil(area / WALLPAPER_SQM_PER_ROLL);
            return rolls * price_per_roll;
        }
    };
    const SELECTORS = {
        roomTpl: '#roomTpl',
        orderForm: '#orderForm',
        rooms: '#rooms',
        payloadInput: '#payloadInput',
        summaryFabricPrice: '#summaryFabricPrice',
        summarySheerPrice: '#summarySheerPrice',
        summaryDecoPrice: '#summaryDecoPrice',
        summaryWallpaperPrice: '#summaryWallpaperPrice',
        summaryTotalPrice: '#summaryTotalPrice',
        lockBtn: '#lockBtn',
        resetBtn: '#resetBtn',
        importBtn: '#importBtn',
        exportBtn: '#exportBtn',
        shareBtn: '#shareBtn',
        aboutBtn: '#aboutBtn',
        submitBtn: '#submitBtn',
        delAllRoomsBtn: '#delAllRoomsBtn'
    };
    const roomsEl = document.querySelector(SELECTORS.rooms);
    const orderForm = document.querySelector(SELECTORS.orderForm);
    let locked = false;
    let roomCounter = 0;

    function buildPayload() {
        const payload = [];
        document.querySelectorAll('.room').forEach(roomEl => {
            const roomData = {};
            roomData.room_name = roomEl.querySelector('[name="room_name"]').value;
            roomData.is_sheer = roomEl.querySelector('[name="is_sheer"]').checked;
            roomData.is_deco = roomEl.querySelector('[name="is_deco"]').checked;
            roomData.is_wallpaper = roomEl.querySelector('[name="is_wallpaper"]').checked;

            if (roomData.is_sheer) {
                roomData.sheer_price = parseFloat(roomEl.querySelector('[name="sheer_price"]').value) || 0;
            }

            if (roomData.is_deco) {
                roomData.deco_price_per_point = parseFloat(roomEl.querySelector('[name="deco_price_per_point"]').value) || 0;
                roomData.deco_points = parseInt(roomEl.querySelector('[name="deco_points"]').value) || 0;
            }

            if (roomData.is_wallpaper) {
                roomData.wallpaper_height_m = parseFloat(roomEl.querySelector('[name="wallpaper_height_m"]').value) || 0;
                roomData.wallpaper_price_roll = parseFloat(roomEl.querySelector('[name="wallpaper_price_roll"]').value) || 0;
                roomData.wall_widths = Array.from(roomEl.querySelectorAll('[name="wall_width_m"]')).map(input => parseFloat(input.value) || 0);
            }

            roomData.height_m = parseFloat(roomEl.querySelector('[name="height_m"]').value) || 0;
            roomData.fabric_price = parseFloat(roomEl.querySelector('[name="fabric_price"]').value) || 0;
            roomData.style = roomEl.querySelector('[name="style"]').value;
            roomData.curtain_sets = Array.from(roomEl.querySelectorAll('.curtain-set')).map(setEl => {
                const set = {};
                set.width_m = parseFloat(setEl.querySelector('[name="width_m"]').value) || 0;
                set.curtain_points = parseInt(setEl.querySelector('[name="curtain_points"]').value) || 0;
                set.fabric_variant = setEl.querySelector('[name="fabric_variant"]').value;
                set.is_suspended = setEl.classList.contains('suspended');
                return set;
            });

            payload.push(roomData);
        });
        return payload;
    }

    function calculate(roomEl) {
        let fabricTotal = 0;
        let sheerTotal = 0;
        let decoTotal = 0;
        let wallpaperTotal = 0;
        let grandTotal = 0;

        const roomData = {};
        const isSheer = roomEl.querySelector('[name="is_sheer"]').checked;
        const isDeco = roomEl.querySelector('[name="is_deco"]').checked;
        const isWallpaper = roomEl.querySelector('[name="is_wallpaper"]').checked;

        const height_m = parseFloat(roomEl.querySelector('[name="height_m"]').value) || 0;
        const fabric_price = parseFloat(roomEl.querySelector('[name="fabric_price"]').value) || 0;
        const style = roomEl.querySelector('[name="style"]').value;

        // Curtain & Labour
        const curtainSets = Array.from(roomEl.querySelectorAll('.curtain-set:not(.suspended)'));
        let totalWidth = 0;
        let totalPoints = 0;
        curtainSets.forEach(setEl => {
            const width = parseFloat(setEl.querySelector('[name="width_m"]').value) || 0;
            const points = parseInt(setEl.querySelector('[name="curtain_points"]').value) || 0;
            totalWidth += width;
            totalPoints += points;
        });

        const fabric_total_price = CALC.fabric(totalWidth, height_m, fabric_price, style);
        const labour_total_price = totalPoints * 500;
        fabricTotal = fabric_total_price + labour_total_price;
        roomEl.querySelector('[data-field="fabric_total_price"]').textContent = formatPrice(fabric_total_price);
        roomEl.querySelector('[data-field="labour_total_price"]').textContent = formatPrice(labour_total_price);
        roomEl.querySelector('[data-field="grand_total_price"]').textContent = formatPrice(fabricTotal);

        // Sheer
        if (isSheer) {
            const sheer_price = parseFloat(roomEl.querySelector('[name="sheer_price"]').value) || 0;
            sheerTotal = CALC.sheer(totalWidth, height_m, sheer_price);
            roomEl.querySelector('[data-field="sheer_total_price"]').textContent = formatPrice(sheerTotal);
        }

        // Deco
        if (isDeco) {
            const deco_price_per_point = parseFloat(roomEl.querySelector('[name="deco_price_per_point"]').value) || 0;
            const deco_points = parseInt(roomEl.querySelector('[name="deco_points"]').value) || 0;
            decoTotal = CALC.deco(deco_points, deco_price_per_point);
            roomEl.querySelector('[data-field="deco_total_price"]').textContent = formatPrice(decoTotal);
        }

        // Wallpaper
        if (isWallpaper) {
            const wallpaper_height_m = parseFloat(roomEl.querySelector('[name="wallpaper_height_m"]').value) || 0;
            const wallpaper_price_roll = parseFloat(roomEl.querySelector('[name="wallpaper_price_roll"]').value) || 0;
            const wallWidths = Array.from(roomEl.querySelectorAll('[name="wall_width_m"]')).map(input => parseFloat(input.value) || 0);
            const totalWallArea = wallWidths.reduce((acc, width) => acc + (width * wallpaper_height_m), 0);
            const rolls = Math.ceil(totalWallArea / WALLPAPER_SQM_PER_ROLL);
            wallpaperTotal = CALC.wallpaper(totalWallArea, wallpaper_price_roll);
            roomEl.querySelector('[data-field="wallpaper-summary"]').innerHTML = `ราคา: <span class="price">${formatPrice(wallpaperTotal)}</span> บ. • พื้นที่: <span class="price">${totalWallArea.toFixed(2)}</span> ตร.ม. • ใช้ <span class="price">${rolls}</span> ม้วน`;
        }

        grandTotal = fabricTotal + sheerTotal + decoTotal + wallpaperTotal;
        roomEl.querySelector('[data-field="grand_total_price"]').textContent = formatPrice(grandTotal);

        updateSummary();
    }

    function updateSummary() {
        let summaryFabric = 0;
        let summarySheer = 0;
        let summaryDeco = 0;
        let summaryWallpaper = 0;

        document.querySelectorAll('.room').forEach(roomEl => {
            summaryFabric += parseFloat(roomEl.querySelector('[data-field="fabric_total_price"]').textContent.replace(/[^0-9.-]+/g, "")) || 0;
            summarySheer += parseFloat(roomEl.querySelector('[data-field="sheer_total_price"]').textContent.replace(/[^0-9.-]+/g, "")) || 0;
            summaryDeco += parseFloat(roomEl.querySelector('[data-field="deco_total_price"]').textContent.replace(/[^0-9.-]+/g, "")) || 0;
            summaryWallpaper += parseFloat(roomEl.querySelector('[data-field="wallpaper_total_price"]').textContent.replace(/[^0-9.-]+/g, "")) || 0;
        });

        document.querySelector(SELECTORS.summaryFabricPrice).textContent = formatPrice(summaryFabric);
        document.querySelector(SELECTORS.summarySheerPrice).textContent = formatPrice(summarySheer);
        document.querySelector(SELECTORS.summaryDecoPrice).textContent = formatPrice(summaryDeco);
        document.querySelector(SELECTORS.summaryWallpaperPrice).textContent = formatPrice(summaryWallpaper);
        document.querySelector(SELECTORS.summaryTotalPrice).textContent = formatPrice(summaryFabric + summarySheer + summaryDeco + summaryWallpaper);
    }

    function addRoom() {
        roomCounter++;
        const template = document.querySelector(SELECTORS.roomTpl);
        const clone = template.content.cloneNode(true);
        const roomEl = clone.querySelector('.room');
        roomEl.setAttribute('data-room-id', `room-${roomCounter}`);
        
        // Update the room name and a hidden input for the name
        const roomNameEl = roomEl.querySelector('[data-field="room_name"]');
        roomNameEl.textContent = `ห้องที่ ${roomCounter}`;
        
        // Add a hidden input for the name
        const roomNameInput = document.createElement('input');
        roomNameInput.type = 'hidden';
        roomNameInput.name = 'room_name';
        roomNameInput.value = `ห้องที่ ${roomCounter}`;
        roomEl.querySelector('.room-name-wrapper').appendChild(roomNameInput);
        
        // Event listener to toggle room name input
        roomNameEl.addEventListener('click', (e) => {
            const inputField = e.target.nextElementSibling;
            if (inputField) {
                e.target.style.display = 'none';
                inputField.type = 'text';
                inputField.focus();
                inputField.addEventListener('blur', () => {
                    e.target.textContent = inputField.value;
                    e.target.style.display = '';
                    inputField.type = 'hidden';
                }, { once: true });
            }
        });

        roomsEl.appendChild(clone);
        showToast('เพิ่มห้องใหม่แล้ว');
        calculate(roomEl);
    }
    
    // Initial room
    addRoom();

    function formatPrice(price) {
        if (typeof price !== 'number' || isNaN(price)) {
            return "0";
        }
        return price.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    
    function showToast(message) {
        const toast = document.createElement('div');
        toast.classList.add('toast');
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    function toggleSuspend(el) {
        const isSuspended = el.classList.toggle('suspended');
        showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'เปิดใช้งาน'}แล้ว`);
        calculate(el.closest('.room'));
    }

    function delSet(el) {
        const roomEl = el.closest('.room');
        el.closest('.curtain-set').remove();
        showToast('ลบรายการแล้ว');
        calculate(roomEl);
    }
    
    function eco(el) {
        const roomEl = el.closest('.room');
        const setEl = el.closest('.curtain-set');
        const clone = setEl.cloneNode(true);
        clone.classList.remove('suspended');
        setEl.after(clone);
        showToast('คัดลอกรายการแล้ว');
        calculate(roomEl);
    }

    function toggleSetFabricUI(setEl) {
        const variant = setEl.querySelector('[name="fabric_variant"]').value;
        setEl.querySelector('[data-field="curtain-fabrics"]').classList.toggle('hidden', variant === 'other');
        setEl.querySelector('[data-field="curtain-price-input"]').classList.toggle('hidden', variant !== 'other');
    }

    function clearDeco(el) {
        const roomEl = el.closest('.room');
        roomEl.querySelector('[name="deco_points"]').value = '';
        roomEl.querySelector('[name="deco_price_per_point"]').value = '';
        showToast('ล้างข้อมูลอุปกรณ์แล้ว');
        calculate(roomEl);
    }

    function delDeco(el) {
        const roomEl = el.closest('.room');
        roomEl.querySelector('[name="is_deco"]').checked = false;
        roomEl.querySelector('.room-info-deco').classList.add('hidden');
        showToast('ลบข้อมูลอุปกรณ์แล้ว');
        calculate(roomEl);
    }

    function clearWallpaper(el) {
        const roomEl = el.closest('.room');
        roomEl.querySelector('[name="wallpaper_height_m"]').value = '';
        roomEl.querySelector('[name="wallpaper_price_roll"]').value = '';
        roomEl.querySelector('[data-walls-container]').innerHTML = '';
        showToast('ล้างข้อมูลวอลเปเปอร์แล้ว');
        calculate(roomEl);
    }

    function delWallpaper(el) {
        const roomEl = el.closest('.room');
        roomEl.querySelector('[name="is_wallpaper"]').checked = false;
        roomEl.querySelector('.room-info-wallpaper').classList.add('hidden');
        showToast('ลบข้อมูลวอลเปเปอร์แล้ว');
        calculate(roomEl);
    }

    function delWall(el) {
        const roomEl = el.closest('.room');
        el.closest('.wall-input-row').remove();
        showToast('ลบผนังแล้ว');
        calculate(roomEl);
    }
    
    function delRoom(el) {
        const roomEl = el.closest('.room');
        roomEl.remove();
        showToast('ลบห้องแล้ว');
        updateSummary();
    }
    
    function exportJSON() {
        const payload = buildPayload();
        const dataStr = JSON.stringify(payload, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const link = document.createElement('a');
        link.setAttribute('href', dataUri);
        link.setAttribute('download', `marnthara-order-${Date.now()}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('ข้อมูลถูกดาวน์โหลดแล้ว');
    }

    function shareLink() {
        const payload = JSON.stringify(buildPayload());
        const compressedPayload = pako.deflate(payload, { to: 'string' });
        const encodedPayload = btoa(compressedPayload);
        const url = `${window.location.origin}${window.location.pathname}?payload=${encodedPayload}`;
        
        if (navigator.share) {
            navigator.share({
                title: 'Marnthara Order',
                url: url,
            }).then(() => {
                showToast('ลิงก์ถูกแชร์แล้ว');
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(url).then(() => {
                showToast('คัดลอกลิงก์แล้ว');
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        }
    }
    
    function importJSON(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const payload = JSON.parse(e.target.result);
                document.querySelector(SELECTORS.rooms).innerHTML = '';
                roomCounter = 0;
                payload.forEach(roomData => {
                    roomCounter++;
                    const template = document.querySelector(SELECTORS.roomTpl);
                    const clone = template.content.cloneNode(true);
                    const roomEl = clone.querySelector('.room');
                    roomEl.setAttribute('data-room-id', `room-${roomCounter}`);
                    roomEl.querySelector('[name="room_name"]').value = roomData.room_name;
                    roomEl.querySelector('[data-field="room_name"]').textContent = roomData.room_name;
                    roomEl.querySelector('[name="is_sheer"]').checked = roomData.is_sheer;
                    roomEl.querySelector('[name="is_deco"]').checked = roomData.is_deco;
                    roomEl.querySelector('[name="is_wallpaper"]').checked = roomData.is_wallpaper;
                    roomEl.querySelector('[name="sheer_price"]').value = roomData.sheer_price;
                    roomEl.querySelector('[name="deco_price_per_point"]').value = roomData.deco_price_per_point;
                    roomEl.querySelector('[name="deco_points"]').value = roomData.deco_points;
                    roomEl.querySelector('[name="wallpaper_height_m"]').value = roomData.wallpaper_height_m;
                    roomEl.querySelector('[name="wallpaper_price_roll"]').value = roomData.wallpaper_price_roll;
                    roomEl.querySelector('[name="height_m"]').value = roomData.height_m;
                    roomEl.querySelector('[name="fabric_price"]').value = roomData.fabric_price;
                    roomEl.querySelector('[name="style"]').value = roomData.style;
                    
                    const wallsContainer = roomEl.querySelector('[data-walls-container]');
                    wallsContainer.innerHTML = '';
                    if (roomData.wall_widths) {
                        roomData.wall_widths.forEach(width => {
                            const wallTpl = document.querySelector('#wallTpl').content.cloneNode(true);
                            wallTpl.querySelector('[name="wall_width_m"]').value = width;
                            wallsContainer.appendChild(wallTpl);
                        });
                    }

                    const setsContainer = roomEl.querySelector('.curtain-sets');
                    setsContainer.innerHTML = '';
                    if (roomData.curtain_sets) {
                        roomData.curtain_sets.forEach(set => {
                            const setTpl = document.querySelector('#setTpl').content.cloneNode(true);
                            const setEl = setTpl.querySelector('.curtain-set');
                            setEl.querySelector('[name="width_m"]').value = set.width_m;
                            setEl.querySelector('[name="curtain_points"]').value = set.curtain_points;
                            setEl.querySelector('[name="fabric_variant"]').value = set.fabric_variant;
                            if (set.is_suspended) {
                                setEl.classList.add('suspended');
                            }
                            setsContainer.appendChild(setTpl);
                        });
                    }
                    
                    document.querySelector(SELECTORS.rooms).appendChild(clone);
                    calculate(roomEl);
                });
                showToast('นำเข้าข้อมูลสำเร็จแล้ว');
            } catch (error) {
                console.error('Failed to parse JSON:', error);
                showToast('ไฟล์ JSON ไม่ถูกต้อง');
            }
        };
        reader.readAsText(file);
    }

    function handleFileImport() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/json';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                importJSON(file);
            }
        };
        fileInput.click();
    }

    // Event Listeners
    roomsEl.addEventListener('input', (e) => {
        const roomEl = e.target.closest('.room');
        if (roomEl) {
            calculate(roomEl);
        }
    });

    roomsEl.addEventListener('click', (e) => {
        const action = e.target.getAttribute('data-act');
        const target = e.target.closest('[data-act]');
        if (!action) return;

        const actions = {
            'add-set': () => addSet(e.target.closest('.room')),
            'add-deco': () => addDeco(e.target.closest('.room')),
            'add-wallpaper': () => addWallpaper(e.target.closest('.room')),
            'del-room': () => delRoom(e.target.closest('.room')),
            'del-set': () => delSet(target),
            'suspend-set': () => toggleSuspend(target),
            'eco-set': () => eco(target),
            'clear-deco': () => clearDeco(target),
            'del-deco': () => delDeco(target),
            'toggle-set-suspend': () => toggleSuspend(target),
            'toggle-deco-suspend': () => toggleSuspend(target),
            'toggle-wallpaper-suspend': () => toggleSuspend(target),
            'clear-wallpaper': () => clearWallpaper(target),
            'del-wallpaper': () => delWallpaper(target),
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
        // showToast('ข้อมูลพร้อมส่ง!'); // For testing without webhook
    });

    document.querySelector('#addBtn').addEventListener('click', addRoom);
    document.querySelector('#resetBtn').addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('ยืนยันการล้างข้อมูลทั้งหมด?')) {
            localStorage.removeItem(STORAGE_KEY);
            document.querySelector(SELECTORS.rooms).innerHTML = '';
            roomCounter = 0;
            addRoom();
            showToast('ล้างข้อมูลเรียบร้อยแล้ว');
        }
    });
    document.querySelector('#lockBtn').addEventListener('click', (e) => {
        e.preventDefault();
        locked = !locked;
        const icon = e.target.querySelector('.material-symbols-outlined');
        const actionText = e.target.textContent;
        if (locked) {
            document.querySelectorAll('input, select, button').forEach(el => {
                if (el.id !== 'lockBtn' && el.id !== 'aboutBtn') {
                    el.setAttribute('disabled', 'disabled');
                }
            });
            icon.textContent = 'lock';
            e.target.textContent = 'Unlock All';
        } else {
            document.querySelectorAll('input, select, button').forEach(el => el.removeAttribute('disabled'));
            icon.textContent = 'lock_open';
            e.target.textContent = 'Lock All';
        }
        showToast(`ข้อมูลถูก${locked ? 'ล็อค' : 'ปลดล็อค'}แล้ว`);
    });
    document.querySelector('#exportBtn').addEventListener('click', exportJSON);
    document.querySelector('#shareBtn').addEventListener('click', shareLink);
    document.querySelector('#importBtn').addEventListener('click', handleFileImport);
})();