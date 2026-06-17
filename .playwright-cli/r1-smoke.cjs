/* R1 smoke against ISOLATED sidecar (port 8899, isolated data dir + vault).
   Covers: #settings route, fine typography controls + persistence + legacy migration,
   font import (IndexedDB + FontFace), Nova skill cards, term renames, themes, mobile. */
const { chromium } = require("D:/npm-global/node_modules/playwright");

const BASE = "http://127.0.0.1:8899";
const BOOK_ID = "c4-echo-maze";
const FONT_FILE = "D:/Trellis/output/coreading-r1-font.ttf";
const OUT = "D:/Trellis/output";
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`PASS ${name}${detail ? " :: " + detail : ""}`); }
  else { fail += 1; console.log(`FAIL ${name}${detail ? " :: " + detail : ""}`); }
}

async function apiCommand(payload) {
  const res = await fetch(`${BASE}/api/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function snapshot() {
  const res = await fetch(`${BASE}/api/snapshot`);
  return res.json();
}

const novaPayloads = [];

async function preparePage(context, { legacySettings = false } = {}) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.route("**/api/nova/ask", async (route) => {
    novaPayloads.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: "success", content: "技能回复：先看这句，“回声迷宫的回廊里藏着读书人的脚印。”值得停留。" } });
  });
  await page.addInitScript(({ legacy }) => {
    localStorage.setItem("coreading-reader.autoPreRead", JSON.stringify("off"));
    // 只在首次加载注入旧档位（迁移后 settings 已存在，不能在 reload 时覆盖回去）。
    if (legacy && localStorage.getItem("coreading-reader.settings") === null) {
      localStorage.setItem("coreading-reader.settings", JSON.stringify({
        theme: "paper", font: "l", width: "narrow", line: "normal", para: "indent", companions: "on",
      }));
    }
  }, { legacy: legacySettings });
  return { page, errors };
}

async function flowMetrics(page) {
  return page.evaluate(() => {
    const flow = document.querySelector("#flow");
    const cs = getComputedStyle(flow);
    const p = flow.querySelector(".flow-chunk > p");
    return {
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      maxWidth: cs.maxWidth,
      paddingLeft: cs.paddingLeft,
      paddingTop: cs.paddingTop,
      paraMarginBottom: p ? getComputedStyle(p).marginBottom : "",
      fontFamily: cs.fontFamily,
    };
  });
}

async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

async function openBook(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".book-card", { timeout: 15000 });
  await page.click(".book-card");
  await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
  await page.waitForTimeout(300);
}

async function setRange(page, field, value) {
  await page.evaluate(({ field, value }) => {
    const input = document.querySelector(`#settingsView input.setting-range[data-field="${field}"]`);
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, { field, value });
}

