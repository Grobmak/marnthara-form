// assets/index-CzpaVp9R.js
// Module for Marnthara - ready to drop into assets/
// Relies on global html2pdf (included via script tag)

const STATE_KEY = "marnthara.app.v1";
let APP = {
  rooms: [],
  notes: [],
  favorites: {}
};

// Utilities
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const num = v => {
  const n = parseFloat(String(v || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmt = n => (Number.isFinite(n) ? n.toLocaleString("th-TH", { minimumFractionDigits: 0 }) : "0");

// Persistence
function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    APP = JSON.parse(raw);
  } catch (e) { console.error("loadState", e); }
}
function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(APP)); } catch (e) { console.error("saveState", e); }
}

// Theme
function applyThemeFromStore() {
  const t = localStorage.getItem("marnthara.theme") || "light";
  document.body.classList.toggle("dark-theme", t === "dark");
}
function toggleTheme() {
  const now = document.body.classList.contains("dark-theme") ? "light" : "dark";
  localStorage.setItem("marnthara.theme", now);
  applyThemeFromStore();
}

// Menu helpers
function showMenu(id, show) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = show ? "block" : "none";
  el.setAttribute("aria-hidden", !show);
}
function toggleMenu(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isHidden = el.getAttribute("aria-hidden") === "true";
  showMenu(id, isHidden);
}

// Calculation logic (fixed edge cases)
function calculateSetPrice(setData) {
  // setData: { width_m, height_m, fabric_variant, price_per_m_raw, sheer_price_per_m }
  const w = num(setData.width_m);
  if (w <= 0) return 0;

  const variant = (setData.fabric_variant || "").trim();
  const priceOpaque = num(setData.price_per_m_raw);
  const priceSheer = num(setData.sheer_price_per_m);

  if (variant === "ทึบ&โปร่ง" || variant === "ทึบ&โปร่ง") {
    // sum both if present
    const opaque = priceOpaque > 0 ? priceOpaque * w : 0;
    const sheer = priceSheer > 0 ? priceSheer * w : 0;
    return Math.round(opaque + sheer);
  }

  if (variant.includes("ทึบ")) return Math.round(priceOpaque * w || 0);
  if (variant.includes("โปร่ง")) return Math.round(priceSheer * w || 0);
  return 0;
}

// Wallpaper helper with validation
function wallpaperRolls(totalWidthMeters, heightMeters) {
  const ROLL_WIDTH_M = 0.53;
  const ROLL_LENGTH_M = 10;
  const width = num(totalWidthMeters);
  const height = num(heightMeters);
  if (width <= 0 || height <= 0) {
    alert("ขนาดวอลล์/สูงต้องมากกว่า 0 เมตร");
    return 0;
  }
  const stripsPerRoll = Math.floor(ROLL_LENGTH_M / height) || 0;
  if (stripsPerRoll <= 0) {
    alert("ขนาดสูงเกินไป ไม่ใช้งานร่วมกับม้วนมาตรฐาน");
    return 0;
  }
  const stripsNeeded = Math.ceil(width / ROLL_WIDTH_M);
  return Math.ceil(stripsNeeded / stripsPerRoll);
}

// UI Construction
function createRoomElement(roomIndex) {
  const tpl = document.getElementById("roomTpl");
  if (!tpl) return null;
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.roomIndex = roomIndex;
  bindRoomEvents(node);
  return node;
}
function createSetElement(roomIndex, setIndex) {
  const tpl = document.getElementById("setTpl");
  if (!tpl) return null;
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.setIndex = setIndex;
  node.dataset.roomIndex = roomIndex;
  bindSetEvents(node);
  return node;
}

