const state = {
  snapshot: null,
  selectedBookId: "",
  chunks: [],
  selectedChunkId: "",
  currentChunk: null,
  annotations: [],
  userNotes: [],
  submissions: [],
  searchResults: [],
  backtrackEvidence: null,
  selectedSinkPreview: null,
  selectedSinkDiff: null,
  selectedReplaceCandidateIndexes: [],
  selectedIllustration: null,
  illustrationSuggestions: [],
  cardInbox: [],
  cardCollection: { items: [], bookCards: [] },
  selectedCard: null,
  selectedCardSaveResult: null,
  cardSaveResults: {},
  cardPreviewResults: {},
  cardDigestNotice: "",
  novaReply: "",
  readerSelection: { text: "", offset: null },
  entityPeek: null,
  selfCheck: { variant: 0, hintVisible: false },
  readingFocus: false,
  planNextCache: {},
  backgroundRunners: [],
  snapshotLoadId: 0,
};

const $ = (id) => document.getElementById(id);
const SINK_SETTINGS_KEY = "vcp-coreading-sidecar.sinkSettings";
const CARD_SAVE_RESULTS_KEY = "vcp-coreading-sidecar.cardSaveResults";
const CARD_PREVIEW_RESULTS_KEY = "vcp-coreading-sidecar.cardPreviewResults";
const READING_SESSION_KEY = "vcp-coreading-sidecar.readingSession";
const READING_BOOKMARKS_KEY = "vcp-coreading-sidecar.readingBookmarks";
const SELF_CHECK_DRAFTS_KEY = "vcp-coreading-sidecar.selfCheckDrafts";

function announce(text) {
  const el = $("statusAnnouncer");
  if (el) el.textContent = text;
}

function setStatus(text, kind = "") {
  const el = $("statusPill");
  el.textContent = text;
  el.className = `status-pill ${kind}`.trim();
  announce(text);
}

function log(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  $("logOutput").textContent = text;
  announce(text.slice(0, 180));
}

async function copyTextToClipboard(text) {
  if (!text) throw new Error("没有可复制的文本。");
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Browser automation and some local contexts deny clipboard permission.
    }
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "readonly");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function readSavedReadingSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(READING_SESSION_KEY) || "null");
    if (!saved || typeof saved !== "object") return null;
    if (!saved.bookId || !saved.chunkId) return null;
    return saved;
  } catch {
    return null;
  }
}

function saveReadingSession(extra = {}) {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) return;
  const chunkText = $("chunkText");
  const payload = {
    bookId: selected.bookId,
    bookTitle: selected.title || selected.bookId,
    chunkId: state.selectedChunkId,
    scrollTop: Number(chunkText?.scrollTop || 0),
    savedAt: new Date().toISOString(),
    ...extra
  };
  localStorage.setItem(READING_SESSION_KEY, JSON.stringify(payload));
}

function restoreSavedScroll(saved) {
  if (!saved || saved.bookId !== state.selectedBookId || saved.chunkId !== state.selectedChunkId) return;
  const chunkText = $("chunkText");
  if (!chunkText) return;
  window.setTimeout(() => {
    chunkText.scrollTop = Number(saved.scrollTop || 0);
    saveReadingSession();
  }, 80);
}

function hasSavedReadingSession() {
  const saved = readSavedReadingSession();
  return !!saved && state.snapshot?.books?.some((book) => book.bookId === saved.bookId);
}

