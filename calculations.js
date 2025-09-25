// --- CALCULATION LOGIC ---
import { PRICING } from './config.js';

export const stylePlus = s => PRICING.style_surcharge[s] ?? 0;

export const heightPlus = h => {
    const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
    for (const entry of sorted) {
        if (h > entry.threshold) return entry.add_per_m;
    }
    return 0;
};

export const CALC = {
    fabricYardage: (style, width) => {
        if (width <= 0 || !style) return 0;
        if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
        if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
        return 0;
    },
    wallpaperRolls: (totalWidth, height) => {
        if (totalWidth <= 0 || height <= 0) return 0;
        const stripsPerRoll = (height > 2.5) ? Math.floor(10 / height) : 3;
        if (stripsPerRoll <= 0) return Infinity;
        const stripsNeeded = Math.ceil(totalWidth / 0.53);
        return Math.ceil(stripsNeeded / stripsPerRoll);
    }
};