/* C4 integration smoke against ISOLATED sidecar (port 8897, isolated data dir).
   Covers: in-book find (Ctrl+F), bookmarks, immersive fullscreen, TOC search, reading plan. */
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
  // 锚点跟随 lastChunkId 漂移（前一轮计划执行会推进它）：统一跳回第一章，保证 ch00 在加载流里。
  await revealTopbar(page);
  await page.click("#tocBtn");
  await page.click(".toc-item:has-text('第一章 回声的入口')");
  await page.waitForSelector('.flow-chunk[data-chunk-id="ch00"]', { timeout: 15000 });
  await page.waitForSelector(".annot-underline", { timeout: 15000 }); // 第一章笔记的虚线已就绪
  await page.waitForTimeout(400);
}

async function revealTopbar(page) {
  // 顶栏下滚自动隐藏（transform 平移出视口）；点顶栏按钮前先小幅上滚唤回。
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForTimeout(350);
}

(async () => {
  // 可重跑：把前一轮遗留的计划全部取消，让“无计划 → 建计划 → 推进”从干净状态开始。
  const leftovers = await apiCommand({ command: "plan_list", bookId: BOOK_ID });
  for (const plan of leftovers.data?.plans || []) {
    if (plan.status !== "cancelled") {
      await apiCommand({ command: "plan_update", planId: plan.planId, status: "cancelled" });
    }
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, errors } = await preparePage(context);

  /* ============ 打开书 ============ */
  await openBook(page);
  const loaded = await page.evaluate(() => ({
    chunks: [...document.querySelectorAll(".flow-chunk")].map((s) => s.dataset.chunkId),
    underlines: document.querySelectorAll(".annot-underline").length,
  }));
  check("open: book flow loaded with note underline",
    loaded.chunks.length >= 3 && loaded.underlines >= 1,
    `chunks=${loaded.chunks.join(",")} underlines=${loaded.underlines}`);

  /* ============ 1. 书内查找 ============ */
  await page.keyboard.press("Control+f");
  const findOpen = await page.evaluate(() => ({
    visible: !document.getElementById("findBar").hidden,
    focused: document.activeElement?.id === "findInput",
  }));
  check("find: Ctrl+F opens bar and focuses input", findOpen.visible && findOpen.focused, JSON.stringify(findOpen));

  const expectedHits = await page.evaluate(() => {
    let count = 0;
    for (const p of document.querySelectorAll("#flow .flow-chunk > p")) {
      const text = p.textContent;
      let i = text.indexOf("回声迷宫");
      while (i >= 0) { count += 1; i = text.indexOf("回声迷宫", i + 4); }
    }
    return count;
  });
  await page.fill("#findInput", "回声迷宫");
  await page.waitForTimeout(450);
  const findState1 = await page.evaluate(() => ({
    count: document.getElementById("findCount").textContent,
    marks: document.querySelectorAll("mark.find-mark").length,
    active: document.querySelectorAll("mark.find-active").length,
    coexist: document.querySelectorAll("mark.find-mark.annot-underline").length,
    underlines: document.querySelectorAll(".annot-underline").length,
  }));
  check("find: n/m counter matches text occurrences",
    findState1.count === `1/${expectedHits}` && expectedHits >= 4,
    `count=${findState1.count} expected=${expectedHits}`);
  check("find: marks rendered with one active", findState1.marks >= expectedHits && findState1.active >= 1,
    `marks=${findState1.marks} active=${findState1.active}`);
  check("find: coexists with dashed annotation in same segment",
    findState1.coexist >= 1 && findState1.underlines >= 1,
    `both-classes=${findState1.coexist}`);

  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.click("#findNextBtn");
  await page.click("#findNextBtn");
  await page.click("#findNextBtn");
  await page.waitForTimeout(200);
  const nav = await page.evaluate(() => {
    const mark = document.querySelector("mark.find-active");
    const rect = mark ? mark.getBoundingClientRect() : null;
    return {
      count: document.getElementById("findCount").textContent,
      scrollY: window.scrollY,
      markTop: rect ? Math.round(rect.top) : null,
      vh: window.innerHeight,
    };
  });
  check("find: next advances counter", nav.count === `4/${expectedHits}`, `count=${nav.count}`);
  check("find: active hit scrolled toward center",
    nav.markTop !== null && (nav.scrollY === 0 || Math.abs(nav.markTop - nav.vh * 0.4) < 60),
    `scroll ${scrollBefore}->${nav.scrollY} markTop=${nav.markTop} band=${Math.round(nav.vh * 0.4)}`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const afterEsc = await page.evaluate(() => ({
    barHidden: document.getElementById("findBar").hidden,
    marks: document.querySelectorAll("mark.find-mark").length,
    underlines: document.querySelectorAll(".annot-underline").length,
    inputValue: document.getElementById("findInput").value,
  }));
  check("find: Esc clears all marks without residue, underlines preserved",
    afterEsc.barHidden && afterEsc.marks === 0 && afterEsc.underlines >= 1 && afterEsc.inputValue === "",
    JSON.stringify(afterEsc));

  /* 已加载部分查不到 → 加载更多继续找（“深井之钥”只在 ch09） */
  await page.keyboard.press("Control+f");
  await page.fill("#findInput", "深井之钥");
  await page.waitForTimeout(450);
  const noHit = await page.evaluate(() => ({
    count: document.getElementById("findCount").textContent,
    moreVisible: !document.getElementById("findMoreBtn").hidden,
  }));
  check("find: 0/0 plus load-more affordance when term beyond loaded flow",
    noHit.count === "0/0" && noHit.moreVisible, JSON.stringify(noHit));
  await page.click("#findMoreBtn");
  await page.waitForFunction(() => document.getElementById("findCount").textContent === "1/1", { timeout: 20000 });
  const deepHit = await page.evaluate(() => {
    const mark = document.querySelector("mark.find-active");
    const section = mark?.closest(".flow-chunk");
    return { chunk: section?.dataset.chunkId, visibleTop: mark ? Math.round(mark.getBoundingClientRect().top) : null };
  });
  check("find: load-more continued search into ch09 and scrolled to hit",
    deepHit.chunk === "ch09" && deepHit.visibleTop !== null && deepHit.visibleTop > 0 && deepHit.visibleTop < 900,
    JSON.stringify(deepHit));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  /* ============ 2. 书签 ============ */
  await revealTopbar(page);
  await page.click("#tocBtn");
  await page.click(".toc-item:has-text('第三章 平原行记')");
  await page.waitForSelector('.flow-chunk[data-chunk-id="ch03"]', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(500);
  await revealTopbar(page);
  await page.click("#bookmarkBtn");
  const feedback = await page.evaluate(() => document.getElementById("bookmarkBtn").textContent);
  check("bookmark: instant feedback text", feedback === "已加书签", `text=${feedback}`);
  await page.waitForTimeout(1400);
  const saved = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem("coreading-reader.bookmarks.c4-echo-maze") || "[]");
    return { restored: document.getElementById("bookmarkBtn").textContent, list };
  });
  check("bookmark: stored with chunk + offset + time, button restored",
    saved.restored === "书签" && saved.list.length === 1 && saved.list[0].chunkId === "ch03"
      && saved.list[0].offset > 0 && Boolean(saved.list[0].createdAt),
    JSON.stringify(saved.list));
  const savedOffset = saved.list[0].offset;

  // 跳走再从目录书签恢复
  await revealTopbar(page);
  await page.click("#tocBtn");
  await page.click(".toc-item:has-text('第一章 回声的入口')");
  await page.waitForSelector('.flow-chunk[data-chunk-id="ch00"]', { timeout: 10000 });
  await page.waitForTimeout(400);
  await revealTopbar(page);
  await page.click("#tocBtn");
  const bmRow = await page.evaluate(() => ({
    groupVisible: !document.getElementById("tocBookmarks").hidden,
    title: document.querySelector(".toc-bookmark-title")?.textContent,
    meta: document.querySelector(".toc-bookmark-meta")?.textContent,
  }));
  check("bookmark: drawer group shows entry with section title + percent + time",
    bmRow.groupVisible && bmRow.title === "第三章 平原行记" && /%/.test(bmRow.meta || ""),
    JSON.stringify(bmRow));
  await page.click(".toc-bookmark-open");
  await page.waitForSelector('.flow-chunk[data-chunk-id="ch03"]', { timeout: 10000 });
  await page.waitForTimeout(600);
  const restored = await page.evaluate(() => {
    const section = document.querySelector('.flow-chunk[data-chunk-id="ch03"]');
    return {
      offsetNow: Math.round(window.scrollY - section.offsetTop + 64),
      active: (() => {
        const sections = [...document.querySelectorAll(".flow-chunk")];
        const target = window.scrollY + window.innerHeight * 0.3;
        let active = sections[0];
        for (const s of sections) { if (s.offsetTop <= target) active = s; else break; }
        return active.dataset.chunkId;
      })(),
    };
  });
  check("bookmark: restore returns to chunk with approximate scroll offset",
    restored.active === "ch03" && Math.abs(restored.offsetNow - savedOffset) < 40,
    `offset saved=${savedOffset} now=${restored.offsetNow} active=${restored.active}`);

  // 删除书签
  await revealTopbar(page);
  await page.click("#tocBtn");
  await page.click(".toc-bookmark-del");
  await page.waitForTimeout(150);
  const afterDel = await page.evaluate(() => ({
    groupHidden: document.getElementById("tocBookmarks").hidden,
    stored: JSON.parse(localStorage.getItem("coreading-reader.bookmarks.c4-echo-maze") || "[]").length,
  }));
  check("bookmark: delete removes entry and hides empty group",
    afterDel.groupHidden && afterDel.stored === 0, JSON.stringify(afterDel));
  await page.keyboard.press("Escape");

  /* ============ 3. 沉浸全屏 ============ */
  await page.click("#novaStrip"); // 先打开 Nova，验证全屏会折叠它
  await page.waitForTimeout(200);
  await revealTopbar(page);
  await page.click("#fullscreenBtn");
  await page.waitForTimeout(400);
  const immersive = await page.evaluate(() => ({
    bodyClass: document.body.classList.contains("immersive"),
    novaCollapsed: document.getElementById("novaPanel").hidden && !document.body.classList.contains("nova-open"),
    topbarHidden: document.getElementById("topbar").classList.contains("hidden"),
    btnText: document.getElementById("fullscreenBtn").textContent,
    fullscreenEl: Boolean(document.fullscreenElement),
  }));
  check("immersive: body class + nova collapsed + topbar initially hidden",
    immersive.bodyClass && immersive.novaCollapsed && immersive.topbarHidden && immersive.btnText === "退出全屏",
    JSON.stringify(immersive));

  await page.mouse.move(600, 4); // 鼠标到顶部边缘唤出顶栏
  await page.waitForTimeout(200);
  const edgeReveal = await page.evaluate(() => !document.getElementById("topbar").classList.contains("hidden"));
  check("immersive: mouse at top edge reveals topbar", edgeReveal);

  await page.keyboard.press("Control+f"); // 全屏内查找照常可用
  const findInImmersive = await page.evaluate(() => !document.getElementById("findBar").hidden);
  check("immersive: find bar still works inside immersive", findInImmersive);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const exited = await page.evaluate(() => ({
    bodyClass: document.body.classList.contains("immersive"),
    topbarHidden: document.getElementById("topbar").classList.contains("hidden"),
    btnText: document.getElementById("fullscreenBtn").textContent,
    findHidden: document.getElementById("findBar").hidden,
    fullscreenEl: Boolean(document.fullscreenElement),
  }));
  check("immersive: Esc exits and restores topbar/button/find",
    !exited.bodyClass && !exited.topbarHidden && exited.btnText === "全屏" && exited.findHidden && !exited.fullscreenEl,
    JSON.stringify(exited));

  /* ============ 4. 目录搜索 ============ */
  await revealTopbar(page);
  await page.click("#bookmarkBtn"); // 加一条书签验证“输入时书签分组隐藏”
  await page.waitForTimeout(200);
  await revealTopbar(page);
  await page.click("#tocBtn");
  const tocBase = await page.evaluate(() => ({
    items: document.querySelectorAll(".toc-item").length,
    bookmarksVisible: !document.getElementById("tocBookmarks").hidden,
  }));
  await page.fill("#tocSearch", "深井");
  await page.waitForTimeout(150);
  const tocFiltered = await page.evaluate(() => ({
    items: [...document.querySelectorAll(".toc-item")].map((b) => b.textContent),
    markText: document.querySelector("mark.toc-match")?.textContent,
    bookmarksHidden: document.getElementById("tocBookmarks").hidden,
  }));
  check("toc-search: title filter narrows list with highlighted match",
    tocBase.items === 10 && tocFiltered.items.length === 1 && tocFiltered.items[0].includes("第九章 深井")
      && tocFiltered.markText === "深井" && tocFiltered.bookmarksHidden && tocBase.bookmarksVisible,
    `base=${tocBase.items} filtered=${tocFiltered.items.join("/")} mark=${tocFiltered.markText}`);
  await page.fill("#tocSearch", "9");
  await page.waitForTimeout(150);
  const tocOrdinal = await page.evaluate(() => [...document.querySelectorAll(".toc-item")].map((b) => b.textContent));
  check("toc-search: ordinal filter matches section number",
    tocOrdinal.length === 1 && tocOrdinal[0].includes("第九章"), tocOrdinal.join("/"));
  await page.fill("#tocSearch", "");
  await page.waitForTimeout(150);
  const tocCleared = await page.evaluate(() => ({
    items: document.querySelectorAll(".toc-item").length,
    bookmarksVisible: !document.getElementById("tocBookmarks").hidden,
  }));
  check("toc-search: clearing restores full list and bookmark group",
    tocCleared.items === 10 && tocCleared.bookmarksVisible, JSON.stringify(tocCleared));
  await page.click(".toc-bookmark-del"); // 清理临时书签
  await page.keyboard.press("Escape");

  /* ============ 5. 阅读计划 ============ */
  // 退出沉浸时会恢复进沉浸前打开的 Nova 面板，此处面板可能已开着：只在关着时点竖条。
  await page.evaluate(() => {
    if (document.getElementById("novaPanel").hidden) document.getElementById("novaStrip").click();
  });
  await page.waitForTimeout(200);
  const planEmptyLabel = await page.evaluate(() => document.getElementById("planToggleLabel").textContent);
  check("plan: collapsed line invites creating a plan when none", planEmptyLabel === "为本书建个计划", planEmptyLabel);

  // 定位到第二章（ch01..ch02 同 sectionIndex）再计划本章
  await revealTopbar(page);
  await page.click("#tocBtn");
  await page.click(".toc-item:has-text('第二章 双段长卷')");
  await page.waitForSelector('.flow-chunk[data-chunk-id="ch01"]', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.click("#planToggleBtn");
  await page.waitForTimeout(150);
  const planBodyOpen = await page.evaluate(() => ({
    open: !document.getElementById("planBody").hidden,
    meta: document.getElementById("planStepMeta").textContent,
    sectionBtnEnabled: !document.getElementById("planSectionBtn").disabled,
  }));
  check("plan: expand shows empty state with section-plan action",
    planBodyOpen.open && planBodyOpen.sectionBtnEnabled && /还没有阅读计划/.test(planBodyOpen.meta),
    JSON.stringify(planBodyOpen));

  await page.click("#planSectionBtn");
  await page.waitForFunction(() => /已创建本章计划/.test(document.getElementById("planStatus").textContent), { timeout: 20000 });
  const planCreated = await page.evaluate(() => ({
    label: document.getElementById("planToggleLabel").textContent,
    meta: document.getElementById("planStepMeta").textContent,
    title: document.getElementById("planStepTitle").textContent,
    readEnabled: !document.getElementById("planReadStepBtn").disabled,
    doneEnabled: !document.getElementById("planDoneStepBtn").disabled,
  }));
  check("plan: created section plan surfaces next step",
    /^计划 · 下一步/.test(planCreated.label) && /0\/2 步/.test(planCreated.meta)
      && /ch01 → ch02/.test(planCreated.meta) && /阅读/.test(planCreated.title)
      && planCreated.readEnabled && planCreated.doneEnabled,
    JSON.stringify(planCreated));

  const planList = await apiCommand({ command: "plan_list", bookId: BOOK_ID, status: "active" });
  const planRecord = (planList.data?.plans || [])[0] || {};
  check("plan: plan_create persisted in isolated store",
    planList.data?.plans?.length === 1 && planRecord.status === "active" && planRecord.mode === "range"
      && planRecord.stepCount === 2,
    JSON.stringify({ planId: planRecord.planId, status: planRecord.status, stepCount: planRecord.stepCount }));

  // 跳走再用“读这一步”回到范围起点
  await revealTopbar(page);
  await page.click("#tocBtn");
  await page.click(".toc-item:has-text('第五章 灯下校勘')");
  await page.waitForSelector('.flow-chunk[data-chunk-id="ch04"]', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.click("#planReadStepBtn");
  await page.waitForSelector('.flow-chunk[data-chunk-id="ch01"]', { timeout: 10000 });
  await page.waitForTimeout(500);
  const afterReadStep = await page.evaluate(() => {
    const sections = [...document.querySelectorAll(".flow-chunk")];
    const target = window.scrollY + window.innerHeight * 0.3;
    let active = sections[0];
    for (const s of sections) { if (s.offsetTop <= target) active = s; else break; }
    return active.dataset.chunkId;
  });
  check("plan: read-this-step jumps to range start", afterReadStep === "ch01", `active=${afterReadStep}`);

  // 完成这一步（plan_execute_step），下一步推进为评价步
  await page.click("#planDoneStepBtn");
  await page.waitForFunction(() => /这一步完成/.test(document.getElementById("planStatus").textContent), { timeout: 30000 });
  const planAdvanced = await page.evaluate(() => ({
    status: document.getElementById("planStatus").textContent,
    meta: document.getElementById("planStepMeta").textContent,
    title: document.getElementById("planStepTitle").textContent,
  }));
  check("plan: execute step advances and refreshes next step",
    /下一步已带出/.test(planAdvanced.status) && /1\/2 步/.test(planAdvanced.meta) && /评价/.test(planAdvanced.title),
    JSON.stringify(planAdvanced));

  const planGet = await apiCommand({ command: "plan_get", planId: planRecord.planId });
  const stepStatuses = (planGet.data?.plan?.steps || []).map((s) => `${s.type}:${s.status}`);
  check("plan: store shows first step done, next is review step",
    stepStatuses[0] === "read_range:done" && /review_range/.test(planGet.data?.nextStep?.type || ""),
    stepStatuses.join(" | "));

  /* 桌面截图：查找高亮 + Nova 计划小节同框 */
  await page.keyboard.press("Control+f");
  await page.fill("#findInput", "回声迷宫");
  await page.waitForTimeout(450);
  await page.screenshot({ path: "D:/Trellis/output/coreading-c4-desktop.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  /* ============ 桌面整体校验 ============ */
  const overflow = await page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  check("desktop: no horizontal overflow", overflow.docWidth <= overflow.viewport, JSON.stringify(overflow));
  check("desktop: no console/page errors", errors.length === 0, errors.slice(0, 4).join(" || ") || "clean");

  /* ============ 移动端 ============ */
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const { page: mobile, errors: mobileErrors } = await preparePage(mobileContext);
  await openBook(mobile);
  await mobile.keyboard.press("Control+f");
  await mobile.fill("#findInput", "回声迷宫");
  await mobile.waitForTimeout(450);
  const mobileFind = await mobile.evaluate(() => ({
    barVisible: !document.getElementById("findBar").hidden,
    barWidth: Math.round(document.getElementById("findBar").getBoundingClientRect().width),
    count: document.getElementById("findCount").textContent,
    docWidth: document.documentElement.scrollWidth,
  }));
  check("mobile: find bar fits 390px viewport with hits",
    mobileFind.barVisible && mobileFind.barWidth <= 390 && /^1\//.test(mobileFind.count) && mobileFind.docWidth <= 390,
    JSON.stringify(mobileFind));
  await mobile.screenshot({ path: "D:/Trellis/output/coreading-c4-mobile.png" });
  await mobile.keyboard.press("Escape");
  await revealTopbar(mobile);
  await mobile.click("#bookmarkBtn");
  await revealTopbar(mobile);
  await mobile.click("#tocBtn");
  await mobile.waitForTimeout(200);
  const mobileToc = await mobile.evaluate(() => ({
    bookmarkRow: Boolean(document.querySelector(".toc-bookmark-open")),
    drawerWidth: Math.round(document.getElementById("tocDrawer").getBoundingClientRect().width),
  }));
  check("mobile: bookmark row reachable in toc drawer", mobileToc.bookmarkRow && mobileToc.drawerWidth <= 390,
    JSON.stringify(mobileToc));
  check("mobile: no console/page errors", mobileErrors.length === 0, mobileErrors.slice(0, 4).join(" || ") || "clean");

  /* ============ /classic 仍可用 ============ */
  const classic = await fetch(`${BASE}/classic`);
  check("classic: isolated instance /classic responds 200", classic.status === 200, `status=${classic.status}`);

  await browser.close();
  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error("SMOKE CRASH:", error);
  process.exit(1);
});
