// --- UI MANIPULATION & EVENT HANDLING ---
import { SELECTORS, PRICING, SQM_TO_SQYD, PDF_EXPORT_DELAY_MS } from './config.js';
import { clamp01, fmtTH, toNum } from './utils.js';
import { CALC, stylePlus, heightPlus } from './calculations.js';
import { saveData, buildPayload } from './storage.js';
import { generateQuotationHtml } from './documentGenerator.js';

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
        const confirmBtn = modalEl.querySelector('[id*="Confirm"]');
        const cancelBtn = modalEl.querySelector('[id*="Cancel"]');
        const cleanup = (result) => {
            modalEl.classList.remove('visible');
            if (confirmBtn) confirmBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
            resolve(result);
        };
        if (confirmBtn) confirmBtn.onclick = () => cleanup(true);
        if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
    });
};

export async function showConfirmation(title, body) {
    const modalEl = document.querySelector(SELECTORS.modal);
    if (!modalEl) return true;
    modalEl.querySelector(SELECTORS.modalTitle).textContent = title;
    modalEl.querySelector(SELECTORS.modalBody).textContent = body;
    return await showModal(SELECTORS.modal);
}

export async function showExportOptionsModal() {
    const confirmed = await showModal(SELECTORS.exportOptionsModal);
    if (!confirmed) return null;
    const modalEl = document.querySelector(SELECTORS.exportOptionsModal);
    return {
        vatOption: modalEl.querySelector('input[name="vat_option"]:checked').value,
        exportMethod: modalEl.querySelector('#exportMethod').value,
    };
}

function animateAndScroll(element) {
    if (!element) return;
    if (document.body.classList.contains('disable-animations')) {
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
        return;
    }
    try {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
    element.classList.add('item-created');
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        element.classList.remove('item-created');
    };
    element.addEventListener('animationend', () => cleanup(), { once: true });
    setTimeout(cleanup, 900);
};

