/* CoReading 极简阅读器新壳 —— 复用 sidecar HTTP API，vanilla JS。 */
"use strict";

const STORE_PREFIX = "coreading-reader.";
const SETTINGS_KEY = `${STORE_PREFIX}settings`;
const POSITION_KEY = (bookId) => `${STORE_PREFIX}position.${bookId}`;
const NOVA_TIMEOUT_MS = 360000;
const FLOW_BATCH_SIZE = 3;
const LOAD_MORE_MARGIN = 1600;
const TEST_BOOK_RE = /(^codex-|codex\s|smoke|验证|return-shape|sidecar-chunk)/i;
const FRONT_MATTER_RE = /^(cover|封面|封底|扉页|版权|题献|目录|插图目录|更新记录)$/i;

const state = {
  snapshot: null,
  books: [],
  bookId: "",
  bookTitle: "",
  chunks: [],
  anchorIndex: 0,
  loadedTo: 0,            // chunks[anchorIndex .. loadedTo) 已渲染
  flowLoading: false,
  flowRequestId: 0,
  activeChunkId: "",
  preReadHistory: [],
  novaActiveHistoryId: "",
  novaPending: false,
  novaReply: null,        // { meta, text }
  selection: null,        // { text, chunkId }
  lastScrollY: 0,
  savePositionTimer: 0,
};

const $ = (id) => document.getElementById(id);

