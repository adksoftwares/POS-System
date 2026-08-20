import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Set viewport to a mobile device
  await page.setViewport({ width: 375, height: 812 });
  
  await page.goto('http://localhost:5173/');
  
  // Wait for the React app to render
  await page.waitForSelector('.app-shell', { timeout: 10000 }).catch(e => console.log('App shell not found'));
  
  // Dump the HTML
  const html = await page.content();
  fs.writeFileSync('dom_dump.html', html);
  
  // Also check specifically for our button
  const hasHamburger = await page.$('.mobile-hamburger-btn') !== null;
  const hasSidebar = await page.$('.mobile-sidebar-overlay') !== null;
  const oldNavCount = await page.$$eval('.header-nav a', els => els.length).catch(() => 0);
  
  console.log('--- RESULTS ---');
  console.log('Has Hamburger Button:', hasHamburger);
  console.log('Has Sidebar Rendering:', hasSidebar);
  console.log('Old Nav Links Count:', oldNavCount);
  
  // Let's click it!
  if (hasHamburger) {
    console.log('Clicking hamburger...');
    await page.click('.mobile-hamburger-btn');
    await new Promise(r => setTimeout(r, 500)); // Wait for animation
    const isSidebarVisibleNow = await page.$('.mobile-sidebar-overlay') !== null;
    console.log('Sidebar visible after click:', isSidebarVisibleNow);
  }
  
  await browser.close();
})();
