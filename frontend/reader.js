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
  flowLoadPromise: null,
  flowRequestId: 0,
  activeChunkId: "",
  preReadHistory: [],
  novaActiveHistoryId: "",
  novaPending: false,
  novaReply: null,        // { meta, text, chunkId }
  selection: null,        // { text, chunkId, rect }
  sessionReplies: [],     // 本次会话 Nova 回复: { id, bookId, chunkId, text }
  annotations: [],        // 评注模型: { id, speaker, role, text, quote, chunkId, source, sourceId }
  chunkTextCache: new Map(),
  myNotes: new Map(),     // `${bookId}:${chunkId}` -> 已存笔记/边注的评注条目（懒加载缓存）
  myNotesPending: new Set(),
  noteDraft: null,        // { quote, chunkId }
  noteSaving: false,
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
  closeCommentCard();
  closeNoteCard();
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
  rebuildAnnotations();
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
  closeCommentCard();
  closeNoteCard();
  state.anchorIndex = Math.max(0, Math.min(index, state.chunks.length - 1));
  state.loadedTo = state.anchorIndex;
  state.activeChunkId = getChunkId(state.chunks[state.anchorIndex]);
  $("flow").textContent = "";
  window.scrollTo(0, 0);
  // 等上一批在飞请求结束再开载：旧批次占用加载锁时直接调用会被静默吞掉，首批永远到不了。
  while (state.flowLoadPromise) {
    await state.flowLoadPromise.catch(() => {});
    if (requestId !== state.flowRequestId) return;
  }
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
  const work = loadChunkBatch(requestId);
  state.flowLoadPromise = work;
  let outcome = { stale: true, failedCount: 0, batchSize: 0 };
  try {
    outcome = await work;
  } finally {
    // 无条件释放：过期批次若不释放锁，后续所有加载都会被吞掉，正文流永久停在“加载中”。
    state.flowLoading = false;
    if (state.flowLoadPromise === work) state.flowLoadPromise = null;
  }
  if (outcome.stale || requestId !== state.flowRequestId) return;
  // 首屏不足一屏时继续补载，否则滚动事件永远不会触发；整批失败时停下，避免连环空请求。
  if (outcome.failedCount < outcome.batchSize
    && state.loadedTo < state.chunks.length
    && document.documentElement.scrollHeight < window.innerHeight + 400) {
    await loadMoreChunks(requestId);
  }
}

async function loadChunkBatch(requestId) {
  const bookId = state.bookId;
  const batch = state.chunks.slice(state.loadedTo, state.loadedTo + FLOW_BATCH_SIZE);
  const loaded = await Promise.all(batch.map(async (chunk) => {
    const chunkId = getChunkId(chunk);
    try {
      const result = await query({ command: "read_chunk", bookId, chunkId });
      return { chunk, text: String(result?.text || result?.chunk?.text || "") };
    } catch {
      return { chunk, text: "", failed: true };
    }
  }));
  if (requestId !== state.flowRequestId || bookId !== state.bookId) {
    return { stale: true, failedCount: 0, batchSize: batch.length };
  }
  for (const item of loaded) appendFlowChunk(item.chunk, item.text);
  state.loadedTo += batch.length;
  const failedCount = loaded.filter((item) => item.failed).length;
  $("flowStatus").textContent = failedCount
    ? `有 ${failedCount} 段加载失败，继续滚动会接着读后面的内容。`
    : state.loadedTo >= state.chunks.length ? "· 全书完 ·" : "";
  return { stale: false, failedCount, batchSize: batch.length };
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
  decorateSection(section);
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
  const rawNote = String(item.note || item.text || result.note || result.content || "")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "");
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
    chunkId: item.chunkId,
  };
  renderNovaReply();
  renderNovaHistory();
  openNova();
}

/* ---------- 评注层：引用提取与归一化匹配（纯函数） ---------- */
/* Phase 3 复用点：annotationsFromComment() 接收 { sourceId, source, chunkId, text, speaker, role }，
   personas 评论只需换 speaker/role/source 塞进同一模型。 */