// Event binding
function bindRoomEvents(roomEl) {
  // add-set
  const addBtn = roomEl.querySelector('[data-act="add-set"]');
  addBtn?.addEventListener("click", () => {
    const rIdx = Number(roomEl.dataset.roomIndex);
    APP.rooms[rIdx].sets.push({
      width_m: 0, height_m: 0, fabric_variant: "ทึบ", price_per_m_raw: 0, sheer_price_per_m: 0
    });
    render();
  });

  // name input
  const nameInput = roomEl.querySelector('input[name="room_name"]');
  nameInput?.addEventListener("input", e => {
    const rIdx = Number(roomEl.dataset.roomIndex);
    APP.rooms[rIdx].name = e.target.value;
    saveState();
    renderSummary();
  });

  // room menu toggle
  const toggleMenuBtn = roomEl.querySelector('[data-act="toggle-room-menu"]');
  const roomMenu = roomEl.querySelector(".room-options-menu");
  toggleMenuBtn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const isHidden = roomMenu.getAttribute("aria-hidden") === "true";
    roomMenu.style.display = isHidden ? "block" : "none";
    roomMenu.setAttribute("aria-hidden", !isHidden);
  });

  // del-room
  roomEl.querySelector('[data-act="del-room"]')?.addEventListener("click", (ev) => {
    ev.preventDefault();
    const rIdx = Number(roomEl.dataset.roomIndex);
    APP.rooms.splice(rIdx, 1);
    saveState();
    render();
  });

  // clear-room
  roomEl.querySelector('[data-act="clear-room"]')?.addEventListener("click", (ev) => {
    ev.preventDefault();
    const rIdx = Number(roomEl.dataset.roomIndex);
    APP.rooms[rIdx].sets = [];
    saveState();
    render();
  });
}

function bindSetEvents(setEl) {
  const inputs = $$("input, select", setEl);
  inputs.forEach(inp => {
    inp.addEventListener("input", () => {
      const roomIndex = Number(setEl.dataset.roomIndex);
      const setIndex = Number(setEl.dataset.setIndex);
      const room = APP.rooms[roomIndex];
      if (!room) return;
      const set = room.sets[setIndex];
      set.width_m = Number(setEl.querySelector('input[name="width_m"]').value || 0);
      set.height_m = Number(setEl.querySelector('input[name="height_m"]').value || 0);
      set.fabric_variant = setEl.querySelector('select[name="fabric_variant"]').value;
      set.price_per_m_raw = Number(setEl.querySelector('input[name="price_per_m_raw"]').value || 0);
      set.sheer_price_per_m = Number(setEl.querySelector('input[name="sheer_price_per_m"]').value || 0);
      saveState();
      updateSetTotal(setEl, set);
      renderSummary();
    });
  });

  // delete set
  setEl.querySelector('[data-act="del-set"]')?.addEventListener("click", () => {
    const roomIndex = Number(setEl.dataset.roomIndex);
    const setIndex = Number(setEl.dataset.setIndex);
    APP.rooms[roomIndex].sets.splice(setIndex, 1);
    saveState();
    render();
  });

  // toggle (collapse)
  setEl.querySelector('[data-act="toggle-set"]')?.addEventListener("click", () => {
    setEl.classList.toggle("overflow-visible");
  });
}

function updateSetTotal(setEl, setData) {
  const total = calculateSetPrice({
    width_m: setData.width_m,
    height_m: setData.height_m,
    fabric_variant: setData.fabric_variant,
    price_per_m_raw: setData.price_per_m_raw,
    sheer_price_per_m: setData.sheer_price_per_m
  });
  const el = setEl.querySelector(".set-total");
  if (el) el.textContent = fmt(total);
  renderSummary();
}

// Rendering
function render() {
  const roomsContainer = document.getElementById("rooms");
  roomsContainer.innerHTML = "";
  APP.rooms.forEach((r, ri) => {
    const roomEl = createRoomElement(ri);
    // set name
    const nameInput = roomEl.querySelector('input[name="room_name"]');
    if (nameInput) nameInput.value = r.name || "";
    // sets
    const setsContainer = roomEl.querySelector('[data-sets]');
    r.sets.forEach((s, si) => {
      const setEl = createSetElement(ri, si);
      // populate fields
      setEl.querySelector('input[name="width_m"]').value = s.width_m || 0;
      setEl.querySelector('input[name="height_m"]').value = s.height_m || 0;
      setEl.querySelector('select[name="fabric_variant"]').value = s.fabric_variant || "ทึบ";
      setEl.querySelector('input[name="price_per_m_raw"]').value = s.price_per_m_raw || 0;
      setEl.querySelector('input[name="sheer_price_per_m"]').value = s.sheer_price_per_m || 0;
      updateSetTotal(setEl, s);
      setsContainer.appendChild(setEl);
    });
    roomsContainer.appendChild(roomEl);
  });
  renderSummary();
  saveState();
}

