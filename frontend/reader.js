/* CoReading 极简阅读器新壳 —— 复用 sidecar HTTP API，vanilla JS。 */
"use strict";

const STORE_PREFIX = "coreading-reader.";
const SETTINGS_KEY = `${STORE_PREFIX}settings`;
const POSITION_KEY = (bookId) => `${STORE_PREFIX}position.${bookId}`;
const AUTO_PREREAD_KEY = `${STORE_PREFIX}autoPreRead`;
const NOVA_TIMEOUT_MS = 360000;
const AUTO_PREREAD_DEBOUNCE_MS = 3000;
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
  sessionPreReads: [],    // 本会话自动预读结果（/api/nova/ask 不产生 agentRun，快照里没有）
  autoPreReadTimer: 0,
  autoPreReadInFlight: false,   // 全局同时只允许一个在飞自动预读
  autoPreReadTried: new Set(),  // `${bookId}:${chunkId}`：本会话已真正发过一次（成败都不再试）
  novaActiveHistoryId: "",
  novaPending: false,
  novaReply: null,        // { meta, text, chunkId }
  selection: null,        // { text, chunkId, rect }
  trailPending: false,
  sessionReplies: [],     // 本次会话 Nova 回复: { id, bookId, chunkId, text }
  annotations: [],        // 评注模型: { id, speaker, role, text, quote, chunkId, source, sourceId }
  chunkTextCache: new Map(),
  myNotes: new Map(),     // `${bookId}:${chunkId}` -> 已存笔记/边注的评注条目（懒加载缓存）
  myNotesPending: new Set(),
  noteDraft: null,        // { quote, chunkId }
  noteSaving: false,
  sinkDraft: null,        // 沉淀目标弹层的待沉淀内容
  sinkCreating: false,
  companions: new Map(),        // `${bookId}:${chunkId}` -> 书友评论数组（GET 结果缓存）
  companionsPending: new Map(), // key -> 在飞 GET Promise
  companionTried: new Set(),    // key：本会话已自动生成过一次（成败都不再试）
  companionSeen: new Set(),     // key：chunk 已首次进入过视口
  companionConfigured: null,    // null=未知；false 时开关置灰、不自动生成
  companionQueue: Promise.resolve(), // 自动生成按序串行，避免撞后端同书在飞锁
  find: { open: false, query: "", hits: [], active: -1, capped: false }, // hits: { paragraph, start, end } 文档序
  findInputTimer: 0,
  bookmarkFeedbackTimer: 0,
  novaOpenBeforeImmersive: false, // 进沉浸时 Nova 是否开着：退出时恢复原状
  plan: null,             // 当前书 active 计划缓存: { planId, title, status, stepCount, doneCount, nextStep, hydrated }
  planOpen: false,
  planBusy: false,
  skillOpen: false,
  skillPending: new Set(), // 在飞技能卡: preread / scout / trail / review / plan
  customFonts: [],        // 已注册导入字体: { name, family, size }（数据在 IndexedDB）
  settingsReturn: "",     // 设置页来路：bookId = 从阅读页进入，"" = 从书架进入
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

const SETTING_DEFAULTS = {
  theme: "white",
  face: "serif",
  para: "indent",
  companions: "on",
  letter: "0",
  paraGap: "normal",
  margin: "normal",
};
const SETTING_RANGE_DEFAULTS = { fontPx: 18, lineH: 1.95, measureEm: 38 };
const SETTING_RANGE_BOUNDS = { fontPx: [14, 22], lineH: [1.5, 2.4], measureEm: [32, 48] };

function clampRange(field, value) {
  const [min, max] = SETTING_RANGE_BOUNDS[field];
  // Number(null/"") 是 0：损坏值会被钳到下限（14px 字号），按缺省处理而不是钳值。
  const num = value === null || value === "" ? NaN : Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : SETTING_RANGE_DEFAULTS[field];
}

function readSettings() {
  const stored = readJson(SETTINGS_KEY);
  // 非对象（手改/旧版本写坏的字符串、数组）按空设置处理，否则严格模式下写属性会抛错。
  const saved = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  // 旧档位迁移：font s/m/l、width 窄/中/宽、line 紧凑/舒朗 → 数值存储（fontPx/measureEm/lineH）。
  if (saved.font || saved.width || saved.line) {
    if (!Number.isFinite(Number(saved.fontPx))) saved.fontPx = { s: 16, m: 18, l: 20 }[saved.font] || 18;
    if (!Number.isFinite(Number(saved.measureEm))) saved.measureEm = { narrow: 32, normal: 38, wide: 44 }[saved.width] || 38;
    if (!Number.isFinite(Number(saved.lineH))) {
      // 旧“舒朗”行距随字号变化（1.85/1.95/2.0），迁移时保留这层对应关系。
      saved.lineH = saved.line === "normal" ? 1.7 : { 16: 1.85, 18: 1.95, 20: 2 }[saved.fontPx] || 1.95;
    }
    delete saved.font;
    delete saved.width;
    delete saved.line;
    writeJson(SETTINGS_KEY, saved);
  }
  return saved;
}

function applySettings() {
  const saved = readSettings();
  for (const [field, fallback] of Object.entries(SETTING_DEFAULTS)) {
    document.body.dataset[field] = saved[field] || fallback;
  }
  // 导入字体没法写静态 CSS 选择器，--face-font 直接内联到 body；字体未注册完成前回退衬线栈。
  if (saved.face === "custom" && saved.customFamily) {
    document.body.style.setProperty("--face-font", `"${saved.customFamily}", var(--serif)`);
  } else {
    document.body.style.removeProperty("--face-font");
  }
  document.body.style.setProperty("--font-size", `${clampRange("fontPx", saved.fontPx)}px`);
  document.body.style.setProperty("--line", String(clampRange("lineH", saved.lineH)));
  document.body.style.setProperty("--measure", `${clampRange("measureEm", saved.measureEm)}em`);
  syncSettingControls();
}

function applySettingChange(field, value) {
  if (field === "autoPreRead") {
    // 与 Nova 面板头部开关同一存储源（AUTO_PREREAD_KEY），不进 SETTINGS_KEY。
    writeJson(AUTO_PREREAD_KEY, value === "on" ? "on" : "off");
    syncAutoPreReadButton();
    if (value === "on") scheduleAutoPreRead();
    else window.clearTimeout(state.autoPreReadTimer);
    syncSettingControls();
    return;
  }
  const saved = readSettings();
  if (field === "face" && value.startsWith("custom:")) {
    const font = state.customFonts.find((item) => item.name === value.slice(7));
    if (!font) return;
    saved.face = "custom";
    saved.customName = font.name;
    saved.customFamily = font.family;
  } else if (field in SETTING_RANGE_DEFAULTS) {
    saved[field] = clampRange(field, value);
  } else {
    saved[field] = value;
    if (field === "face") {
      delete saved.customName;
      delete saved.customFamily;
    }
  }
  writeJson(SETTINGS_KEY, saved);
  applySettings();
  // 重新打开书友评论时，给本会话已进过视口的 chunk 一次补生成机会。
  if (field === "companions" && value === "on") retryCompanionsForSeen();
}

function settingCurrentValue(field, saved) {
  if (field === "autoPreRead") return autoPreReadOn() ? "on" : "off";
  if (field === "face") return saved.face === "custom" ? `custom:${saved.customName}` : (saved.face || "serif");
  return saved[field] || SETTING_DEFAULTS[field] || "";
}

function syncSettingControls() {
  const saved = readSettings();
  document.querySelectorAll("[data-setting]").forEach((row) => {
    const current = settingCurrentValue(row.dataset.setting, saved);
    row.querySelectorAll("button[data-value]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.value === current));
    });
  });
  document.querySelectorAll("input.setting-range").forEach((input) => {
    input.value = String(clampRange(input.dataset.field, saved[input.dataset.field]));
  });
  document.querySelectorAll("[data-range-value]").forEach((label) => {
    const field = label.dataset.rangeValue;
    const value = clampRange(field, saved[field]);
    label.textContent = field === "fontPx" ? `${value}px`
      : field === "measureEm" ? `${value}em`
        : value.toFixed(2);
  });
}

function onSettingButtonClick(event) {
  const button = event.target.closest("button[data-value]");
  const row = button?.closest("[data-setting]");
  if (!button || !row || button.disabled) return;
  applySettingChange(row.dataset.setting, button.dataset.value);
}

function setupTypoPop() {
  $("typoBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    $("typoPop").hidden = !$("typoPop").hidden;
  });
  $("typoPop").addEventListener("click", (event) => {
    event.stopPropagation();
    onSettingButtonClick(event);
  });
  $("typoAllSettingsBtn").addEventListener("click", () => {
    $("typoPop").hidden = true;
    showSettings();
  });
  document.addEventListener("click", () => {
    $("typoPop").hidden = true;
  });
}

/* ---------- 导入字体（IndexedDB 持久 + FontFace 注册） ---------- */

const FONT_STORE = "fonts";
const FONT_MAX_COUNT = 3;
const FONT_MAX_BYTES = 25 * 1024 * 1024;

function customFontFamily(name) {
  // family 从文件名稳定推导：刷新后 IndexedDB 重载注册的名字与设置里存的一致。
  return `reader-custom-${hashCode(String(name))}`;
}

function openFontDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("coreading-reader", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FONT_STORE)) {
        request.result.createObjectStore(FONT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败"));
  });
}

async function fontStoreRun(mode, action) {
  const db = await openFontDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(FONT_STORE, mode);
      const request = action(tx.objectStore(FONT_STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB 操作失败"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB 操作中止"));
    });
  } finally {
    db.close();
  }
}

async function registerCustomFontFace(family, data) {
  const face = new FontFace(family, data); // 损坏文件在构造/加载时抛异常
  await face.load();
  document.fonts.add(face);
  return face;
}

async function loadCustomFontsAtStartup() {
  let records = [];
  try {
    records = (await fontStoreRun("readonly", (store) => store.getAll())) || [];
  } catch {
    return; // IndexedDB 不可用：跳过导入字体，回退栈不受影响
  }
  for (const record of records) {
    if (!record?.name || !record.data) continue;
    const family = record.family || customFontFamily(record.name);
    try {
      const face = await registerCustomFontFace(family, record.data);
      state.customFonts.push({ name: record.name, family, size: Number(record.size || 0), face });
    } catch {
      // 单个字体损坏只影响它自己。
    }
  }
  // 设置里还指着已不存在的导入字体（浏览器清了 IndexedDB 等）：回退衬线，
  // 否则字体行永远没有选中项、--face-font 永远指向加载不出来的 family。
  const saved = readSettings();
  if (saved.face === "custom" && !state.customFonts.some((item) => item.name === saved.customName)) {
    saved.face = "serif";
    delete saved.customName;
    delete saved.customFamily;
    writeJson(SETTINGS_KEY, saved);
  }
  renderFaceOptions();
  // 注册完成后重应用：正在使用的导入字体由回退栈切回真身（或刚回退的衬线生效）。
  applySettings();
}

async function importFontFile(file) {
  const status = $("fontImportStatus");
  if (!file) return;
  if (state.customFonts.length >= FONT_MAX_COUNT) {
    status.textContent = `最多导入 ${FONT_MAX_COUNT} 个字体，请先删除一个。`;
    return;
  }
  if (file.size > FONT_MAX_BYTES) {
    status.textContent = "单个字体文件不能超过 25MB。";
    return;
  }
  if (state.customFonts.some((item) => item.name === file.name)) {
    status.textContent = "同名字体已导入过。";
    return;
  }
  status.textContent = "导入中…";
  try {
    const data = await file.arrayBuffer();
    const family = customFontFamily(file.name);
    const face = await registerCustomFontFace(family, data);
    await fontStoreRun("readwrite", (store) => store.put({
      name: file.name,
      family,
      size: file.size,
      addedAt: new Date().toISOString(),
      data,
    }, file.name));
    state.customFonts.push({ name: file.name, family, size: file.size, face });
    renderFaceOptions();
    renderDataUsage();
    status.textContent = `已导入「${file.name}」，在上方字体里选用。`;
  } catch (error) {
    status.textContent = `导入失败：${compactText(error?.message || error, 80)}`;
  }
}

async function deleteCustomFont(name) {
  try {
    await fontStoreRun("readwrite", (store) => store.delete(name));
  } catch {
    // 持久层删除失败也移除会话内引用；下次启动若还在可再删。
  }
  // 同步从 document.fonts 注销：否则 FontFace 一直占内存，且同名重导会出现两个同 family 的字体。
  const removed = state.customFonts.find((item) => item.name === name);
  if (removed?.face) document.fonts.delete(removed.face);
  state.customFonts = state.customFonts.filter((item) => item.name !== name);
  const saved = readSettings();
  if (saved.face === "custom" && saved.customName === name) {
    saved.face = "serif"; // 删除正在使用的字体：回退衬线
    delete saved.customName;
    delete saved.customFamily;
    writeJson(SETTINGS_KEY, saved);
  }
  renderFaceOptions();
  renderDataUsage();
  applySettings();
}

