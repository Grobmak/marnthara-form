// --- UI MANIPULATION & EVENT HANDLING (REFACTORED & ROBUST) ---
import { SELECTORS, PDF_EXPORT_DELAY_MS } from './config.js';
import { fmtTH, toNum, debounce } from './utils.js';
import { CALC } from './calculations.js';
import { saveData, buildPayload } from './storage.js';

// --- STATE VARIABLES ---
let roomCount = 0;
let isLocked = false;

// --- DOM & UI HELPERS ---

export function showToast(message, type = 'default') {
    const container = document.querySelector(SELECTORS.toastContainer);
    if (!container) return;
    const icons = { success: 'ph-bold ph-check-circle', warning: 'ph-bold ph-warning', error: 'ph-bold ph-x-circle', default: 'ph-bold ph-info' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="${icons[type] || icons.default}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

export function showModal(selector) {
    return new Promise((resolve) => {
        const modalEl = document.querySelector(selector);
        if (!modalEl) { resolve(null); return; }

        modalEl.classList.add('visible');
        const confirmBtn = modalEl.querySelector('[id$="Confirm"]');
        const cancelBtn = modalEl.querySelector('[id$="Cancel"]');

        const cleanup = (result) => {
            modalEl.classList.remove('visible');
            if (confirmBtn) confirmBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
            document.removeEventListener('keydown', handleEsc);
            resolve(result);
        };
        
        const handleEsc = (e) => {
            if (e.key === 'Escape') cleanup(false);
        };

        if (confirmBtn) confirmBtn.onclick = () => cleanup(true);
        if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
        document.addEventListener('keydown', handleEsc);
    });
}

export async function showConfirmation(title, body) {
    const modalEl = document.querySelector(SELECTORS.modal);
    if (!modalEl) return true; // Fail safe

    const titleEl = modalEl.querySelector(SELECTORS.modalTitle);
    const bodyEl = modalEl.querySelector(SELECTORS.modalBody);
    
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = body;

    return await showModal(SELECTORS.modal);
}

export async function showExportOptionsModal() {
    const modalEl = document.querySelector(SELECTORS.exportOptionsModal);
    if (!modalEl) return null;

    const confirmed = await showModal(SELECTORS.exportOptionsModal);
    if (!confirmed) return null;

    const vatOptionEl = modalEl.querySelector('input[name="vat_option"]:checked');
    const exportMethodEl = modalEl.querySelector('#exportMethod');

    return {
        vatOption: vatOptionEl ? vatOptionEl.value : 'include',
        exportMethod: exportMethodEl ? exportMethodEl.value : 'direct',
    };
}

export function animateAndRemove(element, toastMessage) {
    if (!element) return;
    element.classList.add('item-removing');
    element.addEventListener('animationend', () => {
        element.remove();
        if (toastMessage) showToast(toastMessage);
        updateQuickNavMenu(); // Update nav after removal
        recalcAll(); // Recalculate totals
        saveData(); // Save state
    }, { once: true });
}

function renumberItemTitles() {
    document.querySelectorAll(SELECTORS.room).forEach((room, roomIndex) => {
        let itemCounter = 1;
        room.querySelectorAll('.item-card').forEach(item => {
            const titleEl = item.querySelector('[data-item-title]');
            if(titleEl) {
                titleEl.textContent = `${(roomIndex + 1).toString().padStart(2, '0')}.${itemCounter.toString().padStart(2, '0')}`;
            }
            itemCounter++;
        });
    });
}

export function updateLockState() {
    const form = document.querySelector(SELECTORS.orderForm);
    const lockBtn = document.querySelector(SELECTORS.lockBtn);
    if (!form || !lockBtn) return;

    const elementsToDisable = form.querySelectorAll('input, select, textarea, button');
    
    form.classList.toggle('is-locked', isLocked);
    lockBtn.classList.toggle('is-locked', isLocked);
    
    const lockIcon = lockBtn.querySelector('i');
    if (lockIcon) {
        lockIcon.className = isLocked ? 'ph-bold ph-lock-key' : 'ph-bold ph-lock-key-open';
    }
    
    elementsToDisable.forEach(el => {
        // Don't disable the lock button itself, or buttons inside always-active modals/menus
        if (el.closest('.summary-footer') || el.closest('.main-header') || el.closest('.modal-wrapper')) {
            return;
        }
        el.disabled = isLocked;
    });

    showToast(isLocked ? 'ฟอร์มถูกล็อค' : 'ปลดล็อคฟอร์มแล้ว', isLocked ? 'default' : 'success');
}

export function updateToggleAllButtonState() {
    const allDetails = document.querySelectorAll(SELECTORS.allDetailsCards);
    if (allDetails.length === 0) return;

    const allOpen = [...allDetails].every(d => d.open);
    const toggleBtn = document.querySelector(SELECTORS.toggleAllRoomsBtn);
    if (toggleBtn) {
        const icon = toggleBtn.querySelector('i');
        const text = toggleBtn.querySelector('span');
        if (icon) icon.className = allOpen ? 'ph ph-rows-slash' : 'ph ph-rows';
        if (text) text.textContent = allOpen ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด';
    }
}

export function handleToggleAllRooms() {
    const allDetails = document.querySelectorAll(SELECTORS.allDetailsCards);
    const allOpen = [...allDetails].every(d => d.open);
    allDetails.forEach(d => { d.open = !allOpen; });
    setTimeout(updateToggleAllButtonState, 50);
}

export function updateQuickNavMenu() {
    const list = document.querySelector(SELECTORS.quickNavRoomList);
    if (!list) return;

    list.innerHTML = '';
    const rooms = document.querySelectorAll(SELECTORS.room);
    rooms.forEach((room) => {
        const roomNameInput = room.querySelector(SELECTORS.roomNameInput);
        const roomName = roomNameInput ? roomNameInput.value : `ห้อง`;
        const link = document.createElement('a');
        link.href = `#${room.id}`;
        link.dataset.jumpTo = room.id;
        link.innerHTML = `<i class="ph ph-door"></i> ${roomName || 'ห้อง (ไม่มีชื่อ)'}`;
        list.appendChild(link);
    });
}

function createNewItem(templateId, container, animate = true) {
    const template = document.querySelector(templateId);
    if (!template || !container) return null;

    const clone = template.content.cloneNode(true);
    const newItem = clone.firstElementChild;
    container.appendChild(clone);
    
    if (animate && newItem) {
        newItem.classList.add('item-created');
        newItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    renumberItemTitles();
    recalcAll();
    saveData();
    return newItem;
}


export function addRoom() {
    const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
    if (!roomsContainer) return;
    
    roomCount++;
    const newRoom = createNewItem('#roomTpl', roomsContainer, true);
    if (newRoom) {
        newRoom.id = `room-${Date.now()}`; // Use timestamp for unique ID
        const roomNameInput = newRoom.querySelector(SELECTORS.roomNameInput);
        if (roomNameInput) roomNameInput.value = `ห้อง ${roomCount}`;
        newRoom.open = true;
    }
    
    updateQuickNavMenu();
    updateToggleAllButtonState();
}

function addSet(roomEl) {
    if (!roomEl) return;
    const setsContainer = roomEl.querySelector(SELECTORS.setsContainer);
    if (setsContainer) createNewItem('#setTpl', setsContainer);
}

function addDeco(roomEl) {
    if (!roomEl) return;
    const decosContainer = roomEl.querySelector(SELECTORS.decorationsContainer);
    if (decosContainer) createNewItem('#decoTpl', decosContainer);
}

function addWallpaper(roomEl) {
    if (!roomEl) return;
    const wallpapersContainer = roomEl.querySelector(SELECTORS.wallpapersContainer);
    if (wallpapersContainer) {
        const newWallpaper = createNewItem('#wallpaperTpl', wallpapersContainer);
        // Add one wall by default for better UX
        if (newWallpaper) addWall(newWallpaper.querySelector('[data-act="add-wall"]'));
    }
}

function addWall(button) {
    const wallsContainer = button?.closest('.walls-section')?.querySelector(SELECTORS.wallsContainer);
    if (wallsContainer) {
        createNewItem('#wallTpl', wallsContainer, false);
        recalc(button); // Recalc the parent wallpaper item
    }
}

function handleSheerCodeVisibility(setEl) {
    if (!setEl) return;
    const fabricVariant = setEl.querySelector('select[name="fabric_variant"]')?.value;
    const hasSheer = fabricVariant && fabricVariant.includes("โปร่ง");
    setEl.querySelector(SELECTORS.sheerWrap)?.classList.toggle('hidden', !hasSheer);
    setEl.querySelector(SELECTORS.sheerCodeWrap)?.classList.toggle('hidden', !hasSheer);
}

const debouncedRecalcAndSave = debounce((el) => {
    recalc(el);
    saveData();
});

export function handleFormInput(e) {
    if (isLocked) {
        showToast('ฟอร์มถูกล็อค ไม่สามารถแก้ไขได้', 'warning');
        e.preventDefault();
        return;
    }
    debouncedRecalcAndSave(e.target);
}

export function handleFormChange(e) {
    if (isLocked) return;
    const el = e.target;
    if (el.matches('select[name="fabric_variant"]')) {
        handleSheerCodeVisibility(el.closest(SELECTORS.set));
    }
    if (el.matches(SELECTORS.roomNameInput)) {
        updateQuickNavMenu();
    }
    recalc(el);
    saveData();
}

function recalc(el) {
    if (!el) return;
    
    const set = el.closest(SELECTORS.set);
    if (set) {
        const summaryEl = set.querySelector('[data-set-summary]');
        if (summaryEl) {
            const data = {
                is_suspended: set.classList.contains('suspended'),
                width_m: set.querySelector('input[name="width_m"]')?.value,
                height_m: set.querySelector('input[name="height_m"]')?.value,
                style: set.querySelector('select[name="set_style"]')?.value,
                fabric_variant: set.querySelector('select[name="fabric_variant"]')?.value,
                price_per_m_raw: set.querySelector('select[name="set_price_per_m"]')?.value,
                sheer_price_per_m: set.querySelector('select[name="sheer_price_per_m"]')?.value,
            };
            summaryEl.textContent = fmtTH(CALC.calculateSetPrice(data));
        }
    }

    const deco = el.closest(SELECTORS.decoItem);
    if (deco) {
        const summaryEl = deco.querySelector('[data-deco-summary]');
        if (summaryEl) {
             const data = {
                is_suspended: deco.classList.contains('suspended'),
                width_m: deco.querySelector('input[name="deco_width_m"]')?.value,
                height_m: deco.querySelector('input[name="deco_height_m"]')?.value,
                price_sqyd: deco.querySelector('input[name="deco_price_sqyd"]')?.value,
            };
            summaryEl.textContent = fmtTH(CALC.calculateDecoPrice(data));
        }
    }

    const wallpaper = el.closest(SELECTORS.wallpaperItem);
    if (wallpaper) {
        const summaryEl = wallpaper.querySelector('[data-wallpaper-summary]');
        if (summaryEl) {
            const data = {
                is_suspended: wallpaper.classList.contains('suspended'),
                height_m: wallpaper.querySelector('input[name="wallpaper_height_m"]')?.value,
                price_per_roll: wallpaper.querySelector('input[name="wallpaper_price_roll"]')?.value,
                install_cost_per_roll: wallpaper.querySelector('input[name="wallpaper_install_cost"]')?.value,
                widths: Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).map(i => i.value),
            };
            summaryEl.textContent = fmtTH(CALC.calculateWallpaperPrice(data));
        }
    }

    recalcAll();
}

export function recalcAll() {
    let grandTotal = 0;
    let totalItems = 0;
    
    document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
        let roomTotal = 0;
        const isRoomSuspended = roomEl.classList.contains('suspended');

        // Calculate for sets
        roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
            const price = CALC.calculateSetPrice({
                is_suspended: isRoomSuspended || setEl.classList.contains('suspended'),
                width_m: setEl.querySelector('input[name="width_m"]')?.value,
                height_m: setEl.querySelector('input[name="height_m"]')?.value,
                style: setEl.querySelector('select[name="set_style"]')?.value,
                fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value,
                price_per_m_raw: setEl.querySelector('select[name="set_price_per_m"]')?.value,
                sheer_price_per_m: setEl.querySelector('select[name="sheer_price_per_m"]')?.value,
            });
            roomTotal += price;
            if (price > 0) totalItems++;
        });

        // Calculate for decorations
        roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
             const price = CALC.calculateDecoPrice({
                is_suspended: isRoomSuspended || decoEl.classList.contains('suspended'),
                width_m: decoEl.querySelector('input[name="deco_width_m"]')?.value,
                height_m: decoEl.querySelector('input[name="deco_height_m"]')?.value,
                price_sqyd: decoEl.querySelector('input[name="deco_price_sqyd"]')?.value,
            });
            roomTotal += price;
            if (price > 0) totalItems++;
        });

        // Calculate for wallpapers
        roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wpEl => {
            const price = CALC.calculateWallpaperPrice({
                is_suspended: isRoomSuspended || wpEl.classList.contains('suspended'),
                height_m: wpEl.querySelector('input[name="wallpaper_height_m"]')?.value,
                price_per_roll: wpEl.querySelector('input[name="wallpaper_price_roll"]')?.value,
                install_cost_per_roll: wpEl.querySelector('input[name="wallpaper_install_cost"]')?.value,
                widths: Array.from(wpEl.querySelectorAll('input[name="wall_width_m"]')).map(i => i.value),
            });
            roomTotal += price;
            if (price > 0) totalItems++;
        });

        const roomBriefEl = roomEl.querySelector('[data-room-brief]');
        if (roomBriefEl) {
            roomBriefEl.textContent = isRoomSuspended ? '(ระงับชั่วคราว)' : `${fmtTH(roomTotal)} บาท`;
        }
        
        grandTotal += isRoomSuspended ? 0 : roomTotal;
    });

    const grandTotalEl = document.querySelector(SELECTORS.grandTotal);
    const itemCountEl = document.querySelector(SELECTORS.setCount);

    if (grandTotalEl) grandTotalEl.textContent = fmtTH(grandTotal);
    if (itemCountEl) itemCountEl.textContent = totalItems;
}