function renderSummary() {
  // totals
  let total = 0;
  let count = 0;
  APP.rooms.forEach(r => {
    r.sets.forEach(s => {
      const p = calculateSetPrice(s);
      total += p;
      if (p > 0) count++;
    });
  });
  $("#grandTotal").textContent = fmt(total);
  $("#setCount").textContent = String(count);
  // quick nav
  const qlist = $("#quickNavRoomList");
  if (qlist) {
    qlist.innerHTML = "";
    APP.rooms.forEach((r, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-chip";
      btn.textContent = r.name || `ห้อง ${idx + 1}`;
      btn.addEventListener("click", () => {
        const rooms = $$("#rooms .room-card");
        const el = rooms[idx];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      qlist.appendChild(btn);
    });
  }
}

// Actions
function addRoom() {
  APP.rooms.push({ name: "", sets: [] });
  render();
}

function exportPDF() {
  const data = {
    customer_name: $("#customer_name")?.value || "",
    customer_phone: $("#customer_phone")?.value || "",
    customer_address: $("#customer_address")?.value || "",
    rooms: APP.rooms
  };
  const container = document.getElementById("printable-content");
  if (!container) return;
  // build simple HTML
  let html = `<div style="font-family: 'Noto Sans Thai', sans-serif; padding:20px;">`;
  html += `<h2>ใบเสนอราคา</h2>`;
  html += `<p><strong>ลูกค้า:</strong> ${data.customer_name || "-"}</p>`;
  html += `<p><strong>โทร:</strong> ${data.customer_phone || "-"}</p>`;
  html += `<p><strong>ที่อยู่:</strong> ${data.customer_address || "-"}</p>`;
  html += `<hr/>`;
  data.rooms.forEach((r, idx) => {
    html += `<h4>ห้อง: ${r.name || `ห้อง ${idx + 1}`}</h4>`;
    if ((r.sets || []).length === 0) html += `<p>ไม่มีรายการ</p>`;
    else {
      html += `<table style="width:100%; border-collapse:collapse;">`;
      html += `<thead><tr><th style="text-align:left;border-bottom:1px solid #ccc;padding:6px">รายการ</th><th style="text-align:right;border-bottom:1px solid #ccc;padding:6px">รวม (บาท)</th></tr></thead><tbody>`;
      r.sets.forEach(s => {
        const p = calculateSetPrice(s);
        html += `<tr><td style="padding:6px">${s.fabric_variant || ""} ${s.width_m || 0} x ${s.height_m || 0} ม.</td><td style="text-align:right;padding:6px">${fmt(p)}</td></tr>`;
      });
      html += `</tbody></table>`;
    }
  });
  html += `<hr/><p><strong>รวมทั้งหมด:</strong> ${$("#grandTotal").textContent} บาท</p>`;
  html += `</div>`;
  container.style.display = "block";
  container.innerHTML = html;

  // use html2pdf (global)
  try {
    html2pdf().from(container).set({
      margin: 10,
      filename: `quote_${new Date().toISOString().slice(0,10)}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    }).save().finally(() => {
      container.style.display = "none";
    });
  } catch (e) {
    alert("การสร้าง PDF ล้มเหลว");
    console.error(e);
    container.style.display = "none";
  }
}

// Global click to close menus
document.addEventListener("click", (ev) => {
  const menu = document.getElementById("menuDropdown");
  const quick = document.getElementById("quickNavDropdown");
  if (menu && !menu.contains(ev.target) && !ev.target.closest("#menuBtn")) {
    menu.style.display = "none";
    menu.setAttribute("aria-hidden", "true");
  }
  if (quick && !quick.contains(ev.target) && !ev.target.closest("#quickNavBtn")) {
    quick.style.display = "none";
    quick.setAttribute("aria-hidden", "true");
  }
});

// DOM ready
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  applyThemeFromStore();

  // bind header menu
  $("#menuBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu("menuDropdown");
  });

  // bind quick nav
  $("#quickNavBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu("quickNavDropdown");
  });

  $("#addRoomQuickNavBtn")?.addEventListener("click", () => addRoom());
  $("#exportPdfBtn")?.addEventListener("click", (ev) => { ev.preventDefault(); exportPDF(); });
  $("#themeToggleBtn")?.addEventListener("click", (ev) => { ev.preventDefault(); toggleTheme(); });

  // import/export simple
  $("#exportBtn")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    const payload = JSON.stringify(APP, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `marnthara-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#importBtn")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    $("#fileImporter").click();
  });
  $("#fileImporter")?.addEventListener("change", (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        APP = data;
        saveState();
        render();
      } catch (e) { alert("ไฟล์ไม่ถูกต้อง"); }
    };
    r.readAsText(f);
  });

  // initial render
  if (!APP.rooms || APP.rooms.length === 0) {
    // create a default room
    APP.rooms = [{ name: "ห้อง 1", sets: [] }];
  }
  render();
});