function renderFaceOptions() {
  const wrap = $("customFaceList");
  wrap.textContent = "";
  for (const font of state.customFonts) {
    const item = document.createElement("span");
    item.className = "custom-face-item";
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "text-btn";
    pick.dataset.value = `custom:${font.name}`;
    pick.textContent = `我的字体·${compactText(font.name.replace(/\.[^.]+$/, ""), 14)}`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "custom-face-del";
    del.textContent = "✕";
    del.setAttribute("aria-label", `删除字体 ${font.name}`);
    del.addEventListener("click", (event) => {
      // 二段确认：第一次点变红，再点才真删。
      event.stopPropagation();
      if (!del.classList.contains("danger")) {
        del.classList.add("danger");
        window.setTimeout(() => del.classList.remove("danger"), 3000);
        return;
      }
      void deleteCustomFont(font.name);
    });
    item.append(pick, del);
    wrap.append(item);
  }
  syncSettingControls();
}

/* ---------- 设置页（#settings 全页路由） ---------- */

function showSettings() {
  // 记住来路：从阅读页进入时“返回”继续读原书，否则回书架。
  state.settingsReturn = !$("readView").hidden && state.bookId ? state.bookId : "";
  if (!$("readView").hidden) savePositionNow();
  window.clearTimeout(state.autoPreReadTimer);
  hideSelTool();
  closeCommentCard();
  closeNoteCard();
  closeSinkTargetPop();
  closeSinkDrawer();
  closeTrailDrawer();
  closeFindBar();
  closeToc();
  closeNova();
  $("typoPop").hidden = true;
  if (immersiveOn()) exitImmersive();
  history.replaceState(null, "", "#settings");
  $("shelfView").hidden = true;
  $("readView").hidden = true;
  $("settingsView").hidden = false;
  document.title = "设置";
  window.scrollTo(0, 0);
  renderSettings();
}

function closeSettings() {
  $("settingsView").hidden = true;
  const bookId = state.settingsReturn;
  state.settingsReturn = "";
  if (bookId && (state.snapshot?.books || []).some((book) => book.bookId === bookId)) {
    void openBook(bookId);
    return;
  }
  showShelf();
}

function renderSettings() {
  renderFaceOptions(); // 自带 syncSettingControls
  renderSinkDefaultControls();
  renderCompanionRoster();
  renderDataUsage();
  $("fontImportStatus").textContent = "";
  $("dataStatus").textContent = "";
  void renderSettingsHealth();
}

function renderSinkDefaultControls() {
  const saved = savedSinkTargets();
  document.querySelectorAll("input.sink-default").forEach((input) => {
    input.checked = saved.includes(input.value);
  });
  $("sinkDefaultStatus").textContent = "";
}

function onSinkDefaultChange(input) {
  const targets = Array.from(document.querySelectorAll("input.sink-default:checked")).map((item) => item.value);
  if (!targets.length) {
    input.checked = true; // 至少保留一个默认目标
    $("sinkDefaultStatus").textContent = "至少保留一个默认导出目标。";
    return;
  }
  writeJson(SINK_TARGETS_KEY, targets);
  $("sinkDefaultStatus").textContent = "已保存默认导出目标。";
}

function renderCompanionRoster() {
  // 前端没有 personas 列表接口：只读展示生成结果里见过的名字，没有就给配置说明。
  const names = new Set();
  for (const comments of state.companions.values()) {
    for (const comment of comments) {
      if (comment?.name) names.add(comment.name);
    }
  }
  $("companionRoster").textContent = names.size
    ? `本次会话出现过的书友：${[...names].join("、")}（AI 演绎）。`
    : "书友名单由服务端 personas 配置（作者人格 + 历史读者，均为 AI 演绎），生成过评论后会在这里列出。";
}

async function renderSettingsHealth() {
  $("novaHealthLine").textContent = "读取服务状态中…";
  $("aboutHealth").textContent = "读取服务状态中…";
  try {
    const health = await api("/api/health");
    setCompanionConfigured(Boolean(health.companionConfigured));
    const backends = Array.isArray(health.novaBackends) ? health.novaBackends.filter(Boolean).join(" / ") : "";
    const timeout = Number(health.novaTimeoutMs);
    $("novaHealthLine").textContent = [
      backends ? `后端 ${backends}` : "",
      health.novaAgentName ? `模型代理 ${health.novaAgentName}` : "",
      timeout ? `单次请求最长 ${Math.round(timeout / 1000)} 秒` : "",
    ].filter(Boolean).join(" · ") || "服务未返回 Nova 配置。";
    $("aboutHealth").textContent = `服务正常 · pid ${health.pid} · 已运行 ${Math.round(Number(health.uptimeSeconds || 0) / 60)} 分钟`;
  } catch (error) {
    $("novaHealthLine").textContent = "服务状态读取失败。";
    $("aboutHealth").textContent = `服务异常：${compactText(error.message || error, 60)}`;
  }
}

/* ---------- 设置页：本地数据占用与清理 ---------- */

const DATA_GROUPS = {
  positions: (key) => key.startsWith(`${STORE_PREFIX}position.`),
  bookmarks: (key) => key.startsWith(`${STORE_PREFIX}bookmarks.`),
  settings: (key) => [SETTINGS_KEY, AUTO_PREREAD_KEY, SINK_TARGETS_KEY].includes(key),
};

function localUsage(predicate) {
  let bytes = 0;
  let count = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!predicate(key)) continue;
    bytes += (key.length + String(localStorage.getItem(key) || "").length) * 2; // UTF-16 估算
    count += 1;
  }
  return { bytes, count };
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderDataUsage() {
  const positions = localUsage(DATA_GROUPS.positions);
  const bookmarks = localUsage(DATA_GROUPS.bookmarks);
  const settings = localUsage(DATA_GROUPS.settings);
  const fontBytes = state.customFonts.reduce((sum, font) => sum + Number(font.size || 0), 0);
  $("usagePositions").textContent = `${positions.count} 本 · ${formatBytes(positions.bytes)}`;
  $("usageBookmarks").textContent = `${bookmarks.count} 本 · ${formatBytes(bookmarks.bytes)}`;
  $("usageSettings").textContent = formatBytes(settings.bytes);
  $("usageFonts").textContent = `${state.customFonts.length} 个 · ${formatBytes(fontBytes)}`;
}

function removeLocalKeys(predicate) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
  for (const key of keys) {
    if (predicate(key)) localStorage.removeItem(key);
  }
}

function clearSettingsData() {
  removeLocalKeys(DATA_GROUPS.settings);
  applySettings();
  syncAutoPreReadButton();
  renderSinkDefaultControls();
}

async function clearFontData() {
  try {
    await fontStoreRun("readwrite", (store) => store.clear());
  } catch {
    // IndexedDB 不可用时只清会话内引用。
  }
  for (const font of state.customFonts) {
    if (font.face) document.fonts.delete(font.face);
  }
  state.customFonts = [];
  const saved = readSettings();
  if (saved.face === "custom") {
    saved.face = "serif";
    delete saved.customName;
    delete saved.customFamily;
    writeJson(SETTINGS_KEY, saved);
  }
  renderFaceOptions();
  applySettings();
}