export function animateAndRemove(item) {
    if (!item) return;
    const parentScrollTarget = item.parentElement?.closest('.card, .items-container') || document.body;
    try {
        parentScrollTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {}
    item.classList.add('item-removing');
    let removed = false;
    const doRemove = () => {
        if (removed) return;
        removed = true;
        try { item.remove(); } catch (e) {}
        try { renumber(); recalcAll(); saveData(); } catch (e) {}
    };
    item.addEventListener('animationend', () => doRemove(), { once: true });
    setTimeout(doRemove, 700);
}

// --- CORE UI FUNCTIONS ---

function renumber() {
    document.querySelectorAll(SELECTORS.room).forEach((room, rIdx) => {
        room.querySelector(SELECTORS.roomNameInput).placeholder = `ห้อง ${String(rIdx + 1).padStart(2, "0")}`;
        const items = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`);
        const totalItemsInRoom = items.length;
        items.forEach((item, iIdx) => {
            const titleEl = item.querySelector("[data-item-title]");
            if (titleEl) titleEl.textContent = `${iIdx + 1}/${totalItemsInRoom}`;
        });
    });
    updateQuickNavMenu();
}

function addWall(btn, prefillWidth) {
    if (isLocked) return;
    const wallsContainer = btn.closest(SELECTORS.wallpaperItem)?.querySelector(SELECTORS.wallsContainer);
    const frag = document.querySelector(SELECTORS.wallTpl)?.content?.cloneNode(true);
    if (!frag || !wallsContainer) return;
    if (prefillWidth) {
        frag.querySelector('input[name="wall_width_m"]').value = prefillWidth > 0 ? prefillWidth.toFixed(2) : "";
    }
    wallsContainer.appendChild(frag);
    const newWallInputRow = wallsContainer.querySelector('.wall-input-row:last-of-type');
    if (newWallInputRow) {
        animateAndScroll(newWallInputRow);
        newWallInputRow.querySelector('input').focus();
    }
}

function addWallpaper(roomEl, prefill) {
    if (isLocked) return;
    const wallpaperWrap = roomEl.querySelector(SELECTORS.wallpapersContainer);
    const frag = document.querySelector(SELECTORS.wallpaperTpl)?.content?.cloneNode(true);
    if (!frag || !wallpaperWrap) return;
    wallpaperWrap.appendChild(frag);
    const created = wallpaperWrap.querySelector(`${SELECTORS.wallpaperItem}:last-of-type`);

    if (prefill) {
        created.querySelector('[name="wallpaper_height_m"]').value = prefill.height_m > 0 ? prefill.height_m.toFixed(2) : "";
        created.querySelector('[name="wallpaper_code"]').value = prefill.wallpaper_code || "";
        created.querySelector('[name="wallpaper_price_roll"]').value = fmtTH(prefill.price_per_roll) ?? "";
        created.querySelector('[name="wallpaper_install_cost"]').value = fmtTH(prefill.install_cost_per_roll ?? 300);
        created.querySelector('[name="wallpaper_notes"]').value = prefill.wallpaper_notes || "";
        (prefill.widths || []).forEach(w => addWall(created.querySelector('[data-act="add-wall"]'), w));
        if (prefill.is_suspended) suspendItem(created, true, false);
    } else {
        addWall(created.querySelector('[data-act="add-wall"]'));
        animateAndScroll(created);
    }
    renumber();
    recalcAll();
    saveData();
}

function addDeco(roomEl, prefill) {
    if (isLocked) return;
    const decoWrap = roomEl.querySelector(SELECTORS.decorationsContainer);
    const frag = document.querySelector(SELECTORS.decoTpl)?.content?.cloneNode(true);
    if (!frag || !decoWrap) return;
    decoWrap.appendChild(frag);
    const created = decoWrap.querySelector(`${SELECTORS.decoItem}:last-of-type`);

    if (prefill) {
        const type = prefill.type || "";
        created.querySelector('[name="deco_type"]').value = type;
        created.querySelector('[name="deco_width_m"]').value = prefill.width_m > 0 ? prefill.width_m.toFixed(2) : "";
        created.querySelector('[name="deco_height_m"]').value = prefill.height_m > 0 ? prefill.height_m.toFixed(2) : "";
        created.querySelector('[name="deco_price_sqyd"]').value = fmtTH(prefill.price_sqyd) ?? "";
        created.querySelector('[name="deco_code"]').value = prefill.deco_code || "";
        created.querySelector('[name="deco_notes"]').value = prefill.deco_notes || "";
        const displayEl = created.querySelector('.deco-type-display');
        if (displayEl && type) {
            displayEl.textContent = `(${type})`;
        }
        if (prefill.is_suspended) suspendItem(created, true, false);
    } else {
        animateAndScroll(created);
    }
    renumber();
    recalcAll();
    saveData();
}

function populatePriceOptions(selectEl, prices) {
    if (!selectEl) return;
    selectEl.innerHTML = `<option value="" hidden>เลือกราคา</option>`;
    prices.forEach(p => {
        const option = document.createElement('option');
        option.value = p;
        option.textContent = p.toLocaleString("th-TH");
        selectEl.appendChild(option);
    });
}

export function toggleSetFabricUI(setEl) {
    if (!setEl) return;
    const variant = setEl.querySelector('select[name="fabric_variant"]').value;
    const hasSheer = variant === "โปร่ง" || variant === "ทึบ&โปร่ง";
    setEl.querySelector(SELECTORS.sheerWrap)?.classList.toggle("hidden", !hasSheer);
    setEl.querySelector(SELECTORS.sheerCodeWrap)?.classList.toggle("hidden", !hasSheer);
}

function addSet(roomEl, prefill) {
    if (isLocked) return;
    const setsWrap = roomEl.querySelector(SELECTORS.setsContainer);
    const frag = document.querySelector(SELECTORS.setTpl)?.content?.cloneNode(true);
    if (!frag || !setsWrap) return;
    setsWrap.appendChild(frag);
    const created = setsWrap.querySelector(`${SELECTORS.set}:last-of-type`);

    populatePriceOptions(created.querySelector('select[name="set_price_per_m"]'), PRICING.fabric);
    populatePriceOptions(created.querySelector('select[name="sheer_price_per_m"]'), PRICING.sheer);

    if (prefill) {
        created.querySelector('input[name="width_m"]').value = prefill.width_m > 0 ? prefill.width_m.toFixed(2) : "";
        created.querySelector('input[name="height_m"]').value = prefill.height_m > 0 ? prefill.height_m.toFixed(2) : "";
        created.querySelector('select[name="set_style"]').value = prefill.style || "ลอน";
        created.querySelector('select[name="fabric_variant"]').value = prefill.fabric_variant || "ทึบ";
        created.querySelector('select[name="set_price_per_m"]').value = prefill.price_per_m_raw || "";
        created.querySelector('select[name="sheer_price_per_m"]').value = prefill.sheer_price_per_m || "";
        created.querySelector('input[name="fabric_code"]').value = prefill.fabric_code || "";
        created.querySelector('input[name="sheer_fabric_code"]').value = prefill.sheer_fabric_code || "";
        created.querySelector('select[name="opening_style"]').value = prefill.opening_style || "แยกกลาง";
        created.querySelector('select[name="track_color"]').value = prefill.track_color || "ขาว";
        created.querySelector('input[name="notes"]').value = prefill.notes || "";
        if (prefill.is_suspended) suspendItem(created, true, false);
    } else {
         animateAndScroll(created);
    }
    toggleSetFabricUI(created);
    renumber();
    recalcAll();
    saveData();
}

export function addRoom(prefill) {
    if (isLocked) return;
    roomCount++;
    const frag = document.querySelector(SELECTORS.roomTpl)?.content?.cloneNode(true);
    if (!frag) return;
    const room = frag.querySelector(SELECTORS.room);
    room.dataset.index = roomCount;
    room.id = `room-${Date.now()}`;
    document.querySelector(SELECTORS.roomsContainer).appendChild(frag);
    const created = document.querySelector(`${SELECTORS.room}:last-of-type`);

    if (prefill) {
        created.querySelector(SELECTORS.roomNameInput).value = prefill.room_name || "";
        if (prefill.is_suspended) {
            setTimeout(() => suspendRoom(created, true, false), 0);
        }
        (prefill.sets || []).forEach(s => addSet(created, s));
        (prefill.decorations || []).forEach(d => addDeco(created, d));
        (prefill.wallpapers || []).forEach(w => addWallpaper(created, w));
    }

    renumber();
    recalcAll();
    saveData();
    if (!prefill) {
        showToast('เพิ่มห้องใหม่แล้ว', 'success');
        animateAndScroll(created);
    }
    updateToggleAllButtonState();
}

function suspendItem(item, isSuspended, notify = true) {
    item.dataset.suspended = isSuspended;
    item.classList.toggle('is-suspended', isSuspended);
    const suspendIcon = item.querySelector('[data-act="toggle-suspend"] i');
    if (suspendIcon) {
        suspendIcon.className = isSuspended ? 'ph-bold ph-play-circle' : 'ph-bold ph-pause-circle';
    }
    if (notify) showToast(`รายการถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
}

function suspendRoom(roomEl, isSuspended, notify = true) {
    roomEl.dataset.suspended = isSuspended;
    roomEl.classList.toggle('is-suspended', isSuspended);

    const suspendText = roomEl.querySelector('[data-act="toggle-suspend-room"] span');
    if (suspendText) {
        suspendText.textContent = isSuspended ? 'ใช้งานห้อง' : 'ระงับห้อง';
    }

    roomEl.querySelectorAll('.set-item, .deco-item, .wallpaper-item').forEach(item => {
        suspendItem(item, isSuspended, false);
    });

    if (notify) showToast(`ห้องถูก${isSuspended ? 'ระงับ' : 'ใช้งาน'}แล้ว`, 'warning');
    recalcAll();
    saveData();
}

// --- RECALCULATION & UI UPDATE ---
export function recalcAll() {
    let grand = 0, grandOpaqueYards = 0, grandSheerYards = 0, grandOpaqueTrack = 0, grandSheerTrack = 0;
    let totalWallpaperRolls = 0;
    let hasDoubleBracket = false;
    const decoCounts = {};
    let pricedItemCount = 0;

    document.querySelectorAll(SELECTORS.room).forEach(room => {
        let roomSum = 0;
        const isRoomSuspended = room.dataset.suspended === 'true';

        room.querySelectorAll(SELECTORS.set).forEach(set => {
            let opaquePrice = 0, sheerPrice = 0, opaqueYards = 0, sheerYards = 0, opaqueTrack = 0, sheerTrack = 0;
            if (set.dataset.suspended !== 'true' && !isRoomSuspended) {
                const w = clamp01(set.querySelector('input[name="width_m"]')?.value);
                const h = clamp01(set.querySelector('input[name="height_m"]')?.value);
                const style = set.querySelector('select[name="set_style"]')?.value;
                const variant = set.querySelector('select[name="fabric_variant"]')?.value;
                const sPlus = stylePlus(style);
                const hPlus = heightPlus(h);
                if(variant === "ทึบ&โปร่ง") hasDoubleBracket = true;
                if (w > 0 && h > 0) {
                    if (variant.includes("ทึบ")) {
                        const baseRaw = clamp01(set.querySelector('select[name="set_price_per_m"]')?.value);
                        if (baseRaw > 0) {
                            opaquePrice = Math.round((baseRaw + sPlus + hPlus) * w);
                            opaqueYards = CALC.fabricYardage(style, w);
                            opaqueTrack = w;
                        }
                    }
                    if (variant.includes("โปร่ง")) {
                        const sheerBase = clamp01(set.querySelector('select[name="sheer_price_per_m"]')?.value);
                        if (sheerBase > 0) {
                            sheerPrice = Math.round((sheerBase + sPlus + hPlus) * w);
                            sheerYards = CALC.fabricYardage(style, w);
                            sheerTrack = w;
                        }
                    }
                }
                if (opaquePrice + sheerPrice > 0) pricedItemCount++;
            }
            const totalSetPrice = opaquePrice + sheerPrice;
            let summaryHtml = `ราคา: <b>${fmtTH(totalSetPrice)}</b> บ.`;
            const details = [];
            if (opaquePrice > 0) details.push(`ทึบ: ${fmtTH(opaquePrice)}`);
            if (sheerPrice > 0) details.push(`โปร่ง: ${fmtTH(sheerPrice)}`);
            if (details.length > 0 && totalSetPrice > 0) summaryHtml += ` <small>(${details.join(', ')})</small>`;
            set.querySelector('[data-set-summary]').innerHTML = summaryHtml;
            set.querySelector('[data-set-yardage-opaque]').textContent = fmtTH(opaqueYards, 2);
            set.querySelector('[data-set-opaque-track]').textContent = fmtTH(opaqueTrack, 2);
            set.querySelector('[data-set-yardage-sheer]').textContent = fmtTH(sheerYards, 2);
            set.querySelector('[data-set-sheer-track]').textContent = fmtTH(sheerTrack, 2);
            roomSum += opaquePrice + sheerPrice;
            grandOpaqueYards += opaqueYards;
            grandSheerYards += sheerYards;
            grandOpaqueTrack += opaqueTrack;
            grandSheerTrack += sheerTrack;
        });

        room.querySelectorAll(SELECTORS.decoItem).forEach(deco => {
            let decoPrice = 0, areaSqyd = 0;
            if (deco.dataset.suspended !== 'true' && !isRoomSuspended) {
                const w = clamp01(deco.querySelector('[name="deco_width_m"]')?.value);
                const h = clamp01(deco.querySelector('[name="deco_height_m"]')?.value);
                const price = clamp01(deco.querySelector('[name="deco_price_sqyd"]')?.value);
                areaSqyd = w * h * SQM_TO_SQYD;
                decoPrice = Math.round(areaSqyd * price);
                if (decoPrice > 0) {
                    pricedItemCount++;
                    const type = deco.querySelector('[name="deco_type"]').value.trim();
                    if(type) decoCounts[type] = (decoCounts[type] || 0) + 1;
                }
            }
            deco.querySelector('[data-deco-summary]').innerHTML = `ราคา: <b>${fmtTH(decoPrice)}</b> บ. • พื้นที่: <b>${fmtTH(areaSqyd, 2)}</b> ตร.หลา`;
            roomSum += decoPrice;
        });

        room.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaper => {
            let totalItemPrice = 0, materialPrice = 0, installPrice = 0, areaSqm = 0, rollsNeeded = 0;
            if (wallpaper.dataset.suspended !== 'true' && !isRoomSuspended) {
                const h = clamp01(wallpaper.querySelector('[name="wallpaper_height_m"]')?.value);
                const pricePerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_price_roll"]')?.value);
                const installCostPerRoll = clamp01(wallpaper.querySelector('[name="wallpaper_install_cost"]')?.value);
                const totalWidth = Array.from(wallpaper.querySelectorAll('input[name="wall_width_m"]')).reduce((sum, el) => sum + clamp01(el.value), 0);
                areaSqm = totalWidth * h;
                rollsNeeded = CALC.wallpaperRolls(totalWidth, h);
                materialPrice = Math.round(rollsNeeded * pricePerRoll);
                installPrice = Math.round(rollsNeeded * installCostPerRoll);
                totalItemPrice = materialPrice + installPrice;
                if (totalItemPrice > 0) {
                   pricedItemCount++;
                    if (Number.isFinite(rollsNeeded)) totalWallpaperRolls += rollsNeeded;
                }
            }
            let summaryHtml = `รวม: <b>${fmtTH(totalItemPrice)}</b> บ.`;
            if (totalItemPrice > 0) summaryHtml += ` <small>(วอลล์: ${fmtTH(materialPrice)}, ค่าช่าง: ${fmtTH(installPrice)})</small>`;
            summaryHtml += ` • พื้นที่: <b>${fmtTH(areaSqm, 2)}</b> ตร.ม. • ใช้: <b>${Number.isFinite(rollsNeeded) ? rollsNeeded : 'N/A'}</b> ม้วน`;
            wallpaper.querySelector('[data-wallpaper-summary]').innerHTML = summaryHtml;
            roomSum += totalItemPrice;
        });

        const itemCount = room.querySelectorAll(`${SELECTORS.set}, ${SELECTORS.decoItem}, ${SELECTORS.wallpaperItem}`).length;
        room.querySelector('[data-room-brief]').innerHTML = `<span>${itemCount} รายการ • ${fmtTH(roomSum)} บาท</span>`;
        grand += roomSum;
    });

    document.querySelector(SELECTORS.grandTotal).textContent = fmtTH(grand);
    document.querySelector(SELECTORS.setCount).textContent = pricedItemCount;

    const summaryContainer = document.querySelector(SELECTORS.detailedSummaryContainer);
    if(summaryContainer) {
        let html = '';
        if (grandOpaqueYards > 0 || grandSheerYards > 0) {
            html += `<h4><i class="ph-bold ph-blinds"></i> ผ้าม่าน</h4><ul>`;
            if (grandOpaqueYards > 0) html += `<li>ผ้าทึบ: <b>${fmtTH(grandOpaqueYards, 2)}</b> หลา</li>`;
            if (grandSheerYards > 0) html += `<li>ผ้าโปร่ง: <b>${fmtTH(grandSheerYards, 2)}</b> หลา</li>`;
            if (grandOpaqueTrack > 0) html += `<li>รางทึบ: <b>${fmtTH(grandOpaqueTrack, 2)}</b> ม.</li>`;
            if (grandSheerTrack > 0) html += `<li>รางโปร่ง: <b>${fmtTH(grandSheerTrack, 2)}</b> ม.</li>`;
            if (hasDoubleBracket) html += `<li class="summary-note">** มีรายการที่ต้องใช้ขาสองชั้น</li>`;
            html += `</ul>`;
        }
        if (Object.keys(decoCounts).length > 0) {
             html += `<h4><i class="ph-bold ph-file-image"></i> งานตกแต่ง</h4><ul>`;
             for (const type in decoCounts) html += `<li>${type}: <b>${decoCounts[type]}</b> ชุด</li>`;
             html += `</ul>`;
        }
        if (totalWallpaperRolls > 0) {
             html += `<h4><i class="ph-bold ph-paint-roller"></i> วอลเปเปอร์</h4><ul>`;
             html += `<li>จำนวนที่ต้องใช้: <b>${totalWallpaperRolls}</b> ม้วน</li>`;
             html += `</ul>`;
        }
        if (html === '') html = '<p class="empty-summary">ยังไม่มีรายการวัสดุ</p>';
        summaryContainer.innerHTML = html;
    }
}

// --- INTELLIGENT UI/UX FUNCTIONS ---
export function updateToggleAllButtonState() {
    const btn = document.querySelector(SELECTORS.toggleAllRoomsBtn);
    if (!btn) return;
    const allDetails = document.querySelectorAll(SELECTORS.allDetailsCards);
    const anyOpen = Array.from(allDetails).some(d => d.open);
    if (anyOpen) {
        btn.innerHTML = `<i class="ph ph-columns"></i> <span>ย่อทั้งหมด</span>`;
    } else {
        btn.innerHTML = `<i class="ph ph-rows"></i> <span>ขยายทั้งหมด</span>`;
    }
}

export function handleToggleAllRooms() {
    const allDetails = document.querySelectorAll(SELECTORS.allDetailsCards);
    const shouldOpen = !Array.from(allDetails).some(d => d.open);
    allDetails.forEach(detail => detail.open = shouldOpen);
    updateToggleAllButtonState();
}

function jumpToRoom(roomId) {
    const target = document.getElementById(roomId);
    if (target) {
        try {
            target.scrollIntoView({ behavior: 'auto', block: 'start' });
        } catch (e) {
            target.scrollIntoView();
        }
        target.classList.add('scrolling-jump');
        setTimeout(() => target.classList.remove('scrolling-jump'), 600);
    }
}

export function updateQuickNavMenu() {
    const roomListContainer = document.querySelector(SELECTORS.quickNavRoomList);
    const quickNavBtn = document.querySelector(SELECTORS.quickNavBtn);
    if (!roomListContainer || !quickNavBtn) return;

    roomListContainer.innerHTML = '';
    const rooms = document.querySelectorAll(SELECTORS.room);

    if (rooms.length === 0) {
        quickNavBtn.style.display = 'none';
        return;
    } else {
        quickNavBtn.style.display = 'inline-flex';
    }

    rooms.forEach((room, index) => {
        const roomNameInput = room.querySelector(SELECTORS.roomNameInput);
        const roomName = (roomNameInput && roomNameInput.value.trim()) ? roomNameInput.value.trim() : `ห้อง ${index + 1}`;
        const roomId = room.id || `room-${index+1}`;

        const link = document.createElement('a');
        link.href = `#${roomId}`;
        link.dataset.jumpTo = roomId;
        link.innerHTML = `<i class="ph ph-arrow-bend-right-up"></i> ${roomName}`;

        link.addEventListener('click', (e) => {
            e.preventDefault();
            jumpToRoom(roomId);
        });

        roomListContainer.appendChild(link);
    });
    updateToggleAllButtonState();
}

// --- LOCK & LOAD ---
export function updateLockState() {
    const lockBtn = document.querySelector(SELECTORS.lockBtn);
    if (!lockBtn) return;
    lockBtn.classList.toggle('is-locked', isLocked);
    lockBtn.title = isLocked ? 'ปลดล็อคฟอร์ม' : 'ล็อคฟอร์ม';
    lockBtn.querySelector('.lock-icon').className = isLocked ? 'ph-bold ph-lock-key lock-icon' : 'ph-bold ph-lock-key-open lock-icon';
    document.querySelectorAll('input, select, textarea, button').forEach(el => {
        const isExempt = el.closest('.summary-footer') || el.closest('.main-header') || el.closest('.modal-wrapper') || el.closest('.room-options-menu');
        if (!isExempt) el.disabled = isLocked;
    });
}

export function toggleLock() {
    isLocked = !isLocked;
    updateLockState();
    showToast(isLocked ? 'ฟอร์มถูกล็อคแล้ว' : 'ฟอร์มถูกปลดล็อคแล้ว', 'warning');
}

export function loadPayload(payload) {
    if (!payload || !payload.rooms) { showToast("ข้อมูลตัวเลขไม่ถูกต้อง", "error"); return; }
    document.querySelector('[name="customer_name"]').value = payload.customer_name || '';
    document.querySelector('[name="customer_address"]').value = payload.customer_address || '';
    document.querySelector('[name="customer_phone"]').value = payload.customer_phone || '';
    document.querySelector(SELECTORS.roomsContainer).innerHTML = "";
    roomCount = 0;
    if (payload.rooms.length > 0) payload.rooms.forEach(addRoom);
    else addRoom();

    setTimeout(() => {
        document.querySelectorAll(SELECTORS.allDetailsCards).forEach(card => card.open = false);
        updateToggleAllButtonState();
    }, 100);

    showToast("โหลดข้อมูลสำเร็จ", "success");
}

async function performActionWithConfirmation(btn, actionConfig) {
    if (isLocked) return;
    if (actionConfig.confirm && !await showConfirmation(actionConfig.title, actionConfig.body)) return;
    const item = btn.closest(actionConfig.selector);
    if (!item) return;
    if (actionConfig.toast) showToast(actionConfig.toast, 'success');
    if (actionConfig.isRemoval) {
        actionConfig.action(item);
    } else {
        actionConfig.action(item, btn);
        renumber();
        recalcAll();
        saveData();
    }
}

// --- EXPORT FUNCTIONS ---

export async function exportDirectPdf(htmlContent, fileName) {
    showToast('กำลังสร้าง PDF...', 'default');
    const element = document.createElement('div');
    element.innerHTML = htmlContent;
    const opt = {
        margin: 0,
        filename: `${fileName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    setTimeout(async () => {
        try {
            await html2pdf().from(element).set(opt).save();
            showToast('สร้าง PDF สำเร็จ!', 'success');
        } catch (error) {
            console.error("Direct PDF Export Error:", error);
            showToast('เกิดข้อผิดพลาด! ลองใช้วิธีที่ 2', 'error');
        }
    }, PDF_EXPORT_DELAY_MS);
}

export function exportWithBrowserPrint(htmlContent) {
    showToast('กำลังเตรียมพิมพ์... (วิธีที่ 2)', 'default');
    const container = document.querySelector(SELECTORS.printableContent);
    container.innerHTML = htmlContent;
    setTimeout(() => {
        window.print();
        setTimeout(() => { container.innerHTML = ''; }, 1000);
    }, 100);
}

export function exportAsHtmlFile(htmlContent, fileName) {
    showToast('กำลังสร้างไฟล์ HTML... (วิธีที่ 3)', 'default');
    const fullHtml = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>ใบเสนอราคา - ${fileName}</title><style>${Array.from(document.styleSheets[0].cssRules).map(r => r.cssText).join('')}</style></head><body>${htmlContent}</body></html>`;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('ดาวน์โหลด HTML สำเร็จ!', 'success');
}

// --- EVENT HANDLERS (for main.js) ---

export const handleFormInput = debounce((e) => {
    const el = e.target;
    if (el.name === 'deco_price_sqyd' || el.name === 'wallpaper_price_roll' || el.name === 'wallpaper_install_cost') {
        const value = toNum(el.value);
        const cursorPosition = el.selectionStart;
        const oldLength = el.value.length;
        el.value = value > 0 ? value.toLocaleString('en-US') : '';
        const newLength = el.value.length;
        el.setSelectionRange(cursorPosition + (newLength - oldLength), cursorPosition + (newLength - oldLength));
    }
    if (el.matches(SELECTORS.roomNameInput)) {
        debounce(updateQuickNavMenu, 300)();
    }
    recalcAll();
    saveData();
}, 150);

export const handleFormChange = (e) => {
    if (e.target.name === 'deco_type') {
        const itemCard = e.target.closest(SELECTORS.decoItem);
        if (itemCard) {
            const displayEl = itemCard.querySelector('.deco-type-display');
            if (displayEl) {
                const selectedText = e.target.options[e.target.selectedIndex]?.text || e.target.value;
                displayEl.textContent = selectedText ? `(${selectedText})` : '';
            }
        }
    }
    if (e.target.matches('select[name="fabric_variant"]')) {
        toggleSetFabricUI(e.target.closest(SELECTORS.set));
    }
    recalcAll();
    saveData();
};

export const handleFormClick = (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;

    const action = btn.dataset.act;
    const roomEl = btn.closest(SELECTORS.room);

    const roomMenu = btn.closest('.room-options-menu');
    if (roomMenu) {
        roomMenu.classList.remove('show');
        roomEl?.classList.remove('overflow-visible');
    }

    const actions = {
        'add-set': () => addSet(roomEl),
        'add-deco': () => addDeco(roomEl),
        'add-wallpaper': () => addWallpaper(roomEl),
        'add-wall': () => addWall(btn),
        'toggle-room-menu': () => {
             e.preventDefault();
             const menu = btn.nextElementSibling;
             const card = btn.closest('.room-card');
             const isOpening = !menu.classList.contains('show');
             document.querySelectorAll('.room-options-menu.show').forEach(m => {
                 m.classList.remove('show');
                 m.closest('.room-card')?.classList.remove('overflow-visible');
             });
             if (isOpening) {
                menu.classList.add('show');
                card?.classList.add('overflow-visible');
             }
        },
        'toggle-suspend-room': () => { e.preventDefault(); if(!roomEl) return; suspendRoom(roomEl, !(roomEl.dataset.suspended === 'true')); },
        'clear-room': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูลในห้อง', body: 'ยืนยันการลบทุกรายการในห้องนี้?', selector: SELECTORS.room, action: (item) => { item.querySelector(SELECTORS.setsContainer).innerHTML = ""; item.querySelector(SELECTORS.decorationsContainer).innerHTML = ""; item.querySelector(SELECTORS.wallpapersContainer).innerHTML = ""; }, toast: 'ล้างข้อมูลในห้องแล้ว' }),
        'del-room': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบห้อง', body: 'ยืนยันการลบห้องนี้?', selector: SELECTORS.room, action: animateAndRemove, toast: 'ลบห้องแล้ว' }),
        'del-set': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบจุด', body: 'ยืนยันการลบจุดติดตั้งนี้?', selector: SELECTORS.set, action: animateAndRemove, toast: 'ลบจุดผ้าม่านแล้ว' }),
        'del-deco': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบรายการ', body: 'ยืนยันการลบรายการตกแต่งนี้?', selector: SELECTORS.decoItem, action: animateAndRemove, toast: 'ลบรายการตกแต่งแล้ว' }),
        'del-wallpaper': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบรายการ', body: 'ยืนยันการลบรายการวอลเปเปอร์?', selector: SELECTORS.wallpaperItem, action: animateAndRemove, toast: 'ลบรายการวอลเปเปอร์แล้ว' }),
        'del-wall': () => performActionWithConfirmation(btn, { confirm: true, isRemoval: true, title: 'ลบผนัง', body: 'ยืนยันการลบผนังนี้?', selector: '.wall-input-row', action: animateAndRemove, toast: 'ลบผนังแล้ว' }),
        'clear-set': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูล', body: 'ยืนยันการล้างข้อมูลในจุดนี้?', selector: SELECTORS.set, action: (item) => { item.querySelectorAll('input, select').forEach(el => { el.value = el.name === 'fabric_variant' ? 'ทึบ' : el.name === 'set_style' ? 'ลอน' : el.name === 'opening_style' ? 'แยกกลาง' : el.name === 'track_color' ? 'ขาว' : ''; }); toggleSetFabricUI(item); }, toast: 'ล้างข้อมูลผ้าม่านแล้ว' }),
        'clear-deco': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูล', body: 'ยืนยันการล้างข้อมูลในรายการนี้?', selector: SELECTORS.decoItem, action: (item) => { item.querySelectorAll('input, select').forEach(el => el.value = ''); item.querySelector('.deco-type-display').textContent = ''; }, toast: 'ล้างข้อมูลตกแต่งแล้ว' }),
        'clear-wallpaper': () => performActionWithConfirmation(btn, { confirm: true, title: 'ล้างข้อมูล', body: 'ยืนยันการล้างข้อมูลในรายการนี้?', selector: SELECTORS.wallpaperItem, action: (item) => { item.querySelectorAll('input').forEach(el => { el.value = (el.name === 'wallpaper_install_cost') ? '300' : ''; }); item.querySelector(SELECTORS.wallsContainer).innerHTML = ''; addWall(item.querySelector('[data-act="add-wall"]')); }, toast: 'ล้างข้อมูลวอลเปเปอร์แล้ว' }),
        'toggle-suspend': () => {
            const item = btn.closest('.set-item, .deco-item, .wallpaper-item');
            suspendItem(item, !(item.dataset.suspended === 'true'));
            recalcAll(); saveData();
        }
    };
    if (actions[action]) {
        if (action !== 'toggle-room-menu') e.preventDefault();
        actions[action]();
    }
};