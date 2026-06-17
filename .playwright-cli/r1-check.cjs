/* R1 check-round deep verification against ISOLATED sidecar (port 8899).
   Focus areas beyond r1-smoke.cjs:
   1) settings migration matrix (partial legacy keys / already-new / corrupt JSON / null range values)
   2) skill preread vs auto-preread in-flight mutual exclusion (fix regression)
   3) font delete unregisters FontFace + same-name re-import stays single
   4) dangling face:"custom" without IndexedDB record falls back to serif
   5) regressions: annotation card, find bar, position persistence, /classic */
const { chromium } = require("D:/npm-global/node_modules/playwright");

const BASE = "http://127.0.0.1:8899";
const FONT_FILE = "D:/Trellis/output/coreading-r1-font.ttf";
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`PASS ${name}${detail ? " :: " + detail : ""}`); }
  else { fail += 1; console.log(`FAIL ${name}${detail ? " :: " + detail : ""}`); }
}

async function newPage(browser, { settings, autoPreRead = "off", novaDelayMs = 0 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const novaPayloads = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.route("**/api/nova/ask", async (route) => {
    novaPayloads.push(route.request().postDataJSON());
    if (novaDelayMs) await new Promise((r) => setTimeout(r, novaDelayMs));
    await route.fulfill({ json: { status: "success", content: "检查回复：“回声迷宫的回廊里藏着读书人的脚印。”值得停留。" } });
  });
  await page.addInitScript(({ raw, auto }) => {
    localStorage.setItem("coreading-reader.autoPreRead", JSON.stringify(auto));
    if (raw !== undefined && localStorage.getItem("coreading-reader.settings") === null) {
      localStorage.setItem("coreading-reader.settings", raw);
    }
  }, { raw: settings, auto: autoPreRead });
  return { context, page, errors, novaPayloads };
}

async function readSaved(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("coreading-reader.settings") || "null"));
}

async function bodyVars(page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return {
      face: document.body.dataset.face,
      theme: document.body.dataset.theme,
      fontVar: cs.getPropertyValue("--font-size").trim(),
      lineVar: cs.getPropertyValue("--line").trim(),
      measureVar: cs.getPropertyValue("--measure").trim(),
    };
  });
}

