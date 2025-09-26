// --- CONFIGURATION & CONSTANTS ---
export const APP_VERSION = "input-ui/5.5.1-stable-hotfix";
export const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
export const STORAGE_KEY = "marnthara.input.v4";
export const PDF_EXPORT_DELAY_MS = 500;

export const SHOP_CONFIG = {
    name: "ม่านธารา ผ้าม่านและของตกแต่ง",
    address: "65/8 หมู่ 2 ต.ท่าศาลา อ.เมือง จ.ลพบุรี 15000",
    phone: "092-985-9395, 082-552-5595",
    taxId: "1234567890123",
    logoUrl: "https://i.imgur.com/l7y85nI.png",
    baseVatRate: 0.07, // The standard 7% VAT rate.
    pdf: {
        paymentTerms: "ชำระมัดจำ 50%",
        priceValidity: "30 วัน",
        notes: [
            "ราคานี้รวมค่าติดตั้งแล้ว",
            "ชำระมัดจำ 50% เพื่อยืนยันการสั่งผลิตสินค้า",
            "ใบเสนอราคานี้มีอายุ 30 วัน นับจากวันที่เสนอราคา"
        ]
    }
};

export const SQM_TO_SQYD = 1.19599;

export const PRICING = {
    fabric: [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200],
    sheer: [1000, 1100, 1200, 1300, 1400, 1500],
    style_surcharge: { "ลอน": 200, "ตาไก่": 0, "จีบ": 0 },
    height: [
        { threshold: 3.2, add_per_m: 300 },
        { threshold: 2.8, add_per_m: 200 },
        { threshold: 2.5, add_per_m: 100 }
    ],
};

export const SELECTORS = {
    orderForm: '#orderForm', roomsContainer: '#rooms', roomTpl: '#roomTpl', setTpl: '#setTpl', decoTpl: '#decoTpl', wallpaperTpl: '#wallpaperTpl', wallTpl: '#wallTpl',
    payloadInput: '#payload', clearAllBtn: '#clearAllBtn',
    lockBtn: '#lockBtn', addRoomFooterBtn: '#addRoomFooterBtn',
    grandTotal: '#grandTotal', setCount: '#setCount',
    detailedSummaryContainer: '#detailed-material-summary',
    modal: '#confirmationModal', modalTitle: '#modalTitle', modalBody: '#modalBody', modalConfirm: '#modalConfirm', modalCancel: '#modalCancel',
    room: '[data-room]', set: '[data-set]', setsContainer: '[data-sets]',
    decorationsContainer: '[data-decorations]', decoItem: '[data-deco-item]',
    wallpapersContainer: '[data-wallpapers]', wallpaperItem: '[data-wallpaper-item]', wallsContainer: '[data-walls-container]',
    sheerWrap: '[data-sheer-wrap]',
    sheerCodeWrap: '[data-sheer-code-wrap]',
    roomNameInput: 'input[name="room_name"]',
    toastContainer: '#toast-container',
    copyTextBtn: '#copyTextBtn', copyOptionsModal: '#copyOptionsModal', copyOptionsConfirm: '#copyOptionsConfirm', copyOptionsCancel: '#copyOptionsCancel',
    menuBtn: '#menuBtn', menuDropdown: '#menuDropdown', importBtn: '#importBtn', exportBtn: '#exportBtn', fileImporter: '#fileImporter',
    submitBtn: '#submitBtn',
    clearItemsBtn: '#clearItemsBtn',
    exportPdfBtn: '#exportPdfBtn',
    exportOptionsModal: '#exportOptionsModal', exportOptionsConfirm: '#exportOptionsConfirm', exportOptionsCancel: '#exportOptionsCancel',
    printableContent: '#printable-content',
    // --- Updated Navigation Selectors ---
    quickNavBtn: '#quickNavBtn',
    quickNavDropdown: '#quickNavDropdown',
    quickNavRoomList: '#quickNavRoomList',
    toggleAllRoomsBtn: '#toggleAllRoomsBtn', // New smart toggle button
    allDetailsCards: '.card[id="customerDetailsCard"], .room-card' // Selector for all collapsible cards
};