export function loadPayload(payload) {
    if (!payload || !payload.rooms) return;

    const roomsContainer = document.querySelector(SELECTORS.roomsContainer);
    if (!roomsContainer) return;

    roomsContainer.innerHTML = "";
    roomCount = 0;

    // Load customer info
    const customerNameEl = document.querySelector('#customer_name');
    const customerPhoneEl = document.querySelector('#customer_phone');
    const customerAddressEl = document.querySelector('#customer_address');
    if(customerNameEl) customerNameEl.value = payload.customer_name || '';
    if(customerPhoneEl) customerPhoneEl.value = payload.customer_phone || '';
    if(customerAddressEl) customerAddressEl.value = payload.customer_address || '';


    payload.rooms.forEach(roomData => {
        roomCount++;
        const roomTemplate = document.querySelector('#roomTpl');
        if (!roomTemplate) return;

        const roomClone = roomTemplate.content.cloneNode(true);
        const newRoomEl = roomClone.querySelector(SELECTORS.room);
        if (!newRoomEl) return;

        newRoomEl.id = roomData.id || `room-${Date.now()}`;
        if (roomData.is_suspended) newRoomEl.classList.add('suspended');
        
        const roomNameInput = newRoomEl.querySelector(SELECTORS.roomNameInput);
        if(roomNameInput) roomNameInput.value = roomData.room_name || `ห้อง ${roomCount}`;

        const setsContainer = newRoomEl.querySelector(SELECTORS.setsContainer);
        const decoContainer = newRoomEl.querySelector(SELECTORS.decorationsContainer);
        const wallpaperContainer = newRoomEl.querySelector(SELECTORS.wallpapersContainer);
        
        // Templates
        const setTemplate = document.querySelector('#setTpl');
        const decoTemplate = document.querySelector('#decoTpl');
        const wallpaperTemplate = document.querySelector('#wallpaperTpl');
        const wallTemplate = document.querySelector('#wallTpl');

        if (setsContainer && setTemplate && roomData.sets) {
            roomData.sets.forEach(set => {
                const setClone = setTemplate.content.cloneNode(true);
                const newSetEl = setClone.querySelector(SELECTORS.set);
                if (set.is_suspended) newSetEl.classList.add('suspended');
                
                newSetEl.querySelector('input[name="width_m"]').value = set.width_m || '';
                newSetEl.querySelector('input[name="height_m"]').value = set.height_m || '';
                newSetEl.querySelector('select[name="set_style"]').value = set.style || 'ลอน';
                newSetEl.querySelector('select[name="fabric_variant"]').value = set.fabric_variant || 'ทึบ';
                newSetEl.querySelector('select[name="set_price_per_m"]').value = set.price_per_m_raw || '';
                newSetEl.querySelector('select[name="sheer_price_per_m"]').value = set.sheer_price_per_m || '';
                newSetEl.querySelector('select[name="opening_style"]').value = set.opening_style || 'แยกกลาง';
                newSetEl.querySelector('select[name="track_color"]').value = set.track_color || 'ขาว';
                newSetEl.querySelector('input[name="fabric_code"]').value = set.fabric_code || '';
                newSetEl.querySelector('input[name="sheer_fabric_code"]').value = set.sheer_fabric_code || '';
                newSetEl.querySelector('input[name="notes"]').value = set.notes || '';
                
                handleSheerCodeVisibility(newSetEl);
                setsContainer.appendChild(setClone);
            });
        }
        
        if (decoContainer && decoTemplate && roomData.decorations) {
            roomData.decorations.forEach(deco => {
                const decoClone = decoTemplate.content.cloneNode(true);
                const newDecoEl = decoClone.querySelector(SELECTORS.decoItem);
                if (deco.is_suspended) newDecoEl.classList.add('suspended');
                
                const decoTypeEl = newDecoEl.querySelector('select[name="deco_type"]');
                decoTypeEl.value = deco.type || '';
                newDecoEl.querySelector('.deco-type-display').textContent = deco.type || '';

                newDecoEl.querySelector('input[name="deco_width_m"]').value = deco.width_m || '';
                newDecoEl.querySelector('input[name="deco_height_m"]').value = deco.height_m || '';
                newDecoEl.querySelector('input[name="deco_price_sqyd"]').value = deco.price_sqyd || '';
                newDecoEl.querySelector('input[name="deco_code"]').value = deco.deco_code || '';
                newDecoEl.querySelector('input[name="deco_notes"]').value = deco.notes || '';
                decoContainer.appendChild(decoClone);
            });
        }

        if (wallpaperContainer && wallpaperTemplate && roomData.wallpapers) {
            roomData.wallpapers.forEach(wp => {
                const wpClone = wallpaperTemplate.content.cloneNode(true);
                const newWpEl = wpClone.querySelector(SELECTORS.wallpaperItem);
                if (wp.is_suspended) newWpEl.classList.add('suspended');

                newWpEl.querySelector('input[name="wallpaper_height_m"]').value = wp.height_m || '';
                newWpEl.querySelector('input[name="wallpaper_code"]').value = wp.wallpaper_code || '';
                newWpEl.querySelector('input[name="wallpaper_price_roll"]').value = wp.price_per_roll || '';
                newWpEl.querySelector('input[name="wallpaper_install_cost"]').value = wp.install_cost_per_roll || '300';
                newWpEl.querySelector('input[name="wallpaper_notes"]').value = wp.notes || '';

                const wallsContainer = newWpEl.querySelector(SELECTORS.wallsContainer);
                if (wallsContainer && wallTemplate && wp.widths) {
                    wp.widths.forEach(width => {
                        const wallClone = wallTemplate.content.cloneNode(true);
                        wallClone.querySelector('input[name="wall_width_m"]').value = width || '';
                        wallsContainer.appendChild(wallClone);
                    });
                }
                wallpaperContainer.appendChild(wpClone);
            });
        }
        roomsContainer.appendChild(roomClone);
    });

    renumberItemTitles();
    recalcAll();
    updateQuickNavMenu();
    updateToggleAllButtonState();
    showToast('นำเข้าข้อมูลสำเร็จ', 'success');
}