async function openBook(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".book-card", { timeout: 15000 });
  await page.click(".book-card");
  await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch();

  /* ===== 1. 迁移矩阵 ===== */
  // 1a. 只有 font 键
  {
    const { context, page, errors } = await newPage(browser, { settings: JSON.stringify({ font: "s" }) });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const saved = await readSaved(page);
    const vars = await bodyVars(page);
    check("migrate-partial: {font:s} -> 16px/38em/1.85, legacy keys gone",
      saved.fontPx === 16 && saved.measureEm === 38 && saved.lineH === 1.85
        && !("font" in saved) && vars.fontVar === "16px" && vars.lineVar === "1.85",
      JSON.stringify({ saved, fontVar: vars.fontVar, lineVar: vars.lineVar }));
    check("migrate-partial: no page errors", errors.length === 0, errors.join("|"));
    await context.close();
  }
  // 1b. 只有 line:"normal"
  {
    const { context, page } = await newPage(browser, { settings: JSON.stringify({ line: "normal", theme: "dark" }) });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const saved = await readSaved(page);
    const vars = await bodyVars(page);
    check("migrate-partial: {line:normal} -> lineH 1.7, defaults 18px/38em, theme kept",
      saved.lineH === 1.7 && saved.fontPx === 18 && vars.lineVar === "1.7" && vars.theme === "dark",
      JSON.stringify({ saved, vars }));
    await context.close();
  }
  // 1c. 已是新格式：原值不动、不再迁移
  {
    const raw = JSON.stringify({ theme: "paper", fontPx: 21, lineH: 2.1, measureEm: 41 });
    const { context, page } = await newPage(browser, { settings: raw });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const saved = await readSaved(page);
    const vars = await bodyVars(page);
    check("migrate-idempotent: new-format values untouched",
      saved.fontPx === 21 && saved.lineH === 2.1 && saved.measureEm === 41
        && vars.fontVar === "21px" && vars.measureVar === "41em",
      JSON.stringify({ saved, vars }));
    await context.close();
  }
  // 1d. 损坏 JSON（合法 JSON 但不是对象）：按默认渲染，且改设置不抛错、能存回对象
  {
    const { context, page, errors } = await newPage(browser, { settings: JSON.stringify("on") });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".book-card", { timeout: 15000 });
    const varsBefore = await bodyVars(page);
    await page.click("#shelfSettingsBtn");
    await page.click('#settingsView [data-setting="theme"] button[data-value="dark"]');
    await page.waitForTimeout(200);
    const saved = await readSaved(page);
    check("corrupt-settings: string value -> defaults render, theme change persists as object",
      varsBefore.fontVar === "18px" && varsBefore.theme === "white"
        && saved && typeof saved === "object" && saved.theme === "dark",
      JSON.stringify({ varsBefore, saved }));
    check("corrupt-settings: no page errors", errors.length === 0, errors.join("|"));
    await context.close();
  }
  // 1e. fontPx:null 损坏值：用默认 18px 而不是被钳到 14px
  {
    const { context, page } = await newPage(browser, { settings: JSON.stringify({ fontPx: null, lineH: "", measureEm: "abc" }) });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const vars = await bodyVars(page);
    check("corrupt-range: null/''/NaN -> defaults 18px/1.95/38em (not clamped to min)",
      vars.fontVar === "18px" && vars.lineVar === "1.95" && vars.measureVar === "38em", JSON.stringify(vars));
    await context.close();
  }

  /* ===== 2. 技能预读 vs 自动预读在飞互斥（修复回归） ===== */
  {
    const { context, page, errors, novaPayloads } = await newPage(browser, { autoPreRead: "on", novaDelayMs: 6000 });
    await openBook(page);
    // 自动预读 3s 去抖后发出；等它真正在飞
    await page.waitForFunction(() => true, null, { timeout: 1000 }).catch(() => {});
    const started = Date.now();
    while (novaPayloads.length === 0 && Date.now() - started < 10000) await page.waitForTimeout(200);
    check("mutex: auto preread fired first", novaPayloads.length === 1, `requests=${novaPayloads.length}`);
    await page.click("#novaStrip");
    await page.click("#skillToggleBtn");
    await page.click("#skillPreReadBtn");
    await page.waitForTimeout(400);
    const blockedStatus = await page.evaluate(() => document.getElementById("skillStatus").textContent);
    check("mutex: skill preread blocked while auto in flight (no 2nd request)",
      novaPayloads.length === 1 && blockedStatus.includes("正在读上一条"),
      `requests=${novaPayloads.length} status=${blockedStatus}`);
    // 等自动预读回来后，技能卡可以再发（绕过会话 once）
    await page.waitForFunction(() => /Nova 自主预读|Nova 预读/.test(document.getElementById("novaReplyMeta").textContent), null, { timeout: 15000 });
    await page.click("#skillPreReadBtn");
    await page.waitForFunction(() => /预读完成|失败|没有返回/.test(document.getElementById("skillStatus").textContent), null, { timeout: 15000 });
    check("mutex: skill preread works after auto completes (bypasses session-once)",
      novaPayloads.length === 2
        && (await page.evaluate(() => document.getElementById("skillStatus").textContent)).includes("预读完成"),
      `requests=${novaPayloads.length}`);
    check("mutex: no page errors", errors.length === 0, errors.join("|").slice(0, 300));
    await context.close();
  }

  /* ===== 3. 字体删除注销 FontFace + 同名重导单实例 ===== */
  {
    const { context, page, errors } = await newPage(browser, {});
    await page.goto(`${BASE}/#settings`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await page.setInputFiles("#fontImportInput", FONT_FILE);
    await page.waitForFunction(() => /已导入|失败/.test(document.getElementById("fontImportStatus").textContent), null, { timeout: 10000 });
    await page.click("#customFaceList button[data-value^='custom:']"); // 选用后再删，覆盖“删除使用中字体”
    const inUse = await page.evaluate(() => document.body.dataset.face);
    await page.click(".custom-face-del");
    await page.click(".custom-face-del");
    await page.waitForTimeout(400);
    const afterDelete = await page.evaluate(() => ({
      registered: [...document.fonts].filter((f) => f.family.startsWith("reader-custom-")).length,
      face: document.body.dataset.face,
    }));
    check("font-delete: FontFace unregistered from document.fonts + fallback serif",
      inUse === "custom" && afterDelete.registered === 0 && afterDelete.face === "serif",
      JSON.stringify({ inUse, afterDelete }));
    // 同名重导：恰好一个同 family FontFace
    await page.setInputFiles("#fontImportInput", FONT_FILE);
    await page.waitForFunction(() => /已导入|失败/.test(document.getElementById("fontImportStatus").textContent), null, { timeout: 10000 });
    const reimport = await page.evaluate(() => ({
      status: document.getElementById("fontImportStatus").textContent,
      registered: [...document.fonts].filter((f) => f.family.startsWith("reader-custom-")).length,
      options: document.querySelectorAll("#customFaceList button[data-value^='custom:']").length,
    }));
    check("font-reimport: same name imports once, single FontFace",
      reimport.status.includes("已导入") && reimport.registered === 1 && reimport.options === 1,
      JSON.stringify(reimport));
    check("font-lifecycle: no page errors", errors.length === 0, errors.join("|").slice(0, 300));
    await context.close();
  }

  /* ===== 4. 悬挂 face:custom（IndexedDB 记录已不存在）回退衬线 ===== */
  {
    const raw = JSON.stringify({ face: "custom", customName: "ghost.ttf", customFamily: "reader-custom-ghost" });
    const { context, page } = await newPage(browser, { settings: raw });
    await page.goto(`${BASE}/#settings`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600); // 等 loadCustomFontsAtStartup 异步完成
    const saved = await readSaved(page);
    const state = await page.evaluate(() => ({
      face: document.body.dataset.face,
      serifPressed: document.querySelector('#settingsView [data-setting="face"] button[data-value="serif"]').getAttribute("aria-pressed"),
      inlineFace: document.body.style.getPropertyValue("--face-font"),
    }));
    check("dangling-custom: falls back to serif and persists",
      saved.face === "serif" && !("customName" in saved) && state.face === "serif"
        && state.serifPressed === "true" && state.inlineFace === "",
      JSON.stringify({ saved, state }));
    await context.close();
  }

  /* ===== 5. 回归：评注卡 / 查找 / 位置持久化 / classic ===== */
  {
    const { context, page, errors } = await newPage(browser, {});
    await openBook(page);
    // 5a. 种子笔记的虚线评注 + 评论卡
    const underline = await page.evaluate(() => document.querySelectorAll(".annot-underline").length);
    await page.click(".annot-underline");
    await page.waitForTimeout(300);
    const card = await page.evaluate(() => ({
      visible: !document.getElementById("commentCard").hidden,
      text: document.getElementById("commentCard").innerText.slice(0, 60),
    }));
    check("regress: annotation underline + comment card",
      underline >= 1 && card.visible && card.text.includes("C4 共存联测"), JSON.stringify(card));
    check("regress: comment card sink action says 导出",
      await page.evaluate(() => [...document.querySelectorAll("#commentCard .sink-trigger")].some((b) => b.textContent === "导出")));
    await page.keyboard.press("Escape");
    // 5b. 查找
    await page.keyboard.press("Control+f");
    await page.waitForSelector("#findBar:not([hidden])", { timeout: 5000 });
    await page.fill("#findInput", "回声迷宫");
    await page.waitForTimeout(600);
    const findState = await page.evaluate(() => ({
      counter: document.getElementById("findCount").textContent,
      marks: document.querySelectorAll("mark.find-mark").length,
    }));
    check("regress: in-book find still works", /[1-9]\d*\/[1-9]\d*/.test(findState.counter) && findState.marks >= 1, JSON.stringify(findState));
    await page.keyboard.press("Escape");
    // 5c. 位置持久化（含进设置页再返回）：恢复语义是“锚定保存 chunk + 章内偏移”，不是绝对 scrollY
    await page.evaluate(() => window.scrollTo(0, 2400));
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollBy(0, -80));
    await page.waitForTimeout(400);
    await page.click("#typoBtn");
    await page.click("#typoAllSettingsBtn");
    // showSettings 进入时 savePositionNow 落盘：以这份快照为恢复基准
    const savedPos = await page.evaluate(() => JSON.parse(localStorage.getItem("coreading-reader.position.c4-echo-maze") || "null"));
    await page.click("#settingsBackBtn");
    await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
    await page.waitForTimeout(600);
    const restored = await page.evaluate(() => {
      const section = document.querySelector(".flow-chunk");
      return {
        firstChunk: section?.dataset.chunkId || "",
        offset: Math.max(0, window.scrollY - (section?.offsetTop || 0) + 64),
      };
    });
    check("regress: settings round-trip restores saved chunk + in-chunk offset",
      savedPos && restored.firstChunk === savedPos.chunkId && Math.abs(restored.offset - savedPos.offset) < 80,
      JSON.stringify({ savedPos: { chunkId: savedPos?.chunkId, offset: savedPos?.offset }, restored }));
    check("regress: no page errors", errors.length === 0, errors.join("|").slice(0, 300));
    await context.close();
  }
  // 5d. /classic 仍可用
  {
    const res = await fetch(`${BASE}/classic`);
    const html = await res.text();
    check("regress: /classic still serves old shell", res.status === 200 && html.includes("script.js"), `status=${res.status}`);
  }

  await browser.close();
  console.log(`\nRESULT pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error("CHECK CRASH:", error);
  process.exit(1);
});
