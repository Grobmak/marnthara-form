// --- MAIN APPLICATION ENTRY POINT ---
import { SELECTORS, STORAGE_KEY, WEBHOOK_URL, SHOP_CONFIG, PRICING } from './lib/config.js';
import { saveData, buildPayload } from './lib/storage.js';
import { generateSummaryText, generateQuotationHtml, generateOverviewHtml } from './lib/documentGenerator.js';
import {
    addRoom,
    recalcAll,
    loadPayload,
    toggleLock,
    updateLockState,
    updateToggleAllButtonState,
    handleToggleAllRooms,
    updateQuickNavMenu,
    showConfirmation,
    showModal,
    showToast,
    showExportOptionsModal,
    renderPdf,
    exportAsHtmlFile,
    handleFormInput,
    handleFormChange,
    handleFormClick,
    handleFormBlur
} from './lib/ui.js';
import './style.css';                 // << เพิ่มบรรทัดนี้
import { init } from './lib/ui.js';   // ไม่เปลี่ยน
import { throttle } from './lib/utils.js'; // ไม่เปลี่ยน

init();


/**
 * Populates the price selection dropdowns within the set template.
 * This ensures that any new 'set' (curtain item) created will have the price options ready.
 */
function populatePriceDropdowns() {
    const setTemplate = document.querySelector(SELECTORS.setTpl);
    if (!setTemplate) return;

    const fabricSelect = setTemplate.content.querySelector('select[name="set_price_per_m"]');
    const sheerSelect = setTemplate.content.querySelector('select[name="sheer_price_per_m"]');

    const createOptions = (prices) => {
        let optionsHtml = '<option value="" hidden>เลือกราคา</option>';
        prices.forEach(price => {
            // Format the display text with a comma, but keep the value as a clean number
            optionsHtml += `<option value="${price}">${price.toLocaleString('th-TH')}</option>`;
        });
        return optionsHtml;
    };

    if (fabricSelect) {
        fabricSelect.innerHTML = createOptions(PRICING.fabric);
    }
    if (sheerSelect) {
        sheerSelect.innerHTML = createOptions(PRICING.sheer);
    }
}