function extractQuoteMatches(text) {
  // 支持中文引号 / 英文双引号 / 反引号 / 直角引号；返回 { quote, start, end }（end 含收尾引号）。
  const pattern = /“([^“”]{2,200})”|"([^"\n]{2,200})"|`([^`\n]{2,200})`|「([^「」]{2,200})」/g;
  const source = String(text || "");
  const matches = [];
  let match;
  while ((match = pattern.exec(source))) {
    const quote = (match[1] || match[2] || match[3] || match[4] || "").trim();
    if (normalizeForMatch(quote).length >= 6) {
      matches.push({ quote, start: match.index, end: match.index + match[0].length });
    }
  }
  return matches;
}

function extractQuotes(text) {
  return [...new Set(extractQuoteMatches(text).map((item) => item.quote))];
}

function buildNormIndex(text) {
  // 只保留字母/数字/汉字并小写，map 记录每个归一化字符在原文里的下标。
  const source = String(text || "");
  let norm = "";
  const map = [];
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (/[\p{L}\p{N}]/u.test(ch)) {
      norm += ch.toLowerCase();
      map.push(i);
    }
  }
  return { norm, map };
}

function normalizeForMatch(text) {
  return buildNormIndex(text).norm;
}

function findNormalizedRange(haystack, needle) {
  // 在原文 haystack 中找归一化后的 needle，返回原文 [start, end)；找不到返回 null。
  const needleNorm = normalizeForMatch(needle);
  if (needleNorm.length < 6) return null;
  const hay = buildNormIndex(haystack);
  const index = hay.norm.indexOf(needleNorm);
  if (index < 0) return null;
  return { start: hay.map[index], end: hay.map[index + needleNorm.length - 1] + 1 };
}

/* ---------- 评注层：数据模型 ---------- */

function annotationsFromComment({ sourceId, source, chunkId, text, speaker = "Nova", role = "AI 共读" }) {
  const base = { speaker, role, text, chunkId, source, sourceId };
  const quotes = extractQuotes(text);
  if (!quotes.length) return [{ ...base, id: `${sourceId}#0`, quote: "" }];
  return quotes.map((quote, index) => ({ ...base, id: `${sourceId}#${index}`, quote }));
}

function rebuildAnnotations() {
  const items = [];
  for (const item of preReadForBook()) {
    if (item.scope === "book") continue;
    items.push(...annotationsFromComment({
      sourceId: item.id, source: "nova-preread", chunkId: item.chunkId, text: item.note,
    }));
  }
  for (const reply of state.sessionReplies) {
    if (reply.bookId !== state.bookId) continue;
    items.push(...annotationsFromComment({
      sourceId: reply.id, source: "nova-reply", chunkId: reply.chunkId, text: reply.text,
    }));
  }
  for (const entries of state.myNotes.values()) {
    for (const entry of entries) {
      if (entry.bookId === state.bookId) items.push(entry);
    }
  }
  state.annotations = items;
}

function annotationsForChunk(chunkId) {
  return state.annotations.filter((ann) => ann.chunkId === chunkId);
}

function uniqueComments(annotations) {
  const seen = new Set();
  return annotations.filter((ann) => !seen.has(ann.sourceId) && seen.add(ann.sourceId));
}

/* ---------- 评注层：正文虚线 / 段落气泡 / 高亮 ---------- */

function underlineRangesFor(paragraph) {
  const chunkId = paragraph.closest(".flow-chunk")?.dataset.chunkId || "";
  const text = paragraph.textContent;
  const ranges = [];
  for (const ann of annotationsForChunk(chunkId)) {
    if (!ann.quote) continue;
    const range = findNormalizedRange(text, ann.quote);
    if (range) ranges.push({ ...range, annId: ann.id });
  }
  return ranges;
}