(async () => {
  // 可重跑：取消上一轮遗留计划。
  const leftovers = await apiCommand({ command: "plan_list", bookId: BOOK_ID });
  for (const plan of leftovers.data?.plans || []) {
    if (plan.status !== "cancelled") await apiCommand({ command: "plan_update", planId: plan.planId, status: "cancelled" });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, errors } = await preparePage(context, { legacySettings: true });

  /* ============ 1. 旧档位迁移 ============ */
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".book-card", { timeout: 15000 });
  const migrated = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("coreading-reader.settings"));
    const cs = getComputedStyle(document.body);
    return {
      saved,
      theme: document.body.dataset.theme,
      fontVar: cs.getPropertyValue("--font-size").trim(),
      measureVar: cs.getPropertyValue("--measure").trim(),
      lineVar: cs.getPropertyValue("--line").trim(),
    };
  });
  check("migrate: l/narrow/normal -> 20px/32em/1.7 + theme kept",
    migrated.fontVar === "20px" && migrated.measureVar === "32em" && migrated.lineVar === "1.7" && migrated.theme === "paper",
    JSON.stringify({ fontVar: migrated.fontVar, measureVar: migrated.measureVar, lineVar: migrated.lineVar, theme: migrated.theme }));
  check("migrate: numeric keys stored, legacy keys deleted",
    migrated.saved.fontPx === 20 && migrated.saved.measureEm === 32 && migrated.saved.lineH === 1.7
      && !("font" in migrated.saved) && !("width" in migrated.saved) && !("line" in migrated.saved),
    JSON.stringify(migrated.saved));

  /* ============ 2. #settings 路由进出 ============ */
  await page.click("#shelfSettingsBtn");
  const route1 = await page.evaluate(() => ({
    hash: location.hash,
    settings: !document.getElementById("settingsView").hidden,
    shelf: document.getElementById("shelfView").hidden,
  }));
  check("route: shelf -> #settings", route1.hash === "#settings" && route1.settings && route1.shelf, JSON.stringify(route1));

  // 刷新停留在设置页
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  check("route: reload keeps #settings view",
    await page.evaluate(() => location.hash === "#settings" && !document.getElementById("settingsView").hidden));

  // 滑杆初值 = 迁移后的数值
  const rangeInit = await page.evaluate(() => {
    const get = (f) => document.querySelector(`#settingsView input.setting-range[data-field="${f}"]`).value;
    return { fontPx: get("fontPx"), lineH: get("lineH"), measureEm: get("measureEm") };
  });
  check("settings: sliders reflect migrated values",
    rangeInit.fontPx === "20" && rangeInit.lineH === "1.7" && rangeInit.measureEm === "32", JSON.stringify(rangeInit));

  /* ============ 3. 设置调节 + 三主题截图 ============ */
  await setRange(page, "fontPx", 22);
  await setRange(page, "lineH", 2.4);
  await setRange(page, "measureEm", 44);
  await page.click('#settingsView [data-setting="letter"] button[data-value="2"]');
  await page.click('#settingsView [data-setting="paraGap"] button[data-value="loose"]');
  await page.click('#settingsView [data-setting="margin"] button[data-value="wide"]');
  await page.click('#settingsView [data-setting="theme"] button[data-value="white"]');
  await page.waitForTimeout(200);
  check("settings: desktop no horizontal overflow", await noOverflow(page));
  await page.screenshot({ path: `${OUT}/coreading-r1-settings-white.png`, fullPage: false });
  await page.click('#settingsView [data-setting="theme"] button[data-value="paper"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/coreading-r1-settings-paper.png`, fullPage: false });
  await page.click('#settingsView [data-setting="theme"] button[data-value="dark"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/coreading-r1-settings-dark.png`, fullPage: false });

  // 返回（来路书架）
  await page.click("#settingsBackBtn");
  await page.waitForSelector(".book-card", { timeout: 15000 });
  check("route: settings back -> shelf", await page.evaluate(() =>
    !document.getElementById("shelfView").hidden && document.getElementById("settingsView").hidden));

  /* ============ 4. 正文 computed style 断言 + 刷新持久 ============ */
  await page.click(".book-card");
  await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
  const m1 = await flowMetrics(page);
  // 22px 字号、2.4 行距(52.8px)、0.05em 字间距(1.1px)、44em 页宽(968px)、宽页边距(48px/128px)、松段距(缩进式 0.8em=17.6px)
  check("typography: font-size 22px", m1.fontSize === "22px", m1.fontSize);
  check("typography: line-height 52.8px", m1.lineHeight === "52.8px", m1.lineHeight);
  check("typography: letter-spacing 1.1px", m1.letterSpacing === "1.1px", m1.letterSpacing);
  check("typography: measure 968px", m1.maxWidth === "968px", m1.maxWidth);
  check("typography: wide margin padding 48px/128px", m1.paddingLeft === "48px" && m1.paddingTop === "128px",
    `${m1.paddingLeft}/${m1.paddingTop}`);
  check("typography: loose para gap 17.6px", m1.paraMarginBottom === "17.6px", m1.paraMarginBottom);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
  const m2 = await flowMetrics(page);
  check("typography: persists after reload",
    m2.fontSize === "22px" && m2.lineHeight === "52.8px" && m2.letterSpacing === "1.1px" && m2.maxWidth === "968px",
    JSON.stringify({ fontSize: m2.fontSize, lineHeight: m2.lineHeight, letterSpacing: m2.letterSpacing, maxWidth: m2.maxWidth }));

  /* ============ 5. Aa 弹层：字号滑杆 + 全部设置 ============ */
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForTimeout(350);
  await page.click("#typoBtn");
  const popState = await page.evaluate(() => ({
    visible: !document.getElementById("typoPop").hidden,
    rows: document.querySelectorAll("#typoPop .typo-row").length,
    hasRange: !!document.querySelector("#typoPop input.setting-range[data-field='fontPx']"),
    hasAll: !!document.getElementById("typoAllSettingsBtn"),
  }));
  check("typoPop: simplified to theme + font slider + all-settings",
    popState.visible && popState.rows === 3 && popState.hasRange && popState.hasAll, JSON.stringify(popState));
  await page.evaluate(() => {
    const input = document.querySelector("#typoPop input.setting-range[data-field='fontPx']");
    input.value = "16";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const m3 = await flowMetrics(page);
  check("typoPop: font slider applies immediately", m3.fontSize === "16px", m3.fontSize);
  await page.click("#typoAllSettingsBtn");
  check("route: read -> Aa -> #settings", await page.evaluate(() =>
    location.hash === "#settings" && !document.getElementById("settingsView").hidden && document.getElementById("readView").hidden));
  await page.click("#settingsBackBtn");
  await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
  check("route: settings back -> same book", await page.evaluate((id) =>
    !document.getElementById("readView").hidden && location.hash === `#book=${encodeURIComponent(id)}`, BOOK_ID));

  /* ============ 6. 字体导入（IndexedDB + FontFace） ============ */
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForTimeout(350);
  await page.click("#typoBtn");
  await page.click("#typoAllSettingsBtn");
  await page.setInputFiles("#fontImportInput", FONT_FILE);
  await page.waitForFunction(() => /已导入|失败/.test(document.getElementById("fontImportStatus").textContent), null, { timeout: 10000 });
  const importState = await page.evaluate(() => ({
    status: document.getElementById("fontImportStatus").textContent,
    option: document.querySelector("#customFaceList button[data-value^='custom:']")?.textContent || "",
    registered: [...document.fonts].some((f) => f.family.startsWith("reader-custom-")),
  }));
  check("font: import registers FontFace + option appears",
    importState.status.includes("已导入") && importState.option.includes("我的字体·") && importState.registered,
    JSON.stringify(importState));
  await page.click("#customFaceList button[data-value^='custom:']");
  const faceApplied = await page.evaluate(() => ({
    face: document.body.dataset.face,
    faceFont: getComputedStyle(document.body).getPropertyValue("--face-font").trim(),
  }));
  check("font: custom face applied to --face-font",
    faceApplied.face === "custom" && faceApplied.faceFont.includes("reader-custom-"), JSON.stringify(faceApplied));
  await page.click("#settingsBackBtn");
  await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
  const flowFamily = (await flowMetrics(page)).fontFamily;
  check("font: flow computed font-family uses custom font", flowFamily.includes("reader-custom-"), flowFamily);

  // 刷新后 IndexedDB 重载注册
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
  await page.waitForFunction(() => [...document.fonts].some((f) => f.family.startsWith("reader-custom-")), null, { timeout: 10000 });
  const reloaded = await page.evaluate(() => ({
    family: getComputedStyle(document.querySelector("#flow")).fontFamily,
    loaded: [...document.fonts].some((f) => f.family.startsWith("reader-custom-") && f.status === "loaded"),
    option: !!document.querySelector("#customFaceList button[data-value^='custom:']"),
  }));
  check("font: reload restores custom font from IndexedDB",
    reloaded.family.includes("reader-custom-") && reloaded.loaded && reloaded.option, JSON.stringify(reloaded));

  // 删除回退衬线（二段确认）
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForTimeout(350);
  await page.click("#typoBtn");
  await page.click("#typoAllSettingsBtn");
  await page.click(".custom-face-del");
  await page.click(".custom-face-del");
  await page.waitForTimeout(400);
  const afterDelete = await page.evaluate(() => ({
    option: !!document.querySelector("#customFaceList button[data-value^='custom:']"),
    face: document.body.dataset.face,
    serifPressed: document.querySelector('#settingsView [data-setting="face"] button[data-value="serif"]').getAttribute("aria-pressed"),
  }));
  check("font: delete removes option and falls back to serif",
    !afterDelete.option && afterDelete.face === "serif" && afterDelete.serifPressed === "true", JSON.stringify(afterDelete));

  /* ============ 7. 数据清理（二段确认） ============ */
  const posKeysBefore = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("coreading-reader.position.")).length);
  await page.click("#clearPositionsBtn");
  const confirmText = await page.evaluate(() => document.getElementById("clearPositionsBtn").textContent);
  await page.click("#clearPositionsBtn");
  await page.waitForTimeout(300);
  const posKeysAfter = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("coreading-reader.position.")).length);
  check("data: two-step clear removes reading positions",
    posKeysBefore >= 1 && confirmText === "确认清除" && posKeysAfter === 0,
    `before=${posKeysBefore} confirm=${confirmText} after=${posKeysAfter}`);

  /* ============ 8. 技能卡 ============ */
  await page.click("#settingsBackBtn");
  await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
  await page.click("#novaStrip");
  await page.click("#skillToggleBtn");
  const skillVisible = await page.evaluate(() => ({
    open: !document.getElementById("skillBody").hidden,
    cards: [...document.querySelectorAll(".skill-card")].map((b) => `${b.textContent}:${b.disabled ? 0 : 1}`),
  }));
  check("skills: 2x3 cards expand and enabled", skillVisible.open && skillVisible.cards.filter((c) => c.endsWith(":1")).length === 6,
    JSON.stringify(skillVisible));

  // 8.1 预读本段
  novaPayloads.length = 0;
  await page.click("#skillPreReadBtn");
  await page.waitForFunction(() => /预读完成|失败|没有返回/.test(document.getElementById("skillStatus").textContent), null, { timeout: 15000 });
  const preread = novaPayloads[0] || {};
  check("skills: preread payload shape",
    preread.maxAttempts === 1 && preread.clientTimeoutMs === 360000
      && preread.context?.contextMode === "autonomous-reading" && preread.context?.chunkId
      && Array.isArray(preread.context?.tocPreview) && Array.isArray(preread.context?.autonomousCandidates)
      && preread.context.autonomousCandidates.length >= 1,
    JSON.stringify({ chunkId: preread.context?.chunkId, candidates: preread.context?.autonomousCandidates?.length, toc: preread.context?.tocPreview?.length }));
  const prereadShown = await page.evaluate(() => ({
    status: document.getElementById("skillStatus").textContent,
    meta: document.getElementById("novaReplyMeta").textContent,
    reply: document.getElementById("novaReply").textContent.slice(0, 20),
  }));
  check("skills: preread reply shown in Nova pane",
    prereadShown.status.includes("预读完成") && prereadShown.meta.includes("Nova 预读") && prereadShown.reply.includes("技能回复"),
    JSON.stringify(prereadShown));

  // 8.2 先看全书
  novaPayloads.length = 0;
  await page.click("#skillScoutBtn");
  await page.waitForFunction(() => /巡读完成|失败|没有返回/.test(document.getElementById("skillStatus").textContent), null, { timeout: 15000 });
  const scout = novaPayloads[0] || {};
  check("skills: book scout payload shape (scope=book)",
    scout.context?.scope === "book" && scout.context?.chunkId === "" && scout.context?.contextMode === "autonomous-reading"
      && Array.isArray(scout.context?.autonomousCandidates) && scout.context.autonomousCandidates.length >= 1
      && scout.context.autonomousCandidates.length <= 4 && (scout.prompt || "").includes("巡读"),
    JSON.stringify({ scope: scout.context?.scope, candidates: scout.context?.autonomousCandidates?.length }));
  const scoutShown = await page.evaluate(() => document.getElementById("novaReplyMeta").textContent);
  check("skills: scout reply labeled as 巡读", scoutShown.includes("Nova 巡读"), scoutShown);

  // 8.3 相关段落（无选区 → 章节标题做线索）
  await page.click("#skillTrailBtn");
  await page.waitForFunction(() => !document.getElementById("trailDrawer").hidden
    || /失败|先选中/.test(document.getElementById("skillStatus").textContent), null, { timeout: 20000 });
  const trailState = await page.evaluate(() => ({
    drawer: !document.getElementById("trailDrawer").hidden,
    title: document.querySelector("#trailDrawer .sink-head span").textContent,
    summary: document.getElementById("trailSummary").textContent,
    rows: document.querySelectorAll("#trailList .trail-row").length,
  }));
  check("skills: trail opens drawer with bounded evidence",
    trailState.drawer && trailState.title === "相关段落" && trailState.rows >= 1, JSON.stringify(trailState));
  await page.click("#trailCloseBtn");

  // 8.4 评价本段（真实落库）
  const reviewsBefore = ((await snapshot()).reviews || []).length;
  await page.click("#skillReviewBtn");
  await page.waitForFunction(() => /已生成本段评价|失败/.test(document.getElementById("skillStatus").textContent), null, { timeout: 20000 });
  const reviewsAfter = (await snapshot()).reviews || [];
  const newReview = reviewsAfter.length === reviewsBefore + 1;
  check("skills: review_create lands in isolated sidecar",
    newReview && (await page.evaluate(() => document.getElementById("skillStatus").textContent)).includes("已生成本段评价"),
    `before=${reviewsBefore} after=${reviewsAfter.length}`);

  // 8.5 计划本章（复用 createPlanForCurrentSection）
  await page.click("#skillPlanBtn");
  await page.waitForFunction(() => /已创建本章计划|创建失败/.test(document.getElementById("planStatus").textContent), null, { timeout: 20000 });
  const planState = await page.evaluate(() => ({
    status: document.getElementById("planStatus").textContent,
    label: document.getElementById("planToggleLabel").textContent,
    open: !document.getElementById("planBody").hidden,
  }));
  check("skills: plan card creates current-section plan",
    planState.status.includes("已创建本章计划") && planState.open, JSON.stringify(planState));

  // 8.6 导出本段（C2 链：目标弹层 → review_create → sink_preview_create）
  const previewsBefore = ((await snapshot()).sinkPreviews || []).length;
  await page.click("#skillSinkBtn");
  await page.waitForSelector("#sinkTargetPop:not([hidden])", { timeout: 5000 });
  await page.evaluate(() => {
    const obsidian = document.querySelector('#sinkTargetPop input[value="obsidian"]');
    if (!obsidian.checked) obsidian.click();
  });
  await page.click("#sinkTargetConfirmBtn");
  await page.waitForFunction(() => document.getElementById("sinkTargetPop").hidden
    || /失败/.test(document.getElementById("sinkTargetStatus").textContent), null, { timeout: 20000 });
  const previewsAfter = (await snapshot()).sinkPreviews || [];
  const lastPreview = previewsAfter[previewsAfter.length - 1] || {};
  check("skills: sink chain creates pending preview",
    previewsAfter.length === previewsBefore + 1 && lastPreview.status === "pending" && lastPreview.bookId === BOOK_ID,
    JSON.stringify({ count: previewsAfter.length, status: lastPreview.status, target: lastPreview.target }));
  const badge = await page.evaluate(() => ({
    hidden: document.getElementById("sinkBadge").hidden,
    text: document.getElementById("sinkBadge").textContent,
  }));
  check("skills: sink badge shows pending count", !badge.hidden && Number(badge.text) >= 1, JSON.stringify(badge));

  /* ============ 9. 术语改名：DOM 全文无“沉淀/追线索” ============ */
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForTimeout(350);
  await page.click("#sinkBtn");
  await page.waitForTimeout(500);
  const readText = await page.evaluate(() => document.body.innerText);
  check("rename: read view + drawer has no 沉淀/追线索", !/沉淀|追线索/.test(readText),
    (readText.match(/.{0,12}(沉淀|追线索).{0,12}/g) || []).join(" | "));
  check("rename: new terms present", readText.includes("导出箱") && readText.includes("导出"), "导出箱/导出 found");
  await page.click("#sinkCloseBtn");

  // 选区工具条上的“相关段落”
  await page.evaluate(() => {
    const p = document.querySelector(".flow-chunk > p");
    const range = document.createRange();
    range.setStart(p.firstChild, 0);
    range.setEnd(p.firstChild, Math.min(12, p.firstChild.textContent.length));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const selToolText = await page.evaluate(() => document.getElementById("selTool").innerText);
  check("rename: selection toolbar says 相关段落", selToolText.includes("相关段落") && !selToolText.includes("追线索"), selToolText);

  // 书架视图文本
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForTimeout(350);
  await page.click("#backBtn");
  await page.waitForSelector(".book-card", { timeout: 15000 });
  const shelfText = await page.evaluate(() => document.body.innerText);
  check("rename: shelf has no 沉淀/追线索", !/沉淀|追线索/.test(shelfText));

  check("console: no page errors (desktop)", errors.length === 0, errors.join(" | ").slice(0, 400));
  await page.close();

  /* ============ 10. 移动端 ============ */
  const mobile = await context.browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const { page: mpage, errors: merrors } = await preparePage(mobile);
  await mpage.goto(`${BASE}/#settings`, { waitUntil: "domcontentloaded" });
  await mpage.waitForTimeout(500);
  const mobileState = await mpage.evaluate(() => ({
    settings: !document.getElementById("settingsView").hidden,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
  check("mobile: #settings renders without overflow", mobileState.settings && !mobileState.overflow, JSON.stringify(mobileState));
  await mpage.screenshot({ path: `${OUT}/coreading-r1-settings-mobile.png` });
  check("console: no page errors (mobile)", merrors.length === 0, merrors.join(" | ").slice(0, 300));
  await mpage.close();
  await mobile.close();

  await browser.close();
  console.log(`\nRESULT pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error("SMOKE CRASH:", error);
  process.exit(1);
});
