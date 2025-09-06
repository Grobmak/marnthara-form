/* eslint-disable no-unused-vars */
const Calculator = {
    // Constants
    CONVERSION_M_TO_YD: 1.09361,
    // Constants for pricing and calculation
    CONSTANTS: {
        FABRIC_WIDTH_M: 1.5,
        FABRIC_EXTRA_PERCENT: 1.15, // 15% extra for sewing
        DECO_MARGIN: 1.0, // Can be used for extra margin
        TRACK_TO_FABRIC_RATIO: 1.0,
    },
    // Main calculation function
    runAllCalculations: (state) => {
        let grandTotal = 0;
        let grandOpaqueYards = 0;
        let grandSheerYards = 0;
        let grandOpaqueTrack = 0;
        let grandSheerTrack = 0;
        let totalSets = 0;
        let totalDeco = 0;
        
        state.rooms.forEach(room => {
            room.calculations = { price: 0, sets: 0, deco: 0, units: 0 };
            
            // Calculate for each set of curtains
            room.sets.forEach(set => {
                if (set.is_suspended) {
                    set.calculations = {};
                    return;
                }
                
                const width_m = parseFloat(set.width_m) || 0;
                const height_m = parseFloat(set.height_m) || 0;
                const price_per_m = parseFloat(room.price_per_m) || 0;
                const sheer_price_per_m = parseFloat(set.sheer_price_per_m) || 0;
                
                let opaqueYards = 0;
                let sheerYards = 0;
                let opaquePrice = 0;
                let sheerPrice = 0;
                
                const hasOpaque = set.fabric_variant === 'ทึบ' || set.fabric_variant === 'ทึบ&โปร่ง';
                const hasSheer = set.fabric_variant === 'โปร่ง' || set.fabric_variant === 'ทึบ&โปร่ง';
                
                if (hasOpaque) {
                    opaqueYards = ((width_m * 2) / Calculator.CONSTANTS.FABRIC_WIDTH_M) * height_m * Calculator.CONVERSION_M_TO_YD * Calculator.CONSTANTS.FABRIC_EXTRA_PERCENT;
                    opaquePrice = opaqueYards * price_per_m;
                }
                
                if (hasSheer) {
                    sheerYards = ((width_m * 2) / Calculator.CONSTANTS.FABRIC_WIDTH_M) * height_m * Calculator.CONVERSION_M_TO_YD * Calculator.CONSTANTS.FABRIC_EXTRA_PERCENT;
                    sheerPrice = sheerYards * sheer_price_per_m;
                }
                
                const opaqueTrack = hasOpaque ? width_m * Calculator.CONSTANTS.TRACK_TO_FABRIC_RATIO : 0;
                const sheerTrack = hasSheer ? width_m * Calculator.CONSTANTS.TRACK_TO_FABRIC_RATIO : 0;
                
                set.calculations = {
                    opaqueYards,
                    sheerYards,
                    opaqueTrack,
                    sheerTrack,
                    opaquePrice,
                    sheerPrice,
                    total: opaquePrice + sheerPrice
                };
                
                grandOpaqueYards += opaqueYards;
                grandSheerYards += sheerYards;
                grandOpaqueTrack += opaqueTrack;
                grandSheerTrack += sheerTrack;
                grandTotal += set.calculations.total;
                room.calculations.price += set.calculations.total;
                totalSets++;
                room.calculations.sets++;
            });
            
            // Calculate for decorations
            room.decorations.forEach(deco => {
                if (deco.is_suspended) {
                    deco.calculations = {};
                    return;
                }
                
                const width_m = parseFloat(deco.width_m) || 0;
                const height_m = parseFloat(deco.height_m) || 0;
                const price_sqyd = parseFloat(deco.price_sqyd) || 0;
                
                const areaSqyd = (width_m * height_m) * Calculator.CONVERSION_M_TO_YD * Calculator.CONVERSION_M_TO_YD;
                const total = areaSqyd * price_sqyd;
                
                deco.calculations = { areaSqyd, total };
                
                grandTotal += total;
                room.calculations.price += total;
                totalDeco++;
                room.calculations.deco++;
            });
            
            room.calculations.units = room.sets.filter(s => !s.is_suspended).length;
        });
        
        state.summary = {
            grandTotal,
            grandOpaqueYards,
            grandSheerYards,
            grandOpaqueTrack,
            grandSheerTrack,
            totalSets,
            totalDeco,
            totalPoints: totalSets + totalDeco
        };
    },
};