function renderParagraph(paragraph, ranges, flashRange = null) {
  // 用边界点把纯文本切片重建，重叠区间天然合并；textContent 渲染，无 innerHTML。
  const text = paragraph.textContent;
  if (!ranges.length && !flashRange && !paragraph.querySelector(".annot-underline, .quote-flash")) return;
  const points = new Set([0, text.length]);
  for (const range of ranges) { points.add(range.start); points.add(range.end); }
  if (flashRange) { points.add(flashRange.start); points.add(flashRange.end); }
  const sorted = [...points].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const nodes = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const [a, b] = [sorted[i], sorted[i + 1]];
    const piece = text.slice(a, b);
    const covering = ranges.filter((range) => range.start <= a && b <= range.end);
    const inFlash = Boolean(flashRange && flashRange.start <= a && b <= flashRange.end);
    if (!covering.length && !inFlash) {
      nodes.push(document.createTextNode(piece));
      continue;
    }
    const el = document.createElement(inFlash ? "mark" : "span");
    if (inFlash) el.className = "quote-flash";
    if (covering.length) {
      el.classList.add("annot-underline");
      el.dataset.annotIds = covering.map((range) => range.annId).join(",");
    }
    el.textContent = piece;
    nodes.push(el);
  }
  paragraph.replaceChildren(...nodes);
}

function decorateSection(section) {
  const chunkId = section.dataset.chunkId;
  ensureChunkNotes(chunkId);
  for (const paragraph of section.querySelectorAll("p")) {
    renderParagraph(paragraph, underlineRangesFor(paragraph));
  }
  section.querySelector(".annot-bubble")?.remove();
  const annotations = annotationsForChunk(chunkId);
  const comments = uniqueComments(annotations);
  if (!comments.length) return;
  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "annot-bubble";
  bubble.textContent = String(comments.length);
  bubble.title = "本段评论";
  bubble.addEventListener("click", (event) => {
    event.stopPropagation();
    openCommentCard(annotations, bubble);
  });
  section.append(bubble);
}

function redecorateChunk(chunkId) {
  const section = $("flow").querySelector(`.flow-chunk[data-chunk-id="${CSS.escape(chunkId)}"]`);
  if (section) decorateSection(section);
}

function findQuoteInFlow(quote, preferChunkId = "") {
  const sections = Array.from($("flow").querySelectorAll(".flow-chunk"));
  const preferred = sections.find((section) => section.dataset.chunkId === preferChunkId);
  const ordered = preferred ? [preferred, ...sections.filter((s) => s !== preferred)] : sections;
  for (const section of ordered) {
    for (const paragraph of section.querySelectorAll("p")) {
      const range = findNormalizedRange(paragraph.textContent, quote);
      if (range) return { paragraph, range };
    }
  }
  return null;
}

function flashQuoteAt(paragraph, range) {
  renderParagraph(paragraph, underlineRangesFor(paragraph), range);
  const mark = paragraph.querySelector(".quote-flash");
  if (mark) {
    const top = mark.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.35;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }
  window.setTimeout(() => renderParagraph(paragraph, underlineRangesFor(paragraph)), 2000);
}

async function jumpToQuote(quote, chunkId) {
  const bookId = state.bookId;
  let found = findQuoteInFlow(quote, chunkId);
  if (!found && chunkId && chunkOrder(chunkId) !== null) {
    // 引用在未加载的 chunk 里：重锚加载后再定位。
    await anchorFlowAt(chunkOrder(chunkId));
    // 重锚期间切书/回书架的话，放弃跳转，避免在错误内容上闪烁滚动。
    if (state.bookId !== bookId || $("readView").hidden) return;
    found = findQuoteInFlow(quote, chunkId);
  }
  if (found) flashQuoteAt(found.paragraph, found.range);
}

async function chunkRawText(chunkId) {
  const key = `${state.bookId}:${chunkId}`;
  if (state.chunkTextCache.has(key)) return state.chunkTextCache.get(key);
  const result = await query({ command: "read_chunk", bookId: state.bookId, chunkId });
  const text = String(result?.text || result?.chunk?.text || "");
  state.chunkTextCache.set(key, text);
  return text;
}

/* ---------- 评注层：统一评论卡片（Phase 3 书友评论复用同一卡片） ---------- */

function closeCommentCard() {
  $("commentCard").hidden = true;
}