function readBookmarks() {
  try {
    const saved = JSON.parse(localStorage.getItem(READING_BOOKMARKS_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function bookmarksForBook(bookId = state.selectedBookId) {
  const items = readBookmarks()[bookId] || [];
  return Array.isArray(items) ? items : [];
}

function readSelfCheckDrafts() {
  try {
    const saved = JSON.parse(localStorage.getItem(SELF_CHECK_DRAFTS_KEY) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function selfCheckKey(bookId = state.selectedBookId, chunkId = state.selectedChunkId) {
  return bookId && chunkId ? `${bookId}::${chunkId}` : "";
}

function saveSelfCheckDraft(value = $("selfCheckAnswer")?.value || "") {
  const key = selfCheckKey();
  if (!key) return;
  const drafts = readSelfCheckDrafts();
  const text = String(value || "").trim();
  if (text) drafts[key] = { text, savedAt: new Date().toISOString() };
  else delete drafts[key];
  localStorage.setItem(SELF_CHECK_DRAFTS_KEY, JSON.stringify(drafts));
}

function loadSelfCheckDraft() {
  const key = selfCheckKey();
  return key ? readSelfCheckDrafts()[key]?.text || "" : "";
}

function saveBookmarkForCurrentChunk() {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) return null;
  const bookmarks = readBookmarks();
  const current = {
    bookId: selected.bookId,
    bookTitle: selected.title || selected.bookId,
    chunkId: state.selectedChunkId,
    title: chunkTitleById(state.selectedChunkId),
    scrollTop: Number($("chunkText")?.scrollTop || 0),
    savedAt: new Date().toISOString(),
  };
  const existing = bookmarks[selected.bookId] || [];
  bookmarks[selected.bookId] = [current, ...existing.filter((item) => item.chunkId !== current.chunkId)].slice(0, 24);
  localStorage.setItem(READING_BOOKMARKS_KEY, JSON.stringify(bookmarks));
  return current;
}

function setFormError(form, message) {
  let error = form.querySelector(".form-error");
  if (!error) {
    error = document.createElement("div");
    error.className = "form-error";
    error.setAttribute("role", "alert");
    error.setAttribute("aria-live", "assertive");
    form.insertBefore(error, form.firstElementChild?.nextSibling || form.firstChild);
  }
  error.textContent = message;
  log(message);
}

function clearFormError(form) {
  const error = form.querySelector(".form-error");
  if (error) error.remove();
}

function sinkSettingInputs() {
  return [$("vaultPath"), $("dailyNoteRoot"), $("vcpMemoryRoot")].filter(Boolean);
}

function sinkSettingsPayload() {
  return {
    vaultPath: $("vaultPath")?.value || "",
    dailyNoteRoot: $("dailyNoteRoot")?.value || "",
    vcpMemoryRoot: $("vcpMemoryRoot")?.value || "",
  };
}

function sinkSettingsSummary() {
  const settings = sinkSettingsPayload();
  return [
    "CoReading 沉淀路径",
    "",
    `vaultPath: ${settings.vaultPath}`,
    `dailyNoteRoot: ${settings.dailyNoteRoot}`,
    `vcpMemoryRoot: ${settings.vcpMemoryRoot}`
  ].join("\n");
}

function saveSinkSettings() {
  localStorage.setItem(SINK_SETTINGS_KEY, JSON.stringify(sinkSettingsPayload()));
}

function applySinkSettings(settings, { overwrite = false } = {}) {
  if (settings.vaultPath && (overwrite || !$("vaultPath").value)) $("vaultPath").value = settings.vaultPath;
  if (settings.dailyNoteRoot && (overwrite || !$("dailyNoteRoot").value)) $("dailyNoteRoot").value = settings.dailyNoteRoot;
  if (settings.vcpMemoryRoot && (overwrite || !$("vcpMemoryRoot").value)) $("vcpMemoryRoot").value = settings.vcpMemoryRoot;
}

function loadSinkSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SINK_SETTINGS_KEY) || "{}");
    applySinkSettings(saved, { overwrite: true });
  } catch {
    localStorage.removeItem(SINK_SETTINGS_KEY);
  }
}

function persistCardSaveResults() {
  localStorage.setItem(CARD_SAVE_RESULTS_KEY, JSON.stringify(state.cardSaveResults));
}

function loadCardSaveResults() {
  try {
    const saved = JSON.parse(localStorage.getItem(CARD_SAVE_RESULTS_KEY) || "{}");
    state.cardSaveResults = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    state.cardSaveResults = {};
    localStorage.removeItem(CARD_SAVE_RESULTS_KEY);
  }
}

function persistCardPreviewResults() {
  localStorage.setItem(CARD_PREVIEW_RESULTS_KEY, JSON.stringify(state.cardPreviewResults));
}

function loadCardPreviewResults() {
  try {
    const saved = JSON.parse(localStorage.getItem(CARD_PREVIEW_RESULTS_KEY) || "{}");
    state.cardPreviewResults = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    state.cardPreviewResults = {};
    localStorage.removeItem(CARD_PREVIEW_RESULTS_KEY);
  }
}

function pruneCardSaveResults() {
  const visibleCardIds = new Set([...state.cardInbox, ...cardCollectionItems()].map((card) => card.id).filter(Boolean));
  for (const cardId of Object.keys(state.cardSaveResults)) {
    if (!visibleCardIds.has(cardId)) delete state.cardSaveResults[cardId];
  }
  persistCardSaveResults();
}

function pruneCardPreviewResults() {
  const visibleCardIds = new Set([...state.cardInbox, ...cardCollectionItems()].map((card) => card.id).filter(Boolean));
  for (const cardId of Object.keys(state.cardPreviewResults)) {
    if (!visibleCardIds.has(cardId)) delete state.cardPreviewResults[cardId];
  }
  persistCardPreviewResults();
}

function syncCardPreviewStatusesFromSnapshot() {
  const previews = new Map((state.snapshot?.sinkPreviews || []).map((preview) => [preview.previewId, preview]));
  let changed = false;
  for (const [cardId, saved] of Object.entries(state.cardPreviewResults)) {
    const latest = previews.get(saved?.previewId);
    if (!latest?.status) continue;
    const summary = previewSummaryFields(latest);
    const sameStatus = saved.status === summary.status;
    const sameTarget = saved.target === summary.target;
    const sameNotePath = saved.notePath === summary.notePath;
    if (sameStatus && sameTarget && sameNotePath) continue;
    state.cardPreviewResults[cardId] = {
      ...saved,
      ...summary,
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  }
  if (changed) persistCardPreviewResults();
}

async function loadSinkDefaults() {
  try {
    const health = await api("/api/health");
    applySinkSettings(health.sinkDefaults || {});
  } catch {
    // Defaults are a convenience; snapshot loading still proves the sidecar is usable.
  }
}

function clearSinkSettings() {
  for (const input of sinkSettingInputs()) input.value = "";
  localStorage.removeItem(SINK_SETTINGS_KEY);
  log("已清空沉淀路径。");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok || data.status === "error") {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function command(payload) {
  const result = await api("/api/command", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  log(result.raw || result.data || result);
  return result;
}

async function query(payload) {
  const result = await api("/api/command", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return result.data;
}

async function askNova(payload) {
  return api("/api/nova/ask", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function activeBook() {
  const books = state.snapshot?.books || [];
  return books.find((book) => book.bookId === state.selectedBookId) || books[0] || null;
}

function progressPercent(book) {
  if (!book || !book.chunkCount) return 0;
  return Math.round((Number(book.chunksRead || 0) / Number(book.chunkCount)) * 100);
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function formatSavedAt(savedAt) {
  if (!savedAt) return "";
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function chunkTitleById(chunkId) {
  const chunk = state.chunks.find((item) => getChunkId(item) === chunkId);
  return chunk?.title || chunk?.sectionTitle || chunkId || "";
}

function nextUnreadChunkId(book) {
  if (!book || !state.chunks.length) return "";
  const lastIndex = chunkOrder(book.lastChunkId);
  if (lastIndex !== null && state.chunks[lastIndex + 1]) return getChunkId(state.chunks[lastIndex + 1]);
  return state.selectedChunkId || getChunkId(state.chunks[0]);
}

function planPercent(plan) {
  if (!plan.stepCount) return 0;
  return Math.min(100, Math.round((Number(plan.currentStepIndex || 0) / Number(plan.stepCount)) * 100));
}

function renderReadingSession() {
  const selected = activeBook();
  const title = $("sessionTitle");
  const meta = $("sessionMeta");
  const kicker = $("sessionKicker");
  const hasBook = !!selected;
  $("sessionResumeBtn").disabled = !hasSavedReadingSession();
  $("sessionContinueBtn").disabled = !hasBook;
  $("sessionAskNovaBtn").disabled = !hasBook || !state.selectedChunkId;
  $("sessionNoteBtn").disabled = !hasBook || !state.selectedChunkId;
  if (!selected) {
    kicker.textContent = "当前阅读";
    title.textContent = "还没有选书";
    meta.textContent = "导入或选择一本书开始。";
    return;
  }
  const percent = progressPercent(selected);
  const nextId = nextUnreadChunkId(selected);
  const nextTitle = chunkTitleById(nextId);
  kicker.textContent = `${percent}% · ${selected.chunksRead || 0}/${selected.chunkCount || 0} chunks`;
  title.textContent = selected.title || selected.bookId;
  meta.textContent = nextId
    ? `下一段 ${nextId}${nextTitle ? ` · ${nextTitle}` : ""}`
    : "这本书暂时没有可继续的段落。";
}

function renderReadingNowBar({ scrollPercent = 0 } = {}) {
  const bar = $("readingNowBar");
  if (!bar) return;
  const selected = activeBook();
  const index = chunkOrder(state.selectedChunkId);
  const hasChunk = !!selected && index !== null;
  const currentTitle = chunkTitleById(state.selectedChunkId);
  bar.classList.toggle("empty", !selected);
  $("readingNowKicker").textContent = selected
    ? `${progressPercent(selected)}% · ${selected.chunksRead || 0}/${selected.chunkCount || state.chunks.length || 0} chunks`
    : "阅读现场";
  $("readingNowTitle").textContent = selected
    ? `${selected.title || selected.bookId}${hasChunk ? ` · ${state.selectedChunkId}` : ""}`
    : "还没有选书";
  $("readingNowMeta").textContent = hasChunk
    ? `${index + 1}/${state.chunks.length} · ${currentTitle || state.selectedChunkId} · 段内 ${clampPercent(scrollPercent)}%`
    : "选择书籍后可以随时回到正文。";
  $("readingNowFocusBtn").disabled = !hasChunk;
  $("readingNowContinueBtn").disabled = !selected;
  $("readingNowAskBtn").disabled = !hasChunk;
  $("readingNowNoteBtn").disabled = !hasChunk;
}

function countCardsForBook(book = activeBook()) {
  return [...state.cardInbox, ...cardCollectionItems()].filter((card) => !book || !card.bookId || card.bookId === book.bookId).length;
}

function cardsForCurrentChunk() {
  return [...state.cardInbox, ...cardCollectionItems()].filter((card) => {
    if (!card) return false;
    if (card.bookId && card.bookId !== state.selectedBookId) return false;
    if (card.chunkId) return card.chunkId === state.selectedChunkId;
    const title = chunkTitleById(state.selectedChunkId);
    const haystack = [card.subtitle, card.title, card.kicker, card.message].filter(Boolean).join(" ");
    return Boolean(state.selectedChunkId && haystack.includes(state.selectedChunkId)) || Boolean(title && haystack.includes(title));
  });
}

function sinkPreviewsForCurrentChunk() {
  return visibleSinkPreviewsForBook(activeBook()).filter((preview) => {
    const source = preview.sourceRange || preview.range || {};
    const notePath = preview.destination?.notePath || preview.notePath || "";
    return preview.chunkId === state.selectedChunkId
      || source.startChunkId === state.selectedChunkId
      || source.endChunkId === state.selectedChunkId
      || notePath.includes(state.selectedChunkId);
  });
}

function renderReaderProgress() {
  const selected = activeBook();
  const index = chunkOrder(state.selectedChunkId);
  const hasChunk = !!selected && index !== null;
  const percent = progressPercent(selected);
  const saved = readSavedReadingSession();
  const nextChunk = hasChunk ? state.chunks[index + 1] : null;
  const nextId = getChunkId(nextChunk);
  const pendingCount = pendingSinkPreviewsForBook(selected).length;
  const cardCountForBook = countCardsForBook(selected);
  const currentTitle = chunkTitleById(state.selectedChunkId);
  const nextTitle = chunkTitleById(nextId);
  const scrollEl = $("chunkText");
  const scrollMax = Math.max(0, Number(scrollEl?.scrollHeight || 0) - Number(scrollEl?.clientHeight || 0));
  const scrollPercent = scrollMax ? clampPercent((Number(scrollEl?.scrollTop || 0) / scrollMax) * 100) : 0;

  $("readerProgressValue").textContent = selected
    ? `${percent}% · ${selected.chunksRead || 0}/${selected.chunkCount || state.chunks.length || 0} chunks`
    : "未开始";
  $("readerProgressFill").style.width = `${clampPercent(percent)}%`;
  $("readerResumeHint").textContent = selected
    ? `${hasChunk ? `当前 ${index + 1}/${state.chunks.length} · ${state.selectedChunkId}` : "未选择段落"}${saved?.bookId === selected.bookId ? ` · 现场 ${saved.chunkId}${formatSavedAt(saved.savedAt) ? ` · ${formatSavedAt(saved.savedAt)}` : ""}` : ""}`
    : "选择书籍后显示当前断点。";
  $("readerChunkMeta").textContent = hasChunk
    ? `${selected.title || selected.bookId} · ${index + 1}/${state.chunks.length} · ${state.selectedChunkId}${currentTitle && currentTitle !== state.selectedChunkId ? ` · ${currentTitle}` : ""}${scrollPercent ? ` · 段内 ${scrollPercent}%` : ""}`
    : "还没有阅读现场。";
  $("readerNextTitle").textContent = selected
    ? (nextId ? `下一段 ${nextId}${nextTitle ? ` · ${nextTitle}` : ""}` : "已经到最后一段。")
    : "选择书籍后继续。";
  $("readerNextBtn").textContent = nextId ? "读完并下一段" : "标记读完";
  $("readerNextBtn").disabled = !selected || !state.selectedChunkId;
  $("readerAskNovaBtn").disabled = !selected || !state.selectedChunkId;
  $("readerOpenSinkBtn").disabled = !selected;
  $("readerOpenSinkBtn").textContent = pendingCount ? `看沉淀 ${pendingCount}` : "看沉淀";
  $("readerSinkHint").textContent = selected
    ? `本书待沉淀 ${pendingCount} 条 · 卡片 ${cardCountForBook} 张 · 本段笔记 ${state.userNotes.length} 条`
    : "笔记、卡片和沉淀入口会在这里提示。";
  $("focusReadingBtn").setAttribute("aria-pressed", state.readingFocus ? "true" : "false");
  $("focusReadingBtn").textContent = state.readingFocus ? "退出专注" : "专注";
  renderReadingNowBar({ scrollPercent });
  renderReadingMap({ scrollPercent });
}

function renderReadingMap({ scrollPercent = 0 } = {}) {
  const selected = activeBook();
  const track = $("readingMapTrack");
  const title = $("readingMapTitle");
  const meta = $("readingMapMeta");
  const bookmarkBtn = $("bookmarkChunkBtn");
  const lastBtn = $("openLastBookmarkBtn");
  if (!track || !title || !meta || !bookmarkBtn || !lastBtn) return;
  const index = chunkOrder(state.selectedChunkId);
  const bookmarks = bookmarksForBook(selected?.bookId);
  bookmarkBtn.disabled = !selected || index === null;
  lastBtn.disabled = !bookmarks.length;
  if (!selected || !state.chunks.length) {
    title.textContent = "选择书籍后显示全书位置。";
    meta.textContent = "目录节点、当前段内位置和本地书签会在这里汇合。";
    track.className = "reading-map-track empty";
    track.textContent = "暂无目录";
    return;
  }
  const total = state.chunks.length;
  const chapterPercent = index === null ? 0 : Math.round(((index + 1) / total) * 100);
  const latestBookmark = bookmarks[0];
  title.textContent = `${selected.title || selected.bookId} · ${index === null ? "未定位" : `${index + 1}/${total}`}`;
  meta.textContent = `全书 ${chapterPercent}% · 段内 ${Math.round(scrollPercent)}%${latestBookmark ? ` · 最近书签 ${latestBookmark.chunkId}` : " · 暂无书签"}`;
  const bookmarkSet = new Set(bookmarks.map((item) => item.chunkId));
  const step = Math.max(1, Math.ceil(total / 36));
  const visibleChunks = state.chunks.filter((chunk, chunkIndex) => {
    const id = getChunkId(chunk);
    return chunkIndex === 0 || chunkIndex === total - 1 || chunkIndex === index || bookmarkSet.has(id) || chunkIndex % step === 0;
  });
  track.className = "reading-map-track";
  track.innerHTML = visibleChunks.map((chunk) => {
    const chunkId = getChunkId(chunk);
    const chunkIndex = chunkOrder(chunkId);
    const active = chunkId === state.selectedChunkId;
    const bookmarked = bookmarkSet.has(chunkId);
    return `
      <button class="map-node ${active ? "active" : ""} ${bookmarked ? "bookmarked" : ""}" type="button" data-chunk-id="${escapeHtml(chunkId)}" title="${escapeHtml(chunk.title || chunk.sectionTitle || chunkId)}">
        <span>${escapeHtml(chunkIndex === null ? "" : chunkIndex + 1)}</span>
        <small>${escapeHtml(chunkId)}</small>
      </button>
    `;
  }).join("");
}

function activePlansForBook(book = activeBook()) {
  return (state.snapshot?.plans || []).filter((plan) => !book || plan.bookId === book.bookId);
}

function pendingSinkPreviewsForBook(book = activeBook()) {
  return (state.snapshot?.sinkPreviews || []).filter((preview) => {
    if (preview.status !== "pending") return false;
    if (!book) return true;
    return !preview.bookId || preview.bookId === book.bookId;
  });
}

function visibleSinkPreviewsForBook(book = activeBook()) {
  return (state.snapshot?.sinkPreviews || [])
    .filter((preview) => !book || !preview.bookId || preview.bookId === book.bookId)
    .sort((a, b) => {
      const order = { pending: 0, approved: 1, rejected: 2, exported: 3 };
      const byStatus = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      if (byStatus) return byStatus;
      return String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || ""));
    });
}

function firstCardForBook(book = activeBook()) {
  return [...state.cardInbox, ...cardCollectionItems()].find((card) => !book || !card.bookId || card.bookId === book.bookId) || null;
}

function activePlanForBook(book = activeBook()) {
  const plans = activePlansForBook(book);
  return plans.find((item) => item.status === "active") || plans[0] || null;
}

function planGuideSelection() {
  const plan = activePlanForBook(activeBook());
  if (!plan) return { plan: null, nextStep: null };
  return { plan, nextStep: state.planNextCache[plan.planId]?.nextStep || null };
}

function planStepChunkLabel(step) {
  if (!step) return "";
  const ids = (step.chunkIds || []).filter(Boolean);
  if (ids.length) return ids.length === 1 ? ids[0] : `${ids[0]} -> ${ids.at(-1)} · ${ids.length} chunks`;
  const range = step.range || {};
  if (range.startChunkId && range.endChunkId) return `${range.startChunkId} -> ${range.endChunkId}`;
  return range.startChunkId || step.startChunkId || "";
}

function queueItemHtml(item) {
  const secondary = item.secondary ? " secondary" : "";
  return `
    <article class="queue-item ${escapeHtml(item.kind || "")}">
      <button class="queue-open${secondary}" type="button" data-action="${escapeHtml(item.action)}" data-id="${escapeHtml(item.id || "")}" ${item.disabled ? "disabled" : ""}>
        <span>${escapeHtml(item.kicker || "")}</span>
        <strong>${escapeHtml(item.title || "")}</strong>
        <small>${escapeHtml(item.meta || "")}</small>
      </button>
    </article>
  `;
}

function renderReadingQueue() {
  const selected = activeBook();
  const list = $("readingQueueList");
  const title = $("queueTitle");
  if (!selected) {
    title.textContent = "暂无可继续项目";
    list.className = "queue-list empty";
    list.textContent = "选择一本书后显示继续读、计划下一步、卡片和待沉淀。";
    return;
  }
  const nextId = nextUnreadChunkId(selected);
  const plan = activePlanForBook(selected);
  const planNext = plan ? state.planNextCache[plan.planId]?.nextStep : null;
  const pendingPreview = pendingSinkPreviewsForBook(selected)[0] || null;
  const card = firstCardForBook(selected);
  const items = [
    nextId ? {
      kind: "queue-read",
      action: "queue-read",
      id: nextId,
      kicker: "继续读",
      title: `${nextId}${chunkTitleById(nextId) ? ` · ${chunkTitleById(nextId)}` : ""}`,
      meta: `${selected.chunksRead || 0}/${selected.chunkCount || 0} chunks · ${progressPercent(selected)}%`,
    } : null,
    plan ? {
      kind: "queue-plan",
      action: "queue-plan",
      id: plan.planId,
      kicker: "计划下一步",
      title: planNext?.title || plan.title || plan.planId,
      meta: planNext
        ? `${planNext.stepId || ""} · ${(planNext.chunkIds || []).join(", ") || planNext.range?.startChunkId || ""}`
        : `${plan.status} · ${plan.currentStepIndex || 0}/${plan.stepCount || 0}`,
      secondary: true,
    } : null,
    pendingPreview ? {
      kind: "queue-sink",
      action: "queue-sink",
      id: pendingPreview.previewId,
      kicker: "待沉淀",
      title: pendingPreview.destination?.notePath || pendingPreview.previewId,
      meta: `${pendingPreview.target || ""} · ${pendingPreview.sourceType || ""}`,
      secondary: true,
    } : null,
    card ? {
      kind: "queue-card",
      action: "queue-card",
      id: card.id,
      kicker: state.cardInbox.some((item) => item.id === card.id) ? "新卡片" : "阅读卡片",
      title: card.message || card.kicker || card.title || card.id,
      meta: card.subtitle || card.chunkId || card.createdAt || "",
      secondary: true,
    } : null,
  ].filter(Boolean);
  title.textContent = `${items.length} 个入口`;
  list.className = items.length ? "queue-list" : "queue-list empty";
  list.innerHTML = items.length ? items.map(queueItemHtml).join("") : "当前书没有待处理队列。";
  if (plan && !state.planNextCache[plan.planId]) {
    void hydratePlanNext(plan.planId);
  }
  renderPlanGuide();
}

async function hydratePlanNext(planId) {
  try {
    const result = await query({ command: "plan_get", planId });
    state.planNextCache[planId] = { nextStep: result.nextStep || null, updatedAt: new Date().toISOString() };
    renderReadingQueue();
    renderPlanGuide();
  } catch {
    state.planNextCache[planId] = { nextStep: null, updatedAt: new Date().toISOString(), error: true };
    renderPlanGuide();
  }
}

function renderPlanGuide() {
  const guide = document.querySelector(".plan-guide");
  const stepEl = $("planGuideStep");
  const titleEl = $("planGuideTitle");
  const metaEl = $("planGuideMeta");
  const openBtn = $("planGuideOpenRangeBtn");
  const reviewBtn = $("planGuideReviewBtn");
  const fullBtn = $("planGuideFullBtn");
  if (!guide || !stepEl || !titleEl || !metaEl || !openBtn || !reviewBtn || !fullBtn) return;
  const { plan, nextStep } = planGuideSelection();
  if (!plan) {
    guide.className = "plan-guide empty";
    stepEl.textContent = "当前计划";
    titleEl.textContent = "暂无活跃计划";
    metaEl.textContent = "创建计划后会在这里显示下一步阅读范围。";
    openBtn.disabled = true;
    reviewBtn.disabled = true;
    fullBtn.disabled = true;
    return;
  }
  const total = plan.stepCount || plan.steps?.length || 0;
  const current = plan.currentStepIndex || 0;
  const status = nextStep?.status || plan.status || "";
  const chunkLabel = planStepChunkLabel(nextStep);
  guide.className = "plan-guide";
  stepEl.textContent = `${current}/${total} · ${status || "计划"}`;
  titleEl.textContent = nextStep?.title || plan.title || plan.planId;
  metaEl.textContent = nextStep
    ? `${nextStep.type || "step"} · ${chunkLabel || "未给出范围"} · ${nextStep.intent || "按计划继续阅读。"}`
    : `${plan.status || ""} · 正在读取下一步。`;
  openBtn.disabled = !nextStep || !(nextStep.chunkIds?.length || nextStep.range?.startChunkId || nextStep.startChunkId);
  reviewBtn.disabled = !nextStep;
  fullBtn.disabled = false;
}

function renderBooks() {
  const books = state.snapshot?.books || [];
  const list = $("bookList");
  if (!books.length) {
    list.className = "book-list empty";
    list.textContent = "暂无书籍";
    $("activeBookLabel").textContent = "未选择";
    return;
  }
  const selected = activeBook();
  state.selectedBookId = selected.bookId;
  $("activeBookLabel").textContent = selected.title || selected.bookId;
  list.className = "book-list";
  list.innerHTML = "";
  for (const book of books) {
    const row = document.createElement("article");
    row.className = `book-row ${book.bookId === selected.bookId ? "active" : ""}`;
    row.innerHTML = `
      <button class="book-select" type="button">
        <span><strong>${escapeHtml(book.title || book.bookId)}</strong><small>${escapeHtml(book.bookId)} · ${book.chunkCount || 0} chunks</small></span>
        <b>${progressPercent(book)}%</b>
      </button>
      <button class="secondary" type="button" data-action="copy-book-progress" data-id="${escapeHtml(book.bookId)}">复制进度</button>
    `;
    row.querySelector(".book-select").addEventListener("click", () => {
      state.selectedBookId = book.bookId;
      state.selectedChunkId = "";
      state.currentChunk = null;
      state.annotations = [];
      state.userNotes = [];
      state.submissions = [];
      state.searchResults = [];
      state.cardInbox = [];
      state.cardCollection = { items: [], bookCards: [] };
      state.selectedCard = null;
      void loadChunks(book.bookId).then(() => {
        return loadCards(book.bookId);
      }).then(() => {
        renderAll();
        return readSelectedChunk();
      });
    });
    list.appendChild(row);
  }
}

function renderChunks() {
  const select = $("chunkSelect");
  $("chunkCount").textContent = `${state.chunks.length} chunks`;
  select.innerHTML = "";
  if (!state.chunks.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无 chunk";
    select.appendChild(option);
    $("copyChunkIndexBtn").disabled = true;
    renderChunkNavigation();
    return;
  }
  $("copyChunkIndexBtn").disabled = false;
  for (const chunk of state.chunks) {
    const chunkId = getChunkId(chunk);
    const option = document.createElement("option");
    option.value = chunkId;
    option.textContent = `${chunkId} · ${chunk.title || chunk.sectionTitle || "untitled"}`;
    select.appendChild(option);
  }
  if (!state.selectedChunkId || !state.chunks.some((chunk) => getChunkId(chunk) === state.selectedChunkId)) {
    state.selectedChunkId = getChunkId(state.chunks[0]);
  }
  select.value = state.selectedChunkId;
  renderChunkNavigation();
  renderPlanRangeStatus();
}

function renderChunkNavigation() {
  const index = chunkOrder(state.selectedChunkId);
  const hasChunk = index !== null;
  $("chunkPosition").textContent = hasChunk
    ? `当前位置 ${index + 1}/${state.chunks.length} · ${state.selectedChunkId}`
    : "未选择位置";
  $("continueReadingBtn").disabled = !activeBook();
  $("prevChunkBtn").disabled = !hasChunk || index <= 0;
  $("nextChunkBtn").disabled = !hasChunk || index >= state.chunks.length - 1;
  renderReadingSession();
}

function renderReader() {
  const current = state.currentChunk;
  const chunk = current?.chunk || current || {};
  $("chunkTitle").textContent = chunk.title || chunk.id || state.selectedChunkId || "未选择 chunk";
  renderChunkTextWithFootprints(current?.text || chunk.text || "选择一本书和一个 chunk 后开始共读。");
  renderSelfCheck();
  renderChunkReview();
  renderReadingSession();
  renderReaderProgress();
}

function chunkReviewItems() {
  const notes = (state.userNotes || []).map((item, index) => ({
    type: item.kind === "self-check" ? "自测" : "我的笔记",
    title: item.note || item.quote || "用户笔记",
    meta: item.status || "open",
    action: "notes",
    id: `user-${index}`,
  }));
  const annotations = (state.annotations || []).map((item, index) => ({
    type: item.kind || "边注",
    title: item.note || item.quote || "边注",
    meta: item.author || "reader",
    action: "notes",
    id: `annotation-${index}`,
  }));
  const cards = cardsForCurrentChunk().slice(0, 2).map((card) => ({
    type: "卡片",
    title: card.title || card.message || card.kicker || card.id,
    meta: card.subtitle || card.createdAt || card.status || "",
    action: "card",
    id: card.id,
  }));
  const sinks = sinkPreviewsForCurrentChunk().slice(0, 2).map((preview) => ({
    type: "沉淀",
    title: preview.destination?.notePath || preview.previewId,
    meta: `${preview.status || ""} · ${preview.target || ""}`,
    action: "sink",
    id: preview.previewId,
  }));
  return [...notes.slice(0, 2), ...annotations.slice(0, 2), ...cards, ...sinks];
}

function renderChunkReview() {
  const panel = $("chunkReviewCard");
  if (!panel) return;
  const selected = activeBook();
  const hasChunk = !!selected && !!state.selectedChunkId && !!currentChunkText();
  const items = hasChunk ? chunkReviewItems() : [];
  $("chunkReviewTitle").textContent = hasChunk ? "本段留下了什么" : "读取段落后回看";
  $("chunkReviewMeta").textContent = hasChunk
    ? `${state.selectedChunkId} · 笔记 ${state.userNotes.length} · 边注 ${state.annotations.length} · 卡片 ${cardsForCurrentChunk().length} · 沉淀 ${sinkPreviewsForCurrentChunk().length}`
    : "笔记、边注、卡片和待沉淀会汇合到这里。";
  $("copyChunkReviewBtn").disabled = !hasChunk;
  $("chunkReviewNotesBtn").disabled = !hasChunk || !(state.userNotes.length || state.annotations.length);
  $("chunkReviewCardsBtn").disabled = !hasChunk || !cardsForCurrentChunk().length;
  $("chunkReviewSinksBtn").disabled = !hasChunk || !sinkPreviewsForCurrentChunk().length;
  const list = $("chunkReviewList");
  if (!items.length) {
    list.className = "chunk-review-list empty";
    list.textContent = hasChunk ? "本段还没有笔记、边注、卡片或沉淀。" : "读取段落后显示本段回看。";
    return;
  }
  list.className = "chunk-review-list";
  list.innerHTML = items.slice(0, 8).map((item) => `
    <button class="chunk-review-item" type="button" data-chunk-review-action="${escapeHtml(item.action)}" data-id="${escapeHtml(item.id || "")}">
      <span>${escapeHtml(item.type)}</span>
      <strong>${escapeHtml(String(item.title || "").slice(0, 96))}</strong>
      <small>${escapeHtml(String(item.meta || "").slice(0, 120))}</small>
    </button>
  `).join("");
}

function chunkReviewSummary() {
  const selected = activeBook();
  const chunk = state.currentChunk?.chunk || state.currentChunk || {};
  const items = chunkReviewItems();
  return [
    `book: ${selected?.title || selected?.bookId || ""}`,
    `bookId: ${selected?.bookId || ""}`,
    `chunkId: ${state.selectedChunkId || ""}`,
    `title: ${chunk.title || chunk.sectionTitle || ""}`,
    "",
    `items: ${items.length}`,
    ...items.map((item, index) => `${index + 1}. [${item.type}] ${item.title}\n   ${item.meta || ""}`)
  ].join("\n");
}

function selfCheckSeed() {
  return Array.from(`${state.selectedBookId}:${state.selectedChunkId}`).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function selfCheckQuestionSet() {
  const selected = activeBook();
  const chunk = state.currentChunk?.chunk || state.currentChunk || {};
  const title = chunk.title || chunk.sectionTitle || state.selectedChunkId || "这一段";
  const index = chunkOrder(state.selectedChunkId);
  const position = index === null ? "" : `${index + 1}/${state.chunks.length}`;
  const bookTitle = selected?.title || selected?.bookId || "当前书";
  return [
    {
      question: `如果只能用两句话复述「${title}」，你会怎么说？`,
      hint: `先写这段“发生/主张了什么”，再写它为什么会被放在 ${bookTitle}${position ? ` 的 ${position}` : ""}。`
    },
    {
      question: "这一段里哪一个判断最值得你停一下？为什么？",
      hint: "找一个带有因果、转折、定义、目标或价值判断的句子，不用追求完整。"
    },
    {
      question: "读到这里，你下一段最想验证什么？",
      hint: "把问题写成一句可继续追踪的线索，例如人物动机、概念定义、冲突、证据或伏笔。"
    }
  ];
}

function currentSelfCheck() {
  const items = selfCheckQuestionSet();
  const index = Math.abs((selfCheckSeed() + Number(state.selfCheck.variant || 0)) % items.length);
  return items[index];
}

function renderSelfCheck() {
  const panel = $("selfCheckCard");
  if (!panel) return;
  const selected = activeBook();
  const hasChunk = !!selected && !!state.selectedChunkId && !!currentChunkText();
  panel.classList.toggle("empty", !hasChunk);
  const check = currentSelfCheck();
  $("selfCheckKicker").textContent = hasChunk ? "读后自测" : "读后自测";
  $("selfCheckTitle").textContent = hasChunk ? "先用自己的话说一遍" : "读取段落后再自测";
  $("selfCheckMeta").textContent = hasChunk ? `${state.selectedChunkId} · ${chunkTitleById(state.selectedChunkId) || "当前段落"}` : "每段一个问题，一个隐藏提示。";
  $("selfCheckQuestion").textContent = hasChunk ? check.question : "读取当前段落后生成自测问题。";
  $("selfCheckHint").textContent = hasChunk ? check.hint : "提示会在这里显示。";
  $("selfCheckHint").hidden = !hasChunk || !state.selfCheck.hintVisible;
  $("selfCheckHintBtn").setAttribute("aria-expanded", state.selfCheck.hintVisible ? "true" : "false");
  $("selfCheckHintBtn").textContent = state.selfCheck.hintVisible ? "收起提示" : "看提示";
  $("selfCheckAnswer").disabled = !hasChunk;
  $("selfCheckRefreshBtn").disabled = !hasChunk;
  $("selfCheckHintBtn").disabled = !hasChunk;
  $("selfCheckAskNovaBtn").disabled = !hasChunk;
  $("selfCheckSaveNoteBtn").disabled = !hasChunk;
  $("selfCheckClearBtn").disabled = !hasChunk;
  const answer = $("selfCheckAnswer");
  const draft = hasChunk ? loadSelfCheckDraft() : "";
  if (document.activeElement !== answer && answer.value !== draft) answer.value = draft;
}

function selfCheckNovaPrompt(answer) {
  const check = currentSelfCheck();
  return [
    "请只基于当前段落点评我的读后自测。",
    "",
    `自测问题: ${check.question}`,
    `我的回答: ${answer}`,
    "",
    "请按三行回答：",
    "1. 我抓住了什么；",
    "2. 我漏掉或误读了什么；",
    "3. 下一段阅读时只带一个问题，应该是什么。",
    "",
    "不要替我重写完整答案。"
  ].join("\n");
}

function anchoredReadingNotes() {
  return [
    ...state.annotations.map((item, index) => ({ ...item, source: "annotation", index })),
    ...state.userNotes.map((item, index) => ({ ...item, source: "user-note", index })),
  ].filter((item) => item.quote && (item.note || item.text));
}

function noteAnchorOffset(item, text) {
  const offset = Number(item.quoteOffset);
  if (Number.isFinite(offset) && offset >= 0 && text.slice(offset, offset + String(item.quote).length) === item.quote) {
    return offset;
  }
  return text.indexOf(String(item.quote || ""));
}

function noteFingerprint(item) {
  return `${item.source}-${item.index}`;
}

function readingFootprintRanges(text) {
  const ranges = [];
  for (const item of anchoredReadingNotes()) {
    const quote = String(item.quote || "");
    const start = noteAnchorOffset(item, text);
    if (!quote || start < 0) continue;
    ranges.push({
      id: noteFingerprint(item),
      start,
      end: start + quote.length,
      item,
    });
  }
  return ranges.sort((a, b) => a.start - b.start || a.end - b.end);
}

function renderChunkTextWithFootprints(text) {
  const chunkText = $("chunkText");
  if (!chunkText) return;
  const source = String(text || "");
  const ranges = readingFootprintRanges(source);
  if (!ranges.length) {
    chunkText.textContent = source;
    renderReadingFootprints([]);
    return;
  }
  let cursor = 0;
  const parts = [];
  const renderedRanges = [];
  for (const range of ranges) {
    if (range.start < cursor) continue;
    parts.push(escapeHtml(source.slice(cursor, range.start)));
    parts.push(`<mark class="reading-mark ${range.item.source === "user-note" ? "mine" : ""}" data-footprint-id="${escapeHtml(range.id)}">${escapeHtml(source.slice(range.start, range.end))}</mark>`);
    renderedRanges.push(range);
    cursor = range.end;
  }
  parts.push(escapeHtml(source.slice(cursor)));
  chunkText.innerHTML = parts.join("");
  renderReadingFootprints(renderedRanges);
}

function renderReadingFootprints(ranges) {
  const rail = $("readingFootprints");
  if (!rail) return;
  if (!ranges.length) {
    rail.className = "reading-footprints empty";
    rail.textContent = "暂无高亮足迹";
    return;
  }
  rail.className = "reading-footprints";
  rail.innerHTML = ranges.map(({ id, item }, index) => {
    const label = item.source === "user-note" ? "我的笔记" : (item.kind || "边注");
    return `
      <button class="footprint-card ${item.source === "user-note" ? "mine" : ""}" type="button" data-footprint-id="${escapeHtml(id)}">
        <span>${escapeHtml(index + 1)} · ${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(item.note || item.text || "").slice(0, 80))}</strong>
        <small>${escapeHtml(String(item.quote || "").slice(0, 90))}</small>
      </button>
    `;
  }).join("");
}

function focusReadingFootprint(id) {
  const mark = document.querySelector(`.reading-mark[data-footprint-id="${CSS.escape(id)}"]`);
  if (!mark) return;
  document.querySelectorAll(".reading-mark.active, .footprint-card.active").forEach((item) => item.classList.remove("active"));
  mark.classList.add("active");
  const card = document.querySelector(`.footprint-card[data-footprint-id="${CSS.escape(id)}"]`);
  if (card) card.classList.add("active");
  mark.scrollIntoView({ block: "center", behavior: "smooth" });
}

function renderNovaReply() {
  const reply = $("novaReply");
  const status = $("novaAskStatus");
  const copyButton = $("copyNovaReplyBtn");
  if (!reply || !status || !copyButton) return;
  if (!state.novaReply) {
    reply.className = "nova-reply empty";
    reply.textContent = "Nova 的回应会出现在这里。";
    status.textContent = "待提问";
    copyButton.disabled = true;
    return;
  }
  reply.className = "nova-reply";
  reply.textContent = state.novaReply;
  status.textContent = "已回应";
  copyButton.disabled = false;
}

function planFormChunkValue(name) {
  return String(new FormData($("planForm")).get(name) || "").trim();
}

function reviewFormChunkValue(name) {
  return String(new FormData($("reviewForm")).get(name) || "").trim();
}

function chunkOrder(chunkId) {
  const index = state.chunks.findIndex((chunk) => getChunkId(chunk) === chunkId);
  return index >= 0 ? index : null;
}

function renderPlanRangeStatus() {
  const start = planFormChunkValue("startChunkId");
  const end = planFormChunkValue("endChunkId");
  const startIndex = chunkOrder(start);
  const endIndex = chunkOrder(end);
  const valid = start && end && startIndex !== null && endIndex !== null;
  const count = valid ? Math.abs(endIndex - startIndex) + 1 : 0;
  $("planRangeStatus").textContent = valid ? `范围 ${start} -> ${end} · ${count} chunks` : "范围未匹配当前书";
  renderReviewRangeStatus();
}

function setPlanRangeEdge(edge) {
  if (!state.selectedChunkId) return;
  const input = document.querySelector(`#planForm input[name="${edge}ChunkId"]`);
  if (!input) return;
  input.value = state.selectedChunkId;
  renderPlanRangeStatus();
}

function shiftPlanRange(edge, delta) {
  shiftRangeInput("planForm", edge, delta, renderPlanRangeStatus);
}

function shiftReviewRange(edge, delta) {
  shiftRangeInput("reviewForm", edge, delta, renderReviewRangeStatus);
}

function shiftRangeInput(formId, edge, delta, renderStatus) {
  const input = document.querySelector(`#${formId} input[name="${edge}ChunkId"]`);
  if (!input) return;
  const current = String(input.value || "").trim() || state.selectedChunkId;
  const index = chunkOrder(current);
  if (index === null) {
    log("当前范围未匹配书籍 chunk。");
    return;
  }
  const next = state.chunks[Math.max(0, Math.min(state.chunks.length - 1, index + delta))];
  const nextId = getChunkId(next);
  if (!nextId || nextId === current) return;
  input.value = nextId;
  renderStatus();
}

function renderReviewRangeStatus() {
  const start = reviewFormChunkValue("startChunkId") || state.selectedChunkId;
  const end = reviewFormChunkValue("endChunkId") || state.selectedChunkId;
  const startIndex = chunkOrder(start);
  const endIndex = chunkOrder(end);
  const valid = start && end && startIndex !== null && endIndex !== null;
  const count = valid ? Math.abs(endIndex - startIndex) + 1 : 0;
  $("reviewRangeStatus").textContent = valid ? `评价范围 ${start} -> ${end} · ${count} chunks` : "默认使用当前 chunk";
}

function copyPlanRangeToReview() {
  const start = planFormChunkValue("startChunkId") || state.selectedChunkId;
  const end = planFormChunkValue("endChunkId") || state.selectedChunkId;
  const startInput = document.querySelector('#reviewForm input[name="startChunkId"]');
  const endInput = document.querySelector('#reviewForm input[name="endChunkId"]');
  if (startInput) startInput.value = start;
  if (endInput) endInput.value = end;
  renderReviewRangeStatus();
}

function copyReviewRangeToPlan() {
  const start = reviewFormChunkValue("startChunkId") || state.selectedChunkId;
  const end = reviewFormChunkValue("endChunkId") || state.selectedChunkId;
  const startInput = document.querySelector('#planForm input[name="startChunkId"]');
  const endInput = document.querySelector('#planForm input[name="endChunkId"]');
  if (startInput) startInput.value = start;
  if (endInput) endInput.value = end;
  renderPlanRangeStatus();
}

function rangeCopySummary(start, end, label) {
  const selected = activeBook();
  const startIndex = chunkOrder(start);
  const endIndex = chunkOrder(end);
  if (!selected || startIndex === null || endIndex === null) {
    throw new Error("当前范围未匹配书籍 chunk。");
  }
  const left = Math.min(startIndex, endIndex);
  const right = Math.max(startIndex, endIndex);
  const chunks = state.chunks.slice(left, right + 1);
  return [
    `type: ${label}`,
    `book: ${selected.title || selected.bookId}`,
    `bookId: ${selected.bookId}`,
    `startChunkId: ${getChunkId(chunks[0])}`,
    `endChunkId: ${getChunkId(chunks[chunks.length - 1])}`,
    `chunkCount: ${chunks.length}`,
    "",
    "chunks:",
    ...chunks.map((chunk, index) => `${index + 1}. ${getChunkId(chunk)} · ${chunk.title || chunk.sectionTitle || ""}`)
  ].join("\n");
}

function rangeEvidencePacket(start, end, label) {
  const startIndex = chunkOrder(start);
  const endIndex = chunkOrder(end);
  if (startIndex === null || endIndex === null) {
    return { label, valid: false, startChunkId: start || "", endChunkId: end || "", chunks: [] };
  }
  const left = Math.min(startIndex, endIndex);
  const right = Math.max(startIndex, endIndex);
  const chunks = state.chunks.slice(left, right + 1);
  const currentIndex = chunkOrder(state.selectedChunkId);
  const currentText = currentChunkText();
  const hasCurrentText = currentIndex !== null && currentIndex >= left && currentIndex <= right && Boolean(currentText);
  return {
    label,
    valid: true,
    startChunkId: getChunkId(chunks[0]),
    endChunkId: getChunkId(chunks[chunks.length - 1]),
    chunkCount: chunks.length,
    position: `${left + 1}-${right + 1}/${state.chunks.length}`,
    chunks: chunks.slice(0, 12).map((chunk, index) => ({
      index: left + index + 1,
      chunkId: getChunkId(chunk),
      title: chunk.title || chunk.sectionTitle || "",
    })),
    currentTextEvidence: hasCurrentText
      ? {
          chunkId: state.selectedChunkId || "",
          position: `${currentIndex + 1}/${state.chunks.length}`,
          excerpt: currentText.slice(0, 900),
          truncated: currentText.length > 900,
        }
      : null,
    evidenceBoundary: "Only the currently loaded chunk includes a text excerpt; other range chunks are represented by id/title.",
    truncated: chunks.length > 12,
  };
}

function buildPlanCreatePayload(selected, form) {
  const mode = String(form.get("mode"));
  return {
    command: "plan_create",
    bookId: selected.bookId,
    mode,
    startChunkId: mode === "full_book" ? undefined : String(form.get("startChunkId") || "").trim() || undefined,
    endChunkId: mode === "full_book" ? undefined : String(form.get("endChunkId") || "").trim() || undefined,
    query: mode === "interest_trail" ? String(form.get("query") || "").trim() : undefined,
    budget: {
      maxChunksPerStep: Number(form.get("maxChunksPerStep") || 2),
      maxAnnotationsPerChunk: 2,
    },
    annotationDensity: String(form.get("annotationDensity") || "medium"),
    sinkPolicy: {
      requireApproval: true,
      obsidian: form.get("obsidian") === "on",
      dailyNote: form.get("dailyNote") === "on",
      vcpMemory: form.get("vcpMemory") === "on",
    },
    createdBy: "CoReadingSidecar",
  };
}

function reviewTargetsFromForm(form) {
  const targets = [];
  if (form.get("obsidian") === "on") targets.push("obsidian");
  if (form.get("dailyNote") === "on") targets.push("dailyNote");
  if (form.get("vcpMemory") === "on") targets.push("vcpMemory");
  return targets;
}

function reviewObservationsFromForm(form) {
  return String(form.get("observations") || "")
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

function buildReviewCreatePayload(selected, form) {
  const targets = reviewTargetsFromForm(form);
  return {
    command: "review_create",
    bookId: selected.bookId,
    startChunkId: String(form.get("startChunkId") || "").trim() || state.selectedChunkId,
    endChunkId: String(form.get("endChunkId") || "").trim() || state.selectedChunkId,
    summary: String(form.get("summary") || "").trim(),
    observations: reviewObservationsFromForm(form),
    tags: ["co-reading", "sidecar", "range-review"],
    sinkPolicy: {
      requireApproval: true,
      obsidian: targets.includes("obsidian"),
      dailyNote: targets.includes("dailyNote"),
      vcpMemory: targets.includes("vcpMemory"),
    },
    createdBy: "CoReadingSidecar",
  };
}

function readingDecisionPacket(selected) {
  const planPayload = buildPlanCreatePayload(selected, new FormData($("planForm")));
  const reviewForm = new FormData($("reviewForm"));
  const reviewPayload = buildReviewCreatePayload(selected, reviewForm);
  const backtrack = state.backtrackEvidence || null;
  return {
    type: "reading-decision-packet",
    reviewGoal: "审阅当前阅读推进状态，决定创建计划、生成范围评价、回溯兴趣点，或先调整章节范围。",
    book: {
      bookId: selected.bookId,
      title: selected.title || "",
      author: selected.author || "",
    },
    currentChunkId: state.selectedChunkId || "",
    planRange: {
      startChunkId: planPayload.startChunkId || "",
      endChunkId: planPayload.endChunkId || "",
      mode: planPayload.mode || "",
      query: planPayload.query || "",
    },
    reviewRange: {
      startChunkId: reviewPayload.startChunkId || "",
      endChunkId: reviewPayload.endChunkId || "",
      summary: reviewPayload.summary || "",
      targets: reviewTargetsFromForm(reviewForm),
    },
    rangeEvidence: {
      current: rangeEvidencePacket(state.selectedChunkId, state.selectedChunkId, "current-chunk"),
      plan: rangeEvidencePacket(planPayload.startChunkId || state.selectedChunkId, planPayload.endChunkId || planPayload.startChunkId || state.selectedChunkId, "plan-range"),
      review: rangeEvidencePacket(reviewPayload.startChunkId || state.selectedChunkId, reviewPayload.endChunkId || reviewPayload.startChunkId || state.selectedChunkId, "review-range"),
    },
    backtrack: backtrack
      ? {
          query: backtrack.query || "",
          anchorChunkId: backtrack.anchorChunkId || "",
          chunkIds: backtrack.chunkIds || [],
          rangeCount: backtrack.rangeCount || (backtrack.ranges || []).length || 0,
          evidencePreview: String(backtrack.evidenceMarkdown || backtrack.summary || "").slice(0, 1200),
        }
      : null,
    payloads: {
      createPlan: planPayload,
      createReview: reviewPayload.summary ? reviewPayload : null,
      backtrack: selected.bookId ? backtrackPayload(selected.bookId, state.selectedChunkId) : null,
    },
    nextStepGuide: [
      planPayload.mode === "interest_trail" && !planPayload.query ? "兴趣线索计划需要先补 query。" : "",
      reviewPayload.summary ? "已有评价摘要，可生成范围评价并触发沉淀预览。" : "如需要沉淀当前范围，先补评价 summary。",
      backtrack ? "已有回溯证据，可填入计划或收藏为卡片。" : "如需要回看兴趣点，先执行回溯当前。",
      "创建计划前确认 start/end chunk 覆盖预期阅读范围。",
    ].filter(Boolean),
    requiredChecks: [
      "确认当前 bookId 与章节目录来自目标长篇文本。",
      "确认计划范围和评价范围没有跨过不相关章节。",
      "确认 rangeEvidence 中的标题与当前阅读意图一致。",
      "确认 currentTextEvidence 只代表当前已读取 chunk，不代表整个范围全文。",
      "确认 sinkPolicy 目标符合本次沉淀需求。",
      "确认回溯 evidencePreview 足以支撑兴趣线索，而不是仅凭搜索词。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      createsPlan: true,
      createsReview: Boolean(reviewPayload.summary),
      mayCreateSinkPreview: Boolean(reviewPayload.summary),
      productRuntimeAgent: "Nova",
    },
  };
}

function planDecisionPacket(selected) {
  const form = new FormData($("planForm"));
  const payload = buildPlanCreatePayload(selected, form);
  const rangeStart = payload.startChunkId || state.selectedChunkId;
  const rangeEnd = payload.endChunkId || rangeStart;
  return {
    type: "plan-decision-packet",
    reviewGoal: "审阅当前分计划阅读创建参数，决定创建计划、调整范围/预算，或先做兴趣点回溯。",
    book: {
      bookId: selected.bookId,
      title: selected.title || "",
      author: selected.author || "",
    },
    mode: payload.mode || "",
    query: payload.query || "",
    rangeEvidence: payload.mode === "full_book"
      ? {
          label: "full-book",
          valid: true,
          chunkCount: state.chunks.length,
          firstChunkId: getChunkId(state.chunks[0]),
          lastChunkId: getChunkId(state.chunks[state.chunks.length - 1]),
        }
      : rangeEvidencePacket(rangeStart, rangeEnd, "plan-range"),
    budget: payload.budget || {},
    annotationDensity: payload.annotationDensity || "",
    sinkPolicy: payload.sinkPolicy || {},
    payloads: {
      createPlan: payload,
      backtrackFirst: payload.mode === "interest_trail" ? backtrackPayload(selected.bookId, state.selectedChunkId) : null,
    },
    nextStepGuide: [
      payload.mode === "interest_trail" && !payload.query ? "interest_trail 需要先补 query，或先执行 backtrackFirst。" : "",
      payload.mode === "full_book" ? "full_book 会覆盖全书，创建前确认预算足够且不会产生过密评注。" : "确认 plan-range 覆盖预期阅读段落。",
      "创建计划后可逐步执行，再将下一步填入评价。",
    ].filter(Boolean),
    requiredChecks: [
      "确认 mode 符合本次阅读目标。",
      "确认 rangeEvidence 与当前长篇结构一致。",
      "确认 budget.maxChunksPerStep 不会让单步过长或过碎。",
      "确认 sinkPolicy.requireApproval=true，沉淀不会直接写入。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      createsPlan: true,
      mayCreateSinkPreviewLater: Boolean(payload.sinkPolicy?.obsidian || payload.sinkPolicy?.dailyNote || payload.sinkPolicy?.vcpMemory),
      productRuntimeAgent: "Nova",
    },
  };
}

function reviewDecisionPacket(selected) {
  const form = new FormData($("reviewForm"));
  const payload = buildReviewCreatePayload(selected, form);
  const targets = reviewTargetsFromForm(form);
  const sinkPreviewPayload = targets.length
    ? {
        command: "sink_preview_create",
        reviewId: "<reviewId>",
        targets,
        requireApproval: true,
        createdBy: "CoReadingSidecar",
      }
    : null;
  return {
    type: "review-decision-packet",
    reviewGoal: "审阅当前范围评价输入，决定生成评价、创建 approval-gated 沉淀预览，或先调整范围/摘要/观察。",
    book: {
      bookId: selected.bookId,
      title: selected.title || "",
      author: selected.author || "",
    },
    rangeEvidence: rangeEvidencePacket(payload.startChunkId, payload.endChunkId, "review-range"),
    summary: payload.summary || "",
    observations: payload.observations || [],
    targets,
    payloads: {
      createReview: payload.summary ? payload : null,
      createSinkPreviewAfterReview: sinkPreviewPayload,
    },
    nextStepGuide: [
      payload.summary ? "summary 已填写，可先执行 payloads.createReview。" : "summary 为空，先补评价摘要。",
      targets.length ? "评价生成后可把返回的 reviewId 填入 createSinkPreviewAfterReview.reviewId。" : "未选择沉淀目标时只生成评价，不生成预览。",
      "如 rangeEvidence 标题不匹配阅读意图，先调整 start/end chunk。",
    ],
    requiredChecks: [
      "确认 summary 是对范围的评价，不是单句摘录。",
      "确认 observations 没有包含未核验推断。",
      "确认 targets 符合本次沉淀目标。",
      "确认沉淀预览仍 requireApproval，不会直接写入 Obsidian/OBS。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      createsReview: Boolean(payload.summary),
      mayCreateSinkPreview: Boolean(targets.length),
      productRuntimeAgent: "Nova",
    },
  };
}

function cardDecisionPacket(card, selected) {
  const chunkId = card.chunkId || state.selectedChunkId;
  const query = [card.title, card.kicker, card.message, card.note]
    .filter(Boolean)
    .map((text) => String(text).trim())
    .find(Boolean) || card.id || "";
  const backtrack = {
    bookId: selected.bookId,
    query: query || undefined,
    anchorChunkId: chunkId,
    before: clampNumber($("backtrackBefore").value, 0, 20, 2),
    after: clampNumber($("backtrackAfter").value, 0, 20, 2),
    maxRanges: clampNumber($("backtrackMaxRanges").value, 1, 20, 4),
    mergeGap: clampNumber($("backtrackMergeGap").value, 0, 10, 1),
    includeEvidence: true,
  };
  const createReview = {
    command: "review_create",
    bookId: selected.bookId,
    startChunkId: chunkId,
    endChunkId: chunkId,
    summary: card.note || card.message || card.title || card.kicker || "",
    observations: [
      { text: "来源: reading-card" },
      { text: `cardId: ${card.id || ""}` },
      ...(card.title ? [{ text: `标题: ${card.title}` }] : []),
      ...(card.kicker ? [{ text: `题签: ${card.kicker}` }] : []),
      ...(card.quote ? [{ text: `引用: ${card.quote}` }] : []),
    ],
    tags: ["co-reading", "sidecar", "card-review"],
    sinkPolicy: {
      requireApproval: true,
      obsidian: true,
      dailyNote: false,
      vcpMemory: false,
    },
    createdBy: "CoReadingSidecar",
  };
  return {
    type: "card-decision-packet",
    reviewGoal: "审阅阅读卡片的后续分支，决定生成评价、回溯兴趣点、创建回溯计划，或创建 approval-gated 沉淀预览。",
    book: {
      bookId: selected.bookId,
      title: selected.title || "",
      author: selected.author || "",
    },
    card: {
      cardId: card.id || "",
      title: card.title || "",
      kicker: card.kicker || "",
      message: card.message || "",
      note: card.note || "",
      chunkId,
      quote: card.quote || "",
      source: card.source || "",
      status: card.status || "",
    },
    rangeEvidence: rangeEvidencePacket(chunkId, chunkId, "card-range"),
    payloads: {
      createReview,
      backtrack,
      createBacktrackPlan: {
        ...backtrack,
        command: "interest_backtrack",
        createPlan: true,
        budget: { maxChunksPerStep: 2, maxAnnotationsPerChunk: 2 },
        annotationDensity: "medium",
        sinkPolicy: { requireApproval: true, obsidian: true },
        createdBy: "CoReadingSidecar",
      },
      createSinkPreviewFromBacktrack: {
        ...backtrack,
        command: "sink_preview_create_from_backtrack",
        requireApproval: true,
        vaultPath: $("vaultPath").value || undefined,
        createdBy: "CoReadingSidecar",
      },
      createSinkPreviewFromCards: {
        command: "sink_preview_create_from_cards",
        bookId: selected.bookId,
        cardIds: [card.id || ""].filter(Boolean),
        limit: 200,
        title: `${card.title || card.kicker || card.id || "阅读卡片"} 卡片沉淀`,
        vaultPath: $("vaultPath").value || undefined,
        requireApproval: true,
        createdBy: "CoReadingSidecar",
      },
    },
    nextStepGuide: [
      createReview.summary ? "如卡片摘要足以代表本段，可先执行 payloads.createReview。" : "卡片缺少摘要，先补 note/message/title 后再生成评价。",
      "如要扩展兴趣点，先审 payloads.backtrack，再决定是否升级为 createBacktrackPlan。",
      "如只沉淀当前卡片，审 payloads.createSinkPreviewFromCards。",
      "如要沉淀回溯结果，先审 createSinkPreviewFromBacktrack 并批准，不能直接写入 Obsidian/OBS。",
    ],
    requiredChecks: [
      "确认 card.chunkId 指向当前目标章节/段落。",
      "确认 quote/note 足以支撑评价或回溯 query。",
      "确认 rangeEvidence.currentTextEvidence 只代表当前已读取 chunk。",
      "确认 cardIds 只包含需要沉淀的卡片。",
      "确认所有沉淀路径 requireApproval=true。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      mayCreateReview: Boolean(createReview.summary),
      mayCreatePlan: true,
      mayCreateSinkPreview: true,
      productRuntimeAgent: "Nova",
    },
  };
}

function reviewFollowUpQuery(review) {
  const nextAction = (review.nextActions || [])
    .map((item) => item.text || item.action || item)
    .filter(Boolean)
    .map(String)
    .find(Boolean);
  const question = (review.questions || [])
    .map((item) => item.text || item.question || item)
    .filter(Boolean)
    .map(String)
    .find(Boolean);
  return nextAction || question || review.summary || review.title || review.reviewId || "";
}

async function fillPlanFromReview(reviewId) {
  const selected = activeBook();
  if (!selected || !reviewId) throw new Error("请先选择一本书和范围评价。");
  const result = await query({ command: "review_get", reviewId });
  const review = result.review || result.fullReview || result.data?.review || result.data?.fullReview || result;
  const sourceRange = review.sourceRange || {};
  const anchors = review.sourceAnchors || {};
  const chunkIds = (anchors.chunkIds || []).filter(Boolean);
  const startChunkId = sourceRange.startChunkId || anchors.startChunkId || chunkIds[0] || review.startChunkId || state.selectedChunkId;
  const endChunkId = sourceRange.endChunkId || anchors.endChunkId || chunkIds.at(-1) || review.endChunkId || startChunkId;
  $("planForm").elements.mode.value = "interest_trail";
  $("planForm").elements.query.value = reviewFollowUpQuery(review);
  $("planForm").elements.startChunkId.value = startChunkId || "";
  $("planForm").elements.endChunkId.value = endChunkId || "";
  renderPlanRangeStatus();
  const payload = buildPlanCreatePayload(selected, new FormData($("planForm")));
  const packet = {
    type: "review-to-plan-params",
    reviewId: review.reviewId || reviewId,
    bookId: review.bookId || selected.bookId,
    sourceRange: sourceRange,
    sourceAnchors: anchors,
    followUp: {
      query: payload.query || "",
      nextActions: review.nextActions || [],
      questions: review.questions || [],
    },
    payload,
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已填入评价后续计划: ${review.reviewId || reviewId}`);
}

async function copyReviewFollowUpDecision(reviewId) {
  const selected = activeBook();
  if (!selected || !reviewId) throw new Error("请先选择一本书和范围评价。");
  const result = await query({ command: "review_get", reviewId });
  const review = result.review || result.fullReview || result.data?.review || result.data?.fullReview || result;
  const sourceRange = review.sourceRange || {};
  const anchors = review.sourceAnchors || {};
  const chunkIds = (anchors.chunkIds || []).filter(Boolean);
  const startChunkId = sourceRange.startChunkId || anchors.startChunkId || chunkIds[0] || review.startChunkId || state.selectedChunkId;
  const endChunkId = sourceRange.endChunkId || anchors.endChunkId || chunkIds.at(-1) || review.endChunkId || startChunkId;
  const queryText = reviewFollowUpQuery(review);
  const createPlan = {
    command: "plan_create",
    bookId: review.bookId || selected.bookId,
    mode: "interest_trail",
    startChunkId,
    endChunkId,
    query: queryText || undefined,
    budget: { maxChunksPerStep: 2, maxAnnotationsPerChunk: 2 },
    annotationDensity: "medium",
    sinkPolicy: { requireApproval: true, obsidian: true },
    createdBy: "CoReadingSidecar",
  };
  const createSinkPreview = {
    command: "sink_preview_create",
    reviewId: review.reviewId || reviewId,
    requireApproval: true,
    vaultPath: $("vaultPath").value || undefined,
    createdBy: "CoReadingSidecar",
  };
  const packet = {
    type: "review-follow-up-decision-packet",
    reviewGoal: "审阅已生成评价的后续动作，决定创建兴趣线索计划、创建 approval-gated 沉淀预览，或先回读评价内容。",
    book: {
      bookId: review.bookId || selected.bookId,
      title: selected.title || "",
      author: selected.author || "",
    },
    review: {
      reviewId: review.reviewId || reviewId,
      title: review.title || "",
      status: review.status || "",
      summary: review.summary || "",
      observations: review.observations || [],
      questions: review.questions || [],
      nextActions: review.nextActions || [],
      quotes: review.quotes || [],
    },
    rangeEvidence: rangeEvidencePacket(startChunkId, endChunkId, "review-follow-up-range"),
    payloads: {
      createPlan,
      createSinkPreview,
      getReview: { command: "review_get", reviewId: review.reviewId || reviewId },
    },
    nextStepGuide: [
      queryText ? "如 follow-up query 贴合评价问题，可创建 payloads.createPlan。" : "评价缺少后续问题，先回读 review 再补 query。",
      "如 summary/observations 已足够稳定，可创建沉淀预览，批准前不要写入 Obsidian/OBS。",
      "如 rangeEvidence 与评价范围不一致，先回读 review_get 并重新生成评价。",
    ],
    requiredChecks: [
      "确认 review.status 允许继续使用。",
      "确认 nextActions/questions 来自评价内容，不是空泛续写。",
      "确认 rangeEvidence 没有跨过不相关章节。",
      "确认 createSinkPreview.requireApproval=true。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      mayCreatePlan: Boolean(queryText),
      mayCreateSinkPreview: true,
      productRuntimeAgent: "Nova",
    },
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已复制评价后续决策包: ${review.reviewId || reviewId}`);
  return packet;
}

async function fillReviewFromAnnotationLike(item, sourceType) {
  const selected = activeBook();
  if (!selected || !item) throw new Error("当前没有可填入评价的段落评注。");
  const chunkId = item.chunkId || state.selectedChunkId;
  $("reviewForm").elements.startChunkId.value = chunkId || "";
  $("reviewForm").elements.endChunkId.value = chunkId || "";
  $("reviewForm").elements.summary.value = item.note || item.text || "";
  $("reviewForm").elements.observations.value = [
    item.quote ? `引用: ${item.quote}` : "",
    `来源: ${sourceType}`,
    item.kind ? `类型: ${item.kind}` : "",
    item.author ? `作者: ${item.author}` : "",
  ].filter(Boolean).join("\n");
  renderReviewRangeStatus();
  const payload = buildReviewCreatePayload(selected, new FormData($("reviewForm")));
  const packet = {
    type: "annotation-to-review-params",
    sourceType,
    book: selected.title || selected.bookId,
    source: {
      chunkId,
      quote: item.quote || "",
      note: item.note || item.text || "",
      raw: item,
    },
    payload,
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已填入评注评价参数: ${chunkId || ""}`);
}

async function fillReviewFromCard(cardId) {
  const selected = activeBook();
  const card = findCardSummary(cardId) || (state.selectedCard?.id === cardId ? state.selectedCard : null);
  if (!selected || !card) throw new Error("当前没有可填入评价的阅读卡片。");
  const chunkId = card.chunkId || state.selectedChunkId;
  $("reviewForm").elements.startChunkId.value = chunkId || "";
  $("reviewForm").elements.endChunkId.value = chunkId || "";
  $("reviewForm").elements.summary.value = card.note || card.message || card.title || card.kicker || "";
  $("reviewForm").elements.observations.value = [
    `来源: reading-card`,
    `cardId: ${card.id || cardId}`,
    card.title ? `标题: ${card.title}` : "",
    card.kicker ? `题签: ${card.kicker}` : "",
    card.quote ? `引用: ${card.quote}` : "",
  ].filter(Boolean).join("\n");
  renderReviewRangeStatus();
  const payload = buildReviewCreatePayload(selected, new FormData($("reviewForm")));
  const packet = {
    type: "card-to-review-params",
    cardId: card.id || cardId,
    bookId: selected.bookId,
    source: {
      chunkId,
      title: card.title || "",
      quote: card.quote || "",
      note: card.note || card.message || "",
      raw: card,
    },
    payload,
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  setCardDigestStatus(`已填入卡片评价参数：${card.title || card.kicker || cardId}`);
}

function renderAnnotations() {
  const list = $("annotationList");
  $("annotationCount").textContent = String(state.annotations.length);
  if (!state.annotations.length) {
    list.className = "annotation-list empty";
    list.textContent = "暂无边注";
    return;
  }
  list.className = "annotation-list";
  list.innerHTML = state.annotations
    .map((item, index) => {
      const quote = item.quote ? `<blockquote>${escapeHtml(item.quote)}</blockquote>` : "";
      const footprintId = noteFingerprint({ ...item, source: "annotation", index });
      return `<article class="annotation-row"><strong>${escapeHtml(item.author || "reader")} · ${escapeHtml(item.kind || "annotation")}</strong>${quote}<p>${escapeHtml(item.note || "")}</p><button class="secondary" type="button" data-footprint-id="${escapeHtml(footprintId)}">定位原文</button><button class="secondary" data-action="copy-annotation" data-index="${index}">复制边注</button><button class="secondary" data-action="fill-review-from-annotation" data-index="${index}">填入评价</button></article>`;
    })
    .join("");
}

function renderUserNotes() {
  const list = $("userNoteList");
  $("userNoteCount").textContent = String(state.userNotes.length);
  if (!state.userNotes.length) {
    list.className = "annotation-list empty";
    list.textContent = "暂无用户笔记";
    return;
  }
  list.className = "annotation-list";
  list.innerHTML = state.userNotes
    .map((item, index) => {
      const quote = item.quote ? `<blockquote>${escapeHtml(item.quote)}</blockquote>` : "";
      const footprintId = noteFingerprint({ ...item, source: "user-note", index });
      return `<article class="annotation-row user-note"><strong>我 · ${escapeHtml(item.kind || "note")} · ${escapeHtml(item.status || "open")}</strong>${quote}<p>${escapeHtml(item.note || "")}</p><button class="secondary" type="button" data-footprint-id="${escapeHtml(footprintId)}">定位原文</button><button class="secondary" data-action="copy-user-note" data-index="${index}">复制笔记</button><button class="secondary" data-action="fill-review-from-user-note" data-index="${index}">填入评价</button></article>`;
    })
    .join("");
}

function renderSubmissions() {
  const list = $("submissionList");
  if (!state.submissions.length) {
    list.className = "submission-list empty";
    list.textContent = "暂无提交批次";
    return;
  }
  list.className = "submission-list";
  list.innerHTML = state.submissions
    .map((item) => {
      const title = `${item.count || 0} 条 · ${item.contextMode || "context"}`;
      return `<article class="submission-row"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(item.id || "")} · ${escapeHtml(item.submittedAt || "")}</small><button class="secondary" data-action="submission" data-id="${escapeHtml(item.id || "")}">查看</button><button class="secondary" data-action="copy-submission" data-id="${escapeHtml(item.id || "")}">复制提交</button></article>`;
    })
    .join("");
}

function currentChunkText() {
  const current = state.currentChunk;
  const chunk = current?.chunk || current || {};
  return String(current?.text || chunk.text || "");
}

function selectedQuote() {
  if (state.readerSelection?.text) return state.readerSelection;
  const selection = window.getSelection?.();
  const text = selection ? String(selection.toString() || "").trim() : "";
  if (!selection || !text) return { text: "", offset: null };
  const chunkText = $("chunkText");
  const anchorInsideReader = selection.anchorNode && chunkText.contains(selection.anchorNode);
  const focusInsideReader = selection.focusNode && chunkText.contains(selection.focusNode);
  const sourceText = currentChunkText();
  const offset = anchorInsideReader && focusInsideReader ? sourceText.indexOf(text) : -1;
  return { text: text.slice(0, 500), offset: offset >= 0 ? offset : null };
}

function liveSelectedQuote() {
  const selection = window.getSelection?.();
  const text = selection ? String(selection.toString() || "").trim() : "";
  if (!selection || !text) return { text: "", offset: null };
  const chunkText = $("chunkText");
  const anchorInsideReader = selection.anchorNode && chunkText.contains(selection.anchorNode);
  const focusInsideReader = selection.focusNode && chunkText.contains(selection.focusNode);
  if (!anchorInsideReader || !focusInsideReader) return { text: "", offset: null };
  const sourceText = currentChunkText();
  const offset = sourceText.indexOf(text);
  return { text: text.slice(0, 500), offset: offset >= 0 ? offset : null };
}

function renderSelectionDock() {
  const dock = $("selectionDock");
  if (!dock) return;
  const quote = state.readerSelection?.text || "";
  dock.hidden = !quote;
  $("selectionDockQuote").textContent = quote ? quote.slice(0, 180) : "未选择原文";
  $("selectionAskNovaBtn").disabled = !quote;
  $("selectionEntityBtn").disabled = !quote;
  $("selectionNoteBtn").disabled = !quote;
  $("selectionAnnotateBtn").disabled = !quote;
  renderTrailGuide();
}

function captureReaderSelection() {
  const quote = liveSelectedQuote();
  if (!quote.text) return false;
  state.readerSelection = quote;
  renderSelectionDock();
  log(quote.offset === null ? "已选中原文。" : `已选中原文，offset=${quote.offset}。`);
  return true;
}

function clearReaderSelection() {
  state.readerSelection = { text: "", offset: null };
  window.getSelection?.().removeAllRanges?.();
  renderSelectionDock();
}

function clearEntityPeek() {
  state.entityPeek = null;
  renderEntityPeek();
}

function quotePayloadFromForm(form) {
  const selected = selectedQuote();
  const quote = String(form.get("quote") || "").trim() || selected.text;
  const sourceText = currentChunkText();
  const offset = selected.text && quote === selected.text ? selected.offset : sourceText.indexOf(quote);
  return { quote, quoteOffset: offset >= 0 ? offset : undefined };
}

function fillQuoteFromSelection(formId) {
  const form = $(formId);
  const quoteInput = form?.querySelector('textarea[name="quote"]');
  if (!form || !quoteInput) return;
  const selected = selectedQuote();
  if (!selected.text) {
    log("请先在原文范围里选中一小段文字。");
    return;
  }
  quoteInput.value = selected.text;
  quoteInput.focus();
  log(selected.offset === null ? "已填入选区引用。" : `已填入选区引用，offset=${selected.offset}。`);
}

function fillFormFromSelection(formId, focusName = "note") {
  fillQuoteFromSelection(formId);
  const form = $(formId);
  const target = form?.querySelector(`textarea[name="${focusName}"]`);
  if (target) {
    window.setTimeout(() => target.focus(), 120);
  }
}

function entityTermFromSelection() {
  const raw = state.readerSelection?.text || selectedQuote().text || "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}

function contextAroundSelection(term) {
  const text = currentChunkText();
  if (!text || !term) return "";
  const selected = selectedQuote();
  const offset = selected.offset ?? text.indexOf(term);
  const start = Math.max(0, (offset >= 0 ? offset : 0) - 180);
  const end = Math.min(text.length, (offset >= 0 ? offset + term.length : term.length) + 220);
  return text.slice(start, end).trim();
}

function openEntityPeek(term = entityTermFromSelection()) {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId || !term) return false;
  const chunk = state.currentChunk?.chunk || state.currentChunk || {};
  state.entityPeek = {
    term,
    bookId: selected.bookId,
    bookTitle: selected.title || selected.bookId,
    chunkId: state.selectedChunkId,
    chunkTitle: chunk.title || chunk.sectionTitle || state.selectedChunkId,
    context: contextAroundSelection(term),
  };
  renderEntityPeek();
  return true;
}

function renderEntityPeek() {
  const panel = $("entityPeek");
  if (!panel) return;
  const peek = state.entityPeek;
  panel.hidden = !peek;
  if (!peek) return;
  $("entityPeekTerm").textContent = peek.term;
  $("entityPeekMeta").textContent = `${peek.chunkId} · ${peek.chunkTitle || "当前段落"}`;
  $("entityPeekContext").textContent = peek.context || "当前段落里没有找到更长上下文。";
}

function closeEntityPeek() {
  state.entityPeek = null;
  renderEntityPeek();
}

function entityNovaPrompt() {
  const peek = state.entityPeek || {};
  return [
    `请只基于当前段落速查“${peek.term || entityTermFromSelection()}”。`,
    "按三行回答：",
    "1. 它在此处可能是谁/什么；",
    "2. 本段给出的直接证据；",
    "3. 如果要继续读，下一步该追哪条线索。",
    "",
    "不要使用未给出的后文信息。"
  ].join("\n");
}

function buildNovaPromptFromSelection() {
  const quote = selectedQuote();
  if (!quote.text) return "请帮我读这一段：重点是什么？哪一句值得停留？我下一步该往哪看？";
  return `请解释这段选区，并告诉我它和当前段落的关系：\n\n${quote.text}`;
}

function currentNovaContext(selected, chunk, text, quote) {
  const index = chunkOrder(state.selectedChunkId);
  return {
    coReadingContextVersion: "2026-06-selection-dock",
    contextMode: quote?.text ? "chunk+selection" : "chunk",
    runtimeAgent: "Nova",
    productMode: "single-agent-reader",
    bookId: selected.bookId,
    bookTitle: selected.title || selected.bookId,
    chunkId: state.selectedChunkId,
    chunkTitle: chunk.title || chunk.sectionTitle || state.selectedChunkId,
    chunkPosition: index === null ? "" : `${index + 1}/${state.chunks.length}`,
    text,
    selection: quote?.text || "",
    selectionOffset: quote?.offset ?? null,
    instructionBoundary: "只基于当前 chunk、选区和显式传入的上下文回应；不要依赖服务端主题提示词已加载工具占位符。"
  };
}

function trailGuideQuery() {
  const quote = state.readerSelection?.text || selectedQuote().text || "";
  const search = $("searchInput")?.value?.trim() || "";
  const current = state.currentChunk?.chunk || state.currentChunk || {};
  return (quote || search || current.title || current.sectionTitle || state.selectedChunkId || "").trim().slice(0, 120);
}

function renderTrailGuide() {
  const step = $("trailGuideStep");
  const title = $("trailGuideTitle");
  const meta = $("trailGuideMeta");
  const backtrack = $("trailGuideBacktrackBtn");
  const open = $("trailGuideOpenBtn");
  const plan = $("trailGuidePlanBtn");
  const sink = $("trailGuideSinkBtn");
  if (!step || !title || !meta || !backtrack || !open || !plan || !sink) return;
  const evidence = state.backtrackEvidence;
  const query = trailGuideQuery();
  backtrack.disabled = !activeBook() || !state.selectedChunkId;
  if (!evidence) {
    step.textContent = "兴趣回溯";
    title.textContent = query ? `追线索：${query}` : "追当前段落里的线索";
    meta.textContent = "选中原文会作为线索；没有选区时使用搜索框或当前标题。";
    open.disabled = true;
    plan.disabled = true;
    sink.disabled = true;
    return;
  }
  const ranges = evidence.evidence?.rangeSummaries || [];
  const anchors = evidence.evidence?.anchorSnippets || [];
  const firstRange = ranges[0] || {};
  step.textContent = `${anchors.length} 个锚点 · ${ranges.length} 组范围`;
  title.textContent = evidence.evidence?.title || `兴趣点回溯: ${evidence.query || query}`;
  meta.textContent = firstRange.label
    ? `首个范围 ${firstRange.label} · 覆盖 ${(firstRange.chunkIds || []).length} chunks`
    : `覆盖 ${(evidence.chunkIds || []).length} chunks`;
  open.disabled = !firstRange.startChunkId && !(evidence.chunkIds || []).length;
  plan.disabled = !ranges.length;
  sink.disabled = !ranges.length;
}

function renderSearchResults() {
  const list = $("searchResults");
  if (!state.searchResults.length) {
    list.className = "search-results empty";
    list.textContent = "暂无搜索结果";
    $("copySearchResultsBtn").disabled = true;
    return;
  }
  $("copySearchResultsBtn").disabled = false;
  list.className = "search-results";
  list.innerHTML = "";
  for (const item of state.searchResults) {
    const chunkId = item.chunkId || item.id || item.chunk?.id || "";
    const row = document.createElement("article");
    row.className = "search-row";
    row.dataset.chunkId = chunkId;
    row.innerHTML = `
      <button class="search-open secondary" type="button" data-action="open-search" data-chunk-id="${escapeHtml(chunkId)}">
        <strong>${escapeHtml(chunkId)} · ${escapeHtml(item.title || item.chunk?.title || "")}</strong>
        <small>${escapeHtml(item.snippet || item.text || "")}</small>
      </button>
      <button class="secondary" type="button" data-action="backtrack-search" data-chunk-id="${escapeHtml(chunkId)}">回溯</button>
    `;
    list.appendChild(row);
  }
}

function renderBacktrackEvidence() {
  const panel = $("backtrackEvidence");
  if (!panel) return;
  const evidence = state.backtrackEvidence;
  if (!evidence) {
    panel.className = "backtrack-evidence empty";
    panel.textContent = "暂无回溯证据";
    renderTrailGuide();
    return;
  }
  const ranges = evidence.evidence?.rangeSummaries || [];
  const anchors = evidence.evidence?.anchorSnippets || [];
  panel.className = "backtrack-evidence";
  panel.innerHTML = `
    <strong>${escapeHtml(evidence.evidence?.title || "兴趣点回溯")}</strong>
    <small>锚点 ${escapeHtml(anchors.length)} · 范围 ${escapeHtml(ranges.length)} · chunks ${escapeHtml(evidence.chunkIds?.length || 0)}</small>
    <pre>${escapeHtml(evidence.evidenceMarkdown || "")}</pre>
    <button class="secondary" type="button" data-action="copy-backtrack-evidence">复制回溯</button>
    <button class="secondary" type="button" data-action="fill-plan-from-backtrack">填入计划</button>
    <button class="secondary" type="button" data-action="copy-backtrack-card-decision">复制收藏决策</button>
    <button class="secondary" type="button" data-action="collect-backtrack-card">收藏回溯</button>
  `;
  renderTrailGuide();
}

async function copyBacktrackEvidence() {
  const selected = activeBook();
  const evidence = state.backtrackEvidence;
  if (!evidence) throw new Error("当前没有可复制的回溯证据。");
  const packet = backtrackDecisionPacket(selected, evidence);
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已复制兴趣点回溯决策包: ${evidence.query || evidence.anchorChunkId || ""}`);
}

function backtrackDecisionPacket(selected, evidence) {
  const ranges = evidence.evidence?.rangeSummaries || [];
  const anchors = evidence.evidence?.anchorSnippets || [];
  const chunkIds = (evidence.chunkIds || []).filter(Boolean);
  const firstRange = ranges[0] || {};
  const lastRange = ranges[ranges.length - 1] || firstRange;
  const startChunkId = firstRange.startChunkId || chunkIds[0] || evidence.anchorChunkId || state.selectedChunkId;
  const endChunkId = lastRange.endChunkId || chunkIds[chunkIds.length - 1] || startChunkId;
  const planPayload = selected ? buildPlanCreatePayload(selected, new FormData($("planForm"))) : null;
  if (planPayload) {
    planPayload.mode = "interest_trail";
    planPayload.query = evidence.query || $("searchInput").value.trim() || undefined;
    planPayload.startChunkId = startChunkId || undefined;
    planPayload.endChunkId = endChunkId || undefined;
  }
  const sinkPayload = selected
    ? {
        ...backtrackPayload(selected.bookId, evidence.anchorChunkId || state.selectedChunkId),
        command: "sink_preview_create_from_backtrack",
        targets: ["obsidian"],
        requireApproval: true,
      }
    : null;
  return {
    type: "backtrack-decision-packet",
    reviewGoal: "审阅兴趣点回溯证据，决定生成后续计划、转成沉淀预览、收藏为卡片，或先调整 query/window。",
    book: {
      bookId: selected?.bookId || evidence.bookId || "",
      title: selected?.title || "",
      author: selected?.author || "",
    },
    query: evidence.query || "",
    anchorChunkId: evidence.anchorChunkId || "",
    chunkIds,
    ranges: ranges.map((range) => ({
      label: range.label || "",
      startChunkId: range.startChunkId || "",
      endChunkId: range.endChunkId || "",
      chunkIds: range.chunkIds || [],
    })),
    anchors: anchors.map((item) => ({
      chunkId: item.chunkId || "",
      snippet: String(item.snippet || "").slice(0, 360),
    })),
    evidenceMarkdown: String(evidence.evidenceMarkdown || "").slice(0, 2400),
    payloads: {
      createPlan: planPayload,
      createSinkPreview: sinkPayload,
    },
    nextStepGuide: [
      "如回溯证据覆盖了真实兴趣线索，使用 payloads.createPlan 生成后续阅读计划。",
      "如回溯证据本身值得沉淀，使用 payloads.createSinkPreview 生成 approval-gated 预览。",
      "如 anchors/snippets 太弱，先调整 query/window 后重新回溯。",
    ],
    requiredChecks: [
      "确认 ranges 覆盖的 chunk 与兴趣点相关。",
      "确认 anchors 的 snippet 足以支撑 query。",
      "确认 createPlan 的 start/end chunk 没有跨过无关章节。",
      "确认 createSinkPreview 仍需 approval，不会直接写入 Obsidian。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      createsPlan: Boolean(planPayload),
      createsSinkPreview: Boolean(sinkPayload),
      productRuntimeAgent: "Nova",
    },
  };
}

function backtrackCardPayload(selected, evidence) {
  const chunkId = evidence.anchorChunkId || evidence.chunkIds?.[0] || state.selectedChunkId;
  const title = evidence.evidence?.title || `兴趣点回溯: ${evidence.query || chunkId}`;
  const quote = (evidence.evidence?.anchorSnippets || [])
    .map((item) => item.snippet || item.chunkId)
    .filter(Boolean)
    .slice(0, 3)
    .join("\n---\n");
  return {
    command: "collect_card",
    bookId: selected.bookId,
    chunkId,
    title,
    quote: quote || title,
    note: evidence.evidenceMarkdown || `回溯 chunks: ${(evidence.chunkIds || []).join(", ")}`,
    kicker: "收起一条回溯线索",
    art: "ripple",
    source: "backtrack",
  };
}

function backtrackCardDecisionPacket(selected, evidence) {
  const payload = backtrackCardPayload(selected, evidence);
  return {
    type: "backtrack-card-decision-packet",
    reviewGoal: "审阅兴趣点回溯是否值得收藏为阅读卡片，决定收藏、先调整回溯，或改为生成计划/沉淀预览。",
    book: {
      bookId: selected.bookId,
      title: selected.title || "",
      author: selected.author || "",
    },
    query: evidence.query || "",
    anchorChunkId: evidence.anchorChunkId || "",
    chunkIds: (evidence.chunkIds || []).filter(Boolean),
    evidencePreview: String(evidence.evidenceMarkdown || "").slice(0, 1600),
    payloads: {
      collectCard: payload,
      copyBacktrackDecision: backtrackDecisionPacket(selected, evidence),
    },
    nextStepGuide: [
      "如 evidencePreview 足以代表一条可复用兴趣线索，可审 payloads.collectCard。",
      "如 quote 太弱或 chunkId 不准，先调整 query/window 后重新回溯。",
      "收藏后可从卡片决策包继续审阅评价、计划或沉淀预览。",
    ],
    requiredChecks: [
      "确认 chunkId 指向回溯锚点或最相关 chunk。",
      "确认 quote/note 不只是搜索噪声。",
      "确认收藏卡片只是创建卡片，不写入 Obsidian/OBS。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      createsCard: true,
      doesNotCreateSinkPreview: true,
      productRuntimeAgent: "Nova",
    },
  };
}

async function fillPlanFromBacktrackEvidence() {
  const selected = activeBook();
  const evidence = state.backtrackEvidence;
  if (!selected || !evidence) throw new Error("当前没有可填入计划的回溯证据。");
  const chunkIds = (evidence.chunkIds || []).filter(Boolean);
  const ranges = evidence.evidence?.rangeSummaries || [];
  const firstRange = ranges[0] || {};
  const lastRange = ranges[ranges.length - 1] || firstRange;
  const startChunkId = firstRange.startChunkId || chunkIds[0] || evidence.anchorChunkId || state.selectedChunkId;
  const endChunkId = lastRange.endChunkId || chunkIds[chunkIds.length - 1] || startChunkId;
  $("planForm").elements.mode.value = "interest_trail";
  $("planForm").elements.query.value = evidence.query || $("searchInput").value.trim();
  $("planForm").elements.startChunkId.value = startChunkId || "";
  $("planForm").elements.endChunkId.value = endChunkId || "";
  renderPlanRangeStatus();
  const payload = buildPlanCreatePayload(selected, new FormData($("planForm")));
  const packet = {
    type: "backtrack-to-plan-params",
    book: selected.title || selected.bookId,
    source: {
      query: evidence.query || "",
      anchorChunkId: evidence.anchorChunkId || "",
      chunkIds,
    },
    payload,
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已填入回溯计划参数: ${payload.query || payload.startChunkId || ""}`);
}

function prepareBacktrackFromCard(card, selected) {
  const queryText = [card.title, card.kicker, card.message, card.note]
    .filter(Boolean)
    .map((text) => String(text).trim())
    .find(Boolean) || card.id || "";
  $("searchInput").value = queryText;
  if (card.chunkId) {
    state.selectedChunkId = card.chunkId;
    $("chunkSelect").value = card.chunkId;
    renderChunkNavigation();
  }
  return backtrackPayload(selected.bookId, card.chunkId || state.selectedChunkId);
}

async function collectBacktrackCard() {
  const selected = activeBook();
  const evidence = state.backtrackEvidence;
  if (!selected || !evidence) return;
  try {
    const result = await command(backtrackCardPayload(selected, evidence));
    state.selectedCard = result.data?.id ? result.data : null;
    await loadCards(selected.bookId);
    renderCards();
    log(result.raw || result.data || result);
  } catch (error) {
    log(error.message || String(error));
  }
}

function renderPlans() {
  const selected = activeBook();
  const plans = (state.snapshot?.plans || []).filter((plan) => !selected || plan.bookId === selected.bookId);
  $("activePlanCount").textContent = `${plans.length} active`;
  const list = $("planList");
  if (!plans.length) {
    list.className = "plan-list empty";
    list.textContent = "暂无计划";
    return;
  }
  list.className = "plan-list";
  list.innerHTML = "";
  for (const plan of plans) {
    const runner = runnerForPlan(plan.planId);
    const runnerStatus = runner?.status || "idle";
    const runnerActive = ["running", "waiting"].includes(runnerStatus);
    const runnerError = runner?.lastError?.message || runner?.lastResult?.runner?.error?.message || "";
    const row = document.createElement("article");
    row.className = `plan-row ${runnerStatus === "error" ? "runner-error" : ""}`.trim();
    const counts = Object.entries(plan.statusCounts || {})
      .map(([key, value]) => `<span class="chip">${escapeHtml(key)} ${value}</span>`)
      .join("");
    const runnerLine = runnerStatus !== "idle"
      ? `<div class="plan-runner ${runnerStatus === "error" ? "runner-error-text" : ""}">
          后台 ${escapeHtml(runnerStatus)} · tick ${escapeHtml(runner.tickCount || 0)} · done ${escapeHtml(runner.executedCount || 0)}
          ${runner.maxRetries ? ` · retry ${escapeHtml(runner.retryCount || 0)}/${escapeHtml(runner.maxRetries)}` : ""}
          ${runner.stoppedReason ? ` · ${escapeHtml(runner.stoppedReason)}` : ""}
          ${runner.nextRunAt ? ` · next ${escapeHtml(runner.nextRunAt)}` : ""}
          ${runnerError ? `<small>${escapeHtml(runnerError)}</small>` : ""}
        </div>`
      : "";
    row.innerHTML = `
      <header>
        <div><strong>${escapeHtml(plan.title || plan.planId)}</strong><small>${escapeHtml(plan.mode)} · ${escapeHtml(plan.status)} · ${plan.currentStepIndex || 0}/${plan.stepCount || 0}</small></div>
        <div class="plan-actions">
          <button class="secondary" data-action="copy-plan-next-decision" data-id="${escapeHtml(plan.planId)}">复制下一步决策</button>
          <button class="secondary" data-action="next" data-id="${escapeHtml(plan.planId)}">下一步</button>
          <button class="secondary" data-action="copy-plan-execute-decision" data-id="${escapeHtml(plan.planId)}">复制执行决策</button>
          <button data-action="execute" data-id="${escapeHtml(plan.planId)}">执行一步</button>
          <button class="secondary" data-action="copy-plan-run-decision" data-id="${escapeHtml(plan.planId)}">复制运行决策</button>
          <button data-action="run" data-id="${escapeHtml(plan.planId)}" ${plan.status === "paused" || plan.status === "completed" ? "disabled" : ""}>运行3步</button>
          <button data-action="runner-start" data-id="${escapeHtml(plan.planId)}" ${runnerActive || plan.status === "paused" || plan.status === "completed" ? "disabled" : ""}>后台跑</button>
          <button class="secondary" data-action="copy-runner-decision" data-id="${escapeHtml(plan.planId)}">复制后台决策</button>
          <button class="secondary" data-action="runner-stop" data-id="${escapeHtml(plan.planId)}" ${runnerActive ? "" : "disabled"}>停止后台</button>
          <button class="secondary" data-action="runner-retry" data-id="${escapeHtml(plan.planId)}" ${runnerStatus === "error" ? "" : "disabled"}>重试</button>
          <button class="secondary" data-action="copy-plan-status" data-id="${escapeHtml(plan.planId)}">复制状态</button>
          <button class="secondary" data-action="copy-plan-next-step" data-id="${escapeHtml(plan.planId)}">复制下一步</button>
          <button class="secondary" data-action="copy-plan-artifacts" data-id="${escapeHtml(plan.planId)}">复制工件</button>
          <button class="secondary" data-action="open-plan-artifact" data-id="${escapeHtml(plan.planId)}">打开工件</button>
          <button class="secondary" data-action="fill-review-from-plan-next-step" data-id="${escapeHtml(plan.planId)}">填入评价</button>
          <button class="secondary" data-action="copy-plan-status-decision" data-id="${escapeHtml(plan.planId)}">复制状态决策</button>
          <button class="secondary" data-action="pause" data-id="${escapeHtml(plan.planId)}" ${plan.status === "paused" || plan.status === "completed" ? "disabled" : ""}>暂停</button>
          <button class="secondary" data-action="resume" data-id="${escapeHtml(plan.planId)}" ${plan.status !== "paused" ? "disabled" : ""}>恢复</button>
        </div>
      </header>
      <div class="meter"><span style="width:${planPercent(plan)}%"></span></div>
      <div class="chips">${counts}</div>
      ${runnerLine}
    `;
    list.appendChild(row);
  }
}

function runnerForPlan(planId) {
  return state.backgroundRunners.find((runner) => runner.planId === planId) || { planId, status: "idle" };
}

async function fillReviewFromPlanNextStep(planId) {
  const selected = activeBook();
  if (!selected) throw new Error("请先选择一本书。");
  const result = await query({ command: "plan_get", planId });
  const plan = result.plan || {};
  const nextStep = result.nextStep || null;
  if (!nextStep) throw new Error("该计划没有可填入评价的下一步。");
  const chunkIds = (nextStep.chunkIds || []).filter(Boolean);
  const startChunkId = nextStep.startChunkId || chunkIds[0] || state.selectedChunkId;
  const endChunkId = nextStep.endChunkId || chunkIds.at(-1) || startChunkId;
  $("reviewForm").elements.startChunkId.value = startChunkId || "";
  $("reviewForm").elements.endChunkId.value = endChunkId || "";
  $("reviewForm").elements.summary.value = [
    nextStep.title || nextStep.stepId || "计划下一步",
    nextStep.query ? `关注点: ${nextStep.query}` : "",
  ].filter(Boolean).join("\n");
  $("reviewForm").elements.observations.value = [
    `来源计划: ${plan.planId || planId}`,
    `计划标题: ${plan.title || ""}`,
    `步骤: ${nextStep.stepId || ""}`,
    `类型: ${nextStep.type || ""}`,
    nextStep.query ? `查询: ${nextStep.query}` : "",
    chunkIds.length ? `chunks: ${chunkIds.join(", ")}` : "",
  ].filter(Boolean).join("\n");
  renderReviewRangeStatus();
  const payload = buildReviewCreatePayload(selected, new FormData($("reviewForm")));
  const packet = {
    type: "plan-next-step-to-review-params",
    planId: plan.planId || planId,
    bookId: plan.bookId || selected.bookId,
    nextStep,
    payload,
    suggestedCommands: result.suggestedCommands || [],
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已填入计划下一步评价: ${nextStep.stepId || planId}`);
}

async function openQueueCard(cardId) {
  const card = findCardSummary(cardId);
  if (!card) throw new Error("没有找到这张阅读卡片。");
  $("cardSinkDrawer").open = true;
  state.selectedCard = card;
  state.selectedCardSaveResult = state.cardSaveResults[cardId] || null;
  renderCards();
  focusPanel(".card-detail", "#cardPreview");
  log(`已打开阅读卡片: ${card.message || card.title || card.id}`);
}

async function openQueueSink(previewId) {
  $("cardSinkDrawer").open = true;
  state.selectedSinkPreview = await loadSinkPreview(previewId);
  state.selectedSinkDiff = null;
  renderSinkDetail();
  renderSinks();
  focusPanel(".sink-detail", "#sinkPreviewContent");
  log(`已打开待沉淀预览: ${previewId}`);
}

async function openFirstChunkReviewCard() {
  const card = cardsForCurrentChunk()[0];
  if (!card?.id) return;
  await openQueueCard(card.id);
}

async function openFirstChunkReviewSink() {
  const preview = sinkPreviewsForCurrentChunk()[0];
  if (!preview?.previewId) return;
  await openQueueSink(preview.previewId);
}

async function openBestSinkPreview() {
  const preview = visibleSinkPreviewsForBook(activeBook())[0] || null;
  if (!preview?.previewId) {
    $("cardSinkDrawer").open = true;
    state.selectedSinkPreview = null;
    renderSinkDetail();
    renderSinks();
    focusPanel(".sink-panel", "#sinkList");
    log("当前书暂无沉淀预览。");
    return;
  }
  await openQueueSink(preview.previewId);
}

async function openQueuePlan(planId) {
  $("planReviewDrawer").open = true;
  await fillReviewFromPlanNextStep(planId);
  focusPanel("#reviewForm", '#reviewForm textarea[name="summary"]');
}

async function openPlanGuideRange() {
  const { nextStep } = planGuideSelection();
  if (!nextStep) throw new Error("当前没有可打开的计划下一步。");
  const targetChunkId = nextStep.chunkIds?.[0] || nextStep.range?.startChunkId || nextStep.startChunkId;
  if (!targetChunkId) throw new Error("计划下一步没有可打开的 chunk。");
  const startChunkId = nextStep.range?.startChunkId || targetChunkId;
  const endChunkId = nextStep.range?.endChunkId || nextStep.chunkIds?.at(-1) || targetChunkId;
  await selectChunk(targetChunkId, true);
  const startInput = document.querySelector('#reviewForm input[name="startChunkId"]');
  const endInput = document.querySelector('#reviewForm input[name="endChunkId"]');
  if (startInput) startInput.value = startChunkId;
  if (endInput) endInput.value = endChunkId;
  renderReviewRangeStatus();
  focusPanel(".reader-surface", "#chunkText");
  log(`已打开计划范围: ${planStepChunkLabel(nextStep) || targetChunkId}`);
}

async function reviewPlanGuideStep() {
  const { plan } = planGuideSelection();
  if (!plan) throw new Error("当前没有活跃计划。");
  $("planReviewDrawer").open = true;
  await fillReviewFromPlanNextStep(plan.planId);
  focusPanel("#reviewForm", '#reviewForm textarea[name="summary"]');
}

async function openPlanGuideFull() {
  const { plan } = planGuideSelection();
  if (!plan) throw new Error("当前没有活跃计划。");
  $("planReviewDrawer").open = true;
  focusPanel("#planList", "#planList");
  log(`已打开完整计划: ${plan.title || plan.planId}`);
}

function planExecutionArtifactPacket(planId, result, plan = {}) {
  const data = result?.data || result?.raw || result || {};
  const runs = data.runs || (data.executedStep ? [data.executedStep.result || data.executedStep] : []);
  const reviewIds = [
    data.review?.reviewId,
    data.execution?.review?.reviewId,
    data.executedStep?.result?.reviewId,
    ...runs.map((run) => run.reviewId),
  ].filter(Boolean);
  const sinkPreviewIds = [
    previewIdFromResult(data),
    ...(data.sinkPreviews || []).map((preview) => preview.previewId),
    ...(data.executedStep?.result?.sinkPreviewIds || []),
    ...runs.flatMap((run) => run.sinkPreviewIds || []),
  ].filter(Boolean);
  return {
    type: "plan-execution-artifacts",
    planId,
    plan: {
      title: plan.title || data.plan?.title || "",
      mode: plan.mode || data.plan?.mode || "",
      status: plan.status || data.plan?.status || "",
      currentStepIndex: plan.currentStepIndex || data.plan?.currentStepIndex || 0,
      stepCount: plan.stepCount || data.plan?.stepCount || 0,
    },
    executedStep: data.executedStep || null,
    reviewIds: Array.from(new Set(reviewIds)),
    sinkPreviewIds: Array.from(new Set(sinkPreviewIds)),
    nextStep: data.nextStep || data.recorded?.nextStep || null,
    raw: data,
  };
}

async function copyPlanExecutionArtifacts(planId, result) {
  const plan = (state.snapshot?.plans || []).find((item) => item.planId === planId) || {};
  const packet = planExecutionArtifactPacket(planId, result, plan);
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已复制计划执行工件: ${planId}`);
  return packet;
}

async function copyPlanExecuteDecision(planId) {
  const result = await query({ command: "plan_get", planId });
  const plan = result.plan || {};
  const nextStep = result.nextStep || null;
  const chunkIds = (nextStep?.chunkIds || []).filter(Boolean);
  const startChunkId = nextStep?.startChunkId || chunkIds[0] || state.selectedChunkId;
  const endChunkId = nextStep?.endChunkId || chunkIds.at(-1) || startChunkId;
  const packet = {
    type: "plan-execute-decision-packet",
    reviewGoal: "审阅计划下一步执行风险，决定执行一步、先填入评价，或调整/暂停计划。",
    planId: plan.planId || planId,
    title: plan.title || "",
    status: plan.status || "",
    mode: plan.mode || "",
    progress: {
      currentStepIndex: plan.currentStepIndex || 0,
      stepCount: (plan.steps || []).length || plan.stepCount || 0,
    },
    nextStep,
    rangeEvidence: nextStep ? rangeEvidencePacket(startChunkId, endChunkId, "plan-next-step-range") : null,
    payloads: {
      executeStep: { command: "plan_execute_step", planId },
      claimNextStep: { command: "plan_next_step", planId, claim: true },
    },
    expectedArtifacts: ["review", "sinkPreview", "annotations"].filter(Boolean),
    nextStepGuide: [
      nextStep ? "如 rangeEvidence 与 nextStep 目标一致，可执行 payloads.executeStep。" : "当前计划没有 nextStep，先刷新计划或检查是否完成。",
      nextStep ? "如要先人工评价，可把 nextStep 填入评价表单再生成预览。" : "",
      plan.status === "paused" ? "计划已暂停，执行前应先恢复。" : "",
    ].filter(Boolean),
    requiredChecks: [
      "确认 plan.status 允许继续执行。",
      "确认 nextStep.query/title 与当前阅读目标一致。",
      "确认 rangeEvidence 没有跨过不相关章节。",
      "确认执行后的沉淀预览仍需 approval，不会直接写入 Obsidian/OBS。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      executesPlanStep: Boolean(nextStep),
      mayCreateReview: true,
      mayCreateSinkPreview: true,
      productRuntimeAgent: "Nova",
    },
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已复制计划执行决策包: ${plan.planId || planId}`);
  return packet;
}

async function copyPlanNextDecision(planId) {
  const result = await query({ command: "plan_get", planId });
  const plan = result.plan || {};
  const nextStep = result.nextStep || null;
  const chunkIds = (nextStep?.chunkIds || []).filter(Boolean);
  const startChunkId = nextStep?.startChunkId || chunkIds[0] || state.selectedChunkId;
  const endChunkId = nextStep?.endChunkId || chunkIds.at(-1) || startChunkId;
  const packet = {
    type: "plan-next-decision-packet",
    reviewGoal: "审阅计划下一步认领风险，决定 claim nextStep、改为只复制上下文，或先暂停/调整计划。",
    planId: plan.planId || planId,
    title: plan.title || "",
    status: plan.status || "",
    mode: plan.mode || "",
    progress: {
      currentStepIndex: plan.currentStepIndex || 0,
      stepCount: (plan.steps || []).length || plan.stepCount || 0,
    },
    nextStep,
    suggestedCommands: result.suggestedCommands || [],
    rangeEvidence: nextStep ? rangeEvidencePacket(startChunkId, endChunkId, "plan-next-claim-range") : null,
    payloads: {
      claimNextStep: { command: "plan_next_step", planId, claim: true },
      getPlan: { command: "plan_get", planId },
      copyContextOnly: { command: "plan_next_step", planId, claim: false },
    },
    nextStepGuide: [
      nextStep ? "如 nextStep 范围和目标正确，可审 payloads.claimNextStep。" : "当前没有 nextStep，先刷新计划或检查是否完成。",
      plan.status === "paused" ? "计划已暂停，认领前应先恢复或只复制上下文。" : "",
      "如只想查看下一步而不改变计划状态，使用 copyContextOnly。",
    ].filter(Boolean),
    requiredChecks: [
      "确认 plan.status 允许认领下一步。",
      "确认 nextStep.query/title 与当前阅读目标一致。",
      "确认 rangeEvidence 没有跨过不相关章节。",
      "确认 claim 行为会改变计划推进状态，不等于只复制上下文。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      mutatesPlanProgress: Boolean(nextStep),
      doesNotCreateReview: true,
      doesNotCreateSinkPreview: true,
      productRuntimeAgent: "Nova",
    },
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已复制计划下一步决策包: ${plan.planId || planId}`);
  return packet;
}

async function copyPlanStatusDecision(planId) {
  const result = await query({ command: "plan_get", planId });
  const plan = result.plan || {};
  const nextStep = result.nextStep || null;
  const runner = runnerForPlan(planId);
  const packet = {
    type: "plan-status-decision-packet",
    reviewGoal: "审阅计划状态变更风险，决定暂停、恢复、维持当前状态，或先停止后台 runner。",
    planId: plan.planId || planId,
    title: plan.title || "",
    status: plan.status || "",
    mode: plan.mode || "",
    progress: {
      currentStepIndex: plan.currentStepIndex || 0,
      stepCount: (plan.steps || []).length || plan.stepCount || 0,
      statusCounts: plan.statusCounts || {},
    },
    nextStep,
    runner: runner
      ? {
          status: runner.status || "idle",
          tickCount: runner.tickCount || 0,
          executedCount: runner.executedCount || 0,
          retryCount: runner.retryCount || 0,
          maxRetries: runner.maxRetries || 0,
          lastError: runner.lastError || runner.lastResult?.runner?.error || null,
        }
      : { status: "idle" },
    payloads: {
      pause: { command: "plan_update", planId, status: "paused" },
      resume: { command: "plan_update", planId, status: "active" },
      getPlan: { command: "plan_get", planId },
      stopRunnerFirst: { planId },
    },
    nextStepGuide: [
      ["running", "waiting"].includes(runner?.status) ? "后台 runner 活动中，暂停/恢复前建议先 stopRunnerFirst。" : "",
      plan.status === "completed" ? "计划已完成，不应暂停或恢复。" : "",
      plan.status === "paused" ? "如要继续阅读，可审 payloads.resume。" : "如要冻结进度或避免批量产物，可审 payloads.pause。",
      nextStep ? "状态变更前确认 nextStep 不会丢失当前人工判断。" : "",
    ].filter(Boolean),
    requiredChecks: [
      "确认状态变更不会中断正在审阅的评价或沉淀预览。",
      "确认 runner 状态不是 running/waiting，或已决定先停止后台。",
      "确认暂停/恢复只是改变计划状态，不会执行阅读步骤。",
      "确认当前进度和 statusCounts 与预期一致。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      mutatesPlanStatus: true,
      doesNotExecutePlanStep: true,
      doesNotCreateSinkPreview: true,
      productRuntimeAgent: "Nova",
    },
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已复制计划状态决策包: ${plan.planId || planId}`);
  return packet;
}

async function copyPlanRunDecision(planId) {
  const result = await query({ command: "plan_get", planId });
  const plan = result.plan || {};
  const nextStep = result.nextStep || null;
  const pendingSteps = (plan.steps || []).filter((step) => !["completed", "skipped"].includes(step.status || ""));
  const previewSteps = pendingSteps.slice(0, 3);
  const firstStep = previewSteps[0] || nextStep;
  const lastStep = previewSteps.at(-1) || nextStep;
  const firstIds = (firstStep?.chunkIds || []).filter(Boolean);
  const lastIds = (lastStep?.chunkIds || []).filter(Boolean);
  const startChunkId = firstStep?.startChunkId || firstIds[0] || state.selectedChunkId;
  const endChunkId = lastStep?.endChunkId || lastIds.at(-1) || startChunkId;
  const packet = {
    type: "plan-run-decision-packet",
    reviewGoal: "审阅计划批量运行风险，决定运行 3 步、改为单步执行，或暂停并调整计划。",
    planId: plan.planId || planId,
    title: plan.title || "",
    status: plan.status || "",
    mode: plan.mode || "",
    progress: {
      currentStepIndex: plan.currentStepIndex || 0,
      stepCount: (plan.steps || []).length || plan.stepCount || 0,
      pendingPreviewCount: previewSteps.length,
    },
    nextStep,
    runPreview: previewSteps.map((step) => ({
      stepId: step.stepId || "",
      title: step.title || "",
      status: step.status || "",
      query: step.query || "",
      startChunkId: step.startChunkId || "",
      endChunkId: step.endChunkId || "",
      chunkIds: (step.chunkIds || []).slice(0, 8),
    })),
    rangeEvidence: firstStep ? rangeEvidencePacket(startChunkId, endChunkId, "plan-run-preview-range") : null,
    payloads: {
      runThreeSteps: { command: "plan_run", planId, maxSteps: 3 },
      executeOneStep: { command: "plan_execute_step", planId },
      claimNextStep: { command: "plan_next_step", planId, claim: true },
    },
    nextStepGuide: [
      plan.status === "paused" ? "计划已暂停，运行前应先恢复或改为单步审阅。" : "",
      plan.status === "completed" ? "计划已完成，不应运行 3 步。" : "",
      previewSteps.length ? "如 runPreview 三步范围连续且目标一致，可审 payloads.runThreeSteps。" : "当前没有可预览的待执行步骤，先刷新计划。",
      "如任一步范围或 query 不确定，改用 executeOneStep。",
    ].filter(Boolean),
    requiredChecks: [
      "确认 plan.status 允许批量运行。",
      "确认 runPreview 的三步不会跨过不相关章节。",
      "确认 rangeEvidence 代表的是批量运行范围，不只是下一步。",
      "确认批量运行产生的评价/沉淀预览仍需 approval。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      runsMultiplePlanSteps: previewSteps.length > 1,
      mayCreateMultipleReviews: true,
      mayCreateMultipleSinkPreviews: true,
      productRuntimeAgent: "Nova",
    },
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已复制计划运行决策包: ${plan.planId || planId}`);
  return packet;
}

async function copyRunnerDecision(planId) {
  const result = await query({ command: "plan_get", planId });
  const plan = result.plan || {};
  const nextStep = result.nextStep || null;
  const runner = runnerForPlan(planId);
  const startPayload = { planId, intervalMs: 2000, maxStepsPerTick: 1, maxRetries: 1, retryDelayMs: 2000 };
  const packet = {
    type: "runner-decision-packet",
    reviewGoal: "审阅后台计划 runner 启动/重试风险，决定后台跑、重试、停止或改为单步执行。",
    planId: plan.planId || planId,
    title: plan.title || "",
    status: plan.status || "",
    mode: plan.mode || "",
    progress: {
      currentStepIndex: plan.currentStepIndex || 0,
      stepCount: (plan.steps || []).length || plan.stepCount || 0,
    },
    nextStep,
    runner: runner
      ? {
          status: runner.status || "idle",
          tickCount: runner.tickCount || 0,
          executedCount: runner.executedCount || 0,
          retryCount: runner.retryCount || 0,
          maxRetries: runner.maxRetries || 0,
          stoppedReason: runner.stoppedReason || "",
          lastError: runner.lastError || runner.lastResult?.runner?.error || null,
        }
      : { status: "idle" },
    payloads: {
      start: startPayload,
      retry: startPayload,
      stop: { planId },
      executeOneStep: { command: "plan_execute_step", planId },
    },
    nextStepGuide: [
      plan.status === "paused" ? "计划已暂停，后台跑前先恢复计划。" : "",
      plan.status === "completed" ? "计划已完成，不应启动后台 runner。" : "",
      runner && ["running", "waiting"].includes(runner.status) ? "已有 runner 活动中，避免重复启动。" : "如需要自动推进，可先审 payloads.start 后启动。",
      "若只想确认下一步产物，优先使用 executeOneStep。",
    ].filter(Boolean),
    requiredChecks: [
      "确认 intervalMs/maxStepsPerTick 不会过快生成沉淀预览。",
      "确认 maxRetries/retryDelayMs 符合当前上游稳定性。",
      "确认后台执行产生的沉淀仍需 approval。",
      "确认当前 nextStep 范围与阅读目标一致。",
    ],
    safety: {
      requiresExplicitConfirm: true,
      startsBackgroundRunner: true,
      mayCreateMultipleArtifacts: true,
      productRuntimeAgent: "Nova",
    },
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已复制后台决策包: ${plan.planId || planId}`);
  return packet;
}

function artifactsFromPlan(plan) {
  return (plan.steps || [])
    .flatMap((step) => (step.artifacts || []).map((artifact) => ({ ...artifact, stepId: step.stepId, stepStatus: step.status })))
    .filter((artifact) => artifact?.type || artifact?.reviewId || artifact?.previewId);
}

async function copyPlanArtifacts(planId) {
  const result = await query({ command: "plan_get", planId });
  const plan = result.plan || {};
  const artifacts = artifactsFromPlan(plan);
  const reviewIds = artifacts.map((artifact) => artifact.reviewId).filter(Boolean);
  const sinkPreviewIds = artifacts.map((artifact) => artifact.previewId).filter(Boolean);
  const packet = {
    type: "plan-artifacts",
    planId: plan.planId || planId,
    title: plan.title || "",
    status: plan.status || "",
    progress: {
      currentStepIndex: plan.currentStepIndex || 0,
      stepCount: (plan.steps || []).length || plan.stepCount || 0,
    },
    reviewIds,
    sinkPreviewIds,
    artifacts,
    nextStep: result.nextStep || null,
  };
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已复制计划工件: ${plan.planId || planId}`);
  return packet;
}

async function openPlanArtifact(planId) {
  const packet = await copyPlanArtifacts(planId);
  const previewId = packet.sinkPreviewIds.at(-1);
  if (previewId) {
    state.selectedSinkPreview = await loadSinkPreview(previewId);
    state.selectedSinkDiff = null;
    renderSinkDetail();
    log(`已打开计划沉淀预览: ${previewId}`);
    return;
  }
  const reviewId = packet.reviewIds.at(-1);
  if (!reviewId) throw new Error("该计划暂无可打开的评价或沉淀预览。");
  const reviewResult = await query({ command: "review_get", reviewId });
  const review = reviewResult.review || reviewResult.fullReview || reviewResult.data?.review || reviewResult.data?.fullReview || reviewResult;
  const sourceRange = review.sourceRange || {};
  const summary = [
    `reviewId: ${review.reviewId || reviewId}`,
    `title: ${review.title || ""}`,
    `bookId: ${review.bookId || ""}`,
    `range: ${sourceRange.startChunkId || review.startChunkId || ""} -> ${sourceRange.endChunkId || review.endChunkId || ""}`,
    "",
    "summary:",
    review.summary || "",
  ].join("\n");
  await copyTextToClipboard(summary);
  log(`已复制计划评价工件: ${review.reviewId || reviewId}`);
}

function renderRunnerList() {
  const list = $("runnerList");
  if (!list) return;
  const runners = state.backgroundRunners.filter((runner) => runner.status !== "idle");
  if (!runners.length) {
    list.className = "runner-list empty";
    list.textContent = "暂无后台 runner";
    return;
  }
  list.className = "runner-list";
  list.innerHTML = runners
    .map((runner) => {
      const error = runner.lastError?.message || runner.lastResult?.runner?.error?.message || "";
      return `
        <article class="runner-row ${runner.status === "error" ? "runner-error" : ""}">
          <strong>${escapeHtml(runner.planId)}</strong>
          <small>${escapeHtml(runner.status)} · tick ${escapeHtml(runner.tickCount || 0)} · done ${escapeHtml(runner.executedCount || 0)}${runner.stoppedReason ? ` · ${escapeHtml(runner.stoppedReason)}` : ""}</small>
          ${runner.maxRetries ? `<small>retry ${escapeHtml(runner.retryCount || 0)}/${escapeHtml(runner.maxRetries)}${runner.nextRunAt ? ` · next ${escapeHtml(runner.nextRunAt)}` : ""}</small>` : ""}
          ${error ? `<p>${escapeHtml(error)}</p>` : ""}
          <button class="secondary" data-action="copy-runner" data-id="${escapeHtml(runner.planId || "")}">复制后台</button>
          <button class="secondary" data-action="copy-runner-artifacts" data-id="${escapeHtml(runner.planId || "")}">复制工件</button>
          <button class="secondary" data-action="open-runner-artifact" data-id="${escapeHtml(runner.planId || "")}">打开工件</button>
        </article>
      `;
    })
    .join("");
}

function renderReviews() {
  const selected = activeBook();
  const reviews = (state.snapshot?.reviews || []).filter((review) => !selected || review.bookId === selected.bookId);
  $("activeReviewCount").textContent = String(reviews.length);
  const list = $("reviewList");
  if (!reviews.length) {
    list.className = "review-list empty";
    list.textContent = "暂无评价";
    return;
  }
  list.className = "review-list";
  list.innerHTML = reviews
    .map((review) => {
      const range = review.sourceRange
        ? `${review.sourceRange.startChunkId} -> ${review.sourceRange.endChunkId}`
        : review.reviewId;
      return `<article class="review-row"><strong>${escapeHtml(review.title || review.reviewId)}</strong><small>${escapeHtml(range)} · ${escapeHtml(review.status)}</small><button class="secondary" data-action="copy-review" data-id="${escapeHtml(review.reviewId || "")}">复制评价</button><button class="secondary" data-action="copy-review-follow-up-decision" data-id="${escapeHtml(review.reviewId || "")}">复制后续决策</button><button class="secondary" data-action="fill-plan-from-review" data-id="${escapeHtml(review.reviewId || "")}">生成计划</button><button class="secondary" data-action="review-preview-sink" data-id="${escapeHtml(review.reviewId || "")}">生成预览</button></article>`;
    })
    .join("");
}

function renderSinks() {
  const previews = visibleSinkPreviewsForBook(activeBook());
  $("sinkCount").textContent = String(previews.length);
  const list = $("sinkList");
  if (!previews.length) {
    list.className = "sink-list empty";
    list.textContent = "暂无沉淀预览";
    return;
  }
  list.className = "sink-list";
  list.innerHTML = "";
  for (const preview of previews) {
    const row = document.createElement("article");
    row.className = `sink-row ${state.selectedSinkPreview?.previewId === preview.previewId ? "active" : ""}`.trim();
    const destination = preview.destination || {};
    const notePath = destination.notePath || destination.path || preview.notePath || "";
    row.innerHTML = `
      <header>
        <span class="target">${escapeHtml(preview.target)}</span>
        <b class="status-${escapeHtml(preview.status)}">${escapeHtml(preview.status)}</b>
      </header>
      <strong>${escapeHtml(notePath || preview.title || preview.previewId)}</strong>
      <small>${escapeHtml(preview.sourceType || "review")} · ${escapeHtml(preview.bookId || "")}</small>
      <div class="sink-actions">
        <button class="secondary" data-action="preview" data-id="${escapeHtml(preview.previewId)}">查看</button>
        <button class="secondary" data-action="copy-sink-preview" data-id="${escapeHtml(preview.previewId)}">复制预览</button>
        <button class="secondary" data-action="copy-sink-source" data-id="${escapeHtml(preview.previewId)}">复制来源</button>
        <button class="secondary" data-action="copy-sink-row-decision" data-id="${escapeHtml(preview.previewId)}">复制决策</button>
        <button class="secondary" data-action="approve" data-id="${escapeHtml(preview.previewId)}" ${preview.status !== "pending" ? "disabled" : ""}>批准</button>
        <button data-action="sink" data-id="${escapeHtml(preview.previewId)}" ${preview.status !== "approved" ? "disabled" : ""}>执行</button>
      </div>
    `;
    list.appendChild(row);
  }
  renderSinkGuide();
}

function canRenderImage(uri) {
  return /^https?:\/\//i.test(uri) || /^data:image\//i.test(uri) || uri.startsWith("/");
}

function renderIllustrations() {
  const selected = activeBook();
  const illustrations = (state.snapshot?.illustrations || []).filter((item) => !selected || item.bookId === selected.bookId);
  $("activeIllustrationCount").textContent = String(illustrations.length);
  const list = $("illustrationList");
  if (!illustrations.length) {
    list.className = "illustration-list empty";
    list.textContent = "暂无插图";
    renderIllustrationDetail();
    return;
  }
  list.className = "illustration-list";
  list.innerHTML = "";
  for (const item of illustrations) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "illustration-row secondary";
    row.dataset.illustrationId = item.illustrationId;
    row.innerHTML = `
      <strong>${escapeHtml(item.title || item.illustrationId)}</strong>
      <small>${escapeHtml(item.status)} · ${escapeHtml(item.sourceType)} · ${escapeHtml(item.placement?.position || "")} · ${escapeHtml(item.placement?.chunkId || item.placement?.startChunkId || "")}</small>
    `;
    list.appendChild(row);
  }
  renderIllustrationDetail();
}

function renderIllustrationDetail() {
  const item = state.selectedIllustration;
  if (!item) {
    $("illustrationPreview").className = "illustration-preview empty";
    $("illustrationPreview").textContent = "选择或创建一张插图后预览。";
    $("illustrationMeta").textContent = "暂无锚点。";
    $("copyIllustrationBtn").disabled = true;
    return;
  }
  const uri = item.assetUri || item.thumbnailUri || "";
  $("illustrationPreview").className = "illustration-preview";
  if (uri && canRenderImage(uri)) {
    $("illustrationPreview").innerHTML = `<img alt="${escapeHtml(item.title || "共读插图")}" src="${escapeHtml(uri)}">`;
  } else {
    $("illustrationPreview").textContent = uri ? `图片 URI: ${uri}` : "尚未生成图片。";
  }
  $("illustrationMeta").textContent = [
    item.illustrationId,
    item.stylePreset || "",
    item.aspectRatio || "",
    item.placement?.position || "",
    item.placement?.layer || "",
    item.placement?.chunkId || item.placement?.startChunkId || "",
    item.safety?.spoilerBoundary ? `spoiler<=${item.safety.spoilerBoundary}` : ""
  ].filter(Boolean).join(" · ");
  $("copyIllustrationBtn").disabled = false;
}

function renderIllustrationSuggestions() {
  const list = $("illustrationSuggestions");
  if (!state.illustrationSuggestions.length) {
    list.className = "illustration-suggestions empty";
    list.textContent = "先选择 chunk 后生成建议。";
    return;
  }
  list.className = "illustration-suggestions";
  list.innerHTML = "";
  for (const suggestion of state.illustrationSuggestions) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "suggestion-row secondary";
    row.dataset.suggestion = JSON.stringify(suggestion);
    row.innerHTML = `
      <strong>${escapeHtml(suggestion.title || suggestion.kind || "插图建议")}</strong>
      <small>${escapeHtml(suggestion.intent || suggestion.kind || "")} · ${escapeHtml(suggestion.aspectRatio || "")}</small>
    `;
    list.appendChild(row);
  }
}

function cardCollectionItems() {
  const collection = state.cardCollection || {};
  return [...(collection.bookCards || []), ...(collection.items || [])];
}

function cardCount() {
  const collection = state.cardCollection || {};
  const visible = cardCollectionItems().length;
  const total = Number(collection.total || 0) + (collection.bookCards || []).length;
  return Math.max(visible, total, state.cardInbox.length);
}

function findCardSummary(cardId) {
  return [...state.cardInbox, ...cardCollectionItems()].find((card) => card.id === cardId) || null;
}

function rememberCardSaveResult(cardId, result) {
  if (!cardId || !result) return null;
  const saved = { ...result, cardId: result.cardId || cardId };
  state.cardSaveResults[cardId] = saved;
  persistCardSaveResults();
  return saved;
}

function forgetCardSaveResult(cardId) {
  if (!cardId) return;
  delete state.cardSaveResults[cardId];
  if (state.selectedCardSaveResult?.cardId === cardId) {
    state.selectedCardSaveResult = null;
  }
  persistCardSaveResults();
}

function previewSummaryFields(preview) {
  return {
    status: preview?.status || undefined,
    target: preview?.target || undefined,
    notePath: preview?.destination?.notePath || preview?.destination?.path || preview?.notePath || undefined,
  };
}

function rememberCardPreviewResult(cardId, previewId, status = "pending", extra = {}) {
  if (!cardId || !previewId) return null;
  const previous = state.cardPreviewResults[cardId] || {};
  const preview = { ...previous, ...extra, cardId, previewId, status, updatedAt: new Date().toISOString(), createdAt: previous.createdAt || new Date().toISOString() };
  state.cardPreviewResults[cardId] = preview;
  persistCardPreviewResults();
  return preview;
}

function forgetCardPreviewResult(cardId) {
  if (!cardId) return;
  delete state.cardPreviewResults[cardId];
  persistCardPreviewResults();
}

function clearStaleCardPreview(cardId, previewId, reason = "") {
  forgetCardPreviewResult(cardId);
  state.cardDigestNotice = reason
    ? `单卡片预览已失效，已清理记录：${previewId}（${reason}）`
    : `单卡片预览已失效，已清理记录：${previewId}`;
  renderCards();
}

function setCardDigestStatus(text) {
  state.cardDigestNotice = "";
  $("cardDigestStatus").textContent = text;
}

function cardSavedPath(saved) {
  return saved?.filePath || saved?.path || saved?.targetPath || "";
}

function obsidianImageEmbed(path) {
  return path ? `![[${path.replace(/\\/g, "/")}]]` : "";
}

function markdownHeadingText(text) {
  return String(text || "阅读卡片").replace(/[\r\n#]/g, " ").trim() || "阅读卡片";
}

function markdownQuote(text) {
  return String(text || "")
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function obsidianCardMarkdown(card, saved) {
  const title = markdownHeadingText(card.title || card.kicker || card.message || card.id);
  const lines = [`## ${title}`];
  const embed = obsidianImageEmbed(cardSavedPath(saved));
  if (embed) lines.push("", embed);
  if (card.quote) lines.push("", markdownQuote(card.quote));
  if (card.note) lines.push("", String(card.note).trim());
  const meta = [card.bookId, card.chunkId, card.id].filter(Boolean).join(" · ");
  if (meta) lines.push("", `来源: ${meta}`);
  return lines.join("\n");
}

function sinkPreviewIdFromResult(result) {
  return previewIdFromResult(result) || result?.data?.preview?.previewId || result?.raw?.preview?.previewId || "";
}

function renderCardRows(cards, emptyText, actions) {
  if (!cards.length) return escapeHtml(emptyText);
  return cards
    .map((card) => {
      const subtitle = card.subtitle || [card.scope, card.status, card.createdAt].filter(Boolean).join(" · ");
      const saved = state.cardSaveResults[card.id];
      const savedPath = cardSavedPath(saved);
      const preview = state.cardPreviewResults[card.id];
      const previewStatus = preview?.status || "pending";
      const previewPath = preview?.notePath || preview?.target || "";
      const previewObsidian = preview?.target === "obsidian" || Boolean(preview?.notePath);
      const previewPending = previewStatus === "pending";
      const previewApproved = previewStatus === "approved";
      const rowActions = [
        ...actions,
        { action: "card-copy-context", label: "复制卡片", secondary: true },
        { action: "card-copy-decision", label: "复制决策", secondary: true },
        { action: "card-fill-review", label: "填入评价", secondary: true },
        { action: "card-fill-backtrack", label: "回溯", secondary: true },
        { action: "card-create-backtrack-plan", label: "生成计划", secondary: true },
        { action: "card-sink-backtrack", label: "沉淀回溯", secondary: true },
        ...(savedPath
          ? [
              { action: "card-copy-path", label: "复制路径", secondary: true },
              { action: "card-copy-obsidian", label: "复制引用", secondary: true },
              { action: "card-copy-note", label: "复制笔记", secondary: true },
            ]
          : []),
        { action: "card-preview-sink", label: "生成预览", secondary: true },
        ...(preview?.previewId
          ? [
              { action: "card-open-preview", label: "打开预览", secondary: true },
              { action: "card-copy-preview-id", label: "复制预览ID", secondary: true },
              ...(previewPath ? [{ action: "card-copy-preview-target", label: "复制目标", secondary: true }] : []),
              { action: "card-copy-preview-content", label: "复制正文", secondary: true },
              ...(previewObsidian ? [{ action: "card-read-obsidian", label: "回读目标", secondary: true }] : []),
              ...(previewPending ? [{ action: "card-approve-preview", label: "批准预览", secondary: true }] : []),
              ...(previewApproved ? [{ action: "card-execute-preview", label: "执行写入", secondary: false }] : []),
            ]
          : []),
      ];
      const actionButtons = rowActions
        .map((action) => `<button class="${action.secondary ? "secondary" : ""}" type="button" data-action="${action.action}" data-id="${escapeHtml(card.id || "")}">${escapeHtml(action.label)}</button>`)
        .join("");
      return `
        <article class="card-row">
          <div>
            <strong>${escapeHtml(card.message || card.kicker || card.title || card.id)}</strong>
            <small>${escapeHtml(card.title || "")}${subtitle ? ` · ${escapeHtml(subtitle)}` : ""}</small>
            ${savedPath ? `<small class="card-saved-path">已保存: ${escapeHtml(savedPath)}</small>` : ""}
            ${preview?.previewId ? `<small class="card-saved-path">已生成预览(${escapeHtml(previewStatus)}): ${escapeHtml(preview.previewId)}</small>` : ""}
            ${previewPath ? `<small class="card-saved-path">沉淀目标: ${escapeHtml(previewPath)}</small>` : ""}
          </div>
          <div class="card-row-actions">${actionButtons}</div>
        </article>
      `;
    })
    .join("");
}

function renderCards() {
  $("cardInboxCount").textContent = String(state.cardInbox.length);
  $("cardInboxList").className = state.cardInbox.length ? "card-list" : "card-list empty";
  $("cardInboxList").innerHTML = renderCardRows(state.cardInbox, "暂无新卡片", [
    { action: "card-open", label: "预览", secondary: true },
    { action: "card-dismiss", label: "移出", secondary: true },
  ]);

  const collectionItems = cardCollectionItems();
  $("cardCollectionList").className = collectionItems.length ? "card-list" : "card-list empty";
  $("cardCollectionList").innerHTML = renderCardRows(collectionItems, "暂无收藏卡片", [
    { action: "card-open", label: "预览", secondary: true },
    { action: "card-save", label: "保存" },
  ]);
  const totalCards = cardCount();
  $("cardDigestBtn").disabled = !state.selectedBookId || totalCards === 0;
  $("copyCardDigestBtn").disabled = state.selectedSinkPreview?.sourceType !== "card_digest";
  $("cardDigestStatus").textContent = state.cardDigestNotice || (totalCards
    ? `可从 ${totalCards} 张卡片生成 Obsidian digest 预览。`
    : "收集卡片后可生成 Obsidian digest 预览。");
  renderCardDetail();
}

function renderCardDetail() {
  const card = state.selectedCard;
  if (!card) {
    $("cardDetailStatus").textContent = "未选择";
    $("cardPreview").className = "card-preview empty";
    $("cardPreview").textContent = "选择卡片后预览。";
    $("saveCardBtn").disabled = true;
    $("dismissCardBtn").disabled = true;
    state.selectedCardSaveResult = null;
    return;
  }
  $("cardDetailStatus").textContent = card.title || card.id || "阅读卡片";
  $("cardPreview").className = "card-preview";
  const saved = state.selectedCardSaveResult?.cardId === card.id ? state.selectedCardSaveResult : state.cardSaveResults[card.id] || null;
  const savedPath = cardSavedPath(saved);
  const preview = state.cardPreviewResults[card.id];
  const previewStatus = preview?.status || "pending";
  const previewPath = preview?.notePath || preview?.target || "";
  const previewObsidian = preview?.target === "obsidian" || Boolean(preview?.notePath);
  const previewPending = previewStatus === "pending";
  const previewApproved = previewStatus === "approved";
  $("cardPreview").innerHTML = `
    <img alt="${escapeHtml(card.title || "阅读卡片")}" src="/api/cards/${encodeURIComponent(card.id)}/image?ts=${Date.now()}">
    ${savedPath ? `<small>已保存: ${escapeHtml(savedPath)}</small>` : ""}
    ${preview?.previewId ? `<small>已生成预览(${escapeHtml(previewStatus)}): ${escapeHtml(preview.previewId)}</small>` : ""}
    ${previewPath ? `<small>沉淀目标: ${escapeHtml(previewPath)}</small>` : ""}
    <button class="secondary" type="button" data-action="card-copy-context" data-id="${escapeHtml(card.id)}">复制卡片</button>
    <button class="secondary" type="button" data-action="card-copy-decision" data-id="${escapeHtml(card.id)}">复制决策</button>
    ${savedPath ? `<button class="secondary" type="button" data-action="card-copy-path" data-id="${escapeHtml(card.id)}">复制路径</button>` : ""}
    ${savedPath ? `<button class="secondary" type="button" data-action="card-copy-obsidian" data-id="${escapeHtml(card.id)}">复制引用</button>` : ""}
    ${savedPath ? `<button class="secondary" type="button" data-action="card-copy-note" data-id="${escapeHtml(card.id)}">复制笔记</button>` : ""}
    <button class="secondary" type="button" data-action="card-fill-review" data-id="${escapeHtml(card.id)}">填入评价</button>
    <button class="secondary" type="button" data-action="card-fill-backtrack" data-id="${escapeHtml(card.id)}">回溯</button>
    <button class="secondary" type="button" data-action="card-create-backtrack-plan" data-id="${escapeHtml(card.id)}">生成计划</button>
    <button class="secondary" type="button" data-action="card-sink-backtrack" data-id="${escapeHtml(card.id)}">沉淀回溯</button>
    <button class="secondary" type="button" data-action="card-preview-sink" data-id="${escapeHtml(card.id)}">生成预览</button>
    ${preview?.previewId ? `<button class="secondary" type="button" data-action="card-open-preview" data-id="${escapeHtml(card.id)}">打开预览</button>` : ""}
    ${preview?.previewId ? `<button class="secondary" type="button" data-action="card-copy-preview-id" data-id="${escapeHtml(card.id)}">复制预览ID</button>` : ""}
    ${previewPath ? `<button class="secondary" type="button" data-action="card-copy-preview-target" data-id="${escapeHtml(card.id)}">复制目标</button>` : ""}
    ${preview?.previewId ? `<button class="secondary" type="button" data-action="card-copy-preview-content" data-id="${escapeHtml(card.id)}">复制正文</button>` : ""}
    ${preview?.previewId && previewObsidian ? `<button class="secondary" type="button" data-action="card-read-obsidian" data-id="${escapeHtml(card.id)}">回读目标</button>` : ""}
    ${preview?.previewId && previewPending ? `<button class="secondary" type="button" data-action="card-approve-preview" data-id="${escapeHtml(card.id)}">批准预览</button>` : ""}
    ${preview?.previewId && previewApproved ? `<button type="button" data-action="card-execute-preview" data-id="${escapeHtml(card.id)}">执行写入</button>` : ""}
  `;
  $("saveCardBtn").disabled = false;
  $("dismissCardBtn").disabled = false;
}

function renderSinkDetail() {
  const preview = state.selectedSinkPreview;
  if (!preview) {
    renderSinkGuide();
    $("sinkDetailStatus").textContent = "未选择";
    $("sinkDetailMeta").textContent = "选择一条沉淀预览后查看将写入的内容。";
    $("sinkPreviewContent").value = "暂无预览。";
    $("sinkPreviewContent").setAttribute("aria-readonly", "true");
    $("sinkPreviewContent").disabled = true;
    $("copySinkContextBtn").disabled = true;
    $("copySinkSourceBtn").disabled = true;
    $("fillSinkSourceBtn").disabled = true;
    $("copySinkContentBtn").disabled = true;
    $("copySinkReviewPacketBtn").disabled = true;
    $("copySinkAuditContextBtn").disabled = true;
    $("copySinkDecisionPacketBtn").disabled = true;
    $("copySinkSavePayloadBtn").disabled = true;
    $("saveSinkContentBtn").disabled = true;
    $("copySinkSaveApprovePayloadBtn").disabled = true;
    $("saveApproveSinkPreviewBtn").disabled = true;
    $("copySinkExecutePayloadBtn").disabled = true;
    $("executeSinkPreviewBtn").disabled = true;
    $("readObsidianBtn").disabled = true;
    $("copyObsidianReadBtn").disabled = true;
    $("copyObsidianReadSummaryBtn").disabled = true;
    $("diffObsidianBtn").disabled = true;
    $("copyObsidianDiffBtn").disabled = true;
    $("mergeObsidianBtn").disabled = true;
    $("suggestIntegrateObsidianBtn").disabled = true;
    $("copyIntegrateSuggestionBtn").disabled = true;
    $("previewReplaceRangeObsidianBtn").disabled = true;
    $("copyReplacePreviewBtn").disabled = true;
    $("copyConfirmReplacePayloadBtn").disabled = true;
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    $("copyConfirmReplaceBtn").disabled = true;
    $("copyApplyIntegratePayloadBtn").disabled = true;
    $("applyIntegrateChoiceObsidianBtn").disabled = true;
    $("copyIntegratePayloadBtn").disabled = true;
    $("integrateObsidianBtn").disabled = true;
    $("copyIntegrateResultBtn").disabled = true;
    $("statusObsidianBtn").disabled = true;
    $("copyObsidianStatusBtn").disabled = true;
    $("copyVaultStatusBtn").disabled = true;
    $("copyVaultAuditBtn").disabled = true;
    $("copyVaultSyncPlanBtn").disabled = true;
    $("copyVaultSyncActionPayloadBtn").disabled = true;
    $("copyResolvePayloadBtn").disabled = true;
    $("resolveObsidianBtn").disabled = true;
    $("copyRejectSinkPreviewBtn").disabled = true;
    $("rejectSinkPreviewBtn").disabled = true;
    $("obsidianDiffPanel").className = "obsidian-diff-panel empty";
    $("obsidianDiffPanel").textContent = "暂无 vault 差异。";
    return;
  }
  const destination = preview.destination || {};
  const editable = preview.status !== "exported";
  const isObsidian = preview.target === "obsidian";
  $("sinkDetailStatus").textContent = `${preview.target || "target"} · ${preview.status || "status"}`;
  $("sinkDetailMeta").textContent = [
    preview.previewId,
    destination.notePath || destination.path || destination.type || "",
    preview.rawTextIncluded === false ? "不含完整原文" : ""
  ].filter(Boolean).join(" · ");
  $("sinkPreviewContent").value = typeof preview.content === "string" ? preview.content : JSON.stringify(preview.content || preview, null, 2);
  $("sinkPreviewContent").disabled = !editable;
  $("sinkPreviewContent").setAttribute("aria-readonly", editable ? "false" : "true");
  $("copySinkContextBtn").disabled = false;
  $("copySinkSourceBtn").disabled = false;
  $("fillSinkSourceBtn").disabled = false;
  $("copySinkContentBtn").disabled = false;
  $("copySinkReviewPacketBtn").disabled = false;
  $("copySinkAuditContextBtn").disabled = false;
  $("copySinkDecisionPacketBtn").disabled = false;
  $("copySinkSavePayloadBtn").disabled = !editable;
  $("saveSinkContentBtn").disabled = !editable;
  $("copySinkSaveApprovePayloadBtn").disabled = !editable;
  $("saveApproveSinkPreviewBtn").disabled = !editable;
  $("copySinkExecutePayloadBtn").disabled = preview.status !== "approved";
  $("executeSinkPreviewBtn").disabled = preview.status !== "approved";
  $("readObsidianBtn").disabled = !isObsidian;
  $("copyObsidianReadBtn").disabled = !isObsidian || state.selectedSinkDiff?.kind !== "read" || !state.selectedSinkDiff?.exists;
  $("copyObsidianReadSummaryBtn").disabled = !isObsidian || state.selectedSinkDiff?.kind !== "read";
  $("diffObsidianBtn").disabled = !isObsidian;
  $("copyObsidianDiffBtn").disabled = !isObsidian || state.selectedSinkDiff?.kind !== "diff";
  $("mergeObsidianBtn").disabled = !isObsidian;
  $("suggestIntegrateObsidianBtn").disabled = !isObsidian;
  $("copyIntegrateSuggestionBtn").disabled = !isObsidian || state.selectedSinkDiff?.kind !== "suggest-integration";
  $("previewReplaceRangeObsidianBtn").disabled = !isObsidian;
  $("copyReplacePreviewBtn").disabled = !isObsidian || state.selectedSinkDiff?.kind !== "replace-preview";
  $("copyConfirmReplacePayloadBtn").disabled = !isObsidian || state.selectedSinkDiff?.kind !== "replace-preview";
  $("confirmReplaceRangeObsidianBtn").disabled = !isObsidian || state.selectedSinkDiff?.kind !== "replace-preview";
  $("copyConfirmReplaceBtn").disabled = !isObsidian || state.selectedSinkDiff?.kind !== "confirm-replace";
  $("copyApplyIntegratePayloadBtn").disabled = !isObsidian || state.selectedSinkDiff?.kind !== "suggest-integration";
  $("applyIntegrateChoiceObsidianBtn").disabled = !isObsidian;
  $("copyIntegratePayloadBtn").disabled = !isObsidian;
  $("integrateObsidianBtn").disabled = !isObsidian;
  $("copyIntegrateResultBtn").disabled = !isObsidian || !["apply-choice", "integrate"].includes(state.selectedSinkDiff?.kind);
  $("statusObsidianBtn").disabled = !isObsidian;
  $("copyObsidianStatusBtn").disabled = !isObsidian || !["status", "resolve"].includes(state.selectedSinkDiff?.kind);
  $("copyVaultStatusBtn").disabled = state.selectedSinkDiff?.kind !== "vault-status";
  $("copyVaultSyncPlanBtn").disabled = state.selectedSinkDiff?.kind !== "vault-sync-plan";
  $("copyVaultSyncActionPayloadBtn").disabled = state.selectedSinkDiff?.kind !== "vault-sync-plan" || !(state.vaultSyncApplicable || []).length;
  $("copyVaultAuditBtn").disabled = ![
    "vault-snapshot",
    "vault-snapshot-list",
    "vault-snapshot-diff",
    "vault-index",
    "vault-index-list",
    "vault-index-get",
    "vault-index-refresh",
    "vault-index-rebuilt",
    "vault-sync-plan",
    "vault-sync-action"
  ].includes(state.selectedSinkDiff?.kind);
  $("copyResolvePayloadBtn").disabled = !isObsidian;
  $("resolveObsidianBtn").disabled = !isObsidian;
  $("copyRejectSinkPreviewBtn").disabled = !editable || preview.status === "rejected";
  $("rejectSinkPreviewBtn").disabled = !editable || preview.status === "rejected";
  renderObsidianDiffPanel();
  renderSinkGuide();
}

function renderSinkGuide() {
  const preview = state.selectedSinkPreview;
  const step = $("sinkGuideStep");
  const title = $("sinkGuideTitle");
  const meta = $("sinkGuideMeta");
  const approve = $("sinkGuideApproveBtn");
  const execute = $("sinkGuideExecuteBtn");
  if (!step || !title || !meta || !approve || !execute) return;
  if (!preview) {
    const pendingCount = pendingSinkPreviewsForBook(activeBook()).length;
    step.textContent = pendingCount ? `${pendingCount} 条待预览` : "先预览";
    title.textContent = pendingCount ? "点击“看沉淀”会打开第一条待处理预览" : "选择一条沉淀预览";
    meta.textContent = "沉淀不会自动写入，必须先看正文并批准。";
    approve.disabled = true;
    execute.disabled = true;
    return;
  }
  const destination = preview.destination || {};
  const notePath = destination.notePath || destination.path || preview.notePath || "";
  const status = preview.status || "pending";
  const target = preview.target || "target";
  const actionText = status === "pending"
    ? "下一步：看完正文后批准"
    : status === "approved"
      ? "下一步：确认路径后执行写入"
      : status === "exported"
        ? "已写入，可回读或查看差异"
        : status === "rejected"
          ? "已驳回，可另建预览"
          : "检查当前状态";
  step.textContent = `${target} · ${status}`;
  title.textContent = notePath || preview.title || preview.previewId || "沉淀预览";
  meta.textContent = `${actionText} · 来源 ${preview.sourceType || "review"} · ${preview.rawTextIncluded === false ? "不含完整原文" : "含预览正文"}`;
  approve.disabled = status !== "pending";
  execute.disabled = status !== "approved";
}

function previewIdFromResult(result) {
  const data = result?.data || result?.raw || result || {};
  if (data.previewId) return data.previewId;
  const direct = data.preview || data.previews?.[0] || data.sinkPreviews?.[0] || data.execution?.sinkPreviews?.[0];
  if (direct?.previewId) return direct.previewId;
  const artifact = data.recorded?.plan?.history
    ?.flatMap((item) => item.artifacts || [])
    ?.find((item) => item.type === "sink_preview" && item.previewId);
  if (artifact?.previewId) return artifact.previewId;
  const runPreviewId = (data.runs || [])
    .flatMap((run) => run.sinkPreviewIds || [])
    .find(Boolean);
  return runPreviewId || null;
}

async function openPreviewFromResult(result, { refreshSnapshot = false } = {}) {
  const previewId = previewIdFromResult(result);
  if (!previewId) return false;
  state.selectedSinkPreview = await loadSinkPreview(previewId);
  state.selectedSinkDiff = null;
  if (refreshSnapshot) await loadSnapshot();
  renderSinkDetail();
  return true;
}

async function loadSinkPreview(previewId) {
  const result = await query({ command: "sink_preview_get", previewId });
  return result.preview || result;
}

async function buildSinkPreviewSourcePacket(preview) {
  const destination = preview.destination || {};
  const packet = {
    type: "sink-preview-source",
    previewId: preview.previewId || "",
    sourceType: preview.sourceType || (preview.reviewId ? "review" : ""),
    reviewId: preview.reviewId || null,
    bookId: preview.bookId || null,
    target: preview.target || "",
    status: preview.status || "",
    notePath: destination.notePath || destination.path || preview.notePath || "",
    createdAt: preview.createdAt || "",
    updatedAt: preview.updatedAt || "",
    source: {},
    raw: preview,
  };
  if (preview.reviewId) {
    const result = await query({ command: "review_get", reviewId: preview.reviewId });
    const review = result.review || result.data?.review || result.data || result;
    packet.source.review = {
      reviewId: review.reviewId || preview.reviewId,
      title: review.title || "",
      bookId: review.bookId || preview.bookId || "",
      bookTitle: review.bookTitle || "",
      planId: review.planId || "",
      stepId: review.stepId || "",
      sourceRange: review.sourceRange || null,
      sourceAnchors: review.sourceAnchors || null,
      status: review.status || "",
      tags: review.tags || [],
      summary: review.summary || "",
    };
  }
  if (preview.backtrack) {
    packet.source.backtrack = preview.backtrack;
  }
  if (preview.cardDigest || preview.cardSummaries || preview.cards) {
    packet.source.cardDigest = preview.cardDigest || null;
    packet.source.cards = preview.cardSummaries || preview.cards || [];
  }
  return packet;
}

async function copySinkPreviewSource(previewId) {
  const preview = previewId ? await loadSinkPreview(previewId) : state.selectedSinkPreview;
  if (!preview) throw new Error("请先选择沉淀预览。");
  const packet = await buildSinkPreviewSourcePacket(preview);
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`已复制沉淀来源: ${preview.previewId || previewId || ""}`);
}

async function fillFromSinkPreviewSource(previewId) {
  const selected = activeBook();
  const preview = previewId ? await loadSinkPreview(previewId) : state.selectedSinkPreview;
  if (!selected || !preview) throw new Error("请先选择一本书和沉淀预览。");
  const packet = await buildSinkPreviewSourcePacket(preview);
  const review = packet.source.review;
  if (review) {
    const range = review.sourceRange || {};
    const anchors = review.sourceAnchors || {};
    $("reviewForm").elements.startChunkId.value = range.startChunkId || anchors.startChunkId || anchors.chunkIds?.[0] || "";
    $("reviewForm").elements.endChunkId.value = range.endChunkId || anchors.endChunkId || anchors.chunkIds?.at?.(-1) || range.startChunkId || "";
    $("reviewForm").elements.summary.value = review.summary || review.title || "";
    $("reviewForm").elements.observations.value = [
      `来源预览: ${preview.previewId || ""}`,
      `来源评价: ${review.reviewId || ""}`,
      review.planId ? `计划: ${review.planId}` : "",
      review.stepId ? `步骤: ${review.stepId}` : "",
      Array.isArray(review.tags) && review.tags.length ? `标签: ${review.tags.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    renderReviewRangeStatus();
    const payload = buildReviewCreatePayload(selected, new FormData($("reviewForm")));
    await copyTextToClipboard(JSON.stringify({ type: "sink-source-to-review-params", source: packet, payload }, null, 2));
    log(`已填入预览来源评价: ${review.reviewId || ""}`);
    return;
  }
  const backtrack = packet.source.backtrack;
  if (backtrack) {
    $("searchInput").value = backtrack.query || "";
    if (backtrack.anchorChunkId) await selectChunk(backtrack.anchorChunkId, true);
    $("backtrackBefore").value = backtrack.window?.before ?? $("backtrackBefore").value;
    $("backtrackAfter").value = backtrack.window?.after ?? $("backtrackAfter").value;
    $("backtrackMaxRanges").value = backtrack.rangeCount || $("backtrackMaxRanges").value;
    const payload = backtrackPayload(selected.bookId, backtrack.anchorChunkId || state.selectedChunkId);
    await copyTextToClipboard(JSON.stringify({ type: "sink-source-to-backtrack-params", source: packet, payload }, null, 2));
    log(`已填入预览回溯来源: ${backtrack.query || backtrack.anchorChunkId || ""}`);
    return;
  }
  const cards = packet.source.cards || [];
  if (cards.length) {
    const card = cards[0] || {};
    const cardId = card.id || card.cardId || "";
    if (cardId) {
      state.selectedCard = findCardSummary(cardId) || card;
      renderCards();
    }
    await copyTextToClipboard(JSON.stringify({ type: "sink-source-card-digest", source: packet, firstCardId: cardId }, null, 2));
    setCardDigestStatus(cardId ? `已填入 digest 来源卡片：${cardId}` : "已复制 digest 来源卡片清单。");
    return;
  }
  await copyTextToClipboard(JSON.stringify(packet, null, 2));
  log(`沉淀来源暂无可回填表单，已复制来源: ${preview.previewId || ""}`);
}

async function copySinkAuditContext() {
  const preview = state.selectedSinkPreview;
  if (!preview) throw new Error("请先选择沉淀预览。");
  const destination = preview.destination || {};
  const sourcePacket = await buildSinkPreviewSourcePacket(preview);
  const diff = state.selectedSinkDiff || null;
  const context = {
    type: "sink-audit-context",
    previewId: preview.previewId || "",
    status: preview.status || "",
    target: preview.target || "",
    sourceType: preview.sourceType || "",
    notePath: destination.notePath || destination.path || preview.notePath || "",
    rawTextIncluded: preview.rawTextIncluded !== false,
    settings: sinkSettingsPayload(),
    source: sourcePacket,
    currentContent: $("sinkPreviewContent").value || "",
    obsidianState: diff
      ? {
          kind: diff.kind || "",
          notePath: diff.notePath || "",
          exists: diff.exists,
          identical: diff.diff?.identical,
          alreadyMerged: diff.alreadyMerged,
          resolved: diff.resolved,
          recommendation: diff.recommendation || "",
          counts: diff.counts || diff.diff || null,
          reasons: diff.reasons || [],
          selected: diff.selectedCandidates || diff.selected || null,
          raw: diff,
        }
      : null,
    reviewGoal: [
      "判断当前沉淀正文是否应该批准、修改、驳回或继续回读/差异检查。",
      "保持当前书籍语境、引用边界和 Nova 审美一致性。",
      "若已有 Obsidian 状态，优先避免重复写入并给出最小安全动作。",
    ],
  };
  await copyTextToClipboard(JSON.stringify(context, null, 2));
  log(`已复制沉淀审阅上下文: ${preview.previewId || ""}`);
}

async function refreshSelectedSinkPreview(previewId) {
  if (!previewId || state.selectedSinkPreview?.previewId !== previewId) return false;
  state.selectedSinkPreview = await loadSinkPreview(previewId);
  state.selectedSinkDiff = null;
  renderSinkDetail();
  return true;
}

async function refreshExecutedSinkPreview(previewId) {
  if (!previewId || state.selectedSinkPreview?.previewId !== previewId) return false;
  state.selectedSinkPreview = await loadSinkPreview(previewId);
  if (state.selectedSinkPreview.target === "obsidian") {
    state.selectedSinkDiff = await readSelectedObsidianAfterExecute();
  } else {
    state.selectedSinkDiff = null;
  }
  renderSinkDetail();
  return true;
}

function renderObsidianDiffPanel() {
  const panel = $("obsidianDiffPanel");
  const data = state.selectedSinkDiff;
  if (!state.selectedSinkPreview) {
    panel.className = "obsidian-diff-panel empty";
    panel.textContent = "暂无 vault 差异。";
    return;
  }
  if (!data) {
    panel.className = "obsidian-diff-panel empty";
    panel.textContent = "未回读。";
    return;
  }
  panel.className = "obsidian-diff-panel";
  if (data.kind === "read") {
    panel.innerHTML = `
      <strong>${data.exists ? "已回读" : "未找到"}</strong>
      <small>${escapeHtml(data.notePath || "")} · ${escapeHtml(data.bytes || 0)} bytes</small>
      <pre>${escapeHtml(String(data.content || "").slice(0, 1200))}</pre>
    `;
    return;
  }
  if (data.kind === "diff") {
    const diff = data.diff || {};
    const title = data.resolved ? "已整理" : (data.alreadyMerged ? "已包含提案" : (diff.identical ? "无差异" : "存在差异"));
    panel.innerHTML = `
      <strong>${title}</strong>
      <small>新增 ${escapeHtml(diff.addedLineCount || 0)} · 移除 ${escapeHtml(diff.removedLineCount || 0)}</small>
      <pre>${escapeHtml(data.resolved ? (data.resolvedMarker || data.marker || "该 preview 的 proposed update 已标记整理。") : (data.alreadyMerged ? (data.marker || "该 preview 已追加到目标笔记。") : ([...(diff.addedPreview || []).map((line) => `+ ${line}`), ...(diff.removedPreview || []).map((line) => `- ${line}`)].join("\n") || "无差异")))}</pre>
    `;
    return;
  }
  if (data.kind === "merge") {
    const mergeDetail = data.reason ? `${data.reason}\n${data.marker || ""}` : (data.marker || "内容相同，无需追加。");
    panel.innerHTML = `
      <strong>${data.merged ? "已追加提案" : "未追加"}</strong>
      <small>${escapeHtml(data.strategy || data.reason || "")} · ${escapeHtml(data.bytesWritten || 0)} bytes</small>
      <pre>${escapeHtml(mergeDetail)}</pre>
    `;
    return;
  }
  if (data.kind === "suggest-integration") {
    const evidence = data.evidence || {};
    const choices = data.integrationChoices || [];
    const choiceText = choices.length
      ? `\n\n分支:\n${choices.map((choice) => `${choice.recommended ? "* " : "- "}${choice.id} ${choice.label || ""}: ${choice.action} 风险: ${choice.risk}`).join("\n")}`
      : "";
    const detail = [
      ...(data.reasons || []),
      "",
      `缺失 ${evidence.missingLineCount || 0} · 重合 ${evidence.overlapLineCount || 0}`,
      choiceText,
      data.draft ? `\n草稿:\n${data.draft}` : ""
    ].join("\n");
    panel.innerHTML = `
      <strong>整合建议</strong>
      <small>${escapeHtml(data.recommendation || "manual_review")} · ${escapeHtml(data.readOnly ? "只读" : "")}</small>
      <pre>${escapeHtml(detail)}</pre>
    `;
    return;
  }
  if (data.kind === "integrate") {
    const detail = data.reason ? `${data.reason}\n${data.marker || ""}` : (data.marker || "已追加 integrated update。");
    panel.innerHTML = `
      <strong>${data.integrated ? "已集成正文" : "未集成"}</strong>
      <small>${escapeHtml(data.resolved ? "已同步整理" : "未同步整理")} · ${escapeHtml(data.bytesWritten || 0)} bytes</small>
      <pre>${escapeHtml(detail)}</pre>
    `;
    return;
  }
  if (data.kind === "apply-choice") {
    const detail = data.reason ? `${data.reason}\n${data.message || ""}` : (data.marker || "已按建议执行。");
    panel.innerHTML = `
      <strong>${data.applied ? "已应用建议" : "未应用建议"}</strong>
      <small>${escapeHtml(data.choiceId || "")} · ${escapeHtml(data.safeWrite ? "安全写入" : "只读/人工")}</small>
      <pre>${escapeHtml(detail)}</pre>
    `;
    return;
  }
  if (data.kind === "confirm-replace") {
    const ranges = data.selectedRanges?.map((range) => `L${range.startLine}-${range.endLine}`).join(", ") || `L${data.startLine}-${data.endLine}`;
    const appliedRanges = data.appliedRanges?.map((range) => `L${range.appliedStartLine}-${range.appliedEndLine}`).join(", ") || "";
    const modeLabel = data.replacementMode === "separate_ranges" ? `分别替换 ${ranges}` : "";
    const detail = [
      ranges,
      modeLabel,
      appliedRanges ? `写入后 ${appliedRanges}` : "",
      data.combinedRange ? `覆盖摘要 L${data.combinedRange.startLine}-${data.combinedRange.endLine}` : "",
      data.resolvedMarker || "",
      `draft ${data.draftHash || ""}`,
      `bytes ${data.beforeBytes || 0} -> ${data.bytesWritten || 0}`
    ].filter(Boolean).join("\n");
    panel.innerHTML = `
      <strong>${data.replaced ? "已确认替换" : "未替换"}</strong>
      <small>${escapeHtml(data.safeWrite ? "安全写入" : "人工")} · ${escapeHtml(data.resolved ? "已整理" : "未同步整理")}</small>
      <pre>${escapeHtml(detail)}</pre>
    `;
    return;
  }
  if (data.kind === "replace-preview") {
    const candidates = data.candidates || [];
    const selectedIndexes = (state.selectedReplaceCandidateIndexes || []).filter((index) => index >= 0 && index < candidates.length);
    const activeIndexes = selectedIndexes.length ? selectedIndexes : (candidates.length ? [0] : []);
    const selected = activeIndexes.map((index) => candidates[index]).filter(Boolean);
    const candidateButtons = candidates.map((candidate, index) => `
      <button class="${activeIndexes.includes(index) ? "" : "secondary"}" type="button" data-action="replace-candidate" data-index="${index}">
        L${escapeHtml(candidate.startLine)}-${escapeHtml(candidate.endLine)} · ${escapeHtml(candidate.score || 0)}
      </button>
    `).join("");
    const selectedText = selected.length ? selected.map((candidate, offset) => [
      `已选 ${offset + 1}: L${candidate.startLine}-${candidate.endLine} · score ${candidate.score} · ${candidate.reason}`,
      `原文:\n${candidate.beforePreview}`
    ].join("\n")).join("\n\n") : "暂无可替换范围。";
    const detail = selected.length ? `${selectedText}\n\n草稿:\n${selected[0].afterPreview}` : "暂无可替换范围。";
    panel.innerHTML = `
      <strong>替换范围预览</strong>
      <small>${escapeHtml(data.reason || "preview")} · ${escapeHtml(data.readOnly ? "只读" : "")} · 候选 ${escapeHtml(candidates.length)} · 已选 ${escapeHtml(activeIndexes.length)}</small>
      <div class="inline-actions">${candidateButtons}</div>
      <pre>${escapeHtml(detail)}</pre>
    `;
    return;
  }
  if (data.kind === "status") {
    const counts = data.counts || {};
    const blocks = data.blocks || [];
    panel.innerHTML = `
      <strong>提案状态</strong>
      <small>待整理 ${escapeHtml(counts.proposed || 0)} · 已整理 ${escapeHtml(counts.resolved || 0)} · 总计 ${escapeHtml(counts.total || 0)}</small>
      <pre>${escapeHtml(blocks.map((block) => `${block.status} L${block.startLine}-${block.endLine || "?"}: ${block.marker}${block.resolutionNote ? `\n  ${block.resolutionNote}` : ""}`).join("\n") || "暂无 CoReading proposed update。")}</pre>
    `;
    return;
  }
  if (data.kind === "vault-status") {
    const counts = data.counts || {};
    const notes = data.notes || [];
    const skipped = data.skippedFiles || [];
    const pageText = `页 ${escapeHtml(data.offset || 0)}-${escapeHtml((data.offset || 0) + (data.scannedFiles || 0))}${data.hasMore ? ` · 下一页 ${escapeHtml(data.nextOffset)}` : ""}`;
    const skippedText = skipped.length ? `\n\n跳过文件:\n${skipped.map((file) => `${file.reason}: ${file.notePath} (${file.bytes} bytes)`).join("\n")}` : "";
    panel.innerHTML = `
      <strong>全库提案状态</strong>
      <small>待整理 ${escapeHtml(counts.proposed || 0)} · 已整理 ${escapeHtml(counts.resolved || 0)} · 笔记 ${escapeHtml(notes.length)} · 扫描 ${escapeHtml(data.scannedFiles || 0)} · ${pageText}</small>
      <pre>${escapeHtml((notes.flatMap((note) => (note.blocks || []).map((block) => `${block.status} ${note.notePath} L${block.startLine}-${block.endLine || "?"}: ${block.marker}${block.resolutionNote ? `\n  ${block.resolutionNote}` : ""}`)).join("\n") || "暂无 CoReading proposed update。") + skippedText)}</pre>
    `;
    return;
  }
  if (data.kind === "vault-snapshot") {
    const snapshot = data.snapshot || {};
    const counts = snapshot.counts || {};
    panel.innerHTML = `
      <strong>已保存快照</strong>
      <small>${escapeHtml(snapshot.label || snapshot.snapshotId || "")} · 待整理 ${escapeHtml(counts.proposed || 0)} · 已整理 ${escapeHtml(counts.resolved || 0)}</small>
      <pre>${escapeHtml([
        snapshot.snapshotId,
        `创建者: ${snapshot.createdBy || ""}`,
        `笔记: ${(snapshot.notes || []).length}`,
        `跳过: ${(snapshot.skippedFiles || []).length}`,
        `文件: ${data.snapshotPath || ""}`
      ].filter(Boolean).join("\n"))}</pre>
    `;
    return;
  }
  if (data.kind === "vault-snapshot-list") {
    const snapshots = data.snapshots || [];
    panel.innerHTML = `
      <strong>快照列表</strong>
      <small>总计 ${escapeHtml(data.total || 0)} · 页 ${escapeHtml(data.offset || 0)}-${escapeHtml((data.offset || 0) + snapshots.length)}</small>
      <pre>${escapeHtml(snapshots.map((snapshot) => {
        const counts = snapshot.counts || {};
        return `${snapshot.snapshotId} · ${snapshot.label || "未命名"} · proposed ${counts.proposed || 0} · resolved ${counts.resolved || 0} · notes ${snapshot.noteCount ?? (snapshot.notes || []).length}`;
      }).join("\n") || "暂无快照。")}</pre>
    `;
    return;
  }
  if (data.kind === "vault-snapshot-diff") {
    const delta = data.countDelta || {};
    const changes = data.changes || {};
    const filter = data.filter || {};
    const statusChanged = changes.statusChanged || [];
    const added = changes.added || [];
    const removed = changes.removed || [];
    const locatable = [
      ...statusChanged.map((item) => item.after || item.before),
      ...added,
      ...removed
    ].filter((item) => item?.notePath && item?.previewId);
    const detail = [
      `before: ${data.before?.snapshotId || ""}`,
      `after: ${data.after?.snapshotId || ""}`,
      "",
      `新增 blocks ${changes.addedCount || 0}`,
      `移除 blocks ${changes.removedCount || 0}`,
      `状态变化 ${changes.statusChangedCount || 0}`,
      "",
      ...statusChanged.map((item) => `${item.before?.notePath || ""} · ${item.before?.previewId || ""}: ${item.before?.status || "?"} -> ${item.after?.status || "?"}`),
      ...added.map((item) => `新增 ${item.notePath || ""} · ${item.previewId || ""} · ${item.status || ""}`),
      ...removed.map((item) => `移除 ${item.notePath || ""} · ${item.previewId || ""} · ${item.status || ""}`)
    ].join("\n");
    panel.innerHTML = `
      <strong>${data.filteredChanged === false ? "筛选后无变化" : (data.changed ? "快照有变化" : "快照无变化")}</strong>
      <small>${escapeHtml(filter.changeStatus === "proposed" ? "只看待整理" : "全部变化")} · proposed ${escapeHtml(delta.proposed || 0)} · resolved ${escapeHtml(delta.resolved || 0)} · notes ${escapeHtml(delta.notes || 0)}</small>
      <div class="inline-actions">
        ${filter.changeStatus === "proposed" && locatable.length ? `<button type="button" data-action="vault-diff-next">下一项</button>` : ""}
        ${locatable.map((item, index) => `<button class="secondary" type="button" data-action="vault-diff-locate" data-index="${index}">定位 ${escapeHtml(item.previewId || index + 1)}</button>`).join("")}
      </div>
      <pre>${escapeHtml(detail)}</pre>
    `;
    state.vaultDiffLocatable = locatable;
    return;
  }
  if (data.kind === "vault-index") {
    const index = data.index || {};
    const counts = index.counts || {};
    panel.innerHTML = `
      <strong>已建立索引</strong>
      <small>${escapeHtml(index.label || index.indexId || "")} · 待整理 ${escapeHtml(counts.proposed || 0)} · 已整理 ${escapeHtml(counts.resolved || 0)} · blocks ${escapeHtml(index.blockCount || 0)}</small>
      <pre>${escapeHtml([
        index.indexId,
        `创建者: ${index.createdBy || ""}`,
        `笔记: ${index.noteCount || 0}`,
        `跳过: ${(data.status?.skippedFiles || []).length}`,
        `文件: ${data.indexPath || ""}`
      ].filter(Boolean).join("\n"))}</pre>
    `;
    return;
  }
  if (data.kind === "vault-index-list") {
    const indexes = data.indexes || [];
    panel.innerHTML = `
      <strong>索引列表</strong>
      <small>总计 ${escapeHtml(data.total || 0)} · 页 ${escapeHtml(data.offset || 0)}-${escapeHtml((data.offset || 0) + indexes.length)}</small>
      <pre>${escapeHtml(indexes.map((index) => {
        const counts = index.counts || {};
        return `${index.indexId} · ${index.label || "未命名"} · proposed ${counts.proposed || 0} · resolved ${counts.resolved || 0} · blocks ${index.blockCount || 0}`;
      }).join("\n") || "暂无索引。")}</pre>
    `;
    return;
  }
  if (data.kind === "vault-index-get") {
    const blocks = data.blocks || [];
    const filter = data.filter || {};
    const locatable = blocks.filter((item) => item?.notePath && item?.previewId);
    panel.innerHTML = `
      <strong>${blocks.length ? "索引命中" : "索引无命中"}</strong>
      <small>${escapeHtml(filter.status === "proposed" ? "只看待整理" : filter.status || "all")} · 总计 ${escapeHtml(data.total || 0)} · 页 ${escapeHtml(data.offset || 0)}-${escapeHtml((data.offset || 0) + blocks.length)}</small>
      <div class="inline-actions">
        ${locatable.map((item, index) => `<button class="secondary" type="button" data-action="vault-index-locate" data-index="${index}">定位 ${escapeHtml(item.previewId || index + 1)}</button>`).join("")}
      </div>
      <pre>${escapeHtml(blocks.map((block) => `${block.status} ${block.notePath || ""} L${block.startLine}-${block.endLine || "?"}: ${block.marker}${block.resolutionNote ? `\n  ${block.resolutionNote}` : ""}`).join("\n") || "暂无索引 block。")}</pre>
    `;
    state.vaultIndexLocatable = locatable;
    return;
  }
  if (data.kind === "vault-index-refresh") {
    const delta = data.countDelta || {};
    const changes = data.changes || {};
    const statusChanged = changes.statusChanged || [];
    const added = changes.added || [];
    const removed = changes.removed || [];
    const detail = [
      `index: ${data.index?.indexId || ""}`,
      `recommendation: ${data.recommendation || ""}`,
      "",
      `新增 blocks ${changes.addedCount || 0}`,
      `移除 blocks ${changes.removedCount || 0}`,
      `状态变化 ${changes.statusChangedCount || 0}`,
      "",
      ...statusChanged.map((item) => `${item.before?.notePath || ""} · ${item.before?.previewId || ""}: ${item.before?.status || "?"} -> ${item.after?.status || "?"}`),
      ...added.map((item) => `新增 ${item.notePath || ""} · ${item.previewId || ""} · ${item.status || ""}`),
      ...removed.map((item) => `移除 ${item.notePath || ""} · ${item.previewId || ""} · ${item.status || ""}`)
    ].join("\n");
    panel.innerHTML = `
      <strong>${data.stale ? "索引已过期" : "索引仍新鲜"}</strong>
      <small>proposed ${escapeHtml(delta.proposed || 0)} · resolved ${escapeHtml(delta.resolved || 0)} · notes ${escapeHtml(delta.notes || 0)}</small>
      <pre>${escapeHtml(detail)}</pre>
    `;
    return;
  }
  if (data.kind === "vault-index-rebuilt") {
    const index = data.refreshedIndex || {};
    const previous = data.previousCheck || {};
    const delta = previous.countDelta || {};
    panel.innerHTML = `
      <strong>${data.refreshed ? "索引已重建" : "索引未重建"}</strong>
      <small>${escapeHtml(data.reason || "")} · proposed ${escapeHtml(delta.proposed || 0)} · resolved ${escapeHtml(delta.resolved || 0)}</small>
      <pre>${escapeHtml([
        `recommendation: ${data.recommendation || ""}`,
        `previous: ${previous.index?.indexId || ""}`,
        `new: ${index.indexId || ""}`,
        `blocks: ${index.blockCount || 0}`,
        `文件: ${data.indexPath || ""}`
      ].filter(Boolean).join("\n"))}</pre>
    `;
    return;
  }
  if (data.kind === "vault-sync-plan") {
    const counts = data.counts || {};
    const actions = data.actions || [];
    const safeActions = actions.filter((action) => action.recommendation === "mark_local_index_resolved_or_rebuild" || action.commandHint?.command === "obsidian_vault_index_refresh");
    const detail = actions.map((action) => [
      `${action.kind} ${action.notePath || ""} · ${action.previewId || ""}`,
      action.beforeStatus || action.afterStatus ? `  ${action.beforeStatus || "?"} -> ${action.afterStatus || "?"}` : `  ${action.status || ""}`,
      `  ${action.recommendation || ""}`,
      `  hint: ${action.commandHint?.command || ""}`
    ].join("\n")).join("\n\n");
    panel.innerHTML = `
      <strong>${actions.length ? "同步审阅计划" : "无需同步动作"}</strong>
      <small>总计 ${escapeHtml(counts.total || 0)} · 状态变化 ${escapeHtml(counts.statusChanged || 0)} · 新增 ${escapeHtml(counts.added || 0)} · 移除 ${escapeHtml(counts.removed || 0)}</small>
      <div class="inline-actions">
        ${safeActions.map((action, index) => `<button class="secondary" type="button" data-action="vault-sync-apply" data-index="${index}">应用 ${escapeHtml(action.previewId || action.actionId || index + 1)}</button>`).join("")}
      </div>
      <pre>${escapeHtml([
        `plan: ${data.planId || ""}`,
        `recommendation: ${data.recommendation || ""}`,
        `index: ${data.source?.indexId || ""}`,
        "",
        detail || "暂无动作。"
      ].join("\n"))}</pre>
    `;
    state.vaultSyncApplicable = safeActions;
    return;
  }
  if (data.kind === "vault-sync-action") {
    panel.innerHTML = `
      <strong>${data.applied ? "同步动作已应用" : "同步动作未应用"}</strong>
      <small>${escapeHtml(data.reason || data.appliedCommand || "")}</small>
      <pre>${escapeHtml(JSON.stringify(data.result || data.action || {}, null, 2))}</pre>
    `;
    return;
  }
  if (data.kind === "resolve") {
    panel.innerHTML = `
      <strong>${data.resolved ? "已标记整理" : "未标记"}</strong>
      <small>${escapeHtml(data.reason || "resolved")} · ${escapeHtml(data.bytesWritten || 0)} bytes</small>
      <pre>${escapeHtml(data.marker || data.previousMarker || "未找到待整理提案。")}</pre>
    `;
  }
}

function renderMetrics() {
  const snapshot = state.snapshot || {};
  $("bookCount").textContent = String((snapshot.books || []).length);
  $("planCount").textContent = String((snapshot.plans || []).length);
  $("reviewCount").textContent = String((snapshot.reviews || []).length);
  $("illustrationCount").textContent = String((snapshot.illustrations || []).length);
  $("cardCount").textContent = String(cardCount());
  $("previewCount").textContent = String((snapshot.sinkPreviews || []).filter((item) => item.status === "pending").length);
}

function renderAll() {
  renderMetrics();
  renderBooks();
  renderChunks();
  renderReader();
  renderReadingSession();
  renderReaderProgress();
  renderReadingNowBar();
  renderReadingQueue();
  renderPlanGuide();
  renderSelectionDock();
  renderEntityPeek();
  renderSelfCheck();
  renderChunkReview();
  renderTrailGuide();
  renderNovaReply();
  renderSearchResults();
  renderBacktrackEvidence();
  renderAnnotations();
  renderUserNotes();
  renderSubmissions();
  renderPlans();
  renderRunnerList();
  renderReviews();
  renderIllustrations();
  renderIllustrationSuggestions();
  renderCards();
  renderSinks();
  renderSinkDetail();
}

function getChunkId(chunk) {
  return String(chunk?.id || chunk?.chunkId || chunk?.chunk?.id || "");
}

async function loadChunks(bookId) {
  clearReaderSelection();
  if (!bookId) {
    state.chunks = [];
    state.selectedChunkId = "";
    state.currentChunk = null;
    state.annotations = [];
    state.userNotes = [];
    state.submissions = [];
    state.cardInbox = [];
    state.cardCollection = { items: [], bookCards: [] };
    state.selectedCard = null;
    state.selectedCardSaveResult = null;
    return;
  }
  state.chunks = (await query({ command: "list_chunks", bookId })) || [];
  if (!state.chunks.some((chunk) => getChunkId(chunk) === state.selectedChunkId)) {
    state.selectedChunkId = getChunkId(state.chunks[0]);
    state.currentChunk = null;
    state.annotations = [];
    state.userNotes = [];
    state.submissions = [];
  }
}

async function loadCards(bookId) {
  if (!bookId) {
    state.cardInbox = [];
    state.cardCollection = { items: [], bookCards: [] };
    state.selectedCard = null;
    state.cardDigestNotice = "";
    return;
  }
  const [inbox, collection] = await Promise.all([
    query({ command: "card_inbox", bookId, limit: 20 }),
    query({ command: "card_collection", bookId, limit: 24 }),
  ]);
  state.cardInbox = Array.isArray(inbox) ? inbox : [];
  state.cardCollection = collection || { items: [], bookCards: [] };
  pruneCardSaveResults();
  pruneCardPreviewResults();
  if (state.selectedCard && !findCardSummary(state.selectedCard.id)) {
    state.selectedCard = null;
    state.selectedCardSaveResult = null;
  }
}

async function readSelectedChunk() {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) return;
  const saved = readSavedReadingSession();
  clearReaderSelection();
  const [chunk, annotations, userNotes, submissions] = await Promise.all([
    query({ command: "read_chunk", bookId: selected.bookId, chunkId: state.selectedChunkId }),
    query({ command: "list_annotations", bookId: selected.bookId, chunkId: state.selectedChunkId, author: "claude" }),
    query({ command: "user_note_list", bookId: selected.bookId, chunkId: state.selectedChunkId }),
    query({ command: "list_submissions", bookId: selected.bookId, chunkId: state.selectedChunkId, limit: 10 }),
  ]);
  state.currentChunk = chunk;
  state.annotations = Array.isArray(annotations) ? annotations : [];
  state.userNotes = Array.isArray(userNotes?.notes) ? userNotes.notes : [];
  state.submissions = Array.isArray(submissions) ? submissions : [];
  renderReader();
  renderChunkReview();
  renderAnnotations();
  renderUserNotes();
  renderSubmissions();
  if (saved?.bookId === state.selectedBookId && saved?.chunkId === state.selectedChunkId) restoreSavedScroll(saved);
  else saveReadingSession();
  renderReaderProgress();
}

async function selectChunk(chunkId, autoRead = true) {
  clearReaderSelection();
  clearEntityPeek();
  state.selfCheck.hintVisible = false;
  state.selectedChunkId = chunkId;
  saveReadingSession({ chunkId, scrollTop: 0 });
  $("chunkSelect").value = chunkId;
  renderChunks();
  if (autoRead) await readSelectedChunk();
  renderReaderProgress();
}

async function moveChunk(delta) {
  const index = chunkOrder(state.selectedChunkId);
  if (index === null) return;
  const next = state.chunks[index + delta];
  const nextId = getChunkId(next);
  if (!nextId) return;
  await selectChunk(nextId, true);
}

async function continueReading() {
  const selected = activeBook();
  if (!selected) return;
  clearReaderSelection();
  clearEntityPeek();
  state.selfCheck.hintVisible = false;
  const result = await query({ command: "continue", bookId: selected.bookId });
  if (result?.completed) {
    log(result.message || "这本书已经读完。");
    return;
  }
  const nextId = getChunkId(result?.chunk || result);
  if (nextId) {
    state.selectedChunkId = nextId;
    $("chunkSelect").value = nextId;
  }
  state.currentChunk = result;
  state.annotations = [];
  state.userNotes = [];
  state.submissions = [];
  saveReadingSession({ chunkId: state.selectedChunkId, scrollTop: 0 });
  renderChunks();
  renderReader();
  await readSelectedChunk();
  log(result.message || `继续阅读 ${selected.title || selected.bookId} · ${state.selectedChunkId}`);
}

async function markReadAndMaybeAdvance({ advance = false } = {}) {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) return;
  const currentIndex = chunkOrder(state.selectedChunkId);
  const nextId = currentIndex === null ? "" : getChunkId(state.chunks[currentIndex + 1]);
  await command({ command: "mark_read", bookId: selected.bookId, chunkId: state.selectedChunkId });
  await loadSnapshot();
  if (advance && nextId) {
    await selectChunk(nextId, true);
    focusPanel(".reader-surface", "#chunkText");
    log(`已读完并进入下一段: ${nextId}`);
    return;
  }
  await readSelectedChunk();
  log(nextId ? `已标记读完，下一段是 ${nextId}。` : "已标记读完，本书到达最后一段。");
}

function focusPanel(selector, focusSelector) {
  const panel = document.querySelector(selector);
  if (!panel) return;
  openContainingDrawer(panel);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  const target = focusSelector ? document.querySelector(focusSelector) : null;
  if (target) {
    window.setTimeout(() => target.focus(), 250);
  }
}

function openContainingDrawer(element) {
  const node = typeof element === "string" ? document.querySelector(element) : element;
  const drawer = node?.closest?.("details");
  if (drawer) drawer.open = true;
}

async function loadSnapshot() {
  const loadId = ++state.snapshotLoadId;
  setStatus("同步中", "busy");
  try {
    const saved = readSavedReadingSession();
    const snapshot = await api("/api/snapshot");
    if (loadId !== state.snapshotLoadId) return;
    state.snapshot = snapshot;
    state.backgroundRunners = state.snapshot.backgroundRunners || [];
    const savedBookExists = saved?.bookId && state.snapshot.books?.some((book) => book.bookId === saved.bookId);
    if (!state.selectedBookId && savedBookExists) state.selectedBookId = saved.bookId;
    if (!state.selectedBookId && state.snapshot.books?.[0]) state.selectedBookId = state.snapshot.books[0].bookId;
    await loadChunks(state.selectedBookId);
    if (savedBookExists && saved.chunkId && state.chunks.some((chunk) => getChunkId(chunk) === saved.chunkId)) {
      state.selectedChunkId = saved.chunkId;
    }
    await loadCards(state.selectedBookId);
    syncCardPreviewStatusesFromSnapshot();
    if (state.selectedChunkId) await readSelectedChunk();
    renderAll();
    setStatus("已就绪", "ready");
  } catch (error) {
    setStatus("同步失败");
    log(error.message || String(error));
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileFormat(file) {
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".epub")) return "epub";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  return "txt";
}

function bookIdFromFile(file) {
  return String(file?.name || "imported-book")
    .replace(/\.[^.]+$/, "")
    .trim()
    .replace(/[^\w.\-\u4e00-\u9fff]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `book-${Date.now()}`;
}

function pastedBookFilename(title, format) {
  const safeTitle = String(title || `pasted-book-${Date.now()}`)
    .trim()
    .replace(/[^\w.\-\u4e00-\u9fff]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || `pasted-book-${Date.now()}`;
  return `${safeTitle}.${format === "markdown" ? "md" : "txt"}`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function importFile(file, options) {
  const maxBytes = 1_250_000;
  if (file.size > maxBytes) {
    throw new Error("sidecar 当前单次导入上限约 1.25MB；大书请先用命令行 import_*，或调大 CO_READING_SIDECAR_MAX_BODY_BYTES。");
  }
  const buffer = await file.arrayBuffer();
  return query({
    command: "import_file",
    filename: file.name,
    format: fileFormat(file),
    bookId: bookIdFromFile(file),
    dataBase64: arrayBufferToBase64(buffer),
    title: options.title || undefined,
    author: options.author || undefined,
    maxChars: options.maxChars || undefined,
    headingRegex: options.headingRegex || undefined,
    overwrite: options.overwrite,
  });
}

async function openImportedBook(imported) {
  const bookId = imported?.bookId || imported?.book?.bookId || "";
  if (!bookId) {
    await loadSnapshot();
    return;
  }
  state.selectedBookId = bookId;
  state.selectedChunkId = imported.firstChunkId || "";
  state.currentChunk = null;
  state.annotations = [];
  state.userNotes = [];
  state.submissions = [];
  state.searchResults = [];
  await loadSnapshot();
  state.selectedBookId = bookId;
  if (imported.firstChunkId) state.selectedChunkId = imported.firstChunkId;
  await loadChunks(bookId);
  await loadCards(bookId);
  if (state.selectedChunkId) await readSelectedChunk();
  renderAll();
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;
  event.stopPropagation();
  const action = target.dataset.action;
  const id = target.dataset.id;
  target.disabled = true;
  try {
    if (action === "copy-book-progress") {
      const result = await query({ command: "progress", bookId: id });
      const progress = result.progress || result.book || result;
      const book = (state.snapshot?.books || []).find((item) => item.bookId === id) || {};
      const chunksRead = progress.chunksRead ?? book.chunksRead ?? 0;
      const chunkCount = progress.chunkCount ?? book.chunkCount ?? 0;
      const percent = chunkCount ? Math.round((Number(chunksRead) / Number(chunkCount)) * 100) : 0;
      const summary = [
        `book: ${progress.title || book.title || id}`,
        `bookId: ${progress.bookId || book.bookId || id}`,
        `chunksRead: ${chunksRead}`,
        `chunkCount: ${chunkCount}`,
        `percent: ${percent}%`,
        `lastChunkId: ${progress.lastChunkId || progress.currentChunkId || book.lastChunkId || ""}`,
        `updatedAt: ${progress.updatedAt || book.updatedAt || ""}`,
        "",
        "raw:",
        JSON.stringify(progress, null, 2).slice(0, 1800)
      ].join("\n");
      await copyTextToClipboard(summary);
      log(`已复制阅读进度: ${id}`);
      target.disabled = false;
      return;
    }
    if (action === "card-open") {
      state.selectedCard = findCardSummary(id) || { id };
      state.selectedCardSaveResult = state.cardSaveResults[id] || null;
      renderCardDetail();
      return;
    }
    if (action === "card-copy-context") {
      const card = findCardSummary(id) || (state.selectedCard?.id === id ? state.selectedCard : null) || { id };
      const selected = activeBook();
      const saved = state.cardSaveResults[id] || (state.selectedCard?.id === id ? state.selectedCardSaveResult : null);
      const preview = state.cardPreviewResults[id] || {};
      const summary = [
        `cardId: ${card.id || id}`,
        `title: ${card.title || card.kicker || card.message || ""}`,
        `book: ${selected?.title || selected?.bookId || card.bookId || ""}`,
        `bookId: ${card.bookId || selected?.bookId || ""}`,
        `chunkId: ${card.chunkId || ""}`,
        `scope: ${card.scope || ""}`,
        `status: ${card.status || ""}`,
        `savedPath: ${cardSavedPath(saved)}`,
        `previewId: ${preview.previewId || ""}`,
        `previewStatus: ${preview.status || ""}`,
        "",
        "quote:",
        card.quote || "",
        "",
        "note:",
        card.note || card.message || ""
      ].join("\n");
      await copyTextToClipboard(summary);
      setCardDigestStatus(`已复制阅读卡片: ${card.title || card.kicker || id}`);
      target.disabled = false;
      return;
    }
    if (action === "card-fill-review") {
      await fillReviewFromCard(id);
      target.disabled = false;
      return;
    }
    if (action === "card-copy-decision") {
      const card = findCardSummary(id) || (state.selectedCard?.id === id ? state.selectedCard : null);
      const selected = activeBook();
      if (!selected || !card) throw new Error("当前没有可复制决策的阅读卡片。");
      const packet = cardDecisionPacket(card, selected);
      await copyTextToClipboard(JSON.stringify(packet, null, 2));
      setCardDigestStatus(`已复制卡片决策包: ${card.title || card.kicker || id}`);
      target.disabled = false;
      return;
    }
    if (action === "card-fill-backtrack") {
      const card = findCardSummary(id) || (state.selectedCard?.id === id ? state.selectedCard : null);
      const selected = activeBook();
      if (!selected || !card) throw new Error("当前没有可回溯的阅读卡片。");
      const payload = prepareBacktrackFromCard(card, selected);
      const packet = {
        type: "card-to-backtrack-params",
        cardId: card.id || id,
        book: selected.title || selected.bookId,
        source: {
          chunkId: card.chunkId || "",
          quote: card.quote || "",
          note: card.note || card.message || "",
        },
        payload,
      };
      await copyTextToClipboard(JSON.stringify(packet, null, 2));
      log(`已填入卡片回溯参数: ${card.id || id}`);
      target.disabled = false;
      return;
    }
    if (action === "card-create-backtrack-plan") {
      const card = findCardSummary(id) || (state.selectedCard?.id === id ? state.selectedCard : null);
      const selected = activeBook();
      if (!selected || !card) throw new Error("当前没有可生成计划的阅读卡片。");
      const payload = prepareBacktrackFromCard(card, selected);
      const result = await command({
        ...payload,
        command: "interest_backtrack",
        createPlan: true,
        budget: { maxChunksPerStep: 2, maxAnnotationsPerChunk: 2 },
        annotationDensity: "medium",
        sinkPolicy: { requireApproval: true, obsidian: true },
        createdBy: "CoReadingSidecar",
      });
      state.backtrackEvidence = result.data || result.raw || result;
      renderBacktrackEvidence();
      await loadSnapshot();
      log(result.raw || result.data || result);
      target.disabled = false;
      return;
    }
    if (action === "card-sink-backtrack") {
      const card = findCardSummary(id) || (state.selectedCard?.id === id ? state.selectedCard : null);
      const selected = activeBook();
      if (!selected || !card) throw new Error("当前没有可沉淀回溯的阅读卡片。");
      saveSinkSettings();
      const payload = prepareBacktrackFromCard(card, selected);
      const result = await command({
        ...payload,
        command: "sink_preview_create_from_backtrack",
        requireApproval: true,
        vaultPath: $("vaultPath").value || undefined,
        createdBy: "CoReadingSidecar",
      });
      state.backtrackEvidence = result.data?.backtrack || result.raw?.backtrack || null;
      renderBacktrackEvidence();
      await loadSnapshot();
      const preview = result.data?.preview || result.data?.previews?.[0] || result.raw?.preview || result.raw?.previews?.[0] || null;
      if (preview?.previewId) {
        state.selectedSinkPreview = await loadSinkPreview(preview.previewId);
        state.selectedSinkDiff = null;
        renderSinkDetail();
      }
      log(result.raw || result.data || result);
      target.disabled = false;
      return;
    }
    if (action === "copy-annotation") {
      const item = state.annotations[Number(target.dataset.index || 0)];
      if (!item) throw new Error("边注不存在。");
      const selected = activeBook();
      const summary = [
        `book: ${selected?.title || selected?.bookId || item.bookId || ""}`,
        `bookId: ${selected?.bookId || item.bookId || ""}`,
        `chunkId: ${item.chunkId || state.selectedChunkId || ""}`,
        `author: ${item.author || "reader"}`,
        `kind: ${item.kind || "annotation"}`,
        `quote: ${item.quote || ""}`,
        `note: ${item.note || ""}`
      ].join("\n");
      await copyTextToClipboard(summary);
      log(`已复制段落边注: ${item.chunkId || state.selectedChunkId || ""}`);
      target.disabled = false;
      return;
    }
    if (action === "copy-runner-artifacts") {
      const runner = runnerForPlan(id);
      const plan = (state.snapshot?.plans || []).find((item) => item.planId === id) || {};
      const result = runner.lastResult || {};
      const runs = result.runs || [];
      const reviewIds = runs.map((run) => run.reviewId).filter(Boolean);
      const sinkPreviewIds = runs.flatMap((run) => run.sinkPreviewIds || []).filter(Boolean);
      const packet = {
        type: "runner-artifacts",
        planId: id,
        plan: {
          title: plan.title || "",
          mode: plan.mode || "",
          status: plan.status || "",
          currentStepIndex: plan.currentStepIndex || 0,
          stepCount: plan.stepCount || 0,
        },
        runner: {
          status: runner.status || "idle",
          tickCount: runner.tickCount || 0,
          executedCount: runner.executedCount || 0,
          stoppedReason: runner.stoppedReason || "",
          lastError: runner.lastError || result.runner?.error || null,
        },
        reviewIds,
        sinkPreviewIds,
        runs,
        nextStep: result.nextStep || null,
      };
      await copyTextToClipboard(JSON.stringify(packet, null, 2));
      log(`已复制后台工件: ${id}`);
      target.disabled = false;
      return;
    }
    if (action === "open-runner-artifact") {
      const runner = runnerForPlan(id);
      const result = runner.lastResult || {};
      const previewId = previewIdFromResult(result);
      if (previewId) {
        state.selectedSinkPreview = await loadSinkPreview(previewId);
        state.selectedSinkDiff = null;
        renderSinkDetail();
        log(`已打开后台沉淀预览: ${previewId}`);
        target.disabled = false;
        return;
      }
      const reviewId = (result.runs || []).map((run) => run.reviewId).filter(Boolean).at(-1);
      if (!reviewId) throw new Error("后台结果没有可打开的评价或沉淀预览。");
      const reviewResult = await query({ command: "review_get", reviewId });
      const review = reviewResult.review || reviewResult.fullReview || reviewResult.data?.review || reviewResult.data?.fullReview || reviewResult;
      const sourceRange = review.sourceRange || {};
      const summary = [
        `reviewId: ${review.reviewId || reviewId}`,
        `title: ${review.title || ""}`,
        `bookId: ${review.bookId || ""}`,
        `range: ${sourceRange.startChunkId || review.startChunkId || ""} -> ${sourceRange.endChunkId || review.endChunkId || ""}`,
        "",
        "summary:",
        review.summary || "",
      ].join("\n");
      await copyTextToClipboard(summary);
      log(`已复制后台评价工件: ${review.reviewId || reviewId}`);
      target.disabled = false;
      return;
    }
    if (action === "fill-review-from-annotation") {
      const item = state.annotations[Number(target.dataset.index || 0)];
      await fillReviewFromAnnotationLike(item, "annotation");
      target.disabled = false;
      return;
    }
    if (action === "copy-user-note") {
      const item = state.userNotes[Number(target.dataset.index || 0)];
      if (!item) throw new Error("用户笔记不存在。");
      const selected = activeBook();
      const summary = [
        `book: ${selected?.title || selected?.bookId || item.bookId || ""}`,
        `bookId: ${selected?.bookId || item.bookId || ""}`,
        `chunkId: ${item.chunkId || state.selectedChunkId || ""}`,
        `status: ${item.status || "open"}`,
        `kind: ${item.kind || "note"}`,
        `quote: ${item.quote || ""}`,
        `note: ${item.note || item.text || ""}`
      ].join("\n");
      await copyTextToClipboard(summary);
      log(`已复制用户阅读笔记: ${item.chunkId || state.selectedChunkId || ""}`);
      target.disabled = false;
      return;
    }
    if (action === "fill-review-from-user-note") {
      const item = state.userNotes[Number(target.dataset.index || 0)];
      await fillReviewFromAnnotationLike(item, "user-note");
      target.disabled = false;
      return;
    }
    if (action === "copy-review") {
      const result = await query({ command: "review_get", reviewId: id });
      const review = result.review || result.fullReview || result.data?.review || result.data?.fullReview || result;
      const sourceRange = review.sourceRange || {};
      const summary = [
        `reviewId: ${review.reviewId || id}`,
        `title: ${review.title || ""}`,
        `bookId: ${review.bookId || ""}`,
        `planId: ${review.planId || ""}`,
        `status: ${review.status || ""}`,
        `range: ${sourceRange.startChunkId || review.startChunkId || ""} -> ${sourceRange.endChunkId || review.endChunkId || ""}`,
        "",
        "summary:",
        review.summary || "",
        "",
        "observations:",
        ...(review.observations || []).map((item, index) => `${index + 1}. ${item.text || item}`),
        "",
        "questions:",
        ...(review.questions || []).map((item, index) => `${index + 1}. ${item.text || item}`),
        "",
        "quotes:",
        ...(review.quotes || []).map((item, index) => `${index + 1}. ${item.quote || item.text || item}`),
        "",
        "nextActions:",
        ...(review.nextActions || []).map((item, index) => `${index + 1}. ${item.text || item}`)
      ].join("\n");
      await copyTextToClipboard(summary);
      log(`已复制范围评价: ${review.reviewId || id}`);
      target.disabled = false;
      return;
    }
    if (action === "fill-plan-from-review") {
      await fillPlanFromReview(id);
      target.disabled = false;
      return;
    }
    if (action === "copy-review-follow-up-decision") {
      await copyReviewFollowUpDecision(id);
      target.disabled = false;
      return;
    }
    if (action === "review-preview-sink") {
      if (!id) throw new Error("评价缺少 reviewId。");
      saveSinkSettings();
      const result = await command({
        command: "sink_preview_create",
        reviewId: id,
        requireApproval: true,
        vaultPath: $("vaultPath").value || undefined,
        createdBy: "CoReadingSidecar",
      });
      await loadSnapshot();
      const preview = result.data?.previews?.[0] || result.raw?.previews?.[0] || result.previews?.[0] || null;
      if (preview?.previewId) {
        state.selectedSinkPreview = await loadSinkPreview(preview.previewId);
        state.selectedSinkDiff = null;
        renderSinkDetail();
      }
      log(result.raw || result.data || result);
      target.disabled = false;
      return;
    }
    if (action === "card-save") {
      const result = await command({ command: "save_card", cardId: id });
      state.selectedCard = findCardSummary(id) || state.selectedCard;
      state.selectedCardSaveResult = rememberCardSaveResult(id, result.data || result.raw || null);
      renderCardDetail();
      return;
    }
    if (action === "card-copy-path") {
      const saved = state.cardSaveResults[id] || (state.selectedCard?.id === id ? state.selectedCardSaveResult : null);
      const savedPath = cardSavedPath(saved);
      await copyTextToClipboard(savedPath);
      log(`已复制卡片保存路径: ${savedPath}`);
      return;
    }
    if (action === "card-copy-obsidian") {
      const saved = state.cardSaveResults[id] || (state.selectedCard?.id === id ? state.selectedCardSaveResult : null);
      const embed = obsidianImageEmbed(cardSavedPath(saved));
      await copyTextToClipboard(embed);
      log(`已复制 Obsidian 图片引用: ${embed}`);
      return;
    }
    if (action === "card-copy-note") {
      const card = findCardSummary(id) || state.selectedCard || { id };
      const saved = state.cardSaveResults[id] || (state.selectedCard?.id === id ? state.selectedCardSaveResult : null);
      const markdown = obsidianCardMarkdown(card, saved);
      await copyTextToClipboard(markdown);
      log(`已复制 Obsidian 卡片笔记: ${card.title || card.kicker || id}`);
      return;
    }
    if (action === "card-preview-sink") {
      const selected = activeBook();
      const card = findCardSummary(id) || state.selectedCard || { id };
      if (!selected?.bookId) throw new Error("请先选择一本书。");
      saveSinkSettings();
      const result = await command({
        command: "sink_preview_create_from_cards",
        bookId: selected.bookId,
        cardIds: [id],
        limit: 200,
        title: `${card.title || card.kicker || id} 卡片沉淀`,
        vaultPath: $("vaultPath").value || undefined,
        requireApproval: true,
        createdBy: "CoReadingSidecar"
      });
      await openPreviewFromResult(result, { refreshSnapshot: true });
      const previewId = sinkPreviewIdFromResult(result);
      rememberCardPreviewResult(id, previewId, "pending", previewSummaryFields(state.selectedSinkPreview));
      setCardDigestStatus(previewId ? `已生成单卡片预览：${previewId}` : "已生成单卡片预览。");
      renderCardDetail();
      log(result);
      return;
    }
    if (action === "card-open-preview") {
      const previewId = state.cardPreviewResults[id]?.previewId;
      if (!previewId) throw new Error("该卡片尚无已生成的沉淀预览。");
      try {
        state.selectedSinkPreview = await loadSinkPreview(previewId);
        state.selectedSinkDiff = null;
        renderSinkDetail();
        setCardDigestStatus(`已打开单卡片预览：${previewId}`);
      } catch (error) {
        clearStaleCardPreview(id, previewId, error.message || String(error));
        throw error;
      }
      return;
    }
    if (action === "card-copy-preview-id") {
      const previewId = state.cardPreviewResults[id]?.previewId;
      if (!previewId) throw new Error("该卡片尚无已生成的沉淀预览。");
      await copyTextToClipboard(previewId);
      setCardDigestStatus(`已复制单卡片预览ID：${previewId}`);
      return;
    }
    if (action === "card-copy-preview-target") {
      const preview = state.cardPreviewResults[id];
      const targetPath = preview?.notePath || preview?.target || "";
      if (!targetPath) throw new Error("该卡片尚无可复制的沉淀目标。");
      await copyTextToClipboard(targetPath);
      setCardDigestStatus(`已复制单卡片沉淀目标：${targetPath}`);
      return;
    }
    if (action === "card-copy-preview-content") {
      const previewId = state.cardPreviewResults[id]?.previewId;
      if (!previewId) throw new Error("该卡片尚无已生成的沉淀预览。");
      try {
        const preview = await loadSinkPreview(previewId);
        const content = typeof preview.content === "string" ? preview.content : JSON.stringify(preview.content || preview, null, 2);
        await copyTextToClipboard(content);
        setCardDigestStatus(`已复制单卡片预览正文：${previewId}`);
      } catch (error) {
        clearStaleCardPreview(id, previewId, error.message || String(error));
        throw error;
      }
      return;
    }
    if (action === "card-read-obsidian") {
      const previewId = state.cardPreviewResults[id]?.previewId;
      if (!previewId) throw new Error("该卡片尚无已生成的沉淀预览。");
      try {
        state.selectedSinkPreview = await loadSinkPreview(previewId);
      } catch (error) {
        clearStaleCardPreview(id, previewId, error.message || String(error));
        throw error;
      }
      state.selectedSinkDiff = await readSelectedObsidianAfterExecute();
      renderSinkDetail();
      renderObsidianDiffPanel();
      setCardDigestStatus(`已回读单卡片沉淀目标：${previewId}`);
      log(state.selectedSinkDiff);
      return;
    }
    if (action === "card-approve-preview") {
      const previewId = state.cardPreviewResults[id]?.previewId;
      if (!previewId) throw new Error("该卡片尚无已生成的沉淀预览。");
      try {
        await command({ command: "sink_preview_update", previewId, status: "approved", updatedBy: "CoReadingSidecar" });
        state.selectedSinkPreview = await loadSinkPreview(previewId);
        rememberCardPreviewResult(id, previewId, state.selectedSinkPreview.status || "approved", previewSummaryFields(state.selectedSinkPreview));
        state.selectedSinkDiff = null;
        renderSinkDetail();
        renderCards();
        setCardDigestStatus(`已批准单卡片预览：${previewId}`);
      } catch (error) {
        clearStaleCardPreview(id, previewId, error.message || String(error));
        throw error;
      }
      return;
    }
    if (action === "card-execute-preview") {
      const previewId = state.cardPreviewResults[id]?.previewId;
      if (!previewId) throw new Error("该卡片尚无已生成的沉淀预览。");
      saveSinkSettings();
      await command({
        command: "sink_execute",
        previewId,
        vaultPath: $("vaultPath").value || undefined,
        dailyNoteRoot: $("dailyNoteRoot").value || undefined,
        vcpMemoryRoot: $("vcpMemoryRoot").value || undefined,
        updatedBy: "CoReadingSidecar",
      });
      try {
        state.selectedSinkPreview = await loadSinkPreview(previewId);
        rememberCardPreviewResult(id, previewId, state.selectedSinkPreview.status || "exported", previewSummaryFields(state.selectedSinkPreview));
        await refreshExecutedSinkPreview(previewId);
        await loadSnapshot();
        renderCards();
        setCardDigestStatus(`已执行单卡片预览写入：${previewId}`);
      } catch (error) {
        clearStaleCardPreview(id, previewId, error.message || String(error));
        throw error;
      }
      return;
    }
    if (action === "card-dismiss") {
      await command({ command: "dismiss_card", cardId: id });
      forgetCardSaveResult(id);
      forgetCardPreviewResult(id);
      const selected = activeBook();
      await loadCards(selected?.bookId);
      renderCards();
      return;
    }
    if (action === "replace-candidate") {
      const index = Number(target.dataset.index || 0);
      const current = new Set(state.selectedReplaceCandidateIndexes || []);
      if (current.has(index)) current.delete(index);
      else current.add(index);
      state.selectedReplaceCandidateIndexes = [...current].sort((left, right) => left - right);
      target.disabled = false;
      renderObsidianDiffPanel();
      return;
    }
    if (action === "vault-diff-locate") {
      const index = Number(target.dataset.index || 0);
      const item = (state.vaultDiffLocatable || [])[index];
      if (!item?.notePath || !item?.previewId) throw new Error("快照差异缺少可定位 block。");
      const result = await query({
        command: "obsidian_note_status",
        vaultPath: $("vaultPath").value || undefined,
        notePath: item.notePath,
        blockPreviewId: item.previewId,
        includeContentPreview: false
      });
      state.selectedSinkDiff = { kind: "status", ...result, locatedFromSnapshotDiff: true };
      target.disabled = false;
      renderObsidianDiffPanel();
      log(result);
      return;
    }
    if (action === "vault-diff-next") {
      const item = (state.vaultDiffLocatable || [])[0];
      if (!item?.notePath || !item?.previewId) throw new Error("当前没有待定位的快照变化。");
      const result = await query({
        command: "obsidian_note_status",
        vaultPath: $("vaultPath").value || undefined,
        notePath: item.notePath,
        blockPreviewId: item.previewId,
        includeContentPreview: false
      });
      state.selectedSinkDiff = { kind: "status", ...result, locatedFromSnapshotDiff: true };
      target.disabled = false;
      renderObsidianDiffPanel();
      log(result);
      return;
    }
    if (action === "vault-index-locate") {
      const index = Number(target.dataset.index || 0);
      const item = (state.vaultIndexLocatable || [])[index];
      if (!item?.notePath || !item?.previewId) throw new Error("索引缺少可定位 block。");
      const result = await query({
        command: "obsidian_note_status",
        vaultPath: $("vaultPath").value || undefined,
        notePath: item.notePath,
        blockPreviewId: item.previewId,
        includeContentPreview: false
      });
      state.selectedSinkDiff = { kind: "status", ...result, locatedFromVaultIndex: true };
      target.disabled = false;
      renderObsidianDiffPanel();
      log(result);
      return;
    }
    if (action === "vault-sync-apply") {
      const index = Number(target.dataset.index || 0);
      const result = await query(vaultSyncActionPayload(index));
      state.selectedSinkDiff = { kind: "vault-sync-action", ...result };
      target.disabled = false;
      renderObsidianDiffPanel();
      log(result);
      return;
    }
    if (action === "copy-plan-next-decision") {
      await copyPlanNextDecision(id);
      target.disabled = false;
      return;
    }
    if (action === "next") await command({ command: "plan_next_step", planId: id, claim: true });
    if (action === "copy-plan-execute-decision") {
      await copyPlanExecuteDecision(id);
      return;
    }
    if (action === "execute") {
      const result = await command({ command: "plan_execute_step", planId: id });
      await openPreviewFromResult(result, { refreshSnapshot: true });
      await copyPlanExecutionArtifacts(id, result);
      return;
    }
    if (action === "copy-plan-run-decision") {
      await copyPlanRunDecision(id);
      target.disabled = false;
      return;
    }
    if (action === "run") {
      const result = await command({ command: "plan_run", planId: id, maxSteps: 3 });
      await openPreviewFromResult(result, { refreshSnapshot: true });
      await copyPlanExecutionArtifacts(id, result);
      return;
    }
    if (action === "runner-start" || action === "runner-retry") {
      const endpoint = action === "runner-retry" ? "/api/runner/retry" : "/api/runner/start";
      await api(endpoint, {
        method: "POST",
        body: JSON.stringify({ planId: id, intervalMs: 2000, maxStepsPerTick: 1, maxRetries: 1, retryDelayMs: 2000 }),
      });
      await loadSnapshot();
      return;
    }
    if (action === "copy-runner-decision") {
      await copyRunnerDecision(id);
      target.disabled = false;
      return;
    }
    if (action === "runner-stop") {
      await api("/api/runner/stop", {
        method: "POST",
        body: JSON.stringify({ planId: id }),
      });
      await loadSnapshot();
      return;
    }
    if (action === "copy-runner") {
      const runner = state.backgroundRunners.find((item) => item.planId === id) || {};
      const plan = (state.snapshot?.plans || []).find((item) => item.planId === id) || {};
      const error = runner.lastError?.message || runner.lastResult?.runner?.error?.message || "";
      const resultSummary = runner.lastResult
        ? JSON.stringify(runner.lastResult, null, 2).slice(0, 2400)
        : "none";
      const planSummary = [
        `title: ${plan.title || ""}`,
        `bookId: ${plan.bookId || ""}`,
        `mode: ${plan.mode || ""}`,
        `status: ${plan.status || ""}`,
        `progress: ${plan.currentStepIndex || 0}/${(plan.steps || []).length || plan.stepCount || 0}`
      ].join("\n");
      const summary = [
        `runnerPlanId: ${runner.planId || id}`,
        `runnerStatus: ${runner.status || "idle"}`,
        `tickCount: ${runner.tickCount || 0}`,
        `executedCount: ${runner.executedCount || 0}`,
        `retry: ${runner.retryCount || 0}/${runner.maxRetries || 0}`,
        `nextRunAt: ${runner.nextRunAt || ""}`,
        `stoppedReason: ${runner.stoppedReason || ""}`,
        `error: ${error}`,
        "",
        "plan:",
        planSummary,
        "",
        "lastResult:",
        resultSummary
      ].join("\n");
      await copyTextToClipboard(summary);
      log(`已复制后台 runner: ${runner.planId || id}`);
      target.disabled = false;
      return;
    }
    if (action === "copy-plan-status") {
      const result = await query({ command: "plan_get", planId: id });
      const plan = result.plan || {};
      const nextStep = result.nextStep || null;
      const suggested = result.suggestedCommands || [];
      const counts = Object.entries(plan.statusCounts || {})
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
      const steps = (plan.steps || []).map((step, index) => [
        `${index + 1}. ${step.stepId || ""} · ${step.type || ""} · ${step.status || ""}`,
        step.title ? `   title: ${step.title}` : "",
        step.chunkIds?.length ? `   chunks: ${step.chunkIds.join(", ")}` : "",
        step.result?.summary ? `   result: ${String(step.result.summary).slice(0, 240)}` : ""
      ].filter(Boolean).join("\n"));
      const history = (plan.history || []).slice(-8).map((item) => `${item.at || ""} · ${item.event || ""}${item.stepId ? ` · ${item.stepId}` : ""}${item.status ? ` · ${item.status}` : ""}`);
      const summary = [
        `planId: ${plan.planId || id}`,
        `title: ${plan.title || ""}`,
        `book: ${plan.bookTitle || plan.bookId || ""}`,
        `mode: ${plan.mode || ""}`,
        `status: ${plan.status || ""}`,
        `progress: ${plan.currentStepIndex || 0}/${(plan.steps || []).length || plan.stepCount || 0}`,
        `statusCounts: ${counts}`,
        "",
        "nextStep:",
        nextStep ? `${nextStep.stepId || ""} · ${nextStep.type || ""} · ${nextStep.title || ""}` : "none",
        "",
        "suggestedCommands:",
        ...suggested.map((command) => JSON.stringify(command)),
        "",
        "steps:",
        ...steps,
        "",
        "recentHistory:",
        ...history
      ].join("\n");
      await copyTextToClipboard(summary);
      log(`已复制阅读计划状态: ${plan.planId || id}`);
      target.disabled = false;
      return;
    }
    if (action === "copy-plan-next-step") {
      const result = await query({ command: "plan_get", planId: id });
      const plan = result.plan || {};
      const nextStep = result.nextStep || null;
      const suggested = result.suggestedCommands || [];
      const packet = {
        type: "plan-next-step-context",
        planId: plan.planId || id,
        title: plan.title || "",
        bookId: plan.bookId || "",
        mode: plan.mode || "",
        status: plan.status || "",
        progress: {
          currentStepIndex: plan.currentStepIndex || 0,
          stepCount: (plan.steps || []).length || plan.stepCount || 0,
        },
        nextStep,
        suggestedCommands: suggested,
      };
      await copyTextToClipboard(JSON.stringify(packet, null, 2));
      log(`已复制计划下一步: ${nextStep?.stepId || id}`);
      target.disabled = false;
      return;
    }
    if (action === "copy-plan-artifacts") {
      await copyPlanArtifacts(id);
      target.disabled = false;
      return;
    }
    if (action === "open-plan-artifact") {
      await openPlanArtifact(id);
      target.disabled = false;
      return;
    }
    if (action === "fill-review-from-plan-next-step") {
      await fillReviewFromPlanNextStep(id);
      target.disabled = false;
      return;
    }
    if (action === "copy-plan-status-decision") {
      await copyPlanStatusDecision(id);
      target.disabled = false;
      return;
    }
    if (action === "pause") await command({ command: "plan_update", planId: id, status: "paused" });
    if (action === "resume") await command({ command: "plan_update", planId: id, status: "active" });
    if (action === "preview") {
      const result = await query({ command: "sink_preview_get", previewId: id });
      state.selectedSinkPreview = result.preview || result;
      state.selectedSinkDiff = null;
      renderSinkDetail();
      renderSinks();
      return;
    }
    if (action === "copy-sink-preview") {
      const preview = await loadSinkPreview(id);
      const destination = preview.destination || {};
      const content = typeof preview.content === "string"
        ? preview.content
        : JSON.stringify(preview.content || preview, null, 2);
      const summary = [
        `previewId: ${preview.previewId || id}`,
        `status: ${preview.status || ""}`,
        `target: ${preview.target || ""}`,
        `sourceType: ${preview.sourceType || ""}`,
        `notePath: ${destination.notePath || destination.path || preview.notePath || ""}`,
        `createdAt: ${preview.createdAt || ""}`,
        `updatedAt: ${preview.updatedAt || ""}`,
        "",
        "contentPreview:",
        content.slice(0, 2200)
      ].join("\n");
      await copyTextToClipboard(summary);
      log(`已复制沉淀预览: ${preview.previewId || id}`);
      target.disabled = false;
      return;
    }
    if (action === "copy-sink-source") {
      await copySinkPreviewSource(id);
      target.disabled = false;
      return;
    }
    if (action === "copy-sink-row-decision") {
      const preview = await loadSinkPreview(id);
      const packet = sinkDecisionPacket(preview, {
        currentContent: typeof preview.content === "string" ? preview.content : JSON.stringify(preview.content || preview, null, 2),
      });
      await copyTextToClipboard(JSON.stringify(packet, null, 2));
      log(`已复制沉淀行决策包: ${preview.previewId || id}`);
      target.disabled = false;
      return;
    }
    if (action === "approve") {
      await command({ command: "sink_preview_update", previewId: id, status: "approved", updatedBy: "CoReadingSidecar" });
      await refreshSelectedSinkPreview(id);
      await loadSnapshot();
      renderSinks();
    }
    if (action === "submission") {
      const result = await query({ command: "read_submission", submissionId: id });
      log(result);
      return;
    }
    if (action === "copy-submission") {
      const result = await query({ command: "read_submission", submissionId: id });
      const submission = result.submission || result.data?.submission || result.data || result;
      const notes = submission.notes || submission.userNotes || result.notes || [];
      const context = submission.context || result.context || {};
      const noteLines = Array.isArray(notes)
        ? notes.map((note, index) => `${index + 1}. ${note.quote || ""}\n   ${note.note || note.text || ""}`)
        : [JSON.stringify(notes, null, 2)];
      const summary = [
        `submissionId: ${submission.id || submission.submissionId || id}`,
        `bookId: ${submission.bookId || context.bookId || ""}`,
        `chunkId: ${submission.chunkId || context.chunkId || ""}`,
        `submittedAt: ${submission.submittedAt || ""}`,
        `contextMode: ${submission.contextMode || ""}`,
        "",
        "notes:",
        ...noteLines,
        "",
        "context:",
        JSON.stringify(context, null, 2).slice(0, 2400)
      ].join("\n");
      await copyTextToClipboard(summary);
      log(`已复制用户笔记提交: ${submission.id || submission.submissionId || id}`);
      target.disabled = false;
      return;
    }
    if (action === "sink") {
      saveSinkSettings();
      await command({
        command: "sink_execute",
        previewId: id,
        vaultPath: $("vaultPath").value || undefined,
        dailyNoteRoot: $("dailyNoteRoot").value || undefined,
        vcpMemoryRoot: $("vcpMemoryRoot").value || undefined,
        updatedBy: "CoReadingSidecar",
      });
      await refreshExecutedSinkPreview(id);
    }
    await loadSnapshot();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    target.disabled = false;
  }
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-footprint-id]");
  if (!target) return;
  focusReadingFootprint(target.dataset.footprintId || "");
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action='open-search'][data-chunk-id]");
  if (!target) return;
  await selectChunk(target.dataset.chunkId, true);
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-action='collect-backtrack-card']");
  if (!target) return;
  void collectBacktrackCard();
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-action='copy-backtrack-card-decision']");
  if (!target) return;
  const selected = activeBook();
  const evidence = state.backtrackEvidence;
  if (!selected || !evidence) return;
  const packet = backtrackCardDecisionPacket(selected, evidence);
  void copyTextToClipboard(JSON.stringify(packet, null, 2))
    .then(() => log(`已复制回溯收藏决策包: ${evidence.query || evidence.anchorChunkId || ""}`))
    .catch((error) => log(error.message || String(error)));
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-action='copy-backtrack-evidence']");
  if (!target) return;
  void copyBacktrackEvidence().catch((error) => log(error.message || String(error)));
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-action='fill-plan-from-backtrack']");
  if (!target) return;
  void fillPlanFromBacktrackEvidence().catch((error) => log(error.message || String(error)));
});

$("copySearchResultsBtn").addEventListener("click", async () => {
  $("copySearchResultsBtn").disabled = true;
  try {
    const selected = activeBook();
    if (!state.searchResults.length) throw new Error("暂无搜索结果可复制。");
    const queryText = $("searchInput").value.trim();
    const lines = state.searchResults.map((item, index) => {
      const chunkId = item.chunkId || item.id || item.chunk?.id || "";
      const title = item.title || item.chunk?.title || "";
      const snippet = item.snippet || item.text || item.chunk?.text || "";
      const score = item.score ?? item.rank ?? "";
      return [
        `${index + 1}. ${chunkId}${title ? ` · ${title}` : ""}${score !== "" ? ` · score=${score}` : ""}`,
        snippet ? `   ${String(snippet).slice(0, 360)}` : ""
      ].filter(Boolean).join("\n");
    });
    const summary = [
      `book: ${selected?.title || selected?.bookId || ""}`,
      `bookId: ${selected?.bookId || ""}`,
      `query: ${queryText}`,
      `resultCount: ${state.searchResults.length}`,
      "",
      "results:",
      ...lines
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制搜索结果: ${queryText || "empty query"}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copySearchResultsBtn").disabled = !state.searchResults.length;
  }
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-fill-quote]");
  if (!target) return;
  fillQuoteFromSelection(target.dataset.fillQuote);
});

$("readingQueueList").addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id || "";
  target.disabled = true;
  try {
    if (action === "queue-read") {
      await selectChunk(id, true);
      focusPanel(".reader-surface", "#chunkText");
      return;
    }
    if (action === "queue-plan") {
      await openQueuePlan(id);
      return;
    }
    if (action === "queue-sink") {
      await openQueueSink(id);
      return;
    }
    if (action === "queue-card") {
      await openQueueCard(id);
      return;
    }
  } catch (error) {
    log(error.message || String(error));
  } finally {
    target.disabled = false;
    renderReadingQueue();
  }
});

$("queueRefreshBtn").addEventListener("click", async () => {
  $("queueRefreshBtn").disabled = true;
  try {
    state.planNextCache = {};
    await loadSnapshot();
  } finally {
    $("queueRefreshBtn").disabled = false;
  }
});

$("planGuideOpenRangeBtn").addEventListener("click", async () => {
  $("planGuideOpenRangeBtn").disabled = true;
  try {
    await openPlanGuideRange();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderPlanGuide();
  }
});

$("planGuideReviewBtn").addEventListener("click", async () => {
  $("planGuideReviewBtn").disabled = true;
  try {
    await reviewPlanGuideStep();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderPlanGuide();
  }
});

$("planGuideFullBtn").addEventListener("click", async () => {
  $("planGuideFullBtn").disabled = true;
  try {
    await openPlanGuideFull();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderPlanGuide();
  }
});

$("chunkText").addEventListener("mouseup", () => {
  window.setTimeout(() => {
    captureReaderSelection();
  }, 0);
});
$("chunkText").addEventListener("keyup", (event) => {
  if (event.key === "Shift" || event.key.startsWith("Arrow")) {
    captureReaderSelection();
  }
});
$("selectionAskNovaBtn").addEventListener("click", () => {
  if (!state.readerSelection?.text) captureReaderSelection();
  $("novaPrompt").value = buildNovaPromptFromSelection();
  focusPanel(".nova-reading-box", "#novaPrompt");
  $("askNovaBtn").click();
});
$("selectionEntityBtn").addEventListener("click", () => {
  if (!state.readerSelection?.text) captureReaderSelection();
  if (!openEntityPeek()) {
    log("请先选中一个人物、地点、设定或关键词。");
    return;
  }
  focusPanel("#entityPeek", "#entityAskNovaBtn");
});
$("selectionNoteBtn").addEventListener("click", () => {
  if (!state.readerSelection?.text) captureReaderSelection();
  fillFormFromSelection("userNoteForm");
  focusPanel("#userNoteForm", '#userNoteForm textarea[name="note"]');
});
$("selectionAnnotateBtn").addEventListener("click", () => {
  if (!state.readerSelection?.text) captureReaderSelection();
  fillFormFromSelection("annotationForm");
  focusPanel("#annotationForm", '#annotationForm textarea[name="note"]');
});
$("selectionClearBtn").addEventListener("click", () => {
  clearReaderSelection();
});

$("entityAskNovaBtn").addEventListener("click", () => {
  if (!state.entityPeek && !openEntityPeek()) return;
  $("novaPrompt").value = entityNovaPrompt();
  focusPanel(".nova-reading-box", "#novaPrompt");
  $("askNovaBtn").click();
});

$("entityBacktrackBtn").addEventListener("click", async () => {
  try {
    if (!state.entityPeek && !openEntityPeek()) return;
    $("searchInput").value = state.entityPeek.term;
    await runTrailGuideBacktrack();
  } catch (error) {
    log(error.message || String(error));
  }
});

$("entityCollectCardBtn").addEventListener("click", async () => {
  try {
    if (!state.entityPeek && !openEntityPeek()) return;
    const selected = activeBook();
    const peek = state.entityPeek;
    if (!selected || !peek) return;
    const result = await command({
      command: "collect_card",
      bookId: selected.bookId,
      chunkId: state.selectedChunkId,
      quote: state.readerSelection?.text || peek.term,
      quoteOffset: state.readerSelection?.offset ?? undefined,
      note: peek.context || `速查词条: ${peek.term}`,
      title: peek.term,
      kicker: "人物与设定速查",
      art: "ripple",
    });
    await loadCards(selected.bookId);
    renderCards();
    log(result.raw || result.data || result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("entityCloseBtn").addEventListener("click", () => {
  clearEntityPeek();
});

$("selfCheckAnswer").addEventListener("input", () => {
  saveSelfCheckDraft();
});

$("selfCheckRefreshBtn").addEventListener("click", () => {
  state.selfCheck.variant += 1;
  state.selfCheck.hintVisible = false;
  renderSelfCheck();
  $("selfCheckAnswer").focus();
});

$("selfCheckHintBtn").addEventListener("click", () => {
  state.selfCheck.hintVisible = !state.selfCheck.hintVisible;
  renderSelfCheck();
});

$("selfCheckAskNovaBtn").addEventListener("click", () => {
  const answer = String($("selfCheckAnswer").value || "").trim();
  if (!answer) {
    log("先写下你的自测回答，再让 Nova 点评。");
    $("selfCheckAnswer").focus();
    return;
  }
  saveSelfCheckDraft(answer);
  $("novaPrompt").value = selfCheckNovaPrompt(answer);
  focusPanel(".nova-reading-box", "#novaPrompt");
  $("askNovaBtn").click();
});

$("selfCheckSaveNoteBtn").addEventListener("click", async () => {
  const button = $("selfCheckSaveNoteBtn");
  button.disabled = true;
  try {
    const selected = activeBook();
    const answer = String($("selfCheckAnswer").value || "").trim();
    if (!selected || !state.selectedChunkId) throw new Error("请先选择一本书和 chunk。");
    if (!answer) throw new Error("先写下你的自测回答。");
    const check = currentSelfCheck();
    const text = currentChunkText();
    const quote = text.slice(0, Math.min(180, text.length)).trim() || state.selectedChunkId;
    await command({
      command: "user_note_create",
      bookId: selected.bookId,
      chunkId: state.selectedChunkId,
      quote,
      quoteOffset: 0,
      note: `读后自测：${check.question}\n\n我的回答：${answer}`,
      kind: "self-check",
      tags: ["co-reading", "self-check"],
      status: "open"
    });
    saveSelfCheckDraft("");
    $("selfCheckAnswer").value = "";
    await readSelectedChunk();
    log("已把自测回答存成用户笔记。");
  } catch (error) {
    log(error.message || String(error));
  } finally {
    button.disabled = false;
    renderSelfCheck();
  }
});

$("selfCheckClearBtn").addEventListener("click", () => {
  $("selfCheckAnswer").value = "";
  saveSelfCheckDraft("");
  $("selfCheckAnswer").focus();
});

$("chunkReviewCard").addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-chunk-review-action]");
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  const action = target.dataset.chunkReviewAction;
  const id = target.dataset.id || "";
  try {
    if (action === "copy-review") {
      await copyTextToClipboard(chunkReviewSummary());
      log(`已复制段落回看: ${state.selectedChunkId || ""}`);
      return;
    }
    if (action === "notes") {
      focusPanel("#userNoteList", "#userNoteList");
      return;
    }
    if (action === "first-card") {
      await openFirstChunkReviewCard();
      return;
    }
    if (action === "card") {
      await openQueueCard(id);
      return;
    }
    if (action === "first-sink") {
      await openFirstChunkReviewSink();
      return;
    }
    if (action === "sink") {
      await openQueueSink(id);
    }
  } catch (error) {
    log(error.message || String(error));
  }
});

$("trailGuideBacktrackBtn").addEventListener("click", async () => {
  $("trailGuideBacktrackBtn").disabled = true;
  try {
    await runTrailGuideBacktrack();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderTrailGuide();
  }
});

$("trailGuideOpenBtn").addEventListener("click", async () => {
  $("trailGuideOpenBtn").disabled = true;
  try {
    await openTrailGuideRange();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderTrailGuide();
  }
});

$("trailGuidePlanBtn").addEventListener("click", async () => {
  $("trailGuidePlanBtn").disabled = true;
  try {
    await planTrailGuide();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderTrailGuide();
  }
});

$("trailGuideSinkBtn").addEventListener("click", async () => {
  $("trailGuideSinkBtn").disabled = true;
  try {
    await sinkTrailGuide();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderTrailGuide();
  }
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-shift-plan-range]");
  if (!target) return;
  const [edge, rawDelta] = String(target.dataset.shiftPlanRange || "").split(":");
  if (edge !== "start" && edge !== "end") return;
  shiftPlanRange(edge, Number(rawDelta || 0));
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-shift-review-range]");
  if (!target) return;
  const [edge, rawDelta] = String(target.dataset.shiftReviewRange || "").split(":");
  if (edge !== "start" && edge !== "end") return;
  shiftReviewRange(edge, Number(rawDelta || 0));
});

async function createBacktrackPlan(anchorChunkId) {
  const selected = activeBook();
  if (!selected || !anchorChunkId) return;
  const payload = backtrackPayload(selected.bookId, anchorChunkId);
  try {
    const result = await command({
      ...payload,
      command: "interest_backtrack",
      createPlan: true,
      budget: { maxChunksPerStep: 2, maxAnnotationsPerChunk: 2 },
      annotationDensity: "medium",
      sinkPolicy: { requireApproval: true, obsidian: true },
      createdBy: "CoReadingSidecar",
    });
    state.backtrackEvidence = result.data || result.raw || result;
    renderBacktrackEvidence();
    await loadSnapshot();
    log(result.raw || result.data || result);
  } catch (error) {
    log(error.message || String(error));
  }
}

async function runTrailGuideBacktrack() {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) throw new Error("请先选择一本书和 chunk。");
  const query = trailGuideQuery();
  if (query) $("searchInput").value = query;
  const result = await command({
    ...backtrackPayload(selected.bookId, state.selectedChunkId),
    command: "interest_backtrack",
    createPlan: false,
    includeEvidence: true,
  });
  state.backtrackEvidence = result.data || result.raw || result;
  renderBacktrackEvidence();
  focusPanel(".trail-guide", "#trailGuideOpenBtn");
}

async function openTrailGuideRange() {
  const evidence = state.backtrackEvidence;
  if (!evidence) throw new Error("当前没有回溯证据。");
  const firstRange = evidence.evidence?.rangeSummaries?.[0] || evidence.ranges?.[0] || {};
  const targetChunkId = firstRange.startChunkId || evidence.chunkIds?.[0] || evidence.anchorChunkId;
  if (!targetChunkId) throw new Error("回溯证据没有可打开的 chunk。");
  await selectChunk(targetChunkId, true);
  const startInput = document.querySelector('#planForm input[name="startChunkId"]');
  const endInput = document.querySelector('#planForm input[name="endChunkId"]');
  if (startInput) startInput.value = firstRange.startChunkId || targetChunkId;
  if (endInput) endInput.value = firstRange.endChunkId || firstRange.chunkIds?.at(-1) || targetChunkId;
  renderPlanRangeStatus();
  focusPanel(".reader-surface", "#chunkText");
  log(`已打开回溯范围: ${firstRange.label || targetChunkId}`);
}

async function planTrailGuide() {
  const evidence = state.backtrackEvidence;
  if (!evidence) throw new Error("当前没有回溯证据。");
  await fillPlanFromBacktrack();
  $("planReviewDrawer").open = true;
  focusPanel("#planForm", '#planForm input[name="query"]');
}

async function sinkTrailGuide() {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) throw new Error("请先选择一本书和 chunk。");
  const evidence = state.backtrackEvidence;
  if (!evidence) throw new Error("当前没有回溯证据。");
  saveSinkSettings();
  const result = await command({
    ...backtrackPayload(selected.bookId, evidence.anchorChunkId || state.selectedChunkId),
    command: "sink_preview_create_from_backtrack",
    vaultPath: $("vaultPath").value || undefined,
    requireApproval: true,
    createdBy: "CoReadingSidecar",
  });
  state.backtrackEvidence = result.data?.backtrack || result.raw?.backtrack || evidence;
  renderBacktrackEvidence();
  const previewId = previewIdFromResult(result);
  if (previewId) await openQueueSink(previewId);
}

function backtrackPayload(bookId, anchorChunkId) {
  const queryText = $("searchInput").value.trim();
  const before = clampNumber($("backtrackBefore").value, 0, 20, 2);
  const after = clampNumber($("backtrackAfter").value, 0, 20, 2);
  const maxRanges = clampNumber($("backtrackMaxRanges").value, 1, 20, 4);
  const mergeGap = clampNumber($("backtrackMergeGap").value, 0, 10, 1);
  $("backtrackStatus").textContent = `窗口 ${before}/${after} · 最多 ${maxRanges} 组范围 · 合并 ${mergeGap}`;
  return {
    bookId,
    query: queryText || undefined,
    anchorChunkId,
    before,
    after,
    maxRanges,
    mergeGap,
    includeEvidence: true
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action='backtrack-search'][data-chunk-id]");
  if (!target) return;
  await createBacktrackPlan(target.dataset.chunkId);
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest(".illustration-row[data-illustration-id]");
  if (!target) return;
  try {
    const result = await query({ command: "illustration_get", illustrationId: target.dataset.illustrationId });
    state.selectedIllustration = result.illustration || result;
    renderIllustrationDetail();
  } catch (error) {
    log(error.message || String(error));
  }
});

$("refreshBtn").addEventListener("click", loadSnapshot);
$("clearLogBtn").addEventListener("click", () => log("等待共读操作。"));
$("cardForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  clearFormError(formEl);
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) {
    setFormError(formEl, "请先选择一本书和一个 chunk。");
    return;
  }
  const form = new FormData(formEl);
  const { quote } = quotePayloadFromForm(form);
  const note = String(form.get("note") || "").trim();
  if (!quote && !note) {
    setFormError(formEl, "阅读卡片需要引用或注记。");
    return;
  }
  const current = state.currentChunk?.chunk || state.currentChunk || {};
  try {
    const result = await command({
      command: "collect_card",
      bookId: selected.bookId,
      chunkId: state.selectedChunkId,
      title: String(form.get("title") || "").trim() || current.title || state.selectedChunkId,
      kicker: String(form.get("kicker") || "").trim() || "收获了一枚回声书签",
      quote,
      note,
      art: String(form.get("art") || "fold"),
      source: "sidecar",
    });
    state.selectedCard = result.data?.id ? result.data : null;
    formEl.reset();
    await loadCards(selected.bookId);
    renderCards();
  } catch (error) {
    setFormError(formEl, error.message || String(error));
  }
});
$("saveCardBtn").addEventListener("click", async () => {
  if (!state.selectedCard?.id) return;
  try {
    const selected = activeBook();
    const result = await command({ command: "save_card", cardId: state.selectedCard.id });
    state.selectedCardSaveResult = rememberCardSaveResult(state.selectedCard.id, result.data || result.raw || null);
    await loadCards(selected?.bookId);
    renderCards();
  } catch (error) {
    log(error.message || String(error));
  }
});
$("dismissCardBtn").addEventListener("click", async () => {
  const selected = activeBook();
  if (!state.selectedCard?.id || !selected) return;
  try {
    await command({ command: "dismiss_card", cardId: state.selectedCard.id });
    forgetCardSaveResult(state.selectedCard.id);
    await loadCards(selected.bookId);
    state.selectedCard = null;
    renderCards();
  } catch (error) {
    log(error.message || String(error));
  }
});
$("cardDigestBtn").addEventListener("click", async () => {
  const selected = activeBook();
  if (!selected) return;
  try {
    saveSinkSettings();
    const result = await command({
      command: "sink_preview_create_from_cards",
      bookId: selected.bookId,
      limit: 24,
      title: `${selected.title || selected.bookId} 阅读卡片 digest`,
      vaultPath: $("vaultPath").value || undefined,
      requireApproval: true,
      createdBy: "CoReadingSidecar"
    });
    const previewId = previewIdFromResult(result);
    const opened = await openPreviewFromResult(result, { refreshSnapshot: true });
    $("cardDigestStatus").textContent = opened && previewId ? `已生成 digest 预览：${previewId}` : "已生成 digest 预览。";
  } catch (error) {
    $("cardDigestStatus").textContent = error.message || String(error);
    log(error.message || String(error));
  }
});

$("copyCardDigestBtn").addEventListener("click", async () => {
  try {
    const preview = state.selectedSinkPreview;
    if (preview?.sourceType !== "card_digest") throw new Error("当前没有打开的阅读卡片 digest 预览。");
    const destination = preview.destination || {};
    const content = typeof preview.content === "string" ? preview.content : JSON.stringify(preview.content || preview, null, 2);
    const cardLines = (preview.cardSummaries || preview.cards || []).map((card, index) => [
      `${index + 1}. ${card.title || card.cardId || card.id || "card"}`,
      card.chunkId ? `   chunk: ${card.chunkId}` : "",
      card.quote ? `   quote: ${String(card.quote).slice(0, 240)}` : "",
      card.note ? `   note: ${String(card.note).slice(0, 240)}` : ""
    ].filter(Boolean).join("\n"));
    const summary = [
      `previewId: ${preview.previewId || ""}`,
      `status: ${preview.status || ""}`,
      `target: ${preview.target || ""}`,
      `notePath: ${destination.notePath || destination.path || preview.notePath || ""}`,
      `cardCount: ${cardLines.length}`,
      "",
      "cards:",
      ...cardLines,
      "",
      "contentPreview:",
      content.slice(0, 1800)
    ].join("\n");
    await copyTextToClipboard(summary);
    setCardDigestStatus(`已复制阅读卡片 digest 摘要：${preview.previewId || ""}`);
  } catch (error) {
    setCardDigestStatus(error.message || String(error));
    log(error.message || String(error));
  }
});

$("copyIllustrationBtn").addEventListener("click", async () => {
  $("copyIllustrationBtn").disabled = true;
  try {
    const item = state.selectedIllustration;
    if (!item) throw new Error("请先选择一张插图。");
    const placement = item.placement || {};
    const safety = item.safety || {};
    const summary = [
      `illustrationId: ${item.illustrationId || ""}`,
      `title: ${item.title || ""}`,
      `bookId: ${item.bookId || ""}`,
      `status: ${item.status || ""}`,
      `sourceType: ${item.sourceType || ""}`,
      `assetUri: ${item.assetUri || ""}`,
      `thumbnailUri: ${item.thumbnailUri || ""}`,
      `stylePreset: ${item.stylePreset || ""}`,
      `aspectRatio: ${item.aspectRatio || ""}`,
      "",
      "placement:",
      `position: ${placement.position || ""}`,
      `layer: ${placement.layer || ""}`,
      `chunkId: ${placement.chunkId || ""}`,
      `startChunkId: ${placement.startChunkId || ""}`,
      `endChunkId: ${placement.endChunkId || ""}`,
      "",
      "safety:",
      `spoilerBoundary: ${safety.spoilerBoundary || ""}`,
      `spoilerPolicy: ${safety.spoilerPolicy || ""}`,
      "",
      "raw:",
      JSON.stringify(item, null, 2).slice(0, 2400)
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制插图: ${item.illustrationId || ""}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copyIllustrationBtn").disabled = !state.selectedIllustration;
  }
});

$("importForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  clearFormError(formEl);
  const form = new FormData(formEl);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) {
    setFormError(formEl, "请选择要导入的 TXT/Markdown/EPUB 文件。");
    return;
  }
  try {
    setStatus("导入中", "busy");
    const imported = await importFile(file, {
      title: String(form.get("title") || "").trim(),
      author: String(form.get("author") || "").trim(),
      headingRegex: String(form.get("headingRegex") || "").trim(),
      maxChars: Number(form.get("maxChars") || 12000),
      overwrite: form.get("overwrite") === "on",
    });
    log(imported);
    formEl.reset();
    await openImportedBook(imported);
  } catch (error) {
    setStatus("导入失败");
    setFormError(formEl, error.message || String(error));
  }
});
$("pasteImportForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  clearFormError(formEl);
  const form = new FormData(formEl);
  const content = String(form.get("content") || "").trim();
  const title = String(form.get("title") || "").trim() || `粘贴文本 ${new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
  const format = String(form.get("format") || "txt");
  if (content.length < 20) {
    setFormError(formEl, "至少粘贴 20 个字符再开始读。");
    return;
  }
  try {
    setStatus("导入中", "busy");
    const file = new File([content], pastedBookFilename(title, format), { type: format === "markdown" ? "text/markdown" : "text/plain" });
    const imported = await importFile(file, {
      title,
      author: String(form.get("author") || "").trim(),
      headingRegex: String(form.get("headingRegex") || "").trim(),
      maxChars: Number(form.get("maxChars") || 8000),
      overwrite: false,
    });
    log(imported);
    formEl.reset();
    await openImportedBook(imported);
    focusPanel(".reader-surface", "#chunkText");
  } catch (error) {
    setStatus("导入失败");
    setFormError(formEl, error.message || String(error));
  }
});
$("saveSinkContentBtn").addEventListener("click", async () => {
  await updateSelectedSinkPreviewContent({ status: null, note: "sidecar content edit" });
});
$("saveApproveSinkPreviewBtn").addEventListener("click", async () => {
  await updateSelectedSinkPreviewContent({ status: "approved", note: "sidecar content edit and approve" });
});
$("sinkGuideApproveBtn").addEventListener("click", async () => {
  await updateSelectedSinkPreviewContent({ status: "approved", note: "sink guide approve after preview" });
});
$("executeSinkPreviewBtn").addEventListener("click", async () => {
  await executeSelectedSinkPreview();
});
$("sinkGuideExecuteBtn").addEventListener("click", async () => {
  await executeSelectedSinkPreview();
});
$("copySinkContextBtn").addEventListener("click", async () => {
  $("copySinkContextBtn").disabled = true;
  try {
    const preview = state.selectedSinkPreview;
    if (!preview) throw new Error("请先选择沉淀预览。");
    const destination = preview.destination || {};
    const context = {
      type: "sink-preview-context",
      previewId: preview.previewId || "",
      status: preview.status || "",
      target: preview.target || "",
      sourceType: preview.sourceType || "",
      destination,
      notePath: destination.notePath || destination.path || preview.notePath || "",
      rawTextIncluded: preview.rawTextIncluded !== false,
      settings: sinkSettingsPayload(),
      content: $("sinkPreviewContent").value || "",
      raw: preview,
    };
    await copyTextToClipboard(JSON.stringify(context, null, 2));
    log(`已复制沉淀上下文: ${preview.previewId || ""}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copySinkContextBtn").disabled = !state.selectedSinkPreview;
  }
});
$("copySinkSourceBtn").addEventListener("click", async () => {
  $("copySinkSourceBtn").disabled = true;
  try {
    await copySinkPreviewSource(state.selectedSinkPreview?.previewId);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copySinkSourceBtn").disabled = !state.selectedSinkPreview;
  }
});
$("fillSinkSourceBtn").addEventListener("click", async () => {
  $("fillSinkSourceBtn").disabled = true;
  try {
    await fillFromSinkPreviewSource(state.selectedSinkPreview?.previewId);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("fillSinkSourceBtn").disabled = !state.selectedSinkPreview;
  }
});
$("copySinkContentBtn").addEventListener("click", async () => {
  $("copySinkContentBtn").disabled = true;
  try {
    const preview = state.selectedSinkPreview;
    if (!preview) throw new Error("请先选择沉淀预览。");
    await copyTextToClipboard($("sinkPreviewContent").value || "");
    log(`已复制当前沉淀正文: ${preview.previewId || ""}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copySinkContentBtn").disabled = !state.selectedSinkPreview;
  }
});
$("copySinkReviewPacketBtn").addEventListener("click", async () => {
  $("copySinkReviewPacketBtn").disabled = true;
  try {
    const preview = state.selectedSinkPreview;
    if (!preview) throw new Error("请先选择沉淀预览。");
    const destination = preview.destination || {};
    const content = $("sinkPreviewContent").value || "";
    const summary = [
      "Nova 沉淀审稿包",
      "",
      `previewId: ${preview.previewId || ""}`,
      `status: ${preview.status || ""}`,
      `target: ${preview.target || ""}`,
      `sourceType: ${preview.sourceType || ""}`,
      `notePath: ${destination.notePath || destination.path || preview.notePath || ""}`,
      `rawTextIncluded: ${preview.rawTextIncluded === false ? "false" : "true"}`,
      "",
      "审稿目标:",
      "- 判断是否适合写入 Obsidian/DailyNote/VCPMemory。",
      "- 保持当前书籍语境、引用边界和 Nova 审美一致性。",
      "- 如需修改，直接给出可替换的沉淀正文。",
      "",
      "当前正文:",
      content
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制 Nova 沉淀审稿包: ${preview.previewId || ""}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copySinkReviewPacketBtn").disabled = !state.selectedSinkPreview;
  }
});
$("copySinkAuditContextBtn").addEventListener("click", async () => {
  $("copySinkAuditContextBtn").disabled = true;
  try {
    await copySinkAuditContext();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copySinkAuditContextBtn").disabled = !state.selectedSinkPreview;
  }
});

$("copySinkDecisionPacketBtn").addEventListener("click", async () => {
  $("copySinkDecisionPacketBtn").disabled = true;
  try {
    const preview = state.selectedSinkPreview;
    if (!preview) throw new Error("请先选择沉淀预览。");
    const packet = sinkDecisionPacket(preview);
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制沉淀决策包: ${preview.previewId || ""}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copySinkDecisionPacketBtn").disabled = !state.selectedSinkPreview;
  }
});

$("copySinkSavePayloadBtn").addEventListener("click", async () => {
  $("copySinkSavePayloadBtn").disabled = true;
  try {
    const preview = state.selectedSinkPreview;
    if (!preview || preview.status === "exported") throw new Error("请先选择可保存的沉淀预览。");
    const packet = sinkSavePayloadPacket(preview, {
      status: null,
      note: "sidecar content edit",
      type: "sink-save-payload",
    });
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制沉淀保存参数: ${preview.previewId || ""}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copySinkSavePayloadBtn").disabled = !state.selectedSinkPreview || state.selectedSinkPreview.status === "exported";
  }
});

$("copySinkSaveApprovePayloadBtn").addEventListener("click", async () => {
  $("copySinkSaveApprovePayloadBtn").disabled = true;
  try {
    const preview = state.selectedSinkPreview;
    if (!preview || preview.status === "exported") throw new Error("请先选择可批准的沉淀预览。");
    const packet = sinkSavePayloadPacket(preview, {
      status: "approved",
      note: "sidecar content edit and approve",
      type: "sink-save-approve-payload",
    });
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制沉淀批准参数: ${preview.previewId || ""}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copySinkSaveApprovePayloadBtn").disabled = !state.selectedSinkPreview || state.selectedSinkPreview.status === "exported";
  }
});

async function updateSelectedSinkPreviewContent({ status, note }) {
  const preview = state.selectedSinkPreview;
  if (!preview) return;
  try {
    await command(sinkSavePayload(preview, { status, note }));
    const result = await query({ command: "sink_preview_get", previewId: preview.previewId });
    state.selectedSinkPreview = result.preview || result;
    renderSinkDetail();
    await loadSnapshot();
  } catch (error) {
    log(error.message || String(error));
  }
}

function sinkSavePayload(preview, { status, note }) {
  return {
    command: "sink_preview_update",
    previewId: preview.previewId,
    status: status || preview.status || "pending",
    content: $("sinkPreviewContent").value,
    note,
    updatedBy: "CoReadingSidecar",
  };
}

function sinkSavePayloadPacket(preview, { status, note, type }) {
  const destination = preview.destination || {};
  return {
    type,
    previewId: preview.previewId || "",
    target: preview.target || "",
    notePath: destination.notePath || destination.path || preview.notePath || "",
    payload: sinkSavePayload(preview, { status, note }),
    auditContextHint: { command: "copySinkAuditContext", previewId: preview.previewId || "" },
  };
}

function sinkExecutePayloadPacket(preview) {
  const destination = preview.destination || {};
  return {
    type: "sink-execute-payload",
    previewId: preview.previewId || "",
    target: preview.target || "",
    notePath: destination.notePath || destination.path || preview.notePath || "",
    payload: sinkExecutePayload(preview),
    auditContextHint: { command: "copySinkAuditContext", previewId: preview.previewId || "" },
  };
}

function sinkRejectPayloadPacket(preview) {
  const destination = preview.destination || {};
  return {
    type: "sink-reject-payload",
    previewId: preview.previewId || "",
    target: preview.target || "",
    notePath: destination.notePath || destination.path || preview.notePath || "",
    payload: sinkRejectPayload(preview),
    obsidianState: state.selectedSinkDiff
      ? {
          kind: state.selectedSinkDiff.kind || "",
          recommendation: state.selectedSinkDiff.recommendation || "",
          resolved: state.selectedSinkDiff.resolved,
          alreadyMerged: state.selectedSinkDiff.alreadyMerged,
        }
      : null,
    auditContextHint: { command: "copySinkAuditContext", previewId: preview.previewId || "" },
  };
}

function sinkDecisionPacket(preview, options = {}) {
  const editable = preview.status !== "exported";
  const approved = preview.status === "approved";
  const isObsidian = preview.target === "obsidian";
  return {
    type: "sink-decision-packet",
    reviewGoal: "审阅当前沉淀预览，决定保存、批准、写入、驳回或先做 Obsidian/vault 巡检。",
    previewId: preview.previewId || "",
    target: preview.target || "",
    status: preview.status || "",
    sourceType: preview.sourceType || "",
    destination: preview.destination || {},
    rawTextIncluded: preview.rawTextIncluded !== false,
    currentContent: options.currentContent ?? $("sinkPreviewContent").value ?? "",
    settings: sinkSettingsPayload(),
    availableActions: {
      save: editable,
      approve: editable,
      execute: approved,
      reject: editable && preview.status !== "rejected",
      obsidianReview: isObsidian,
    },
    nextStepGuide: [
      editable ? "如正文需要微调，先修改 currentContent 后使用 payloads.save。" : "",
      editable ? "如正文已可沉淀但还未写入，使用 payloads.approve 进入 approved 状态。" : "",
      approved ? "如路径、正文和 vault 状态均已确认，使用 payloads.execute 写入目标沉淀。" : "执行写入需要 preview.status=approved。",
      isObsidian ? "Obsidian 目标建议先回读、差异或复制 vault 参数包确认当前 vault 状态。" : "",
      editable && preview.status !== "rejected" ? "如正文不该沉淀，使用 payloads.reject 并保留当前 obsidianState 作为依据。" : "",
    ].filter(Boolean),
    requiredChecks: [
      "确认 notePath / path 指向预期沉淀位置。",
      "确认 currentContent 没有误引、漏引或越界引用。",
      "确认 settings 中 vaultPath / dailyNoteRoot / vcpMemoryRoot 是当前机器真实路径。",
      isObsidian ? "确认 Obsidian 回读/差异/同步计划没有提示未解决冲突。" : "确认目标不是 Obsidian 时不需要 vault 巡检。",
      approved ? "执行前再次确认已批准状态不是旧预览残留。" : "批准前确认正文修改已保存到 payload。",
    ],
    payloads: {
      save: editable ? sinkSavePayloadPacket(preview, { status: null, note: "sidecar content edit", type: "sink-save-payload" }) : null,
      approve: editable ? sinkSavePayloadPacket(preview, { status: "approved", note: "sidecar content edit and approve", type: "sink-save-approve-payload" }) : null,
      execute: approved ? sinkExecutePayloadPacket(preview) : null,
      reject: editable && preview.status !== "rejected" ? sinkRejectPayloadPacket(preview) : null,
    },
    obsidianState: state.selectedSinkDiff
      ? {
          kind: state.selectedSinkDiff.kind || "",
          notePath: state.selectedSinkDiff.notePath || "",
          recommendation: state.selectedSinkDiff.recommendation || "",
          resolved: state.selectedSinkDiff.resolved,
          alreadyMerged: state.selectedSinkDiff.alreadyMerged,
          draftHash: state.selectedSinkDiff.draftHash || "",
        }
      : null,
    safety: {
      requiresExplicitConfirm: true,
      mutatesSinkPreview: editable,
      mutatesVault: approved || isObsidian,
      productRuntimeAgent: "Nova",
    },
  };
}

async function executeSelectedSinkPreview() {
  const preview = state.selectedSinkPreview;
  if (!preview) return;
  try {
    saveSinkSettings();
    await command(sinkExecutePayload(preview));
    await refreshExecutedSinkPreview(preview.previewId);
    await loadSnapshot();
  } catch (error) {
    log(error.message || String(error));
  }
}

function sinkExecutePayload(preview) {
  return {
    command: "sink_execute",
    previewId: preview.previewId,
    vaultPath: $("vaultPath").value || undefined,
    dailyNoteRoot: $("dailyNoteRoot").value || undefined,
    vcpMemoryRoot: $("vcpMemoryRoot").value || undefined,
    updatedBy: "CoReadingSidecar",
  };
}

$("copySinkExecutePayloadBtn").addEventListener("click", async () => {
  $("copySinkExecutePayloadBtn").disabled = true;
  try {
    const preview = state.selectedSinkPreview;
    if (!preview || preview.status !== "approved") throw new Error("请先选择已批准的沉淀预览。");
    saveSinkSettings();
    const packet = sinkExecutePayloadPacket(preview);
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制沉淀执行参数: ${preview.previewId || ""}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copySinkExecutePayloadBtn").disabled = state.selectedSinkPreview?.status !== "approved";
  }
});

function sinkRejectPayload(preview) {
  const diff = state.selectedSinkDiff || null;
  const reasonParts = [
    "sidecar rejected after preview",
    diff?.kind ? `obsidianState=${diff.kind}` : "",
    diff?.recommendation ? `recommendation=${diff.recommendation}` : "",
  ].filter(Boolean);
  return {
    command: "sink_preview_update",
    previewId: preview.previewId,
    status: "rejected",
    note: reasonParts.join("; "),
    updatedBy: "CoReadingSidecar",
  };
}

$("copyRejectSinkPreviewBtn").addEventListener("click", async () => {
  $("copyRejectSinkPreviewBtn").disabled = true;
  try {
    const preview = state.selectedSinkPreview;
    if (!preview || preview.status === "rejected") throw new Error("请先选择可驳回的沉淀预览。");
    const packet = sinkRejectPayloadPacket(preview);
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制沉淀驳回参数: ${preview.previewId || ""}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copyRejectSinkPreviewBtn").disabled = !state.selectedSinkPreview || state.selectedSinkPreview.status === "rejected";
  }
});

$("rejectSinkPreviewBtn").addEventListener("click", async () => {
  const preview = state.selectedSinkPreview;
  if (!preview) return;
  try {
    await command(sinkRejectPayload(preview));
    const result = await query({ command: "sink_preview_get", previewId: preview.previewId });
    state.selectedSinkPreview = result.preview || result;
    renderSinkDetail();
    await loadSnapshot();
  } catch (error) {
    log(error.message || String(error));
  }
});

function obsidianNotePayload(commandName, extra = {}) {
  const preview = state.selectedSinkPreview;
  if (!preview) return;
  saveSinkSettings();
  const payload = {
    command: commandName,
    previewId: preview.previewId,
    vaultPath: $("vaultPath").value || undefined,
    updatedBy: "CoReadingSidecar",
    ...extra
  };
  if (commandName === "obsidian_note_resolve") {
    payload.resolutionNote = "已由 sidecar 标记整理。";
  }
  if (commandName === "obsidian_note_integrate") {
    payload.integratedContent = $("sinkPreviewContent").value || preview.content || "";
    payload.integratedBy = "CoReadingSidecar";
    payload.resolutionNote = "已追加 integrated update。";
  }
  if (commandName === "obsidian_note_apply_integration_choice") {
    payload.choiceId = "append_integrated_update";
    payload.integratedBy = "CoReadingSidecar";
    payload.resolutionNote = "已按整合建议追加 integrated update。";
  }
  return payload;
}

function obsidianNotePayloadPacket(commandName, extra = {}, type = "obsidian-note-payload") {
  const preview = state.selectedSinkPreview;
  const payload = obsidianNotePayload(commandName, extra);
  if (!preview || !payload) return null;
  const destination = preview.destination || {};
  return {
    type,
    previewId: preview.previewId || "",
    target: preview.target || "",
    notePath: destination.notePath || destination.path || preview.notePath || "",
    commandName,
    payload,
    diffState: state.selectedSinkDiff
      ? {
          kind: state.selectedSinkDiff.kind || "",
          recommendation: state.selectedSinkDiff.recommendation || "",
          draftHash: state.selectedSinkDiff.draftHash || "",
          resolved: state.selectedSinkDiff.resolved,
        }
      : null,
    auditContextHint: { command: "copySinkAuditContext", previewId: preview.previewId || "" },
  };
}

function vaultSyncActionPayload(index = 0) {
  const item = (state.vaultSyncApplicable || [])[index];
  if (!item) throw new Error("同步动作不存在。");
  saveSinkSettings();
  return {
    command: "obsidian_vault_sync_action_apply",
    vaultPath: $("vaultPath").value || undefined,
    folder: "CoReading",
    action: item,
    confirmApply: true,
    confirmRefresh: item.commandHint?.command === "obsidian_vault_index_refresh",
    appliedBy: "CoReadingSidecar"
  };
}

function vaultSyncActionPayloadPacket(index = 0) {
  const payload = vaultSyncActionPayload(index);
  const plan = state.selectedSinkDiff || {};
  return {
    type: "vault-sync-action-payload",
    planId: plan.planId || "",
    recommendation: plan.recommendation || "",
    source: plan.source || {},
    actionIndex: index,
    actionId: payload.action?.actionId || "",
    previewId: payload.action?.previewId || "",
    notePath: payload.action?.notePath || "",
    payload,
    settings: sinkSettingsPayload(),
    reviewGoal: "确认该 vault 同步动作只整理 CoReading 索引/状态，不改写非目标正文。",
    safety: {
      requiresExplicitConfirm: true,
      mutatesVault: true,
      expectedScope: "Obsidian vault CoReading index/status",
    },
  };
}

function vaultSnapshotPayload() {
  saveSinkSettings();
  return {
    command: "obsidian_vault_snapshot",
    vaultPath: $("vaultPath").value || undefined,
    folder: "CoReading",
    status: "all",
    maxFiles: 300,
    includeContentPreview: false,
    label: `sidecar ${new Date().toLocaleString()}`,
    createdBy: "CoReadingSidecar"
  };
}

function vaultStatusPayload() {
  saveSinkSettings();
  return {
    command: "obsidian_vault_status",
    vaultPath: $("vaultPath").value || undefined,
    folder: "CoReading",
    maxFiles: 300,
    includeContentPreview: false
  };
}

function vaultSnapshotListPayload() {
  saveSinkSettings();
  return {
    command: "obsidian_vault_snapshot_list",
    vaultPath: $("vaultPath").value || undefined,
    folder: "CoReading",
    limit: 10
  };
}

function vaultSnapshotDiffPayload(changeStatus) {
  return {
    command: "obsidian_vault_snapshot_diff",
    changeStatus,
    includeBlocks: true
  };
}

function vaultIndexBuildPayload() {
  saveSinkSettings();
  return {
    command: "obsidian_vault_index_build",
    vaultPath: $("vaultPath").value || undefined,
    folder: "CoReading",
    maxFiles: 300,
    includeContentPreview: false,
    label: `sidecar ${new Date().toLocaleString()}`,
    createdBy: "CoReadingSidecar"
  };
}

function vaultIndexListPayload() {
  saveSinkSettings();
  return {
    command: "obsidian_vault_index_list",
    vaultPath: $("vaultPath").value || undefined,
    folder: "CoReading",
    limit: 10
  };
}

function vaultIndexPendingPayload() {
  return {
    command: "obsidian_vault_index_get",
    status: "proposed",
    limit: 50
  };
}

function vaultIndexRefreshCheckPayload() {
  saveSinkSettings();
  return {
    command: "obsidian_vault_index_refresh_check",
    vaultPath: $("vaultPath").value || undefined,
    folder: "CoReading",
    maxFiles: 300,
    includeBlocks: true
  };
}

function vaultSyncPlanPayload() {
  saveSinkSettings();
  return {
    command: "obsidian_vault_sync_plan_create",
    vaultPath: $("vaultPath").value || undefined,
    folder: "CoReading",
    maxFiles: 300,
    includeBlocks: true,
    reviewer: "CoReadingSidecar"
  };
}

function vaultIndexRefreshPayload() {
  saveSinkSettings();
  return {
    command: "obsidian_vault_index_refresh",
    vaultPath: $("vaultPath").value || undefined,
    folder: "CoReading",
    maxFiles: 300,
    confirmRefresh: true,
    label: `sidecar refresh ${new Date().toLocaleString()}`,
    createdBy: "CoReadingSidecar"
  };
}

function vaultWritePayloadPacket(type, payload) {
  const mutatingCommands = new Set([
    "obsidian_vault_snapshot",
    "obsidian_vault_index_build",
    "obsidian_vault_index_refresh",
    "obsidian_vault_sync_action_apply",
  ]);
  const mutatesVault = mutatingCommands.has(payload.command);
  return {
    type,
    vaultPath: payload.vaultPath || "",
    folder: payload.folder || "",
    commandName: payload.command || "",
    payload,
    settings: sinkSettingsPayload(),
    reviewGoal: "审阅 vault 命令的路径、扫描范围、过滤条件和写入风险，再决定是否执行。",
    safety: {
      mutatesVault,
      readsVault: !mutatesVault,
      expectedScope: payload.folder ? `Obsidian vault folder: ${payload.folder}` : "Obsidian vault metadata",
      requiresExplicitConfirm: Boolean(payload.confirmRefresh || payload.confirmApply || mutatesVault),
    },
  };
}

async function runObsidianNoteCommand(commandName, extra = {}) {
  const payload = obsidianNotePayload(commandName, extra);
  if (!payload) return;
  const result = await query(payload);
  return result;
}

async function readSelectedObsidianStatus() {
  const result = await runObsidianNoteCommand("obsidian_note_status");
  return { kind: "status", ...result };
}

async function readSelectedObsidianAfterExecute() {
  try {
    const result = await runObsidianNoteCommand("obsidian_note_read", { includeContent: true });
    if (result?.exists) return { kind: "read", ...result };
  } catch {
    // Fall back to marker status so the panel still reflects the write target.
  }
  return readSelectedObsidianStatus();
}

$("readObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await runObsidianNoteCommand("obsidian_note_read");
    state.selectedSinkDiff = { kind: "read", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyObsidianReadBtn").addEventListener("click", async () => {
  try {
    const data = state.selectedSinkDiff;
    if (data?.kind !== "read" || !data.exists) throw new Error("当前没有可复制的 Obsidian 回读正文。");
    await copyTextToClipboard(String(data.content || ""));
    log(`已复制 Obsidian 回读正文: ${data.notePath || ""}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyObsidianReadSummaryBtn").addEventListener("click", async () => {
  try {
    const data = state.selectedSinkDiff;
    if (data?.kind !== "read") throw new Error("当前没有可复制的 Obsidian 回读摘要。");
    const summary = [
      `notePath: ${data.notePath || ""}`,
      `exists: ${data.exists ? "true" : "false"}`,
      `bytes: ${data.bytes || 0}`,
      "",
      String(data.content || "").slice(0, 1200),
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制 Obsidian 回读摘要: ${data.notePath || ""}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("diffObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await runObsidianNoteCommand("obsidian_note_diff");
    state.selectedSinkDiff = { kind: "diff", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyObsidianDiffBtn").addEventListener("click", async () => {
  try {
    const data = state.selectedSinkDiff;
    if (data?.kind !== "diff") throw new Error("当前没有可复制的 Obsidian 差异摘要。");
    const diff = data.diff || {};
    const summary = [
      `notePath: ${data.notePath || ""}`,
      `identical: ${diff.identical ? "true" : "false"}`,
      `alreadyMerged: ${data.alreadyMerged ? "true" : "false"}`,
      `resolved: ${data.resolved ? "true" : "false"}`,
      `addedLineCount: ${diff.addedLineCount || 0}`,
      `removedLineCount: ${diff.removedLineCount || 0}`,
      "",
      "added:",
      ...(diff.addedPreview || []).map((line) => `+ ${line}`),
      "",
      "removed:",
      ...(diff.removedPreview || []).map((line) => `- ${line}`),
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制 Obsidian 差异摘要: ${data.notePath || ""}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("mergeObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await runObsidianNoteCommand("obsidian_note_merge");
    state.selectedSinkDiff = { kind: "merge", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("suggestIntegrateObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await runObsidianNoteCommand("obsidian_note_suggest_integration");
    state.selectedSinkDiff = { kind: "suggest-integration", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyIntegrateSuggestionBtn").addEventListener("click", async () => {
  try {
    const data = state.selectedSinkDiff;
    if (data?.kind !== "suggest-integration") throw new Error("当前没有可复制的 Obsidian 整合建议。");
    const evidence = data.evidence || {};
    const choices = data.integrationChoices || [];
    const summary = [
      `recommendation: ${data.recommendation || ""}`,
      `missingLineCount: ${evidence.missingLineCount || 0}`,
      `overlapLineCount: ${evidence.overlapLineCount || 0}`,
      "",
      "reasons:",
      ...(data.reasons || []).map((reason) => `- ${reason}`),
      "",
      "choices:",
      ...choices.map((choice) => `${choice.recommended ? "* " : "- "}${choice.id || ""} ${choice.label || ""}: ${choice.action || ""} risk=${choice.risk || ""}`),
      data.draft ? `\ndraft:\n${data.draft}` : "",
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制 Obsidian 整合建议: ${data.recommendation || ""}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("previewReplaceRangeObsidianBtn").addEventListener("click", async () => {
  try {
    const result = await runObsidianNoteCommand("obsidian_note_preview_replace_range");
    state.selectedReplaceCandidateIndexes = [0];
    state.selectedSinkDiff = { kind: "replace-preview", ...result };
    renderObsidianDiffPanel();
    $("confirmReplaceRangeObsidianBtn").disabled = false;
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyReplacePreviewBtn").addEventListener("click", async () => {
  try {
    const data = state.selectedSinkDiff;
    if (data?.kind !== "replace-preview") throw new Error("当前没有可复制的 Obsidian 替换预览。");
    const candidates = data.candidates || [];
    const selectedIndexes = (state.selectedReplaceCandidateIndexes || []).filter((index) => index >= 0 && index < candidates.length);
    const activeIndexes = selectedIndexes.length ? selectedIndexes : (candidates.length ? [0] : []);
    const selected = activeIndexes.map((index) => candidates[index]).filter(Boolean);
    const summary = [
      `reason: ${data.reason || ""}`,
      `draftHash: ${data.draftHash || ""}`,
      `candidateCount: ${candidates.length}`,
      `selectedCount: ${selected.length}`,
      "",
      ...selected.map((candidate, index) => [
        `selected ${index + 1}: L${candidate.startLine}-${candidate.endLine} score=${candidate.score || 0}`,
        `reason: ${candidate.reason || ""}`,
        `before:\n${candidate.beforePreview || ""}`,
        `after:\n${candidate.afterPreview || ""}`,
      ].join("\n")),
    ].join("\n\n");
    await copyTextToClipboard(summary);
    log(`已复制 Obsidian 替换预览: ${selected.length} 个候选`);
  } catch (error) {
    log(error.message || String(error));
  }
});

function selectedObsidianReplaceRanges() {
  const previewData = state.selectedSinkDiff;
  const candidates = previewData?.candidates || [];
  const selectedIndexes = (state.selectedReplaceCandidateIndexes || []).filter((index) => index >= 0 && index < candidates.length);
  const selectedCandidates = (selectedIndexes.length ? selectedIndexes : [0]).map((index) => candidates[index]).filter(Boolean);
  if (!selectedCandidates.length || !previewData?.draftHash) throw new Error("请先生成替换预览。");
  const selectedRanges = selectedCandidates.map((candidate) => ({ startLine: candidate.startLine, endLine: candidate.endLine }));
  const rangeLabel = selectedRanges.map((range) => `L${range.startLine}-${range.endLine}`).join(", ");
  return { previewData, selectedRanges, rangeLabel };
}

$("copyConfirmReplacePayloadBtn").addEventListener("click", async () => {
  try {
    const { previewData, selectedRanges, rangeLabel } = selectedObsidianReplaceRanges();
    const packet = obsidianNotePayloadPacket("obsidian_note_confirm_replace_range", {
      confirmReplace: true,
      selectedRanges,
      expectedDraftHash: previewData.draftHash,
      replacedBy: "CoReadingSidecar",
      resolutionNote: `已由 sidecar 确认替换范围 ${rangeLabel}。`
    }, "obsidian-confirm-replace-payload");
    if (!packet) throw new Error("请先选择 Obsidian 沉淀预览。");
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制 Obsidian 替换执行参数: ${rangeLabel}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("confirmReplaceRangeObsidianBtn").addEventListener("click", async () => {
  try {
    const { previewData, selectedRanges, rangeLabel } = selectedObsidianReplaceRanges();
    const result = await runObsidianNoteCommand("obsidian_note_confirm_replace_range", {
      confirmReplace: true,
      selectedRanges,
      expectedDraftHash: previewData.draftHash,
      replacedBy: "CoReadingSidecar",
      resolutionNote: `已由 sidecar 确认替换范围 ${rangeLabel}。`
    });
    state.selectedSinkDiff = { kind: "confirm-replace", ...result };
    renderObsidianDiffPanel();
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyConfirmReplaceBtn").addEventListener("click", async () => {
  try {
    const data = state.selectedSinkDiff;
    if (data?.kind !== "confirm-replace") throw new Error("当前没有可复制的 Obsidian 确认替换结果。");
    const requested = (data.requestedRanges || []).map((range) => `L${range.startLine}-${range.endLine}`).join(", ");
    const applied = (data.appliedRanges || []).map((range) => `L${range.appliedStartLine}-${range.appliedEndLine}`).join(", ");
    const summary = [
      `replaced: ${data.replaced ? "true" : "false"}`,
      `replacementMode: ${data.replacementMode || ""}`,
      `safeWrite: ${data.safeWrite ? "true" : "false"}`,
      `resolved: ${data.resolved ? "true" : "false"}`,
      `requestedRanges: ${requested}`,
      `appliedRanges: ${applied}`,
      `bytesWritten: ${data.bytesWritten || 0}`,
      `marker: ${data.resolvedMarker || data.marker || ""}`,
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制 Obsidian 确认替换结果: ${applied || requested}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyApplyIntegratePayloadBtn").addEventListener("click", async () => {
  try {
    const packet = obsidianNotePayloadPacket("obsidian_note_apply_integration_choice", {}, "obsidian-apply-choice-payload");
    if (!packet) throw new Error("请先选择 Obsidian 沉淀预览。");
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制 Obsidian 应用建议参数: ${packet.notePath || ""}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("applyIntegrateChoiceObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await runObsidianNoteCommand("obsidian_note_apply_integration_choice");
    state.selectedSinkDiff = { kind: "apply-choice", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyIntegratePayloadBtn").addEventListener("click", async () => {
  try {
    const packet = obsidianNotePayloadPacket("obsidian_note_integrate", {}, "obsidian-integrate-payload");
    if (!packet) throw new Error("请先选择 Obsidian 沉淀预览。");
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制 Obsidian 集成正文参数: ${packet.notePath || ""}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("integrateObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await runObsidianNoteCommand("obsidian_note_integrate");
    state.selectedSinkDiff = { kind: "integrate", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyIntegrateResultBtn").addEventListener("click", async () => {
  try {
    const data = state.selectedSinkDiff;
    if (!["apply-choice", "integrate"].includes(data?.kind)) throw new Error("当前没有可复制的 Obsidian 整理结果。");
    const summary = [
      `kind: ${data.kind || ""}`,
      `applied: ${data.applied ? "true" : "false"}`,
      `integrated: ${data.integrated ? "true" : "false"}`,
      `resolved: ${data.resolved ? "true" : "false"}`,
      `reason: ${data.reason || ""}`,
      `bytesWritten: ${data.bytesWritten || 0}`,
      `marker: ${data.marker || data.resolvedMarker || ""}`,
      data.result ? `result:\n${JSON.stringify(data.result, null, 2)}` : "",
    ].filter(Boolean).join("\n");
    await copyTextToClipboard(summary);
    log(`已复制 Obsidian 整理结果: ${data.kind || ""}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("statusObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    state.selectedSinkDiff = await readSelectedObsidianStatus();
    renderObsidianDiffPanel();
    log(state.selectedSinkDiff);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyObsidianStatusBtn").addEventListener("click", async () => {
  try {
    const data = state.selectedSinkDiff;
    if (!["status", "resolve"].includes(data?.kind)) throw new Error("当前没有可复制的 Obsidian 状态结果。");
    const counts = data.counts || {};
    const blocks = data.blocks || [];
    const summary = [
      `kind: ${data.kind || ""}`,
      `notePath: ${data.notePath || ""}`,
      `resolved: ${data.resolved ? "true" : "false"}`,
      `bytesWritten: ${data.bytesWritten || 0}`,
      `counts: proposed=${counts.proposed || 0}, resolved=${counts.resolved || 0}, total=${counts.total || 0}`,
      `marker: ${data.marker || data.resolvedMarker || data.previousMarker || ""}`,
      "",
      "blocks:",
      ...blocks.map((block) => `${block.status} L${block.startLine}-${block.endLine || "?"}: ${block.marker}${block.resolutionNote ? ` ${block.resolutionNote}` : ""}`),
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制 Obsidian 状态结果: ${data.notePath || ""}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultStatusPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultWritePayloadPacket("vault-status-payload", vaultStatusPayload());
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log("已复制 Obsidian 全库状态参数");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("vaultStatusObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await query(vaultStatusPayload());
    state.selectedSinkDiff = { kind: "vault-status", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultStatusBtn").addEventListener("click", async () => {
  try {
    const data = state.selectedSinkDiff;
    if (data?.kind !== "vault-status") throw new Error("当前没有可复制的 Obsidian 全库状态。");
    const counts = data.counts || {};
    const notes = data.notes || [];
    const skipped = data.skippedFiles || [];
    const noteLines = notes.flatMap((note) => (note.blocks || []).map((block) => `${block.status} ${note.notePath} L${block.startLine}-${block.endLine || "?"}: ${block.marker}${block.resolutionNote ? ` ${block.resolutionNote}` : ""}`));
    const summary = [
      `counts: proposed=${counts.proposed || 0}, resolved=${counts.resolved || 0}, total=${counts.total || 0}`,
      `notes: ${notes.length}`,
      `scannedFiles: ${data.scannedFiles || 0}`,
      `hasMore: ${data.hasMore ? "true" : "false"}`,
      `nextOffset: ${data.nextOffset ?? ""}`,
      `skippedFiles: ${skipped.length}`,
      "",
      "blocks:",
      ...noteLines,
      "",
      "skipped:",
      ...skipped.map((file) => `${file.reason}: ${file.notePath} (${file.bytes || 0} bytes)`),
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制 Obsidian 全库状态: ${notes.length} notes`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultAuditBtn").addEventListener("click", async () => {
  try {
    const data = state.selectedSinkDiff;
    if (!data?.kind) throw new Error("当前没有可复制的 Obsidian 巡检结果。");
    const lines = [`kind: ${data.kind}`];
    if (data.kind === "vault-snapshot") {
      const snapshot = data.snapshot || {};
      const counts = snapshot.counts || {};
      lines.push(
        `snapshotId: ${snapshot.snapshotId || ""}`,
        `label: ${snapshot.label || ""}`,
        `counts: proposed=${counts.proposed || 0}, resolved=${counts.resolved || 0}, total=${counts.total || 0}`,
        `notes: ${(snapshot.notes || []).length}`,
        `skippedFiles: ${(snapshot.skippedFiles || []).length}`,
        `snapshotPath: ${data.snapshotPath || ""}`
      );
    } else if (data.kind === "vault-snapshot-list") {
      lines.push(
        `total: ${data.total || 0}`,
        `range: ${data.offset || 0}-${(data.offset || 0) + (data.snapshots || []).length}`,
        "",
        ...(data.snapshots || []).map((snapshot) => {
          const counts = snapshot.counts || {};
          return `${snapshot.snapshotId} · ${snapshot.label || "未命名"} · proposed=${counts.proposed || 0} · resolved=${counts.resolved || 0} · notes=${snapshot.noteCount ?? (snapshot.notes || []).length}`;
        })
      );
    } else if (data.kind === "vault-snapshot-diff") {
      const changes = data.changes || {};
      const delta = data.countDelta || {};
      lines.push(
        `changed: ${data.changed ? "true" : "false"}`,
        `filteredChanged: ${data.filteredChanged === false ? "false" : "true"}`,
        `before: ${data.before?.snapshotId || ""}`,
        `after: ${data.after?.snapshotId || ""}`,
        `delta: proposed=${delta.proposed || 0}, resolved=${delta.resolved || 0}, notes=${delta.notes || 0}`,
        `changes: added=${changes.addedCount || 0}, removed=${changes.removedCount || 0}, statusChanged=${changes.statusChangedCount || 0}`,
        "",
        ...((changes.statusChanged || []).map((item) => `${item.before?.notePath || ""} · ${item.before?.previewId || ""}: ${item.before?.status || "?"} -> ${item.after?.status || "?"}`)),
        ...((changes.added || []).map((item) => `added ${item.notePath || ""} · ${item.previewId || ""} · ${item.status || ""}`)),
        ...((changes.removed || []).map((item) => `removed ${item.notePath || ""} · ${item.previewId || ""} · ${item.status || ""}`))
      );
    } else if (data.kind === "vault-index") {
      const index = data.index || {};
      const counts = index.counts || {};
      lines.push(
        `indexId: ${index.indexId || ""}`,
        `label: ${index.label || ""}`,
        `counts: proposed=${counts.proposed || 0}, resolved=${counts.resolved || 0}, total=${counts.total || 0}`,
        `blocks: ${index.blockCount || 0}`,
        `notes: ${index.noteCount || 0}`,
        `indexPath: ${data.indexPath || ""}`
      );
    } else if (data.kind === "vault-index-list") {
      lines.push(
        `total: ${data.total || 0}`,
        `range: ${data.offset || 0}-${(data.offset || 0) + (data.indexes || []).length}`,
        "",
        ...(data.indexes || []).map((index) => {
          const counts = index.counts || {};
          return `${index.indexId} · ${index.label || "未命名"} · proposed=${counts.proposed || 0} · resolved=${counts.resolved || 0} · blocks=${index.blockCount || 0}`;
        })
      );
    } else if (data.kind === "vault-index-get") {
      lines.push(
        `indexId: ${data.index?.indexId || data.indexId || ""}`,
        `total: ${data.total || 0}`,
        `range: ${data.offset || 0}-${(data.offset || 0) + (data.blocks || []).length}`,
        `status: ${data.filter?.status || ""}`,
        "",
        ...(data.blocks || []).map((block) => `${block.status} ${block.notePath || ""} L${block.startLine}-${block.endLine || "?"}: ${block.marker}${block.resolutionNote ? ` ${block.resolutionNote}` : ""}`)
      );
    } else if (data.kind === "vault-index-refresh") {
      const changes = data.changes || {};
      const delta = data.countDelta || {};
      lines.push(
        `stale: ${data.stale ? "true" : "false"}`,
        `recommendation: ${data.recommendation || ""}`,
        `indexId: ${data.index?.indexId || ""}`,
        `delta: proposed=${delta.proposed || 0}, resolved=${delta.resolved || 0}, notes=${delta.notes || 0}`,
        `changes: added=${changes.addedCount || 0}, removed=${changes.removedCount || 0}, statusChanged=${changes.statusChangedCount || 0}`
      );
    } else if (data.kind === "vault-index-rebuilt") {
      const index = data.refreshedIndex || {};
      lines.push(
        `refreshed: ${data.refreshed ? "true" : "false"}`,
        `reason: ${data.reason || ""}`,
        `recommendation: ${data.recommendation || ""}`,
        `previous: ${data.previousCheck?.index?.indexId || ""}`,
        `new: ${index.indexId || ""}`,
        `blocks: ${index.blockCount || 0}`,
        `indexPath: ${data.indexPath || ""}`
      );
    } else if (data.kind === "vault-sync-plan") {
      const counts = data.counts || {};
      lines.push(
        `planId: ${data.planId || ""}`,
        `recommendation: ${data.recommendation || ""}`,
        `indexId: ${data.source?.indexId || ""}`,
        `counts: total=${counts.total || 0}, statusChanged=${counts.statusChanged || 0}, added=${counts.added || 0}, removed=${counts.removed || 0}`,
        "",
        ...(data.actions || []).map((action) => `${action.kind} ${action.notePath || ""} · ${action.previewId || ""} · ${action.beforeStatus || action.status || "?"} -> ${action.afterStatus || action.status || "?"} · ${action.recommendation || ""}`)
      );
    } else if (data.kind === "vault-sync-action") {
      lines.push(
        `applied: ${data.applied ? "true" : "false"}`,
        `reason: ${data.reason || ""}`,
        `appliedCommand: ${data.appliedCommand || ""}`,
        `action: ${JSON.stringify(data.action || {})}`,
        `result: ${JSON.stringify(data.result || {})}`
      );
    } else {
      throw new Error("当前结果不属于可复制巡检类型。");
    }
    await copyTextToClipboard(lines.join("\n"));
    log(`已复制 Obsidian 巡检结果: ${data.kind}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultSyncPlanBtn").addEventListener("click", async () => {
  try {
    const data = state.selectedSinkDiff;
    if (data?.kind !== "vault-sync-plan") throw new Error("当前没有可复制的 Obsidian 同步计划。");
    const actions = data.actions || [];
    const safeActions = actions.filter((action) => action.recommendation === "mark_local_index_resolved_or_rebuild" || action.commandHint?.command === "obsidian_vault_index_refresh");
    const packet = {
      type: "vault-sync-plan",
      planId: data.planId || "",
      recommendation: data.recommendation || "",
      counts: data.counts || {},
      source: data.source || {},
      settings: sinkSettingsPayload(),
      safeActionCount: safeActions.length,
      safeActions,
      actions,
    };
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制 Obsidian 同步计划: ${actions.length} actions`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultSyncActionPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultSyncActionPayloadPacket(0);
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制 Obsidian 同步动作参数: ${packet.previewId || packet.actionId || ""}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultSnapshotPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultWritePayloadPacket("vault-snapshot-payload", vaultSnapshotPayload());
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log("已复制 Obsidian 快照参数");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("vaultSnapshotObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await query(vaultSnapshotPayload());
    state.selectedSinkDiff = { kind: "vault-snapshot", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultSnapshotListPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultWritePayloadPacket("vault-snapshot-list-payload", vaultSnapshotListPayload());
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log("已复制 Obsidian 快照列表参数");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("vaultSnapshotListObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await query(vaultSnapshotListPayload());
    state.selectedSinkDiff = { kind: "vault-snapshot-list", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultSnapshotDiffPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultWritePayloadPacket("vault-snapshot-diff-payload", vaultSnapshotDiffPayload());
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log("已复制 Obsidian 快照差异参数");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("vaultSnapshotDiffObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await query(vaultSnapshotDiffPayload());
    state.selectedSinkDiff = { kind: "vault-snapshot-diff", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultSnapshotPendingDiffPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultWritePayloadPacket("vault-snapshot-pending-diff-payload", vaultSnapshotDiffPayload("proposed"));
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log("已复制 Obsidian 待整理变化参数");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("vaultSnapshotPendingDiffObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await query(vaultSnapshotDiffPayload("proposed"));
    state.selectedSinkDiff = { kind: "vault-snapshot-diff", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultIndexBuildPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultWritePayloadPacket("vault-index-build-payload", vaultIndexBuildPayload());
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log("已复制 Obsidian 建索引参数");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("vaultIndexBuildObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await query(vaultIndexBuildPayload());
    state.selectedSinkDiff = { kind: "vault-index", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultIndexListPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultWritePayloadPacket("vault-index-list-payload", vaultIndexListPayload());
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log("已复制 Obsidian 索引列表参数");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("vaultIndexListObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await query(vaultIndexListPayload());
    state.selectedSinkDiff = { kind: "vault-index-list", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultIndexPendingPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultWritePayloadPacket("vault-index-pending-payload", vaultIndexPendingPayload());
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log("已复制 Obsidian 待整理索引参数");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("vaultIndexPendingObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await query(vaultIndexPendingPayload());
    state.selectedSinkDiff = { kind: "vault-index-get", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultIndexRefreshCheckPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultWritePayloadPacket("vault-index-refresh-check-payload", vaultIndexRefreshCheckPayload());
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log("已复制 Obsidian 检查索引参数");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("vaultIndexRefreshCheckObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await query(vaultIndexRefreshCheckPayload());
    state.selectedSinkDiff = { kind: "vault-index-refresh", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultSyncPlanPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultWritePayloadPacket("vault-sync-plan-payload", vaultSyncPlanPayload());
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log("已复制 Obsidian 同步计划参数");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("vaultSyncPlanObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await query(vaultSyncPlanPayload());
    state.selectedSinkDiff = { kind: "vault-sync-plan", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyVaultIndexRefreshPayloadBtn").addEventListener("click", async () => {
  try {
    const packet = vaultWritePayloadPacket("vault-index-refresh-payload", vaultIndexRefreshPayload());
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log("已复制 Obsidian 重建索引参数");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("vaultIndexRefreshObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await query(vaultIndexRefreshPayload());
    state.selectedSinkDiff = { kind: "vault-index-rebuilt", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("copyResolvePayloadBtn").addEventListener("click", async () => {
  try {
    const packet = obsidianNotePayloadPacket("obsidian_note_resolve", {}, "obsidian-resolve-payload");
    if (!packet) throw new Error("请先选择 Obsidian 沉淀预览。");
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制 Obsidian 标记整理参数: ${packet.notePath || ""}`);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("resolveObsidianBtn").addEventListener("click", async () => {
  try {
    $("confirmReplaceRangeObsidianBtn").disabled = true;
    const result = await runObsidianNoteCommand("obsidian_note_resolve");
    state.selectedSinkDiff = { kind: "resolve", ...result };
    renderObsidianDiffPanel();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("illustrationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  clearFormError(formEl);
  const selected = activeBook();
  if (!selected) {
    setFormError(formEl, "请先选择一本书。");
    return;
  }
  const form = new FormData(formEl);
  const assetUri = String(form.get("assetUri") || "").trim();
  const payload = {
    command: "illustration_create",
    bookId: selected.bookId,
    chunkId: state.selectedChunkId || undefined,
    position: String(form.get("position") || "chapter_end"),
    layer: String(form.get("layer") || "chapter"),
    sourceType: String(form.get("sourceType") || "ai"),
    prompt: String(form.get("prompt") || "").trim(),
    stylePreset: String(form.get("stylePreset") || "quiet editorial watercolor").trim(),
    aspectRatio: String(form.get("aspectRatio") || "16:9").trim(),
    assetUri: assetUri || undefined,
    thumbnailUri: assetUri || undefined,
    createdBy: "CoReadingSidecar",
  };
  try {
    const result = await command(payload);
    state.selectedIllustration = result.data?.fullIllustration || result.data?.illustration || null;
    await loadSnapshot();
    renderIllustrationDetail();
  } catch (error) {
    setFormError(formEl, error.message || String(error));
  }
});
$("suggestIllustrationBtn").addEventListener("click", async () => {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) {
    log("请先选择一本书和一个 chunk。");
    return;
  }
  const form = new FormData($("illustrationForm"));
  try {
    const result = await query({
      command: "illustration_suggest",
      bookId: selected.bookId,
      chunkId: state.selectedChunkId,
      position: String(form.get("position") || "chapter_end"),
      layer: String(form.get("layer") || "chapter"),
      stylePreset: String(form.get("stylePreset") || "quiet editorial watercolor").trim(),
      aspectRatio: String(form.get("aspectRatio") || "16:9").trim(),
    });
    state.illustrationSuggestions = result.suggestions || [];
    renderIllustrationSuggestions();
    log(result);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("illustrationSuggestions").addEventListener("click", (event) => {
  const target = event.target.closest(".suggestion-row[data-suggestion]");
  if (!target) return;
  const suggestion = JSON.parse(target.dataset.suggestion);
  const form = $("illustrationForm");
  form.elements.prompt.value = suggestion.prompt || "";
  form.elements.sourceType.value = suggestion.sourceType || "ai";
  form.elements.stylePreset.value = suggestion.stylePreset || form.elements.stylePreset.value;
  form.elements.aspectRatio.value = suggestion.aspectRatio || form.elements.aspectRatio.value;
  form.elements.position.value = suggestion.placement?.position || form.elements.position.value;
  form.elements.layer.value = suggestion.placement?.layer || form.elements.layer.value;
  log(suggestion);
});
$("chunkSelect").addEventListener("change", (event) => {
  clearReaderSelection();
  clearEntityPeek();
  state.selfCheck.hintVisible = false;
  state.selectedChunkId = event.target.value;
  state.currentChunk = null;
  state.annotations = [];
  state.illustrationSuggestions = [];
  saveReadingSession({ chunkId: state.selectedChunkId, scrollTop: 0 });
  renderPlanRangeStatus();
  renderReviewRangeStatus();
  renderChunkNavigation();
  renderReader();
  renderSelfCheck();
  renderAnnotations();
  renderIllustrationSuggestions();
});
$("chunkText").addEventListener("scroll", () => {
  saveReadingSession();
  renderReaderProgress();
});
$("readingMapTrack").addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-chunk-id]");
  if (!target) return;
  await selectChunk(target.dataset.chunkId, true);
  focusPanel(".reader-surface", "#chunkText");
});
$("bookmarkChunkBtn").addEventListener("click", () => {
  const bookmark = saveBookmarkForCurrentChunk();
  renderReadingMap();
  log(bookmark ? `已插入书签: ${bookmark.chunkId}` : "请先选择一本书和 chunk。");
});
$("openLastBookmarkBtn").addEventListener("click", async () => {
  const bookmark = bookmarksForBook()[0];
  if (!bookmark?.chunkId) return;
  await selectChunk(bookmark.chunkId, true);
  restoreSavedScroll(bookmark);
  focusPanel(".reader-surface", "#chunkText");
  log(`已打开最近书签: ${bookmark.chunkId}`);
});
$("setRangeStartBtn").addEventListener("click", () => setPlanRangeEdge("start"));
$("setRangeEndBtn").addEventListener("click", () => setPlanRangeEdge("end"));
document.querySelector('#planForm input[name="startChunkId"]')?.addEventListener("input", renderPlanRangeStatus);
document.querySelector('#planForm input[name="endChunkId"]')?.addEventListener("input", renderPlanRangeStatus);
$("copyPlanRangeToReviewBtn").addEventListener("click", copyPlanRangeToReview);
$("copyPlanRangeToReviewSummaryBtn").addEventListener("click", async () => {
  try {
    copyPlanRangeToReview();
    const start = reviewFormChunkValue("startChunkId") || state.selectedChunkId;
    const end = reviewFormChunkValue("endChunkId") || state.selectedChunkId;
    await copyTextToClipboard(rangeCopySummary(start, end, "plan-to-review-range"));
    log(`已复制计划评价范围: ${start} -> ${end}`);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("copyPlanRangeBtn").addEventListener("click", async () => {
  try {
    const start = planFormChunkValue("startChunkId") || state.selectedChunkId;
    const end = planFormChunkValue("endChunkId") || state.selectedChunkId;
    await copyTextToClipboard(rangeCopySummary(start, end, "plan-range"));
    log(`已复制计划范围: ${start} -> ${end}`);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("copyReviewRangeToPlanSummaryBtn").addEventListener("click", async () => {
  try {
    copyReviewRangeToPlan();
    const start = planFormChunkValue("startChunkId") || state.selectedChunkId;
    const end = planFormChunkValue("endChunkId") || state.selectedChunkId;
    await copyTextToClipboard(rangeCopySummary(start, end, "review-to-plan-range"));
    log(`已复制评价计划范围: ${start} -> ${end}`);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("copyReadingDecisionPacketBtn").addEventListener("click", async () => {
  try {
    const selected = activeBook();
    if (!selected) throw new Error("请先选择一本书。");
    const packet = readingDecisionPacket(selected);
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制阅读决策包: ${selected.bookId}`);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("copyPlanDecisionPacketBtn").addEventListener("click", async () => {
  try {
    const selected = activeBook();
    if (!selected) throw new Error("请先选择一本书。");
    const packet = planDecisionPacket(selected);
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制计划决策包: ${selected.bookId}`);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("copyPlanParamsBtn").addEventListener("click", async () => {
  try {
    const selected = activeBook();
    if (!selected) throw new Error("请先选择一本书。");
    const payload = buildPlanCreatePayload(selected, new FormData($("planForm")));
    const params = {
      type: "plan-create-params",
      book: selected.title || selected.bookId,
      author: selected.author || "",
      payload,
    };
    await copyTextToClipboard(JSON.stringify(params, null, 2));
    log(`已复制计划参数: ${selected.bookId}`);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("prevChunkBtn").addEventListener("click", () => {
  void moveChunk(-1);
});
$("nextChunkBtn").addEventListener("click", () => {
  void moveChunk(1);
});
$("focusReadingBtn").addEventListener("click", () => {
  state.readingFocus = !state.readingFocus;
  document.body.classList.toggle("reading-focus", state.readingFocus);
  renderReaderProgress();
  focusPanel(".reader-surface", "#chunkText");
});
$("readerNextBtn").addEventListener("click", () => {
  $("readerNextBtn").disabled = true;
  void markReadAndMaybeAdvance({ advance: true }).catch((error) => {
    log(error.message || String(error));
  }).finally(renderReaderProgress);
});
$("readerAskNovaBtn").addEventListener("click", () => {
  $("sessionAskNovaBtn").click();
});
$("readerOpenSinkBtn").addEventListener("click", async () => {
  if (state.readingFocus) {
    state.readingFocus = false;
    document.body.classList.remove("reading-focus");
    renderReaderProgress();
  }
  await openBestSinkPreview();
});
$("continueReadingBtn").addEventListener("click", () => {
  $("continueReadingBtn").disabled = true;
  void continueReading().finally(() => {
    $("continueReadingBtn").disabled = !activeBook();
  });
});
$("sessionContinueBtn").addEventListener("click", () => {
  $("sessionContinueBtn").disabled = true;
  void continueReading().finally(() => {
    $("sessionContinueBtn").disabled = !activeBook();
  });
});
$("sessionResumeBtn").addEventListener("click", async () => {
  const saved = readSavedReadingSession();
  if (!saved) return;
  state.selectedBookId = saved.bookId;
  state.selectedChunkId = saved.chunkId;
  await loadChunks(saved.bookId);
  await readSelectedChunk();
  renderAll();
  focusPanel(".reader-surface", "#chunkText");
  restoreSavedScroll(saved);
  log(`已回到阅读现场: ${saved.bookTitle || saved.bookId} · ${saved.chunkId}`);
});
$("sessionAskNovaBtn").addEventListener("click", () => {
  if (!$("novaPrompt").value.trim()) {
    $("novaPrompt").value = "请陪我继续读当前段落：先定位这一段，再指出一句值得停留的话，最后给一个下一步。";
  }
  focusPanel(".nova-reading-box", "#novaPrompt");
});
$("sessionNoteBtn").addEventListener("click", () => {
  focusPanel("#userNoteForm", '#userNoteForm textarea[name="note"]');
});
$("readingNowFocusBtn").addEventListener("click", () => {
  focusPanel(".reader-surface", "#chunkText");
  if (state.selectedChunkId) log(`已回到正文: ${state.selectedChunkId}`);
});
$("readingNowContinueBtn").addEventListener("click", () => {
  $("readingNowContinueBtn").disabled = true;
  void continueReading().finally(() => {
    $("readingNowContinueBtn").disabled = !activeBook();
    renderReaderProgress();
  });
});
$("readingNowAskBtn").addEventListener("click", () => {
  $("sessionAskNovaBtn").click();
});
$("readingNowNoteBtn").addEventListener("click", () => {
  $("sessionNoteBtn").click();
});
$("copyChunkIndexBtn").addEventListener("click", async () => {
  $("copyChunkIndexBtn").disabled = true;
  try {
    const selected = activeBook();
    if (!selected || !state.chunks.length) throw new Error("请先选择一本有 chunk 的书。");
    const currentIndex = chunkOrder(state.selectedChunkId);
    const chunkLines = state.chunks.map((chunk, index) => {
      const chunkId = getChunkId(chunk);
      const title = chunk.title || chunk.sectionTitle || "";
      const marker = chunkId === state.selectedChunkId ? "*" : " ";
      return `${marker} ${index + 1}. ${chunkId}${title ? ` · ${title}` : ""}`;
    });
    const summary = [
      `book: ${selected.title || selected.bookId}`,
      `bookId: ${selected.bookId}`,
      `chunkCount: ${state.chunks.length}`,
      `currentChunkId: ${state.selectedChunkId || ""}`,
      `currentPosition: ${currentIndex === null ? "" : `${currentIndex + 1}/${state.chunks.length}`}`,
      "",
      "chunks:",
      ...chunkLines
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制 chunk 目录: ${selected.bookId}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copyChunkIndexBtn").disabled = !state.chunks.length;
  }
});
document.querySelector('#reviewForm input[name="startChunkId"]')?.addEventListener("input", renderReviewRangeStatus);
document.querySelector('#reviewForm input[name="endChunkId"]')?.addEventListener("input", renderReviewRangeStatus);
$("copyReviewRangeBtn").addEventListener("click", async () => {
  try {
    const start = reviewFormChunkValue("startChunkId") || state.selectedChunkId;
    const end = reviewFormChunkValue("endChunkId") || state.selectedChunkId;
    await copyTextToClipboard(rangeCopySummary(start, end, "review-range"));
    log(`已复制评价范围: ${start} -> ${end}`);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("copyReviewDecisionPacketBtn").addEventListener("click", async () => {
  try {
    const selected = activeBook();
    if (!selected) throw new Error("请先选择一本书。");
    const packet = reviewDecisionPacket(selected);
    await copyTextToClipboard(JSON.stringify(packet, null, 2));
    log(`已复制评价决策包: ${packet.rangeEvidence.startChunkId || ""} -> ${packet.rangeEvidence.endChunkId || ""}`);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("copyReviewParamsBtn").addEventListener("click", async () => {
  try {
    const selected = activeBook();
    if (!selected) throw new Error("请先选择一本书。");
    const form = new FormData($("reviewForm"));
    const payload = buildReviewCreatePayload(selected, form);
    if (!payload.summary) throw new Error("范围评价需要 summary。");
    const params = {
      type: "review-create-params",
      book: selected.title || selected.bookId,
      author: selected.author || "",
      targets: reviewTargetsFromForm(form),
      payload,
    };
    await copyTextToClipboard(JSON.stringify(params, null, 2));
    log(`已复制评价参数: ${payload.startChunkId} -> ${payload.endChunkId}`);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("annotationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  clearFormError(formEl);
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) {
    setFormError(formEl, "请先选择一本书和一个 chunk。");
    return;
  }
  const form = new FormData(formEl);
  const { quote, quoteOffset } = quotePayloadFromForm(form);
  const note = String(form.get("note") || "").trim();
  if (!quote || !note) {
    setFormError(formEl, "边注需要引用和内容。");
    return;
  }
  try {
    await command({
      command: "annotate",
      bookId: selected.bookId,
      chunkId: state.selectedChunkId,
      quote,
      quoteOffset,
      note,
      kind: String(form.get("kind") || "annotation"),
      tags: ["co-reading", "sidecar"],
    });
    formEl.reset();
    await readSelectedChunk();
  } catch (error) {
    setFormError(formEl, error.message || String(error));
  }
});
$("userNoteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  clearFormError(formEl);
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) {
    setFormError(formEl, "请先选择一本书和一个 chunk。");
    return;
  }
  const form = new FormData(formEl);
  const { quote, quoteOffset } = quotePayloadFromForm(form);
  const note = String(form.get("note") || "").trim();
  if (!quote || !note) {
    setFormError(formEl, "用户笔记需要引用和内容。");
    return;
  }
  try {
    await command({
      command: "user_note_create",
      bookId: selected.bookId,
      chunkId: state.selectedChunkId,
      quote,
      quoteOffset,
      note,
      kind: "note",
      status: String(form.get("status") || "open"),
      tags: ["co-reading", "sidecar", "user-note"],
    });
    formEl.reset();
    await readSelectedChunk();
  } catch (error) {
    setFormError(formEl, error.message || String(error));
  }
});
$("submitUserNotesBtn").addEventListener("click", async () => {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) return;
  try {
    await command({
      command: "submit_notes",
      bookId: selected.bookId,
      chunkId: state.selectedChunkId,
      sessionId: `sidecar-${selected.bookId}`,
      contextMode: "chunk-once-per-session",
      includeContext: true,
    });
    await readSelectedChunk();
  } catch (error) {
    log(error.message || String(error));
  }
});
$("askNovaBtn").addEventListener("click", async () => {
  const button = $("askNovaBtn");
  const status = $("novaAskStatus");
  button.disabled = true;
  status.textContent = "思考中";
  try {
    const selected = activeBook();
    if (!selected || !state.selectedChunkId) throw new Error("请先选择一本书和 chunk。");
    const chunk = state.currentChunk?.chunk || state.currentChunk || {};
    const text = currentChunkText();
    if (!text) throw new Error("请先读取当前 chunk。");
    const prompt = String($("novaPrompt").value || "").trim() || "请陪我读这一段：解释重点，指出一句值得停留的话，再给一个下一步。";
    const quote = selectedQuote();
    const result = await askNova({
      prompt,
      context: currentNovaContext(selected, chunk, text, quote)
    });
    state.novaReply = result.content || "Nova 暂无文本回复。";
    renderNovaReply();
    log("Nova 已回应当前段落。");
  } catch (error) {
    status.textContent = "失败";
    log(error.message || String(error));
  } finally {
    button.disabled = false;
  }
});
$("askNovaSelectionBtn").addEventListener("click", () => {
  if (!$("novaPrompt").value.trim() || selectedQuote().text) $("novaPrompt").value = buildNovaPromptFromSelection();
  $("askNovaBtn").click();
});
$("copyNovaReplyBtn").addEventListener("click", async () => {
  try {
    await copyTextToClipboard(state.novaReply);
    log("已复制 Nova 回复。");
  } catch (error) {
    log(error.message || String(error));
  }
});
$("readChunkBtn").addEventListener("click", () => {
  void readSelectedChunk();
});
$("copyChunkTextBtn").addEventListener("click", async () => {
  $("copyChunkTextBtn").disabled = true;
  try {
    const selected = activeBook();
    if (!selected || !state.selectedChunkId) throw new Error("请先选择一本书和 chunk。");
    const chunk = state.currentChunk?.chunk || state.currentChunk || {};
    const text = currentChunkText();
    if (!state.currentChunk || !text) throw new Error("请先读取当前 chunk。");
    const summary = [
      `book: ${selected.title || selected.bookId}`,
      `bookId: ${selected.bookId}`,
      `chunkId: ${state.selectedChunkId}`,
      `title: ${chunk.title || chunk.sectionTitle || state.selectedChunkId}`,
      "",
      text
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制当前原文: ${selected.bookId} · ${state.selectedChunkId}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copyChunkTextBtn").disabled = false;
  }
});
$("copySelectionBtn").addEventListener("click", async () => {
  $("copySelectionBtn").disabled = true;
  try {
    const selected = activeBook();
    if (!selected || !state.selectedChunkId) throw new Error("请先选择一本书和 chunk。");
    const quote = selectedQuote();
    if (!quote.text) throw new Error("请先在原文里选中一段。");
    const chunk = state.currentChunk?.chunk || state.currentChunk || {};
    const summary = [
      `book: ${selected.title || selected.bookId}`,
      `bookId: ${selected.bookId}`,
      `chunkId: ${state.selectedChunkId}`,
      `title: ${chunk.title || chunk.sectionTitle || state.selectedChunkId}`,
      `quoteOffset: ${quote.offset === null ? "" : quote.offset}`,
      "",
      "quote:",
      quote.text
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制原文选区: ${state.selectedChunkId}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("copySelectionBtn").disabled = false;
  }
});
$("copyReadingContextBtn").addEventListener("click", async () => {
  try {
    const selected = activeBook();
    if (!selected || !state.selectedChunkId) throw new Error("请先选择一本书和 chunk。");
    const chunk = state.currentChunk?.chunk || state.currentChunk || {};
    const text = currentChunkText();
    const index = chunkOrder(state.selectedChunkId);
    const annotations = state.annotations || [];
    const userNotes = state.userNotes || [];
    const submissions = state.submissions || [];
    const backtrack = state.backtrackEvidence || null;
    const summary = [
      `book: ${selected.title || selected.bookId}`,
      `bookId: ${selected.bookId}`,
      `chunk: ${state.selectedChunkId}`,
      `position: ${index === null ? "" : `${index + 1}/${state.chunks.length}`}`,
      `title: ${chunk.title || chunk.sectionTitle || ""}`,
      "",
      "textPreview:",
      text.slice(0, 1800),
      "",
      `annotations: ${annotations.length}`,
      ...annotations.slice(0, 12).map((item, itemIndex) => `${itemIndex + 1}. ${item.author || "reader"} · ${item.kind || "annotation"} · ${item.quote || ""}\n   ${item.note || ""}`),
      "",
      `userNotes: ${userNotes.length}`,
      ...userNotes.slice(0, 12).map((item, itemIndex) => `${itemIndex + 1}. ${item.status || "open"} · ${item.quote || ""}\n   ${item.note || ""}`),
      "",
      `submissions: ${submissions.length}`,
      ...submissions.slice(0, 8).map((item) => `${item.id || ""} · ${item.submittedAt || ""} · ${item.status || ""}`),
      "",
      "backtrack:",
      backtrack ? [
        `query: ${backtrack.query || ""}`,
        `anchor: ${backtrack.anchorChunkId || ""}`,
        `chunks: ${(backtrack.chunkIds || []).join(", ")}`,
        String(backtrack.evidenceMarkdown || "").slice(0, 1200)
      ].join("\n") : "none"
    ].join("\n");
    await copyTextToClipboard(summary);
    log(`已复制阅读现场: ${selected.bookId} · ${state.selectedChunkId}`);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("markReadBtn").addEventListener("click", async () => {
  try {
    await markReadAndMaybeAdvance();
  } catch (error) {
    log(error.message || String(error));
  }
});
$("searchBtn").addEventListener("click", async () => {
  const selected = activeBook();
  const queryText = $("searchInput").value.trim();
  if (!selected || !queryText) return;
  try {
    state.searchResults = (await query({ command: "search", bookId: selected.bookId, query: queryText, limit: 8 })) || [];
    renderSearchResults();
  } catch (error) {
    log(error.message || String(error));
  }
});
$("searchInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    $("searchBtn").click();
  }
});
$("backtrackCurrentBtn").addEventListener("click", async () => {
  await createBacktrackPlan(state.selectedChunkId);
});
$("sinkBacktrackBtn").addEventListener("click", async () => {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) return;
  try {
    saveSinkSettings();
    const result = await command({
      ...backtrackPayload(selected.bookId, state.selectedChunkId),
      command: "sink_preview_create_from_backtrack",
      requireApproval: true,
      vaultPath: $("vaultPath").value || undefined,
      createdBy: "CoReadingSidecar"
    });
    state.backtrackEvidence = result.data?.backtrack || result.raw?.backtrack || null;
    renderBacktrackEvidence();
    await loadSnapshot();
    const preview = result.data?.preview || result.data?.previews?.[0] || result.raw?.preview || result.raw?.previews?.[0] || null;
    if (preview?.previewId) {
      const full = await query({ command: "sink_preview_get", previewId: preview.previewId });
      state.selectedSinkPreview = full.preview || full;
      state.selectedSinkDiff = null;
      renderSinkDetail();
    }
    log(result.raw || result.data || result);
  } catch (error) {
    log(error.message || String(error));
  }
});

$("planForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  clearFormError(formEl);
  const selected = activeBook();
  if (!selected) {
    setFormError(formEl, "请先选择一本书。");
    return;
  }
  const form = new FormData(formEl);
  const payload = buildPlanCreatePayload(selected, form);
  try {
    await command(payload);
    await loadSnapshot();
  } catch (error) {
    setFormError(formEl, error.message || String(error));
  }
});

$("reviewForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  clearFormError(formEl);
  const selected = activeBook();
  if (!selected) {
    setFormError(formEl, "请先选择一本书。");
    return;
  }
  const form = new FormData(formEl);
  const summary = String(form.get("summary") || "").trim();
  if (!summary) {
    setFormError(formEl, "范围评价需要 summary。");
    return;
  }
  const targets = reviewTargetsFromForm(form);
  const payload = buildReviewCreatePayload(selected, form);
  try {
    const reviewResult = await command(payload);
    const reviewId = reviewResult.data?.fullReview?.reviewId || reviewResult.data?.review?.reviewId;
    let previewResult = null;
    if (reviewId && targets.length) {
      previewResult = await command({
        command: "sink_preview_create",
        reviewId,
        targets,
        requireApproval: true,
        createdBy: "CoReadingSidecar",
      });
    }
    formEl.reset();
    renderReviewRangeStatus();
    if (previewResult) await openPreviewFromResult(previewResult, { refreshSnapshot: true });
    else await loadSnapshot();
  } catch (error) {
    setFormError(formEl, error.message || String(error));
  }
});

loadCardSaveResults();
loadCardPreviewResults();
loadSinkSettings();
renderSelfCheck();
renderChunkReview();
for (const input of sinkSettingInputs()) {
  input.addEventListener("input", saveSinkSettings);
  input.addEventListener("change", saveSinkSettings);
}
$("copySinkSettingsBtn").addEventListener("click", async () => {
  try {
    saveSinkSettings();
    await copyTextToClipboard(sinkSettingsSummary());
    log("已复制沉淀路径。");
  } catch (error) {
    log(error.message || String(error));
  }
});
$("clearSinkSettingsBtn").addEventListener("click", clearSinkSettings);
$("chunkText").addEventListener("scroll", () => {
  saveReadingSession();
  renderReaderProgress();
}, { passive: true });

void loadSinkDefaults().finally(loadSnapshot);

setInterval(() => {
  if (state.backgroundRunners.some((runner) => ["running", "waiting"].includes(runner.status))) {
    void loadSnapshot();
  }
}, 3000);
