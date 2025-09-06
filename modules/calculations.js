import DOM from './dom.js';
import State from './state.js';

const Calculations = {
    PRICING: {
        SQM_TO_SQYD: 1.19599,
        ROLLER_SQYD: 280,
        ROMAN_SQYD: 320,
        PLEAT_SQYD: 200,
        EYELET_SQYD: 200,
    },
    totalPrice: 0,
    fabricPrice: 0,
    decoPrice: 0,

    sanitizeValue(value) {
        return parseFloat(value.replace(/,/g, '')) || 0;
    },

    calculateItem(itemData) {
        if (itemData.isSuspended) return { subtotal: 0, fabric: 0, deco: 0, discount: 0 };

        const {
            type,
            fabric_width,
            fabric_height,
            fabric_price,
            deco_count,
            deco_price,
            discount,
            set_count,
            decorations,
        } = itemData;

        const fabricWidth = this.sanitizeValue(fabric_width);
        const fabricHeight = this.sanitizeValue(fabric_height);
        const fabricPrice = this.sanitizeValue(fabric_price);
        const decoCount = this.sanitizeValue(deco_count);
        const decoPrice = this.sanitizeValue(deco_price);
        const itemDiscount = this.sanitizeValue(discount);
        const setCount = this.sanitizeValue(set_count) || 1;

        let totalFabricPrice = 0;
        let totalDecoPrice = 0;
        let totalDecoFromDecorations = 0;

        if (fabricWidth > 0 && fabricHeight > 0 && fabricPrice > 0) {
            const sqMeter = fabricWidth * fabricHeight;
            const sqYard = sqMeter * this.PRICING.SQM_TO_SQYD;
            const fabricCostPerSqYard = parseFloat(fabricPrice);

            let calculatedFabricPrice = 0;
            if (type === 'roller') {
                calculatedFabricPrice = sqYard * (fabricCostPerSqYard || this.PRICING.ROLLER_SQYD);
            } else if (type === 'roman') {
                calculatedFabricPrice = sqYard * (fabricCostPerSqYard || this.PRICING.ROMAN_SQYD);
            } else if (type === 'pleat') {
                calculatedFabricPrice = sqYard * (fabricCostPerSqYard || this.PRICING.PLEAT_SQYD);
            } else if (type === 'eyelet') {
                calculatedFabricPrice = sqYard * (fabricCostPerSqYard || this.PRICING.EYELET_SQYD);
            } else { // standard or default
                calculatedFabricPrice = sqYard * (fabricCostPerSqYard || this.PRICING.EYELET_SQYD);
            }

            totalFabricPrice = calculatedFabricPrice;
        }

        if (decoCount > 0 && decoPrice > 0) {
            totalDecoPrice = decoCount * decoPrice;
        }

        decorations.forEach(deco => {
            if (!deco.isSuspended) {
                totalDecoFromDecorations += this.sanitizeValue(deco.deco_amount) * this.sanitizeValue(deco.deco_price);
            }
        });

        const subtotal = ((totalFabricPrice + totalDecoPrice + totalDecoFromDecorations) * setCount) - itemDiscount;

        return {
            subtotal: Math.max(0, subtotal),
            fabric: totalFabricPrice * setCount,
            deco: (totalDecoPrice + totalDecoFromDecorations) * setCount,
            discount: itemDiscount,
        };
    },

    updateTotalSummary() {
        let totalFabric = 0;
        let totalDeco = 0;
        let totalDiscount = this.sanitizeValue(DOM.elements.discountInput.value);

        State.rooms.forEach(room => {
            if (room.isSuspended) return;

            let roomSubtotal = 0;
            room.items.forEach(item => {
                const result = this.calculateItem(item);
                roomSubtotal += result.subtotal;
                totalFabric += result.fabric;
                totalDeco += result.deco;
                totalDiscount += result.discount;

                const itemCardEl = document.querySelector(`[data-item-id="${item.id}"]`);
                if (itemCardEl) {
                    itemCardEl.querySelector('.item-summary-price').textContent = result.subtotal.toFixed(2);
                }
            });

            const roomCardEl = document.querySelector(`[data-room-id="${room.id}"]`);
            if (roomCardEl) {
                roomCardEl.querySelector('.room-summary-price').textContent = roomSubtotal.toFixed(2);
            }
        });

        this.fabricPrice = totalFabric;
        this.decoPrice = totalDeco;
        this.totalPrice = Math.max(0, this.fabricPrice + this.decoPrice - totalDiscount);

        DOM.elements.summaryTotalPrice.textContent = this.totalPrice.toFixed(2);
        DOM.elements.summaryFabricPrice.textContent = this.fabricPrice.toFixed(2);
        DOM.elements.summaryDecoPrice.textContent = this.decoPrice.toFixed(2);
        DOM.elements.summaryDiscountPrice.textContent = totalDiscount.toFixed(2);

        State.preparePayload();
    }
};

export default Calculations;