function showAnnotationInNova(ann) {
  if (ann.source === "nova-preread") {
    const item = state.preReadHistory.find((entry) => entry.id === ann.sourceId);
    if (item) return showPreReadItem(item);
  }
  state.novaReply = { meta: `${ann.speaker} · ${ann.chunkId}`, text: ann.text, chunkId: ann.chunkId };
  state.novaActiveHistoryId = "";
  renderNovaReply();
  renderNovaHistory();
  openNova();
}

function openCommentCard(annotations, anchorEl) {
  const comments = uniqueComments(annotations);
  if (!comments.length) return;
  const card = $("commentCard");
  card.textContent = "";
  for (const ann of comments) {
    const item = document.createElement("div");
    item.className = "comment-item";
    const head = document.createElement("p");
    head.className = "comment-head";
    const speaker = document.createElement("span");
    speaker.className = "comment-speaker";
    if (ann.source === "mine") speaker.classList.add("mine");
    speaker.textContent = ann.speaker;
    const role = document.createElement("span");
    role.className = "comment-role";
    role.textContent = ann.role;
    head.append(speaker, role);
    const body = document.createElement("p");
    body.className = "comment-text";
    body.textContent = ann.text;
    item.append(head, body);
    // 我的笔记全文已在卡片里，无需再去 Nova 面板。
    if (ann.source !== "mine") {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "text-btn comment-open";
      action.textContent = "在 Nova 面板查看";
      action.addEventListener("click", () => {
        closeCommentCard();
        showAnnotationInNova(ann);
      });
      item.append(action);
    }
    card.append(item);
  }
  card.hidden = false;
  if (window.matchMedia("(max-width: 1099px)").matches) {
    card.classList.add("sheet");
    card.style.left = "";
    card.style.top = "";
    return;
  }
  card.classList.remove("sheet");
  const rect = anchorEl.getBoundingClientRect();
  const left = Math.max(8, Math.min(
    rect.left + window.scrollX,
    document.documentElement.clientWidth - card.offsetWidth - 8
  ));
  card.style.left = `${left}px`;
  card.style.top = `${rect.bottom + window.scrollY + 8}px`;
}

/* ---------- 我的笔记 / 边注（user_note_create / annotate，进同一评注层） ---------- */

function myAnnotationFromRecord(record, fallbackRole) {
  const id = String(record?.id || "");
  const text = compactText(record?.note, 520);
  const chunkId = String(record?.chunkId || "");
  if (!id || !text || !chunkId) return null;
  // 旧壳把 Nova 回复也存成 user note（kind nova-reply / nova-pre-read），署名还给 Nova。
  const fromNova = /^nova/.test(String(record?.kind || ""));
  return {
    id: `${id}#q`,
    speaker: fromNova ? "Nova" : "我",
    role: fromNova ? "AI 共读" : fallbackRole,
    text,
    quote: String(record?.quote || ""),
    chunkId,
    bookId: String(record?.bookId || state.bookId),
    source: fromNova ? "nova-saved" : "mine",
    sourceId: id,
  };
}

function ensureChunkNotes(chunkId) {
  const key = `${state.bookId}:${chunkId}`;
  if (!state.bookId || state.myNotes.has(key) || state.myNotesPending.has(key)) return;
  state.myNotesPending.add(key);
  void loadChunkNotes(state.bookId, chunkId, key);
}

async function loadChunkNotes(bookId, chunkId, key) {
  let entries = [];
  try {
    const [noteList, annotations] = await Promise.all([
      query({ command: "user_note_list", bookId, chunkId }),
      query({ command: "list_annotations", bookId, chunkId, author: "claude" }),
    ]);
    entries = [
      ...(Array.isArray(noteList?.notes) ? noteList.notes : []).map((note) => myAnnotationFromRecord(note, "笔记")),
      ...(Array.isArray(annotations) ? annotations : []).map((ann) => myAnnotationFromRecord(ann, "边注")),
    ].filter(Boolean);
  } catch {
    // 拉取失败按空处理，避免对同一 chunk 反复请求。
  } finally {
    // 合并而非覆盖：列表请求在飞时用户可能刚存了一条，直接 set 会把它冲掉。
    const local = state.myNotes.get(key) || [];
    const merged = [...entries, ...local.filter((item) => !entries.some((entry) => entry.sourceId === item.sourceId))];
    state.myNotes.set(key, merged);
    state.myNotesPending.delete(key);
  }
  if (bookId !== state.bookId) return;
  if (entries.length) {
    rebuildAnnotations();
    redecorateChunk(chunkId);
  }
}