function setupClearButton(id, action) {
  const button = $(id);
  const label = button.textContent;
  let timer = 0;
  button.addEventListener("click", async () => {
    // 二段确认：第一次点变红“确认清除”，4 秒不点回弹。
    if (!button.classList.contains("danger")) {
      button.classList.add("danger");
      button.textContent = "确认清除";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        button.classList.remove("danger");
        button.textContent = label;
      }, 4000);
      return;
    }
    window.clearTimeout(timer);
    button.disabled = true;
    try {
      await action();
      $("dataStatus").textContent = "已清除。";
    } catch (error) {
      $("dataStatus").textContent = `清除失败：${compactText(error.message || error, 60)}`;
    } finally {
      button.disabled = false;
      button.classList.remove("danger");
      button.textContent = label;
      renderDataUsage();
    }
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

function hashCode(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function coverBackground(bookId) {
  // 由 bookId hash 出两个相近色相的柔和渐变（饱和 25-40%、亮度 55-75%）。
  const hash = hashCode(String(bookId));
  const hue1 = hash % 360;
  const hue2 = (hue1 + 22 + (hash % 20)) % 360;
  const sat = 26 + (hash % 14);
  const light1 = 66 + (hash % 9);
  const light2 = 55 + (hash % 8);
  return `linear-gradient(160deg, hsl(${hue1}, ${sat}%, ${light1}%), hsl(${hue2}, ${sat}%, ${light2}%))`;
}

function coverGlyph(title) {
  const text = String(title || "").trim();
  if (!text) return "书";
  if (/[一-鿿]/.test(text[0])) return text.slice(0, 2);
  const words = text.split(/[\s_-]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join("");
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
    item.className = "book-card";
    const cover = document.createElement("div");
    cover.className = "book-cover";
    cover.style.background = coverBackground(book.bookId);
    const glyph = document.createElement("span");
    glyph.className = "cover-glyph";
    glyph.textContent = coverGlyph(book.title || book.bookId);
    const percent = bookProgressPercent(book);
    const track = document.createElement("span");
    track.className = "cover-progress";
    const fill = document.createElement("span");
    fill.style.width = `${percent}%`;
    track.append(fill);
    cover.append(glyph, track);
    const title = document.createElement("p");
    title.className = "book-title";
    title.textContent = book.title || book.bookId;
    const meta = document.createElement("p");
    meta.className = "book-meta";
    meta.textContent = [book.author, `${book.chunkCount || 0} 段`].filter(Boolean).join(" · ");
    item.append(cover, title, meta);
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
  window.clearTimeout(state.autoPreReadTimer);
  state.flowRequestId += 1;
  history.replaceState(null, "", location.pathname);
  $("readView").hidden = true;
  $("settingsView").hidden = true;
  $("shelfView").hidden = false;
  closeNova();
  hideSelTool();
  closeCommentCard();
  closeNoteCard();
  closeSinkTargetPop();
  closeSinkDrawer();
  closeTrailDrawer();
  closeFindBar();
  if (immersiveOn()) exitImmersive();
  document.title = "共读";
  window.scrollTo(0, 0);
  loadShelf();
}

function showReadView() {
  $("shelfView").hidden = true;
  $("settingsView").hidden = true;
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
  closeFindBar(); // 查找状态不跨书：旧命中引用的段落 DOM 即将被清掉
  state.plan = null;
  // 立即重渲计划小节：hydratePlanNext 要等正文加载后才跑，期间不能留着旧书的
  // “下一步”标签和可点的“完成这一步”（会执行到旧书计划上）。
  $("planStatus").textContent = "";
  renderPlanSection();
  state.bookId = bookId;
  state.bookTitle = book.title || bookId;
  history.replaceState(null, "", `#book=${encodeURIComponent(bookId)}`);
  showReadView();
  document.title = state.bookTitle;
  $("topbarTitle").textContent = state.bookTitle;
  $("topbarProgress").textContent = "";
  renderProgressLine(0);
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
  renderSinkBadge();
  void hydratePlanNext();
}

async function anchorFlowAt(index, { restoreOffset = 0 } = {}) {
  const requestId = ++state.flowRequestId;
  closeCommentCard();
  closeNoteCard();
  state.anchorIndex = Math.max(0, Math.min(index, state.chunks.length - 1));
  state.loadedTo = state.anchorIndex;
  state.activeChunkId = getChunkId(state.chunks[state.anchorIndex]);
  companionObserver?.disconnect();
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
  scheduleAutoPreRead();
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
  // 查找打开时：新增正文渲染已自带高亮（renderParagraph 内部读 find 状态），这里补刷命中列表与计数。
  if (state.find.open && state.find.query) runFind({ keepActive: true });
  const failedCount = loaded.filter((item) => item.failed).length;
  $("flowStatus").textContent = failedCount
    ? `有 ${failedCount} 段加载失败，继续滚动会接着读后面的内容。`
    : state.loadedTo >= state.chunks.length ? "· 全书完 ·" : "";
  return { stale: false, failedCount, batchSize: batch.length };
}

function sectionNoLabel(chunk) {
  const index = Number(chunk?.sectionIndex);
  if (Number.isFinite(index) && index > 0) return `第 ${index} 节`;
  const order = chunkOrder(getChunkId(chunk));
  if (order === null) return "";
  // 没有 sectionIndex 时数到当前 chunk 为止出现过的不同章节标题数；
  // 直接用 chunk 序号会在“一章多段”的书里产生第 1、4、7 节这样的跳号。
  let count = 0;
  let last = "";
  for (let i = 0; i <= order; i += 1) {
    const label = sectionLabel(state.chunks[i]);
    if (label !== last) {
      count += 1;
      last = label;
    }
  }
  return `第 ${count} 节`;
}

function appendFlowChunk(chunk, text) {
  if (!text.trim()) return;
  const chunkId = getChunkId(chunk);
  const section = document.createElement("section");
  section.className = "flow-chunk flow-enter";
  section.addEventListener("animationend", () => section.classList.remove("flow-enter"), { once: true });
  section.dataset.chunkId = chunkId;
  const previous = $("flow").querySelector(".flow-chunk:last-of-type");
  const previousLabel = previous ? sectionLabel(chunkById(previous.dataset.chunkId) || {}) : "";
  const label = sectionLabel(chunk);
  if (label && label !== previousLabel) {
    const head = document.createElement("header");
    head.className = "chunk-head";
    const no = document.createElement("p");
    no.className = "chunk-no";
    no.textContent = sectionNoLabel(chunk);
    const heading = document.createElement("h2");
    heading.textContent = label;
    head.append(no, heading);
    section.append(head);
  }
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const trimmed = block.replace(/^#{1,6}\s+/, "").trim();
    if (!trimmed || trimmed === label) continue;
    const paragraph = document.createElement("p");
    paragraph.textContent = trimmed;
    section.append(paragraph);
  }
  $("flow").append(section);
  companionObserver?.observe(section);
  decorateSection(section);
}

/* ---------- 滚动：顶栏隐藏 / 活动段落 / 懒加载 / 位置持久化 ---------- */

function updateTopbarVisibility() {
  const y = window.scrollY;
  const delta = y - state.lastScrollY;
  // 沉浸态顶栏初始隐藏：只有上滚（或鼠标到顶部边缘）才出现，接近页顶不再常驻。
  if (y > 80 && delta > 6) $("topbar").classList.add("hidden");
  else if (delta < -6 || (y <= 80 && !immersiveOn())) $("topbar").classList.remove("hidden");
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

function renderProgressLine(percent) {
  $("topbarProgressLine").style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function updateActiveChunk() {
  const section = activeSection();
  if (!section) return;
  const previousChunkId = state.activeChunkId;
  state.activeChunkId = section.dataset.chunkId;
  // 阅读推进到新 chunk：重置自动预读去抖计时（快速滚动时不连发）。
  if (state.activeChunkId !== previousChunkId) scheduleAutoPreRead();
  const order = chunkOrder(state.activeChunkId);
  const percent = order === null || !state.chunks.length
    ? 0
    : Math.round(((order + 1) / state.chunks.length) * 100);
  $("topbarProgress").textContent = `${percent}%`;
  renderProgressLine(percent);
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

function appendTocLabel(button, label, query) {
  // 匹配片段用 mark.toc-match 高亮；纯文本节点拼装，零 innerHTML。
  const index = query ? label.toLowerCase().indexOf(query) : -1;
  if (index < 0) {
    button.textContent = label;
    return;
  }
  button.append(document.createTextNode(label.slice(0, index)));
  const mark = document.createElement("mark");
  mark.className = "toc-match";
  mark.textContent = label.slice(index, index + query.length);
  button.append(mark, document.createTextNode(label.slice(index + query.length)));
}

function renderToc() {
  const list = $("tocList");
  list.textContent = "";
  const query = $("tocSearch").value.trim().toLowerCase();
  const activeOrder = chunkOrder(state.activeChunkId) ?? 0;
  let shown = 0;
  tocSections().forEach((section, sectionNumber) => {
    // 按章节标题或序号（第几节）过滤。
    if (query && !section.label.toLowerCase().includes(query) && String(sectionNumber + 1) !== query) return;
    shown += 1;
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toc-item";
    appendTocLabel(button, section.label, query);
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
  });
  if (query && !shown) {
    const empty = document.createElement("li");
    empty.className = "muted toc-empty";
    empty.textContent = "没有匹配的章节。";
    list.append(empty);
  }
}

function openToc() {
  renderToc();
  renderTocBookmarks();
  $("tocDrawer").hidden = false;
  $("tocBackdrop").hidden = false;
  const active = $("tocList").querySelector(".toc-item.active");
  if (active) active.scrollIntoView({ block: "center" });
}

function closeToc() {
  $("tocDrawer").hidden = true;
  $("tocBackdrop").hidden = true;
  // 关抽屉时清掉搜索词：下次打开回到完整目录。
  if ($("tocSearch").value) $("tocSearch").value = "";
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
  // 本会话自动预读走 /api/nova/ask，不会出现在快照 agentRuns 里，单独保存后在这里合并。
  return [...state.sessionPreReads, ...state.preReadHistory]
    .filter((item) => item.bookId === state.bookId);
}

function hasPreReadFor(bookId, chunkId) {
  // 巡读（scope=book）记录的 chunkId 只是 Nova 当时挑中的段，不算这段已被专门预读；
  // 对照旧壳 novaPreReadHistoryForCurrentChunk 的 scope!=="book" 过滤，否则评注层（同样跳过
  // book scope）不显示、新预读又被抑制，这个 chunk 就两头落空。
  return [...state.sessionPreReads, ...state.preReadHistory]
    .some((item) => item.scope !== "book" && item.bookId === bookId && item.chunkId === chunkId);
}

function formatHistoryTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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
    // 巡读条目（scope=book）没有 chunkId，标签只剩标题。
    button.append(document.createTextNode([item.chunkId, item.title].filter(Boolean).join(" · ")));
    const time = formatHistoryTime(item.answeredAt);
    if (time) {
      const span = document.createElement("span");
      span.className = "nova-history-time";
      span.textContent = time;
      button.append(span);
    }
    button.addEventListener("click", () => showPreReadItem(item));
    container.append(button);
  }
}

function showPreReadItem(item) {
  state.novaActiveHistoryId = item.id;
  state.novaReply = {
    meta: item.scope === "book"
      ? `Nova 巡读 · ${item.title}`
      : `Nova 预读 · ${item.chunkId} · ${item.title}`,
    text: item.note,
    bookId: item.bookId,
    bookTitle: state.bookTitle,
    chunkId: item.chunkId,
    pinned: true, // 用户主动点开的回看：自动预读完成时不许覆盖
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

function annotationsFromComment({ sourceId, source, chunkId, text, speaker = "Nova", role = "AI 共读", quote = "" }) {
  const base = { speaker, role, text, chunkId, source, sourceId };
  // 书友评论自带服务端逐字校验过的 quote，直接绑句子；其余来源从评论文本里提取引用。
  if (quote) return [{ ...base, id: `${sourceId}#0`, quote }];
  const quotes = extractQuotes(text);
  if (!quotes.length) return [{ ...base, id: `${sourceId}#0`, quote: "" }];
  return quotes.map((extracted, index) => ({ ...base, id: `${sourceId}#${index}`, quote: extracted }));
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
  for (const comments of state.companions.values()) {
    for (const comment of comments) {
      if (comment.bookId !== state.bookId) continue;
      items.push(...annotationsFromComment({
        sourceId: comment.id,
        source: "persona",
        chunkId: comment.chunkId,
        text: comment.text,
        speaker: comment.name,
        role: comment.role, // 服务端已强制 "AI 演绎 · 身份"
        quote: comment.quote,
      }));
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
  // 书内查找高亮走同一套切片：内部读全局 find 状态，任何重渲染路径都不破坏查找标记。
  const text = paragraph.textContent;
  const findRanges = findRangesFor(paragraph);
  if (!ranges.length && !flashRange && !findRanges.length
    && !paragraph.querySelector(".annot-underline, .quote-flash, .find-mark")) return;
  const points = new Set([0, text.length]);
  for (const range of ranges) { points.add(range.start); points.add(range.end); }
  for (const range of findRanges) { points.add(range.start); points.add(range.end); }
  if (flashRange) { points.add(flashRange.start); points.add(flashRange.end); }
  const sorted = [...points].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const activeHit = state.find.hits[state.find.active] || null;
  const nodes = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const [a, b] = [sorted[i], sorted[i + 1]];
    const piece = text.slice(a, b);
    const covering = ranges.filter((range) => range.start <= a && b <= range.end);
    const inFlash = Boolean(flashRange && flashRange.start <= a && b <= flashRange.end);
    const inFind = findRanges.find((range) => range.start <= a && b <= range.end) || null;
    if (!covering.length && !inFlash && !inFind) {
      nodes.push(document.createTextNode(piece));
      continue;
    }
    const el = document.createElement(inFlash || inFind ? "mark" : "span");
    if (inFlash) el.classList.add("quote-flash");
    if (inFind) {
      el.classList.add("find-mark");
      // 同一命中可能被评注边界切成多片，按命中区间起点识别当前命中，各片都加深。
      if (activeHit && activeHit.paragraph === paragraph && activeHit.start === inFind.start) {
        el.classList.add("find-active");
      }
    }
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
  ensureChunkCompanions(chunkId);
  for (const paragraph of section.querySelectorAll(":scope > p")) {
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
    for (const paragraph of section.querySelectorAll(":scope > p")) {
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
    const item = [...state.sessionPreReads, ...state.preReadHistory].find((entry) => entry.id === ann.sourceId);
    if (item) return showPreReadItem(item);
  }
  state.novaReply = {
    meta: `${ann.speaker} · ${ann.chunkId}`,
    text: ann.text,
    bookId: ann.bookId || state.bookId,
    bookTitle: state.bookTitle,
    chunkId: ann.chunkId,
    pinned: true, // 用户从评论卡主动点开查看：自动预读完成时不许覆盖
  };
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
    head.append(speaker);
    if (ann.source === "persona") {
      // 书友评论：名字旁细边小 chip 标注 AI 演绎；role 位只留身份，避免与 chip 重复。
      const chip = document.createElement("span");
      chip.className = "ai-chip";
      chip.textContent = "AI 演绎";
      head.append(chip);
    }
    const role = document.createElement("span");
    role.className = "comment-role";
    role.textContent = ann.source === "persona"
      ? String(ann.role || "").replace(/^AI 演绎\s*·\s*/u, "")
      : ann.role;
    head.append(role);
    const body = document.createElement("p");
    body.className = "comment-text";
    body.textContent = ann.text;
    item.append(head, body);
    const actions = document.createElement("p");
    actions.className = "comment-actions";
    // 我的笔记全文已在卡片里；书友评论是独立人格短评，都不进 Nova 面板。
    if (ann.source !== "mine" && ann.source !== "persona") {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "text-btn comment-open";
      open.textContent = "在 Nova 面板查看";
      open.addEventListener("click", () => {
        closeCommentCard();
        showAnnotationInNova(ann);
      });
      actions.append(open);
    }
    const sink = document.createElement("button");
    sink.type = "button";
    sink.className = "text-btn comment-open sink-trigger";
    sink.textContent = "导出";
    sink.addEventListener("click", () => openSinkTargetPop(sinkDraftFromAnnotation(ann), sink));
    actions.append(sink);
    if (ann.source === "mine") {
      // 二段式确认：第一次点变红“确认删除”，再点才真删。
      const del = document.createElement("button");
      del.type = "button";
      del.className = "text-btn comment-open";
      del.textContent = "删除";
      const fail = document.createElement("span");
      fail.className = "muted";
      del.addEventListener("click", async () => {
        if (!del.classList.contains("danger")) {
          del.classList.add("danger");
          del.textContent = "确认删除";
          return;
        }
        del.disabled = true;
        try {
          await deleteMyNote(ann);
          closeCommentCard();
        } catch (error) {
          del.disabled = false;
          del.classList.remove("danger");
          del.textContent = "删除";
          fail.textContent = ` 删除失败：${error.message || error}`;
          if (!fail.isConnected) actions.append(fail);
        }
      });
      actions.append(del);
    }
    item.append(actions);
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

/* ---------- 删除我的笔记/边注（user_note_delete，二段确认） ---------- */

async function deleteMyNote(ann) {
  await query({ command: "user_note_delete", id: ann.sourceId });
  const key = `${ann.bookId}:${ann.chunkId}`;
  state.myNotes.set(key, (state.myNotes.get(key) || []).filter((entry) => entry.sourceId !== ann.sourceId));
  rebuildAnnotations();
  redecorateChunk(ann.chunkId);
}

/* ---------- 模拟书友圈（personas 评论：GET 缓存展示 + 视口自动生成） ---------- */

let companionObserver = null;

function companionsOn() {
  return document.body.dataset.companions !== "off";
}

function companionKey(bookId, chunkId) {
  return `${bookId}:${chunkId}`;
}

function setCompanionConfigured(configured) {
  if (state.companionConfigured === configured) return;
  state.companionConfigured = configured;
  syncCompanionToggle();
}

function syncCompanionToggle() {
  const disabled = state.companionConfigured === false;
  $("companionRow").querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });
  $("companionHint").hidden = !disabled;
}

async function loadCompanionHealth() {
  try {
    const health = await api("/api/health");
    setCompanionConfigured(Boolean(health.companionConfigured));
  } catch {
    // 健康检查失败保持未知；GET 评论的响应里还会带回 configured。
  }
}

/* 与 ensureChunkNotes 同一时机：chunk 懒加载进正文流时拉一次缓存评论（展示不受开关影响）。 */
function ensureChunkCompanions(chunkId) {
  const key = companionKey(state.bookId, chunkId);
  if (!state.bookId || state.companions.has(key) || state.companionsPending.has(key)) return;
  state.companionsPending.set(key, loadChunkCompanions(state.bookId, chunkId, key));
}

async function loadChunkCompanions(bookId, chunkId, key) {
  try {
    const params = new URLSearchParams({ bookId, chunkId });
    const data = await api(`/api/companions?${params}`);
    if (typeof data.configured === "boolean") setCompanionConfigured(data.configured);
    state.companions.set(key, Array.isArray(data.comments) ? data.comments : []);
  } catch {
    // 拉取失败按空处理，避免对同一 chunk 反复请求；后端生成端点自身幂等，不会因此重复生成。
    state.companions.set(key, []);
  } finally {
    state.companionsPending.delete(key);
  }
  if (bookId !== state.bookId) return;
  if ((state.companions.get(key) || []).length) {
    rebuildAnnotations();
    redecorateChunk(chunkId);
  }
}

/* chunk 首次进入视口：开关开 + 接口已配置（或未知）+ 本会话没试过 → 排队自动生成一次。 */
function maybeAutoGenerateCompanions(chunkId) {
  if (!state.bookId || !companionsOn() || state.companionConfigured === false) return;
  const key = companionKey(state.bookId, chunkId);
  if (state.companionTried.has(key)) return;
  state.companionTried.add(key);
  const bookId = state.bookId;
  state.companionQueue = state.companionQueue
    .then(() => autoGenerateCompanions(bookId, chunkId, key))
    .catch(() => {});
}

async function autoGenerateCompanions(bookId, chunkId, key) {
  await (state.companionsPending.get(key) || Promise.resolve());
  if ((state.companions.get(key) || []).length) return; // GET 已带回缓存，无需生成
  if (!companionsOn() || state.companionConfigured === false) {
    // 排队期间被关掉/确认未配置：还没发请求，归还“本会话一次”的机会，
    // 否则重新打开开关时 retryCompanionsForSeen 会因 tried 已占用而永远跳过这个 chunk。
    state.companionTried.delete(key);
    return;
  }
  try {
    const data = await api("/api/companions/generate", {
      method: "POST",
      body: JSON.stringify({ bookId, chunkId }),
    });
    if (data.status === "not_configured") {
      setCompanionConfigured(false);
      return;
    }
    if (!Array.isArray(data.comments) || !data.comments.length) return;
    state.companions.set(key, data.comments);
    if (bookId !== state.bookId) return;
    rebuildAnnotations();
    redecorateChunk(chunkId);
  } catch {
    // 失败静默：本会话不再为这个 chunk 重试，阅读不被打扰。
  }
}

function retryCompanionsForSeen() {
  for (const section of $("flow").querySelectorAll(".flow-chunk")) {
    const chunkId = section.dataset.chunkId;
    if (state.companionSeen.has(companionKey(state.bookId, chunkId))) {
      maybeAutoGenerateCompanions(chunkId);
    }
  }
}

function setupCompanionObserver() {
  if (!("IntersectionObserver" in window)) return;
  companionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !entry.target.isConnected) continue;
      const chunkId = entry.target.dataset.chunkId;
      state.companionSeen.add(companionKey(state.bookId, chunkId));
      maybeAutoGenerateCompanions(chunkId);
      companionObserver.unobserve(entry.target); // 首次进入视口只触发一次
    }
  });
}

/* ---------- 沉淀：review_create → sink_preview_create → 批准 → 执行 ---------- */

const SINK_TARGETS_KEY = `${STORE_PREFIX}sinkTargets`;
const SINK_TARGET_LABELS = { obsidian: "Obsidian", dailyNote: "DailyNote", vcpMemory: "VCPMemory" };
const SINK_STATUS_LABELS = { pending: "待批准", approved: "已批准", exported: "已写入", rejected: "已拒绝" };

function bookSinkPreviews() {
  return (state.snapshot?.sinkPreviews || [])
    .filter((preview) => preview.bookId === state.bookId)
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function renderSinkBadge() {
  const pending = bookSinkPreviews().filter((preview) => preview.status === "pending").length;
  const badge = $("sinkBadge");
  badge.textContent = String(pending);
  badge.hidden = pending === 0;
}

function savedSinkTargets() {
  const saved = readJson(SINK_TARGETS_KEY);
  return Array.isArray(saved) && saved.length ? saved : ["obsidian"];
}

function closeSinkTargetPop() {
  $("sinkTargetPop").hidden = true;
  state.sinkDraft = null;
}

function openSinkTargetPop(draft, anchorEl) {
  // 先取锚点位置：锚点可能在 closeCommentCard() 即将隐藏的评论卡里，隐藏后 rect 全为 0。
  const anchorRect = anchorEl.getBoundingClientRect();
  closeCommentCard();
  state.sinkDraft = draft;
  const pop = $("sinkTargetPop");
  const saved = savedSinkTargets();
  pop.querySelectorAll("input[type=checkbox]").forEach((input) => {
    input.checked = saved.includes(input.value);
  });
  $("sinkTargetStatus").textContent = "";
  $("sinkTargetConfirmBtn").disabled = false;
  pop.hidden = false;
  if (window.matchMedia("(max-width: 1099px)").matches) {
    pop.classList.add("sheet");
    pop.style.left = "";
    pop.style.top = "";
    return;
  }
  pop.classList.remove("sheet");
  const left = Math.max(8, Math.min(
    anchorRect.left + window.scrollX,
    document.documentElement.clientWidth - pop.offsetWidth - 8
  ));
  pop.style.left = `${left}px`;
  pop.style.top = `${anchorRect.bottom + window.scrollY + 8}px`;
}

async function confirmSinkCreate() {
  const draft = state.sinkDraft;
  if (!draft || state.sinkCreating) return;
  const targets = Array.from($("sinkTargetPop").querySelectorAll("input[type=checkbox]:checked"))
    .map((input) => input.value);
  if (!targets.length) {
    $("sinkTargetStatus").textContent = "至少选一个导出目标。";
    return;
  }
  writeJson(SINK_TARGETS_KEY, targets);
  state.sinkCreating = true;
  $("sinkTargetConfirmBtn").disabled = true;
  $("sinkTargetStatus").textContent = "生成预览中…";
  try {
    await createSinkPreview(draft, targets);
    closeSinkTargetPop();
    renderSinkBadge();
  } catch (error) {
    $("sinkTargetStatus").textContent = `生成失败：${error.message || error}`;
    $("sinkTargetConfirmBtn").disabled = false;
  } finally {
    state.sinkCreating = false;
  }
}

async function createSinkPreview(draft, targets) {
  // payload 形状对照旧壳 currentChunkNotesReviewPayload / createCurrentChunkSinkPreview。
  // bookId 取 draft 携带的归属书：慢速 Nova 回复可能属于上一本书，不能用当前 state.bookId 张冠李戴。
  const bookId = draft.bookId || state.bookId;
  const bookTitle = draft.bookTitle || state.bookTitle;
  const chunkId = draft.chunkId;
  // 跨书时 chunkById 查的是当前书的同名 chunk，标题会拿错，直接退回 chunkId。
  const chunk = bookId === state.bookId ? (chunkById(chunkId) || {}) : {};
  const sourceQuote = draft.quote || compactText(draft.text, 200);
  const observations = [
    {
      section: "source_quote",
      source: draft.quote ? "reader-selection" : "current-chunk",
      chunkId,
      title: chunkTitle(chunk) || chunkId,
      quote: sourceQuote,
      text: sourceQuote,
      quoteOffset: null,
    },
    {
      section: draft.section || "user_note",
      source: draft.source || "user-note",
      kind: draft.kind || "note",
      chunkId,
      quote: draft.quote || "",
      note: draft.text,
      text: draft.text,
    },
  ];
  const reviewResult = await query({
    command: "review_create",
    bookId,
    startChunkId: chunkId,
    endChunkId: chunkId,
    summary: `${draft.sourceLabel || "评论"}导出预览：${bookTitle} · ${chunkId}`,
    observations,
    tags: ["co-reading", "reader-shell", "comment-sink"],
    sinkPolicy: {
      requireApproval: true,
      obsidian: targets.includes("obsidian"),
      dailyNote: targets.includes("dailyNote"),
      vcpMemory: targets.includes("vcpMemory"),
    },
    createdBy: "CoReadingReader",
  });
  const reviewId = reviewResult?.review?.reviewId || reviewResult?.reviewId;
  if (!reviewId) throw new Error("已创建评价，但没有返回 reviewId。");
  await query({
    command: "sink_preview_create",
    reviewId,
    targets,
    requireApproval: true,
    createdBy: "CoReadingReader",
  });
  try {
    await loadSnapshot();
  } catch {
    // 预览已经创建成功；快照刷新失败只影响角标，报“生成失败”会诱导用户重试出重复预览。
  }
}

function sinkDraftFromAnnotation(ann) {
  const fromNova = ann.speaker === "Nova";
  return {
    text: ann.text,
    quote: ann.quote || "",
    bookId: ann.bookId || state.bookId,
    bookTitle: state.bookTitle,
    chunkId: ann.chunkId,
    sourceLabel: ann.source === "persona" ? "书友评论" : fromNova ? "Nova 评注" : "我的笔记",
    section: fromNova ? "nova_reply" : "user_note",
    source: fromNova ? "nova-reply-current" : "user-note",
    kind: fromNova ? "nova-reply" : "note",
  };
}

/* ---------- 待沉淀箱抽屉 ---------- */

function openSinkDrawer() {
  $("sinkDrawer").hidden = false;
  $("sinkBackdrop").hidden = false;
  void refreshSinkDrawer();
}

function closeSinkDrawer() {
  $("sinkDrawer").hidden = true;
  $("sinkBackdrop").hidden = true;
}

async function refreshSinkDrawer() {
  $("sinkDrawerStatus").textContent = "加载中…";
  try {
    await loadSnapshot();
  } catch (error) {
    $("sinkDrawerStatus").textContent = `加载失败：${error.message || error}`;
    return;
  }
  renderSinkBadge();
  renderSinkList();
}

function renderSinkList() {
  const list = $("sinkList");
  list.textContent = "";
  const previews = bookSinkPreviews();
  $("sinkDrawerStatus").textContent = previews.length ? "" : "本书还没有导出预览。";
  for (const preview of previews) {
    list.append(buildSinkItem(preview));
  }
}

function buildSinkItem(preview) {
  const item = document.createElement("li");
  item.className = "sink-item";
  const head = document.createElement("p");
  head.className = "sink-item-head";
  const target = document.createElement("span");
  target.className = "sink-item-target";
  target.textContent = SINK_TARGET_LABELS[preview.target] || preview.target;
  const status = document.createElement("span");
  status.className = `sink-item-status status-${preview.status}`;
  status.textContent = SINK_STATUS_LABELS[preview.status] || preview.status;
  head.append(target, status);
  const meta = document.createElement("p");
  meta.className = "sink-item-meta";
  meta.textContent = [formatHistoryTime(preview.createdAt), preview.reviewId].filter(Boolean).join(" · ");
  const body = document.createElement("div");
  body.className = "sink-preview-body";
  body.hidden = true;
  const actions = document.createElement("div");
  actions.className = "sink-item-actions";
  const feedback = document.createElement("span");
  feedback.className = "muted sink-item-feedback";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "text-btn";
  toggle.textContent = "展开预览";
  toggle.addEventListener("click", async () => {
    if (!body.hidden) {
      body.hidden = true;
      toggle.textContent = "展开预览";
      return;
    }
    if (!body.textContent) {
      toggle.disabled = true;
      try {
        const result = await query({ command: "sink_preview_get", previewId: preview.previewId });
        // vcpMemory 的 content 是对象不是字符串，对照旧壳用 JSON 展示，别渲染成 [object Object]。
        const content = result?.preview?.content ?? result?.content;
        body.textContent = typeof content === "string" && content
          ? content
          : content ? JSON.stringify(content, null, 2) : "（没有预览正文）";
      } catch (error) {
        body.textContent = `预览读取失败：${error.message || error}`;
      } finally {
        toggle.disabled = false;
      }
    }
    body.hidden = false;
    toggle.textContent = "收起预览";
  });
  actions.append(toggle);

  // 审批门禁：pending → 批准；approved → 执行写入；exported 无动作。
  if (preview.status === "pending") {
    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "text-btn";
    approve.textContent = "批准";
    approve.addEventListener("click", async () => {
      approve.disabled = true;
      feedback.textContent = "批准中…";
      try {
        await query({
          command: "sink_preview_update",
          previewId: preview.previewId,
          status: "approved",
          updatedBy: "CoReadingReader",
        });
        await refreshSinkDrawer();
      } catch (error) {
        feedback.textContent = `批准失败：${error.message || error}`;
        approve.disabled = false;
      }
    });
    actions.append(approve);
  }
  if (preview.status === "approved") {
    const execute = document.createElement("button");
    execute.type = "button";
    execute.className = "text-btn";
    execute.textContent = "执行写入";
    execute.addEventListener("click", async () => {
      execute.disabled = true;
      feedback.textContent = "写入中…";
      try {
        await query({
          command: "sink_execute",
          previewId: preview.previewId,
          updatedBy: "CoReadingReader",
        });
        await refreshSinkDrawer();
      } catch (error) {
        feedback.textContent = `写入失败：${error.message || error}`;
        execute.disabled = false;
      }
    });
    actions.append(execute);
  }
  if (preview.status === "exported" && preview.destination?.notePath) {
    const where = document.createElement("span");
    where.className = "muted sink-item-feedback";
    where.textContent = preview.destination.notePath;
    actions.append(where);
  }
  actions.append(feedback);
  item.append(head, meta, body, actions);
  return item;
}

/* ---------- Nova 回复动作：存为笔记 / 沉淀 ---------- */

async function saveNovaReplyAsNote() {
  const reply = state.novaReply;
  // 笔记归属跟着回复本身：reply 可能来自上一本书（慢速回复期间切书），不能写进当前书。
  const bookId = reply?.bookId || state.bookId;
  if (!reply?.text || !reply.chunkId || !bookId || state.noteSaving) return;
  // 历史预读 meta 是 "Nova 预读 · ..."，自动预读 meta 是 "Nova 自主预读 · ..."，都按预读归档。
  const isPreRead = /^Nova (自主)?预读/.test(String(reply.meta || ""));
  const button = $("novaSaveNoteBtn");
  button.disabled = true;
  $("novaActionStatus").textContent = "保存中…";
  try {
    // payload 对照旧壳 novaReplyNotePayload：kind 用 nova-reply / nova-pre-read 约定，还原 Nova 署名。
    // 跨书时 chunkById 查的是当前书，标题会拿错，直接退回 chunkId。
    const quoteTitle = bookId === state.bookId ? chunkTitle(chunkById(reply.chunkId)) : "";
    const result = await query({
      command: "user_note_create",
      bookId,
      chunkId: reply.chunkId,
      quote: quoteTitle || reply.chunkId,
      quoteOffset: null,
      note: [
        isPreRead ? "Nova 自主预读" : "Nova 共读回应",
        reply.prompt ? `问题: ${reply.prompt}` : "",
        "",
        reply.text,
      ].filter(Boolean).join("\n"),
      kind: isPreRead ? "nova-pre-read" : "nova-reply",
      status: "open",
      tags: ["co-reading", "sidecar", isPreRead ? "nova-pre-read" : "nova-reply"],
    });
    const record = result?.note && typeof result.note === "object" ? result.note : (result || {});
    addMyNoteRecord(myAnnotationFromRecord({
      id: record.id || `local-${Date.now()}`,
      bookId: record.bookId || bookId,
      chunkId: record.chunkId || reply.chunkId,
      quote: record.quote || "",
      note: record.note || reply.text,
      kind: record.kind || (isPreRead ? "nova-pre-read" : "nova-reply"),
    }, "笔记"));
    $("novaActionStatus").textContent = "已存为笔记。";
  } catch (error) {
    $("novaActionStatus").textContent = `保存失败：${error.message || error}`;
  } finally {
    button.disabled = false;
  }
}

function sinkFromNovaReply() {
  const reply = state.novaReply;
  if (!reply?.text || !reply.chunkId || !state.bookId) return;
  openSinkTargetPop({
    text: reply.text,
    quote: "",
    bookId: reply.bookId || state.bookId,
    bookTitle: reply.bookTitle || state.bookTitle,
    chunkId: reply.chunkId,
    sourceLabel: "Nova 回复",
    section: "nova_reply",
    source: "nova-reply-current",
    kind: "nova-reply",
  }, $("novaSinkBtn"));
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
  // 我的 prompt 显示为右对齐细边气泡，留在回复上方作上下文（纯展示）。
  const userBubble = $("novaUserBubble");
  userBubble.textContent = state.novaReply?.prompt || "";
  userBubble.hidden = !state.novaReply?.prompt;
  const container = $("novaReply");
  container.textContent = "";
  // 巡读回复（scope=book）没有 chunkId 可归属，存笔记/导出动作不展示。
  $("novaReplyActions").hidden = !(state.novaReply?.text && state.novaReply?.chunkId);
  $("novaActionStatus").textContent = "";
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
    // 归属用请求时的 context.bookId：Nova 最长可等几分钟，期间切书不能把回复算到新书头上。
    state.novaReply = {
      meta: `Nova · ${context.chunkId} · 刚刚`,
      text: replyText,
      bookId: context.bookId,
      bookTitle: context.bookTitle,
      chunkId: context.chunkId,
      prompt,
    };
    if (result.content) {
      state.sessionReplies.push({
        id: `nova-reply-${Date.now()}`,
        bookId: context.bookId,
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

/* ---------- Nova 自动预读（autonomous pre-read 调度，移植旧壳能力） ---------- */

function autoPreReadOn() {
  return readJson(AUTO_PREREAD_KEY) !== "off";
}

function syncAutoPreReadButton() {
  $("novaAutoBtn").setAttribute("aria-pressed", String(autoPreReadOn()));
}

function toggleAutoPreRead() {
  writeJson(AUTO_PREREAD_KEY, autoPreReadOn() ? "off" : "on");
  syncAutoPreReadButton();
  syncSettingControls(); // 设置页同一开关保持同步
  if (autoPreReadOn()) scheduleAutoPreRead();
  else window.clearTimeout(state.autoPreReadTimer);
}

function scheduleAutoPreRead() {
  window.clearTimeout(state.autoPreReadTimer);
  if (!autoPreReadOn() || !state.bookId || $("readView").hidden) return;
  state.autoPreReadTimer = window.setTimeout(() => {
    void runAutoPreRead();
  }, AUTO_PREREAD_DEBOUNCE_MS);
}

async function runAutoPreRead() {
  const bookId = state.bookId;
  const chunkId = state.activeChunkId;
  if (!autoPreReadOn() || !bookId || !chunkId || $("readView").hidden) return;
  // 手动提问优先：手动在飞时让路，不占用本 chunk 的尝试机会，等下一次触发再试。
  if (state.novaPending || state.autoPreReadInFlight) return;
  const key = `${bookId}:${chunkId}`;
  if (state.autoPreReadTried.has(key) || hasPreReadFor(bookId, chunkId)) return;
  state.autoPreReadInFlight = true;
  try {
    const text = renderedChunkText(chunkId) || await chunkRawText(chunkId).catch(() => "");
    if (!text.trim() || bookId !== state.bookId) return;
    state.autoPreReadTried.add(key); // 即将真正发请求：每 chunk 会话内只试一次（成败都算）
    const context = await buildAutoPreReadContext(bookId, chunkId, text);
    if (bookId !== state.bookId) return; // 取候选期间切书，放弃本次
    const result = await askNovaApi({ prompt: buildAutoPreReadPrompt(), context });
    recordAutoPreRead(context, result.content || "");
  } catch (error) {
    // 真实环境 Nova 上游经常 35s+ 超时甚至 502：自动预读失败必须完全静默，不打扰阅读。
    console.debug("[coreading] 自动预读静默失败:", error?.message || error);
  } finally {
    state.autoPreReadInFlight = false;
  }
}

function buildAutoPreReadPrompt() {
  // 对照旧壳 buildNovaAutonomousReadingPrompt 的自主预读风格。
  return [
    "请你作为 Nova 自主阅读当前段落，不等我指定问题。",
    "你可以自己选择最值得看的角度：概念、隐喻、结构、疑点、值得停留的句子或后续线索。",
    "输出保持短而有用：",
    "1. 你决定先看哪里，为什么；",
    "2. 对这一段做一条具体评论，必须锚定原文，引用原文句子时用“”引号包住原句；",
    "3. 选一句值得摘下来的话；",
    "4. 给我一个下一步阅读动作。",
    "不要泛泛总结，不要假装读了未传入的后文。",
  ].join("\n");
}

function novaTocPreview(limit = 18) {
  // 对照旧壳 novaTocPreview：当前书目录前 ~18 项。
  return state.chunks.slice(0, limit).map((chunk, index) => ({
    chunkId: getChunkId(chunk),
    title: chunkTitle(chunk),
    sectionTitle: String(chunk.sectionTitle || chunk.title || ""),
    position: `${index + 1}/${state.chunks.length}`,
  }));
}

async function autoPreReadCandidates(chunkId, currentText) {
  // 当前 chunk 附近 2-3 个候选：当前段 + 顺读方向的后两段。
  const order = chunkOrder(chunkId) ?? 0;
  const ids = [chunkId];
  for (const neighbor of [order + 1, order + 2]) {
    const chunk = state.chunks[neighbor];
    if (chunk) ids.push(getChunkId(chunk));
  }
  const candidates = [];
  for (const id of ids.slice(0, 3)) {
    const chunk = chunkById(id) || {};
    let text = id === chunkId ? currentText : renderedChunkText(id);
    if (!text) {
      try {
        text = await chunkRawText(id);
      } catch {
        continue; // 候选段失败时跳过，保留其它可读上下文。
      }
    }
    if (!text.trim()) continue;
    candidates.push({ chunkId: id, title: chunkTitle(chunk) || id, text: compactText(text, 1800) });
  }
  return candidates;
}

async function buildAutoPreReadContext(bookId, chunkId, text) {
  const chunk = chunkById(chunkId) || {};
  const order = chunkOrder(chunkId);
  return {
    coReadingContextVersion: "2026-06-reader-shell",
    contextMode: "autonomous-reading",
    runtimeAgent: "Nova",
    productMode: "single-agent-reader",
    bookId,
    bookTitle: state.bookTitle,
    chunkId,
    chunkTitle: chunkTitle(chunk) || chunkId,
    chunkPosition: order === null ? "" : `${order + 1}/${state.chunks.length}`,
    text: compactText(text, 6000),
    selection: "",
    selectionOffset: null,
    tocPreview: novaTocPreview(),
    autonomousCandidates: await autoPreReadCandidates(chunkId, text),
    instructionBoundary: "Nova 可以在 autonomousCandidates 中自行选择先读哪里；只能评论传入候选段和当前段，不要假装读完整本书。",
  };
}

function recordAutoPreRead(context, replyText) {
  const note = compactText(replyText, 520);
  if (!note) return;
  const item = {
    id: `nova-pre-${context.bookId}-${context.chunkId}-${Date.now()}`,
    bookId: context.bookId,
    chunkId: context.chunkId,
    title: context.chunkTitle || context.chunkId,
    note,
    scope: "chunk",
    answeredAt: new Date().toISOString(),
  };
  state.sessionPreReads.unshift(item);
  // 慢速回复期间切书：历史按请求时的 bookId 归档，不渲染进当前书。
  if (item.bookId !== state.bookId) return;
  rebuildAnnotations();
  redecorateChunk(item.chunkId);
  // 不抢用户的对话：手动请求在飞、面板正显示手动回复、或用户正回看历史/评论时，只进历史列表和评注层。
  if (!state.novaPending && !state.novaReply?.prompt && !state.novaReply?.pinned) {
    state.novaActiveHistoryId = item.id;
    state.novaReply = {
      meta: `Nova 自主预读 · ${item.chunkId} · ${item.title}`,
      text: item.note,
      bookId: item.bookId,
      bookTitle: state.bookTitle,
      chunkId: item.chunkId,
    };
    renderNovaReply();
  }
  renderNovaHistory();
}

/* ---------- 选区追线索（interest_backtrack 抽屉） ---------- */

function openTrailDrawer() {
  $("trailDrawer").hidden = false;
  $("trailBackdrop").hidden = false;
}

function closeTrailDrawer() {
  $("trailDrawer").hidden = true;
  $("trailBackdrop").hidden = true;
}

async function executeTrail(clueText, anchorChunkId) {
  const bookId = state.bookId;
  // payload 对照旧壳 backtrackPayload：线索文本 + bounded evidence 参数。
  const result = await query({
    command: "interest_backtrack",
    bookId,
    query: String(clueText || "").replace(/\s+/g, " ").trim().slice(0, 120) || undefined,
    anchorChunkId,
    before: 2,
    after: 2,
    maxRanges: 4,
    mergeGap: 1,
    includeEvidence: true,
  });
  if (bookId !== state.bookId || $("readView").hidden) return false; // 等待期间切书/回书架，结果作废
  renderTrailResult(result);
  openTrailDrawer();
  return true;
}

async function trailFromSelection() {
  const selection = state.selection;
  if (!selection?.text || !state.bookId || state.trailPending) return;
  state.trailPending = true;
  const button = $("selTrailBtn");
  const status = $("selToolStatus");
  button.disabled = true;
  button.textContent = "查找中…";
  status.hidden = true;
  try {
    if (await executeTrail(selection.text, selection.chunkId)) hideSelTool();
  } catch (error) {
    status.textContent = `相关段落查找失败：${compactText(error.message || error, 60)}，可点按钮重试。`;
    status.hidden = false;
  } finally {
    state.trailPending = false;
    button.disabled = false;
    button.textContent = "相关段落";
  }
}

function renderTrailResult(result) {
  const evidence = result?.evidence || {};
  const ranges = Array.isArray(evidence.rangeSummaries) ? evidence.rangeSummaries : [];
  const anchors = Array.isArray(evidence.anchorSnippets) ? evidence.anchorSnippets : [];
  $("trailSummary").textContent = [
    result?.query ? `「${compactText(result.query, 24)}」` : "",
    `${anchors.length} 个锚点 · ${ranges.length} 组范围`,
    ranges.length ? "" : "没有命中范围",
  ].filter(Boolean).join(" · ");
  const list = $("trailList");
  list.textContent = "";
  for (const range of ranges) {
    const anchorChunkId = range.anchorChunkIds?.[0] || range.startChunkId;
    const order = chunkOrder(anchorChunkId);
    const chunk = chunkById(anchorChunkId);
    // 选区锚点（source=anchor）的 snippet 恒为 null，优先挑同范围里带摘录的搜索锚点。
    const snippet = anchors.find((anchor) => range.anchorChunkIds?.includes(anchor.chunkId) && anchor.snippet)?.snippet || "";
    const item = document.createElement("li");
    const row = document.createElement("button");
    row.type = "button";
    row.className = "trail-row";
    const head = document.createElement("p");
    head.className = "trail-row-head";
    head.textContent = [
      order === null ? anchorChunkId : `第 ${order + 1} 段`,
      chunk ? sectionLabel(chunk) : "",
    ].filter(Boolean).join(" · ");
    const body = document.createElement("p");
    body.className = "trail-row-snippet";
    body.textContent = compactText(snippet || range.label, 100);
    row.append(head, body);
    row.addEventListener("click", () => {
      closeTrailDrawer();
      void jumpToChunk(anchorChunkId); // 已加载滚动定位，未加载重锚加载（同 ↩ 跳转路径）
    });
    item.append(row);
    list.append(item);
  }
}

/* ---------- 书内查找（Ctrl+F / Cmd+F） ---------- */

const FIND_HITS_MAX = 500;

function findRangesFor(paragraph) {
  // renderParagraph 的切片渲染从这里取查找区间；大小写不敏感的明文匹配，不重叠。
  if (!state.find.open || !state.find.query) return [];
  const query = state.find.query.toLowerCase();
  const text = paragraph.textContent.toLowerCase();
  const ranges = [];
  let index = text.indexOf(query);
  while (index >= 0) {
    ranges.push({ start: index, end: index + query.length });
    index = text.indexOf(query, index + query.length);
  }
  return ranges;
}

function openFindBar() {
  state.find.open = true;
  $("findBar").hidden = false;
  $("findInput").focus();
  $("findInput").select();
  if (state.find.query) runFind({ keepActive: true });
  else renderFindCount();
}

function paragraphsWithFindMarks(into) {
  // hits 有 500 上限：超限段落的 find-mark 不进 hits（懒加载/评注重渲染都会渲出来），
  // 清理/换词时必须从 DOM 收齐，否则关掉查找后超限高亮永远残留。
  for (const mark of $("flow").querySelectorAll("mark.find-mark")) {
    const paragraph = mark.closest("p");
    if (paragraph) into.add(paragraph);
  }
  return into;
}

function closeFindBar() {
  if (!state.find.open) return;
  const marked = paragraphsWithFindMarks(new Set(state.find.hits.map((hit) => hit.paragraph)));
  state.find = { open: false, query: "", hits: [], active: -1, capped: false };
  $("findBar").hidden = true;
  $("findInput").value = "";
  window.clearTimeout(state.findInputTimer);
  // 状态清空后重渲染原命中段：findRangesFor 已返回空，所有 find-mark 被还原。
  for (const paragraph of marked) {
    if (paragraph.isConnected) renderParagraph(paragraph, underlineRangesFor(paragraph));
  }
}

function defaultFindActive() {
  // 从视口位置就近开始：第一个不在视口上方的命中；都在上方则回到第一个。
  for (let i = 0; i < state.find.hits.length; i += 1) {
    if (!state.find.hits[i].paragraph.isConnected) continue;
    if (state.find.hits[i].paragraph.getBoundingClientRect().bottom >= 0) return i;
  }
  return 0;
}

function runFind({ keepActive = false } = {}) {
  const raw = $("findInput").value;
  const previousActive = state.find.hits[state.find.active] || null;
  const touched = paragraphsWithFindMarks(new Set(state.find.hits.map((hit) => hit.paragraph)));
  state.find.query = raw.trim() ? raw : "";
  state.find.hits = [];
  state.find.active = -1;
  state.find.capped = false;
  if (state.find.query) {
    // 命中数上限：单字高频词在长正文流里可能上万次命中，截断保护渲染。
    scan: for (const paragraph of $("flow").querySelectorAll(".flow-chunk > p")) {
      for (const range of findRangesFor(paragraph)) {
        if (state.find.hits.length >= FIND_HITS_MAX) {
          state.find.capped = true;
          break scan;
        }
        state.find.hits.push({ paragraph, start: range.start, end: range.end });
      }
    }
  }
  if (state.find.hits.length) {
    const kept = keepActive && previousActive
      ? state.find.hits.findIndex((hit) => hit.paragraph === previousActive.paragraph && hit.start === previousActive.start)
      : -1;
    state.find.active = kept >= 0 ? kept : defaultFindActive();
  }
  for (const hit of state.find.hits) touched.add(hit.paragraph);
  for (const paragraph of touched) {
    if (paragraph.isConnected) renderParagraph(paragraph, underlineRangesFor(paragraph));
  }
  renderFindCount();
}

function renderFindCount() {
  const { query, hits, active, capped } = state.find;
  $("findCount").textContent = !query
    ? ""
    : hits.length ? `${active + 1}/${hits.length}${capped ? "+" : ""}` : "0/0";
  // 已加载部分查不到且后文还有：露出“加载更多”继续找。
  $("findMoreBtn").hidden = !(query && !hits.length && state.loadedTo < state.chunks.length);
}

function scrollToActiveFindHit() {
  const hit = state.find.hits[state.find.active];
  if (!hit || !hit.paragraph.isConnected) return;
  const mark = hit.paragraph.querySelector("mark.find-active");
  if (!mark) return;
  const top = mark.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4;
  window.scrollTo({ top: Math.max(0, top) });
}

function moveFindActive(delta) {
  if (!state.find.hits.length) return;
  const previous = state.find.hits[state.find.active] || null;
  state.find.active = (state.find.active + delta + state.find.hits.length) % state.find.hits.length;
  const current = state.find.hits[state.find.active];
  for (const paragraph of new Set([previous?.paragraph, current.paragraph])) {
    if (paragraph?.isConnected) renderParagraph(paragraph, underlineRangesFor(paragraph));
  }
  renderFindCount();
  scrollToActiveFindHit();
}

function onFindInput() {
  window.clearTimeout(state.findInputTimer);
  state.findInputTimer = window.setTimeout(() => {
    runFind();
    scrollToActiveFindHit();
  }, 150);
}

async function findLoadMore() {
  const button = $("findMoreBtn");
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = "查找中…";
  try {
    // 每次最多再加载 10 批：找到命中、读到书尾或被重锚抢占就停，避免无界长跑。
    for (let i = 0; i < 10 && state.find.open && !state.find.hits.length && state.loadedTo < state.chunks.length; i += 1) {
      while (state.flowLoadPromise) await state.flowLoadPromise.catch(() => {});
      const before = state.loadedTo;
      await loadMoreChunks();
      if (state.loadedTo === before) break;
    }
  } finally {
    button.disabled = false;
    button.textContent = "加载更多";
  }
  renderFindCount();
  if (state.find.hits.length) scrollToActiveFindHit();
}

/* ---------- 书签（localStorage，上限 50 FIFO） ---------- */

const BOOKMARKS_KEY = (bookId) => `${STORE_PREFIX}bookmarks.${bookId}`;
const BOOKMARKS_MAX = 50;

function readBookmarks(bookId = state.bookId) {
  const saved = readJson(BOOKMARKS_KEY(bookId));
  return Array.isArray(saved) ? saved : [];
}

function addBookmark() {
  if (!state.bookId || $("readView").hidden) return;
  const section = activeSection();
  if (!section) return;
  const chunkId = section.dataset.chunkId;
  const order = chunkOrder(chunkId);
  const bookmarks = readBookmarks();
  bookmarks.push({
    id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    chunkId,
    // 与阅读位置持久化同一套段内偏移公式，恢复走 anchorFlowAt 的 restoreOffset。
    offset: Math.max(0, Math.round(window.scrollY - section.offsetTop + 64)),
    percent: order === null || !state.chunks.length ? 0 : Math.round(((order + 1) / state.chunks.length) * 100),
    createdAt: new Date().toISOString(),
  });
  while (bookmarks.length > BOOKMARKS_MAX) bookmarks.shift();
  writeJson(BOOKMARKS_KEY(state.bookId), bookmarks);
  const button = $("bookmarkBtn");
  button.textContent = "已加书签";
  window.clearTimeout(state.bookmarkFeedbackTimer);
  state.bookmarkFeedbackTimer = window.setTimeout(() => {
    button.textContent = "书签";
  }, 1200);
}

function deleteBookmark(id) {
  writeJson(BOOKMARKS_KEY(state.bookId), readBookmarks().filter((item) => item.id !== id));
  renderTocBookmarks();
}

async function openBookmark(bookmark) {
  const order = chunkOrder(bookmark.chunkId);
  if (order === null) return;
  const offset = Math.max(0, Number(bookmark.offset || 0));
  const existing = $("flow").querySelector(`.flow-chunk[data-chunk-id="${CSS.escape(bookmark.chunkId)}"]`);
  if (existing) {
    window.scrollTo(0, existing.offsetTop + offset - 64);
    updateActiveChunk();
    return;
  }
  await anchorFlowAt(order, { restoreOffset: offset });
}

function renderTocBookmarks() {
  const wrap = $("tocBookmarks");
  const list = $("tocBookmarkList");
  list.textContent = "";
  // 目录搜索输入时隐藏书签分组，把空间让给过滤结果。
  const filtering = Boolean($("tocSearch").value.trim());
  const bookmarks = readBookmarks().slice().reverse(); // 时间倒序，新的在前
  wrap.hidden = filtering || !bookmarks.length;
  if (wrap.hidden) return;
  for (const bookmark of bookmarks) {
    const item = document.createElement("li");
    item.className = "toc-bookmark-item";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "toc-bookmark-open";
    const title = document.createElement("span");
    title.className = "toc-bookmark-title";
    title.textContent = sectionLabel(chunkById(bookmark.chunkId) || {}) || bookmark.chunkId;
    const meta = document.createElement("span");
    meta.className = "toc-bookmark-meta";
    meta.textContent = [
      `${Number(bookmark.percent || 0)}%`,
      formatHistoryTime(bookmark.createdAt),
    ].filter(Boolean).join(" · ");
    open.append(title, meta);
    open.addEventListener("click", () => {
      closeToc();
      void openBookmark(bookmark);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "toc-bookmark-del";
    del.textContent = "✕";
    del.setAttribute("aria-label", "删除书签");
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteBookmark(bookmark.id);
    });
    item.append(open, del);
    list.append(item);
  }
}

/* ---------- 沉浸全屏 ---------- */

function immersiveOn() {
  return document.body.classList.contains("immersive");
}

function syncFullscreenButton() {
  $("fullscreenBtn").textContent = immersiveOn() ? "退出全屏" : "全屏";
}

function enterImmersive() {
  state.novaOpenBeforeImmersive = !$("novaPanel").hidden;
  document.body.classList.add("immersive");
  closeNova();                          // Nova 侧栏折叠（点 Nova 竖条随时唤回）
  $("topbar").classList.add("hidden");  // 顶栏初始隐藏：上滚或鼠标到顶部边缘出现
  syncFullscreenButton();
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    // 请求被拒（无手势/受限环境）时仍保留 immersive class，体验降级为隐藏 chrome。
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function exitImmersive() {
  document.body.classList.remove("immersive");
  $("topbar").classList.remove("hidden");
  syncFullscreenButton();
  // 进沉浸时被折叠的 Nova 在退出时恢复；回书架路径（readView 已隐藏）不弹面板。
  if (state.novaOpenBeforeImmersive && !$("readView").hidden) openNova();
  state.novaOpenBeforeImmersive = false;
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function toggleImmersive() {
  if (immersiveOn()) exitImmersive();
  else enterImmersive();
}

function onFullscreenChange() {
  // 浏览器原生 Esc / 系统手势退出全屏时同步状态。
  if (!document.fullscreenElement && immersiveOn()) exitImmersive();
}

function onImmersiveMouseMove(event) {
  if (!immersiveOn() || $("readView").hidden) return;
  if (event.clientY <= 8) $("topbar").classList.remove("hidden");
}

/* ---------- Nova 面板：可折叠阅读计划小节 ---------- */

function activePlanSummary() {
  return (state.snapshot?.plans || [])
    .filter((plan) => plan.bookId === state.bookId && plan.status === "active")
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0] || null;
}

function planStepRange(step) {
  const range = step?.range || {};
  const ids = Array.isArray(step?.chunkIds) ? step.chunkIds.filter(Boolean) : [];
  const start = range.startChunkId || ids[0] || "";
  const end = range.endChunkId || ids[ids.length - 1] || start;
  return start ? { start, end } : null;
}

function planStepLabel(step) {
  // 折叠行优先报章节标题（与目录条目一致）；sectionIndex 各书 0/1 基不一，“第 N 节”会错位。
  // 没有范围（如兴趣搜索步）退回步骤标题。
  const range = planStepRange(step);
  const chunk = range ? chunkById(range.start) : null;
  return (chunk ? compactText(sectionLabel(chunk), 18) : "") || compactText(step?.title || "", 18);
}

function currentSectionRange() {
  // 对照旧壳 currentSectionRange：同 sectionIndex 的 chunk 组成本章；
  // 没有 sectionIndex 时 Number(undefined)=NaN 永不相等，退化为单 chunk 一章。
  const order = chunkOrder(state.activeChunkId);
  const current = order === null ? null : state.chunks[order];
  if (!current) return null;
  const sameSection = state.chunks.filter((chunk) => Number(chunk.sectionIndex) === Number(current.sectionIndex));
  const sectionChunks = sameSection.length ? sameSection : [current];
  const startChunkId = getChunkId(sectionChunks[0]);
  const endChunkId = getChunkId(sectionChunks[sectionChunks.length - 1]);
  if (!startChunkId || !endChunkId) return null;
  return { title: sectionLabel(current), startChunkId, endChunkId };
}

function planCacheFromResult(planId, summary, nextStep, fallback = {}) {
  const doneFromCounts = summary?.statusCounts?.done;
  const doneFromSteps = Array.isArray(summary?.steps)
    ? summary.steps.filter((step) => step.status === "done").length
    : undefined;
  return {
    planId,
    title: summary?.title || fallback.title || planId,
    status: summary?.status || fallback.status || "active",
    stepCount: summary?.stepCount ?? summary?.steps?.length ?? fallback.stepCount ?? 0,
    doneCount: doneFromCounts ?? doneFromSteps ?? fallback.doneCount ?? 0,
    nextStep: nextStep || null,
    hydrated: true,
  };
}

async function hydratePlanNext() {
  const bookId = state.bookId;
  const summary = activePlanSummary();
  if (!summary) {
    state.plan = null;
    renderPlanSection();
    return;
  }
  if (state.plan?.planId === summary.planId && state.plan.hydrated) {
    renderPlanSection();
    return;
  }
  state.plan = { planId: summary.planId, title: summary.title, status: summary.status, stepCount: summary.stepCount ?? 0, doneCount: summary.statusCounts?.done ?? 0, nextStep: null, hydrated: false };
  renderPlanSection();
  try {
    const result = await query({ command: "plan_get", planId: summary.planId });
    if (state.bookId !== bookId || state.plan?.planId !== summary.planId) return;
    state.plan = planCacheFromResult(summary.planId, result?.plan, result?.nextStep, state.plan);
  } catch {
    if (state.bookId !== bookId || state.plan?.planId !== summary.planId) return;
    state.plan = { ...state.plan, hydrated: true }; // 下一步读不到时按摘要降级展示
  }
  renderPlanSection();
}

function renderPlanSection() {
  const plan = state.plan;
  const label = $("planToggleLabel");
  if (!plan) label.textContent = "为本书建个计划";
  else if (!plan.hydrated) label.textContent = "计划 · 读取下一步…";
  else if (!plan.nextStep) label.textContent = "计划 · 已全部完成";
  else label.textContent = `计划 · 下一步 ${planStepLabel(plan.nextStep)}`.trim();
  renderSkillCards(); // 计划忙闲影响“计划本章”技能卡
  if (!state.planOpen) return;
  const step = plan?.hydrated ? plan.nextStep : null;
  const range = planStepRange(step);
  $("planStepMeta").textContent = !plan
    ? "本书还没有阅读计划，可从当前章节建一个。"
    : !plan.hydrated
      ? "读取计划中…"
      : !step
        ? `${plan.title || plan.planId} · ${plan.doneCount}/${plan.stepCount} 步 · 已完成`
        : [
          `${plan.doneCount}/${plan.stepCount} 步`,
          range ? (range.start === range.end ? range.start : `${range.start} → ${range.end}`) : "",
        ].filter(Boolean).join(" · ");
  $("planStepTitle").textContent = step?.title || "";
  $("planReadStepBtn").disabled = !range;
  $("planDoneStepBtn").disabled = !step || state.planBusy;
  $("planSectionBtn").disabled = state.planBusy || !currentSectionRange();
}

function togglePlanSection() {
  state.planOpen = !state.planOpen;
  $("planToggleBtn").setAttribute("aria-expanded", String(state.planOpen));
  $("planBody").hidden = !state.planOpen;
  if (state.planOpen) {
    $("planStatus").textContent = "";
    void hydratePlanNext();
  }
}

function readPlanStep() {
  const range = planStepRange(state.plan?.nextStep);
  if (!range) return;
  // 窄屏时 Nova 面板盖住正文，跳转前先收起。
  if (window.matchMedia("(max-width: 1099px)").matches) closeNova();
  void jumpToChunk(range.start);
}

async function completePlanStep() {
  const plan = state.plan;
  const bookId = state.bookId;
  if (!plan?.nextStep || state.planBusy) return;
  state.planBusy = true;
  renderPlanSection();
  $("planStatus").textContent = "执行这一步中…";
  try {
    // 对照旧壳 executePlanGuideStep：plan_execute_step 一发完成，响应自带推进后的 plan 摘要与 nextStep。
    const result = await query({ command: "plan_execute_step", planId: plan.planId });
    if (state.bookId !== bookId) return;
    state.plan = planCacheFromResult(plan.planId, result?.plan, result?.nextStep, plan);
    renderPlanSection(); // 先刷新步骤卡，再补快照角标，最后报完成，避免“已完成”配旧步骤
    try {
      await loadSnapshot();
    } catch {
      // 执行已成功；快照刷新失败只影响角标。
    }
    renderSinkBadge(); // 评价步会产生待批准沉淀预览
    if (state.bookId !== bookId) return;
    $("planStatus").textContent = result?.completed || !result?.nextStep
      ? "这一步完成，本计划读完了。"
      : "这一步完成，下一步已带出。";
  } catch (error) {
    if (state.bookId === bookId) $("planStatus").textContent = `执行失败：${compactText(error.message || error, 80)}`;
  } finally {
    state.planBusy = false;
    if (state.bookId === bookId) renderPlanSection();
  }
}

async function planCurrentSection() {
  const bookId = state.bookId;
  const section = currentSectionRange();
  if (!bookId || !section || state.planBusy) return;
  state.planBusy = true;
  renderPlanSection();
  $("planStatus").textContent = "创建本章计划中…";
  try {
    // payload 对照旧壳 buildPlanCreatePayload + createPlanForCurrentSection（mode=range 本章起止）。
    const result = await query({
      command: "plan_create",
      bookId,
      mode: "range",
      startChunkId: section.startChunkId,
      endChunkId: section.endChunkId,
      budget: { maxChunksPerStep: 2, maxAnnotationsPerChunk: 2 },
      annotationDensity: "medium",
      sinkPolicy: { requireApproval: true, obsidian: true },
      createdBy: "CoReadingReader",
      title: `${state.bookTitle} · ${section.title} 共读计划`,
    });
    if (state.bookId !== bookId) return;
    const planId = result?.plan?.planId || "";
    if (!planId) throw new Error("计划已请求，但没有返回 planId。");
    state.plan = planCacheFromResult(planId, result.plan, result?.nextStep);
    renderPlanSection(); // 同上：先把下一步卡片亮出来，再刷新快照与完成文案
    try {
      await loadSnapshot();
    } catch {
      // 计划已创建成功；快照刷新失败不回报为创建失败。
    }
    if (state.bookId !== bookId) return;
    $("planStatus").textContent = `已创建本章计划：${section.title}`;
  } catch (error) {
    if (state.bookId === bookId) $("planStatus").textContent = `创建失败：${compactText(error.message || error, 80)}`;
  } finally {
    state.planBusy = false;
    if (state.bookId === bookId) renderPlanSection();
  }
}

/* ---------- Nova 技能卡（2×3 折叠区：每张卡执行一条已有链路） ---------- */

function setSkillStatus(text) {
  $("skillStatus").textContent = text;
}

function renderSkillCards() {
  const hasBook = Boolean(state.bookId);
  const hasChunk = hasBook && Boolean(state.activeChunkId);
  const pending = state.skillPending;
  $("skillPreReadBtn").disabled = !hasChunk || pending.has("preread");
  $("skillScoutBtn").disabled = !hasBook || pending.has("scout");
  $("skillTrailBtn").disabled = !hasChunk || pending.has("trail") || state.trailPending;
  $("skillReviewBtn").disabled = !hasChunk || pending.has("review");
  $("skillPlanBtn").disabled = !hasBook || state.planBusy || pending.has("plan") || !currentSectionRange();
  $("skillSinkBtn").disabled = !hasChunk || state.sinkCreating;
}

function toggleSkillSection() {
  state.skillOpen = !state.skillOpen;
  $("skillToggleBtn").setAttribute("aria-expanded", String(state.skillOpen));
  $("skillBody").hidden = !state.skillOpen;
  if (state.skillOpen) {
    setSkillStatus("");
    renderSkillCards();
  }
}

async function withSkillPending(name, work) {
  if (state.skillPending.has(name)) return;
  state.skillPending.add(name);
  renderSkillCards();
  try {
    await work();
  } finally {
    state.skillPending.delete(name);
    renderSkillCards();
  }
}

/* 预读本段：手动触发当前 chunk 的自主预读，绕过会话 once 限制（复用自动预读的请求构造）。 */
function skillPreRead() {
  const bookId = state.bookId;
  const chunkId = state.activeChunkId;
  if (!bookId || !chunkId) return;
  // 对照旧壳 runNovaAutonomousReading 的入口闸：手动提问或自动预读在飞时不并发同类请求，
  // 否则同一 chunk 可能同时出两条预读（历史、评注层都翻倍）。
  if (state.novaPending || state.autoPreReadInFlight) {
    setSkillStatus("Nova 正在读上一条，等它回来再点。");
    return;
  }
  void withSkillPending("preread", async () => {
    // 借用自动预读的单飞闸：请求期间自动调度让路（不消耗它的会话名额），其它技能预读也进不来。
    state.autoPreReadInFlight = true;
    setSkillStatus("Nova 预读本段中…（单次请求，最长等 6 分钟）");
    try {
      const text = renderedChunkText(chunkId) || await chunkRawText(chunkId).catch(() => "");
      if (!text.trim()) throw new Error("这一段还没有可读正文");
      // 手动发出后占掉本 chunk 的自动预读名额，避免自动调度再发一次。
      state.autoPreReadTried.add(`${bookId}:${chunkId}`);
      const context = await buildAutoPreReadContext(bookId, chunkId, text);
      const result = await askNovaApi({ prompt: buildAutoPreReadPrompt(), context });
      const before = state.sessionPreReads.length;
      recordAutoPreRead(context, result.content || "");
      const item = state.sessionPreReads[0];
      if (state.sessionPreReads.length > before && item && item.bookId === state.bookId) {
        showPreReadItem(item); // 用户主动点的卡：直接展示，不让位
        setSkillStatus("预读完成，回复已在 Nova 面板。");
      } else if (state.sessionPreReads.length > before) {
        setSkillStatus("预读完成，已归档到原书的预读历史。"); // 等待期间切了书
      } else {
        setSkillStatus("Nova 没有返回内容，可稍后再试。");
      }
    } catch (error) {
      setSkillStatus(`预读失败：${compactText(error.message || error, 80)}`);
    } finally {
      state.autoPreReadInFlight = false;
    }
  });
}

/* 先看全书：book-scope 巡读，payload 对照旧壳 bookScout（scope:"book"，候选上限 4）。 */
function buildBookScoutPrompt() {
  return [
    `请你作为 Nova 在我继续读《${state.bookTitle || "这本书"}》之前，先自主巡读一次。`,
    "你可以从系统传入的目录和候选正文里自己挑一个最值得停留的位置。",
    "输出保持短而有用：",
    "1. 你先看了哪里，为什么选这里；",
    "2. 对这个段落做一条具体评论，必须锚定原文；",
    "3. 选一句值得我稍后留意的话；",
    "4. 给我一个下一步阅读动作。",
    "只能评论已传入的候选正文，不要假装读完整本书。",
  ].join("\n");
}

async function bookScoutCandidates(maxCandidates = 4) {
  // 从第一个正文章节起取若干候选段（跳过封面/版权等前置页），交给 Nova 自己挑。
  const candidates = [];
  for (let i = preferredAnchorIndex(); i < state.chunks.length && candidates.length < maxCandidates; i += 1) {
    const chunk = state.chunks[i];
    const chunkId = getChunkId(chunk);
    let text = renderedChunkText(chunkId);
    if (!text) {
      try {
        text = await chunkRawText(chunkId);
      } catch {
        continue; // 单个候选失败跳过，保留其它可读上下文
      }
    }
    if (!text.trim()) continue;
    candidates.push({ chunkId, title: chunkTitle(chunk) || chunkId, text: compactText(text, 1800) });
  }
  return candidates;
}

function skillBookScout() {
  const bookId = state.bookId;
  if (!bookId) return;
  // 同预读本段：手动提问或自动预读在飞时不并发第二条 Nova 自主请求。
  if (state.novaPending || state.autoPreReadInFlight) {
    setSkillStatus("Nova 正在读上一条，等它回来再点。");
    return;
  }
  void withSkillPending("scout", async () => {
    state.autoPreReadInFlight = true; // 巡读期间自动预读让路（不消耗它的会话名额）
    setSkillStatus("Nova 巡读全书中…（单次请求，最长等 6 分钟）");
    try {
      const context = {
        coReadingContextVersion: "2026-06-reader-shell",
        contextMode: "autonomous-reading",
        scope: "book",
        runtimeAgent: "Nova",
        productMode: "single-agent-reader",
        bookId,
        bookTitle: state.bookTitle,
        chunkId: "",
        chunkTitle: "",
        chunkPosition: "",
        text: "",
        selection: "",
        selectionOffset: null,
        tocPreview: novaTocPreview(),
        autonomousCandidates: await bookScoutCandidates(),
        instructionBoundary: "Nova 在 autonomousCandidates 里自行挑一个最值得停留的位置；只能评论传入候选段，不要假装读完整本书。",
      };
      if (bookId !== state.bookId) return; // 取候选期间切书，放弃本次
      const result = await askNovaApi({ prompt: buildBookScoutPrompt(), context });
      const note = compactText(result.content || "", 520);
      if (!note) {
        setSkillStatus("Nova 没有返回内容，可稍后再试。");
        return;
      }
      const item = {
        id: `nova-scout-${bookId}-${Date.now()}`,
        bookId,
        chunkId: "",
        title: "本书巡读",
        note,
        // book scope：不进评注层、不抑制各 chunk 的自动预读（对照旧壳 scope!=="book" 过滤）。
        scope: "book",
        answeredAt: new Date().toISOString(),
      };
      state.sessionPreReads.unshift(item);
      if (bookId === state.bookId) showPreReadItem(item);
      setSkillStatus("巡读完成，回复已在 Nova 面板。");
    } catch (error) {
      setSkillStatus(`巡读失败：${compactText(error.message || error, 80)}`);
    } finally {
      state.autoPreReadInFlight = false;
    }
  });
}

/* 相关段落：等同选区动作；无选区时用当前章节标题做线索。 */
function skillTrail() {
  const chunkId = state.activeChunkId;
  if (!state.bookId || !chunkId || state.trailPending) return;
  void withSkillPending("trail", async () => {
    const clue = state.selection?.text || sectionLabel(chunkById(chunkId) || {});
    if (!clue.trim()) {
      setSkillStatus("先选中一段文字，或等本段标题加载好再试。");
      return;
    }
    state.trailPending = true;
    setSkillStatus("查找相关段落中…");
    try {
      if (await executeTrail(clue, state.selection?.chunkId || chunkId)) {
        setSkillStatus("相关段落已在右侧抽屉展开。");
      }
    } catch (error) {
      setSkillStatus(`相关段落查找失败：${compactText(error.message || error, 80)}`);
    } finally {
      state.trailPending = false;
    }
  });
}

/* 评价本段：review_create，观察项 = 本段我的笔记 + Nova 评注摘要（payload 对照 C2 导出链的 review_create）。 */
function chunkCommentObservations(chunkId) {
  // 书友评论是 AI 演绎人格，不进评价观察项。
  const observations = [];
  for (const ann of uniqueComments(annotationsForChunk(chunkId))) {
    if (ann.source === "mine") {
      observations.push({
        section: "user_note", source: "user-note", kind: "note",
        chunkId, quote: ann.quote || "", note: ann.text, text: ann.text,
      });
    } else if (String(ann.source).startsWith("nova")) {
      observations.push({
        section: "nova_reply", source: "nova-reply-current", kind: "nova-reply",
        chunkId, quote: ann.quote || "", note: ann.text, text: ann.text,
      });
    }
  }
  return observations.slice(0, 6);
}

function skillReview() {
  const bookId = state.bookId;
  const chunkId = state.activeChunkId;
  if (!bookId || !chunkId) return;
  void withSkillPending("review", async () => {
    setSkillStatus("生成本段评价中…");
    try {
      const chunk = chunkById(chunkId) || {};
      // 刚打开书时 activeChunkId 先于正文渲染就位：DOM 取不到就回退原文，避免生成空摘录评价。
      const source = renderedChunkText(chunkId) || await chunkRawText(chunkId).catch(() => "");
      const excerpt = compactText(source, 200);
      if (!excerpt.trim()) throw new Error("这一段还没有可读正文");
      await query({
        command: "review_create",
        bookId,
        startChunkId: chunkId,
        endChunkId: chunkId,
        summary: `本段评价：${state.bookTitle} · ${chunkId}`,
        observations: [
          {
            section: "source_quote",
            source: "current-chunk",
            chunkId,
            title: chunkTitle(chunk) || chunkId,
            quote: excerpt,
            text: excerpt,
            quoteOffset: null,
          },
          ...chunkCommentObservations(chunkId),
        ],
        tags: ["co-reading", "reader-shell", "skill-review"],
        sinkPolicy: { requireApproval: true },
        createdBy: "CoReadingReader",
      });
      setSkillStatus("已生成本段评价。");
    } catch (error) {
      setSkillStatus(`评价失败：${compactText(error.message || error, 80)}`);
    }
  });
}

/* 计划本章：复用计划小节的 createPlanForCurrentSection 链路，状态在计划小节反馈。 */
function skillPlanSection() {
  if (!state.bookId || state.planBusy || !currentSectionRange()) return;
  if (!state.planOpen) togglePlanSection();
  setSkillStatus("创建本章计划中…进度见下方计划小节。");
  void withSkillPending("plan", async () => {
    await planCurrentSection();
    setSkillStatus("");
  });
}

/* 导出本段：复用 C2 导出链（选目标 → review_create → sink_preview_create，待批准进导出箱）。 */
function skillSinkCurrent() {
  const chunkId = state.activeChunkId;
  if (!state.bookId || !chunkId) return;
  const comments = uniqueComments(annotationsForChunk(chunkId))
    .filter((ann) => ann.source === "mine" || String(ann.source).startsWith("nova"));
  const text = comments.length
    ? comments.slice(0, 4).map((ann) => `${ann.speaker}：${compactText(ann.text, 120)}`).join("\n")
    : compactText(renderedChunkText(chunkId), 200);
  if (!text.trim()) {
    setSkillStatus("这一段还没有可导出的内容。");
    return;
  }
  setSkillStatus("");
  openSinkTargetPop({
    text,
    quote: "",
    bookId: state.bookId,
    bookTitle: state.bookTitle,
    chunkId,
    sourceLabel: "本段",
    section: "user_note",
    source: "user-note",
    kind: "note",
  }, $("skillSinkBtn"));
}

/* ---------- 选区工具条 ---------- */

function hideSelTool() {
  $("selTool").hidden = true;
  $("selToolStatus").hidden = true;
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
  $("selToolStatus").hidden = true; // 新选区时清掉上一次的内联错误
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
  $("novaAutoBtn").addEventListener("click", toggleAutoPreRead);
  $("novaSendBtn").addEventListener("click", sendNovaPrompt);
  $("selAskBtn").addEventListener("click", askNovaFromSelection);
  $("selNoteBtn").addEventListener("click", openNoteCardFromSelection);
  $("selTrailBtn").addEventListener("click", trailFromSelection);
  $("noteSaveNoteBtn").addEventListener("click", () => saveMyNote("note"));
  $("noteSaveAnnotBtn").addEventListener("click", () => saveMyNote("annotation"));
  $("sinkBtn").addEventListener("click", openSinkDrawer);
  $("sinkCloseBtn").addEventListener("click", closeSinkDrawer);
  $("sinkBackdrop").addEventListener("click", closeSinkDrawer);
  $("trailCloseBtn").addEventListener("click", closeTrailDrawer);
  $("trailBackdrop").addEventListener("click", closeTrailDrawer);
  $("sinkTargetConfirmBtn").addEventListener("click", confirmSinkCreate);
  $("novaSaveNoteBtn").addEventListener("click", saveNovaReplyAsNote);
  $("novaSinkBtn").addEventListener("click", sinkFromNovaReply);
  $("bookmarkBtn").addEventListener("click", addBookmark);
  $("fullscreenBtn").addEventListener("click", toggleImmersive);
  $("findPrevBtn").addEventListener("click", () => moveFindActive(-1));
  $("findNextBtn").addEventListener("click", () => moveFindActive(1));
  $("findCloseBtn").addEventListener("click", closeFindBar);
  $("findMoreBtn").addEventListener("click", () => void findLoadMore());
  $("findInput").addEventListener("input", onFindInput);
  $("findInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveFindActive(event.shiftKey ? -1 : 1);
    }
  });
  $("tocSearch").addEventListener("input", () => {
    renderToc();
    renderTocBookmarks();
  });
  $("planToggleBtn").addEventListener("click", togglePlanSection);
  $("planReadStepBtn").addEventListener("click", readPlanStep);
  $("planDoneStepBtn").addEventListener("click", () => void completePlanStep());
  $("planSectionBtn").addEventListener("click", () => void planCurrentSection());
  $("skillToggleBtn").addEventListener("click", toggleSkillSection);
  $("skillPreReadBtn").addEventListener("click", skillPreRead);
  $("skillScoutBtn").addEventListener("click", skillBookScout);
  $("skillTrailBtn").addEventListener("click", skillTrail);
  $("skillReviewBtn").addEventListener("click", skillReview);
  $("skillPlanBtn").addEventListener("click", skillPlanSection);
  $("skillSinkBtn").addEventListener("click", skillSinkCurrent);
  $("shelfSettingsBtn").addEventListener("click", showSettings);
  $("settingsBackBtn").addEventListener("click", closeSettings);
  $("settingsView").addEventListener("click", onSettingButtonClick);
  document.addEventListener("input", (event) => {
    // 滑杆即时生效即时存（Aa 弹层与设置页共用 .setting-range）。
    const input = event.target.closest?.("input.setting-range");
    if (input) applySettingChange(input.dataset.field, input.value);
  });
  $("fontImportBtn").addEventListener("click", () => $("fontImportInput").click());
  $("fontImportInput").addEventListener("change", () => {
    const file = $("fontImportInput").files?.[0];
    $("fontImportInput").value = "";
    void importFontFile(file);
  });
  document.querySelectorAll("input.sink-default").forEach((input) => {
    input.addEventListener("change", () => onSinkDefaultChange(input));
  });
  setupClearButton("clearPositionsBtn", () => removeLocalKeys(DATA_GROUPS.positions));
  setupClearButton("clearBookmarksBtn", () => removeLocalKeys(DATA_GROUPS.bookmarks));
  setupClearButton("clearSettingsBtn", () => clearSettingsData());
  setupClearButton("clearFontsBtn", () => clearFontData());
  setupClearButton("clearAllBtn", async () => {
    removeLocalKeys(DATA_GROUPS.positions);
    removeLocalKeys(DATA_GROUPS.bookmarks);
    await clearFontData();
    clearSettingsData();
  });
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("mousemove", onImmersiveMouseMove, { passive: true });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "f") {
      if ($("readView").hidden) return; // 书架视图保留浏览器原生查找
      event.preventDefault();
      openFindBar();
    }
  });
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
    // 沉淀目标弹层：触发按钮（.sink-trigger）刚把它打开时不要立刻关掉。
    if (!event.target.closest?.("#sinkTargetPop, .sink-trigger")) closeSinkTargetPop();
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
      closeSinkTargetPop();
      closeSinkDrawer();
      closeTrailDrawer();
      closeFindBar();
      $("typoPop").hidden = true;
      // 真全屏下浏览器通常先退全屏（fullscreenchange 已同步）；这里兜底退出降级沉浸态，重复调用无害。
      if (immersiveOn()) exitImmersive();
      return;
    }
    if (event.target.closest?.("#novaPanel, #noteCard, #findBar, #tocDrawer")) return;
    window.setTimeout(onSelectionEnd, 0);
  });
  window.addEventListener("beforeunload", savePositionNow);
}

async function init() {
  applySettings();
  syncAutoPreReadButton();
  renderNovaReply();
  setupEvents();
  setupCompanionObserver();
  void loadCompanionHealth();
  void loadCustomFontsAtStartup(); // 异步重载导入字体；就绪前用回退栈，不阻塞首屏
  if (location.hash === "#settings") {
    showSettings();
    return;
  }
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
