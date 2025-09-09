class MarntharaApp {
    constructor() {
        this.APP_VERSION = "input-ui/3.3.0-wallpaper";
        this.WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
        this.STORAGE_KEY = "marnthara.input.v3";
        this.PRICING = {
            fabric: [1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500],
            sheer: [1000, 1100, 1200, 1300, 1400, 1500],
            style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
            height: [{ threshold: 3.2, add_per_m: 300 }, { threshold: 2.8, add_per_m: 200 }, { threshold: 2.5, add_per_m: 150 }],
        };
        this.WALLPAPER = {
            ROLL_WIDTH_M: 0.53,
            ROLL_LENGTH_M: 10,
        };

        this.SELECTORS = {
            orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
            payloadInput: '#payload', copyJsonBtn: '#copyJsonBtn', clearAllBtn: '#clearAllBtn',
            lockBtn: '#lockBtn', addRoomHeaderBtn: '#addRoomHeaderBtn', submitBtn: '#submitBtn',
            grandTotal: '#grandTotal', setCount: '#setCount', grandFabric: '#grandFabric', grandSheerFabric: '#grandSheerFabric',
            modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
            room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
            decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
            wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
            sheerWrap: '[data-sheer-wrap]',
            roomNameInput: 'input[name="room_name"]', roomPricePerM: 'select[name="room_price_per_m"]', roomStyle: 'select[name="room_style"]',
            setCountSets: '#setCountSets', setCountDeco: '#setCountDeco',
            toastContainer: '#toast-container',
            grandOpaqueTrack: '#grandOpaqueTrack', grandSheerTrack: '#grandSheerTrack',
            grandWallpaper: '#grandWallpaper',
            copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
            copyCustomerInfo: '#copyCustomerInfo', copyRoomDetails: '#copyRoomDetails', copySummary: '#copySummary',
            grandFabricWrap: '#grandFabricWrap', grandSheerFabricWrap: '#grandSheerFabricWrap', grandOpaqueTrackWrap: '#grandOpaqueTrackWrap', grandSheerTrackWrap: '#grandSheerTrackWrap', grandWallpaperWrap: '#grandWallpaperWrap'
        };

        this.elements = {};
        Object.keys(this.SELECTORS).forEach(key => {
            this.elements[key] = document.querySelector(this.SELECTORS[key]);
        });
        
        this.isLocked = false;
        this.state = {
            customer_name: "",
            customer_address: "",
            customer_phone: "",
            rooms: [],
        };
        
        this.bindEvents();
        this.loadInitialState();
    }

    // --- Core Logic: State Management & Rendering ---
    updateState(updates, render = true) {
        this.state = { ...this.state, ...updates };
        this.saveData();
        if (render) this.render();
    }
    
    // The single source of truth for UI display
    render() {
        // Render customer info
        this.elements.customer_name_input.value = this.state.customer_name;
        this.elements.customer_address_input.value = this.state.customer_address;
        this.elements.customer_phone_input.value = this.state.customer_phone;

        // Render rooms and their content
        const roomsHtml = this.state.rooms.map((room, roomIndex) => {
            const roomTpl = document.querySelector(this.SELECTORS.roomTpl).content.cloneNode(true);
            const roomEl = roomTpl.querySelector(this.SELECTORS.room);
            roomEl.dataset.index = roomIndex;
            roomEl.querySelector(this.SELECTORS.roomNameInput).value = room.name;
            this.populatePriceOptions(roomEl.querySelector(this.SELECTORS.roomPricePerM), this.PRICING.fabric);
            roomEl.querySelector(this.SELECTORS.roomPricePerM).value = room.price_per_m_raw;
            roomEl.querySelector(this.SELECTORS.roomStyle).value = room.style;

            if (room.sets && room.sets.length > 0) {
                const setsHtml = room.sets.map(set => this.renderSet(set));
                roomEl.querySelector(this.SELECTORS.setsContainer).innerHTML = setsHtml.join('');
            }
            if (room.decorations && room.decorations.length > 0) {
                const decosHtml = room.decorations.map(deco => this.renderDeco(deco));
                roomEl.querySelector(this.SELECTORS.decorationsContainer).innerHTML = decosHtml.join('');
            }
            if (room.wallpapers && room.wallpapers.length > 0) {
                const wallpapersHtml = room.wallpapers.map(wallpaper => this.renderWallpaper(wallpaper));
                roomEl.querySelector(this.SELECTORS.wallpapersContainer).innerHTML = wallpapersHtml.join('');
            }

            const roomSummary = this.calculateRoomSummary(room);
            const roomBrief = roomEl.querySelector('[data-room-brief]');
            roomBrief.querySelector('.num:nth-child(1)').textContent = roomSummary.setCount;
            roomBrief.querySelector('.num:nth-child(2)').textContent = roomSummary.setCountSets;
            roomBrief.querySelector('.num:nth-child(3)').textContent = this.fmt(roomSummary.totalPrice, 0, true);

            return roomEl.outerHTML;
        });

        this.elements.roomsContainer.innerHTML = roomsHtml.join('');

        // Render grand totals
        const grandSummary = this.calculateGrandSummary();
        this.elements.grandTotal.textContent = this.fmt(grandSummary.totalPrice, 0, true);
        this.elements.setCount.textContent = grandSummary.setCount;
        this.elements.setCountSets.textContent = grandSummary.setCountSets;
        this.elements.setCountDeco.textContent = grandSummary.setCountDeco;
        this.elements.grandFabric.textContent = `${this.fmt(grandSummary.grandOpaqueYards, 2)} หลา`;
        this.elements.grandSheerFabric.textContent = `${this.fmt(grandSummary.grandSheerYards, 2)} หลา`;
        this.elements.grandOpaqueTrack.textContent = `${this.fmt(grandSummary.grandOpaqueTrack, 2)} ม.`;
        this.elements.grandSheerTrack.textContent = `${this.fmt(grandSummary.grandSheerTrack, 2)} ม.`;
        this.elements.grandWallpaper.textContent = `${grandSummary.grandWallpaperRolls} ม้วน`;
        
        this.renumberRooms();
        this.updateLockStateUI();
    }
    
    renderSet(set) {
        const tpl = document.querySelector(this.SELECTORS.setTpl).content.cloneNode(true);
        const el = tpl.querySelector(this.SELECTORS.set);
        
        el.dataset.suspended = set.is_suspended;
        if (set.is_suspended) {
            el.classList.add('is-suspended');
            el.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
        }
        el.querySelector('input[name="width_m"]').value = set.width_m;
        el.querySelector('input[name="height_m"]').value = set.height_m;
        el.querySelector('select[name="fabric_variant"]').value = set.fabric_variant;
        el.querySelector('select[name="open_type"]').value = set.open_type;
        this.populatePriceOptions(el.querySelector('select[name="sheer_price_per_m"]'), this.PRICING.sheer);
        el.querySelector('select[name="sheer_price_per_m"]').value = set.sheer_price_per_m;
        
        this.toggleSetFabricUI(el, set.fabric_variant);
        const { opaquePrice, sheerPrice, opaqueYards, sheerYards, opaqueTrack, sheerTrack } = this.calculateSet(set);
        el.querySelector('[data-set-price-total]').textContent = this.fmt(opaquePrice + sheerPrice, 0, true);
        el.querySelector('[data-set-price-opaque]').textContent = this.fmt(opaquePrice, 0, true);
        el.querySelector('[data-set-price-sheer]').textContent = this.fmt(sheerPrice, 0, true);
        el.querySelector('[data-set-yardage-opaque]').textContent = this.fmt(opaqueYards, 2);
        el.querySelector('[data-set-yardage-sheer]').textContent = this.fmt(sheerYards, 2);
        el.querySelector('[data-set-opaque-track]').textContent = this.fmt(opaqueTrack, 2);
        el.querySelector('[data-set-sheer-track]').textContent = this.fmt(sheerTrack, 2);
        
        return el.outerHTML;
    }
    
    renderDeco(deco) {
        const tpl = document.querySelector(this.SELECTORS.decoTpl).content.cloneNode(true);
        const el = tpl.querySelector(this.SELECTORS.decoItem);
        
        el.dataset.suspended = deco.is_suspended;
        if (deco.is_suspended) {
            el.classList.add('is-suspended');
            el.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
        }
        el.querySelector('input[name="deco_type"]').value = deco.type;
        el.querySelector('input[name="deco_width_m"]').value = deco.width_m;
        el.querySelector('input[name="deco_height_m"]').value = deco.height_m;
        el.querySelector('input[name="deco_price_sqyd"]').value = this.fmt(deco.price_sqyd, 0, true);

        const { totalPrice } = this.calculateDeco(deco);
        el.querySelector('[data-deco-price]').textContent = this.fmt(totalPrice, 0, true);
        
        return el.outerHTML;
    }

    renderWallpaper(wallpaper) {
        const tpl = document.querySelector(this.SELECTORS.wallpaperTpl).content.cloneNode(true);
        const el = tpl.querySelector(this.SELECTORS.wallpaperItem);
        
        el.dataset.suspended = wallpaper.is_suspended;
        if (wallpaper.is_suspended) {
            el.classList.add('is-suspended');
            el.querySelector('[data-suspend-text]').textContent = 'ใช้งาน';
        }
        el.querySelector('input[name="wallpaper_height_m"]').value = wallpaper.height_m;
        el.querySelector('input[name="wallpaper_price_roll"]').value = this.fmt(wallpaper.price_per_roll, 0, true);
        
        const wallsHtml = wallpaper.widths.map(w => this.renderWall(w));
        el.querySelector(this.SELECTORS.wallsContainer).innerHTML = wallsHtml.join('');

        const { totalPrice, area, rollsUsed } = this.calculateWallpaper(wallpaper);
        const summaryEl = el.querySelector('[data-wallpaper-summary]');
        summaryEl.querySelector('.price:nth-of-type(1)').textContent = this.fmt(totalPrice, 0, true);
        summaryEl.querySelector('.price:nth-of-type(2)').textContent = this.fmt(area, 2);
        summaryEl.querySelector('.price:nth-of-type(3)').textContent = rollsUsed;

        return el.outerHTML;
    }
    
    renderWall(width) {
        const tpl = document.querySelector(this.SELECTORS.wallTpl).content.cloneNode(true);
        tpl.querySelector('input').value = width;
        return tpl.querySelector('.wall-input-row').outerHTML;
    }

    // --- Pure Calculation Functions ---
    calculateSet(set) {
        if (set.is_suspended) return { opaquePrice: 0, sheerPrice: 0, opaqueYards: 0, sheerYards: 0, opaqueTrack: 0, sheerTrack: 0 };
        const { width_m, height_m, fabric_variant, sheer_price_per_m, roomStyle, roomPricePerM } = set;
        const w = this.clamp01(width_m), h = this.clamp01(height_m);
        if (w <= 0 || h <= 0) return { opaquePrice: 0, sheerPrice: 0, opaqueYards: 0, sheerYards: 0, opaqueTrack: 0, sheerTrack: 0 };
        
        const sPlus = this.PRICING.style_surcharge[roomStyle] ?? 0;
        const hPlus = this.calculateHeightSurcharge(h);
        const baseRaw = this.toNum(roomPricePerM);

        let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;

        if (fabric_variant === "ทึบ" || fabric_variant === "ทึบ&โปร่ง") {
            opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
            opaqueYards = this.calculateFabricYardage(roomStyle, w);
            opaqueTrack = w;
        }
        if (fabric_variant === "โปร่ง" || fabric_variant === "ทึบ&โปร่ง") {
            const sheerBase = this.toNum(sheer_price_per_m);
            sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
            sheerYards = this.calculateFabricYardage(roomStyle, w);
            sheerTrack = w;
        }
        return { opaquePrice, sheerPrice, opaqueYards, sheerYards, opaqueTrack, sheerTrack };
    }

    calculateDeco(deco) {
        if (deco.is_suspended) return { totalPrice: 0 };
        const { width_m, height_m, price_sqyd } = deco;
        const w = this.clamp01(width_m), h = this.clamp01(height_m);
        const p = this.clamp01(price_sqyd);
        const areaSqM = w * h;
        const areaSqYd = areaSqM * 1.19599;
        const totalPrice = Math.round(areaSqYd * p);
        return { totalPrice };
    }

    calculateWallpaper(wallpaper) {
        if (wallpaper.is_suspended) return { totalPrice: 0, area: 0, rollsUsed: 0 };
        const { height_m, price_per_roll, widths } = wallpaper;
        const h = this.clamp01(height_m);
        const wSum = widths.reduce((sum, w) => sum + this.clamp01(w), 0);
        const area = wSum * h;
        const rollsUsed = Math.ceil(area / (this.WALLPAPER.ROLL_WIDTH_M * this.WALLPAPER.ROLL_LENGTH_M));
        const totalPrice = rollsUsed * this.toNum(price_per_roll);
        return { totalPrice, area, rollsUsed };
    }

    calculateRoomSummary(room) {
        const sets = room.sets?.map(set => this.calculateSet(set)) || [];
        const decos = room.decorations?.map(deco => this.calculateDeco(deco)) || [];
        const wallpapers = room.wallpapers?.map(wallpaper => this.calculateWallpaper(wallpaper)) || [];
        
        const totalSetsPrice = sets.reduce((sum, s) => sum + s.opaquePrice + s.sheerPrice, 0);
        const totalDecoPrice = decos.reduce((sum, d) => sum + d.totalPrice, 0);
        const totalWallpaperPrice = wallpapers.reduce((sum, w) => sum + w.totalPrice, 0);
        const totalOpaqueYards = sets.reduce((sum, s) => sum + s.opaqueYards, 0);
        const totalSheerYards = sets.reduce((sum, s) => sum + s.sheerYards, 0);
        const totalOpaqueTrack = sets.reduce((sum, s) => sum + s.opaqueTrack, 0);
        const totalSheerTrack = sets.reduce((sum, s) => sum + s.sheerTrack, 0);
        
        const setCount = (room.sets?.length || 0) + (room.decorations?.length || 0) + (room.wallpapers?.length || 0);
        const setCountSets = room.sets?.length || 0;
        const setCountDeco = (room.decorations?.length || 0) + (room.wallpapers?.length || 0);
        
        return {
            totalPrice: totalSetsPrice + totalDecoPrice + totalWallpaperPrice,
            setCount, setCountSets, setCountDeco,
            totalOpaqueYards, totalSheerYards, totalOpaqueTrack, totalSheerTrack,
        };
    }
    
    calculateGrandSummary() {
        let totalGrand = 0;
        let grandOpaqueYards = 0, grandSheerYards = 0;
        let grandOpaqueTrack = 0, grandSheerTrack = 0;
        let grandWallpaperRolls = 0;
        let setCount = 0, setCountSets = 0, setCountDeco = 0;

        this.state.rooms.forEach(room => {
            const roomSummary = this.calculateRoomSummary(room);
            totalGrand += roomSummary.totalPrice;
            grandOpaqueYards += roomSummary.totalOpaqueYards;
            grandSheerYards += roomSummary.totalSheerYards;
            grandOpaqueTrack += roomSummary.totalOpaqueTrack;
            grandSheerTrack += roomSummary.totalSheerTrack;
            setCount += roomSummary.setCount;
            setCountSets += roomSummary.setCountSets;
            setCountDeco += roomSummary.setCountDeco;
            grandWallpaperRolls += room.wallpapers?.reduce((sum, w) => sum + (this.calculateWallpaper(w)?.rollsUsed || 0), 0) || 0;
        });

        return {
            totalPrice: totalGrand,
            grandOpaqueYards: grandOpaqueYards,
            grandSheerYards: grandSheerYards,
            grandOpaqueTrack: grandOpaqueTrack,
            grandSheerTrack: grandSheerTrack,
            grandWallpaperRolls: grandWallpaperRolls,
            setCount, setCountSets, setCountDeco
        };
    }

    // --- Helper Functions ---
    populatePriceOptions(selectEl, prices) {
        selectEl.innerHTML = `<option value="" hidden>เลือก</option>`;
        prices.forEach(p => {
            const option = document.createElement('option');
            option.value = p; option.textContent = p.toLocaleString("th-TH");
            selectEl.appendChild(option);
        });
    }

    toNum = v => Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0;
    clamp01 = v => Math.max(0, this.toNum(v));
    fmt = (n, fixed = 2, asCurrency = false) => {
        if (!Number.isFinite(n)) return "0";
        const options = asCurrency 
            ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } 
            : { minimumFractionDigits: fixed, maximumFractionDigits: fixed };
        return n.toLocaleString("th-TH", options);
    };
    
    calculateFabricYardage(style, width) {
        if (width <= 0) return 0;
        if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
        if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
        return 0;
    };
    
    calculateHeightSurcharge(h) {
        const sorted = [...this.PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) { if (h > entry.threshold) return entry.add_per_m; }
        return 0;
    };
    
    showToast(message, type = 'default') {
        const container = document.querySelector(this.SELECTORS.toastContainer);
        const toast = document.createElement('div');
        toast.className = 'toast'; toast.textContent = message;
        if (type === 'success') toast.classList.add('toast-success');
        else if (type === 'warning') toast.classList.add('toast-warning');
        else if (type === 'error') toast.classList.add('toast-error');
        else { toast.style.backgroundColor = 'var(--card-bg)'; toast.style.color = 'var(--fg)'; }
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
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
    };

    showCopyOptionsModal() {
        return new Promise((resolve) => {
            const modal = document.querySelector(this.SELECTORS.copyOptionsModal);
            modal.classList.add('visible');
            const confirmBtn = document.querySelector(this.SELECTORS.copyOptionsConfirm);
            const cancelBtn = document.querySelector(this.SELECTORS.copyOptionsCancel);
            const cleanup = (result) => {
                modal.classList.remove('visible');
                confirmBtn.onclick = null; cancelBtn.onclick = null;
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

    renumberRooms() {
        document.querySelectorAll(this.SELECTORS.room).forEach((room, rIdx) => {
            const input = room.querySelector(this.SELECTORS.roomNameInput);
            if (input && !input.value) input.placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
            const items = room.querySelectorAll(`${this.SELECTORS.set}, ${this.SELECTORS.decoItem}, ${this.SELECTORS.wallpaperItem}`);
            const totalItems = items.length;
            items.forEach((item, iIdx) => {
                const lbl = item.querySelector("[data-item-title]");
                if (lbl) lbl.textContent = totalItems > 1 ? `${iIdx + 1}/${totalItems}` : `${iIdx + 1}`;
            });
        });
    }

    toggleSetFabricUI(setEl, variant) {
        const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
        setEl.querySelector(this.SELECTORS.sheerWrap).classList.toggle("hidden", !hasSheer);
        setEl.querySelector('[data-set-options-row]').classList.toggle("three-col", hasSheer);
        setEl.querySelector("[data-sheer-price-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-yardage-label]").classList.toggle("hidden", !hasSheer);
        setEl.querySelector("[data-sheer-track-label]").classList.toggle("hidden", !hasSheer);

        const hasOpaque = variant === "ทึบ" || variant === "ทึบ&โปร่ง";
        setEl.querySelector("[data-opaque-price-label]").classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-yardage-label]").classList.toggle("hidden", !hasOpaque);
        setEl.querySelector("[data-opaque-track-label]").classList.toggle("hidden", !hasOpaque);
    }
    
    updateLockStateUI() {
        document.body.classList.toggle('is-locked', this.isLocked);
        document.querySelectorAll('.field, .btn:not(#lockBtn):not(#copyJsonBtn):not(#copyTextBtn)').forEach(el => el.disabled = this.isLocked);
        document.querySelector('.lock-text').textContent = this.isLocked ? 'ปลดล็อค' : 'ล็อค';
        document.querySelector('.lock-icon').textContent = this.isLocked ? '🔓' : '🔒';
    }

    // --- State Actions & Event Handlers ---
    async handleAddRoom() {
        if (this.isLocked) return;
        const newRoom = {
            name: "",
            price_per_m_raw: "",
            style: "",
            sets: [{ is_suspended: false, width_m: "", height_m: "", fabric_variant: "ทึบ", open_type: "", sheer_price_per_m: "" }],
            decorations: [],
            wallpapers: [],
        };
        this.updateState({ rooms: [...this.state.rooms, newRoom] });
        this.showToast('เพิ่มห้องใหม่แล้ว', 'success');
    }

    async handleAddSet(roomIndex) {
        if (this.isLocked) return;
        const newSet = { is_suspended: false, width_m: "", height_m: "", fabric_variant: "ทึบ", open_type: "", sheer_price_per_m: "" };
        const newRooms = [...this.state.rooms];
        newRooms[roomIndex].sets.push(newSet);
        this.updateState({ rooms: newRooms });
        this.showToast('เพิ่มจุดผ้าม่านแล้ว', 'success');
    }

    async handleAddDeco(roomIndex) {
        if (this.isLocked) return;
        const newDeco = { is_suspended: false, type: "", width_m: "", height_m: "", price_sqyd: "" };
        const newRooms = [...this.state.rooms];
        newRooms[roomIndex].decorations.push(newDeco);
        this.updateState({ rooms: newRooms });
        this.showToast('เพิ่มรายการตกแต่งแล้ว', 'success');
    }

    async handleAddWallpaper(roomIndex) {
        if (this.isLocked) return;
        const newWallpaper = { is_suspended: false, height_m: "", price_per_roll: "", widths: [""] };
        const newRooms = [...this.state.rooms];
        newRooms[roomIndex].wallpapers.push(newWallpaper);
        this.updateState({ rooms: newRooms });
        this.showToast('เพิ่มรายการวอลเปเปอร์แล้ว', 'success');
    }

    handleAddWall(roomIndex, wallpaperIndex) {
        if (this.isLocked) return;
        const newRooms = [...this.state.rooms];
        newRooms[roomIndex].wallpapers[wallpaperIndex].widths.push("");
        this.updateState({ rooms: newRooms });
    }
    
    async handleDelete(type, roomIndex, itemIndex) {
        if (this.isLocked) return;
        let confirmMsg = '';
        if (type === 'room') confirmMsg = 'ยืนยันการลบห้องนี้?';
        else if (type === 'set') confirmMsg = 'ยืนยันการลบจุดติดตั้งนี้?';
        else if (type === 'deco') confirmMsg = 'ยืนยันการลบรายการตกแต่งนี้?';
        else if (type === 'wallpaper') confirmMsg = 'ยืนยันการลบรายการวอลเปเปอร์นี้?';
        else if (type === 'wall') confirmMsg = 'ยืนยันการลบผนังนี้?';
        
        if (!await this.showConfirmation('ลบข้อมูล', confirmMsg)) return;
        
        const newRooms = [...this.state.rooms];
        if (type === 'room') {
            newRooms.splice(itemIndex, 1);
        } else if (type === 'set') {
            newRooms[roomIndex].sets.splice(itemIndex, 1);
        } else if (type === 'deco') {
            newRooms[roomIndex].decorations.splice(itemIndex, 1);
        } else if (type === 'wallpaper') {
            newRooms[roomIndex].wallpapers.splice(itemIndex, 1);
        } else if (type === 'wall') {
             // Wall deletion needs specific index
        }
        
        this.updateState({ rooms: newRooms });
        this.showToast(`ลบ${type === 'room' ? 'ห้อง' : type === 'set' ? 'จุดผ้าม่าน' : 'รายการ'}แล้ว`, 'success');
    }

    async handleClearAll() {
        if (this.isLocked) return;
        if (!await this.showConfirmation('ล้างข้อมูลทั้งหมด', 'คำเตือน! การกระทำนี้จะลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้')) return;
        
        const initialState = {
            customer_name: "",
            customer_address: "",
            customer_phone: "",
            rooms: [],
        };
        this.updateState(initialState);
        this.showToast('ล้างข้อมูลทั้งหมดแล้ว', 'warning');
    }

    handleLock() {
        this.isLocked = !this.isLocked;
        this.updateLockStateUI();
        this.showToast(this.isLocked ? 'ล็อคหน้าจอแล้ว' : 'ปลดล็อคหน้าจอแล้ว', 'info');
    }

    saveData() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
    }
    
    loadInitialState() {
        const storedData = localStorage.getItem(this.STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                this.state = payload;
                if (!this.state.rooms || this.state.rooms.length === 0) {
                    this.state.rooms = [{
                        name: "", price_per_m_raw: "", style: "",
                        sets: [{ is_suspended: false, width_m: "", height_m: "", fabric_variant: "ทึบ", open_type: "", sheer_price_per_m: "" }],
                        decorations: [], wallpapers: []
                    }];
                }
                this.render();
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(this.STORAGE_KEY);
                this.state.rooms = [{
                    name: "", price_per_m_raw: "", style: "",
                    sets: [{ is_suspended: false, width_m: "", height_m: "", fabric_variant: "ทึบ", open_type: "", sheer_price_per_m: "" }],
                    decorations: [], wallpapers: []
                }];
                this.render();
            }
        } else {
            this.state.rooms = [{
                name: "", price_per_m_raw: "", style: "",
                sets: [{ is_suspended: false, width_m: "", height_m: "", fabric_variant: "ทึบ", open_type: "", sheer_price_per_m: "" }],
                decorations: [], wallpapers: []
            }];
            this.render();
        }
    }

    // --- Event Binding ---
    bindEvents() {
        // Debounced input handler
        const handleInput = this.debounce(e => {
            const { name, value } = e.target;
            const parent = e.target.closest(this.SELECTORS.room);
            const roomIndex = parent ? parseInt(parent.dataset.index) : null;
            
            // Customer info update
            if (['customer_name', 'customer_address', 'customer_phone'].includes(name)) {
                const newCustomerInfo = { ...this.state.customerInfo, [name]: value };
                this.updateState({ customerInfo: newCustomerInfo });
            }
            
            // Room-level update
            if (roomIndex !== null) {
                const newRooms = [...this.state.rooms];
                const room = newRooms[roomIndex];
                
                if (name === 'room_name') room.name = value;
                if (name === 'room_price_per_m') room.price_per_m_raw = value;
                if (name === 'room_style') room.style = value;
                
                // Item-level updates (Sets, Decos, Wallpapers)
                const setEl = e.target.closest(this.SELECTORS.set);
                if (setEl) {
                    const setIndex = Array.from(parent.querySelectorAll(this.SELECTORS.set)).indexOf(setEl);
                    if (setIndex !== -1) {
                        const set = room.sets[setIndex];
                        if (name === 'width_m') set.width_m = value;
                        if (name === 'height_m') set.height_m = value;
                        if (name === 'fabric_variant') set.fabric_variant = value;
                        if (name === 'open_type') set.open_type = value;
                        if (name === 'sheer_price_per_m') set.sheer_price_per_m = value;
                    }
                }
                
                const decoEl = e.target.closest(this.SELECTORS.decoItem);
                if (decoEl) {
                    const decoIndex = Array.from(parent.querySelectorAll(this.SELECTORS.decoItem)).indexOf(decoEl);
                    if (decoIndex !== -1) {
                        const deco = room.decorations[decoIndex];
                        if (name === 'deco_type') deco.type = value;
                        if (name === 'deco_width_m') deco.width_m = value;
                        if (name === 'deco_height_m') deco.height_m = value;
                        if (name === 'deco_price_sqyd') deco.price_sqyd = value;
                    }
                }
                
                const wallpaperEl = e.target.closest(this.SELECTORS.wallpaperItem);
                if (wallpaperEl) {
                    const wallpaperIndex = Array.from(parent.querySelectorAll(this.SELECTORS.wallpaperItem)).indexOf(wallpaperEl);
                    if (wallpaperIndex !== -1) {
                        const wallpaper = room.wallpapers[wallpaperIndex];
                        if (name === 'wallpaper_height_m') wallpaper.height_m = value;
                        if (name === 'wallpaper_price_roll') wallpaper.price_per_roll = value;
                        
                        const wallEl = e.target.closest('.wall-input-row');
                        if (wallEl) {
                            const wallIndex = Array.from(wallpaperEl.querySelectorAll('.wall-input-row')).indexOf(wallEl);
                            if (wallIndex !== -1) {
                                wallpaper.widths[wallIndex] = value;
                            }
                        }
                    }
                }
                this.updateState({ rooms: newRooms });
            }
        });

        // Use event delegation for dynamic elements
        document.body.addEventListener('input', handleInput);

        document.body.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn');
            if (!btn) return;
            const action = btn.dataset.act;
            const parentRoom = btn.closest(this.SELECTORS.room);
            const roomIndex = parentRoom ? parseInt(parentRoom.dataset.index) : null;
            
            switch (btn.id) {
                case 'addRoomHeaderBtn': this.handleAddRoom(); break;
                case 'lockBtn': this.handleLock(); break;
                case 'clearAllBtn': this.handleClearAll(); break;
            }
            
            switch(action) {
                case 'add-set': this.handleAddSet(roomIndex); break;
                case 'add-deco': this.handleAddDeco(roomIndex); break;
                case 'add-wallpaper': this.handleAddWallpaper(roomIndex); break;
                case 'add-wall': {
                    const wallpaperEl = btn.closest(this.SELECTORS.wallpaperItem);
                    const wallpaperIndex = Array.from(parentRoom.querySelectorAll(this.SELECTORS.wallpaperItem)).indexOf(wallpaperEl);
                    this.handleAddWall(roomIndex, wallpaperIndex);
                    break;
                }
                case 'del-room': this.handleDelete('room', null, roomIndex); break;
                case 'del-set': {
                    const setIndex = Array.from(parentRoom.querySelectorAll(this.SELECTORS.set)).indexOf(btn.closest(this.SELECTORS.set));
                    this.handleDelete('set', roomIndex, setIndex);
                    break;
                }
                case 'del-deco': {
                    const decoIndex = Array.from(parentRoom.querySelectorAll(this.SELECTORS.decoItem)).indexOf(btn.closest(this.SELECTORS.decoItem));
                    this.handleDelete('deco', roomIndex, decoIndex);
                    break;
                }
                case 'del-wallpaper': {
                    const wallpaperIndex = Array.from(parentRoom.querySelectorAll(this.SELECTORS.wallpaperItem)).indexOf(btn.closest(this.SELECTORS.wallpaperItem));
                    this.handleDelete('wallpaper', roomIndex, wallpaperIndex);
                    break;
                }
                case 'del-wall': {
                    const wallpaperEl = btn.closest(this.SELECTORS.wallpaperItem);
                    const wallpaperIndex = Array.from(parentRoom.querySelectorAll(this.SELECTORS.wallpaperItem)).indexOf(wallpaperEl);
                    const wallIndex = Array.from(wallpaperEl.querySelectorAll('.wall-input-row')).indexOf(btn.closest('.wall-input-row'));
                    const newRooms = [...this.state.rooms];
                    newRooms[roomIndex].wallpapers[wallpaperIndex].widths.splice(wallIndex, 1);
                    this.updateState({ rooms: newRooms });
                    break;
                }
                case 'toggle-suspend': {
                    const itemEl = btn.closest('.set, .deco-item, .wallpaper-item');
                    const itemType = itemEl.classList.contains('set') ? 'set' : itemEl.classList.contains('deco-item') ? 'decoration' : 'wallpaper';
                    const newRooms = [...this.state.rooms];
                    if (itemType === 'set') {
                        const setIndex = Array.from(parentRoom.querySelectorAll(this.SELECTORS.set)).indexOf(itemEl);
                        newRooms[roomIndex].sets[setIndex].is_suspended = !newRooms[roomIndex].sets[setIndex].is_suspended;
                    } else if (itemType === 'decoration') {
                        const decoIndex = Array.from(parentRoom.querySelectorAll(this.SELECTORS.decoItem)).indexOf(itemEl);
                        newRooms[roomIndex].decorations[decoIndex].is_suspended = !newRooms[roomIndex].decorations[decoIndex].is_suspended;
                    } else if (itemType === 'wallpaper') {
                        const wallpaperIndex = Array.from(parentRoom.querySelectorAll(this.SELECTORS.wallpaperItem)).indexOf(itemEl);
                        newRooms[roomIndex].wallpapers[wallpaperIndex].is_suspended = !newRooms[roomIndex].wallpapers[wallpaperIndex].is_suspended;
                    }
                    this.updateState({ rooms: newRooms });
                    break;
                }
            }
        });
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new MarntharaApp();
});