function addMyNoteRecord(entry) {
  if (!entry) return;
  const key = `${entry.bookId}:${entry.chunkId}`;
  const entries = state.myNotes.get(key) || [];
  entries.push(entry);
  state.myNotes.set(key, entries);
  rebuildAnnotations();
  redecorateChunk(entry.chunkId);
}

function closeNoteCard() {
  const card = $("noteCard");
  if (card.hidden) return;
  card.hidden = true;
  state.noteDraft = null;
  $("noteCardText").value = "";
  $("noteCardStatus").textContent = "";
}

function openNoteCardFromSelection() {
  const selection = state.selection;
  hideSelTool();
  closeCommentCard();
  if (!selection?.text || !state.bookId) return;
  state.noteDraft = { quote: selection.text, chunkId: selection.chunkId };
  $("noteCardQuote").textContent = compactText(selection.text, 160);
  $("noteCardText").value = "";
  $("noteCardStatus").textContent = "";
  const card = $("noteCard");
  card.hidden = false;
  if (window.matchMedia("(max-width: 1099px)").matches) {
    card.classList.add("sheet");
    card.style.left = "";
    card.style.top = "";
  } else {
    card.classList.remove("sheet");
    const rect = selection.rect || { left: 64, bottom: window.scrollY + 200 };
    const left = Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - card.offsetWidth - 8));
    card.style.left = `${left}px`;
    card.style.top = `${rect.bottom + 8}px`;
  }
  $("noteCardText").focus();
}

function setNoteCardBusy(busy) {
  $("noteSaveNoteBtn").disabled = busy;
  $("noteSaveAnnotBtn").disabled = busy;
}

async function saveMyNote(kind) {
  const draft = state.noteDraft;
  const text = $("noteCardText").value.trim();
  // 同步捕获 bookId：保存途中切书时 state.bookId 会变，不能把旧 chunk 的笔记存进新书。
  const bookId = state.bookId;
  if (!draft?.quote || !bookId || state.noteSaving) return;
  if (!text) {
    $("noteCardStatus").textContent = "先写点想法再保存。";
    return;
  }
  state.noteSaving = true;
  setNoteCardBusy(true);
  $("noteCardStatus").textContent = "保存中…";
  try {
    let quoteOffset = null;
    try {
      const raw = await chunkRawText(draft.chunkId);
      const index = raw.indexOf(draft.quote);
      quoteOffset = index >= 0 ? index : null;
    } catch {
      // offset 可选，拿不到原文就传 null。
    }
    // payload 形状对照旧壳 saveUserNote / saveAnnotation。
    const payload = kind === "note"
      ? {
        command: "user_note_create",
        bookId,
        chunkId: draft.chunkId,
        quote: draft.quote,
        quoteOffset,
        note: text,
        kind: "note",
        status: "open",
        tags: ["co-reading", "sidecar", "user-note"],
      }
      : {
        command: "annotate",
        bookId,
        chunkId: draft.chunkId,
        quote: draft.quote,
        quoteOffset,
        note: text,
        kind: "annotation",
        tags: ["co-reading", "sidecar"],
      };
    const result = await query(payload);
    // user_note_create 返回 { note: {...} }；annotate 直接返回 annotation 对象（其 .note 是正文字符串）。
    const record = result?.note && typeof result.note === "object" ? result.note : (result || {});
    addMyNoteRecord(myAnnotationFromRecord({
      id: record.id || `local-${Date.now()}`,
      bookId: record.bookId || bookId,
      chunkId: record.chunkId || draft.chunkId,
      quote: record.quote || draft.quote,
      note: record.note || text,
      kind: record.kind || payload.kind,
    }, kind === "note" ? "笔记" : "边注"));
    closeNoteCard();
  } catch (error) {
    $("noteCardStatus").textContent = `保存失败：${error.message || error}`;
  } finally {
    state.noteSaving = false;
    setNoteCardBusy(false);
  }
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
  const container = $("novaReply");
  container.textContent = "";
  if (!state.novaReply?.text) {
    container.textContent = "选中正文文字点「问 Nova」，或直接在下面输入问题。";
    return;
  }
  renderReplyContent(container, state.novaReply.text, state.novaReply.chunkId || "");
}

