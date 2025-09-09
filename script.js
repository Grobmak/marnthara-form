(function() {
    'use strict';
    const APP_VERSION = "input-ui/3.4.0-refactored";
    const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
    const STORAGE_KEY = "marnthara.input.v3";
    const SQM_TO_SQYD = 1.19599;
    const WALLPAPER_SQM_PER_ROLL = 5.3;

    const SELECTORS = {
        orderForm: '#orderForm',
        roomsContainer: '#roomsContainer',
        totalSummary: '#totalSummary',
        lockBtn: '#lockBtn',
        clearAllBtn: '#clearAllBtn',
        payloadInput: '#payloadInput',
        menuBtn: '#menuBtn',
        menuDropdown: '#menuDropdown',
        addRoomHeaderBtn: '#addRoomHeaderBtn',
        importBtn: '#importBtn',
        exportBtn: '#exportBtn',
        field: '.field',
    };

    const DOM = {
        orderForm: document.querySelector(SELECTORS.orderForm),
        roomsContainer: document.querySelector(SELECTORS.roomsContainer),
        totalSummary: document.querySelector(SELECTORS.totalSummary),
        lockBtn: document.querySelector(SELECTORS.lockBtn),
        menuBtn: document.querySelector(SELECTORS.menuBtn),
        menuDropdown: document.querySelector(SELECTORS.menuDropdown),
    };

    let roomCount = 0;
    
    // --- Helper Functions ---
    const showToast = (message, type) => {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    const updateLockState = () => {
        const isLocked = DOM.lockBtn.classList.contains('locked');
        document.querySelectorAll(SELECTORS.field).forEach(field => {
            field.disabled = isLocked;
        });
        document.querySelectorAll('button').forEach(btn => {
            btn.disabled = isLocked && btn.id !== 'lockBtn' && btn.id !== 'menuBtn';
        });
        const lockText = DOM.lockBtn.querySelector('.lock-text');
        lockText.textContent = isLocked ? 'แก้ไข' : 'ล็อค';
    };

    const buildPayload = () => {
        // ... (Logic for building payload remains the same)
    };

    const saveData = () => {
        try {
            const payload = buildPayload();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            showToast("บันทึกข้อมูลเรียบร้อยแล้ว", "success");
        } catch (err) {
            console.error("Failed to save data to storage:", err);
            showToast("การบันทึกข้อมูลล้มเหลว", "error");
        }
    };
    
    const updateRoomNumbers = () => {
        const rooms = document.querySelectorAll('.room-details');
        rooms.forEach((room, index) => {
            room.dataset.roomIndex = index;
            room.querySelector('.room-name-input').placeholder = `ห้องที่ ${index + 1}`;
        });
    };
    
    // --- Event Handlers (Using Delegation) ---
    DOM.orderForm.addEventListener('input', (e) => {
        if (e.target.closest(SELECTORS.field)) {
            // Recalculate based on input type
            if (e.target.name.startsWith('curtain_')) {
                // Update specific curtain
            } else if (e.target.name.startsWith('wallpaper_')) {
                // Update specific wallpaper
            }
            // A simplified example for saving data
            saveData();
        }
    });

    DOM.orderForm.addEventListener('click', (e) => {
        const { action } = e.target.dataset;
        if (!action) return;

        const parentRoom = e.target.closest('.room-details');
        const parentCurtain = e.target.closest('.curtain-card');
        const parentWallpaper = e.target.closest('.wallpaper-card');
        
        switch (action) {
            case 'addCurtain': addCurtain(parentRoom); break;
            case 'removeCurtain': parentCurtain.remove(); saveData(); break;
            case 'addWallpaper': addWallpaper(parentRoom); break;
            case 'removeWallpaper': parentWallpaper.remove(); saveData(); break;
            case 'addWall': addWall(parentWallpaper); break;
            case 'removeWall': e.target.closest('.wall-input-row').remove(); saveData(); break;
            case 'removeRoom': 
                if (confirm('คุณต้องการลบห้องนี้ใช่หรือไม่?')) {
                    parentRoom.remove();
                    updateRoomNumbers();
                    saveData();
                }
                break;
            case 'copyRoom':
                // ... (Logic for copying room)
                break;
        }
    });

    DOM.lockBtn.addEventListener('click', () => {
        DOM.lockBtn.classList.toggle('locked');
        updateLockState();
        showToast(DOM.lockBtn.classList.contains('locked') ? 'หน้าจอถูกล็อคแล้ว' : 'หน้าจอปลดล็อคแล้ว', 'info');
    });

    // --- Initial Load Logic ---
    window.addEventListener('load', () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const payload = JSON.parse(storedData);
                // ... (Logic for loading data remains the same)
            } catch(err) {
                console.error("Failed to load data from storage:", err);
                localStorage.removeItem(STORAGE_KEY);
                addRoom();
            }
        } else {
            addRoom();
        }
        updateLockState();
        updateRoomNumbers();
    });

    // --- Other Handlers (unchanged) ---
    document.getElementById('clearAllBtn').addEventListener('click', () => {
        if (confirm('คุณต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?')) {
            localStorage.removeItem(STORAGE_KEY);
            DOM.roomsContainer.innerHTML = '';
            roomCount = 0;
            addRoom();
            showToast("ล้างข้อมูลทั้งหมดแล้ว", "success");
        }
    });

    document.getElementById('addRoomHeaderBtn').addEventListener('click', () => {
        addRoom();
        showToast("เพิ่มห้องใหม่แล้ว", "success");
    });
    
    // Menu Dropdown
    DOM.menuBtn.addEventListener('click', () => {
        DOM.menuDropdown.classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
        if (!DOM.menuDropdown.contains(e.target) && !DOM.menuBtn.contains(e.target)) {
            DOM.menuDropdown.classList.remove('show');
        }
    });
    
    // ... (All other functions like addRoom, addCurtain, addWallpaper, addWall, etc. remain the same. The event listeners are now handled by delegation on the form itself)
})();