// index.js (แก้ไขแล้วเต็มไฟล์)

import html2pdf from "html2pdf.js";

// ====================== State ======================
let appState = {
  theme: localStorage.getItem("theme") || "light",
  rooms: [],
  favorites: []
};

// ====================== Theme ======================
function applyTheme(theme) {
  document.body.classList.toggle("dark-theme", theme === "dark");
  localStorage.setItem("theme", theme);
  appState.theme = theme;
}
function toggleTheme() {
  const next = appState.theme === "light" ? "dark" : "light";
  applyTheme(next);
}
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(appState.theme);
  document.getElementById("themeToggleBtn")
    ?.addEventListener("click", toggleTheme);
});

// ====================== Calculation ======================
function calculateSetPrice(set) {
  let price = 0;
  if (set.type === "ทึบ&โปร่ง") {
    const opaque = (set.price_per_m_raw || 0) * (set.width || 0);
    const sheer = (set.sheer_price_per_m || 0) * (set.width || 0);
    price = opaque + sheer;
  } else {
    price = (set.price_per_m_raw || 0) * (set.width || 0);
  }
  return price;
}

function wallpaperRolls(width, height) {
  if (height <= 0 || width <= 0) {
    alert("ขนาดไม่ถูกต้อง กรุณาตรวจสอบความกว้าง/สูง");
    return 0;
  }
  const rollWidth = 0.53; // เมตร
  const rollLength = 10;  // เมตร
  const stripsPerRoll = Math.floor(rollLength / height);
  if (stripsPerRoll <= 0) {
    alert("ขนาดสูงเกินไป ไม่สามารถใช้วอลเปเปอร์มาตรฐานได้");
    return 0;
  }
  const neededStrips = Math.ceil(width / rollWidth);
  return Math.ceil(neededStrips / stripsPerRoll);
}

// ====================== PDF Export ======================
function exportPDF(order) {
  const container = document.getElementById("printable-content");
  if (!container) return;

  let html = `
    <h2>ใบเสนอราคา</h2>
    <p>ชื่อลูกค้า: ${order.customer_name || ""}</p>
    <p>โทร: ${order.customer_phone || ""}</p>
    <p>ที่อยู่: ${order.customer_address || ""}</p>
    <h3>รายละเอียดงาน</h3>
    <ul>
  `;
  order.rooms.forEach(r => {
    html += `<li><b>${r.name}</b> - ${r.items.length} รายการ</li>`;
  });
  html += "</ul>";

  if (order.notes && order.notes.length > 0) {
    html += "<h3>หมายเหตุ</h3><ul>";
    order.notes.forEach(n => {
      html += `<li>${n}</li>`;
    });
    html += "</ul>";
  }

  container.innerHTML = html;
  html2pdf().from(container).set({
    filename: "quote.pdf",
    margin: 10,
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  }).save();
}

// ====================== Global Click Listener ======================
document.addEventListener("click", (e) => {
  const menu = document.getElementById("menuDropdown");
  const quickNav = document.getElementById("quickNavDropdown");

  if (menu && !menu.contains(e.target) && !e.target.closest("#menuBtn")) {
    menu.setAttribute("aria-hidden", "true");
    menu.style.display = "none";
  }
  if (quickNav && !quickNav.contains(e.target) && !e.target.closest("#quickNavBtn")) {
    quickNav.setAttribute("aria-hidden", "true");
    quickNav.style.display = "none";
  }
});

// ====================== Example Bind ======================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("exportPdfBtn")
    ?.addEventListener("click", () => {
      exportPDF({
        customer_name: document.getElementById("customer_name")?.value,
        customer_phone: document.getElementById("customer_phone")?.value,
        customer_address: document.getElementById("customer_address")?.value,
        rooms: appState.rooms || [],
        notes: appState.notes || []
      });
    });
});

// ====================== Favorites (Safe) ======================
function saveFavorites() {
  try {
    localStorage.setItem("favorites", JSON.stringify(appState.favorites));
  } catch (err) {
    alert("ไม่สามารถบันทึก Favorites ได้: " + err.message);
  }
}

// ====================== Exports ======================
export {
  applyTheme,
  toggleTheme,
  calculateSetPrice,
  wallpaperRolls,
  exportPDF,
  saveFavorites
};
