/* Targeted check: switching books must immediately reset the plan section
   (no stale next-step label / clickable execute from the previous book). */
const { chromium } = require("D:/npm-global/node_modules/playwright");
const BASE = "http://127.0.0.1:8897";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("coreading-reader.autoPreRead", JSON.stringify("off"));
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".book-card", { timeout: 15000 });
  await page.click(".book-card:has-text('回声迷宫读本')");
  await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
  // 打开 Nova + 展开计划，等到 active 计划 hydrate 完
  await page.evaluate(() => {
    if (document.getElementById("novaPanel").hidden) document.getElementById("novaStrip").click();
  });
  await page.click("#planToggleBtn");
  await page.waitForFunction(() => /^计划 · 下一步/.test(document.getElementById("planToggleLabel").textContent), { timeout: 15000 });

  const result = await page.evaluate(async () => {
    const pending = openBook("c4-mini"); // 不 await：抓书切换瞬间的计划区状态
    const immediate = {
      label: document.getElementById("planToggleLabel").textContent,
      doneDisabled: document.getElementById("planDoneStepBtn").disabled,
      status: document.getElementById("planStatus").textContent,
    };
    await pending;
    await new Promise((r) => setTimeout(r, 600));
    const settled = {
      label: document.getElementById("planToggleLabel").textContent,
      book: state.bookId,
    };
    return { immediate, settled };
  });
  const ok = result.immediate.label === "为本书建个计划" && result.immediate.doneDisabled
    && result.immediate.status === "" && result.settled.label === "为本书建个计划"
    && result.settled.book === "c4-mini" && errors.length === 0;
  console.log(`${ok ? "PASS" : "FAIL"} plan section resets immediately on book switch ::`, JSON.stringify(result), errors.join("|") || "");
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
