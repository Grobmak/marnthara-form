// --- UTILITY FUNCTIONS ---

export const toNum = v => {
    if (typeof v === 'string') v = v.replace(/,/g, '');
    const num = parseFloat(v);
    return Number.isFinite(num) ? num : 0;
};

export const clamp01 = v => Math.max(0, toNum(v));

export const fmt = (n, fixed = 2, asCurrency = false) => {
    if (!Number.isFinite(n)) return "0";
    return n.toLocaleString('en-US', { minimumFractionDigits: asCurrency ? 2 : fixed, maximumFractionDigits: asCurrency ? 2 : fixed });
};

export const fmtTH = (n, fixed = 0) => {
    if (!Number.isFinite(n)) return "0";
    return n.toLocaleString('th-TH', { minimumFractionDigits: fixed, maximumFractionDigits: fixed });
};

export const debounce = (fn, ms = 150) => {
    let t;
    return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
    };
};

export const throttle = (fn, ms = 700) => {
    let locked = false;
    return (...args) => {
        if (locked) return;
        locked = true;
        try { return fn(...args); } finally { setTimeout(() => { locked = false; }, ms); }
    };
};

export function bahttext(num) {
    num = Number(num);
    if (isNaN(num)) return "ข้อมูลตัวเลขไม่ถูกต้อง";
    const txtNumArr = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า', 'สิบ'];
    const txtDigitArr = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
    if (num === 0) return 'ศูนย์บาทถ้วน';
    const [integerPart, decimalPart] = num.toFixed(2).split('.');
    const satang = parseInt(decimalPart, 10);
    function convert(n) {
        if (n === null || n === undefined) return '';
        let output = '';
        const strN = String(n);
        for (let i = 0; i < strN.length; i++) {
            const digit = parseInt(strN[i], 10);
            if (digit !== 0) {
                if ((strN.length - i - 1) % 6 === 0 && i !== strN.length - 1) {
                    return convert(strN.substring(0, i + 1)) + 'ล้าน' + convert(strN.substring(i + 1));
                }
                output += txtNumArr[digit] + txtDigitArr[strN.length - i - 1];
            }
        }
        return output;
    }
    let bahtTxt = convert(integerPart).replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด') + 'บาท';
    if (satang > 0) {
        bahtTxt += convert(satang).replace(/หนึ่งสิบ$/, 'สิบ').replace(/สองสิบ/g, 'ยี่สิบ').replace(/สิบหนึ่ง$/, 'สิบเอ็ด') + 'สตางค์';
    } else {
        bahtTxt += 'ถ้วน';
    }
    return bahtTxt;
}