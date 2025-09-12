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
        curtain: (sets, width, height, fabricPrice, stylePrice, surcharge) => {
            const totalWidthM = sets * width;
            const totalSqm = totalWidthM * height;
            const totalSqyd = totalSqm * SQM_TO_SQYD;
            const fabricPricePerSqm = fabricPrice; // assuming price is per sqm from a table
            const totalPrice = (totalSqm * fabricPricePerSqm) + (sets * stylePrice);
            return {
                totalWidthM: totalWidthM,
                totalSqm: totalSqm,
                totalSqyd: totalSqyd,
                totalPrice: totalPrice
            };
        },
        wallpaper: (walls, height, pricePerRoll) => {
            const totalWidth = walls.reduce((sum, wall) => sum + wall, 0);
            const totalSqm = totalWidth * height;
            const rolls = Math.ceil(totalSqm / WALLPAPER_SQM_PER_ROLL);
            const totalPrice = rolls * pricePerRoll;
            return {
                totalWidth: totalWidth,
                totalSqm: totalSqm,
                rolls: rolls,
                totalPrice: totalPrice
            };
        },
        rollerBlind: (width, height, pricePerSet, sets) => {
            const totalSqm = width * height * sets;
            const totalPrice = pricePerSet * sets;
            return {
                totalSqm: totalSqm,
                totalPrice: totalPrice
            };
        }
    };
    const SELECTORS = {
        roomNameInput: '#room_name',
        productTypeRadios: 'input[name="product_type"]',
        fabricTypeSelect: 'select[name="fabric_type"]',
        sheerTypeSelect: 'select[name="sheer_type"]',
        curtainStyleSelect: 'select[name="curtain_style"]',
        railHeightInput: 'input[name="rail_height_m"]',
        fabricPriceInput: 'input[name="fabric_price"]',
        sheerPriceInput: 'input[name="sheer_price"]',
        curtainWidthInput: 'input[name="width_m"]',
        curtainSetsInput: 'input[name="sets"]',
        wallpaperHeightInput: 'input[name="wallpaper_height_m"]',
        wallpaperPriceRollInput: 'input[name="wallpaper_price_roll"]',
        addWallBtn: 'button[data-act="add-wall"]',
        wallsContainer: '[data-walls-container]',
        rollerWidthInput: 'input[name="roller_width_m"]',
        rollerHeightInput: 'input[name="roller_height_m"]',
        rollerPriceSetInput: 'input[name="roller_price_set"]',
        rollerSetsInput: 'input[name="roller_sets"]',
        addItemBtn: '#addItemBtn',
        itemList: '#itemList',
        totalPrice: '#totalPrice',
        itemTpl: '#itemTpl',
        wallTpl: '#wallTpl',
        payloadForm: '#payloadForm',
        payloadInput: '#payloadInput',
        menuBtn: '#menuBtn',
        menuDropdown: '#menuDropdown',
        exportBtn: '#exportBtn',
        importBtn: '#importBtn',
        devMode: '#dev-mode',
        sendBtn: '#send-btn',
        getBtn: '#get-btn',
    };
    const TEXT = {
        currency: 'บ.',
        unit_sqm: 'ตร.ม.',
        unit_sqyd: 'หลา',
        unit_roll: 'ม้วน'
    };
    let state = {
        roomName: 'ห้องนอน 1',
        items: [],
        editIndex: -1,
        devMode: false
    };
    const saveState = () => {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            data: state
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    };
    const loadState = () => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const payload = JSON.parse(stored);
            if (payload.version === APP_VERSION) {
                state = payload.data;
            }
        }
    };
    const formatNumber = (num, dp = 0) => num.toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const getInputValue = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        if (el.type === 'number') {
            return parseFloat(el.value) || 0;
        }
        if (el.type === 'text' && el.inputMode === 'numeric') {
            return parseFloat(el.value.replace(/,/g, '')) || 0;
        }
        return el.value.trim();
    };
    const setInputValue = (selector, value) => {
        const el = document.querySelector(selector);
        if (!el) return;
        if (el.type === 'number') {
            el.value = value > 0 ? value : '';
        } else if (el.type === 'text' && el.inputMode === 'numeric') {
            el.value = value > 0 ? formatNumber(value) : '';
        } else {
            el.value = value;
        }
    };
    const getSelectedRadio = (name) => {
        const selector = `input[name="${name}"]:checked`;
        const el = document.querySelector(selector);
        return el ? el.value : null;
    };
    const updateWallpaperWallInputs = (walls) => {
        const container = document.querySelector(SELECTORS.wallsContainer);
        container.innerHTML = '';
        walls.forEach(width => {
            const wallInputRow = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
            wallInputRow.querySelector('input').value = width;
            container.appendChild(wallInputRow);
        });
        updateWallpaperSummary();
    };
    const setupListeners = () => {
        document.querySelector(SELECTORS.productTypeRadios).forEach(radio => radio.addEventListener('change', updateAll));
        document.querySelectorAll('.control-body .field').forEach(field => field.addEventListener('input', updateAll));
        document.querySelector(SELECTORS.addItemBtn).addEventListener('click', addItem);
        document.querySelector(SELECTORS.addWallBtn).addEventListener('click', addWallInput);
        document.querySelector(SELECTORS.wallsContainer).addEventListener('click', (e) => {
            if (e.target.closest('button[data-act="remove-wall"]')) {
                e.target.closest('.wall-input-row').remove();
                updateWallpaperSummary();
            }
        });
    };
    const populateSelects = () => {
        const fabricSelect = document.querySelector(SELECTORS.fabricTypeSelect);
        const sheerSelect = document.querySelector(SELECTORS.sheerTypeSelect);
        const styleSelects = document.querySelectorAll(SELECTORS.curtainStyleSelect);
        const createOptions = (select, prices) => {
            select.innerHTML = '';
            prices.forEach(price => {
                const option = document.createElement('option');
                option.value = price;
                option.textContent = `${formatNumber(price)} บ.`;
                select.appendChild(option);
            });
        };
        const createStyleOptions = (select, styles) => {
            select.innerHTML = '';
            for (const style in styles) {
                const option = document.createElement('option');
                option.value = style;
                option.textContent = style;
                select.appendChild(option);
            }
        };
        createOptions(fabricSelect, PRICING.fabric);
        createOptions(sheerSelect, PRICING.sheer);
        styleSelects.forEach(select => createStyleOptions(select, PRICING.style_surcharge));
    };
    const updateCurtainSummary = () => {
        const productType = getSelectedRadio('product_type');
        const summaryEl = document.querySelector(`.option-group[data-product-type="${productType}"] [data-curtain-summary]`);
        const width = getInputValue(SELECTORS.curtainWidthInput);
        const height = getInputValue(SELECTORS.railHeightInput);
        const sets = getInputValue(SELECTORS.curtainSetsInput);
        const price = (productType === 'fabric') ? getInputValue(SELECTORS.fabricPriceInput) : getInputValue(SELECTORS.sheerPriceInput);
        const style = getSelectedRadio('curtain_style');
        const styleSurcharge = PRICING.style_surcharge[style] || 0;
        if (width > 0 && height > 0 && sets > 0 && price > 0) {
            const result = CALC.curtain(sets, width, height, price, styleSurcharge);
            summaryEl.querySelector('.price:nth-of-type(1)').textContent = formatNumber(result.totalPrice);
            summaryEl.querySelector('.price:nth-of-type(2)').textContent = formatNumber(result.totalSqm, 2);
            summaryEl.querySelector('.price:nth-of-type(3)').textContent = formatNumber(result.totalSqyd, 2);
        } else {
            summaryEl.querySelector('.price:nth-of-type(1)').textContent = '0';
            summaryEl.querySelector('.price:nth-of-type(2)').textContent = '0.00';
            summaryEl.querySelector('.price:nth-of-type(3)').textContent = '0.00';
        }
    };
    const updateWallpaperSummary = () => {
        const summaryEl = document.querySelector('[data-wallpaper-summary]');
        const height = getInputValue(SELECTORS.wallpaperHeightInput);
        const pricePerRoll = getInputValue(SELECTORS.wallpaperPriceRollInput);
        const walls = Array.from(document.querySelectorAll(`${SELECTORS.wallsContainer} input`)).map(input => parseFloat(input.value) || 0);
        if (height > 0 && pricePerRoll > 0 && walls.length > 0) {
            const result = CALC.wallpaper(walls, height, pricePerRoll);
            summaryEl.querySelector('.price:nth-of-type(1)').textContent = formatNumber(result.totalPrice);
            summaryEl.querySelector('.price:nth-of-type(2)').textContent = formatNumber(result.totalSqm, 2);
            summaryEl.querySelector('.price:nth-of-type(3)').textContent = formatNumber(result.rolls);
        } else {
            summaryEl.querySelector('.price:nth-of-type(1)').textContent = '0';
            summaryEl.querySelector('.price:nth-of-type(2)').textContent = '0.00';
            summaryEl.querySelector('.price:nth-of-type(3)').textContent = '0';
        }
    };
    const updateRollerBlindSummary = () => {
        const summaryEl = document.querySelector('[data-roller-summary]');
        const width = getInputValue(SELECTORS.rollerWidthInput);
        const height = getInputValue(SELECTORS.rollerHeightInput);
        const pricePerSet = getInputValue(SELECTORS.rollerPriceSetInput);
        const sets = getInputValue(SELECTORS.rollerSetsInput);
        if (width > 0 && height > 0 && pricePerSet > 0 && sets > 0) {
            const result = CALC.rollerBlind(width, height, pricePerSet, sets);
            summaryEl.querySelector('.price:nth-of-type(1)').textContent = formatNumber(result.totalPrice);
            summaryEl.querySelector('.price:nth-of-type(2)').textContent = formatNumber(result.totalSqm, 2);
        } else {
            summaryEl.querySelector('.price:nth-of-type(1)').textContent = '0';
            summaryEl.querySelector('.price:nth-of-type(2)').textContent = '0.00';
        }
    };
    const updateAll = () => {
        const productType = getSelectedRadio('product_type');
        switch (productType) {
            case 'fabric':
            case 'sheer':
                updateCurtainSummary();
                break;
            case 'wallpaper':
                updateWallpaperSummary();
                break;
            case 'roller_blind':
                updateRollerBlindSummary();
                break;
        }
        updateTotalPrice();
        saveState();
    };
    const addItem = () => {
        const productType = getSelectedRadio('product_type');
        const roomName = getInputValue(SELECTORS.roomNameInput) || 'ไม่ระบุชื่อห้อง';
        let item = { roomName: roomName, productType: productType, details: '', price: 0 };
        switch (productType) {
            case 'fabric':
            case 'sheer': {
                const width = getInputValue(SELECTORS.curtainWidthInput);
                const height = getInputValue(SELECTORS.railHeightInput);
                const sets = getInputValue(SELECTORS.curtainSetsInput);
                const price = (productType === 'fabric') ? getInputValue(SELECTORS.fabricPriceInput) : getInputValue(SELECTORS.sheerPriceInput);
                const style = getSelectedRadio('curtain_style');
                const styleSurcharge = PRICING.style_surcharge[style] || 0;
                if (width === 0 || height === 0 || sets === 0 || price === 0) return alert('กรุณากรอกข้อมูลให้ครบ');
                const result = CALC.curtain(sets, width, height, price, styleSurcharge);
                item.details = `${sets} ชุด | W ${width.toFixed(2)} x H ${height.toFixed(2)} ม. (${style}) • ${formatNumber(result.totalSqyd, 2)} หลา`;
                item.price = result.totalPrice;
                item.data = { width, height, sets, price, style };
                break;
            }
            case 'wallpaper': {
                const height = getInputValue(SELECTORS.wallpaperHeightInput);
                const pricePerRoll = getInputValue(SELECTORS.wallpaperPriceRollInput);
                const walls = Array.from(document.querySelectorAll(`${SELECTORS.wallsContainer} input`)).map(input => parseFloat(input.value) || 0);
                if (height === 0 || pricePerRoll === 0 || walls.length === 0) return alert('กรุณากรอกข้อมูลให้ครบ');
                const result = CALC.wallpaper(walls, height, pricePerRoll);
                item.details = `ผนังรวม ${result.totalWidth.toFixed(2)} ม. | H ${height.toFixed(2)} ม. • ${formatNumber(result.totalSqm, 2)} ตร.ม. • ${result.rolls} ม้วน`;
                item.price = result.totalPrice;
                item.data = { height, pricePerRoll, walls };
                break;
            }
            case 'roller_blind': {
                const width = getInputValue(SELECTORS.rollerWidthInput);
                const height = getInputValue(SELECTORS.rollerHeightInput);
                const sets = getInputValue(SELECTORS.rollerSetsInput);
                const pricePerSet = getInputValue(SELECTORS.rollerPriceSetInput);
                if (width === 0 || height === 0 || sets === 0 || pricePerSet === 0) return alert('กรุณากรอกข้อมูลให้ครบ');
                const result = CALC.rollerBlind(width, height, pricePerSet, sets);
                item.details = `${sets} ชุด | W ${width.toFixed(2)} x H ${height.toFixed(2)} ม. • ${formatNumber(result.totalSqm, 2)} ตร.ม.`;
                item.price = result.totalPrice;
                item.data = { width, height, sets, pricePerSet };
                break;
            }
        }
        if (state.editIndex !== -1) {
            state.items[state.editIndex] = item;
            state.editIndex = -1;
            document.querySelector(SELECTORS.addItemBtn).textContent = 'เพิ่มรายการ';
            document.querySelector('.item-card.is-editing')?.classList.remove('is-editing');
        } else {
            state.items.push(item);
        }
        renderItems();
        clearInputFields();
        saveState();
    };
    const renderItems = () => {
        const container = document.querySelector(SELECTORS.itemList);
        container.innerHTML = '';
        if (state.items.length === 0) {
            document.querySelector('.item-placeholder').classList.remove('hidden');
        } else {
            document.querySelector('.item-placeholder').classList.add('hidden');
            state.items.forEach((item, index) => {
                const card = document.querySelector(SELECTORS.itemTpl).content.cloneNode(true);
                const itemCard = card.querySelector('.item-card');
                itemCard.dataset.index = index;
                if (index === state.editIndex) {
                    itemCard.classList.add('is-editing');
                }
                card.querySelector('.item-room-name').textContent = item.roomName;
                card.querySelector('.item-detail').textContent = item.details;
                card.querySelector('.item-price').textContent = `${formatNumber(item.price)} บ.`;
                container.appendChild(card);
            });
        }
    };
    const updateTotalPrice = () => {
        const total = state.items.reduce((sum, item) => sum + item.price, 0);
        document.querySelector(SELECTORS.totalPrice).textContent = formatNumber(total);
    };
    const editItem = (index) => {
        const item = state.items[index];
        state.editIndex = index;
        document.querySelector(SELECTORS.addItemBtn).textContent = 'บันทึกการแก้ไข';
        document.querySelectorAll('.item-card').forEach((card) => {
            card.classList.remove('is-editing');
        });
        document.querySelector(`.item-card[data-index="${index}"]`).classList.add('is-editing');
        setInputValue(SELECTORS.roomNameInput, item.roomName);
        document.querySelector(`input[name="product_type"][value="${item.productType}"]`).checked = true;
        document.querySelectorAll('.option-group').forEach(group => group.style.display = 'none');
        document.querySelector(`.option-group[data-product-type="${item.productType}"]`).style.display = 'block';
        clearInputFields();
        switch (item.productType) {
            case 'fabric':
            case 'sheer':
                setInputValue(SELECTORS.railHeightInput, item.data.height);
                setInputValue(SELECTORS.curtainWidthInput, item.data.width);
                setInputValue(SELECTORS.curtainSetsInput, item.data.sets);
                if (item.productType === 'fabric') {
                    setInputValue(SELECTORS.fabricPriceInput, item.data.price);
                } else {
                    setInputValue(SELECTORS.sheerPriceInput, item.data.price);
                }
                document.querySelector(`select[name="curtain_style"] option[value="${item.data.style}"]`).selected = true;
                break;
            case 'wallpaper':
                setInputValue(SELECTORS.wallpaperHeightInput, item.data.height);
                setInputValue(SELECTORS.wallpaperPriceRollInput, item.data.pricePerRoll);
                updateWallpaperWallInputs(item.data.walls);
                break;
            case 'roller_blind':
                setInputValue(SELECTORS.rollerWidthInput, item.data.width);
                setInputValue(SELECTORS.rollerHeightInput, item.data.height);
                setInputValue(SELECTORS.rollerPriceSetInput, item.data.pricePerSet);
                setInputValue(SELECTORS.rollerSetsInput, item.data.sets);
                break;
        }
        updateAll();
    };
    const deleteItem = (index) => {
        if (confirm('ยืนยันการลบรายการนี้?')) {
            state.items.splice(index, 1);
            if (state.editIndex === index) {
                state.editIndex = -1;
                document.querySelector(SELECTORS.addItemBtn).textContent = 'เพิ่มรายการ';
            } else if (state.editIndex > index) {
                state.editIndex--;
            }
            renderItems();
            updateTotalPrice();
            saveState();
            clearInputFields();
        }
    };
    const copyItem = (index) => {
        const itemToCopy = JSON.parse(JSON.stringify(state.items[index]));
        state.items.splice(index + 1, 0, itemToCopy);
        renderItems();
        updateTotalPrice();
        saveState();
    };
    const clearInputFields = () => {
        const productType = getSelectedRadio('product_type');
        document.querySelector(SELECTORS.payloadForm).reset();
        document.querySelector(SELECTORS.roomNameInput).value = state.roomName;
        document.querySelector(`input[name="product_type"][value="${productType}"]`).checked = true;
        updateWallpaperWallInputs([]);
        updateAll();
    };
    const addWallInput = () => {
        const container = document.querySelector(SELECTORS.wallsContainer);
        const wallInputRow = document.querySelector(SELECTORS.wallTpl).content.cloneNode(true);
        container.appendChild(wallInputRow);
        updateWallpaperSummary();
    };
    const exportToJson = () => {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            data: state
        };
        const dataStr = JSON.stringify(payload, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = 'marnthara-input.json';
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };
    const importPayload = (payload) => {
        if (payload.version === APP_VERSION) {
            state = payload.data;
            renderItems();
            updateTotalPrice();
            saveState();
            clearInputFields();
            alert('นำเข้าข้อมูลสำเร็จ!');
        } else {
            alert('เวอร์ชันของไฟล์ไม่ถูกต้อง ไม่สามารถนำเข้าได้');
        }
    };
    document.addEventListener('DOMContentLoaded', () => {
        loadState();
        if (state.items.length > 0) {
            document.querySelector(SELECTORS.roomNameInput).value = state.items[state.items.length - 1].roomName;
        }
        populateSelects();
        renderItems();
        updateAll();
        setupListeners();
    });
    document.querySelector(SELECTORS.itemList).addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const card = e.target.closest('.item-card');
        const index = parseInt(card.dataset.index);
        const action = btn.dataset.act;
        switch (action) {
            case 'edit-item':
                editItem(index);
                break;
            case 'delete-item':
                deleteItem(index);
                break;
            case 'copy-item':
                copyItem(index);
                break;
        }
    });
    document.querySelector(SELECTORS.payloadForm).addEventListener('submit', (e) => {
        const payload = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            data: state
        };
        document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(payload);
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
    updateAll();
})();