function init() {
    populatePriceDropdowns();

    const orderForm = document.querySelector(SELECTORS.orderForm);
    const fileImporter = document.querySelector(SELECTORS.fileImporter);
    const menuDropdown = document.querySelector(SELECTORS.menuDropdown);
    const quickNavDropdown = document.querySelector(SELECTORS.quickNavDropdown);

    // --- MAIN EVENT LISTENERS ---
    orderForm.addEventListener("input", handleFormInput);
    orderForm.addEventListener("change", handleFormChange);
    orderForm.addEventListener("click", handleFormClick);
    orderForm.addEventListener("blur", handleFormBlur, true);

    document.body.addEventListener('click', (e) => {
        if (e.target.closest('summary')) {
            setTimeout(updateToggleAllButtonState, 50);
        }
    });

    // --- HEADER & FOOTER ACTIONS ---
    document.querySelector(SELECTORS.lockBtn).addEventListener('click', toggleLock);
    document.querySelector(SELECTORS.toggleAllRoomsBtn).addEventListener('click', handleToggleAllRooms);
    
    document.querySelector(SELECTORS.quickNavBtn).addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.classList.remove('show');
        quickNavDropdown.classList.toggle('show');
    });

    document.querySelector(SELECTORS.quickNavRoomList).addEventListener('click', (e) => {
        const link = e.target.closest('a[data-jump-to]');
        if (link) {
            e.preventDefault();
            const targetId = link.dataset.jumpTo;
            const targetRoom = document.getElementById(targetId);
            if (targetRoom) {
                document.body.classList.add('disable-animations');
                targetRoom.open = true;
                targetRoom.scrollIntoView({ behavior: 'auto', block: 'start' });
                targetRoom.classList.add('scrolling-jump');
                
                setTimeout(() => {
                    targetRoom.classList.remove('scrolling-jump');
                    document.body.classList.remove('disable-animations');
                    updateToggleAllButtonState();
                }, 1000);
            }
            quickNavDropdown.classList.remove('show');
        }
    });

    const _addRoomQuickBtn = document.querySelector('#addRoomQuickNavBtn');
    if (_addRoomQuickBtn) {
        const addRoomThrottled = throttle(addRoom, 700);
        _addRoomQuickBtn.addEventListener('click', (e) => { e.stopPropagation(); addRoomThrottled(); quickNavDropdown.classList.remove('show'); });
    }

    document.querySelector(SELECTORS.menuBtn).addEventListener('click', (e) => {
        e.stopPropagation();
        quickNavDropdown.classList.remove('show');
        menuDropdown.classList.toggle('show');
    });

    // --- MENU ACTIONS ---
    document.querySelector('#overviewBtn').addEventListener('click', async (e) => {
        e.preventDefault();
        menuDropdown.classList.remove('show');
        const payload = buildPayload();
        const overviewHtml = generateOverviewHtml(payload);
        const modalBody = document.querySelector('#overviewModalBody');
        if (modalBody) {
            modalBody.innerHTML = overviewHtml;
            showModal('#overviewModal', () => {});
        }
    });

    document.querySelector(SELECTORS.exportPdfBtn).addEventListener('click', async (e) => {
        e.preventDefault();
        menuDropdown.classList.remove('show');
        const options = await showExportOptionsModal();
        if (!options) return;

        const payload = buildPayload();
        const vatRate = options.vatOption === 'include' ? SHOP_CONFIG.baseVatRate : 0;
        const quotation = generateQuotationHtml(payload, { vatRate });

        if (!quotation) {
            showToast('ไม่มีรายการที่มีราคาสำหรับสร้างเอกสาร', 'warning');
            return;
        }

        if (options.exportMethod === 'html') {
            exportAsHtmlFile(quotation);
        } else {
            renderPdf(quotation, options.exportMethod);
        }
    });

    document.querySelector(SELECTORS.importBtn).addEventListener('click', (e) => {
        e.preventDefault();
        menuDropdown.classList.remove('show');
        fileImporter.click();
    });

    fileImporter.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const payload = JSON.parse(event.target.result);
                loadPayload(payload);
            } catch (err) {
                showToast('ไฟล์ JSON ไม่ถูกต้อง', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = null;
    });

    document.querySelector(SELECTORS.exportBtn).addEventListener('click', (e) => {
        e.preventDefault();
        menuDropdown.classList.remove('show');
        try {
            const payload = buildPayload();
            const dataStr = JSON.stringify(payload, null, 4);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const today = new Date();
            const dateSuffix = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
            const customerName = (payload.customer_name || 'data').trim().replace(/\s+/g, '-');
            a.href = url;
            a.download = `marnthara-backup-${customerName}-${dateSuffix}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Export ข้อมูลสำเร็จ', 'success');
        } catch (err) {
            showToast('Export ข้อมูลล้มเหลว', 'error');
        }
    });

    document.querySelector(SELECTORS.submitBtn).addEventListener('click', async (e) => {
        e.preventDefault();
        menuDropdown.classList.remove('show');
        if (await showConfirmation('ส่งข้อมูล', 'ยืนยันการส่งข้อมูลการประเมินราคา?')) {
            const payload = buildPayload();
            if (!payload.customer_name && !payload.customer_phone) {
                showToast('กรุณาระบุชื่อหรือเบอร์โทรลูกค้า', 'warning');
                return;
            }
            showToast('กำลังส่งข้อมูล...', 'default');
            try {
                const response = await fetch(WEBHOOK_URL, {
                    method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                if (response.ok) showToast('ส่งข้อมูลสำเร็จ!', 'success');
                else showToast(`ส่งข้อมูลล้มเหลว: ${response.status}`, 'error');
            } catch (err) {
                showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
            }
        }
    });

    document.querySelector(SELECTORS.copyTextBtn).addEventListener('click', async (e) => {
        e.preventDefault();
        menuDropdown.classList.remove('show');
        const copyModal = document.querySelector(SELECTORS.copyOptionsModal);
        copyModal.querySelector('input[name="copy_option"][value="customer"]').checked = true;
        if (await showModal(SELECTORS.copyOptionsModal)) {
            const selectedOption = copyModal.querySelector('input[name="copy_option"]:checked').value;
            const summary = generateSummaryText(buildPayload(), selectedOption);
            try {
                await navigator.clipboard.writeText(summary);
                showToast('คัดลอกสรุปสำเร็จ!', 'success');
            } catch (err) {
                showToast('คัดลอกล้มเหลว', 'error');
            }
        }
    });

    document.querySelector(SELECTORS.clearItemsBtn).addEventListener('click', async (e) => {
        e.preventDefault();
        menuDropdown.classList.remove('show');
        if (await showConfirmation('ล้างทุกรายการ', 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการสินค้าทั้งหมด (ข้อมูลลูกค้าและห้องจะยังคงอยู่)?')) {
            document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
                roomEl.querySelector(SELECTORS.setsContainer).innerHTML = '';
                roomEl.querySelector(SELECTORS.decorationsContainer).innerHTML = '';
                roomEl.querySelector(SELECTORS.wallpapersContainer).innerHTML = '';
            });
            recalcAll();
            saveData();
            showToast('ล้างทุกรายการแล้ว', 'success');
        }
    });

    document.querySelector(SELECTORS.clearAllBtn).addEventListener('click', async (e) => {
        e.preventDefault();
        menuDropdown.classList.remove('show');
        if (await showConfirmation('ลบข้อมูลทั้งหมด', 'คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลทั้งหมดในฟอร์มนี้? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
            localStorage.removeItem(STORAGE_KEY);
            window.location.reload();
        }
    });

    // --- GLOBAL LISTENERS ---
    window.addEventListener('click', (e) => {
        if (!e.target.closest('.menu-container')) {
            menuDropdown.classList.remove('show');
            quickNavDropdown.classList.remove('show');
        }
        if (!e.target.closest('.room-options-container')) {
            document.querySelectorAll('.room-options-menu.show').forEach(menu => menu.classList.remove('show'));
            document.querySelectorAll('.card.overflow-visible').forEach(c => c.classList.remove('overflow-visible'));
        }
    });

    // --- INITIAL LOAD ---
    try {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            loadPayload(JSON.parse(storedData));
        } else {
            addRoom();
            const customerCard = document.querySelector('#customerDetailsCard');
            if(customerCard) customerCard.open = true;
        }
    } catch(err) {
        localStorage.removeItem(STORAGE_KEY);
        addRoom();
    }
    recalcAll();
    updateLockState();
    updateToggleAllButtonState();
}

// --- START THE APP ---
document.addEventListener('DOMContentLoaded', init);