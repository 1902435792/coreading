/* Phase A check smoke: themes, tokens, residue fix, :scope>p coverage, settings migration,
   position persistence, selection->Nova, lazy load, comment card. Read-only against real sidecar. */
const { chromium } = require("D:/npm-global/node_modules/playwright");

const BASE = "http://127.0.0.1:8791";
let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`PASS ${name}${detail ? " :: " + detail : ""}`); }
  else { fail += 1; console.log(`FAIL ${name}${detail ? " :: " + detail : ""}`); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.route("**/api/nova/ask", (route) =>
    route.fulfill({ json: { status: "success", content: "stub" } }));

  /* 0. 旧设置迁移：只有 font/width/line 的老用户 */
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("coreading-reader.settings", JSON.stringify({ font: "l", width: "narrow", line: "normal" }));
  });
  await page.reload({ waitUntil: "networkidle" });
  const ds = await page.evaluate(() => ({ ...document.body.dataset }));
  check("migration: old settings keep new defaults",
    ds.theme === "white" && ds.face === "serif" && ds.para === "indent" && ds.font === "l" && ds.width === "narrow" && ds.line === "normal",
    JSON.stringify(ds));

  /* 1. 书架卡片 */
  await page.waitForSelector(".book-card .book-cover", { timeout: 15000 });
  const shelf = await page.evaluate(() => {
    const covers = [...document.querySelectorAll(".book-cover")];
    return {
      count: covers.length,
      allGradient: covers.every((c) => (c.style.background || "").includes("linear-gradient")),
      glyphs: [...document.querySelectorAll(".cover-glyph")].map((g) => g.textContent),
    };
  });
  check("shelf: cards with gradient covers", shelf.count > 0 && shelf.allGradient, `count=${shelf.count} glyphs=${shelf.glyphs.join(",")}`);
  await page.screenshot({ path: "D:/Trellis/output/coreading-phaseA-shelf-white.png" });

  /* 2. 打开真实 GEB，正文结构 + :scope>p 覆盖 */
  await page.click(".book-card:has-text('哥德尔')");
  await page.waitForSelector(".flow-chunk p", { timeout: 30000 });
  await page.waitForTimeout(1500);
  const flowInfo = await page.evaluate(() => {
    const sections = [...document.querySelectorAll(".flow-chunk")];
    const allP = document.querySelectorAll("#flow .flow-chunk p").length;
    const directP = document.querySelectorAll("#flow .flow-chunk > p").length;
    const headP = document.querySelectorAll("#flow .chunk-head .chunk-no").length;
    const heads = [...document.querySelectorAll(".chunk-head")].map((h) => ({
      no: h.querySelector(".chunk-no")?.textContent,
      title: h.querySelector("h2")?.textContent?.slice(0, 18),
    }));
    const sample = document.querySelector(".flow-chunk > p");
    const style = sample ? getComputedStyle(sample) : null;
    const underlineInHead = document.querySelectorAll(".chunk-head .annot-underline").length;
    return {
      sections: sections.length, allP, directP, headP, heads: heads.slice(0, 3),
      justify: style?.textAlign, indent: style?.textIndent,
      underlines: document.querySelectorAll(".annot-underline").length,
      bubbles: document.querySelectorAll(".annot-bubble").length,
      underlineInHead,
    };
  });
  check("flow: every non-head paragraph is a direct child (no decoration misses)",
    flowInfo.allP === flowInfo.directP + flowInfo.headP,
    `allP=${flowInfo.allP} directP=${flowInfo.directP} headP=${flowInfo.headP}`);
  check("flow: chapter head two-line structure", flowInfo.heads.length > 0 && flowInfo.heads.every((h) => h.no && h.title), JSON.stringify(flowInfo.heads));
  check("flow: justify + 2em indent applied", flowInfo.justify === "justify" && parseFloat(flowInfo.indent) > 0, `align=${flowInfo.justify} indent=${flowInfo.indent}`);
  check("annot: real preread underlines/bubbles render", flowInfo.underlines > 0 && flowInfo.bubbles > 0, `underlines=${flowInfo.underlines} bubbles=${flowInfo.bubbles}`);
  check("annot: no underline leaked into chunk-head", flowInfo.underlineInHead === 0);

  /* 3. 评论卡片从虚线打开 */
  await page.click(".annot-underline");
  const cardOpen = await page.evaluate(() => {
    const card = document.getElementById("commentCard");
    return { hidden: card.hidden, items: card.querySelectorAll(".comment-item").length };
  });
  check("annot: comment card opens from underline", !cardOpen.hidden && cardOpen.items > 0, `items=${cardOpen.items}`);
  await page.keyboard.press("Escape");

  /* 4. 懒加载 */
  const before = await page.evaluate(() => document.querySelectorAll(".flow-chunk").length);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => document.querySelectorAll(".flow-chunk").length);
  check("flow: lazy load appends chunks", after > before, `${before} -> ${after}`);

  /* 5. 三主题切换 + token 抽查 + 残留检查 */
  const expects = {
    white: { bg: "rgb(255, 255, 255)", muted: "rgb(118, 118, 118)", accent: "rgb(53, 103, 232)" },
    paper: { bg: "rgb(247, 243, 233)", muted: "rgb(120, 108, 90)", accent: "rgb(122, 95, 51)" },
    dark: { bg: "rgb(22, 22, 22)", muted: "rgb(138, 138, 138)", accent: "rgb(125, 155, 255)" },
  };
  for (const theme of ["paper", "dark", "white"]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.click("#typoBtn");
    await page.click(`.theme-swatch[data-value="${theme}"]`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const got = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      const no = document.querySelector(".chunk-no");
      const bubble = document.querySelector(".annot-bubble");
      return {
        bg: cs.backgroundColor,
        muted: no ? getComputedStyle(no).color : "",
        bubbleColor: bubble ? getComputedStyle(bubble).color : "",
        accent: getComputedStyle(document.getElementById("topbarProgressLine")).backgroundColor,
      };
    });
    const exp = expects[theme];
    check(`theme ${theme}: bg/muted/accent tokens applied`,
      got.bg === exp.bg && got.muted === exp.muted && got.accent === exp.accent && got.bubbleColor === exp.muted,
      JSON.stringify(got));
    // 顶栏隐藏后进度线必须完全离开视口
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(500);
    const residue = await page.evaluate(() => {
      const topbar = document.getElementById("topbar");
      const rect = document.getElementById("topbarProgressLine").getBoundingClientRect();
      return { hidden: topbar.classList.contains("hidden"), bottom: rect.bottom };
    });
    check(`theme ${theme}: no progress-line residue when topbar hidden`,
      residue.hidden && residue.bottom <= 0, JSON.stringify(residue));
    if (theme !== "white") {
      await page.screenshot({ path: `D:/Trellis/output/coreading-phaseA-${theme}.png` });
    }
  }

  /* 6. 顶栏出现时进度线可见 */
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(500);
  const lineVisible = await page.evaluate(() => {
    const rect = document.getElementById("topbarProgressLine").getBoundingClientRect();
    return { bottom: rect.bottom, width: rect.width };
  });
  check("progress line visible with topbar shown", lineVisible.bottom > 0 && lineVisible.width > 0, JSON.stringify(lineVisible));

  /* 7. 选区 -> 问 Nova（按钮真实点击路径） */
  await page.evaluate(() => {
    const p = [...document.querySelectorAll(".flow-chunk > p")].find((el) => el.textContent.length > 40);
    const range = document.createRange();
    range.setStart(p.firstChild, 0);
    range.setEnd(p.firstChild, Math.min(30, p.firstChild.textContent.length));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const selToolShown = await page.evaluate(() => !document.getElementById("selTool").hidden);
  check("selection toolbar appears", selToolShown);
  if (selToolShown) {
    await page.click("#selAskBtn");
    const nova = await page.evaluate(() => ({
      open: !document.getElementById("novaPanel").hidden,
      prompt: document.getElementById("novaPrompt").value.slice(0, 20),
    }));
    check("selection -> Nova panel with quoted prompt", nova.open && nova.prompt.startsWith("「"), nova.prompt);
    // 发送走拦截的 /api/nova/ask，验证气泡渲染
    await page.click("#novaSendBtn");
    await page.waitForTimeout(600);
    const bubble = await page.evaluate(() => ({
      userShown: !document.getElementById("novaUserBubble").hidden,
      userText: document.getElementById("novaUserBubble").textContent.slice(0, 10),
      reply: document.getElementById("novaReply").textContent,
      avatar: getComputedStyle(document.querySelector(".nova-avatar")).backgroundColor,
    }));
    check("nova bubbles: user bubble + reply render", bubble.userShown && bubble.reply.includes("stub"), JSON.stringify(bubble));
    await page.screenshot({ path: "D:/Trellis/output/coreading-phaseA-nova-bubble.png" });
    await page.click("#novaCloseBtn");
  }

  /* 8. 位置持久化 */
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(800); // 等 400ms 防抖保存
  const savedPos = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("coreading-reader.position."));
    return key ? JSON.parse(localStorage.getItem(key)) : null;
  });
  check("position saved with chunkId/offset", Boolean(savedPos?.chunkId), JSON.stringify(savedPos && { chunkId: savedPos.chunkId, percent: savedPos.percent }));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".flow-chunk p", { timeout: 30000 });
  await page.waitForTimeout(1500);
  const restored = await page.evaluate(() => {
    const first = document.querySelector(".flow-chunk");
    return { firstChunk: first?.dataset.chunkId, scrollY: window.scrollY };
  });
  check("position restored after reload", restored.firstChunk === savedPos.chunkId, JSON.stringify(restored));

  /* 9. 主题持久化（上面最后切回 white；再切 paper 并刷新） */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500); // 等顶栏重新出现
  await page.click("#typoBtn");
  await page.click('.theme-swatch[data-value="paper"]');
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".flow-chunk p", { timeout: 30000 });
  const persistedTheme = await page.evaluate(() => document.body.dataset.theme);
  check("theme persists across reload", persistedTheme === "paper", persistedTheme);

  check("no console/page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
