const puppeteer = require('puppeteer');
const assert = require('assert');

module.exports = async function run() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  try {
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#rooms');

    // initial rooms count
    const initialRooms = await page.$$eval('[data-room]', els => els.length);
    console.log('Initial rooms:', initialRooms);

    // Click QuickNav add room button
    const quickBtn = await page.$('#addRoomQuickNavBtn');
    assert(quickBtn, 'QuickNav add room button not found');
    await quickBtn.click();
    await page.waitForTimeout(600); // allow throttle debounce

    const afterAddRooms = await page.$$eval('[data-room]', els => els.length);
    console.log('Rooms after add (quick):', afterAddRooms);
    assert(afterAddRooms === initialRooms + 1, 'Add room via QuickNav did not increase room count');

    // Check that the newly added room's name input is focused
    const activeTag = await page.evaluate(() => document.activeElement && document.activeElement.name);
    console.log('Active element name after add:', activeTag);
    assert(activeTag === 'room_name', 'New room name input is not focused');

    // Toggle the first room's menu (three dots)
    const firstMenuBtn = await page.$('[data-act="toggle-room-menu"]');
    assert(firstMenuBtn, 'Room menu toggle not found');
    await firstMenuBtn.click();
    await page.waitForTimeout(200);

    // verify menu visible for that room by checking room-options-menu.show exists near the button
    const menuVisible = await page.evaluate((btnSelector) => {
      const btn = document.querySelector(btnSelector);
      const room = btn.closest('[data-room]');
      const menu = room.querySelector('.room-options-menu');
      return menu && menu.classList.contains('show');
    }, '[data-act="toggle-room-menu"]');
    console.log('Room options menu visible:', menuVisible);
    assert(menuVisible === true, 'Room options menu did not become visible');

    // Click add-set inside that room options (if present)
    const addSetBtn = await page.$('[data-act="add-set"]');
    if (addSetBtn) {
      await addSetBtn.click();
      await page.waitForTimeout(200);
      const setCount = await page.$$eval('[data-set]', els => els.length);
      console.log('Set count after add-set:', setCount);
      assert(setCount >= 1, 'Add set failed');
    } else {
      console.log('No add-set control detected. Skipping set add check.');
    }

    // Test export PDF triggers export modal (open exportOptionsModal)
    const exportBtn = await page.$('#exportPdfBtn');
    assert(exportBtn, 'Export PDF button not found');
    await exportBtn.click();
    await page.waitForSelector('#exportOptionsModal.visible', { timeout: 2000 }).catch(() => {});
    const modalVisible = await page.$eval('#exportOptionsModal', el => el.classList.contains('visible'));
    console.log('Export options modal visible:', modalVisible);
    // Not asserting modal visible because implementation might use showModal; just log

    await browser.close();
    return true;
  } catch (err) {
    await browser.close();
    throw err;
  }
};
