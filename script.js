class MarntharaApp {
    constructor() {
        this.WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
        this.STORAGE_KEY = "marnthara.input.v3";
        this.PRICING = {
            fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
            sheer: [1000, 1100, 1200, 1300, 1400, 1500],
            style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
            height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
        };
        this.CALC = {
            SQM_TO_SQYD: 1.19599,
            WALLPAPER_SQM_PER_ROLL: 5,
            fabricYardage: (style, width) => {
                if (width <= 0) return 0;
                if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
                if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
                return 0;
            },
            stylePlus: s => this.PRICING.style_surcharge[s] ?? 0,
            heightPlus: h => {
                const sorted = [...this.PRICING.height].sort((a, b) => b.threshold - a.threshold);
                for (const entry of sorted) {
                    if (h > entry.threshold) return entry.add_per_m;
                }
                return 0;
            }
        };
        this.SELECTORS = {
            orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
            payloadInput: '#payload', copyJsonBtn: '#copyJsonBtn', clearAllBtn: '#clearAllBtn',
            lockBtn: '#lockBtn', addRoomHeaderBtn: '#addRoomHeaderBtn', submitBtn: '#submitBtn',
            grandTotal: '#grandTotal', setCount: '#setCount', grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric',
            modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
            room: '.room', set: '.set', setsContainer: '[data-sets]',
            decorationsContainer: '[data-decorations]', decoItem: '.deco-item',
            wallpapersContainer: '[data-wallpapers]', wallpaperItem: '.wallpaper-item', wallsContainer: '[data-walls-container]',
            sheerWrap: '[data-sheer-wrap]',
            setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
            toastContainer: '#toast-container',
            grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
            grandWallpaper: '#grandWallpaper',
            copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
            copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
            grandFabricWrap: '#grandFabricWrap', grandSheerFabricWrap: '#grandSheerFabricWrap', grandOpaqueTrackWrap: '#grandOpaqueTrackWrap', grandSheerTrackWrap: '#grandSheerTrackWrap', grandWallpaperWrap: '#grandWallpaperWrap'
        };

        this.state = this.getInitialState();
        this.loadState();
        this.initEventListeners();
        this.render();
    }

    getInitialState() {
        return {
            customer: { name: '', address: '', phone: '' },
            rooms: [],
            isLocked: false,
        };
    }

    // --- Core Logic ---
    render() {
        const roomsEl = document.querySelector(this.SELECTORS.roomsContainer);
        roomsEl.innerHTML = '';
        this.state.rooms.forEach((room, roomIndex) => {
            const frag = document.querySelector(this.SELECTORS.roomTpl).content.cloneNode(true);
            const roomEl = frag.querySelector(this.SELECTORS.room);
            roomEl.dataset.index = roomIndex;
            
            // Set input values and attributes from state
            const roomNameInput = roomEl.querySelector('input[name="room_name"]');
            if (roomNameInput) roomNameInput.value = room.name || '';
            roomEl.querySelector('select[name="room_price_per_m"]').innerHTML = this.populatePriceOptions(this.PRICING.fabric, room.price_per_m_raw);
            roomEl.querySelector('select[name="room_style"]').value = room.style || '';

            // Render sets, decos, wallpapers
            room.sets.forEach(set => this.renderSet(roomEl, set));
            room.decorations.forEach(deco => this.renderDeco(roomEl, deco));
            room.wallpapers.forEach(wallpaper => this.renderWallpaper(roomEl, wallpaper));
            
            roomsEl.appendChild(roomEl);
        });

        // Renumber and recalculate all
        this.renumber();
        this.recalculateAll();

        // Update customer info
        document.querySelector('input[name="customer_name"]').value = this.state.customer.name;
        document.querySelector('input[name="customer_address"]').value = this.state.customer.address;
        document.querySelector('input[name="customer_phone"]').value = this.state.customer.phone;
        
        // Update lock state
        this.updateLockState();
        this.saveState();
    }

    renderSet(roomEl, set) {
        const setsWrap = roomEl.querySelector(this.SELECTORS.setsContainer);
        const frag = document.querySelector(this.SELECTORS.setTpl).content.cloneNode(true);
        const setEl = frag.querySelector(this.SELECTORS.set);
        setEl.dataset.suspended = set.is_suspended;
        setEl.classList.toggle('is-suspended', set.is_suspended);
        if (set.is_suspended) setEl.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
        
        setEl.querySelector('input[name="width_m"]').value = set.width_m ?? '';
        setEl.querySelector('input[name="height_m"]').value = set.height_m ?? '';
        setEl.querySelector('select[name="fabric_variant"]').value = set.fabric_variant || 'ทึบ';
        setEl.querySelector('select[name="open_type"]').value = set.open_type || '';
        setEl.querySelector('select[name="sheer_price_per_m"]').innerHTML = this.populatePriceOptions(this.PRICING.sheer, set.sheer_price_per_m);

        this.toggleSetFabricUI(setEl);
        setsWrap.appendChild(frag);
    }
    
    renderDeco(roomEl, deco) {
        const decoWrap = roomEl.querySelector(this.SELECTORS.decorationsContainer);
        const frag = document.querySelector(this.SELECTORS.decoTpl).content.cloneNode(true);
        const decoEl = frag.querySelector(this.SELECTORS.decoItem);
        decoEl.dataset.suspended = deco.is_suspended;
        decoEl.classList.toggle('is-suspended', deco.is_suspended);
        if (deco.is_suspended) decoEl.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';

        decoEl.querySelector('[name="deco_type"]').value = deco.type || "";
        decoEl.querySelector('[name="deco_width_m"]').value = deco.width_m ?? "";
        decoEl.querySelector('[name="deco_height_m"]').value = deco.height_m ?? "";
        decoEl.querySelector('[name="deco_price_sqyd"]').value = this.fmt(deco.price_sqyd, 0, true) ?? "";
        decoWrap.appendChild(frag);
    }

    renderWallpaper(roomEl, wallpaper) {
        const wallpaperWrap = roomEl.querySelector(this.SELECTORS.wallpapersContainer);
        const frag = document.querySelector(this.SELECTORS.wallpaperTpl).content.cloneNode(true);
        const wallpaperEl = frag.querySelector(this.SELECTORS.wallpaperItem);
        wallpaperEl.dataset.suspended = wallpaper.is_suspended;
        wallpaperEl.classList.toggle('is-suspended', wallpaper.is_suspended);
        if (wallpaper.is_suspended) wallpaperEl.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';

        wallpaperEl.querySelector('[name="wallpaper_height_m"]').value = wallpaper.height_m ?? "";
        wallpaperEl.querySelector('[name="wallpaper_price_roll"]').value = this.fmt(wallpaper.price_per_roll, 0, true) ?? "";
        const wallsContainer = wallpaperEl.querySelector(this.SELECTORS.wallsContainer);
        wallpaper.widths.forEach(width => {
            const wallFrag = document.querySelector(this.SELECTORS.wallTpl).content.cloneNode(true);
            wallFrag.querySelector('input[name="wall_width_m"]').value = width;
            wallsContainer.appendChild(wallFrag);
        });
        wallpaperWrap.appendChild(frag);
    }

    recalculateAll() {
        let grandTotal = 0, grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0, grandWallpaperRolls = 0;
        let setCountTotal = 0, setCountSets = 0, setCountDeco = 0;

        this.state.rooms.forEach((room, roomIndex) => {
            let roomSum = 0;
            const roomEl = document.querySelector(`${this.SELECTORS.room}[data-index="${roomIndex}"]`);

            room.sets.forEach((set, setIndex) => {
                const setEl = roomEl.querySelectorAll(this.SELECTORS.set)[setIndex];
                if (set.is_suspended) {
                    setEl.querySelector('.summary').textContent = 'ระงับการใช้งาน';
                    return;
                }
                const { opaquePrice, sheerPrice, opaqueYards, sheerYards, opaqueTrack, sheerTrack } = this.calculateSet(room, set);
                setEl.querySelector('[data-set-price-total]').textContent = this.fmt(opaquePrice + sheerPrice, 0, true);
                setEl.querySelector('[data-set-price-opaque]').textContent = this.fmt(opaquePrice, 0, true);
                setEl.querySelector('[data-set-price-sheer]').textContent = this.fmt(sheerPrice, 0, true);
                setEl.querySelector('[data-set-yardage-opaque]').textContent = this.fmt(opaqueYards, 2);
                setEl.querySelector('[data-set-yardage-sheer]').textContent = this.fmt(sheerYards, 2);
                setEl.querySelector('[data-set-opaque-track]').textContent = this.fmt(opaqueTrack, 2);
                setEl.querySelector('[data-set-sheer-track]').textContent = this.fmt(sheerTrack, 2);

                roomSum += opaquePrice + sheerPrice;
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
            });
            
            room.decorations.forEach((deco, decoIndex) => {
                const decoEl = roomEl.querySelectorAll(this.SELECTORS.decoItem)[decoIndex];
                if (deco.is_suspended) {
                    decoEl.querySelector('.summary').textContent = 'ระงับการใช้งาน';
                    return;
                }
                const { price } = this.calculateDeco(deco);
                decoEl.querySelector('[data-deco-price]').textContent = this.fmt(price, 0, true);
                roomSum += price;
            });
            
            room.wallpapers.forEach((wallpaper, wallpaperIndex) => {
                const wallpaperEl = roomEl.querySelectorAll(this.SELECTORS.wallpaperItem)[wallpaperIndex];
                if (wallpaper.is_suspended) {
                    wallpaperEl.querySelector('.summary').textContent = 'ระงับการใช้งาน';
                    return;
                }
                const { price, sqm, rolls } = this.calculateWallpaper(wallpaper);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(1)').textContent = this.fmt(price, 0, true);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(2)').textContent = this.fmt(sqm, 2);
                wallpaperEl.querySelector('[data-wallpaper-summary] .price:nth-of-type(3)').textContent = this.fmt(rolls, 0);
                roomSum += price;
                grandWallpaperRolls += rolls;
            });

            roomEl.querySelector('[data-room-brief] .price').textContent = this.fmt(roomSum, 0, true);
            roomEl.querySelector('[data-room-brief] .num:nth-of-type(1)').textContent = room.sets.length + room.decorations.length + room.wallpapers.length;
            roomEl.querySelector('[data-room-brief] .num:nth-of-type(2)').textContent = room.sets.length;
            grandTotal += roomSum;
            setCountTotal += room.sets.length + room.decorations.length + room.wallpapers.length;
            setCountSets += room.sets.length;
            setCountDeco += room.decorations.length;
        });

        document.querySelector(this.SELECTORS.grandTotal).textContent = this.fmt(grandTotal, 0, true);
        document.querySelector(this.SELECTORS.setCount).textContent = setCountTotal;
        document.querySelector(this.SELECTORS.setCountSets).textContent = setCountSets;
        document.querySelector(this.SELECTORS.setCountDeco).textContent = setCountDeco;

        document.querySelector(this.SELECTORS.grandFabric).textContent = this.fmt(grandOpaqueYards, 2) + " หลา";
        document.querySelector(this.SELECTORS.grandSheerFabric).textContent = this.fmt(grandSheerYards, 2) + " หลา";
        document.querySelector(this.SELECTORS.grandOpaqueTrack).textContent = this.fmt(grandOpaqueTrack, 2) + " ม.";
        document.querySelector(this.SELECTORS.grandSheerTrack).textContent = this.fmt(grandSheerTrack, 2) + " ม.";
        document.querySelector(this.SELECTORS.grandWallpaper).textContent = this.fmt(grandWallpaperRolls, 0) + " ม้วน";
    }

    // Pure calculation functions
    calculateSet(room, set) {
        let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
        const w = this.toNum(set.width_m), h = this.toNum(set.height_m);
        const baseRaw = this.toNum(room.price_per_m_raw);
        const style = room.style;
        const hPlus = this.CALC.heightPlus(h);
        const sPlus = this.CALC.stylePlus(style);
        const variant = set.fabric_variant;
        
        if (w > 0 && h > 0) {
            if (variant === "ทึบ" || variant === "ทึบ&โปร่ง") {
                opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                opaqueYards = this.CALC.fabricYardage(style, w);
                opaqueTrack = w;
            }
            if (variant === "โปร่ง" || variant === "ทึบ&โปร่ง") {
                const sheerBase = this.toNum(set.sheer_price_per_m);
                sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                sheerYards = this.CALC.fabricYardage(style, w);
                sheerTrack = w;
            }
        }
        return { opaquePrice, sheerPrice, opaqueYards, sheerYards, opaqueTrack, sheerTrack };
    }
    
    calculateDeco(deco) {
        const w = this.toNum(deco.width_m), h = this.toNum(deco.height_m), price_sqyd = this.toNum(deco.price_sqyd);
        const price = Math.round(w * h * this.CALC.SQM_TO_SQYD * price_sqyd);
        return { price };
    }

    calculateWallpaper(wallpaper) {
        const h = this.toNum(wallpaper.height_m), price_roll = this.toNum(wallpaper.price_per_roll);
        const total_width = wallpaper.widths.reduce((sum, width) => sum + this.toNum(width), 0);
        const sqm = total_width * h;
        const rolls = Math.ceil(sqm / this.CALC.WALLPAPER_SQM_PER_ROLL);
        const price = rolls * price_roll;
        return { price, sqm, rolls };
    }

    // --- State Mutation & Helpers ---
    addRoom() {
        if (this.state.isLocked) return;
        const newRoom = {
            name: '',
            price_per_m_raw: '',
            style: '',
            sets: [{ width_m: '', height_m: '', fabric_variant: 'ทึบ', open_type: '', sheer_price_per_m: '', is_suspended: false }],
            decorations: [],
            wallpapers: []
        };
        this.state.rooms.push(newRoom);
        this.render();
        this.showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }
    
    deleteRoom(roomIndex) {
        this.state.rooms.splice(roomIndex, 1);
        this.render();
        this.showToast('ลบห้องแล้ว', 'success');
    }

    addSet(roomIndex) {
        if (this.state.isLocked) return;
        const newSet = { width_m: '', height_m: '', fabric_variant: 'ทึบ', open_type: '', sheer_price_per_m: '', is_suspended: false };
        this.state.rooms[roomIndex].sets.push(newSet);
        this.render();
        this.showToast('เพิ่มจุดผ้าม่านแล้ว', 'success');
    }
    
    deleteSet(roomIndex, setIndex) {
        this.state.rooms[roomIndex].sets.splice(setIndex, 1);
        this.render();
        this.showToast('ลบจุดผ้าม่านแล้ว', 'success');
    }

    addDeco(roomIndex) {
        if (this.state.isLocked) return;
        const newDeco = { type: '', width_m: '', height_m: '', price_sqyd: '', is_suspended: false };
        this.state.rooms[roomIndex].decorations.push(newDeco);
        this.render();
        this.showToast('เพิ่มรายการตกแต่งแล้ว', 'success');
    }

    deleteDeco(roomIndex, decoIndex) {
        this.state.rooms[roomIndex].decorations.splice(decoIndex, 1);
        this.render();
        this.showToast('ลบรายการตกแต่งแล้ว', 'success');
    }

    addWallpaper(roomIndex) {
        if (this.state.isLocked) return;
        const newWallpaper = { height_m: '', price_per_roll: '', widths: [''], is_suspended: false };
        this.state.rooms[roomIndex].wallpapers.push(newWallpaper);
        this.render();
        this.showToast('เพิ่มรายการวอลเปเปอร์แล้ว', 'success');
    }

    deleteWallpaper(roomIndex, wallpaperIndex) {
        this.state.rooms[roomIndex].wallpapers.splice(wallpaperIndex, 1);
        this.render();
        this.showToast('ลบรายการวอลเปเปอร์แล้ว', 'success');
    }

    addWall(roomIndex, wallpaperIndex) {
        if (this.state.isLocked) return;
        this.state.rooms[roomIndex].wallpapers[wallpaperIndex].widths.push('');
        this.render();
    }

    deleteWall(roomIndex, wallpaperIndex, wallIndex) {
        this.state.rooms[roomIndex].wallpapers[wallpaperIndex].widths.splice(wallIndex, 1);
        this.render();
    }

    toggleSuspend(roomIndex, type, itemIndex) {
        let item;
        if (type === 'set') item = this.state.rooms[roomIndex].sets[itemIndex];
        else if (type === 'deco') item = this.state.rooms[roomIndex].decorations[itemIndex];
        else if (type === 'wallpaper') item = this.state.rooms[roomIndex].wallpapers[itemIndex];

        item.is_suspended = !item.is_suspended;
        this.render();
        this.showToast(`รายการถูก${item.is_suspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    }

    clearAllData() {
        this.state = this.getInitialState();
        this.state.rooms.push({
            name: '',
            price_per_m_raw: '',
            style: '',
            sets: [{ width_m: '', height_m: '', fabric_variant: 'ทึบ', open_type: '', sheer_price_per_m: '', is_suspended: false }],
            decorations: [],
            wallpapers: []
        });
        this.render();
        this.showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
    }

    toggleLock() {
        this.state.isLocked = !this.state.isLocked;
        this.render();
        this.showToast(this.state.isLocked ? 'ฟอร์มถูกล็อคแล้ว 🔒' : 'ฟอร์มถูกปลดล็อคแล้ว 🔓', 'info');
    }

    updateLockState() {
        document.querySelectorAll('input, select, button').forEach(el => {
            const isDelBtn = el.dataset.act && el.dataset.act.startsWith('del');
            const isAddBtn = el.dataset.act && el.dataset.act.startsWith('add');
            if (isDelBtn || isAddBtn) {
                el.disabled = this.state.isLocked;
            }
        });
        document.querySelector('#lockBtn .lock-text').textContent = this.state.isLocked ? 'ปลดล็อค' : 'ล็อค';
    }

    // --- Event Handlers & Data Persistence ---
    initEventListeners() {
        document.querySelector(this.SELECTORS.addRoomHeaderBtn).addEventListener('click', () => this.addRoom());
        document.querySelector(this.SELECTORS.clearAllBtn).addEventListener('click', () => this.showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้').then(res => res && this.clearAllData()));
        document.querySelector(this.SELECTORS.lockBtn).addEventListener('click', () => this.toggleLock());
        document.querySelector(this.SELECTORS.copyTextBtn).addEventListener('click', () => this.copyText());
        document.querySelector(this.SELECTORS.copyJsonBtn).addEventListener('click', () => this.copyJson());

        // Use event delegation for dynamic elements
        document.addEventListener('input', this.debounce(e => {
            const target = e.target;
            const roomEl = target.closest(this.SELECTORS.room);
            const roomIndex = roomEl ? Number(roomEl.dataset.index) : -1;
            const setEl = target.closest(this.SELECTORS.set);
            const decoEl = target.closest(this.SELECTORS.decoItem);
            const wallpaperEl = target.closest(this.SELECTORS.wallpaperItem);
            const wallEl = target.closest('.wall-input-row');

            if (target.name === 'customer_name' || target.name === 'customer_address' || target.name === 'customer_phone') {
                this.state.customer[target.name.replace('customer_', '')] = target.value;
            } else if (roomIndex !== -1) {
                if (target.name === 'room_name') {
                    this.state.rooms[roomIndex].name = target.value;
                } else if (target.name === 'room_price_per_m') {
                    this.state.rooms[roomIndex].price_per_m_raw = target.value;
                } else if (target.name === 'room_style') {
                    this.state.rooms[roomIndex].style = target.value;
                } else if (setEl) {
                    const setIndex = Array.from(roomEl.querySelectorAll(this.SELECTORS.set)).indexOf(setEl);
                    this.state.rooms[roomIndex].sets[setIndex][target.name.replace('_m', '')] = target.value;
                } else if (decoEl) {
                    const decoIndex = Array.from(roomEl.querySelectorAll(this.SELECTORS.decoItem)).indexOf(decoEl);
                    this.state.rooms[roomIndex].decorations[decoIndex][target.name.replace('deco_', '')] = target.value;
                } else if (wallpaperEl) {
                    const wallpaperIndex = Array.from(roomEl.querySelectorAll(this.SELECTORS.wallpaperItem)).indexOf(wallpaperEl);
                    if (target.name === 'wallpaper_height_m') {
                        this.state.rooms[roomIndex].wallpapers[wallpaperIndex].height_m = target.value;
                    } else if (target.name === 'wallpaper_price_roll') {
                        this.state.rooms[roomIndex].wallpapers[wallpaperIndex].price_per_roll = target.value;
                    } else if (wallEl && target.name === 'wall_width_m') {
                        const wallIndex = Array.from(wallpaperEl.querySelectorAll('.wall-input-row')).indexOf(wallEl);
                        this.state.rooms[roomIndex].wallpapers[wallpaperIndex].widths[wallIndex] = target.value;
                    }
                }
            }
            this.render();
        }, 120));

        document.addEventListener('click', async e => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const action = btn.dataset.act;
            const roomEl = btn.closest(this.SELECTORS.room);
            const roomIndex = roomEl ? Number(roomEl.dataset.index) : -1;
            
            if (action === 'del-room' && await this.showConfirmation('ลบห้อง', 'ยืนยันการลบห้องนี้?')) {
                this.deleteRoom(roomIndex);
            } else if (action === 'add-set') {
                this.addSet(roomIndex);
            } else if (action === 'del-set' && await this.showConfirmation('ลบจุด', 'ยืนยันการลบจุดติดตั้งนี้?')) {
                const setIndex = Array.from(roomEl.querySelectorAll(this.SELECTORS.set)).indexOf(btn.closest(this.SELECTORS.set));
                this.deleteSet(roomIndex, setIndex);
            } else if (action === 'add-deco') {
                this.addDeco(roomIndex);
            } else if (action === 'del-deco' && await this.showConfirmation('ลบรายการ', 'ยืนยันการลบรายการตกแต่งนี้?')) {
                const decoIndex = Array.from(roomEl.querySelectorAll(this.SELECTORS.decoItem)).indexOf(btn.closest(this.SELECTORS.decoItem));
                this.deleteDeco(roomIndex, decoIndex);
            } else if (action === 'add-wallpaper') {
                this.addWallpaper(roomIndex);
            } else if (action === 'del-wallpaper' && await this.showConfirmation('ลบรายการ', 'ยืนยันการลบรายการวอลเปเปอร์นี้?')) {
                const wallpaperIndex = Array.from(roomEl.querySelectorAll(this.SELECTORS.wallpaperItem)).indexOf(btn.closest(this.SELECTORS.wallpaperItem));
                this.deleteWallpaper(roomIndex, wallpaperIndex);
            } else if (action === 'add-wall') {
                const wallpaperEl = btn.closest(this.SELECTORS.wallpaperItem);
                const wallpaperIndex = Array.from(roomEl.querySelectorAll(this.SELECTORS.wallpaperItem)).indexOf(wallpaperEl);
                this.addWall(roomIndex, wallpaperIndex);
            } else if (action === 'del-wall') {
                const wallpaperEl = btn.closest(this.SELECTORS.wallpaperItem);
                const wallpaperIndex = Array.from(roomEl.querySelectorAll(this.SELECTORS.wallpaperItem)).indexOf(wallpaperEl);
                const wallIndex = Array.from(wallpaperEl.querySelectorAll('.wall-input-row')).indexOf(btn.closest('.wall-input-row'));
                this.deleteWall(roomIndex, wallpaperIndex, wallIndex);
            } else if (action === 'toggle-suspend') {
                const itemEl = btn.closest('.set, .deco-item, .wallpaper-item');
                let type, itemIndex;
                if (itemEl.classList.contains('set')) {
                    type = 'set';
                    itemIndex = Array.from(roomEl.querySelectorAll(this.SELECTORS.set)).indexOf(itemEl);
                } else if (itemEl.classList.contains('deco-item')) {
                    type = 'deco';
                    itemIndex = Array.from(roomEl.querySelectorAll(this.SELECTORS.decoItem)).indexOf(itemEl);
                } else if (itemEl.classList.contains('wallpaper-item')) {
                    type = 'wallpaper';
                    itemIndex = Array.from(roomEl.querySelectorAll(this.SELECTORS.wallpaperItem)).indexOf(itemEl);
                }
                this.toggleSuspend(roomIndex, type, itemIndex);
            }
        });
    }

    saveState() {
        const payload = this.buildPayload();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
    }

    loadState() {
        const storedData = localStorage.getItem(this.STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                this.state.customer = {
                    name: payload.customer_name ?? '',
                    address: payload.customer_address ?? '',
                    phone: payload.customer_phone ?? ''
                };
                this.state.rooms = payload.rooms || [];
                this.state.isLocked = payload.isLocked ?? false;
            } catch (err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(this.STORAGE_KEY);
            }
        }
        if (this.state.rooms.length === 0) {
            this.addRoom();
        }
    }

    buildPayload() {
        // This function will be called to create the payload for saving or submission
        return {
            customer_name: this.state.customer.name,
            customer_address: this.state.customer.address,
            customer_phone: this.state.customer.phone,
            isLocked: this.state.isLocked,
            rooms: this.state.rooms.map(room => ({
                room_name: room.name,
                price_per_m_raw: this.toNum(room.price_per_m_raw),
                style: room.style,
                sets: room.sets.map(set => ({
                    ...set,
                    width_m: this.toNum(set.width_m),
                    height_m: this.toNum(set.height_m),
                    sheer_price_per_m: this.toNum(set.sheer_price_per_m),
                })),
                decorations: room.decorations.map(deco => ({
                    ...deco,
                    width_m: this.toNum(deco.width_m),
                    height_m: this.toNum(deco.height_m),
                    price_sqyd: this.toNum(deco.price_sqyd),
                })),
                wallpapers: room.wallpapers.map(wallpaper => ({
                    ...wallpaper,
                    height_m: this.toNum(wallpaper.height_m),
                    price_per_roll: this.toNum(wallpaper.price_per_roll),
                    widths: wallpaper.widths.map(this.toNum),
                }))
            }))
        };
    }

    // --- Utility Functions (unchanged logic) ---
    toNum(v) { if (typeof v === 'string') v = v.replace(/,/g, ''); return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0; }
    clamp01(v) { return Math.max(0, this.toNum(v)); }
    fmt(n, fixed = 2, asCurrency = false) {
        if (!Number.isFinite(n)) return "0";
        const options = asCurrency
            ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
            : { minimumFractionDigits: fixed, maximumFractionDigits: fixed };
        return n.toLocaleString("th-TH", options);
    }
    debounce(fn, ms = 120) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
    populatePriceOptions(prices, selectedValue) {
        let html = `<option value="" hidden>เลือก</option>`;
        prices.forEach(p => {
            const isSelected = String(p) === String(selectedValue);
            html += `<option value="${p}" ${isSelected ? 'selected' : ''}>${p.toLocaleString("th-TH")}</option>`;
        });
        return html;
    }
    renumber() {
        const rooms = document.querySelectorAll(this.SELECTORS.room);
        rooms.forEach((room, rIdx) => {
            const input = room.querySelector('input[name="room_name"]');
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            
            const allItems = room.querySelectorAll(`${this.SELECTORS.set}, ${this.SELECTORS.decoItem}, ${this.SELECTORS.wallpaperItem}`);
            allItems.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = allItems.length > 1 ? `${iIdx + 1}/${allItems.length}` : `${iIdx + 1}`;
            });
        });
    }
    toggleSetFabricUI(setEl) {
        const variant = setEl.querySelector('select[name="fabric_variant"]').value;
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
        setEl.querySelector('[data-sheer-wrap]').classList.toggle("hidden", !hasSheer);
        setEl.querySelector('[data-set-options-row]').classList.toggle("three-col", hasSheer);
        setEl.querySelector("[data-sheer-price-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-yardage-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-track-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-opaque-price-label]").classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-yardage-label]").classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-track-label]").classList.toggle("hidden", !hasOpaque);
    }
    showToast(message, type = 'default') {
        const container = document.querySelector(this.SELECTORS.toastContainer);
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        if (type === 'success') toast.classList.add('toast-success');
        else if (type === 'warning') toast.classList.add('toast-warning');
        else if (type === 'error') toast.classList.add('toast-error');
        else { toast.style.backgroundColor = 'var(--card-bg)'; toast.style.color = 'var(--fg)'; }
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => { toast.classList.remove('show'); toast.addEventListener('transitionend', () => toast.remove()); }, 3000);
    }
    showConfirmation(title, body) {
        return new Promise((resolve) => {
            const modalEl = document.querySelector(this.SELECTORS.modal);
            modalEl.querySelector(this.SELECTORS.modalTitle).textContent = title;
            modalEl.querySelector(this.SELECTORS.modalBody).textContent = body;
            modalEl.classList.add('visible');
            const cleanup = (result) => {
                modalEl.classList.remove('visible');
                modalEl.querySelector(this.SELECTORS.modalConfirm).onclick = null;
                modalEl.querySelector(this.SELECTORS.modalCancel).onclick = null;
                resolve(result);
            };
            modalEl.querySelector(this.SELECTORS.modalConfirm).onclick = () => cleanup(true);
            modalEl.querySelector(this.SELECTORS.modalCancel).onclick = () => cleanup(false);
        });
    }
    async showCopyOptionsModal() {
        return new Promise((resolve) => {
            const modal = document.querySelector(this.SELECTORS.copyOptionsModal);
            modal.classList.add('visible');
            const confirmBtn = document.querySelector(this.SELECTORS.copyOptionsConfirm);
            const cancelBtn = document.querySelector(this.SELECTORS.copyOptionsCancel);
            
            const cleanup = (result) => {
                modal.classList.remove('visible');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(result);
            };
            
            confirmBtn.onclick = () => {
                const options = {
                    customer: document.querySelector(this.SELECTORS.copyCustomerInfo).checked,
                    details: document.querySelector(this.SELECTORS.copyRoomDetails).checked,
                    summary: document.querySelector(this.SELECTORS.copySummary).checked,
                };
                cleanup(options);
            };
            cancelBtn.onclick = () => cleanup(false);
        });
    }
    async copyJson() {
        const payload = this.buildPayload();
        try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            this.showToast('คัดลอก JSON แล้ว', 'success');
        } catch (err) {
            console.error('Failed to copy JSON: ', err);
            this.showToast('ไม่สามารถคัดลอก JSON ได้', 'error');
        }
    }
    async copyText() {
        const options = await this.showCopyOptionsModal();
        if (!options) return;
        let text = ``;
        const payload = this.buildPayload();
        if (options.customer) {
            text += `ชื่อลูกค้า: ${payload.customer_name}\nที่อยู่: ${payload.customer_address}\nเบอร์โทร: ${payload.customer_phone}\n\n`;
        }
        if (options.details) {
            payload.rooms.forEach((room) => {
                const roomIndex = this.state.rooms.findIndex(r => r.name === room.room_name);
                const roomEl = document.querySelector(`${this.SELECTORS.room}[data-index="${roomIndex}"]`);
                const roomPrice = roomEl.querySelector('[data-room-brief] .price').textContent;
                const roomName = room.room_name || `ห้อง ${String(roomIndex + 1).padStart(2, "0")}`;
                text += `ห้อง: ${roomName} (${roomPrice} บาท)\n`;
                text += `  ราคาผ้าทึบ: ${this.fmt(room.price_per_m_raw, 0, true)} บาท/ม., สไตล์: ${room.style}\n`;
                room.sets.forEach((set, setIndex) => {
                    if (set.is_suspended) return;
                    const { opaquePrice, sheerPrice } = this.calculateSet(room, set);
                    const totalSetPrice = opaquePrice + sheerPrice;
                    const setNum = setIndex + 1;
                    text += `  - จุดที่ ${setNum}: W ${this.fmt(set.width_m, 2)} ม. x H ${this.fmt(set.height_m, 2)} ม. (${this.fmt(totalSetPrice, 0, true)} บ.)\n`;
                });
                room.decorations.forEach((deco, decoIndex) => {
                    if (deco.is_suspended) return;
                    const { price } = this.calculateDeco(deco);
                    const decoNum = decoIndex + 1;
                    text += `  - ตกแต่งที่ ${decoNum}: ${deco.type || 'ไม่ระบุ'} W ${this.fmt(deco.width_m, 2)} ม. x H ${this.fmt(deco.height_m, 2)} ม. (${this.fmt(price, 0, true)} บ.)\n`;
                });
                room.wallpapers.forEach((wallpaper, wallpaperIndex) => {
                    if (wallpaper.is_suspended) return;
                    const { price, sqm, rolls } = this.calculateWallpaper(wallpaper);
                    const wallpaperNum = wallpaperIndex + 1;
                    text += `  - วอลเปเปอร์ที่ ${wallpaperNum}: H ${this.fmt(wallpaper.height_m, 2)} ม. ${wallpaper.widths.map(w => `W ${this.fmt(w, 2)} ม.`).join(', ')} (พื้นที่ ${this.fmt(sqm, 2)} ตร.ม., ใช้ ${this.fmt(rolls, 0)} ม้วน, ราคา ${this.fmt(price, 0, true)} บ.)\n`;
                });
                text += '\n';
            });
        }
        if (options.summary) {
            const grandTotalEl = document.querySelector(this.SELECTORS.grandTotal);
            const setCountEl = document.querySelector(this.SELECTORS.setCount);
            const grandOpaqueYardsEl = document.querySelector(this.SELECTORS.grandFabric);
            const grandSheerYardsEl = document.querySelector(this.SELECTORS.grandSheerFabric);
            const grandOpaqueTrackEl = document.querySelector(this.SELECTORS.grandOpaqueTrack);
            const grandSheerTrackEl = document.querySelector(this.SELECTORS.grandSheerTrack);
            const grandWallpaperEl = document.querySelector(this.SELECTORS.grandWallpaper);
            text += `--- สรุปยอดรวม ---\n`;
            if (grandTotalEl) text += `ราคารวม: ${grandTotalEl.textContent} บ.\n`;
            if (setCountEl) text += `จำนวนจุด: ${setCountEl.textContent} จุด\n`;
            if (grandOpaqueYardsEl) text += `ผ้าทึบที่ใช้: ${grandOpaqueYardsEl.textContent}\n`;
            if (grandSheerYardsEl) text += `ผ้าโปร่งที่ใช้: ${grandSheerYardsEl.textContent}\n`;
            if (grandOpaqueTrackEl) text += `รางทึบที่ใช้: ${grandOpaqueTrackEl.textContent}\n`;
            if (grandSheerTrackEl) text += `รางโปร่งที่ใช้: ${grandSheerTrackEl.textContent}\n`;
            if (grandWallpaperEl) text += `วอลเปเปอร์ที่ใช้: ${grandWallpaperEl.textContent}\n`;
        }
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('คัดลอกข้อความแล้ว', 'success');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            this.showToast('ไม่สามารถคัดลอกข้อความได้', 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MarntharaApp();
});