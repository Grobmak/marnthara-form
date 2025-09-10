(function() {
  'use strict';
  const STORAGE_KEY = "marnthara.input.v3";
  const WEBHOOK_URL = "https://your-webhook-url";

  const SELECTORS = {
    roomsContainer: '#rooms',
    roomTpl: '#roomTpl',
    addRoomBtn: '#addRoomHeaderBtn',
    menuBtn: '#menuBtn',
    menuDropdown: '#menuDropdown',
    importBtn: '#importBtn',
    exportBtn: '#exportBtn',
    clearAllBtn: '#clearAllBtn',
    payloadInput: '#payload',
    orderForm: '#orderForm'
  };

  const roomsEl = document.querySelector(SELECTORS.roomsContainer);
  let roomCount = 0;

  function showToast(msg) {
    const c = document.querySelector('#toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(()=>t.classList.add('show'),10);
    setTimeout(()=>{t.classList.remove('show');t.remove();},3000);
  }

  function addRoom(prefill) {
    roomCount++;
    const frag = document.querySelector(SELECTORS.roomTpl).content.cloneNode(true);
    const room = frag.querySelector('[data-room]');
    room.dataset.index = roomCount;
    roomsEl.appendChild(frag);
    const created = roomsEl.querySelector('[data-room]:last-of-type');
    if (prefill) {
      created.querySelector('input[name="room_name"]').value = prefill.room_name || "";
      created.querySelector('select[name="room_price_per_m"]').value = prefill.price_per_m_raw || "";
      created.querySelector('select[name="room_style"]').value = prefill.style || "";
    }
    showToast('เพิ่มห้องแล้ว');
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
  }

  function buildPayload() {
    return {
      rooms: [...document.querySelectorAll('[data-room]')].map(r => ({
        room_name: r.querySelector('input[name="room_name"]').value,
        price_per_m_raw: r.querySelector('select[name="room_price_per_m"]').value,
        style: r.querySelector('select[name="room_style"]').value
      }))
    };
  }

  // menu toggle
  document.querySelector(SELECTORS.menuBtn).addEventListener('click',()=>{
    document.querySelector(SELECTORS.menuDropdown).classList.toggle('show');
  });
  document.addEventListener('click',(e)=>{
    const menu = document.querySelector(SELECTORS.menuDropdown);
    if(!menu.contains(e.target) && !document.querySelector(SELECTORS.menuBtn).contains(e.target)){
      menu.classList.remove('show');
    }
  });

  document.querySelector(SELECTORS.addRoomBtn).addEventListener('click',()=>addRoom());

  // Clear all
  document.querySelector(SELECTORS.clearAllBtn).addEventListener('click',()=>{
    roomsEl.innerHTML = "";
    roomCount = 0;
    showToast("ล้างข้อมูลแล้ว");
  });

  // Export
  document.querySelector(SELECTORS.exportBtn).addEventListener('click',()=>{
    const data = buildPayload();
    const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "marnthara.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("ส่งออกแล้ว");
  });

  // Import
  document.querySelector(SELECTORS.importBtn).addEventListener('click',()=>{
    const json = prompt("วาง JSON ที่ต้องการนำเข้า");
    if(!json) return;
    try{
      const data = JSON.parse(json);
      roomsEl.innerHTML="";
      roomCount=0;
      (data.rooms||[]).forEach(r=>addRoom(r));
      showToast("นำเข้าข้อมูลแล้ว");
    }catch(e){ showToast("JSON ไม่ถูกต้อง"); }
  });

  // Submit
  document.querySelector(SELECTORS.orderForm).addEventListener("submit",(e)=>{
    document.querySelector(SELECTORS.payloadInput).value = JSON.stringify(buildPayload());
    showToast("ส่งข้อมูลแล้ว");
  });

})();