function renderReplyContent(container, text, chunkId) {
  // 受控渲染：文本节点 + 每个可定位引用后跟一个 ↩ 跳转标（先隐藏，验证命中后显示）。
  const matches = extractQuoteMatches(text);
  let cursor = 0;
  for (const match of matches) {
    container.append(document.createTextNode(text.slice(cursor, match.end)));
    cursor = match.end;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quote-jump";
    button.textContent = "↩";
    button.title = "跳到原文";
    button.hidden = true;
    button.addEventListener("click", () => {
      // 窄屏时 Nova 面板盖住正文，跳转前先收起。
      if (window.matchMedia("(max-width: 1099px)").matches) closeNova();
      jumpToQuote(match.quote, chunkId);
    });
    container.append(button);
    resolveQuoteJump(button, match.quote, chunkId);
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

async function resolveQuoteJump(button, quote, chunkId) {
  if (findQuoteInFlow(quote, chunkId)) {
    button.hidden = false;
    return;
  }
  // 不在已加载正文里：用回复 context 的 chunk 原文验证，验证不过就不显示（绝不显示坏链接）。
  if (!chunkId || chunkOrder(chunkId) === null) return;
  try {
    const raw = await chunkRawText(chunkId);
    if (findNormalizedRange(raw, quote)) button.hidden = false;
  } catch {
    // 拿不到原文时保持隐藏。
  }
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
    const replyText = result.content || "Nova 暂无文本回复。";
    state.novaReply = {
      meta: `Nova · ${context.chunkId} · 刚刚`,
      text: replyText,
      chunkId: context.chunkId,
    };
    if (result.content) {
      state.sessionReplies.push({
        id: `nova-reply-${Date.now()}`,
        bookId: state.bookId,
        chunkId: context.chunkId,
        text: compactText(result.content, 520),
      });
      rebuildAnnotations();
      redecorateChunk(context.chunkId);
    }
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
  const rect = range.getBoundingClientRect();
  state.selection = {
    text,
    chunkId: section?.dataset?.chunkId || state.activeChunkId,
    rect: {
      left: rect.left + window.scrollX,
      bottom: rect.bottom + window.scrollY,
    },
  };
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
  $("selNoteBtn").addEventListener("click", openNoteCardFromSelection);
  $("noteSaveNoteBtn").addEventListener("click", () => saveMyNote("note"));
  $("noteSaveAnnotBtn").addEventListener("click", () => saveMyNote("annotation"));
  $("flow").addEventListener("click", (event) => {
    const span = event.target.closest(".annot-underline");
    if (!span) return;
    // 划选结束的 click 不弹评论卡，避免评论卡叠在选区工具条上。
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const ids = String(span.dataset.annotIds || "").split(",");
    const annotations = state.annotations.filter((ann) => ids.includes(ann.id));
    if (annotations.length) openCommentCard(annotations, span);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("#commentCard, .annot-underline, .annot-bubble")) closeCommentCard();
    // 已经打了字的输入卡不随便被外点关掉，避免误点丢稿；Esc / 保存 / 切章仍会关闭。
    if (!event.target.closest?.("#noteCard, #selTool") && !$("noteCardText").value.trim()) closeNoteCard();
  });
  setupTypoPop();
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("mouseup", (event) => {
    if (event.target.closest?.("#selTool, #noteCard")) return;
    window.setTimeout(onSelectionEnd, 0);
  });
  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape") {
      closeToc();
      hideSelTool();
      closeCommentCard();
      closeNoteCard();
      $("typoPop").hidden = true;
      return;
    }
    if (event.target.closest?.("#novaPanel, #noteCard")) return;
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
