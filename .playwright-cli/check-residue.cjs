/* Pre-fix diagnostic: is the topbar progress line still visible after topbar hides? */
const { chromium } = require("D:/npm-global/node_modules/playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://127.0.0.1:8791/", { waitUntil: "networkidle" });
  // 拦截 Nova，避免真实长请求。
  await page.route("**/api/nova/ask", (route) =>
    route.fulfill({ json: { status: "success", content: "stub" } }));
  await page.waitForSelector(".book-card", { timeout: 15000 });
  const titles = await page.$$eval(".book-card .book-title", (els) => els.map((e) => e.textContent));
  console.log("books:", titles.length, titles[0]);
  await page.click(".book-card");
  await page.waitForSelector(".flow-chunk p", { timeout: 20000 });
  // 切暗色主题
  await page.click("#typoBtn");
  await page.click('.theme-swatch[data-value="dark"]');
  await page.keyboard.press("Escape");
  // 向下滚动触发顶栏隐藏
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const topbar = document.getElementById("topbar");
    const line = document.getElementById("topbarProgressLine");
    const track = document.querySelector(".topbar-progress-track");
    const rect = line.getBoundingClientRect();
    return {
      topbarHidden: topbar.classList.contains("hidden"),
      lineRect: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
      trackRect: (() => { const r = track.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })(),
      lineWidthStyle: line.style.width,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: "D:/Trellis/output/coreading-phaseA-residue-before.png", clip: { x: 0, y: 0, width: 400, height: 60 } });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
