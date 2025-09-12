(function() {
'use strict';

const APP_VERSION = "input-ui/3.3.1-fixed";
const WEBHOOK_URL = "https://your-make-webhook-url.com/your-unique-path";
const STORAGE_KEY = "marnthara.input.v3";
const SQM_TO_SQYD = 1.19599;

const PRICING = {
    fabric: [1000,1200,1300,1400,1500,1600,1700,1800,1900,2000],
    sheer: [1000,1100,1200,1300,1400,1500],
    style_surcharge: { "ลอน":200,"ตาไก่":0,"จีบ":0 },
    height: [
        { threshold:3.2, add_per_m:300 },
        { threshold:2.8, add_per_m:200 },
        { threshold:2.5, add_per_m:150 }
    ],
};

const CALC = {
    fabricYardage: (style, width) => {
        if (width <= 0) return 0;
        if (style === "ตาไก่" || style === "จีบ") return (width * 2.0 + 0.6) / 0.9;
        if (style === "ลอน") return (width * 2.6 + 0.6) / 0.9;
        return 0;
    },
    wallpaperRolls: (totalWidth, height) => {
        if (totalWidth <= 0 || height <= 0) return 0;
        const stripsPerRoll = Math.floor(10 / height);
        if (stripsPerRoll <= 0) return 0; // prevent Infinity
        const stripsNeeded = Math.ceil(totalWidth / 0.53);
        return Math.ceil(stripsNeeded / stripsPerRoll);
    }
};

function $(sel, ctx=document){ return ctx.querySelector(sel); }
function $$(sel, ctx=document){ return Array.from(ctx.querySelectorAll(sel)); }

function numberWithCommas(x){ return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

function toast(msg){
    const cont = $("#toast-container");
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    cont.appendChild(el);
    setTimeout(()=>el.classList.add("show"),10);
    setTimeout(()=>{ el.classList.remove("show"); el.remove(); },3000);
}

// Core recalc
function recalcAll(){
    let grandTotal = 0, grandFabric = 0, grandSheerFabric = 0;
    let grandOpaqueTrack = 0, grandSheerTrack = 0;
    let setCount = 0, setCountSets = 0, setCountDeco = 0;

    $("[data-room]", document).forEach(room=>{
        let roomTotal = 0;
        const style = room.querySelector("[name=room_style]")?.value || "";
        const pricePerM = Number(room.querySelector("[name=room_price_per_m]")?.value || 0);

        room.querySelectorAll("[data-set]").forEach(set=>{
            const w = Number(set.querySelector("[name=set_width_m]")?.value||0);
            const h = Number(set.querySelector("[name=set_height_m]")?.value||0);
            const fabricYd = CALC.fabricYardage(style,w);
            const basePrice = Math.round(pricePerM * fabricYd);
            const surcharge = PRICING.style_surcharge[style] || 0;
            let hSurcharge = 0;
            for(const rule of PRICING.height){
                if(h > rule.threshold){ hSurcharge = rule.add_per_m * w; break; }
            }
            const setPrice = basePrice + surcharge*w + hSurcharge;
            set.querySelector("[data-set-price]").textContent = numberWithCommas(setPrice);
            roomTotal += setPrice;
            grandFabric += fabricYd;
            grandOpaqueTrack += w;
            setCountSets++;
            setCount++;
        });

        room.querySelectorAll("[data-deco]").forEach(deco=>{
            const decoPrice = Number(deco.querySelector("[name=deco_price]")?.value||0);
            deco.querySelector("[data-deco-price]").textContent = numberWithCommas(decoPrice);
            roomTotal += decoPrice;
            setCountDeco++;
            setCount++;
        });

        room.querySelectorAll("[data-wallpaper]").forEach(wp=>{
            const h = Number(wp.querySelector("[name=wall_height_m]")?.value||0);
            let totalWidth = 0;
            wp.querySelectorAll("[name=wall_width_m]").forEach(inp=>{
                totalWidth += Number(inp.value||0);
            });
            const rolls = CALC.wallpaperRolls(totalWidth,h);
            const rollPrice = Number(wp.querySelector("[name=wallpaper_price]")?.value||0);
            const price = rolls * rollPrice;
            wp.querySelector("[data-wallpaper-rolls]").textContent = rolls;
            wp.querySelector("[data-wallpaper-price]").textContent = numberWithCommas(price);
            roomTotal += price;
            setCount++;
        });

        room.querySelector("[data-room-total]").textContent = numberWithCommas(roomTotal);
        grandTotal += roomTotal;
    });

    $("#grandTotal").textContent = numberWithCommas(grandTotal);
    $("#grandFabric").textContent = grandFabric.toFixed(1) + " หลา";
    $("#grandSheerFabric").textContent = grandSheerFabric.toFixed(1) + " หลา";
    $("#grandOpaqueTrack").textContent = grandOpaqueTrack.toFixed(1) + " ม.";
    $("#grandSheerTrack").textContent = grandSheerTrack.toFixed(1) + " ม.";
    $("#setCount").textContent = setCount;
    $("#setCountSets").textContent = setCountSets;
    $("#setCountDeco").textContent = setCountDeco;
}

// Events
document.addEventListener("input", e=>{
    if(e.target.closest("[data-room]")) recalcAll();
});
document.addEventListener("click", e=>{
    const act = e.target.dataset.act;
    if(!act) return;
    if(act==="add-set"){
        const room = e.target.closest("[data-room]");
        const tpl = $("#setTpl").content.cloneNode(true);
        room.querySelector("[data-sets]").appendChild(tpl);
        recalcAll();
    }
    if(act==="add-deco"){
        const room = e.target.closest("[data-room]");
        const tpl = $("#decoTpl").content.cloneNode(true);
        room.querySelector("[data-decorations]").appendChild(tpl);
        recalcAll();
    }
    if(act==="add-wallpaper"){
        const room = e.target.closest("[data-room]");
        const tpl = $("#wallpaperTpl").content.cloneNode(true);
        room.querySelector("[data-wallpapers]").appendChild(tpl);
        recalcAll();
    }
    if(act==="del-room"){ e.target.closest("[data-room]").remove(); recalcAll(); }
    if(act==="del-set"){ e.target.closest("[data-set]").remove(); recalcAll(); }
    if(act==="del-deco"){ e.target.closest("[data-deco]").remove(); recalcAll(); }
    if(act==="del-wallpaper"){ e.target.closest("[data-wallpaper]").remove(); recalcAll(); }
    if(act==="del-wall"){ e.target.closest(".wall-input-row").remove(); recalcAll(); }
    if(act==="add-wall"){
        const wp = e.target.closest("[data-wallpaper]");
        const tpl = $("#wallTpl").content.cloneNode(true);
        wp.querySelector(".wall-inputs").appendChild(tpl);
    }
});

// Add room
$("#addRoomHeaderBtn").addEventListener("click",()=>{
    const tpl = $("#roomTpl").content.cloneNode(true);
    $("#rooms").appendChild(tpl);
    recalcAll();
});

$("#orderForm").addEventListener("submit",e=>{
    e.preventDefault();
    toast("ส่งข้อมูลไปยังระบบแล้ว");
});

recalcAll();

})();
