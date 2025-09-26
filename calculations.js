// --- CALCULATION LOGIC (REFACTORED & CENTRALIZED) ---
import { PRICING, SQM_TO_SQYD } from './config.js';
import { toNum } from './utils.js';

/**
 * A collection of centralized calculation functions.
 * This is the single source of truth for all pricing and measurement logic.
 */
export const CALC = {
    /**
     * Calculates the style surcharge based on the curtain style.
     * @param {string} style - The style of the curtain (e.g., "ลอน", "ตาไก่").
     * @returns {number} The surcharge amount.
     */
    stylePlus: s => PRICING.style_surcharge[s] ?? 0,

    /**
     * Calculates the height surcharge based on the curtain height.
     * @param {number} h - The height of the curtain in meters.
     * @returns {number} The surcharge amount per meter.
     */
    heightPlus: h => {
        const sorted = [...PRICING.height].sort((a, b) => b.threshold - a.threshold);
        for (const entry of sorted) {
            if (h > entry.threshold) return entry.add_per_m;
        }
        return 0;
    },

    /**
     * Calculates the required fabric yardage for a curtain set.
     * @param {string} style - The curtain style.
     * @param {number} width - The width in meters.
     * @returns {number} The required fabric in yards.
     */
    fabricYardage: (style, width) => {
        const numWidth = toNum(width);
        if (numWidth <= 0 || !style) return 0;
        if (style === "ตาไก่" || style === "จีบ") return (numWidth * 2.0 + 0.6) / 0.9;
        if (style === "ลอน") return (numWidth * 2.6 + 0.6) / 0.9;
        return 0;
    },

    /**
     * Calculates the number of wallpaper rolls needed.
     * @param {number} totalWidth - The total width of all walls in meters.
     * @param {number} height - The height of the walls in meters.
     * @returns {number} The number of rolls required.
     */
    wallpaperRolls: (totalWidth, height) => {
        const numTotalWidth = toNum(totalWidth);
        const numHeight = toNum(height);
        if (numTotalWidth <= 0 || numHeight <= 0) return 0;
        // A standard roll is 10m long. Calculate strips per roll.
        // A standard strip width is 0.53m.
        const stripsPerRoll = (numHeight > 2.5) ? Math.floor(10 / numHeight) : 3;
        if (stripsPerRoll <= 0) return 0; // Avoid division by zero if height is > 10m
        const stripsNeeded = Math.ceil(numTotalWidth / 0.53);
        return Math.ceil(stripsNeeded / stripsPerRoll);
    },

    /**
     * Calculates the total price for a single curtain set.
     * @param {object} set - A set object with properties like width_m, height_m, style, etc.
     * @returns {object} An object containing total, opaque, and sheer prices.
     */
    calculateSetPrice: function(set) {
        if (!set || set.is_suspended || toNum(set.width_m) <= 0) {
            return { total: 0, opaque: 0, sheer: 0 };
        }
        const sPlus = this.stylePlus(set.style);
        const hPlus = this.heightPlus(toNum(set.height_m));
        const width = toNum(set.width_m);

        const opaquePrice = set.fabric_variant?.includes("ทึบ") && toNum(set.price_per_m_raw) > 0
            ? (toNum(set.price_per_m_raw) + sPlus + hPlus) * width
            : 0;

        const sheerPrice = set.fabric_variant?.includes("โปร่ง") && toNum(set.sheer_price_per_m) > 0
            ? (toNum(set.sheer_price_per_m) + sPlus + hPlus) * width
            : 0;

        return {
            total: Math.round(opaquePrice + sheerPrice),
            opaque: Math.round(opaquePrice),
            sheer: Math.round(sheerPrice)
        };
    },

    /**
     * Calculates the total price for a single decoration item.
     * @param {object} deco - A decoration object.
     * @returns {object} An object containing total price and area calculations.
     */
    calculateDecoPrice: function(deco) {
        if (!deco || deco.is_suspended || toNum(deco.width_m) <= 0) {
            return { total: 0, sqm: 0, sqyd: 0 };
        }
        const totalSqm = toNum(deco.width_m) * toNum(deco.height_m);
        const totalSqyd = totalSqm * SQM_TO_SQYD;
        const price = totalSqyd * toNum(deco.price_sqyd);
        
        return {
            total: Math.round(price),
            sqm: totalSqm,
            sqyd: totalSqyd
        };
    },

    /**
     * Calculates the total price for a wallpaper item.
     * @param {object} wp - A wallpaper object.
     * @returns {object} An object containing detailed price and material calculations.
     */
    calculateWallpaperPrice: function(wp) {
        if (!wp || wp.is_suspended) {
             return { total: 0, material: 0, install: 0, rolls: 0, sqm: 0 };
        }
        const totalWidth = wp.widths?.reduce((sum, w) => sum + toNum(w), 0) || 0;
        if (totalWidth <= 0) {
            return { total: 0, material: 0, install: 0, rolls: 0, sqm: 0 };
        }

        const height = toNum(wp.height_m);
        const rolls = this.wallpaperRolls(totalWidth, height);
        const materialPrice = rolls * toNum(wp.price_per_roll);
        const installPrice = rolls * (toNum(wp.install_cost_per_roll) || 0);
        
        return {
            total: Math.round(materialPrice + installPrice),
            material: Math.round(materialPrice),
            install: Math.round(installPrice),
            rolls: rolls,
            sqm: totalWidth * height
        };
    }
};