/* ---------- HTTP ---------- */

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === "error") {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function query(payload) {
  const result = await api("/api/command", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return result?.data ?? null;
}

async function askNovaApi(payload) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), NOVA_TIMEOUT_MS);
  try {
    return await api("/api/nova/ask", {
      method: "POST",
      body: JSON.stringify({ ...payload, maxAttempts: 1, clientTimeoutMs: NOVA_TIMEOUT_MS }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Nova 请求超过 ${Math.round(NOVA_TIMEOUT_MS / 1000)} 秒仍未返回。`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

/* ---------- 小工具 ---------- */

function compactText(value, maxChars = 520) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function looksLikeEmptySseNovaText(value) {
  const text = String(value || "").trim();
  if (!text.includes("data:") || !text.includes("[DONE]")) return false;
  const naturalText = text
    .replace(/^data:\s*.*$/gmu, "")
    .replace(/\[DONE\]/gu, "")
    .trim();
  if (naturalText.length > 24) return false;
  return /"object"\s*:\s*"chat\.completion\.chunk"/u.test(text)
    && /"choices"\s*:\s*\[\s*\]/u.test(text);
}

function getChunkId(chunk) {
  return String(chunk?.id || chunk?.chunkId || "");
}

function chunkById(chunkId) {
  return state.chunks.find((chunk) => getChunkId(chunk) === chunkId) || null;
}

function chunkOrder(chunkId) {
  const index = state.chunks.findIndex((chunk) => getChunkId(chunk) === chunkId);
  return index >= 0 ? index : null;
}

function chunkTitle(chunk) {
  return String(chunk?.title || chunk?.sectionTitle || getChunkId(chunk) || "");
}

function sectionLabel(chunk) {
  return String(chunk?.sectionTitle || chunk?.title || "未命名章节")
    .replace(/\s+Part\s+\d+\/\d+$/i, "")
    .trim();
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage 不可用时静默放弃持久化。
  }
}

/* ---------- 排版设置 ---------- */

const SETTING_FIELDS = ["font", "width", "line"];

function applySettings() {
  const saved = readJson(SETTINGS_KEY) || {};
  for (const field of SETTING_FIELDS) {
    if (saved[field]) document.body.dataset[field] = saved[field];
  }
  syncTypoButtons();
}

function syncTypoButtons() {
  document.querySelectorAll("#typoPop .typo-row").forEach((row) => {
    const field = row.dataset.setting;
    row.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(document.body.dataset[field] === button.dataset.value));
    });
  });
}

function setupTypoPop() {
  $("typoBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    $("typoPop").hidden = !$("typoPop").hidden;
  });
  $("typoPop").addEventListener("click", (event) => {
    event.stopPropagation();
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    const field = button.closest(".typo-row").dataset.setting;
    document.body.dataset[field] = button.dataset.value;
    const saved = readJson(SETTINGS_KEY) || {};
    saved[field] = button.dataset.value;
    writeJson(SETTINGS_KEY, saved);
    syncTypoButtons();
  });
  document.addEventListener("click", () => {
    $("typoPop").hidden = true;
  });
}

/* ---------- 书架 ---------- */

function visibleBooks() {
  return (state.snapshot?.books || []).filter((book) => {
    const text = [book.bookId, book.title, book.author].filter(Boolean).join(" ");
    return !TEST_BOOK_RE.test(text);
  });
}

function bookProgressPercent(book) {
  const saved = readJson(POSITION_KEY(book.bookId));
  if (saved && Number.isFinite(Number(saved.percent))) return Math.round(Number(saved.percent));
  if (!book.chunkCount) return 0;
  return Math.round((Number(book.chunksRead || 0) / Number(book.chunkCount)) * 100);
}

function renderShelf() {
  const list = $("bookList");
  list.textContent = "";
  const books = visibleBooks().slice().sort((a, b) => {
    return String(b.lastReadAt || "").localeCompare(String(a.lastReadAt || ""));
  });
  $("shelfStatus").textContent = books.length ? "" : "书库还是空的，先扫描本地书库导入一本。";
  for (const book of books) {
    const item = document.createElement("li");
    item.className = "book-item";
    const main = document.createElement("div");
    main.className = "book-main";
    const title = document.createElement("p");
    title.className = "book-title";
    title.textContent = book.title || book.bookId;
    const meta = document.createElement("p");
    meta.className = "book-meta";
    const percent = bookProgressPercent(book);
    meta.textContent = [book.author, `${book.chunkCount || 0} 段`, percent ? `已读 ${percent}%` : ""]
      .filter(Boolean).join(" · ");
    main.append(title, meta);
    const saved = readJson(POSITION_KEY(book.bookId));
    const open = document.createElement("span");
    open.className = "book-open text-btn";
    open.textContent = saved?.chunkId || book.lastChunkId ? "继续阅读" : "开始阅读";
    item.append(main, open);
    item.addEventListener("click", () => openBook(book.bookId));
    list.append(item);
  }
}

async function loadSnapshot() {
  state.snapshot = await api("/api/snapshot");
  state.books = state.snapshot.books || [];
  applyNovaAgentRuns(state.snapshot.agentRuns || []);
}

async function loadShelf() {
  $("shelfStatus").textContent = "加载中…";
  try {
    await loadSnapshot();
    renderShelf();
  } catch (error) {
    $("shelfStatus").textContent = `书库加载失败：${error.message || error}`;
  }
}

/* ---------- 本地书库 ---------- */

async function scanLocalLibrary() {
  const section = $("localSection");
  const status = $("localStatus");
  section.hidden = false;
  status.textContent = "扫描中…";
  try {
    const data = await api("/api/local-library");
    status.textContent = `${data.root || "本地书库"} · ${data.count || 0} 本`;
    renderLocalBooks(data.books || []);
  } catch (error) {
    status.textContent = `扫描失败：${error.message || error}`;
  }
}

function renderLocalBooks(books) {
  const list = $("localList");
  list.textContent = "";
  for (const book of books) {
    const item = document.createElement("li");
    item.className = "local-item";
    const name = document.createElement("span");
    name.className = "local-name";
    name.textContent = book.name || book.relativePath;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "text-btn";
    action.textContent = "导入";
    action.addEventListener("click", () => importLocalBook(book, action));
    item.append(name, action);
    list.append(item);
  }
}

async function importLocalBook(book, button) {
  button.disabled = true;
  button.textContent = "导入中…";
  try {
    const imported = await api("/api/local-library/import", {
      method: "POST",
      body: JSON.stringify({
        relativePath: book.relativePath,
        title: String(book.name || "").replace(/\.[^.]+$/, ""),
        author: "",
        headingRegex: "",
        maxChars: 12000,
        overwrite: false,
      }),
    });
    await loadSnapshot();
    renderShelf();
    button.textContent = "已导入";
    const bookId = imported?.bookId || imported?.data?.bookId || imported?.book?.bookId || "";
    if (bookId) await openBook(bookId);
  } catch (error) {
    button.disabled = false;
    button.textContent = "导入";
    $("localStatus").textContent = `导入失败：${error.message || error}`;
  }
}

/* ---------- 视图切换 ---------- */

function showShelf() {
  savePositionNow();
  window.clearTimeout(state.savePositionTimer);
  state.flowRequestId += 1;
  history.replaceState(null, "", location.pathname);
  $("readView").hidden = true;
  $("shelfView").hidden = false;
  closeNova();
  hideSelTool();
  document.title = "共读";
  window.scrollTo(0, 0);
  loadShelf();
}

function showReadView() {
  $("shelfView").hidden = true;
  $("readView").hidden = false;
}

/* ---------- 打开书 / 正文流 ---------- */

function preferredAnchorIndex() {
  const index = state.chunks.findIndex((chunk) => {
    const title = sectionLabel(chunk);
    const size = Math.max(Number(chunk.charCount || 0), Number(chunk.wordCount || 0));
    return !FRONT_MATTER_RE.test(title) && size >= 600;
  });
  return index >= 0 ? index : 0;
}

async function openBook(bookId, targetChunkId = "") {
  const book = (state.snapshot?.books || []).find((item) => item.bookId === bookId);
  if (!book) return false;
  window.clearTimeout(state.savePositionTimer);
  state.bookId = bookId;
  state.bookTitle = book.title || bookId;
  history.replaceState(null, "", `#book=${encodeURIComponent(bookId)}`);
  showReadView();
  document.title = state.bookTitle;
  $("topbarTitle").textContent = state.bookTitle;
  $("topbarProgress").textContent = "";
  $("flow").textContent = "";
  $("flowStatus").textContent = "加载中…";
  try {
    state.chunks = (await query({ command: "list_chunks", bookId })) || [];
  } catch (error) {
    $("flowStatus").textContent = `章节加载失败：${error.message || error}`;
    return;
  }
  const saved = readJson(POSITION_KEY(bookId));
  const anchorId = targetChunkId
    || (saved?.chunkId && chunkOrder(saved.chunkId) !== null ? saved.chunkId : "")
    || (book.lastChunkId && chunkOrder(book.lastChunkId) !== null ? book.lastChunkId : "");
  await anchorFlowAt(anchorId ? chunkOrder(anchorId) : preferredAnchorIndex(), {
    restoreOffset: !targetChunkId && saved?.chunkId === anchorId ? Number(saved.offset || 0) : 0,
  });
  renderToc();
  renderNovaHistory();
}

async function anchorFlowAt(index, { restoreOffset = 0 } = {}) {
  const requestId = ++state.flowRequestId;
  state.anchorIndex = Math.max(0, Math.min(index, state.chunks.length - 1));
  state.loadedTo = state.anchorIndex;
  state.activeChunkId = getChunkId(state.chunks[state.anchorIndex]);
  $("flow").textContent = "";
  window.scrollTo(0, 0);
  await loadMoreChunks(requestId);
  if (requestId !== state.flowRequestId) return;
  if (restoreOffset > 0) {
    window.requestAnimationFrame(() => {
      const section = $("flow").querySelector(".flow-chunk");
      if (section) window.scrollTo(0, section.offsetTop + restoreOffset - 64);
    });
  }
  updateActiveChunk();
}

async function loadMoreChunks(requestId = state.flowRequestId) {
  if (state.flowLoading || !state.bookId) return;
  if (state.loadedTo >= state.chunks.length) return;
  state.flowLoading = true;
  $("flowStatus").textContent = "加载中…";
  const bookId = state.bookId;
  const batch = state.chunks.slice(state.loadedTo, state.loadedTo + FLOW_BATCH_SIZE);
  let failedCount = 0;
  try {
    const loaded = await Promise.all(batch.map(async (chunk) => {
      const chunkId = getChunkId(chunk);
      try {
        const result = await query({ command: "read_chunk", bookId, chunkId });
        return { chunk, text: String(result?.text || result?.chunk?.text || "") };
      } catch {
        return { chunk, text: "", failed: true };
      }
    }));
    if (requestId !== state.flowRequestId || bookId !== state.bookId) return;
    for (const item of loaded) appendFlowChunk(item.chunk, item.text);
    state.loadedTo += batch.length;
    failedCount = loaded.filter((item) => item.failed).length;
    $("flowStatus").textContent = failedCount
      ? `有 ${failedCount} 段加载失败，继续滚动会接着读后面的内容。`
      : state.loadedTo >= state.chunks.length ? "· 全书完 ·" : "";
  } finally {
    if (requestId === state.flowRequestId) state.flowLoading = false;
  }
  // 首屏不足一屏时继续补载，否则滚动事件永远不会触发；整批失败时停下，避免连环空请求。
  if (requestId === state.flowRequestId
    && failedCount < batch.length
    && state.loadedTo < state.chunks.length
    && document.documentElement.scrollHeight < window.innerHeight + 400) {
    await loadMoreChunks(requestId);
  }
}

function appendFlowChunk(chunk, text) {
  if (!text.trim()) return;
  const chunkId = getChunkId(chunk);
  const section = document.createElement("section");
  section.className = "flow-chunk";
  section.dataset.chunkId = chunkId;
  const previous = $("flow").querySelector(".flow-chunk:last-of-type");
  const previousLabel = previous ? sectionLabel(chunkById(previous.dataset.chunkId) || {}) : "";
  const label = sectionLabel(chunk);
  if (label && label !== previousLabel) {
    const heading = document.createElement("h2");
    heading.textContent = label;
    section.append(heading);
  }
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const trimmed = block.replace(/^#{1,6}\s+/, "").trim();
    if (!trimmed || trimmed === label) continue;
    const paragraph = document.createElement("p");
    paragraph.textContent = trimmed;
    section.append(paragraph);
  }
  $("flow").append(section);
  decorateNovaDot(section);
}

/* ---------- 滚动：顶栏隐藏 / 活动段落 / 懒加载 / 位置持久化 ---------- */

function updateTopbarVisibility() {
  const y = window.scrollY;
  const delta = y - state.lastScrollY;
  if (y > 80 && delta > 6) $("topbar").classList.add("hidden");
  else if (delta < -6 || y <= 80) $("topbar").classList.remove("hidden");
  state.lastScrollY = y;
}

function activeSection() {
  const sections = Array.from($("flow").querySelectorAll(".flow-chunk"));
  if (!sections.length) return null;
  const target = window.scrollY + window.innerHeight * 0.3;
  let active = sections[0];
  for (const section of sections) {
    if (section.offsetTop <= target) active = section;
    else break;
  }
  return active;
}

function updateActiveChunk() {
  const section = activeSection();
  if (!section) return;
  state.activeChunkId = section.dataset.chunkId;
  const order = chunkOrder(state.activeChunkId);
  const percent = order === null || !state.chunks.length
    ? 0
    : Math.round(((order + 1) / state.chunks.length) * 100);
  $("topbarProgress").textContent = `${percent}%`;
  schedulePositionSave(section, percent);
}

function schedulePositionSave(section, percent) {
  window.clearTimeout(state.savePositionTimer);
  state.savePositionTimer = window.setTimeout(() => {
    if (!state.bookId || $("readView").hidden) return;
    writeJson(POSITION_KEY(state.bookId), {
      chunkId: section.dataset.chunkId,
      offset: Math.max(0, window.scrollY - section.offsetTop + 64),
      percent,
      savedAt: new Date().toISOString(),
    });
  }, 400);
}

function savePositionNow() {
  if (!state.bookId || $("readView").hidden) return;
  const section = activeSection();
  if (!section) return;
  const order = chunkOrder(section.dataset.chunkId);
  writeJson(POSITION_KEY(state.bookId), {
    chunkId: section.dataset.chunkId,
    offset: Math.max(0, window.scrollY - section.offsetTop + 64),
    percent: order === null ? 0 : Math.round(((order + 1) / state.chunks.length) * 100),
    savedAt: new Date().toISOString(),
  });
}

function onScroll() {
  if ($("readView").hidden) return;
  updateTopbarVisibility();
  updateActiveChunk();
  const bottomGap = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
  if (bottomGap < LOAD_MORE_MARGIN) loadMoreChunks();
}

/* ---------- 目录抽屉 ---------- */

function tocSections() {
  const sections = [];
  let lastKey = "";
  state.chunks.forEach((chunk, index) => {
    const key = `${chunk.sectionIndex ?? sectionLabel(chunk)}`;
    if (key !== lastKey) {
      sections.push({ label: sectionLabel(chunk), chunkId: getChunkId(chunk), index });
      lastKey = key;
    }
  });
  return sections;
}

function renderToc() {
  const list = $("tocList");
  list.textContent = "";
  const activeOrder = chunkOrder(state.activeChunkId) ?? 0;
  for (const section of tocSections()) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toc-item";
    button.textContent = section.label;
    let sectionEnd = state.chunks.length - 1;
    for (let i = section.index; i < state.chunks.length; i += 1) {
      if (`${state.chunks[i].sectionIndex}` !== `${state.chunks[section.index].sectionIndex}`) {
        sectionEnd = i - 1;
        break;
      }
    }
    if (activeOrder >= section.index && activeOrder <= sectionEnd) button.classList.add("active");
    button.addEventListener("click", () => {
      closeToc();
      jumpToChunk(section.chunkId);
    });
    item.append(button);
    list.append(item);
  }
}

function openToc() {
  renderToc();
  $("tocDrawer").hidden = false;
  $("tocBackdrop").hidden = false;
  const active = $("tocList").querySelector(".toc-item.active");
  if (active) active.scrollIntoView({ block: "center" });
}

function closeToc() {
  $("tocDrawer").hidden = true;
  $("tocBackdrop").hidden = true;
}

async function jumpToChunk(chunkId) {
  const existing = $("flow").querySelector(`.flow-chunk[data-chunk-id="${CSS.escape(chunkId)}"]`);
  if (existing) {
    window.scrollTo({ top: existing.offsetTop - 64 });
    updateActiveChunk();
    return;
  }
  const index = chunkOrder(chunkId);
  if (index === null) return;
  await anchorFlowAt(index);
}

/* ---------- Nova 预读历史 ---------- */

function normalizePreReadItem(item = {}) {
  const result = item.result && typeof item.result === "object" ? item.result : {};
  const bookId = String(item.bookId || result.bookId || "");
  const chunkId = String(item.chunkId || result.chunkId || result.chosenChunkId || "");
  const rawNote = item.note || item.text || result.note || result.content || "";
  if (looksLikeEmptySseNovaText(rawNote)) return null;
  const note = compactText(rawNote, 520);
  if (!bookId || !chunkId || !note || looksLikeEmptySseNovaText(note)) return null;
  const answeredAt = String(item.answeredAt || item.completedAt || item.updatedAt || "");
  return {
    id: String(item.id || item.runId || `nova-pre-${bookId}-${chunkId}`),
    bookId,
    chunkId,
    title: String(item.chunkTitle || result.chunkTitle || chunkId),
    note,
    scope: String(item.scope || result.scope || ""),
    answeredAt,
  };
}

function applyNovaAgentRuns(runs) {
  state.preReadHistory = (Array.isArray(runs) ? runs : [])
    .filter((run) => run.action === "pre_read" && run.status === "success")
    .map(normalizePreReadItem)
    .filter(Boolean);
}

function preReadForBook() {
  return state.preReadHistory.filter((item) => item.bookId === state.bookId);
}

function preReadByChunk(chunkId) {
  return preReadForBook().find((item) => item.chunkId === chunkId && item.scope !== "book") || null;
}

function renderNovaHistory() {
  const container = $("novaHistory");
  container.textContent = "";
  const items = preReadForBook().slice(0, 5);
  if (!items.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const label = document.createElement("p");
  label.className = "nova-history-label";
  label.textContent = "Nova 预读";
  container.append(label);
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nova-history-item";
    if (item.id === state.novaActiveHistoryId) button.classList.add("active");
    button.textContent = `${item.chunkId} · ${item.title}`;
    button.addEventListener("click", () => showPreReadItem(item));
    container.append(button);
  }
}

function showPreReadItem(item) {
  state.novaActiveHistoryId = item.id;
  state.novaReply = {
    meta: `Nova 预读 · ${item.chunkId} · ${item.title}`,
    text: item.note,
  };
  renderNovaReply();
  renderNovaHistory();
  openNova();
}

function decorateNovaDot(section) {
  const item = preReadByChunk(section.dataset.chunkId);
  if (!item || section.querySelector(".nova-dot")) return;
  const dot = document.createElement("button");
  dot.type = "button";
  dot.className = "nova-dot";
  dot.title = "Nova 已预读这一段";
  dot.addEventListener("click", () => showPreReadItem(item));
  section.prepend(dot);
}

/* ---------- Nova 提问 ---------- */

function openNova() {
  $("novaPanel").hidden = false;
  document.body.classList.add("nova-open");
}

function closeNova() {
  $("novaPanel").hidden = true;
  document.body.classList.remove("nova-open");
}

function renderNovaReply() {
  $("novaReplyMeta").textContent = state.novaReply?.meta || "";
  $("novaReply").textContent = state.novaReply?.text
    || "选中正文文字点「问 Nova」，或直接在下面输入问题。";
}

function setNovaStatus(text, pending = false) {
  $("novaStatus").textContent = text;
  $("novaSendBtn").disabled = pending;
}

function renderedChunkText(chunkId) {
  if (!chunkId) return "";
  const section = $("flow").querySelector(
    `.flow-chunk[data-chunk-id="${CSS.escape(chunkId)}"]`
  );
  return section ? section.innerText : "";
}

function novaContext() {
  const selection = state.selection?.text ? state.selection : null;
  const chunkId = selection?.chunkId || state.activeChunkId;
  const chunk = chunkById(chunkId) || {};
  const order = chunkOrder(chunkId);
  // 正文取 context 指向的那个 chunk，保证 chunkId 与 text 一致。
  const text = renderedChunkText(chunkId) || selection?.text || "";
  return {
    coReadingContextVersion: "2026-06-reader-shell",
    contextMode: selection ? "chunk+selection" : "chunk",
    runtimeAgent: "Nova",
    productMode: "single-agent-reader",
    bookId: state.bookId,
    bookTitle: state.bookTitle,
    chunkId,
    chunkTitle: chunkTitle(chunk) || chunkId,
    chunkPosition: order === null ? "" : `${order + 1}/${state.chunks.length}`,
    text: compactText(text, 6000),
    selection: selection?.text || "",
    selectionOffset: null,
    instructionBoundary: "只基于当前 chunk、选区和显式传入的上下文回应；不要依赖服务端主题提示词已加载工具占位符。",
  };
}

async function sendNovaPrompt() {
  const prompt = $("novaPrompt").value.trim();
  if (!prompt || state.novaPending || !state.bookId) return;
  state.novaPending = true;
  const context = novaContext();
  setNovaStatus("Nova 正在读这一段…（单次请求，最长等 6 分钟）", true);
  try {
    const result = await askNovaApi({ prompt, context });
    state.novaReply = {
      meta: `Nova · ${context.chunkId} · 刚刚`,
      text: result.content || "Nova 暂无文本回复。",
    };
    state.novaActiveHistoryId = "";
    $("novaPrompt").value = "";
    setNovaStatus("");
    renderNovaReply();
    renderNovaHistory();
  } catch (error) {
    // 失败保留 prompt，可直接重试。
    setNovaStatus(`Nova 暂时连不上：${error.message || error}。问题已保留，可稍后重试。`);
  } finally {
    state.novaPending = false;
    $("novaSendBtn").disabled = false;
  }
}

/* ---------- 选区工具条 ---------- */

function hideSelTool() {
  $("selTool").hidden = true;
}

function onSelectionEnd() {
  if ($("readView").hidden) return;
  const selection = window.getSelection();
  const text = selection ? String(selection.toString()).trim() : "";
  if (!text || selection.rangeCount === 0) {
    hideSelTool();
    return;
  }
  const range = selection.getRangeAt(0);
  const flow = $("flow");
  if (!flow.contains(range.commonAncestorContainer)) {
    hideSelTool();
    return;
  }
  const node = range.startContainer;
  const element = node.nodeType === 3 ? node.parentElement : node;
  const section = element?.closest?.(".flow-chunk");
  state.selection = { text, chunkId: section?.dataset?.chunkId || state.activeChunkId };
  const rect = range.getBoundingClientRect();
  const tool = $("selTool");
  tool.hidden = false;
  const left = Math.max(8, Math.min(
    rect.left + window.scrollX + rect.width / 2 - tool.offsetWidth / 2,
    document.documentElement.clientWidth - tool.offsetWidth - 8
  ));
  tool.style.left = `${left}px`;
  tool.style.top = `${rect.top + window.scrollY - tool.offsetHeight - 8}px`;
}

function askNovaFromSelection() {
  const selection = state.selection;
  hideSelTool();
  if (!selection?.text) return;
  openNova();
  const prompt = $("novaPrompt");
  prompt.value = `「${compactText(selection.text, 600)}」\n这段怎么理解？`;
  prompt.focus();
}

/* ---------- 初始化 ---------- */

function setupEvents() {
  $("backBtn").addEventListener("click", showShelf);
  $("scanLocalBtn").addEventListener("click", scanLocalLibrary);
  $("tocBtn").addEventListener("click", openToc);
  $("tocCloseBtn").addEventListener("click", closeToc);
  $("tocBackdrop").addEventListener("click", closeToc);
  $("novaStrip").addEventListener("click", openNova);
  $("novaCloseBtn").addEventListener("click", closeNova);
  $("novaSendBtn").addEventListener("click", sendNovaPrompt);
  $("selAskBtn").addEventListener("click", askNovaFromSelection);
  setupTypoPop();
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("mouseup", (event) => {
    if (event.target.closest?.("#selTool")) return;
    window.setTimeout(onSelectionEnd, 0);
  });
  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape") {
      closeToc();
      hideSelTool();
      $("typoPop").hidden = true;
      return;
    }
    if (event.target.closest?.("#novaPanel")) return;
    window.setTimeout(onSelectionEnd, 0);
  });
  window.addEventListener("beforeunload", savePositionNow);
}

async function init() {
  applySettings();
  renderNovaReply();
  setupEvents();
  const match = location.hash.match(/^#book=(.+)$/);
  if (match) {
    // 刷新后直接回到正在读的书和保存位置。
    try {
      await loadSnapshot();
      if ((await openBook(decodeURIComponent(match[1]))) !== false) return;
    } catch {
      // 快照失败时退回书架，让书架展示错误。
    }
  }
  await loadShelf();
}

init();
