/* C4 trellis-check deep edge cases against ISOLATED sidecar (8897).
   Focus: find/annot partial overlap slicing, redecorate preservation, load-more guard,
   bookmark FIFO + race + isolation, fullscreen rejection fallback, plan failure recovery,
   missing-field tolerance, Esc chain, regressions. */
const { chromium } = require("D:/npm-global/node_modules/playwright");

const BASE = "http://127.0.0.1:8897";
const BOOK_ID = "c4-echo-maze";
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

async function preparePage(context) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.route("**/api/nova/ask", (route) => route.fulfill({ json: { status: "success", content: "stub" } }));
  await page.addInitScript(() => {
    localStorage.setItem("coreading-reader.autoPreRead", JSON.stringify("off"));
  });
  return { page, errors };
}

async function openBook(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".book-card", { timeout: 15000 });
  await page.click(".book-card:has-text('回声迷宫读本')");
  await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForTimeout(350);
  await page.click("#tocBtn");
  await page.click(".toc-item:has-text('第一章 回声的入口')");
  await page.waitForSelector('.flow-chunk[data-chunk-id="ch00"]', { timeout: 15000 });
  await page.waitForSelector(".annot-underline", { timeout: 15000 });
  await page.waitForTimeout(400);
}

(async () => {
  /* 部分重叠用的第二条笔记：quote 只盖住段落中段。 */
  const partial = await apiCommand({
    command: "user_note_create",
    bookId: BOOK_ID,
    chunkId: "ch00",
    quote: "隐喻也有自己的承重墙",
    quoteOffset: null,
    note: "C4 check：部分重叠测试用注。",
    kind: "note",
    status: "open",
  });
  if (partial.status === "error") throw new Error("partial note seed failed");

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, errors } = await preparePage(context);
  await openBook(page);

  /* ===== 1. 查找与评注的部分重叠切片 ===== */
  await page.keyboard.press("Control+f");
  // “只是隐喻，但隐喻也有” 跨过注释 quote（隐喻也有自己的承重墙）的左边界。
  await page.fill("#findInput", "只是隐喻，但隐喻也有");
  await page.waitForTimeout(400);
  const overlap = await page.evaluate(() => {
    const para = [...document.querySelectorAll(".flow-chunk > p")]
      .find((p) => p.textContent.includes("承重墙"));
    return {
      text: para.textContent,
      count: document.getElementById("findCount").textContent,
      findOnly: [...para.querySelectorAll("mark.find-mark:not(.annot-underline)")].map((n) => n.textContent),
      both: [...para.querySelectorAll("mark.find-mark.annot-underline")].map((n) => n.textContent),
      annotOnly: [...para.querySelectorAll(".annot-underline:not(.find-mark)")].map((n) => n.textContent),
    };
  });
  check("overlap: paragraph text intact after partial-overlap slicing",
    overlap.text === "有人说回声迷宫只是隐喻，但隐喻也有自己的承重墙。", overlap.text);
  check("overlap: slices classified find-only / both / annot-only",
    overlap.findOnly.join("") === "只是隐喻，但" && overlap.both.join("") === "隐喻也有"
      && overlap.annotOnly.join("") === "自己的承重墙" && overlap.count === "1/1",
    JSON.stringify(overlap));

  // 点重叠片仍能打开评论卡（mark 元素也带 annot-underline 链路）
  await page.click("mark.find-mark.annot-underline");
  await page.waitForTimeout(200);
  const cardOpen = await page.evaluate(() => ({
    open: !document.getElementById("commentCard").hidden,
    text: document.getElementById("commentCard").textContent.includes("部分重叠测试用注"),
  }));
  check("overlap: clicking overlapped slice opens comment card", cardOpen.open && cardOpen.text, JSON.stringify(cardOpen));
  await page.keyboard.press("Escape"); // 全清：评论卡 + 查找条
  await page.waitForTimeout(200);

  /* ===== 2. 异步 redecorate 不破坏查找、计数不漂移 ===== */
  await page.keyboard.press("Control+f");
  await page.fill("#findInput", "回声迷宫");
  await page.waitForTimeout(400);
  const drift = await page.evaluate(() => {
    const before = {
      count: document.getElementById("findCount").textContent,
      marks: document.querySelectorAll("mark.find-mark").length,
      active: document.querySelector("mark.find-active")?.textContent || "",
    };
    // 模拟书友评论异步到达后的重渲染路径
    rebuildAnnotations();
    redecorateChunk("ch00");
    const after = {
      count: document.getElementById("findCount").textContent,
      marks: document.querySelectorAll("mark.find-mark").length,
      active: document.querySelector("mark.find-active")?.textContent || "",
    };
    return { before, after };
  });
  check("redecorate: find marks/count/active preserved",
    drift.before.count === drift.after.count && drift.before.marks === drift.after.marks
      && drift.before.active === drift.after.active && drift.after.marks > 0,
    JSON.stringify(drift));

  /* ===== 3. 加载更多并发守卫：双发 findLoadMore 不重复加载 ===== */
  await page.fill("#findInput", "深井之钥");
  await page.waitForTimeout(400);
  const concurrent = await page.evaluate(async () => {
    const before = state.loadedTo;
    await Promise.all([findLoadMore(), findLoadMore()]);
    const ids = [...document.querySelectorAll(".flow-chunk")].map((s) => s.dataset.chunkId);
    return {
      before,
      after: state.loadedTo,
      dupes: ids.length !== new Set(ids).size,
      count: document.getElementById("findCount").textContent,
    };
  });
  check("find-more: concurrent double call loads without duplicate chunks",
    !concurrent.dupes && concurrent.count === "1/1" && concurrent.after > concurrent.before,
    JSON.stringify(concurrent));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  /* ===== 4. 书签：FIFO 50 / 跨书隔离 / 连点竞态 ===== */
  const fifo = await page.evaluate(() => {
    localStorage.removeItem("coreading-reader.bookmarks.c4-echo-maze");
    for (let i = 0; i < 55; i += 1) addBookmark();
    const list = JSON.parse(localStorage.getItem("coreading-reader.bookmarks.c4-echo-maze") || "[]");
    const otherKeys = Object.keys(localStorage).filter((k) => k.startsWith("coreading-reader.bookmarks.") && !k.endsWith("c4-echo-maze"));
    return { length: list.length, otherKeys };
  });
  check("bookmark: FIFO caps at 50 (oldest dropped)", fifo.length === 50, `len=${fifo.length}`);
  check("bookmark: storage isolated per book id", fifo.otherKeys.length === 0, JSON.stringify(fifo.otherKeys));

  // 连点两个不同 chunk 的书签：后点的赢，无死锁
  const race = await page.evaluate(async () => {
    localStorage.removeItem("coreading-reader.bookmarks.c4-echo-maze");
    await anchorFlowAt(0); // 回到书首，确保 ch05/ch09 都不在 DOM，逼出双 anchorFlowAt 竞争
    const mk = (chunkId, offset) => ({ id: `bm-${chunkId}`, chunkId, offset, percent: 50, createdAt: new Date().toISOString() });
    const p1 = openBookmark(mk("ch09", 120)); // 远端：触发 anchorFlowAt
    const p2 = openBookmark(mk("ch05", 200)); // 紧跟着点第二个
    await Promise.all([p1, p2]);
    await new Promise((r) => setTimeout(r, 800));
    const sections = [...document.querySelectorAll(".flow-chunk")].map((s) => s.dataset.chunkId);
    return { sections: sections.slice(0, 3), active: state.activeChunkId, loading: state.flowLoading };
  });
  check("bookmark: rapid double-open settles on the second target without deadlock",
    race.sections[0] === "ch05" && !race.loading,
    JSON.stringify(race));

  /* ===== 5. Esc 链：目录抽屉 + 查找 + 沉浸一次性全清（既有扁平约定） ===== */
  await page.evaluate(() => { document.body.classList.remove("immersive"); });
  await page.keyboard.press("Control+f");
  await page.fill("#findInput", "回声");
  await page.waitForTimeout(300);
  await page.evaluate(() => { openToc(); enterImmersive(); });
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const escAll = await page.evaluate(() => ({
    toc: document.getElementById("tocDrawer").hidden,
    find: document.getElementById("findBar").hidden,
    immersive: document.body.classList.contains("immersive"),
    marks: document.querySelectorAll("mark.find-mark").length,
    fullscreen: Boolean(document.fullscreenElement),
  }));
  check("esc: one Esc clears drawer + find + immersive with no mark residue",
    escAll.toc && escAll.find && !escAll.immersive && escAll.marks === 0 && !escAll.fullscreen,
    JSON.stringify(escAll));

  /* ===== 6. 全屏被拒：优雅降级 + 状态一致 ===== */
  const rejectedPage = await preparePage(context);
  await rejectedPage.page.addInitScript(() => {
    Element.prototype.requestFullscreen = function () { return Promise.reject(new DOMException("denied")); };
  });
  const p2 = rejectedPage.page;
  await openBook(p2);
  await p2.evaluate(() => window.scrollBy(0, -80));
  await p2.waitForTimeout(350);
  await p2.click("#fullscreenBtn");
  await p2.waitForTimeout(300);
  const degraded = await p2.evaluate(() => ({
    immersive: document.body.classList.contains("immersive"),
    fullscreenEl: Boolean(document.fullscreenElement),
    btn: document.getElementById("fullscreenBtn").textContent,
    topbarHidden: document.getElementById("topbar").classList.contains("hidden"),
  }));
  check("fullscreen-denied: immersive class kept as degraded mode, button synced",
    degraded.immersive && !degraded.fullscreenEl && degraded.btn === "退出全屏" && degraded.topbarHidden,
    JSON.stringify(degraded));
  await p2.keyboard.press("Escape");
  await p2.waitForTimeout(200);
  const degradedExit = await p2.evaluate(() => ({
    immersive: document.body.classList.contains("immersive"),
    btn: document.getElementById("fullscreenBtn").textContent,
    topbarHidden: document.getElementById("topbar").classList.contains("hidden"),
  }));
  check("fullscreen-denied: Esc exits degraded immersive cleanly",
    !degradedExit.immersive && degradedExit.btn === "全屏" && !degradedExit.topbarHidden,
    JSON.stringify(degradedExit));
  check("fullscreen-denied: no console/page errors", rejectedPage.errors.length === 0,
    rejectedPage.errors.slice(0, 3).join(" || ") || "clean");
  await p2.close();

  /* ===== 7. 计划：执行失败 UI 恢复 ===== */
  const failPage = await preparePage(context);
  const p3 = failPage.page;
  await p3.route("**/api/command", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    if (body.command === "plan_execute_step") {
      return route.fulfill({ status: 500, json: { status: "error", error: "C4 check 注入的执行失败" } });
    }
    return route.fallback();
  });
  await openBook(p3);
  await p3.evaluate(() => {
    if (document.getElementById("novaPanel").hidden) document.getElementById("novaStrip").click();
  });
  await p3.waitForTimeout(200);
  await p3.click("#planToggleBtn");
  await p3.waitForFunction(() => !/读取/.test(document.getElementById("planStepMeta").textContent), { timeout: 15000 });
  const planBefore = await p3.evaluate(() => ({
    meta: document.getElementById("planStepMeta").textContent,
    title: document.getElementById("planStepTitle").textContent,
  }));
  await p3.click("#planDoneStepBtn");
  await p3.waitForFunction(() => /执行失败/.test(document.getElementById("planStatus").textContent), { timeout: 15000 });
  const planAfterFail = await p3.evaluate(() => ({
    status: document.getElementById("planStatus").textContent,
    meta: document.getElementById("planStepMeta").textContent,
    title: document.getElementById("planStepTitle").textContent,
    doneEnabled: !document.getElementById("planDoneStepBtn").disabled,
    sectionEnabled: !document.getElementById("planSectionBtn").disabled,
  }));
  check("plan-fail: failure surfaces server message, step unchanged, buttons re-enabled",
    /执行失败：C4 check 注入的执行失败/.test(planAfterFail.status) && planAfterFail.meta === planBefore.meta
      && planAfterFail.title === planBefore.title && planAfterFail.doneEnabled && planAfterFail.sectionEnabled,
    JSON.stringify({ before: planBefore, after: planAfterFail }));
  check("plan-fail: no console/page errors (injected 500 resource log excluded)",
    failPage.errors.filter((e) => !/status of 500/.test(e)).length === 0,
    failPage.errors.slice(0, 3).join(" || ") || "clean");
  await p3.close();

  /* ===== 8. 计划数据缺字段容错 + 无 sectionIndex 回退 ===== */
  const tolerance = await page.evaluate(() => {
    const saved = { plan: state.plan, open: state.planOpen, chunks: state.chunks };
    const out = {};
    try {
      state.planOpen = true;
      document.getElementById("planBody").hidden = false;
      state.plan = { planId: "x", hydrated: true, nextStep: {} }; // 无 title/range/chunkIds/counts
      renderPlanSection();
      out.emptyStep = {
        label: document.getElementById("planToggleLabel").textContent,
        meta: document.getElementById("planStepMeta").textContent,
        readDisabled: document.getElementById("planReadStepBtn").disabled,
      };
      state.plan = planCacheFromResult("y", undefined, undefined, {});
      renderPlanSection();
      out.emptyResult = {
        label: document.getElementById("planToggleLabel").textContent,
        stepCount: state.plan.stepCount,
        doneCount: state.plan.doneCount,
      };
      // 无 sectionIndex 的书：计划本章退化为单 chunk
      state.chunks = saved.chunks.map((c) => ({ ...c, sectionIndex: undefined }));
      out.noSection = currentSectionRange();
      out.error = null;
    } catch (e) {
      out.error = String(e);
    } finally {
      state.chunks = saved.chunks;
      state.plan = saved.plan;
      state.planOpen = saved.open;
      renderPlanSection();
    }
    return out;
  });
  check("plan-tolerance: empty step / empty result render without crash",
    !tolerance.error && /^计划/.test(tolerance.emptyStep.label) && tolerance.emptyStep.readDisabled
      && tolerance.emptyResult.label.includes("已全部完成") && tolerance.emptyResult.stepCount === 0,
    JSON.stringify(tolerance));
  check("plan-tolerance: no sectionIndex falls back to single-chunk section",
    tolerance.noSection && tolerance.noSection.startChunkId === tolerance.noSection.endChunkId,
    JSON.stringify(tolerance.noSection));

  /* ===== 9. XSS：查找/目录搜索输入不进 HTML ===== */
  const xss = await page.evaluate(() => {
    document.getElementById("findInput").value = "<img src=x onerror=window.__c4xss=1>";
    runFind();
    openToc();
    document.getElementById("tocSearch").value = "<svg onload=window.__c4xss=2>";
    renderToc();
    renderTocBookmarks();
    const out = {
      xssFired: window.__c4xss || null,
      injected: document.querySelector("#flow img, #tocList svg, #flow svg") !== null,
    };
    document.getElementById("tocSearch").value = "";
    closeToc();
    document.getElementById("findInput").value = "";
    runFind();
    closeFindBar();
    return out;
  });
  check("xss: find/toc-search inputs render inert", !xss.xssFired && !xss.injected, JSON.stringify(xss));

  /* ===== 10. 回归抽查：主题 / 位置持久化 / Nova 提问 / 沉淀箱 ===== */
  await page.evaluate(() => {
    document.body.dataset.theme = "dark";
    const saved = readJson(SETTINGS_KEY) || {};
    saved.theme = "dark";
    writeJson(SETTINGS_KEY, saved);
  });
  const theme = await page.evaluate(() => document.body.dataset.theme);
  check("regression: dark theme applies", theme === "dark", `theme=${theme}`);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(900);
  await page.evaluate(() => savePositionNow());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".flow-chunk > p", { timeout: 20000 });
  await page.waitForTimeout(800);
  const restored = await page.evaluate(() => ({
    theme: document.body.dataset.theme,
    scrollY: window.scrollY,
    book: state.bookId,
  }));
  check("regression: reload restores book, theme, and reading position",
    restored.theme === "dark" && restored.book === "c4-echo-maze" && restored.scrollY > 0,
    JSON.stringify(restored));
  await page.evaluate(() => {
    if (document.getElementById("novaPanel").hidden) document.getElementById("novaStrip").click();
  });
  await page.fill("#novaPrompt", "C4 回归提问");
  await page.click("#novaSendBtn");
  await page.waitForFunction(() => /stub/.test(document.getElementById("novaReply").textContent), { timeout: 10000 });
  check("regression: nova ask renders stubbed reply", true);
  const sinkDrawerOk = await page.evaluate(() => {
    document.getElementById("sinkBtn").click();
    const open = !document.getElementById("sinkDrawer").hidden;
    closeSinkDrawer();
    return open;
  });
  check("regression: sink drawer opens from topbar", sinkDrawerOk);

  await page.screenshot({ path: "D:/Trellis/output/coreading-c4-check-desktop.png" });
  check("desktop: no console/page errors", errors.length === 0, errors.slice(0, 5).join(" || ") || "clean");

  await browser.close();
  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error("CHECK CRASH:", error);
  process.exit(1);
});