// ***** FIX: ADDED 'export' KEYWORD HERE *****
export function renderPdf(quotation, method) {
    const printableContent = document.querySelector(SELECTORS.printableContent);
    if (!printableContent || !quotation || !quotation.html) return;
    
    printableContent.innerHTML = quotation.html;
    
    setTimeout(() => {
        if (method === 'direct') {
            const element = document.getElementById('quotation-template');
            if (element) {
                html2pdf().from(element).set({
                    margin: [15, 12, 10, 12],
                    filename: `${quotation.fileName}.pdf`,
                    pagebreak: { mode: ['css', 'legacy'] },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                }).save().then(() => {
                     printableContent.innerHTML = '';
                });
            }
        } else if (method === 'print') {
            window.print();
            printableContent.innerHTML = '';
        }
    }, PDF_EXPORT_DELAY_MS);
}

export function exportAsHtmlFile(quotation) {
    if (!quotation || !quotation.html) return;
    const blob = new Blob([quotation.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quotation.fileName}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export ไฟล์ HTML สำเร็จ', 'success');
}

// --- EVENT HANDLERS ---
export const handleFormClick = (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || (isLocked && !btn.closest('.unlockable'))) return;

    const action = btn.dataset.act;
    const roomEl = btn.closest(SELECTORS.room);
    
    const performAction = (item, { confirm = false, isRemoval = false, title = '', body = '', actionFn, toastMsg = '' }) => {
        if (!item) return;
        const confirmedAction = () => {
            actionFn(item, toastMsg);
            if (!isRemoval) {
                 if (toastMsg) showToast(toastMsg);
                 recalc(item);
                 saveData();
            }
        };
        if (confirm) {
            showConfirmation(title, body).then(ok => ok && confirmedAction());
        } else {
            confirmedAction();
        }
    };
    
    const actions = {
        'add-room': addRoom,
        'add-set': () => addSet(roomEl),
        'add-deco': () => addDeco(roomEl),
        'add-wallpaper': () => addWallpaper(roomEl),
        'add-wall': () => addWall(btn),
        'toggle-room-menu': () => {
            e.preventDefault();
            const menu = btn.nextElementSibling;
            if (!menu) return;
            const isOpening = !menu.classList.contains('show');
            // Close all other menus
            document.querySelectorAll('.room-options-menu.show').forEach(m => m.classList.remove('show'));
            // Toggle current menu
            if (isOpening) menu.classList.add('show');
        },
        'toggle-suspend-room': () => { e.preventDefault(); roomEl?.classList.toggle('suspended'); recalcAll(); saveData(); },
        'toggle-suspend': () => { e.preventDefault(); btn.closest('.item-card')?.classList.toggle('suspended'); recalc(btn); saveData(); },
        'clear-room': () => performAction(roomEl, { confirm: true, title: 'ล้างข้อมูลในห้อง', body: 'ยืนยันลบทุกรายการในห้องนี้?', actionFn: item => {
            item.querySelector(SELECTORS.setsContainer).innerHTML = "";
            item.querySelector(SELECTORS.decorationsContainer).innerHTML = "";
            item.querySelector(SELECTORS.wallpapersContainer).innerHTML = "";
        }, toastMsg: 'ล้างข้อมูลในห้องแล้ว' }),
        'del-room': () => performAction(roomEl, { confirm: true, isRemoval: true, title: 'ลบห้อง', body: 'ยืนยันการลบห้องนี้?', actionFn: animateAndRemove, toastMsg: 'ลบห้องแล้ว' }),
        'del-set': () => performAction(btn.closest(SELECTORS.set), { confirm: true, isRemoval: true, title: 'ลบรายการ', body: 'ยืนยันการลบรายการผ้าม่าน?', actionFn: animateAndRemove, toastMsg: 'ลบรายการผ้าม่านแล้ว' }),
        'del-deco': () => performAction(btn.closest(SELECTORS.decoItem), { confirm: true, isRemoval: true, title: 'ลบรายการ', body: 'ยืนยันการลบรายการตกแต่ง?', actionFn: animateAndRemove, toastMsg: 'ลบรายการตกแต่งแล้ว' }),
        'del-wallpaper': () => performAction(btn.closest(SELECTORS.wallpaperItem), { confirm: true, isRemoval: true, title: 'ลบรายการ', body: 'ยืนยันการลบรายการวอลเปเปอร์?', actionFn: animateAndRemove, toastMsg: 'ลบรายการวอลเปเปอร์แล้ว' }),
        'del-wall': () => performAction(btn.closest('.wall-input-row'), { confirm: false, isRemoval: true, actionFn: animateAndRemove }),
    };

    if (actions[action]) {
        actions[action]();
        renumberItemTitles(); // Renumber everything after an action
    }
};

export function toggleLock() {
    isLocked = !isLocked;
    updateLockState();
}