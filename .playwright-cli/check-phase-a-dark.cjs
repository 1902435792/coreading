/* Supplement: dark-theme comment card / typo pop / note card, plus mobile sheet. */
const { chromium } = require("D:/npm-global/node_modules/playwright");
const BASE = "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { (ok ? pass++ : fail++); console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? " :: " + d : ""}`); };

(async () => {
  const browser = await chromium.launch();
  // 桌面暗色
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("coreading-reader.settings", JSON.stringify({ theme: "dark" })));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".book-card", { timeout: 15000 });
  await page.screenshot({ path: "D:/Trellis/output/coreading-phaseA-shelf-dark.png" });
  await page.click(".book-card:has-text('哥德尔')");
  await page.waitForSelector(".annot-underline", { timeout: 30000 });
  await page.click(".annot-underline");
  await page.waitForTimeout(400);
  const card = await page.evaluate(() => {
    const el = document.getElementById("commentCard");
    const cs = getComputedStyle(el);
    return { hidden: el.hidden, bg: cs.backgroundColor, border: cs.borderTopColor };
  });
  check("dark comment card uses theme bg/hairline", !card.hidden && card.bg === "rgb(22, 22, 22)" && card.border === "rgb(42, 42, 42)", JSON.stringify(card));
  await page.screenshot({ path: "D:/Trellis/output/coreading-phaseA-dark-comment-card.png" });
  await page.keyboard.press("Escape");
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await page.waitForTimeout(600); // 等顶栏重新出现
  await page.click("#typoBtn");
  await page.screenshot({ path: "D:/Trellis/output/coreading-phaseA-dark-typopop.png" });
  const pop = await page.evaluate(() => getComputedStyle(document.getElementById("typoPop")).backgroundColor);
  check("dark typo pop themed", pop === "rgb(22, 22, 22)", pop);
  await page.keyboard.press("Escape");
  check("desktop dark: no page errors", errors.length === 0, errors.join("|"));
  await page.close();

  // 移动端 390x844 暗色：评论卡 sheet
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const merr = [];
  mobile.on("pageerror", (e) => merr.push(e.message));
  await mobile.goto(BASE + "/", { waitUntil: "networkidle" });
  await mobile.evaluate(() => localStorage.setItem("coreading-reader.settings", JSON.stringify({ theme: "dark" })));
  await mobile.reload({ waitUntil: "networkidle" });
  await mobile.waitForSelector(".book-card", { timeout: 15000 });
  await mobile.click(".book-card:has-text('哥德尔')");
  await mobile.waitForSelector(".annot-underline", { timeout: 30000 });
  await mobile.click(".annot-underline");
  await mobile.waitForTimeout(400);
  const sheet = await mobile.evaluate(() => {
    const el = document.getElementById("commentCard");
    const rect = el.getBoundingClientRect();
    return {
      isSheet: el.classList.contains("sheet"), hidden: el.hidden,
      width: rect.width, bottom: rect.bottom,
      overflow: document.documentElement.scrollWidth,
    };
  });
  check("mobile dark: comment sheet full-width at bottom, no overflow",
    !sheet.hidden && sheet.isSheet && sheet.width === 390 && sheet.overflow === 390, JSON.stringify(sheet));
  await mobile.screenshot({ path: "D:/Trellis/output/coreading-phaseA-mobile-dark-sheet.png" });
  check("mobile dark: no page errors", merr.length === 0, merr.join("|"));
  await browser.close();
  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
