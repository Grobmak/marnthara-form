// --- DATA STORAGE & PAYLOAD MANAGEMENT ---
import { APP_VERSION, STORAGE_KEY, SELECTORS } from './config.js';
import { toNum } from './utils.js';

export function buildPayload() {
    const payload = {
        app_version: APP_VERSION,
        customer_name: document.querySelector('[name="customer_name"]')?.value || '',
        customer_phone: document.querySelector('[name="customer_phone"]')?.value || '',
        customer_address: document.querySelector('[name="customer_address"]')?.value || '',
        rooms: []
    };

    document.querySelectorAll(SELECTORS.room).forEach(roomEl => {
        const roomData = {
            room_name: roomEl.querySelector(SELECTORS.roomNameInput)?.value || '',
            is_suspended: roomEl.dataset.suspended === 'true',
            sets: [], decorations: [], wallpapers: []
        };
        roomEl.querySelectorAll(SELECTORS.set).forEach(setEl => {
            roomData.sets.push({
                width_m: toNum(setEl.querySelector('input[name="width_m"]')?.value), height_m: toNum(setEl.querySelector('input[name="height_m"]')?.value), style: setEl.querySelector('select[name="set_style"]')?.value || '', fabric_variant: setEl.querySelector('select[name="fabric_variant"]')?.value || '', price_per_m_raw: toNum(setEl.querySelector('select[name="set_price_per_m"]')?.value), sheer_price_per_m: toNum(setEl.querySelector('select[name="sheer_price_per_m"]')?.value), fabric_code: setEl.querySelector('input[name="fabric_code"]')?.value || '', sheer_fabric_code: setEl.querySelector('input[name="sheer_fabric_code"]')?.value || '', opening_style: setEl.querySelector('select[name="opening_style"]')?.value || '', track_color: setEl.querySelector('select[name="track_color"]')?.value || '', notes: setEl.querySelector('input[name="notes"]')?.value || '', is_suspended: setEl.dataset.suspended === 'true',
            });
        });
        roomEl.querySelectorAll(SELECTORS.decoItem).forEach(decoEl => {
            roomData.decorations.push({
                type: decoEl.querySelector('[name="deco_type"]')?.value || '', width_m: toNum(decoEl.querySelector('[name="deco_width_m"]')?.value), height_m: toNum(decoEl.querySelector('[name="deco_height_m"]')?.value), price_sqyd: toNum(decoEl.querySelector('[name="deco_price_sqyd"]')?.value), deco_code: decoEl.querySelector('[name="deco_code"]')?.value || '', deco_notes: decoEl.querySelector('[name="deco_notes"]')?.value || '', is_suspended: decoEl.dataset.suspended === 'true',
            });
        });
        roomEl.querySelectorAll(SELECTORS.wallpaperItem).forEach(wallpaperEl => {
            roomData.wallpapers.push({
                height_m: toNum(wallpaperEl.querySelector('[name="wallpaper_height_m"]')?.value), wallpaper_code: wallpaperEl.querySelector('[name="wallpaper_code"]')?.value || '', price_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_price_roll"]')?.value), install_cost_per_roll: toNum(wallpaperEl.querySelector('[name="wallpaper_install_cost"]')?.value), wallpaper_notes: wallpaperEl.querySelector('[name="wallpaper_notes"]')?.value || '', widths: Array.from(wallpaperEl.querySelectorAll('[name="wall_width_m"]')).map(el => toNum(el.value)), is_suspended: wallpaperEl.dataset.suspended === 'true',
            });
        });
        payload.rooms.push(roomData);
    });
    return payload;
}

export function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
}